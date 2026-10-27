// Plausibility bounds shared by the client (self-check) and the server (anti-abuse).
import { rawCount, isBossWave, planWave } from './waves.js';
import { MAX_ENEMY_POINTS, MAX_BOSS_POINTS, scoreMultiplier, waveClearGold, waveGoldMult } from './economy.js';
import { ECON, COMBO, GAME, MODIFIERS, DIFFICULTY, HEADSTART, ENEMIES, BOSSES } from '../data/balance.js';
import { realmDay, seedFor } from '../core/rng.js';
import { isNewMode, validateModeRun } from './modes.js';
import { isAssaultMode, validateAssaultRun } from './assault.js';

export const MAX_WAVE = 2000;
export const DAILY_V18 = '2026-10-14';
export const DAILY_V24 = '2026-10-18';   // the hard maps join the daily pool
export const DAILY_V48 = '2026-10-27';   // the five v1.48 fields join the daily pool
export const MIN_SECONDS_PER_WAVE = 4;
// The seven named tiers, plus every fifth wave up to 70 for Adaptive play (see meta/adaptive.js).
export const START_WAVES = [...new Set([...DIFFICULTY.map((d) => d.wave), ...Array.from({ length: 14 }, (_, i) => (i + 1) * 5)])].sort((a, b) => a - b);
export const cleanStart = (v) => (START_WAVES.includes(v | 0) ? v | 0 : 1);

// Max kills achievable through wave w (spawned enemies + splits + summons, generously).
export function maxKills(w) {
  let k = 0;
  for (let i = 1; i <= w; i++) k += Math.min(rawCount(i) * 2, GAME.maxEnemies * 2) * 4 + (isBossWave(i) ? 80 : 0);
  return k;
}

export function maxScore(w, modifiers = [], ascension = 0) {
  const comboMax = 1 + (COMBO.cap + 10) * COMBO.perStep;
  let s = 0;
  for (let i = 1; i <= w; i++) {
    const kills = Math.min(rawCount(i) * 2, GAME.maxEnemies * 2) * 4;
    const per = MAX_ENEMY_POINTS * (1 + ECON.killPointsPerWave * (i - 1)) * ECON.heroKillPoints * comboMax;
    s += kills * per + ECON.waveClearPoints * i * 1.5;
    if (isBossWave(i)) s += MAX_BOSS_POINTS * (1 + ECON.killPointsPerWave * (i - 1)) * ECON.heroKillPoints * comboMax * 2;
  }
  return Math.ceil(s * scoreMultiplier(modifiers, ascension) * 1.25);
}

export function dailySetup(dateKey = realmDay()) {
  const seed = 'daily-' + dateKey;
  const h = seedFor(seed, 'setup');
  // The Wild Marches maps join the daily rotation from launch day on (earlier dates keep their old map,
  // so a daily already in progress never changes underneath its leaderboard).
  const maps = dateKey >= DAILY_V48 ? ['meadow', 'twin', 'cross', 'frontier', 'coil', 'bog', 'spine', 'hive', 'fork', 'ravine', 'hamlet', 'frostmere', 'bridge', 'mirror', 'cinder']
    : dateKey >= DAILY_V24 ? ['meadow', 'twin', 'cross', 'frontier', 'coil', 'bog', 'spine', 'hive', 'fork', 'ravine']
    : dateKey >= DAILY_V18 ? ['meadow', 'twin', 'cross', 'frontier', 'coil', 'bog', 'spine'] : ['meadow', 'twin', 'cross', 'frontier'];
  const modIds = Object.keys(MODIFIERS).filter((m) => m !== 'goldrush');
  const m1 = modIds[h % modIds.length];
  const m2 = modIds[(Math.floor(h / 7) + 3) % modIds.length];
  const modifiers = m1 === m2 ? [m1] : [m1, m2];
  return { seed, map: maps[Math.floor(h / 13) % maps.length], modifiers, date: dateKey };
}

// Returns null when ok, or a reason string.
export function validateRun(r, now = Date.now()) {
  if (!r || typeof r !== 'object') return 'bad payload';
  const num = (v) => Number.isFinite(v) && v >= 0;
  for (const k of ['wave', 'score', 'kills', 'heroKills', 'duration']) if (!num(r[k])) return 'bad ' + k;
  if (r.wave > MAX_WAVE) return 'wave too high';
  if (r.heroKills > r.kills) return 'hero kills > kills';
  if (r.kills > maxKills(r.wave + 1)) return 'too many kills';
  const mods = Array.isArray(r.modifiers) ? r.modifiers.filter((m) => MODIFIERS[m]) : [];
  const asc = Math.max(0, Math.min(10, r.ascension | 0));
  if (r.score > maxScore(r.wave + 1, mods, asc)) return 'score too high';
  const start = cleanStart(r.start);
  if (r.start !== undefined && (r.start | 0) !== start) return 'bad start wave';
  if (start > 1 && (r.mode === 'daily' || r.mode === 'challenge')) return 'daily runs start on wave 1';
  if (isAssaultMode(r.mode)) return start > 1 ? 'bad start wave' : validateAssaultRun(r);   // Assault and the Daily Raid: you attack, so waves are strongholds and razed emplacements
  if (['siege', 'hero', 'trials', 'bossrush', 'draft', 'night', 'duo', 'dominion'].includes(r.mode)) {   // local modes (see LOCAL_MODES); the Siege and Trials send start 1
    if (r.mode === 'siege') return r.wave > 20 ? 'bad wave' : r.duration < Math.max(0, r.wave - 7) * 5 ? 'too fast' : null;
    if (r.mode === 'trials') return r.wave > 30 ? 'bad wave' : null;
    if (r.mode === 'dominion' && r.wave - start > 12) return 'bad wave';   // a Dominion battle is a handful of waves
    if (r.mode === 'bossrush') return r.wave % 10 || r.wave < 10 ? 'bad wave' : r.duration < (r.wave / 10 - 1) * 8 ? 'too fast' : null;
    if (r.wave < start || r.duration < (r.wave - start + 1) * MIN_SECONDS_PER_WAVE * 0.6) return 'too fast';
    return null;
  }
  if (isNewMode(r.mode)) return start > 1 ? 'bad start wave' : validateModeRun(r);   // Gauntlet, Last Stand and Sprint have their own pace
  if (r.wave < start) return 'bad wave';
  if (r.duration < (r.wave - start + 1) * MIN_SECONDS_PER_WAVE) return 'too fast';
  if (r.mode === 'daily') {
    const today = dailySetup(realmDay(new Date(now)));
    const yesterday = dailySetup(realmDay(new Date(now - 86400000)));
    if (r.seed !== today.seed && r.seed !== yesterday.seed) return 'stale daily';
  }
  return null;
}

// What starting on wave `start` hands you up front: a share of the gold of the skipped waves, open plots, boon picks.
export function headStartPackage(start, seed = 'preview', waveOpts = {}, killGold = 0) {
  if (!(start > 1)) return { gold: 0, plots: 0, boons: 0 };
  let gold = 0;
  for (let w = 1; w < start; w++) {
    gold += waveClearGold(w);
    for (const g of planWave(w, seed, waveOpts).groups) {
      const bounty = g.type === 'boss' ? (BOSSES.find((b) => b.id === g.boss)?.bounty || 0) : (ENEMIES[g.type]?.bounty || 0);
      gold += bounty * g.count * waveGoldMult(w);
    }
  }
  const skipped = start - 1;
  return {
    gold: Math.round(gold * HEADSTART.catchGold * (1 + killGold)),
    plots: Math.min(HEADSTART.plotCap, Math.floor(skipped / HEADSTART.plotEvery)),
    boons: Math.min(HEADSTART.boonCap, Math.floor(skipped / HEADSTART.boonEvery)),
  };
}
