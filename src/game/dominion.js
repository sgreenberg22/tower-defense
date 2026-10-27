// Dominion: a turn-based 4X campaign on a map of hex provinces, played between tower-defense battles.
// Explore the fog; expand by battle, auto-resolve or settlement; exploit your land (development, buildings, strategic
// resources, taxes, policies, trade, wonders, research); and outlast or outplay rival nations that run economies,
// research, build wonders, trade, ally and make war of their own. Five ways to win (and to lose).
// Pure rules: no DOM, no storage. The campaign is one plain JSON object kept on the profile (see src/ui/dominion.js).
import { Rng, seedFor } from '../core/rng.js';
import { WARLORDS, warlordById } from './living.js';
import { START_WAVES } from './rules.js';

export const DOMINION = {
  orders: 2,             // civil orders a turn: build, develop, settle, scout, muster, raise wonders (Code of Laws and Banking add one each)
  armies: 1,             // attacks a turn (Logistics, the Imperial Crown and the War Academy add one each)
  start: { gold: 150, levy: 8, lore: 4 },
  waves: { neutral: 4, faction: 5, capital: 7, defend: 5 },
  attackLevy: 2,         // levies an attack costs: this plus the province's strength
  autoBase: 0.4,         // auto-resolve odds before strength and levies
  autoPerLevel: 0.11,    // each point of province strength above your army's quality costs this much
  autoPerLevy: 0.05,     // each extra levy committed adds this much
  autoMax: 0.88,
  autoDefend: 0.15,      // defenders know the ground
  threatFrom: 4,         // rivals at war start marching on you from this turn
  treatyTurns: 8,        // a peace treaty holds at least this long
  allyTurns: 5,          // a Grand Alliance must hold this long to win
  maxLog: 60,
  revolt: 80,            // unrest at which a province may rise
  unrestHalf: 50,        // unrest at which a province yields half
  conquestUnrest: 40,
  settleMaxLevel: 2,     // free provinces this weak can be settled without a fight
};

export const SIZES = {
  small:  { id: 'small',  name: 'Small',  cols: 7,  rows: 6, rivals: [2, 3], blurb: 'A short war on about 36 provinces.' },
  medium: { id: 'medium', name: 'Medium', cols: 9,  rows: 7, rivals: [2, 4], blurb: 'The full game on about 54 provinces.' },
  large:  { id: 'large',  name: 'Large',  cols: 11, rows: 8, rivals: [3, 5], blurb: 'A long campaign on about 75 provinces.' },
};
export const TURN_LIMITS = [40, 60, 80, 0];   // 0: no limit (no score victory)

export const DIFFICULTIES = {
  squire: { id: 'squire', name: 'Squire', icon: '🌱', base: 1, perLevel: 2, perTurn: 1 / 4, ai: 0.8, score: 0.6, blurb: 'Battles start low, rivals grow slowly and anger slowly. A gentle first war.' },
  knight: { id: 'knight', name: 'Knight', icon: '⚔', base: 3, perLevel: 3, perTurn: 1 / 3, ai: 1, score: 1, blurb: 'The intended war: battles from wave 5 to around 45 as the turns pass.' },
  warlord: { id: 'warlord', name: 'Warlord', icon: '💀', base: 7, perLevel: 4, perTurn: 1 / 2, ai: 1.25, score: 1.6, blurb: 'For a deep Keep. Battles open late, and rivals are richer, quicker to war and quicker to win.' },
};

// ---------- the land ----------
export const TERRAIN = {
  plains:  { name: 'Plains',     icon: '🌾', color: '#9bbf5a', maps: ['meadow', 'hamlet'], yields: { gold: 2, levy: 1, lore: 0 } },
  forest:  { name: 'Forest',     icon: '🌲', color: '#4f8a46', maps: ['wilds', 'fork'], yields: { gold: 1, levy: 1, lore: 1 } },
  hills:   { name: 'Hills',      icon: '⛰️', color: '#b39060', maps: ['spine', 'ravine', 'cross'], yields: { gold: 3, levy: 1, lore: 0 } },
  marsh:   { name: 'Marsh',      icon: '🪷', color: '#6f8f78', maps: ['bog', 'coil'], yields: { gold: 1, levy: 1, lore: 1 } },
  river:   { name: 'Rivers',     icon: '🌊', color: '#6fa6c9', maps: ['twin', 'bridge', 'mirror'], yields: { gold: 2, levy: 1, lore: 1 } },
  snow:    { name: 'Snowfields', icon: '❄', color: '#cfdde6', maps: ['frostmere'], yields: { gold: 1, levy: 1, lore: 2 } },
  ash:     { name: 'Ashlands',   icon: '🌋', color: '#8a5a4a', maps: ['cinder', 'hive'], yields: { gold: 3, levy: 0, lore: 1 } },
};
const TERRAIN_IDS = Object.keys(TERRAIN);
// Banner colours on the campaign map: yours is gold; rivals get colours no land shares.
export const RIVAL_COLORS = ['#c8372d', '#7b3fc4', '#138a80', '#d0569c', '#3a5fcf'];

// Landmarks: one-off features some provinces carry.
export const SPECIALS = {
  ruins:   { name: 'Ruins', icon: '🏛', desc: 'Loot when first taken: 80 gold and 6 lore.', loot: { gold: 80, lore: 6 } },
  shrine:  { name: 'Old Shrine', icon: '⛩', desc: '+2 lore, and calms unrest.', yields: { lore: 2 }, unrest: -3 },
  goldmine: { name: 'Old Gold Mine', icon: '🪙', desc: '+3 gold.', yields: { gold: 3 } },
  ancient: { name: 'Ancient Site', icon: '🗿', desc: 'A Wonder raised here costs 25% less.' },
  pass:    { name: 'Mountain Pass', icon: '🏔', desc: 'Strength +2 against anyone attacking it.', guard: 2 },
};

// Strategic resources: hold one and the whole realm gains its bonus; some also yield where they lie.
export const RESOURCES = {
  iron:    { name: 'Iron', icon: '⛓', lands: ['hills', 'ash'], desc: 'Battles: towers +8% damage.', perks: { towerDmg: 0.08 } },
  timber:  { name: 'Timber', icon: '🪵', lands: ['forest', 'marsh'], desc: 'Buildings cost 15% less.' },
  horses:  { name: 'Horses', icon: '🐎', lands: ['plains'], desc: 'Attacks cost 1 levy less; auto-resolve +5%.' },
  grain:   { name: 'Grain', icon: '🌽', lands: ['plains', 'river', 'marsh'], desc: 'Every province grows faster.' },
  gems:    { name: 'Gems', icon: '💎', lands: ['hills', 'snow'], desc: '+3 gold where they lie.', yields: { gold: 3 } },
  crystal: { name: 'Star Crystal', icon: '🔮', lands: ['snow', 'ash'], desc: '+2 lore where it lies; battles: towers fire 5% faster.', yields: { lore: 2 }, perks: { towerRate: 0.05 } },
  salt:    { name: 'Salt', icon: '🧂', lands: ['river', 'marsh'], desc: '+1 gold where it lies; every trade agreement +2 gold.', yields: { gold: 1 } },
};

// Nations: chosen at the start (rivals get one to suit their warlord).
export const NATIONS = {
  highland: { name: 'Highland Clans', icon: '🏔', desc: 'Hills and snowfields +1 gold. Forts cost half. Defending: auto-resolve +10%.' },
  river:    { name: 'River Kingdom', icon: '🌊', desc: 'Rivers and marshes +1 lore. Harbours need no Sailing. Every trade agreement +2 gold.' },
  iron:     { name: 'Iron Legion', icon: '🛡', desc: 'Attacks cost 1 levy less. Levy upkeep halved. Battles: towers +5% damage.' },
  merchant: { name: 'Merchant Princes', icon: '🪙', desc: 'Markets +2 gold. +100 starting gold. Every rival starts 15 friendlier.' },
  arcane:   { name: 'Arcane Covenant', icon: '✨', desc: 'Capital +3 lore. Research costs 15% less. Battles: towers fire 5% faster.' },
};

// Buildings: a province has 1 slot, plus one at development 2 and 4. One of each kind per province.
export const BUILDINGS = {
  farm:     { name: 'Farmsteads', icon: '🌾', cost: 50, yields: { levy: 2 }, grow: 1, desc: '+2 levies, faster growth.' },
  market:   { name: 'Market', icon: '🪙', cost: 70, yields: { gold: 3 }, desc: '+3 gold.' },
  library:  { name: 'Library', icon: '📜', cost: 70, yields: { lore: 2 }, desc: '+2 lore.' },
  temple:   { name: 'Temple', icon: '⛪', cost: 60, yields: { lore: 1 }, unrest: -8, desc: '+1 lore, calms unrest.' },
  fort:     { name: 'Fort', icon: '🏯', cost: 90, yields: {}, guard: 1, desc: 'Strength +1 against attackers; defend it with +25% castle and wall health and +80 gold.' },
  barracks: { name: 'Barracks', icon: '⚔', cost: 80, yields: { levy: 2 }, guard: 1, needs: 'drill', desc: '+2 levies; strength +1 against attackers.' },
  mine:     { name: 'Mine', icon: '⛏', cost: 90, yields: { gold: 4 }, needs: 'mining', lands: ['hills', 'ash', 'snow'], desc: '+4 gold (hills, ash or snow).' },
  workshop: { name: 'Workshop', icon: '⚙', cost: 100, yields: { gold: 1, lore: 1 }, needs: 'engineering', desc: '+1 gold, +1 lore; every Workshop makes all buildings 5% cheaper (up to 25%).' },
  harbor:   { name: 'Harbour', icon: '⚓', cost: 90, yields: { gold: 3 }, needs: 'sailing', lands: ['river', 'marsh'], desc: '+3 gold, and +1 gold on every trade agreement (rivers or marsh).' },
  academy:  { name: 'Academy', icon: '🎓', cost: 130, yields: { lore: 4 }, needs: 'scholarship', desc: '+4 lore.' },
  bank:     { name: 'Bank', icon: '🏦', cost: 140, yields: { gold: 5 }, needs: 'banking', desc: '+5 gold.' },
};

// Research: bought with lore, in four tiers. Battle perks ride into every Dominion battle (see App.runBonus);
// `mil` techs raise your army's quality (auto-resolve odds) and a rival's might.
export const TECHS = {
  masonry:     { tier: 1, name: 'Masonry', icon: '🧱', cost: 15, needs: [], mil: 1, desc: 'Battles: castle and wall +15% health.', perks: { castleHpMult: 0.15, wallHpMult: 0.15 } },
  coinage:     { tier: 1, name: 'Coinage', icon: '🪙', cost: 15, needs: [], desc: 'Battles start with +60 gold. Markets +1 gold.', perks: { startGold: 60 } },
  drill:       { tier: 1, name: 'Drill Yards', icon: '🛡', cost: 18, needs: [], mil: 1, desc: 'Attacks cost 1 levy less; auto-resolve +10%. Unlocks Barracks.' },
  cartography: { tier: 1, name: 'Cartography', icon: '🗺', cost: 18, needs: [], desc: 'The whole map is revealed, and scouting takes no order.' },
  husbandry:   { tier: 1, name: 'Husbandry', icon: '🐄', cost: 15, needs: [], desc: 'Farmsteads +1 levy, and plains grow faster.' },
  mining:      { tier: 1, name: 'Mining', icon: '⛏', cost: 18, needs: [], desc: 'Hills and ashlands +1 gold. Unlocks Mines.' },
  engineering: { tier: 2, name: 'Engineering', icon: '⚙', cost: 30, needs: ['masonry'], mil: 1, desc: 'Battles: towers +10% damage. Unlocks Workshops.', perks: { towerDmg: 0.1 } },
  logistics:   { tier: 2, name: 'Logistics', icon: '🐴', cost: 36, needs: ['drill'], mil: 1, desc: '+1 army every turn (one more attack).' },
  banners:     { tier: 2, name: 'War Banners', icon: '🚩', cost: 33, needs: ['coinage'], desc: 'Every battle is one wave shorter.' },
  sailing:     { tier: 2, name: 'Sailing', icon: '⛵', cost: 27, needs: ['cartography'], desc: 'Unlocks Harbours and the Colossus. Trade agreements +2 gold.' },
  laws:        { tier: 2, name: 'Code of Laws', icon: '⚖', cost: 30, needs: ['coinage'], desc: '+1 policy slot, +1 order every turn. Temples calm 4 more unrest.' },
  scholarship: { tier: 2, name: 'Scholarship', icon: '🎓', cost: 33, needs: ['cartography'], desc: 'Lore +10%. Unlocks Academies and the Great Library.' },
  arcana:      { tier: 3, name: 'Arcana', icon: '✨', cost: 51, needs: ['engineering'], mil: 1, desc: 'Battles: towers fire 8% faster, kill gold +10%. Unlocks the Observatory.', perks: { towerRate: 0.08, killGold: 0.1 } },
  banking:     { tier: 3, name: 'Banking', icon: '🏦', cost: 51, needs: ['laws'], desc: 'Gold +10%, +1 order every turn. Unlocks Banks and the Golden Throne.' },
  statecraft:  { tier: 3, name: 'Statecraft', icon: '🕊', cost: 48, needs: ['laws'], desc: '+1 policy slot. Every rival warms a little each turn; peace offers +15%.' },
  siegeworks:  { tier: 3, name: 'Siegeworks', icon: '🪨', cost: 54, needs: ['engineering', 'logistics'], mil: 1, desc: 'Storming a capital takes a wave fewer; enemy forts lose their edge; auto-resolve +10%.' },
  fortification: { tier: 3, name: 'Fortification', icon: '🏰', cost: 45, needs: ['masonry', 'laws'], mil: 1, desc: 'Your forts guard twice as well. Defending: castle +15%. Unlocks the Grand Citadel.', perks: {} },
  medicine:    { tier: 3, name: 'Medicine', icon: '🌿', cost: 45, needs: ['husbandry', 'scholarship'], desc: 'Every province grows faster; levy upkeep -25%.' },
  crown:       { tier: 4, name: 'Imperial Crown', icon: '👑', cost: 75, needs: ['logistics', 'arcana'], mil: 1, desc: '+1 army every turn; storming a capital takes two waves fewer.' },
  ascendancy:  { tier: 4, name: 'Ascendancy', icon: '🌟', cost: 320, needs: ['crown', 'scholarship'], needsT3: 3, desc: 'The great work of the age. Whoever masters it first wins the Science victory.' },
};
export const TECH_ORDER = Object.keys(TECHS);

// Policies: a slot to start with, more from Code of Laws and Statecraft. Adopting one costs 40 gold.
export const POLICIES = {
  conscription:  { name: 'Conscription', icon: '📯', desc: '+1 levy in every province; +3 unrest a turn.' },
  free_trade:    { name: 'Free Trade', icon: '🤝', desc: 'Every trade agreement +3 gold, and trade partners warm to you each turn.' },
  scholasticism: { name: 'Scholasticism', icon: '🕯', desc: 'Lore +25%; gold -10%.' },
  martial_law:   { name: 'Martial Law', icon: '🛡', desc: 'Unrest falls 6 faster; battles: castle +20% health; gold -10%.', perks: { castleHpMult: 0.2 } },
  expansionism:  { name: 'Expansionism', icon: '🚩', desc: 'Attacks and settlements cost less (1 levy, 20% gold); conquered land starts 15 more restless.' },
  iron_discipline: { name: 'Iron Discipline', icon: '⚒', desc: 'Battles: towers +10% damage; levy income -25%.', perks: { towerDmg: 0.1 } },
  crown_lands:   { name: 'Crown Lands', icon: '🏰', desc: 'Your capital yields double; other provinces +2 unrest a turn.' },
  tithes:        { name: 'Tithes', icon: '⛪', desc: 'Temples and shrines +2 gold each.' },
};
export const POLICY_COST = 40;

// Wonders: one of each in the whole world. Rivals race you for them.
export const WONDERS = {
  great_library: { name: 'Great Library', icon: '📚', cost: { gold: 320, lore: 30 }, needs: 'scholarship', desc: '+5 lore; research 10% cheaper.', yields: { lore: 5 } },
  colossus:      { name: 'Colossus', icon: '🗿', cost: { gold: 360 }, needs: 'sailing', lands: ['river', 'marsh'], desc: '+6 gold; every trade agreement +2 (rivers or marsh).', yields: { gold: 6 } },
  hanging_gardens: { name: 'Hanging Gardens', icon: '🌺', cost: { gold: 340 }, needs: 'husbandry', desc: 'Every province grows faster; unrest falls 3 faster.' },
  war_academy:   { name: 'War Academy', icon: '⚔', cost: { gold: 360 }, needs: 'logistics', desc: '+1 army every turn; battles start with +100 gold; attacks cost 1 levy less.', perks: { startGold: 100 } },
  grand_citadel: { name: 'Grand Citadel', icon: '🏰', cost: { gold: 380 }, needs: 'fortification', desc: 'Defending: castle +25%; your capital strength +3.', capital: true },
  observatory:   { name: 'Star Observatory', icon: '🔭', cost: { gold: 340, lore: 40 }, needs: 'arcana', desc: '+4 lore, the whole map revealed; battles: towers fire 5% faster.', yields: { lore: 4 }, perks: { towerRate: 0.05 } },
  golden_throne: { name: 'Golden Throne', icon: '🪙', cost: { gold: 1400 }, needs: 'banking', needsWonders: 2, desc: 'Needs two other Wonders. Whoever raises it first wins the Prosperity victory.' },
};
export const WONDER_ORDER = Object.keys(WONDERS);

export const SEASONS = [
  { id: 'spring', name: 'Spring', icon: '🌱', desc: 'Every province grows faster.' },
  { id: 'summer', name: 'Summer', icon: '☀', desc: 'Campaign season: attacks cost 1 levy less, and rivals march more.' },
  { id: 'autumn', name: 'Autumn', icon: '🍂', desc: 'Harvest: levy income +50%.' },
  { id: 'winter', name: 'Winter', icon: '❄', desc: 'Levy income halved; hills and snow +1 strength; rivals march less.' },
];
export const seasonOf = (turn) => SEASONS[Math.floor((Math.max(1, turn) - 1) / 3) % 4];

export const VICTORIES = {
  conquest: { name: 'Conquest', icon: '⚔', desc: 'Break every rival: storm the capitals they have left.' },
  science: { name: 'Science', icon: '🌟', desc: 'Be first to research Ascendancy.' },
  prosperity: { name: 'Prosperity', icon: '🪙', desc: 'Be first to raise the Golden Throne (it needs two other Wonders).' },
  diplomacy: { name: 'Grand Alliance', icon: '🕊', desc: `Be allied with every surviving rival for ${DOMINION.allyTurns} turns in a row, holding a quarter of the land.` },
  score: { name: 'Score', icon: '📊', desc: 'Hold the best score when the turn limit is reached.' },
};

// Warlord temperaments: aggression, expansion, science, trade, building.
const TRAITS = {
  grukk: { agg: 0.45, exp: 0.5, sci: 0.4, trade: 0.5, build: 0.95, title: 'Builder', nation: 'highland' },
  skarra: { agg: 0.9, exp: 0.6, sci: 0.3, trade: 0.3, build: 0.4, title: 'Raider', nation: 'iron' },
  vargul: { agg: 0.6, exp: 0.95, sci: 0.3, trade: 0.4, build: 0.45, title: 'Expansionist', nation: 'river' },
  morwen: { agg: 0.35, exp: 0.4, sci: 0.95, trade: 0.4, build: 0.6, title: 'Scholar', nation: 'arcane' },
  brakka: { agg: 0.95, exp: 0.6, sci: 0.25, trade: 0.2, build: 0.5, title: 'Conqueror', nation: 'iron' },
  pale: { agg: 0.3, exp: 0.4, sci: 0.8, trade: 0.7, build: 0.6, title: 'Schemer', nation: 'arcane' },
  ghaz: { agg: 0.4, exp: 0.5, sci: 0.4, trade: 0.95, build: 0.75, title: 'Merchant', nation: 'merchant' },
  rotmaw: { agg: 0.8, exp: 0.9, sci: 0.2, trade: 0.2, build: 0.3, title: 'Devourer', nation: 'river' },
};
export const traitsOf = (id) => TRAITS[id] || TRAITS.grukk;

const SYL_A = ['Ash', 'Bran', 'Cal', 'Dun', 'El', 'Fen', 'Gal', 'Har', 'Ill', 'Kor', 'Lan', 'Mor', 'Nor', 'Oak', 'Pel', 'Rav', 'Sel', 'Thorn', 'Ul', 'Var', 'Wyn', 'Yar', 'Brig', 'Corr', 'Dra', 'Eld', 'Grim', 'Hollow', 'Isen', 'Kest'];
const SYL_B = ['bury', 'dale', 'ford', 'gate', 'hold', 'march', 'mere', 'moor', 'reach', 'ridge', 'stead', 'vale', 'watch', 'wick', 'wood', 'helm', 'fell', 'haven', 'crag', 'barrow'];

const DIRS = [[[1, 0], [-1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]], [[1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]];
const key = (q, r) => q + ',' + r;

// Odd-row offset hex layout, in hex widths: x across, y down.
export function hexCenter(q, r) { return { x: q + (r & 1 ? 0.5 : 0) + 0.5, y: r * 0.866 + 0.5 }; }
export const sizeOf = (s) => SIZES[s.size] || SIZES.small;

const INDEX = new WeakMap();   // hex lookup per province list, kept out of the saved campaign
export const provById = (s, id) => s.provs[id];
export function neighbors(s, id) {
  const p = s.provs[id];
  if (!p) return [];
  let at = INDEX.get(s.provs);
  if (!at) { at = Object.fromEntries(s.provs.map((x) => [key(x.q, x.r), x.id])); INDEX.set(s.provs, at); }
  return DIRS[p.r & 1].map(([dq, dr]) => at[key(p.q + dq, p.r + dr)]).filter((n) => n !== undefined);
}
export const ownedBy = (s, who) => s.provs.filter((p) => p.owner === who);
export const yours = (s) => ownedBy(s, 'you');
export const factionOf = (s, fid) => s.factions.find((f) => f.id === fid) || null;
export const lordName = (id) => warlordById(id)?.name || 'the horde';
// A realm's own record: you (the campaign's top level) or a rival faction.
const realm = (s, who) => (who === 'you' ? s : factionOf(s, who));
export const has = (s, tech, who = 'you') => !!realm(s, who)?.techs?.includes(tech);
export const nationOf = (s, who = 'you') => realm(s, who)?.nation || null;
export const policyOn = (s, id) => s.policies.includes(id);
export const wondersOf = (s, who = 'you') => WONDER_ORDER.filter((w) => s.wonders[w]?.owner === who);
export const hasWonder = (s, w, who = 'you') => s.wonders[w]?.owner === who;
export const resourcesOf = (s, who = 'you') => { const set = new Set(); for (const p of ownedBy(s, who)) if (p.res) set.add(p.res); return set; };
export const slotsOf = (p) => 1 + (p.dev >= 2 ? 1 : 0) + (p.dev >= 4 ? 1 : 0);
export const hasB = (p, b) => p.buildings.includes(b);
export const ordersPerTurn = (s) => DOMINION.orders + (has(s, 'laws') ? 1 : 0) + (has(s, 'banking') ? 1 : 0);
export const armiesPerTurn = (s) => DOMINION.armies + (has(s, 'logistics') ? 1 : 0) + (has(s, 'crown') ? 1 : 0) + (hasWonder(s, 'war_academy') ? 1 : 0);
export const policySlots = (s) => 1 + (has(s, 'laws') ? 1 : 0) + (has(s, 'statecraft') ? 1 : 0);
export const alive = (s) => s.factions.filter((f) => f.alive);
export const borders = (s, who = 'you') => {
  const set = new Set();
  for (const p of ownedBy(s, who)) for (const n of neighbors(s, p.id)) if (s.provs[n].owner !== who) set.add(n);
  return [...set];
};
const bordering = (s, a, b) => ownedBy(s, a).some((p) => neighbors(s, p.id).some((n) => s.provs[n].owner === b));
export const met = (s, fid) => s.provs.some((p) => p.owner === fid && p.seen);

// ---------- a new world ----------
export function newCampaign(seed, opts = {}) {
  if (typeof opts === 'string') opts = { diff: opts };
  const size = SIZES[opts.size] ? opts.size : 'small';
  const Z = SIZES[size];
  const nRivals = Math.max(Z.rivals[0], Math.min(Z.rivals[1], opts.rivals || (size === 'large' ? 4 : 3)));
  const rng = new Rng(seedFor('dominion', seed, size));
  const cells = [];
  for (let r = 0; r < Z.rows; r++) for (let q = 0; q < Z.cols; q++) cells.push({ q, r });
  // Terrain in clusters: a few seed points, each hex takes its nearest.
  const nSeeds = Math.round(cells.length / 5);
  const seeds = Array.from({ length: nSeeds }, (_, i) => ({ ...hexCenter(rng.int(0, Z.cols - 1), rng.int(0, Z.rows - 1)), t: i < TERRAIN_IDS.length ? TERRAIN_IDS[i] : rng.pick(TERRAIN_IDS) }));
  // Capital spots: the four corners, then the middles of the long edges.
  const spotCells = [[0, 0], [Z.cols - 1, Z.rows - 1], [Z.cols - 1, 0], [0, Z.rows - 1], [Math.floor(Z.cols / 2), 0], [Math.floor(Z.cols / 2), Z.rows - 1]].slice(0, nRivals + 1);
  // Lakes and peaks, kept off the capitals and never cutting the land in two.
  const blocked = new Set();
  const want = Math.round(cells.length * 0.14);
  for (let tries = 0; blocked.size < want && tries < 600; tries++) {
    const c = rng.pick(cells), k = key(c.q, c.r);
    if (blocked.has(k) || spotCells.some(([q, r]) => hexDist({ q, r }, c) <= 1)) continue;
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
    for (let i = 0; i < 30 && (!name || used.has(name)); i++) name = rng.pick(SYL_A) + rng.pick(SYL_B);
    used.add(name);
    provs.push(makeProv(provs.length, c.q, c.r, name, t, rng));
  }
  const diff = DIFFICULTIES[opts.diff] ? opts.diff : 'knight';
  const nation = NATIONS[opts.nation] ? opts.nation : 'highland';
  const s = {
    v: 2, id: String(seed), seed: String(seed), diff, size, nation, turnLimit: TURN_LIMITS.includes(opts.turnLimit) ? opts.turnLimit : 60,
    turn: 1, orders: DOMINION.orders, armies: DOMINION.armies, gold: DOMINION.start.gold + (nation === 'merchant' ? 100 : 0), levy: DOMINION.start.levy, lore: DOMINION.start.lore,
    techs: [], policies: [], tax: 'normal', wonders: {}, envoys: [], diplo: {}, market: { turn: 1, levy: 0, lore: 0 }, policyTurn: 0,
    provs, factions: [], rivalWars: [], threat: null, battle: null, over: null, log: [], allianceRun: 0,
    stats: { won: 0, lost: 0, auto: 0, taken: 0, held: 0, razed: 0, settled: 0, revolts: 0 },
    lakes: [...blocked].map((k) => k.split(',').map(Number)),
  };
  const nearestProv = (q, r) => provs.reduce((a, b) => (hexDist(b, { q, r }) < hexDist(a, { q, r }) ? b : a));
  const spots = spotCells.map(([q, r]) => nearestProv(q, r));
  const lords = [...WARLORDS].sort((a, b) => seedFor(seed, a.id) - seedFor(seed, b.id)).slice(0, nRivals);
  const home = spots[0];
  home.owner = 'you'; home.capital = 'you'; home.dev = 3; home.buildings = ['market']; home.res = null; home.special = null;
  lords.forEach((w, i) => {
    const c = spots[i + 1], T = traitsOf(w.id);
    c.owner = w.id; c.capital = w.id; c.dev = 3; c.buildings = ['fort']; c.special = null;
    s.factions.push({ id: w.id, cap: c.id, alive: true, color: RIVAL_COLORS[i], nation: T.nation, gold: 80, lore: 0, techs: [], army: 0, might: 2,
      stance: 'peace', relation: Math.round(-20 * T.agg + (nation === 'merchant' ? 15 : 0)), treaty: 0, trade: false, warScore: 0, since: 1 });
    for (const n of neighbors(s, c.id).slice(0, 2)) if (!s.provs[n].owner) { s.provs[n].owner = w.id; s.provs[n].level = 3; }
  });
  // Neutral strength rises with distance from you.
  for (const p of provs) {
    if (p.owner) { if (p.capital) p.level = 5; continue; }
    const d = hexDist(p, home);
    p.level = Math.max(1, Math.min(5, Math.floor(d / 1.6) + (rng.chance(0.3) ? 1 : 0)));
  }
  for (const n of neighbors(s, home.id)) { const p = s.provs[n]; p.level = 1; if (p.special === 'ruins' || p.special === 'pass') p.special = null; }
  reveal(s);
  note(s, `You raise the banner of the ${NATIONS[nation].name} over ${home.name}. ${lords.length} rival nations share the land: ${lords.map((w) => w.name).join(', ')}.`, 'start');
  return s;
}

function makeProv(id, q, r, name, terrain, rng) {
  const T = TERRAIN[terrain];
  const resChoices = Object.entries(RESOURCES).filter(([, R]) => R.lands.includes(terrain)).map(([k]) => k);
  return {
    id, q, r, name, terrain, map: rng.pick(T.maps), owner: null, level: 1, dev: 1, grow: 0, buildings: [], unrest: 0,
    special: rng.chance(0.14) ? rng.pick(Object.keys(SPECIALS)) : null,
    res: resChoices.length && rng.chance(0.3) ? rng.pick(resChoices) : null,
    seen: false, capital: null,
  };
}

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

// Fog: you see what you hold and everything next to it; allies share their maps; Cartography or the Observatory show all.
export function reveal(s) {
  const all = has(s, 'cartography') || hasWonder(s, 'observatory');
  const allies = new Set(s.factions.filter((f) => f.alive && f.stance === 'alliance').map((f) => f.id));
  for (const p of s.provs) {
    if (all || p.owner === 'you' || allies.has(p.owner)) p.seen = true;
    else if (neighbors(s, p.id).some((n) => s.provs[n].owner === 'you')) p.seen = true;
  }
}

function note(s, text, kind = '') {
  s.log.unshift({ turn: s.turn, text, kind });
  if (s.log.length > DOMINION.maxLog) s.log.length = DOMINION.maxLog;
}

// ---------- the economy ----------
export function provYields(s, p, who = p.owner) {
  const y = { ...TERRAIN[p.terrain].yields };
  const add = (o, k = 1) => { for (const [a, v] of Object.entries(o || {})) y[a] = (y[a] || 0) + v * k; };
  y.gold += p.dev - 1;
  y.levy += p.dev >= 4 ? 1 : 0;
  y.lore += (p.dev >= 3 ? 1 : 0) + (p.dev >= 5 ? 1 : 0);
  if (p.special) add(SPECIALS[p.special].yields);
  if (p.res) add(RESOURCES[p.res].yields);
  for (const b of p.buildings) add(BUILDINGS[b]?.yields);
  for (const [w, W] of Object.entries(WONDERS)) if (s.wonders[w]?.prov === p.id && s.wonders[w].owner === who) add(W.yields);
  if (!who) return y;
  const nat = nationOf(s, who), mine = who === 'you';
  if (hasB(p, 'market') && has(s, 'coinage', who)) y.gold += 1;
  if (hasB(p, 'market') && nat === 'merchant') y.gold += 2;
  if (hasB(p, 'farm') && has(s, 'husbandry', who)) y.levy += 1;
  if (nat === 'highland' && (p.terrain === 'hills' || p.terrain === 'snow')) y.gold += 1;
  if (nat === 'river' && (p.terrain === 'river' || p.terrain === 'marsh')) y.lore += 1;
  if (has(s, 'mining', who) && (p.terrain === 'hills' || p.terrain === 'ash')) y.gold += 1;
  if (p.capital === who) { add({ gold: 3, levy: 2, lore: 2 }); if (nat === 'arcane') y.lore += 3; }
  if (mine) {
    if (policyOn(s, 'conscription')) y.levy += 1;
    if (policyOn(s, 'tithes')) y.gold += 2 * ((hasB(p, 'temple') ? 1 : 0) + (p.special === 'shrine' ? 1 : 0));
    if (policyOn(s, 'crown_lands') && p.capital === 'you') for (const k of Object.keys(y)) y[k] *= 2;
    if (p.unrest >= DOMINION.unrestHalf) for (const k of Object.keys(y)) y[k] = Math.floor(y[k] / 2);
  }
  return y;
}

// What one trade agreement with you is worth to you (rivals earn a flat share).
export function tradeValue(s) {
  const harbors = yours(s).filter((p) => hasB(p, 'harbor')).length;
  return 4 + harbors + (resourcesOf(s).has('salt') ? 2 : 0) + (policyOn(s, 'free_trade') ? 3 : 0) + (nationOf(s) === 'river' ? 2 : 0)
    + (has(s, 'sailing') ? 2 : 0) + (hasWonder(s, 'colossus') ? 2 : 0);
}
// Sprawl: a large realm costs gold to run and makes research dearer (for everyone).
export const SPRAWL = { free: 6, gold: 1.5, techFrom: 8, tech: 0.03 };
export const adminUpkeep = (s, who = 'you') => Math.max(0, Math.round((ownedBy(s, who).length - SPRAWL.free) * SPRAWL.gold));
// Levies beyond what your land can feed go home at the end of the turn.
export const levyCap = (s) => 20 + 4 * yours(s).length + 6 * yours(s).filter((p) => hasB(p, 'barracks')).length;
export const levyUpkeep = (s) => Math.floor(s.levy / (nationOf(s) === 'iron' ? 20 : 10) * (has(s, 'medicine') ? 0.75 : 1));
export const TAX = { low: { name: 'Low', gold: 0.75, unrest: -4 }, normal: { name: 'Normal', gold: 1, unrest: 0 }, high: { name: 'High', gold: 1.35, unrest: 5 } };

// Your income for a turn, with its parts (gross, trade, upkeep and the net that will arrive).
export function income(s, who = 'you') {
  const y = { gold: 0, levy: 0, lore: 0 };
  for (const p of ownedBy(s, who)) for (const [k, v] of Object.entries(provYields(s, p, who))) y[k] += v;
  const season = seasonOf(s.turn).id;
  const levyMult = (season === 'autumn' ? 1.5 : season === 'winter' ? 0.5 : 1) * (who === 'you' && policyOn(s, 'iron_discipline') ? 0.75 : 1);
  if (who !== 'you') {
    const f = factionOf(s, who), T = traitsOf(who), ai = DIFFICULTIES[s.diff].ai;
    const gold = Math.round((y.gold + 3 + (f.trade ? 4 : 0)) * ai * (has(s, 'banking', who) ? 1.1 : 1) - adminUpkeep(s, who) * 0.5);
    const lore = Math.round((y.lore + 1) * ai * (0.45 + 0.5 * T.sci) * (has(s, 'scholarship', who) ? 1.1 : 1));
    return { gold, levy: Math.round(y.levy * levyMult), lore, trade: 0, upkeep: 0, net: gold };
  }
  let goldMult = TAX[s.tax]?.gold || 1;
  if (has(s, 'banking')) goldMult += 0.1;
  if (policyOn(s, 'scholasticism')) goldMult -= 0.1;
  if (policyOn(s, 'martial_law')) goldMult -= 0.1;
  let loreMult = 1 + (has(s, 'scholarship') ? 0.1 : 0) + (policyOn(s, 'scholasticism') ? 0.25 : 0);
  const trade = s.factions.filter((f) => f.alive && f.trade).length * tradeValue(s);
  const gross = Math.round(y.gold * goldMult) + trade;
  const upkeep = levyUpkeep(s), admin = adminUpkeep(s);
  return { gold: gross, levy: Math.round(y.levy * levyMult), lore: Math.round(y.lore * loreMult), trade, upkeep, admin, net: gross - upkeep - admin };
}

// Build costs shrink with Timber, Workshops, Highland forts and Expansionism's settlers.
export function buildCost(s, b, who = 'you') {
  const B = BUILDINGS[b];
  let k = 1;
  if (resourcesOf(s, who).has('timber')) k -= 0.15;
  k -= Math.min(0.25, 0.05 * ownedBy(s, who).filter((p) => hasB(p, 'workshop')).length);
  if (b === 'fort' && nationOf(s, who) === 'highland') k -= 0.5;
  return Math.max(10, Math.round(B.cost * k));
}
export function techCost(s, t, who = 'you') {
  let k = 1 + Math.max(0, ownedBy(s, who).length - SPRAWL.techFrom) * SPRAWL.tech;
  if (t === 'ascendancy') k *= 1 + 0.4 * Object.keys(SIZES).indexOf(s.size);
  if (nationOf(s, who) === 'arcane') k -= 0.15;
  if (hasWonder(s, 'great_library', who)) k -= 0.1;
  return Math.max(1, Math.round(TECHS[t].cost * k));
}
export function wonderCost(s, w, prov = null) {
  const C = WONDERS[w].cost, k = (prov && prov.special === 'ancient' ? 0.75 : 1) * (w === 'golden_throne' ? 1 + 0.4 * Object.keys(SIZES).indexOf(s.size) : 1);
  return { gold: Math.round((C.gold || 0) * k), lore: Math.round((C.lore || 0) * k) };
}

// ---------- battles ----------
// How hard a province is to take: its garrison, its development, its owner's might, forts, passes and the season.
export function provPower(s, p, attacker = 'you') {
  const f = p.owner && p.owner !== 'you' ? factionOf(s, p.owner) : null;
  let pw = p.level + Math.floor((p.dev - 1) / 2);
  if (f) pw += Math.floor(f.might / 2);
  const forts = (hasB(p, 'fort') ? 1 : 0) * (p.owner && has(s, 'fortification', p.owner) ? 2 : 1) + (hasB(p, 'barracks') ? 1 : 0);
  pw += attacker === 'you' && has(s, 'siegeworks') ? Math.max(0, forts - 1) : forts;
  if (p.special === 'pass') pw += SPECIALS.pass.guard;
  if (seasonOf(s.turn).id === 'winter' && (p.terrain === 'snow' || p.terrain === 'hills')) pw += 1;
  if (p.capital && p.owner && hasWonder(s, 'grand_citadel', p.owner)) pw += 3;
  return Math.max(1, pw);
}
const snapStart = (w) => START_WAVES.filter((x) => x <= Math.max(1, w)).pop() || 1;
export function battleStart(s, power) {
  const D = DIFFICULTIES[s.diff];
  return snapStart(Math.round(D.base + D.perLevel * power + D.perTurn * (s.turn - 1)));
}
export function attackCost(s, p) {
  const cut = (has(s, 'drill') ? 1 : 0) + (resourcesOf(s).has('horses') ? 1 : 0) + (nationOf(s) === 'iron' ? 1 : 0) + (policyOn(s, 'expansionism') ? 1 : 0)
    + (hasWonder(s, 'war_academy') ? 1 : 0) + (seasonOf(s.turn).id === 'summer' ? 1 : 0);
  return Math.max(1, DOMINION.attackLevy + provPower(s, p) - cut);
}

// Battle perks: research, strategic resources, policies, wonders, your nation; a fort or a rich province when you defend one.
export function battlePerks(s, p, kind) {
  const perks = {};
  const add = (o) => { for (const [k, v] of Object.entries(o || {})) perks[k] = (perks[k] || 0) + v; };
  for (const t of s.techs) add(TECHS[t].perks);
  for (const r of resourcesOf(s)) add(RESOURCES[r].perks);
  for (const pol of s.policies) add(POLICIES[pol]?.perks);
  for (const w of wondersOf(s)) add(WONDERS[w].perks);
  if (s.nation === 'iron') add({ towerDmg: 0.05 });
  if (s.nation === 'arcane') add({ towerRate: 0.05 });
  if (kind === 'defend') {
    if (hasB(p, 'fort')) add({ castleHpMult: 0.25, wallHpMult: 0.25, startGold: 80 });
    if (has(s, 'fortification')) add({ castleHpMult: 0.15 });
    if (hasWonder(s, 'grand_citadel')) add({ castleHpMult: 0.25 });
    add({ startGold: 20 * (p.dev - 1) });
  }
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
  if (f && f.stance !== 'war') return `You are at ${f.stance === 'alliance' ? 'alliance' : 'peace'} with ${lordName(f.id)}. Declare war first (Diplomacy).`;
  if ((s.armies ?? 1) < 1) return 'Your armies have all marched this turn.';
  if (s.levy < attackCost(s, p)) return `Needs ${attackCost(s, p)} levies.`;
  return null;
}

// Everything a battle needs: which battlefield, the starting wave, how many waves to hold, whose host.
export function battleSetup(s, id, kind = 'attack') {
  const p = s.provs[id];
  const foe = kind === 'defend' ? s.threat?.faction : p.owner && p.owner !== 'you' ? p.owner : null;
  const power = kind === 'defend' ? s.threat.power : provPower(s, p);
  const W = DOMINION.waves;
  const capital = kind !== 'defend' && p.capital && p.capital !== 'you';
  let waves = kind === 'defend' ? W.defend : capital ? W.capital : foe ? W.faction : W.neutral;
  if (has(s, 'banners')) waves -= 1;
  if (capital && has(s, 'crown')) waves -= 2;
  if (capital && has(s, 'siegeworks')) waves -= 1;
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
  if (kind === 'attack') { s.armies -= 1; s.levy -= B.cost; }
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

function takeProvince(s, p, newOwner, unrest = 0) {
  const prev = p.owner;
  if (p.capital === 'you' && newOwner !== 'you') p.capital = null;   // your seat has fallen
  p.owner = newOwner;
  p.unrest = newOwner === 'you' ? Math.min(100, unrest) : 0;
  p.grow = 0;
  if (hasB(p, 'fort') && newOwner !== 'you') p.buildings = p.buildings.filter((b) => b !== 'fort');   // a stormed fort is slighted
  for (const w of WONDER_ORDER) if (s.wonders[w]?.prov === p.id) s.wonders[w].owner = newOwner;     // wonders change hands with the land
  return prev;
}

// Break a rival: its capital is taken; its provinces swear fealty to whoever broke it (or go free if a revolt did).
function breakFaction(s, f, by) {
  f.alive = false; f.stance = 'peace'; f.trade = false;
  s.rivalWars = s.rivalWars.filter(([a, b]) => a !== f.id && b !== f.id);
  let sworn = 0;
  for (const q of s.provs) if (q.owner === f.id) { takeProvince(s, q, by, by === 'you' ? 30 : 0); sworn++; }
  if (s.provs[f.cap]?.capital === f.id) s.provs[f.cap].capital = null;
  for (const q of s.provs) if (q.capital === f.id) q.capital = null;
  return sworn;
}

function resolve(s, b, victory) {
  const p = s.provs[b.prov];
  const lord = b.foe ? lordName(b.foe) : null;
  const f = b.foe ? factionOf(s, b.foe) : null;
  const out = { kind: b.kind, prov: b.prov, name: p.name, victory, gold: 0, lore: 0, eliminated: null, lostCapital: false };
  if (b.kind === 'defend') {
    s.threat = null;
    if (victory) {
      s.stats.held++; out.gold = 20 + 10 * b.power; s.gold += out.gold;
      if (f) { f.army = Math.max(0, f.army - 2); f.warScore++; recomputeMight(s, f); }
      note(s, `${p.name} held against ${lord || 'the horde'}. +${out.gold} gold, and their host is broken.`, 'win');
    } else {
      s.stats.lost++;
      out.lostCapital = p.capital === 'you';
      if (f) f.warScore--;
      takeProvince(s, p, b.foe);
      p.dev = Math.max(1, p.dev - 1);
      note(s, `${p.name} fell to ${lord || 'the horde'}.`, 'loss');
    }
  } else if (victory) {
    s.stats.won++; s.stats.taken++;
    const prev = p.owner;
    takeProvince(s, p, 'you', DOMINION.conquestUnrest + (policyOn(s, 'expansionism') ? 15 : 0) - (prev ? 0 : 20));
    p.level = Math.max(1, p.level - 1);
    out.gold = 10 * b.power; out.lore = 1 + Math.floor(b.power / 2);
    if (p.special === 'ruins') { out.gold += SPECIALS.ruins.loot.gold; out.lore += SPECIALS.ruins.loot.lore; p.special = null; }
    s.gold += out.gold; s.lore += out.lore;
    s.levy += Math.floor(b.cost / 2);   // half the host comes home
    if (f) { f.warScore++; f.army = Math.max(0, f.army - 1); }
    if (p.capital && p.capital !== 'you') {
      const cf = factionOf(s, p.capital);
      out.eliminated = cf.id; s.stats.razed++;
      out.sworn = breakFaction(s, cf, 'you');
      p.capital = null;
      note(s, `You stormed ${p.name}: ${lordName(cf.id)} is broken${out.sworn ? `, and ${out.sworn} province${out.sworn === 1 ? '' : 's'} swear fealty to you` : ''}.`, 'big');
    } else note(s, `You took ${p.name}${prev && lord ? ` from ${lord}` : ''}. +${out.gold} gold, +${out.lore} lore.`, 'win');
    if (f) recomputeMight(s, f);
  } else {
    s.stats.lost++;
    if (f) f.warScore--;
    note(s, `The attack on ${p.name} was thrown back.`, 'loss');
  }
  reveal(s);
  checkOver(s, out);
  return out;
}

// Your army's quality for auto-resolve: military research, horses and iron, a few policies.
export function armyQuality(s) {
  return 1 + Math.floor(s.techs.filter((t) => TECHS[t].mil).length / 2) + (resourcesOf(s).has('iron') ? 1 : 0) + (policyOn(s, 'iron_discipline') ? 1 : 0);
}
// Auto-resolve: quicker, riskier. Commit extra levies to tilt the odds.
export function autoOdds(s, id, extra = 0, kind = 'attack') {
  const p = s.provs[id];
  const power = kind === 'defend' ? s.threat?.power || 1 : provPower(s, p);
  const mine = armyQuality(s) + (kind === 'defend' ? (hasB(p, 'fort') ? 2 : 0) + (p.capital === 'you' ? 1 : 0) + (p.special === 'pass' ? 2 : 0) : 0);
  const D = DOMINION;
  const bonus = (has(s, 'drill') ? 0.1 : 0) + (kind !== 'defend' && has(s, 'siegeworks') ? 0.1 : 0) + (resourcesOf(s).has('horses') ? 0.05 : 0)
    + (kind === 'defend' ? D.autoDefend + (s.nation === 'highland' ? 0.1 : 0) : 0);
  return Math.max(0.05, Math.min(D.autoMax, D.autoBase - D.autoPerLevel * (power - mine) + D.autoPerLevy * extra + bonus));
}
export function autoResolve(s, id, extra = 0, kind = 'attack', roll = null) {
  extra = Math.max(0, Math.floor(extra));
  if (kind === 'attack') { const why = canAttack(s, id); if (why) return { error: why }; }
  else if (!s.threat || s.threat.prov !== id) return { error: 'No attack to answer here.' };
  const B = battleSetup(s, id, kind);
  if (s.levy < B.cost + extra) return { error: `Needs ${B.cost + extra} levies.` };
  const odds = autoOdds(s, id, extra, kind);
  if (kind === 'attack') s.armies -= 1;
  s.levy -= B.cost + extra;
  const r = roll ?? new Rng(seedFor(s.seed, 'auto', s.turn, id, s.stats.auto)).next();
  s.stats.auto++;
  const out = resolve(s, { prov: id, kind, foe: B.foe, power: B.power, cost: B.cost + extra }, r < odds);
  out.odds = odds;
  return out;
}

// ---------- winning and losing ----------
export function nationScore(s, who) {
  const land = ownedBy(s, who);
  const r = realm(s, who);
  if (!r || (who !== 'you' && !r.alive)) return 0;
  return land.length * 5 + land.reduce((a, p) => a + p.dev, 0) * 2 + (r.techs?.length || 0) * 4 + wondersOf(s, who).length * 25 + Math.floor((r.gold || 0) / 50) + (who === 'you' ? s.stats.won * 2 : Math.floor((r.army || 0)))
    + (r.techs?.includes('ascendancy') ? 100 : 0);
}
export function standings(s) {
  return [{ who: 'you', score: nationScore(s, 'you') }, ...alive(s).map((f) => ({ who: f.id, score: nationScore(s, f.id) }))].sort((a, b) => b.score - a.score);
}

function end(s, won, how, by = 'you') {
  if (s.over) return;
  const D = DIFFICULTIES[s.diff];
  const base = nationScore(s, 'you') + s.stats.won * 10 + s.stats.held * 6;
  const bonus = won ? 300 + Math.max(0, (s.turnLimit || 80) - s.turn) * 6 : 0;
  s.over = { won, how, by, turn: s.turn, score: Math.round((base + bonus) * D.score) };
  const V = VICTORIES[how];
  note(s, won ? `${V.icon} ${V.name} victory on turn ${s.turn}!` : how === 'capital' ? 'Your capital has fallen. The war is lost.' : `${lordName(by)} wins the ${V?.name || ''} victory on turn ${s.turn}. The age is theirs.`, 'big');
}

function checkOver(s, out = null) {
  if (s.over) return;
  if (!s.provs.some((p) => p.capital === 'you')) end(s, false, 'capital', 'you');
  else if (!s.factions.some((f) => f.alive)) end(s, true, 'conquest');
  if (out && s.over) out.over = s.over;
}

// Victories that are checked at the end of a turn (and science/prosperity the moment they happen).
function checkTurnVictories(s) {
  if (s.over) return;
  for (const f of alive(s)) {
    if (f.techs.includes('ascendancy')) return end(s, false, 'science', f.id);
    if (hasWonder(s, 'golden_throne', f.id)) return end(s, false, 'prosperity', f.id);
  }
  // Grand Alliance
  const live = alive(s);
  if (live.length && live.every((f) => f.stance === 'alliance') && yours(s).length >= Math.ceil(s.provs.length / 4)) {
    s.allianceRun = (s.allianceRun || 0) + 1;
    if (s.allianceRun >= DOMINION.allyTurns) return end(s, true, 'diplomacy');
  } else s.allianceRun = 0;
  if (s.turnLimit && s.turn > s.turnLimit) {
    const st = standings(s);
    if (st[0].who === 'you') end(s, true, 'score'); else end(s, false, 'score', st[0].who);
  }
}

// Victory progress for the Nations tab: how close you are to each way to win.
export function victoryProgress(s) {
  const live = alive(s);
  const t3 = s.techs.filter((t) => TECHS[t].tier === 3).length;
  return {
    conquest: { done: s.factions.length - live.length, of: s.factions.length },
    science: { have: has(s, 'ascendancy'), crown: has(s, 'crown'), t3, lore: s.lore, cost: techCost(s, 'ascendancy') },
    prosperity: { wonders: wondersOf(s).filter((w) => w !== 'golden_throne').length, banking: has(s, 'banking'), gold: s.gold, cost: wonderCost(s, 'golden_throne').gold },
    diplomacy: { allied: live.filter((f) => f.stance === 'alliance').length, of: live.length, run: s.allianceRun || 0, land: yours(s).length, need: Math.ceil(s.provs.length / 4) },
    score: { limit: s.turnLimit, turn: s.turn, rank: standings(s).findIndex((x) => x.who === 'you') + 1 },
  };
}

// ---------- orders that are not battles ----------
export function canBuild(s, id, b) {
  const p = s.provs[id], B = BUILDINGS[b];
  if (!B || !p || p.owner !== 'you') return 'Build only on your own land.';
  if (hasB(p, b)) return `${p.name} already has one.`;
  if (p.buildings.length >= slotsOf(p)) return `No free slot (development ${p.dev} gives ${slotsOf(p)}).`;
  if (B.needs && !has(s, B.needs) && !(b === 'harbor' && s.nation === 'river')) return `Needs ${TECHS[B.needs].name}.`;
  if (B.lands && !B.lands.includes(p.terrain)) return `Only on ${B.lands.map((t) => TERRAIN[t].name.toLowerCase()).join(' or ')}.`;
  if (s.orders < 1) return 'No orders left this turn.';
  if (s.gold < buildCost(s, b)) return `Needs ${buildCost(s, b)} gold.`;
  return null;
}
export function build(s, id, b) {
  const why = canBuild(s, id, b);
  if (why) return { error: why };
  const p = s.provs[id];
  s.gold -= buildCost(s, b); s.orders -= 1; p.buildings.push(b);
  note(s, `${BUILDINGS[b].name} raised in ${p.name}.`);
  return { ok: true };
}

export const developCost = (s, p) => Math.round(45 * p.dev * (policyOn(s, 'crown_lands') && p.capital === 'you' ? 0.8 : 1));
export function develop(s, id) {
  const p = s.provs[id];
  if (!p || p.owner !== 'you') return { error: 'Develop only your own land.' };
  if (p.dev >= 5) return { error: 'Fully developed.' };
  if (s.orders < 1) return { error: 'No orders left this turn.' };
  const c = developCost(s, p);
  if (s.gold < c) return { error: `Needs ${c} gold.` };
  s.gold -= c; s.orders -= 1; p.dev++; p.grow = 0;
  note(s, `${p.name} grows to development ${p.dev}.`);
  return { ok: true };
}

// Settle a weak free province without a fight: gold instead of blood.
export const settleCost = (s, p) => Math.round((50 + 35 * p.level) * (policyOn(s, 'expansionism') ? 0.8 : 1));
export function canSettle(s, id) {
  const p = s.provs[id];
  if (!p || p.owner) return 'Only free land can be settled.';
  if (!p.seen) return 'Scout it first.';
  if (p.level > DOMINION.settleMaxLevel) return `Too well defended to settle (strength ${p.level}). Take it by force.`;
  if (!neighbors(s, id).some((n) => s.provs[n].owner === 'you')) return 'It does not border your land.';
  if (s.orders < 1) return 'No orders left this turn.';
  if (s.gold < settleCost(s, p)) return `Needs ${settleCost(s, p)} gold.`;
  return null;
}
export function settle(s, id) {
  const why = canSettle(s, id);
  if (why) return { error: why };
  const p = s.provs[id];
  s.gold -= settleCost(s, p); s.orders -= 1; s.stats.settled++;
  takeProvince(s, p, 'you', 15);
  if (p.special === 'ruins') { s.gold += SPECIALS.ruins.loot.gold; s.lore += SPECIALS.ruins.loot.lore; p.special = null; }
  reveal(s);
  note(s, `Settlers raise a hall in ${p.name}.`, 'win');
  return { ok: true };
}

export function canResearch(s, t) {
  const T = TECHS[t];
  if (!T) return 'Unknown.';
  if (has(s, t)) return 'Known.';
  if (T.needs.some((n) => !has(s, n))) return `Needs ${T.needs.filter((n) => !has(s, n)).map((n) => TECHS[n].name).join(' and ')}.`;
  if (T.needsT3 && s.techs.filter((x) => TECHS[x].tier === 3).length < T.needsT3) return `Needs ${T.needsT3} third-tier techs.`;
  if (s.lore < techCost(s, t)) return `Needs ${techCost(s, t)} lore.`;
  return null;
}
// Research takes no order: lore is its own currency.
export function research(s, t) {
  const why = canResearch(s, t);
  if (why) return { error: why };
  s.lore -= techCost(s, t); s.techs.push(t);
  if (t === 'logistics' || t === 'crown') s.armies = (s.armies ?? 0) + 1;
  if (t === 'laws' || t === 'banking') s.orders += 1;
  if (t === 'cartography') reveal(s);
  note(s, `Your scholars master ${TECHS[t].name}.`, t === 'ascendancy' ? 'big' : '');
  if (t === 'ascendancy') end(s, true, 'science');
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
export const musterSize = (s) => 2 + Math.ceil(yours(s).length / 2);
export function muster(s) {
  if (s.orders < 1) return { error: 'No orders left this turn.' };
  const n = musterSize(s);
  s.orders -= 1; s.levy += n;
  note(s, `You call the banners: +${n} levies.`);
  return { ok: true, levy: n };
}

export function setTax(s, level) {
  if (!TAX[level]) return { error: 'Unknown tax.' };
  s.tax = level;
  return { ok: true };
}

export function adoptPolicy(s, id) {
  if (!POLICIES[id]) return { error: 'Unknown policy.' };
  if (policyOn(s, id)) return { error: 'Already in force.' };
  if (s.policies.length >= policySlots(s)) return { error: 'No free policy slot. Repeal one first.' };
  if (s.policyTurn === s.turn) return { error: 'One new policy a turn.' };
  if (s.gold < POLICY_COST) return { error: `Needs ${POLICY_COST} gold.` };
  s.gold -= POLICY_COST; s.policies.push(id); s.policyTurn = s.turn;
  note(s, `The crown decrees ${POLICIES[id].name}.`);
  return { ok: true };
}
export function repealPolicy(s, id) {
  if (!policyOn(s, id)) return { error: 'Not in force.' };
  s.policies = s.policies.filter((x) => x !== id);
  note(s, `${POLICIES[id].name} is repealed.`);
  return { ok: true };
}

// The exchange: buy levies or lore with gold, or sell levies. Prices climb with each deal in a turn.
export function marketPrices(s) {
  const m = s.market.turn === s.turn ? s.market : { turn: s.turn, levy: 0, lore: 0, sold: 0 };
  const season = seasonOf(s.turn).id;
  return {
    levy: 40 + 12 * m.levy + (season === 'winter' ? 10 : season === 'autumn' ? -10 : 0),
    lore: 60 + 18 * m.lore,
    sell: Math.max(10, 25 - 5 * (m.sold || 0)),
  };
}
export function trade5(s, what) {
  const price = marketPrices(s);
  if (s.market.turn !== s.turn) s.market = { turn: s.turn, levy: 0, lore: 0, sold: 0 };
  if (what === 'sell') {
    if (s.levy < 5) return { error: 'Needs 5 levies.' };
    s.levy -= 5; s.gold += price.sell; s.market.sold = (s.market.sold || 0) + 1;
    return { ok: true, gold: price.sell };
  }
  if (!['levy', 'lore'].includes(what)) return { error: 'Nothing to buy.' };
  if (s.gold < price[what]) return { error: `Needs ${price[what]} gold.` };
  s.gold -= price[what]; s[what] += 5; s.market[what]++;
  return { ok: true, gold: -price[what] };
}

export function canRaise(s, w, provId) {
  const W = WONDERS[w], p = s.provs[provId];
  if (!W) return 'Unknown wonder.';
  if (s.wonders[w]) return s.wonders[w].owner === 'you' ? 'Yours already.' : `${lordName(s.wonders[w].owner)} raised it first.`;
  if (!has(s, W.needs)) return `Needs ${TECHS[W.needs].name}.`;
  if (W.needsWonders && wondersOf(s).length < W.needsWonders) return `Needs ${W.needsWonders} other Wonders.`;
  if (!p || p.owner !== 'you') return 'Raise it in one of your provinces.';
  if (W.lands && !W.lands.includes(p.terrain)) return `Only on ${W.lands.map((t) => TERRAIN[t].name.toLowerCase()).join(' or ')}.`;
  if (s.orders < 1) return 'No orders left this turn.';
  const c = wonderCost(s, w, p);
  if (s.gold < c.gold || s.lore < c.lore) return `Needs ${c.gold} gold${c.lore ? ` and ${c.lore} lore` : ''}.`;
  return null;
}
// The best province of yours to raise a wonder in (an Ancient Site if there is one, else your capital, else any that fits).
export function wonderSite(s, w) {
  const W = WONDERS[w];
  const ok = yours(s).filter((p) => !W.lands || W.lands.includes(p.terrain));
  return ok.find((p) => p.special === 'ancient') || ok.find((p) => p.capital === 'you') || ok[0] || null;
}
export function raiseWonder(s, w, provId = wonderSite(s, w)?.id) {
  const why = canRaise(s, w, provId);
  if (why) return { error: why };
  const p = s.provs[provId], c = wonderCost(s, w, p);
  s.gold -= c.gold; s.lore -= c.lore; s.orders -= 1;
  s.wonders[w] = { owner: 'you', prov: p.id, turn: s.turn };
  if (w === 'observatory') reveal(s);
  if (w === 'war_academy') s.armies += 1;
  note(s, `${WONDERS[w].icon} The ${WONDERS[w].name} rises in ${p.name}!`, 'big');
  if (w === 'golden_throne') end(s, true, 'prosperity');
  return { ok: true };
}

// ---------- diplomacy ----------
const diploUsed = (s, fid) => s.diplo[fid] === s.turn;
const diploRoll = (s, fid, what) => new Rng(seedFor(s.seed, 'diplo', s.turn, fid, what)).next();
function relate(s, f, d) { f.relation = Math.max(-100, Math.min(100, Math.round(f.relation + d))); }

export function canDiplo(s, fid) {
  const f = factionOf(s, fid);
  if (!f || !f.alive) return 'They are no more.';
  if (!met(s, fid)) return 'You have not met them yet.';
  if (diploUsed(s, fid)) return 'Their envoys will hear you again next turn.';
  return null;
}
export const peaceOdds = (s, f, gold = 0) => Math.max(0.05, Math.min(0.95, 0.2 + 0.12 * f.warScore + f.relation / 150 + (gold ? 0.25 : 0) + (has(s, 'statecraft') ? 0.15 : 0) - 0.25 * traitsOf(f.id).agg + (s.turn - f.since >= 6 ? 0.1 : 0)));
export const tradeOdds = (s, f) => Math.max(0, Math.min(0.95, 0.35 + f.relation / 100 + 0.3 * traitsOf(f.id).trade));
export const allyOdds = (s, f) => (f.relation < 35 ? 0 : Math.max(0, Math.min(0.9, (f.relation - 25) / 60 + 0.2 - 0.2 * traitsOf(f.id).agg + (has(s, 'statecraft') ? 0.1 : 0))));
export const GIFT = 60;

export function declareWar(s, fid) {
  const f = factionOf(s, fid);
  if (!f || !f.alive) return { error: 'They are no more.' };
  if (f.stance === 'war') return { error: 'You are already at war.' };
  const broke = f.stance === 'alliance' || f.treaty > s.turn;
  f.stance = 'war'; f.trade = false; f.since = s.turn; f.warScore = 0;
  relate(s, f, -50 - (broke ? 30 : 0));
  for (const o of alive(s)) if (o !== f) relate(s, o, s.rivalWars.some((w) => w.includes(o.id) && w.includes(f.id)) ? 10 : broke ? -20 : -8);
  s.diplo[fid] = s.turn;
  note(s, `You declare war on ${lordName(fid)}${broke ? ', breaking your oath' : ''}.`, 'threat');
  return { ok: true };
}
export function offerPeace(s, fid, gold = 0) {
  const why = canDiplo(s, fid); if (why) return { error: why };
  const f = factionOf(s, fid);
  if (f.stance !== 'war') return { error: 'You are not at war.' };
  if (gold && s.gold < gold) return { error: `Needs ${gold} gold.` };
  s.diplo[fid] = s.turn;
  const odds = peaceOdds(s, f, gold);
  if (diploRoll(s, fid, 'peace') < odds) {
    s.gold -= gold; makePeace(s, f);
    note(s, `${lordName(fid)} accepts peace${gold ? ` (and ${gold} gold)` : ''}.`, 'win');
    return { ok: true, accepted: true, odds };
  }
  relate(s, f, -3);
  note(s, `${lordName(fid)} refuses peace.`);
  return { ok: true, accepted: false, odds };
}
function makePeace(s, f) {
  f.stance = 'peace'; f.treaty = s.turn + DOMINION.treatyTurns; f.since = s.turn; f.warScore = 0;
  relate(s, f, 15);
  if (s.threat && s.threat.faction === f.id) s.threat = null;
}
export function proposeTrade(s, fid) {
  const why = canDiplo(s, fid); if (why) return { error: why };
  const f = factionOf(s, fid);
  if (f.stance === 'war') return { error: 'Not while at war.' };
  if (f.trade) return { error: 'You already trade.' };
  s.diplo[fid] = s.turn;
  const odds = tradeOdds(s, f);
  if (diploRoll(s, fid, 'trade') < odds) { f.trade = true; relate(s, f, 5); note(s, `A trade agreement with ${lordName(fid)}: +${tradeValue(s)} gold a turn.`, 'win'); return { ok: true, accepted: true, odds }; }
  note(s, `${lordName(fid)} will not trade with you yet.`);
  return { ok: true, accepted: false, odds };
}
export function proposeAlliance(s, fid) {
  const why = canDiplo(s, fid); if (why) return { error: why };
  const f = factionOf(s, fid);
  if (f.stance !== 'peace') return { error: f.stance === 'war' ? 'Make peace first.' : 'You are already allies.' };
  s.diplo[fid] = s.turn;
  const odds = allyOdds(s, f);
  if (odds > 0 && diploRoll(s, fid, 'ally') < odds) { f.stance = 'alliance'; f.since = s.turn; relate(s, f, 10); reveal(s); note(s, `An alliance with ${lordName(fid)}! Their maps are yours.`, 'big'); return { ok: true, accepted: true, odds }; }
  note(s, `${lordName(fid)} is not ready for an alliance.`);
  return { ok: true, accepted: false, odds };
}
export function sendGift(s, fid) {
  const why = canDiplo(s, fid); if (why) return { error: why };
  const f = factionOf(s, fid);
  if (s.gold < GIFT) return { error: `Needs ${GIFT} gold.` };
  s.gold -= GIFT; s.diplo[fid] = s.turn;
  relate(s, f, 10 + 8 * traitsOf(fid).trade);
  if (f.stance === 'war') f.warScore += 0.5;
  note(s, `You send ${GIFT} gold to ${lordName(fid)}.`);
  return { ok: true };
}
export function cancelTrade(s, fid) {
  const f = factionOf(s, fid);
  if (!f?.trade) return { error: 'No agreement.' };
  f.trade = false; relate(s, f, -10);
  return { ok: true };
}
// Envoys rivals send you: peace, trade, alliance offers and tribute demands. Answer before the turn ends.
export function answerEnvoy(s, idx, yes) {
  const e = s.envoys[idx];
  if (!e) return { error: 'That envoy has left.' };
  const f = factionOf(s, e.from);
  s.envoys.splice(idx, 1);
  if (!f || !f.alive) return { ok: true };
  if (!yes) {
    relate(s, f, e.kind === 'tribute' ? -20 : -4);
    if (e.kind === 'tribute' && f.stance !== 'war' && traitsOf(f.id).agg > 0.5) { f.stance = 'war'; f.trade = false; f.since = s.turn; f.warScore = 0; note(s, `You refused ${lordName(f.id)}'s demand. They declare war!`, 'threat'); }
    return { ok: true };
  }
  if (e.kind === 'peace') { makePeace(s, f); note(s, `Peace with ${lordName(f.id)}.`, 'win'); }
  else if (e.kind === 'trade') { if (f.stance === 'war') return { error: 'Not while at war.' }; f.trade = true; relate(s, f, 5); note(s, `A trade agreement with ${lordName(f.id)}.`, 'win'); }
  else if (e.kind === 'alliance') { if (f.stance !== 'peace') return { error: 'Not now.' }; f.stance = 'alliance'; f.since = s.turn; reveal(s); note(s, `An alliance with ${lordName(f.id)}!`, 'big'); }
  else if (e.kind === 'tribute') {
    if (s.gold < e.gold) { s.envoys.splice(idx, 0, e); return { error: `Needs ${e.gold} gold.` }; }
    s.gold -= e.gold; relate(s, f, 15); f.gold += e.gold; note(s, `You pay ${lordName(f.id)} ${e.gold} gold in tribute.`);
  } else if (e.kind === 'joinwar') {
    const t = factionOf(s, e.target);
    if (t && t.alive && t.stance !== 'war') { declareWar(s, t.id); relate(s, f, 15); }
  }
  return { ok: true };
}

// ---------- the turn ----------
const EVENTS = [
  { id: 'caravan', w: 3, text: 'A merchant caravan pays its tolls: +{n} gold.', fx: (s, r) => { const n = r.int(30, 60); s.gold += n; return n; } },
  { id: 'scholars', w: 2, text: 'Wandering scholars settle in your libraries: +{n} lore.', fx: (s, r) => { const n = r.int(3, 6); s.lore += n; return n; } },
  { id: 'volunteers', w: 2, text: 'Volunteers flock to your banner: +{n} levies.', fx: (s, r) => { const n = r.int(2, 4); s.levy += n; return n; } },
  { id: 'fever', w: 1, text: 'Camp fever: -{n} levies.', fx: (s, r) => { const n = Math.min(s.levy, r.int(1, 3)); s.levy -= n; return n; } },
  { id: 'rising', w: 1, text: 'Free folk arm themselves in {p}: it grows harder to take.', fx: (s, r) => { const free = s.provs.filter((p) => !p.owner && p.seen); if (!free.length) return 0; const p = r.pick(free); p.level = Math.min(5, p.level + 1); return p.name; } },
  { id: 'wildfire', w: 1, text: 'Wildfire sweeps {p}: the forest is ash, and its battlefield changes with it.', fx: (s, r) => { const f = s.provs.filter((p) => p.terrain === 'forest' && !p.capital); if (!f.length) return 0; const p = r.pick(f); p.terrain = 'ash'; p.map = r.pick(TERRAIN.ash.maps); if (p.res === 'timber') p.res = null; return p.name; } },
  { id: 'flood', w: 1, text: 'The river floods {p}: its fields are drowned, and it becomes marsh.', fx: (s, r) => { const f = s.provs.filter((p) => p.terrain === 'river' && !p.capital); if (!f.length) return 0; const p = r.pick(f); p.terrain = 'marsh'; p.map = r.pick(TERRAIN.marsh.maps); p.dev = Math.max(1, p.dev - 1); return p.name; } },
  { id: 'strike', w: 2, text: 'Prospectors strike {p}!', fx: (s, r) => { const f = s.provs.filter((p) => !p.res && p.seen && Object.values(RESOURCES).some((R) => R.lands.includes(p.terrain))); if (!f.length) return 0; const p = r.pick(f); p.res = r.pick(Object.entries(RESOURCES).filter(([, R]) => R.lands.includes(p.terrain)).map(([k]) => k)); return `${p.name}: ${RESOURCES[p.res].name}`; } },
  { id: 'boom', w: 2, text: 'A trade boom in {p}: it grows.', fx: (s, r) => { const f = yours(s).filter((p) => p.dev < 5); if (!f.length) return 0; const p = r.pick(f); p.dev++; return p.name; } },
  { id: 'comet', w: 1, text: 'A comet in the sky: +8 lore, and the common folk grow uneasy.', fx: (s) => { s.lore += 8; for (const p of yours(s)) p.unrest = Math.min(100, p.unrest + 5); return 1; } },
  { id: 'bandits', w: 1, text: 'Bandits raid {p}.', fx: (s, r) => { const f = yours(s).filter((p) => !p.capital); if (!f.length) return 0; const p = r.pick(f); p.unrest = Math.min(100, p.unrest + 20); return p.name; } },
  { id: 'plague', w: 1, text: 'Plague in {p}: it shrinks.', fx: (s, r) => { const f = s.provs.filter((p) => p.dev > 1 && p.owner); if (!f.length) return 0; const p = r.pick(f); p.dev--; return p.name; } },
];

// Growth: every province grows toward its next development level; unrest stalls it.
export const growNeed = (p) => 6 + 6 * p.dev;
function growthOf(s, p, who) {
  if (who === 'you' && p.unrest >= DOMINION.unrestHalf) return 0;
  let g = 1 + (hasB(p, 'farm') ? 1 : 0) + (resourcesOf(s, who).has('grain') ? 1 : 0) + (seasonOf(s.turn).id === 'spring' ? 1 : 0)
    + (who && has(s, 'medicine', who) ? 1 : 0) + (who && hasWonder(s, 'hanging_gardens', who) ? 1 : 0) + (p.capital ? 1 : 0);
  if (who && has(s, 'husbandry', who) && p.terrain === 'plains') g += 1;
  return g;
}
// Unrest drift for one of your provinces this turn.
export function unrestDrift(s, p) {
  let d = -6 + (TAX[s.tax]?.unrest || 0);
  if (hasB(p, 'temple')) d += BUILDINGS.temple.unrest - (has(s, 'laws') ? 4 : 0);
  if (p.special === 'shrine') d += SPECIALS.shrine.unrest;
  if (policyOn(s, 'conscription')) d += 3;
  if (policyOn(s, 'martial_law')) d -= 6;
  if (policyOn(s, 'crown_lands') && p.capital !== 'you') d += 2;
  if (hasWonder(s, 'hanging_gardens')) d -= 3;
  const wars = alive(s).filter((f) => f.stance === 'war').length;
  if (wars > 1) d += 2 * (wars - 1);
  if (p.capital === 'you') d -= 5;
  return d;
}

export function recomputeMight(s, f) {
  const n = ownedBy(s, f.id).length;
  f.might = 1 + Math.floor(n / 3) + f.techs.filter((t) => TECHS[t].mil).length + Math.floor(f.army) + (hasWonder(s, 'war_academy', f.id) ? 1 : 0);
}

// One rival's turn: income, building, research, wonders, army, expansion.
function rivalEconomy(s, f, rng) {
  const T = traitsOf(f.id), D = DIFFICULTIES[s.diff];
  const inc = income(s, f.id);
  f.gold += inc.gold; f.lore += inc.lore;
  const mine = ownedBy(s, f.id);
  for (const p of mine) { p.grow += growthOf(s, p, f.id); if (p.grow >= growNeed(p) && p.dev < 5) { p.dev++; p.grow = 0; } }
  // Research: scholars race for Ascendancy, the rest favour war or wealth.
  const open = TECH_ORDER.filter((t) => !f.techs.includes(t) && TECHS[t].needs.every((n) => f.techs.includes(n)) && (!TECHS[t].needsT3 || f.techs.filter((x) => TECHS[x].tier === 3).length >= TECHS[t].needsT3));
  if (open.length) {
    const want = (t) => (t === 'ascendancy' ? 10 * T.sci : 0) + (TECHS[t].mil ? T.agg : 0) + (['coinage', 'banking', 'sailing'].includes(t) ? T.trade : 0) + (['scholarship', 'cartography', 'crown', 'arcana', 'engineering', 'logistics'].includes(t) ? T.sci : 0) + rng.next() * 0.5;
    const pick = open.sort((a, b) => want(b) - want(a))[0];
    if (f.lore >= techCost(s, pick, f.id)) { f.lore -= techCost(s, pick, f.id); f.techs.push(pick); if (pick === 'ascendancy') note(s, `${lordName(f.id)} masters Ascendancy!`, 'big'); else if (TECHS[pick].tier >= 3 && met(s, f.id)) note(s, `${lordName(f.id)} masters ${TECHS[pick].name}.`, 'move'); }
  }
  // Wonders: builders and merchants race you for them.
  for (const w of WONDER_ORDER) {
    const W = WONDERS[w];
    if (s.wonders[w] || !f.techs.includes(W.needs)) continue;
    if (W.needsWonders && wondersOf(s, f.id).length < W.needsWonders) continue;
    const site = mine.find((p) => !W.lands || W.lands.includes(p.terrain));
    if (!site) continue;
    const c = wonderCost(s, w, site);
    const keen = w === 'golden_throne' ? T.trade : T.build;
    if (f.gold >= c.gold + 40 && f.lore >= c.lore && rng.chance(0.25 + 0.5 * keen)) {
      f.gold -= c.gold; f.lore -= c.lore; s.wonders[w] = { owner: f.id, prov: site.id, turn: s.turn };
      note(s, `${W.icon} ${lordName(f.id)} raises the ${W.name}${met(s, f.id) ? ` in ${site.name}` : ''}.`, w === 'golden_throne' ? 'big' : 'move');
      break;
    }
  }
  // Buildings
  if (rng.chance(0.4 + 0.5 * T.build)) {
    const order = T.sci > 0.7 ? ['library', 'academy', 'market', 'farm', 'fort'] : T.trade > 0.7 ? ['market', 'bank', 'harbor', 'library', 'farm'] : T.agg > 0.7 ? ['barracks', 'fort', 'farm', 'market'] : ['market', 'library', 'farm', 'fort', 'workshop'];
    for (const b of order) {
      const B = BUILDINGS[b];
      if (B.needs && !f.techs.includes(B.needs)) continue;
      const p = mine.find((x) => !hasB(x, b) && x.buildings.length < slotsOf(x) && (!B.lands || B.lands.includes(x.terrain)));
      if (p && f.gold >= buildCost(s, b, f.id) + 30) { f.gold -= buildCost(s, b, f.id); p.buildings.push(b); break; }
    }
  }
  // Army: the warlike turn spare gold into might (the merchants save for the Throne).
  const reserve = T.trade > 0.7 && f.techs.includes('banking') ? 900 : 60;
  const armyCost = 30 + 12 * f.army;
  if (f.gold > reserve + armyCost && rng.chance(0.3 + 0.6 * T.agg)) { f.gold -= armyCost; f.army += 1; }
  f.army = Math.min(f.army, 6 + Math.floor(s.turn / 6));
  recomputeMight(s, f);
  // Expansion into free land.
  const free = borders(s, f.id).map((id) => s.provs[id]).filter((p) => !p.owner && p.level <= f.might + 1);
  if (free.length && rng.chance((0.25 + 0.4 * T.exp) * D.ai)) {
    const p = rng.pick(free); takeProvince(s, p, f.id);
    if (p.seen) note(s, `${lordName(f.id)} takes ${p.name}.`, 'move');
  }
}

// Wars between rivals: they start, rage and end on their own; the strong carve up the weak.
function rivalWars(s, rng) {
  const live = alive(s);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    const at = s.rivalWars.findIndex((w) => w.includes(a.id) && w.includes(b.id));
    if (!bordering(s, a.id, b.id)) { if (at >= 0) s.rivalWars.splice(at, 1); continue; }
    if (at < 0) {
      if (rng.chance(0.05 * (traitsOf(a.id).agg + traitsOf(b.id).agg))) { s.rivalWars.push([a.id, b.id]); if (met(s, a.id) || met(s, b.id)) note(s, `${lordName(a.id)} and ${lordName(b.id)} go to war.`, 'move'); }
    } else if (rng.chance(0.12)) { s.rivalWars.splice(at, 1); if (met(s, a.id) || met(s, b.id)) note(s, `${lordName(a.id)} and ${lordName(b.id)} make peace.`, 'move'); }
  }
  for (const [x, y] of [...s.rivalWars]) {
    for (const [a, b] of [[x, y], [y, x]]) {
      const A = factionOf(s, a), B = factionOf(s, b);
      if (!A?.alive || !B?.alive || !rng.chance(0.3)) continue;
      const targets = borders(s, a).map((id) => s.provs[id]).filter((p) => p.owner === b);
      if (!targets.length) continue;
      const p = rng.pick(targets);
      if (A.might + rng.int(0, 3) > B.might + rng.int(0, 3) + provPower(s, p, a) / 3) {
        if (p.capital === b) {
          if (A.might >= B.might + 3) { takeProvince(s, p, a); breakFaction(s, B, a); note(s, `${lordName(a)} storms ${p.seen ? p.name : 'the capital'} of ${lordName(b)}. ${lordName(b)} is no more.`, 'big'); }
        } else { takeProvince(s, p, a); if (p.seen) note(s, `${lordName(a)} seizes ${p.name} from ${lordName(b)}.`, 'move'); }
      }
    }
  }
}

// How a rival feels about you, and what it does about it.
function rivalDiplomacy(s, f, rng, report) {
  const T = traitsOf(f.id), D = DIFFICULTIES[s.diff];
  const st = standings(s);
  const leader = st[0].who === 'you' && st.length > 1 && st[0].score > st[1].score * 1.3;
  let target = (f.trade ? 25 : 0) + (f.stance === 'peace' && s.turn - f.since >= 10 ? 10 : 0);
  if (f.stance === 'alliance') target = 50;
  if (f.stance === 'war') target = -40;
  if (leader) target -= 15 * T.agg;
  if (s.rivalWars.some((w) => w.includes(f.id) && alive(s).some((o) => o.stance === 'war' && w.includes(o.id)))) target += 10;   // a common enemy
  f.relation += Math.sign(target - f.relation) * Math.min(3, Math.abs(target - f.relation));
  if (has(s, 'statecraft')) f.relation += 1;
  if (f.trade && policyOn(s, 'free_trade')) f.relation += 1;
  f.relation = Math.max(-100, Math.min(100, Math.round(f.relation)));
  if (!met(s, f.id)) return;
  const season = seasonOf(s.turn).id, mood = season === 'summer' ? 1.2 : season === 'winter' ? 0.6 : 1;
  const myStrength = armyQuality(s) + Math.floor(yours(s).length / 3);
  // War on you
  if (f.stance === 'peace' && f.treaty <= s.turn && s.turn >= DOMINION.threatFrom - 1 && bordering(s, f.id, 'you')) {
    const p = (f.relation < -25 ? 0.12 : f.relation < 0 ? 0.04 : 0) * T.agg * D.ai * mood * (f.might > myStrength ? 1.5 : 1);
    if (rng.chance(p)) { f.stance = 'war'; f.trade = false; f.since = s.turn; f.warScore = 0; note(s, `${lordName(f.id)} declares war on you!`, 'threat'); report.wars.push(f.id); }
  }
  if (s.envoys.some((e) => e.from === f.id)) return;
  // Envoys
  if (f.stance === 'war' && s.turn - f.since >= 5 && rng.chance(0.1 + 0.08 * Math.max(0, f.warScore) + (f.relation > -30 ? 0.1 : 0))) s.envoys.push({ from: f.id, kind: 'peace', turn: s.turn });
  else if (f.stance !== 'war' && !f.trade && f.relation > 10 && rng.chance(0.08 + 0.15 * T.trade)) s.envoys.push({ from: f.id, kind: 'trade', turn: s.turn });
  else if (f.stance === 'peace' && f.relation > 50 && rng.chance(0.1)) s.envoys.push({ from: f.id, kind: 'alliance', turn: s.turn });
  else if (f.stance === 'peace' && T.agg > 0.6 && f.might > myStrength * 1.4 && rng.chance(0.08)) s.envoys.push({ from: f.id, kind: 'tribute', gold: 40 + 15 * f.might, turn: s.turn });
  else if (f.stance === 'alliance') {
    const foe = s.rivalWars.find((w) => w.includes(f.id));
    const other = foe && factionOf(s, foe[0] === f.id ? foe[1] : foe[0]);
    if (other && other.alive && other.stance !== 'war' && met(s, other.id) && rng.chance(0.15)) s.envoys.push({ from: f.id, kind: 'joinwar', target: other.id, turn: s.turn });
  }
}

// Allies fight your wars: now and then they take a province from a rival you are at war with.
function allyHelp(s, rng) {
  for (const a of alive(s).filter((f) => f.stance === 'alliance')) {
    for (const e of alive(s).filter((f) => f.stance === 'war')) {
      const t = borders(s, a.id).map((id) => s.provs[id]).filter((p) => p.owner === e.id && !p.capital);
      if (t.length && rng.chance(0.15) && a.might + rng.int(0, 2) > e.might) { const p = rng.pick(t); takeProvince(s, p, a.id); note(s, `Your ally ${lordName(a.id)} seizes ${p.name} from ${lordName(e.id)}.`, 'move'); }
    }
  }
}

// End the turn: income, growth and unrest, rivals act, events, attacks on you, victory. An unanswered attack is fought without you.
export function endTurn(s) {
  if (s.over || s.battle) return { error: s.battle ? 'Finish the battle first.' : 'The war is over.' };
  const report = { income: null, events: [], threat: null, forced: null, wars: [], revolts: [], grew: [] };
  if (s.threat) report.forced = autoResolve(s, s.threat.prov, 0, 'defend');
  if (s.over) return report;
  // Unanswered envoys leave (a refused demand is remembered).
  for (let i = s.envoys.length - 1; i >= 0; i--) if (s.envoys[i].turn < s.turn + 1) answerEnvoy(s, i, false);
  const inc = income(s);
  s.gold += inc.net; s.levy += inc.levy; s.lore += inc.lore;
  report.income = inc;
  if (s.gold < 0) {   // bankrupt: the unpaid desert and the land grumbles
    const lost = Math.min(s.levy, Math.ceil(-s.gold / 5));
    s.levy -= lost; s.gold = 0;
    for (const p of yours(s)) p.unrest = Math.min(100, p.unrest + 8);
    note(s, `The treasury is empty: ${lost} unpaid levies desert, and the land grumbles.`, 'loss');
  }
  if (s.levy > levyCap(s)) { report.disbanded = s.levy - levyCap(s); s.levy = levyCap(s); }
  const rng = new Rng(seedFor(s.seed, 'turn', s.turn));
  // Your provinces: grow, settle down (or rise).
  for (const p of yours(s)) {
    p.grow += growthOf(s, p, 'you');
    if (p.grow >= growNeed(p) && p.dev < 5) { p.dev++; p.grow = 0; report.grew.push(p.name); }
    p.unrest = Math.max(0, Math.min(100, p.unrest + unrestDrift(s, p)));
    if (p.unrest >= DOMINION.revolt && !p.capital && rng.chance(0.5)) {
      takeProvince(s, p, null); p.level = 2 + Math.floor(p.dev / 2); p.unrest = 0; s.stats.revolts++;
      report.revolts.push(p.name); note(s, `${p.name} rises in revolt and throws off your rule!`, 'loss');
    }
  }
  s.turn++;
  s.orders = ordersPerTurn(s);
  s.armies = armiesPerTurn(s);
  s.threat = null;
  // Rivals
  for (const f of alive(s)) { rivalEconomy(s, f, rng); rivalDiplomacy(s, f, rng, report); }
  rivalWars(s, rng);
  allyHelp(s, rng);
  // One attack on you a turn, at most, from a rival at war with you.
  if (s.turn >= DOMINION.threatFrom) {
    const D = DIFFICULTIES[s.diff], season = seasonOf(s.turn).id;
    const options = [];
    for (const f of alive(s)) {
      if (f.stance !== 'war') continue;
      for (const id of borders(s, f.id)) {
        const p = s.provs[id];
        if (p.owner !== 'you') continue;
        const guard = (hasB(p, 'fort') ? 2 : 0) + (p.capital === 'you' ? 2 : 0) + (p.special === 'pass' ? 2 : 0);
        if (f.might + 1 >= guard) options.push({ f, p, guard });
      }
    }
    const chance = Math.min(0.65, (0.25 + 0.02 * s.turn) * D.ai * (season === 'summer' ? 1.25 : season === 'winter' ? 0.6 : 1));
    if (options.length && rng.chance(chance)) {
      const o = rng.pick(options);
      s.threat = { prov: o.p.id, faction: o.f.id, power: Math.max(1, o.f.might + 1 - Math.floor(o.guard / 2) + Math.floor((o.p.dev - 1) / 2)) };
      report.threat = s.threat;
      note(s, `${lordName(o.f.id)} marches on ${o.p.name}! Answer it this turn, or it is fought without you.`, 'threat');
    }
  }
  if (rng.chance(0.35)) {
    const total = EVENTS.reduce((a, e) => a + e.w, 0);
    let x = rng.next() * total, ev = EVENTS[0];
    for (const e of EVENTS) { if ((x -= e.w) < 0) { ev = e; break; } }
    const v = ev.fx(s, rng);
    if (v) { const text = ev.text.replace('{n}', v).replace('{p}', v); report.events.push(text); note(s, text, 'event'); }
  }
  if (seasonOf(s.turn) !== seasonOf(s.turn - 1)) note(s, `${seasonOf(s.turn).icon} ${seasonOf(s.turn).name} comes: ${seasonOf(s.turn).desc}`, 'event');
  reveal(s);
  checkOver(s);
  checkTurnVictories(s);
  return report;
}

// Give up the threatened province without a fight (keeps your levies).
export function yieldProvince(s) {
  if (!s.threat) return { error: 'No one is attacking.' };
  const p = s.provs[s.threat.prov];
  if (p.capital === 'you') return { error: 'You cannot yield your capital.' };
  const f = factionOf(s, s.threat.faction);
  takeProvince(s, p, f.id);
  s.threat = null; s.stats.lost++; f.warScore--;
  note(s, `You pulled back from ${p.name}; ${lordName(f.id)} takes it unopposed.`, 'loss');
  reveal(s); checkOver(s);
  return { ok: true };
}

// A loaded campaign might come from an older version: bring it up to date so it never breaks the screen.
export function cleanCampaign(s) {
  if (!s || !Array.isArray(s.provs) || !Array.isArray(s.factions)) return null;
  if (s.v === 1) {
    // v1.49.0 campaigns: one building, no development, everyone at war. Keep the war going under the new rules.
    s.size = 'small'; s.nation = s.nation || 'highland'; s.turnLimit = 0;
    s.policies = []; s.tax = 'normal'; s.wonders = {}; s.envoys = []; s.diplo = {}; s.market = { turn: s.turn, levy: 0, lore: 0 }; s.policyTurn = 0; s.armies = 1;
    s.rivalWars = []; s.allianceRun = 0;
    for (const p of s.provs) { p.buildings = p.building ? [p.building === 'market' || BUILDINGS[p.building] ? p.building : 'market'] : []; delete p.building; p.dev = p.capital ? 3 : 1; p.grow = 0; p.unrest = 0; if (p.special === 'mine') p.special = 'goldmine'; if (p.special === 'horses') { p.special = null; p.res = 'horses'; } p.res ||= null; }
    for (const f of s.factions) Object.assign(f, { nation: traitsOf(f.id).nation, gold: 80, lore: 0, techs: [], army: Math.max(0, f.might - 2), stance: f.alive ? 'war' : 'peace', relation: -40, treaty: 0, trade: false, warScore: 0, since: 1 }, { truce: undefined });
    s.v = 2;
  }
  if (s.v !== 2) return null;
  s.techs = (s.techs || []).filter((t) => TECHS[t]);
  s.policies = (s.policies || []).filter((x) => POLICIES[x]);
  s.log ||= []; s.envoys ||= []; s.diplo ||= {}; s.wonders ||= {}; s.rivalWars ||= [];
  s.market ||= { turn: s.turn, levy: 0, lore: 0 };
  if (s.armies == null) s.armies = armiesPerTurn(s);
  s.stats = { won: 0, lost: 0, auto: 0, taken: 0, held: 0, razed: 0, settled: 0, revolts: 0, ...(s.stats || {}) };
  return s;
}
