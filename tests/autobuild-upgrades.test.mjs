// v1.69.2 · The commander keeps raising its towers after tier 5, picks specializations for what is coming, and swaps out towers the waves outgrow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { TOWERS, TIER } from '../src/data/balance.js';
import { autoCommand, outlook, threatProfile, specScore, retune } from '../src/game/autobuild.js';

const fill = (g, type = 'cannon') => { for (const p of g.map.plots) if (g.plotOpen(p.x, p.y) && !g.towerAt(p.x, p.y)) { g.gold += 5000; g.build(type, p.x, p.y); } };

test('with every plot full the commander still spends on upgrades, past tier 5', () => {
  const g = new Game({ seed: 'u1', mapId: 'meadow', mode: 'hero' });
  g.wave = 30; g.nextPlan = g.nextPlan; fill(g);
  const before = g.towers.reduce((s, t) => s + t.tier + (t.mastery || 0), 0);
  g.gold = 200000;
  for (let i = 0; i < 6; i++) autoCommand(g);
  const after = g.towers.reduce((s, t) => s + t.tier + (t.mastery || 0), 0);
  assert.ok(after > before + 20, `${before} -> ${after}`);
  assert.ok(g.towers.some((t) => (t.mastery || 0) >= 1), 'mastery stars are bought');
});

test('it stops waiting on a build that has nowhere to go', () => {
  const g = new Game({ seed: 'u2', mapId: 'meadow', mode: 'hero' });
  g.wave = 40; fill(g);
  g.gold = 5000;
  const n = g.towers.length;
  autoCommand(g);
  assert.ok(g.gold < 5000 || g.towers.length !== n, 'gold is put to work');
});

test('the outlook is at least as demanding as the next wave alone', () => {
  const g = new Game({ seed: 'u3', mapId: 'meadow', mode: 'hero' });
  g.wave = 12;
  const one = threatProfile(g), many = outlook(g);
  for (const k of Object.keys(one)) assert.ok(many[k] >= one[k] - 1e-9, k);
});

test('specializations are chosen for the threat', () => {
  const calm = { air: 0, armor: 0, fast: 0, mr: 0, swarm: 0, boss: 0 };
  const S = TOWERS.mage.specs;
  assert.ok(specScore(S.lance, { ...calm, mr: 0.8 }) > specScore(S.storm, { ...calm, mr: 0.8 }), 'magic-proof foes call for the Lance');
  assert.ok(specScore(S.storm, { ...calm, swarm: 1 }) > specScore(S.lance, { ...calm, swarm: 1 }) - 0.3, 'a swarm does not hurt the Hexweaver');
  const C = TOWERS.cannon.specs;
  assert.ok(specScore(C.shrapnel, { ...calm, armor: 0.9 }) > specScore(C.shrapnel, calm), 'armor makes shredding worth more');
  const B = TOWERS.ballista.specs;
  assert.ok(specScore(B.breaker, { ...calm, armor: 0.8, boss: 1 }) > specScore(B.repeater, { ...calm, armor: 0.8, boss: 1 }), 'armor and bosses call for the Breaker');
});

test('a tower the coming waves have outgrown is swapped, once per break', () => {
  const g = new Game({ seed: 'u4', mapId: 'meadow', mode: 'hero' });
  g.wave = 8; fill(g, 'cannon');
  const air = { groups: [{ type: 'wyvern', count: 20 }] };
  g.nextPlan = air;
  g.gold = 5000;
  const cannons = g.towersOf('cannon');
  assert.ok(retune(g, g.autoSpent || (g.autoSpent = { total: 0, weapon: 0 })), 'swapped');
  assert.equal(g.towersOf('cannon'), cannons - 1);
  const marks = g.autoSpent;
  assert.equal(marks.swapWave, g.wave);
  assert.ok(!retune(g, marks), 'only one swap per break');
});

test('a swap never overspends and never leaves a plot empty', () => {
  const g = new Game({ seed: 'u5', mapId: 'meadow', mode: 'hero' });
  g.wave = 8; fill(g, 'cannon');
  g.nextPlan = { groups: [{ type: 'wyvern', count: 20 }] };
  g.gold = 0;
  const n = g.towers.length;
  retune(g, { total: 0, weapon: 0 });
  assert.ok(g.gold >= 0, 'gold stays >= 0');
  assert.equal(g.towers.length, n, 'the plot is rebuilt at once');
});

test('Warrior and Commander runs keep growing for many waves without errors', () => {
  for (const mode of ['hero', 'warrior']) {
    const g = new Game({ seed: 'u6' + mode, mapId: 'meadow', mode });
    g.castle.hp = g.castle.maxHp = 1e9; g.wall.hp = g.wall.maxHp = 1e9;
    let n = 0, gw = 0, bt = 0;
    while (!g.over && g.wave < 22 && n++ < 600000) {
      if (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
      if (g.cmdr?.offer) g.cmdr.choosePerk(g.cmdr.offer[0]);
      if (g.wave !== gw) { gw = g.wave; g.gold += 200 + 30 * g.wave; }
      if (g.phase === 'build' && ++bt > 150) { bt = 0; g.startWave(); }
      g.update();
    }
    assert.ok(g.wave >= 22, `${mode} reached wave ${g.wave}`);
    assert.ok(g.towers.some((t) => t.tier >= TIER.max), `${mode} has tier-5 towers`);
    assert.ok(g.towers.some((t) => (t.mastery || 0) >= 1), `${mode} has mastery stars`);
  }
});
