// Local profile: progression, settings, history. Saved in localStorage; online sync is optional.
import { KEEP, TOWERS, TROOPS, WEAPONS, ASCENSION, CLAN_LEVELS, ABILITIES, ART_SLOTS, ECON, MILESTONES } from '../data/balance.js';
import { ACHIEVEMENTS, DEFAULT_COSMETICS } from './achievements.js';
import { renownBreakdown, rankFor, rankWave } from '../game/economy.js';
import { progressQuests } from './quests.js';
import { progressOvertime, worksBonus } from './campaign.js';
import { MAPS } from '../game/maps.js';
import { PROVINCES } from '../game/realmmap.js';
import { progressEvent, eventBonus, mapEventBonus, blessingFor, checkRank } from './events.js';
import { emptyPrestige, prestigeBonus } from './prestige.js';
import { checkMedals, medalBonus } from './medals.js';
import { RANK_REWARDS } from '../data/prestige.js';
import { realmDay, localDateKey } from '../core/rng.js';
import { isNewMode, isLocalMode } from '../game/modes.js';

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
    troopKills: 0, troopsTrained: 0, troopsLost: 0, maxTroopRank: 0, troopDmg: 0,
  };
}

export function defaultProfile() {
  return {
    v: 1, name: randomName(), created: Date.now(),
    renown: 0, keep: {}, weapon: 'longbow', loadout: null,
    achievements: {}, owned: [...DEFAULT_COSMETICS], equip: { castle: 'stone', trail: 'none', kill: 'poof', skin: 'classic', hero: 'classic' },
    titles: [], title: null,
    settings: { master: 0.8, sfx: 0.55, music: 0.35, muted: true, quality: 'high', dmgNumbers: 'hero', shake: true, reducedMotion: false, colorblind: false, uiScale: 1, theme: 'auto', haptics: true },
    stats: blankStats(), best: { wave: {}, score: {} }, ascUnlocked: {}, maxAscCleared: 0, history: [], specsSeen: [],
    daily: {}, tutorialDone: false, online: null, reinforcements: [], social: {}, lastSeason: null,
    prestige: emptyPrestige(), medals: {}, supply: 0, works: {},
  };
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile();
    const p = JSON.parse(raw);
    const d = defaultProfile();
    const out = { ...d, ...p, settings: { ...d.settings, ...p.settings }, stats: { ...d.stats, ...p.stats }, best: { ...d.best, ...p.best }, equip: { ...d.equip, ...p.equip } };
    // Cosmetics added in later versions (the default hero outfit) are owned by everyone.
    for (const c of DEFAULT_COSMETICS) if (!out.owned.includes(c)) out.owned.push(c);
    // The War Banner became the Artillery battery (v1.24): carry its training level and tallies over.
    out.keep = { ...out.keep };
    if (out.keep.train_banner) { out.keep.train_artillery = Math.max(out.keep.train_artillery || 0, out.keep.train_banner); }
    delete out.keep.train_banner;
    for (const f of ['builtByTower', 'dmgByTower']) { const o = out.stats[f]; if (o && o.banner != null) { out.stats = { ...out.stats, [f]: { ...o, artillery: (o.artillery || 0) + o.banner } }; delete out.stats[f].banner; } }
    return out;
  } catch { return defaultProfile(); }
}

export function saveProfile(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full or blocked */ } }
// Saved runs live in slots: classic, daily, challenge and march runs share the main one, and each game mode keeps its own,
// so a Gauntlet, Last Stand or Sprint never overwrites a classic run you have paused (and the other way round).
export const runSlot = (mode) => (isNewMode(mode) || isLocalMode(mode) ? mode : 'main');
const runKey = (slot) => (slot && slot !== 'main' ? `${RUN_KEY}.${slot}` : RUN_KEY);
export function saveRun(s) { try { localStorage.setItem(runKey(runSlot(s.mode)), JSON.stringify(s)); } catch { /* ignore */ } }
export function loadRun(slot = 'main') { try { const r = localStorage.getItem(runKey(slot)); return r ? JSON.parse(r) : null; } catch { return null; } }
export function clearRun(slot = 'main') { try { localStorage.removeItem(runKey(slot)); } catch { /* ignore */ } }

export function keepLevel(p, id) { return p.keep[id] || 0; }
export function keepNextCost(p, node) { const lv = keepLevel(p, node.id); return lv >= node.cost.length ? null : node.cost[lv]; }
export function keepLocked(p, node) { return node.req && !keepLevel(p, node.req) ? KEEP.find((k) => k.id === node.req) : null; }
export function buyKeep(p, id) {
  const node = KEEP.find((k) => k.id === id);
  if (!node || keepLocked(p, node)) return false;
  const c = keepNextCost(p, node);
  if (c == null || p.renown < c) return false;
  p.renown -= c; p.keep[id] = keepLevel(p, id) + 1;
  if (node.cosmetic && !p.owned.includes(node.cosmetic)) p.owned.push(node.cosmetic);
  if (node.title && !p.titles.includes(node.title)) p.titles.push(node.title);
  saveProfile(p);
  return true;
}
// How many Keep upgrades you could buy right now with your Renown.
export function keepAffordable(p, branch = null) {
  return KEEP.filter((k) => (!branch || k.branch === branch) && !keepLocked(p, k)).filter((k) => { const c = keepNextCost(p, k); return c != null && c <= p.renown; }).length;
}

export function unlockedTowers(p) {
  const s = new Set();
  for (const [id, t] of Object.entries(TOWERS)) if (!t.keep || keepLevel(p, t.keep) > 0) s.add(id);
  return s;
}
export function unlockedTroops(p) {
  return new Set(Object.entries(TROOPS).filter(([, t]) => !t.keep || keepLevel(p, t.keep) > 0).map(([id]) => id));
}
export function unlockedAbilities(p) {
  return new Set(Object.entries(ABILITIES).filter(([, a]) => !a.keep || keepLevel(p, a.keep) > 0).map(([id]) => id));
}
// The castle arts to bring on a run: your saved picks that you still own, topped up with whatever else you have.
export function loadoutFor(p) {
  const known = [...unlockedAbilities(p)];
  const slots = ART_SLOTS.base + keepLevel(p, 'artslot');
  const picks = (p.loadout || []).filter((id) => known.includes(id));
  for (const id of known) if (picks.length < slots && !picks.includes(id) && !p.loadout) picks.push(id);
  return picks.slice(0, slots);
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

// `realm` holds the Realm blessing perks currently earned by the whole nation (see src/game/realm.js).
// Squire's Grace: a new commander's first few runs start with Second Wind and a little more gold, so the first boss is a
// lesson rather than a wall. It ends after five runs or once any run has reached wave 15 (applied by the app, see main.js runBonus).
export const SQUIRE = { runs: 5, wave: 15, gold: 40 };
export const isSquire = (p) => (p.stats?.runs || 0) < SQUIRE.runs && Math.max(0, ...Object.values(p.best?.wave || {})) < SQUIRE.wave;
export function runBonus(p, clan = null, realm = null) {
  const k = (id) => keepLevel(p, id);
  const cl = clanPerkLevel(clan);
  const R = realm || {};
  const train = {};
  for (const n of KEEP) if (n.train && k(n.id)) train[n.train] = n.per * k(n.id);
  const weaponPerks = {};
  for (const n of KEEP) if (n.weaponPerk && k(n.id)) { const wp = (weaponPerks[n.weaponPerk] ||= {}); for (const [f, v] of Object.entries(n.fx)) wp[f] = (wp[f] || 0) + v; }
  const W = worksBonus(p);
  const P = prestigeBonus(p);   // permanent power from Dynasties and Legacy perks (all zero before the first ascension)
  const b = {
    castleHpMult: 1 + 0.15 * k('fortify') + (R.castleHpMult || 0) + P.castleHpMult + W.castleHpMult,
    wallHpMult: 1 + 0.12 * k('wallplating') + P.wallHpMult + W.wallHpMult,
    castleDR: Math.min(0.5, 0.03 * k('bulwark') + W.castleDR),
    wallRegen: 0.0025 * k('wallregen'),
    wallMend: 0.05 * k('mending'),
    castleMend: 0.02 * k('hearth'),
    towerHpMult: 1 + 0.12 * k('towerhp'),
    startGold: 45 * k('warchest') + (cl >= 2 ? 40 : 0) + (cl >= 6 ? 80 : 0) + (R.startGold || 0) + P.startGold,
    killGold: 0.09 * k('bountyhunter') + (cl >= 1 ? 0.05 : 0) + (cl >= 5 ? 0.1 : 0) + (R.killGold || 0) + P.killGold,
    waveGold: 0.12 * k('wavepay') + P.waveGold,
    earlyCall: 0.15 * k('hurry'),
    interest: 0.02 * k('invest'),
    lootBonus: 0.15 * k('treasure'),
    mintMult: 1 + 0.1 * k('minters'),
    towerDiscount: 0.06 * k('architect') + (R.towerDiscount || 0) + P.towerDiscount,
    masteryDiscount: 0.05 * k('mastersmith'),
    claimDiscount: 0.08 * k('surveyors'),
    startPlots: k('plots') + P.startPlots,
    sellBonus: 0.05 * k('salvage'),
    weaponDmg: 0.15 * k('marksman') + (R.weaponDmg || 0) + P.weaponDmg,
    reloadMult: Math.pow(0.94, k('quickhands')),
    ammoAdd: k('deepquiver'),
    weaponCrit: 0.02 * k('keeneye'),
    headshotMult: 0.12 * k('deadeye'),
    comboDecay: 1 + 0.1 * k('momentum'),
    chargeTime: Math.pow(0.92, k('steadydraw')),
    heroPierce: 3 * k('armorpiercer'),
    heroGold: 0.08 * k('plunderer'),
    armoryDiscount: 0.08 * k('armorer'),
    boonChoices: k('scholar'),
    boonRarity: 1 + 0.2 * k('charms'),
    startBoons: k('startboon'),
    secondWind: k('secondwind') > 0,
    secondWindHeal: k('phoenix') ? 0.7 : 0.4,
    repairDiscount: 0.1 * k('masonry') + (R.repairDiscount || 0),
    towerDmg: 0.09 * k('siegecraft') + (cl >= 7 ? 0.08 : 0) + (R.towerDmg || 0) + P.towerDmg,
    towerRange: 0.03 * k('optics') + P.towerRange,
    towerRate: 0.03 * k('gears') + P.towerRate,
    highDmg: 0.08 * k('hilltop'),
    splashMult: 1 + 0.05 * k('powder'),
    bossDmg: 0.06 * k('giantbane') + P.bossDmg,
    armoredDmg: 0.05 * k('armorbane'),
    airDmg: 0.06 * k('skyhunters'),
    towerTrain: train,
    weaponPerks,
    rerolls: k('reroll') + (cl >= 4 ? 1 : 0) + P.rerolls,
    abilityCd: Object.fromEntries(Object.keys(ABILITIES).map((id) => [id, Math.pow(0.94, k(id + 'cd')) * P.cd])),
    abilityLv: Object.fromEntries(Object.keys(ABILITIES).map((id) => [id, k(id + 'pow')])),
    artSlots: ART_SLOTS.base + k('artslot'),
    quartermaster: k('quartermaster'),
    abilityDmg: { volley: 1 + 0.12 * k('volleydmg'), oil: 1 + 0.12 * k('oildmg') },
    abilityRadius: { volley: 1 + 0.08 * k('volleyrad'), oil: 1 + 0.08 * k('oilrad') },
    novaFreeze: 0.3 * k('novafreeze'),
    hornTime: 1.5 * k('horndur'),
    unlockedTowers: unlockedTowers(p),
    unlockedAbilities: unlockedAbilities(p),
    unlockedTroops: unlockedTroops(p),
    unlockedWeapons: new Set(unlockedWeapons(p)),
    troopSlots: 2 * k('gar_slots'),
    trainSpeed: 0.08 * k('gar_train'),
    troopDiscount: 0.06 * k('gar_cost'),
    musterMult: 0.12 * k('gar_muster'),
    troopHp: 0.12 * k('gar_hp'),
    troopDmg: 0.12 * k('gar_dmg'),
    valorMult: 0.1 * k('gar_valor'),
    troopHeal: 0.25 * k('gar_heal'),
    troopSave: 0.08 * k('gar_save'),
    troopTrain: {},
  };
  // Anything else the Realm hands out (province gifts from the Map of Aldermere): tower and troop training by name,
  // and plain additions to any numeric field above.
  const handled = new Set(['castleHpMult', 'startGold', 'killGold', 'towerDiscount', 'weaponDmg', 'repairDiscount', 'towerDmg']);
  for (const [key, v] of Object.entries(R)) {
    if (handled.has(key) || typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (key.startsWith('train_')) b.towerTrain[key.slice(6)] = (b.towerTrain[key.slice(6)] || 0) + v;
    else if (key.startsWith('troop_')) b.troopTrain[key.slice(6)] = (b.troopTrain[key.slice(6)] || 0) + v;
    else if (typeof b[key] === 'number') b[key] += v;
  }
  return b;
}

export function isMapUnlocked(p, id) {
  const m = MAPS[id];
  if (!m.unlock) return true;
  const bestAny = Math.max(0, ...Object.values(p.best.wave));
  return bestAny >= m.unlock.wave;
}

export function ascensionMax(p, map) { return p.ascUnlocked[map] || 0; }

// Personal bests for Gauntlet (furthest wave), Last Stand (longest clock) and Sprint (fastest clear).
// Returns the mode's id when the run set a new best, else null.
export function modeRecord(p, run) {
  const m = ((p.best.modes ||= {})[run.mode] ||= { runs: 0 });
  m.runs = (m.runs || 0) + 1;
  m.kills = Math.max(m.kills || 0, run.kills);
  let beat = false;
  if (run.mode === 'gauntlet') { if (run.wave > (m.wave || 0)) { m.wave = run.wave; m.stage = run.stage || 1; beat = true; } }
  else if (run.mode === 'warfront') {
    const wk = String(run.seed || '').replace(/^warfront-/, '').split(':')[0];
    const W = (m.weeks ||= {});
    if (run.wave > (W[wk] || 0)) W[wk] = run.wave;
    const keys = Object.keys(W).sort(); if (keys.length > 12) for (const k of keys.slice(0, keys.length - 12)) delete W[k];
    if (run.wave > (m.wave || 0)) { m.wave = run.wave; beat = true; }
  } else if (run.mode === 'laststand' || run.mode === 'endurance') { if (run.clock > (m.clock || 0)) { m.clock = run.clock; m.wave = run.wave; m.waves = run.wavesCleared; beat = true; } }
  else if (run.mode === 'sprint') {
    m.wave = Math.max(m.wave || 0, Math.min(run.wave, 15));
    const lvl = run.level || 'standard';
    if (run.victory) {
      m.wins = (m.wins || 0) + 1;
      const L = ((m.lv ||= {})[lvl] ||= { wins: 0 });   // every level keeps its own record
      L.wins++;
      if (!L.clock || run.clock < L.clock) { L.clock = run.clock; beat = true; }
      // The headline "fastest clear" only counts Standard and harder, so a Recruit run cannot set it.
      if (lvl !== 'recruit' && (!m.clock || run.clock < m.clock)) m.clock = run.clock;
    }
  }
  return beat ? run.mode : null;
}

// Merge a finished run into the profile.
// Returns {renown, parts, milestones, newAchievements, records, quests}. `parts` itemises the Renown for the summary screen.
export function recordRun(p, run, { clanBonus = 0, now = new Date() } = {}) {
  clanBonus += mapEventBonus(run, p.realmMap?.held || 0, PROVINCES, now) + eventBonus(now) + (blessingFor(now).renown || 0) + prestigeBonus(p).renown + medalBonus(p);
  const s = p.stats;
  const start = run.start || 1;
  const rank = rankFor(run.wave, start, run.wavesCleared);
  s.runs++;
  for (const k of ['kills', 'heroKills', 'shots', 'hits', 'headshots', 'bossKills', 'towersBuilt', 'goldEarned', 'heroDmg', 'troopKills', 'troopsTrained', 'troopsLost', 'troopDmg']) s[k] = (s[k] || 0) + (run[k] || 0);
  s.maxTroopRank = Math.max(s.maxTroopRank || 0, run.maxTroopRank || 0);
  s.champions = (s.champions || 0) + (run.champions || 0); s.encounters = (s.encounters || 0) + (run.encounters || 0);
  s.wavesCleared += run.wavesCleared;
  s.abilities = (s.abilities || 0) + (run.abilities || 0);
  s.playTime += run.duration;
  s.maxCombo = Math.max(s.maxCombo, run.maxCombo);
  s.maxFlawlessStreak = Math.max(s.maxFlawlessStreak, run.maxFlawlessStreak || 0);
  s.maxMastery = Math.max(s.maxMastery || 0, run.maxMastery || 0);
  for (const [k, v] of Object.entries(run.killsByType)) s.killsByType[k] = (s.killsByType[k] || 0) + v;
  for (const [k, v] of Object.entries(run.dmgByTower)) s.dmgByTower[k] = (s.dmgByTower[k] || 0) + v;
  for (const [k, v] of Object.entries(run.builtByTower || {})) s.builtByTower[k] = (s.builtByTower[k] || 0) + v;
  for (const sp of run.specs) if (!p.specsSeen.includes(sp)) p.specsSeen.push(sp);
  const heroBefore = p.hero?.wave || 0;
  if (run.hero) { const H = p.hero || (p.hero = { runs: 0, wave: 0, kills: 0, headshots: 0 }); H.runs++; H.wave = Math.max(H.wave, rank || 0); /* a head start counts at the same discount as in a classic run */ H.kills += run.heroKills || 0; H.headshots += run.headshots || 0; }
  const records = [];
  // Gauntlet, Last Stand and Sprint keep their own records: their waves are not the main game's waves.
  const special = isNewMode(run.mode);
  if (special) {
    const mr = modeRecord(p, run);
    if (mr) records.push(mr);
  } else if (isLocalMode(run.mode)) {
    // Hero Mode and the Daily Siege keep records of their own; their waves never count toward the classic run's.
    if (run.mode === 'siege') {
      const day = String(run.seed || '').replace(/^siege-/, '');
      const S = p.siege || (p.siege = { days: {}, wins: 0, played: 0 });
      S.played++;
      if (run.victory) S.wins++;
      const prev = S.days[day];
      if (!prev || run.score > prev.score) { S.days[day] = { score: run.score, waves: run.wavesCleared, win: !!run.victory }; if (prev) records.push('siege'); }
      const keys = Object.keys(S.days).sort();
      if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) { S.best = Math.max(S.best || 0, S.days[k].score); S.cleared = (S.cleared || 0) + (S.days[k].win ? 1 : 0); delete S.days[k]; }
    } else if (run.mode === 'raid') {
      const day = String(run.seed || '').replace(/^raid-/, '');
      const S = p.raid || (p.raid = { days: {}, wins: 0, played: 0 });
      S.played++;
      if (run.victory) S.wins++;
      const prev = S.days[day];
      if (!prev || run.score > prev.score) { S.days[day] = { score: run.score, win: !!run.victory, clock: run.clock }; if (prev) records.push('raid'); }
      const keys = Object.keys(S.days).sort();
      if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) { S.best = Math.max(S.best || 0, S.days[k].score); delete S.days[k]; }
    } else if (run.mode === 'assault') {
      const R = (p.local ||= {}).assault ||= { runs: 0, best: 0, razed: 0, taken: 0 };
      R.runs++; R.razed += run.razed || 0; R.taken += run.taken || 0;
      if ((run.taken || 0) > R.best) { if (R.best > 0) records.push('assault'); R.best = run.taken; }
    } else if (run.mode === 'conquest') {
      const C = (p.conquests ||= {})[run.province || 'unknown'] ||= { tries: 0, won: false, best: 0 };
      C.tries++; C.best = Math.max(C.best, run.taken || 0);
      if (run.victory && !C.won) { C.won = true; C.at = Date.now(); records.push('conquest'); }
    } else if (run.mode === 'blitz') {
      const wk = String(run.seed || '').replace(/^blitz-/, '');
      const B = p.blitz ||= {}, prev = B[wk];
      if (!prev || run.score > prev.score) { B[wk] = { score: run.score, win: !!run.victory, clock: run.clock }; if (prev) records.push('blitz'); }
      const keys = Object.keys(B).sort(); if (keys.length > 20) for (const k of keys.slice(0, keys.length - 20)) delete B[k];
    } else if (run.mode === 'hero' && heroBefore < rank && heroBefore > 0) records.push('hero');
    else if (run.mode === 'trials') {
      const T = p.trials || (p.trials = {}), prev = T[run.trial] || 0;
      if ((run.stars || 0) > prev) { T[run.trial] = run.stars; records.push('trials'); }
    } else {
      // Boss Rush (bosses felled), Draft, Night Siege and Duo (best wave, head starts discounted as usual)
      const R = (p.local ||= {})[run.mode] ||= { runs: 0, best: 0 };
      R.runs++;
      const val = run.mode === 'bossrush' ? run.bossKills || 0 : rank;
      if (val > R.best) { if (R.best > 0) records.push(run.mode); R.best = val; }
    }
  } else {
  if (rank > (p.best.wave[run.map] || 0)) { records.push('wave'); p.best.wave[run.map] = rank; }
  // Head-start runs rank by a discounted wave and stay off the score records.
  if (start === 1 && run.score > (p.best.score[run.map] || 0)) { records.push('score'); p.best.score[run.map] = run.score; }
  // Ascension unlocks
  const goal = ASCENSION.unlockWave(run.ascension);
  if (rank >= goal && run.ascension < ASCENSION.max) {
    p.ascUnlocked[run.map] = Math.max(p.ascUnlocked[run.map] || 0, run.ascension + 1);
  }
  if (run.ascension > 0 && rank >= goal) p.maxAscCleared = Math.max(p.maxAscCleared || 0, run.ascension);
  }
  if (run.mode === 'daily') {
    const d = realmDay(now);
    const prev = p.daily[d];
    if (!prev || run.score > prev.score) p.daily[d] = { score: run.score, wave: run.wave };
  }
  // Renown: score + waves held + bosses, with a once-a-day boost and first-time milestones on top.
  const bd = renownBreakdown(run.score, run.wavesCleared, { bonus: clanBonus, bosses: run.bossKills || 0, start: start - 1, mode: run.mode });
  const parts = [];
  if (bd.fromScore >= 1) parts.push({ label: 'Score', v: Math.floor(bd.fromScore) });
  if (bd.fromWaves >= 1) parts.push({ label: 'Waves held', v: Math.floor(bd.fromWaves) });
  if (bd.fromBosses >= 1) parts.push({ label: 'Bosses felled', v: Math.floor(bd.fromBosses) });
  const diff = bd.total - parts.reduce((a, x) => a + x.v, 0);
  if (diff > 0) { if (clanBonus > 0) parts.push({ label: `Bonus (+${Math.round(clanBonus * 100)}%)`, v: diff }); else if (parts.length) parts[0].v += diff; }
  let renown = bd.total;
  const day = localDateKey(now);
  if (p.renownDay !== day && !(p.renownDay > day) && run.wavesCleared >= 3) {
    p.renownDay = day;
    const bonus = Math.min(ECON.renownDailyCap, Math.floor(bd.base * ECON.renownDailyBonus));
    if (bonus > 0) { renown += bonus; parts.push({ label: "Today's first run", v: bonus }); }
  }
  const milestones = [];
  p.milestones = p.milestones || {};
  const free = start > 1 ? rankWave(start, start) : 0;   // what the head start alone would give
  const attack = ['assault', 'raid', 'conquest', 'blitz'].includes(run.mode);
  // the War Record: strongholds taken in every attack mode, over all runs (it opens new units and orders)
  if (attack && run.taken > 0) { const W = p.warRecord ||= { taken: 0, runs: 0 }; W.taken += run.taken; }
  if (attack) (p.warRecord ||= { taken: 0, runs: 0 }).runs++;   // Assault's 'waves' are strongholds and razed emplacements, not waves held
  for (const m of special || attack ? [] : MILESTONES) {
    if (rank >= m.wave && m.wave > free && !p.milestones[m.wave]) {
      p.milestones[m.wave] = Date.now();
      renown += m.reward; milestones.push(m);
      parts.push({ label: `First time reaching wave ${m.wave}`, v: m.reward });
    }
  }
  p.renown += renown; s.renownEarned += renown;
  p.history.push({ d: Date.now(), map: run.map, wave: run.wave, start, score: run.score, mods: run.modifiers, asc: run.ascension, mode: run.mode, kills: run.kills, vg: run.vanguard ? 1 : 0 });
  if (run.vanguard) { s.vanguardRuns = (s.vanguardRuns || 0) + 1; s.vanguardWaves = (s.vanguardWaves || 0) + run.wavesCleared; }
  if (p.history.length > 60) p.history.splice(0, p.history.length - 60);
  const delta = questDelta(run, run.credited);
  const quests = [...progressQuests(p, delta, now), ...progressOvertime(p, delta, now)];
  s.ordersDone = (s.ordersDone || 0) + quests.filter((q) => !q.overtime).length;
  const event = progressEvent(p, delta, now);
  if (event?.gained.length) { p.eventRewards = (p.eventRewards || 0) + event.gained.length; }
  const ranks = checkRank(p);
  // Ranks beyond Grand Marshal pay a Renown gift; codex medals pay Renown the first time each is earned.
  let rankBonus = 0;
  for (const r of ranks) { const g = RANK_REWARDS[r.name]; if (g) { rankBonus += g.renown; r.reward = g; } }
  const medals = checkMedals(p);
  const medalRenown = medals.reduce((a, m) => a + m.reward, 0);
  p.renown += rankBonus + medalRenown;
  // Challenge-style achievements need a normal run from wave 1; head-start gold cannot fake them.
  const newAch = checkAchievements(p, start === 1 && !special && !attack ? run : { ...run, wave: 0, peakGold: 0, goldSpent: 0 });
  saveProfile(p);
  return { renown, parts, milestones, newAchievements: newAch, records, quests, event, ranks, rankBonus, medals, medalRenown };
}

// Orders and event progress are credited at every cleared wave, not only when the run ends, so closing the tab or saving
// and quitting mid-run never loses them. `credited` (kept in the run's own stats, so it survives save and resume) records
// what has already been paid; the final summary pays only the difference.
const CREDIT_KEYS = ['kills', 'heroKills', 'headshots', 'wavesCleared', 'bossKills', 'gems', 'flawless'];
export function questDelta(run, credited = {}) {
  const d = { ...run };
  for (const k of CREDIT_KEYS) d[k] = Math.max(0, (run[k] || 0) - (credited[k] || 0));
  return d;
}
export function checkpointRun(p, summary, credited, now = new Date()) {
  const delta = questDelta(summary, credited);
  const quests = [...progressQuests(p, delta, now), ...progressOvertime(p, delta, now)];
  p.stats.ordersDone = (p.stats.ordersDone || 0) + quests.filter((q) => !q.overtime).length;
  const event = progressEvent(p, delta, now);
  if (event?.gained.length) p.eventRewards = (p.eventRewards || 0) + event.gained.length;
  for (const k of CREDIT_KEYS) credited[k] = summary[k] || 0;
  saveProfile(p);
  return { quests, event };
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
