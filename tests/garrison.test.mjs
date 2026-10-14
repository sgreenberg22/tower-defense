// v1.13 · The Garrison: trained troops that deploy and hunt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { TROOPS, TROOP_ORDER, GARRISON, BOONS, KEEP, ENEMIES, THREATS } from '../src/data/balance.js';
import { defaultProfile, runBonus, unlockedTroops } from '../src/meta/profile.js';
import { planWave } from '../src/game/waves.js';
import { codexEntries } from '../src/meta/codex.js';

const all = new Set(TROOP_ORDER);
const mk = (o = {}) => { const g = new Game({ seed: 'gar', mapId: 'meadow', startWave: o.startWave || 1, bonus: { unlockedTroops: all, troopSlots: 6, ...(o.bonus || {}) } }); g.gold = 1e6; return g; };
const run = (g, secs, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) g.update(dt); };

test('every troop is well formed and the Keep unlocks exist', () => {
  for (const id of TROOP_ORDER) {
    const d = TROOPS[id];
    assert.ok(d.hp > 0 && d.cost > 0 && d.train > 0 && d.slots >= 1 && d.speed > 0, id);
    assert.ok(d.ranged ? d.range > 0 : true, id + ' ranged has range');
    if (d.keep) assert.ok(KEEP.some((k) => k.id === d.keep && k.troop === id), id + ' has a Keep node');
  }
  assert.ok(TROOP_ORDER.some((k) => TROOPS[k].air), 'some troops hit flyers');
  assert.ok(codexEntries('troops').length === TROOP_ORDER.length, 'codex lists every troop');
});

test('training: queue, cost, slots, wave gate, refund', () => {
  const g = mk();
  const start = g.gold, c = g.troopCost('footman');
  assert.ok(g.trainTroop('footman'));
  assert.equal(g.gold, start - c.gold);
  assert.equal(g.trainBlock('knight'), 'wave', 'elites are gated by wave');
  run(g, TROOPS.footman.train / g.trainSpeed() + 1);
  assert.equal(g.garrison.units.length, 1);
  assert.equal(g.garrison.units[0].state, 'reserve');
  // queue limit
  for (let i = 0; i < GARRISON.queueMax; i++) assert.ok(g.trainTroop('footman') || g.trainBlock('footman'));
  assert.ok(['queue', 'slots'].includes(g.trainBlock('footman')));
  // cancelling returns the gold
  g.garrison.queue.length && (() => { const gold = g.gold; assert.ok(g.cancelTrain(0)); assert.ok(g.gold > gold); })();
  // slots cap
  const slots = g.troopSlotsMax();
  assert.ok(slots >= GARRISON.slots.base + 6);
  assert.ok(g.troopSlotsUsed() <= slots);
});

test('cost rises with the wave, elites need Valor, locked troops stay locked', () => {
  const g = mk({ startWave: 25 });
  assert.ok(g.troopCost('footman').gold > TROOPS.footman.cost, 'wave scaling');
  assert.equal(g.trainBlock('griffon'), 'valor', 'griffon needs Valor');
  g.garrison.valor = 1000;
  assert.equal(g.trainBlock('griffon'), null);
  const locked = new Game({ seed: 'x', mapId: 'meadow', startWave: 20, bonus: { unlockedTroops: new Set(['footman']) } }); locked.gold = 1e6;
  assert.equal(locked.trainBlock('knight'), 'keep');
});

test('deploy, hunt, hold and kill; kills are credited to troops not towers', () => {
  const g = mk();
  for (let i = 0; i < 3; i++) g.addTroop('footman', true);
  g.addTroop('bowman', true);
  g.startWave();
  assert.ok(g.garrison.units.every((u) => u.state === 'out'), 'auto marches them out');
  let n = 0, held = false;
  while (g.phase === 'wave' && n++ < 30 * 400) { g.update(1 / 30); if (g.enemies.some((e) => e.blocker && e.blocker.troop)) held = true; }
  assert.ok(g.stats.troopKills > 0, 'troops killed something');
  assert.ok(held, 'a foe was held by a troop');
  assert.equal(Object.values(g.stats.killsByTower).reduce((a, b) => a + b, 0) + g.stats.troopKills + g.stats.heroKills <= g.stats.kills + 0, true, 'no kill is counted twice');
  assert.equal(g.stats.killsByTower.troop, undefined);
  assert.ok(g.garrison.valor > 0, 'valor from kills and the clear');
  assert.ok(g.garrison.units.every((u) => u.state === 'reserve'), 'recalled at wave end');
});

test('only anti-air troops can hit flyers', () => {
  const g = mk({ startWave: 3 });
  g.addTroop('footman', true); g.addTroop('bowman', true);
  g.startWave();
  const bat = g.spawnEnemy('wyvern', 0);
  g.update(1 / 30);
  const foot = g.garrison.units.find((u) => u.kind === 'footman'), bow = g.garrison.units.find((u) => u.kind === 'bowman');
  const D = { foot: TROOPS.footman, bow: TROOPS.bowman };
  assert.ok(!D.foot.air && D.bow.air);
  assert.ok(bat.air);
  assert.ok(g.pickTroopTarget(foot, TROOPS.footman, new Map()) !== bat, 'footman ignores the flyer');
  assert.ok(foot && bow);
});

test('Guard keeps troops near the castle; recall and dismiss work', () => {
  const g = mk();
  g.addTroop('footman', true);
  g.setStance('guard');
  g.startWave();
  run(g, 3);
  const u = g.garrison.units[0], gate = g.castleGate();
  assert.ok(Math.hypot(u.x - gate.x, u.y - gate.y) < GARRISON.guardRadius + 1.5, 'stays at the gate');
  assert.ok(g.recallTroop(u) !== false);
  const gold = g.gold, paid = u.paid;
  g.dismissTroop(u);
  assert.equal(g.garrison.units.length, 0);
  assert.ok(g.gold >= gold + 0 && paid >= 0);
});

test('ranks come from kills; permanent death unless saved', () => {
  const g = mk();
  g.startWave();
  const u = g.addTroop('knight', true);
  const e = g.spawnEnemy('grunt', 0);
  for (let i = 0; i < GARRISON.ranks[0]; i++) g.troopKilled(u, e);
  assert.equal(u.rank, 1);
  assert.ok(u.maxHp > TROOPS.knight.hp, 'rank raises health');
  u.state = 'out'; g.hurtTroop(u, 1e9);
  assert.ok(!g.garrison.units.includes(u) && g.stats.troopsLost === 1, 'dead for good');
  const s = mk({ bonus: { troopSave: 1 } });
  const v = s.addTroop('footman', true); v.state = 'out'; s.hurtTroop(v, 1e9);
  assert.ok(s.garrison.units.includes(v) && v.hp > 0 && v.state === 'back', 'Stretcher Bearers pull them out');
});

test('Muster: kills fill the gauge and give a free recruit', () => {
  const g = mk();
  const need = g.musterNeed();
  g.addMuster(need);
  assert.equal(g.garrison.units.length, 1);
  assert.equal(g.stats.musterRecruits, 1);
  assert.ok(g.garrison.units[0].kind === 'footman' || g.garrison.units[0].kind === 'bowman');
});

test('garrison boons only appear once you have trained troops; Keep bonuses reach the run', () => {
  const g = mk();
  const gb = BOONS.filter((b) => b.needs === 'troops');
  assert.ok(gb.length >= 7);
  const seen = (trained) => { const ids = new Set(); for (let i = 0; i < 30; i++) { const x = new Game({ seed: 's' + i, mapId: 'meadow', startWave: 6, bonus: { unlockedTroops: all } }); x.stats.troopsTrained = trained; x.offerBoons(); x.boonOffer.forEach((id) => ids.add(id)); } return ids; };
  assert.ok(![...seen(0)].some((id) => gb.some((b) => b.id === id)), 'none without troops');
  assert.ok([...seen(1)].some((id) => gb.some((b) => b.id === id)), 'some once you have trained');
  const p = defaultProfile(); p.keep.gar_slots = 2; p.keep.gar_hp = 2;
  const b = runBonus(p);
  assert.equal(b.troopSlots, 4); assert.ok(b.troopHp > 0);
  p.keep.unlock_knight = 1;
  assert.ok(unlockedTroops(p).has('knight') && unlockedTroops(p).has('footman') && !unlockedTroops(p).has('griffon'));
});

test('save and load round-trips the garrison, queue and valor', () => {
  const g = mk({ startWave: 12 });
  const u = g.addTroop('pikeman', true); u.rank = 2; u.xp = 20; u.hp = u.maxHp * 0.5;
  g.garrison.valor = 33; g.trainTroop('footman'); g.setStance('guard'); g.setAuto(false);
  const s = JSON.parse(JSON.stringify(g.serialize()));
  const h = new Game({ seed: 'gar', mapId: 'meadow', startWave: 12, bonus: { unlockedTroops: all, troopSlots: 6 }, save: s });
  assert.equal(h.garrison.units.length, 1);
  assert.equal(h.garrison.units[0].rank, 2);
  assert.ok(Math.abs(h.garrison.units[0].hp / h.garrison.units[0].maxHp - 0.5) < 0.02);
  assert.equal(h.garrison.queue.length, 1);
  assert.equal(h.garrison.valor, 33);
  assert.equal(h.garrison.stance, 'guard'); assert.equal(h.garrison.auto, false);
});

test('new foes and threats are defined and arrive on schedule', () => {
  for (const id of ['skirmisher', 'ogre', 'gargoyle', 'dread']) assert.ok(ENEMIES[id], id);
  assert.ok(ENEMIES.gargoyle.air && ENEMIES.gargoyle.armored);
  for (const id of ['raiders', 'brutes', 'stoneflight']) assert.ok(THREATS[id], id);
  const g = new Game({ seed: 'late', mapId: 'meadow', startWave: 40 });
  assert.ok(g.nextPlan.groups.length > 0);
  const seen = new Set();
  for (let w = 30; w < 60; w++) for (const gr of planWave(w, 'late', g.waveOpts()).groups) seen.add(gr.type);
  for (const id of ['skirmisher', 'ogre', 'gargoyle', 'dread']) assert.ok(seen.has(id), id + ' shows up by wave 60');
});

test('troops can win a wave on their own against a small push', () => {
  const g = mk({ startWave: 1 });
  for (let i = 0; i < 4; i++) g.addTroop(i % 2 ? 'bowman' : 'footman', true);
  g.startWave();
  let n = 0; while (g.phase === 'wave' && n++ < 30 * 600) g.update(1 / 30);
  assert.ok(!g.over, 'the castle held');
  assert.ok(g.stats.troopKills + g.stats.kills > 0);
});

// ---------- weather ----------
import { WEATHER } from '../src/data/balance.js';
test('weather: warns, strikes harder, and troops feel it', () => {
  const g = new Game({ seed: 'wx', mapId: 'meadow', startWave: 30, bonus: { unlockedTroops: all } });
  g.gold = 1e6;
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  g.startWave();
  assert.ok(g.hazard.kind, 'the land has weather');
  let warned = 0, on = 0;
  g.on('hazardWarn', () => warned++); g.on('hazard', ({ on: o }) => { if (o) on++; });
  for (let t = 0; t < 40; t += 1 / 30) { g.update(1 / 30); if (g.phase !== 'wave') break; }
  assert.ok(warned >= 1 && on >= 1, 'warning then onset');
  g.hazard.kind = 'sandstorm'; g.hazard.active = 5;
  assert.equal(g.hazardRangeMult(), WEATHER.sandRange);
  g.hazard.kind = 'blizzard';
  assert.equal(g.hazardRateMult(), WEATHER.blizzRate);
  assert.ok(WEATHER.sandRange < 0.85 && WEATHER.blizzRate < 0.9, 'stronger than before');
  g.hazard.kind = 'meteors';
  const u = g.addTroop('footman', true); u.state = 'out'; const c = g.castleGate(); u.x = c.x; u.y = c.y;
  const before = u.hp;
  const pick = g.rng.pick; g.rng.pick = () => [Math.floor(c.x), Math.floor(c.y)];
  g.meteor(); g.rng.pick = pick;
  assert.ok(u.hp < before, 'a meteor scorches troops in the blast');
});
