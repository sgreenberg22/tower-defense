// Pure wave-scaling and roster generation. No DOM; shared with tests, sim and server validation.
import { WAVE, ENEMIES, BOSSES, BIOMES, GAME, ASCENSION } from '../data/balance.js';
import { Rng, seedFor } from '../core/rng.js';

export function rawCount(w) {
  return Math.floor(WAVE.countBase + WAVE.countLin * w + WAVE.countQuad * w * w);
}

export function waveCount(w, opts = {}) {
  let c = rawCount(w);
  if (opts.swarm) c *= 2;
  return Math.min(c, GAME.maxEnemies);
}

export function hpMult(w, opts = {}) {
  const lin = 1 + WAVE.hpLin * (w - 1);
  const exp = Math.pow(WAVE.hpExpBase, Math.max(0, w - WAVE.hpExpStart));
  let m = lin * exp;
  let c = rawCount(w);
  if (opts.swarm) { c *= 2; m *= 0.55; }
  if (c > GAME.maxEnemies) m *= c / GAME.maxEnemies;
  m *= 1 + (opts.ascension || 0) * ASCENSION.hp;
  m *= 1 + gearTier(w) * WAVE.gearBonus;
  return m;
}

export function speedMult(w, opts = {}) {
  let s = 1 + Math.min(WAVE.speedCap, WAVE.speedPerWave * (w - 1));
  s *= 1 + (opts.ascension || 0) * ASCENSION.speed;
  if (opts.double) s *= 1.5;
  return s;
}

export function armorAdd(w) { return Math.min(WAVE.armorCap, WAVE.armorPerWave * w); }
export function gearTier(w) { return Math.floor((w - 1) / WAVE.gearEvery); }
export function isBossWave(w) { return w > 0 && w % WAVE.bossEvery === 0; }
export function biomeIndex(w) { return Math.floor((Math.max(1, w) - 1) / WAVE.biomeEvery) % BIOMES.length; }
export function biomeFor(w) { return BIOMES[biomeIndex(w)]; }
export function biomeCycle(w) { return Math.floor((Math.max(1, w) - 1) / (WAVE.biomeEvery * BIOMES.length)); }

export function bossFor(w) {
  const n = w / WAVE.bossEvery - 1;
  const def = BOSSES[n % BOSSES.length];
  const cycle = Math.floor(n / BOSSES.length);
  return { ...def, cycle };
}

export function unlockedTypes(w) {
  return Object.entries(ENEMIES).filter(([, e]) => e.unlock <= w && e.weight > 0).map(([id]) => id);
}

// Returns a deterministic wave plan.
// groups: [{type, count, gap, delay, spawn}]  (spawn = spawn point index, chosen modulo the map's spawn count)
export function planWave(w, seed, opts = {}) {
  const rng = new Rng(seedFor(seed, 'wave', w));
  const n = waveCount(w, opts);
  const types = unlockedTypes(w);
  const groups = [];
  let remaining = n;
  const gapBase = Math.max(0.28, WAVE.spawnGap - 0.006 * w);
  let delay = 0.5;
  // Newest unlocked type gets a spotlight the wave it appears.
  const fresh = types.find((t) => ENEMIES[t].unlock === w);
  if (fresh && w > 1) {
    const heavy = ENEMIES[fresh].hp >= 200;
    const c = heavy ? Math.max(2, Math.round(n * 0.07)) : Math.max(3, Math.round(n * 0.25));
    const gap = gapBase * (heavy ? 2.6 : 1.3);
    groups.push({ type: fresh, count: c, gap, delay, spawn: 0 });
    remaining -= c; delay += c * gap + WAVE.groupGap;
  }
  let g = 0;
  while (remaining > 0) {
    const type = rng.weighted(types, (t) => {
      const e = ENEMIES[t];
      // Older types fade a little as waves go on; grunts never vanish.
      const age = w - e.unlock;
      return e.weight * (t === 'grunt' ? Math.max(0.35, 1 - w * 0.012) : 1 + Math.min(1, age * 0.03));
    });
    const big = ENEMIES[type].hp >= 200;
    const size = Math.min(remaining, big ? rng.int(1, 3) : rng.int(3, 8 + Math.floor(w / 8)));
    const gap = gapBase * (big ? 2.2 : ENEMIES[type].speed > 1.5 ? 0.7 : 1);
    groups.push({ type, count: size, gap, delay, spawn: g++ });
    remaining -= size;
    delay += size * gap * 0.75 + WAVE.groupGap * rng.range(0.5, 1.1);
  }
  let boss = null;
  if (isBossWave(w)) {
    boss = bossFor(w);
    groups.push({ type: 'boss', boss: boss.id, count: 1, gap: 1, delay: delay + 1.5, spawn: 0 });
  }
  return {
    wave: w, groups, boss, total: n + (boss ? 1 : 0),
    hp: hpMult(w, opts), speed: speedMult(w, opts), armor: armorAdd(w), gear: gearTier(w),
    biome: biomeIndex(w),
  };
}

// Distinct enemy types in a plan, used for the "next wave" preview.
export function previewTypes(plan) {
  const seen = new Map();
  for (const g of plan.groups) {
    const key = g.type === 'boss' ? 'boss:' + g.boss : g.type;
    seen.set(key, (seen.get(key) || 0) + g.count);
  }
  return [...seen.entries()].map(([k, c]) => ({ key: k, count: c }));
}
