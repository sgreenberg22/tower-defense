// Pure wave-scaling and roster generation. No DOM; shared with tests, sim and server validation.
import { WAVE, ENEMIES, BOSSES, BIOMES, GAME, ASCENSION, THREATS } from '../data/balance.js';
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
// A March's native foe joins early: light foes from wave 4, heavy ones (200+ HP) from wave 8.
export const marchFrom = (id) => Math.min(ENEMIES[id].unlock, ENEMIES[id].hp >= 200 ? 8 : 4);
const MARCH_BOOST = 4, MARCH_WEIGHT = 8;
const SCOUT_FROM = 12, SCOUT_BOOST = 2.5;   // = realmmap SCOUT (kept local: waves.js has no dependency on the map)

// Returns a deterministic wave plan.
// groups: [{type, count, gap, delay, spawn}]  (spawn = spawn point index, chosen modulo the map's spawn count)
// Which threat (if any) shapes wave w. Deterministic per seed; never two of the same in a row; bosses stand alone.
const threatMemo = new Map();
export function threatFor(w, seed) {
  if (w < 2 || isBossWave(w)) return null;
  const mk = seed + '|' + w;
  if (threatMemo.has(mk)) return threatMemo.get(mk);
  if (threatMemo.size > 4000) threatMemo.clear();
  const pick = (ww) => {
    const rng = new Rng(seedFor(seed, 'threat', ww));
    if (ww < 2 || isBossWave(ww) || rng.chance(ww < 6 ? 0.45 : 0.2)) return null;   // some waves stay mixed
    const pool = Object.keys(THREATS).filter((id) => THREATS[id].unlock <= ww && THREATS[id].types.some((t) => ENEMIES[t].unlock <= ww || t === 'spider'));
    return pool.length ? pool[rng.int(0, pool.length - 1)] : null;
  };
  let id = pick(w);
  const prev = threatFor(w - 1, seed);
  if (id && id === prev) {
    const pool = Object.keys(THREATS).filter((k) => k !== id && THREATS[k].unlock <= w);
    id = pool.length ? pool[new Rng(seedFor(seed, 'threat2', w)).int(0, pool.length - 1)] : null;
  }
  threatMemo.set(mk, id);
  return id;
}

export function planWave(w, seed, opts = {}) {
  const rng = new Rng(seedFor(seed, 'wave', w));
  const threat = threatFor(w, seed);
  const th = threat ? THREATS[threat] : null;
  const n = Math.min(GAME.maxEnemies, Math.round(waveCount(w, opts) * (th?.count || 1) * (opts.countScale || 1)));
  const types = unlockedTypes(w);
  const mf = opts.marchFoe && ENEMIES[opts.marchFoe] ? opts.marchFoe : null;
  if (mf && !types.includes(mf) && w >= marchFrom(mf)) types.push(mf);
  // Scouts: the land the Realm has not yet taken sends its native foe ahead (see realmmap.js scoutFoe). A light, steady presence.
  const sc = opts.scout && ENEMIES[opts.scout] && opts.scout !== mf && w >= SCOUT_FROM ? opts.scout : null;
  if (sc && !types.includes(sc) && w >= marchFrom(sc)) types.push(sc);
  const groups = [];
  let remaining = n;
  const gapBase = Math.max(0.2, (Math.max(0.28, WAVE.spawnGap - 0.006 * w)) * (opts.gapScale || 1));
  let delay = 0.5;
  // Newest unlocked type gets a spotlight the wave it appears.
  const fresh = types.find((t) => ENEMIES[t].unlock === w);
  if (fresh && w > 1) {
    const heavy = ENEMIES[fresh].hp >= 200;
    const c = ENEMIES[fresh].steal ? 2 : heavy ? Math.max(2, Math.round(n * 0.07)) : Math.max(3, Math.round(n * 0.25));
    const gap = gapBase * (heavy ? 2.6 : 1.3);
    groups.push({ type: fresh, count: c, gap, delay, spawn: 0 });
    remaining -= c; delay += c * gap + WAVE.groupGap;
  }
  let g = 0;
  while (remaining > 0) {
    const type = rng.weighted(types, (t) => {
      const e = ENEMIES[t];
      // Older types fade a little as waves go on; grunts never vanish.
      const age = Math.max(0, w - e.unlock);
      const boost = th && th.types.includes(t) ? th.boost : 1;
      // A March's native foe is a steady presence (about a sixth of the field), however rare it is elsewhere.
      if (t === mf) return boost * Math.max(e.weight * MARCH_BOOST, MARCH_WEIGHT);
      if (t === sc) return boost * Math.max(e.weight * SCOUT_BOOST, 3);
      return boost * e.weight * (t === 'grunt' ? Math.max(0.35, 1 - w * 0.012) : 1 + Math.min(1, age * 0.03));
    });
    const E = ENEMIES[type];
    const big = E.hp >= 200;
    // Thieves sneak in alone; harpies arrive in tight flocks.
    const size = Math.min(remaining, E.steal ? 1 : big ? rng.int(1, 3) : E.flock ? rng.int(5, 10 + Math.floor(w / 8)) : rng.int(3, 8 + Math.floor(w / 8)));
    const gap = gapBase * (big ? 2.2 : E.flock ? 0.45 : E.speed > 1.5 ? 0.7 : 1);
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
    wave: w, groups, boss, total: n + (boss ? 1 : 0), threat,
    hp: hpMult(w, opts) * (th?.hp || 1) * (opts.hpScale || 1), speed: speedMult(w, opts) * (th?.speed || 1), armor: armorAdd(w), gear: gearTier(w),
    threatArmor: th?.armor || 0, threatMr: th?.mr || 0,
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
