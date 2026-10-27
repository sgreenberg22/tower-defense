// Game modes beyond the classic endless run. Pure rules shared by the engine, the client and the server, so a mode
// plays, validates and ranks the same everywhere. Every mode still feeds the Realm: kills, waves and orders all count.
import { seedFor } from '../core/rng.js';
import { planWave } from './waves.js';
import { WARFRONT_MAPS } from './living.js';

export const MODE_IDS = ['warfront', 'gauntlet', 'endurance', 'laststand', 'sprint'];
export const isNewMode = (m) => MODE_IDS.includes(m);

// ---------- Gauntlet: a new map after every boss, starting over richer each time ----------
export const GAUNTLET = {
  firstWave: 2,        // the wave counter runs 2, 4, 6 ...: every fight is worth two waves of toughening
  step: 2,
  stageEvery: 10,      // a boss on every tenth wave closes a stage (so five fights a stage)
  buildTime: 12,       // seconds of break between fights (a normal run gives 30)
  stageBuild: 30,      // the first break on a fresh map, when everything has to be built again
  maps: ['meadow', 'twin', 'coil', 'cross', 'bog', 'spine', 'frontier', 'hive', 'fork', 'ravine', 'frostmere', 'bridge', 'mirror', 'cinder'],   // the hard maps come last: only deep runs reach them (new maps are appended, so a saved run's stage keeps its map)
  goldMult: 1,         // the stage grant, as a share of the head-start gold for that wave
  unlockLead: 6,       // at the top of a stage, everything up to this many waves ahead is already open
  castleHeal: 0.5,     // share of castle health restored when a new stage begins
};
export const gauntletStage = (wave) => Math.floor((Math.max(GAUNTLET.firstWave, wave) - 1) / GAUNTLET.stageEvery) + 1;
export const gauntletStart = (stage) => (stage - 1) * GAUNTLET.stageEvery + GAUNTLET.firstWave;
export const gauntletMap = (stage) => GAUNTLET.maps[(stage - 1) % GAUNTLET.maps.length];
export const gauntletMapSeed = (seed, stage) => `${seed}|s${stage}`;
// Fights won so far when the counter stands at `wave` (the next fight).
export const gauntletFights = (wave) => Math.max(0, Math.floor((wave - GAUNTLET.firstWave) / GAUNTLET.step));

// ---------- Last Stand: timed survival on a weekly map ----------
export const LASTSTAND = {
  startWave: 55,       // enemy strength the stand opens at; it climbs one wave at a time from here
  gap: 3,              // seconds between waves (they come one after another)
  mastery: 15,         // every emplacement stands at tier 5 with this many mastery stars, for free
  slots: 30,           // troop slots in the free garrison
  killsPerWave: 100,   // every hundred foes defeated counts as a cleared wave
  maps: ['meadow', 'twin', 'cross', 'coil', 'bog', 'spine', 'frontier'],
};
export const lastStandWaves = (kills) => Math.floor(Math.max(0, kills) / LASTSTAND.killsPerWave);

// ---------- Endurance: the classic economy and your Keep, but the waves never stop and the clock decides ----------
export const ENDURANCE = {
  beat: 12,            // seconds between surges: the foes' strength steps up one level each beat, whether or not the last surge is dead
  repairKills: 150,    // a free repair every this many foes defeated ...
  weaponLv: { dmg: 12, reload: 8, ammo: 8, crit: 10 },   // the hero's weapon comes fully trained: every armory stat at its cap (Last Stand too)
  castleHeal: 0.35,    // ... or when a boss falls: every tower, the garrison and the wall back to full, and this share of the keep restored
  maps: ['meadow', 'twin', 'cross', 'coil', 'bog', 'spine', 'frontier'],
};

// ---------- Sprint: fifteen waves, fastest clock wins ----------
export const SPRINT = {
  waves: 15,
  buildTime: 6,
  startGold: 120,
  hpScale: 14,        // foes are tougher than the same wave of a classic run ...
  countScale: 1.8,    // ... come in greater numbers ...
  gapScale: 0.5,       // ... and pour in faster, so the run is a sprint in every sense
  maps: ['meadow', 'twin', 'cross', 'coil', 'bog', 'spine', 'frontier'],
};
// Sprint comes in four levels. Standard is the original (and keeps the original board); each other level ranks on a board of its own.
export const SPRINT_LEVEL_IDS = ['recruit', 'standard', 'veteran', 'legend'];
export const SPRINT_LEVELS = {
  recruit:  { id: 'recruit',  name: 'Recruit',  icon: '🌱', hpScale: 8,  countScale: 1.3, gapScale: 0.75, startGold: 220, buildTime: 9, blurb: 'Softer foes, wider gaps, more gold. A fair first Sprint.' },
  standard: { id: 'standard', name: 'Standard', icon: '⚡', hpScale: SPRINT.hpScale, countScale: SPRINT.countScale, gapScale: SPRINT.gapScale, startGold: SPRINT.startGold, buildTime: SPRINT.buildTime, blurb: 'The classic Sprint.' },
  veteran:  { id: 'veteran',  name: 'Veteran',  icon: '🔥', hpScale: 22, countScale: 2.2, gapScale: 0.42, startGold: 100, buildTime: 5, blurb: 'Much tougher, denser waves and less gold.' },
  legend:   { id: 'legend',   name: 'Legend',   icon: '👑', hpScale: 34, countScale: 2.7, gapScale: 0.34, startGold: 80,  buildTime: 4, blurb: 'For the best players only.' },
};
export const sprintLevel = (id) => SPRINT_LEVELS[id] || SPRINT_LEVELS.standard;
export const cleanSprintLevel = (id) => (SPRINT_LEVELS[id] ? id : 'standard');
export const sprintBoardId = (level) => (cleanSprintLevel(level) === 'standard' ? 'sprint' : `sprint_${level}`);
export const SPRINT_BOARDS = SPRINT_LEVEL_IDS.map(sprintBoardId);
// Sprint ranks by the fastest clear: the board stores a value that grows as the time shrinks.
export const SPRINT_BOARD_BASE = 100000;
export const sprintBoardValue = (seconds) => Math.max(1, SPRINT_BOARD_BASE - Math.round(seconds));
export const sprintSecondsFrom = (value) => SPRINT_BOARD_BASE - value;

export const MODES = {
  warfront: {
    id: 'warfront', name: 'Warfront', icon: '🔥', short: "This week's warlord at full fury", board: 'warfront', boardLabel: 'Warfront · highest wave', unit: 'wave',
    blurb: "One field and two war rules for everyone this week, against the week's warlord at full fury: their favored foes pour in, their twist bites twice as hard and a Champion marches every five waves. Your Keep comes with you. How far can you push the front?",
    rules: ['A new warlord, battlefield and pair of war rules every Monday, the same for the whole Realm.', "The warlord's favored foes come far more often, their twist is doubled, and a Champion marches every 5 waves.", 'Ranked by the highest wave on the weekly map. Encounters at the gate as in a normal run; every wave feeds the Realm.'],
  },
  gauntlet: {
    id: 'gauntlet', name: 'Gauntlet', icon: '🗺', short: 'Map after map', board: 'gauntlet', boardLabel: 'Gauntlet · furthest wave', unit: 'wave',
    blurb: 'Every boss you fell sends you to a new map, and you start over there with a heap of gold and fresh towers unlocked. Fights come fast and the foes harden twice as quickly. Few will see wave 100.',
    rules: ['A new map after every boss: your towers stay behind, but you arrive with a big grant of gold and more ground open.', 'Each fight counts as two waves of toughening, and the break between fights is only 12 seconds.', 'Your Keep, boons and troops come with you. Ranked by the furthest wave.'],
  },
  endurance: {
    id: 'endurance', name: 'Endurance', icon: '🛡', short: 'Hold as long as you can', board: 'endurance', boardLabel: 'Endurance · longest time', unit: 'time',
    blurb: 'Everything your Keep has unlocked is free: those towers at full mastery, every plot, a full garrison, a fully trained weapon and the castle arts you choose. Take all the time you need to set up, then the foes simply keep coming and keep getting tougher. Nothing is ever rebuilt by hand: after every boss and every 150 foes, all your buildings are restored. You will be overwhelmed in the end. The only question is when.',
    rules: ['No gold and no Keep stat bonuses: choose from the weapons, arts and towers you have unlocked, place everything, then press Begin. After that nothing can be built or changed.', 'No waves and no breaks: an unending stream of foes that grows stronger every few seconds, with a boss every two minutes.', 'Every boss felled and every 150 foes defeated restores every tower and the wall to full, mends the garrison and gives back part of the keep. Ranked by time held on a map shared by everyone for the week.'],
  },
  laststand: {
    id: 'laststand', name: 'Last Stand', icon: '⏳', short: 'Timed survival', board: 'laststand', boardLabel: 'Last Stand · longest time', unit: 'time',
    blurb: 'A fresh map every week, the same for everyone. Raise as many towers as you like, every one at full level with maximum mastery, and fill the garrison free. Then you cannot repair or upgrade a thing. How long on the clock can you hold?',
    rules: ['Free towers at full level and full mastery on every open plot, and a free garrison, from the towers and troops your Keep has unlocked.', 'Once the first wave comes, nothing can be built, upgraded, repaired or sold. Keep stat bonuses are off, so only what you have unlocked sets you apart.', 'Waves roll on without rest. Every 100 foes defeated counts as a wave for the Realm. Ranked by time survived.'],
  },
  sprint: {
    id: 'sprint', name: 'Sprint', icon: '⚡', short: 'Fifteen waves, fastest',  board: 'sprint', boardLabel: 'Sprint · fastest clear', unit: 'clock',
    blurb: 'Fifteen waves on a weekly map, the same for everyone, and no mercy: the foes are far tougher than in a classic run and pour in twice as fast, with only short breaks between. It takes a well-stocked Keep to reach the end. Call waves early, hold the line and stop the clock as fast as you can.',
    rules: ['Waves 1 to 15 (a boss on 10) of much tougher, much faster foes, 6-second breaks and 120 extra gold to start.', 'The clock stops the moment the fifteenth wave falls. Early calls save you time.', 'Fall short and the waves you held still count toward the Realm.'],
  },
};

// This week's map and seed for the modes that share one (so a board is a fair contest).
// From this week on, the three hard maps join the weekly pool (earlier weeks keep their old pool, so boards never change underneath anyone).
export const WEEKLY_HARD_FROM = '2026-W43';
export const HARD_MAPS = ['hive', 'fork', 'ravine'];
// The five v1.48 fields join the weekly pools (and the Daily Siege, from its date) without changing any week already under way.
export const WEEKLY_NEW_FROM = '2026-W45';
export const NEW_FIELDS = ['hamlet', 'frostmere', 'bridge', 'mirror', 'cinder'];
export const SIEGE_NEW_FROM = '2026-10-27';
// Every map a weekly mode can be played on (the weekly map is one of them, and the only one that counts for the board).
export function modeMapPool(mode, key) {
  const base = mode === 'laststand' ? LASTSTAND.maps : mode === 'endurance' ? ENDURANCE.maps : mode === 'warfront' ? WARFRONT_MAPS : SPRINT.maps;
  if (mode === 'warfront') return base;
  return key >= WEEKLY_NEW_FROM ? [...base, ...HARD_MAPS, ...NEW_FIELDS] : key >= WEEKLY_HARD_FROM ? [...base, ...HARD_MAPS] : base;
}
// A run on the weekly map shares the weekly seed (ranked); a run on any other map gets its own seed and is practice.
export const modeSeedFor = (mode, key, map) => { const w = weeklySetup(mode, key); return map === w.map ? w.seed : `${w.seed}:${map}`; };
export function weeklySetup(mode, key) {
  const list = modeMapPool(mode, key);
  const seed = `${mode}-${key}`;
  const h = seedFor(seed, 'setup');
  return { seed, map: list[h % list.length], key };
}

// Rough seconds a wave's spawning takes, for the least time a run could plausibly take.
export function waveSpan(w, seed = 'span', opts = {}) {
  const p = planWave(w, seed, opts);
  let t = 0;
  for (const g of p.groups) t = Math.max(t, g.delay + Math.max(0, g.count - 1) * g.gap);
  return t;
}
const spanMemo = {};
export function sprintMinSeconds(level = 'standard') {
  const L = sprintLevel(level);
  if (spanMemo[L.id] == null) { let s = 0; for (let w = 1; w <= SPRINT.waves; w++) s += waveSpan(w, 'span', { hpScale: L.hpScale, countScale: L.countScale, gapScale: L.gapScale }); spanMemo[L.id] = Math.floor(s * 0.85); }
  return spanMemo[L.id];
}

// Plausibility for the new modes (the server runs this after the general checks). Returns null when fine, or a reason.
export function validateModeRun(r) {
  if (!isNewMode(r.mode)) return null;
  const clock = Number.isFinite(r.clock) ? r.clock : -1;
  if (clock < 0) return 'bad clock';
  if (clock > r.duration + 5) return 'clock longer than the run';
  if (r.mode === 'gauntlet') {
    if (r.wave < GAUNTLET.firstWave || (r.wave - GAUNTLET.firstWave) % GAUNTLET.step) return 'bad wave';
    if (r.wavesCleared > gauntletFights(r.wave) + 1) return 'bad waves cleared';
    if (r.duration < r.wavesCleared * 6) return 'too fast';
  } else if (r.mode === 'laststand') {
    if (r.wave < LASTSTAND.startWave) return 'bad wave';
    if (r.wavesCleared > lastStandWaves(r.kills) + 1) return 'bad waves cleared';
    if (r.wave - LASTSTAND.startWave > clock / 8 + 2) return 'too fast';
    if (r.kills > clock * 40 + 100) return 'too many kills';
  } else if (r.mode === 'endurance') {
    if (r.wave < 1 || r.wave > 5000) return 'bad wave';
    if (r.wavesCleared > lastStandWaves(r.kills) + 1) return 'bad waves cleared';
    if (r.wave - 1 > clock / ENDURANCE.beat + 2) return 'too fast';
    if (r.kills > clock * 40 + 100) return 'too many kills';
  } else if (r.mode === 'warfront') {
    if (r.wave < 1 || r.wavesCleared > r.wave) return 'bad wave';
    if (r.duration < (r.wave - 1) * 4) return 'too fast';
  } else if (r.mode === 'sprint') {
    if (r.wave > SPRINT.waves + 1) return 'bad wave';
    if (r.victory && (r.wavesCleared < SPRINT.waves || clock < sprintMinSeconds(r.level))) return 'too fast';
  }
  return null;
}

// Towers are free (or fixed-price) in the special modes, so nothing stops one tower type from being spammed: each type has a cap.
export const TOWER_CAP = { default: 4, obelisk: 3, barracks: 3, voidwell: 3, sanctum: 2, mint: 2 };
export const towerCapOf = (id) => TOWER_CAP[id] ?? TOWER_CAP.default;

// ---------- Local modes: played for fun and personal records; they feed the Realm but no weekly board ----------
// Hero Mode: the commander (the computer) raises and upgrades the towers; you fight from the castle wall in first person.
export const HERO = {
  firstBreak: 14,      // seconds before the first wave (the commander builds at once; this is time to look around)
  buildTime: 9,        // seconds between waves: the commander does not need long
  towerMult: 0.85,     // towers hit a little softer than in a classic run ...
  weaponMult: 1.5,     // ... and your weapon a lot harder, so your aim matters
  weaponShare: 0.18,   // share of the treasury the commander puts into your weapon
};
// The Daily Siege: a small daily puzzle. A fixed supply of points, a daily roster of towers, then ten waves you only watch.
export const SIEGE = {
  points: 12,          // supply to spend on towers
  start: 9,            // the first wave's strength
  waves: 10,           // waves to hold (waves 9 to 18: the boss of wave 10 comes second)
  gap: 3,              // seconds between waves once the siege begins
  tier: 3,             // every tower stands at this tier; nothing can be upgraded
  hillMult: 2,         // hills count double in a siege: height is the puzzle
  roster: 6,           // tower types on offer each day
  maps: ['meadow', 'twin', 'cross', 'coil', 'bog', 'spine', 'frontier', 'hive', 'fork', 'ravine'],
};
export const SIEGE_COST = { archer: 1, firetrap: 1, cannon: 2, mage: 2, flak: 2, ballista: 2, frost: 2, barracks: 2, venom: 2, catapult: 3, artillery: 3, tesla: 3, gatling: 3, obelisk: 4, voidwell: 4, trebuchet: 4 };
export const LOCAL_MODES = ['hero', 'siege', 'bossrush', 'draft', 'night', 'duo', 'trials', 'assault', 'raid', 'conquest', 'blitz', 'dominion'];
export const isLocalMode = (m) => LOCAL_MODES.includes(m);
// Today's siege: the same map, seed and roster for everyone. Archers are always on offer so every puzzle can be started.
export function siegeSetup(day) {
  const seed = `siege-${day}`, h = seedFor(seed, 'setup');
  const mapPool = String(day) >= SIEGE_NEW_FROM ? [...SIEGE.maps, ...NEW_FIELDS] : SIEGE.maps;
  const map = mapPool[h % mapPool.length];
  const pool = Object.keys(SIEGE_COST).filter((id) => id !== 'archer');
  const roster = ['archer'];
  let k = Math.floor(h / 11);
  while (roster.length < SIEGE.roster) { const id = pool.splice(k % pool.length, 1)[0]; roster.push(id); k = Math.floor(k / 3) + 7 * roster.length; }
  return { seed, map, roster, day };
}
// Points: 100 a wave held; a full defence adds what is left of the keep and wall, and unspent supply is a small bonus.
export function siegeScore({ wavesCleared = 0, castlePct = 0, wallPct = 0, left = 0, victory = false }, cfg = SIEGE) {
  return Math.round(Math.min(cfg.waves, wavesCleared) * 100 + (victory ? 500 * castlePct + 200 * wallPct + 40 * left : 0));
}
export const SIEGE_MAX = siegeScore({ wavesCleared: SIEGE.waves, castlePct: 1, wallPct: 1, left: SIEGE.points, victory: true });


// ---------- Boss Rush: one boss after another ----------
// Every fight is a boss wave (10, 20, 30 ...) with a thin escort; short breaks, a boon after every boss and a big purse.
export const BOSSRUSH = { firstWave: 10, step: 10, buildTime: 14, escort: 0.35, purse: 2.5, startGold: 250 };
export const bossRushFights = (wave) => Math.max(0, Math.floor((wave - BOSSRUSH.firstWave) / BOSSRUSH.step));

// ---------- Draft: before each wave, pick one tower card of three ----------
export const DRAFT = { offer: 3, startCards: 2 };
// Special cards: from wave 3, one card in an offer may be one of these instead of a tower.
export const DRAFT_SPECIALS = {
  sp_promote: { icon: '⬆', name: 'Field Promotion', desc: 'Your strongest tower below tier 4 rises a tier, free.' },
  sp_master:  { icon: '★', name: 'Master Smith', desc: 'Your strongest tier-5 tower earns a Mastery star, free.' },
  sp_chest:   { icon: '💰', name: 'War Chest', desc: 'Gold for the treasury: more the deeper you are.', gold: (w) => Math.round(60 + 14 * w) },
  sp_survey:  { icon: '🏗', name: 'Surveyors', desc: 'The best ruined plot opens, free.' },
};

// ---------- Night Siege: darkness; towers only see what is lit ----------
// Light: the castle, every tower's own torch, and the glowing towers (mage, tesla, frost, obelisk, sanctum, fire traps) much further.
export const NIGHT = { castle: 3.6, torch: 1.2, glow: { mage: 2.4, tesla: 2.4, frost: 2.2, obelisk: 3.2, sanctum: 2.6, firetrap: 1.8, voidwell: 2 }, burning: true, score: 1.4 };

// ---------- Duo Siege: two players, one device ----------
// The builder plays between waves in the classic or angled view; the hero takes the phone for each wave in first person.
export const DUO = { buildTime: 30 };

// ---------- Siege Trials: a ladder of hand-made puzzles on the Daily Siege rules ----------
// Each: map, roster, supply points, the first wave and how many to hold. Stars: hold = 1, keep ≥ 60% = 2, keep ≥ 90% and wall ≥ 50% = 3.
export const TRIALS = [
  { id: 't1', name: 'First Watch', map: 'meadow', roster: ['archer', 'cannon'], points: 8, start: 3, waves: 6, tip: 'Archers on the hills see the whole bend.' },
  { id: 't2', name: 'Two Roads', map: 'twin', roster: ['archer', 'cannon', 'mage'], points: 9, start: 5, waves: 7, tip: 'Cover the spot where the roads meet.' },
  { id: 't3', name: 'Wings Over the Coil', map: 'coil', roster: ['archer', 'flak', 'cannon'], points: 10, start: 7, waves: 8, tip: 'Flyers come straight for the keep: Flak near the walls.' },
  { id: 't4', name: 'Iron Column', map: 'cross', roster: ['archer', 'mage', 'ballista', 'firetrap'], points: 11, start: 9, waves: 8, tip: 'Armor shrugs off arrows. Mages and Ballistas.' },
  { id: 't5', name: 'The Bog Road', map: 'bog', roster: ['archer', 'frost', 'catapult', 'cannon'], points: 13, start: 9, waves: 9, tip: 'Slow them in the mud and let the Catapult work.' },
  { id: 't6', name: 'Spine of the World', map: 'spine', roster: ['archer', 'tesla', 'artillery', 'barracks'], points: 14, start: 10, waves: 9, tip: 'Long roads reward long range.' },
  { id: 't7', name: 'The Hive', map: 'hive', roster: ['archer', 'mage', 'gatling', 'venom'], points: 15, start: 11, waves: 10, tip: 'Many spawns, one keep: hold the last stretch.' },
  { id: 't8', name: 'Forked Tongue', map: 'fork', roster: ['archer', 'cannon', 'obelisk', 'frost'], points: 16, start: 12, waves: 10, tip: 'One Obelisk on the right hill can carry a fork.' },
  { id: 't9', name: 'Ravine', map: 'ravine', roster: ['archer', 'trebuchet', 'tesla', 'firetrap', 'ballista'], points: 17, start: 13, waves: 9, tip: 'A boss closes the ravine. Bring the Trebuchet.' },
  { id: 't10', name: 'The Last Gate', map: 'frontier', roster: ['archer', 'mage', 'cannon', 'voidwell', 'artillery', 'flak'], points: 18, start: 15, waves: 10, tip: 'Everything you have learned.' },
];
export const trialById = (id) => TRIALS.find((t) => t.id === id) || TRIALS[0];
export const trialStars = ({ victory, castlePct, wallPct }) => (!victory ? 0 : 1 + (castlePct >= 0.6 ? 1 : 0) + (castlePct >= 0.9 && wallPct >= 0.5 ? 1 : 0));
