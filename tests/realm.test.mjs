import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, call } from './helpers/d1.mjs';
import { onRequest } from '../functions/api/[[path]].js';
import { goalsFor, fraction, tiersReached, blessing } from '../src/game/realm.js';
import { weekKey, monthKey, prevPeriodKey, periodBounds } from '../src/core/rng.js';
import { REALM } from '../src/data/balance.js';

test('period keys: ranges, previous period, month rollover', () => {
  const d = new Date(Date.UTC(2026, 9, 8));                 // Thu 8 Oct 2026
  assert.equal(weekKey(d), 'w:2026-W41');
  assert.equal(monthKey(d), 'm:2026-10');
  const b = periodBounds('w:2026-W41');
  assert.equal(new Date(b.start).getUTCDay(), 1);           // Monday
  assert.equal(b.end - b.start, 7 * 86400000);
  assert.ok(b.start <= d.getTime() && d.getTime() < b.end);
  assert.equal(prevPeriodKey('w:2026-W41'), 'w:2026-W40');
  assert.equal(prevPeriodKey('w:2026-W01'), 'w:2025-W52');
  assert.equal(prevPeriodKey('m:2026-01'), 'm:2025-12');
  assert.equal(periodBounds('m:2026-02').end - periodBounds('m:2026-02').start, 28 * 86400000);
});

test('goals scale with last period turnout and respect floors', () => {
  assert.equal(goalsFor('week', 0).kills, REALM.week.floorKills);
  assert.equal(goalsFor('week', 10).kills, 25000);
  assert.equal(goalsFor('week', 10).waves, 1250);
  assert.ok(goalsFor('month', 1).kills >= REALM.month.floorKills);
});

test('tiers and blessings', () => {
  const g = { kills: 1000, waves: 50 };
  assert.equal(tiersReached(fraction(0, 0, g)), 0);
  assert.equal(tiersReached(fraction(500, 25, g)), 2);       // 50%
  assert.equal(tiersReached(fraction(1000, 50, g)), 4);      // 100%
  assert.equal(tiersReached(fraction(5000, 0, g)), 4);       // one meter alone caps at 100% overall
  const b = blessing(2, 1);
  assert.equal(b.perks.startGold, 25 + 0);                   // week tier 1 only; month tier 1 is castle HP
  assert.equal(b.perks.killGold, 0.03);
  assert.equal(b.perks.castleHpMult, 0.05);
  assert.equal(b.text.length, 3);
});

async function setup() {
  const env = { DB: makeD1() };
  const reg = async (name, ip) => (await call(onRequest, env, 'POST', 'register', { body: { name }, ip })).data;
  return { env, reg };
}
const runBody = (o = {}) => ({ seed: 'abc', map: 'meadow', mode: 'normal', modifiers: [], ascension: 0, wave: 20, wavesCleared: 19, score: 20000, kills: 500, heroKills: 120, duration: 900, ...o });

test('runs feed the Realm, boards show each citizen, claims pay once', async () => {
  const { env, reg } = await setup();
  const a = await reg('Alice Archer', '2.2.2.2'), b = await reg('Bob Bowman', '3.3.3.3');
  let r = await call(onRequest, env, 'POST', 'runs', { token: a.token, body: runBody() });
  assert.equal(r.data.accepted, true);
  assert.equal(r.data.realm.added.kills, 500);
  assert.equal(r.data.realm.added.waves, 19);
  assert.ok(r.data.realm.week.fraction > 0 && r.data.realm.week.fraction < 1);
  // Bob contributes more
  env.DB.raw.exec('DELETE FROM rate');                       // lift the 1-run-per-20s limiter for the test
  r = await call(onRequest, env, 'POST', 'runs', { token: b.token, body: runBody({ kills: 900, heroKills: 10, wave: 28, wavesCleared: 27, score: 40000, duration: 1500 }) });
  assert.equal(r.data.accepted, true);

  const realm = (await call(onRequest, env, 'GET', 'realm', { token: a.token })).data;
  assert.equal(realm.week.kills, 1400);
  assert.equal(realm.week.waves, 46);
  assert.equal(realm.week.mine.kills, 500);
  assert.ok(Math.abs(realm.week.mine.share - 500 / 1400) < 1e-9);
  assert.equal(realm.week.goal.kills, REALM.week.floorKills);
  assert.equal(realm.month.kills, 1400);
  // 1400/5000 and 46/250 -> ~0.23 overall: no tier yet.
  assert.equal(realm.week.reached, 0);
  assert.equal(realm.claimable, 0);

  const board = (await call(onRequest, env, 'GET', 'realm/board?period=week&sort=kills', { token: a.token })).data;
  assert.deepEqual(board.rows.map((x) => x.name), ['Bob Bowman', 'Alice Archer']);
  assert.equal(board.me.rank, 2);
  assert.equal(board.total.kills, 1400);
  const byHero = (await call(onRequest, env, 'GET', 'realm/board?period=all&sort=hero', { token: a.token })).data;
  assert.equal(byHero.rows[0].name, 'Alice Archer');

  // Push the nation past 25% so Watchfire unlocks.
  for (let i = 0; i < 4; i++) { env.DB.raw.exec('DELETE FROM rate'); await call(onRequest, env, 'POST', 'runs', { token: b.token, body: runBody({ kills: 900, wave: 28, wavesCleared: 27, score: 40000, duration: 1500, heroKills: 0 }) }); }
  const after = (await call(onRequest, env, 'GET', 'realm', { token: a.token })).data;
  assert.ok(after.week.reached >= 1, 'a tier unlocked');
  assert.ok(after.blessing.perks.startGold >= 25);
  assert.equal(after.week.claimable, REALM.week.rewards[0] * (after.week.reached >= 1 ? 1 : 0) + REALM.week.rewards.slice(1, after.week.reached).reduce((x, y) => x + y, 0));
  const c1 = await call(onRequest, env, 'POST', 'realm/claim', { token: a.token, body: { period: after.week.key } });
  assert.equal(c1.data.renown, after.week.claimable);
  const c2 = await call(onRequest, env, 'POST', 'realm/claim', { token: a.token, body: { period: after.week.key } });
  assert.equal(c2.data.renown, 0, 'cannot claim twice');
  const old = await call(onRequest, env, 'POST', 'realm/claim', { token: a.token, body: { period: 'w:2020-W01' } });
  assert.equal(old.status, 400);
});

test('per-citizen weekly cap stops one account carrying the nation', async () => {
  const { env, reg } = await setup();
  const a = await reg('Capped Carl', '4.4.4.4');
  env.DB.raw.exec('SELECT 1');
  let total = 0;
  for (let i = 0; i < 12; i++) {
    env.DB.raw.exec('DELETE FROM rate');
    const r = await call(onRequest, env, 'POST', 'runs', { token: a.token, body: runBody({ kills: 5000, wave: 90, wavesCleared: 89, score: 5e6, heroKills: 100, duration: 9000 }) });
    if (!r.data.accepted) { assert.fail(r.data.reason); }
    total += r.data.realm.added.kills;
  }
  assert.equal(total, REALM.week.cap);
});

test('too few kills cannot claim', async () => {
  const { env, reg } = await setup();
  const a = await reg('Tiny Tim', '5.5.5.5');
  await call(onRequest, env, 'POST', 'runs', { token: a.token, body: runBody({ kills: 20, wave: 4, wavesCleared: 3, score: 300, heroKills: 2, duration: 200 }) });
  const r = await call(onRequest, env, 'POST', 'realm/claim', { token: a.token, body: { period: weekKey() } });
  assert.equal(r.status, 400);
});
