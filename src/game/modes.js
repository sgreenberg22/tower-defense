// Game modes beyond the classic endless run. Pure rules shared by the engine, the client and the server, so a mode
// plays, validates and ranks the same everywhere. Every mode still feeds the Realm: kills, waves and orders all count.
import { seedFor } from '../core/rng.js';
import { planWave } from './waves.js';

export const MODE_IDS = ['gauntlet', 'endurance', 'laststand', 'sprint'];
export const isNewMode = (m) => MODE_IDS.includes(m);

// ---------- Gauntlet: a new map after every boss, starting over richer each time ----------
export const GAUNTLET = {
  firstWave: 2,        // the wave counter runs 2, 4, 6 ...: every fight is worth two waves of toughening
  step: 2,
  stageEvery: 10,      // a boss on every tenth wave closes a stage (so five fights a stage)
  buildTime: 12,       // seconds of break between fights (a normal run gives 30)
  stageBuild: 30,      // the first break on a fresh map, when everything has to be built again
  maps: ['meadow', 'twin', 'coil', 'cross', 'bog', 'spine', 'frontier', 'hive', 'fork', 'ravine'],   // the hard maps come last: only deep runs reach them
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
  weaponLv: { dmg: 10, reload: 8, ammo: 4, crit: 6 },   // the hero's weapon comes fully trained
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
// Sprint ranks by the fastest clear: the board stores a value that grows as the time shrinks.
export const SPRINT_BOARD_BASE = 100000;
export const sprintBoardValue = (seconds) => Math.max(1, SPRINT_BOARD_BASE - Math.round(seconds));
export const sprintSecondsFrom = (value) => SPRINT_BOARD_BASE - value;

export const MODES = {
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
export function weeklySetup(mode, key) {
  const base = mode === 'laststand' ? LASTSTAND.maps : mode === 'endurance' ? ENDURANCE.maps : SPRINT.maps;
  const list = key >= WEEKLY_HARD_FROM ? [...base, ...HARD_MAPS] : base;
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
let spanMemo = null;
export function sprintMinSeconds() {
  if (spanMemo == null) { let s = 0; for (let w = 1; w <= SPRINT.waves; w++) s += waveSpan(w, 'span', { hpScale: SPRINT.hpScale, countScale: SPRINT.countScale, gapScale: SPRINT.gapScale }); spanMemo = Math.floor(s * 0.85); }
  return spanMemo;
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
  } else if (r.mode === 'sprint') {
    if (r.wave > SPRINT.waves + 1) return 'bad wave';
    if (r.victory && (r.wavesCleared < SPRINT.waves || clock < sprintMinSeconds())) return 'too fast';
  }
  return null;
}

// Towers are free (or fixed-price) in the special modes, so nothing stops one tower type from being spammed: each type has a cap.
export const TOWER_CAP = { default: 4, obelisk: 3, barracks: 3, voidwell: 3, sanctum: 2, mint: 2 };
export const towerCapOf = (id) => TOWER_CAP[id] ?? TOWER_CAP.default;
