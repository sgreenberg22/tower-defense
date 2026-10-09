// Bastion Siege API — Cloudflare Pages Function. One router for /api/*.
// Binding: DB (D1). Without it the game still runs fully offline and the API answers 503.
import { validateRun, dailySetup } from '../../src/game/rules.js';
import { seasonKey, prevSeasonKey, utcDateKey, weekKey, monthKey, prevPeriodKey, periodBounds } from '../../src/core/rng.js';
import { GIFTS, GIFT_DAILY_CAP, CLAN_LEVELS, SIEGE, MODIFIERS, REALM } from '../../src/data/balance.js';
import { goalsFor, fraction, tiersReached, rewardFor, kindOf, blessing } from '../../src/game/realm.js';

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
`;

let schemaReady = null;
const memCache = new Map(); // per-isolate cache: key -> {t, v}
const MAX_CLAN = 30;
const MAX_FRIENDS = 100;
const ONLINE_MS = 5 * 60 * 1000;

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
      const have = await db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('realm_claims', 'realm_contrib', 'realm_period', 'realm_contrib_kills')").first();
      if (have && have.n >= 4) return;
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
    // Scale HP to last siege's turnout so small groups can still win.
    const prev = await db.prepare('SELECT COUNT(*) AS n FROM siege_contrib WHERE siege_id = ?').bind('siege-' + (period - 1)).first();
    const maxHp = Math.max(300000, (prev?.n || 0) * 60000);
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
  const kind = kindOf(key), c = REALM[kind];
  const prevActive = (await db.prepare('SELECT COUNT(*) AS n FROM realm_contrib WHERE period = ? AND kills >= ?').bind(prevPeriodKey(key), c.minKills).first()).n;
  const g = goalsFor(kind, prevActive), { start, end } = periodBounds(key);
  await db.prepare('INSERT OR IGNORE INTO realm_period (period, kind, goal_kills, goal_waves, starts, ends) VALUES (?, ?, ?, ?, ?, ?)').bind(key, kind, g.kills, g.waves, start, end).run();
  return get();
}
const periodFraction = (p) => fraction(p.kills, p.waves, { kills: p.goal_kills, waves: p.goal_waves });

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
async function realmCredit(db, me, eff, { runs = 1 } = {}) {
  const wk = weekKey(), mo = monthKey();
  const credit = async (key, kind) => {
    const cur = await db.prepare('SELECT kills FROM realm_contrib WHERE period = ? AND player_id = ?').bind(key, me.id).first();
    const kills = Math.max(0, Math.min(eff.kills, REALM[kind].cap - (cur?.kills || 0)));
    const share = eff.kills ? kills / eff.kills : 0;
    return { kills, waves: Math.round(eff.waves * share), hero: Math.round(eff.hero * share) };
  };
  const [cw, cm] = [await credit(wk, 'week'), await credit(mo, 'month')];
  const contribUp = (period, c) => db.prepare('INSERT INTO realm_contrib (period, player_id, kills, waves, hero, runs) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(period, player_id) DO UPDATE SET kills = kills + excluded.kills, waves = waves + excluded.waves, hero = hero + excluded.hero, runs = runs + excluded.runs').bind(period, me.id, c.kills, c.waves, c.hero, runs);
  const totalUp = (period, c) => db.prepare('UPDATE realm_period SET kills = kills + ?, waves = waves + ?, hero = hero + ? WHERE period = ?').bind(c.kills, c.waves, c.hero, period);
  return { cw, cm, stmts: [contribUp(wk, cw), contribUp(mo, cm), contribUp('all', eff), totalUp(wk, cw), totalUp(mo, cm)] };
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
      id: me.id, name: me.name, friendCode: me.friend_code, inbox: inbox.n, clan, rival, seasonReward,
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
      score: Math.floor(Number(body.score) || 0), kills: body.kills | 0, heroKills: body.heroKills | 0, duration: body.duration | 0,
      bossDmg: Math.max(0, Math.floor(Number(body.bossDmg) || 0)),
    };
    const reason = validateRun(r);
    if (reason) return { accepted: false, reason };
    const t = now(), season = seasonKey(), day = utcDateKey();
    // Realm contribution (capped per citizen per period so no single account can carry the nation).
    // Part of the run may already have been counted by mid-run syncs; only the remainder is added here.
    const syn = body.realmSynced || {};
    const wk = weekKey(), mo = monthKey();
    const wavesDone = Math.max(0, Math.min(r.wavesCleared, r.wave));
    const eff = {
      kills: Math.max(0, r.kills - Math.max(0, syn.kills | 0)),
      waves: Math.max(0, wavesDone - Math.max(0, syn.waves | 0)),
      hero: Math.max(0, r.heroKills - Math.max(0, syn.hero | 0)),
    };
    const [wp, mp] = [await ensurePeriod(db, wk), await ensurePeriod(db, mo)];
    const { stmts: realmStmts, cw, cm } = await realmCredit(db, me, eff);
    const upsert = (board, period, value) => db.prepare('INSERT INTO bests (player_id, board, period, value, updated) VALUES (?, ?, ?, ?, ?) ON CONFLICT(player_id, board, period) DO UPDATE SET value = MAX(value, excluded.value), updated = excluded.updated').bind(me.id, board, period, value, t);
    const stmts = [
      db.prepare('INSERT INTO runs (player_id, created, season, map, mode, seed, modifiers, ascension, wave, score, kills, hero_kills, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(me.id, t, season, r.map, r.mode, r.seed, r.modifiers.join(','), r.ascension, r.wave, r.score, r.kills, r.heroKills, r.duration),
      upsert('wave', season, r.wave), upsert('wave', 'all', r.wave), upsert('score', season, r.score), upsert('score', 'all', r.score),
      upsert('hero', season, r.heroKills), upsert('hero', 'all', r.heroKills),
      db.prepare('UPDATE players SET best_wave = MAX(best_wave, ?), title = ? WHERE id = ?').bind(r.wave, body.title ? String(body.title).slice(0, 24) : null, me.id),
      ...realmStmts,
    ];
    if (r.mode === 'daily' && r.seed === dailySetup(day).seed) stmts.push(upsert('daily', 'daily-' + day, r.score));
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
    const ranks = { wave: await rank('wave', season, best.value) };
    if (r.mode === 'daily') ranks.daily = await rank('daily', 'daily-' + day, r.score);
    const [wa, ma] = [await ensurePeriod(db, wk), await ensurePeriod(db, mo)];
    const brief = (before, after) => ({ fraction: periodFraction(after), before: periodFraction(before), reached: tiersReached(periodFraction(after)), reachedBefore: tiersReached(periodFraction(before)), kills: after.kills, waves: after.waves, goal: { kills: after.goal_kills, waves: after.goal_waves } });
    const realm = { added: { kills: Math.min(r.kills, cw.kills + Math.max(0, syn.kills | 0)), waves: Math.min(wavesDone, cw.waves + Math.max(0, syn.waves | 0)), capped: cw.kills < eff.kills }, week: brief(wp, wa), month: brief(mp, ma) };
    return { accepted: true, ranks, siege: { damage: s.defeated ? 0 : damage }, clan: clanXp ? { xp: clanXp } : null, realm };
  },

  'GET leaderboard': async ({ db, env, me, url }) => {
    const board = ['wave', 'score', 'daily', 'hero'].includes(url.searchParams.get('board')) ? url.searchParams.get('board') : 'wave';
    const scope = ['global', 'friends', 'clan'].includes(url.searchParams.get('scope')) ? url.searchParams.get('scope') : 'global';
    const periodArg = url.searchParams.get('period') === 'all' ? 'all' : 'week';
    const period = board === 'daily' ? 'daily-' + utcDateKey() : periodArg === 'all' ? 'all' : seasonKey();
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
    const giftsLeft = await rateLeft(db, `gift:${me.id}:${utcDateKey()}`, GIFT_DAILY_CAP);
    return { friends: rows.map((r) => ({ id: r.id, name: r.name, bestWave: r.bestWave, clan: r.clan, online: now() - r.last_seen < ONLINE_MS })), giftsLeft };
  },

  'POST friends/add': async ({ db, me, body }) => {
    const code = String(body.code || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) bad('Friend codes are 6 letters and numbers.');
    if ((await rateLimit(db, 'fadd:' + me.id, 30, 86400)) < 0) bad('Too many friend requests today', 429);
    const f = await db.prepare('SELECT id, name FROM players WHERE friend_code = ?').bind(code).first();
    if (!f) bad('No commander has that code.', 404);
    if (f.id === me.id) bad('That is your own code.');
    const n = await db.prepare('SELECT COUNT(*) AS n FROM friends WHERE a = ?').bind(me.id).first();
    if (n.n >= MAX_FRIENDS) bad(`You can have up to ${MAX_FRIENDS} friends.`);
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO friends (a, b, created) VALUES (?, ?, ?)').bind(me.id, f.id, now()),
      db.prepare('INSERT OR IGNORE INTO friends (a, b, created) VALUES (?, ?, ?)').bind(f.id, me.id, now()),
      db.prepare("INSERT INTO inbox (player_id, kind, title, body, payload, created, claimed) VALUES (?, 'note', ?, ?, '{}', ?, 1)").bind(f.id, `${me.name} added you as a friend`, 'You can now send each other aid.', now()),
    ]);
    return { ok: true, friend: { id: f.id, name: f.name } };
  },

  'POST friends/remove': async ({ db, me, body }) => {
    await db.batch([
      db.prepare('DELETE FROM friends WHERE a = ? AND b = ?').bind(me.id, String(body.id)),
      db.prepare('DELETE FROM friends WHERE a = ? AND b = ?').bind(String(body.id), me.id),
    ]);
    return { ok: true };
  },

  'POST gifts': async ({ db, me, body }) => {
    const kind = String(body.kind);
    if (!GIFTS[kind]) bad('Unknown gift');
    const to = String(body.to || '');
    const fr = await db.prepare('SELECT 1 FROM friends WHERE a = ? AND b = ?').bind(me.id, to).first();
    if (!fr) bad('You can only send aid to friends.', 403);
    const day = utcDateKey();
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
        members: members.map((m) => ({ name: m.name, bestWave: m.bestWave, weekKills: m.weekKills, role: m.id === c.leader ? 'leader' : 'member' })),
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
    if ((await rateLimit(db, 'rsync:' + me.id, 1, 6)) < 0) return { skipped: true };
    const kills = Math.max(0, Math.min(body.kills | 0, 3000)), waves = Math.max(0, Math.min(body.waves | 0, 60));
    const eff = { kills, waves, hero: Math.max(0, Math.min(body.hero | 0, kills)) };
    if (!eff.kills && !eff.waves) return { skipped: true };
    await Promise.all([ensurePeriod(db, weekKey()), ensurePeriod(db, monthKey())]);
    const { stmts } = await realmCredit(db, me, eff, { runs: 0 });
    await db.batch(stmts);
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
    return {
      name: REALM.name, week, month, prev: { week: prevWeek, month: prevMonth }, top,
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

  'GET siege': async ({ db, me }) => {
    const s = await currentSiege(db);
    const mine = await db.prepare('SELECT damage FROM siege_contrib WHERE siege_id = ? AND player_id = ?').bind(s.id, me.id).first();
    const top = (await db.prepare('SELECT p.name, sc.damage FROM siege_contrib sc JOIN players p ON p.id = sc.player_id WHERE sc.siege_id = ? AND p.hidden = 0 ORDER BY sc.damage DESC LIMIT 10').bind(s.id).all()).results;
    return { name: s.name, hp: s.hp, maxHp: s.max_hp, endsAt: s.ends, defeated: !!s.defeated, yourDamage: mine?.damage || 0, top };
  },

  'POST report': async ({ db, me, body }) => {
    const target = String(body.id || '');
    if (!target || target === me.id) bad('Invalid report');
    if ((await rateLimit(db, 'report:' + me.id, 10, 86400)) < 0) bad('Report limit reached for today', 429);
    await db.prepare('INSERT OR IGNORE INTO reports (reporter, target, created) VALUES (?, ?, ?)').bind(me.id, target, now()).run();
    await db.prepare('UPDATE players SET reports = (SELECT COUNT(*) FROM reports WHERE target = ?), hidden = CASE WHEN (SELECT COUNT(*) FROM reports WHERE target = ?) >= 5 THEN 1 ELSE hidden END WHERE id = ?').bind(target, target, target).run();
    return { ok: true };
  },

  'POST block': async ({ db, me, body }) => {
    const target = String(body.id || '');
    if (!target || target === me.id) bad('Invalid');
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO blocks (player_id, blocked) VALUES (?, ?)').bind(me.id, target),
      db.prepare('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').bind(me.id, target, target, me.id),
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

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = (Array.isArray(params.path) ? params.path.join('/') : params.path || '').replace(/\/+$/, '');
  const key = `${request.method} ${path}`;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const handler = routes[key];
  if (!handler) return json({ error: 'Not found' }, 404);
  try {
    if (key === 'GET health') return json(await handler({ env }));
    if (!env.DB) return json({ error: 'The server has no database connected yet.' }, 503);
    const db = env.DB;
    await ensureSchema(db);
    const body = request.method === 'POST' ? await readBody(request) : {};
    const me = PUBLIC.has(key) ? null : await auth(request, db);
    return json(await handler({ db, env, request, url, body, me }));
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong on the server.' }, 500);
  }
}
