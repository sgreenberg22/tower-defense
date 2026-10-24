import test from 'node:test';
import assert from 'node:assert/strict';
import { AssaultGame, autoAssault, ASSAULT, RAID, RAID_MAX, raidSetup, validateAssaultRun, AUNITS } from '../src/game/assault.js';
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

test('locked troops stay out of the column; engines open by stage', () => {
  const g = new AssaultGame({ mode: 'assault', seed: 'locks', bonus: { unlockedTroops: new Set(['footman', 'bowman']) } });
  assert.ok(!g.unitKnown('knight'));
  assert.ok(g.unitKnown('footman') && g.unitKnown('ram'));
  assert.ok(!g.unitOpen('catapult') && AUNITS.catapult.minStage === 3);
  g.gold = 1000;
  assert.equal(g.deploy('knight'), null);
  assert.ok(g.deploy('ram'));
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
