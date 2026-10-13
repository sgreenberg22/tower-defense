// Prestige ("Dynasty") logic. Pure functions over the profile so they are easy to test.
import { KEEP } from '../data/balance.js';
import { PRESTIGE, LEGACY, PRESTIGE_REWARDS } from '../data/prestige.js';
import { hashStr, mulberry32 } from '../core/rng.js';

export const emptyPrestige = () => ({ level: 0, base: 0, legacy: {}, history: [] });
export function ensurePrestige(p) {
  const x = p.prestige || (p.prestige = emptyPrestige());
  x.legacy = x.legacy || {}; x.history = x.history || [];
  return x;
}
export const prestigeLevel = (p) => p.prestige?.level || 0;

const ROMAN = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(n) {
  if (n <= 0) return '';
  if (n >= 40) return String(n);
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}

// Keep upgrades that a new Dynasty resets: everything that is a stat or a power-up. What stays: unlocks (towers, weapons, castle arts),
// the Wardrobe (cosmetics, titles) and Arsenal slots.
export function keepResets(node) {
  return !(node.id.startsWith('unlock_') || node.cosmetic || node.title || node.id === 'artslot');
}

// Renown earned in this Dynasty so far, and what is needed to ascend.
export function dynastyEarned(p) { return Math.max(0, (p.stats?.renownEarned || 0) - (p.prestige?.base || 0)); }
export function prestigeNeed(p) { return PRESTIGE.need(prestigeLevel(p)); }

export function prestigeStatus(p) {
  const need = prestigeNeed(p), have = dynastyEarned(p);
  return { level: prestigeLevel(p), need, have, frac: Math.min(1, have / need), ok: have >= need, next: prestigeLevel(p) + 1 };
}
export const canPrestige = (p) => prestigeStatus(p).ok;

// How much of the Keep a Dynasty reset would wipe (levels and Renown they cost), for the confirmation screen.
export function resetPreview(p) {
  let levels = 0, spent = 0;
  for (const n of KEEP) {
    if (!keepResets(n)) continue;
    const lv = p.keep?.[n.id] || 0;
    levels += lv; for (let i = 0; i < lv; i++) spent += n.cost[i];
  }
  return { levels, spent, unspent: p.renown || 0 };
}

// Three Legacy perks for the next ascension. Seeded so reloading the page shows the same offer.
export function legacyOffer(p) {
  const st = ensurePrestige(p);
  const pool = Object.keys(LEGACY).filter((id) => (st.legacy[id] || 0) < LEGACY[id].max);
  const rnd = mulberry32(hashStr(`legacy|${p.created || 0}|${st.level}`));
  const out = [];
  while (out.length < PRESTIGE.choices && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}

// What this Dynasty adds to every run. `renown` is a fraction added to the Renown bonus; the rest are run-bonus deltas.
export function prestigeBonus(p) {
  const st = p.prestige, L = st?.level || 0;
  const z = { renown: 0, towerDmg: 0, castleHpMult: 0, wallHpMult: 0, startGold: 0, killGold: 0, weaponDmg: 0, towerDiscount: 0, rerolls: 0, startPlots: 0, waveGold: 0, towerRange: 0, towerRate: 0, bossDmg: 0, cd: 1 };
  if (!L) return z;
  const pl = PRESTIGE.perLevel, cap = (x) => Math.min(x.cap, x.per * L);
  z.renown = cap(pl.renown); z.towerDmg = cap(pl.towerDmg); z.castleHpMult = cap(pl.hp); z.wallHpMult = cap(pl.hp); z.startGold = cap(pl.gold);
  for (const [id, n] of Object.entries(st.legacy || {})) {
    const perk = LEGACY[id]; if (!perk) continue;
    for (const [k, v] of Object.entries(perk.fx)) { if (k === 'cd') z.cd *= Math.pow(v, n); else z[k] += v * n; }
  }
  return z;
}

export const rewardsFor = (level) => PRESTIGE_REWARDS.find((r) => r.level === level) || null;

// Ascend. `perkId` must be one of legacyOffer(p). Returns the summary, or null if not allowed.
export function ascend(p, perkId, now = new Date()) {
  const st = ensurePrestige(p);
  if (!canPrestige(p) || !legacyOffer(p).includes(perkId)) return null;
  const before = resetPreview(p);
  st.level += 1;
  st.base = p.stats?.renownEarned || 0;
  st.legacy[perkId] = (st.legacy[perkId] || 0) + 1;
  for (const n of KEEP) if (keepResets(n)) delete p.keep[n.id];
  p.renown = PRESTIGE.endowment(st.level);
  const got = rewardsFor(st.level), gained = { cosmetic: null, title: null };
  if (got?.cosmetic && !p.owned.includes(got.cosmetic)) { p.owned.push(got.cosmetic); gained.cosmetic = got.cosmetic; }
  if (got?.title && !p.titles.includes(got.title)) { p.titles.push(got.title); gained.title = got.title; }
  st.history.push({ at: now.getTime(), level: st.level, perk: perkId, wave: Math.max(0, ...Object.values(p.best?.wave || {})), lost: before.spent });
  if (st.history.length > 40) st.history.splice(0, st.history.length - 40);
  return { level: st.level, endowment: p.renown, perk: LEGACY[perkId], reward: got, gained, lost: before };
}
