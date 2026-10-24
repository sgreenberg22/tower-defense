import test from 'node:test';
import assert from 'node:assert/strict';
import { AssaultGame, autoAssault, ASSAULT, RAID, RAID_MAX, BLITZ_MAX, raidSetup, blitzSetup, conquestSetup, conquestTarget, assaultPerks, cleanOrders, validateAssaultRun, AUNITS, AUNIT_ORDER } from '../src/game/assault.js';
import { frontier } from '../src/game/realmmap.js';
import { validateRun } from '../src/game/rules.js';
import { isLocalMode } from '../src/game/modes.js';

const play = (g, secs) => { for (let t = 0; t < secs && !g.over; t += 1 / 30) { autoAssault(g, 1 / 30); g.update(1 / 30); } };

test('assault: an army takes the first camp and moves on to new ground', () => {
  const g = new AssaultGame({ mode: 'assault', seed: 'test-1' });
  const first = g.mapId;
  let took = 0; g.on('fortressTaken', () => took++);
  play(g, 120);
  assert.ok(took >= 1, 'took a stronghold');
  assert.ok(g.stage >= 2 && g.mapId !== first, 'marched to a new map');
});

test('assault: doing nothing loses the keep to raiders', () => {
  const g = new AssaultGame({ mode: 'assault', seed: 'idle' });
  for (let t = 0; t < 900 && !g.over; t += 1 / 30) g.update(1 / 30);
  assert.ok(g.over && !g.victory && g.why === 'keep');
});

test('assault feeds the Realm: razes and strongholds become kills and waves the server accepts', () => {
  const g = new AssaultGame({ mode: 'assault', seed: 'realm' });
  play(g, 200);
  g.gameOver();
  const s = g.summary();
  assert.ok(s.razed > 0 && s.kills >= s.razed * ASSAULT.realm.razedKills);
  assert.ok(s.wavesCleared >= s.taken * ASSAULT.realm.fortressWaves);
  assert.ok(isLocalMode('assault') && isLocalMode('raid'));
  const r = { ...s, start: 1 };
  assert.equal(validateAssaultRun(r), null);
  assert.equal(validateRun(r), null);
  assert.ok(validateRun({ ...r, kills: r.kills * 50 }), 'inflated kills are refused');
});

test('raid: same camp for everyone today, scored within its bounds', () => {
  const a = raidSetup('2026-10-24'), b = raidSetup('2026-10-24');
  assert.deepEqual(a, b);
  const g = new AssaultGame({ mode: 'raid', seed: a.seed });
  assert.equal(g.stage, RAID.stage);
  assert.equal(g.mapId, a.map);
  play(g, RAID.limit + 5);
  assert.ok(g.over);
  const s = g.summary();
  assert.ok(s.score > 0 && s.score <= RAID_MAX);
  assert.equal(validateRun({ ...s, start: 1 }), null);
});

test('the column opens with your War Record, not your Garrison', () => {
  const g0 = new AssaultGame({ mode: 'assault', seed: 'locks', career: 0 });
  assert.deepEqual(AUNIT_ORDER.filter((id) => g0.unitKnown(id)), ['footman', 'archer', 'ram']);
  g0.gold = 1000;
  assert.equal(g0.deploy('tower'), null);
  assert.ok(g0.deploy('ram'));
  const g = new AssaultGame({ mode: 'assault', seed: 'locks', career: 99 });
  assert.ok(AUNIT_ORDER.every((id) => g.unitKnown(id)));
  for (const id of AUNIT_ORDER) assert.ok(AUNITS[id].troop ? AUNITS[id].look : AUNITS[id].engine, id + ' has art');
  assert.deepEqual(cleanOrders(['requisition', 'reinforce'], 0), ['firepots', 'horn', 'smoke'], 'locked orders fall back to the defaults');
  assert.deepEqual(cleanOrders(['requisition', 'reinforce'], 6), ['requisition', 'reinforce', 'firepots']);
});

test('mantlets cut missile damage for the troops beside them', () => {
  const g = new AssaultGame({ mode: 'assault', seed: 'cover', career: 99 });
  g.gold = 1000;
  const m = g.deploy('mantlet'), f = g.deploy('footman');
  f.x = m.x; f.y = m.y; f.hp = f.maxHp = 1000;
  g.hurtUnit(f, 100, false, 0, true);
  const covered = 1000 - f.hp;
  const lone = new AssaultGame({ mode: 'assault', seed: 'cover', career: 99 }); lone.gold = 1000;
  const f2 = lone.deploy('footman'); f2.hp = f2.maxHp = 1000;
  lone.hurtUnit(f2, 100, false, 0, true);
  assert.ok(covered < (1000 - f2.hp) * 0.6);
});

test('a siege tower at the wall tears a breach and drops footmen over it', () => {
  const g = new AssaultGame({ mode: 'assault', seed: 'breach', career: 99 });
  g.gold = 1000;
  const t = g.deploy('tower');
  t.hp = t.maxHp = 1e6;
  let breached = 0; g.on('breach', () => breached++);
  const before = g.units.length, fort = g.fortress.hp;
  for (let i = 0; i < 30 * 120 && !breached; i++) { g.sallyT = 99; g.update(1 / 30); }
  assert.equal(breached, 1);
  assert.ok(g.fortress.hp <= fort * 0.91);
  assert.ok(g.units.length >= before + AUNITS.tower.unload - 1);
});

test('conquest storms the Realm\'s next province and its land helps', () => {
  const held = 9, target = conquestTarget(held);
  assert.equal(target.id, frontier(held).next.id);
  const C = conquestSetup(target);
  const g = new AssaultGame({ mode: 'conquest', seed: 'c1', career: 20, held, province: target.id });
  assert.equal(g.camps, 3);
  assert.equal(g.mapId, C.maps[0]);
  play(g, 600);
  assert.ok(g.over);
  const s = g.summary();
  assert.equal(s.province, target.id);
  if (g.victory) assert.equal(s.taken, 3);
  assert.equal(validateRun({ ...s, start: 1 }), null);
  const perks = assaultPerks(30);
  assert.ok(perks.list.length >= 4 && perks.supply > 0);
});

test('blitz: the same three camps all week, scored on the clock', () => {
  assert.deepEqual(blitzSetup('2026-W43'), blitzSetup('2026-W43'));
  const g = new AssaultGame({ mode: 'blitz', seed: 'blitz-2026-W43', career: 20 });
  play(g, 700);
  assert.ok(g.over);
  const s = g.summary();
  assert.ok(s.score > 0 && s.score <= BLITZ_MAX);
  assert.equal(validateRun({ ...s, start: 1 }), null);
});

test('orders: smoke blinds emplacements, fire pots hurt them', () => {
  const g = new AssaultGame({ mode: 'assault', seed: 'orders' });
  const t = g.towers[0];
  g.orders.smoke.cd = 0; g.orders.firepots.cd = 0;
  assert.ok(g.useOrder('smoke', t.cx, t.cy));
  assert.ok(t.disabledT > 0);
  const hp = t.hp;
  assert.ok(g.useOrder('firepots', t.cx, t.cy));
  for (let i = 0; i < 60; i++) g.update(1 / 30);
  assert.ok(t.hp < hp);
  assert.equal(g.useOrder('firepots', t.cx, t.cy), false, 'recharging');
});
