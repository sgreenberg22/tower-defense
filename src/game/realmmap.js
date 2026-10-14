// The Map of Aldermere: the Realm's territory, shared by the server (authoritative count) and the client (drawing,
// blessings, marches). Pure and deterministic: the provinces, their order of conquest and their gifts are fixed, so the
// server only has to store how many provinces the Realm holds.
//
// How the border moves (resolved by the server when each task closes):
//   Daily Rally      won +1 province · missed −1
//   Weekly Muster    Legend (150%) +3 · Victory (100%) +2 · 50–99% holds · under 50% −2
//   Monthly Campaign Legend +6 · Victory +4 · 50–99% holds · under 50% −4
// Gains past the last province become Bulwark (up to 6), which soaks up later losses. The heartland never falls.
import { Rng } from '../core/rng.js';
import { ENEMIES, TOWERS, TROOPS } from '../data/balance.js';

export const MAP_W = 1000, MAP_H = 700;
export const CENTER = { x: 500, y: 360 };

export const TERRITORY = {
  start: 6,        // capital + the heartland ring
  floor: 3,        // the capital and its nearest two never fall
  bulwarkMax: 6,
  day: { win: 1, miss: -1 },
  week: { legend: 3, victory: 2, hold: 0, fail: -2 },
  month: { legend: 6, victory: 4, hold: 0, fail: -4 },
  catchUp: { day: 14, week: 4, month: 2 },   // missed periods older than this are skipped (no effect)
  marchRally: 2,   // kills in a March count this many times toward the Daily Rally
  marchWeather: 6, // a March brings the land's weather from this wave
};

export const TERRAINS = {
  heartland: { name: 'Heartland', biome: 'meadow', battlefield: 'meadow', ink: '#7d8a3f', wash: '#c9cf8f',
    foes: ['grunt', 'runner', 'shield', 'archer'], blurb: 'Farms and mills around the capital. Bread for the army, coin for the treasury.',
    perks: [{ startGold: 20 }, { killGold: 0.02 }, { castleHpMult: 0.04 }, { waveGold: 0.05 }, { towerDiscount: 0.015 }, { repairDiscount: 0.05 }] },
  forest: { name: 'Greenwood', biome: 'meadow', battlefield: 'twin', ink: '#3f6b35', wash: '#a9c48a',
    foes: ['archer', 'harpy', 'sapper', 'skirmisher'], blurb: 'Old woods where the bowyers cut their staves and the rangers keep watch.',
    perks: [{ train_archer: 0.05 }, { troop_bowman: 0.08 }, { train_ballista: 0.05 }, { lootBonus: 0.06 }, { troop_footman: 0.08 }] },
  coast: { name: 'Coast', biome: 'meadow', battlefield: 'twin', ink: '#3a6f86', wash: '#a8c8c9',
    foes: ['harpy', 'wyvern', 'thief', 'skirmisher'], blurb: 'Harbors and watchtowers. The sea brings trade, and things with wings.',
    perks: [{ train_flak: 0.05 }, { airDmg: 0.03 }, { train_mage: 0.05 }, { troop_crossbow: 0.08 }, { killGold: 0.02 }] },
  hills: { name: 'Highlands', biome: 'meadow', battlefield: 'cross', ink: '#7a6648', wash: '#cdb98f',
    foes: ['shield', 'ogre', 'ram', 'cavalry', 'golem'], blurb: 'Quarries and foundries. Cannon, catapult and pike come from these hills.',
    perks: [{ train_cannon: 0.05 }, { troop_pikeman: 0.08 }, { train_catapult: 0.05 }, { armoredDmg: 0.03 }, { wallHpMult: 0.04 }] },
  frost: { name: 'Frostlands', biome: 'frost', battlefield: 'spine', ink: '#5d7f9a', wash: '#d4e3ec',
    foes: ['wyvern', 'gargoyle', 'golem', 'dread'], blurb: 'White peaks and long nights. The knights of the north hold the passes.',
    perks: [{ troop_knight: 0.08 }, { train_tesla: 0.05 }, { wallHpMult: 0.05 }, { train_banner: 0.05 }, { towerHpMult: 0.04 }] },
  ash: { name: 'Ashlands', biome: 'ash', battlefield: 'coil', ink: '#8a3d2a', wash: '#cf9f86',
    foes: ['bomber', 'warlock', 'burrower', 'dread'], blurb: 'Smoking vents and black glass. Fire-priests and siege engineers work here.',
    perks: [{ train_firetrap: 0.06 }, { train_obelisk: 0.05 }, { bossDmg: 0.03 }, { train_trebuchet: 0.05 }, { troop_griffon: 0.08 }] },
  dunes: { name: 'Dunes', biome: 'dunes', battlefield: 'cross', ink: '#a07a33', wash: '#e8cf93',
    foes: ['cavalry', 'runner', 'thief', 'burrower', 'skirmisher'], blurb: 'Caravan roads and salt pans. Riders, gold and gunpowder.',
    perks: [{ troop_cavalry: 0.08 }, { train_gatling: 0.05 }, { weaponDmg: 0.04 }, { killGold: 0.02 }, { startGold: 20 }] },
  fen: { name: 'Shadowfen', biome: 'shadow', battlefield: 'bog', ink: '#4b4a6b', wash: '#a7a5c2',
    foes: ['troll', 'brood', 'healer', 'wraith', 'warlock'], blurb: 'Mist, mire and witch-lights. Healers and poisoners learn their craft in the fens.',
    perks: [{ train_venom: 0.05 }, { troop_cleric: 0.08 }, { train_voidwell: 0.05 }, { troopHp: 0.04 }, { troopDmg: 0.04 }] },
};

const NAMES = {
  heartland: ['Millbrook', 'Kingsford', 'Hearthwold', 'Barrowby', 'Wheatmere', 'Oldmill'],
  forest: ['Oakenshade', 'Elderwood', 'Greenhollow', 'Briarwatch', 'Mossvale', "Hunter's Rest", 'Fernleigh', 'Thornwood'],
  coast: ['Gullhaven', 'Driftwood Bay', 'Seawatch', 'Tidebreak', "Wrecker's Point", 'Coralmouth', 'Saltquay', 'Stormharbour'],
  hills: ['Stonereach', 'Highcairn', 'Ironbrow', 'Granite Downs', 'Cragmoor', 'Hammerdale', 'Thornhill', 'Flintmoor'],
  frost: ['Hoarfell', 'Rimeholt', 'Glacierwatch', 'Frostmere', 'Icewind Pass', 'Snowcrown', 'Wintersgate', 'Whitewater'],
  ash: ['Emberfall', 'Cindermark', 'Ashenvale', 'Brimstone Gate', 'Smoulderhold', 'Pyre Hollow', 'Scorchfield', 'Obsidian Rise'],
  dunes: ['Sunscar', 'Duneholm', 'Saltwind', 'Mirage Wells', 'Goldsand', 'Scorpion Flats', 'Kharavel', 'Sandmere', 'Thir Oasis', 'Copperdune'],
  fen: ['Bogwater', 'Mirefen', 'Gloomhollow', 'Witchwood', 'Murkmoor', 'Fenwick', 'Shadowmere', 'Rotting Reach'],
};

// Compass sectors (screen angles, 0° = east, 90° = south) for the outer rings.
function terrainAt(angleDeg) {
  const a = ((angleDeg % 360) + 360) % 360;
  if (a >= 247.5 && a < 292.5) return 'frost';
  if (a >= 292.5 && a < 337.5) return 'hills';
  if (a >= 337.5 || a < 22.5) return 'ash';
  if (a < 112.5) return 'dunes';
  if (a < 157.5) return 'fen';
  if (a < 202.5) return 'coast';
  return 'forest';
}

const PLURAL = { footman: 'Footmen', bowman: 'Bowmen', pikeman: 'Pikemen', crossbow: 'Crossbowmen', knight: 'Knights', cavalry: 'Cavalry', cleric: 'Clerics', griffon: 'Griffon Riders' };
const plural = (n) => (/[^aeiou]y$/.test(n) ? n.slice(0, -1) + 'ies' : n + 's');
const pct = (v) => `${Math.round(v * 100)}%`;
// Human text for one gift, plus the unit it is tied to (a tower or troop), if any.
export function perkInfo(perk) {
  const [k, v] = Object.entries(perk)[0];
  if (k.startsWith('train_')) { const t = k.slice(6); return { text: `${plural(TOWERS[t].name)} +${pct(v)} damage`, unit: { kind: 'tower', id: t, name: TOWERS[t].name }, focus: TOWERS[t].name }; }
  if (k.startsWith('troop_')) { const t = k.slice(6); return { text: `${PLURAL[t]} +${pct(v)} health and damage`, unit: { kind: 'troop', id: t, name: TROOPS[t].name }, focus: PLURAL[t] }; }
  const T = {
    startGold: [`+${v} starting gold`, 'Treasury'], killGold: [`+${pct(v)} kill gold`, 'Treasury'], waveGold: [`+${pct(v)} wave-clear gold`, 'Treasury'],
    lootBonus: [`Loot +${pct(v)}`, 'Treasury'], towerDiscount: [`Towers ${pct(v)} cheaper`, 'Builders'], repairDiscount: [`Repairs ${pct(v)} cheaper`, 'Builders'],
    castleHpMult: [`+${pct(v)} keep HP`, 'Walls'], wallHpMult: [`+${pct(v)} wall HP`, 'Walls'], towerHpMult: [`Towers +${pct(v)} HP`, 'Walls'],
    airDmg: [`+${pct(v)} damage to flyers`, 'Anti-air'], armoredDmg: [`+${pct(v)} damage to armored foes`, 'Siegecraft'], bossDmg: [`+${pct(v)} damage to bosses`, 'Giant-slaying'],
    weaponDmg: [`Your weapon +${pct(v)} damage`, 'Your bow'], troopHp: [`Troops +${pct(v)} health`, 'Garrison'], troopDmg: [`Troops +${pct(v)} damage`, 'Garrison'],
  }[k] || [`${k} +${v}`, 'Realm'];
  return { text: T[0], unit: null, focus: T[1] };
}

// ---------- the provinces ----------
function buildProvinces() {
  const rng = new Rng('aldermere-map');
  const rings = [{ n: 5, r: 88 }, { n: 10, r: 168 }, { n: 12, r: 248 }, { n: 12, r: 318 }];
  const sites = [{ ring: 0, x: CENTER.x, y: CENTER.y, ang: 0 }];
  rings.forEach((R, ri) => {
    const off = rng.range(0, Math.PI * 2);
    for (let i = 0; i < R.n; i++) {
      const ang = off + (i / R.n) * Math.PI * 2 + rng.range(-0.22, 0.22) * (Math.PI * 2 / R.n);
      const r = R.r * rng.range(0.9, 1.08);
      sites.push({ ring: ri + 1, x: CENTER.x + Math.cos(ang) * r * 1.32, y: CENTER.y + Math.sin(ang) * r * 0.92, ang: (ang * 180) / Math.PI });
    }
  });
  // Order of conquest: ring by ring, each step taking the free province nearest to what is already held.
  const order = [0], left = new Set(sites.keys()); left.delete(0);
  while (left.size) {
    let best = -1, bv = Infinity;
    for (const i of left) {
      let d = Infinity;
      for (const j of order) d = Math.min(d, Math.hypot(sites[i].x - sites[j].x, sites[i].y - sites[j].y));
      const v = sites[i].ring * 10000 + d;
      if (v < bv) { bv = v; best = i; }
    }
    order.push(best); left.delete(best);
  }
  const used = {}, perkUse = {}, foeUse = {};
  return order.map((si, idx) => {
    const s = sites[si];
    const terrain = s.ring <= 1 ? 'heartland' : terrainAt(s.ang);
    const T = TERRAINS[terrain];
    const ni = used[terrain] = (used[terrain] ?? -1) + 1;
    const pi = perkUse[terrain] = (perkUse[terrain] ?? -1) + 1;
    const fi = foeUse[terrain] = (foeUse[terrain] ?? -1) + 1;
    const name = idx === 0 ? 'Aldermere' : NAMES[terrain][ni % NAMES[terrain].length] + (ni >= NAMES[terrain].length ? ' Marches' : '');
    const perk = idx === 0 ? { towerDmg: 0.02 } : T.perks[pi % T.perks.length];
    const info = idx === 0 ? { text: '+2% tower damage', unit: null, focus: 'The Crown' } : perkInfo(perk);
    return {
      idx, id: name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), name, capital: idx === 0, ring: s.ring, terrain,
      x: Math.round(s.x), y: Math.round(s.y), perk, perkText: info.text, unit: info.unit, focus: info.focus,
      foe: idx === 0 ? 'grunt' : T.foes[fi % T.foes.length],
    };
  });
}
export const PROVINCES = buildProvinces();
export const MAX_PROVINCES = PROVINCES.length;
export const provinceById = (id) => PROVINCES.find((p) => p.id === id) || null;

// ---------- state changes ----------
export function deltaFor(kind, result) {
  if (kind === 'day') return result ? TERRITORY.day.win : TERRITORY.day.miss;
  const R = TERRITORY[kind], f = result || 0;
  return f >= 1.5 ? R.legend : f >= 1 ? R.victory : f >= 0.5 ? R.hold : R.fail;
}
export function outcomeName(kind, result) {
  if (kind === 'day') return result ? 'won' : 'missed';
  const f = result || 0;
  return f >= 1.5 ? 'Legend' : f >= 1 ? 'Victory' : f >= 0.5 ? 'held' : 'failed';
}
// Apply a change: gains past the edge of the map become Bulwark, losses spend Bulwark first, the floor never falls.
export function applyDelta(state, delta) {
  let held = state.held, bulwark = state.bulwark || 0;
  if (delta > 0) {
    const room = MAX_PROVINCES - held, take = Math.min(room, delta);
    held += take; bulwark = Math.min(TERRITORY.bulwarkMax, bulwark + (delta - take));
  } else if (delta < 0) {
    let loss = -delta;
    const soak = Math.min(bulwark, loss); bulwark -= soak; loss -= soak;
    held = Math.max(TERRITORY.floor, held - loss);
  }
  return { held, bulwark };
}
export const clampHeld = (n) => Math.max(TERRITORY.floor, Math.min(MAX_PROVINCES, n | 0));
export const heldProvinces = (held) => PROVINCES.slice(0, clampHeld(held));
// The next province to take (null when the map is whole) and the border province most at risk.
export function frontier(held) {
  const n = clampHeld(held);
  return { next: n < MAX_PROVINCES ? PROVINCES[n] : null, border: n > TERRITORY.floor ? PROVINCES[n - 1] : null };
}

// Every gift of the held provinces, summed into run-bonus fields (see profile.runBonus).
export function mapPerks(held) {
  const out = {};
  for (const p of heldProvinces(held)) for (const [k, v] of Object.entries(p.perk)) out[k] = (out[k] || 0) + v;
  return out;
}

// What a March on a province looks like: its battlefield, its weather and its native foe.
export function marchSetup(id) {
  const p = provinceById(id);
  if (!p) return null;
  const T = TERRAINS[p.terrain];
  return { province: p.id, name: p.name, terrain: p.terrain, mapId: T.battlefield, biome: T.biome, foe: p.foe, foeName: ENEMIES[p.foe]?.name || p.foe };
}
