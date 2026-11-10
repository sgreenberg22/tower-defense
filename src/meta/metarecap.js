// v1.66 · Pure helpers for the profile, the Codex, save files and the offline notice. No DOM here.
import { ENEMIES, TOWERS } from '../data/balance.js';

// ---------- MT-20 · a checksum on exported saves (warns on a changed file, never blocks) ----------
export function saveChecksum(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export function packSave(profile) {
  const body = JSON.stringify({ ...profile, chk: undefined });
  return JSON.stringify({ ...JSON.parse(body), chk: saveChecksum(body) });
}
// → { obj, had, ok }: `had` is whether the file carried a checksum; `ok` is false only when it did and it no longer matches.
export function unpackSave(text) {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== 'object') throw new Error('bad');
  const chk = obj.chk;
  delete obj.chk;
  if (typeof chk !== 'string') return { obj, had: false, ok: true };
  return { obj, had: true, ok: saveChecksum(JSON.stringify(obj)) === chk };
}
export const saveFileName = (date = new Date()) => `bastion-siege-save-${date.toISOString().slice(0, 10)}.json`;

// ---------- MT-17 · the best run in each mode, in one grid ----------
export function modeGrid(p, names = {}) {
  const modes = p?.best?.modes || {};
  const title = (id) => names[id] || id.charAt(0).toUpperCase() + id.slice(1);
  return Object.entries(modes).map(([id, m]) => ({ id, name: title(id), runs: m.runs || 0, wave: m.wave || 0, clock: m.clock || 0, wins: m.wins || 0 }))
    .filter((r) => r.runs && (r.wave || r.clock || r.wins)).sort((a, b) => b.runs - a.runs);
}

// ---------- MT-22 / MT-23 · the bestiary ----------
export function foeKind(def, boss = false) { return boss ? 'boss' : def?.naval ? 'naval' : def?.air ? 'air' : 'ground'; }
export const FOE_FILTERS = [['all', 'All'], ['ground', 'Ground'], ['air', 'Air'], ['naval', 'Ships']];
export function filterFoes(entries, kind) { return kind === 'all' ? entries : entries.filter((e) => foeKind(ENEMIES[e.id]) === kind); }
// How much of a tower's damage gets through a foe's armour or magic resistance (1 = all of it).
export function damageThrough(towerType, def) {
  const T = TOWERS[towerType]; if (!T || !def) return 1;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (T.type === 'magic') return +(1 - clamp(def.mr || 0, -50, 80) / 100).toFixed(2);
  if (T.type === 'fire') return +(1 - clamp((def.armor || 0) * 0.5, 0, 80) / 100).toFixed(2);
  return +(1 - clamp(def.armor || 0, 0, 80) / 100).toFixed(2);
}
export function counterTowers(def, n = 3) {
  if (!def) return [];
  const air = !!def.air;
  return Object.keys(TOWERS).filter((id) => !air || TOWERS[id].targets?.includes('a')).filter((id) => air || TOWERS[id].targets?.includes('g') || !TOWERS[id].targets)
    .map((id) => ({ id, name: TOWERS[id].name, mult: damageThrough(id, def) })).sort((a, b) => b.mult - a.mult).slice(0, n);
}
export function counterLine(def, n = 3) {
  const c = counterTowers(def, n);
  return c.length ? `Gets through best: ${c.map((x) => `${x.name} ${Math.round(x.mult * 100)}%`).join(', ')}.` : '';
}

// ---------- SO-14 · what is missing offline ----------
export const OFFLINE_LOSSES = [
  'Leaderboards and daily boards', 'Friends, Allied Towers and salutes', 'Clans and clan goals', 'The World Siege boss',
  'The Realm map and the Daily Rally', 'Realm-wide Wonders and Decrees', 'Cloud account recovery',
];
export const OFFLINE_KEEPS = ['Every mode, run and your Keep', 'Your progress, saved on this device', 'Daily quests and Supplies', 'Friend challenge links'];
