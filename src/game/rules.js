// Plausibility bounds shared by the client (self-check) and the server (anti-abuse).
import { rawCount, isBossWave } from './waves.js';
import { MAX_ENEMY_POINTS, MAX_BOSS_POINTS, scoreMultiplier } from './economy.js';
import { ECON, COMBO, GAME, MODIFIERS } from '../data/balance.js';
import { utcDateKey, seedFor } from '../core/rng.js';

export const MAX_WAVE = 2000;
export const MIN_SECONDS_PER_WAVE = 4;

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

export function dailySetup(dateKey = utcDateKey()) {
  const seed = 'daily-' + dateKey;
  const h = seedFor(seed, 'setup');
  const maps = ['meadow', 'twin', 'cross', 'frontier'];
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
  if (r.duration < r.wave * MIN_SECONDS_PER_WAVE) return 'too fast';
  if (r.mode === 'daily') {
    const today = dailySetup(utcDateKey(new Date(now)));
    const yesterday = dailySetup(utcDateKey(new Date(now - 86400000)));
    if (r.seed !== today.seed && r.seed !== yesterday.seed) return 'stale daily';
  }
  return null;
}
