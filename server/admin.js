// Owner-only admin API. functions/api/[[path]].js mounts it under /api/admin/*.
//
// Access: the ADMIN_KEY secret (16+ characters, set in Cloudflare, never in the repo) sent as an `x-admin-key` header.
// Without a key the whole panel is switched off and answers 404. Wrong keys are counted per network address and lock
// that address out for 15 minutes after 8 misses. Every change is written to admin_log (the newest 1,000 are kept).
//
// Suspended players have players.hidden = 2: their requests are refused (see auth() in the API). hidden = 1 only hides
// a player from boards and feeds, which is what five player reports do automatically.
//
// This module receives the API's helpers instead of importing them, so the API file stays the only place that owns them.
import { weekKey, monthKey, seasonKey, utcDateKey, prevPeriodKey } from '../src/core/rng.js';
import { REALM, RALLY } from '../src/data/balance.js';
import { goalsFor, fraction, tiersReached, rallyGoal, kindOf } from '../src/game/realm.js';
import { TERRITORY, MAX_PROVINCES, PROVINCES } from '../src/game/realmmap.js';

const KEY_MIN = 16;
const FAIL_MAX = 8;
const FAIL_WINDOW_SEC = 15 * 60;
const DAY = 86400000;
const LOG_KEEP = 1000;
const ID_RE = /^[a-f0-9]{16}$/;
const PERIOD_RE = /^(?:w:\d{4}-W\d{2}|m:\d{4}-\d{2})$/;
const SEASON_RE = /^\d{4}-W\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const BOARDS = ['wave', 'score', 'daily', 'hero', 'ascend'];
const STATUS = { active: 0, hidden: 1, banned: 2 };
const TABLES = ['players', 'runs', 'bests', 'friends', 'friend_requests', 'inbox', 'clans', 'clan_weekly', 'clan_contrib', 'siege', 'siege_contrib', 'reports', 'blocks', 'rate', 'season_claims',
  'realm_period', 'realm_contrib', 'realm_claims', 'rally', 'rally_contrib', 'realm_feed', 'feed_cheers', 'showcase', 'run_usage', 'world_stats', 'admin_log', 'realm_map', 'realm_map_log'];

// Everything a "fresh start" clears. Accounts, clans, friends and inboxes stay.
const FRESH_START = [
  'DELETE FROM bests', 'DELETE FROM runs', 'DELETE FROM realm_contrib', 'DELETE FROM realm_period', 'DELETE FROM realm_claims',
  'DELETE FROM rally', 'DELETE FROM rally_contrib', 'DELETE FROM siege', 'DELETE FROM siege_contrib', 'DELETE FROM clan_weekly', 'DELETE FROM clan_contrib',
  'DELETE FROM season_claims', 'DELETE FROM realm_map', 'DELETE FROM realm_map_log', 'DELETE FROM realm_feed', 'DELETE FROM feed_cheers', "DELETE FROM world_stats WHERE period != '_'", 'DELETE FROM run_usage',
  'UPDATE players SET best_wave = 0, title = NULL',
];

export function makeAdmin(d) {
  const { bad, now, sha256, rateLimit, rateLeft, cleanName, ensurePeriod, ensureRally, currentSiege, prevBasis, memCache, mapState } = d;

  // ---------------- access ----------------
  const enabled = (env) => typeof env?.ADMIN_KEY === 'string' && env.ADMIN_KEY.trim().length >= KEY_MIN;

  // Both sides are hashed first, so the comparison always walks 64 characters whatever was typed.
  async function sameKey(given, secret) {
    const [a, b] = await Promise.all([sha256(given), sha256(secret)]);
    let diff = a.length ^ b.length;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
    return diff === 0;
  }

  async function gate(request, env, db) {
    if (!enabled(env)) bad('Not found', 404);
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const fails = 'admfail:' + ip;
    if ((await rateLeft(db, fails, FAIL_MAX)) <= 0) bad('Too many wrong keys from this network. Try again in a few minutes.', 429);
    const given = (request.headers.get('x-admin-key') || '').trim();
    if (!given || !(await sameKey(given, env.ADMIN_KEY.trim()))) {
      await rateLimit(db, fails, FAIL_MAX, FAIL_WINDOW_SEC);
      bad('That admin key is not right.', 401);
    }
    return { ip };
  }

  // ---------------- helpers ----------------
  const run = (db, sql, ...args) => db.prepare(sql).bind(...args);
  const changes = (results) => (Array.isArray(results) ? results : [results]).reduce((a, r) => a + (r?.meta?.changes || 0), 0);
  const sure = (body) => { if (body.confirm !== true) bad('Please confirm this action first.'); };
  const int = (v, min, max, label) => {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < min || n > max) bad(`${label} must be a whole number from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}.`);
    return n;
  };
  const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  const likeEsc = (s) => s.replace(/[\\%_]/g, '\\$&');
  const bust = (...prefixes) => { for (const k of [...memCache.keys()]) if (prefixes.some((p) => k.startsWith(p))) memCache.delete(k); };
  const boardCaches = () => bust('lb:', 'rb:', 'front', 'stats', 'world:');

  // One statement for the log entry and one that trims the log; both ride along in the action's own batch.
  const audit = (db, action, target, detail) => [
    run(db, 'INSERT INTO admin_log (at, action, target, detail) VALUES (?, ?, ?, ?)', now(), action, target == null ? null : String(target).slice(0, 80), detail ? JSON.stringify(detail).slice(0, 700) : null),
    run(db, 'DELETE FROM admin_log WHERE id <= (SELECT MAX(id) - ? FROM admin_log)', LOG_KEEP),
  ];
  const parseDetail = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

  const playerId = (v) => { const s = String(v ?? '').trim().toLowerCase(); if (!ID_RE.test(s)) bad('That is not a player id.'); return s; };
  const getPlayer = async (db, id) => { const p = await db.prepare('SELECT * FROM players WHERE id = ?').bind(id).first(); if (!p) bad('There is no such player.', 404); return p; };
  const getClan = async (db, id) => { const c = await db.prepare('SELECT * FROM clans WHERE id = ?').bind(playerId(id)).first(); if (!c) bad('There is no such clan.', 404); return c; };

  // ---------------- removing a player's data ----------------
  // Weekly and monthly totals, the rally, the siege and the clan's weekly goal are sums of what each player added.
  // "Undo" takes this player's share back out of those sums (it must run before the player's own rows are deleted).
  const undoStatements = (db, id) => [
    run(db, `UPDATE realm_period SET
      kills = MAX(0, kills - COALESCE((SELECT c.kills FROM realm_contrib c WHERE c.period = realm_period.period AND c.player_id = ?), 0)),
      waves = MAX(0, waves - COALESCE((SELECT c.waves FROM realm_contrib c WHERE c.period = realm_period.period AND c.player_id = ?), 0)),
      hero = MAX(0, hero - COALESCE((SELECT c.hero FROM realm_contrib c WHERE c.period = realm_period.period AND c.player_id = ?), 0))
      WHERE period IN (SELECT period FROM realm_contrib WHERE player_id = ? AND period != 'all')`, id, id, id, id),
    run(db, `UPDATE rally SET kills = MAX(0, kills - COALESCE((SELECT c.kills FROM rally_contrib c WHERE c.day = rally.day AND c.player_id = ?), 0))
      WHERE day IN (SELECT day FROM rally_contrib WHERE player_id = ?)`, id, id),
    run(db, `UPDATE siege SET hp = MIN(max_hp, hp + COALESCE((SELECT c.damage FROM siege_contrib c WHERE c.siege_id = siege.id AND c.player_id = ?), 0))
      WHERE defeated = 0 AND id IN (SELECT siege_id FROM siege_contrib WHERE player_id = ?)`, id, id),
    run(db, `UPDATE clan_weekly SET progress = MAX(0, progress - COALESCE((SELECT c.kills FROM clan_contrib c WHERE c.clan_id = clan_weekly.clan_id AND c.season = clan_weekly.season AND c.player_id = ?), 0))
      WHERE EXISTS (SELECT 1 FROM clan_contrib c WHERE c.clan_id = clan_weekly.clan_id AND c.season = clan_weekly.season AND c.player_id = ?)`, id, id),
  ];
  const boardStatements = (db, id) => [
    run(db, 'DELETE FROM bests WHERE player_id = ?', id),
    run(db, 'UPDATE players SET best_wave = 0, title = NULL WHERE id = ?', id),
  ];
  const recordStatements = (db, id) => [
    ...boardStatements(db, id),
    ...['runs', 'realm_contrib', 'realm_claims', 'rally_contrib', 'siege_contrib', 'clan_contrib', 'season_claims'].map((t) => run(db, `DELETE FROM ${t} WHERE player_id = ?`, id)),
  ];
  const socialStatements = (db, id) => [
    run(db, 'DELETE FROM friends WHERE a = ? OR b = ?', id, id),
    run(db, 'DELETE FROM friend_requests WHERE from_id = ? OR to_id = ?', id, id),
    run(db, 'DELETE FROM inbox WHERE player_id = ?', id),
    run(db, 'DELETE FROM reports WHERE reporter = ? OR target = ?', id, id),
    run(db, 'DELETE FROM blocks WHERE player_id = ? OR blocked = ?', id, id),
    run(db, 'DELETE FROM showcase WHERE player_id = ?', id),
    run(db, 'UPDATE realm_feed SET cheers = MAX(0, cheers - 1) WHERE id IN (SELECT feed_id FROM feed_cheers WHERE player_id = ?)', id),
    run(db, 'DELETE FROM feed_cheers WHERE player_id = ? OR feed_id IN (SELECT id FROM realm_feed WHERE player_id = ?)', id, id),
    run(db, 'DELETE FROM realm_feed WHERE player_id = ?', id),
    run(db, 'DELETE FROM rate WHERE key LIKE ?', `%${id}%`),
  ];
  // Leaving a clan: the oldest remaining member takes over leadership, and an empty clan is removed.
  async function clanExit(db, p) {
    if (!p.clan_id) return [];
    const out = [run(db, 'UPDATE players SET clan_id = NULL WHERE id = ?', p.id)];
    const c = await db.prepare('SELECT leader FROM clans WHERE id = ?').bind(p.clan_id).first();
    if (!c) return out;
    const next = await db.prepare('SELECT id FROM players WHERE clan_id = ? AND id != ? ORDER BY created ASC LIMIT 1').bind(p.clan_id, p.id).first();
    if (!next) out.push(run(db, 'DELETE FROM clans WHERE id = ?', p.clan_id), run(db, 'DELETE FROM clan_weekly WHERE clan_id = ?', p.clan_id), run(db, 'DELETE FROM clan_contrib WHERE clan_id = ?', p.clan_id));
    else if (c.leader === p.id) out.push(run(db, 'UPDATE clans SET leader = ? WHERE id = ?', next.id, p.clan_id));
    return out;
  }
  async function deleteStatements(db, p, undo) {
    return [
      ...(undo ? undoStatements(db, p.id) : []),
      ...recordStatements(db, p.id),
      ...socialStatements(db, p.id),
      ...(await clanExit(db, p)),
      run(db, 'DELETE FROM players WHERE id = ?', p.id),
      // Reports filed by this player no longer count against anyone.
      run(db, 'UPDATE players SET reports = (SELECT COUNT(*) FROM reports WHERE target = players.id) WHERE reports > 0'),
    ];
  }

  // ---------------- objectives ----------------
  async function periodCard(db, key) {
    const p = await ensurePeriod(db, key);
    const cfg = REALM[p.kind];
    const [people, claims, basis] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(kills >= ?), 0) AS eligible FROM realm_contrib WHERE period = ?').bind(cfg.minKills, key).first(),
      db.prepare('SELECT tier, COUNT(*) AS n FROM realm_claims WHERE period = ? GROUP BY tier ORDER BY tier').bind(key).all(),
      prevBasis(db, key),
    ]);
    const f = fraction(p.kills, p.waves, { kills: p.goal_kills, waves: p.goal_waves });
    return {
      key, kind: p.kind, label: cfg.label, starts: p.starts, ends: p.ends, kills: p.kills, waves: p.waves, hero: p.hero,
      goal: { kills: p.goal_kills, waves: p.goal_waves }, fraction: f, tiers: tiersReached(f), tierCount: REALM.tiers.length,
      people: people.n, eligible: people.eligible, claims: Object.fromEntries(claims.results.map((c) => [c.tier, c.n])),
      suggested: goalsFor(p.kind, basis),
    };
  }
  async function rallyCard(db, day) {
    const r = await ensureRally(db, day);
    const [people, rewarded] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS n FROM rally_contrib WHERE day = ? AND kills > 0').bind(day).first(),
      db.prepare('SELECT COUNT(*) AS n FROM rally_contrib WHERE day = ? AND rewarded = 1').bind(day).first(),
    ]);
    return { day, goal: r.goal, kills: r.kills, done: !!r.done, people: people.n, rewarded: rewarded.n };
  }
  async function rallyGoalFor(db, day) {
    const prev = utcDateKey(new Date(Date.parse(day + 'T00:00:00Z') - DAY));
    const [act, sum, row] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS n FROM rally_contrib WHERE day = ? AND kills >= ?').bind(prev, RALLY.minKills).first(),
      db.prepare('SELECT COALESCE(SUM(kills), 0) AS kills FROM rally_contrib WHERE day = ?').bind(prev).first(),
      db.prepare('SELECT goal FROM rally WHERE day = ?').bind(prev).first(),
    ]);
    return rallyGoal({ active: act.n, kills: sum.kills, goal: row?.goal || 0 });
  }

  // ---------------- routes ----------------
  const routes = {
    // Called on sign-in. Logs who came in from where.
    'POST admin/login': async ({ db, ip }) => {
      await db.batch(audit(db, 'signin', null, { ip }));
      return { ok: true };
    },

    'GET admin/overview': async ({ db }) => {
      const t = now(), wk = weekKey(), mo = monthKey();
      const [pl, flagged, runs, today, clans, usage, feed, periods, recent] = await Promise.all([
        db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(hidden = 1), 0) AS hidden, COALESCE(SUM(hidden = 2), 0) AS banned, COALESCE(SUM(last_seen > ?), 0) AS day, COALESCE(SUM(last_seen > ?), 0) AS online, COALESCE(SUM(created > ?), 0) AS fresh FROM players').bind(t - DAY, t - 300000, t - 2 * DAY).first(),
        db.prepare('SELECT COUNT(*) AS n FROM players WHERE reports > 0 AND hidden < 2').first(),   // the review queue: reported and not yet suspended (automatic hides included)
        db.prepare('SELECT COUNT(*) AS n FROM runs').first(),
        db.prepare('SELECT COUNT(*) AS n FROM runs WHERE created > ?').bind(Date.parse(utcDateKey() + 'T00:00:00Z')).first(),
        db.prepare('SELECT COUNT(*) AS n FROM clans').first(),
        db.prepare('SELECT COUNT(*) AS n FROM run_usage').first(),
        db.prepare('SELECT COUNT(*) AS n FROM realm_feed').first(),
        db.prepare('SELECT period, kills, waves, goal_kills AS goalKills, goal_waves AS goalWaves FROM realm_period WHERE period IN (?, ?)').bind(wk, mo).all(),
        db.prepare('SELECT id, at, action, target, detail FROM admin_log ORDER BY id DESC LIMIT 6').all(),
      ]);
      return {
        now: t, keys: { week: wk, month: mo, season: seasonKey(), day: utcDateKey() },
        players: { total: pl.total, hidden: pl.hidden, banned: pl.banned, activeDay: pl.day, online: pl.online, fresh: pl.fresh, reported: flagged.n },
        runs: runs.n, runsToday: today.n, clans: clans.n, pendingUsage: usage.n, feed: feed.n,
        periods: periods.results, recent: recent.results.map((r) => ({ ...r, detail: parseDetail(r.detail) })),
      };
    },

    // ---- players ----
    'GET admin/players': async ({ db, url }) => {
      const q = text(url.searchParams.get('q'), 32);
      const filter = url.searchParams.get('filter') || 'all', sort = url.searchParams.get('sort') || 'seen';
      const limit = Math.max(1, Math.min(100, url.searchParams.get('limit') | 0 || 30)), offset = Math.max(0, Math.min(100000, url.searchParams.get('offset') | 0));
      const t = now(), where = [], args = [];
      if (q) {
        where.push("(p.name LIKE ? ESCAPE '\\' OR p.friend_code = ? OR p.id = ?)");
        args.push(`%${likeEsc(q)}%`, q.toUpperCase(), q.toLowerCase());
      }
      const filters = {
        reported: 'p.reports > 0', hidden: 'p.hidden = 1', banned: 'p.hidden = 2', active: 'p.last_seen > ?', fresh: 'p.created > ?', idle: 'p.last_seen < ?',
        noruns: 'NOT EXISTS (SELECT 1 FROM runs r WHERE r.player_id = p.id)',
      };
      if (filters[filter]) {
        where.push(filters[filter]);
        if (filter === 'active') args.push(t - DAY); else if (filter === 'fresh') args.push(t - 2 * DAY); else if (filter === 'idle') args.push(t - 30 * DAY);
      }
      const order = { seen: 'p.last_seen DESC', created: 'p.created DESC', wave: 'p.best_wave DESC, p.last_seen DESC', reports: 'p.reports DESC, p.last_seen DESC', name: 'p.name COLLATE NOCASE ASC' }[sort] || 'p.last_seen DESC';
      const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const [rows, total] = await Promise.all([
        db.prepare(`SELECT p.id, p.name, p.title, p.friend_code AS code, p.best_wave AS bestWave, p.reports, p.hidden, p.created, p.last_seen AS lastSeen, c.tag AS clan, (SELECT COUNT(*) FROM runs r WHERE r.player_id = p.id) AS runs FROM players p LEFT JOIN clans c ON c.id = p.clan_id ${w} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...args, limit, offset).all(),
        db.prepare(`SELECT COUNT(*) AS n FROM players p ${w}`).bind(...args).first(),
      ]);
      return { rows: rows.results, total: total.n, limit, offset };
    },

    'GET admin/player': async ({ db, url }) => {
      const id = playerId(url.searchParams.get('id')), p = await getPlayer(db, id);
      const wk = weekKey(), mo = monthKey();
      const [clan, tot, recent, bests, realm, siege, friends, inbox, reports, blockedBy, history] = await Promise.all([
        p.clan_id ? db.prepare('SELECT id, name, tag, leader FROM clans WHERE id = ?').bind(p.clan_id).first() : null,
        db.prepare('SELECT COUNT(*) AS runs, COALESCE(SUM(kills), 0) AS kills, COALESCE(SUM(hero_kills), 0) AS hero, COALESCE(SUM(duration), 0) AS secs, COALESCE(MAX(wave), 0) AS best FROM runs WHERE player_id = ?').bind(id).first(),
        db.prepare('SELECT map, mode, ascension, wave, score, kills, duration, created FROM runs WHERE player_id = ? ORDER BY id DESC LIMIT 8').bind(id).all(),
        db.prepare('SELECT board, period, value FROM bests WHERE player_id = ? ORDER BY board, period DESC LIMIT 40').bind(id).all(),
        db.prepare("SELECT period, kills, waves, hero, runs FROM realm_contrib WHERE player_id = ? AND period IN (?, ?, 'all')").bind(id, wk, mo).all(),
        db.prepare('SELECT COALESCE(SUM(damage), 0) AS n FROM siege_contrib WHERE player_id = ?').bind(id).first(),
        db.prepare('SELECT COUNT(*) AS n FROM friends WHERE a = ?').bind(id).first(),
        db.prepare('SELECT COUNT(*) AS n FROM inbox WHERE player_id = ? AND claimed = 0').bind(id).first(),
        db.prepare('SELECT r.reporter AS id, q.name, r.created FROM reports r LEFT JOIN players q ON q.id = r.reporter WHERE r.target = ? ORDER BY r.created DESC LIMIT 20').bind(id).all(),
        db.prepare('SELECT COUNT(*) AS n FROM blocks WHERE blocked = ?').bind(id).first(),
        db.prepare('SELECT id, at, action, detail FROM admin_log WHERE target = ? ORDER BY id DESC LIMIT 10').bind(id).all(),
      ]);
      return {
        player: { id: p.id, name: p.name, title: p.title, code: p.friend_code, bestWave: p.best_wave, reports: p.reports, hidden: p.hidden, created: p.created, lastSeen: p.last_seen },
        clan, stats: { ...tot, hours: Math.round(tot.secs / 360) / 10, siegeDamage: siege.n, friends: friends.n, unread: inbox.n, blockedBy: blockedBy.n },
        runs: recent.results, bests: bests.results, realm: realm.results, reports: reports.results,
        history: history.results.map((r) => ({ ...r, detail: parseDetail(r.detail) })),
      };
    },

    'POST admin/player/rename': async ({ db, body }) => {
      const p = await getPlayer(db, playerId(body.id));
      const stmts = [];
      let name = p.name;
      if (body.name !== undefined) {
        name = text(body.name, 20);
        if (name.length < 2) name = cleanName('', 'Commander');   // blank means "give them a plain default"
        stmts.push(run(db, 'UPDATE players SET name = ? WHERE id = ?', name, p.id));
      }
      if (body.clearTitle) stmts.push(run(db, 'UPDATE players SET title = NULL WHERE id = ?', p.id));
      if (!stmts.length) bad('Nothing to change.');
      await db.batch([...stmts, ...audit(db, 'player.rename', p.id, { from: p.name, to: name, clearTitle: !!body.clearTitle })]);
      boardCaches();
      return { ok: true, name };
    },

    // active = normal, hidden = off the boards and feeds, banned = every request refused.
    'POST admin/player/status': async ({ db, body }) => {
      const p = await getPlayer(db, playerId(body.id));
      const status = STATUS[body.status];
      if (status === undefined) bad('Status must be active, hidden or banned.');
      const stmts = [run(db, 'UPDATE players SET hidden = ? WHERE id = ?', status, p.id)];
      if (status === 0 && body.clearReports) stmts.push(run(db, 'DELETE FROM reports WHERE target = ?', p.id), run(db, 'UPDATE players SET reports = 0 WHERE id = ?', p.id));
      await db.batch([...stmts, ...audit(db, 'player.' + body.status, p.id, { name: p.name, was: p.hidden, reportsCleared: status === 0 && !!body.clearReports })]);
      boardCaches();
      return { ok: true, status: body.status };
    },

    // Dismiss every report against a player; an automatic hide (hidden = 1) is lifted, a suspension is not.
    'POST admin/player/clear-reports': async ({ db, body }) => {
      const p = await getPlayer(db, playerId(body.id));
      await db.batch([
        run(db, 'DELETE FROM reports WHERE target = ?', p.id),
        run(db, 'UPDATE players SET reports = 0, hidden = CASE WHEN hidden = 1 THEN 0 ELSE hidden END WHERE id = ?', p.id),
        ...audit(db, 'player.clear-reports', p.id, { name: p.name, reports: p.reports }),
      ]);
      boardCaches();
      return { ok: true };
    },

    // Lifts every rate limit that names this player (renames, gifts, runs, reports...).
    'POST admin/player/clear-limits': async ({ db, body }) => {
      const p = await getPlayer(db, playerId(body.id));
      const [res] = await db.batch([run(db, 'DELETE FROM rate WHERE key LIKE ?', `%${p.id}%`), ...audit(db, 'player.clear-limits', p.id, { name: p.name })]);
      return { ok: true, cleared: changes(res) };
    },

    // A message and/or a gift of Renown (and a title) into their inbox.
    'POST admin/player/send': async ({ db, body }) => {
      const p = await getPlayer(db, playerId(body.id));
      const title = text(body.title, 60), note = text(body.body, 300), renown = int(body.renown ?? 0, 0, 500, 'Renown'), grant = text(body.playerTitle, 24).replace(/[^\w \-'.·]/g, '');
      if (title.length < 2) bad('Give the message a title.');
      const gift = renown > 0 || grant.length > 0;
      await db.batch([
        run(db, 'INSERT INTO inbox (player_id, kind, title, body, payload, created, claimed) VALUES (?, ?, ?, ?, ?, ?, 0)', p.id, gift ? 'renown' : 'note', title, note, JSON.stringify(gift ? { renown, title: grant || undefined } : {}), now()),
        ...audit(db, 'player.send', p.id, { name: p.name, title, renown, grant }),
      ]);
      return { ok: true };
    },

    'POST admin/player/clan-kick': async ({ db, body }) => {
      const p = await getPlayer(db, playerId(body.id));
      if (!p.clan_id) bad('They are not in a clan.');
      const clan = await db.prepare('SELECT name FROM clans WHERE id = ?').bind(p.clan_id).first();
      await db.batch([...(await clanExit(db, p)), ...audit(db, 'player.clan-kick', p.id, { name: p.name, clan: clan?.name })]);
      boardCaches();
      return { ok: true };
    },

    // Keep the account, remove what it has recorded: scope "boards" (leaderboard entries only) or "progress" (boards, runs, Realm, rally, siege and clan credit).
    'POST admin/player/wipe': async ({ db, body }) => {
      sure(body);
      const p = await getPlayer(db, playerId(body.id));
      const scope = body.scope === 'boards' ? 'boards' : body.scope === 'progress' ? 'progress' : bad('Scope must be boards or progress.');
      const undo = body.undo !== false && scope === 'progress';
      const stmts = scope === 'boards' ? boardStatements(db, p.id) : [...(undo ? undoStatements(db, p.id) : []), ...recordStatements(db, p.id), run(db, 'DELETE FROM realm_feed WHERE player_id = ?', p.id)];
      const res = await db.batch([...stmts, ...audit(db, 'player.wipe', p.id, { name: p.name, scope, undo })]);
      boardCaches();
      return { ok: true, removed: changes(res) };
    },

    'POST admin/player/delete': async ({ db, body }) => {
      sure(body);
      const p = await getPlayer(db, playerId(body.id));
      const undo = body.undo !== false;
      const res = await db.batch([...(await deleteStatements(db, p, undo)), ...audit(db, 'player.delete', p.id, { name: p.name, undo, bestWave: p.best_wave })]);
      boardCaches();
      return { ok: true, removed: changes(res) };
    },

    // ---- objectives ----
    'GET admin/objectives': async ({ db }) => {
      const wk = weekKey(), mo = monthKey(), day = utcDateKey(), season = seasonKey();
      const yesterday = utcDateKey(new Date(Date.now() - DAY));
      const [week, month, prevWeek, prevMonth, rally, rallyPrev, siege, clans] = await Promise.all([
        periodCard(db, wk), periodCard(db, mo), periodCard(db, prevPeriodKey(wk)), periodCard(db, prevPeriodKey(mo)),
        rallyCard(db, day), db.prepare('SELECT day, goal, kills, done FROM rally WHERE day = ?').bind(yesterday).first(), currentSiege(db),
        db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(progress), 0) AS progress, COALESCE(SUM(rewarded), 0) AS rewarded FROM clan_weekly WHERE season = ?').bind(season).first(),
      ]);
      const [fighters, top] = await Promise.all([
        db.prepare('SELECT COUNT(*) AS n FROM siege_contrib WHERE siege_id = ?').bind(siege.id).first(),
        db.prepare('SELECT p.name, sc.damage FROM siege_contrib sc LEFT JOIN players p ON p.id = sc.player_id WHERE sc.siege_id = ? ORDER BY sc.damage DESC LIMIT 3').bind(siege.id).all(),
      ]);
      const ms = await mapState(db);
      return {
        map: { held: ms.held, bulwark: ms.bulwark, max: MAX_PROVINCES, floor: TERRITORY.floor, lastDay: ms.last_day, next: PROVINCES[ms.held]?.name || null },
        week, month, prev: { week: prevWeek, month: prevMonth }, rally, rallyPrev,
        siege: { id: siege.id, name: siege.name, hp: siege.hp, maxHp: siege.max_hp, defeated: !!siege.defeated, ends: siege.ends, fighters: fighters.n, top: top.results },
        clans: { season, active: clans.n, progress: clans.progress, rewarded: clans.rewarded },
      };
    },

    // Reset a Weekly Muster or Monthly Campaign: progress (the Realm's totals and everyone's share), claimed spoils, and/or its goals.
    // Lifetime totals are untouched. goals is "recalc" (work them out again from last period) or { kills, waves }.
    'POST admin/realm/reset': async ({ db, body }) => {
      sure(body);
      const key = String(body.period || '');
      if (!PERIOD_RE.test(key)) bad('Unknown campaign.');
      const wk = weekKey(), mo = monthKey();
      const known = [wk, mo, prevPeriodKey(wk), prevPeriodKey(mo)].includes(key);
      const period = known ? await ensurePeriod(db, key) : await db.prepare('SELECT * FROM realm_period WHERE period = ?').bind(key).first();
      if (!period) bad('That campaign does not exist.', 404);
      const stmts = [], did = {};
      if (body.progress) {
        stmts.push(run(db, 'UPDATE realm_period SET kills = 0, waves = 0, hero = 0 WHERE period = ?', key), run(db, 'DELETE FROM realm_contrib WHERE period = ?', key));
        did.progress = true;
      }
      if (body.claims) { stmts.push(run(db, 'DELETE FROM realm_claims WHERE period = ?', key)); did.claims = true; }
      if (body.goals === 'recalc') {
        const g = goalsFor(kindOf(key), await prevBasis(db, key));
        stmts.push(run(db, 'UPDATE realm_period SET goal_kills = ?, goal_waves = ? WHERE period = ?', g.kills, g.waves, key));
        did.goals = g;
      } else if (body.goals && typeof body.goals === 'object') {
        const g = { kills: int(body.goals.kills, 100, 1e9, 'Kill goal'), waves: int(body.goals.waves, 1, 1e8, 'Wave goal') };
        stmts.push(run(db, 'UPDATE realm_period SET goal_kills = ?, goal_waves = ? WHERE period = ?', g.kills, g.waves, key));
        did.goals = g;
      }
      if (!stmts.length) bad('Choose what to reset.');
      await db.batch([...stmts, ...audit(db, 'realm.reset', key, did)]);
      boardCaches();
      return { ok: true, period: await periodCard(db, key) };
    },

    // The Map of Aldermere: set how many provinces the Realm holds (and its Bulwark). Logged in the border chronicle too.
    'POST admin/map/set': async ({ db, body }) => {
      sure(body);
      await mapState(db);
      const held = int(body.held, TERRITORY.floor, MAX_PROVINCES, 'Provinces');
      const bulwark = body.bulwark === undefined ? 0 : int(body.bulwark, 0, TERRITORY.bulwarkMax, 'Bulwark');
      const cur = await db.prepare('SELECT held FROM realm_map WHERE id = 1').first();
      await db.batch([
        run(db, 'UPDATE realm_map SET held = ?, bulwark = ?, updated = ? WHERE id = 1', held, bulwark, now()),
        run(db, "INSERT INTO realm_map_log (at, kind, period, outcome, delta, held) VALUES (?, 'admin', ?, 'set by the Keeper', ?, ?)", now(), utcDateKey(), held - (cur?.held || held), held),
        ...audit(db, 'map.set', String(held), { held, bulwark, was: cur?.held }),
      ]);
      return { ok: true, held, bulwark };
    },

    // The Daily Rally. progress zeroes the count and re-opens it; rewards also lets people who were already paid be paid again; goal is a number or "recalc".
    'POST admin/rally/reset': async ({ db, body }) => {
      sure(body);
      const day = body.day ? String(body.day) : utcDateKey();
      if (!DAY_RE.test(day)) bad('Unknown day.');
      if (day === utcDateKey()) await ensureRally(db, day);
      const row = await db.prepare('SELECT day FROM rally WHERE day = ?').bind(day).first();
      if (!row) bad('There was no rally on that day.', 404);
      const stmts = [], did = {};
      if (body.progress) {
        stmts.push(run(db, 'UPDATE rally SET kills = 0, done = 0 WHERE day = ?', day), run(db, 'UPDATE rally_contrib SET kills = 0 WHERE day = ?', day));
        did.progress = true;
      }
      if (body.rewards) { stmts.push(run(db, 'UPDATE rally_contrib SET rewarded = 0 WHERE day = ?', day), run(db, 'UPDATE rally SET done = 0 WHERE day = ?', day)); did.rewards = true; }
      if (body.goal === 'recalc') { did.goal = await rallyGoalFor(db, day); stmts.push(run(db, 'UPDATE rally SET goal = ? WHERE day = ?', did.goal, day)); }
      else if (body.goal !== undefined && body.goal !== null && body.goal !== '') { did.goal = int(body.goal, 100, 1e9, 'Goal'); stmts.push(run(db, 'UPDATE rally SET goal = ? WHERE day = ?', did.goal, day)); }
      if (!stmts.length) bad('Choose what to reset.');
      await db.batch([...stmts, ...audit(db, 'rally.reset', day, did)]);
      boardCaches();
      return { ok: true, rally: await rallyCard(db, day) };
    },

    // The World Siege that is running now. restore = full health; clear = full health and forget who struck;
    // sethp / setmax change the numbers. Restoring a defeated boss lets it pay out its chest again when it falls.
    'POST admin/siege/update': async ({ db, body }) => {
      sure(body);
      const s = await currentSiege(db);
      let stmt, did = { action: body.action };
      if (body.action === 'restore') stmt = [run(db, 'UPDATE siege SET hp = max_hp, defeated = 0 WHERE id = ?', s.id)];
      else if (body.action === 'clear') stmt = [run(db, 'UPDATE siege SET hp = max_hp, defeated = 0 WHERE id = ?', s.id), run(db, 'DELETE FROM siege_contrib WHERE siege_id = ?', s.id)];
      else if (body.action === 'sethp') { did.hp = int(body.hp, 0, s.max_hp, 'Health'); stmt = [run(db, 'UPDATE siege SET hp = ?, defeated = 0 WHERE id = ?', did.hp, s.id)]; }
      else if (body.action === 'setmax') { did.maxHp = int(body.maxHp, 10000, 1e10, 'Maximum health'); stmt = [run(db, 'UPDATE siege SET max_hp = ?, hp = ?, defeated = 0 WHERE id = ?', did.maxHp, did.maxHp, s.id)]; }
      else bad('Unknown siege action.');
      await db.batch([...stmt, ...audit(db, 'siege.' + body.action, s.id, { name: s.name, ...did })]);
      boardCaches();
      const after = await db.prepare('SELECT hp, max_hp AS maxHp, defeated FROM siege WHERE id = ?').bind(s.id).first();
      return { ok: true, siege: { ...after, defeated: !!after.defeated } };
    },

    // Clan weekly goals (for one clan, or all of them): zero this week's progress; rewards also re-opens the chest.
    'POST admin/clans/reset-weekly': async ({ db, body }) => {
      sure(body);
      const season = body.season ? String(body.season) : seasonKey();
      if (!SEASON_RE.test(season)) bad('Unknown week.');
      const one = body.id ? (await getClan(db, body.id)).id : null;
      const only = one ? ' AND clan_id = ?' : '';
      const args = one ? [season, one] : [season];
      const stmts = [run(db, `UPDATE clan_weekly SET progress = 0${body.rewards ? ', rewarded = 0' : ''} WHERE season = ?${only}`, ...args), run(db, `UPDATE clan_contrib SET kills = 0 WHERE season = ?${only}`, ...args)];
      const res = await db.batch([...stmts, ...audit(db, 'clans.reset-weekly', one || 'all', { season, rewards: !!body.rewards })]);
      boardCaches();
      return { ok: true, clans: changes(res[0]) };
    },

    // ---- leaderboards ----
    'GET admin/boards': async ({ db, url }) => {
      const board = BOARDS.includes(url.searchParams.get('board')) ? url.searchParams.get('board') : 'wave';
      let period = String(url.searchParams.get('period') || '');
      if (period !== 'all' && !SEASON_RE.test(period) && !/^daily-\d{4}-\d{2}-\d{2}$/.test(period)) period = board === 'daily' ? 'daily-' + utcDateKey() : seasonKey();
      const [periods, rows] = await Promise.all([
        db.prepare('SELECT period, COUNT(*) AS n FROM bests WHERE board = ? GROUP BY period ORDER BY period DESC LIMIT 24').bind(board).all(),
        db.prepare('SELECT b.player_id AS id, b.value, b.updated, p.name, p.hidden FROM bests b LEFT JOIN players p ON p.id = b.player_id WHERE b.board = ? AND b.period = ? ORDER BY b.value DESC, b.updated ASC LIMIT 50').bind(board, period).all(),
      ]);
      return { board, period, periods: periods.results, rows: rows.results.map((r, i) => ({ ...r, rank: i + 1 })) };
    },

    // board "*" means every board, period "*" every period. Wiping the all-time wave board (or everything) also zeroes players' stored best wave.
    'POST admin/board/reset': async ({ db, body }) => {
      sure(body);
      const board = body.board === '*' ? '*' : BOARDS.includes(body.board) ? body.board : bad('Unknown board.');
      const period = String(body.period || '');
      if (period !== '*' && period !== 'all' && !SEASON_RE.test(period) && !/^daily-\d{4}-\d{2}-\d{2}$/.test(period)) bad('Unknown period.');
      const where = [], args = [];
      if (board !== '*') { where.push('board = ?'); args.push(board); }
      if (period !== '*') { where.push('period = ?'); args.push(period); }
      const stmts = [run(db, `DELETE FROM bests${where.length ? ' WHERE ' + where.join(' AND ') : ''}`, ...args)];
      const zeroBest = (period === '*' || period === 'all') && (board === '*' || board === 'wave');
      if (zeroBest) stmts.push(run(db, 'UPDATE players SET best_wave = 0'));
      const res = await db.batch([...stmts, ...audit(db, 'board.reset', `${board}/${period}`, { zeroBest })]);
      boardCaches();
      return { ok: true, removed: changes(res[0]) };
    },

    // One entry (board + period) or, with neither, all of one player's entries.
    'POST admin/board/remove': async ({ db, body }) => {
      const p = await getPlayer(db, playerId(body.id));
      const one = body.board !== undefined;
      let stmt;
      if (one) {
        if (!BOARDS.includes(body.board)) bad('Unknown board.');
        stmt = run(db, 'DELETE FROM bests WHERE player_id = ? AND board = ? AND period = ?', p.id, body.board, String(body.period || ''));
      } else { sure(body); stmt = run(db, 'DELETE FROM bests WHERE player_id = ?', p.id); }
      const [res] = await db.batch([stmt, ...audit(db, 'board.remove', p.id, { name: p.name, board: body.board, period: body.period })]);
      boardCaches();
      return { ok: true, removed: changes(res) };
    },

    // ---- stats ----
    'GET admin/db': async ({ db }) => {
      const rows = (await db.prepare(TABLES.map((t) => `SELECT '${t}' AS t, COUNT(*) AS n FROM ${t}`).join(' UNION ALL ')).all()).results;
      return { tables: rows.map((r) => ({ table: r.t, rows: r.n })) };
    },

    // what: world (period "*", "all" or a week), lifetime (the all-time Realm totals), runs (all, or olderThanDays), fresh (every game statistic; accounts, clans, friends and inboxes stay).
    'POST admin/stats/reset': async ({ db, body }) => {
      sure(body);
      const what = String(body.what || ''), did = { what };
      let stmts;
      if (what === 'world') {
        const period = String(body.period || '*');
        if (period !== '*' && period !== 'all' && !SEASON_RE.test(period)) bad('Unknown period.');
        did.period = period;
        stmts = period === '*' ? [run(db, "DELETE FROM world_stats WHERE period != '_'"), run(db, 'DELETE FROM run_usage')] : [run(db, 'DELETE FROM world_stats WHERE period = ?', period)];
      } else if (what === 'lifetime') {
        stmts = [run(db, "DELETE FROM realm_contrib WHERE period = 'all'")];
      } else if (what === 'runs') {
        const days = int(body.olderThanDays ?? 0, 0, 3650, 'Days');
        did.olderThanDays = days;
        stmts = [days ? run(db, 'DELETE FROM runs WHERE created < ?', now() - days * DAY) : run(db, 'DELETE FROM runs')];
      } else if (what === 'fresh') {
        stmts = FRESH_START.map((sql) => run(db, sql));
      } else bad('Unknown statistic.');
      const res = await db.batch([...stmts, ...audit(db, 'stats.reset', what, did)]);
      boardCaches();
      return { ok: true, removed: changes(res.slice(0, stmts.length)) };
    },

    // ---- clans ----
    'GET admin/clans': async ({ db, url }) => {
      const q = text(url.searchParams.get('q'), 24), pat = `%${likeEsc(q)}%`;
      const rows = (await db.prepare("SELECT c.id, c.name, c.tag, c.code, c.xp, c.treasury, c.created, c.leader, (SELECT COUNT(*) FROM players p WHERE p.clan_id = c.id) AS members, (SELECT name FROM players WHERE id = c.leader) AS leaderName FROM clans c WHERE c.name LIKE ? ESCAPE '\\' OR c.tag LIKE ? ESCAPE '\\' OR c.code = ? ORDER BY c.xp DESC, c.created DESC LIMIT 60").bind(pat, pat, q.toUpperCase()).all()).results;
      return { rows };
    },

    'GET admin/clan': async ({ db, url }) => {
      const c = await getClan(db, url.searchParams.get('id'));
      const season = seasonKey();
      const [members, weekly] = await Promise.all([
        db.prepare('SELECT p.id, p.name, p.best_wave AS bestWave, p.last_seen AS lastSeen, COALESCE(cc.kills, 0) AS weekKills FROM players p LEFT JOIN clan_contrib cc ON cc.player_id = p.id AND cc.clan_id = p.clan_id AND cc.season = ? WHERE p.clan_id = ? ORDER BY p.created ASC').bind(season, c.id).all(),
        db.prepare('SELECT progress, rewarded FROM clan_weekly WHERE clan_id = ? AND season = ?').bind(c.id, season).first(),
      ]);
      return { clan: { id: c.id, name: c.name, tag: c.tag, code: c.code, xp: c.xp, treasury: c.treasury, leader: c.leader, created: c.created }, members: members.results.map((m) => ({ ...m, leader: m.id === c.leader })), weekly: { season, progress: weekly?.progress || 0, rewarded: !!weekly?.rewarded } };
    },

    'POST admin/clan/update': async ({ db, body }) => {
      const c = await getClan(db, body.id);
      const sets = [], args = [], did = {};
      if (body.name !== undefined) { did.name = text(body.name, 24); if (did.name.length < 3) bad('Clan names need at least 3 characters.'); sets.push('name = ?'); args.push(did.name); }
      if (body.tag !== undefined) { did.tag = String(body.tag).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); if (did.tag.length < 2) bad('Tags need 2 to 4 letters or numbers.'); sets.push('tag = ?'); args.push(did.tag); }
      if (body.xp !== undefined) { did.xp = int(body.xp, 0, 1e9, 'Clan XP'); sets.push('xp = ?'); args.push(did.xp); }
      if (body.treasury !== undefined) { did.treasury = int(body.treasury, 0, 1e9, 'Treasury'); sets.push('treasury = ?'); args.push(did.treasury); }
      if (body.leader !== undefined) {
        did.leader = playerId(body.leader);
        if (!(await db.prepare('SELECT 1 FROM players WHERE id = ? AND clan_id = ?').bind(did.leader, c.id).first())) bad('The new leader must be a member of the clan.');
        sets.push('leader = ?'); args.push(did.leader);
      }
      if (!sets.length) bad('Nothing to change.');
      await db.batch([run(db, `UPDATE clans SET ${sets.join(', ')} WHERE id = ?`, ...args, c.id), ...audit(db, 'clan.update', c.id, { was: c.name, ...did })]);
      boardCaches();
      return { ok: true };
    },

    // Members are told, then released. The clan and its weekly records are removed.
    'POST admin/clan/disband': async ({ db, body }) => {
      sure(body);
      const c = await getClan(db, body.id);
      const [, res] = await db.batch([
        run(db, "INSERT INTO inbox (player_id, kind, title, body, payload, created, claimed) SELECT id, 'note', ?, ?, '{}', ?, 0 FROM players WHERE clan_id = ?", `${c.name} has been disbanded`, 'Your clan was closed by the game keeper. You are free to join or found another.', now(), c.id),
        run(db, 'UPDATE players SET clan_id = NULL WHERE clan_id = ?', c.id),
        run(db, 'DELETE FROM clans WHERE id = ?', c.id), run(db, 'DELETE FROM clan_weekly WHERE clan_id = ?', c.id), run(db, 'DELETE FROM clan_contrib WHERE clan_id = ?', c.id),
        ...audit(db, 'clan.disband', c.id, { name: c.name, tag: c.tag }),
      ]);
      boardCaches();
      return { ok: true, released: changes(res) };
    },

    // ---- feed and messages ----
    'GET admin/feed': async ({ db }) => {
      const rows = (await db.prepare('SELECT f.id, f.created, f.player_id AS pid, f.kind, f.text, f.cheers, p.name FROM realm_feed f LEFT JOIN players p ON p.id = f.player_id ORDER BY f.id DESC LIMIT 100').all()).results;
      return { rows };
    },

    'POST admin/feed/delete': async ({ db, body }) => {
      const id = int(body.id, 1, 1e12, 'Id');
      const res = await db.batch([run(db, 'DELETE FROM feed_cheers WHERE feed_id = ?', id), run(db, 'DELETE FROM realm_feed WHERE id = ?', id), ...audit(db, 'feed.delete', id, null)]);
      boardCaches();
      return { ok: true, removed: changes(res[1]) };
    },

    'POST admin/feed/clear': async ({ db, body }) => {
      sure(body);
      const res = await db.batch([run(db, 'DELETE FROM feed_cheers'), run(db, 'DELETE FROM realm_feed'), ...audit(db, 'feed.clear', null, null)]);
      boardCaches();
      return { ok: true, removed: changes(res[1]) };
    },

    // A note (and optional Renown) to many players at once. dryRun just counts who would get it.
    // audience: all (everyone not suspended), week (seen in the last 7 days), day (last 24 hours).
    'POST admin/broadcast': async ({ db, body }) => {
      const audience = { all: 0, week: 7 * DAY, day: DAY }[body.audience ?? 'all'];
      if (audience === undefined) bad('Audience must be all, week or day.');
      const since = audience ? now() - audience : 0;
      const n = (await db.prepare('SELECT COUNT(*) AS n FROM players WHERE hidden != 2 AND last_seen > ?').bind(since).first()).n;
      if (body.dryRun) return { ok: true, dryRun: true, recipients: n };
      sure(body);
      const title = text(body.title, 60), note = text(body.body, 300), renown = int(body.renown ?? 0, 0, 500, 'Renown');
      if (title.length < 2) bad('Give the message a title.');
      if (!n) bad('Nobody matches that audience.');
      const [res] = await db.batch([
        run(db, 'INSERT INTO inbox (player_id, kind, title, body, payload, created, claimed) SELECT id, ?, ?, ?, ?, ?, 0 FROM players WHERE hidden != 2 AND last_seen > ?', renown > 0 ? 'renown' : 'note', title, note, JSON.stringify(renown > 0 ? { renown } : {}), now(), since),
        ...audit(db, 'broadcast', body.audience ?? 'all', { title, renown, recipients: n }),
      ]);
      return { ok: true, recipients: changes(res) };
    },

    // ---- upkeep ----
    // rate: expired limiter rows. inbox: claimed messages older than `days` (30). unlock: forget admin lockouts.
    // inactive: remove accounts unseen for `days` (60+) that never finished a run (noRuns false: all of them). 25 per call; dryRun counts them.
    'POST admin/maintenance': async ({ db, body }) => {
      const task = String(body.task || '');
      if (task === 'rate') {
        const [res] = await db.batch([run(db, 'DELETE FROM rate WHERE reset < ?', now()), ...audit(db, 'maintenance.rate', null, null)]);
        return { ok: true, removed: changes(res) };
      }
      if (task === 'inbox') {
        const days = int(body.days ?? 30, 7, 3650, 'Days');
        const [res] = await db.batch([run(db, 'DELETE FROM inbox WHERE claimed = 1 AND created < ?', now() - days * DAY), ...audit(db, 'maintenance.inbox', null, { days })]);
        return { ok: true, removed: changes(res) };
      }
      if (task === 'unlock') {
        const [res] = await db.batch([run(db, "DELETE FROM rate WHERE key LIKE 'admfail:%'"), ...audit(db, 'maintenance.unlock', null, null)]);
        return { ok: true, removed: changes(res) };
      }
      if (task === 'inactive') {
        const days = int(body.days ?? 90, 14, 3650, 'Days'), noRuns = body.noRuns !== false;
        const cond = `last_seen < ? AND hidden != 2${noRuns ? ' AND NOT EXISTS (SELECT 1 FROM runs r WHERE r.player_id = players.id)' : ''}`;
        const cutoff = now() - days * DAY;
        const matched = (await db.prepare(`SELECT COUNT(*) AS n FROM players WHERE ${cond}`).bind(cutoff).first()).n;
        if (body.dryRun) {
          const sample = (await db.prepare(`SELECT name, best_wave AS bestWave, last_seen AS lastSeen FROM players WHERE ${cond} ORDER BY last_seen ASC LIMIT 8`).bind(cutoff).all()).results;
          return { ok: true, dryRun: true, matched, sample };
        }
        sure(body);
        const batch = (await db.prepare(`SELECT * FROM players WHERE ${cond} ORDER BY last_seen ASC LIMIT 25`).bind(cutoff).all()).results;
        let deleted = 0;
        for (const p of batch) { await db.batch(await deleteStatements(db, p, true)); deleted++; }
        await db.batch(audit(db, 'maintenance.inactive', null, { days, noRuns, deleted }));
        boardCaches();
        return { ok: true, deleted, remaining: Math.max(0, matched - deleted) };
      }
      return bad('Unknown task.');
    },

    'GET admin/audit': async ({ db, url }) => {
      const limit = Math.max(1, Math.min(200, url.searchParams.get('limit') | 0 || 50)), offset = Math.max(0, Math.min(5000, url.searchParams.get('offset') | 0));
      const [rows, total] = await Promise.all([
        db.prepare('SELECT id, at, action, target, detail FROM admin_log ORDER BY id DESC LIMIT ? OFFSET ?').bind(limit, offset).all(),
        db.prepare('SELECT COUNT(*) AS n FROM admin_log').first(),
      ]);
      return { rows: rows.results.map((r) => ({ ...r, detail: parseDetail(r.detail) })), total: total.n };
    },
  };

  return { enabled, gate, routes };
}
