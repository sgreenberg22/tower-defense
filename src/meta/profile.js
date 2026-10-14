// Local profile: progression, settings, history. Saved in localStorage; online sync is optional.
import { KEEP, TOWERS, TROOPS, WEAPONS, ASCENSION, CLAN_LEVELS, ABILITIES, ART_SLOTS, ECON, MILESTONES } from '../data/balance.js';
import { ACHIEVEMENTS, DEFAULT_COSMETICS } from './achievements.js';
import { renownBreakdown, rankFor, rankWave } from '../game/economy.js';
import { progressQuests } from './quests.js';
import { MAPS } from '../game/maps.js';
import { PROVINCES } from '../game/realmmap.js';
import { progressEvent, eventBonus, mapEventBonus, blessingFor, checkRank } from './events.js';
import { emptyPrestige, prestigeBonus } from './prestige.js';
import { checkMedals, medalBonus } from './medals.js';
import { RANK_REWARDS } from '../data/prestige.js';
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
    troopKills: 0, troopsTrained: 0, troopsLost: 0, maxTroopRank: 0, troopDmg: 0,
  };
}

export function defaultProfile() {
  return {
    v: 1, name: randomName(), created: Date.now(),
    renown: 0, keep: {}, weapon: 'longbow', loadout: null,
    achievements: {}, owned: [...DEFAULT_COSMETICS], equip: { castle: 'stone', trail: 'none', kill: 'poof', skin: 'classic', hero: 'classic' },
    titles: [], title: null,
    settings: { master: 0.8, sfx: 0.55, music: 0.35, muted: true, quality: 'high', dmgNumbers: 'hero', shake: true, reducedMotion: false, colorblind: false, uiScale: 1, theme: 'auto' },
    stats: blankStats(), best: { wave: {}, score: {} }, ascUnlocked: {}, maxAscCleared: 0, history: [], specsSeen: [],
    daily: {}, tutorialDone: false, online: null, reinforcements: [], social: {}, lastSeason: null,
    prestige: emptyPrestige(), medals: {},
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
    return out;
  } catch { return defaultProfile(); }
}

export function saveProfile(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full or blocked */ } }
export function saveRun(s) { try { localStorage.setItem(RUN_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
export function loadRun() { try { const r = localStorage.getItem(RUN_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
export function clearRun() { try { localStorage.removeItem(RUN_KEY); } catch { /* ignore */ } }

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
export function runBonus(p, clan = null, realm = null) {
  const k = (id) => keepLevel(p, id);
  const cl = clanPerkLevel(clan);
  const R = realm || {};
  const train = {};
  for (const n of KEEP) if (n.train && k(n.id)) train[n.train] = n.per * k(n.id);
  const P = prestigeBonus(p);   // permanent power from Dynasties and Legacy perks (all zero before the first ascension)
  const b = {
    castleHpMult: 1 + 0.1 * k('fortify') + (R.castleHpMult || 0) + P.castleHpMult,
    wallHpMult: 1 + 0.12 * k('wallplating') + P.wallHpMult,
    castleDR: Math.min(0.5, 0.03 * k('bulwark')),
    wallRegen: 0.0025 * k('wallregen'),
    wallMend: 0.05 * k('mending'),
    castleMend: 0.02 * k('hearth'),
    towerHpMult: 1 + 0.12 * k('towerhp'),
    startGold: 30 * k('warchest') + (cl >= 2 ? 40 : 0) + (cl >= 6 ? 80 : 0) + (R.startGold || 0) + P.startGold,
    killGold: 0.06 * k('bountyhunter') + (cl >= 1 ? 0.05 : 0) + (cl >= 5 ? 0.1 : 0) + (R.killGold || 0) + P.killGold,
    waveGold: 0.08 * k('wavepay') + P.waveGold,
    earlyCall: 0.15 * k('hurry'),
    interest: 0.02 * k('invest'),
    lootBonus: 0.15 * k('treasure'),
    mintMult: 1 + 0.1 * k('minters'),
    towerDiscount: 0.04 * k('architect') + (R.towerDiscount || 0) + P.towerDiscount,
    masteryDiscount: 0.05 * k('mastersmith'),
    claimDiscount: 0.08 * k('surveyors'),
    startPlots: k('plots') + P.startPlots,
    sellBonus: 0.05 * k('salvage'),
    weaponDmg: 0.1 * k('marksman') + (R.weaponDmg || 0) + P.weaponDmg,
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
    towerDmg: 0.06 * k('siegecraft') + (cl >= 7 ? 0.08 : 0) + (R.towerDmg || 0) + P.towerDmg,
    towerRange: 0.03 * k('optics') + P.towerRange,
    towerRate: 0.03 * k('gears') + P.towerRate,
    highDmg: 0.08 * k('hilltop'),
    splashMult: 1 + 0.05 * k('powder'),
    bossDmg: 0.06 * k('giantbane') + P.bossDmg,
    armoredDmg: 0.05 * k('armorbane'),
    airDmg: 0.06 * k('skyhunters'),
    towerTrain: train,
    rerolls: k('reroll') + (cl >= 4 ? 1 : 0) + P.rerolls,
    abilityCd: Object.fromEntries(Object.keys(ABILITIES).map((id) => [id, Math.pow(0.94, k(id + 'cd')) * P.cd])),
    abilityLv: Object.fromEntries(Object.keys(ABILITIES).map((id) => [id, k(id + 'pow')])),
    artSlots: ART_SLOTS.base + k('artslot'),
    abilityDmg: { volley: 1 + 0.12 * k('volleydmg'), oil: 1 + 0.12 * k('oildmg') },
    abilityRadius: { volley: 1 + 0.08 * k('volleyrad'), oil: 1 + 0.08 * k('oilrad') },
    novaFreeze: 0.3 * k('novafreeze'),
    hornTime: 1.5 * k('horndur'),
    unlockedTowers: unlockedTowers(p),
    unlockedAbilities: unlockedAbilities(p),
    unlockedTroops: unlockedTroops(p),
    troopSlots: 2 * k('gar_slots'),
    trainSpeed: 0.08 * k('gar_train'),
    troopDiscount: 0.06 * k('gar_cost'),
    musterMult: 0.12 * k('gar_muster'),
    troopHp: 0.08 * k('gar_hp'),
    troopDmg: 0.08 * k('gar_dmg'),
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
  const records = [];
  if (rank > (p.best.wave[run.map] || 0)) { records.push('wave'); p.best.wave[run.map] = rank; }
  // Head-start runs rank by a discounted wave and stay off the score records.
  if (start === 1 && run.score > (p.best.score[run.map] || 0)) { records.push('score'); p.best.score[run.map] = run.score; }
  // Ascension unlocks
  const goal = ASCENSION.unlockWave(run.ascension);
  if (rank >= goal && run.ascension < ASCENSION.max) {
    p.ascUnlocked[run.map] = Math.max(p.ascUnlocked[run.map] || 0, run.ascension + 1);
  }
  if (run.ascension > 0 && rank >= goal) p.maxAscCleared = Math.max(p.maxAscCleared || 0, run.ascension);
  if (run.mode === 'daily') {
    const d = utcDateKey(now);
    const prev = p.daily[d];
    if (!prev || run.score > prev.score) p.daily[d] = { score: run.score, wave: run.wave };
  }
  // Renown: score + waves held + bosses, with a once-a-day boost and first-time milestones on top.
  const bd = renownBreakdown(run.score, run.wavesCleared, { bonus: clanBonus, bosses: run.bossKills || 0, start: start - 1 });
  const parts = [];
  if (bd.fromScore >= 1) parts.push({ label: 'Score', v: Math.floor(bd.fromScore) });
  if (bd.fromWaves >= 1) parts.push({ label: 'Waves held', v: Math.floor(bd.fromWaves) });
  if (bd.fromBosses >= 1) parts.push({ label: 'Bosses felled', v: Math.floor(bd.fromBosses) });
  const diff = bd.total - parts.reduce((a, x) => a + x.v, 0);
  if (diff > 0) { if (clanBonus > 0) parts.push({ label: `Bonus (+${Math.round(clanBonus * 100)}%)`, v: diff }); else if (parts.length) parts[0].v += diff; }
  let renown = bd.total;
  const day = utcDateKey(now);
  if (p.renownDay !== day && run.wavesCleared >= 3) {
    p.renownDay = day;
    const bonus = Math.min(ECON.renownDailyCap, Math.floor(bd.base * ECON.renownDailyBonus));
    if (bonus > 0) { renown += bonus; parts.push({ label: "Today's first run", v: bonus }); }
  }
  const milestones = [];
  p.milestones = p.milestones || {};
  const free = start > 1 ? rankWave(start, start) : 0;   // what the head start alone would give
  for (const m of MILESTONES) {
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
  const quests = progressQuests(p, run, now);
  s.ordersDone = (s.ordersDone || 0) + quests.length;
  const event = progressEvent(p, run, now);
  if (event?.gained.length) { p.eventRewards = (p.eventRewards || 0) + event.gained.length; }
  const ranks = checkRank(p);
  // Ranks beyond Grand Marshal pay a Renown gift; codex medals pay Renown the first time each is earned.
  let rankBonus = 0;
  for (const r of ranks) { const g = RANK_REWARDS[r.name]; if (g) { rankBonus += g.renown; r.reward = g; } }
  const medals = checkMedals(p);
  const medalRenown = medals.reduce((a, m) => a + m.reward, 0);
  p.renown += rankBonus + medalRenown;
  // Challenge-style achievements need a normal run from wave 1; head-start gold cannot fake them.
  const newAch = checkAchievements(p, start === 1 ? run : { ...run, wave: 0, peakGold: 0, goldSpent: 0 });
  saveProfile(p);
  return { renown, parts, milestones, newAchievements: newAch, records, quests, event, ranks, rankBonus, medals, medalRenown };
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
