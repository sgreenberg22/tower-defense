// Daily Supplies: the daily-streak Renown, delivered as a chest you open by hand once a day, on a seven-day track
// that ends in a Royal Chest. Missing a day restarts the track (the streak resets too). Pure functions over the profile.
import { localDateKey } from '../core/rng.js';

// What each day of the week-long track adds on top of the streak bonus. Day 7 is the big one.
export const SUPPLY_TRACK = [
  { day: 1, chest: 'wood',  extra: 0 },
  { day: 2, chest: 'wood',  extra: 10 },
  { day: 3, chest: 'iron',  extra: 25 },
  { day: 4, chest: 'wood',  extra: 15 },
  { day: 5, chest: 'iron',  extra: 40 },
  { day: 6, chest: 'wood',  extra: 25 },
  { day: 7, chest: 'royal', extra: 120 },
];
export const SUPPLY_LUCK = 0.12;   // chance the chest's streak Renown comes out doubled

// The streak bonus itself: the same Renown the daily streak has always paid.
export const streakBonus = (n) => Math.min(10 + Math.max(1, n) * 3, 60);

// Where the player stands on the track today (1..7) and what today's chest holds.
export function supplyToday(p, now = new Date()) {
  const n = Math.max(1, p.streak?.n || 1);
  const day = ((n - 1) % 7) + 1;
  const slot = SUPPLY_TRACK[day - 1];
  const today = localDateKey(now);
  const ready = p.streak?.day === today && p.supplyDay !== today;
  return { day, week: Math.floor((n - 1) / 7) + 1, streak: n, chest: slot.chest, base: streakBonus(n), extra: slot.extra, total: streakBonus(n) + slot.extra, ready };
}

// What tomorrow's chest will hold if the streak holds.
export function supplyTomorrow(p) {
  const n = Math.max(1, p.streak?.n || 1) + 1;
  const slot = SUPPLY_TRACK[(n - 1) % 7];
  return { day: slot.day, chest: slot.chest, total: streakBonus(n) + slot.extra };
}

// Opens today's chest: credits the Renown once per local day. Returns null if there is nothing to open.
export function claimSupplies(p, now = new Date(), rand = Math.random) {
  const s = supplyToday(p, now);
  if (!s.ready) return null;
  const lucky = rand() < SUPPLY_LUCK;
  const renown = (lucky ? s.base * 2 : s.base) + s.extra;
  p.renown = (p.renown || 0) + renown;
  p.stats.renownEarned = (p.stats.renownEarned || 0) + renown;
  p.supplyDay = localDateKey(now);
  p.supplyOpened = (p.supplyOpened || 0) + 1;
  return { ...s, renown, lucky };
}
