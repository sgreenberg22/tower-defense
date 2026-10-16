// v1.24 · Engineers: troops that repair towers in the middle of a wave.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { TROOPS, TROOP_ORDER, ENGINEER, KEEP } from '../src/data/balance.js';

const all = new Set(TROOP_ORDER);
function field(rank = 0) {
  const g = new Game({ seed: 'eng', mapId: 'meadow', startWave: 14, bonus: { unlockedTroops: all, troopSlots: 6 } });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  g.gold = 1e6;
  const plots = g.freePlots();
  const t1 = g.build('archer', plots[0].x, plots[0].y), t2 = g.build('archer', plots[1].x, plots[1].y);
  g.startWave(); g.spawnQueue = []; g.enemies = [];
  const post = g.spawnEnemy('golem', 0); post.hp = post.maxHp = 1e15; post.stunT = 1e9; post.stunImmune = 0;   // keeps the wave open
  g.garrison.auto = true;
  const u = g.addTroop('engineer', true);
  for (let i = 0; i < 50 && u.rank < rank; i++) g.troopXp(u, 1);
  u.rank = rank; g.refreshTroop(u); u.hp = u.maxHp;
  return { g, u, t1, t2 };
}
const run = (g, secs, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) { g.spawnQueue = []; g.update(dt); } };

test('the engineer is a real Garrison unit with a Keep unlock', () => {
  const D = TROOPS.engineer;
  assert.ok(D.repair > 0 && D.dmg === 0 && TROOP_ORDER.includes('engineer'));
  assert.ok(KEEP.some((k) => k.id === D.keep && k.troop === 'engineer'));
});

test('an engineer walks out mid-wave and mends a damaged tower', () => {
  const { g, u, t1 } = field();
  g.damageTower(t1, t1.maxHp * 0.6);
  const before = t1.hp;
  assert.equal(u.state, 'out', 'deployed with the wave');
  run(g, 20);
  assert.ok(t1.hp > before + t1.maxHp * 0.2, `mended ${before} -> ${t1.hp}`);
});

test('it raises a ruined tower, which fires again', () => {
  const { g, u, t1 } = field();
  g.damageTower(t1, 1e9);
  assert.ok(t1.ruined);
  run(g, 12);
  assert.ok(!t1.ruined && t1.hp >= t1.maxHp * ENGINEER.reviveAt, 'back in action');
  assert.ok(u.xp >= ENGINEER.reviveXp, 'earned experience for it');
});

test('higher ranks repair faster and walk quicker', () => {
  const rate = (rank) => { const { g, u } = field(rank); return g.engineerRate(u, TROOPS.engineer); };
  assert.ok(rate(1) > rate(0) * 1.3 && rate(3) > rate(2));
  const timeToMend = (rank) => {
    const { g, t1 } = field(rank);
    g.damageTower(t1, t1.maxHp * 0.9);
    let t = 0;
    while (t1.hp < t1.maxHp * 0.99 && t < 80) { g.spawnQueue = []; g.update(1 / 30); t += 1 / 30; }
    return t;
  };
  assert.ok(timeToMend(3) < timeToMend(0) * 0.8, 'a Legend finishes sooner');
});

test('Elites patch the wall when nothing needs mending; Legends mend two towers and clear sabotage', () => {
  const e = field(2);
  e.g.wall.hp = e.g.wall.maxHp * 0.5; const w0 = e.g.wall.hp;
  run(e.g, 15);
  assert.ok(e.g.wall.hp > w0, 'wall patched');
  const r = field(0); r.g.wall.hp = r.g.wall.maxHp * 0.5; const w1 = r.g.wall.hp; run(r.g, 15);
  assert.equal(r.g.wall.hp, w1, 'a Recruit leaves the wall alone');
  const l = field(3);
  l.g.damageTower(l.t1, l.t1.maxHp * 0.5); l.g.damageTower(l.t2, l.t2.maxHp * 0.5); l.t1.disabledT = 30;
  const a = l.t1.hp + l.t2.hp;
  run(l.g, 20);
  assert.equal(l.t1.disabledT, 0, 'sabotage cleared');
  assert.ok(l.t1.hp + l.t2.hp > a, 'both mended');
});

test('engineers do not fight, and a hurt one retreats like any troop', () => {
  const { g, u } = field();
  const e = g.spawnEnemy('grunt', 0); e.x = u.x; e.y = u.y;
  run(g, 0.5);
  assert.ok(u.target === null || u.target === undefined);
  u.hp = u.maxHp * 0.1; run(g, 1);
  assert.notEqual(u.state, 'out', 'pulled out of the field');
});
