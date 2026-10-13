// Seasonal events, weekday blessings and commander ranks. Pure functions over the profile so they're easy to test.
import { EVENTS, THEMES, DAY_BLESSINGS, RANKS, EVENT_RENOWN_BONUS } from '../data/events.js';

const DAY = 86400000;

function span(ev, year) {
  const [m1, d1] = ev.from, [m2, d2] = ev.to;
  const start = Date.UTC(year, m1 - 1, d1);
  const end = Date.UTC(m2 < m1 ? year + 1 : year, m2 - 1, d2 + 1);   // exclusive end of the last day
  return { start, end };
}

// The event running at `now`, with its year key and days left, or null.
export function activeEvent(now = new Date()) {
  const t = now.getTime(), y = now.getUTCFullYear();
  for (const ev of EVENTS) for (const year of [y - 1, y]) {
    const w = span(ev, year);
    if (t >= w.start && t < w.end) return { ...ev, key: `${ev.id}-${year}`, year, start: w.start, end: w.end, daysLeft: Math.max(1, Math.ceil((w.end - t) / DAY)) };
  }
  return null;
}

export function nextEvent(now = new Date()) {
  const t = now.getTime(), y = now.getUTCFullYear();
  let best = null;
  for (const ev of EVENTS) for (const year of [y, y + 1]) {
    const w = span(ev, year);
    if (w.start > t && (!best || w.start < best.start)) best = { ...ev, start: w.start, daysUntil: Math.ceil((w.start - t) / DAY) };
  }
  return best;
}

export function blessingFor(now = new Date()) { return DAY_BLESSINGS[now.getUTCDay()]; }

// Theme the player sees: events win, otherwise none. settings.theme: 'auto' | 'off'.
export function currentTheme(p, now = new Date()) {
  if ((p.settings?.theme || 'auto') === 'off') return null;
  const ev = activeEvent(now);
  return ev ? { id: ev.theme, event: ev, ...THEMES[ev.theme] } : null;
}

export function eventState(p, ev) {
  p.events = p.events || {};
  return p.events[ev.key] || (p.events[ev.key] = { waves: 0, claimed: 0 });
}

export function nextReward(p, ev) {
  const st = eventState(p, ev);
  return ev.rewards[st.claimed] || null;
}

// Credit a finished run (waves held while the event ran). Pays out any rewards now earned.
// Returns { waves, gained: [{reward, renown, cosmetic?, title?, duplicate}] }.
export function progressEvent(p, run, now = new Date()) {
  const ev = activeEvent(now);
  if (!ev) return null;
  const st = eventState(p, ev);
  const add = Math.max(0, run.wavesCleared | 0);
  st.waves += add;
  const gained = [];
  while (st.claimed < ev.rewards.length && st.waves >= ev.rewards[st.claimed].at) {
    const r = ev.rewards[st.claimed++];
    let renown = r.renown || 0, duplicate = false;
    if (r.cosmetic) { if (p.owned.includes(r.cosmetic)) { duplicate = true; renown += 20; } else p.owned.push(r.cosmetic); }
    if (r.title) { if (p.titles.includes(r.title)) { duplicate = true; renown += 20; } else p.titles.push(r.title); }
    p.renown += renown; p.stats.renownEarned = (p.stats.renownEarned || 0) + renown;
    gained.push({ ...r, renown, duplicate });
  }
  return { event: ev, added: add, waves: st.waves, gained };
}

export function eventBonus(now = new Date()) { return activeEvent(now) ? EVENT_RENOWN_BONUS : 0; }

export function rankFor(lifetime) {
  let i = 0;
  RANKS.forEach((r, k) => { if (lifetime >= r.at) i = k; });
  const next = RANKS[i + 1] || null;
  return { index: i, name: RANKS[i].name, next, progress: next ? (lifetime - RANKS[i].at) / (next.at - RANKS[i].at) : 1 };
}

// Every rank with where the player stands on it, for the ladder screen.
export function rankLadder(lifetime) {
  const cur = rankFor(lifetime).index;
  return RANKS.map((r, i) => ({ name: r.name, at: r.at, state: i < cur ? 'done' : i === cur ? 'current' : 'locked', remaining: Math.max(0, r.at - lifetime) }));
}

// Grant titles for any ranks reached. Returns the ranks newly reached.
export function checkRank(p) {
  const r = rankFor(p.stats.renownEarned || 0);
  const had = p.rankIndex ?? 0;
  p.rankIndex = r.index;
  const fresh = [];
  for (let i = had + 1; i <= r.index; i++) { fresh.push(RANKS[i]); if (!p.titles.includes(RANKS[i].name)) p.titles.push(RANKS[i].name); }
  return fresh;
}
