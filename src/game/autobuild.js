// Hero Mode's commander. It reads the coming wave (how much of it flies, wears armor, resists magic, runs fast, swarms or
// brings a boss) and spends the treasury the way a steady player would: towers that answer the threat on the plots that
// cover the most road, then plots, upgrades, specializations, repairs, and a share for the hero's own weapon.
// Pure logic, deterministic for a given game state, and only ever calls the engine's public actions.
import { TOWERS, ENEMIES, TIER } from '../data/balance.js';
import { T } from './maps.js';
import { HERO } from './modes.js';
import { planWave } from './waves.js';

// The commander keeps to fighting towers: no mints or shrines, and no road traps.
const SKIP = new Set(['mint', 'sanctum', 'firetrap']);

// What the next wave asks for, as shares of its total health (swarm grows with the head count).
export function threatProfile(game) { return profileOf(game.phase === 'wave' ? game.plan : game.nextPlan); }
function profileOf(plan) {
  const out = { air: 0, armor: 0, fast: 0, mr: 0, swarm: 0, boss: 0 };
  if (!plan) return out;
  let hp = 0, n = 0;
  for (const g of plan.groups) {
    if (g.boss) { out.boss = 1; continue; }
    const e = ENEMIES[g.type];
    if (!e) continue;
    const h = e.hp * g.count;
    hp += h; n += g.count;
    if (e.air) out.air += h;
    if ((e.armor || 0) >= 25) out.armor += h;
    if ((e.speed || 1) >= 1.35) out.fast += h;
    if ((e.mr || 0) >= 30) out.mr += h;
  }
  if (hp > 0) for (const k of ['air', 'armor', 'fast', 'mr']) out[k] /= hp;
  out.swarm = Math.min(1, n / 45);
  return out;
}

// What the next few waves ask for, taken together: the worst of each need, fading a little with distance. The commander plans against this,
// so it keeps its flak up between two air waves and only swaps a tower out when the need has really changed.
export function outlook(game, ahead = 3) {
  const out = threatProfile(game), base = game.phase === 'wave' ? game.wave + 1 : game.wave;
  for (let k = 1; k < ahead; k++) {
    let th;
    try { th = profileOf(planWave(base + k, game.seed, game.waveOpts())); } catch { break; }
    for (const key of Object.keys(out)) out[key] = Math.max(out[key], th[key] * (1 - 0.2 * k));
  }
  return out;
}

// How well each tower answers a threat profile (higher is better; 1 is an all-rounder on an ordinary wave).
export function towerFit(id, th) {
  const ground = 1 - th.air;
  switch (id) {
    case 'archer': return 0.9 + 1.0 * th.air;
    case 'flak': return 0.15 + 3.2 * th.air;
    case 'cannon': return (0.85 + 1.1 * th.swarm) * ground;
    case 'mage': return 1.0 + 1.4 * th.armor - 1.2 * th.mr;
    case 'ballista': return (0.9 + 1.3 * th.armor + 0.3 * th.boss) * ground;
    case 'frost': return 0.55 + 1.4 * th.fast + 0.5 * th.swarm;
    case 'barracks': return (0.6 + 1.1 * th.fast) * ground;
    case 'catapult': return (0.75 + 1.1 * th.swarm) * ground;
    case 'artillery': return (0.9 + 1.0 * th.swarm) * ground;
    case 'tesla': return 1.0 + 1.1 * th.swarm + 0.4 * th.air - 1.0 * th.mr;
    case 'gatling': return 1.0 + 0.9 * th.air;
    case 'venom': return 0.8 + 1.0 * th.armor + 1.0 * th.mr + 0.6 * th.boss;
    case 'obelisk': return 1.0 + 1.0 * th.boss + 0.5 * th.armor - 1.0 * th.mr;
    case 'trebuchet': return (0.5 + 1.6 * th.boss + 0.4 * th.armor) * ground;
    case 'voidwell': return 0.7 + 0.7 * th.fast + 0.5 * th.swarm;
    default: return 0.5;
  }
}

// Road samples every half tile, cached per map.
const ROAD = new WeakMap();
function roadPoints(map) {
  let pts = ROAD.get(map);
  if (pts) return pts;
  pts = [];
  for (const path of map.paths) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / 0.5));
    for (let j = 0; j < n; j++) pts.push({ x: a.x + (b.x - a.x) * j / n, y: a.y + (b.y - a.y) * j / n });
  }
  ROAD.set(map, pts);
  return pts;
}

// How much road a tower of this type would cover from the plot at (x, y). Hills reach further.
export function coverage(game, id, x, y) {
  const def = TOWERS[id];
  const high = game.map.tileAt(x, y) === T.HIGH;
  const r = (def.range || def.aura || 2.5) + (high ? TIER.highGroundRange : 0), r0 = def.minRange || 0;
  let c = 0;
  for (const p of roadPoints(game.map)) { const d = Math.hypot(p.x - x - 0.5, p.y - y - 0.5); if (d <= r && d >= r0) c++; }
  return c * (high ? 1 + TIER.highGroundDmg : 1);
}

const openPlots = (game) => game.map.plots.filter((p) => game.plotOpen(p.x, p.y) && !game.towerAt(p.x, p.y));
const ruins = (game) => game.map.plots.filter((p) => game.isRuin(p.x, p.y) && !game.towerAt(p.x, p.y));

// The tower to build next and where, among what is unlocked; `afford` limits it to what the treasury holds now.
export function pickBuild(game, afford = true) {
  const th = outlook(game), plots = openPlots(game);
  if (!plots.length) return null;
  let best = null;
  for (const id of Object.keys(TOWERS)) {
    const def = TOWERS[id];
    if (SKIP.has(id) || def.trap || def.passive || !game.isTowerUnlocked(id) || game.towerCapReached(id)) continue;
    const cost = game.buildCost(id);
    if (afford && cost > game.gold) continue;
    const owned = game.towersOf(id);
    // Stronger towers are worth more per plot; a mix beats a wall of one type.
    const value = Math.max(0.05, towerFit(id, th)) * Math.pow(cost, 0.35) / (1 + 0.55 * owned);
    if (!best || value > best.value) best = { id, value, cost };
  }
  if (!best) return null;
  let spot = null, sc = -1;
  for (const p of plots) { const c = coverage(game, best.id, p.x, p.y); if (c > sc) { sc = c; spot = p; } }
  return spot ? { ...best, x: spot.x, y: spot.y } : null;
}

// How many towers the commander wants standing by this wave.
export const wantedTowers = (wave) => Math.min(20, 3 + Math.floor(wave / 2.2));

// One turn of the commander. Returns the number of actions taken.
export function autoCommand(game) {
  if (game.over || game.locked()) return 0;
  let acts = 0;
  const build = game.phase === 'build';
  // Patch up first, between waves: the wall and keep before anything new, then wrecked towers.
  if ((build || game.champMode) && game.canRepair()) {   // a Warrior's waves run into each other: the commander mends while they fight
    if (game.wall.hp < game.wall.maxHp * (game.cmdr ? game.cmdr.wallAt() : 0.7) && game.repairWall()) acts++;   // a Commander can order the walls kept first
    if (game.castle.hp < game.castle.maxHp * 0.6 && game.repairCastle()) acts++;
    for (const t of game.towers) if ((t.ruined || t.hp < t.maxHp * 0.5) && game.repairTower(t)) acts++;
  }
  const spent = game.autoSpent || (game.autoSpent = { total: 0, weapon: 0 });
  for (let guard = 0; guard < 24; guard++) {
    const g0 = game.gold;
    // The hero's share: armory upgrades between waves, cheapest useful stat first.
    if (build && !game.champMode && spent.weapon < spent.total * (game.cmdr ? game.cmdr.weaponShare() : HERO.weaponShare)) {   // a Warrior fights on foot: no wall bow to arm
      const stat = ['dmg', 'reload', 'ammo', 'crit'].map((s) => ({ s, c: game.armoryCost(s) })).filter((o) => Number.isFinite(o.c)).sort((a, b) => a.c - b.c)[0];
      if (stat && stat.c <= game.gold && game.buyArmory(stat.s)) { spent.weapon += stat.c; spent.total += stat.c; acts++; continue; }
    }
    const want = wantedTowers(game.wave), have = game.towers.filter((t) => !t.ally && !TOWERS[t.type].passive).length;
    // Only keep building while there is somewhere to build: with every plot taken the treasury goes into the towers already standing.
    if (have < want && (openPlots(game).length || ruins(game).length)) {
      // The tower the wave calls for, even if the treasury has to save for it.
      const next = pickBuild(game, false);
      if (next && next.cost <= game.gold && raise(game, next.id, next.x, next.y)) { spent.total += g0 - game.gold; acts++; continue; }
      // No room: open the ruin that would cover the most road.
      if (!openPlots(game).length) {
        const r = ruins(game).map((p) => ({ p, c: coverage(game, 'archer', p.x, p.y) })).sort((a, b) => b.c - a.c)[0];
        if (r && game.claimCost() <= game.gold) { game.claimPlot(r.p.x, r.p.y); spent.total += g0 - game.gold; acts++; continue; }
      }
      // Saving for the next tower: only cheap upgrades in the meantime.
      if (!upgradeOne(game, (next ? next.cost : game.claimCost()) * 0.3)) break;
      if (game.gold !== g0) { spent.total += g0 - game.gold; acts++; continue; }
      break;
    }
    // Full house: swap out a tower the coming waves have outgrown (once per break), then keep raising the rest, every tier and then every mastery star.
    if (build && !game.champMode && retune(game, spent)) { spent.total += Math.max(0, g0 - game.gold); acts++; continue; }
    if (upgradeOne(game, Infinity)) { spent.total += g0 - game.gold; acts++; continue; }
    break;
  }
  return acts;
}

// What a specialization is worth against what is coming (higher is better). Reads the numbers in the spec itself, so new specs need no new code.
export function specScore(spec, th) {
  let v = 0;
  for (const [k, x] of Object.entries(spec)) {
    if (k === 'name' || k === 'desc' || k === 'target') continue;
    switch (k) {
      case 'dmgMult': v += (x - 1) * (0.7 + 0.5 * th.boss + 0.3 * th.armor); break;
      case 'rateMult': v += (x - 1) * 0.8; break;
      case 'range': v += x * 0.15; break;
      case 'critChance': v += 0.4; break;
      case 'multi': v += (x - 1) * 0.12 * (1 + 2 * th.swarm); break;
      case 'splashMult': v += (x - 1) * (0.3 + 1.0 * th.swarm); break;
      case 'shred': v += 0.02 * x * (0.5 + 2 * th.armor); break;
      case 'armoredMult': v += (x - 1) * (0.4 + 2 * th.armor + 0.8 * th.boss); break;
      case 'bossMult': v += (x - 1) * (0.3 + 1.5 * th.boss); break;
      case 'pierceMr': v += 0.2 + 1.2 * th.mr; break;
      case 'slow': case 'slowSet': case 'vuln': case 'freezeChance': case 'hexSlow': v += 0.3 + 0.8 * th.fast; break;
      case 'hexSpread': case 'chainAdd': case 'chainRangeAdd': case 'fenceLinks': case 'fenceRange': case 'fireField': case 'burnMult': case 'spread': case 'beams': case 'poisonSpread': v += 0.3 + 0.7 * th.swarm; break;
      case 'stun': case 'stunChance': case 'fenceMult': v += 0.2 + 0.4 * th.boss; break;
      case 'poisonCapSet': case 'poisonTimeAdd': v += 0.3 + 0.5 * th.armor + 0.3 * th.boss; break;
      case 'soldiersSet': case 'hpMult': case 'armor': case 'ranged': case 'pinMult': v += 0.3 + 0.4 * th.fast; break;
      default: v += 0.25;
    }
  }
  return v;
}
const bestSpec = (type, th) => {
  const specs = TOWERS[type].specs || {};
  return Object.keys(specs).map((id) => ({ id, v: specScore(specs[id], th) })).sort((a, b) => b.v - a.v)[0]?.id;
};

// Damage gained by the next step on a tower, as a share (a tier, the specialization, or one more mastery star).
const stepGain = (t) => (t.tier >= TIER.max ? TIER.mastery.dmg + 0.04 : (TIER.dmg[t.tier] / TIER.dmg[t.tier - 1] - 1) + (t.tier === TIER.max - 1 ? 0.35 : 0));

// Upgrade the tower that does the most work for the gold, choosing the specialization that suits the coming waves when one is due. Past tier 5 it goes on
// buying mastery stars, so a long run keeps getting stronger.
function upgradeOne(game, cap) {
  const th = outlook(game);
  let best = null;
  for (const t of game.towers) {
    if (t.ally || t.ruined || TOWERS[t.type].passive) continue;
    const c = game.upgradeCost(t);
    if (!Number.isFinite(c) || c > game.gold || c > cap) continue;
    const spec = t.tier === TIER.max - 1;
    if (!spec && !game.canUpgrade(t)) continue;
    if (spec && (!game.canSpec(t) || !Object.keys(TOWERS[t.type].specs || {}).length)) continue;
    const value = coverage(game, t.type, t.x, t.y) * (0.35 + Math.max(0, towerFit(t.type, th))) * stepGain(t) / c;
    if (!best || value > best.value) best = { t, value, spec };
  }
  if (!best) return false;
  if (best.spec) return game.chooseSpec(best.t, bestSpec(best.t.type, th));
  return game.upgrade(best.t);
}

// Build a tower and note when it went up (a fresh one is not swapped out at once).
function raise(game, id, x, y) {
  if (!game.build(id, x, y)) return false;
  const t = game.towerAt(x, y); if (t) t.raisedWave = game.wave;
  return true;
}

// Worth of a tower standing on a plot against the coming waves: how well it answers them, how much road it covers, and the power already built into it.
const standing = (game, t, th) => Math.max(0.05, towerFit(t.type, th)) * coverage(game, t.type, t.x, t.y) * (1 + 0.3 * (t.tier - 1) + 0.12 * (t.mastery || 0));

// Once a break, when every plot is full: sell the tower the coming waves have outgrown and raise the one they call for on the same plot.
// It has to be a clear gain, it leaves heavily built towers alone, and it never spends more than the treasury holds.
export function retune(game, spent) {
  if (game.locked() || game.puzzle || game.wave < 4) return false;
  const marks = spent || game.autoSpent || {};
  if (marks.swapWave === game.wave) return false;
  const th = outlook(game);
  let best = null;
  for (const t of game.towers) {
    if (t.ally || t.ruined || TOWERS[t.type].passive || t.tier >= TIER.max - 1 && (t.mastery || 0) >= 3 || t.raisedWave > game.wave - 6) continue;   // a new tower gets a few waves to prove itself
    const cur = standing(game, t, th), refund = game.sellValue(t);
    for (const id of Object.keys(TOWERS)) {
      const def = TOWERS[id];
      if (id === t.type || SKIP.has(id) || def.trap || def.passive || !game.isTowerUnlocked(id) || game.towerCapReached(id)) continue;
      const cost = game.buildCost(id);
      if (cost - refund > game.gold) continue;
      const owned = game.towersOf(id);
      const alt = Math.max(0.05, towerFit(id, th)) * coverage(game, id, t.x, t.y) / (1 + 0.4 * owned);
      const bar = t.tier >= TIER.max - 1 ? 2.6 : t.tier >= 3 ? 2.0 : 1.5;   // the more it holds, the clearer the gain must be
      const ratio = alt / Math.max(1, cur);
      if (ratio >= bar && (!best || ratio > best.ratio)) best = { t, id, ratio };
    }
  }
  if (!best) return false;
  const { t, id } = best, x = t.x, y = t.y;
  game.sell(t);
  if (raise(game, id, x, y)) { marks.swapWave = game.wave; return true; }
  return false;
}

// A few words on what the commander sees coming, for the status line.
export function threatWords(th) {
  const w = [];
  if (th.boss) w.push('a boss');
  if (th.air > 0.25) w.push('flyers');
  if (th.armor > 0.25) w.push('heavy armor');
  if (th.mr > 0.25) w.push('magic-proof foes');
  if (th.fast > 0.3) w.push('runners');
  if (th.swarm > 0.6) w.push('a swarm');
  return w.length ? w.slice(0, 3).join(', ') : 'foot soldiers';
}
