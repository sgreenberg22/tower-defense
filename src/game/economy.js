// Pure economy formulas. No DOM; shared with tests, sim, and server validation.
import { ECON, TOWERS, TIER, GAME, ARMORY, MODIFIERS, ASCENSION, ENEMIES, BOSSES, WAVE, HEADSTART } from '../data/balance.js';

export function waveGoldMult(w) {
  return (1 + ECON.killGoldPerWave * (w - 1)) * Math.pow(WAVE.hpExpBase, ECON.killGoldExp * Math.max(0, w - WAVE.hpExpStart));
}

export function killGold(bounty, w, mods = {}) {
  let g = bounty * waveGoldMult(w);
  if (mods.hero) g *= ECON.heroKillGold;
  g *= 1 + (mods.goldBonus || 0);
  return Math.max(1, Math.round(g));
}

export function killPoints(points, w, mods = {}) {
  let p = points * (1 + ECON.killPointsPerWave * (w - 1));
  if (mods.hero) p *= ECON.heroKillPoints * (mods.combo || 1);
  return Math.round(p);
}

export function waveClearGold(w, bonus = 0) {
  return Math.round((ECON.waveClearBase + ECON.waveClearPerWave * w) * (1 + bonus));
}

export function waveClearPoints(w, flawless) {
  return Math.round(ECON.waveClearPoints * w * (flawless ? 1 + ECON.flawlessBonus : 1));
}

export function earlyCallGold(secondsLeft, w) {
  if (secondsLeft <= 0) return 0;
  return Math.ceil(secondsLeft * ECON.earlyCallPerSec * (1 + ECON.earlyCallPerWave * w));
}

export function towerCost(id, { discount = 0, owned = 0 } = {}) {
  const t = TOWERS[id];
  let c = t.cost;
  if (id === 'mint') c *= Math.pow(1 + TIER.mintCostGrowth, owned);
  return Math.round(c * (1 - discount));
}

// Cost to upgrade from `tier` (1-based) to tier+1.
export function upgradeCost(id, tier, discount = 0) {
  if (tier >= TIER.max) return Infinity;
  return Math.round(TOWERS[id].cost * TIER.costMult[tier] * (1 - discount));
}

export function masteryCost(id, mastery, discount = 0) {
  return Math.round(TOWERS[id].cost * TIER.mastery.costBase * Math.pow(TIER.mastery.growth, mastery) * (1 - discount));
}

export function sellValue(invested, freshThisPhase, refundBonus = 0) {
  return Math.floor(invested * (freshThisPhase ? 1 : Math.min(0.95, GAME.sellRefund + refundBonus)));
}

export function wallRepairCost(hp, w, discount = 0) {
  return Math.ceil(hp * (ECON.wallRepairBase + ECON.wallRepairPerWave * w) * (1 - discount));
}
export function castleRepairCost(hp, w, discount = 0) {
  return Math.ceil(hp * (ECON.castleRepairBase + ECON.castleRepairPerWave * w) * (1 - discount));
}
export function towerRepairCost(invested, missingFrac, discount = 0) {
  return Math.ceil(invested * ECON.towerRepairFactor * missingFrac * (1 - discount));
}

export function armoryCost(stat, level) {
  const a = ARMORY[stat];
  if (a.cap && level >= a.cap) return Infinity;
  return Math.round(a.base * Math.pow(a.growth, level));
}

export function scoreMultiplier(modifiers = [], ascension = 0) {
  let m = 1 + ascension * ASCENSION.score;
  for (const id of modifiers) m += MODIFIERS[id]?.score || 0;
  return Math.max(0.5, m);
}

// The wave that counts for rankings, records and milestones: waves you skipped by starting higher count part-way.
export function rankWave(wave, start = 1) {
  const skipped = Math.max(0, start - 1);
  return Math.max(1, Math.floor(wave - skipped * (1 - HEADSTART.rankCredit)));
}

// rankWave, but a head-start run must hold a few waves before the skipped ones count.
export function rankFor(wave, start = 1, wavesCleared = Math.max(0, wave - start)) {
  const r = rankWave(wave, start);
  return start > 1 && wavesCleared < HEADSTART.rankMinWaves ? Math.min(r, 1 + Math.max(0, wavesCleared)) : r;
}

// Renown for the waves you actually held. `start` is the wave you began on, so later starts pay more per wave.
export function renownWaves(wavesCleared, start = 0) {
  const n = Math.max(0, wavesCleared);
  return n * ECON.renownWaveBase + ECON.renownWaveGrowth * (n * start + (n * (n + 1)) / 2);
}

export function renownBreakdown(score, wavesCleared, { bonus = 0, bosses = 0, start = 0, mode = null } = {}) {
  const m = (mode && ECON.renownModeMult[mode]) || 1;   // the free modes pay by the minute far faster, so they are scaled to match
  const fromScore = score * ECON.renownPerScore * m;
  const fromWaves = renownWaves(wavesCleared, start) * m;
  const fromBosses = bosses * ECON.renownPerBoss * m;
  const base = fromScore + fromWaves + fromBosses;
  return { fromScore, fromWaves, fromBosses, base, total: Math.floor(base * (1 + bonus)) };
}

export function renownFor(score, wavesCleared, bonus = 0, bosses = 0, start = 0) {
  return renownBreakdown(score, wavesCleared, { bonus, bosses, start }).total;
}

export function leakDamage(dmg, w) {
  return dmg * (1 + ECON.leakDmgPerWave * w);
}

// Upper bound on points one enemy can be worth on wave w (used by server validation).
export const MAX_ENEMY_POINTS = Math.max(...Object.values(ENEMIES).map((e) => e.points));
export const MAX_BOSS_POINTS = Math.max(...BOSSES.map((b) => b.points));
