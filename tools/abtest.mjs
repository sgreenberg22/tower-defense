// Controlled A/B harness. Same plots, same gold, same waves: only the chosen towers/weapon differ.
// Usage: node tools/abtest.mjs [seeds=6] [startWave=15] [--weapons]
import { Game } from '../src/game/engine.js';
import { TOWERS, GAME } from '../src/data/balance.js';
import { bonusFor } from './sim.mjs';

const args = process.argv.slice(2);
const seeds = Number(args.find((a) => /^\d+$/.test(a)) || 6);
const startWave = Number(args.filter((a) => /^\d+$/.test(a))[1] || 15);
const weaponsMode = args.includes('--weapons');
const newMode = args.includes('--new');
const budget = Number((args.find((a) => a.startsWith('--budget=')) || '--budget=2600').split('=')[1]);
const maps = ['meadow', 'frontier', 'twin', 'cross'];
const bonus = { ...bonusFor(2), weaponDmg: 0.2, startGold: 0 };

const score = (g, p) => (g.map.coverage.get(p.k) || 0) + (g.map.rally.has(p.k) ? 2 : 0) + (p.high ? 1.5 : 0);
function layout(g, picks) {
  // Damage towers take the strongest plots; supports then go where they help most (banner: most neighbours).
  const free = g.freePlots().sort((a, b) => score(g, b) - score(g, a));
  const front = picks, banners = [];
  front.forEach((id) => { const p = free.shift(); if (!p) return; g.gold += g.buildCost(id); g.build(id, p.x, p.y); });
  for (const id of banners) {
    const rest = g.freePlots();
    const near = (p) => g.towers.filter((t) => Math.hypot(t.cx - (p.x + 0.5), t.cy - (p.y + 0.5)) <= 2.4).length;
    rest.sort((a, b) => near(b) - near(a));
    const p = rest[0]; if (!p) continue; g.gold += g.buildCost(id); g.build(id, p.x, p.y);
  }
}
function upgradeAll(g, budget) {
  g.gold += budget;
  for (let guard = 0; guard < 200; guard++) {
    const ups = g.towers.filter((t) => !t.ally && !TOWERS[t.type].trap && t.tier < 5).sort((a, b) => g.upgradeCost(a) - g.upgradeCost(b));
    const t = ups.find((x) => (x.tier === 4 && g.canSpec(x)) || g.canUpgrade(x));
    if (!t) break;
    if (t.tier === 4) g.chooseSpec(t, Object.keys(TOWERS[t.type].specs)[0]); else g.upgrade(t);
  }
}
function run(map, seed, picks, weapon, hero) {
  const g = new Game({ seed, mapId: map, bonus, startWave, weapon });
  g.gold = 0;
  layout(g, picks);
  upgradeAll(g, budget);
  let heroT = 0, steps = 0;
  g.on('leak', () => {});
  while (!g.over && g.wave <= startWave + 25 && steps < 60 * 60 * 120) {
    if (g.phase === 'build') {
      if (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
      g.repairAllTowers(); g.repairWall();
      upgradeAll(g, 0);
      g.startWave();
    }
    g.update(GAME.step); steps++;
    if (hero && g.phase === 'wave') {
      heroT -= GAME.step;
      if (heroT <= 0) { heroT = 0.4; const e = g.enemies.filter((x) => !x.dead).sort((a, b) => (a.total - a.dist) - (b.total - b.dist))[0]; if (e) g.heroFire(e.x, e.y - e.size * 0.3, 0); }
    }
  }
  return g;
}
const CORE = ['archer', 'cannon', 'mage', 'tesla', 'ballista', 'archer', 'cannon', 'mage'];
const sub = (n, x) => [...CORE.slice(0, CORE.length - n), ...Array(n).fill(x)];
const NEWT = ['venom', 'artillery', 'mage', 'gatling'];
const variants = newMode
  ? { 'control (8 dmg towers)': { picks: CORE }, ...Object.fromEntries(NEWT.flatMap((id) => [[`+1 ${id} (replace 1)`, { picks: sub(1, id) }], [`+2 ${id} (replace 2)`, { picks: sub(2, id) }]])) }
  : weaponsMode
  ? Object.fromEntries(['longbow', 'crossbow', 'javelin', 'wand', 'handcannon'].map((w) => [w, { picks: CORE, weapon: w, hero: true }]))
  : {
    'control (8 dmg towers)': { picks: CORE },
    '+2 barracks (replace 2)': { picks: sub(2, 'barracks') },
    '+3 barracks (replace 3)': { picks: sub(3, 'barracks') },
    '+1 artillery (replace 1)': { picks: sub(1, 'artillery') },
    '+2 artillery (replace 2)': { picks: sub(2, 'artillery') },
  };
for (const [name, v] of Object.entries(variants)) {
  const waves = [], dmg = {}; let total = 0, hero = 0;
  for (const map of maps) for (let i = 0; i < seeds; i++) {
    const g = run(map, `ab${i}`, v.picks, v.weapon, v.hero);
    waves.push(g.wave - startWave);
    const s = g.summary(); total += s.dmgTotal; hero += s.heroDmg;
    for (const [k, d] of Object.entries(s.dmgByTower)) dmg[k] = (dmg[k] || 0) + d;
  }
  const avg = waves.reduce((a, b) => a + b, 0) / waves.length;
  const pc = (k) => (100 * (dmg[k] || 0) / total).toFixed(0);
  console.log(`${name.padEnd(26)} waves survived avg ${avg.toFixed(1)}  min ${Math.min(...waves)}  | barracks ${pc('barracks')}%  hero ${(100 * hero / total).toFixed(0)}%`);
}
