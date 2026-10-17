// Small deterministic RNG utilities (mulberry32 + string hashing).

export function hashStr(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) { this.state = (typeof seed === 'number' ? seed : hashStr(String(seed))) >>> 0; }
  next() {
    let a = (this.state = (this.state + 0x6D2B79F5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  weighted(items, weightFn) {
    let total = 0;
    for (const it of items) total += weightFn(it);
    let r = this.next() * total;
    for (const it of items) { r -= weightFn(it); if (r <= 0) return it; }
    return items[items.length - 1];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
}

export function seedFor(...parts) { return hashStr(parts.join('|')); }

export function randomSeed() {
  return Math.floor(Math.random() * 0xffffffff).toString(36);
}

// The player's own calendar day (orders, streaks and the weekday blessing follow it; shared contests stay on UTC).
export function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// ---- Shared clocks run on US Central time (America/Chicago, DST included): the Daily Rally, daily challenge, weekly seasons and Realm periods all roll over at Central midnight. ----
// Before this instant (Oct 17 2026, 00:00 Central) the old UTC calendar applied, so a day already settled on UTC is never reopened.
export const CENTRAL_FROM = Date.UTC(2026, 9, 17, 5);
const CT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
function ctOffset(ms) {   // Central's offset from UTC at that instant, in ms (negative)
  const o = {}; for (const { type, value } of CT.formatToParts(ms)) o[type] = +value;
  return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - Math.floor(ms / 1000) * 1000;
}
// Calendar date {y, m, d} of an instant on the shared clock.
export function realmDate(d = new Date()) {
  const t = d.getTime();
  const u = new Date(t < CENTRAL_FROM ? t : t + ctOffset(t));
  return { y: u.getUTCFullYear(), m: u.getUTCMonth() + 1, d: u.getUTCDate() };
}
// The instant a calendar day starts on the shared clock (Central midnight; UTC midnight before the switch).
export function realmDayStart(y, m, d) {
  const utc = Date.UTC(y, m - 1, d);
  if (utc < CENTRAL_FROM) return utc;   // Oct 17 itself began at UTC midnight and runs to Oct 18 Central midnight
  return utc - ctOffset(utc + 6 * 3600000);
}
const pad = (n) => String(n).padStart(2, '0');
export function realmDay(d = new Date()) { const r = realmDate(d); return `${r.y}-${pad(r.m)}-${pad(r.d)}`; }
// Pure calendar arithmetic on a "YYYY-MM-DD" key.
export function shiftDay(key, n) { return new Date(Date.parse(key + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
// When the day named by `key` ends (the start of the next one).
export function realmDayEnd(key) { const [y, m, d] = shiftDay(key, 1).split('-').map(Number); return realmDayStart(y, m, d); }

// ISO week key like "2026-W41" — seasons are weekly.
export function seasonKey(d = new Date()) {
  const r = realmDate(d);
  const date = new Date(Date.UTC(r.y, r.m - 1, r.d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function prevSeasonKey(d = new Date()) {
  return seasonKey(new Date(d.getTime() - 7 * 86400000));
}

// ---- Realm periods: "w:2026-W41" (ISO week, Monday Central) and "m:2026-10" (calendar month, Central). ----
export const weekKey = (d = new Date()) => 'w:' + seasonKey(d);
export const monthKey = (d = new Date()) => { const r = realmDate(d); return `m:${r.y}-${pad(r.m)}`; };
export function prevPeriodKey(key, d = new Date()) {
  if (key.startsWith('w:')) return weekKey(new Date(periodBounds(key, d).start - 3600000));
  return monthKey(new Date(periodBounds(key, d).start - 3600000));
}
// Start/end (ms) of the period named by `key`. A week key resolves relative to the date it was derived from.
export function periodBounds(key, d = new Date()) {
  if (key.startsWith('m:')) {
    const [y, m] = key.slice(2).split('-').map(Number);
    return { start: realmDayStart(y, m, 1), end: realmDayStart(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) };
  }
  const [y, wk] = key.slice(2).split('-W').map(Number);
  // ISO week 1 contains Jan 4th; Monday of that week + (wk-1) weeks.
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday1 = Date.UTC(y, 0, 4 - ((jan4.getUTCDay() || 7) - 1));
  const at = (ms) => { const u = new Date(ms); return realmDayStart(u.getUTCFullYear(), u.getUTCMonth() + 1, u.getUTCDate()); };
  return { start: at(monday1 + (wk - 1) * 7 * 86400000), end: at(monday1 + wk * 7 * 86400000) };
}
