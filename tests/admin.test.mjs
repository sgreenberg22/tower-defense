// v1.12 · The owner's admin panel: access control, moderation, objective resets, stats resets and the audit log.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, call } from './helpers/d1.mjs';
import { onRequest } from '../functions/api/[[path]].js';
import { weekKey, monthKey, seasonKey, utcDateKey } from '../src/core/rng.js';

const KEY = 'correct-horse-battery-staple-42';
const runBody = (o = {}) => ({ seed: 'abc', map: 'meadow', mode: 'normal', modifiers: [], ascension: 0, wave: 20, wavesCleared: 19, score: 20000, kills: 500, heroKills: 120, duration: 900, ...o });

function setup(extraEnv = {}) {
  const env = { DB: makeD1(), ADMIN_KEY: KEY, ...extraEnv };
  const sql = (q, ...a) => env.DB.raw.prepare(q).get(...a);
  const all = (q, ...a) => env.DB.raw.prepare(q).all(...a);
  const adm = (method, path, body, { key = KEY, ip = '9.9.9.9' } = {}) =>
    call(onRequest, env, method, 'admin/' + path, { body, ip, headers: key === null ? {} : { 'x-admin-key': key } }).then((r) => ({ ...r, ...r.data }));
  const api = (method, path, who, body) => call(onRequest, env, method, path, { token: who.token, body }).then((r) => ({ ...r, ...r.data }));
  let n = 0;
  const reg = async (name) => (await call(onRequest, env, 'POST', 'register', { body: { name }, ip: `10.0.0.${++n}` })).data;
  const play = async (who, o) => { const r = await api('POST', 'runs', who, runBody(o)); assert.ok(r.accepted, JSON.stringify(r)); return r; };
  return { env, sql, all, adm, api, reg, play };
}

test('the panel is off without a long enough ADMIN_KEY, and the status check says so', async () => {
  for (const key of [undefined, '', 'short', ' '.repeat(30)]) {
    const t = setup({ ADMIN_KEY: key });
    assert.equal((await t.adm('GET', 'status')).enabled, false);
    const r = await t.adm('GET', 'overview', undefined, { key: key || 'x' });
    assert.equal(r.status, 404, 'looks like it does not exist');
  }
  assert.equal((await setup().adm('GET', 'status', undefined, { key: null })).enabled, true, 'status needs no key');
});

test('wrong or missing keys are refused, repeated misses lock that address out, other addresses are unaffected', async () => {
  const t = setup();
  assert.equal((await t.adm('GET', 'overview', undefined, { key: null })).status, 401);
  assert.equal((await t.adm('GET', 'overview', undefined, { key: KEY.slice(0, -1) })).status, 401, 'close is not enough');
  assert.equal((await t.adm('GET', 'overview', undefined, { key: KEY.toUpperCase() })).status, 401);
  assert.equal((await t.adm('GET', 'overview')).status, 200, 'the right key works');
  // The game's own sign-in is not an admin sign-in.
  const p = await t.reg('Pip');
  assert.equal((await t.adm('GET', 'overview', undefined, { key: p.token })).status, 401);
  for (let i = 0; i < 8; i++) await t.adm('GET', 'overview', undefined, { key: 'nope-' + i, ip: '6.6.6.6' });
  const locked = await t.adm('GET', 'overview', undefined, { ip: '6.6.6.6' });
  assert.equal(locked.status, 429, 'even the right key waits once locked out');
  assert.equal((await t.adm('GET', 'overview', undefined, { ip: '7.7.7.7' })).status, 200, 'someone else is not locked out');
  // From another address the owner can lift the lockout.
  const un = await t.adm('POST', 'maintenance', { task: 'unlock' });
  assert.ok(un.ok && un.removed >= 1);
  assert.equal((await t.adm('GET', 'overview', undefined, { ip: '6.6.6.6' })).status, 200);
});

test('players: search, filters, details; rename; hide; ban refuses every request; reports cannot lift a ban', async () => {
  const t = setup();
  const a = await t.reg('Alice Archer'), b = await t.reg('Bob Bowman'), c = await t.reg('Cara Cannon');
  await t.play(a);
  let r = await t.adm('GET', 'players?q=archer');
  assert.deepEqual(r.rows.map((x) => x.name), ['Alice Archer']);
  assert.equal(r.rows[0].runs, 1);
  assert.equal((await t.adm('GET', `players?q=${b.friendCode}`)).rows[0].name, 'Bob Bowman', 'by friend code');
  assert.equal((await t.adm('GET', `players?q=${c.id}`)).rows[0].name, 'Cara Cannon', 'by id');
  assert.equal((await t.adm('GET', 'players?q=%25')).rows.length, 0, 'wildcards are literal');
  assert.equal((await t.adm('GET', 'players?filter=noruns')).total, 2);
  assert.equal((await t.adm('GET', 'players?sort=name')).rows[0].name, 'Alice Archer');
  const d = await t.adm('GET', `player?id=${a.id}`);
  assert.equal(d.player.name, 'Alice Archer');
  assert.equal(d.stats.runs, 1);
  assert.equal(d.stats.kills, 500);
  assert.ok(d.realm.some((x) => x.period === 'all'));
  assert.equal((await t.adm('GET', 'player?id=nope')).status, 400);
  assert.equal((await t.adm('GET', `player?id=${'0'.repeat(16)}`)).status, 404);

  // Rename: markup and control characters go; blank gets a plain default.
  r = await t.adm('POST', 'player/rename', { id: b.id, name: '  <b>Sir\u0007  Bob</b> ' });
  assert.equal(r.name, 'bSir Bob/b'.slice(0, 20));
  assert.equal(t.sql('SELECT name FROM players WHERE id = ?', b.id).name, 'bSir Bob/b');
  r = await t.adm('POST', 'player/rename', { id: b.id, name: ' ' });
  assert.match(r.name, /^Commander \d{4}$/);
  await t.api('POST', 'runs', b, runBody({ }));
  await t.api('POST', 'showcase', b, {});
  t.env.DB.raw.prepare('UPDATE players SET title = ? WHERE id = ?').run('Bad Title', b.id);
  await t.adm('POST', 'player/rename', { id: b.id, clearTitle: true });
  assert.equal(t.sql('SELECT title FROM players WHERE id = ?', b.id).title, null);

  // Hidden players vanish from boards but can still play.
  assert.equal((await t.api('GET', 'leaderboard?board=wave&scope=global&period=all', c)).rows.length, 2);
  r = await t.adm('POST', 'player/status', { id: a.id, status: 'hidden' });
  assert.ok(r.ok);
  assert.equal((await t.api('GET', 'me', a)).status, 200);
  assert.ok((await t.api('GET', 'leaderboard?board=wave&scope=global&period=all', c)).rows.every((x) => x.id !== a.id), 'off the board straight away');

  // A ban refuses everything, including account recovery's fresh token.
  await t.adm('POST', 'player/status', { id: a.id, status: 'banned' });
  r = await t.api('GET', 'me', a);
  assert.equal(r.status, 403);
  assert.match(r.error, /suspended/);
  assert.equal((await t.api('POST', 'runs', a, runBody())).status, 403);
  const rec = await call(onRequest, t.env, 'POST', 'recover', { body: { recovery: a.recovery }, ip: '3.3.3.3' });
  assert.equal((await t.api('GET', 'me', { token: rec.data.token })).status, 403, 'a new token does not help');
  a.token = rec.data.token;   // recovery rotated it
  assert.equal((await t.adm('GET', 'players?filter=banned')).total, 1);
  // Five reports hide an ordinary player (hidden = 1); they must not downgrade a ban.
  for (let i = 0; i < 5; i++) {
    const reporter = await t.reg('Reporter ' + i);
    assert.ok((await t.api('POST', 'report', reporter, { id: a.id })).ok);
  }
  assert.equal(t.sql('SELECT hidden FROM players WHERE id = ?', a.id).hidden, 2, 'still banned');
  assert.equal((await t.api('GET', 'me', a)).status, 403);
  // Clearing reports keeps the ban; unbanning (with the reports cleared) restores access.
  await t.adm('POST', 'player/clear-reports', { id: a.id });
  assert.equal(t.sql('SELECT hidden, reports FROM players WHERE id = ?', a.id).hidden, 2);
  await t.adm('POST', 'player/status', { id: a.id, status: 'active', clearReports: true });
  assert.equal((await t.api('GET', 'me', a)).status, 200);
  // Auto-hidden players come back with one click.
  const x = await t.reg('Xavier');
  for (let i = 0; i < 5; i++) await t.api('POST', 'report', await t.reg('R' + i + 'x'), { id: x.id });
  assert.equal(t.sql('SELECT hidden FROM players WHERE id = ?', x.id).hidden, 1);
  assert.equal((await t.adm('GET', 'players?filter=hidden')).total, 1);
  assert.equal((await t.adm('GET', 'overview')).players.reported, 1, 'an automatic hide still waits for review');
  await t.adm('POST', 'player/clear-reports', { id: x.id });
  assert.deepEqual({ ...t.sql('SELECT hidden, reports FROM players WHERE id = ?', x.id) }, { hidden: 0, reports: 0 });
  assert.equal((await t.adm('POST', 'player/status', { id: x.id, status: 'sleeping' })).status, 400);
});

test('messages and gifts land in the inbox; broadcasts count first and skip suspended players', async () => {
  const t = setup();
  const a = await t.reg('Alice'), b = await t.reg('Bob'), c = await t.reg('Cara');
  let r = await t.adm('POST', 'player/send', { id: a.id, title: 'Welcome back', body: 'A little thanks.', renown: 120, playerTitle: 'Friend of the Crown' });
  assert.ok(r.ok);
  const inbox = (await t.api('GET', 'inbox', a)).items;
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].claimed, false);
  const claim = await t.api('POST', 'inbox/claim', a, { id: inbox[0].id });
  assert.equal(claim.renown, 120);
  assert.equal(claim.title, 'Friend of the Crown');
  assert.equal((await t.adm('POST', 'player/send', { id: a.id, title: 'x' })).status, 400, 'title too short');
  assert.equal((await t.adm('POST', 'player/send', { id: a.id, title: 'Big', renown: 9999 })).status, 400, 'renown is capped');
  // A plain note stays unread until the player dismisses it.
  await t.adm('POST', 'player/send', { id: b.id, title: 'Heads up', body: 'Maintenance tonight.' });
  assert.equal((await t.api('GET', 'me', b)).inbox, 1);

  await t.adm('POST', 'player/status', { id: c.id, status: 'banned' });
  r = await t.adm('POST', 'broadcast', { title: 'Feast day', body: 'Double spoils.', renown: 25, audience: 'all', dryRun: true });
  assert.deepEqual({ dry: r.dryRun, n: r.recipients }, { dry: true, n: 2 });
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM inbox WHERE title = ?', 'Feast day').n, 0, 'a dry run sends nothing');
  assert.equal((await t.adm('POST', 'broadcast', { title: 'Feast day', renown: 25 })).status, 400, 'sending needs confirmation');
  r = await t.adm('POST', 'broadcast', { title: 'Feast day', body: 'Double spoils.', renown: 25, audience: 'all', confirm: true });
  assert.equal(r.recipients, 2);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM inbox WHERE title = ? AND player_id = ?', 'Feast day', c.id).n, 0, 'suspended players are skipped');
  assert.equal((await t.adm('POST', 'broadcast', { title: 'Hi', audience: 'forever', dryRun: true })).status, 400);
  t.env.DB.raw.prepare('UPDATE players SET last_seen = ? WHERE id = ?').run(Date.now() - 20 * 86400000, a.id);
  assert.equal((await t.adm('POST', 'broadcast', { title: 'Hi', audience: 'week', dryRun: true })).recipients, 1, 'only recently seen players');
});

// Everything a player leaves behind, by table.
const TRACE = { runs: 'player_id', bests: 'player_id', realm_contrib: 'player_id', realm_claims: 'player_id', rally_contrib: 'player_id', siege_contrib: 'player_id', clan_contrib: 'player_id', inbox: 'player_id', showcase: 'player_id', realm_feed: 'player_id', blocks: 'player_id' };
const traces = (t, id) => Object.entries(TRACE).map(([tbl, col]) => [tbl, t.sql(`SELECT COUNT(*) AS n FROM ${tbl} WHERE ${col} = ?`, id).n]).filter(([, n]) => n);

test('deleting a player removes every trace and (by default) takes their share back out of the shared totals', async () => {
  const t = setup();
  const a = await t.reg('Alice Archer'), b = await t.reg('Bob Bowman'), c = await t.reg('Cara Cannon');
  await t.api('POST', 'clan/create', a, { name: 'The Archers', tag: 'ARCH' });
  const code = t.sql('SELECT code FROM clans').code;
  await t.api('POST', 'clan/join', b, { code });
  await t.play(a, { kills: 500 }); await t.play(b, { kills: 300 });
  await t.api('POST', 'friends/add', c, { id: a.id }); await t.api('POST', 'friends/accept', a, { id: c.id });
  await t.api('POST', 'showcase', a, { rank: 'Squire' });
  await t.api('POST', 'block', b, { id: a.id });
  await t.api('POST', 'report', c, { id: a.id });
  await t.adm('POST', 'player/send', { id: a.id, title: 'Hello' });
  assert.ok(traces(t, a.id).length >= 8, 'sanity: Alice left plenty behind');

  const wk = weekKey(), mo = monthKey(), season = seasonKey(), day = utcDateKey();
  const before = {
    week: t.sql('SELECT kills, waves, hero FROM realm_period WHERE period = ?', wk), month: t.sql('SELECT kills FROM realm_period WHERE period = ?', mo),
    rally: t.sql('SELECT kills FROM rally WHERE day = ?', day).kills, siege: t.sql('SELECT hp, max_hp FROM siege').hp, clan: t.sql('SELECT progress FROM clan_weekly WHERE season = ?', season).progress,
    mine: t.sql('SELECT kills, waves, hero FROM realm_contrib WHERE period = ? AND player_id = ?', wk, a.id),
    myDamage: t.sql('SELECT damage FROM siege_contrib WHERE player_id = ?', a.id).damage,
  };
  assert.equal(before.week.kills, 800);

  assert.equal((await t.adm('POST', 'player/delete', { id: a.id })).status, 400, 'needs confirm');
  const r = await t.adm('POST', 'player/delete', { id: a.id, confirm: true });
  assert.ok(r.ok && r.removed > 5);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM players WHERE id = ?', a.id).n, 0);
  assert.deepEqual(traces(t, a.id), []);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM friends WHERE a = ? OR b = ?', a.id, a.id).n, 0);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM reports WHERE target = ? OR reporter = ?', a.id, a.id).n, 0);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM blocks WHERE blocked = ?', a.id).n, 0);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM friend_requests').n, 0);
  assert.equal(t.sql('SELECT kills FROM realm_period WHERE period = ?', wk).kills, before.week.kills - before.mine.kills, 'weekly total drops');
  assert.equal(t.sql('SELECT kills FROM realm_period WHERE period = ?', mo).kills, before.month.kills - before.mine.kills, 'monthly total drops');
  assert.equal(t.sql('SELECT kills FROM rally WHERE day = ?', day).kills, before.rally - 500);
  assert.equal(t.sql('SELECT hp FROM siege').hp, before.siege + before.myDamage, 'the boss heals what she dealt');
  assert.equal(t.sql('SELECT progress FROM clan_weekly WHERE season = ?', season).progress, before.clan - 500);
  assert.equal(t.sql('SELECT leader FROM clans').leader, b.id, 'the clan passes to its next member');
  assert.ok(t.sql('SELECT COUNT(*) AS n FROM realm_contrib WHERE player_id = ?', b.id).n > 0, 'Bob is untouched');
  assert.equal((await t.api('GET', 'me', a)).status, 401, 'the old token is dead');
  // The log remembers who it was, since the row is gone.
  const log = (await t.adm('GET', 'audit')).rows[0];
  assert.equal(log.action, 'player.delete');
  assert.equal(log.detail.name, 'Alice Archer');

  // Without undo the shared totals keep what was added.
  await t.play(c, { kills: 200 });
  const kept = t.sql('SELECT kills FROM realm_period WHERE period = ?', wk).kills;
  await t.adm('POST', 'player/delete', { id: c.id, confirm: true, undo: false });
  assert.equal(t.sql('SELECT kills FROM realm_period WHERE period = ?', wk).kills, kept);

  // The last member leaving removes the clan.
  await t.adm('POST', 'player/delete', { id: b.id, confirm: true });
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM clans').n, 0);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM clan_weekly').n, 0);
  assert.equal(t.sql('SELECT kills FROM realm_period WHERE period = ?', wk).kills, 200, 'only the un-undone run remains');
});

test('wiping a player keeps the account but clears boards or all progress', async () => {
  const t = setup();
  const a = await t.reg('Alice'), b = await t.reg('Bob');
  await t.play(a); await t.play(b);
  t.env.DB.raw.prepare('UPDATE players SET title = ? WHERE id = ?').run('Champion', a.id);
  let r = await t.adm('POST', 'player/wipe', { id: a.id, scope: 'boards', confirm: true });
  assert.ok(r.ok);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM bests WHERE player_id = ?', a.id).n, 0);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM runs WHERE player_id = ?', a.id).n, 1, 'runs survive a boards wipe');
  assert.deepEqual({ ...t.sql('SELECT best_wave, title FROM players WHERE id = ?', a.id) }, { best_wave: 0, title: null });
  const weekKills = t.sql('SELECT kills FROM realm_period WHERE period = ?', weekKey()).kills;
  assert.equal((await t.adm('POST', 'player/wipe', { id: a.id, scope: 'progress' })).status, 400, 'needs confirm');
  assert.equal((await t.adm('POST', 'player/wipe', { id: a.id, scope: 'everything', confirm: true })).status, 400);
  r = await t.adm('POST', 'player/wipe', { id: a.id, scope: 'progress', confirm: true });
  assert.ok(r.ok);
  assert.deepEqual(traces(t, a.id), []);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM players WHERE id = ?', a.id).n, 1, 'the account stays');
  assert.equal(t.sql('SELECT kills FROM realm_period WHERE period = ?', weekKey()).kills, weekKills - 500);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM runs WHERE player_id = ?', b.id).n, 1);
  assert.equal((await t.api('GET', 'me', a)).status, 200, 'and still plays');
});

test('rate limits can be lifted for one player; a clan kick passes leadership on', async () => {
  const t = setup();
  const a = await t.reg('Alice'), b = await t.reg('Bob');
  assert.ok((await t.api('POST', 'rename', a, { name: 'Alicia' })).name);
  assert.ok(t.sql('SELECT COUNT(*) AS n FROM rate WHERE key LIKE ?', `%${a.id}%`).n > 0);
  const r = await t.adm('POST', 'player/clear-limits', { id: a.id });
  assert.ok(r.cleared >= 1);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM rate WHERE key LIKE ?', `%${a.id}%`).n, 0);
  await t.api('POST', 'clan/create', a, { name: 'The Archers', tag: 'ARCH' });
  await t.api('POST', 'clan/join', b, { code: t.sql('SELECT code FROM clans').code });
  assert.equal((await t.adm('POST', 'player/clan-kick', { id: b.id })).status, 200);
  assert.equal(t.sql('SELECT clan_id FROM players WHERE id = ?', b.id).clan_id, null);
  assert.equal((await t.adm('POST', 'player/clan-kick', { id: b.id })).status, 400, 'not in a clan any more');
  await t.adm('POST', 'player/clan-kick', { id: a.id });
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM clans').n, 0, 'an empty clan is removed');
});

test('Realm objectives: view, reset progress, claims and goals, with confirmation and validation', async () => {
  const t = setup();
  const a = await t.reg('Alice'), b = await t.reg('Bob');
  await t.play(a); await t.play(b, { kills: 300 });
  const wk = weekKey(), mo = monthKey();
  let o = await t.adm('GET', 'objectives');
  assert.equal(o.week.key, wk);
  assert.equal(o.week.kills, 800);
  assert.equal(o.week.people, 2);
  assert.ok(o.week.goal.kills > 0 && o.week.suggested.kills > 0);
  assert.equal(o.month.key, mo);
  assert.equal(o.rally.kills, 800);
  assert.ok(o.siege.name && o.siege.fighters === 2);
  // Pretend Alice already claimed a spoil.
  t.env.DB.raw.prepare('INSERT INTO realm_claims (player_id, period, tier) VALUES (?, ?, 0)').run(a.id, wk);

  assert.equal((await t.adm('POST', 'realm/reset', { period: wk, progress: true })).status, 400, 'needs confirm');
  assert.equal((await t.adm('POST', 'realm/reset', { period: wk, confirm: true })).status, 400, 'needs something to reset');
  assert.equal((await t.adm('POST', 'realm/reset', { period: 'banana', progress: true, confirm: true })).status, 400);
  assert.equal((await t.adm('POST', 'realm/reset', { period: 'w:1999-W01', progress: true, confirm: true })).status, 404);
  // Progress only: the week restarts, claims and goals stay.
  const goal = o.week.goal;
  let r = await t.adm('POST', 'realm/reset', { period: wk, progress: true, confirm: true });
  assert.ok(r.ok);
  assert.deepEqual({ k: r.period.kills, w: r.period.waves, h: r.period.hero }, { k: 0, w: 0, h: 0 });
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM realm_contrib WHERE period = ?', wk).n, 0, 'everyone starts over');
  assert.equal(t.sql("SELECT kills FROM realm_contrib WHERE period = 'all' AND player_id = ?", a.id).kills, 500, 'lifetime totals stay');
  assert.equal(t.sql('SELECT kills FROM realm_period WHERE period = ?', mo).kills, 800, 'the month is untouched');
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM realm_claims WHERE period = ?', wk).n, 1);
  assert.deepEqual(r.period.goal, goal);
  // Boards reflect it straight away.
  assert.equal((await t.api('GET', 'realm/board?period=week', a)).rows.length, 0);
  // Claims and goals.
  r = await t.adm('POST', 'realm/reset', { period: wk, claims: true, goals: { kills: 7000, waves: 90 }, confirm: true });
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM realm_claims WHERE period = ?', wk).n, 0);
  assert.deepEqual(r.period.goal, { kills: 7000, waves: 90 });
  assert.equal((await t.adm('POST', 'realm/reset', { period: wk, goals: { kills: -5, waves: 1 }, confirm: true })).status, 400);
  r = await t.adm('POST', 'realm/reset', { period: wk, goals: 'recalc', confirm: true });
  assert.deepEqual(r.period.goal, r.period.suggested, 'recalculated from last period');
  // Monthly campaigns work the same way.
  r = await t.adm('POST', 'realm/reset', { period: mo, progress: true, confirm: true });
  assert.equal(r.period.kills, 0);
  // New contributions count again from zero, and the log has it all.
  await t.api('POST', 'realm/sync', b, { kills: 100, waves: 2, hero: 10 });
  assert.equal(t.sql('SELECT kills FROM realm_period WHERE period = ?', wk).kills, 100);
  const actions = (await t.adm('GET', 'audit')).rows.map((x) => x.action);
  assert.ok(actions.filter((x) => x === 'realm.reset').length >= 4);
});

test('Daily Rally and World Siege controls', async () => {
  const t = setup();
  const a = await t.reg('Alice');
  await t.play(a);
  const day = utcDateKey();
  assert.equal((await t.adm('POST', 'rally/reset', { progress: true })).status, 400, 'needs confirm');
  assert.equal((await t.adm('POST', 'rally/reset', { confirm: true })).status, 400, 'needs something to do');
  assert.equal((await t.adm('POST', 'rally/reset', { day: '1999-01-01', progress: true, confirm: true })).status, 404);
  t.env.DB.raw.prepare('UPDATE rally SET done = 1 WHERE day = ?').run(day);
  t.env.DB.raw.prepare('UPDATE rally_contrib SET rewarded = 1 WHERE day = ?').run(day);
  let r = await t.adm('POST', 'rally/reset', { progress: true, goal: 2500, confirm: true });
  assert.deepEqual({ k: r.rally.kills, g: r.rally.goal, done: r.rally.done }, { k: 0, g: 2500, done: false });
  assert.equal(t.sql('SELECT rewarded FROM rally_contrib WHERE day = ?', day).rewarded, 1, 'earlier payouts are remembered');
  r = await t.adm('POST', 'rally/reset', { rewards: true, goal: 'recalc', confirm: true });
  assert.equal(t.sql('SELECT rewarded FROM rally_contrib WHERE day = ?', day).rewarded, 0);
  assert.ok(r.rally.goal >= 100);
  assert.equal((await t.adm('POST', 'rally/reset', { goal: 3, confirm: true })).status, 400);

  // Siege
  const full = t.sql('SELECT hp, max_hp FROM siege');
  assert.ok(full.hp < full.max_hp);
  r = await t.adm('POST', 'siege/update', { action: 'restore', confirm: true });
  assert.equal(r.siege.hp, r.siege.maxHp);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM siege_contrib').n, 1, 'restore keeps who struck');
  r = await t.adm('POST', 'siege/update', { action: 'sethp', hp: 1234, confirm: true });
  assert.equal(r.siege.hp, 1234);
  assert.equal((await t.adm('POST', 'siege/update', { action: 'sethp', hp: -1, confirm: true })).status, 400);
  assert.equal((await t.adm('POST', 'siege/update', { action: 'sethp', hp: 1e12, confirm: true })).status, 400);
  r = await t.adm('POST', 'siege/update', { action: 'setmax', maxHp: 500000, confirm: true });
  assert.deepEqual({ hp: r.siege.hp, max: r.siege.maxHp }, { hp: 500000, max: 500000 });
  t.env.DB.raw.prepare('UPDATE siege SET hp = 0, defeated = 1').run();
  r = await t.adm('POST', 'siege/update', { action: 'clear', confirm: true });
  assert.deepEqual({ hp: r.siege.hp, d: r.siege.defeated }, { hp: 500000, d: false });
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM siege_contrib').n, 0);
  assert.equal((await t.adm('POST', 'siege/update', { action: 'explode', confirm: true })).status, 400);
  assert.equal((await t.api('GET', 'siege', a)).hp, 500000, 'players see it');
});

test('leaderboards: list, remove one entry, reset one board or period, reset everything', async () => {
  const t = setup();
  const a = await t.reg('Alice'), b = await t.reg('Bob');
  await t.play(a, { wave: 30, wavesCleared: 29 }); await t.play(b, { wave: 20, wavesCleared: 19 });
  const season = seasonKey();
  let r = await t.adm('GET', `boards?board=wave&period=${season}`);
  assert.deepEqual(r.rows.map((x) => [x.name, x.rank]), [['Alice', 1], ['Bob', 2]]);
  assert.ok(r.periods.some((p) => p.period === 'all') && r.periods.some((p) => p.period === season));
  assert.equal((await t.adm('GET', 'boards?board=banana')).board, 'wave', 'unknown boards fall back');

  r = await t.adm('POST', 'board/remove', { id: a.id, board: 'wave', period: season });
  assert.equal(r.removed, 1);
  assert.deepEqual((await t.adm('GET', `boards?board=wave&period=${season}`)).rows.map((x) => x.name), ['Bob']);
  assert.equal((await t.adm('POST', 'board/remove', { id: a.id })).status, 400, 'removing all of a player\'s entries needs confirm');
  assert.ok((await t.adm('POST', 'board/remove', { id: a.id, confirm: true })).removed >= 1);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM bests WHERE player_id = ?', a.id).n, 0);

  assert.equal((await t.adm('POST', 'board/reset', { board: 'wave', period: season })).status, 400, 'needs confirm');
  assert.equal((await t.adm('POST', 'board/reset', { board: 'wave', period: 'someday', confirm: true })).status, 400);
  assert.equal((await t.adm('POST', 'board/reset', { board: 'chess', period: 'all', confirm: true })).status, 400);
  r = await t.adm('POST', 'board/reset', { board: 'wave', period: season, confirm: true });
  assert.equal(r.removed, 1);
  assert.equal(t.sql("SELECT COUNT(*) AS n FROM bests WHERE board = 'wave' AND period = 'all'").n, 1, 'other periods stay');
  assert.ok(t.sql('SELECT best_wave FROM players WHERE id = ?', b.id).best_wave > 0, 'best wave only resets with the all-time board');
  r = await t.adm('POST', 'board/reset', { board: '*', period: '*', confirm: true });
  assert.ok(r.removed >= 1);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM bests').n, 0);
  assert.equal(t.sql('SELECT best_wave FROM players WHERE id = ?', b.id).best_wave, 0);
  assert.equal((await t.api('GET', 'leaderboard?board=wave&scope=global&period=all', b)).rows.length, 0);
});

test('stats resets: world stats, lifetime totals, run history, and a fresh start that keeps accounts and clans', async () => {
  const t = setup();
  const a = await t.reg('Alice'), b = await t.reg('Bob');
  await t.api('POST', 'clan/create', a, { name: 'The Archers', tag: 'ARCH' });
  await t.play(a, { usage: { m: 'meadow' } }); await t.play(b);
  t.env.DB.raw.prepare("INSERT INTO world_stats (period, cat, data) VALUES ('all', 'towers', '{}'), (?, 'towers', '{}'), ('_', 'lock', '123')").run(seasonKey());
  t.env.DB.raw.prepare("INSERT INTO run_usage (season, data) VALUES (?, '{}')").run(seasonKey());
  const db = (await t.adm('GET', 'db')).tables;
  assert.equal(db.find((x) => x.table === 'players').rows, 2);
  assert.ok(db.find((x) => x.table === 'runs').rows === 2 && db.length >= 26);

  assert.equal((await t.adm('POST', 'stats/reset', { what: 'world' })).status, 400, 'needs confirm');
  assert.equal((await t.adm('POST', 'stats/reset', { what: 'world', period: 'nope', confirm: true })).status, 400);
  assert.equal((await t.adm('POST', 'stats/reset', { what: 'sunshine', confirm: true })).status, 400);
  await t.adm('POST', 'stats/reset', { what: 'world', period: 'all', confirm: true });
  assert.equal(t.sql("SELECT COUNT(*) AS n FROM world_stats WHERE period = 'all'").n, 0);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM world_stats WHERE period = ?', seasonKey()).n, 1, 'the weekly figures stay');
  await t.adm('POST', 'stats/reset', { what: 'world', period: '*', confirm: true });
  assert.equal(t.sql("SELECT COUNT(*) AS n FROM world_stats WHERE period != '_'").n, 0);
  assert.equal(t.sql("SELECT data FROM world_stats WHERE period = '_'").data, '123', 'the roll-up lock survives');
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM run_usage').n, 0, 'unfolded usage goes too');
  const world = await t.api('GET', 'world', a);
  assert.equal(world.status, 200);

  await t.adm('POST', 'stats/reset', { what: 'lifetime', confirm: true });
  assert.equal(t.sql("SELECT COUNT(*) AS n FROM realm_contrib WHERE period = 'all'").n, 0);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM realm_contrib WHERE period = ?', weekKey()).n, 2, 'weekly shares stay');
  // Run history: older than N days, then all.
  t.env.DB.raw.prepare('UPDATE runs SET created = ? WHERE player_id = ?').run(Date.now() - 40 * 86400000, a.id);
  let r = await t.adm('POST', 'stats/reset', { what: 'runs', olderThanDays: 30, confirm: true });
  assert.equal(r.removed, 1);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM runs').n, 1);
  await t.adm('POST', 'stats/reset', { what: 'runs', confirm: true });
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM runs').n, 0);

  await t.play(await t.reg('Cara'));
  r = await t.adm('POST', 'stats/reset', { what: 'fresh', confirm: true });
  assert.ok(r.ok);
  for (const tbl of ['bests', 'runs', 'realm_period', 'realm_contrib', 'rally', 'rally_contrib', 'siege', 'siege_contrib', 'realm_feed']) assert.equal(t.sql(`SELECT COUNT(*) AS n FROM ${tbl}`).n, 0, tbl);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM players').n, 3);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM clans').n, 1);
  assert.equal(t.sql('SELECT MAX(best_wave) AS m FROM players').m, 0);
  // The game carries on from scratch: periods and the siege are re-created.
  assert.equal((await t.api('GET', 'realm', a)).week.kills, 0);
  assert.ok((await t.api('GET', 'siege', a)).hp > 0);
});

test('clans: search, rename, leader, xp, weekly reset, disband (members are told)', async () => {
  const t = setup();
  const a = await t.reg('Alice'), b = await t.reg('Bob');
  await t.api('POST', 'clan/create', a, { name: 'The Archers', tag: 'ARCH' });
  const clan = t.sql('SELECT * FROM clans');
  await t.api('POST', 'clan/join', b, { code: clan.code });
  await t.play(a); await t.play(b, { kills: 300 });
  let r = await t.adm('GET', 'clans?q=arch');
  assert.equal(r.rows[0].members, 2);
  assert.equal(r.rows[0].leaderName, 'Alice');
  assert.equal((await t.adm('GET', `clans?q=${clan.code}`)).rows.length, 1, 'by code');
  assert.equal((await t.adm('GET', 'clans?q=zzz')).rows.length, 0);
  r = await t.adm('GET', `clan?id=${clan.id}`);
  assert.deepEqual(r.members.map((m) => [m.name, m.leader, m.weekKills]), [['Alice', true, 500], ['Bob', false, 300]]);
  assert.equal(r.weekly.progress, 800);

  r = await t.adm('POST', 'clan/update', { id: clan.id, name: ' Shield  Wall ', tag: 'sw!1', xp: 5000, treasury: 100, leader: b.id });
  assert.ok(r.ok);
  assert.deepEqual({ ...t.sql('SELECT name, tag, xp, treasury, leader FROM clans') }, { name: 'Shield Wall', tag: 'SW1', xp: 5000, treasury: 100, leader: b.id });
  assert.equal((await t.adm('POST', 'clan/update', { id: clan.id, leader: (await t.reg('Outsider')).id })).status, 400, 'leader must be a member');
  assert.equal((await t.adm('POST', 'clan/update', { id: clan.id, tag: '!' })).status, 400);
  assert.equal((await t.adm('POST', 'clan/update', { id: clan.id })).status, 400, 'nothing to change');

  assert.equal((await t.adm('POST', 'clans/reset-weekly', { id: clan.id })).status, 400, 'needs confirm');
  t.env.DB.raw.prepare('UPDATE clan_weekly SET rewarded = 1').run();
  await t.adm('POST', 'clans/reset-weekly', { id: clan.id, confirm: true });
  assert.deepEqual({ ...t.sql('SELECT progress, rewarded FROM clan_weekly') }, { progress: 0, rewarded: 1 }, 'the chest is not re-opened by default');
  assert.equal(t.sql('SELECT SUM(kills) AS n FROM clan_contrib').n, 0);
  await t.adm('POST', 'clans/reset-weekly', { confirm: true, rewards: true });
  assert.equal(t.sql('SELECT rewarded FROM clan_weekly').rewarded, 0);

  r = await t.adm('POST', 'clan/disband', { id: clan.id, confirm: true });
  assert.equal(r.released, 2);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM clans').n + t.sql('SELECT COUNT(*) AS n FROM clan_weekly').n + t.sql('SELECT COUNT(*) AS n FROM clan_contrib').n, 0);
  assert.equal(t.sql('SELECT clan_id FROM players WHERE id = ?', a.id).clan_id, null);
  assert.match((await t.api('GET', 'inbox', b)).items[0].title, /disbanded/);
  assert.equal((await t.api('GET', 'clan', a)).clan, null);
});

test('the Realm feed can be moderated', async () => {
  const t = setup();
  const a = await t.reg('Alice'), b = await t.reg('Bob');
  await t.play(a, { wave: 30, wavesCleared: 29 });
  let feed = await t.adm('GET', 'feed');
  assert.ok(feed.rows.length >= 1 && feed.rows[0].name === 'Alice');
  const id = feed.rows[0].id;
  await t.api('POST', 'realm/cheer', b, { id });
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM feed_cheers').n, 1);
  assert.equal((await t.adm('POST', 'feed/delete', { id })).removed, 1);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM feed_cheers').n, 0, 'its cheers go with it');
  assert.equal((await t.api('GET', 'realm/feed', b)).items.length, 0);
  t.env.DB.raw.prepare("INSERT INTO realm_feed (created, player_id, kind, text) VALUES (1, ?, 'best', 'x'), (2, ?, 'best', 'y')").run(a.id, a.id);
  assert.equal((await t.adm('POST', 'feed/clear', {})).status, 400);
  assert.equal((await t.adm('POST', 'feed/clear', { confirm: true })).removed, 2);
});

test('upkeep: expired limiter rows, old inbox, inactive accounts (preview, then in batches)', async () => {
  const t = setup();
  const raw = t.env.DB.raw;
  raw.prepare("INSERT INTO rate (key, count, reset) VALUES ('old:1', 3, 1), ('new:1', 3, ?)").run(Date.now() + 99999);
  assert.equal((await t.adm('POST', 'maintenance', { task: 'rate' })).removed, 1);
  assert.equal(t.sql("SELECT COUNT(*) AS n FROM rate WHERE key IN ('old:1', 'new:1')").n, 1);

  const a = await t.reg('Active Alice');
  const ghosts = [];
  for (let i = 0; i < 27; i++) ghosts.push(await t.reg('Ghost ' + i));
  const old = Date.now() - 200 * 86400000;
  raw.prepare('UPDATE players SET last_seen = ? WHERE id != ?').run(old, a.id);
  const veteran = ghosts[0];
  await t.play(veteran);
  raw.prepare('UPDATE players SET last_seen = ? WHERE id = ?').run(old, veteran.id);
  const banned = ghosts[1];
  await t.adm('POST', 'player/status', { id: banned.id, status: 'banned' });
  raw.prepare('UPDATE players SET last_seen = ? WHERE id = ?').run(old, banned.id);
  let r = await t.adm('POST', 'maintenance', { task: 'inactive', days: 90, dryRun: true });
  assert.equal(r.matched, 25, 'Alice is active, the veteran has runs, the banned account is kept');
  assert.ok(r.sample.length > 0 && r.sample.length <= 8);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM players').n, 28, 'a preview removes nothing');
  assert.equal((await t.adm('POST', 'maintenance', { task: 'inactive', days: 90 })).status, 400, 'needs confirm');
  assert.equal((await t.adm('POST', 'maintenance', { task: 'inactive', days: 3, dryRun: true })).status, 400, 'too short a window');
  r = await t.adm('POST', 'maintenance', { task: 'inactive', days: 90, confirm: true });
  assert.deepEqual({ d: r.deleted, left: r.remaining }, { d: 25, left: 0 });
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM players').n, 3);
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM players WHERE id = ?', veteran.id).n, 1);
  r = await t.adm('POST', 'maintenance', { task: 'inactive', days: 90, noRuns: false, confirm: true });
  assert.equal(r.deleted, 1, 'including accounts that have played, but never the active or banned');
  assert.equal(t.sql('SELECT COUNT(*) AS n FROM players WHERE id = ?', veteran.id).n, 0);

  raw.prepare("INSERT INTO inbox (player_id, kind, title, body, payload, created, claimed) VALUES (?, 'note', 'old', '', '{}', ?, 1), (?, 'note', 'fresh', '', '{}', ?, 1), (?, 'renown', 'unclaimed', '', '{}', ?, 0)").run(a.id, old, a.id, Date.now(), a.id, old);
  assert.equal((await t.adm('POST', 'maintenance', { task: 'inbox', days: 30 })).removed, 1, 'only old, claimed messages');
  assert.equal((await t.adm('POST', 'maintenance', { task: 'dance' })).status, 400);
});

test('the audit log records changes, newest first, and keeps only the latest 1,000', async () => {
  const t = setup();
  const a = await t.reg('Alice');
  await t.adm('POST', 'login', {});
  await t.adm('POST', 'player/status', { id: a.id, status: 'hidden' });
  await t.adm('POST', 'player/send', { id: a.id, title: 'Hello', renown: 5 });
  let r = await t.adm('GET', 'audit');
  assert.deepEqual(r.rows.map((x) => x.action), ['player.send', 'player.hidden', 'signin']);
  assert.equal(r.rows[2].detail.ip, '9.9.9.9');
  assert.equal(r.rows[1].target, a.id);
  assert.ok(r.rows[0].at <= Date.now());
  assert.equal((await t.adm('GET', `player?id=${a.id}`)).history.length, 2, 'the player page shows what was done to them');
  // Reads are not logged; failed changes are not logged.
  await t.adm('GET', 'overview'); await t.adm('POST', 'player/delete', { id: a.id });
  assert.equal((await t.adm('GET', 'audit')).total, 3);
  for (let i = 0; i < 1005; i++) t.env.DB.raw.prepare("INSERT INTO admin_log (at, action) VALUES (1, 'filler')").run();
  await t.adm('POST', 'player/status', { id: a.id, status: 'active' });
  r = await t.adm('GET', 'audit?limit=200');
  assert.ok(r.total <= 1000 + 1);
  assert.equal(r.rows[0].action, 'player.active');
});

test('overview numbers; the game API is unchanged for everyone else', async () => {
  const t = setup();
  const a = await t.reg('Alice'), b = await t.reg('Bob');
  await t.play(a);
  await t.adm('POST', 'player/status', { id: b.id, status: 'banned' });
  const o = await t.adm('GET', 'overview');
  assert.deepEqual({ ...o.players }, { total: 2, hidden: 0, banned: 1, activeDay: 2, online: 2, fresh: 2, reported: 0 });
  assert.equal(o.runs, 1);
  assert.equal(o.runsToday, 1);
  assert.equal(o.keys.week, weekKey());
  assert.equal(o.recent[0].action, 'player.banned');
  // The public routes never accept the admin key, and admin paths never accept a player token.
  assert.equal((await call(onRequest, t.env, 'GET', 'me', { headers: { 'x-admin-key': KEY } })).status, 401);
  assert.equal((await call(onRequest, t.env, 'GET', 'admin/overview', { token: a.token })).status, 401);
  assert.equal((await t.adm('GET', 'nonsense')).status, 404);
  assert.equal((await call(onRequest, t.env, 'GET', 'health')).data.ok, true);
});

test('the Keeper can set the Map of Aldermere, and the change is chronicled and audited', async () => {
  const t = setup();
  const a = await t.reg('Alice');
  let o = await t.adm('GET', 'objectives');
  assert.equal(o.map.held, 6);
  assert.equal((await t.adm('POST', 'map/set', { held: 20 })).status, 400, 'needs confirm');
  assert.equal((await t.adm('POST', 'map/set', { held: 99, confirm: true })).status, 400, 'bounded');
  assert.equal((await t.adm('POST', 'map/set', { held: 20, bulwark: 2, confirm: true })).held, 20);
  o = await t.adm('GET', 'objectives');
  assert.equal(o.map.held, 20);
  assert.equal(o.map.bulwark, 2);
  const realm = await t.api('GET', 'realm', a);
  assert.equal(realm.map.held, 20);
  assert.equal(realm.map.log[0].kind, 'admin');
  assert.ok(t.sql("SELECT COUNT(*) AS n FROM admin_log WHERE action = 'map.set'").n === 1);
});
