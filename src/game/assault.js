// Assault and the Daily Raid: the war turned around. You march out of your keep along the road and storm the horde's war
// camp at the far end, with troops, siege engines and a few field orders, while its emplacements shoot back and its
// raiders come down the road at your keep. Pure logic: no DOM, no canvas. The 2D renderer reads this object through the
// same fields it reads from a classic Game (map, towers, enemies, garrison.units, projectiles, castle ...).
// Everything you destroy feeds the Realm: defenders slain and emplacements razed count as kills, strongholds as waves.
import { ENEMIES, TOWERS, BIOMES } from '../data/balance.js';
import { Rng, seedFor } from '../core/rng.js';
import { buildMap } from './maps.js';
import { planWave } from './waves.js';
import { PROVINCES, TERRAINS, provinceById, frontier, clampHeld } from './realmmap.js';

export const ASSAULT_MODES = ['assault', 'raid', 'conquest', 'blitz'];
export const isAssaultMode = (m) => ASSAULT_MODES.includes(m);

export const ASSAULT = {
  maps: ['meadow', 'twin', 'coil', 'bog', 'cross', 'spine', 'hive', 'fork', 'ravine', 'frontier', 'hamlet', 'frostmere', 'bridge', 'mirror', 'cinder'],
  supply: { start: 150, regen: 8, regenPerStage: 0.5, perRaze: 40, perSlain: 3, carry: 0.5, stageGrant: 140 },
  fortress: { hp: 2400, perStage: 0.7, archers: 2, range: 2.6, dmg: 7, rate: 1.1, oil: { every: 5, dmg: 55, r: 0.9 } },
  keep: { hp: 100, heal: 0.3, range: 2.8, dmg: 16, rate: 1.1 },
  emplacements: { base: 5, perStage: 1, max: 12 },
  scale: 1.16,          // emplacements, defenders and the fortress grow this much stronger every stage
  maxUnits: 28,         // your army on the field at once
  sally: { first: 10, every: 16, minEvery: 7, faster: 22, party: 2 },
  realm: { razedKills: 8, fortressKills: 25, fortressWaves: 5, razedPerWave: 3, slainPerWave: 40 },
  carryHeal: 0.3,       // share of the keep mended when a stronghold falls
  orderSlots: 3,
  foeExp: 0.7,          // defenders' health and your soldiers' damage both grow with (wave strength)^foeExp
};

// The Daily Raid: one war camp for everyone, the same every day, on the clock.
export const RAID = { stage: 4, limit: 300, maps: ['meadow', 'twin', 'coil', 'bog', 'cross', 'spine', 'hive', 'fork', 'ravine'] };
export function raidSetup(day) {
  const seed = `raid-${day}`, h = seedFor(seed, 'setup');
  return { seed, map: RAID.maps[h % RAID.maps.length], day };
}
export function raidScore({ victory = false, clock = 0, keepPct = 0, fortPct = 1, razed = 0 }) {
  if (victory) return Math.round(1000 + 5 * Math.max(0, RAID.limit - clock) + 500 * keepPct);
  return Math.round(Math.min(900, 700 * (1 - fortPct) + 25 * razed));
}
export const RAID_MAX = raidScore({ victory: true, clock: 0, keepPct: 1 });
// Blitz ranks by the clock: a full clear scores 5,000 plus 10 for every second under ten minutes; short of that, camps and razes.
export function blitzScore({ victory = false, clock = 0, taken = 0, razed = 0 }) {
  if (victory) return Math.round(5000 + 10 * Math.max(0, 600 - clock));
  return Math.round(Math.min(4500, 1200 * taken + 30 * razed));
}
export const BLITZ_MAX = blitzScore({ victory: true, clock: 0 });

// Blitz: three camps, one clock, the same three for everyone all week.
export const BLITZ = { stage: 2, camps: 3 };
export function blitzSetup(week) {
  const seed = `blitz-${week}`, rng = new Rng(seedFor(seed, 'setup'));
  const maps = rng.shuffle([...RAID.maps]).slice(0, BLITZ.camps);
  return { seed, maps, week };
}

// Frontier Conquest: storm the war camps holding the province the Realm wants next. Three camps on that land, defended by
// its native foe and the emplacements its people favor. Kills there count double toward the Daily Rally, like a March.
export const CONQUEST = { camps: 3, rallyMult: 2 };
const LAND_EMPL = {
  heartland: ['archer', 'cannon', 'barracks'], forest: ['archer', 'ballista', 'barracks'], coast: ['mage', 'flak', 'archer'],
  hills: ['cannon', 'catapult', 'ballista'], frost: ['frost', 'tesla', 'ballista'], ash: ['cannon', 'mage', 'catapult'],
  dunes: ['gatling', 'archer', 'cannon'], fen: ['mage', 'frost', 'barracks'],
};
const LAND_MAPS = { heartland: ['meadow', 'hamlet'], forest: ['twin', 'fork'], coast: ['bridge', 'coil'], hills: ['cross', 'mirror'], frost: ['frostmere', 'spine'], ash: ['cinder', 'hive'], dunes: ['cross', 'frontier'], fen: ['bog', 'hive'] };
export function conquestSetup(province) {
  const pr = province && typeof province === 'object' ? province : provinceById(province);
  if (!pr) return null;
  const T = TERRAINS[pr.terrain];
  const extra = LAND_MAPS[pr.terrain] || ['meadow', 'twin'];
  const maps = [T.battlefield, ...extra.filter((m) => m !== T.battlefield)].slice(0, CONQUEST.camps);
  while (maps.length < CONQUEST.camps) maps.push(RAID.maps[maps.length]);
  return { province: pr.id, name: pr.name, terrain: pr.terrain, land: T.name, biome: T.biome, foe: pr.foe, ring: pr.ring, stage: 1 + Math.max(1, pr.ring), maps, empl: LAND_EMPL[pr.terrain] || LAND_EMPL.heartland };
}
// Which province a Conquest goes for: the next one on the frontier, or the border one if the Realm is whole.
export function conquestTarget(held) { const f = frontier(held); return f.next || f.border || PROVINCES[1]; }

// Your army: built for the attack. `troop` units are drawn with the Garrison's figures (look = which figure), `engine`
// units are siege engines with their own art. cost in supply, cd = seconds before the card can be played again,
// unlock = strongholds you must have taken (in any attack mode, over all your runs) before it joins the column.
export const AUNITS = {
  footman:  { troop: true, look: 'footman', name: 'Footmen', icon: '🛡', unlock: 0, cost: 25, cd: 1.2, hp: 95, dmg: 10, rate: 1, speed: 1.9, reach: 0.5, armor: 5, blurb: 'Cheap and steady. They clear the road and hold it against raiders.' },
  archer:   { troop: true, look: 'bowman', name: 'Archers', icon: '🏹', unlock: 0, cost: 35, cd: 1.5, hp: 55, dmg: 9, rate: 1.2, speed: 1.8, range: 2.6, armor: 0, blurb: 'Shoot defenders and emplacements from behind the line.' },
  ram:      { engine: true, name: 'Battering Ram', icon: '🪵', unlock: 0, cost: 90, cd: 6, hp: 420, dmg: 70, rate: 0.6, speed: 0.85, reach: 0.6, armor: 30, siege: 2.5, ramOnly: true, blurb: 'Rolls past everything and pounds the gate. Boiling oil waits there: send it with a Surgeon, a Mantlet or a crowd.' },
  mantlet:  { engine: true, name: 'Mantlet', icon: '🧱', unlock: 1, cost: 50, cd: 4, hp: 320, dmg: 0, rate: 1, speed: 1.05, armor: 20, cover: 1.1, coverCut: 0.55, blurb: 'A rolling wooden shield at the head of the column. Troops near it take far less from arrows, bolts and shot.' },
  sapper:   { troop: true, look: 'engineer', name: 'Sappers', icon: '🧨', unlock: 2, cost: 60, cd: 4, hp: 80, dmg: 0, rate: 1, speed: 2.1, armor: 10, sapper: true, blurb: 'Run to the nearest emplacement, plant a charge and blow half of it apart.' },
  bombard:  { engine: true, name: 'Bombard', icon: '💣', unlock: 3, cost: 80, cd: 5, hp: 130, dmg: 34, rate: 0.5, speed: 0.95, range: 3.1, splash: 0.7, armor: 10, siege: 1.6, towerMult: 1.5, proj: 'ball', blurb: 'A cannon on wheels: blasts emplacements and the gate.' },
  drummer:  { troop: true, look: 'footman', name: 'War Drummer', icon: '🥁', unlock: 4, cost: 45, cd: 5, hp: 70, dmg: 0, rate: 1, speed: 1.8, armor: 0, aura: { r: 1.6, dmg: 0.2, speed: 0.15 }, follow: true, blurb: 'Marches behind the line: troops near the drum hit 20% harder and move 15% faster.' },
  surgeon:  { troop: true, look: 'cleric', name: 'Field Surgeon', icon: '✚', unlock: 5, cost: 60, cd: 4, hp: 70, dmg: 0, rate: 1, speed: 1.8, armor: 0, heal: 0.12, healRange: 2.2, healCd: 1.3, follow: true, blurb: 'Walks behind the line and patches up the most wounded, siege engines too.' },
  knight:   { troop: true, look: 'knight', name: 'Knights', icon: '⚔', unlock: 0, cost: 70, cd: 2.5, hp: 260, dmg: 20, rate: 0.9, speed: 1.6, reach: 0.55, armor: 45, cleave: 3, blurb: 'Plate armour and broad swords: every swing hits up to three foes. The answer to a road full of infantry.' },
  cavalry:  { troop: true, look: 'cavalry', name: 'Cavalry', icon: '🐎', unlock: 0, cost: 80, cd: 3, hp: 170, dmg: 16, rate: 1.1, speed: 3.4, reach: 0.6, armor: 20, charge: 3, trample: 0.75, hunter: 4, blurb: 'Rides down raiders anywhere near the road. The first blow on each foe lands three times as hard and tramples those beside it.' },
  catapult: { engine: true, name: 'Catapult', icon: '🪨', unlock: 9, cost: 120, cd: 7, hp: 150, dmg: 58, rate: 0.3, speed: 0.75, range: 4.4, splash: 1, armor: 10, siege: 2.2, towerMult: 1.6, proj: 'boulder', blurb: 'Outranges every emplacement. Slow, and needs cover.' },
  tower:    { engine: true, name: 'Siege Tower', icon: '🏯', unlock: 12, cost: 150, cd: 10, hp: 700, dmg: 0, rate: 1, speed: 0.6, reach: 0.6, armor: 25, ramOnly: true, breach: 0.1, unload: 4, blurb: 'Reaches the wall, tears a breach worth a tenth of the camp and drops four footmen over it. While it stands, everyone at the gate hits 50% harder.' },
};
export const AUNIT_ORDER = ['footman', 'archer', 'knight', 'cavalry', 'ram', 'mantlet', 'sapper', 'bombard', 'drummer', 'surgeon', 'catapult', 'tower'];

// Field orders: the portable weapons you carry. Pick three before you march; aimed ones land where you tap.
export const ORDERS = {
  firepots:    { name: 'Fire Pots', icon: '🔥', unlock: 0, cd: 16, aim: true, r: 1.15, dmg: 130, delay: 0.7, blurb: 'Three pots of fire on the spot you tap: hurts emplacements and defenders.' },
  horn:        { name: 'War Horn', icon: '📯', unlock: 0, cd: 24, time: 6, speed: 0.5, dmg: 0.35, blurb: 'Your whole army moves 50% faster and hits 35% harder for 6 seconds.' },
  smoke:       { name: 'Smoke Pots', icon: '💨', unlock: 0, cd: 20, aim: true, r: 1.8, time: 6, blurb: 'Emplacements in the cloud cannot see to shoot for 6 seconds.' },
  reinforce:   { name: 'Reinforcements', icon: '🚩', unlock: 2, cd: 32, n: 4, blurb: 'Four footmen join the column where it is fighting, free.' },
  requisition: { name: 'Requisition', icon: '📦', unlock: 6, cd: 45, supply: 100, blurb: 'A supply wagon reaches the keep: 100 supply at once (more on later camps).' },
};
export const ORDER_IDS = Object.keys(ORDERS);
export const DEFAULT_ORDERS = ['firepots', 'horn', 'smoke'];
export const cleanOrders = (list, career = 0) => {
  const ok = [...new Set(Array.isArray(list) ? list : [])].filter((id) => ORDERS[id] && ORDERS[id].unlock <= career).slice(0, ASSAULT.orderSlots);
  for (const id of DEFAULT_ORDERS) if (ok.length < ASSAULT.orderSlots && !ok.includes(id)) ok.push(id);
  return ok;
};

// The Realm's land helps the march: every province held of a land adds a little to the troops it is known for.
const LAND_PERK = {
  heartland: { key: 'supply', per: 10, text: (v) => `+${v} starting supply` },
  forest: { key: 'archer', per: 0.04, text: (v) => `Archers +${Math.round(v * 100)}% damage` },
  hills: { key: 'engines', per: 0.04, text: (v) => `Siege engines +${Math.round(v * 100)}% health` },
  dunes: { key: 'cavalry', per: 0.05, text: (v) => `Cavalry +${Math.round(v * 100)}% health and damage` },
  fen: { key: 'heal', per: 0.05, text: (v) => `Field Surgeons heal ${Math.round(v * 100)}% more` },
  frost: { key: 'armor', per: 1.5, text: (v) => `+${Math.round(v)} armor for every troop` },
  coast: { key: 'regen', per: 0.02, text: (v) => `Supply comes ${Math.round(v * 100)}% faster` },
  ash: { key: 'fire', per: 0.05, text: (v) => `Fire Pots and Bombards +${Math.round(v * 100)}% damage` },
};
export function assaultPerks(held) {
  const n = clampHeld(held || 0), out = { list: [] };
  const count = {};
  for (const p of PROVINCES.slice(1, n)) count[p.terrain] = (count[p.terrain] || 0) + 1;
  for (const [land, c] of Object.entries(count)) {
    const L = LAND_PERK[land]; if (!L) continue;
    out[L.key] = c * L.per;
    out.list.push({ land: TERRAINS[land].name, count: c, text: L.text(c * L.per) });
  }
  return out;
}

// The horde's emplacements: what they shoot and how hard (tier and stage scale these).
const EMPL = {
  archer:   { hp: 160, range: 3, dmg: 9, rate: 1.1, proj: 'arrow', air: true },
  cannon:   { hp: 200, range: 2.6, dmg: 17, rate: 0.55, proj: 'ball', splash: 0.75 },
  mage:     { hp: 170, range: 2.8, dmg: 14, rate: 0.7, proj: 'orb', magic: true, air: true },
  barracks: { hp: 260, spawn: 9, guards: 2 },
  frost:    { hp: 180, range: 2.2, dmg: 4, rate: 0.5, pulse: true, slow: 0.4, slowT: 2, air: true },
  ballista: { hp: 190, range: 3.8, dmg: 34, rate: 0.35, proj: 'bolt', pierce: 30 },
  tesla:    { hp: 200, range: 2.4, dmg: 12, rate: 0.8, chain: 3, magic: true, air: true },
  flak:     { hp: 170, range: 3.2, dmg: 18, rate: 1, proj: 'flak', splash: 0.6 },
  catapult: { hp: 220, range: 4.4, minRange: 1.2, dmg: 26, rate: 0.3, proj: 'boulder', splash: 1 },
  gatling:  { hp: 200, range: 2.4, dmg: 5, rate: 4, proj: 'arrow', air: true },
};
const EMPL_POOL = [['archer', 1], ['cannon', 1], ['mage', 2], ['barracks', 2], ['frost', 3], ['ballista', 3], ['tesla', 4], ['flak', 4], ['catapult', 5], ['gatling', 5]];
// The horde's foot soldiers, by stage: who sallies out of the gate and who guards the barracks.
const FOES = [['grunt', 1], ['runner', 1], ['shield', 2], ['archer', 2], ['cavalry', 3], ['skirmisher', 3], ['berserker', 4], ['warg', 4], ['ogre', 6], ['troll', 7]];
const RANGED_PROJ = new Set(['arrow', 'earrow', 'bolt', 'ball', 'orb', 'flak', 'boulder']);

let AUID = 1;
const hyp = Math.hypot;
function pathLen(p) { let L = 0; for (let i = 1; i < p.length; i++) L += hyp(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return L; }

export class AssaultGame {
  constructor(opts = {}) {
    this.opts = opts;
    this.mode = isAssaultMode(opts.mode) ? opts.mode : 'assault';
    this.raid = this.mode === 'raid'; this.conquest = this.mode === 'conquest'; this.blitz = this.mode === 'blitz';
    this.seed = opts.seed || 'assault';
    this.portrait = !!opts.portrait;
    this.assault = true;
    this.career = Math.max(0, opts.career | 0);        // strongholds taken over all your attack runs: opens the column
    this.held = clampHeld(opts.held || 0);             // the Realm's provinces: their land helps the march
    this.perks = assaultPerks(this.held);
    this.conq = this.conquest ? (conquestSetup(opts.province) || conquestSetup(conquestTarget(this.held))) : null;
    this.blitzCfg = this.blitz ? blitzSetup(String(this.seed).replace(/^blitz-/, '')) : null;
    this.camps = this.raid ? 1 : this.conquest ? CONQUEST.camps : this.blitz ? BLITZ.camps : Infinity;   // camps to take before the run is won
    this.listeners = {};
    this.rng = new Rng(seedFor(this.seed, 'assault'));
    this.stage = this.raid ? RAID.stage : this.conquest ? this.conq.stage : this.blitz ? BLITZ.stage : 1;
    this.taken = 0;               // strongholds taken this run
    this.time = 0; this.clock = 0; this.stageT = 0;
    this.phase = 'wave';          // the renderer and the music read this: always in battle
    this.over = false; this.victory = false;
    this.score = 0;
    this.combo = 0;
    this.weapon = { id: 'longbow', ammo: 1 };
    this.mod = {}; this.hazard = { t: 0, active: 0, kind: null };
    this.fields = []; this.zones = []; this.volleys = []; this.claimed = new Set();
    this.loadout = cleanOrders(opts.orders, this.career);
    this.orders = Object.fromEntries(this.loadout.map((id) => [id, { cd: id === 'horn' ? 6 : id === 'requisition' ? 15 : 3, max: ORDERS[id].cd }]));
    this.hornT = 0;
    this.cards = Object.fromEntries(AUNIT_ORDER.map((id) => [id, 0]));   // per-card cooldowns
    this.focus = null;            // an emplacement you marked: ranged units and engines shoot it first
    this.lane = -1;               // -1 alternates between the roads
    this.laneNext = 0;
    const keepHp = ASSAULT.keep.hp;
    this.castle = { hp: keepHp, maxHp: keepHp };
    this.wall = { hp: 0, maxHp: 0 };
    this.stats = {
      kills: 0, heroKills: 0, wavesCleared: 0, slain: 0, razed: 0, deployed: 0, lost: 0, supplySpent: 0, orders: 0,
      deployedBy: {}, razedBy: {}, time: 0, fortDmg: 0,
    };
    this.gold = 0;
    this.startStage(true);
  }

  // ---------- events ----------
  on(type, fn) { (this.listeners[type] ||= []).push(fn); return () => this.off(type, fn); }
  off(type, fn) { const l = this.listeners[type]; if (l) this.listeners[type] = l.filter((f) => f !== fn); }
  emit(type, data) { const l = this.listeners[type]; if (l) for (const f of l) f(data); }

  // ---------- what the renderer reads ----------
  get wave() { return 3 + 3 * (this.stage - 1); }
  get biome() { return BIOMES[this.biomeIdx()]; }
  biomeIdx() { if (this.conq) { const i = BIOMES.findIndex((b) => b.id === this.conq.biome); if (i >= 0) return i; } return Math.min(BIOMES.length - 1, Math.floor((this.stage - 1) / 3)); }
  get garrison() { return { units: this.engines.length ? this.units.concat(this.engines) : this.units }; }
  towerAt(x, y) { return this.towers.find((t) => t.x === x && t.y === y); }
  isVisible() { return true; }
  lights() { return null; }
  get mapSeed() { return this.mapSeedV; }

  // ---------- stage set-up ----------
  stageMult() { return Math.pow(ASSAULT.scale, this.stage - 1); }
  stageMapId() {
    if (this.raid) return raidSetup(String(this.seed).replace(/^raid-/, '')).map;
    if (this.conq) return this.conq.maps[Math.min(this.taken, this.conq.maps.length - 1)];
    if (this.blitzCfg) return this.blitzCfg.maps[Math.min(this.taken, this.blitzCfg.maps.length - 1)];
    const L = ASSAULT.maps;
    if (this.stage <= L.length) return L[this.stage - 1];
    return L[(seedFor(this.seed, 'map', this.stage) % L.length)];
  }

  startStage(first = false) {
    this.mapId = this.mode === 'assault' && this.opts.mapId && first && this.opts.mapId !== 'auto' && this.opts.mapId !== 'meadow' ? this.opts.mapId : this.stageMapId();
    this.mapSeedV = `${this.seed}|a${this.stage}`;
    this.map = buildMap(this.mapId, this.mapSeedV, this.portrait);
    this.lanes = this.map.paths.map((p) => {
      const pts = [...p].reverse();
      return { pts, len: pathLen(pts) };
    });
    // The war camp's gates: where each road begins (shared starts count once).
    const gates = [];
    for (const p of this.map.paths) if (!gates.some((g) => hyp(g.x - p[0].x, g.y - p[0].y) < 0.6)) gates.push({ x: p[0].x, y: p[0].y });
    this.gates = gates;
    const fh = ASSAULT.fortress.hp * (1 + ASSAULT.fortress.perStage * (this.stage - 1)) * this.stageMult() * (this.raid ? 1.6 : 1);
    this.fortress = { hp: fh, maxHp: fh, x: gates[0].x, y: gates[0].y, cd: 1, flash: 0 };
    this.enemies = []; this.projectiles = []; this.units = []; this.engines = [];
    this.towers = [];
    this.plan = planWave(this.wave, this.mapSeedV);
    this.placeEmplacements();
    this.sallyT = ASSAULT.sally.first;
    this.stageT = 0;
    this.focus = null;
    if (first) this.gold = ASSAULT.supply.start + (this.perks.supply || 0) + (this.raid ? 120 : this.conquest || this.blitz ? 60 : 0);
    this.docked = 0;   // siege towers standing at the wall
    this.emit('stageStart', { stage: this.stage, map: this.mapId, first });
  }

  placeEmplacements() {
    const E = ASSAULT.emplacements, rng = new Rng(seedFor(this.mapSeedV, 'empl'));
    const n = Math.min(E.max, this.map.plots.length, E.base + E.perStage * (this.stage - 1) + (this.raid ? 1 : 0));
    // The horde fortifies the ground near its camp first, then the approaches.
    const gate = this.gates[0];
    const plots = [...this.map.plots].map((p) => ({ p, w: rng.range(0, 3) + hyp(p.x + 0.5 - gate.x, p.y + 0.5 - gate.y) * 0.35 })).sort((a, b) => a.w - b.w).slice(0, n).map((o) => o.p);
    const pool = EMPL_POOL.filter(([, s]) => s <= this.stage).map(([id]) => id);
    const tier = Math.min(5, 1 + Math.floor((this.stage - 1) / 2));
    plots.forEach((p, i) => {
      let type = i === 0 ? 'archer' : this.conq && rng.chance(0.6) ? rng.pick(this.conq.empl) : rng.pick(pool);
      if (type === 'barracks' && this.towers.filter((t) => t.type === 'barracks').length >= 2) type = 'archer';
      this.towers.push(this.makeEmplacement(type, p.x, p.y, tier, !!p.high));
    });
  }

  makeEmplacement(type, x, y, tier, high) {
    const D = EMPL[type], m = this.stageMult(), tm = 1 + 0.35 * (tier - 1);
    const hp = D.hp * tm * m * (this.raid ? 1.15 : 1);
    return {
      uid: AUID++, type, x, y, cx: x + 0.5, cy: y + 0.5, tier, high, hp, maxHp: hp, ruined: false, soldiers: [], aim: Math.PI, recoil: 0,
      cd: 0.5 + Math.random(), disabledT: 0, guards: [], spawnT: D.spawn ? 2 : 0, kills: 0,
      stats: { range: (D.range || 0) + (high ? 0.4 : 0), minRange: D.minRange || 0, dmg: (D.dmg || 0) * (1 + 0.3 * (tier - 1)) * m, rate: D.rate || 0 },
    };
  }

  // ---------- your side ----------
  unitKnown(id) { const U = AUNITS[id]; return !!U && U.unlock <= this.career; }
  unitOpen(id) { return this.unitKnown(id); }
  unitCost(id) { return AUNITS[id].cost; }
  canDeploy(id) { return !this.over && this.unitOpen(id) && this.gold >= this.unitCost(id) && this.cards[id] <= 0 && this.alive() < ASSAULT.maxUnits; }
  alive() { return this.units.length + this.engines.length; }
  supplyRate() { return (ASSAULT.supply.regen + ASSAULT.supply.regenPerStage * (this.stage - 1)) * (1 + (this.perks.regen || 0)); }

  deploy(id, lane = this.lane) {
    if (!this.canDeploy(id)) return null;
    const U = AUNITS[id];
    const cost = this.unitCost(id);
    this.gold -= cost; this.stats.supplySpent += cost; this.cards[id] = U.cd;
    return this.muster(id, lane);
  }

  // Put a unit on the road (deploy pays for it; orders and siege towers bring some free). at = {lane, dist} to start mid-road.
  muster(id, lane = this.lane, at = null) {
    const U = AUNITS[id], P = this.perks;
    let li = at ? at.lane : lane;
    if (li < 0 || li >= this.lanes.length) { li = this.laneNext % this.lanes.length; this.laneNext++; }
    const L = this.lanes[li];
    // Your soldiers toughen with the foes they face (as the Garrison's do), and the Realm's land adds its gifts.
    const ph = this.plan.hp, hs = Math.max(1, Math.pow(ph, 0.55)), ds = Math.max(1, Math.pow(ph, ASSAULT.foeExp) * 0.8);
    const hpMult = (U.engine ? 1 + (P.engines || 0) : 1) * (id === 'cavalry' ? 1 + (P.cavalry || 0) : 1);
    const dmgMult = (id === 'archer' ? 1 + (P.archer || 0) : 1) * (id === 'cavalry' ? 1 + (P.cavalry || 0) : 1) * (id === 'bombard' ? 1 + (P.fire || 0) : 1);
    const hp = U.hp * hs * hpMult;
    const u = {
      uid: AUID++, kind: U.engine ? 'footman' : U.look, engine: !!U.engine, id, def: U, lane: li, path: L.pts, seg: 0, dist: 0, total: L.len,
      bx: L.pts[0].x, by: L.pts[0].y, x: L.pts[0].x, y: L.pts[0].y, off: this.rng.range(-0.16, 0.16),
      hp, maxHp: hp, armor: (U.armor || 0) + (U.engine ? 0 : P.armor || 0), dmg: U.dmg * ds * dmgMult, cd: 0.3, state: 'out', rank: 0, slot: AUID % 24,
      swing: 0, flash: 0, slowT: 0, target: null, charged: new Set(), plantT: 0, healCd: 0, engaged: false, troop: true, dead: false, drum: false,
    };
    // walk a short way out of the gate so the first figure doesn't stand inside the keep
    this.advance(u, at ? Math.max(0.7, at.dist) : 0.7);
    (U.engine ? this.engines : this.units).push(u);
    this.stats.deployed++; this.stats.deployedBy[id] = (this.stats.deployedBy[id] || 0) + 1;
    this.emit('deploy', { unit: u, free: !!at });
    return u;
  }

  setFocus(t) { this.focus = t && !t.ruined ? (this.focus === t ? null : t) : null; this.emit('focus', { tower: this.focus }); }

  orderReady(id) { return !this.over && this.orders[id] && this.orders[id].cd <= 0; }
  useOrder(id, x, y) {
    if (!this.orderReady(id)) return false;
    const O = ORDERS[id];
    if (O.aim && (x == null || y == null)) return false;
    this.orders[id].cd = O.cd; this.orders[id].max = O.cd; this.stats.orders++;
    if (id === 'horn') { this.hornT = O.time; this.emit('order', { id }); return true; }
    if (id === 'requisition') {
      const g = Math.round(O.supply * (1 + 0.15 * (this.stage - 1)));
      this.gold += g; this.emit('order', { id, gold: g }); return true;
    }
    if (id === 'reinforce') {
      // they join the furthest-forward fighters (or march out of the keep if no one is out)
      const lead = this.units.filter((u) => !u.dead && !u.def.flies).sort((a, b) => b.dist / b.total - a.dist / a.total)[0];
      const at = lead ? { lane: lead.lane, dist: Math.max(0.7, lead.dist - 0.6) } : null;
      for (let i = 0; i < O.n; i++) this.muster('footman', this.lane, at ? { ...at, dist: at.dist - i * 0.2 } : null);
      this.emit('order', { id, x: lead?.x, y: lead?.y }); return true;
    }
    if (id === 'smoke') {
      this.zones.push({ kind: 'smoke', x, y, r: O.r, t: O.time, max: O.time });
      for (const t of this.towers) if (!t.ruined && hyp(t.cx - x, t.cy - y) <= O.r + 0.3) t.disabledT = Math.max(t.disabledT, O.time);
      this.emit('order', { id, x, y, r: O.r });
      return true;
    }
    if (id === 'firepots') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + this.rng.range(0, 1), d = i ? 0.55 : 0;
        this.volleys.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r: O.r * 0.8, t: O.delay + i * 0.18, warn: O.delay + i * 0.18, kind: 'firepot' });
      }
      this.emit('order', { id, x, y, r: O.r });
      return true;
    }
    return false;
  }

  // ---------- main step ----------
  update(dt) {
    if (this.over) return;
    this.time += dt; this.clock += dt; this.stageT += dt; this.stats.time += dt;
    if (this.pauseT > 0) {   // the short beat after a stronghold falls, before the next march
      this.pauseT -= dt;
      this.updateProjectiles(dt);
      if (this.pauseT <= 0) this.nextStage();
      return;
    }
    this.gold += this.supplyRate() * dt;
    for (const id of AUNIT_ORDER) if (this.cards[id] > 0) this.cards[id] -= dt;
    for (const id of this.loadout) if (this.orders[id].cd > 0) this.orders[id].cd -= dt;
    if (this.hornT > 0) this.hornT -= dt;
    this.zones = this.zones.filter((z) => (z.t -= dt) > 0);
    this.updateVolleys(dt);
    this.updateSally(dt);
    this.updateUnits(dt);
    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateFortress(dt);
    this.updateKeep(dt);
    this.updateProjectiles(dt);
    this.units = this.units.filter((u) => !u.dead);
    this.engines = this.engines.filter((u) => !u.dead);
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.focus?.ruined) this.focus = null;
    if (this.raid && this.clock >= RAID.limit && !this.over) this.end(false, 'time');
    this.docked = this.engines.filter((u) => u.id === 'tower' && u.docked).length;
  }

  updateVolleys(dt) {
    for (const v of this.volleys) {
      v.t -= dt;
      if (v.t > 0) continue;
      v.done = true;
      const dmg = ORDERS.firepots.dmg * this.stageMult() * (1 + (this.perks.fire || 0));
      for (const t of this.towers) if (!t.ruined && hyp(t.cx - v.x, t.cy - v.y) <= v.r + 0.35) this.hurtTower(t, dmg, 'firepots');
      for (const e of this.enemies) if (!e.dead && hyp(e.x - v.x, e.y - v.y) <= v.r) this.hurtFoe(e, dmg * 0.8, null);
      if (hyp(this.fortress.x - v.x, this.fortress.y - v.y) <= v.r + 0.8) this.hurtFortress(dmg * 0.6, null);
      this.emit('impact', { x: v.x, y: v.y, kind: 'boulder', splash: v.r, fire: true });
    }
    this.volleys = this.volleys.filter((v) => !v.done);
  }

  // The horde sends raiding parties down every road, more and faster the longer a stage drags on.
  updateSally(dt) {
    const S = ASSAULT.sally;
    this.sallyT -= dt;
    if (this.sallyT > 0) return;
    this.sallyT = Math.max(S.minEvery, S.every - this.stageT / S.faster);
    const n = S.party + Math.floor(this.stage / 2) + Math.floor(this.stageT / 50);
    const pool = FOES.filter(([, s]) => s <= this.stage + 1).map(([id]) => id);
    for (let i = 0; i < n; i++) {
      const pi = i % this.map.paths.length;
      const type = i === 0 ? 'grunt' : this.conq && this.rng.chance(0.35) && !ENEMIES[this.conq.foe]?.air ? this.conq.foe : this.rng.pick(pool);
      this.spawnFoe(type, this.map.paths[pi], 0, i * 0.5);
    }
    this.emit('sally', { n });
  }

  spawnFoe(type, path, startDist = 0, delay = 0, guard = null) {
    const def = ENEMIES[type];
    // the horde's foot soldiers toughen with the camp, but slower than a classic wave does (your column must be able to cut through them)
    const hp = def.hp * Math.pow(this.plan.hp, ASSAULT.foeExp) * Math.pow(1.05, this.stage - 1) * (this.raid ? 1.1 : 1);
    const e = {
      uid: AUID++, type, def, name: def.name, path, seg: 0, x: path[0].x, y: path[0].y, vx: 0, vy: 0, dist: 0, total: pathLen(path),
      hp, maxHp: hp, armor: def.armor || 0, speed: def.speed * this.plan.speed, size: def.size, air: false, color: def.color,
      slowT: 0, slow: 0, burnT: 0, stunT: 0, shield: 0, stealthT: 0, buffT: 0, flash: 0, bob: this.rng.range(0, 6), gear: this.plan.gear,
      cd: 0.5, delay, dead: false, blocker: null, guard, boss: null, dmg: Math.max(4, (def.dmg || 1) * 4 * Math.sqrt(this.plan.hp)),
    };
    if (startDist) this.advance(e, startDist);
    this.enemies.push(e);
    return e;
  }

  // Walk anything along its road by d tiles (units walk their reversed road, foes the normal one).
  advance(o, d) {
    const p = o.path;
    let x = o.bx ?? o.x, y = o.by ?? o.y;
    while (d > 0 && o.seg < p.length - 1) {
      const b = p[o.seg + 1], left = hyp(b.x - x, b.y - y);
      if (left <= d) { x = b.x; y = b.y; o.seg++; d -= left; o.dist += left; } else { x += ((b.x - x) / left) * d; y += ((b.y - y) / left) * d; o.dist += d; d = 0; }
    }
    if (o.bx !== undefined) {
      o.bx = x; o.by = y;
      // spread the column a little across the road
      const a = p[Math.min(o.seg, p.length - 2)], b = p[Math.min(o.seg + 1, p.length - 1)], L = hyp(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
      const px = o.x, py = o.y;
      o.x = x + nx * o.off; o.y = y + ny * o.off;
      o.vx = o.x - px; o.vy = o.y - py;
    } else { const px = o.x, py = o.y; o.x = x; o.y = y; o.vx = x - px; o.vy = y - py; }
  }
  atGate(u) { return u.seg >= u.path.length - 1; }

  // ---------- your army ----------
  unitDmg(u) { return u.dmg * (this.hornT > 0 ? 1 + ORDERS.horn.dmg : 1) * (u.drum ? 1 + AUNITS.drummer.aura.dmg : 1); }
  unitSpeed(u) { return u.def.speed * (this.hornT > 0 ? 1 + ORDERS.horn.speed : 1) * (u.drum ? 1 + AUNITS.drummer.aura.speed : 1) * (u.slowT > 0 ? 1 - u.slow : 1); }
  // how far along its own road a unit is (0 at your keep, 1 at the camp gate)
  progress(u) { return u.dist / (u.total || 1); }

  nearestFoe(x, y, r, groundOnly = false) {
    let best = null, bd = r;
    for (const e of this.enemies) { if (e.dead || e.delay > 0 || (groundOnly && e.air)) continue; const d = hyp(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  nearestTower(x, y, r) {
    let best = null, bd = r;
    for (const t of this.towers) { if (t.ruined) continue; const d = hyp(t.cx - x, t.cy - y); if (d < bd) { bd = d; best = t; } }
    return best;
  }
  fortressIn(x, y, r) { return this.fortress.hp > 0 && this.gates.some((g) => hyp(g.x - x, g.y - y) <= r); }

  updateUnits(dt) {
    const all = [...this.units, ...this.engines];
    const drums = all.filter((u) => !u.dead && u.id === 'drummer');
    for (const u of all) u.drum = drums.some((d) => d !== u && hyp(d.x - u.x, d.y - u.y) <= AUNITS.drummer.aura.r);
    for (const u of all) {
      if (u.dead) continue;
      const U = u.def;
      u.flash = Math.max(0, u.flash - dt); u.swing = Math.max(0, u.swing - dt * 4);
      if (u.slowT > 0) u.slowT -= dt;
      u.cd -= dt;
      u.engaged = false;
      if (U.heal) { this.stepSurgeon(u, dt); continue; }
      if (U.follow) { this.stepFollower(u, dt); continue; }
      if (U.cover) { this.stepMantlet(u, dt); continue; }
      if (U.hunter && this.stepHunter(u, dt)) continue;
      if (U.sapper && this.stepSapper(u, dt)) continue;
      // 1. something to fight where it stands?
      if (!U.ramOnly) {
        const t = this.pickTarget(u);
        if (t) { u.engaged = true; this.attack(u, t); continue; }
      }
      // 2. at the gate: hammer the fortress (a siege tower tears its breach once, then holds the wall)
      if (this.atGate(u)) {
        u.engaged = true;
        if (U.breach && !u.docked) { u.docked = true; this.breach(u); continue; }
        if (U.dmg && u.cd <= 0) { u.cd = 1 / U.rate; u.swing = 1; this.hurtFortress(this.unitDmg(u) * (U.siege || 0.6) * (this.docked ? 1.5 : 1), u); }
        continue;
      }
      // 3. march on
      this.advance(u, this.unitSpeed(u) * dt);
    }
  }

  breach(u) {
    const F = this.fortress;
    this.hurtFortress(F.maxHp * u.def.breach, u);
    if (this.over || this.pauseT > 0) return;
    for (let i = 0; i < u.def.unload; i++) this.muster('footman', u.lane, { lane: u.lane, dist: u.total - 0.3 - i * 0.15 });
    this.emit('breach', { unit: u, x: u.x, y: u.y });
  }

  // Drummers and surgeons keep a step behind whoever is fighting at the front of their road.
  stepFollower(u, dt) {
    const front = [...this.units, ...this.engines].some((o) => o !== u && !o.dead && o.lane === u.lane && !o.def.follow && (o.engaged || this.atGate(o)) && o.dist > u.dist && o.dist - u.dist < 1.3);
    if (!front && !this.atGate(u) && u.dist < u.total - 1) this.advance(u, this.unitSpeed(u) * dt);
  }

  // The mantlet rolls at the head of its column (a little ahead of the lead fighter), then holds there as cover.
  stepMantlet(u, dt) {
    const lead = [...this.units, ...this.engines].filter((o) => o !== u && !o.dead && o.lane === u.lane && !o.def.cover && !o.def.flies).reduce((m, o) => Math.max(m, o.dist), 0);
    if (u.dist < Math.min(u.total - 1.1, lead + 0.7) || !lead) { if (u.dist < u.total - 1.1) this.advance(u, this.unitSpeed(u) * dt); }
    else u.engaged = true;
  }

  // Cavalry run down raiders anywhere near them, off the road if need be; with no one to hunt they ride the road.
  stepHunter(u, dt) {
    const e = this.nearestFoe(u.x, u.y, u.def.hunter, true);
    if (!e) {
      if (u.off_road) { // back to the road where it left it
        const d = hyp(u.bx - u.x, u.by - u.y);
        if (d > 0.1) { const s = Math.min(d, this.unitSpeed(u) * dt), px = u.x, py = u.y; u.x += ((u.bx - u.x) / d) * s; u.y += ((u.by - u.y) / d) * s; u.vx = u.x - px; u.vy = u.y - py; return true; }
        u.off_road = false;
      }
      return false;
    }
    const d = hyp(e.x - u.x, e.y - u.y);
    if (d <= (u.def.reach || 0.6) + 0.3) { u.engaged = true; this.attack(u, e); return true; }
    u.off_road = true;
    const s = Math.min(d, this.unitSpeed(u) * dt), px = u.x, py = u.y;
    u.x += ((e.x - u.x) / d) * s; u.y += ((e.y - u.y) / d) * s; u.vx = u.x - px; u.vy = u.y - py;
    return true;
  }

  // What a ground unit hits from where it stands, if anything.
  pickTarget(u) {
    const U = u.def;
    if (U.range) {
      const R = U.range;
      const f = this.focus && !this.focus.ruined && hyp(this.focus.cx - u.x, this.focus.cy - u.y) <= R ? this.focus : null;
      if (f) return f;
      if (U.engine) {   // engines fire at emplacements, then the gate
        const t = this.nearestTower(u.x, u.y, R);
        if (t) return t;
        if (this.fortressIn(u.x, u.y, R)) return this.fortress;
        return null;
      }
      const e = this.nearestFoe(u.x, u.y, R * 0.9);
      if (e) return e;
      return this.nearestTower(u.x, u.y, R) || (this.fortressIn(u.x, u.y, R * 0.8) ? this.fortress : null);
    }
    const e = this.nearestFoe(u.x, u.y, (U.reach || 0.5) + 0.35, true);
    if (e) return e;
    // melee units smash an emplacement standing right beside the road (a focused one a little further off)
    const f = this.focus && !this.focus.ruined && hyp(this.focus.cx - u.x, this.focus.cy - u.y) <= 1.6 ? this.focus : null;
    return f || this.nearestTower(u.x, u.y, 1.15);
  }

  attack(u, t) {
    if (u.cd > 0) return;
    const U = u.def;
    u.cd = 1 / U.rate; u.swing = 1;
    if (t.x !== undefined && t.cx === undefined && t !== this.fortress) { u.face = t.x < u.x ? -1 : 1; }
    if (U.range) {
      const kind = U.proj || 'arrow';
      const tx = t.cx ?? t.x, ty = t.cy ?? t.y;
      this.projectiles.push({ kind, mine: true, x: u.x, y: u.y - 0.25, target: t, tx, ty, speed: kind === 'boulder' ? 4.5 : kind === 'ball' ? 6 : 8, dmg: this.unitDmg(u), splash: U.splash || 0, src: u, arc: 0, sx: u.x, sy: u.y - 0.25 });
      this.emit('shoot', { unit: u, kind });
      return;
    }
    let dmg = this.unitDmg(u);
    if (U.charge && t.def && !u.charged.has(t.uid)) {
      u.charged.add(t.uid);
      // the charge tramples whoever stands beside the one it hits
      if (U.trample) for (const o of this.enemies) if (o !== t && !o.dead && hyp(o.x - t.x, o.y - t.y) <= U.trample) this.hurtFoe(o, dmg * U.charge * 0.5, u);
      dmg *= U.charge; this.emit('charge', { unit: u, enemy: t });
    }
    if (U.cleave && t.def) {   // a knight's swing catches the foes beside its target too
      let n = 1;
      for (const o of this.enemies) { if (n >= U.cleave) break; if (o !== t && !o.dead && o.delay <= 0 && hyp(o.x - u.x, o.y - u.y) <= (U.reach || 0.5) + 0.45) { this.hurtFoe(o, dmg * 0.7, u); n++; } }
    }
    if (t === this.fortress) this.hurtFortress(dmg * (U.siege || 0.6) * (this.docked ? 1.5 : 1), u);
    else if (t.cx !== undefined) this.hurtTower(t, dmg * (U.towerMult || 1), u.id);
    else this.hurtFoe(t, dmg, u);
    this.emit('strike', { unit: u, target: t });
  }

  stepSurgeon(u, dt) {
    const U = u.def;
    u.healCd -= dt;
    if (u.healCd <= 0) {
      let best = null, bf = 0.98;
      for (const o of [...this.units, ...this.engines]) { if (o.dead || o === u) continue; const f = o.hp / o.maxHp; if (f < bf && hyp(o.x - u.x, o.y - u.y) <= U.healRange) { bf = f; best = o; } }
      if (best) { u.healCd = U.healCd; best.hp = Math.min(best.maxHp, best.hp + best.maxHp * U.heal * (1 + (this.perks.heal || 0))); u.swing = 1; this.emit('heal', { from: u, to: best }); } else u.healCd = 0.3;
    }
    this.stepFollower(u, dt);
  }

  // Sappers leave the road for the nearest emplacement, plant a charge and run on. Returns true while busy.
  stepSapper(u, dt) {
    if (!u.sapT || u.sapT.ruined) {
      u.sapT = (this.focus && !this.focus.ruined && hyp(this.focus.cx - u.bx, this.focus.cy - u.by) <= 2.6 ? this.focus : null) || this.nearestTower(u.bx, u.by, 2.1);
      if (!u.sapT) { u.home = null; return false; }
      u.plantT = 0;
    }
    const t = u.sapT;
    const d = hyp(t.cx - u.x, t.cy + 0.2 - u.y);
    if (d > 0.45) {
      const s = Math.min(d, this.unitSpeed(u) * dt), px = u.x, py = u.y;
      u.x += ((t.cx - u.x) / d) * s; u.y += ((t.cy + 0.2 - u.y) / d) * s; u.vx = u.x - px; u.vy = u.y - py;
      return true;
    }
    u.engaged = true;
    u.plantT += dt; u.swing = 0.6;
    if (u.plantT >= 2.2) {
      this.hurtTower(t, t.maxHp * 0.5 + 60 * this.stageMult(), 'sapper');
      this.emit('impact', { x: t.cx, y: t.cy, kind: 'ball', splash: 0.8 });
      u.sapT = null; u.plantT = 0;
      // back to the road, where it left it
      u.x = u.bx; u.y = u.by;
    }
    return true;
  }

  // Is this unit sheltered by a mantlet? (missiles only: melee and magic ignore the cover)
  covered(u) { return !u.def.cover && this.engines.some((m) => !m.dead && m.def.cover && hyp(m.x - u.x, m.y - u.y) <= m.def.cover); }
  hurtUnit(u, dmg, magic = false, pierce = 0, missile = false) {
    if (u.dead) return;
    if (missile && !magic && this.covered(u)) { dmg *= 1 - AUNITS.mantlet.coverCut; this.stats.blocked = (this.stats.blocked || 0) + 1; }
    const a = magic ? 0 : Math.max(0, u.armor - pierce);
    u.hp -= dmg * (1 - Math.min(0.75, a / 100)); u.flash = 0.12;
    if (u.hp <= 0) {
      u.hp = 0; u.dead = true; this.stats.lost++;
      this.emit('unitDown', { unit: u });
    }
  }

  // ---------- the horde ----------
  updateEnemies(dt) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.delay > 0) { e.delay -= dt; continue; }
      e.flash = Math.max(0, e.flash - dt);
      e.cd -= dt;
      // Fight whatever of yours stands in the road
      let foe = null, bd = 0.55;
      for (const u of [...this.units, ...this.engines]) { if (u.dead || u.def.flies) continue; const d = hyp(u.x - e.x, u.y - e.y); if (d < bd) { bd = d; foe = u; } }
      if (e.def.shoots && !foe) {   // horde archers loose arrows from a little way off
        let tgt = null, td = e.def.shoots.range || 2.4;
        for (const u of [...this.units, ...this.engines]) { if (u.dead) continue; const d = hyp(u.x - e.x, u.y - e.y); if (d < td) { td = d; tgt = u; } }
        if (tgt) { if (e.cd <= 0) { e.cd = e.def.shoots.cd || 1.6; this.projectiles.push({ kind: 'earrow', x: e.x, y: e.y - 0.2, target: tgt, speed: 7, dmg: e.dmg * 0.6 }); } e.vx = e.vy = 0; continue; }
      }
      if (foe) {
        e.vx = (foe.x - e.x) * 0.001; e.vy = 0; e.blocker = foe;
        if (e.cd <= 0) { e.cd = 1; this.hurtUnit(foe, e.dmg); this.emit('foeStrike', { troop: foe, enemy: e }); }
        continue;
      }
      e.blocker = null;
      // Barracks guards hold near their post
      if (e.guard && e.dist >= e.guardAt) { e.vx = e.vy = 0; continue; }
      let spd = e.speed * (e.slowT > 0 ? 0.6 : 1);
      this.advance(e, spd * dt);
      if (e.seg >= e.path.length - 1) this.raidKeep(e);
    }
  }

  raidKeep(e) {
    e.dead = true; e.leaked = true;
    const dmg = Math.max(3, Math.min(14, 3 + (e.def.dmg || 1) * 1.5));
    this.castle.hp -= dmg;
    this.emit('keepHit', { enemy: e, dmg });
    if (this.castle.hp <= 0) { this.castle.hp = 0; this.end(false, 'keep'); }
  }

  hurtFoe(e, dmg, src) {
    if (e.dead) return;
    e.hp -= dmg * (1 - Math.min(0.7, (e.armor || 0) / 100)); e.flash = 0.1;
    if (e.hp <= 0) {
      e.dead = true; e.hp = 0;
      this.stats.slain++; this.stats.kills++;
      this.gold += ASSAULT.supply.perSlain;
      this.score += Math.round(6 * this.stageMult());
      this.syncWaves();
      this.emit('kill', { enemy: e, gold: ASSAULT.supply.perSlain, src });
    }
  }

  hurtTower(t, dmg, by) {
    if (t.ruined) return;
    t.hp -= dmg;
    this.emit('towerHit', { tower: t, dmg });
    if (t.hp <= 0) {
      t.hp = 0; t.ruined = true;
      this.stats.razed++; this.stats.razedBy[by || 'army'] = (this.stats.razedBy[by || 'army'] || 0) + 1;
      this.stats.kills += ASSAULT.realm.razedKills;
      const g = Math.round(ASSAULT.supply.perRaze * (1 + 0.1 * (this.stage - 1)));
      this.gold += g;
      this.score += Math.round(60 * this.stageMult());
      for (const gd of t.guards) if (!gd.dead) gd.guard = null;   // its guards march on the keep
      this.syncWaves();
      this.emit('razed', { tower: t, gold: g, by });
    }
  }

  hurtFortress(dmg, src) {
    const F = this.fortress;
    if (F.hp <= 0 || this.pauseT > 0) return;
    F.hp -= dmg; F.flash = 0.15; this.stats.fortDmg += dmg;
    this.emit('fortressHit', { dmg, src });
    if (F.hp <= 0) { F.hp = 0; this.takeFortress(); }
  }

  syncWaves() {
    const R = ASSAULT.realm, s = this.stats;
    const w = this.taken * R.fortressWaves + Math.floor(s.razed / R.razedPerWave) + Math.floor(s.slain / R.slainPerWave);
    if (w > s.wavesCleared) { s.wavesCleared = w; this.emit('realmTick', { waves: w }); }
  }

  takeFortress() {
    this.taken++;
    this.stats.kills += ASSAULT.realm.fortressKills;
    this.score += Math.round(600 * this.stage * (this.raid || this.blitz ? 0 : 1));
    for (const e of this.enemies) if (!e.dead) { e.dead = true; this.emit('kill', { enemy: e, gold: 0, rout: true }); }
    this.syncWaves();
    this.emit('fortressTaken', { stage: this.stage, taken: this.taken });
    if (this.taken >= this.camps) { this.end(true, 'taken'); return; }
    this.pauseT = 3;
  }

  nextStage() {
    // Survivors march home with what they carry: part of their cost comes back as supply.
    let back = 0;
    for (const u of [...this.units, ...this.engines]) if (!u.dead) back += this.unitCost(u.id) * ASSAULT.supply.carry * (u.hp / u.maxHp);
    const grant = Math.round(back + ASSAULT.supply.stageGrant * (1 + 0.15 * this.stage));
    this.gold += grant;
    this.castle.hp = Math.min(this.castle.maxHp, this.castle.hp + this.castle.maxHp * ASSAULT.carryHeal);
    for (const id of AUNIT_ORDER) this.cards[id] = 0;
    this.stage++;
    this.startStage();
    this.emit('stageGrant', { gold: grant, stage: this.stage });
  }

  // ---------- emplacements, the fortress and your keep ----------
  updateTowers(dt) {
    for (const t of this.towers) {
      if (t.ruined) continue;
      t.recoil = Math.max(0, t.recoil - dt * 4);
      if (t.disabledT > 0) { t.disabledT -= dt; continue; }
      const D = EMPL[t.type];
      if (D.spawn) {   // barracks: keep a couple of guards on the road nearby
        t.guards = t.guards.filter((g) => !g.dead);
        t.spawnT -= dt;
        if (t.spawnT <= 0 && t.guards.length < D.guards) {
          t.spawnT = D.spawn;
          const near = this.nearestRoadPoint(t.cx, t.cy);
          if (near) {
            const pool = FOES.filter(([, s]) => s <= this.stage + 1).map(([id]) => id);
            const g = this.spawnFoe(this.rng.pick(pool.slice(0, 4)), near.path, near.dist);
            g.guard = t; g.guardAt = near.dist + 0.4; t.guards.push(g);
            this.emit('muster', { tower: t, enemy: g });
          }
        }
        continue;
      }
      t.cd -= dt;
      if (t.cd > 0) continue;
      const tgt = this.towerTarget(t, D);
      if (!tgt) { t.cd = 0.25; continue; }
      t.cd = 1 / t.stats.rate;
      t.aim = Math.atan2(tgt.y - t.cy, tgt.x - t.cx); t.recoil = 1;
      const dmg = t.stats.dmg;
      if (D.pulse) {
        for (const u of [...this.units, ...this.engines]) if (!u.dead && hyp(u.x - t.cx, u.y - t.cy) <= t.stats.range) { this.hurtUnit(u, dmg, true); u.slow = D.slow; u.slowT = D.slowT; }
        this.emit('pulse', { x: t.cx, y: t.cy, r: t.stats.range, tower: t });
      } else if (D.chain) {
        const hit = [tgt]; let cur = tgt;
        for (let i = 1; i < D.chain; i++) {
          let nx = null, nd = 1.6;
          for (const u of [...this.units, ...this.engines]) { if (u.dead || hit.includes(u)) continue; const d = hyp(u.x - cur.x, u.y - cur.y); if (d < nd) { nd = d; nx = u; } }
          if (!nx) break; hit.push(nx); cur = nx;
        }
        for (const u of hit) this.hurtUnit(u, dmg, true);
        this.emit('zap', { points: [{ x: t.cx, y: t.cy - 0.7 }, ...hit.map((u) => ({ x: u.x, y: u.y - 0.25 }))], color: '#8ef2ff' });
      } else {
        this.projectiles.push({ kind: D.proj, x: t.cx, y: t.cy - 0.5, sx: t.cx, sy: t.cy - 0.5, target: tgt, tx: tgt.x, ty: tgt.y, speed: D.proj === 'boulder' ? 4.5 : D.proj === 'ball' ? 6 : 8, dmg, splash: D.splash || 0, magic: !!D.magic, pierce: D.pierce || 0, from: t, arc: 0 });
        this.emit('shoot', { tower: t, kind: D.proj });
      }
    }
  }

  towerTarget(t, D) {
    let best = null, bd = t.stats.range;
    for (const u of [...this.units, ...this.engines]) {
      if (u.dead) continue;
      const d = hyp(u.x - t.cx, u.y - t.cy);
      if (d < (t.stats.minRange || 0)) continue;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  nearestRoadPoint(x, y) {
    let best = null, bd = 2.2;
    for (const p of this.map.paths) {
      let acc = 0;
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1], L = hyp(b.x - a.x, b.y - a.y) || 1;
        const k = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (L * L)));
        const px = a.x + (b.x - a.x) * k, py = a.y + (b.y - a.y) * k, d = hyp(px - x, py - y);
        if (d < bd) { bd = d; best = { path: p, dist: acc + L * k }; }
        acc += L;
      }
    }
    return best;
  }

  updateFortress(dt) {
    const F = this.fortress, C = ASSAULT.fortress;
    F.flash = Math.max(0, F.flash - dt);
    // boiling oil over the gate, every few seconds, on whatever is hammering it
    F.oilT = (F.oilT ?? C.oil.every) - dt;
    if (F.oilT <= 0 && F.hp > 0) {
      F.oilT = C.oil.every;
      const at = [...this.units, ...this.engines].filter((u) => !u.dead && this.atGate(u));
      if (at.length) {
        const g = this.gates.reduce((a, b) => (at.filter((u) => hyp(u.x - a.x, u.y - a.y) < 1).length >= at.filter((u) => hyp(u.x - b.x, u.y - b.y) < 1).length ? a : b));
        for (const u of at) if (hyp(u.x - g.x, u.y - g.y) <= C.oil.r + 0.6) this.hurtUnit(u, C.oil.dmg * this.stageMult() * (u.engine ? 1.4 : 1), true);
        this.emit('oil', { x: g.x, y: g.y, r: C.oil.r });
      }
    }
    F.cd -= dt;
    if (F.cd > 0 || F.hp <= 0) return;
    // archers on the camp's palisade shoot whatever comes close to a gate
    const targets = [...this.units, ...this.engines].filter((u) => !u.dead && this.gates.some((g) => hyp(g.x - u.x, g.y - u.y) <= C.range));
    if (!targets.length) { F.cd = 0.3; return; }
    F.cd = 1 / C.rate;
    for (let i = 0; i < C.archers && i < targets.length; i++) {
      const u = targets[(this.rng.int(0, targets.length - 1))];
      const g = this.gates.reduce((a, b) => (hyp(a.x - u.x, a.y - u.y) < hyp(b.x - u.x, b.y - u.y) ? a : b));
      this.projectiles.push({ kind: 'earrow', x: g.x, y: g.y - 0.6, target: u, speed: 8, dmg: C.dmg * this.stageMult() });
    }
  }

  // Your keep's own archer picks off raiders that get close.
  updateKeep(dt) {
    const K = ASSAULT.keep;
    this.keepCd = (this.keepCd || 0) - dt;
    if (this.keepCd > 0) return;
    const c = this.map.castle;
    const e = this.nearestFoe(c.x, c.y, K.range);
    if (!e) { this.keepCd = 0.25; return; }
    this.keepCd = 1 / K.rate;
    this.projectiles.push({ kind: 'arrow', mine: true, x: c.x, y: c.y - 0.66, target: e, speed: 9, dmg: K.dmg * Math.sqrt(this.plan.hp) });
    this.emit('heroShot', { x: e.x, y: e.y });
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (p.done) continue;
      const t = p.target;
      const alive = t && !(t.dead || t.ruined || (t === this.fortress && t.hp <= 0));
      if (alive) { p.tx = t.cx ?? t.x; p.ty = (t.cy ?? t.y) - (t.cx !== undefined ? 0.3 : 0); }
      if (p.tx === undefined) { p.done = true; continue; }
      const dx = p.tx - p.x, dy = p.ty - p.y, d = hyp(dx, dy), s = p.speed * dt;
      p.dx = dx; p.dy = dy;
      if (p.kind === 'boulder' || p.kind === 'ball') {
        const tot = hyp(p.tx - (p.sx ?? p.x), p.ty - (p.sy ?? p.y)) || 1;
        p.arc = Math.sin(Math.PI * Math.min(1, 1 - (d - s) / tot)) * Math.min(1.6, tot * 0.35);
      }
      if (d > s) { p.x += (dx / d) * s; p.y += (dy / d) * s; continue; }
      p.done = true; p.x = p.tx; p.y = p.ty;
      if (p.mine) this.landMine(p, alive ? t : null);
      else this.landHorde(p, alive ? t : null);
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  landMine(p, t) {
    const U = p.src?.def || {};
    if (p.splash) {
      for (const tw of this.towers) if (!tw.ruined && hyp(tw.cx - p.x, tw.cy - 0.3 - p.y) <= p.splash + 0.35) this.hurtTower(tw, p.dmg * (U.towerMult || 1), p.src?.id);
      for (const e of this.enemies) if (!e.dead && hyp(e.x - p.x, e.y - p.y) <= p.splash) this.hurtFoe(e, p.dmg * 0.7, p.src);
      if (this.fortressIn(p.x, p.y, p.splash + 0.7)) this.hurtFortress(p.dmg * (U.siege || 1), p.src);
      this.emit('impact', { x: p.x, y: p.y, kind: p.kind, splash: p.splash });
      return;
    }
    if (!t) return;
    if (t === this.fortress) this.hurtFortress(p.dmg * (U.siege || 0.6), p.src);
    else if (t.cx !== undefined) this.hurtTower(t, p.dmg * (U.towerMult || 1), p.src?.id);
    else this.hurtFoe(t, p.dmg, p.src);
  }

  landHorde(p, t) {
    if (p.splash) {
      for (const u of [...this.units, ...this.engines]) if (!u.dead && hyp(u.x - p.x, u.y - p.y) <= p.splash) this.hurtUnit(u, p.dmg, p.magic, p.pierce, true);
      this.emit('impact', { x: p.x, y: p.y, kind: p.kind, splash: p.splash });
      return;
    }
    if (t) this.hurtUnit(t, p.dmg, p.magic, p.pierce, RANGED_PROJ.has(p.kind));
  }

  // ---------- the end ----------
  end(victory, why) {
    if (this.over) return;
    this.over = true; this.victory = !!victory; this.phase = 'over'; this.why = why;
    if (this.raid) this.score = raidScore({ victory, clock: this.clock, keepPct: this.castle.hp / this.castle.maxHp, fortPct: this.fortress.hp / this.fortress.maxHp, razed: this.stats.razed });
    if (this.blitz) this.score = blitzScore({ victory, clock: this.clock, taken: this.taken, razed: this.stats.razed });
    if (this.conquest && victory) this.score += Math.round(1500 * this.stage);
    this.emit('gameOver', this.summary());
  }
  gameOver() { this.end(false, 'quit'); }

  summary() {
    const s = this.stats;
    return {
      seed: this.seed, map: this.mapId, mode: this.mode, modifiers: [], ascension: 0,
      wave: s.wavesCleared + 1, start: 1, rankWave: s.wavesCleared + 1, wavesCleared: s.wavesCleared, score: this.score, kills: s.kills, heroKills: 0,
      shots: 0, hits: 0, headshots: 0, duration: Math.round(s.time), maxCombo: 0, bossKills: 0, bossDmg: 0, towersBuilt: 0, goldEarned: 0,
      killsByType: {}, killsByTower: {}, artUses: {}, dmgByTower: {}, heroDmg: 0, dmgTotal: 0, flawless: 0, specs: [], mintGold: 0, peakGold: 0, goldSpent: 0,
      maxTowers: 0, maxFlawlessStreak: 0, repairs: 0, earlyCalls: 0, boons: {}, gems: 0, credited: s.credited || {}, clock: Math.round(this.clock),
      victory: this.victory, stage: this.stage, taken: this.taken, razed: s.razed, slain: s.slain, deployed: s.deployed, lost: s.lost, orders: s.orders,
      deployedBy: s.deployedBy, troopKills: s.slain, troopDmg: 0, troopsTrained: s.deployed, troopsLost: s.lost, valorEarned: 0, maxTroopRank: 0, musterRecruits: 0,
      abilities: s.orders, vanguard: false, march: null, challenge: null, weapon: 'longbow', builtByTower: {}, maxMastery: 0, why: this.why || null,
      keepPct: this.castle.hp / this.castle.maxHp, camps: Number.isFinite(this.camps) ? this.camps : 0, province: this.conq?.province || null, provinceName: this.conq?.name || null, orderLoadout: this.loadout, blocked: s.blocked || 0,
    };
  }
}

// Plausibility for an Assault or Raid run (the server runs this after the general checks).
export function validateAssaultRun(r) {
  if (r.wave !== r.wavesCleared + 1) return 'bad wave';
  if (r.duration < r.wavesCleared * 3) return 'too fast';
  if (r.kills > r.duration * 4 + 60) return 'too many kills';
  if (r.mode === 'blitz' && r.score > BLITZ_MAX) return 'score too high';
  if (r.mode === 'raid') {
    if (r.score > RAID_MAX) return 'score too high';
    if (r.duration > RAID.limit + 30 && r.victory) return 'too slow for a raid';
  }
  return null;
}

// A plain commander for tests and the attract screen: plays the cheapest useful card on a loop.
export function autoAssault(g, dt = 1) {
  g._auto = (g._auto || 0) - dt;
  if (g._auto > 0) return;
  g._auto = 0.6;
  const want = g.fortress.hp < g.fortress.maxHp * 0.98 || g.stageT > 25 ? ['tower', 'ram', 'mantlet', 'knight', 'footman', 'archer', 'bombard', 'drummer', 'catapult', 'surgeon'] : ['mantlet', 'footman', 'archer', 'sapper', 'footman', 'bombard', 'cavalry', 'knight', 'ram'];
  for (const id of want) if (g.canDeploy(id) && (id !== 'mantlet' || g.engines.filter((u) => u.id === 'mantlet').length < 2) && (id !== 'drummer' || g.units.filter((u) => u.id === 'drummer').length < 2)) { g.deploy(id); break; }
  if (g.orderReady('horn') && g.units.length > 5) g.useOrder('horn');
  if (g.orderReady('requisition')) g.useOrder('requisition');
  if (g.orderReady('reinforce') && g.units.length > 3) g.useOrder('reinforce');
  const t = g.towers.find((x) => !x.ruined);
  if (t && g.orderReady('firepots') && [...g.units, ...g.engines].some((u) => hyp(u.x - t.cx, u.y - t.cy) < 3.5)) g.useOrder('firepots', t.cx, t.cy);
  if (t && g.orderReady('smoke') && [...g.units, ...g.engines].some((u) => hyp(u.x - t.cx, u.y - t.cy) < 2.5)) g.useOrder('smoke', t.cx, t.cy);
}

export { EMPL as EMPLACEMENTS };
export const towerName = (type) => TOWERS[type]?.name || type;
