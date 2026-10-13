// Codex medals: a bronze, silver and gold medal for every foe, boss and emplacement, earned by playing with it.
// Each medal pays Renown once, and the share of the codex you have completed earns titles and a small permanent Renown bonus.
import { ENEMIES, BOSSES, TOWERS, TOWER_ORDER } from '../data/balance.js';

export const MEDAL_TIERS = [
  { id: 'bronze', name: 'Bronze', icon: '🥉', reward: 15 },
  { id: 'silver', name: 'Silver', icon: '🥈', reward: 45 },
  { id: 'gold',   name: 'Gold',   icon: '🥇', reward: 120 },
];

// Share of the codex completed → title (and +1% Renown for each title held, so +4% at the top).
export const CODEX_TITLES = [
  { frac: 0.25, name: 'Chronicler' }, { frac: 0.5, name: 'Loremaster' }, { frac: 0.75, name: 'Archivist' }, { frac: 1, name: 'Grand Archivist' },
];

// Rare foes need fewer kills for the same medal.
const foeScale = (id, w) => (id === 'spider' ? 0.6 : w >= 3 ? 1 : w >= 1.2 ? 0.6 : 0.3);

let cache = null;
// Everything that can earn medals: { key, kind, id, name, goals: [bronze, silver, gold], verb, stat(profile) }.
export function medalSubjects() {
  if (cache) return cache;
  const out = [];
  for (const [id, d] of Object.entries(ENEMIES)) {
    const sc = foeScale(id, d.weight);
    out.push({ key: 'foe:' + id, kind: 'foe', id, name: d.name, goals: [50, 500, 5000].map((n) => Math.max(5, Math.round((n * sc) / 5) * 5)), verb: 'defeated', stat: (p) => p.stats?.killsByType?.[id] || 0 });
  }
  for (const b of BOSSES) out.push({ key: 'boss:' + b.id, kind: 'boss', id: b.id, name: b.name, goals: [1, 5, 25], verb: 'defeated', stat: (p) => p.stats?.killsByType?.[b.id] || 0 });
  for (const id of TOWER_ORDER) out.push({ key: 'tower:' + id, kind: 'tower', id, name: TOWERS[id].name, goals: [10, 100, 1000], verb: 'built', stat: (p) => p.stats?.builtByTower?.[id] || 0 });
  return (cache = out);
}

export const subjectFor = (key) => medalSubjects().find((s) => s.key === key) || null;

// How many medals (0–3) the player's stats currently deserve for one subject.
export function tiersFor(p, subject) {
  const v = subject.stat(p);
  return subject.goals.filter((g) => v >= g).length;
}

export function medalTotal() { return medalSubjects().length * MEDAL_TIERS.length; }
export function medalsEarned(p) { return Object.values(p.medals || {}).reduce((a, n) => a + n, 0); }

export function codexProgress(p) {
  const earned = medalsEarned(p), total = medalTotal(), frac = total ? earned / total : 0;
  const titles = CODEX_TITLES.filter((t) => frac >= t.frac - 1e-9);
  const next = CODEX_TITLES.find((t) => frac < t.frac - 1e-9) || null;
  return { earned, total, frac, titles, next, needForNext: next ? Math.ceil(next.frac * total) - earned : 0 };
}

export function medalBonus(p) { return 0.01 * codexProgress(p).titles.length; }

// Award any medals the stats now earn. Returns the new ones: [{ key, name, tier, medal, reward }].
// (Renown is added by the caller; codex titles are granted here.)
export function checkMedals(p) {
  p.medals = p.medals || {};
  const fresh = [];
  for (const s of medalSubjects()) {
    const have = p.medals[s.key] || 0, now = tiersFor(p, s);
    for (let t = have; t < now; t++) fresh.push({ key: s.key, name: s.name, kind: s.kind, tier: t, medal: MEDAL_TIERS[t], reward: MEDAL_TIERS[t].reward, goal: s.goals[t], verb: s.verb });
    if (now > have) p.medals[s.key] = now;
  }
  for (const t of codexProgress(p).titles) if (!p.titles.includes(t.name)) p.titles.push(t.name);
  return fresh;
}
