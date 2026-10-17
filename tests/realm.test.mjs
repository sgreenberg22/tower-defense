import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, call } from './helpers/d1.mjs';
import { onRequest } from '../functions/api/[[path]].js';
import { goalsFor, fraction, tiersReached, blessing, rallyGoal, blendBasis } from '../src/game/realm.js';
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

test('goals are dynamic: more citizens or more output next period means a tougher goal', () => {
  const quiet = goalsFor('week', { active: 4, kills: 9000, waves: 400, goal: 10000 });
  const busier = goalsFor('week', { active: 40, kills: 9000, waves: 400, goal: 10000 });
  const grinders = goalsFor('week', { active: 4, kills: 60000, waves: 2500, goal: 10000 });
  assert.ok(busier.kills > quiet.kills, 'more citizens → bigger goal');
  assert.ok(grinders.kills > quiet.kills, 'same citizens doing more → bigger goal');
  assert.equal(grinders.kills, 25000, 'the rise is capped at maxRise × last goal');
  // Repeating last week's effort lands between Victory (100%) and Legend (150%).
  const steady = goalsFor('week', { active: 2, kills: 30000, waves: 1500, goal: 30000 });
  const f = fraction(30000, 1500, steady);
  assert.ok(f >= 1 && f < 1.5, `repeat effort should reach Victory but not Legend (got ${f.toFixed(2)})`);
  // A Realm that shrinks gets an easier goal, never below the floor.
  assert.ok(goalsFor('week', { active: 1, kills: 2000, goal: 30000 }).kills < steady.kills);
  assert.equal(goalsFor('week', { active: 0, kills: 0, goal: 30000 }).kills, REALM.week.floorKills);
  assert.ok(goalsFor('month', { active: 30, kills: 0 }).kills > goalsFor('month', { active: 3, kills: 0 }).kills);
  // The Daily Rally follows the same rule, day to day.
  assert.ok(rallyGoal({ active: 10, kills: 20000, goal: 6000 }) > rallyGoal({ active: 10, kills: 0, goal: 6000 }));
  assert.equal(rallyGoal(10), 6000);
});

test('the next week opens with a goal sized from this week (end to end)', async () => {
  const { env, reg } = await setup();
  const prevKey = prevPeriodKey(weekKey());
  // Seed last week: 30 citizens who each defeated 2,000 enemies.
  const a = await reg('Goal Gail', '6.6.6.6');            // the API creates its tables on first use
  const db = env.DB.raw;
  db.exec(`INSERT INTO realm_period (period, kind, goal_kills, goal_waves, kills, waves, starts, ends) VALUES ('${prevKey}', 'week', 40000, 2000, 60000, 3000, 0, 1)`);
  for (let i = 0; i < 30; i++) db.exec(`INSERT INTO players (id, name, token_hash, recovery_hash, friend_code, created, last_seen) VALUES ('p${i}', 'P${i}', 't${i}', 'r${i}', 'FC${i}', 0, 0)`);
  for (let i = 0; i < 30; i++) db.exec(`INSERT INTO realm_contrib (period, player_id, kills, waves, hero, runs) VALUES ('${prevKey}', 'p${i}', 2000, 100, 0, 1)`);
  const realm = (await call(onRequest, env, 'GET', 'realm', { token: a.token })).data;
  assert.equal(realm.week.goal.kills, goalsFor('week', { active: 30, kills: 60000, waves: 3000, goal: 40000 }).kills);
  assert.ok(realm.week.goal.kills > REALM.week.floorKills * 5, `goal grew with the Realm (${realm.week.goal.kills})`);
  assert.equal(realm.week.basis.active, 30);
  assert.equal(realm.week.basis.kills, 60000);
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
  for (let i = 0; i < 4; i++) { env.DB.raw.exec('DELETE FROM rate'); await call(onRequest, env, 'POST', 'runs', { token: b.token, body: runBody({ kills: 900, wave: 28, wavesCleared: 27, score: 40000, duration: 1500 + i, heroKills: 0 }) }); }
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

test('big runs keep counting: the personal ceilings are far above normal play', async () => {
  const { env, reg } = await setup();
  const a = await reg('Capped Carl', '4.4.4.4');
  let total = 0;
  for (let i = 0; i < 12; i++) {
    env.DB.raw.exec('DELETE FROM rate');
    const r = await call(onRequest, env, 'POST', 'runs', { token: a.token, body: runBody({ kills: 5000, wave: 90, wavesCleared: 89, score: 5e6, heroKills: 100, duration: 9000 + i }) });
    if (!r.data.accepted) { assert.fail(r.data.reason); }
    total += r.data.realm.added.kills;
  }
  assert.equal(total, 60000);
  assert.ok(REALM.week.cap >= 200000 && REALM.month.cap >= 800000);
});

test('too few kills cannot claim', async () => {
  const { env, reg } = await setup();
  const a = await reg('Tiny Tim', '5.5.5.5');
  await call(onRequest, env, 'POST', 'runs', { token: a.token, body: runBody({ kills: 20, wave: 4, wavesCleared: 3, score: 300, heroKills: 2, duration: 200 }) });
  const r = await call(onRequest, env, 'POST', 'realm/claim', { token: a.token, body: { period: weekKey() } });
  assert.equal(r.status, 400);
});

test('mid-run syncs count immediately and are not double counted when the run ends', async () => {
  const { env, reg } = await setup();
  const a = await reg('Cara Carter', '4.4.4.4');
  let r = await call(onRequest, env, 'POST', 'realm/sync', { token: a.token, body: { kills: 200, waves: 8, hero: 10 } });
  assert.equal(r.data.ok, true);
  let realm = (await call(onRequest, env, 'GET', 'realm', { token: a.token })).data;
  assert.equal(realm.week.mine.kills, 200);
  env.DB.raw.exec('DELETE FROM rate');
  r = await call(onRequest, env, 'POST', 'runs', { token: a.token, body: { ...runBody(), realmSynced: { kills: 200, waves: 8, hero: 10 } } });
  assert.equal(r.data.accepted, true);
  assert.equal(r.data.realm.added.kills, 500);              // whole run shown to the player
  realm = (await call(onRequest, env, 'GET', 'realm', { token: a.token })).data;
  assert.equal(realm.week.mine.kills, 500);                 // but only counted once
  assert.equal(realm.week.kills, 500);
});

test('back-to-back syncs (a wave clear, then Save and quit) both reach the Daily Rally', async () => {
  const { env, reg } = await setup();
  const a = await reg('Dana Dale', '5.5.5.5');
  for (const kills of [40, 25, 10]) {
    const r = await call(onRequest, env, 'POST', 'realm/sync', { token: a.token, body: { kills, waves: 1, hero: 0 } });
    assert.equal(r.data.ok, true, 'not dropped by the rate limit');
  }
  const front = (await call(onRequest, env, 'GET', 'front', { token: a.token })).data;
  assert.equal(front.rally.kills, 75);
  assert.equal(front.rally.mine.kills, 75);
  // A flood is still held back.
  let limited = false;
  for (let i = 0; i < 10; i++) { const r = await call(onRequest, env, 'POST', 'realm/sync', { token: a.token, body: { kills: 1, waves: 0, hero: 0 } }); if (r.data.limited) limited = true; }
  assert.equal(limited, true);
});

test('kills past the old 1,500 daily cap still count for the Rally, Week and Month', async () => {
  const { env, reg } = await setup();
  const a = await reg('Eli Ash', '6.6.6.6');
  const body = { token: a.token, body: { kills: 1400, waves: 10, hero: 0 } };
  await call(onRequest, env, 'POST', 'realm/sync', body);
  await call(onRequest, env, 'POST', 'realm/sync', body);
  const front = (await call(onRequest, env, 'GET', 'front', { token: a.token })).data;
  assert.equal(front.rally.mine.kills, 2800);
  const realm = (await call(onRequest, env, 'GET', 'realm', { token: a.token })).data;
  assert.equal(realm.week.mine.kills, 2800);
});

test('goals follow a smoothed view of the last periods, ignoring periods that never opened', () => {
  const quiet = { active: 2, kills: 3000, waves: 100, goal: 5000 }, busy = { active: 10, kills: 30000, waves: 900, goal: 25000 };
  const b = blendBasis([quiet, busy, busy]);
  assert.equal(b.goal, 5000);                                  // the goal to beat is the newest period's
  assert.ok(b.kills > quiet.kills && b.kills < busy.kills, 'a quiet day does not erase a busy stretch');
  assert.deepEqual(blendBasis([quiet, { active: 0, kills: 0, waves: 0, goal: 0 }]).kills, 3000);
  assert.deepEqual(blendBasis([]), { active: 0, kills: 0, waves: 0, goal: 0 });
});

test('a resent run (lost reply, outbox retry) is recorded once and counts once', async () => {
  const { env, reg } = await setup();
  const a = await reg('Fay Finch', '7.7.7.7');
  const body = runBody({ wave: 131, wavesCleared: 130, score: 4000000, kills: 9000, heroKills: 400, duration: 9000 });
  let r = await call(onRequest, env, 'POST', 'runs', { token: a.token, body });
  assert.equal(r.data.accepted, true);
  env.DB.raw.exec('DELETE FROM rate');
  r = await call(onRequest, env, 'POST', 'runs', { token: a.token, body });
  assert.equal(r.data.accepted, false);
  const realm = (await call(onRequest, env, 'GET', 'realm', { token: a.token })).data;
  assert.equal(realm.week.mine.kills, 9000);
});

test('shared clocks roll over at Central midnight (DST aware)', async () => {
  const { realmDay, realmDayStart, realmDayEnd, shiftDay, seasonKey: sk } = await import('../src/core/rng.js');
  // 2026-11-01 is the fall-back day in Chicago: 25 hours long.
  assert.equal(realmDay(new Date('2026-11-02T05:59:00Z')), '2026-11-01');
  assert.equal(realmDay(new Date('2026-11-02T06:00:00Z')), '2026-11-02');
  assert.equal(realmDayEnd('2026-11-01') - realmDayStart(2026, 11, 1), 25 * 3600000);
  // Summer (CDT): 7:00pm Central is already the next UTC day, but still today here.
  assert.equal(realmDay(new Date('2027-07-05T04:59:00Z')), '2027-07-04');
  assert.equal(realmDay(new Date('2027-07-05T05:00:00Z')), '2027-07-05');
  // The week turns Monday 00:00 Central, the month on the 1st.
  assert.equal(sk(new Date('2026-12-07T05:59:00Z')), '2026-W49');
  assert.equal(sk(new Date('2026-12-07T06:00:00Z')), '2026-W50');
  assert.equal(monthKey(new Date('2026-12-01T05:59:00Z')), 'm:2026-11');
  assert.equal(monthKey(new Date('2026-12-01T06:00:00Z')), 'm:2026-12');
  assert.equal(periodBounds('m:2026-12').start, Date.UTC(2026, 11, 1, 6));
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  // Before the switch the old UTC calendar stands, so a settled day is never reopened.
  assert.equal(realmDay(new Date('2026-10-17T01:14:00Z')), '2026-10-17');
  assert.equal(realmDay(new Date('2026-10-17T04:59:00Z')), '2026-10-17');
  assert.equal(realmDay(new Date('2026-10-17T05:00:00Z')), '2026-10-17');
  assert.equal(realmDay(new Date('2026-10-18T04:59:00Z')), '2026-10-17');
});

test('the switch day runs long instead of reopening a settled one', async () => {
  const { realmDayStart, realmDayEnd } = await import('../src/core/rng.js');
  assert.equal(realmDayStart(2026, 10, 17), Date.UTC(2026, 9, 17));
  assert.equal(realmDayEnd('2026-10-17'), Date.UTC(2026, 9, 18, 5));
  assert.equal(realmDayEnd('2026-10-16'), Date.UTC(2026, 9, 17));
});
