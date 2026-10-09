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

export function utcDateKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

// ISO week key like "2026-W41" — seasons are weekly.
export function seasonKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function prevSeasonKey(d = new Date()) {
  return seasonKey(new Date(d.getTime() - 7 * 86400000));
}

// ---- Realm periods: "w:2026-W41" (ISO week, Monday UTC) and "m:2026-10" (calendar month, UTC). ----
export const weekKey = (d = new Date()) => 'w:' + seasonKey(d);
export const monthKey = (d = new Date()) => 'm:' + d.toISOString().slice(0, 7);
export function prevPeriodKey(key, d = new Date()) {
  if (key.startsWith('w:')) return weekKey(new Date(periodBounds(key, d).start - 86400000));
  return monthKey(new Date(periodBounds(key, d).start - 86400000));
}
// Start/end (ms) of the period named by `key`. A week key resolves relative to the date it was derived from.
export function periodBounds(key, d = new Date()) {
  if (key.startsWith('m:')) {
    const [y, m] = key.slice(2).split('-').map(Number);
    return { start: Date.UTC(y, m - 1, 1), end: Date.UTC(y, m, 1) };
  }
  const [y, wk] = key.slice(2).split('-W').map(Number);
  // ISO week 1 contains Jan 4th; Monday of that week + (wk-1) weeks.
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday1 = Date.UTC(y, 0, 4 - ((jan4.getUTCDay() || 7) - 1));
  const start = monday1 + (wk - 1) * 7 * 86400000;
  return { start, end: start + 7 * 86400000 };
}
