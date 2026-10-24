// Bastion Siege API — Cloudflare Pages Function. One router for /api/*.
// Binding: DB (D1). Without it the game still runs fully offline and the API answers 503.
import { validateRun, dailySetup, cleanStart } from '../../src/game/rules.js';
import { rankFor } from '../../src/game/economy.js';
import { seasonKey, prevSeasonKey, realmDay, shiftDay, realmDayEnd, weekKey, monthKey, prevPeriodKey, periodBounds } from '../../src/core/rng.js';
import { GIFTS, GIFT_DAILY_CAP, SALUTES, SALUTE_DAILY_CAP, MOTTOS, CLAN_LEVELS, SIEGE, MODIFIERS, REALM, RALLY } from '../../src/data/balance.js';
import { rallyMult } from '../../src/meta/campaign.js';
import { goalsFor, goalBasis, fraction, tiersReached, rewardFor, kindOf, blessing, rallyGoal, blendBasis } from '../../src/game/realm.js';
import { TERRITORY, PROVINCES, MAX_PROVINCES, applyDelta, deltaFor, outcomeName, clampHeld, frontier } from '../../src/game/realmmap.js';
import { cleanUsage, foldUsage, emptyWorld, WORLD_CATS } from '../../src/game/worldstats.js';
import { makeAdmin } from '../../server/admin.js';
import { isLocalMode, SIEGE as DAILY_SIEGE, SIEGE_MAX } from '../../src/game/modes.js';
import { isNewMode, lastStandWaves, sprintBoardValue, weeklySetup, cleanSprintLevel, sprintBoardId, SPRINT_BOARDS } from '../../src/game/modes.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, recovery_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, friend_code TEXT UNIQUE NOT NULL, title TEXT, clan_id TEXT, best_wave INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, last_seen INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS players_clan ON players(clan_id);
CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, created INTEGER NOT NULL, season TEXT NOT NULL, map TEXT, mode TEXT, seed TEXT, modifiers TEXT, ascension INTEGER, wave INTEGER, score INTEGER, kills INTEGER, hero_kills INTEGER, duration INTEGER);
CREATE INDEX IF NOT EXISTS runs_player ON runs(player_id, created);
CREATE TABLE IF NOT EXISTS bests (player_id TEXT NOT NULL, board TEXT NOT NULL, period TEXT NOT NULL, value INTEGER NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (player_id, board, period));
CREATE INDEX IF NOT EXISTS bests_board ON bests(board, period, value DESC);
CREATE TABLE IF NOT EXISTS friends (a TEXT NOT NULL, b TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (a, b));
CREATE TABLE IF NOT EXISTS inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT, payload TEXT, created INTEGER NOT NULL, claimed INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS inbox_player ON inbox(player_id, claimed, created);
CREATE TABLE IF NOT EXISTS clans (id TEXT PRIMARY KEY, name TEXT NOT NULL, tag TEXT NOT NULL, code TEXT UNIQUE NOT NULL, leader TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0, treasury INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS clan_weekly (clan_id TEXT NOT NULL, season TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, rewarded INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (clan_id, season));
CREATE TABLE IF NOT EXISTS clan_contrib (clan_id TEXT NOT NULL, season TEXT NOT NULL, player_id TEXT NOT NULL, kills INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (clan_id, season, player_id));
CREATE TABLE IF NOT EXISTS siege (id TEXT PRIMARY KEY, name TEXT NOT NULL, max_hp INTEGER NOT NULL, hp INTEGER NOT NULL, starts INTEGER NOT NULL, ends INTEGER NOT NULL, defeated INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS siege_contrib (siege_id TEXT NOT NULL, player_id TEXT NOT NULL, damage INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (siege_id, player_id));
CREATE TABLE IF NOT EXISTS reports (reporter TEXT NOT NULL, target TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (reporter, target));
CREATE TABLE IF NOT EXISTS blocks (player_id TEXT NOT NULL, blocked TEXT NOT NULL, PRIMARY KEY (player_id, blocked));
CREATE TABLE IF NOT EXISTS rate (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS season_claims (player_id TEXT NOT NULL, season TEXT NOT NULL, PRIMARY KEY (player_id, season));
CREATE TABLE IF NOT EXISTS realm_period (period TEXT PRIMARY KEY, kind TEXT NOT NULL, goal_kills INTEGER NOT NULL, goal_waves INTEGER NOT NULL, kills INTEGER NOT NULL DEFAULT 0, waves INTEGER NOT NULL DEFAULT 0, hero INTEGER NOT NULL DEFAULT 0, starts INTEGER NOT NULL, ends INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS realm_contrib (period TEXT NOT NULL, player_id TEXT NOT NULL, kills INTEGER NOT NULL DEFAULT 0, waves INTEGER NOT NULL DEFAULT 0, hero INTEGER NOT NULL DEFAULT 0, runs INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (period, player_id));
CREATE INDEX IF NOT EXISTS realm_contrib_kills ON realm_contrib(period, kills DESC);
CREATE TABLE IF NOT EXISTS realm_claims (player_id TEXT NOT NULL, period TEXT NOT NULL, tier INTEGER NOT NULL, PRIMARY KEY (player_id, period, tier));
CREATE TABLE IF NOT EXISTS rally (day TEXT PRIMARY KEY, goal INTEGER NOT NULL, kills INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS rally_contrib (day TEXT NOT NULL, player_id TEXT NOT NULL, kills INTEGER NOT NULL DEFAULT 0, rewarded INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, player_id));
CREATE TABLE IF NOT EXISTS realm_feed (id INTEGER PRIMARY KEY AUTOINCREMENT, created INTEGER NOT NULL, player_id TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, cheers INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS realm_feed_created ON realm_feed(created DESC);
CREATE TABLE IF NOT EXISTS friend_requests (from_id TEXT NOT NULL, to_id TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (from_id, to_id));
CREATE TABLE IF NOT EXISTS showcase (player_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS feed_cheers (feed_id INTEGER NOT NULL, player_id TEXT NOT NULL, PRIMARY KEY (feed_id, player_id));
CREATE TABLE IF NOT EXISTS run_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, season TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS world_stats (period TEXT NOT NULL, cat TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (period, cat));
CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, action TEXT NOT NULL, target TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS realm_map (id INTEGER PRIMARY KEY, held INTEGER NOT NULL, bulwark INTEGER NOT NULL DEFAULT 0, last_day TEXT NOT NULL, last_week TEXT NOT NULL, last_month TEXT NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS realm_map_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, kind TEXT NOT NULL, period TEXT NOT NULL, outcome TEXT NOT NULL, delta INTEGER NOT NULL, held INTEGER NOT NULL);
`;

let schemaReady = null;
const memCache = new Map(); // per-isolate cache: key -> {t, v}
const MAX_CLAN = 30;
const MAX_FRIENDS = 100;
const ONLINE_MS = 5 * 60 * 1000;

async function makeFriends(db, me, f) {
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO friends (a, b, created) VALUES (?, ?, ?)').bind(me.id, f.id, now()),
    db.prepare('INSERT OR IGNORE INTO friends (a, b, created) VALUES (?, ?, ?)').bind(f.id, me.id, now()),
    db.prepare('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)').bind(me.id, f.id, f.id, me.id),
    db.prepare("INSERT INTO inbox (player_id, kind, title, body, payload, created, claimed) VALUES (?, 'note', ?, ?, '{}', ?, 1)").bind(f.id, `${me.name} is now your friend`, 'You can now send each other aid and salutes.', now()),
  ]);
}

// ---------------- helpers ----------------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const bad = (msg, status = 400) => { throw new HttpError(status, msg); };
const now = () => Date.now();

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randHex(bytes) { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); }
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randCode(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join(''); }

// Name filter. Unambiguous stems match inside words; short or ambiguous words only match whole words
// (so "Night Watch", "Peacock" and "Scunthorpe" are fine). Leetspeak is normalised first.
const STEMS = ['nigg', 'faggot', 'kike', 'retard', 'tranny', 'nazi', 'hitler', 'cunt', 'fuck', 'shit', 'whore', 'slut', 'penis', 'vagina', 'porn', 'dildo', 'jizz', 'wank', 'bitch', 'asshole', 'molest', 'pedophil', 'rapist'];
const WORDS = ['fag', 'fags', 'spic', 'chink', 'rape', 'cock', 'dick', 'ass', 'sex', 'cum', 'tit', 'tits', 'twat', 'pussy', 'pedo', 'kkk', 'piss', 'crap', 'nazis'];
const SPACED = ['nigg', 'fuck', 'cunt'];   // also caught when spelled with gaps, like "f u c k"
function normalize(s) { return s.toLowerCase().replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a').replace(/[5$]/g, 's').replace(/7/g, 't').replace(/8/g, 'b'); }
function isClean(s) {
  const n = normalize(s);
  const words = n.split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => STEMS.some((st) => w.includes(st)) || WORDS.includes(w))) return false;
  const singles = words.filter((w) => w.length === 1).join('');
  return !SPACED.some((st) => singles.includes(st));
}
function cleanName(raw, fallback = 'Commander') {
  let s = String(raw || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  if (s.length < 2 || !isClean(s)) s = `${fallback} ${Math.floor(1000 + Math.random() * 9000)}`;
  return s;
}

async function rateLimit(db, key, max, windowSec) {
  const t = now();
  const row = await db.prepare('SELECT count, reset FROM rate WHERE key = ?').bind(key).first();
  if (!row || row.reset < t) {
    await db.prepare('INSERT INTO rate (key, count, reset) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset = excluded.reset').bind(key, t + windowSec * 1000).run();
    return max - 1;
  }
  if (row.count >= max) return -1;
  await db.prepare('UPDATE rate SET count = count + 1 WHERE key = ?').bind(key).run();
  return max - row.count - 1;
}
async function rateLeft(db, key, max) {
  const row = await db.prepare('SELECT count, reset FROM rate WHERE key = ?').bind(key).first();
  if (!row || row.reset < now()) return max;
  return Math.max(0, max - row.count);
}

// Per-isolate cache for hot reads (leaderboards). KV is deliberately not used: its free tier allows only 1,000 writes a day.
async function cached(key, ttlSec, fn) {
  const m = memCache.get(key);
  if (m && now() - m.t < ttlSec * 1000) return m.v;
  const v = await fn();
  memCache.set(key, { t: now(), v });
  if (memCache.size > 200) memCache.delete(memCache.keys().next().value);
  return v;
}

async function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = (async () => {
      // A cold start usually finds everything in place; one cheap probe beats re-running ~30 DDL statements.
      const have = await db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('realm_claims', 'realm_contrib', 'realm_period', 'realm_contrib_kills', 'rally', 'rally_contrib', 'realm_feed', 'feed_cheers', 'friend_requests', 'showcase', 'run_usage', 'world_stats', 'admin_log', 'realm_map', 'realm_map_log')").first();
      if (have && have.n >= 15) return;
      const stmts = SCHEMA.split(';').map((s) => s.trim()).filter(Boolean).map((s) => db.prepare(s));
      await db.batch(stmts);
    })().catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > 8000) bad('Payload too large', 413);
  try { return text ? JSON.parse(text) : {}; } catch { bad('Invalid JSON'); }
}

async function auth(request, db) {
  const h = request.headers.get('authorization') || '';
  const m = h.match(/^Bearer ([a-f0-9]{64})$/);
  if (!m) bad('Sign in required', 401);
  const hash = await sha256(m[1]);
  const p = await db.prepare('SELECT * FROM players WHERE token_hash = ?').bind(hash).first();
  if (!p) bad('Unknown account', 401);
  if (p.hidden === 2) bad('This account has been suspended.', 403);   // set from the admin panel; hidden = 1 only hides you from boards
  if (now() - p.last_seen > 60000) await db.prepare('UPDATE players SET last_seen = ? WHERE id = ?').bind(now(), p.id).run();
  return p;
}

const clanLevel = (xp) => { let lv = 0; CLAN_LEVELS.forEach((l, i) => { if (xp >= l.xp) lv = i; }); return lv; };
const clanGoal = (members) => 15000 * Math.max(1, members);

// ---------------- siege ----------------
async function currentSiege(db) {
  const t = now();
  const period = Math.floor(t / (SIEGE.durationDays * 86400000));
  const id = 'siege-' + period;
  let s = await db.prepare('SELECT * FROM siege WHERE id = ?').bind(id).first();
  if (!s) {
    const name = SIEGE.bosses[period % SIEGE.bosses.length];
    // Scale HP to last siege's turnout and the damage it took, so small groups can still win and big ones are tested.
    const prevId = 'siege-' + (period - 1);
    const [prev, last] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS n FROM siege_contrib WHERE siege_id = ?').bind(prevId).first(),
      db.prepare('SELECT max_hp, hp FROM siege WHERE id = ?').bind(prevId).first(),
    ]);
    // A boss that fell had defenders to spare, so its successor is a bit tougher than the damage it took.
    const dealt = !last ? 0 : last.hp <= 0 ? last.max_hp * 1.35 : last.max_hp - last.hp;
    const want = Math.max(300000, (prev?.n || 0) * 60000, Math.round(dealt * 0.9));
    const maxHp = last ? Math.min(want, Math.max(300000, last.max_hp * REALM.maxRise)) : want;
    const starts = period * SIEGE.durationDays * 86400000;
    await db.prepare('INSERT OR IGNORE INTO siege (id, name, max_hp, hp, starts, ends) VALUES (?, ?, ?, ?, ?, ?)').bind(id, name, maxHp, maxHp, starts, starts + SIEGE.durationDays * 86400000).run();
    s = await db.prepare('SELECT * FROM siege WHERE id = ?').bind(id).first();
  }
  return s;
}

// ---------------- realm ----------------
const ZERO = { kills: 0, waves: 0, hero: 0, runs: 0 };
async function ensurePeriod(db, key) {
  const get = () => db.prepare('SELECT * FROM realm_period WHERE period = ?').bind(key).first();
  let p = await get();
  if (p) return p;
  const kind = kindOf(key);
  const g = goalsFor(kind, await prevBasis(db, key)), { start, end } = periodBounds(key);
  await db.prepare('INSERT OR IGNORE INTO realm_period (period, kind, goal_kills, goal_waves, starts, ends) VALUES (?, ?, ?, ?, ?, ?)').bind(key, kind, g.kills, g.waves, start, end).run();
  return get();
}
const periodFraction = (p) => fraction(p.kills, p.waves, { kills: p.goal_kills, waves: p.goal_waves });

// What the previous period looked like: who answered (turnout), what they did (output), and its goal.
// Read from realm_contrib so it is right even if nobody opened the Realm screen last period.
async function prevBasis(db, key) {
  const c = REALM[kindOf(key)];
  const keys = []; for (let k = prevPeriodKey(key); keys.length < 3; k = prevPeriodKey(k)) keys.push(k);
  const rows = await Promise.all(keys.map(async (pk) => {
    const [act, sum, row] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS n FROM realm_contrib WHERE period = ? AND kills >= ?').bind(pk, c.minKills).first(),
      db.prepare('SELECT COALESCE(SUM(kills), 0) AS kills, COALESCE(SUM(waves), 0) AS waves FROM realm_contrib WHERE period = ?').bind(pk).first(),
      db.prepare('SELECT goal_kills FROM realm_period WHERE period = ?').bind(pk).first(),
    ]);
    return { active: act.n, kills: sum.kills, waves: sum.waves, goal: row?.goal_kills || 0 };
  }));
  return blendBasis(rows);
}

async function periodView(db, key, me) {
  const p = await ensurePeriod(db, key);
  const kind = p.kind, cfg = REALM[kind];
  const f = periodFraction(p), reached = tiersReached(f);
  // Independent lookups run together: every D1 round trip counts on a phone connection.
  const [mineRow, claimedRows, citizensRow] = await Promise.all([
    db.prepare('SELECT kills, waves, hero, runs FROM realm_contrib WHERE period = ? AND player_id = ?').bind(key, me.id).first(),
    db.prepare('SELECT tier FROM realm_claims WHERE player_id = ? AND period = ? AND tier < 50').bind(me.id, key).all(),
    db.prepare('SELECT COUNT(*) AS n FROM realm_contrib WHERE period = ? AND kills >= ?').bind(key, cfg.minKills).first(),
  ]);
  const mine = mineRow || ZERO;
  const claimed = new Set(claimedRows.results.map((r) => r.tier));
  const eligible = mine.kills >= cfg.minKills;
  const tiers = REALM.tiers.map((at, i) => ({ at, name: REALM.tierNames[i], renown: rewardFor(kind, i), perk: cfg.perkText[i], reached: i < reached, claimed: claimed.has(i) }));
  const citizens = citizensRow.n;
  return {
    key, kind, label: cfg.label, startsAt: p.starts, endsAt: p.ends, goal: { kills: p.goal_kills, waves: p.goal_waves },
    kills: p.kills, waves: p.waves, hero: p.hero, fraction: f, reached, tiers, citizens,
    mine: { ...mine, share: p.kills ? mine.kills / p.kills : 0 }, eligible, minKills: cfg.minKills,
    claimable: eligible ? tiers.filter((t) => t.reached && !t.claimed).reduce((a, t) => a + t.renown, 0) : 0,
  };
}

// Capped Realm credit for a batch of kills/waves/hero kills. Returns the statements to run and what each period received.
async function realmCredit(db, me, eff, { runs = 1, mode = 'normal', standard = 0 } = {}) {
  const wk = weekKey(), mo = monthKey();
  const credit = async (key, kind) => {
    const cur = await db.prepare('SELECT kills FROM realm_contrib WHERE period = ? AND player_id = ?').bind(key, me.id).first();
    const kills = Math.max(0, Math.min(eff.kills, REALM[kind].cap - (cur?.kills || 0)));
    const share = eff.kills ? kills / eff.kills : 0;
    return { kills, waves: Math.round(eff.waves * share), hero: Math.round(eff.hero * share) };
  };
  const [cw, cm] = [await credit(wk, 'week'), await credit(mo, 'month')];
  const day = realmDay();
  const rcur = await db.prepare('SELECT kills FROM rally_contrib WHERE day = ? AND player_id = ?').bind(day, me.id).first();
  // Kills in a March on the frontier count extra toward the Daily Rally (still under the per-citizen cap).
  const rallyKills = Math.round(eff.kills * (mode === 'march' ? TERRITORY.marchRally : 1) * rallyMult(standard));   // Warbanner (Realm Works): still under the per-citizen cap
  const rk = Math.max(0, Math.min(rallyKills, RALLY.cap - (rcur?.kills || 0)));
  const contribUp = (period, c) => db.prepare('INSERT INTO realm_contrib (period, player_id, kills, waves, hero, runs) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(period, player_id) DO UPDATE SET kills = kills + excluded.kills, waves = waves + excluded.waves, hero = hero + excluded.hero, runs = runs + excluded.runs').bind(period, me.id, c.kills, c.waves, c.hero, runs);
  const totalUp = (period, c) => db.prepare('UPDATE realm_period SET kills = kills + ?, waves = waves + ?, hero = hero + ? WHERE period = ?').bind(c.kills, c.waves, c.hero, period);
  const rallyStmts = rk ? [
    db.prepare('INSERT INTO rally_contrib (day, player_id, kills) VALUES (?, ?, ?) ON CONFLICT(day, player_id) DO UPDATE SET kills = kills + excluded.kills').bind(day, me.id, rk),
    db.prepare('UPDATE rally SET kills = kills + ? WHERE day = ?').bind(rk, day),
  ] : [];
  return { cw, cm, stmts: [contribUp(wk, cw), contribUp(mo, cm), contribUp('all', eff), totalUp(wk, cw), totalUp(mo, cm), ...rallyStmts] };
}


// ---------------- daily rally ----------------
async function ensureRally(db, day = realmDay()) {
  const get = () => db.prepare('SELECT * FROM rally WHERE day = ?').bind(day).first();
  let r = await get();
  if (r) return r;
  const days = [1, 2, 3].map((n) => shiftDay(day, -n));
  const rows = await Promise.all(days.map(async (d) => {
    const [act, sum, row] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS n FROM rally_contrib WHERE day = ? AND kills >= ?').bind(d, RALLY.minKills).first(),
      db.prepare('SELECT COALESCE(SUM(kills), 0) AS kills FROM rally_contrib WHERE day = ?').bind(d).first(),
      db.prepare('SELECT goal FROM rally WHERE day = ?').bind(d).first(),
    ]);
    return { active: act.n, kills: sum.kills, goal: row?.goal || 0 };
  }));
  await db.prepare('INSERT OR IGNORE INTO rally (day, goal) VALUES (?, ?)').bind(day, rallyGoal(blendBasis(rows))).run();
  return get();
}

// When the Realm hits the day's goal, every contributor gets spoils once (later contributors get theirs when they qualify).
async function rallyCheck(db, me, day = realmDay()) {
  const r = await ensureRally(db, day);
  const t = now();
  let justDone = false;
  if (r.kills >= r.goal && !r.done) {
    const flip = await db.prepare('UPDATE rally SET done = 1 WHERE day = ? AND done = 0').bind(day).run();
    justDone = !!flip.meta?.changes;
  }
  if (r.kills >= r.goal) {
    const mine = await db.prepare('SELECT kills, rewarded FROM rally_contrib WHERE day = ? AND player_id = ?').bind(day, me.id).first();
    const rows = justDone
      ? (await db.prepare('SELECT player_id FROM rally_contrib WHERE day = ? AND kills >= ? AND rewarded = 0').bind(day, RALLY.minKills).all()).results.map((x) => x.player_id)
      : mine && mine.kills >= RALLY.minKills && !mine.rewarded ? [me.id] : [];
    for (const pid of rows) {
      const res = await db.prepare('UPDATE rally_contrib SET rewarded = 1 WHERE day = ? AND player_id = ? AND rewarded = 0').bind(day, pid).run();
      if (res.meta?.changes) await db.prepare("INSERT INTO inbox (player_id, kind, title, body, payload, created) VALUES (?, 'renown', 'Daily Rally won!', 'The whole Realm answered the call today. Here are your spoils.', ?, ?)").bind(pid, JSON.stringify({ renown: RALLY.renown }), t).run();
    }
  }
  return justDone;
}

async function rallyView(db, me, day = realmDay()) {
  const r = await ensureRally(db, day);
  const [mine, fighters] = await Promise.all([
    db.prepare('SELECT kills, rewarded FROM rally_contrib WHERE day = ? AND player_id = ?').bind(day, me.id).first(),
    db.prepare('SELECT COUNT(*) AS n FROM rally_contrib WHERE day = ? AND kills >= ?').bind(day, RALLY.minKills).first(),
  ]);
  return { day, goal: r.goal, kills: r.kills, done: !!r.done || r.kills >= r.goal, fighters: fighters.n, minKills: RALLY.minKills, renown: RALLY.renown, cap: RALLY.cap, mine: { kills: mine?.kills || 0, rewarded: !!mine?.rewarded }, endsAt: realmDayEnd(day) };
}

// ---------------- the Map of Aldermere (territory) ----------------
// One row holds how many provinces the Realm controls. Each closed task moves the border (see src/game/realmmap.js);
// resolution is lazy: whoever opens the Realm first after a day, week or month closes settles it, exactly once.
const dayAfter = (day) => shiftDay(day, 1);
const nextPeriodKey = (key) => (key.startsWith('w:') ? weekKey(new Date(periodBounds(key).end + 3600000)) : monthKey(new Date(periodBounds(key).end + 3600000)));
const yesterdayKey = () => shiftDay(realmDay(), -1);

async function mapState(db) {
  let st = await db.prepare('SELECT * FROM realm_map WHERE id = 1').first();
  if (!st) {
    await db.prepare('INSERT OR IGNORE INTO realm_map (id, held, bulwark, last_day, last_week, last_month, updated) VALUES (1, ?, 0, ?, ?, ?, ?)')
      .bind(TERRITORY.start, yesterdayKey(), prevPeriodKey(weekKey()), prevPeriodKey(monthKey()), now()).run();
    st = await db.prepare('SELECT * FROM realm_map WHERE id = 1').first();
  }
  return st;
}

async function resolveMap(db, me) {
  const st = await mapState(db);
  const events = [];
  // Days: every Central day after the last settled one, up to yesterday.
  const yest = yesterdayKey();
  const days = [];
  for (let d = dayAfter(st.last_day); d <= yest && days.length < 400; d = dayAfter(d)) days.push(d);
  if (days.length) {
    const recent = days.slice(-TERRITORY.catchUp.day);
    const rows = (await db.prepare(`SELECT day, goal, kills, done FROM rally WHERE day IN (${recent.map(() => '?').join(',')})`).bind(...recent).all()).results;
    const by = Object.fromEntries(rows.map((r) => [r.day, r]));
    for (const d of recent) { const r = by[d]; events.push({ kind: 'day', period: d, result: !!(r && (r.done || r.kills >= r.goal)) }); }
  }
  // Weeks and months that have closed since the last settled one.
  for (const [kind, last, cur] of [['week', st.last_week, weekKey()], ['month', st.last_month, monthKey()]]) {
    const keys = [];
    for (let k = nextPeriodKey(last); k !== cur && keys.length < 120 && periodBounds(k).end <= now(); k = nextPeriodKey(k)) keys.push(k);
    const recent = keys.slice(-TERRITORY.catchUp[kind]);
    if (!recent.length) continue;
    const rows = (await db.prepare(`SELECT * FROM realm_period WHERE period IN (${recent.map(() => '?').join(',')})`).bind(...recent).all()).results;
    const by = Object.fromEntries(rows.map((r) => [r.period, r]));
    for (const k of recent) events.push({ kind, period: k, result: by[k] ? periodFraction(by[k]) : 0, closes: periodBounds(k).end });
  }
  const newDay = days.length ? days[days.length - 1] : st.last_day;
  // Even skipped (too-old) periods advance the pointers, so nothing is ever settled twice.
  const newWeek = (() => { let k = st.last_week; for (let n = nextPeriodKey(k); n !== weekKey() && periodBounds(n).end <= now(); n = nextPeriodKey(n)) k = n; return k; })();
  const newMonth = (() => { let k = st.last_month; for (let n = nextPeriodKey(k); n !== monthKey() && periodBounds(n).end <= now(); n = nextPeriodKey(n)) k = n; return k; })();
  if (!events.length && newDay === st.last_day && newWeek === st.last_week && newMonth === st.last_month) return st;
  // Settle in the order things closed: days by date, a week or month at its end.
  const when = (e) => (e.kind === 'day' ? Date.parse(e.period + 'T23:59:59Z') : e.closes - 1);
  events.sort((a, b) => when(a) - when(b));
  let state = { held: clampHeld(st.held), bulwark: st.bulwark || 0 };
  const log = [];
  for (const e of events) {
    const delta = deltaFor(e.kind, e.result);
    const before = state.held;
    state = applyDelta(state, delta);
    log.push({ ...e, delta, outcome: outcomeName(e.kind, e.result), held: state.held, moved: state.held - before });
  }
  const upd = await db.prepare('UPDATE realm_map SET held = ?, bulwark = ?, last_day = ?, last_week = ?, last_month = ?, updated = ? WHERE id = 1 AND last_day = ? AND last_week = ? AND last_month = ?')
    .bind(state.held, state.bulwark, newDay, newWeek, newMonth, now(), st.last_day, st.last_week, st.last_month).run();
  if (!upd.meta?.changes) return mapState(db);   // someone else settled it a moment ago
  if (log.length) {
    const t = now();
    await db.batch(log.map((l) => db.prepare('INSERT INTO realm_map_log (at, kind, period, outcome, delta, held) VALUES (?, ?, ?, ?, ?, ?)').bind(t, l.kind, l.period, l.outcome, l.delta, l.held)));
    await db.prepare('DELETE FROM realm_map_log WHERE id < (SELECT MAX(id) - 200 FROM realm_map_log)').run();
    const moved = state.held - clampHeld(st.held);
    if (me && moved) {
      const names = moved > 0 ? PROVINCES.slice(clampHeld(st.held), state.held).map((p) => p.name) : PROVINCES.slice(state.held, clampHeld(st.held)).map((p) => p.name);
      const list = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
      await addDeed(db, me.id, 'map', moved > 0 ? `The Realm's banners rise over ${list}.` : `The horde has taken ${list}. Win the Rally to march back.`);
    }
  }
  return db.prepare('SELECT * FROM realm_map WHERE id = 1').first();
}

async function mapView(db, me) {
  const st = await resolveMap(db, me);
  const held = clampHeld(st.held);
  const [logRows, rally] = await Promise.all([
    db.prepare('SELECT at, kind, period, outcome, delta, held FROM realm_map_log ORDER BY id DESC LIMIT 14').all(),
    ensureRally(db),
  ]);
  const f = frontier(held);
  return {
    held, bulwark: st.bulwark || 0, max: MAX_PROVINCES, next: f.next?.id || null, border: f.border?.id || null,
    log: logRows.results,
    rally: { goal: rally.goal, kills: rally.kills, done: !!rally.done || rally.kills >= rally.goal, endsAt: realmDayEnd(rally.day) },
  };
}

// ---------------- realm feed ----------------
async function addDeed(db, playerId, kind, text) {
  await db.prepare('INSERT INTO realm_feed (created, player_id, kind, text) VALUES (?, ?, ?, ?)').bind(now(), playerId, kind, String(text).slice(0, 160)).run();
  await db.prepare('DELETE FROM realm_feed WHERE id < (SELECT MAX(id) - 150 FROM realm_feed)').run();
}
async function feedRows(db, me, limit = 25) {
  const rows = (await db.prepare('SELECT f.id, f.created, f.player_id AS pid, f.kind, f.text, f.cheers, p.name, (SELECT 1 FROM feed_cheers c WHERE c.feed_id = f.id AND c.player_id = ?) AS cheered FROM realm_feed f JOIN players p ON p.id = f.player_id WHERE p.hidden = 0 ORDER BY f.id DESC LIMIT ?').bind(me.id, limit + 10).all()).results;
  const blocked = new Set((await db.prepare('SELECT blocked FROM blocks WHERE player_id = ?').bind(me.id).all()).results.map((r) => r.blocked));
  return rows.filter((r) => !blocked.has(r.pid)).slice(0, limit).map((r) => ({ pid: r.pid === me.id ? null : r.pid, id: r.id, at: r.created, kind: r.kind, text: r.text, cheers: r.cheers, cheered: !!r.cheered, mine: r.pid === me.id }));
}

// ---------------- world stats ----------------
// Runs drop one small row into run_usage. Folding those rows into the world_stats counters (one JSON blob per period and category)
// happens here, at most once every WORLD_EVERY ms, by whoever opens the World Stats screen. A lock row keeps two workers from
// folding at once, and the rows are deleted in the same transaction that writes the counters, so nothing is counted twice.
// Cost: about two writes per run plus ~25 writes per fold, however many runs the fold covers.
const WORLD_EVERY = 5 * 60 * 1000;
const WORLD_CHUNK = 400;
const WORLD_CHUNKS_PER_CALL = 4;
const upsertWorld = (db, period, cat, data) => db.prepare('INSERT INTO world_stats (period, cat, data) VALUES (?, ?, ?) ON CONFLICT(period, cat) DO UPDATE SET data = excluded.data').bind(period, cat, JSON.stringify(data));

async function worldRollup(db) {
  const t = now();
  const next = await db.prepare('SELECT id FROM run_usage ORDER BY id LIMIT 1').first();
  if (!next) return false;
  await db.prepare("INSERT OR IGNORE INTO world_stats (period, cat, data) VALUES ('_', 'lock', '0')").run();
  const claim = await db.prepare("UPDATE world_stats SET data = ? WHERE period = '_' AND cat = 'lock' AND CAST(data AS INTEGER) < ?").bind(String(t), t - WORLD_EVERY).run();
  if (!claim.meta?.changes) return false;
  try {
    for (let pass = 0; pass < WORLD_CHUNKS_PER_CALL; pass++) {
      const rows = (await db.prepare('SELECT id, season, data FROM run_usage ORDER BY id LIMIT ?').bind(WORLD_CHUNK).all()).results;
      if (!rows.length) break;
      const periods = ['all', ...new Set(rows.map((r) => r.season))];
      const state = Object.fromEntries(periods.map((p) => [p, emptyWorld()]));
      const have = (await db.prepare(`SELECT period, cat, data FROM world_stats WHERE period IN (${periods.map(() => '?').join(',')})`).bind(...periods).all()).results;
      for (const row of have) {
        try { const v = JSON.parse(row.data); if (v && typeof v === 'object' && state[row.period] && WORLD_CATS.includes(row.cat)) state[row.period][row.cat] = v; } catch { /* start that category over */ }
      }
      for (const row of rows) {
        let u; try { u = JSON.parse(row.data); } catch { continue; }
        if (!u || typeof u !== 'object') continue;
        foldUsage(state.all, u);
        if (state[row.season]) foldUsage(state[row.season], u);
      }
      const stmts = [];
      for (const p of periods) for (const cat of WORLD_CATS) stmts.push(upsertWorld(db, p, cat, state[p][cat]));
      stmts.push(db.prepare('DELETE FROM run_usage WHERE id <= ?').bind(rows[rows.length - 1].id));
      await db.batch(stmts);
      if (rows.length < WORLD_CHUNK) break;
    }
    for (const k of [...memCache.keys()]) if (k.startsWith('world:')) memCache.delete(k);
    return true;
  } catch (e) {
    await db.prepare("UPDATE world_stats SET data = '0' WHERE period = '_' AND cat = 'lock'").run().catch(() => {});
    throw e;
  }
}

async function readWorld(db, period) {
  const rows = (await db.prepare('SELECT cat, data FROM world_stats WHERE period = ?').bind(period).all()).results;
  const world = emptyWorld();
  for (const r of rows) { try { if (WORLD_CATS.includes(r.cat)) world[r.cat] = JSON.parse(r.data) || {}; } catch { /* skip */ } }
  const [lock, pending] = await Promise.all([
    db.prepare("SELECT data FROM world_stats WHERE period = '_' AND cat = 'lock'").first(),
    db.prepare('SELECT COUNT(*) AS n FROM run_usage').first(),
  ]);
  return { world, updated: Number(lock?.data) || 0, pending: pending?.n || 0 };
}

// ---------------- routes ----------------
const routes = {
  'GET health': async ({ env }) => ({ ok: true, db: !!env.DB, time: now() }),

  'POST register': async ({ db, request, body }) => {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if ((await rateLimit(db, 'reg:' + ip, 20, 86400)) < 0) bad('Too many new accounts from this network today', 429);
    const id = randHex(8), token = randHex(32), recovery = `${randCode(4)}-${randCode(4)}-${randCode(4)}`;
    const name = cleanName(body.name);
    let friendCode;
    for (let i = 0; i < 5; i++) {
      friendCode = randCode(6);
      const clash = await db.prepare('SELECT 1 FROM players WHERE friend_code = ?').bind(friendCode).first();
      if (!clash) break;
    }
    await db.prepare('INSERT INTO players (id, token_hash, recovery_hash, name, friend_code, created, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, await sha256(token), await sha256(recovery), name, friendCode, now(), now()).run();
    return { id, token, recovery, friendCode, name };
  },

  'POST recover': async ({ db, request, body }) => {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if ((await rateLimit(db, 'rec:' + ip, 15, 3600)) < 0) bad('Too many attempts. Try again later.', 429);
    const code = String(body.recovery || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) bad('That code is not in the right format (XXXX-XXXX-XXXX).');
    const p = await db.prepare('SELECT * FROM players WHERE recovery_hash = ?').bind(await sha256(code)).first();
    if (!p) bad('No account matches that recovery code.', 404);
    const token = randHex(32);
    await db.prepare('UPDATE players SET token_hash = ?, last_seen = ? WHERE id = ?').bind(await sha256(token), now(), p.id).run();
    return { id: p.id, token, name: p.name, friendCode: p.friend_code };
  },

  'POST rename': async ({ db, me, body }) => {
    if ((await rateLimit(db, 'rename:' + me.id, 5, 86400)) < 0) bad('You can rename 5 times a day', 429);
    const name = cleanName(body.name, me.name.split(' ')[0] || 'Commander');
    await db.prepare('UPDATE players SET name = ? WHERE id = ?').bind(name, me.id).run();
    return { name };
  },

  'GET me': async ({ db, me }) => {
    const inbox = await db.prepare('SELECT COUNT(*) AS n FROM inbox WHERE player_id = ? AND claimed = 0').bind(me.id).first();
    let clan = null;
    if (me.clan_id) {
      const c = await db.prepare('SELECT name, tag, xp FROM clans WHERE id = ?').bind(me.clan_id).first();
      if (c) clan = { name: c.name, tag: c.tag, xp: c.xp };
    }
    const s = await currentSiege(db);
    const mine = await db.prepare('SELECT damage FROM siege_contrib WHERE siege_id = ? AND player_id = ?').bind(s.id, me.id).first();
    const season = seasonKey();
    const myBest = await db.prepare("SELECT value FROM bests WHERE player_id = ? AND board = 'wave' AND period = ?").bind(me.id, season).first();
    let rival = null;
    if (myBest) {
      const r = await db.prepare("SELECT p.name, b.value FROM bests b JOIN players p ON p.id = b.player_id WHERE b.board = 'wave' AND b.period = ? AND b.value > ? AND p.hidden = 0 ORDER BY b.value ASC LIMIT 1").bind(season, myBest.value).first();
      if (r) rival = { name: r.name, value: r.value };
    }
    const prev = prevSeasonKey();
    const claimed = await db.prepare('SELECT 1 FROM season_claims WHERE player_id = ? AND season = ?').bind(me.id, prev).first();
    let seasonReward = false;
    if (!claimed) {
      const mb = await db.prepare("SELECT value FROM bests WHERE player_id = ? AND board = 'wave' AND period = ?").bind(me.id, prev).first();
      if (mb) {
        const rank = await db.prepare("SELECT COUNT(*) + 1 AS r FROM bests WHERE board = 'wave' AND period = ? AND value > ?").bind(prev, mb.value).first();
        seasonReward = rank.r <= 10;
      }
    }
    return {
      id: me.id, name: me.name, friendCode: me.friend_code, inbox: inbox.n, requests: (await db.prepare('SELECT COUNT(*) AS n FROM friend_requests WHERE to_id = ?').bind(me.id).first()).n, clan, rival, seasonReward,
      siege: { name: s.name, hp: s.hp, maxHp: s.max_hp, endsAt: s.ends, defeated: !!s.defeated, yourDamage: mine?.damage || 0 },
    };
  },

  'POST runs': async ({ db, me, body }) => {
    if ((await rateLimit(db, 'run:' + me.id, 1, 20)) < 0) bad('Slow down a little', 429);
    for (const k of memCache.keys()) if (k.startsWith('lb:') || k.startsWith('rb:')) memCache.delete(k);
    const r = {
      seed: String(body.seed || '').slice(0, 48), map: String(body.map || '').slice(0, 16), mode: String(body.mode || 'normal').slice(0, 12),
      modifiers: Array.isArray(body.modifiers) ? body.modifiers.filter((m) => MODIFIERS[m]).slice(0, 8) : [],
      ascension: Math.max(0, Math.min(10, body.ascension | 0)), wave: body.wave | 0, wavesCleared: body.wavesCleared | 0,
      start: body.start === undefined ? 1 : body.start | 0, score: Math.floor(Number(body.score) || 0), kills: body.kills | 0, heroKills: body.heroKills | 0, duration: body.duration | 0,
      bossDmg: Math.max(0, Math.floor(Number(body.bossDmg) || 0)),
      clock: Math.max(0, Math.floor(Number(body.clock) || 0)), victory: body.victory === true,
      level: cleanSprintLevel(body.level),
    };
    const special = isNewMode(r.mode);   // Gauntlet, Last Stand, Sprint: ranked on boards of their own, not the wave board
    const local = isLocalMode(r.mode);   // Hero Mode and the Daily Siege: they feed the Realm, but only the Siege has a board (a daily one)
    if (special || r.mode === 'siege') r.start = 1;   // Hero Mode keeps its head start (adaptive or picked)
    const noBoards = special || local;
    const reason = validateRun(r);
    if (reason) return { accepted: false, reason };
    // A resend of a run the server already has (the reply was lost, the outbox retried) must not count twice.
    const dup = await db.prepare('SELECT 1 AS x FROM runs WHERE player_id = ? AND seed = ? AND mode = ? AND wave = ? AND score = ? AND kills = ? AND duration = ?').bind(me.id, r.seed, r.mode, r.wave, r.score, r.kills, r.duration).first();
    if (dup) return { accepted: false, reason: 'Already recorded' };
    // Runs that skip ahead rank by a discounted wave and stay off the score, hero and daily boards.
    const start = cleanStart(r.start), waveRank = rankFor(r.wave, start, r.wavesCleared), headStart = start > 1;
    const t = now(), season = seasonKey(), day = realmDay();
    // Realm contribution (capped per citizen per period so no single account can carry the nation).
    // Part of the run may already have been counted by mid-run syncs; only the remainder is added here.
    const syn = body.realmSynced || {};
    const wk = weekKey(), mo = monthKey();
    const wavesDone = Math.max(0, special ? Math.min(r.wavesCleared, r.mode === 'laststand' || r.mode === 'endurance' ? lastStandWaves(r.kills) + 1 : r.wave) : Math.min(r.wavesCleared, r.wave));
    const eff = {
      kills: Math.max(0, r.kills - Math.max(0, syn.kills | 0)),
      waves: Math.max(0, wavesDone - Math.max(0, syn.waves | 0)),
      hero: Math.max(0, r.heroKills - Math.max(0, syn.hero | 0)),
    };
    const [wp, mp] = [await ensurePeriod(db, wk), await ensurePeriod(db, mo)];
    await ensureRally(db);
    const { stmts: realmStmts, cw, cm } = await realmCredit(db, me, eff, { mode: r.mode, standard: body.standard });
    const upsert = (board, period, value) => db.prepare('INSERT INTO bests (player_id, board, period, value, updated) VALUES (?, ?, ?, ?, ?) ON CONFLICT(player_id, board, period) DO UPDATE SET value = MAX(value, excluded.value), updated = excluded.updated').bind(me.id, board, period, value, t);
    // The board a special mode ranks on, and the value it stores (Sprint stores a bigger number for a faster clear).
    // Weekly modes rank only on the weekly seed; a run on a map the player picked is practice (the Gauntlet has no weekly seed).
    const ranked = r.mode === 'gauntlet' || r.seed === weeklySetup(r.mode, season).seed;
    const modeBoard = !special || !ranked ? null : r.mode === 'gauntlet' ? { board: 'gauntlet', value: r.wave } : r.mode === 'laststand' ? { board: 'laststand', value: r.clock } : r.mode === 'endurance' ? { board: 'endurance', value: r.clock } : r.victory ? { board: sprintBoardId(r.level), value: sprintBoardValue(r.clock) } : null;
    const stmts = [
      db.prepare('INSERT INTO runs (player_id, created, season, map, mode, seed, modifiers, ascension, wave, score, kills, hero_kills, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(me.id, t, season, r.map, r.mode, r.seed, r.modifiers.join(','), r.ascension, r.wave, r.score, r.kills, r.heroKills, r.duration),
      ...(special ? (modeBoard && modeBoard.value > 0 ? [upsert(modeBoard.board, season, modeBoard.value), upsert(modeBoard.board, 'all', modeBoard.value)] : []) : local ? [] : [upsert('wave', season, waveRank), upsert('wave', 'all', waveRank)]),
      ...(noBoards || headStart || r.ascension < 1 ? [] : [upsert('ascend', season, r.ascension * 1000 + Math.min(999, waveRank)), upsert('ascend', 'all', r.ascension * 1000 + Math.min(999, waveRank))]),
      ...(noBoards || headStart ? [] : [upsert('score', season, r.score), upsert('score', 'all', r.score), upsert('hero', season, r.heroKills), upsert('hero', 'all', r.heroKills)]),
      db.prepare('UPDATE players SET best_wave = MAX(best_wave, ?), title = ? WHERE id = ?').bind(noBoards ? 0 : waveRank, body.title ? String(body.title).slice(0, 24) : null, me.id),
      ...realmStmts,
    ];
    if (r.mode === 'daily' && !headStart && r.seed === dailySetup(day).seed) stmts.push(upsert('daily', 'daily-' + day, r.score));
    // The Daily Siege ranks on today's seed only, by its puzzle score (never above the most a siege can earn).
    if (r.mode === 'siege' && r.seed === 'siege-' + day && r.score > 0 && r.score <= SIEGE_MAX && r.wave <= DAILY_SIEGE.start + DAILY_SIEGE.waves + 1) stmts.push(upsert('siege', 'siege-' + day, r.score));
    // What the run built, picked and killed with, for the World Stats screen (folded into counters later, see worldRollup).
    const usage = r.mode === 'laststand' ? null : cleanUsage(body.usage, { map: r.map, mode: r.mode, ascension: r.ascension, modifiers: r.modifiers, weapon: String(body.weapon || ''), wave: special ? Math.max(1, wavesDone) : waveRank, kills: r.kills, heroKills: r.heroKills, wavesCleared: wavesDone, duration: r.duration });
    if (usage) stmts.push(db.prepare('INSERT INTO run_usage (season, data) VALUES (?, ?)').bind(season, JSON.stringify(usage)));
    // World siege
    const s = await currentSiege(db);
    const damage = Math.min(r.kills * 20 + Math.floor(r.bossDmg / 100), r.kills * 40 + 2000);
    if (!s.defeated && damage > 0) {
      stmts.push(db.prepare('UPDATE siege SET hp = MAX(0, hp - ?) WHERE id = ?').bind(damage, s.id));
      stmts.push(db.prepare('INSERT INTO siege_contrib (siege_id, player_id, damage) VALUES (?, ?, ?) ON CONFLICT(siege_id, player_id) DO UPDATE SET damage = damage + excluded.damage').bind(s.id, me.id, damage));
    }
    // Clan progress
    let clanXp = 0;
    if (me.clan_id) {
      clanXp = Math.floor(r.kills / 10) + r.wavesCleared;
      stmts.push(db.prepare('UPDATE clans SET xp = xp + ? WHERE id = ?').bind(clanXp, me.clan_id));
      stmts.push(db.prepare('INSERT INTO clan_weekly (clan_id, season, progress) VALUES (?, ?, ?) ON CONFLICT(clan_id, season) DO UPDATE SET progress = progress + excluded.progress').bind(me.clan_id, season, r.kills));
      stmts.push(db.prepare('INSERT INTO clan_contrib (clan_id, season, player_id, kills) VALUES (?, ?, ?, ?) ON CONFLICT(clan_id, season, player_id) DO UPDATE SET kills = kills + excluded.kills').bind(me.clan_id, season, me.id, r.kills));
    }
    await db.batch(stmts);
    // Siege defeated? Reward every contributor once.
    if (!s.defeated && damage > 0) {
      const after = await db.prepare('SELECT hp, defeated FROM siege WHERE id = ?').bind(s.id).first();
      if (after.hp <= 0 && !after.defeated) {
        const flip = await db.prepare('UPDATE siege SET defeated = 1 WHERE id = ? AND defeated = 0').bind(s.id).run();
        if (flip.meta?.changes) {
          await db.prepare("INSERT INTO inbox (player_id, kind, title, body, payload, created) SELECT player_id, 'renown', ?, ?, ?, ? FROM siege_contrib WHERE siege_id = ?")
            .bind(`${s.name} has fallen!`, 'The world siege is won. Here is your share of the spoils.', JSON.stringify({ renown: 60 }), t, s.id).run();
        }
      }
    }
    // Clan weekly goal reached? Chests for contributors.
    if (me.clan_id) {
      const cw = await db.prepare('SELECT progress, rewarded FROM clan_weekly WHERE clan_id = ? AND season = ?').bind(me.clan_id, season).first();
      const members = await db.prepare('SELECT COUNT(*) AS n FROM players WHERE clan_id = ?').bind(me.clan_id).first();
      if (cw && !cw.rewarded && cw.progress >= clanGoal(members.n)) {
        const flip = await db.prepare('UPDATE clan_weekly SET rewarded = 1 WHERE clan_id = ? AND season = ? AND rewarded = 0').bind(me.clan_id, season).run();
        if (flip.meta?.changes) {
          await db.prepare("INSERT INTO inbox (player_id, kind, title, body, payload, created) SELECT player_id, 'renown', 'Clan chest', 'Your clan hit its weekly goal together.', ?, ? FROM clan_contrib WHERE clan_id = ? AND season = ?")
            .bind(JSON.stringify({ renown: 40 }), t, me.clan_id, season).run();
        }
      }
    }
    const rank = async (board, period, value) => (await db.prepare('SELECT COUNT(*) + 1 AS r FROM bests WHERE board = ? AND period = ? AND value > ?').bind(board, period, value).first()).r;
    const best = await db.prepare("SELECT value FROM bests WHERE player_id = ? AND board = 'wave' AND period = ?").bind(me.id, season).first();
    const ranks = best ? { wave: await rank('wave', season, best.value) } : {};
    if (modeBoard) { const mb = await db.prepare('SELECT value FROM bests WHERE player_id = ? AND board = ? AND period = ?').bind(me.id, modeBoard.board, season).first(); if (mb) ranks[modeBoard.board] = await rank(modeBoard.board, season, mb.value); }
    if (r.mode === 'daily') ranks.daily = await rank('daily', 'daily-' + day, r.score);
    const [wa, ma] = [await ensurePeriod(db, wk), await ensurePeriod(db, mo)];
    const brief = (before, after) => ({ fraction: periodFraction(after), before: periodFraction(before), reached: tiersReached(periodFraction(after)), reachedBefore: tiersReached(periodFraction(before)), kills: after.kills, waves: after.waves, goal: { kills: after.goal_kills, waves: after.goal_waves } });
    const realm = { added: { kills: Math.min(r.kills, cw.kills + Math.max(0, syn.kills | 0)), waves: Math.min(wavesDone, cw.waves + Math.max(0, syn.waves | 0)), capped: cw.kills < eff.kills }, week: brief(wp, wa), month: brief(mp, ma) };
    // Rally spoils, then a deed for the Realm's feed (one per run: the most notable).
    const rallyWon = await rallyCheck(db, me);
    const rally = await rallyView(db, me);
    try {
      const upTier = (b) => b.reached > b.reachedBefore;
      const firstMilestone = special ? null : [100, 75, 50, 25].find((m) => waveRank >= m && (me.best_wave || 0) < m);
      const felled = !s.defeated && damage > 0 && (await db.prepare('SELECT defeated FROM siege WHERE id = ?').bind(s.id).first())?.defeated;
      if (felled) await addDeed(db, me.id, 'siege', `${me.name} struck the blow that felled ${s.name}!`);
      else if (rallyWon) await addDeed(db, me.id, 'rally', 'The Daily Rally was won. The whole Realm answered the call!');
      else if (upTier(realm.month)) await addDeed(db, me.id, 'realm', `The Realm reached ${REALM.tierNames[realm.month.reached - 1]} on the Monthly Campaign, with ${me.name}'s run.`);
      else if (upTier(realm.week)) await addDeed(db, me.id, 'realm', `The Realm reached ${REALM.tierNames[realm.week.reached - 1]} on the Weekly Muster, with ${me.name}'s run.`);
      else if (firstMilestone) await addDeed(db, me.id, 'milestone', `${me.name} reached wave ${firstMilestone} for the first time!`);
      else if (!special && waveRank >= 10 && waveRank > (me.best_wave || 0)) await addDeed(db, me.id, 'best', `${me.name} set a new personal best: wave ${waveRank}.`);
    } catch (e) { console.error('deed failed', e); }
    return { accepted: true, ranks, siege: { damage: s.defeated ? 0 : damage }, clan: clanXp ? { xp: clanXp } : null, realm, rally };
  },

  'GET leaderboard': async ({ db, env, me, url }) => {
    const board = ['wave', 'score', 'daily', 'siege', 'hero', 'ascend', 'gauntlet', 'endurance', 'laststand', ...SPRINT_BOARDS].includes(url.searchParams.get('board')) ? url.searchParams.get('board') : 'wave';
    const scope = ['global', 'friends', 'clan'].includes(url.searchParams.get('scope')) ? url.searchParams.get('scope') : 'global';
    const periodArg = url.searchParams.get('period') === 'all' ? 'all' : 'week';
    const period = board === 'daily' ? 'daily-' + realmDay() : board === 'siege' ? 'siege-' + realmDay() : periodArg === 'all' ? 'all' : seasonKey();
    const base = `SELECT b.player_id AS id, b.value, p.name, p.title, c.tag AS clan FROM bests b JOIN players p ON p.id = b.player_id LEFT JOIN clans c ON c.id = p.clan_id WHERE b.board = ? AND b.period = ? AND p.hidden = 0`;
    let rows;
    if (scope === 'global') {
      rows = await cached(`lb:${board}:${period}`, 30, async () => (await db.prepare(base + ' ORDER BY b.value DESC, b.updated ASC LIMIT 50').bind(board, period).all()).results);
    } else if (scope === 'friends') {
      rows = (await db.prepare(base + ' AND (b.player_id = ? OR b.player_id IN (SELECT b FROM friends WHERE a = ?)) ORDER BY b.value DESC LIMIT 100').bind(board, period, me.id, me.id).all()).results;
    } else {
      rows = me.clan_id ? (await db.prepare(base + ' AND p.clan_id = ? ORDER BY b.value DESC LIMIT 50').bind(board, period, me.clan_id).all()).results : [];
    }
    const blocked = new Set((await db.prepare('SELECT blocked FROM blocks WHERE player_id = ?').bind(me.id).all()).results.map((r) => r.blocked));
    rows = rows.filter((r) => !blocked.has(r.id)).map((r, i) => ({ ...r, rank: i + 1 }));
    const mine = await db.prepare('SELECT value FROM bests WHERE player_id = ? AND board = ? AND period = ?').bind(me.id, board, period).first();
    let meRow = null, rival = null;
    if (mine) {
      const r = await db.prepare('SELECT COUNT(*) + 1 AS r FROM bests b JOIN players p ON p.id = b.player_id WHERE b.board = ? AND b.period = ? AND b.value > ? AND p.hidden = 0').bind(board, period, mine.value).first();
      meRow = { rank: r.r, value: mine.value };
      const rv = await db.prepare('SELECT p.name, b.value FROM bests b JOIN players p ON p.id = b.player_id WHERE b.board = ? AND b.period = ? AND b.value > ? AND p.hidden = 0 ORDER BY b.value ASC LIMIT 1').bind(board, period, mine.value).first();
      if (rv) rival = rv;
      // The cached board may predate your latest run: make sure you appear where you belong.
      if (scope === 'global' && meRow.rank <= 50 && !rows.some((r) => r.id === me.id)) {
        const clan = me.clan_id ? (await db.prepare('SELECT tag FROM clans WHERE id = ?').bind(me.clan_id).first())?.tag : null;
        rows = [...rows.filter((r) => r.value >= mine.value), { id: me.id, value: mine.value, name: me.name, title: me.title, clan }, ...rows.filter((r) => r.value < mine.value)].slice(0, 50).map((r, i) => ({ ...r, rank: i + 1 }));
      }
    }
    return { rows, me: meRow, rival, period };
  },

  'GET friends': async ({ db, me }) => {
    const rows = (await db.prepare('SELECT p.id, p.name, p.best_wave AS bestWave, p.last_seen, c.tag AS clan FROM friends f JOIN players p ON p.id = f.b LEFT JOIN clans c ON c.id = p.clan_id WHERE f.a = ? ORDER BY p.last_seen DESC LIMIT ?').bind(me.id, MAX_FRIENDS).all()).results;
    const giftsLeft = await rateLeft(db, `gift:${me.id}:${realmDay()}`, GIFT_DAILY_CAP);
    const [inc, out] = await Promise.all([
      db.prepare('SELECT p.id, p.name, p.best_wave AS bestWave, r.created FROM friend_requests r JOIN players p ON p.id = r.from_id WHERE r.to_id = ? AND p.hidden = 0 ORDER BY r.created DESC LIMIT 30').bind(me.id).all(),
      db.prepare('SELECT p.id, p.name, r.created FROM friend_requests r JOIN players p ON p.id = r.to_id WHERE r.from_id = ? ORDER BY r.created DESC LIMIT 30').bind(me.id).all(),
    ]);
    return {
      friends: rows.map((r) => ({ id: r.id, name: r.name, bestWave: r.bestWave, clan: r.clan, online: now() - r.last_seen < ONLINE_MS, lastSeen: r.last_seen })), giftsLeft,
      requests: inc.results.map((r) => ({ id: r.id, name: r.name, bestWave: r.bestWave, at: r.created })),
      sent: out.results.map((r) => ({ id: r.id, name: r.name, at: r.created })),
      salutesLeft: await rateLeft(db, `salute:${me.id}:${realmDay()}`, SALUTE_DAILY_CAP),
    };
  },

  // Asking for a friend: they must accept. If they already asked you, it is simply accepted.
  'POST friends/add': async ({ db, me, body }) => {
    let f;
    if (body.id) {
      f = await db.prepare('SELECT id, name FROM players WHERE id = ? AND hidden = 0').bind(String(body.id).slice(0, 32)).first();
      if (!f) bad('No commander found.', 404);
    } else {
      const code = String(body.code || '').toUpperCase().trim();
      if (!/^[A-Z0-9]{6}$/.test(code)) bad('Friend codes are 6 letters and numbers.');
      f = await db.prepare('SELECT id, name FROM players WHERE friend_code = ?').bind(code).first();
      if (!f) bad('No commander has that code.', 404);
    }
    if ((await rateLimit(db, 'fadd:' + me.id, 30, 86400)) < 0) bad('Too many friend requests today', 429);
    if (f.id === me.id) bad('That is you.');
    if (await db.prepare('SELECT 1 FROM friends WHERE a = ? AND b = ?').bind(me.id, f.id).first()) return { ok: true, state: 'friends', friend: { id: f.id, name: f.name } };
    if (await db.prepare('SELECT 1 FROM blocks WHERE player_id = ? AND blocked = ?').bind(f.id, me.id).first()) return { ok: true, state: 'sent', friend: { id: f.id, name: f.name } };   // stay quiet if they blocked you
    const n = await db.prepare('SELECT COUNT(*) AS n FROM friends WHERE a = ?').bind(me.id).first();
    if (n.n >= MAX_FRIENDS) bad(`You can have up to ${MAX_FRIENDS} friends.`);
    const theirs = await db.prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?').bind(f.id, me.id).first();
    if (theirs) {
      await makeFriends(db, me, f);
      return { ok: true, state: 'friends', friend: { id: f.id, name: f.name } };
    }
    const pend = await db.prepare('SELECT COUNT(*) AS n FROM friend_requests WHERE to_id = ?').bind(f.id).first();
    if (pend.n >= 50) bad('That commander has too many pending requests.');
    const res = await db.prepare('INSERT OR IGNORE INTO friend_requests (from_id, to_id, created) VALUES (?, ?, ?)').bind(me.id, f.id, now()).run();
    if (res.meta?.changes) await db.prepare("INSERT INTO inbox (player_id, kind, title, body, payload, created, claimed) VALUES (?, 'note', ?, ?, '{}', ?, 1)").bind(f.id, `${me.name} wants to be your friend`, 'Open Allies → Friends to accept or decline.', now()).run();
    return { ok: true, state: 'sent', friend: { id: f.id, name: f.name } };
  },

  'POST friends/accept': async ({ db, me, body }) => {
    const id = String(body.id || '');
    const req = await db.prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?').bind(id, me.id).first();
    if (!req) bad('That request is gone.', 404);
    const f = await db.prepare('SELECT id, name FROM players WHERE id = ?').bind(id).first();
    if (!f) bad('No commander found.', 404);
    const n = await db.prepare('SELECT COUNT(*) AS n FROM friends WHERE a = ?').bind(me.id).first();
    if (n.n >= MAX_FRIENDS) bad(`You can have up to ${MAX_FRIENDS} friends.`);
    await makeFriends(db, me, f);
    return { ok: true, friend: { id: f.id, name: f.name } };
  },

  'POST friends/decline': async ({ db, me, body }) => {
    const id = String(body.id || '');
    await db.prepare('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)').bind(id, me.id, me.id, id).run();
    return { ok: true };
  },

  'POST friends/remove': async ({ db, me, body }) => {
    await db.batch([
      db.prepare('DELETE FROM friends WHERE a = ? AND b = ?').bind(me.id, String(body.id)),
      db.prepare('DELETE FROM friends WHERE a = ? AND b = ?').bind(String(body.id), me.id),
    ]);
    return { ok: true };
  },

  // A player's public card: stats, showcase, recent runs, and how you relate to them.
  'GET player': async ({ db, me, url }) => {
    const id = String(url.searchParams.get('id') || '').slice(0, 32);
    const p = await db.prepare('SELECT p.id, p.name, p.title, p.best_wave AS bestWave, p.created, p.last_seen AS lastSeen, p.hidden, c.name AS clanName, c.tag AS clanTag FROM players p LEFT JOIN clans c ON c.id = p.clan_id WHERE p.id = ?').bind(id).first();
    if (!p || (p.hidden && p.id !== me.id)) bad('No commander found.', 404);
    const wk = weekKey(), season = seasonKey();
    const [tot, maps, recent, bests, allRow, wkRow, dmg, rallies, cheers, mutual, fr, sent, got, sc, blocked, wavesHeld] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS runs, COALESCE(SUM(kills), 0) AS kills, COALESCE(SUM(hero_kills), 0) AS hero, COALESCE(SUM(duration), 0) AS secs, COALESCE(MAX(wave), 0) AS best, COALESCE(MAX(ascension), 0) AS asc, COALESCE(AVG(wave), 0) AS avg FROM runs WHERE player_id = ?').bind(id).first(),
      db.prepare('SELECT map, COUNT(*) AS n FROM runs WHERE player_id = ? GROUP BY map ORDER BY n DESC LIMIT 1').bind(id).first(),
      db.prepare('SELECT map, wave, score, ascension, mode, created FROM runs WHERE player_id = ? ORDER BY id DESC LIMIT 6').bind(id).all(),
      db.prepare("SELECT board, period, value FROM bests WHERE player_id = ? AND ((board IN ('score', 'hero', 'ascend') AND period = 'all') OR (board = 'wave' AND period IN ('all', ?)))").bind(id, season).all(),
      db.prepare("SELECT kills, waves, hero FROM realm_contrib WHERE period = 'all' AND player_id = ?").bind(id).first(),
      db.prepare('SELECT kills FROM realm_contrib WHERE period = ? AND player_id = ?').bind(wk, id).first(),
      db.prepare('SELECT COALESCE(SUM(damage), 0) AS n FROM siege_contrib WHERE player_id = ?').bind(id).first(),
      db.prepare('SELECT COUNT(*) AS n FROM rally_contrib WHERE player_id = ? AND rewarded = 1').bind(id).first(),
      db.prepare('SELECT COALESCE(SUM(cheers), 0) AS n FROM realm_feed WHERE player_id = ?').bind(id).first(),
      db.prepare('SELECT COUNT(*) AS n FROM friends a JOIN friends b ON a.b = b.b WHERE a.a = ? AND b.a = ?').bind(me.id, id).first(),
      db.prepare('SELECT 1 FROM friends WHERE a = ? AND b = ?').bind(me.id, id).first(),
      db.prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?').bind(me.id, id).first(),
      db.prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?').bind(id, me.id).first(),
      db.prepare('SELECT data FROM showcase WHERE player_id = ?').bind(id).first(),
      db.prepare('SELECT 1 FROM blocks WHERE player_id = ? AND blocked = ?').bind(me.id, id).first(),
      db.prepare('SELECT COUNT(*) AS n FROM friends WHERE a = ?').bind(id).first(),
    ]);
    const bmap = {}; for (const b of bests.results) bmap[b.board + ':' + b.period] = b.value;
    let weekRank = null;
    if (bmap['wave:' + season]) weekRank = (await db.prepare("SELECT COUNT(*) + 1 AS r FROM bests b JOIN players q ON q.id = b.player_id WHERE b.board = 'wave' AND b.period = ? AND b.value > ? AND q.hidden = 0").bind(season, bmap['wave:' + season]).first()).r;
    let show = {}; try { show = JSON.parse(sc?.data || '{}'); } catch { show = {}; }
    const isFriend = !!fr || id === me.id;
    return {
      id: p.id, name: p.name, title: p.title, clan: p.clanTag ? { name: p.clanName, tag: p.clanTag } : null, self: p.id === me.id,
      since: p.created, online: now() - p.lastSeen < ONLINE_MS, lastSeen: isFriend ? p.lastSeen : null,
      relation: id === me.id ? 'self' : fr ? 'friends' : sent ? 'sent' : got ? 'incoming' : 'none', blocked: !!blocked, mutual: mutual.n, friendCount: wavesHeld.n,
      stats: {
        runs: tot.runs, kills: tot.kills, hero: tot.hero, hours: Math.round(tot.secs / 360) / 10, bestWave: Math.max(p.bestWave || 0, tot.best), avgWave: Math.round(tot.avg), ascension: tot.asc,
        bestScore: bmap['score:all'] || 0, bestHero: bmap['hero:all'] || 0, seasonWave: bmap['wave:' + season] || 0, weekRank,
        realmKills: allRow?.kills || 0, realmWaves: allRow?.waves || 0, weekKills: wkRow?.kills || 0, siegeDamage: dmg.n, rallies: rallies.n, cheers: cheers.n, favMap: maps?.map || null,
      },
      recent: recent.results.map((r) => ({ map: r.map, wave: r.wave, score: r.score, asc: r.ascension, mode: r.mode, at: r.created })),
      showcase: show,
    };
  },

  // What you choose to show on your card. Everything is clamped; nothing free-form.
  'POST showcase': async ({ db, me, body }) => {
    const str = (v, n = 24) => (typeof v === 'string' ? v.replace(/[^\w \-'.]/g, '').slice(0, n) : '');
    const num = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
    const d = {
      rank: str(body.rank), castle: str(body.castle), hero: str(body.hero), skin: str(body.skin), trail: str(body.trail), weapon: str(body.weapon),
      ach: num(body.ach, 999), achTotal: num(body.achTotal, 999), mastery: num(body.mastery, 999), keep: num(body.keep, 9999), asc: num(body.asc, 20), titles: num(body.titles, 999),
      motto: num(body.motto, MOTTOS.length - 1), towers: Array.isArray(body.towers) ? body.towers.slice(0, 3).map((t) => str(t, 16)).filter(Boolean) : [],
    };
    await db.prepare('INSERT INTO showcase (player_id, data, updated) VALUES (?, ?, ?) ON CONFLICT(player_id) DO UPDATE SET data = excluded.data, updated = excluded.updated').bind(me.id, JSON.stringify(d), now()).run();
    return { ok: true };
  },

  // A free, preset, friendly note. No free text means nothing to moderate.
  'POST salute': async ({ db, me, body }) => {
    const to = String(body.to || ''), msg = SALUTES[body.msg | 0];
    if (!msg) bad('Unknown message');
    if (!(await db.prepare('SELECT 1 FROM friends WHERE a = ? AND b = ?').bind(me.id, to).first())) bad('You can only salute friends.', 403);
    if ((await rateLimit(db, `saluteto:${me.id}:${to}`, 1, 3600)) < 0) bad('Give them a little while before the next one.', 429);
    if ((await rateLimit(db, `salute:${me.id}:${realmDay()}`, SALUTE_DAILY_CAP, 86400)) < 0) bad('No salutes left today.', 429);
    await db.prepare("INSERT INTO inbox (player_id, kind, title, body, payload, created, claimed) VALUES (?, 'note', ?, ?, '{}', ?, 1)").bind(to, `${me.name}: ${msg}`, 'A salute from a friend.', now()).run();
    return { ok: true };
  },

  'POST gifts': async ({ db, me, body }) => {
    const kind = String(body.kind);
    if (!GIFTS[kind]) bad('Unknown gift');
    const to = String(body.to || '');
    const fr = await db.prepare('SELECT 1 FROM friends WHERE a = ? AND b = ?').bind(me.id, to).first();
    if (!fr) bad('You can only send aid to friends.', 403);
    const day = realmDay();
    if ((await rateLimit(db, `giftto:${me.id}:${to}:${day}`, 1, 86400)) < 0) bad('You already sent this friend aid today.', 429);
    if ((await rateLimit(db, `gift:${me.id}:${day}`, GIFT_DAILY_CAP, 86400)) < 0) bad('No gifts left today.', 429);
    const tower = ['archer', 'cannon', 'mage'].includes(body.tower) ? body.tower : 'archer';
    const best = me.best_wave || 0;
    const tier = Math.max(2, Math.min(4, 1 + Math.floor(best / 15)));
    const payload = { kind, from: me.name, tower, tier };
    const title = kind === 'tower' ? `Allied ${tower[0].toUpperCase() + tower.slice(1)} from ${me.name}` : `${GIFTS[kind].name} from ${me.name}`;
    await db.prepare('INSERT INTO inbox (player_id, kind, title, body, payload, created) VALUES (?, ?, ?, ?, ?, ?)').bind(to, kind, title, GIFTS[kind].desc, JSON.stringify(payload), now()).run();
    return { ok: true };
  },

  'GET inbox': async ({ db, me }) => {
    const items = (await db.prepare('SELECT id, kind, title, body, claimed, created FROM inbox WHERE player_id = ? ORDER BY created DESC LIMIT 50').bind(me.id).all()).results;
    return { items: items.map((i) => ({ ...i, claimed: !!i.claimed })) };
  },

  'POST inbox/claim': async ({ db, me, body }) => {
    const it = await db.prepare('SELECT * FROM inbox WHERE id = ? AND player_id = ?').bind(body.id | 0, me.id).first();
    if (!it) bad('Not found', 404);
    if (it.claimed) bad('Already claimed');
    const res = await db.prepare('UPDATE inbox SET claimed = 1 WHERE id = ? AND claimed = 0').bind(it.id).run();
    if (!res.meta?.changes) bad('Already claimed');
    const payload = JSON.parse(it.payload || '{}');
    if (GIFTS[it.kind]) return { reinforcement: { kind: payload.kind, from: payload.from, tower: payload.tower, tier: payload.tier } };
    return { renown: Math.min(500, payload.renown | 0), title: payload.title || null };
  },

  'GET clan': async ({ db, me }) => {
    if (!me.clan_id) return { clan: null };
    const c = await db.prepare('SELECT * FROM clans WHERE id = ?').bind(me.clan_id).first();
    if (!c) { await db.prepare('UPDATE players SET clan_id = NULL WHERE id = ?').bind(me.id).run(); return { clan: null }; }
    const season = seasonKey();
    const members = (await db.prepare('SELECT p.id, p.name, p.best_wave AS bestWave, COALESCE(cc.kills, 0) AS weekKills FROM players p LEFT JOIN clan_contrib cc ON cc.player_id = p.id AND cc.clan_id = p.clan_id AND cc.season = ? WHERE p.clan_id = ? ORDER BY weekKills DESC').bind(season, c.id).all()).results;
    const wk = await db.prepare('SELECT progress FROM clan_weekly WHERE clan_id = ? AND season = ?').bind(c.id, season).first();
    return {
      clan: {
        name: c.name, tag: c.tag, code: c.code, xp: c.xp, treasury: c.treasury, level: clanLevel(c.xp),
        members: members.map((m) => ({ id: m.id, name: m.name, bestWave: m.bestWave, weekKills: m.weekKills, role: m.id === c.leader ? 'leader' : 'member' })),
        weekly: { goal: clanGoal(members.length), progress: wk?.progress || 0 },
      },
    };
  },

  'GET clan/search': async ({ db, url }) => {
    const q = String(url.searchParams.get('q') || '').slice(0, 24).replace(/[%_]/g, '');
    const rows = (await db.prepare("SELECT c.name, c.tag, c.code, c.xp, (SELECT COUNT(*) FROM players p WHERE p.clan_id = c.id) AS members FROM clans c WHERE c.name LIKE ? OR c.tag LIKE ? ORDER BY c.xp DESC LIMIT 20").bind(`%${q}%`, `%${q}%`).all()).results;
    return { clans: rows.map((r) => ({ ...r, level: clanLevel(r.xp) })) };
  },

  'POST clan/create': async ({ db, me, body }) => {
    if (me.clan_id) bad('Leave your current clan first.');
    const name = String(body.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
    const tag = String(body.tag || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (name.length < 3) bad('Clan names need at least 3 characters.');
    if (tag.length < 2) bad('Tags need 2 to 4 letters or numbers.');
    if (!isClean(name) || !isClean(tag)) bad('Please choose a different name.');
    if ((await rateLimit(db, 'clan:' + me.id, 1, 86400)) < 0) bad('You can found one clan per day.', 429);
    const id = randHex(8), code = randCode(6);
    await db.batch([
      db.prepare('INSERT INTO clans (id, name, tag, code, leader, created) VALUES (?, ?, ?, ?, ?, ?)').bind(id, name, tag, code, me.id, now()),
      db.prepare('UPDATE players SET clan_id = ? WHERE id = ?').bind(id, me.id),
    ]);
    return { ok: true, code };
  },

  'POST clan/join': async ({ db, me, body }) => {
    if (me.clan_id) bad('Leave your current clan first.');
    const code = String(body.code || '').toUpperCase().trim();
    const c = await db.prepare('SELECT id FROM clans WHERE code = ?').bind(code).first();
    if (!c) bad('No clan has that code.', 404);
    const n = await db.prepare('SELECT COUNT(*) AS n FROM players WHERE clan_id = ?').bind(c.id).first();
    if (n.n >= MAX_CLAN) bad('That clan is full.');
    await db.prepare('UPDATE players SET clan_id = ? WHERE id = ?').bind(c.id, me.id).run();
    return { ok: true };
  },

  'POST clan/leave': async ({ db, me }) => {
    if (!me.clan_id) return { ok: true };
    const c = await db.prepare('SELECT * FROM clans WHERE id = ?').bind(me.clan_id).first();
    await db.prepare('UPDATE players SET clan_id = NULL WHERE id = ?').bind(me.id).run();
    if (c) {
      const next = await db.prepare('SELECT id FROM players WHERE clan_id = ? ORDER BY created ASC LIMIT 1').bind(c.id).first();
      if (!next) await db.batch([db.prepare('DELETE FROM clans WHERE id = ?').bind(c.id), db.prepare('DELETE FROM clan_weekly WHERE clan_id = ?').bind(c.id), db.prepare('DELETE FROM clan_contrib WHERE clan_id = ?').bind(c.id)]);
      else if (c.leader === me.id) await db.prepare('UPDATE clans SET leader = ? WHERE id = ?').bind(next.id, c.id).run();
    }
    return { ok: true };
  },

  'POST clan/donate': async ({ db, me, body }) => {
    if (!me.clan_id) bad('You are not in a clan.');
    const amount = Math.floor(Number(body.amount) || 0);
    if (amount <= 0 || amount > 10000) bad('Donate between 1 and 10,000 Renown.');
    if ((await rateLimit(db, 'donate:' + me.id, 20, 86400)) < 0) bad('That is a lot of generosity for one day. Try tomorrow.', 429);
    await db.prepare('UPDATE clans SET treasury = treasury + ?, xp = xp + ? WHERE id = ?').bind(amount, amount, me.clan_id).run();
    return { ok: true };
  },

  // Mid-run progress (called after waves and on Save and quit) so the Realm moves without waiting for a run to end.
  'POST realm/sync': async ({ db, me, body }) => {
    // Generous burst: Save and quit right after a wave clear must not be dropped. Credit is capped per day and period anyway.
    if ((await rateLimit(db, 'rsync:' + me.id, 6, 30)) < 0) return { skipped: true, limited: true };
    const kills = Math.max(0, Math.min(body.kills | 0, 3000)), waves = Math.max(0, Math.min(body.waves | 0, 60));
    const eff = { kills, waves, hero: Math.max(0, Math.min(body.hero | 0, kills)) };
    if (!eff.kills && !eff.waves) return { skipped: true };
    await Promise.all([ensurePeriod(db, weekKey()), ensurePeriod(db, monthKey()), ensureRally(db)]);
    const { stmts } = await realmCredit(db, me, eff, { runs: 0, mode: body.mode === 'march' ? 'march' : 'normal', standard: body.standard });
    await db.batch(stmts);
    if (await rallyCheck(db, me)) await addDeed(db, me.id, 'rally', 'The Daily Rally was won. The whole Realm answered the call!');
    for (const k of memCache.keys()) if (k.startsWith('rb:')) memCache.delete(k);
    return { ok: true, added: eff };
  },

  'GET realm': async ({ db, me }) => {
    const wk = weekKey(), mo = monthKey();
    // Spoils from the period that just ended stay claimable.
    const [week, month, prevWeek, prevMonth, topRes] = await Promise.all([
      periodView(db, wk, me), periodView(db, mo, me), periodView(db, prevPeriodKey(wk), me), periodView(db, prevPeriodKey(mo), me),
      db.prepare("SELECT p.name, c.kills, c.waves FROM realm_contrib c JOIN players p ON p.id = c.player_id WHERE c.period = ? AND p.hidden = 0 ORDER BY c.kills DESC LIMIT 3").bind(wk).all(),
    ]);
    const bl = blessing(week.reached, month.reached);
    const top = topRes.results;
    // Why this period's goals are what they are (shown on the Realm screen).
    const [bw, bm] = await Promise.all([prevBasis(db, wk), prevBasis(db, mo)]);
    week.basis = goalBasis('week', bw); month.basis = goalBasis('month', bm);
    const map = await mapView(db, me);
    return {
      name: REALM.name, week, month, prev: { week: prevWeek, month: prevMonth }, top, map,
      blessing: { perks: bl.perks, text: bl.text, weekTiers: bl.weekTiers, monthTiers: bl.monthTiers, week: wk, month: mo },
      claimable: week.claimable + month.claimable + prevWeek.claimable + prevMonth.claimable,
    };
  },

  'POST realm/claim': async ({ db, me, body }) => {
    const wk = weekKey(), mo = monthKey();
    const allowed = [wk, mo, prevPeriodKey(wk), prevPeriodKey(mo)];
    const key = String(body.period || '');
    if (!allowed.includes(key)) bad('That campaign is too old to claim.');
    if ((await rateLimit(db, 'rclaim:' + me.id, 30, 3600)) < 0) bad('Slow down a little', 429);
    const v = await periodView(db, key, me);
    if (!v.eligible) bad(`Defeat at least ${v.minKills} enemies in this campaign to share the spoils.`);
    let renown = 0;
    for (let i = 0; i < v.tiers.length; i++) {
      const t = v.tiers[i];
      if (!t.reached || t.claimed) continue;
      const res = await db.prepare('INSERT OR IGNORE INTO realm_claims (player_id, period, tier) VALUES (?, ?, ?)').bind(me.id, key, i).run();
      if (res.meta?.changes) renown += t.renown;
    }
    // Monthly podium titles, once the month has ended.
    let title = null;
    if (v.kind === 'month' && Date.now() >= v.endsAt && v.reached >= 1) {
      const rank = (await db.prepare('SELECT COUNT(*) + 1 AS r FROM realm_contrib WHERE period = ? AND kills > ?').bind(key, v.mine.kills).first()).r;
      if (rank <= 3) {
        const res = await db.prepare('INSERT OR IGNORE INTO realm_claims (player_id, period, tier) VALUES (?, ?, 100)').bind(me.id, key).run();
        if (res.meta?.changes) title = `${REALM.month.topTitles[rank - 1]} · ${key.slice(2)}`;
      }
    }
    return { renown, title };
  },

  'GET realm/board': async ({ db, me, url }) => {
    const per = ['week', 'month', 'all'].includes(url.searchParams.get('period')) ? url.searchParams.get('period') : 'week';
    const col = { kills: 'kills', waves: 'waves', hero: 'hero' }[url.searchParams.get('sort')] || 'kills';
    const key = per === 'all' ? 'all' : per === 'month' ? monthKey() : weekKey();
    const rows0 = await cached(`rb:${key}:${col}`, 20, async () => (await db.prepare(`SELECT c.player_id AS id, c.kills, c.waves, c.hero, p.name, p.title, cl.tag AS clan FROM realm_contrib c JOIN players p ON p.id = c.player_id LEFT JOIN clans cl ON cl.id = p.clan_id WHERE c.period = ? AND p.hidden = 0 ORDER BY c.${col} DESC, c.kills DESC LIMIT 50`).bind(key).all()).results);
    let total;
    if (key === 'all') total = (await db.prepare("SELECT COALESCE(SUM(kills), 0) AS kills, COALESCE(SUM(waves), 0) AS waves, COALESCE(SUM(hero), 0) AS hero FROM realm_contrib WHERE period = 'all'").first());
    else { const p = await ensurePeriod(db, key); total = { kills: p.kills, waves: p.waves, hero: p.hero }; }
    const blocked = new Set((await db.prepare('SELECT blocked FROM blocks WHERE player_id = ?').bind(me.id).all()).results.map((r) => r.blocked));
    const rows = rows0.filter((r) => !blocked.has(r.id)).map((r, i) => ({ ...r, rank: i + 1, share: total.kills ? r.kills / total.kills : 0 }));
    const mine = await db.prepare('SELECT kills, waves, hero FROM realm_contrib WHERE period = ? AND player_id = ?').bind(key, me.id).first();
    let meRow = null;
    if (mine) {
      const rank = (await db.prepare(`SELECT COUNT(*) + 1 AS r FROM realm_contrib c JOIN players p ON p.id = c.player_id WHERE c.period = ? AND c.${col} > ? AND p.hidden = 0`).bind(key, mine[col]).first()).r;
      meRow = { ...mine, rank, share: total.kills ? mine.kills / total.kills : 0 };
    }
    return { period: key, sort: col, rows, me: meRow, total };
  },

  // The front line at a glance: the common enemy, today's rally, who is fighting, and the latest deeds.
  'GET front': async ({ db, me }) => {
    const shared = await cached('front', 15, async () => {
      const s = await currentSiege(db);
      const [def, online] = await Promise.all([
        db.prepare('SELECT COUNT(*) AS n FROM siege_contrib WHERE siege_id = ?').bind(s.id).first(),
        db.prepare('SELECT COUNT(*) AS n FROM players WHERE last_seen > ? AND hidden = 0').bind(now() - ONLINE_MS).first(),
      ]);
      return { siege: { name: s.name, hp: s.hp, maxHp: s.max_hp, endsAt: s.ends, defeated: !!s.defeated, defenders: def.n }, online: online.n };
    });
    const [mine, rally, feed] = await Promise.all([
      db.prepare('SELECT damage FROM siege_contrib WHERE siege_id = ? AND player_id = ?').bind('siege-' + Math.floor(now() / (SIEGE.durationDays * 86400000)), me.id).first(),
      rallyView(db, me),
      feedRows(db, me, 4),
    ]);
    return { siege: { ...shared.siege, yourDamage: mine?.damage || 0 }, online: shared.online, rally, feed };
  },

  'GET realm/feed': async ({ db, me }) => ({ items: await feedRows(db, me, 25) }),

  'POST realm/cheer': async ({ db, me, body }) => {
    const id = body.id | 0;
    const it = await db.prepare('SELECT id, player_id, kind FROM realm_feed WHERE id = ?').bind(id).first();
    if (!it) bad('That deed is gone.', 404);
    if (it.player_id === me.id) bad('Save your cheers for someone else.');
    if (it.kind === 'realm' || it.kind === 'rally' || it.kind === 'map') bad('That one belongs to everybody.');
    if ((await rateLimit(db, 'cheer:' + me.id, 40, 86400)) < 0) bad('You have cheered plenty today.', 429);
    const res = await db.prepare('INSERT OR IGNORE INTO feed_cheers (feed_id, player_id) VALUES (?, ?)').bind(id, me.id).run();
    if (res.meta?.changes) await db.prepare('UPDATE realm_feed SET cheers = cheers + 1 WHERE id = ?').bind(id).run();
    const row = await db.prepare('SELECT cheers FROM realm_feed WHERE id = ?').bind(id).first();
    return { ok: true, cheers: row.cheers };
  },

  // Personal and Realm-wide numbers for the Chronicle screen.
  'GET stats': async ({ db, me }) => {
    const shared = await cached('stats', 60, async () => {
      const [pl, act, onl, all, runs, today, deep, sieges, rally] = await Promise.all([
        db.prepare('SELECT COUNT(*) AS n FROM players WHERE hidden = 0').first(),
        db.prepare('SELECT COUNT(*) AS n FROM players WHERE last_seen > ? AND hidden = 0').bind(now() - 86400000).first(),
        db.prepare('SELECT COUNT(*) AS n FROM players WHERE last_seen > ? AND hidden = 0').bind(now() - ONLINE_MS).first(),
        db.prepare("SELECT COALESCE(SUM(kills), 0) AS kills, COALESCE(SUM(waves), 0) AS waves, COALESCE(SUM(hero), 0) AS hero FROM realm_contrib WHERE period = 'all'").first(),
        db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(duration), 0) AS secs FROM runs').first(),
        db.prepare('SELECT COUNT(*) AS n FROM runs WHERE created > ?').bind(realmDayEnd(shiftDay(realmDay(), -1))).first(),
        db.prepare('SELECT name, best_wave AS wave FROM players WHERE hidden = 0 ORDER BY best_wave DESC LIMIT 1').first(),
        db.prepare('SELECT COUNT(*) AS n FROM siege WHERE defeated = 1').first(),
        db.prepare('SELECT COUNT(*) AS n FROM rally WHERE done = 1').first(),
      ]);
      return { citizens: pl.n, activeDay: act.n, online: onl.n, kills: all.kills, waves: all.waves, hero: all.hero, runs: runs.n, hours: Math.round(runs.secs / 360) / 10, runsToday: today.n, deepest: deep && deep.wave ? { name: deep.name, wave: deep.wave } : null, siegesWon: sieges.n, rallyWins: rally.n };
    });
    const wk = weekKey();
    const [tot, recent, wkRow, allRow, cheers, dmg, rallies] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS runs, COALESCE(SUM(kills), 0) AS kills, COALESCE(SUM(hero_kills), 0) AS hero, COALESCE(SUM(duration), 0) AS secs, COALESCE(MAX(wave), 0) AS best FROM runs WHERE player_id = ?').bind(me.id).first(),
      db.prepare('SELECT wave FROM runs WHERE player_id = ? ORDER BY id DESC LIMIT 20').bind(me.id).all(),
      db.prepare('SELECT kills, waves FROM realm_contrib WHERE period = ? AND player_id = ?').bind(wk, me.id).first(),
      db.prepare("SELECT kills, waves, hero FROM realm_contrib WHERE period = 'all' AND player_id = ?").bind(me.id).first(),
      db.prepare('SELECT COALESCE(SUM(cheers), 0) AS n FROM realm_feed WHERE player_id = ?').bind(me.id).first(),
      db.prepare('SELECT COALESCE(SUM(damage), 0) AS n FROM siege_contrib WHERE player_id = ?').bind(me.id).first(),
      db.prepare('SELECT COUNT(*) AS n FROM rally_contrib WHERE player_id = ? AND rewarded = 1').bind(me.id).first(),
    ]);
    let weekRank = null, weekCitizens = 0, allShare = 0;
    const [wc, ac] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS n FROM realm_contrib WHERE period = ? AND kills > 0').bind(wk).first(),
      db.prepare("SELECT COALESCE(SUM(kills), 0) AS n FROM realm_contrib WHERE period = 'all'").first(),
    ]);
    weekCitizens = wc.n;
    if (wkRow && wkRow.kills > 0) weekRank = (await db.prepare('SELECT COUNT(*) + 1 AS r FROM realm_contrib WHERE period = ? AND kills > ?').bind(wk, wkRow.kills).first()).r;
    if (allRow && ac.n) allShare = allRow.kills / ac.n;
    const waves = recent.results.map((r) => r.wave);
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    return {
      realm: shared,
      you: {
        runs: tot.runs, kills: tot.kills, hero: tot.hero, hours: Math.round(tot.secs / 360) / 10, bestWave: tot.best,
        weekKills: wkRow?.kills || 0, weekWaves: wkRow?.waves || 0, weekRank, weekCitizens, allShare,
        cheers: cheers.n, siegeDamage: dmg.n, rallies: rallies.n,
        recentWaves: waves.slice().reverse(), avgRecent: avg(waves.slice(0, 10)), avgBefore: avg(waves.slice(10, 20)),
      },
    };
  },

  // Worldwide play statistics: which towers kill, what people build and pick. ?period=week for this ISO week, otherwise all time.
  'GET world': async ({ db, url }) => {
    const week = url.searchParams.get('period') === 'week';
    const period = week ? seasonKey() : 'all';
    await worldRollup(db).catch((e) => console.error('world rollup', e));
    const data = await cached('world:' + period, 30, () => readWorld(db, period));
    const people = await cached('world:people', 300, async () => {
      const [all, wk, onl] = await Promise.all([
        db.prepare('SELECT COUNT(*) AS n FROM players WHERE hidden = 0').first(),
        db.prepare('SELECT COUNT(*) AS n FROM players WHERE last_seen > ? AND hidden = 0').bind(now() - 7 * 86400000).first(),
        db.prepare('SELECT COUNT(*) AS n FROM players WHERE last_seen > ? AND hidden = 0').bind(now() - ONLINE_MS).first(),
      ]);
      return { citizens: all.n, activeWeek: wk.n, online: onl.n };
    });
    return { period: week ? 'week' : 'all', weekKey: seasonKey(), ...data, people };
  },

  'GET siege': async ({ db, me }) => {
    const s = await currentSiege(db);
    const mine = await db.prepare('SELECT damage FROM siege_contrib WHERE siege_id = ? AND player_id = ?').bind(s.id, me.id).first();
    const top = (await db.prepare('SELECT p.id, p.name, sc.damage FROM siege_contrib sc JOIN players p ON p.id = sc.player_id WHERE sc.siege_id = ? AND p.hidden = 0 ORDER BY sc.damage DESC LIMIT 10').bind(s.id).all()).results;
    const defenders = (await db.prepare('SELECT COUNT(*) AS n FROM siege_contrib WHERE siege_id = ?').bind(s.id).first()).n;
    return { name: s.name, hp: s.hp, maxHp: s.max_hp, endsAt: s.ends, defeated: !!s.defeated, yourDamage: mine?.damage || 0, top, defenders };
  },

  'POST unblock': async ({ db, me, body }) => {
    await db.prepare('DELETE FROM blocks WHERE player_id = ? AND blocked = ?').bind(me.id, String(body.id || '')).run();
    return { ok: true };
  },

  'GET blocks': async ({ db, me }) => ({ blocked: (await db.prepare('SELECT p.id, p.name FROM blocks b JOIN players p ON p.id = b.blocked WHERE b.player_id = ?').bind(me.id).all()).results }),

  'POST report': async ({ db, me, body }) => {
    const target = String(body.id || '');
    if (!target || target === me.id) bad('Invalid report');
    if ((await rateLimit(db, 'report:' + me.id, 10, 86400)) < 0) bad('Report limit reached for today', 429);
    await db.prepare('INSERT OR IGNORE INTO reports (reporter, target, created) VALUES (?, ?, ?)').bind(me.id, target, now()).run();
    await db.prepare('UPDATE players SET reports = (SELECT COUNT(*) FROM reports WHERE target = ?), hidden = CASE WHEN hidden = 0 AND (SELECT COUNT(*) FROM reports WHERE target = ?) >= 5 THEN 1 ELSE hidden END WHERE id = ?').bind(target, target, target).run();
    return { ok: true };
  },

  'POST block': async ({ db, me, body }) => {
    const target = String(body.id || '');
    if (!target || target === me.id) bad('Invalid');
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO blocks (player_id, blocked) VALUES (?, ?)').bind(me.id, target),
      db.prepare('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').bind(me.id, target, target, me.id),
      db.prepare('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)').bind(me.id, target, target, me.id),
    ]);
    return { ok: true };
  },

  'GET season/claim': async ({ db, me }) => {
    const prev = prevSeasonKey();
    const done = await db.prepare('SELECT 1 FROM season_claims WHERE player_id = ? AND season = ?').bind(me.id, prev).first();
    if (done) return { title: null };
    const mb = await db.prepare("SELECT value FROM bests WHERE player_id = ? AND board = 'wave' AND period = ?").bind(me.id, prev).first();
    if (!mb) return { title: null };
    const rank = (await db.prepare("SELECT COUNT(*) + 1 AS r FROM bests WHERE board = 'wave' AND period = ? AND value > ?").bind(prev, mb.value).first()).r;
    if (rank > 10) return { title: null };
    await db.prepare('INSERT OR IGNORE INTO season_claims (player_id, season) VALUES (?, ?)').bind(me.id, prev).run();
    return { title: rank === 1 ? `${prev} Champion` : rank <= 3 ? `${prev} Vanguard` : `${prev} Hero`, rank };
  },
};

const PUBLIC = new Set(['GET health', 'POST register', 'POST recover']);

// The owner's admin panel (server/admin.js). It shares this file's helpers; its routes answer under /api/admin/* and need the ADMIN_KEY secret.
const admin = makeAdmin({ bad, now, sha256, rateLimit, rateLeft, cleanName, ensurePeriod, ensureRally, currentSiege, prevBasis, memCache, mapState });

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = (Array.isArray(params.path) ? params.path.join('/') : params.path || '').replace(/\/+$/, '');
  const key = `${request.method} ${path}`;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const isAdmin = path === 'admin' || path.startsWith('admin/');
  if (key === 'GET admin/status') return json({ enabled: admin.enabled(env) });
  const handler = isAdmin ? admin.routes[key] : routes[key];
  if (!handler) return json({ error: 'Not found' }, 404);
  try {
    if (key === 'GET health') return json(await handler({ env }));
    if (isAdmin && !admin.enabled(env)) return json({ error: 'Not found' }, 404);
    if (!env.DB) return json({ error: 'The server has no database connected yet.' }, 503);
    const db = env.DB;
    await ensureSchema(db);
    // The admin key is checked before anything else is read from the request.
    const gate = isAdmin ? await admin.gate(request, env, db) : null;
    const body = request.method === 'POST' ? await readBody(request) : {};
    const me = isAdmin || PUBLIC.has(key) ? null : await auth(request, db);
    return json(await handler({ db, env, request, url, body, me, ip: gate?.ip }));
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong on the server.' }, 500);
  }
}
