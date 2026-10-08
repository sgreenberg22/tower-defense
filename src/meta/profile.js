// Local profile: progression, settings, history. Saved in localStorage; online sync is optional.
import { KEEP, TOWERS, WEAPONS, ASCENSION, CLAN_LEVELS } from '../data/balance.js';
import { ACHIEVEMENTS, DEFAULT_COSMETICS } from './achievements.js';
import { renownFor } from '../game/economy.js';
import { MAPS } from '../game/maps.js';
import { utcDateKey } from '../core/rng.js';

const KEY = 'bastion.profile.v1';
const RUN_KEY = 'bastion.run.v1';

const ADJ = ['Brave', 'Stout', 'Swift', 'Clever', 'Bold', 'Merry', 'Iron', 'Golden', 'Silent', 'Lucky', 'Grim', 'Noble'];
const NOUN = ['Otter', 'Badger', 'Falcon', 'Mason', 'Archer', 'Warden', 'Fox', 'Bear', 'Heron', 'Squire', 'Lynx', 'Ram'];

export function randomName() {
  const r = (a) => a[Math.floor(Math.random() * a.length)];
  return `${r(ADJ)} ${r(NOUN)}`;
}

function blankStats() {
  return {
    runs: 0, kills: 0, heroKills: 0, shots: 0, hits: 0, headshots: 0, bossKills: 0, towersBuilt: 0, wavesCleared: 0,
    goldEarned: 0, playTime: 0, maxCombo: 0, maxFlawlessStreak: 0, killsByType: {}, dmgByTower: {}, builtByTower: {},
    heroDmg: 0, renownEarned: 0, maxMastery: 0,
  };
}

export function defaultProfile() {
  return {
    v: 1, name: randomName(), created: Date.now(),
    renown: 0, keep: {}, weapon: 'longbow',
    achievements: {}, owned: [...DEFAULT_COSMETICS], equip: { castle: 'stone', trail: 'none', kill: 'poof', skin: 'classic' },
    titles: [], title: null,
    settings: { master: 0.8, sfx: 0.8, music: 0.35, muted: false, quality: 'high', dmgNumbers: 'hero', shake: true, reducedMotion: false, colorblind: false, uiScale: 1 },
    stats: blankStats(), best: { wave: {}, score: {} }, ascUnlocked: {}, maxAscCleared: 0, history: [], specsSeen: [],
    daily: {}, tutorialDone: false, online: null, reinforcements: [], social: {}, lastSeason: null,
  };
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile();
    const p = JSON.parse(raw);
    const d = defaultProfile();
    return { ...d, ...p, settings: { ...d.settings, ...p.settings }, stats: { ...d.stats, ...p.stats }, best: { ...d.best, ...p.best }, equip: { ...d.equip, ...p.equip } };
  } catch { return defaultProfile(); }
}

export function saveProfile(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full or blocked */ } }
export function saveRun(s) { try { localStorage.setItem(RUN_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
export function loadRun() { try { const r = localStorage.getItem(RUN_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
export function clearRun() { try { localStorage.removeItem(RUN_KEY); } catch { /* ignore */ } }

export function keepLevel(p, id) { return p.keep[id] || 0; }
export function keepNextCost(p, node) { const lv = keepLevel(p, node.id); return lv >= node.cost.length ? null : node.cost[lv]; }
export function buyKeep(p, id) {
  const node = KEEP.find((k) => k.id === id);
  const c = keepNextCost(p, node);
  if (c == null || p.renown < c) return false;
  p.renown -= c; p.keep[id] = keepLevel(p, id) + 1;
  saveProfile(p);
  return true;
}

export function unlockedTowers(p) {
  const s = new Set();
  for (const [id, t] of Object.entries(TOWERS)) if (!t.keep || keepLevel(p, t.keep) > 0) s.add(id);
  return s;
}
export function unlockedWeapons(p) {
  return Object.entries(WEAPONS).filter(([, w]) => !w.keep || keepLevel(p, w.keep) > 0).map(([id]) => id);
}

export function clanPerkLevel(clan) {
  if (!clan) return 0;
  let lv = 0;
  CLAN_LEVELS.forEach((l, i) => { if ((clan.xp || 0) >= l.xp) lv = i; });
  return lv;
}

export function runBonus(p, clan = null) {
  const k = (id) => keepLevel(p, id);
  const cl = clanPerkLevel(clan);
  return {
    castleHpMult: 1 + 0.1 * k('fortify'),
    startGold: 30 * k('warchest') + (cl >= 2 ? 40 : 0) + (cl >= 6 ? 80 : 0),
    killGold: 0.06 * k('bountyhunter') + (cl >= 1 ? 0.05 : 0) + (cl >= 5 ? 0.1 : 0),
    towerDiscount: 0.04 * k('architect'),
    sellBonus: 0.05 * k('salvage'),
    weaponDmg: 0.1 * k('marksman'),
    reloadMult: Math.pow(0.94, k('quickhands')),
    ammoAdd: k('deepquiver'),
    boonChoices: k('scholar'),
    secondWind: k('secondwind') > 0,
    repairDiscount: 0.1 * k('masonry'),
    towerDmg: 0.06 * k('siegecraft') + (cl >= 7 ? 0.08 : 0),
    rerolls: cl >= 4 ? 1 : 0,
    unlockedTowers: unlockedTowers(p),
  };
}

export function isMapUnlocked(p, id) {
  const m = MAPS[id];
  if (!m.unlock) return true;
  const bestAny = Math.max(0, ...Object.values(p.best.wave));
  return bestAny >= m.unlock.wave;
}

export function ascensionMax(p, map) { return p.ascUnlocked[map] || 0; }

// Merge a finished run into the profile. Returns {renown, newAchievements, records}.
export function recordRun(p, run, { clanBonus = 0 } = {}) {
  const s = p.stats;
  s.runs++;
  for (const k of ['kills', 'heroKills', 'shots', 'hits', 'headshots', 'bossKills', 'towersBuilt', 'goldEarned', 'heroDmg']) s[k] += run[k] || 0;
  s.wavesCleared += run.wavesCleared;
  s.playTime += run.duration;
  s.maxCombo = Math.max(s.maxCombo, run.maxCombo);
  s.maxFlawlessStreak = Math.max(s.maxFlawlessStreak, run.maxFlawlessStreak || 0);
  s.maxMastery = Math.max(s.maxMastery || 0, run.maxMastery || 0);
  for (const [k, v] of Object.entries(run.killsByType)) s.killsByType[k] = (s.killsByType[k] || 0) + v;
  for (const [k, v] of Object.entries(run.dmgByTower)) s.dmgByTower[k] = (s.dmgByTower[k] || 0) + v;
  for (const [k, v] of Object.entries(run.builtByTower || {})) s.builtByTower[k] = (s.builtByTower[k] || 0) + v;
  for (const sp of run.specs) if (!p.specsSeen.includes(sp)) p.specsSeen.push(sp);
  const records = [];
  if (run.wave > (p.best.wave[run.map] || 0)) { records.push('wave'); p.best.wave[run.map] = run.wave; }
  if (run.score > (p.best.score[run.map] || 0)) { records.push('score'); p.best.score[run.map] = run.score; }
  // Ascension unlocks
  const goal = ASCENSION.unlockWave(run.ascension);
  if (run.wave >= goal && run.ascension < ASCENSION.max) {
    p.ascUnlocked[run.map] = Math.max(p.ascUnlocked[run.map] || 0, run.ascension + 1);
  }
  if (run.ascension > 0 && run.wave >= goal) p.maxAscCleared = Math.max(p.maxAscCleared || 0, run.ascension);
  if (run.mode === 'daily') {
    const d = utcDateKey();
    const prev = p.daily[d];
    if (!prev || run.score > prev.score) p.daily[d] = { score: run.score, wave: run.wave };
  }
  const renown = renownFor(run.score, run.wavesCleared, clanBonus);
  p.renown += renown; s.renownEarned += renown;
  p.history.push({ d: Date.now(), map: run.map, wave: run.wave, score: run.score, mods: run.modifiers, asc: run.ascension, mode: run.mode, kills: run.kills });
  if (p.history.length > 60) p.history.splice(0, p.history.length - 60);
  const newAch = checkAchievements(p, run);
  saveProfile(p);
  return { renown, newAchievements: newAch, records };
}

export function checkAchievements(p, run = null) {
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id]) continue;
    let ok = false;
    try { ok = a.check(p, run); } catch { ok = false; }
    if (!ok) continue;
    p.achievements[a.id] = Date.now();
    if (a.reward?.cosmetic && !p.owned.includes(a.reward.cosmetic)) p.owned.push(a.reward.cosmetic);
    if (a.reward?.title && !p.titles.includes(a.reward.title)) p.titles.push(a.reward.title);
    out.push(a);
  }
  if (out.length) saveProfile(p);
  return out;
}
