// Headless balance simulator: a simple bot plays full runs.
// Usage: node tools/sim.mjs [runs=6] [map=meadow] [--hero] [--keep=N] [--verbose]
import { Game } from '../src/game/engine.js';
import { TOWERS, TOWER_ORDER, GAME } from '../src/data/balance.js';
import { isBuildable } from '../src/game/maps.js';

const args = typeof process !== 'undefined' ? process.argv.slice(2) : [];
const runs = Number(args.find((a) => /^\d+$/.test(a)) || 6);
const map = args.find((a) => /^[a-z]+$/.test(a)) || 'meadow';
const hero = args.includes('--hero');
const troops = !args.includes('--no-troops');
const verbose = args.includes('--verbose');
const keepArg = args.find((a) => a.startsWith('--keep='));
const keep = keepArg ? Number(keepArg.split('=')[1]) : 0; // 0 = fresh player, 1 = mid, 2 = maxed meta
const startWave = Number((args.find((a) => a.startsWith('--start=')) || '--start=1').split('=')[1]);
const maxWave = Number((args.find((a) => a.startsWith('--max=')) || '--max=200').split('=')[1]);

export function bonusFor(level) {
  if (level === 0) return { unlockedTowers: new Set(['archer', 'cannon', 'mage', 'flak']), unlockedTroops: new Set(['footman', 'bowman']) };
  if (level === 1) return { unlockedTowers: new Set(['archer', 'cannon', 'mage', 'flak', 'mint', 'firetrap', 'ballista', 'barracks', 'catapult']), unlockedTroops: new Set(['footman', 'bowman', 'pikeman', 'crossbow', 'knight']), troopSlots: 2, startGold: 60, castleHpMult: 1.2, killGold: 0.06, weaponDmg: 0.2 };
  return { troopSlots: 8, trainSpeed: 0.3, troopHp: 0.4, troopDmg: 0.4, valorMult: 0.3, troopDiscount: 0.2, troopHeal: 0.5, troopSave: 0.2, startGold: 150, castleHpMult: 1.5, killGold: 0.18, towerDiscount: 0.12, weaponDmg: 0.5, reloadMult: 0.82, ammoAdd: 3, boonChoices: 1, secondWind: true, repairDiscount: 0.3, towerDmg: 0.36 };
}

export const MIX = ['archer', 'cannon', 'archer', 'mage', 'cannon', 'ballista', 'firetrap', 'mage', 'barracks', 'catapult', 'tesla', 'frost', 'artillery', 'obelisk', 'archer'];

function plotScore(g, p) { return (g.map.coverage.get(p.k) || 0) + (g.map.rally.has(p.k) ? 2 : 0) + (p.high ? 1.5 : 0); }
// Best free open plot; if none and gold allows, claim the best ruin first.
function bestSpot(g, trap, reserve = 0) {
  if (!trap) {
    const free = g.freePlots().sort((a, b) => plotScore(g, b) - plotScore(g, a));
    if (free.length) return { x: free[0].x, y: free[0].y };
    const ruins = g.map.plots.filter((p) => g.isRuin(p.x, p.y) && !g.towerAt(p.x, p.y)).sort((a, b) => plotScore(g, b) - plotScore(g, a));
    if (ruins.length && g.gold >= g.claimCost() + reserve) { g.claimPlot(ruins[0].x, ruins[0].y); return { x: ruins[0].x, y: ruins[0].y }; }
    return null;
  }
  if (trap) {
    if (g.trapCount() >= 3) return null;
    // Trap on a path tile close to many towers' coverage, near the middle of the road.
    const p = g.map.paths[0];
    const mid = p[Math.floor(p.length / 2)];
    for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = Math.floor(mid.x) + dx, y = Math.floor(mid.y) + dy;
      if (isBuildable(g.map, x, y, true) && !g.towerAt(x, y)) return { x, y };
    }
    return null;
  }
  return null;
}

// A simple squad policy: keep training the kind we have least of (by weight), spending at most a slice of the purse.
const SQUAD = { footman: 3, bowman: 3, pikeman: 2, knight: 2, crossbow: 2, cavalry: 1, cleric: 1, griffon: 1 };
export function botGarrison(g, share = 0.3) {
  for (let i = 0; i < 6; i++) {
    const have = (k) => g.garrison.units.filter((u) => u.kind === k).length + g.garrison.queue.filter((q) => q.kind === k).length;
    const order = Object.keys(SQUAD).filter((k) => g.canTrain(k) && g.troopCost(k).gold <= g.gold * share).sort((a, b) => have(a) / SQUAD[a] - have(b) / SQUAD[b]);
    if (!order.length) break;
    g.trainTroop(order[0]);
  }
}

export function botBuild(g, mixIdx, MIXV = MIX) {
  if (g.useTroops) botGarrison(g);
  if (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  if (g.wall.hp < g.wall.maxHp * 0.6) g.repairWall();
  if (g.castle.hp < g.castle.maxHp * 0.5) g.repairCastle();
  g.repairAllTowers();
  if (g.wave >= 6 && !g.towers.some((t) => t.type === 'flak') && g.isTowerUnlocked('flak')) {
    const s = bestSpot(g, false, g.buildCost('flak')); if (s) g.build('flak', s.x, s.y);
  }
  if (g.wave >= 4 && g.towers.filter((t) => t.type === 'mint').length < 2 && g.isTowerUnlocked('mint') && g.gold > 160) {
    const s = bestSpot(g, false, g.buildCost('mint')); if (s) g.build('mint', s.x, s.y);
  }
  let guard = 0;
  while (guard++ < 60) {
    const fighters = g.towers.filter((t) => !TOWERS[t.type].trap && !TOWERS[t.type].passive).length;
    const wantNew = fighters < 5 + Math.floor(g.wave / 3) || (TOWERS[MIXV[mixIdx.v % MIXV.length]].trap && g.towers.filter((t) => TOWERS[t.type].trap).length < 3);
    if (wantNew) {
      let id = null;
      const air = g.towers.filter((t) => TOWERS[t.type].targets?.includes('a')).length;
      const needAir = g.wave >= 6 && air < g.towers.length * 0.4;
      for (let k = 0; k < MIXV.length; k++) {
        const c = MIXV[(mixIdx.v + k) % MIXV.length];
        if (g.isTowerUnlocked(c) && (!needAir || TOWERS[c].targets?.includes('a'))) { id = c; break; }
      }
      if (!id) break;
      const s = g.gold >= g.buildCost(id) ? bestSpot(g, TOWERS[id].trap, g.buildCost(id)) : null;
      if (s && g.gold >= g.buildCost(id)) { g.build(id, s.x, s.y); mixIdx.v++; continue; }
    }
    const full = fighters >= 5 + Math.floor(g.wave / 3) || (!g.freePlots().length && !g.map.plots.some((p) => g.isRuin(p.x, p.y) && !g.towerAt(p.x, p.y)));
    const up = g.towers.filter((t) => !t.ally && (!TOWERS[t.type].passive || t.type === 'mint' && t.tier < 5) && !(t.tier === 5 && !full))
      .sort((a, b) => (a.tier < 5 ? 0 : 1) - (b.tier < 5 ? 0 : 1) || (a.tier === 5 ? b.dmg - a.dmg : g.upgradeCost(a) - g.upgradeCost(b)))[0];
    if (up) {
      if (up.tier === 4 && g.canSpec(up)) { g.chooseSpec(up, Object.keys(TOWERS[up.type].specs)[0]); continue; }
      if (g.canUpgrade(up)) { g.upgrade(up); continue; }
    }
    if (g.gold > 400 && (g.buyArmory('dmg') || g.buyArmory('reload'))) continue;
    // Nothing left to upgrade: widen the defense.
    let id = null;
    for (let k = 0; k < MIXV.length; k++) { const c = MIXV[(mixIdx.v + k) % MIXV.length]; if (g.isTowerUnlocked(c) && !TOWERS[c].trap) { id = c; break; } }
    const s = id && g.gold >= g.buildCost(id) ? bestSpot(g, false, g.buildCost(id)) : null;
    if (s && id && g.gold >= g.buildCost(id)) { g.build(id, s.x, s.y); mixIdx.v++; continue; }
    break;
  }
}

export function simulate({ seed, mapId = 'meadow', hero = false, keepLevel = 0, maxWave = 200, modifiers = [], bonus = null, startWave = 1, mix = MIX, weapon, troops: useTroops = true }) {
  const g = new Game({ seed, mapId, bonus: bonus || bonusFor(keepLevel), modifiers, startWave, weapon });
  g.useTroops = useTroops;
  g.leakTypes = {};
  g.on('leak', ({ enemy }) => { g.leakTypes[enemy.boss || enemy.type] = (g.leakTypes[enemy.boss || enemy.type] || 0) + 1; });
  const mixIdx = { v: 0 };
  let heroT = 0;
  let steps = 0;
  while (!g.over && g.wave <= maxWave && steps < 60 * 60 * 400) {
    if (g.phase === 'build') { botBuild(g, mixIdx, mix); g.startWave(); }
    g.update(GAME.step);
    steps++;
    if (hero && g.phase === 'wave') {
      heroT -= GAME.step;
      if (heroT <= 0) {
        heroT = 0.5;
        const e = g.enemies.filter((x) => !x.dead).sort((a, b) => (a.total - a.dist) - (b.total - b.dist))[0];
        if (e) g.heroFire(e.x, e.y - e.size * 0.3, 0);
        if (e && g.abilityReady('volley')) g.useAbility('volley', e.x, e.y);
        if (g.abilityReady('oil') && g.enemies.filter((x) => !x.dead && !x.air && Math.hypot(x.x - g.map.castle.x, x.y - g.map.castle.y) < 2.3).length >= 3) g.useAbility('oil');
      }
    }
  }
  return g;
}

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}` && !process.env.NO_MAIN) {
  const waves = [];
  const t0 = Date.now();
  for (let i = 0; i < runs; i++) {
    const g = simulate({ seed: 'sim' + i, mapId: map, hero, keepLevel: keep, maxWave, startWave, troops });
    waves.push(g.wave);
    if (verbose) {
      const s = g.summary();
      console.log(`run ${i}: wave ${g.wave} score ${g.score} kills ${s.kills} hero ${s.heroKills} troops ${s.troopKills}/${g.garrison.units.length} lost ${s.troopsLost} towers ${g.towers.length} gold ${g.gold} time ${(s.duration / 60).toFixed(1)}m`);
      console.log('  dmg share', Object.entries(s.dmgByTower).map(([k, v]) => `${k}:${Math.round((100 * v) / s.dmgTotal)}%`).join(' '), 'hero:' + Math.round((100 * s.heroDmg) / s.dmgTotal) + '%');
    }
  }
  waves.sort((a, b) => a - b);
  const avg = waves.reduce((a, b) => a + b, 0) / waves.length;
  console.log(`map=${map} hero=${hero} troops=${troops} keep=${keep} start=${startWave} runs=${runs} waves reached: ${waves.join(', ')} | avg ${avg.toFixed(1)} | ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
