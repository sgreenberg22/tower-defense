// Bastion Siege — every tunable number lives here.
// Units: distances in tiles, time in seconds, speeds in tiles/second, rates in shots/second.

export const VERSION = '1.4.3';

export const GAME = {
  step: 1 / 60,
  buildTime: 30,          // seconds of build countdown (wave 1 is untimed)
  castleHp: 100,
  wallHp: 150,
  startGold: 160,
  boonEvery: 3,           // boon pick after every Nth wave, plus after bosses
  maxEnemies: 110,        // per-wave count cap; overflow folds into HP
  sellRefund: 0.7,
  particleCap: { low: 140, high: 420 },
};

// Castle-defense build rules: towers stand only on stone plots beside the road.
// A few are open at the start; the rest are ruins you claim for gold, each claim dearer than the last.
export const PLOTS = {
  max: 18,            // plots generated per map
  open: 6,            // claimed for free at the start of a run
  claimBase: 45,      // first ruin
  claimStep: 30,      // each later claim costs this much more
  claimPerWave: 0.02, // and claims scale gently with the wave
  trapCap: 3,         // road traps allowed at once
};

// Castle abilities: tap to use during a wave, then they recharge. Damage is in "grunts" (a grunt's HP on that wave).
export const ABILITIES = {
  volley: { name: 'Arrow Rain', key: 'Q', icon: '🏹', cd: 26, radius: 1.5, dmg: 0.75, hits: 3, gap: 0.22, aim: true, desc: 'Tap the field: three volleys of arrows hammer an area. Hits flyers.' },
  oil:    { name: 'Boiling Oil', key: 'E', icon: '🔥', cd: 42, radius: 2.3, dmg: 2.4, burn: 0.35, burnTime: 3, slow: 0.5, slowTime: 3.5, desc: 'Pour oil from the walls: scalds and slows everything on the ground near the gate.' },
  // Unlocked in The Keep.
  nova:   { name: 'Frost Nova', key: 'Z', icon: '❄', keep: 'unlock_nova', cd: 55, dmg: 0.4, slow: 0.65, slowTime: 4, freeze: 1.0, desc: 'A wave of cold sweeps the whole field: every foe is slowed, ground foes freeze briefly.' },
  horn:   { name: 'War Horn', key: 'X', icon: '📯', keep: 'unlock_horn', cd: 60, duration: 8, rate: 0.35, desc: 'Your towers fire 35% faster for 8 seconds.' },
};

export const WAVE = {
  countBase: 6, countLin: 1.5, countQuad: 0.03,
  hpLin: 0.34, hpExpBase: 1.03, hpExpStart: 11,
  speedPerWave: 0.004, speedCap: 0.45,
  armorPerWave: 0.25, armorCap: 25,
  gearEvery: 10, gearBonus: 0.06,
  bossEvery: 10,
  biomeEvery: 25,
  spawnGap: 0.75,         // seconds between enemies in a group (shrinks with waves)
  groupGap: 2.2,
};

export const ECON = {
  killGoldPerWave: 0.02,
  killGoldExp: 0.6,       // fraction of the HP exponential passed on to bounties, so late gold keeps pace
  heroKillGold: 1.5,
  waveClearBase: 15, waveClearPerWave: 3,
  earlyCallPerSec: 0.8, earlyCallPerWave: 0.05,
  wallRepairBase: 0.5, wallRepairPerWave: 0.03,
  castleRepairBase: 3, castleRepairPerWave: 0.15,
  towerRepairFactor: 0.4,
  killPointsPerWave: 0.05,
  heroKillPoints: 2,
  waveClearPoints: 25,
  flawlessBonus: 0.5,
  renownPerScore: 1 / 150,
  renownWaveBase: 3, renownWaveGrowth: 0.1,   // each cleared wave i pays base + growth·i
  renownPerBoss: 6,
  renownDailyBonus: 0.5, renownDailyCap: 60,   // first run of the day pays +50% (capped)
  leakDmgPerWave: 0.02,
};

// damage: base per shot. rate: shots/s. targets: 'g' ground, 'a' air, 'ga' both.
export const TOWERS = {
  archer: {
    name: 'Archer Tower', cost: 50, dmg: 8, rate: 1.4, range: 2.8, type: 'physical', targets: 'ga',
    proj: 'arrow', projSpeed: 12, hp: 100, unlockWave: 1, keep: null, color: '#3d7bd9',
    desc: 'Fast, cheap, hits flyers.',
    specs: {
      sharpshooter: { name: 'Sharpshooter', desc: '+1.5 range, 25% crits for ×2.5, targets the strongest.', range: 1.5, critChance: 0.25, critMult: 2.5, target: 'strong' },
      volley: { name: 'Volley', desc: 'Fires at 3 targets, +40% rate.', multi: 3, rateMult: 1.4 },
    },
  },
  cannon: {
    name: 'Cannon', cost: 80, dmg: 26, rate: 0.6, range: 2.5, splash: 0.9, type: 'physical', targets: 'g',
    proj: 'ball', projSpeed: 8, hp: 140, unlockWave: 1, keep: null, color: '#5b6170',
    desc: 'Splash damage against ground crowds.',
    specs: {
      mortar: { name: 'Great Mortar', desc: '+60% splash radius, +40% damage.', splashMult: 1.6, dmgMult: 1.4 },
      shrapnel: { name: 'Shrapnel', desc: 'Shreds 20% armor for 4s, +30% rate.', shred: 20, rateMult: 1.3 },
    },
  },
  mage: {
    name: 'Mage Tower', cost: 100, dmg: 19, rate: 0.8, range: 2.6, type: 'magic', targets: 'ga', chain: 2, chainRange: 1.5, chainFalloff: 0.7,
    proj: 'orb', projSpeed: 10, hp: 90, unlockWave: 3, keep: null, color: '#8a4fd8',
    desc: 'Magic bolts chain between enemies and ignore armor.',
    specs: {
      storm: { name: 'Storm Caller', desc: '+4 chain jumps.', chainAdd: 4 },
      lance: { name: 'Arcane Lance', desc: 'Single target ×2.2 damage, ignores magic resist.', chainSet: 0, dmgMult: 2.2, pierceMr: true },
    },
  },
  flak: {
    name: 'Flak Battery', cost: 85, dmg: 13, rate: 1.2, range: 3.0, splash: 0.8, type: 'physical', targets: 'a',
    proj: 'flak', projSpeed: 14, hp: 110, unlockWave: 6, keep: null, color: '#c76b2e',
    desc: 'Shreds anything with wings. Cannot hit ground.',
    specs: {
      skyburst: { name: 'Skyburst', desc: 'Splash radius ×2.', splashMult: 2 },
      battery: { name: 'AA Battery', desc: 'Rate ×2, +50% vs bosses.', rateMult: 2, bossMult: 1.5 },
    },
  },
  mint: {
    name: 'Royal Mint', cost: 100, income: 14, hp: 80, unlockWave: 4, keep: 'unlock_mint', color: '#e2b33c', passive: true,
    desc: 'Earns gold every wave. Each extra mint costs 40% more.',
    specs: {
      treasury: { name: 'Royal Treasury', desc: 'Income ×2.', incomeMult: 2 },
      bounty: { name: 'Bounty Office', desc: '+8% kill gold for the whole kingdom.', killGold: 0.08 },
    },
  },
  firetrap: {
    name: 'Fire Trap', cost: 60, burn: 11, burnTime: 3, type: 'fire', targets: 'g', trap: true, hp: 999,
    unlockWave: 5, keep: 'unlock_firetrap', color: '#e0532f',
    desc: 'Built on the road. Sets passing enemies alight.',
    specs: {
      inferno: { name: 'Inferno', desc: 'Burn ×2, flames spread on death.', burnMult: 2, spread: true },
      tar: { name: 'Tar Pit', desc: 'Slows by 50% while burning.', slow: 0.5 },
    },
  },
  ballista: {
    name: 'Ballista', cost: 120, dmg: 50, rate: 0.45, range: 3.6, pierce: 3, type: 'physical', targets: 'g',
    proj: 'bolt', projSpeed: 16, hp: 130, unlockWave: 7, keep: 'unlock_ballista', color: '#8a5a32',
    desc: 'Heavy bolts pierce through a line of foes.',
    specs: {
      breaker: { name: 'Siege Breaker', desc: '×2 vs armored (30+), +50% vs bosses.', armoredMult: 2, bossMult: 1.5 },
      repeater: { name: 'Repeater', desc: 'Rate ×2.2, pierce 5.', rateMult: 2.2, pierceSet: 5 },
    },
  },
  barracks: {
    name: 'Barracks', cost: 110, soldiers: 2, soldierHp: 80, soldierDmg: 11, soldierRate: 1, respawn: 8, range: 2.2,
    type: 'physical', targets: 'g', hp: 160, unlockWave: 9, keep: 'unlock_barracks', color: '#3a8a52',
    desc: 'Soldiers block the road and hold enemies in place.',
    specs: {
      knights: { name: 'Knights', desc: '3 armored knights with double HP.', soldiersSet: 3, hpMult: 2, armor: 40 },
      rangers: { name: 'Rangers', desc: 'Soldiers shoot, hitting flyers too.', ranged: true, dmgMult: 1.5 },
    },
  },
  catapult: {
    name: 'Catapult', cost: 160, dmg: 75, rate: 0.3, range: 5.5, minRange: 1.4, splash: 1.3, type: 'physical', targets: 'g',
    proj: 'boulder', projSpeed: 6, hp: 120, unlockWave: 12, keep: 'unlock_catapult', color: '#7b6a4f',
    desc: 'Huge range, huge splash, slow to reload.',
    specs: {
      boulder: { name: 'Boulder', desc: 'Stuns for 1s on impact.', stun: 1 },
      firepot: { name: 'Firepot', desc: 'Leaves burning ground for 3s.', fireField: 3 },
    },
  },
  banner: {
    name: 'War Banner', cost: 120, aura: 1.6, auraDmg: 0.15, auraRate: 0.1, hp: 100, unlockWave: 14,
    keep: 'unlock_banner', color: '#d23c4b', passive: true,
    desc: 'Nearby towers deal more damage and fire faster.',
    specs: {
      drums: { name: 'War Drums', desc: 'Aura +25% rate.', auraRateAdd: 0.25 },
      rally: { name: 'Rally Cry', desc: 'Aura +30% damage, +0.6 radius.', auraDmgAdd: 0.3, auraAdd: 0.6 },
    },
  },
  tesla: {
    name: 'Tesla Coil', cost: 220, dmg: 32, rate: 0.7, range: 2.4, chain: 4, chainRange: 1.6, chainFalloff: 0.85, type: 'magic', targets: 'ga',
    proj: 'zap', hp: 110, unlockWave: 18, keep: 'unlock_tesla', color: '#2fb6c9',
    desc: 'Instant lightning that leaps through packs.',
    specs: {
      overload: { name: 'Overload', desc: '×1.8 damage, 15% stun chance.', dmgMult: 1.8, stunChance: 0.15 },
      network: { name: 'Arc Network', desc: '+4 jumps, +1 jump range.', chainAdd: 4, chainRangeAdd: 1 },
    },
  },
  frost: {
    name: 'Frost Spire', cost: 180, dmg: 7, rate: 0.66, range: 2.0, slow: 0.4, slowTime: 2, type: 'magic', targets: 'ga', pulse: true,
    hp: 120, unlockWave: 22, keep: 'unlock_frost', color: '#7fd3f2',
    desc: 'Pulses frost that slows everything nearby.',
    specs: {
      zero: { name: 'Absolute Zero', desc: 'Slow 65%, 10% freeze chance.', slowSet: 0.65, freezeChance: 0.1 },
      shatter: { name: 'Shatter', desc: 'Chilled enemies take +25% damage.', vuln: 0.25 },
    },
  },
  obelisk: {
    name: 'Sun Obelisk', cost: 300, dps: 40, ramp: 0.8, rampMax: 4, range: 3.2, type: 'magic', targets: 'ga', beam: true,
    hp: 150, unlockWave: 28, keep: 'unlock_obelisk', color: '#f5c542',
    desc: 'A sunbeam that grows hotter the longer it holds a target.',
    specs: {
      sunlance: { name: 'Sunlance', desc: 'Ramps to ×7.', rampMaxSet: 7 },
      prism: { name: 'Prism', desc: 'Splits into 3 beams.', beams: 3 },
    },
  },
};

export const TOWER_ORDER = ['archer', 'cannon', 'mage', 'flak', 'mint', 'firetrap', 'ballista', 'barracks', 'catapult', 'banner', 'tesla', 'frost', 'obelisk'];

export const TIER = {
  max: 5,
  costMult: [0, 0.8, 1.2, 1.8, 2.6],   // cost to go from tier i+1 to i+2 = base × costMult[i+1]
  dmg: [1, 1.6, 2.5, 3.8, 5.8],
  rate: [1, 1.1, 1.2, 1.32, 1.45],
  range: [0, 0.2, 0.4, 0.6, 0.8],
  hp: [1, 1.3, 1.6, 2, 2.5],
  income: [1, 1.5, 2.1, 2.8, 3.6],
  highGroundRange: 0.6,
  highGroundDmg: 0.15,
  mintCostGrowth: 0.4,
  // Mastery: endless ★ upgrades after tier 5. Each star multiplies damage by 1.16 (+8% income/aura); cost grows 38%.
  mastery: { dmg: 0.16, util: 0.08, costBase: 2.2, growth: 1.32 },   // damage compounds: ×1.16 per star
};

export const ENEMIES = {
  grunt:     { name: 'Grunt', hp: 30, speed: 1.0, armor: 0, mr: 0, bounty: 3, points: 10, dmg: 2, size: 0.28, unlock: 1, weight: 10, color: '#d9473b' },
  runner:    { name: 'Runner', hp: 18, speed: 1.9, armor: 0, mr: 0, bounty: 2, points: 8, dmg: 1, size: 0.22, unlock: 3, weight: 6, color: '#f08a3c' },
  shield:    { name: 'Shieldbearer', hp: 55, speed: 0.8, armor: 45, mr: 0, bounty: 5, points: 15, dmg: 2, size: 0.3, unlock: 5, weight: 5, color: '#8b95a8', armored: true },
  archer:    { name: 'Raider Archer', hp: 28, speed: 0.95, armor: 0, mr: 0, bounty: 5, points: 15, dmg: 2, size: 0.26, unlock: 7, weight: 4, color: '#5e8f3a', shoots: { range: 2.4, dmg: 5, cd: 1.3 } },
  wyvern:    { name: 'Wyvern', hp: 35, speed: 1.2, armor: 0, mr: 10, bounty: 5, points: 16, dmg: 3, size: 0.3, unlock: 8, weight: 4, color: '#7a4fb5', air: true },
  cavalry:   { name: 'Cavalry', hp: 60, speed: 1.7, armor: 15, mr: 0, bounty: 6, points: 18, dmg: 3, size: 0.34, unlock: 9, weight: 4, color: '#a6532c' },
  healer:    { name: 'Field Healer', hp: 40, speed: 0.9, armor: 0, mr: 20, bounty: 7, points: 20, dmg: 2, size: 0.26, unlock: 12, weight: 2, color: '#e6e1d3', heal: { range: 1.5, pct: 0.06, cd: 1 } },
  ram:       { name: 'Battering Ram', hp: 220, speed: 0.5, armor: 30, mr: -20, bounty: 15, points: 40, dmg: 15, wallMult: 3, size: 0.42, unlock: 14, weight: 1.2, color: '#6d4a2b', armored: true },
  sapper:    { name: 'Sapper', hp: 45, speed: 1.2, armor: 0, mr: 0, bounty: 8, points: 22, dmg: 2, size: 0.25, unlock: 16, weight: 2, color: '#3b3f4a', sabotage: { range: 1.3, time: 4, cd: 6 } },
  warchief:  { name: 'Warchief', hp: 90, speed: 0.9, armor: 20, mr: 0, bounty: 10, points: 30, dmg: 4, size: 0.34, unlock: 18, weight: 1.2, color: '#b8233a', aura: { range: 1.8, speed: 0.2, armor: 15 } },
  warlock:   { name: 'Warlock', hp: 70, speed: 0.85, armor: 0, mr: 50, bounty: 10, points: 30, dmg: 3, size: 0.28, unlock: 22, weight: 1.2, color: '#4b2d7a', ward: { range: 1.6, pct: 0.25, cd: 5 } },
  brood:     { name: 'Broodmother', hp: 120, speed: 0.8, armor: 10, mr: 0, bounty: 8, points: 25, dmg: 3, size: 0.36, unlock: 26, weight: 1.2, color: '#4a6b3d', split: { into: 'spider', n: 3 } },
  spider:    { name: 'Spiderling', hp: 20, speed: 1.6, armor: 0, mr: 0, bounty: 1, points: 4, dmg: 1, size: 0.18, unlock: 999, weight: 0, color: '#6f8f4a' },
  golem:     { name: 'Stone Golem', hp: 400, speed: 0.55, armor: 50, mr: 30, bounty: 25, points: 60, dmg: 10, size: 0.46, unlock: 30, weight: 0.8, color: '#7d7f86', armored: true },
};

// Starting levels. Beginners start at wave 1; veterans can skip ahead with a catch-up package
// (gold worth about `catchGold` of what the skipped waves would have paid, extra open plots, free boons).
export const DIFFICULTY = [
  { id: 'recruit',  name: 'Recruit',  wave: 1,  desc: 'The full campaign from the first wave. Best for learning.' },
  { id: 'squire',   name: 'Squire',   wave: 10, desc: 'Skip the opening. Bosses and flyers soon.' },
  { id: 'knight',   name: 'Knight',   wave: 20, desc: 'Armored foes and real pressure from the start.' },
  { id: 'champion', name: 'Champion', wave: 30, desc: 'Skip the easy half. Every tower choice matters.' },
  { id: 'warlord',  name: 'Warlord',  wave: 40, desc: 'For veterans. The siege is already at your gates.' },
  { id: 'legend',   name: 'Legend',   wave: 50, desc: 'A second biome in. Bring your best Keep upgrades.' },
  { id: 'mythic',   name: 'Mythic',   wave: 60, desc: 'Almost no mercy. Bring a maxed Keep and your best build.' },
];
// One-time Renown rewards the first time your ranked wave reaches these marks.
export const MILESTONES = [
  { wave: 5, reward: 10 }, { wave: 10, reward: 15 }, { wave: 15, reward: 20 }, { wave: 20, reward: 30 }, { wave: 25, reward: 40 },
  { wave: 30, reward: 50 }, { wave: 40, reward: 80 }, { wave: 50, reward: 120 }, { wave: 60, reward: 150 }, { wave: 75, reward: 200 },
  { wave: 100, reward: 300 }, { wave: 125, reward: 400 }, { wave: 150, reward: 500 },
];
export const HEADSTART = {
  catchGold: 0.55,        // fraction of the skipped waves' gold you receive up front
  plotEvery: 5,           // one extra open plot per this many skipped waves
  plotCap: 8,
  boonEvery: 5,           // one free boon pick per this many skipped waves
  boonCap: 8,
  rankCredit: 0.5,        // skipped waves count this much towards your ranked wave
  rankMinWaves: 5,        // ...but only once you have actually held this many waves (no free unlocks)
};

// Wave threats: most waves lean on one theme, announced a wave ahead with a counter tip.
// boost: weight multiplier for the listed enemy types. Stat tweaks apply to the whole wave.
export const THREATS = {
  horde:   { name: 'Horde', icon: '⚔', unlock: 2, types: ['grunt', 'runner', 'spider'], boost: 4, count: 1.45, hp: 0.72, tip: 'Splash wins: Cannon, Mage chains, Fire Trap.' },
  rush:    { name: 'Rush', icon: '💨', unlock: 3, types: ['runner', 'cavalry'], boost: 6, speed: 1.18, hp: 0.9, tip: 'Slow or block them: Barracks, Frost, Tar Pit. Shoot the leaders.' },
  shields: { name: 'Shield Wall', icon: '🛡', unlock: 5, types: ['shield', 'ram', 'golem'], boost: 6, armor: 12, tip: 'Armor shrugs off arrows. Use Mages, Ballistas, Shrapnel.' },
  air:     { name: 'Air Raid', icon: '🦅', unlock: 8, types: ['wyvern'], boost: 9, tip: 'Flyers skip the road and the wall. Archers, Mages, Flak.' },
  arcane:  { name: 'Warded Host', icon: '✦', unlock: 12, types: ['warlock', 'healer'], boost: 6, mr: 25, tip: 'Wards blunt magic. Cannons, Ballistas and your bow.' },
  siege:   { name: 'Siege Column', icon: '🏰', unlock: 14, types: ['ram', 'sapper', 'archer'], boost: 6, tip: 'They target towers and walls. Kill them early, repair after.' },
};

export const BOSSES = [
  { id: 'warlord', name: 'The Warlord', hp: 1500, speed: 0.55, armor: 30, mr: 10, bounty: 120, points: 600, dmg: 30, size: 0.6, color: '#9c1f2e', summon: { type: 'grunt', n: 4, cd: 6 } },
  { id: 'titan', name: 'Siege Titan', hp: 2600, speed: 0.4, armor: 45, mr: 20, bounty: 180, points: 900, dmg: 40, size: 0.7, color: '#6b5d52', stomp: { range: 2.2, time: 3, cd: 7 } },
  { id: 'dragon', name: 'Ember Dragon', hp: 1400, speed: 0.7, armor: 20, mr: 30, bounty: 220, points: 1000, dmg: 35, size: 0.65, color: '#d9532c', air: true, roads: true, breath: { range: 2.5, dmg: 25, cd: 4 } },
  { id: 'lich', name: 'The Lich', hp: 2400, speed: 0.5, armor: 10, mr: 60, bounty: 250, points: 1100, dmg: 40, size: 0.6, color: '#3c6e8f', raise: { n: 6, cd: 7 } },
];

export const BIOMES = [
  { id: 'meadow', name: 'Meadow', grass: '#8cc152', grass2: '#7db146', path: '#e3c48b', path2: '#d4b278', accent: '#5f9a3a', sky: '#bfe3a0', hazard: null },
  { id: 'dunes', name: 'Dunes', grass: '#e8c47a', grass2: '#ddb766', path: '#c99a5a', path2: '#ba8b4c', accent: '#b98a3e', sky: '#f6dfa7', hazard: 'sandstorm' },
  { id: 'frost', name: 'Frostlands', grass: '#dfeef5', grass2: '#cfe2ec', path: '#9fb7c9', path2: '#8ea8bb', accent: '#7aa6c2', sky: '#eaf6fb', hazard: 'blizzard' },
  { id: 'ash', name: 'Ashlands', grass: '#5a4a48', grass2: '#4f403e', path: '#8a5a44', path2: '#7a4d39', accent: '#e0632f', sky: '#3a2a2a', hazard: 'meteors' },
  { id: 'shadow', name: 'Shadowfen', grass: '#3d4a5e', grass2: '#354155', path: '#6b6487', path2: '#5d5778', accent: '#9a7ad8', sky: '#232a38', hazard: 'stealth' },
];

export const WEAPONS = {
  longbow:    { name: 'Longbow', dmg: 14, reload: 0.55, ammo: 6, speed: 15, crit: 0.05, splash: 0, pierce: 0, type: 'physical', keep: null, desc: 'Reliable, quick, plenty of arrows.' },
  crossbow:   { name: 'Crossbow', dmg: 28, reload: 0.9, ammo: 4, speed: 20, crit: 0.08, splash: 0, pierce: 2, type: 'physical', keep: 'unlock_crossbow', desc: 'Heavy bolts pierce two enemies.' },
  javelin:    { name: 'Fire Javelin', dmg: 18, reload: 0.85, ammo: 4, speed: 12, crit: 0.05, splash: 0.9, burn: 8, pierce: 0, type: 'fire', keep: 'unlock_javelin', desc: 'Explodes and sets enemies on fire.' },
  wand:       { name: 'Arcane Wand', dmg: 13, reload: 0.6, ammo: 6, speed: 24, crit: 0.05, chain: 3, pierce: 0, type: 'magic', keep: 'unlock_wand', desc: 'Bolts chain to three more enemies.' },
  handcannon: { name: 'Hand Cannon', dmg: 65, reload: 1.6, ammo: 2, speed: 18, crit: 0.15, splash: 0.6, pierce: 0, type: 'physical', keep: 'unlock_handcannon', desc: 'Two huge shots. Make them count.' },
};

export const ARMORY = {
  dmg:    { name: 'Sharpen', desc: '+20% damage', base: 45, growth: 1.45, per: 0.2 },
  reload: { name: 'Quick Draw', desc: '−8% reload time', base: 40, growth: 1.5, per: 0.08, cap: 8 },
  ammo:   { name: 'Bigger Quiver', desc: '+1 ammo', base: 60, growth: 1.7, per: 1, cap: 8 },
  crit:   { name: 'Keen Eye', desc: '+4% crit chance', base: 50, growth: 1.55, per: 0.04, cap: 10 },
};
export const WEAPON_SCALE_PER_WAVE = 0.06;
export const COMBO = { cap: 20, perStep: 0.1, decay: 2.5, chargeTime: 1, chargeMult: 3, headshotMult: 2 };

export const BOONS = [
  { id: 'archer_dmg', name: 'Sharpened Tips', desc: 'Archer Towers +25% damage.', rarity: 'common', stack: 5 },
  { id: 'cannon_splash', name: 'Gunpowder Surplus', desc: 'Cannon splash +25%, damage +15%.', rarity: 'common', stack: 5 },
  { id: 'mage_chain', name: 'Conductive Air', desc: 'Mage & Tesla chains +1.', rarity: 'rare', stack: 3 },
  { id: 'interest', name: 'Royal Interest', desc: 'Earn 6% interest on unspent gold each wave (max 60).', rarity: 'rare', stack: 3 },
  { id: 'bloodlust', name: 'Bloodlust', desc: 'Hero kills grant +3 gold.', rarity: 'common', stack: 5 },
  { id: 'steady', name: 'Steady Hands', desc: 'Weapon reload −15%.', rarity: 'common', stack: 4 },
  { id: 'masonry', name: 'Master Masons', desc: 'Wall max HP +25% and fully repaired.', rarity: 'common', stack: 5 },
  { id: 'overclock', name: 'Overdrive', desc: 'All towers fire 8% faster.', rarity: 'rare', stack: 5 },
  { id: 'bounty', name: 'Bounty Posters', desc: 'Kill gold +12%.', rarity: 'common', stack: 5 },
  { id: 'eagle', name: 'Eagle Eye', desc: 'All tower range +8%.', rarity: 'rare', stack: 3 },
  { id: 'frostbite', name: 'Frostbite', desc: 'Slows are 25% stronger and last longer.', rarity: 'rare', stack: 2 },
  { id: 'pyro', name: 'Pyromania', desc: 'Fire damage +35%.', rarity: 'common', stack: 4 },
  { id: 'pierce', name: 'Long Bolts', desc: 'Ballista pierce +2, damage +15%.', rarity: 'common', stack: 3 },
  { id: 'scholar', name: 'Scholar', desc: 'Future boon picks offer one extra choice.', rarity: 'epic', stack: 1 },
  { id: 'plunder', name: 'Plunder', desc: 'Bosses drop double gold and score.', rarity: 'rare', stack: 2 },
  { id: 'lucky', name: 'Lucky Charm', desc: 'All crit chance +8%.', rarity: 'common', stack: 4 },
  { id: 'headhunter', name: 'Headhunter', desc: 'Headshots deal +60% damage.', rarity: 'rare', stack: 3 },
  { id: 'thrifty', name: 'Thrifty Builders', desc: 'Towers and upgrades cost 8% less.', rarity: 'rare', stack: 3 },
  { id: 'secondwind', name: 'Second Wind', desc: 'The castle survives one fatal blow, healing to 40%.', rarity: 'epic', stack: 1 },
  { id: 'taxman', name: 'Taxman', desc: 'Mints earn +35%.', rarity: 'common', stack: 4 },
  { id: 'garrison', name: 'Veteran Garrison', desc: 'Barracks soldiers +50% HP and damage.', rarity: 'common', stack: 3 },
  { id: 'antiair', name: 'Anti-Air Doctrine', desc: 'All damage vs flyers +30%.', rarity: 'common', stack: 3 },
  { id: 'armorbreak', name: 'Armor Breaker', desc: 'Physical damage ignores 15 armor.', rarity: 'rare', stack: 3 },
  { id: 'arcane', name: 'Arcane Flux', desc: 'Magic damage +22%.', rarity: 'common', stack: 4 },
  { id: 'combo', name: 'Combo Master', desc: 'Combo decays 50% slower; cap +10.', rarity: 'rare', stack: 2 },
  { id: 'quiver', name: 'Endless Quiver', desc: '+2 ammo.', rarity: 'common', stack: 3 },
  { id: 'explosive', name: 'Explosive Arrows', desc: 'Your shots splash for 50% damage.', rarity: 'epic', stack: 1 },
  { id: 'multishot', name: 'Multishot', desc: 'Your shots split into 2 extra arrows at 50% damage.', rarity: 'epic', stack: 1 },
  { id: 'golden', name: 'Golden Arrows', desc: 'Hero kills give +60% more gold.', rarity: 'rare', stack: 2 },
  { id: 'fieldrepair', name: 'Field Repairs', desc: 'Wall regenerates 1% per second during waves.', rarity: 'rare', stack: 2 },
  { id: 'thickskin', name: 'Thick Walls', desc: 'Castle takes 12% less damage.', rarity: 'common', stack: 3 },
  { id: 'warfund', name: 'War Fund', desc: 'Gain 150 gold now and wave-clear gold +20%.', rarity: 'common', stack: 3 },
];
export const RARITY_WEIGHT = { common: 10, rare: 5, epic: 1.5 };

export const MODIFIERS = {
  fog:      { name: 'Fog of War', desc: 'You only see enemies inside tower range or near the castle.', score: 0.3 },
  double:   { name: 'Double Time', desc: 'Enemies move 50% faster.', score: 0.5 },
  goldrush: { name: 'Gold Rush', desc: '+50% gold from everything.', score: -0.2 },
  glass:    { name: 'Glass Castle', desc: 'Castle and wall have half HP.', score: 0.4 },
  iron:     { name: 'Iron Horde', desc: 'All enemies gain 20 armor and 20 magic resist.', score: 0.3 },
  swarm:    { name: 'Swarm', desc: 'Twice as many enemies with 55% HP.', score: 0.2 },
  norepair: { name: 'No Repairs', desc: 'Walls, castle and towers cannot be repaired.', score: 0.35 },
  lonehero: { name: 'Lone Hero', desc: 'Towers deal 35% less damage, your weapon 60% more.', score: 0.25 },
};

export const ASCENSION = { max: 10, hp: 0.12, speed: 0.04, score: 0.15, unlockWave: (n) => 20 + 5 * n };

// The Keep: permanent upgrades bought with Renown.
// Each node: { id, name, desc (per level), cost: [per level], branch, group, req? (another node that must be owned) }.
// Effects are wired in src/meta/profile.js runBonus() and read by the engine.
const T = (id, name, desc, cost, branch, extra = {}) => ({ id, name, desc, cost, branch, ...extra });
const TRAIN = (tower, name, req) => T('train_' + tower, name, `+5% ${TOWERS[tower].name} damage`, req ? [40, 90, 170, 300, 480] : [30, 70, 130, 230, 380], 'towers', { group: 'Training', train: tower, per: 0.05, ...(req ? { req } : {}) });

export const KEEP = [
  // ---- Defenses
  T('fortify', 'Fortify', '+10% castle and wall HP', [20, 40, 80, 150, 260, 420, 650, 1000], 'defense', { group: 'Walls' }),
  T('wallplating', 'Iron Gates', '+12% wall HP', [40, 90, 180, 320, 520, 800], 'defense', { group: 'Walls' }),
  T('bulwark', 'Bulwark', 'The castle takes 3% less damage', [60, 120, 220, 380, 600, 900], 'defense', { group: 'Walls' }),
  T('wallregen', "Mason's Guild", 'Wall regenerates 0.25% HP per second in waves', [80, 170, 320, 550], 'defense', { group: 'Walls' }),
  T('mending', 'Wave Mending', 'The wall heals 5% of its HP after every wave, free', [70, 150, 290, 500, 800], 'defense', { group: 'Walls' }),
  T('hearth', 'Hearthfire', 'The castle heals 2% of its HP after every wave, free', [90, 200, 380, 650], 'defense', { group: 'Walls' }),
  T('masonry', 'Stonework', 'Repairs cost 10% less', [30, 70, 140, 260, 420], 'defense', { group: 'Walls' }),
  T('towerhp', 'Stout Foundations', 'Towers have 12% more HP', [50, 110, 210, 360, 580], 'defense', { group: 'Walls' }),
  T('scholar', 'Scholar', '+1 boon choice', [200], 'defense', { group: 'Boons' }),
  T('secondwind', 'Last Stand', 'Start every run with Second Wind', [300], 'defense', { group: 'Boons' }),
  T('phoenix', 'Phoenix Heart', 'Second Wind heals you to 70% instead of 40%', [450], 'defense', { group: 'Boons', req: 'secondwind' }),
  T('reroll', 'Fortune Teller', '+1 boon reroll per run', [150, 350, 700], 'defense', { group: 'Boons' }),
  T('startboon', "Veteran's Blessing", 'Begin each run with a free boon pick', [400, 900, 1800], 'defense', { group: 'Boons' }),
  T('charms', 'Gilded Charms', 'Rare and epic boons appear 20% more often', [120, 260, 480, 800], 'defense', { group: 'Boons' }),

  // ---- Castle Arts (abilities)
  T('volleycd', "Fletcher's Guild", 'Arrow Rain recharges 6% faster', [40, 90, 170, 300, 480], 'arts', { group: 'Arrow Rain' }),
  T('volleydmg', 'Barbed Arrows', 'Arrow Rain deals 12% more damage', [50, 110, 210, 360, 580], 'arts', { group: 'Arrow Rain' }),
  T('volleyrad', 'Wider Skies', 'Arrow Rain covers 8% more ground', [80, 180, 340], 'arts', { group: 'Arrow Rain' }),
  T('oilcd', 'Oil Reserves', 'Boiling Oil recharges 6% faster', [40, 90, 170, 300, 480], 'arts', { group: 'Boiling Oil' }),
  T('oildmg', 'Pitch and Tar', 'Boiling Oil deals 12% more damage', [50, 110, 210, 360, 580], 'arts', { group: 'Boiling Oil' }),
  T('oilrad', 'Long Ladles', 'Boiling Oil covers 8% more ground', [80, 180, 340], 'arts', { group: 'Boiling Oil' }),
  T('unlock_nova', 'Frost Nova', 'Unlock the Frost Nova ability', [350], 'arts', { group: 'Frost Nova', ability: 'nova' }),
  T('novacd', 'Deep Winter', 'Frost Nova recharges 6% faster', [100, 220, 400, 650], 'arts', { group: 'Frost Nova', req: 'unlock_nova' }),
  T('novafreeze', 'Hard Frost', 'Frost Nova freezes foes 0.3s longer', [120, 260, 480], 'arts', { group: 'Frost Nova', req: 'unlock_nova' }),
  T('unlock_horn', 'War Horn', 'Unlock the War Horn ability', [600], 'arts', { group: 'War Horn', ability: 'horn' }),
  T('horncd', 'Louder Horn', 'War Horn recharges 6% faster', [120, 260, 480, 780], 'arts', { group: 'War Horn', req: 'unlock_horn' }),
  T('horndur', 'Long Blast', 'War Horn lasts 1.5s longer', [140, 300, 560], 'arts', { group: 'War Horn', req: 'unlock_horn' }),

  // ---- Treasury
  T('warchest', 'War Chest', '+30 starting gold', [15, 30, 60, 110, 200, 330, 520, 800], 'economy', { group: 'Gold' }),
  T('bountyhunter', 'Bounty Hunter', '+6% kill gold', [30, 70, 140, 250, 400, 620], 'economy', { group: 'Gold' }),
  T('wavepay', 'Tax Collectors', 'Wave-clear gold +8%', [50, 110, 210, 360, 580], 'economy', { group: 'Gold' }),
  T('hurry', 'Eager Quartermasters', 'Early-call gold +15%', [40, 90, 170, 300], 'economy', { group: 'Gold' }),
  T('invest', 'Royal Investments', 'Earn 2% interest on unspent gold each wave (max 30 per level)', [90, 200, 380, 650], 'economy', { group: 'Gold' }),
  T('treasure', 'Treasure Hunters', 'Loot and gems are worth 15% more', [40, 90, 170, 300], 'economy', { group: 'Gold' }),
  T('minters', 'Master Minters', 'Mint income +10%', [50, 110, 210, 360, 580], 'economy', { group: 'Gold', req: 'unlock_mint' }),
  T('architect', 'Architect', 'Towers and upgrades cost 4% less', [40, 90, 180, 320, 520], 'economy', { group: 'Building' }),
  T('mastersmith', 'Master Smiths', 'Mastery stars cost 5% less', [60, 130, 250, 430, 700], 'economy', { group: 'Building' }),
  T('surveyors', 'Land Surveyors', 'Claiming ruins costs 8% less', [45, 100, 190, 330, 540], 'economy', { group: 'Building' }),
  T('plots', 'Pre-claimed Land', '+1 open plot at the start of every run', [180, 420, 800, 1400], 'economy', { group: 'Building' }),
  T('salvage', 'Salvage Crew', '+5% sell refund', [25, 60, 120, 220], 'economy', { group: 'Building' }),

  // ---- Hero
  T('marksman', 'Marksman', '+10% weapon damage', [15, 35, 70, 130, 240, 400, 640, 1000], 'hero', { group: 'Weapon' }),
  T('quickhands', 'Quick Hands', '−6% reload time', [25, 60, 130, 240, 400], 'hero', { group: 'Weapon' }),
  T('deepquiver', 'Deep Quiver', '+1 ammo', [30, 80, 170, 300, 500], 'hero', { group: 'Weapon' }),
  T('keeneye', 'Keen Eye', '+2% weapon crit chance', [30, 70, 130, 230, 380, 600], 'hero', { group: 'Weapon' }),
  T('deadeye', 'Dead Eye', 'Headshots deal 12% more damage', [40, 90, 170, 300, 480], 'hero', { group: 'Technique' }),
  T('momentum', 'Momentum', 'Your combo decays 10% slower', [35, 80, 150, 270], 'hero', { group: 'Technique' }),
  T('steadydraw', 'Steady Draw', 'Charged shots charge 8% faster', [35, 80, 150, 270], 'hero', { group: 'Technique' }),
  T('armorpiercer', 'Armor Piercer', 'Your shots ignore 3 more armor', [45, 100, 190, 330, 540], 'hero', { group: 'Technique' }),
  T('plunderer', 'Plunderer', 'Your kills pay 8% more gold', [40, 90, 170, 300, 480], 'hero', { group: 'Technique' }),
  T('armorer', 'Armorer', 'War Room weapon upgrades cost 8% less', [35, 80, 150, 260, 420], 'hero', { group: 'Technique' }),
  T('unlock_crossbow', 'Crossbow', 'Unlock the Crossbow', [50], 'hero', { group: 'Weapons', weapon: 'crossbow' }),
  T('unlock_javelin', 'Fire Javelin', 'Unlock the Fire Javelin', [90], 'hero', { group: 'Weapons', weapon: 'javelin' }),
  T('unlock_wand', 'Arcane Wand', 'Unlock the Arcane Wand', [120], 'hero', { group: 'Weapons', weapon: 'wand' }),
  T('unlock_handcannon', 'Hand Cannon', 'Unlock the Hand Cannon', [180], 'hero', { group: 'Weapons', weapon: 'handcannon' }),

  // ---- Towers
  T('unlock_mint', 'Royal Mint', 'Unlock the Mint tower', [25], 'towers', { group: 'Unlocks', tower: 'mint' }),
  T('unlock_firetrap', 'Fire Trap', 'Unlock the Fire Trap', [30], 'towers', { group: 'Unlocks', tower: 'firetrap' }),
  T('unlock_ballista', 'Ballista', 'Unlock the Ballista', [45], 'towers', { group: 'Unlocks', tower: 'ballista' }),
  T('unlock_barracks', 'Barracks', 'Unlock the Barracks', [60], 'towers', { group: 'Unlocks', tower: 'barracks' }),
  T('unlock_catapult', 'Catapult', 'Unlock the Catapult', [90], 'towers', { group: 'Unlocks', tower: 'catapult' }),
  T('unlock_banner', 'War Banner', 'Unlock the War Banner', [110], 'towers', { group: 'Unlocks', tower: 'banner' }),
  T('unlock_tesla', 'Tesla Coil', 'Unlock the Tesla Coil', [160], 'towers', { group: 'Unlocks', tower: 'tesla' }),
  T('unlock_frost', 'Frost Spire', 'Unlock the Frost Spire', [200], 'towers', { group: 'Unlocks', tower: 'frost' }),
  T('unlock_obelisk', 'Sun Obelisk', 'Unlock the Sun Obelisk', [280], 'towers', { group: 'Unlocks', tower: 'obelisk' }),
  T('siegecraft', 'Siegecraft', '+6% damage for all towers', [40, 80, 150, 250, 400, 600, 900, 1300], 'towers', { group: 'All towers' }),
  T('optics', "Surveyor's Eye", '+3% range for all towers', [45, 100, 190, 330, 540], 'towers', { group: 'All towers' }),
  T('gears', 'Well-Oiled Gears', 'All towers fire 3% faster', [45, 100, 190, 330, 540], 'towers', { group: 'All towers' }),
  T('hilltop', 'High Command', 'Towers on high ground deal 8% more damage', [60, 130, 250, 430], 'towers', { group: 'All towers' }),
  T('powder', 'Powder Keg', '+5% splash radius for all towers', [50, 110, 210, 360, 580], 'towers', { group: 'All towers' }),
  T('giantbane', 'Giant Slayer', 'Towers deal 6% more damage to bosses', [60, 130, 250, 430, 700], 'towers', { group: 'All towers' }),
  T('armorbane', 'Armor-Piercing Tips', 'Towers deal 5% more damage to armored foes', [55, 120, 230, 400, 640], 'towers', { group: 'All towers' }),
  T('skyhunters', 'Sky Hunters', 'Towers deal 6% more damage to flyers', [50, 110, 210, 360, 580], 'towers', { group: 'All towers' }),
  TRAIN('archer', 'Archery Range'), TRAIN('cannon', 'Gun Foundry'), TRAIN('mage', 'Arcane Academy'), TRAIN('flak', 'Sky Watch'),
  TRAIN('mint', 'Counting House', 'unlock_mint'), TRAIN('firetrap', "Alchemists' Guild", 'unlock_firetrap'), TRAIN('ballista', 'Bolt Works', 'unlock_ballista'),
  TRAIN('barracks', 'Drill Yard', 'unlock_barracks'), TRAIN('catapult', 'Siege Workshop', 'unlock_catapult'), TRAIN('banner', 'Heralds', 'unlock_banner'),
  TRAIN('tesla', 'Storm Lab', 'unlock_tesla'), TRAIN('obelisk', 'Sun Priests', 'unlock_obelisk'),

  // ---- Wardrobe: cosmetics and titles (no gameplay effect)
  ...[
    ['castle:azure', 'Azure Keep', 250], ['castle:verdant', 'Verdant Hold', 300], ['castle:crimson', 'Crimson Citadel', 450],
    ['castle:frost', 'Frostgate', 600], ['castle:sunset', 'Sunset Palace', 800], ['castle:midnight', 'Midnight Spire', 1100],
  ].map(([c, n, cost]) => T('cos_' + c.replace(':', '_'), n, 'Castle style', [cost], 'wardrobe', { group: 'Castles', cosmetic: c })),
  ...[
    ['trail:sunset', 'Sunset Trail', 250], ['trail:gold', 'Golden Trail', 350], ['trail:emerald', 'Emerald Trail', 400],
    ['trail:sakura', 'Blossom Trail', 500], ['trail:ocean', 'Ocean Trail', 650], ['trail:shadow', 'Shadow Trail', 900],
  ].map(([c, n, cost]) => T('cos_' + c.replace(':', '_'), n, 'Arrow trail', [cost], 'wardrobe', { group: 'Arrow trails', cosmetic: c })),
  ...[
    ['kill:coins', 'Coin Shower', 300], ['kill:embers', 'Ember Pop', 450], ['kill:petals', 'Blossom Burst', 600],
    ['kill:shatter', 'Frost Shatter', 750], ['kill:void', 'Void Wisp', 1000],
  ].map(([c, n, cost]) => T('cos_' + c.replace(':', '_'), n, 'Defeat effect', [cost], 'wardrobe', { group: 'Defeat effects', cosmetic: c })),
  ...[
    ['skin:sandstone', 'Sandstone', 400], ['skin:moss', 'Mossy Stone', 550], ['skin:frostglass', 'Frostglass', 800],
    ['skin:obsidian', 'Obsidian', 1100], ['skin:gilded', 'Gilded', 1600],
  ].map(([c, n, cost]) => T('cos_' + c.replace(':', '_'), n, 'Tower style', [cost], 'wardrobe', { group: 'Tower styles', cosmetic: c })),
  ...[
    ['Squire', 150], ['Knight-Errant', 400], ['Shieldbearer', 800], ['Lionheart', 1500], ['Warden of Aldermere', 3000],
  ].map(([t, cost]) => T('title_' + t.toLowerCase().replace(/[^a-z]+/g, ''), t, 'Leaderboard title', [cost], 'wardrobe', { group: 'Titles', title: t })),
];
export const KEEP_BRANCHES = { towers: 'Towers', hero: 'Hero', economy: 'Treasury', defense: 'Defenses', arts: 'Castle Arts', wardrobe: 'Wardrobe' };

export const GIFTS = {
  gold:   { name: 'Gold Cache', desc: '+120 starting gold in your next run.' },
  repair: { name: 'Repair Kit', desc: 'One free full wall repair.' },
  tower:  { name: 'Allied Tower', desc: 'A friend\'s tower fights for you for 10 waves.' },
};
export const GIFT_DAILY_CAP = 5;

export const CLAN_LEVELS = [
  { xp: 0, perk: null },
  { xp: 500, perk: '+5% kill gold' },
  { xp: 1500, perk: '+40 starting gold' },
  { xp: 4000, perk: 'Clan banner on your castle' },
  { xp: 9000, perk: '+1 boon reroll per run' },
  { xp: 18000, perk: '+10% kill gold' },
  { xp: 35000, perk: '+80 starting gold' },
  { xp: 60000, perk: '+8% tower damage' },
];

export const SIEGE = { durationDays: 3, hpPerDay: 400000, bosses: ['The Iron Colossus', 'Queen of Ash', 'The Hollow King', 'Stormwyrm', 'Mother of Rats'] };

// ---------------------------------------------------------------------------
// The Realm: one nation, every player a citizen. Shared weekly and monthly goals.
// Progress is the average of two meters: enemies defeated and waves held.
// ---------------------------------------------------------------------------
export const REALM = {
  name: 'The Realm of Aldermere',
  tiers: [0.25, 0.5, 0.75, 1, 1.5],                       // fractions of the goal
  tierNames: ['Watchfire', 'Palisade', 'Garrison', 'Victory', 'Legend'],
  wavesPerKills: 20,                                       // waves goal = kills goal / 20
  week: {
    label: 'Weekly Muster', floorKills: 5000, perActive: 2500, cap: 40000, minKills: 50,
    rewards: [25, 35, 50, 90, 110],
    perks: [
      { startGold: 25 }, { killGold: 0.03 }, { repairDiscount: 0.1 }, { towerDiscount: 0.03 }, { towerDmg: 0.04 },
    ],
    perkText: ['+25 starting gold', '+3% kill gold', 'Repairs cost 10% less', 'Towers cost 3% less', '+4% tower damage'],
  },
  month: {
    label: 'Monthly Campaign', floorKills: 20000, perActive: 9000, cap: 120000, minKills: 150,
    rewards: [90, 130, 200, 350, 450],
    perks: [
      { castleHpMult: 0.05 }, { startGold: 40 }, { killGold: 0.04 }, { towerDmg: 0.04 }, { weaponDmg: 0.05 },
    ],
    perkText: ['+5% keep HP', '+40 starting gold', '+4% kill gold', '+4% tower damage', '+5% hero damage'],
    topTitles: ['Realm Champion', 'Realm Warden', 'Realm Warden'],
  },
};
