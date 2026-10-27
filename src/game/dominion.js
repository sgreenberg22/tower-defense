// Dominion: a turn-based 4X campaign on a map of hex provinces. Explore the fog, expand province by province,
// exploit what you hold (gold, levies, lore, buildings, research) and exterminate three rival warlords.
// Every contested province is a real tower-defense battle (or an auto-resolved one), so every battle still feeds the Realm.
// Pure rules: no DOM, no storage. The campaign is one plain JSON object that the profile keeps (see src/ui/dominion.js).
import { Rng, seedFor } from '../core/rng.js';
import { WARLORDS, warlordById } from './living.js';
import { START_WAVES } from './rules.js';

export const DOMINION = {
  cols: 7, rows: 6,
  lakes: 0.14,           // share of hexes that are lakes or peaks (impassable)
  orders: 2,             // orders a turn (Logistics and the Imperial Crown add one each)
  start: { gold: 120, levy: 8, lore: 0 },
  waves: { neutral: 4, faction: 5, capital: 7, defend: 5 },
  attackLevy: 2,         // levies an attack costs: this plus the province's strength
  autoBase: 0.36,        // auto-resolve odds before strength and levies
  autoPerLevel: 0.12,    // each point of province strength above yours costs this much
  autoPerLevy: 0.05,     // each extra levy committed adds this much
  autoMax: 0.85,
  autoDefend: 0.15,     // defenders know the ground
  mightEvery: 4,         // rival warlords grow one point stronger every few turns ...
  threatFrom: 3,         // ... and start marching on you from this turn
  truceTurns: 5,
  maxLog: 40,
};

export const DIFFICULTIES = {
  squire: { id: 'squire', name: 'Squire', icon: '🌱', base: 1, perLevel: 2, perTurn: 1 / 3, ai: 0.75, score: 0.6, blurb: 'Battles start low and the warlords are slow to anger. A gentle first war.' },
  knight: { id: 'knight', name: 'Knight', icon: '⚔', base: 3, perLevel: 3, perTurn: 1 / 2, ai: 1, score: 1, blurb: 'The intended war: battles from wave 5 to around 40 as the turns pass.' },
  warlord: { id: 'warlord', name: 'Warlord', icon: '💀', base: 7, perLevel: 4, perTurn: 2 / 3, ai: 1.3, score: 1.6, blurb: 'For a deep Keep. Battles open late and the rivals strike early and often.' },
};

// Land shapes the fight: each terrain lends its battlefields and a little of what it yields.
export const TERRAIN = {
  plains:  { name: 'Plains',   icon: '🌾', color: '#9bbf5a', maps: ['meadow', 'hamlet'], yields: { gold: 2, levy: 2, lore: 0 } },
  forest:  { name: 'Forest',   icon: '🌲', color: '#4f8a46', maps: ['wilds', 'fork'], yields: { gold: 1, levy: 1, lore: 1 } },
  hills:   { name: 'Hills',    icon: '⛰', color: '#b39060', maps: ['spine', 'ravine', 'cross'], yields: { gold: 3, levy: 1, lore: 0 } },
  marsh:   { name: 'Marsh',    icon: '🪷', color: '#6f8f78', maps: ['bog', 'coil'], yields: { gold: 1, levy: 2, lore: 1 } },
  river:   { name: 'Rivers',   icon: '🌊', color: '#6fa6c9', maps: ['twin', 'bridge', 'mirror'], yields: { gold: 2, levy: 1, lore: 1 } },
  snow:    { name: 'Snowfields', icon: '❄', color: '#cfdde6', maps: ['frostmere'], yields: { gold: 1, levy: 1, lore: 2 } },
  ash:     { name: 'Ashlands', icon: '🌋', color: '#8a5a4a', maps: ['cinder', 'hive'], yields: { gold: 3, levy: 0, lore: 1 } },
};
const TERRAIN_IDS = Object.keys(TERRAIN);
// Banner colours on the campaign map: yours is gold, the three rivals get colours no land shares.
export const RIVAL_COLORS = ['#c8372d', '#7b3fc4', '#138a80'];

// One-off features found on some provinces.
export const SPECIALS = {
  mine:   { name: 'Gold Mine', icon: '⛏', yields: { gold: 3 } },
  shrine: { name: 'Old Shrine', icon: '⛩', yields: { lore: 2 } },
  ruins:  { name: 'Ruins', icon: '🏛', loot: { gold: 80, lore: 6 } },
  horses: { name: 'Horse Plains', icon: '🐎', yields: { levy: 2 } },
};

// One building a province. The fort also hardens defence battles there.
export const BUILDINGS = {
  farm:    { name: 'Farmsteads', icon: '🌾', cost: 60, yields: { levy: 2 }, desc: '+2 levies a turn.' },
  market:  { name: 'Market', icon: '🪙', cost: 80, yields: { gold: 3 }, desc: '+3 gold a turn.' },
  library: { name: 'Library', icon: '📜', cost: 80, yields: { lore: 2 }, desc: '+2 lore a turn.' },
  fort:    { name: 'Fort', icon: '🏯', cost: 100, yields: {}, desc: 'Rivals need more strength to attack it, and you defend it with +25% castle and wall health and +80 gold.' },
};

// Research: bought with lore. Battle perks feed the run like Keep and Realm perks (see App.runBonus).
export const TECHS = {
  masonry:     { name: 'Masonry', icon: '🧱', cost: 10, needs: [], desc: 'Battles: castle and wall +15% health.', perks: { castleHpMult: 0.15, wallHpMult: 0.15 } },
  coinage:     { name: 'Coinage', icon: '🪙', cost: 10, needs: [], desc: 'Battles start with +60 gold; Markets +1 gold.', perks: { startGold: 60 } },
  drill:       { name: 'Drill Yards', icon: '🛡', cost: 12, needs: [], desc: 'Attacks cost 1 levy less; auto-resolve +10%.' },
  cartography: { name: 'Cartography', icon: '🗺', cost: 14, needs: [], desc: 'The whole map is revealed, and scouting no longer takes an order.' },
  engineering: { name: 'Engineering', icon: '⚙', cost: 18, needs: ['masonry'], desc: 'Battles: towers +10% damage.', perks: { towerDmg: 0.1 } },
  logistics:   { name: 'Logistics', icon: '🐴', cost: 24, needs: ['drill'], desc: '+1 order every turn.' },
  banners:     { name: 'War Banners', icon: '🚩', cost: 24, needs: ['coinage'], desc: 'Every battle is one wave shorter.' },
  arcana:      { name: 'Arcana', icon: '✨', cost: 30, needs: ['engineering'], desc: 'Battles: towers fire 8% faster, kill gold +10%.', perks: { towerRate: 0.08, killGold: 0.1 } },
  crown:       { name: 'Imperial Crown', icon: '👑', cost: 45, needs: ['logistics', 'arcana'], desc: '+1 order every turn; storming a capital takes two waves fewer.' },
};
export const TECH_ORDER = Object.keys(TECHS);

const SYL_A = ['Ash', 'Bran', 'Cal', 'Dun', 'El', 'Fen', 'Gal', 'Har', 'Ill', 'Kor', 'Lan', 'Mor', 'Nor', 'Oak', 'Pel', 'Rav', 'Sel', 'Thorn', 'Ul', 'Var', 'Wyn', 'Yar'];
const SYL_B = ['bury', 'dale', 'ford', 'gate', 'hold', 'march', 'mere', 'moor', 'reach', 'ridge', 'stead', 'vale', 'watch', 'wick', 'wood', 'helm'];

const DIRS = [[[1, 0], [-1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]], [[1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]];
const key = (q, r) => q + ',' + r;

// Odd-row offset hex layout, in hex widths: x across, y down.
export function hexCenter(q, r) { return { x: q + (r & 1 ? 0.5 : 0) + 0.5, y: r * 0.866 + 0.5 }; }

const INDEX = new WeakMap();   // hex lookup per province list, kept out of the saved campaign
export const provById = (s, id) => s.provs[id];
export function neighbors(s, id) {
  const p = s.provs[id];
  if (!p) return [];
  let at = INDEX.get(s.provs);
  if (!at) { at = Object.fromEntries(s.provs.map((x) => [key(x.q, x.r), x.id])); INDEX.set(s.provs, at); }
  return DIRS[p.r & 1].map(([dq, dr]) => at[key(p.q + dq, p.r + dr)]).filter((n) => n !== undefined);
}
const owned = (s, who) => s.provs.filter((p) => p.owner === who);
export const yours = (s) => owned(s, 'you');
export const factionOf = (s, fid) => s.factions.find((f) => f.id === fid) || null;
export const has = (s, tech) => s.techs.includes(tech);
export const ordersPerTurn = (s) => DOMINION.orders + (has(s, 'logistics') ? 1 : 0) + (has(s, 'crown') ? 1 : 0);
export const borders = (s, who = 'you') => {
  const set = new Set();
  for (const p of owned(s, who)) for (const n of neighbors(s, p.id)) if (s.provs[n].owner !== who) set.add(n);
  return [...set];
};

// ---------- a new world ----------
export function newCampaign(seed, diff = 'knight') {
  const D = DOMINION, rng = new Rng(seedFor('dominion', seed));
  const cells = [];
  for (let r = 0; r < D.rows; r++) for (let q = 0; q < D.cols; q++) cells.push({ q, r });
  // Terrain in clusters: a few seed points, each hex takes its nearest.
  const seeds = Array.from({ length: 9 }, (_, i) => ({ ...hexCenter(rng.int(0, D.cols - 1), rng.int(0, D.rows - 1)), t: i < TERRAIN_IDS.length ? TERRAIN_IDS[i] : rng.pick(TERRAIN_IDS) }));
  // Lakes and peaks, kept off the corners (where capitals stand) and never cutting the land in two.
  const corners = [key(0, 0), key(D.cols - 1, 0), key(0, D.rows - 1), key(D.cols - 1, D.rows - 1)];
  const blocked = new Set();
  const want = Math.round(cells.length * D.lakes);
  for (let tries = 0; blocked.size < want && tries < 400; tries++) {
    const c = rng.pick(cells), k = key(c.q, c.r);
    if (blocked.has(k) || corners.some((ck) => near(ck, c, 1))) continue;
    blocked.add(k);
    if (!connected(cells.filter((x) => !blocked.has(key(x.q, x.r))))) blocked.delete(k);
  }
  const provs = [];
  const used = new Set();
  for (const c of cells) {
    if (blocked.has(key(c.q, c.r))) continue;
    const pt = hexCenter(c.q, c.r);
    const t = seeds.reduce((a, b) => (Math.hypot(b.x - pt.x, b.y - pt.y) < Math.hypot(a.x - pt.x, a.y - pt.y) ? b : a)).t;
    let name;
    for (let i = 0; i < 20 && (!name || used.has(name)); i++) name = rng.pick(SYL_A) + rng.pick(SYL_B);
    used.add(name);
    const T = TERRAIN[t];
    provs.push({ id: provs.length, q: c.q, r: c.r, name, terrain: t, map: rng.pick(T.maps), owner: null, level: 1, building: null, special: null, seen: false, capital: null });
  }
  const s = { v: 1, id: String(seed), seed: String(seed), diff: DIFFICULTIES[diff] ? diff : 'knight', turn: 1, orders: D.orders,
    gold: D.start.gold, levy: D.start.levy, lore: D.start.lore, techs: [], provs, factions: [], threat: null, battle: null, over: null, log: [],
    stats: { won: 0, lost: 0, auto: 0, taken: 0, held: 0, razed: 0 },
    lakes: [...blocked].map((k) => k.split(',').map(Number)) };
  // Capitals in the four corners: yours and three rival warlords (a different three each campaign).
  const cornerProv = (q, r) => provs.reduce((a, b) => (Math.hypot(b.q - q, b.r - r) < Math.hypot(a.q - q, a.r - r) ? b : a));
  const spots = [cornerProv(0, 0), cornerProv(D.cols - 1, D.rows - 1), cornerProv(D.cols - 1, 0), cornerProv(0, D.rows - 1)];
  const lords = [...WARLORDS].sort((a, b) => seedFor(seed, a.id) - seedFor(seed, b.id)).slice(0, 3);
  spots[0].owner = 'you'; spots[0].capital = 'you'; spots[0].building = 'market';
  lords.forEach((w, i) => {
    const c = spots[i + 1];
    c.owner = w.id; c.capital = w.id; c.building = 'fort';
    s.factions.push({ id: w.id, cap: c.id, alive: true, might: 2, truce: 0, color: RIVAL_COLORS[i] });
    for (const n of neighbors(s, c.id).slice(0, 2)) if (!s.provs[n].owner) s.provs[n].owner = w.id;
  });
  // Neutral strength rises with distance from you; a few specials sprinkled about.
  const home = spots[0];
  for (const p of provs) {
    const d = hexDist(p, home);
    p.level = p.capital ? 5 : p.owner ? 3 : Math.max(1, Math.min(4, Math.floor(d / 2) + (rng.chance(0.3) ? 1 : 0)));
    if (!p.capital && rng.chance(0.18)) p.special = rng.pick(Object.keys(SPECIALS));
  }
  for (const n of neighbors(s, home.id)) { s.provs[n].level = 1; if (s.provs[n].special === 'ruins') s.provs[n].special = null; }
  reveal(s);
  note(s, `You raise your banner over ${home.name}. Three warlords hold the corners of the land: ${lords.map((w) => w.name).join(', ')}.`, 'start');
  return s;
}

function near(k, c, d) { const [q, r] = k.split(',').map(Number); return hexDist({ q, r }, c) <= d; }
// Hex distance for odd-r offset coordinates (via cube coordinates).
export function hexDist(a, b) {
  const cube = (p) => { const x = p.q - (p.r - (p.r & 1)) / 2, z = p.r; return { x, z, y: -x - z }; };
  const A = cube(a), B = cube(b);
  return Math.max(Math.abs(A.x - B.x), Math.abs(A.y - B.y), Math.abs(A.z - B.z));
}
function connected(cells) {
  if (!cells.length) return true;
  const at = new Set(cells.map((c) => key(c.q, c.r))), seen = new Set([key(cells[0].q, cells[0].r)]), stack = [cells[0]];
  while (stack.length) {
    const c = stack.pop();
    for (const [dq, dr] of DIRS[c.r & 1]) { const k = key(c.q + dq, c.r + dr); if (at.has(k) && !seen.has(k)) { seen.add(k); const [q, r] = k.split(',').map(Number); stack.push({ q, r }); } }
  }
  return seen.size === cells.length;
}

// Fog: you see what you hold and everything next to it (all of it with Cartography).
export function reveal(s) {
  for (const p of s.provs) {
    if (has(s, 'cartography') || p.owner === 'you') p.seen = true;
    else if (neighbors(s, p.id).some((n) => s.provs[n].owner === 'you')) p.seen = true;
  }
}

function note(s, text, kind = '') {
  s.log.unshift({ turn: s.turn, text, kind });
  if (s.log.length > DOMINION.maxLog) s.log.length = DOMINION.maxLog;
}

// ---------- the economy ----------
export function provYields(s, p) {
  const y = { ...TERRAIN[p.terrain].yields };
  const add = (o) => { for (const [k, v] of Object.entries(o || {})) y[k] = (y[k] || 0) + v; };
  if (p.special) add(SPECIALS[p.special].yields);
  if (p.building) add(BUILDINGS[p.building].yields);
  if (p.building === 'market' && has(s, 'coinage')) y.gold += 1;
  if (p.capital === 'you') add({ gold: 3, levy: 2, lore: 2 });
  return y;
}
export function income(s) {
  const y = { gold: 0, levy: 0, lore: 0 };
  for (const p of yours(s)) for (const [k, v] of Object.entries(provYields(s, p))) y[k] += v;
  return y;
}

// ---------- battles ----------
// How hard a province is to take: its level, the owner's might, and the passing turns.
export function provPower(s, p) {
  const f = p.owner && p.owner !== 'you' ? factionOf(s, p.owner) : null;
  return p.level + (f ? Math.floor(f.might / 3) : 0) + (p.building === 'fort' && p.owner !== 'you' ? 1 : 0);
}
const snapStart = (w) => START_WAVES.filter((x) => x <= Math.max(1, w)).pop() || 1;
export function battleStart(s, power) {
  const D = DIFFICULTIES[s.diff];
  return snapStart(Math.round(D.base + D.perLevel * power + D.perTurn * (s.turn - 1)));
}
export function attackCost(s, p) { return Math.max(1, DOMINION.attackLevy + provPower(s, p) - (has(s, 'drill') ? 1 : 0)); }

// Battle perks from research (and a fort when you defend one).
export function battlePerks(s, p, kind) {
  const perks = {};
  for (const t of s.techs) for (const [k, v] of Object.entries(TECHS[t].perks || {})) perks[k] = (perks[k] || 0) + v;
  if (kind === 'defend' && p.building === 'fort') { perks.castleHpMult = (perks.castleHpMult || 0) + 0.25; perks.wallHpMult = (perks.wallHpMult || 0) + 0.25; perks.startGold = (perks.startGold || 0) + 80; }
  return perks;
}

export function canAttack(s, id) {
  const p = s.provs[id];
  if (!p || s.over) return 'The war is over.';
  if (s.battle) return 'A battle is already under way.';
  if (s.threat) return `Deal with the attack on ${s.provs[s.threat.prov].name} first.`;
  if (p.owner === 'you') return 'You already hold it.';
  if (!p.seen) return 'Scout it first.';
  if (!neighbors(s, id).some((n) => s.provs[n].owner === 'you')) return 'It does not border your land.';
  const f = p.owner ? factionOf(s, p.owner) : null;
  if (f && f.truce >= s.turn) return `You have a truce with ${warlordById(f.id).name} until turn ${f.truce}.`;
  if (s.orders < 1) return 'No orders left this turn.';
  if (s.levy < attackCost(s, p)) return `Needs ${attackCost(s, p)} levies.`;
  return null;
}

// Everything a battle needs: which battlefield, the starting wave, how many waves to hold, whose host.
export function battleSetup(s, id, kind = 'attack') {
  const p = s.provs[id];
  const foe = kind === 'defend' ? s.threat?.faction : p.owner && p.owner !== 'you' ? p.owner : null;
  const power = kind === 'defend' ? s.threat.power : provPower(s, p);
  const W = DOMINION.waves;
  let waves = kind === 'defend' ? W.defend : p.capital && p.capital !== 'you' ? W.capital : foe ? W.faction : W.neutral;
  if (has(s, 'banners')) waves -= 1;
  if (has(s, 'crown') && p.capital && kind !== 'defend') waves -= 2;
  return {
    kind, prov: id, name: p.name, map: p.map, terrain: p.terrain, foe, power, waves: Math.max(3, waves),
    startWave: battleStart(s, power), cost: kind === 'defend' ? 0 : attackCost(s, p), perks: battlePerks(s, p, kind),
    seed: `dom-${s.id}-${id}-${s.turn}-${kind[0]}`,
  };
}

// Begin a fought battle: the order and the levies are spent now, the outcome comes back with applyBattle.
export function beginBattle(s, id, kind = 'attack') {
  if (kind === 'attack') { const why = canAttack(s, id); if (why) return { error: why }; }
  else if (!s.threat || s.threat.prov !== id) return { error: 'No attack to answer here.' };
  const B = battleSetup(s, id, kind);
  if (kind === 'attack') { s.orders -= 1; s.levy -= B.cost; }
  s.battle = { prov: id, kind, turn: s.turn, seed: B.seed, waves: B.waves, startWave: B.startWave, foe: B.foe, power: B.power, cost: B.cost };
  return { setup: B };
}

// The battle's outcome. A run that is abandoned or lost counts as a defeat.
export function applyBattle(s, { victory, seed, kills = 0 } = {}) {
  const b = s.battle;
  if (!b || (seed && seed !== b.seed)) return null;
  s.battle = null;
  const out = resolve(s, b, !!victory);
  out.kills = kills;
  return out;
}

function resolve(s, b, victory) {
  const p = s.provs[b.prov];
  const lord = b.foe ? warlordById(b.foe) : null;
  const out = { kind: b.kind, prov: b.prov, name: p.name, victory, gold: 0, lore: 0, eliminated: null, lostCapital: false };
  if (b.kind === 'defend') {
    s.threat = null;
    if (victory) {
      s.stats.held++; out.gold = 20 + 10 * b.power; s.gold += out.gold;
      const f = factionOf(s, b.foe); if (f) f.might = Math.max(1, f.might - 1);
      note(s, `${p.name} held against ${lord?.name || 'the horde'}. +${out.gold} gold, and the warlord's might wanes.`, 'win');
    } else {
      s.stats.lost++;
      out.lostCapital = p.capital === 'you';
      p.owner = b.foe; if (p.building === 'fort') p.building = null;
      note(s, `${p.name} fell to ${lord?.name || 'the horde'}.`, 'loss');
    }
  } else if (victory) {
    s.stats.won++; s.stats.taken++;
    const prev = p.owner;
    p.owner = 'you'; p.level = Math.max(1, p.level - 1);
    out.gold = 15 * b.power; out.lore = 1 + Math.floor(b.power / 2);
    if (p.special === 'ruins') { out.gold += SPECIALS.ruins.loot.gold; out.lore += SPECIALS.ruins.loot.lore; p.special = null; }
    s.gold += out.gold; s.lore += out.lore;
    s.levy += Math.floor(b.cost / 2);   // half the host comes home
    if (p.capital && p.capital !== 'you') {
      const f = factionOf(s, p.capital);
      f.alive = false; out.eliminated = f.id; s.stats.razed++;
      p.capital = null;
      let sworn = 0;
      for (const q of s.provs) if (q.owner === f.id) { q.owner = 'you'; sworn++; }   // its lords bend the knee
      out.sworn = sworn;
      note(s, `You stormed ${p.name}: ${warlordById(f.id).name} is broken${sworn ? `, and ${sworn} province${sworn === 1 ? '' : 's'} swear fealty to you` : ''}.`, 'big');
    } else note(s, `You took ${p.name}${prev && lord ? ` from ${lord.name}` : ''}. +${out.gold} gold, +${out.lore} lore.`, 'win');
  } else {
    s.stats.lost++;
    note(s, `The attack on ${p.name} was thrown back.`, 'loss');
  }
  reveal(s);
  checkOver(s, out);
  return out;
}

// Auto-resolve: quicker, riskier. Commit extra levies to tilt the odds.
export function autoOdds(s, id, extra = 0, kind = 'attack') {
  const p = s.provs[id];
  const power = kind === 'defend' ? s.threat?.power || 1 : provPower(s, p);
  const mine = 1 + Math.floor(s.techs.length / 3) + (kind === 'defend' && p.building === 'fort' ? 2 : 0) + (kind === 'defend' && p.capital === 'you' ? 1 : 0);
  const D = DOMINION;
  return Math.max(0.05, Math.min(D.autoMax, D.autoBase - D.autoPerLevel * (power - mine) + D.autoPerLevy * extra + (has(s, 'drill') ? 0.1 : 0) + (kind === 'defend' ? D.autoDefend : 0)));
}
export function autoResolve(s, id, extra = 0, kind = 'attack', roll = null) {
  extra = Math.max(0, Math.floor(extra));
  if (kind === 'attack') { const why = canAttack(s, id); if (why) return { error: why }; }
  else if (!s.threat || s.threat.prov !== id) return { error: 'No attack to answer here.' };
  const B = battleSetup(s, id, kind);
  if (s.levy < B.cost + extra) return { error: `Needs ${B.cost + extra} levies.` };
  const odds = autoOdds(s, id, extra, kind);
  if (kind === 'attack') s.orders -= 1;
  s.levy -= B.cost + extra;
  const r = roll ?? new Rng(seedFor(s.seed, 'auto', s.turn, id, s.stats.auto)).next();
  s.stats.auto++;
  const out = resolve(s, { prov: id, kind, foe: B.foe, power: B.power, cost: B.cost + extra }, r < odds);
  out.odds = odds;
  return out;
}

function checkOver(s, out = null) {
  if (s.over) return;
  if (!s.provs.some((p) => p.capital === 'you')) { s.over = { won: false, turn: s.turn, score: score(s) }; note(s, 'Your capital has fallen. The war is lost.', 'big'); }
  else if (!s.factions.some((f) => f.alive)) { s.over = { won: true, turn: s.turn, score: score(s) }; note(s, `Every warlord is broken. The land is yours, on turn ${s.turn}.`, 'big'); }
  if (out && s.over) out.over = s.over;
}

export function score(s) {
  const D = DIFFICULTIES[s.diff];
  const won = !s.factions.some((f) => f.alive) && s.provs.some((p) => p.capital === 'you');
  return Math.max(0, Math.round((yours(s).length * 10 + s.factions.filter((f) => !f.alive).length * 150 + s.stats.won * 15 + s.stats.held * 10 + (won ? Math.max(0, 600 - s.turn * 12) : 0)) * D.score));
}

// ---------- orders that are not battles ----------
export function build(s, id, what) {
  const p = s.provs[id], B = BUILDINGS[what];
  if (!B || !p || p.owner !== 'you') return { error: 'Build only on your own land.' };
  if (p.building) return { error: `${p.name} already has a ${BUILDINGS[p.building].name}.` };
  if (s.orders < 1) return { error: 'No orders left this turn.' };
  if (s.gold < B.cost) return { error: `Needs ${B.cost} gold.` };
  s.gold -= B.cost; s.orders -= 1; p.building = what;
  note(s, `${B.name} raised in ${p.name}.`);
  return { ok: true };
}

export function canResearch(s, t) {
  const T = TECHS[t];
  if (!T) return 'Unknown.';
  if (has(s, t)) return 'Known.';
  if (T.needs.some((n) => !has(s, n))) return `Needs ${T.needs.filter((n) => !has(s, n)).map((n) => TECHS[n].name).join(' and ')}.`;
  if (s.lore < T.cost) return `Needs ${T.cost} lore.`;
  return null;
}
// Research takes no order: lore is its own currency.
export function research(s, t) {
  const why = canResearch(s, t);
  if (why) return { error: why };
  s.lore -= TECHS[t].cost; s.techs.push(t);
  if (t === 'logistics' || t === 'crown') s.orders += 1;
  if (t === 'cartography') reveal(s);
  note(s, `Your scholars master ${TECHS[t].name}.`);
  return { ok: true };
}

// Scout: lift the fog two provinces deep around a border province, and maybe find something.
export function scout(s, id) {
  const p = s.provs[id];
  if (!p) return { error: 'Nowhere to scout.' };
  const free = has(s, 'cartography');
  if (!free && s.orders < 1) return { error: 'No orders left this turn.' };
  if (!neighbors(s, id).some((n) => s.provs[n].owner === 'you') && p.owner !== 'you') return { error: 'Scouts ride out from your own border.' };
  if (!free) s.orders -= 1;
  const ring = new Set([id, ...neighbors(s, id)]);
  for (const n of [...ring]) for (const m of neighbors(s, n)) ring.add(m);
  let found = 0;
  for (const n of ring) if (!s.provs[n].seen) { s.provs[n].seen = true; found++; }
  const rng = new Rng(seedFor(s.seed, 'scout', s.turn, id));
  const gold = rng.chance(0.4) ? rng.int(20, 50) : 0;
  s.gold += gold;
  note(s, `Scouts ride past ${p.name}: ${found} province${found === 1 ? '' : 's'} mapped${gold ? `, and ${gold} gold in a bandit stash` : ''}.`);
  return { ok: true, found, gold };
}

// Muster: call up the levies of every province you hold.
export function muster(s) {
  if (s.orders < 1) return { error: 'No orders left this turn.' };
  const n = 2 + Math.ceil(yours(s).length / 2);
  s.orders -= 1; s.levy += n;
  note(s, `You call the banners: +${n} levies.`);
  return { ok: true, levy: n };
}

// A truce with one warlord for a few turns: neither of you attacks the other.
export const truceCost = (s, fid) => 50 + 25 * (factionOf(s, fid)?.might || 1);
export function truce(s, fid) {
  const f = factionOf(s, fid);
  if (!f || !f.alive) return { error: 'There is no one to treat with.' };
  if (f.truce >= s.turn) return { error: 'A truce already holds.' };
  if (s.orders < 1) return { error: 'No orders left this turn.' };
  const c = truceCost(s, fid);
  if (s.gold < c) return { error: `Needs ${c} gold.` };
  if (s.threat && s.threat.faction === fid) return { error: 'Not while their host is at your gates.' };
  s.gold -= c; s.orders -= 1; f.truce = s.turn + DOMINION.truceTurns;
  note(s, `A truce with ${warlordById(fid).name} until turn ${f.truce}.`);
  return { ok: true };
}

// ---------- the turn ----------
const EVENTS = [
  { id: 'caravan', w: 3, text: 'A merchant caravan pays its tolls: +{n} gold.', fx: (s, r) => { const n = r.int(30, 60); s.gold += n; return n; } },
  { id: 'scholars', w: 2, text: 'Wandering scholars settle in your libraries: +{n} lore.', fx: (s, r) => { const n = r.int(3, 6); s.lore += n; return n; } },
  { id: 'volunteers', w: 2, text: 'Volunteers flock to your banner: +{n} levies.', fx: (s, r) => { const n = r.int(2, 4); s.levy += n; return n; } },
  { id: 'fever', w: 1, text: 'Camp fever: -{n} levies.', fx: (s, r) => { const n = Math.min(s.levy, r.int(1, 3)); s.levy -= n; return n; } },
  { id: 'rising', w: 1, text: 'Free folk rise in {p}: it grows harder to take.', fx: (s, r) => { const free = s.provs.filter((p) => !p.owner && p.seen); if (!free.length) return 0; const p = r.pick(free); p.level = Math.min(5, p.level + 1); return p.name; } },
  { id: 'feud', w: 1, text: '{p} and its neighbours feud: one rival loses might.', fx: (s, r) => { const f = s.factions.filter((x) => x.alive); if (!f.length) return 0; const x = r.pick(f); x.might = Math.max(1, x.might - 1); return warlordById(x.id).name; } },
];

// End the turn: income, rival warlords move, maybe an event, maybe an attack on you. An unanswered attack is auto-resolved.
export function endTurn(s) {
  if (s.over || s.battle) return { error: s.battle ? 'Finish the battle first.' : 'The war is over.' };
  const report = { income: null, events: [], threat: null, forced: null, moves: [] };
  if (s.threat) report.forced = autoResolve(s, s.threat.prov, 0, 'defend');
  if (s.over) return report;
  const inc = income(s);
  s.gold += inc.gold; s.levy += inc.levy; s.lore += inc.lore;
  report.income = inc;
  const rng = new Rng(seedFor(s.seed, 'turn', s.turn));
  const D = DIFFICULTIES[s.diff];
  s.turn++;
  s.orders = ordersPerTurn(s);
  // Rival warlords: grow, take free land, feud with each other, and come for you.
  for (const f of s.factions) {
    if (!f.alive) continue;
    if (s.turn % DOMINION.mightEvery === 0) f.might += 1;
    const theirs = s.provs.filter((p) => p.owner === f.id);
    if (theirs.length >= 6 && s.turn % 3 === 0) f.might += 1;
    const front = borders(s, f.id).map((id) => s.provs[id]);
    const free = front.filter((p) => !p.owner && p.level <= f.might + 1);
    if (free.length && rng.chance(0.45 * D.ai)) {
      const p = rng.pick(free); p.owner = f.id; report.moves.push(`${warlordById(f.id).name} took ${p.seen ? p.name : 'land in the fog'}.`);
    }
    const rivals = front.filter((p) => p.owner && p.owner !== 'you' && p.owner !== f.id && !p.capital);
    if (rivals.length && rng.chance(0.15)) {
      const p = rng.pick(rivals), o = factionOf(s, p.owner);
      if (f.might + rng.int(0, 2) > o.might + rng.int(0, 2)) { p.owner = f.id; report.moves.push(`${warlordById(f.id).name} seized ${p.seen ? p.name : 'a province'} from ${warlordById(o.id).name}.`); }
    }
  }
  // One attack on you a turn, at most, once the warlords have found their feet.
  if (!s.threat && s.turn >= DOMINION.threatFrom) {
    const options = [];
    for (const f of s.factions) {
      if (!f.alive || f.truce >= s.turn) continue;
      for (const id of borders(s, f.id)) {
        const p = s.provs[id];
        if (p.owner !== 'you') continue;
        const guard = (p.building === 'fort' ? 2 : 0) + (p.capital === 'you' ? 2 : 0);
        if (f.might + 1 >= guard) options.push({ f, p, guard });
      }
    }
    const chance = Math.min(0.6, (0.12 + 0.025 * s.turn) * D.ai);
    if (options.length && rng.chance(chance)) {
      const o = rng.pick(options);
      s.threat = { prov: o.p.id, faction: o.f.id, power: Math.max(1, o.f.might + 1 - Math.floor(o.guard / 2)) };
      report.threat = s.threat;
      note(s, `${warlordById(o.f.id).name} marches on ${o.p.name}! Answer it this turn, or it is fought without you.`, 'threat');
    }
  }
  for (const m of report.moves) note(s, m, 'move');
  if (rng.chance(0.3)) {
    const total = EVENTS.reduce((a, e) => a + e.w, 0);
    let x = rng.next() * total, ev = EVENTS[0];
    for (const e of EVENTS) { if ((x -= e.w) < 0) { ev = e; break; } }
    const v = ev.fx(s, rng);
    if (v) { const text = ev.text.replace('{n}', v).replace('{p}', v); report.events.push(text); note(s, text, 'event'); }
  }
  reveal(s);
  checkOver(s);
  return report;
}

// Give up the threatened province without a fight (keeps your levies).
export function yieldProvince(s) {
  if (!s.threat) return { error: 'No one is attacking.' };
  const p = s.provs[s.threat.prov];
  if (p.capital === 'you') return { error: 'You cannot yield your capital.' };
  const lord = warlordById(s.threat.faction);
  p.owner = s.threat.faction; if (p.building === 'fort') p.building = null;
  s.threat = null; s.stats.lost++;
  note(s, `You pulled back from ${p.name}; ${lord.name} takes it unopposed.`, 'loss');
  reveal(s); checkOver(s);
  return { ok: true };
}

// A loaded campaign might come from an older version: fill in anything missing so it never breaks the screen.
export function cleanCampaign(s) {
  if (!s || s.v !== 1 || !Array.isArray(s.provs) || !Array.isArray(s.factions)) return null;
  s.techs = (s.techs || []).filter((t) => TECHS[t]);
  s.log ||= []; s.stats = { won: 0, lost: 0, auto: 0, taken: 0, held: 0, razed: 0, ...(s.stats || {}) };
  return s;
}
