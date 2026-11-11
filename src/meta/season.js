// The Season Road: a month-long reward track every run in every mode walks along. Each calendar month (Realm time)
// is a season with its own name; runs earn Season XP, XP climbs thirty tiers, and each tier holds a reward to collect.
// Past the last tier the road goes on as Laurels, so there is always something to earn before the month turns.
// Pure functions over the profile: nothing here touches the page or the network.
import { monthKey, periodBounds, localDateKey } from '../core/rng.js';

export const SEASON = {
  tiers: 30,
  tierBase: 200,       // XP for tier 1 ...
  tierStep: 20,        // ... and this much more for each tier after it (14,700 XP for the whole road)
  laurelXp: 900,       // past the last tier: XP per Laurel
  laurelRenown: 25,
  xp: { wave: 10, boss: 40, kill: 0.2, killCap: 300, stronghold: 60, victory: 60, daily: 150, record: 40 },
  minRun: 5,           // any finished run that held a wave or took a stronghold earns at least this
  keepPast: 24,        // seasons remembered on the profile
};

// One name a month, repeating each year: the season is named for its month, so everyone shares it.
export const SEASON_NAMES = [
  { name: 'Frostwatch', icon: '❄' }, { name: 'Thawgate', icon: '🌧' }, { name: 'Greenmarch', icon: '🌱' }, { name: 'Bloomtide', icon: '🌸' },
  { name: 'Sunward', icon: '🌤' }, { name: 'Highsummer', icon: '☀' }, { name: 'Goldfield', icon: '🌾' }, { name: 'Emberfall', icon: '🔥' },
  { name: 'Harvestmoon', icon: '🌕' }, { name: 'Ravenwind', icon: '🍂' }, { name: 'Duskhold', icon: '🌫' }, { name: 'Longnight', icon: '🌙' },
];

export function seasonInfo(now = new Date()) {
  const key = monthKey(now), [y, m] = key.slice(2).split('-').map(Number);
  const b = periodBounds(key, now), S = SEASON_NAMES[(m - 1) % 12];
  return { key, year: y, month: m, name: S.name, icon: S.icon, title: `${S.name} ${y}`, start: b.start, end: b.end, daysLeft: Math.max(0, Math.ceil((b.end - now.getTime()) / 86400000)) };
}
export const seasonNameOf = (key) => { const [y, m] = String(key).slice(2).split('-').map(Number); const S = SEASON_NAMES[((m || 1) - 1) % 12]; return `${S.name} ${y || ''}`.trim(); };

// XP needed to climb from tier t-1 to tier t (t = 1..tiers).
export const tierCost = (t) => SEASON.tierBase + SEASON.tierStep * (Math.max(1, t) - 1);
export const roadTotal = () => { let n = 0; for (let t = 1; t <= SEASON.tiers; t++) n += tierCost(t); return n; };

// Where a total of `xp` stands on the road.
export function seasonStanding(xp) {
  xp = Math.max(0, Math.floor(xp || 0));
  let tier = 0, left = xp;
  while (tier < SEASON.tiers && left >= tierCost(tier + 1)) { left -= tierCost(tier + 1); tier++; }
  if (tier < SEASON.tiers) return { tier, into: left, need: tierCost(tier + 1), frac: left / tierCost(tier + 1), laurels: 0, done: false };
  const laurels = Math.floor(left / SEASON.laurelXp), into = left - laurels * SEASON.laurelXp;
  return { tier, into, need: SEASON.laurelXp, frac: into / SEASON.laurelXp, laurels, done: true };
}

// What tier t pays. Every tier pays Renown; the fifths pay more; three of them carry a title for this season.
export function tierReward(t, key = monthKey()) {
  const name = seasonNameOf(key).split(' ')[0];
  if (t === SEASON.tiers) return { tier: t, renown: 200, title: `Champion of ${name}`, laurel: true, big: true };
  if (t === 20) return { tier: t, renown: 80, title: `${name} Vanguard`, big: true };
  if (t === 10) return { tier: t, renown: 60, title: `${name} Wayfarer`, big: true };
  if (t % 5 === 0) return { tier: t, renown: 60, big: true };
  return { tier: t, renown: 15 + 5 * Math.floor((t - 1) / 5) };
}
export const rewardText = (r) => [`✦ ${r.renown} Renown`, r.title ? `the title “${r.title}”` : '', r.laurel ? 'a Season Laurel' : ''].filter(Boolean).join(' · ');

const blank = (key) => ({ key, xp: 0, claimed: 0, laurelsPaid: 0, daily: '' });

// The profile's season, rolled over when the month has turned. A finished season's unclaimed rewards are paid at once
// (nothing is ever lost to the calendar) and the season is filed under `past`. Returns { S, rolled } where `rolled`
// describes the season that just ended, if one did.
export function ensureSeason(p, now = new Date()) {
  const key = monthKey(now);
  let rolled = null;
  if (!p.season || typeof p.season !== 'object') p.season = { ...blank(key), past: [], laurels: 0, done: 0 };
  const S = p.season;
  S.past ||= []; S.laurels |= 0; S.done |= 0;
  if (S.key !== key) {
    const got = claimSeason(p, now, true);
    const st = seasonStanding(S.xp);
    if (S.xp > 0) {
      S.past.push({ key: S.key, tier: st.tier, xp: S.xp, laurels: st.laurels });
      if (S.past.length > SEASON.keepPast) S.past.splice(0, S.past.length - SEASON.keepPast);
      rolled = { key: S.key, name: seasonNameOf(S.key), tier: st.tier, renown: got.renown, titles: got.titles };
    }
    Object.assign(S, blank(key));
  }
  return { S, rolled };
}

// Season XP for one finished run, itemised. Works for every mode: waves held, bosses, kills (capped, so a Last Stand
// does not dwarf everything else), strongholds taken on the attack, a win where the mode has one, and new records.
export function runXp(run, { records = 0, firstToday = false } = {}) {
  const X = SEASON.xp, parts = [];
  const add = (label, v) => { v = Math.round(v); if (v > 0) parts.push({ label, v }); };
  add('Waves held', X.wave * Math.max(0, run.wavesCleared || 0));
  add('Bosses felled', X.boss * Math.max(0, run.bossKills || 0));
  add('Foes defeated', Math.min(X.killCap, X.kill * Math.max(0, run.kills || 0)));
  add('Strongholds taken', X.stronghold * Math.max(0, run.taken || 0));
  if (run.victory) add('Victory', X.victory);
  if (records > 0) add('New record', X.record);
  let xp = parts.reduce((a, x) => a + x.v, 0);
  if (xp > 0 && xp < SEASON.minRun) { parts.push({ label: 'Taking the field', v: SEASON.minRun - xp }); xp = SEASON.minRun; }
  if (firstToday && xp > 0) { parts.push({ label: "Today's first run", v: X.daily }); xp += X.daily; }
  return { xp, parts };
}

// Credits a finished run to the season. Returns what the summary screen shows, or null when the run earned nothing.
export function progressSeason(p, run, { records = 0, now = new Date() } = {}) {
  const { S, rolled } = ensureSeason(p, now);
  const day = localDateKey(now);
  const before = seasonStanding(S.xp);
  const got = runXp(run, { records, firstToday: S.daily !== day });
  if (got.xp <= 0) return rolled ? { xp: 0, parts: [], before, after: before, rolled, tiersUp: 0 } : null;
  if (S.daily !== day) S.daily = day;
  S.xp += got.xp;
  const after = seasonStanding(S.xp);
  const s = p.stats || (p.stats = {});
  s.seasonXp = (s.seasonXp || 0) + got.xp;
  s.seasonTiers = (s.seasonTiers || 0) + (after.tier - before.tier);
  s.seasonBest = Math.max(s.seasonBest || 0, after.tier);
  if (after.done && !before.done) S.done++;
  return { xp: got.xp, parts: got.parts, before, after, rolled, tiersUp: after.tier - before.tier, claimable: seasonClaimable(p, now).count };
}

// Rewards earned but not yet collected.
export function seasonClaimable(p, now = new Date()) {
  const S = p.season;
  if (!S || S.key !== monthKey(now)) return { count: 0, renown: 0, tiers: [], laurels: 0 };
  const st = seasonStanding(S.xp), tiers = [];
  for (let t = (S.claimed | 0) + 1; t <= st.tier; t++) tiers.push(tierReward(t, S.key));
  const laurels = Math.max(0, st.laurels - (S.laurelsPaid | 0));
  return { count: tiers.length + laurels, renown: tiers.reduce((a, r) => a + r.renown, 0) + laurels * SEASON.laurelRenown, tiers, laurels };
}

// Collects every reward that is waiting. `closing` is the month-end sweep: it pays the season on the profile whatever
// the date is. Returns { renown, titles, tiers, laurels }.
export function claimSeason(p, now = new Date(), closing = false) {
  const S = p.season, out = { renown: 0, titles: [], tiers: 0, laurels: 0 };
  if (!S || (!closing && S.key !== monthKey(now))) return out;
  const st = seasonStanding(S.xp);
  for (let t = (S.claimed | 0) + 1; t <= st.tier; t++) {
    const r = tierReward(t, S.key);
    out.renown += r.renown; out.tiers++;
    if (r.title) { p.titles ||= []; if (!p.titles.includes(r.title)) { p.titles.push(r.title); out.titles.push(r.title); } }
    if (r.laurel) S.laurels = (S.laurels | 0) + 1;
  }
  S.claimed = Math.max(S.claimed | 0, st.tier);
  const due = Math.max(0, st.laurels - (S.laurelsPaid | 0));
  if (due) { out.renown += due * SEASON.laurelRenown; out.laurels = due; S.laurels = (S.laurels | 0) + due; S.laurelsPaid = st.laurels; }
  if (out.renown) { p.renown = (p.renown || 0) + out.renown; const s = p.stats || (p.stats = {}); s.renownEarned = (s.renownEarned || 0) + out.renown; }
  return out;
}

// One line for the home screen and the summary.
export function seasonLine(p, now = new Date()) {
  const info = seasonInfo(now), S = p.season && p.season.key === info.key ? p.season : blank(info.key);
  const st = seasonStanding(S.xp), c = seasonClaimable(p, now);
  return { info, st, claimable: c.count, text: st.done ? `Road complete · ${st.laurels} Laurel${st.laurels === 1 ? '' : 's'} beyond` : `Tier ${st.tier} of ${SEASON.tiers}`, sub: `${info.daysLeft} day${info.daysLeft === 1 ? '' : 's'} left` };
}
