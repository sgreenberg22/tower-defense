// Worldwide play statistics, shared by the server, the client and the tests (everything here is pure).
//
// Every accepted run sends a small "usage" record: what it built, which towers got the kills, what it picked. The server keeps those
// records until it folds them (foldUsage) into one JSON blob per category, per period ('all' and the ISO week). The World Stats screen
// reads the blobs back and turns them into rows with summarizeWorld().
import { TOWERS, TOWER_ORDER, ENEMIES, BOSSES, WEAPONS, ABILITIES, BOONS, MODIFIERS } from '../data/balance.js';
import { MAPS, MAP_ORDER } from './maps.js';

export const WORLD_CATS = ['tot', 'tower', 'spec', 'weapon', 'art', 'boon', 'foe', 'map', 'asc', 'mod', 'mode', 'hist'];
// A run lands in the bucket whose lower bound is the largest one at or below its wave.
export const HIST_BUCKETS = [1, 5, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200];
export const histBucket = (w) => { let b = HIST_BUCKETS[0]; for (const x of HIST_BUCKETS) if (w >= x) b = x; return b; };
export const histLabel = (b) => { const i = HIST_BUCKETS.indexOf(b); return i < 0 ? String(b) : i === HIST_BUCKETS.length - 1 ? `${b}+` : `${b}–${HIST_BUCKETS[i + 1] - 1}`; };

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const MODES = ['normal', 'daily', 'challenge', 'march', 'gauntlet', 'laststand', 'sprint'];
const sum = (o) => Object.values(o || {}).reduce((a, n) => a + n, 0);

// ---------- client side: the record a finished run sends ----------
export function buildUsage(s) {
  const round = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, Math.round(v)]));
  return {
    tb: s.builtByTower || {}, tk: s.killsByTower || {}, td: round(s.dmgByTower), hd: Math.round(s.heroDmg || 0),
    fk: s.killsByType || {}, sp: s.specs || [], au: s.artUses || {}, bn: s.boons || {}, bk: s.bossKills | 0,
  };
}

// ---------- server side: never trust the client's keys or numbers ----------
const int = (v, max) => { v = Math.floor(Number(v)); return Number.isFinite(v) && v > 0 ? Math.min(v, max) : 0; };
function pickCounts(obj, valid, max) {
  const out = {};
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) for (const k of Object.keys(obj).slice(0, 120)) if (valid(k)) { const n = int(obj[k], max); if (n) out[k] = n; }
  return out;
}
const validFoe = (k) => has(ENEMIES, k) || BOSSES.some((b) => b.id === k);
const validSpec = (k) => { const [t, s] = String(k).split(':'); return has(TOWERS, t) && !!TOWERS[t].specs && has(TOWERS[t].specs, s); };

// `ctx` is what the server already validated for the run: map, mode, ascension, modifiers, weapon, wave (the ranked wave),
// kills, heroKills, wavesCleared, duration. Returns the compact record to store, or null when there is nothing usable.
export function cleanUsage(raw, ctx) {
  if (!ctx || !(ctx.kills >= 0)) return null;
  const u = {
    m: has(MAPS, ctx.map) ? ctx.map : 'other',
    md: MODES.includes(ctx.mode) ? ctx.mode : 'normal',
    as: Math.max(0, Math.min(10, ctx.ascension | 0)),
    wp: has(WEAPONS, ctx.weapon) ? ctx.weapon : 'longbow',
    mo: (Array.isArray(ctx.modifiers) ? ctx.modifiers : []).filter((m) => has(MODIFIERS, m)).slice(0, 8),
    w: Math.max(0, Math.min(2000, ctx.wave | 0)), k: ctx.kills | 0, hk: Math.min(ctx.heroKills | 0, ctx.kills | 0),
    wc: Math.max(0, Math.min(ctx.wavesCleared | 0, ctx.wave | 0)), secs: Math.max(0, ctx.duration | 0),
    bk: 0, hd: 0, tb: {}, tk: {}, td: {}, fk: {}, sp: [], au: {}, bn: {},
  };
  const r = raw && typeof raw === 'object' ? raw : {};
  const slack = u.k + 5;
  u.tb = pickCounts(r.tb, (k) => has(TOWERS, k), 400);
  u.td = pickCounts(r.td, (k) => has(TOWERS, k), 1e13);
  u.hd = int(r.hd, 1e13);
  // Kill tallies must add up to the run's own kill count, or they are dropped (the run still counts for everything else).
  const tk = pickCounts(r.tk, (k) => has(TOWERS, k), 1e9);
  if (sum(tk) + u.hk <= slack) u.tk = tk;
  const fk = pickCounts(r.fk, validFoe, 1e9);
  if (sum(fk) <= slack) { u.fk = fk; u.bk = Math.min(int(r.bk, 100), sum(pickCounts(fk, (k) => BOSSES.some((b) => b.id === k), 1e9))); }
  u.sp = [...new Set(Array.isArray(r.sp) ? r.sp.map(String).filter(validSpec) : [])].slice(0, 40);
  u.au = pickCounts(r.au, (k) => has(ABILITIES, k), 1000);
  u.bn = pickCounts(r.bn, (k) => BOONS.some((b) => b.id === k), 12);
  return u;
}

// ---------- folding records into counters ----------
export const emptyWorld = () => Object.fromEntries(WORLD_CATS.map((c) => [c, {}]));
const add = (o, k, n) => { o[k] = (o[k] || 0) + n; };
const entry = (cat, k) => cat[k] || (cat[k] = {});
const inc = (e, f, n = 1) => { e[f] = (e[f] || 0) + n; };

export function foldUsage(world, u) {
  const t = world.tot;
  add(t, 'runs', 1); add(t, 'kills', u.k); add(t, 'hero', u.hk); add(t, 'waves', u.wc); add(t, 'secs', u.secs);
  add(t, 'bosses', u.bk); add(t, 'built', sum(u.tb)); add(t, 'dmg', sum(u.td) + u.hd); add(t, 'herodmg', u.hd);
  add(t, 'arts', sum(u.au)); add(t, 'picks', sum(u.bn)); add(t, 'waveSum', u.w);
  if (Object.keys(u.tb).length) add(t, 'det', 1); // runs that sent build detail: the base for pick rates
  for (const id of new Set([...Object.keys(u.tb), ...Object.keys(u.tk), ...Object.keys(u.td)])) {
    const e = entry(world.tower, id);
    if (u.tb[id] > 0) inc(e, 'r');
    inc(e, 'b', u.tb[id] || 0); inc(e, 'k', u.tk[id] || 0); inc(e, 'd', u.td[id] || 0);
  }
  for (const s of u.sp) inc(entry(world.spec, s), 'r');
  const wp = entry(world.weapon, u.wp); inc(wp, 'r'); inc(wp, 'w', u.w); inc(wp, 'hk', u.hk); inc(wp, 'hd', u.hd);
  for (const [id, n] of Object.entries(u.au)) { const e = entry(world.art, id); inc(e, 'r'); inc(e, 'u', n); }
  for (const [id, n] of Object.entries(u.bn)) { const e = entry(world.boon, id); inc(e, 'r'); inc(e, 's', n); }
  for (const [id, n] of Object.entries(u.fk)) add(world.foe, id, n);
  const mp = entry(world.map, u.m); inc(mp, 'r'); inc(mp, 'w', u.w); inc(mp, 'k', u.k); mp.x = Math.max(mp.x || 0, u.w);
  const as = entry(world.asc, String(u.as)); inc(as, 'r'); inc(as, 'w', u.w); as.x = Math.max(as.x || 0, u.w);
  for (const m of u.mo) { const e = entry(world.mod, m); inc(e, 'r'); inc(e, 'w', u.w); }
  add(world.mode, u.md, 1);
  add(world.hist, String(histBucket(u.w)), 1);
  return world;
}

// ---------- reading the counters back ----------
const rate = (a, b) => (b > 0 ? a / b : 0);
const byDesc = (f) => (a, b) => f(b) - f(a);

export function summarizeWorld(world) {
  const w = { ...emptyWorld(), ...(world || {}) };
  const t = w.tot || {};
  const runs = t.runs || 0, kills = t.kills || 0, dmg = t.dmg || 0;
  const det = t.det || 0; // pick rates only count runs that reported what they built (older app versions report nothing)
  const towerKills = Object.values(w.tower).reduce((a, e) => a + (e.k || 0), 0);
  const towerDmg = Object.values(w.tower).reduce((a, e) => a + (e.d || 0), 0);
  const totals = {
    runs, kills, hero: t.hero || 0, waves: t.waves || 0, hours: Math.round(((t.secs || 0) / 3600) * 10) / 10, bosses: t.bosses || 0, built: t.built || 0,
    dmg, avgWave: Math.round(rate(t.waveSum || 0, runs) * 10) / 10, heroKillShare: rate(t.hero || 0, kills), heroDmgShare: rate(t.herodmg || 0, dmg),
    arts: t.arts || 0, picks: t.picks || 0, detailRuns: det,
  };
  // Who lands the kills: every tower type, plus the player's own weapon.
  const towers = Object.entries(w.tower).map(([id, e]) => {
    const T = TOWERS[id];
    return {
      id, name: T?.name || id, order: TOWER_ORDER.indexOf(id), runs: e.r || 0, pick: rate(e.r || 0, det), built: e.b || 0, kills: e.k || 0, dmg: e.d || 0,
      killShare: rate(e.k || 0, kills), dmgShare: rate(e.d || 0, dmg), killsPerTower: rate(e.k || 0, e.b || 0), dmgPerTower: rate(e.d || 0, e.b || 0),
      buildShare: rate(e.b || 0, t.built || 0),
    };
  }).filter((x) => TOWERS[x.id]).sort(byDesc((x) => x.kills));
  const specs = Object.entries(w.spec).map(([id, e]) => {
    const [tower, spec] = id.split(':');
    const S = TOWERS[tower]?.specs?.[spec];
    const base = w.tower[tower]?.r || 0;
    return { id, tower, spec, name: S?.name || spec, towerName: TOWERS[tower]?.name || tower, runs: e.r || 0, share: rate(e.r || 0, base), shareOfRuns: rate(e.r || 0, det) };
  }).filter((x) => TOWERS[x.tower]?.specs?.[x.spec]).sort(byDesc((x) => x.runs));
  const weapons = Object.entries(w.weapon).filter(([id]) => WEAPONS[id]).map(([id, e]) => ({
    id, name: WEAPONS[id].name || id, runs: e.r || 0, share: rate(e.r || 0, runs), avgWave: rate(e.w || 0, e.r || 0), heroKills: e.hk || 0, heroKillsPerRun: rate(e.hk || 0, e.r || 0), heroDmgPerRun: rate(e.hd || 0, e.r || 0),
  })).sort(byDesc((x) => x.runs));
  const arts = Object.entries(w.art).filter(([id]) => ABILITIES[id]).map(([id, e]) => ({
    id, name: ABILITIES[id].name || id, icon: ABILITIES[id].icon || '✦', runs: e.r || 0, share: rate(e.r || 0, det), uses: e.u || 0, perRun: rate(e.u || 0, e.r || 0),
  })).sort(byDesc((x) => x.runs));
  const boons = Object.entries(w.boon).map(([id, e]) => {
    const B = BOONS.find((b) => b.id === id);
    return B ? { id, name: B.name, desc: B.desc, rarity: B.rarity, runs: e.r || 0, share: rate(e.r || 0, det), picks: e.s || 0, avgStacks: rate(e.s || 0, e.r || 0) } : null;
  }).filter(Boolean).sort(byDesc((x) => x.runs));
  const foeKills = Object.values(w.foe).reduce((a, n) => a + n, 0);
  const foes = Object.entries(w.foe).map(([id, n]) => {
    const boss = BOSSES.find((b) => b.id === id);
    return { id, name: boss ? boss.name : ENEMIES[id]?.name || id, boss: !!boss, kills: n, share: rate(n, foeKills) };
  }).filter((x) => x.boss || ENEMIES[x.id]).sort(byDesc((x) => x.kills));
  const maps = Object.entries(w.map).filter(([id]) => MAPS[id]).map(([id, e]) => ({
    id, name: MAPS[id].name, order: MAP_ORDER.indexOf(id), runs: e.r || 0, share: rate(e.r || 0, runs), avgWave: rate(e.w || 0, e.r || 0), bestWave: e.x || 0, kills: e.k || 0,
  })).sort(byDesc((x) => x.runs));
  const ascs = Object.entries(w.asc).map(([id, e]) => ({ level: Number(id), runs: e.r || 0, share: rate(e.r || 0, runs), avgWave: rate(e.w || 0, e.r || 0), bestWave: e.x || 0 })).sort((a, b) => a.level - b.level);
  const mods = Object.entries(w.mod).filter(([id]) => MODIFIERS[id]).map(([id, e]) => ({ id, name: MODIFIERS[id].name || id, runs: e.r || 0, share: rate(e.r || 0, runs), avgWave: rate(e.w || 0, e.r || 0) })).sort(byDesc((x) => x.runs));
  const modes = MODES.map((id) => ({ id, runs: w.mode[id] || 0, share: rate(w.mode[id] || 0, runs) }));
  const hist = HIST_BUCKETS.map((b) => ({ bucket: b, label: histLabel(b), runs: w.hist[String(b)] || 0, share: rate(w.hist[String(b)] || 0, runs) }));
  return { totals, towers, specs, weapons, arts, boons, foes, maps, ascs, mods, modes, hist, sources: { towerKills, towerDmg, handKills: t.hero || 0, handDmg: t.herodmg || 0 } };
}
