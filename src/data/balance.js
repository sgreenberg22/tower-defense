// Bastion Siege — every tunable number lives here.
// Units: distances in tiles, time in seconds, speeds in tiles/second, rates in shots/second.

export const VERSION = '1.44.0';

export const GAME = {
  step: 1 / 60,
  adapt: 0.6, adaptCap: 2.2, adaptRamp: 22,   // foes toughen with the power of your Keep upgrades: hp × power^adapt (power 1 = a fresh keep)
  buildTime: 30,          // seconds of build countdown (wave 1 is untimed)
  castleHp: 100,
  wallHp: 150,
  startGold: 160,
  boonEvery: 3,           // boon pick after every Nth wave, plus after bosses
  maxEnemies: 110,        // per-wave count cap; overflow folds into HP
  sellRefund: 0.7,
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
// You carry a loadout of ART_SLOTS into each run (choose it when you set up a run). The Keep sells more slots and unlocks.
// `up` is the stat the third Keep upgrade of each unlockable ability improves: dmg ×, dur +seconds, amt ×, rad ×.
export const ART_KEYS = ['Q', 'E', 'Z', 'X', 'C', 'V'];
export const ART_SLOTS = { base: 4, max: 6 };
export const ABILITIES = {
  volley: { name: 'Arrow Rain', icon: '🏹', cd: 26, radius: 1.5, dmg: 0.75, hits: 3, gap: 0.22, aim: true, desc: 'Tap the field: three volleys of arrows hammer an area. Hits flyers.' },
  oil:    { name: 'Boiling Oil', icon: '🔥', cd: 42, radius: 2.3, dmg: 2.4, burn: 0.35, burnTime: 3, slow: 0.5, slowTime: 3.5, desc: 'Pour oil from the walls: scalds and slows everything on the ground near the gate.' },
  // Unlocked in The Keep.
  nova:   { name: 'Frost Nova', icon: '❄', keep: 'unlock_nova', cd: 55, dmg: 0.4, slow: 0.65, slowTime: 4, freeze: 1.0, desc: 'A wave of cold sweeps the whole field: every foe is slowed, ground foes freeze briefly.' },
  horn:   { name: 'War Horn', icon: '📯', keep: 'unlock_horn', cd: 60, duration: 8, rate: 0.35, desc: 'Your towers fire 35% faster for 8 seconds.' },
  grapeshot: { name: 'Grapeshot', icon: '💥', keep: 'unlock_grapeshot', cd: 22, dmg: 0.95, range: 6.5, arc: 0.85, aim: true, buy: 150,
    desc: 'Tap a direction: a blast of shot tears out of the castle in a wide cone, hitting ground and flyers.',
    up: { name: 'Heavy Shot', desc: 'Grapeshot deals 12% more damage', stat: 'dmg', per: 0.12 } },
  mend:   { name: 'Field Repairs', icon: '🔧', keep: 'unlock_mend', cd: 50, wall: 0.2, tower: 0.35, revive: 0.5, buy: 250,
    desc: 'Mid-wave: heals the wall by 20% and every tower by 35%, and rebuilds wrecked towers at half health.',
    up: { name: 'Master Masons', desc: 'Field Repairs heals 15% more', stat: 'amt', per: 0.15 } },
  caltrops: { name: 'Spike Field', icon: '📌', keep: 'unlock_caltrops', cd: 36, radius: 1.7, duration: 10, dps: 0.35, slow: 0.55, aim: true, buy: 300,
    desc: 'Tap the road: a field of spikes slows ground foes by 55% and cuts them for 10 seconds.',
    up: { name: 'Barbed Spikes', desc: 'Spike Field lasts 1.5s longer', stat: 'dur', per: 1.5 } },
  smite:  { name: 'Smite', icon: '⚡', keep: 'unlock_smite', cd: 45, dmg: 3.2, targets: 3, bossMult: 1.5, buy: 450,
    desc: 'Lightning strikes the three toughest foes on the field at once. Great against bosses and armored brutes.',
    up: { name: 'Wrath', desc: 'Smite deals 12% more damage', stat: 'dmg', per: 0.12 } },
  tithe:  { name: 'Royal Tithe', icon: '💰', keep: 'unlock_tithe', cd: 70, duration: 12, gold: 0.6, buy: 550,
    desc: 'For 12 seconds every kill pays 60% more gold. Use it when a big wave is about to fall.',
    up: { name: 'Gilded Hours', desc: 'Royal Tithe lasts 1.5s longer', stat: 'dur', per: 1.5 } },
  plague: { name: 'Plague Flask', icon: '☣', keep: 'unlock_plague', cd: 40, radius: 1.9, duration: 9, dps: 0.3, vuln: 0.25, aim: true, buy: 650,
    desc: 'Tap the field: a toxic cloud poisons everything inside, flyers too, and they take 25% more damage from all sources.',
    up: { name: 'Virulence', desc: 'Plague Flask covers 8% more ground', stat: 'rad', per: 0.08 } },
  meteor: { name: 'Meteor', icon: '☄', keep: 'unlock_meteor', cd: 75, radius: 2.1, dmg: 6.5, delay: 1.3, burn: 0.3, burnTime: 3, stun: 1, aim: true, buy: 800,
    desc: 'Tap the field: a meteor crashes down after a short delay, crushing, burning and stunning ground foes. Huge damage.',
    up: { name: 'Heavier Rock', desc: 'Meteor deals 12% more damage', stat: 'dmg', per: 0.12 } },
  aegis:  { name: 'Aegis', icon: '🛡', keep: 'unlock_aegis', cd: 80, duration: 8, reduce: 0.8, buy: 900,
    desc: 'For 8 seconds the wall and castle take 80% less damage from anything that gets through. Your panic button.',
    up: { name: 'Blessed Shield', desc: 'Aegis lasts 1.5s longer', stat: 'dur', per: 1.5 } },
  storm:  { name: 'Thunderstorm', icon: '🌩', keep: 'unlock_storm', cd: 65, duration: 8, dmg: 0.7, gap: 0.35, buy: 1000,
    desc: 'For 8 seconds lightning keeps striking random foes anywhere on the field, flyers included.',
    up: { name: 'Charged Skies', desc: 'Thunderstorm deals 12% more damage', stat: 'dmg', per: 0.12 } },
  focus:  { name: "Hunter's Focus", icon: '🎯', keep: 'unlock_focus', cd: 55, duration: 8, dmg: 0.6, buy: 1100,
    desc: 'For 8 seconds your own weapon never runs out of arrows and hits 60% harder. For when you are doing the work yourself.',
    up: { name: 'Steady Hands', desc: "Hunter's Focus lasts 1.5s longer", stat: 'dur', per: 1.5 } },
  stasis: { name: 'Time Stop', icon: '⏳', keep: 'unlock_stasis', cd: 95, duration: 3, buy: 1400,
    desc: 'Time freezes for 3 seconds: every foe on the field, bosses and flyers included, stops dead while your towers keep firing.',
    up: { name: 'Longer Moment', desc: 'Time Stop lasts 0.5s longer', stat: 'dur', per: 0.5 } },
  // v1.40
  skychains: { name: 'Sky Chains', icon: '⛓\uFE0F', keep: 'unlock_skychains', cd: 48, duration: 5, dmg: 1.0, buy: 350,
    desc: 'Chains lash out of the sky: every flyer on the field takes damage and is dragged to the ground for 5 seconds, where every tower, troop and the wall can reach it.',
    up: { name: 'Heavier Links', desc: 'Sky Chains hold flyers 0.75s longer', stat: 'dur', per: 0.75 } },
  gale: { name: 'Gale Force', icon: '🌬', keep: 'unlock_gale', cd: 34, radius: 1.8, push: 2.6, dmg: 0.3, aim: true, buy: 400,
    desc: 'Tap the field: a howling wind blows every foe there 2.6 tiles back down the road (bosses half as far), flyers too.',
    up: { name: 'Gathering Storm', desc: 'Gale Force covers 8% more ground', stat: 'rad', per: 0.08 } },
  inferno: { name: 'Inferno', icon: '🌋', keep: 'unlock_inferno', cd: 38, radius: 1.5, duration: 7, dps: 0.28, burn: 0.2, aim: true, buy: 500,
    desc: 'Tap the road: the ground splits and burns for 7 seconds. Ground foes inside are scorched and set on fire, and fire boons count.',
    up: { name: 'Deeper Fissure', desc: 'Inferno burns 1s longer', stat: 'dur', per: 1 } },
  barrage: { name: 'Cannon Barrage', icon: '💣', keep: 'unlock_barrage', cd: 44, radius: 2.2, shells: 8, splash: 0.8, dmg: 1.0, spread: 1.6, aim: true, buy: 600,
    desc: 'Tap the field: the castle guns drop eight shells across the area over a second and a half. Each one blasts every ground foe near it.',
    up: { name: 'Double Charge', desc: 'Cannon Barrage deals 12% more damage', stat: 'dmg', per: 0.12 } },
  quake: { name: 'Earthquake', icon: '⛰\uFE0F', keep: 'unlock_quake', cd: 52, radius: 2.6, dmg: 1.6, stun: 1.4, aim: true, buy: 700,
    desc: 'Tap the field: the ground heaves. Ground foes are hurt and knocked flat for 1.4s, burrowing sappers are thrown to the surface, and barricades crumble.',
    up: { name: 'Fault Line', desc: 'Earthquake deals 12% more damage', stat: 'dmg', per: 0.12 } },
  hymn: { name: 'Battle Hymn', icon: '🎶', keep: 'unlock_hymn', cd: 62, duration: 8, boost: 0.3, buy: 750,
    desc: 'The castle choir sings: for 8 seconds towers, troops and your own shots deal 30% more damage. Pairs well with the War Horn.',
    up: { name: 'Rousing Chorus', desc: 'Battle Hymn lasts 1.5s longer', stat: 'dur', per: 1.5 } },
};

// Breakthrough: stacking every tower at the spawn point no longer wins. From the early waves a share of ground foes
// AMBUSH (they appear part-way down the road, behind your forward towers) and a share are VANGUARD (they sprint through the
// opening stretch of road behind a shield). Both grow with the wave number up to a cap.
export const BREAKTHROUGH = {
  ambushFrom: 6, ambushBase: 0.07, ambushPerWave: 0.006, ambushCap: 0.22, ambushAt: [0.28, 0.58],   // spawn between 28% and 58% of the way down
  vanguardFrom: 5, vanguardBase: 0.06, vanguardPerWave: 0.005, vanguardCap: 0.2, vanguardSpeed: 1.55, vanguardShield: 0.3, vanguardUntil: 0.45,
};
export const WAVE = {
  countBase: 6, countLin: 1.65, countQuad: 0.035,
  hpLin: 0.34, hpExpBase: 1.036, hpExpStart: 11,
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
  renownModeMult: { endurance: 0.3, laststand: 0.75, assault: 0.6 },   // Endurance paid ~4x Infinite per minute; Last Stand ~1.3x
  renownDailyBonus: 0.5, renownDailyCap: 60,   // first run of the day pays +50% (capped)
  leakDmgPerWave: 0.02,
  bossBreachWall: 2,     // v1.30.1: a boss that breaks through hits the wall twice as hard ...
  bossBreachSpill: 0.25, // ... and this share of its blow reaches the keep even while the wall holds
};

// damage: base per shot. rate: shots/s. targets: 'g' ground, 'a' air, 'ga' both.
export const TOWERS = {
  archer: {
    name: 'Archer Tower', cost: 50, dmg: 8, rate: 1.4, range: 2.8, type: 'physical', targets: 'ga',
    proj: 'arrow', projSpeed: 12, hp: 100, unlockWave: 1, keep: null, color: '#3d7bd9',
    desc: 'Fast, cheap, hits flyers.',
    specs: {
      sharpshooter: { name: 'Sharpshooter', desc: '+1.5 range, ×2 damage, 30% crits for ×2.5. Aims at the strongest foe by default.', range: 1.5, dmgMult: 2, critChance: 0.3, critMult: 2.5, target: 'strong' },
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
    name: 'Mage Tower', cost: 100, dmg: 24, rate: 0.85, range: 2.8, type: 'magic', targets: 'ga', chain: 3, chainRange: 1.6, chainFalloff: 0.78,
    hex: 0.18, hexTime: 3.5,
    proj: 'orb', projSpeed: 10, hp: 90, unlockWave: 3, keep: null, color: '#8a4fd8',
    desc: 'Chaining magic bolts that ignore armor and Hex every foe they touch: hexed foes take +18% damage from everything for 3.5s. Put one where your other towers fire.',
    specs: {
      storm: { name: 'Storm Caller', desc: '+4 chain jumps, hexes a crowd at once.', chainAdd: 4 },
      lance: { name: 'Arcane Lance', desc: 'Single target ×2.2 damage, ignores magic resist, Hex +12%.', chainSet: 0, dmgMult: 2.2, pierceMr: true, hexAdd: 0.12 },
    },
  },
  flak: {
    name: 'Flak Battery', cost: 85, dmg: 22, rate: 1.4, range: 3.2, splash: 1.0, type: 'physical', targets: 'a',
    proj: 'flak', projSpeed: 14, hp: 110, unlockWave: 6, keep: null, color: '#c76b2e',
    desc: 'Three times an archer\'s punch against anything with wings, and the blast hits whole flocks. Cannot hit ground.',
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
    name: 'Barracks', cost: 110, soldiers: 3, soldierHp: 100, soldierDmg: 12, soldierRate: 1, respawn: 6, range: 2.4,
    pin: 0.3,            // enemies held by a soldier take this much more damage from everything (+15% per tier)
    type: 'physical', targets: 'g', hp: 160, unlockWave: 9, keep: 'unlock_barracks', color: '#3a8a52',
    desc: 'Soldiers hold enemies in place. Held enemies take extra damage from every tower. Move the rally flag to choose where.',
    specs: {
      knights: { name: 'Knights', desc: '4 armored knights with double HP.', soldiersSet: 4, hpMult: 2, armor: 40 },
      rangers: { name: 'Rangers', desc: 'Soldiers shoot, hitting flyers too. Held foes take 50% more pin damage.', ranged: true, dmgMult: 1.5, pinMult: 1.5 },
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
  artillery: {
    name: 'Artillery', cost: 150, dmg: 36, rate: 0.5, range: 4.6, minRange: 1.3, splash: 0.85, multi: 3, type: 'physical', targets: 'g',
    proj: 'boulder', projSpeed: 9, hp: 120, unlockWave: 14, keep: 'unlock_banner', color: '#b4472f',
    desc: 'A howitzer battery. Every salvo drops three shells on three different ground foes at long range, each with its own blast. Great against spread-out lines, and it covers the whole road behind your front.',
    tip: 'It cannot hit anything close, so keep it a few tiles behind the front. It shoots foes the moment they step into range, so it is ideal for catching anything that slips past your forward towers.',
    specs: {
      barrage: { name: 'Rolling Barrage', desc: 'Fires 5 shells per salvo, +20% rate.', multi: 5, rateMult: 1.2 },
      heavy: { name: 'Heavy Shells', desc: '×1.8 damage, +40% blast, stuns for 0.5s.', dmgMult: 1.8, splashMult: 1.4, stun: 0.5 },
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
      sunlance: { name: 'Sunlance', desc: 'Ramps to ×8, twice as fast.', rampMaxSet: 8, rampMult: 2 },
      prism: { name: 'Prism', desc: 'Splits into 3 beams.', beams: 3 },
    },
  },
  gatling: {
    name: 'Gatling Nest', cost: 230, dmg: 6.5, rate: 2.4, range: 2.6, type: 'physical', targets: 'ga', proj: 'arrow', projSpeed: 16,
    heatMax: 2.2, heatTime: 4, hp: 120, unlockWave: 20, keep: 'unlock_gatling', color: '#b0783a',
    desc: 'Spins up the longer it keeps firing: its fire rate climbs to ×3.2, then cools when it has nothing to shoot. Hits ground and flyers.',
    tip: 'Best where foes keep streaming past it. Place it where the road bends close to the plot so it never goes cold.',
    specs: {
      overdrive: { name: 'Overdrive', desc: 'Spins up to ×6 fire rate.', heatMaxSet: 5 },
      piercer: { name: 'Armor Piercer', desc: '+60% damage, ×1.6 against armored foes.', dmgMult: 1.6, armoredMult: 1.6 },
    },
  },
  venom: {
    name: 'Venom Spire', cost: 190, dmg: 6, rate: 1.4, range: 2.9, type: 'physical', targets: 'ga', proj: 'orb', projSpeed: 11,
    poison: 16, poisonPct: 0.006, poisonTime: 5, poisonCap: 4, hp: 100, unlockWave: 16, keep: 'unlock_venom', color: '#6fae3a',
    desc: 'Its poison ignores armor and magic resist, stacks up to 4 times, and also eats a slice of the victim\'s max health every second (0.6% per stack; a third of that on bosses). Melts shield-bearers, golems and anything that out-scales your damage.',
    tip: 'Poison keeps ticking after the spire stops shooting, so it pairs well with slows that keep foes in range.',
    specs: {
      blight: { name: 'Blight', desc: 'Poison stacks to 6 and lasts 2s longer.', poisonCapSet: 6, poisonTimeAdd: 2 },
      contagion: { name: 'Contagion', desc: 'Poisoned foes spread it to their neighbors when they die.', poisonSpread: true },
    },
  },
  trebuchet: {
    name: 'Trebuchet', cost: 380, dmg: 250, rate: 0.14, range: 7.2, minRange: 2.4, splash: 1.1, type: 'physical', targets: 'g',
    proj: 'boulder', projSpeed: 5, hp: 130, unlockWave: 30, keep: 'unlock_trebuchet', color: '#8a6b3f', bossMult: 2.2, target: 'strong',
    desc: 'Hurls a monstrous stone at the toughest ground enemy within its enormous range. Deals ×2.2 to bosses. Very slow.',
    tip: 'It shoots the strongest foe by default. Its range covers most of the map, so it can sit anywhere.',
    specs: {
      titan: { name: 'Titan Shot', desc: '×1.6 damage and stuns for 1.5s.', dmgMult: 1.6, stun: 1.5 },
      hellfire: { name: 'Hellfire Pitch', desc: 'Leaves burning ground for 5s, +30% rate.', fireField: 5, rateMult: 1.3 },
    },
  },
  voidwell: {
    name: 'Void Well', cost: 280, dmg: 14, rate: 0.5, range: 2.2, type: 'magic', targets: 'ga', pulse: true, pull: 1.1,
    hp: 120, unlockWave: 26, keep: 'unlock_voidwell', color: '#5b3a9a',
    desc: 'Pulses a rift that drags every foe in range backwards along the road and chips them with magic. Bosses resist half, and foes get used to it: repeat pulls within 6s pull 40% less.',
    tip: 'Every tile it drags foes back is another second under fire. Put it where many towers overlap.',
    specs: {
      singularity: { name: 'Singularity', desc: 'Pulls twice as far and hits for ×2.', pullMult: 2, dmgMult: 2 },
      horizon: { name: 'Event Horizon', desc: '+1 range, and foes inside are slowed 45%.', range: 1, slowSet: 0.45 },
    },
  },
  sanctum: {
    name: 'Sanctum', cost: 200, aura: 2.4, heal: 0.03, wallHeal: 0.004, hp: 160, unlockWave: 22, keep: 'unlock_sanctum', color: '#e8e0b0', passive: true,
    desc: 'A shrine that mends nearby towers (3% of their health per second) and the wall (0.4% per second) during waves.',
    tip: 'Late waves wreck towers faster than you can rebuild. Put a Sanctum in the middle of your cluster.',
    specs: {
      lifebloom: { name: 'Lifebloom', desc: 'Heals twice as fast, +0.6 reach.', healMult: 2, auraAdd: 0.6 },
      warding: { name: 'Warding', desc: 'Towers in reach take 40% less damage and shake off sabotage.', ward: 0.4, cleanse: true },
    },
  },
};

// Flagged plots on the map: a tower built on one fires faster, and support towers do much more.
export const FLAG = { rate: 0.2, barracksSoldiers: 1, barracksRespawn: 0.6, bannerRadius: 1.3 };

export const TOWER_ORDER = ['archer', 'cannon', 'mage', 'flak', 'mint', 'firetrap', 'ballista', 'barracks', 'catapult', 'artillery', 'tesla', 'frost', 'obelisk', 'venom', 'sanctum', 'gatling', 'voidwell', 'trebuchet'];

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
  // Hardening: each of these mastery stars adds +20% max health and 5% less damage taken (so ★15 = +60% HP, −14% damage).
  harden: { stars: [5, 10, 15], hp: 0.2, resist: 0.05 },
};
export function hardening(mastery = 0) {
  const n = TIER.harden.stars.filter((s) => mastery >= s).length;
  return { n, hp: 1 + TIER.harden.hp * n, resist: 1 - Math.pow(1 - TIER.harden.resist, n) };
}

// Mastery perks: on top of the ×1.16 damage every ★ gives, each emplacement earns a special bonus at these star counts.
// Keys ending in "Mult" multiply, everything else adds (true flags switch something on). Applied in Game.computeStats.
export const PERK_STARS = [3, 6, 10, 15];
export const MASTERY_PERKS = {
  archer:   [{ name: 'Fletching', desc: '+0.3 range', rangeAdd: 0.3 }, { name: 'Hawk Eye', desc: '+12% crit chance', critAdd: 0.12 }, { name: 'Twin Quivers', desc: 'Fires at one more target', multiAdd: 1 }, { name: 'Legend of the Bow', desc: '+50% damage, +15% rate', dmgMult: 1.5, rateMult: 1.15 }],
  cannon:   [{ name: 'Heavy Powder', desc: '+15% splash radius', splashMult: 1.15 }, { name: 'Rapid Loaders', desc: '+20% rate', rateMult: 1.2 }, { name: 'Siege Shells', desc: '×1.4 vs armored, shreds 10 armor', armoredMult: 1.4, shredAdd: 10 }, { name: 'Thunder Gods', desc: '+30% splash, +40% damage', splashMult: 1.3, dmgMult: 1.4 }],
  mage:     [{ name: 'Forked Bolts', desc: '+1 chain jump', chainAdd: 1 }, { name: 'Arcane Focus', desc: '+0.4 range', rangeAdd: 0.4 }, { name: 'Spell Surge', desc: '+30% damage, ignores magic resist', dmgMult: 1.3, pierceMr: true }, { name: 'Archmage', desc: '+2 chain jumps, +20% rate', chainAdd: 2, rateMult: 1.2 }],
  flak:     [{ name: 'Wide Burst', desc: '+20% splash radius', splashMult: 1.2 }, { name: 'Quick Gunners', desc: '+25% rate', rateMult: 1.25 }, { name: 'Wyvern Slayers', desc: '+30% damage to bosses', bossMult: 1.3 }, { name: 'Sky Fortress', desc: 'Fires at one more target', multiAdd: 1 }],
  mint:     [{ name: 'Fatter Coffers', desc: '+20% income', incomeMult: 1.2 }, { name: 'Bounty Fund', desc: '+2% kill gold for the kingdom', killGoldAdd: 0.02 }, { name: 'Grand Vault', desc: '+40% income', incomeMult: 1.4 }, { name: 'Golden Age', desc: '+4% kill gold, +30% income', killGoldAdd: 0.04, incomeMult: 1.3 }],
  firetrap: [{ name: 'Hot Coals', desc: '+30% burn damage', burnMult: 1.3 }, { name: 'Slow Burn', desc: 'Burns 1.5s longer', burnTimeAdd: 1.5 }, { name: 'Wildfire', desc: 'Flames spread when foes die', spread: true }, { name: 'Dragonfire', desc: '+80% burn damage', burnMult: 1.8 }],
  ballista: [{ name: 'Barbed Bolts', desc: '+1 pierce', pierceAdd: 1 }, { name: 'Torsion Springs', desc: '+25% damage', dmgMult: 1.25 }, { name: 'Giant Slayer', desc: '+40% damage to bosses', bossMult: 1.4 }, { name: 'Spear Storm', desc: '+3 pierce, +30% rate', pierceAdd: 3, rateMult: 1.3 }],
  barracks: [{ name: 'Conscripts', desc: '+1 soldier', soldiersAdd: 1 }, { name: 'Plate Armor', desc: '+40% soldier health', hpMult: 1.4 }, { name: 'Shield Wall', desc: 'Held foes take 15% more damage', pinAdd: 0.15 }, { name: 'Elite Guard', desc: '+1 soldier, +50% soldier damage', soldiersAdd: 1, soldierDmgMult: 1.5 }],
  catapult: [{ name: 'Counterweights', desc: '+15% splash radius', splashMult: 1.15 }, { name: 'Quick Winch', desc: '+25% rate', rateMult: 1.25 }, { name: 'Shock Stones', desc: 'Stuns 0.5s longer', stunAdd: 0.5 }, { name: 'Earthshaker', desc: '+40% damage, +20% splash', dmgMult: 1.4, splashMult: 1.2 }],
  artillery: [{ name: 'Longer Barrels', desc: '+0.4 range', rangeAdd: 0.4 }, { name: 'Quick Loaders', desc: '+20% rate', rateMult: 1.2 }, { name: 'Wide Shells', desc: '+25% blast radius', splashMult: 1.25 }, { name: 'Firestorm', desc: 'Fires 2 more shells, +30% damage', multiAdd: 2, dmgMult: 1.3 }],
  tesla:    [{ name: 'Copper Coils', desc: '+1 chain jump', chainAdd: 1 }, { name: 'Static Charge', desc: '+10% stun chance', stunChanceAdd: 0.1 }, { name: 'Surge', desc: '+35% damage', dmgMult: 1.35 }, { name: 'Tempest', desc: '+3 chain jumps, +20% rate', chainAdd: 3, rateMult: 1.2 }],
  frost:    [{ name: 'Deep Chill', desc: '+5% slow', slowAdd: 0.05 }, { name: 'Far Reach', desc: '+0.4 range', rangeAdd: 0.4 }, { name: 'Brittle Ice', desc: 'Chilled foes take 15% more damage', vulnAdd: 0.15 }, { name: 'Winter Heart', desc: '+15% freeze chance, ×2 damage', freezeAdd: 0.15, dmgMult: 2 }],
  obelisk:  [{ name: 'Burning Focus', desc: 'Ramps +1 higher', rampAdd: 1 }, { name: 'Long Sight', desc: '+0.4 range', rangeAdd: 0.4 }, { name: 'Second Sun', desc: 'One more beam', beamsAdd: 1 }, { name: 'Dawn Eternal', desc: 'Ramps +2 higher, +40% damage', rampAdd: 2, dmgMult: 1.4 }],
  gatling:  [{ name: 'Oiled Gears', desc: 'Top spin-up speed +0.5×', heatAdd: 0.5 }, { name: 'Faster Crank', desc: '+15% rate', rateMult: 1.15 }, { name: 'Hardened Slugs', desc: '+30% damage', dmgMult: 1.3 }, { name: 'Storm of Lead', desc: 'Fires at one more target, top spin-up speed +1×', multiAdd: 1, heatAdd: 1 }],
  venom:    [{ name: 'Potent Venom', desc: '+30% poison damage', poisonMult: 1.3 }, { name: 'Deep Wounds', desc: 'Poison stacks one higher', capAdd: 1 }, { name: 'Lingering Toxin', desc: 'Poison lasts 1.5s longer', timeAdd: 1.5 }, { name: 'Black Death', desc: '+60% poison, stacks one higher', poisonMult: 1.6, capAdd: 1 }],
  trebuchet:[{ name: 'Bigger Stones', desc: '+20% damage', dmgMult: 1.2 }, { name: 'Greased Winch', desc: '+20% rate', rateMult: 1.2 }, { name: 'Shatterstone', desc: '+30% splash radius', splashMult: 1.3 }, { name: 'Titan Slayer', desc: '+50% boss damage, +30% damage', bossMult: 1.5, dmgMult: 1.3 }],
  voidwell: [{ name: 'Gravity Well', desc: '+25% pull', pullMult: 1.25 }, { name: 'Wide Rift', desc: '+0.4 range', rangeAdd: 0.4 }, { name: 'Dark Matter', desc: '+60% damage', dmgMult: 1.6 }, { name: 'Black Hole', desc: '+50% pull, foes take 20% more damage', pullMult: 1.5, vulnAdd: 0.2 }],
  sanctum:  [{ name: 'Blessed Water', desc: '+30% healing', healMult: 1.3 }, { name: 'Wider Grounds', desc: '+0.4 reach', rangeAdd: 0.4 }, { name: 'Mason Saints', desc: 'Wall heals twice as fast', wallMult: 2 }, { name: 'Divine Light', desc: '+40% healing, towers take 20% less damage', healMult: 1.4, wardAdd: 0.2 }],
};
// Sum a tower's earned perks into one modifier object (multipliers default to 1, additions to 0).
export function masteryMods(type, stars = 0) {
  const M = {};
  for (const [i, perk] of (MASTERY_PERKS[type] || []).entries()) {
    if (stars < PERK_STARS[i]) break;
    for (const [k, v] of Object.entries(perk)) {
      if (k === 'name' || k === 'desc') continue;
      if (typeof v === 'boolean') M[k] = v;
      else if (k.endsWith('Mult')) M[k] = (M[k] ?? 1) * v;
      else M[k] = (M[k] ?? 0) + v;
    }
  }
  return new Proxy(M, { get: (o, k) => (k in o ? o[k] : typeof k === 'string' && k.endsWith('Mult') ? 1 : typeof k === 'string' && (k === 'spread' || k === 'pierceMr') ? false : 0) });
}

export const ENEMIES = {
  grunt:     { name: 'Grunt', hp: 30, speed: 1.0, armor: 0, mr: 0, bounty: 3, points: 10, dmg: 2, size: 0.28, unlock: 1, weight: 10, color: '#d9473b', desc: 'The backbone of every horde. Nothing special, but never alone.' },
  runner:    { name: 'Runner', hp: 18, speed: 1.9, armor: 0, mr: 0, bounty: 2, points: 8, dmg: 1, size: 0.22, unlock: 3, weight: 6, color: '#f08a3c', desc: 'Fast and fragile. Slows and early towers catch them.' },
  shield:    { name: 'Shieldbearer', hp: 55, speed: 0.8, armor: 45, mr: 0, bounty: 5, points: 15, dmg: 2, size: 0.3, unlock: 5, weight: 5, color: '#8b95a8', armored: true, desc: 'Heavy armor shrugs off arrows. Magic, poison and armor-piercing hit hard.' },
  archer:    { name: 'Raider Archer', hp: 28, speed: 0.95, armor: 0, mr: 0, bounty: 5, points: 15, dmg: 2, size: 0.26, unlock: 7, weight: 4, color: '#5e8f3a', shoots: { range: 2.4, dmg: 5, cd: 1.3 }, desc: 'Shoots your towers from the road. Kill it before it chips them down.' },
  wyvern:    { name: 'Wyvern', hp: 35, speed: 1.2, armor: 0, mr: 10, bounty: 5, points: 16, dmg: 3, size: 0.3, unlock: 8, weight: 4, color: '#7a4fb5', air: true, desc: 'Flies straight for the keep, over the road and the wall. Needs anti-air.' },
  cavalry:   { name: 'Cavalry', hp: 60, speed: 1.7, armor: 15, mr: 0, bounty: 6, points: 18, dmg: 3, size: 0.34, unlock: 9, weight: 4, color: '#a6532c', desc: 'Fast and tough. Barracks and slows blunt the charge.' },
  bomber:    { name: 'Powder Goblin', hp: 22, speed: 1.55, armor: 0, mr: 0, bounty: 4, points: 14, dmg: 2, size: 0.24, unlock: 11, weight: 2.4, color: '#c2452d', blast: { range: 1.15, dmg: 14, stun: 1.2 }, desc: 'Carries a powder keg. When it dies it blows up, hurting and stunning towers beside it. Kill it early, far from your towers.' },
  healer:    { name: 'Field Healer', hp: 40, speed: 0.9, armor: 0, mr: 20, bounty: 7, points: 20, dmg: 2, size: 0.26, unlock: 12, weight: 2, color: '#e6e1d3', heal: { range: 1.5, pct: 0.06, cd: 1 }, desc: 'Heals everyone nearby. A priority target for your own bow.' },
  harpy:     { name: 'Harpy', hp: 22, speed: 1.6, armor: 0, mr: 0, bounty: 3, points: 12, dmg: 2, size: 0.25, unlock: 13, weight: 3, color: '#c98a4b', air: true, flock: true, desc: 'Flies in screeching flocks, fast and low. Splash anti-air shreds them.' },
  ram:       { name: 'Battering Ram', hp: 220, speed: 0.5, armor: 30, mr: -20, bounty: 15, points: 40, dmg: 15, wallMult: 3, size: 0.42, unlock: 14, weight: 1.2, color: '#6d4a2b', armored: true, desc: 'Triple damage to your wall. Weak to magic.' },
  thief:     { name: 'Gold Thief', hp: 45, speed: 1.75, armor: 0, mr: 0, bounty: 26, points: 30, dmg: 0, size: 0.24, unlock: 15, weight: 0.45, color: '#2f6b4f', steal: { pct: 0.12, min: 20, max: 400 }, desc: 'Never hurts the wall. If it escapes it runs off with some of your gold; catch it and it spills a fortune.' },
  sapper:    { name: 'Sapper', hp: 45, speed: 1.2, armor: 0, mr: 0, bounty: 8, points: 22, dmg: 2, size: 0.25, unlock: 16, weight: 2, color: '#3b3f4a', sabotage: { range: 1.3, time: 4, cd: 6 }, desc: 'Sabotages a nearby tower, switching it off for a few seconds.' },
  warchief:  { name: 'Warchief', hp: 90, speed: 0.9, armor: 20, mr: 0, bounty: 10, points: 30, dmg: 4, size: 0.34, unlock: 18, weight: 1.2, color: '#b8233a', aura: { range: 1.8, speed: 0.2, armor: 15 }, desc: 'Its banner makes nearby foes faster and tougher.' },
  burrower:  { name: 'Tunneler', hp: 65, speed: 1.0, armor: 25, mr: 0, bounty: 7, points: 22, dmg: 3, size: 0.3, unlock: 20, weight: 1.6, color: '#8a6a4a', burrow: { every: 4.5, time: 2, speed: 1.7 }, desc: 'Digs under the road every few seconds: towers and your bow cannot target it underground. Traps, splash and slows still reach it.' },
  warlock:   { name: 'Warlock', hp: 70, speed: 0.85, armor: 0, mr: 50, bounty: 10, points: 30, dmg: 3, size: 0.28, unlock: 22, weight: 1.2, color: '#4b2d7a', ward: { range: 1.6, pct: 0.25, cd: 5 }, desc: 'Wards friends with bubble shields. Magic bursts bubbles twice as fast, but the Warlock itself resists magic: shoot it with arrows or cannons.' },
  brood:     { name: 'Broodmother', hp: 120, speed: 0.8, armor: 10, mr: 0, bounty: 8, points: 25, dmg: 3, size: 0.36, unlock: 26, weight: 1.2, color: '#4a6b3d', split: { into: 'spider', n: 3 }, desc: 'Bursts into three spiderlings when it dies.' },
  spider:    { name: 'Spiderling', hp: 20, speed: 1.6, armor: 0, mr: 0, bounty: 1, points: 4, dmg: 1, size: 0.18, unlock: 999, weight: 0, color: '#6f8f4a', desc: 'Small, fast and many.' },
  golem:     { name: 'Stone Golem', hp: 400, speed: 0.55, armor: 50, mr: 30, bounty: 25, points: 60, dmg: 10, size: 0.46, unlock: 30, weight: 0.8, color: '#7d7f86', armored: true, desc: 'A walking wall. Break it with poison, armor-piercing shots and Ballistas.' },
  troll:     { name: 'Bog Troll', hp: 300, speed: 0.6, armor: 15, mr: 0, bounty: 18, points: 45, dmg: 8, size: 0.44, unlock: 34, weight: 0.9, color: '#5f8a5a', regen: 0.045, desc: 'Regenerates fast, unless it is burning or poisoned. Bring fire.' },
  wraith:    { name: 'Phase Wraith', hp: 80, speed: 0.9, armor: 0, mr: 40, bounty: 10, points: 30, dmg: 4, size: 0.3, unlock: 38, weight: 1.1, color: '#7fa6c9', blink: { dist: 1.6, cd: 4 }, desc: 'Blinks forward along the road every few seconds, slipping past soldiers. Burst it down.' },
  skirmisher:{ name: 'Skirmisher', hp: 38, speed: 1.35, armor: 0, mr: 0, bounty: 5, points: 16, dmg: 2, size: 0.25, unlock: 10, weight: 4, color: '#b8863a', hunts: { range: 2.7, dmg: 7, cd: 1.5 }, desc: 'Hurls javelins at your troops from a distance. Keep your garrison under bow cover, or hunt them down with cavalry.' },
  ogre:      { name: 'Ogre Brute', hp: 360, speed: 0.65, armor: 20, mr: 0, bounty: 20, points: 50, dmg: 12, size: 0.46, unlock: 24, weight: 1.1, color: '#a0794f', cleave: { range: 1.15, dmg: 22, cd: 2.6 }, desc: 'Every swing smashes all the troops around it. Shoot it from range, or hold it with knights.' },
  gargoyle:  { name: 'Gargoyle', hp: 110, speed: 1.15, armor: 40, mr: 15, bounty: 12, points: 32, dmg: 4, size: 0.32, unlock: 28, weight: 1.6, color: '#8b94a3', air: true, armored: true, desc: 'A flying statue. Plain arrows bounce off. Use magic, Crossbowmen and Griffon Riders.' },
  dread:     { name: 'Dread Knight', hp: 280, speed: 0.85, armor: 35, mr: 10, bounty: 22, points: 55, dmg: 9, size: 0.36, unlock: 36, weight: 1.3, color: '#3b3552', armored: true, crush: 1.8, desc: 'Cuts through soldiers: whoever holds it takes nearly double damage. Slow it, or break its armor.' },
  // ---- v1.35 · Warbands, engines and the restless dead (inspired by the long wars of fantasy and the Middle Ages)
  warg:      { name: 'Warg', hp: 55, speed: 2.1, armor: 0, mr: 0, bounty: 4, points: 14, dmg: 2, size: 0.26, unlock: 17, weight: 3, color: '#6b6258', flock: true, desc: 'Wolves bred for the hunt. They run in packs, faster than any horse. Slows and Barracks blunt them, splash cuts them down.' },
  pavise:    { name: 'Pavise Bearer', hp: 150, speed: 0.7, armor: 35, mr: 0, bounty: 9, points: 26, dmg: 2, size: 0.32, unlock: 21, weight: 2, color: '#7d6a45', armored: true, aura: { range: 1.7, speed: 0, armor: 20 }, desc: 'Plants a man-high shield for the archers behind it. Foes close to it shrug off arrows. Magic and Ballistas break the line.' },
  rat:       { name: 'Plague Rat', hp: 12, speed: 2.0, armor: 0, mr: 0, bounty: 1, points: 3, dmg: 1, size: 0.16, unlock: 23, weight: 3, color: '#7a6a55', flock: true, desc: 'Black-death rats pour out of the ruins by the dozen. Tiny, fast and everywhere: splash and traps.' },
  mangonel:  { name: 'Mangonel Crew', hp: 130, speed: 0.55, armor: 10, mr: 0, bounty: 11, points: 30, dmg: 3, size: 0.36, unlock: 25, weight: 1.4, color: '#8a6a3a', shoots: { range: 4.2, dmg: 22, cd: 4.5 }, striker: true, desc: 'Hurls boulders at your towers from far down the road. Slow, and soft once you reach it: Ballistas, Catapults and your own bow out-range it.' },
  berserker: { name: 'Orc Berserker', hp: 120, speed: 1.0, armor: 5, mr: 0, bounty: 8, points: 24, dmg: 4, size: 0.3, unlock: 27, weight: 2, color: '#6a7a3a', rage: { below: 0.5, speed: 1.9 }, desc: 'Fights on past all sense. Below half health it goes wild and sprints. Kill it in one burst, or slow it.' },
  escalade:  { name: 'Escalade Team', hp: 110, speed: 0.9, armor: 15, mr: 0, bounty: 8, points: 24, dmg: 5, size: 0.3, unlock: 31, weight: 1.5, color: '#9a7a4a', ignoreWall: true, desc: 'Carries ladders and goes right over the wall, striking the keep itself. The wall will not save you from them.' },
  siegetower:{ name: 'Siege Tower', hp: 620, speed: 0.4, armor: 40, mr: 0, bounty: 30, points: 70, dmg: 12, wallMult: 2, size: 0.48, unlock: 33, weight: 0.8, color: '#5a4630', armored: true, split: { into: 'grunt', n: 4 }, striker: true, desc: 'A rolling fortress packed with soldiers. Double damage to the wall, and four grunts pour out when it falls.' },
  wight:     { name: 'Barrow Wight', hp: 95, speed: 0.8, armor: 0, mr: 55, bounty: 12, points: 34, dmg: 4, size: 0.3, unlock: 40, weight: 1.2, color: '#9fb8a4', drain: { range: 1.7, time: 3.2, cd: 4 }, desc: 'A grave-cold touch. Towers beside it fire at half speed for a few seconds. Resists magic: use arrows, cannons and your bow.' },
  treant:    { name: 'Treant', hp: 540, speed: 0.45, armor: 20, mr: -40, bounty: 32, points: 75, dmg: 10, size: 0.5, unlock: 44, weight: 0.7, color: '#5a7a3a', regen: 0.03, desc: 'An old tree that walks. Regrows quickly unless burning, and is weak to magic. Bring fire.' },
  fellrider: { name: 'Fell Rider', hp: 170, speed: 1.25, armor: 10, mr: 20, bounty: 16, points: 42, dmg: 5, size: 0.34, unlock: 48, weight: 1.1, color: '#3a3f4a', air: true, hunts: { range: 2.6, dmg: 9, cd: 1.4 }, desc: 'A shadow on a winged beast. Flies straight for the keep and spears your troops from above. Needs strong anti-air.' },
  // v1.39 foes
  phalanx:   { name: 'Phalanx', hp: 150, speed: 0.75, armor: 30, mr: 0, bounty: 12, points: 32, dmg: 4, size: 0.32, unlock: 26, weight: 1.3, color: '#7a6a4a', phalanx: { range: 1.15, cut: 0.5, broken: 3 }, group: 3, desc: 'Marches shield to shield. While two or more stand together, single arrows, bolts and shot do half damage. Splash, fire and your own shots from the wall break the shield wall for a few seconds.' },
  sapwright: { name: 'Siege Engineer', hp: 90, speed: 0.85, armor: 10, mr: 0, bounty: 12, points: 30, dmg: 3, size: 0.3, unlock: 24, weight: 1, color: '#a06a3a', barricade: { cd: 8, ahead: 1.3, hp: 1.6, life: 12 }, desc: 'Throws up wooden barricades on the road ahead. Towers aiming at the front of the line waste shots on them while the horde walks past.' },
  barricade: { name: 'Barricade', hp: 60, speed: 0, armor: 40, mr: 30, bounty: 3, points: 5, dmg: 0, size: 0.34, unlock: 999, weight: 0, color: '#8a6a3a', structure: true, desc: 'A wooden barricade a Siege Engineer threw up. It does nothing but soak your shots, and falls apart on its own after a while.' },
  mirror:    { name: 'Mirror Mage', hp: 95, speed: 0.9, armor: 0, mr: 35, bounty: 12, points: 32, dmg: 3, size: 0.28, unlock: 30, weight: 1, color: '#9adbe8', reflect: { cd: 6, disable: 1.8, dmg: 0.25 }, desc: 'Turns the first magic bolt that hits it back on the tower that cast it (jamming that tower for a moment), then needs six seconds to raise the mirror again. Hit it with arrows and shot first.' },
  minesapper: { name: 'Tunnel Sapper', hp: 80, speed: 1.0, armor: 15, mr: 0, bounty: 14, points: 34, dmg: 3, size: 0.28, unlock: 34, weight: 0.9, color: '#5a4a3a', burrow: { every: 1.6, time: 4.5, speed: 1.15 }, ignoreWall: true, charge: 6, desc: 'Tunnels under the road for most of its walk and surfaces only now and then. If it reaches the keep it digs under the wall and blows a charge: six times a normal breach, straight into the keep. Catch it when it surfaces.' },
  herald:    { name: 'Standard-Bearer', hp: 130, speed: 0.85, armor: 15, mr: 10, bounty: 16, points: 40, dmg: 4, size: 0.34, unlock: 38, weight: 0.8, color: '#c8a030', banner: { range: 2, cut: 0.25, speed: 0.1 }, desc: 'Carries a war standard. Every foe near it takes 25% less damage and marches 10% faster. Kill it first.' },
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
  arcane:  { name: 'Warded Host', icon: '✦', unlock: 12, types: ['warlock', 'healer'], boost: 6, mr: 25, tip: 'Bubbles soak damage: magic pops them twice as fast. Kill Warlocks with arrows, cannons and your bow.' },
  siege:   { name: 'Siege Column', icon: '🏰', unlock: 14, types: ['ram', 'sapper', 'archer'], boost: 6, tip: 'They target towers and walls. Kill them early, repair after.' },
  wild:    { name: 'Wild Hunt', icon: '🪶', unlock: 13, types: ['harpy', 'runner', 'cavalry'], boost: 6, speed: 1.08, hp: 0.92, tip: 'Fast foes and harpy flocks. Flak, Archers and slows.' },
  tunnels: { name: 'Underground', icon: '⛏', unlock: 20, types: ['burrower', 'sapper', 'bomber'], boost: 6, tip: 'Tunnelers dig past your towers. Traps, splash and slows still reach them.' },
  phantom: { name: 'Phantom March', icon: '👻', unlock: 38, types: ['wraith', 'warlock', 'troll'], boost: 5, mr: 10, tip: 'Wraiths blink past soldiers, trolls regenerate. Burn and burst them.' },
  raiders: { name: 'Raiding Party', icon: '🗡', unlock: 10, types: ['skirmisher', 'archer', 'cavalry'], boost: 6, tip: 'Skirmishers and archers pick off troops in the open. Guard stance keeps your garrison near the walls.' },
  brutes:  { name: 'Brute Pack', icon: '👹', unlock: 24, types: ['ogre', 'troll', 'golem'], boost: 6, tip: 'Brutes smash whole squads. Shoot them from range and hold them with Knights.' },
  warband: { name: 'Warband', icon: '🐺', unlock: 17, types: ['warg', 'berserker', 'rat'], boost: 6, speed: 1.06, hp: 0.9, tip: 'Fast packs and wild fighters. Splash, slows and Barracks. Kill berserkers in one burst.' },
  engines: { name: 'Siege Engines', icon: '⚙', unlock: 25, types: ['mangonel', 'siegetower', 'pavise', 'escalade'], boost: 6, tip: 'Engines outrange your towers; ladders skip the wall. Hit them early with Ballistas and Catapults.' },
  undead:  { name: 'Barrow Dead', icon: '💀', unlock: 40, types: ['wight', 'wraith', 'dread'], boost: 6, mr: 10, tip: 'Wights chill your towers. Use arrows and cannons; magic barely scratches them.' },
  stoneflight: { name: 'Stone Flight', icon: '🗿', unlock: 28, types: ['gargoyle', 'wyvern'], boost: 7, tip: 'Armored flyers. Use Mages, Tesla, Crossbowmen and Griffon Riders.' },
};

export const BOSSES = [
  { id: 'warlord', name: 'The Warlord', hp: 1500, speed: 0.55, armor: 30, mr: 10, bounty: 120, points: 600, dmg: 30, size: 0.6, color: '#9c1f2e', summon: { type: 'grunt', n: 4, cd: 6 } },
  { id: 'titan', name: 'Siege Titan', hp: 2600, speed: 0.4, armor: 45, mr: 20, bounty: 180, points: 900, dmg: 40, size: 0.7, color: '#6b5d52', stomp: { range: 2.2, time: 3, cd: 7 } },
  { id: 'dragon', name: 'Ember Dragon', hp: 1400, speed: 0.7, armor: 20, mr: 30, bounty: 220, points: 1000, dmg: 35, size: 0.65, color: '#d9532c', air: true, roads: true, breath: { range: 2.5, dmg: 25, cd: 4 } },
  { id: 'lich', name: 'The Lich', hp: 2400, speed: 0.5, armor: 10, mr: 60, bounty: 250, points: 1100, dmg: 40, size: 0.6, color: '#3c6e8f', raise: { n: 6, cd: 7 } },
  { id: 'hydra', name: 'Bog Hydra', hp: 2300, speed: 0.45, armor: 25, mr: 25, bounty: 280, points: 1200, dmg: 45, size: 0.72, color: '#3f7a5a', regen: 0.008, spit: { range: 3, dmg: 28, disable: 2.5, cd: 5 },
    desc: 'Three heads, one appetite. Regrows its wounds unless burning or poisoned, and spits acid that melts and jams your towers.' },
  { id: 'frostgiant', name: 'The Frost Giant', hp: 3100, speed: 0.42, armor: 35, mr: 25, bounty: 300, points: 1300, dmg: 50, size: 0.8, color: '#9ac8e8', frost: { range: 2.4, time: 2.4, cd: 4.5 }, regen: 0 },
  { id: 'pitfiend', name: 'The Pit Fiend', hp: 3000, speed: 0.5, armor: 35, mr: 40, bounty: 300, points: 1300, dmg: 50, size: 0.75, color: '#8a2a14', breath: { range: 2.6, dmg: 34, cd: 3.2 } },
  { id: 'wraithking', name: 'The Wraith King', hp: 2300, speed: 0.7, armor: 10, mr: 65, bounty: 320, points: 1400, dmg: 45, size: 0.6, color: '#5a6a7a', air: true, roads: true, drain: { range: 2.8, time: 4, cd: 5 }, blink: { dist: 1.8, cd: 5 } },
  { id: 'beastmaster', name: 'The Beastmaster', hp: 2000, speed: 0.8, armor: 20, mr: 10, bounty: 340, points: 1500, dmg: 40, size: 0.55, color: '#6a4a2a', summon: { type: 'warg', n: 4, cd: 6 } },
  { id: 'trebuchet', name: 'The Great Trebuchet', hp: 3600, speed: 0.3, armor: 55, mr: -10, bounty: 360, points: 1600, dmg: 60, size: 0.8, color: '#7a5a3a', shoots: { range: 5, dmg: 55, cd: 5.5 }, striker: true },
  { id: 'elderoak', name: 'The Elder Oak', hp: 3400, speed: 0.35, armor: 30, mr: -30, bounty: 380, points: 1700, dmg: 55, size: 0.85, color: '#4a6a32', regen: 0.01, spit: { range: 3.2, dmg: 12, disable: 4, cd: 4.5 } },
];
// Boss lines for the bestiary and the boss banner.
export const BOSS_DESC = {
  warlord: 'Calls fresh grunts to his side every few seconds.',
  titan: 'Stomps the ground, damaging and stunning towers nearby.',
  dragon: 'Flies along the road and breathes fire on your towers.',
  lich: 'Raises the fallen as grunts. Kill it fast.',
  hydra: 'Regrows its wounds unless burning or poisoned, and spits acid that jams your towers.',
  pitfiend: 'A demon of shadow and flame. Its fire engulfs whole clusters of towers, and it shrugs off magic.',
  wraithking: 'Rides a fell beast along the road, blinking ahead and chilling every tower near it so they fire at half speed. Resists magic.',
  beastmaster: 'Whistles up packs of wargs every few seconds. Kill the master, not the wolves.',
  trebuchet: 'Hurls huge stones at your towers from far away. Slow, thickly armored and soft to magic.',
  frostgiant: 'Every few strides it breathes out a killing cold that freezes every tower near it for a moment. Fire and long range keep it honest.',
  elderoak: 'An ancient oak that walks. Roots the towers it passes, regrows unless burning, and burns well.',
};

export const BIOMES = [
  { id: 'meadow', name: 'Meadow', grass: '#8cc152', grass2: '#7db146', path: '#e3c48b', path2: '#d4b278', accent: '#5f9a3a', sky: '#bfe3a0', hazard: null },
  { id: 'dunes', name: 'Dunes', grass: '#e8c47a', grass2: '#ddb766', path: '#c99a5a', path2: '#ba8b4c', accent: '#b98a3e', sky: '#f6dfa7', hazard: 'sandstorm' },
  { id: 'frost', name: 'Frostlands', grass: '#dfeef5', grass2: '#cfe2ec', path: '#9fb7c9', path2: '#8ea8bb', accent: '#7aa6c2', sky: '#eaf6fb', hazard: 'blizzard' },
  { id: 'ash', name: 'Ashlands', grass: '#5a4a48', grass2: '#4f403e', path: '#8a5a44', path2: '#7a4d39', accent: '#e0632f', sky: '#3a2a2a', hazard: 'meteors' },
  { id: 'shadow', name: 'Shadowfen', grass: '#3d4a5e', grass2: '#354155', path: '#6b6487', path2: '#5d5778', accent: '#9a7ad8', sky: '#232a38', hazard: 'stealth' },
];

// ---------- Weather (the land's hazard, from wave 25 on) ----------
export const WEATHER = {
  gapMin: 9, gapRand: 6, warn: 2.5,                       // seconds between spells, and the warning before one
  dur: { sandstorm: 9, blizzard: 9, meteors: 8, stealth: 5 },
  sandRange: 0.72, sandRate: 0.92,                        // towers shoot shorter and a little slower in a sandstorm
  blizzRange: 0.9, blizzRate: 0.8, blizzFoe: 0.72, blizzTroop: 0.8,
  meteorEvery: 1.0, meteorDmg: 28, meteorRadius: 1.3, meteorTower: 0.1, meteorTroop: 0.09,
  stealthChance: 0.6, stealthT: 4.5,
  text: {
    sandstorm: ['Sandstorm', 'Tower range −28%, fire −8%. Bowmen shoot shorter too'],
    blizzard: ['Blizzard', 'Foes −28% speed, but towers −20% rate and −10% range'],
    meteors: ['Meteor shower', 'Fire rains on the road: it scorches foes, troops and nearby towers'],
    stealth: ['Shadows', 'Most foes vanish from towers. Shoot them yourself!'],
  },
};

// ---------- The Garrison ----------
// Troops are trained in the keep (gold + time; elites also cost Valor, earned from points), then deployed to the road
// where they hunt foes. Fallen troops are gone for good, so veterans are worth keeping alive.
// Stats are for wave 1; troops toughen with the foes' HP (see GARRISON.hpExp / dmgExp).
// reach: melee range. range: ranged attack. air: can hit flyers. holds: pins a foe in place like a barracks soldier.
export const TROOPS = {
  footman:  { name: 'Footman', icon: '🛡', unlockWave: 1, cost: 30, valor: 0, train: 6, slots: 1, hp: 85, dmg: 9, rate: 1, speed: 2.1, reach: 0.45, armor: 0, pin: 0.15, holds: true, color: '#3a8a52',
    role: 'Holds the line', desc: 'Cheap and quick to train. Holds a foe in place so every tower hits it harder.' },
  bowman:   { name: 'Bowman', icon: '🏹', unlockWave: 3, cost: 45, valor: 0, train: 8, slots: 1, hp: 50, dmg: 8, rate: 1.25, speed: 1.9, range: 2.7, armor: 0, ranged: true, air: true, color: '#6aa84f',
    role: 'Shoots flyers', desc: 'Fires from a distance and is your first answer to flyers on the field.' },
  pikeman:  { name: 'Pikeman', icon: '🔱', unlockWave: 6, cost: 60, valor: 0, train: 9, slots: 1, hp: 105, dmg: 10, rate: 0.9, speed: 1.8, reach: 0.8, armor: 20, pin: 0.25, holds: true, antiFast: 2, keep: 'unlock_pikeman', color: '#8d7bb5',
    role: 'Stops cavalry', desc: 'Long reach and armor. Deals double damage to fast foes: cavalry, runners and raiders.' },
  crossbow: { name: 'Crossbowman', icon: '🎯', unlockWave: 11, cost: 90, valor: 3, train: 11, slots: 1, hp: 60, dmg: 26, rate: 0.55, speed: 1.8, range: 3, armor: 0, ranged: true, air: true, pierce: 25, keep: 'unlock_crossbowman', color: '#c98a4b',
    role: 'Breaks armor', desc: 'Slow, heavy bolts that ignore 25 armor. Hits flyers and bosses hard.' },
  knight:   { name: 'Knight', icon: '⚔', unlockWave: 14, cost: 140, valor: 8, train: 15, slots: 2, hp: 230, dmg: 17, rate: 0.9, speed: 1.8, reach: 0.5, armor: 45, pin: 0.35, holds: true, antiBoss: 1, keep: 'unlock_knight', color: '#9aa1b0',
    role: 'Heavy tank', desc: 'Plate armor, big shield, big hits. Seeks out the toughest foes.' },
  cavalry:  { name: 'Cavalry', icon: '🐎', unlockWave: 18, cost: 170, valor: 12, train: 18, slots: 2, hp: 140, dmg: 13, rate: 1.1, speed: 3.6, reach: 0.6, armor: 15, charge: 3, hunter: true, keep: 'unlock_cavalry', color: '#c0583a',
    role: 'Hunts the backline', desc: 'Rides down thieves, archers, healers and casters. The first strike on each foe hits three times as hard.' },
  cleric:   { name: 'Cleric', icon: '✚', unlockWave: 16, cost: 110, valor: 8, train: 12, slots: 1, hp: 65, dmg: 0, rate: 1, speed: 1.9, armor: 0, heal: 0.14, healRange: 2.3, healCd: 1.4, keep: 'unlock_cleric', color: '#f0ead6',
    role: 'Heals troops', desc: 'Follows the squad and mends the most wounded troop. Clerics in the castle speed up healing for everyone.' },
  engineer: { name: 'Engineer', icon: '🔧', unlockWave: 12, cost: 100, valor: 6, train: 12, slots: 1, hp: 70, dmg: 0, rate: 1, speed: 2.0, armor: 10, repair: 0.07, repairRange: 0.85, keep: 'unlock_engineer', color: '#d9a441',
    role: 'Repairs towers in the field', desc: 'Walks out mid-wave to the most damaged tower and mends it, even raising ruined ones. Veterans work faster and run quicker; Elites also patch the wall; Legends fix two towers at once and clear sabotage.' },
  griffon:  { name: 'Griffon Rider', icon: '🦅', unlockWave: 22, cost: 260, valor: 35, train: 30, slots: 3, hp: 190, dmg: 22, rate: 1, speed: 3.2, reach: 0.8, armor: 10, air: true, flies: true, splash: 0.85, hunter: true, preferAir: true, keep: 'unlock_griffon', color: '#e0b04a',
    role: 'Sky hunter', desc: 'Flies over everything and hits flyers and ground foes alike, with a wing-beat that clips those beside the target.' },
};
export const TROOP_ORDER = ['footman', 'bowman', 'pikeman', 'crossbow', 'knight', 'cavalry', 'cleric', 'engineer', 'griffon'];

// Engineers: field repair. repair (on the troop) is the share of a tower's max health mended per second at Recruit rank.
export const ENGINEER = {
  reviveAt: 0.25,       // a ruined tower stands again once it has been mended to this share of its health
  rankRepair: 0.35,     // each rank adds this much to the repair rate ...
  rankSpeed: 0.12,      // ... and this much to walking speed
  wallRank: 2,          // from Elite on, an idle engineer patches the wall
  wallRate: 0.008,      // share of the wall's max health per second (×rank bonus)
  clearRank: 3,         // Legends also switch a sabotaged or stunned tower back on, and mend a second tower in reach
  twoRate: 0.6,         // the second tower mends at this share of the main rate
  reviveXp: 2, fullXp: 1,   // experience for raising a ruin, and for each full tower's worth of health mended
};
export const GARRISON = {
  slots: { base: 4, perWaves: 5, max: 30 },   // troop slots: base + 1 per this many waves, plus Keep annexes and boons
  queueMax: 5,
  costPerWave: 0.035,      // troop gold cost grows with the wave
  hpExp: 0.55, hpMul: 1,   // troop HP = base × max(1, planHP^exp × mul)
  dmgExp: 0.72, dmgMul: 0.62,
  reserveHeal: 0.07,       // share of max HP regained per second inside the castle
  waveHeal: 0.18,           // instant healing for everyone when a wave is cleared
  mark: { dmg: 0.2, time: 5 },   // a foe you shoot is Marked: troops focus it and everything hits it 20% harder
  retreatAt: 0.22,         // with Auto on, hurt troops fall back to the castle at this health...
  rejoinAt: 0.7,           // ...and ride out again once they have healed this much
  guardRadius: 4.6,        // Guard stance: troops only engage foes this close to the castle
  dismissRefund: 0.4,
  ranks: [4, 12, 28],      // kills to reach Veteran, Elite, Legend
  commend: [6, 14, 28],    // Valor to promote a troop to Veteran, Elite, Legend on the spot (v1.26)
  rankBonus: 0.12,         // each rank adds this much HP and damage
  rankNames: ['Recruit', 'Veteran', 'Elite', 'Legend'],
  muster: { base: 28, perWave: 2, hero: 3, boss: 12 },   // Muster: kills needed for a free recruit
  tend: 0.5,               // tending a troop's wounds costs this share of its price, in proportion to its missing health
};
// Valor: the elite troops' second currency. Earned from points, so skilled play (combos, headshots) pays most.
export const VALOR = { perPoint: 0.004, waveClear: 3, flawless: 3, boss: 10 };   // v1.26: income cut tenfold (it all went unspent); Valor now also buys promotions (GARRISON.commend)

export const WEAPONS = {
  longbow:    { name: 'Longbow', dmg: 14, reload: 0.55, ammo: 6, speed: 15, crit: 0.05, splash: 0, pierce: 0, type: 'physical', keep: null, desc: 'Reliable, quick, plenty of arrows.' },
  crossbow:   { name: 'Crossbow', dmg: 28, reload: 0.9, ammo: 4, speed: 20, crit: 0.08, splash: 0, pierce: 2, type: 'physical', keep: 'unlock_crossbow', desc: 'Heavy bolts pierce two enemies.' },
  javelin:    { name: 'Fire Javelin', dmg: 18, reload: 0.85, ammo: 4, speed: 12, crit: 0.05, splash: 0.9, burn: 8, pierce: 0, type: 'fire', keep: 'unlock_javelin', desc: 'Explodes and sets enemies on fire.' },
  wand:       { name: 'Arcane Wand', dmg: 13, reload: 0.6, ammo: 6, speed: 24, crit: 0.05, chain: 3, pierce: 0, type: 'magic', keep: 'unlock_wand', desc: 'Bolts chain to three more enemies.' },
  repeater:   { name: 'Repeater', dmg: 8, reload: 0.22, ammo: 12, speed: 22, crit: 0.04, splash: 0, pierce: 0, type: 'physical', keep: 'unlock_repeater', desc: 'A drum of twelve light bolts. Rapid fire for combo hunters.' },
  mortar:     { name: 'Siege Mortar', dmg: 95, reload: 4.4, ammo: 1, speed: 11, crit: 0.05, splash: 2.1, pierce: 0, type: 'physical', keep: 'unlock_mortar', desc: 'One shell every few seconds. A huge blast that shreds a packed road.' },
  thunderlance: { name: 'Thunder Lance', dmg: 70, reload: 3.4, ammo: 2, speed: 40, crit: 0.1, chain: 6, pierce: 0, type: 'magic', keep: 'unlock_thunderlance', desc: 'Slow to recharge. Each bolt arcs through six more foes.' },
  meteorstaff: { name: 'Meteor Staff', dmg: 60, reload: 5.2, ammo: 1, speed: 9, crit: 0.05, splash: 2.7, burn: 14, pierce: 0, type: 'fire', keep: 'unlock_meteorstaff', desc: 'A falling star: enormous fire blast, then a long wait.' },
  titanbolt:  { name: 'Titan Ballista', dmg: 220, reload: 9, ammo: 1, speed: 34, crit: 0.1, splash: 0, pierce: 4, bossPct: 0.6, type: 'physical', keep: 'unlock_titanbolt', desc: 'One bolt every nine seconds. It pierces five foes and tears 60% of a boss\'s health away; fully charged, 84%.' },
  chainwhip:  { name: 'Chain Whip', dmg: 16, reload: 0.5, ammo: 5, speed: 30, crit: 0.06, splash: 0, chain: 4, chainRange: 1.1, pierce: 0, type: 'physical', keep: 'unlock_chainwhip', desc: 'A lash of hooked chain that snaps through the target and the four foes nearest it.' },
  grapple:    { name: 'Grapple Crossbow', dmg: 24, reload: 1.1, ammo: 3, speed: 22, crit: 0.08, splash: 0, pierce: 0, pull: 1.4, type: 'physical', keep: 'unlock_grapple', desc: 'A barbed bolt on a line: it yanks the foe it hits 1.4 tiles back down the road (bosses half as far).' },
  flasks:     { name: "Alchemist's Flasks", dmg: 22, reload: 0.95, ammo: 3, speed: 12, crit: 0.05, splash: 1.1, pierce: 0, flask: true, burn: 7, type: 'magic', keep: 'unlock_flasks', desc: 'Throws flasks that burst in a cloud, cycling fire (burns), acid (strips 25 armor) and frost (slows by half). The next flask is shown on the fire button.' },
  harpoon:    { name: 'Harpoon Gun', dmg: 34, reload: 1.3, ammo: 2, speed: 26, crit: 0.08, splash: 0, pierce: 0, airMult: 2, ground: 4, type: 'physical', keep: 'unlock_harpoon', desc: 'Twice the damage to flyers, and a flyer it hits is dragged out of the sky for four seconds: ground towers, troops and the wall can reach it.' },
  bell:       { name: 'Bell of Thunder', dmg: 55, reload: 4.2, ammo: 1, speed: 60, crit: 0.05, splash: 0, pierce: 0, cone: { range: 8, arc: 0.38, stun: 1.2 }, type: 'magic', keep: 'unlock_bell', desc: 'One great toll: a cone of thunder that strikes and stuns every foe ahead of the wall for a moment. Slow to ring again.' },
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
  { id: 'cannon_splash', name: 'Gunpowder Surplus', desc: 'Cannon splash +30%, damage +20%.', rarity: 'common', stack: 5 },
  { id: 'mage_chain', name: 'Conductive Air', desc: 'Mage & Tesla chains +1.', rarity: 'rare', stack: 3 },
  { id: 'interest', name: 'Royal Interest', desc: 'Earn 6% interest on unspent gold each wave (max 60).', rarity: 'rare', stack: 3 },
  { id: 'bloodlust', name: 'Bloodlust', desc: 'Hero kills grant +3 gold, and 1 more for every 10 waves.', rarity: 'common', stack: 5 },
  { id: 'steady', name: 'Steady Hands', desc: 'Weapon reload −15%.', rarity: 'common', stack: 4 },
  { id: 'masonry', name: 'Master Masons', desc: 'Wall max HP +35% and fully repaired.', rarity: 'common', stack: 5 },
  { id: 'overclock', name: 'Overdrive', desc: 'All towers fire 8% faster.', rarity: 'rare', stack: 5 },
  { id: 'bounty', name: 'Bounty Posters', desc: 'Kill gold +12%.', rarity: 'common', stack: 5 },
  { id: 'eagle', name: 'Eagle Eye', desc: 'All tower range +8%.', rarity: 'rare', stack: 3 },
  { id: 'frostbite', name: 'Frostbite', desc: 'Slows are 25% stronger and last longer.', rarity: 'rare', stack: 2 },
  { id: 'pyro', name: 'Pyromania', desc: 'Fire damage +35%.', rarity: 'common', stack: 4 },
  { id: 'pierce', name: 'Long Bolts', desc: 'Ballista pierce +2, damage +25%.', rarity: 'common', stack: 3 },
  { id: 'scholar', name: 'Scholar', desc: 'Future boon picks offer one extra choice.', rarity: 'epic', stack: 1 },
  { id: 'plunder', name: 'Plunder', desc: 'Bosses drop double gold and score.', rarity: 'rare', stack: 2 },
  { id: 'lucky', name: 'Lucky Charm', desc: 'All towers and your shots: crit chance +8% (towers have 5% base).', rarity: 'common', stack: 4 },
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
  { id: 'golden', name: 'Golden Arrows', desc: 'Hero kills give 60% more gold.', rarity: 'rare', stack: 2 },
  { id: 'fieldrepair', name: 'Field Repairs', desc: 'Wall regenerates 1% per second during waves.', rarity: 'rare', stack: 2 },
  { id: 'thickskin', name: 'Thick Walls', desc: 'Castle takes 12% less damage.', rarity: 'common', stack: 3 },
  { id: 'warfund', name: 'War Fund', desc: 'Gain gold now (150 + 12 per wave) and wave-clear gold +20%.', rarity: 'common', stack: 3 },
  { id: 'killer', name: 'Killer Instinct', desc: 'Critical hits deal an extra +0.5× damage (towers and your shots).', rarity: 'rare', stack: 3 },
  { id: 'deadeye', name: 'Deadeye', desc: 'Your shots: +12% crit chance, and their crits deal an extra +0.5× damage.', rarity: 'rare', stack: 2 },
  { id: 'vital', name: 'Vital Strikes', desc: 'Critical hits ignore all armor and magic resistance.', rarity: 'epic', stack: 1 },
  { id: 'critgold', name: 'Gilded Crits', desc: 'Every critical hit drops 2 gold.', rarity: 'common', stack: 3 },
  { id: 'critboom', name: 'Shockwave Crits', desc: 'Critical hits send a shockwave: 40% damage to foes around the target.', rarity: 'epic', stack: 1 },
  { id: 'executioner', name: 'Executioner', desc: '+30% damage to foes below 25% health.', rarity: 'rare', stack: 2 },
  { id: 'giantslayer', name: 'Giant Slayer', desc: 'Towers deal +20% to bosses and heavily armored foes.', rarity: 'common', stack: 3 },
  { id: 'seasoned', name: 'Seasoned Crews', desc: 'All towers +6% damage.', rarity: 'common', stack: 5 },
  { id: 'witchcraft', name: 'Witchcraft', desc: 'Mage Hex hits 8% harder and lasts 1s longer; Venom Spire poison +40%.', rarity: 'common', stack: 3 },
  { id: 'deepfreeze', name: 'Deep Freeze', desc: 'Frost pulses freeze foes solid for 1s, 6% of the time.', rarity: 'rare', stack: 3 },
  { id: 'concussive', name: 'Concussive Shells', desc: 'Cannon blasts stun for 0.5s.', rarity: 'common', stack: 3 },
  { id: 'chargeup', name: 'Full Draw', desc: 'Fully charged shots hit +50% harder.', rarity: 'rare', stack: 3 },
  { id: 'thieftaker', name: 'Thief-Taker', desc: 'Gold Thieves can no longer steal, and drop double gold.', rarity: 'rare', stack: 1, minWave: 13 },
  // v1.40
  { id: 'coldsnap', name: 'Cold Snap', desc: 'Slowed and frozen foes take 10% more damage from everything.', rarity: 'common', stack: 3 },
  { id: 'opening', name: 'Opening Volley', desc: 'Foes at full health take 25% more damage (the first hit lands hard).', rarity: 'common', stack: 3 },
  { id: 'bloodmortar', name: 'Blood and Mortar', desc: 'Every kill repairs the wall by 0.25% of its max HP.', rarity: 'common', stack: 3 },
  { id: 'prospectors', name: 'Prospectors', desc: 'Claiming ruins costs 20% less.', rarity: 'common', stack: 2 },
  { id: 'ricochet', name: 'Ricochet', desc: 'When your shot kills a foe, it bounces to the nearest foe for 60% damage (90% with two).', rarity: 'rare', stack: 2 },
  { id: 'soulharvest', name: 'Soul Harvest', desc: 'Every kill shaves 0.12s off all your castle art cooldowns.', rarity: 'rare', stack: 3 },
  { id: 'artificer', name: 'Royal Artificers', desc: 'Castle arts recharge 10% faster and hit 10% harder.', rarity: 'rare', stack: 3 },
  { id: 'lastline', name: 'Last Line', desc: 'While the wall is below 35% (or broken), towers fire 25% faster.', rarity: 'rare', stack: 2 },
  { id: 'volatile', name: 'Volatile Corpses', desc: 'Foes your towers kill burst, dealing 20% of their max health to foes beside them.', rarity: 'epic', stack: 1, minWave: 10 },
  { id: 'stormcaller', name: 'Stormcaller', desc: 'Every 10 seconds of a wave, lightning strikes the toughest foe on the field.', rarity: 'epic', stack: 1, minWave: 8 },
  { id: 'echo', name: 'Echoing Arts', desc: 'Each castle art has a 25% chance to recharge at once.', rarity: 'epic', stack: 1 },
  { id: 'warpath', name: 'Warpath', desc: 'While your combo is 10 or more, towers deal 15% more damage.', rarity: 'rare', stack: 2 },
  { id: 'kindling', name: 'Kindling', desc: 'Burning foes take 15% more damage from everything (and burning stops regeneration).', rarity: 'rare', stack: 2, minWave: 8 },
  // Garrison boons: only offered once you have trained troops (needs: 'troops').
  { id: 'vanguard', name: 'Vanguard', desc: 'Troops +20% health and damage.', rarity: 'common', stack: 4, needs: 'troops' },
  { id: 'drillmaster', name: 'Drill Master', desc: 'Troops train 25% faster and cost 8% less.', rarity: 'common', stack: 3, needs: 'troops' },
  { id: 'barracksplus', name: 'Bunkhouses', desc: '+2 troop slots.', rarity: 'common', stack: 3, needs: 'troops' },
  { id: 'fieldmedic', name: 'Field Medics', desc: 'Troops heal twice as fast in the castle, and 25% more when a wave ends.', rarity: 'common', stack: 3, needs: 'troops' },
  { id: 'battlecry', name: 'Battle Cry', desc: 'The Muster fills 50% faster: free recruits come sooner.', rarity: 'rare', stack: 3, needs: 'troops' },
  { id: 'valorous', name: 'Valorous Deeds', desc: 'Valor gains +30%.', rarity: 'rare', stack: 3, needs: 'troops' },
  { id: 'immortal', name: 'Immortal Guard', desc: 'Once a wave, the first troop to fall rises again with half health.', rarity: 'epic', stack: 1, needs: 'troops' },
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

// Weapon Mastery: four Keep unlocks for every personal weapon, each a flat boost (see weaponStats in the engine).
// fx: dmg (+fraction), splash (+tiles), pierce (+foes), chain (+jumps), extra (+arrows at half damage), burn (+fraction),
// ammo (+shots), reload (−fraction of reload time), crit (+chance), bossPct (+share of a boss's health).
const WP = (weapon, base, list) => list.map(([name, desc, fx], i) => ({
  id: `wp_${weapon}_${i + 1}`, name, desc, cost: [Math.round(base * [1, 2.2, 4, 6.5][i])], branch: 'hero',
  group: `${WEAPONS[weapon].name} Mastery`, weaponPerk: weapon, fx,
  ...(i ? { req: `wp_${weapon}_${i}` } : WEAPONS[weapon].keep ? { req: WEAPONS[weapon].keep } : {}),
}));
export const WEAPON_PERK_NODES = [
  ...WP('longbow', 90, [['Barbed Heads', 'Longbow arrows hit 25% harder.', { dmg: 0.25 }], ['Triple Shot', 'Each shot looses 2 extra arrows at half damage.', { extra: 2 }], ['Broadheads', 'Arrows pierce 2 more foes.', { pierce: 2 }], ['Burst Tips', 'Arrows burst on impact, splashing nearby foes.', { splash: 0.9 }]]),
  ...WP('crossbow', 100, [['Steel Bolts', 'Crossbow bolts hit 25% harder.', { dmg: 0.25 }], ['Heavy Draw', 'Bolts pierce 2 more foes.', { pierce: 2 }], ['Twin Limbs', 'Each shot looses 2 extra bolts at half damage.', { extra: 2 }], ['Siege Bolts', 'Bolts explode on impact: splash damage around the target.', { splash: 0.8 }]]),
  ...WP('javelin', 120, [['Pitch-dipped', 'Javelin fire burns 60% harder.', { burn: 0.6 }], ['Wider Blast', 'Javelin explosion covers 0.7 more tiles.', { splash: 0.7 }], ['Javelin Cluster', 'Each throw sends 2 extra javelins at half damage.', { extra: 2 }], ['Hotter Flame', 'Javelins hit 30% harder.', { dmg: 0.3 }]]),
  ...WP('wand', 130, [['Overcharge', 'Wand bolts hit 30% harder.', { dmg: 0.3 }], ['Forked Lightning', 'Bolts chain to 3 more foes.', { chain: 3 }], ['Triple Bolt', 'Each cast sends 2 extra bolts at half damage.', { extra: 2 }], ['Arc Burst', 'Bolts burst on impact, splashing nearby foes.', { splash: 0.7 }]]),
  ...WP('repeater', 150, [['Hardened Bolts', 'Repeater bolts hit 30% harder.', { dmg: 0.3 }], ['Extended Drum', '+6 ammo before a reload.', { ammo: 6 }], ['Spread Shot', 'Each shot looses 2 extra bolts at half damage.', { extra: 2 }], ['Quick Cycle', 'Reloads 20% faster.', { reload: 0.2 }]]),
  ...WP('mortar', 170, [['Heavy Shells', 'Mortar shells hit 30% harder.', { dmg: 0.3 }], ['Wide Crater', 'Blast radius +0.9 tiles.', { splash: 0.9 }], ['Cluster Shells', 'Each shot lobs 2 extra shells at half damage.', { extra: 2 }], ['Quick Loaders', 'Reloads 20% faster.', { reload: 0.2 }]]),
  ...WP('thunderlance', 200, [['Stormcharge', 'Lance bolts hit 30% harder.', { dmg: 0.3 }], ['Longer Arc', 'Lightning arcs through 4 more foes.', { chain: 4 }], ['Triple Lightning', 'Each shot sends 2 extra bolts at half damage.', { extra: 2 }], ['Capacitor', 'Reloads 20% faster and holds one more charge.', { reload: 0.2, ammo: 1 }]]),
  ...WP('meteorstaff', 230, [['Heavier Stone', 'Meteors hit 30% harder.', { dmg: 0.3 }], ['Colossal Impact', 'Blast radius +1 tile.', { splash: 1 }], ['Meteor Shower', 'Each cast calls 2 extra meteors at half damage.', { extra: 2 }], ['Everburn', 'Meteor fire burns 80% harder.', { burn: 0.8 }]]),
  ...WP('titanbolt', 270, [['Adamant Head', 'Titan bolts hit 30% harder.', { dmg: 0.3 }], ['Giantslayer', 'Tears a further 15% of a boss\'s health away.', { bossPct: 0.15 }], ['Skewer', 'Pierces 3 more foes.', { pierce: 3 }], ['Fast Winch', 'Reloads 20% faster.', { reload: 0.2 }]]),
  ...WP('chainwhip', 120, [['Hooked Links', 'Whip strikes hit 30% harder.', { dmg: 0.3 }], ['Longer Chain', 'Snaps through 3 more foes.', { chain: 3 }], ['Barbs', '+12% critical chance.', { crit: 0.12 }], ['Quick Wrist', 'Reloads 25% faster.', { reload: 0.25 }]]),
  ...WP('grapple', 140, [['Serrated Bolt', 'Grapple bolts hit 30% harder.', { dmg: 0.3 }], ['Spare Lines', '+2 bolts before a reload.', { ammo: 2 }], ['Skewer Line', 'Bolts pierce 2 more foes.', { pierce: 2 }], ['Twin Hooks', 'Each shot looses 2 extra bolts at half damage.', { extra: 2 }]]),
  ...WP('flasks', 150, [['Stronger Brew', 'Flasks hit 30% harder.', { dmg: 0.3 }], ['Bigger Flasks', 'Clouds spread 0.6 tiles wider.', { splash: 0.6 }], ['Volatile Fire', 'Fire flasks burn 60% harder.', { burn: 0.6 }], ['Bandolier', '+2 flasks before a reload.', { ammo: 2 }]]),
  ...WP('harpoon', 160, [['Barbed Harpoon', 'Harpoons hit 30% harder.', { dmg: 0.3 }], ['Twin Barrels', '+1 harpoon before a reload.', { ammo: 1 }], ['Heavy Line', 'Pierces 2 more foes.', { pierce: 2 }], ['Spring Winch', 'Reloads 25% faster.', { reload: 0.25 }]]),
  ...WP('bell', 200, [['Bronze Voice', 'The toll hits 30% harder.', { dmg: 0.3 }], ['Rolling Thunder', 'Each toll sends 2 extra waves of thunder at half damage.', { extra: 2 }], ['Great Bell', '+15% critical chance.', { crit: 0.15 }], ['Swift Clapper', 'Rings again 25% sooner.', { reload: 0.25 }]]),
  ...WP('handcannon', 110, [['Hollow Points', 'Cannon shots hit 30% harder.', { dmg: 0.3 }], ['Grapeshot', 'Each shot fires 2 extra balls at half damage.', { extra: 2 }], ['Bursting Shot', 'Blast radius +0.8 tiles.', { splash: 0.8 }], ['Extra Chamber', '+1 ammo and +10% crit chance.', { ammo: 1, crit: 0.1 }]]),
];

export const KEEP = [
  // ---- Defenses
  T('fortify', 'Fortify', '+15% castle and wall HP', [20, 40, 80, 150, 260, 420, 650, 1000], 'defense', { group: 'Walls' }),
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
  T('artslot', 'Arsenal', '+1 slot in your ability loadout (you start with 4)', [500, 1500], 'arts', { group: 'Loadout' }),
  T('volleycd', "Fletcher's Guild", 'Arrow Rain recharges 6% faster', [40, 90, 170, 300, 480], 'arts', { group: 'Arrow Rain' }),
  T('volleydmg', 'Barbed Arrows', 'Arrow Rain deals 12% more damage', [50, 110, 210, 360, 580], 'arts', { group: 'Arrow Rain' }),
  T('volleyrad', 'Wider Skies', 'Arrow Rain covers 8% more ground', [80, 180, 340], 'arts', { group: 'Arrow Rain' }),
  T('oilcd', 'Oil Reserves', 'Boiling Oil recharges 6% faster', [40, 90, 170, 300, 480], 'arts', { group: 'Boiling Oil' }),
  T('oildmg', 'Pitch and Tar', 'Boiling Oil deals 12% more damage', [50, 110, 210, 360, 580], 'arts', { group: 'Boiling Oil' }),
  T('oilrad', 'Long Ladles', 'Boiling Oil covers 8% more ground', [80, 180, 340], 'arts', { group: 'Boiling Oil' }),
  T('unlock_nova', 'Frost Nova', 'Unlock Frost Nova. Slows every foe on the field and freezes ground troops for a moment.', [350], 'arts', { group: 'Frost Nova', ability: 'nova' }),
  T('novacd', 'Deep Winter', 'Frost Nova recharges 6% faster', [100, 220, 400, 650], 'arts', { group: 'Frost Nova', req: 'unlock_nova' }),
  T('novafreeze', 'Hard Frost', 'Frost Nova freezes foes 0.3s longer', [120, 260, 480], 'arts', { group: 'Frost Nova', req: 'unlock_nova' }),
  T('unlock_horn', 'War Horn', 'Unlock the War Horn. Your towers fire 35% faster for 8 seconds.', [600], 'arts', { group: 'War Horn', ability: 'horn' }),
  T('horncd', 'Louder Horn', 'War Horn recharges 6% faster', [120, 260, 480, 780], 'arts', { group: 'War Horn', req: 'unlock_horn' }),
  T('horndur', 'Long Blast', 'War Horn lasts 1.5s longer', [140, 300, 560], 'arts', { group: 'War Horn', req: 'unlock_horn' }),

  // ---- Treasury
  T('warchest', 'War Chest', '+45 starting gold', [15, 30, 60, 110, 200, 330, 520, 800], 'economy', { group: 'Gold' }),
  T('bountyhunter', 'Bounty Hunter', '+9% kill gold', [30, 70, 140, 250, 400, 620], 'economy', { group: 'Gold' }),
  T('wavepay', 'Tax Collectors', 'Wave-clear gold +12%', [50, 110, 210, 360, 580], 'economy', { group: 'Gold' }),
  T('hurry', 'Eager Quartermasters', 'Early-call gold +15%', [40, 90, 170, 300], 'economy', { group: 'Gold' }),
  T('invest', 'Royal Investments', 'Earn 2% interest on unspent gold each wave (max 30 per level)', [90, 200, 380, 650], 'economy', { group: 'Gold' }),
  T('treasure', 'Treasure Hunters', 'Loot and gems are worth 15% more', [40, 90, 170, 300], 'economy', { group: 'Gold' }),
  T('minters', 'Master Minters', 'Mint income +10%', [50, 110, 210, 360, 580], 'economy', { group: 'Gold', req: 'unlock_mint' }),
  T('architect', 'Architect', 'Towers and upgrades cost 6% less', [40, 90, 180, 320, 520], 'economy', { group: 'Building' }),
  T('mastersmith', 'Master Smiths', 'Mastery stars cost 5% less', [60, 130, 250, 430, 700], 'economy', { group: 'Building' }),
  T('surveyors', 'Land Surveyors', 'Claiming ruins costs 8% less', [45, 100, 190, 330, 540], 'economy', { group: 'Building' }),
  T('plots', 'Pre-claimed Land', '+1 open plot at the start of every run', [180, 420, 800, 1400], 'economy', { group: 'Building' }),
  T('salvage', 'Salvage Crew', '+5% sell refund', [25, 60, 120, 220], 'economy', { group: 'Building' }),

  // ---- Hero
  T('marksman', 'Marksman', '+15% weapon damage', [15, 35, 70, 130, 240, 400, 640, 1000], 'hero', { group: 'Weapon' }),
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
  T('unlock_repeater', 'Repeater', 'Unlock the Repeater', [220], 'hero', { group: 'Weapons', weapon: 'repeater' }),
  T('unlock_mortar', 'Siege Mortar', 'Unlock the Siege Mortar', [260], 'hero', { group: 'Weapons', weapon: 'mortar' }),
  T('unlock_thunderlance', 'Thunder Lance', 'Unlock the Thunder Lance', [340], 'hero', { group: 'Weapons', weapon: 'thunderlance' }),
  T('unlock_meteorstaff', 'Meteor Staff', 'Unlock the Meteor Staff', [420], 'hero', { group: 'Weapons', weapon: 'meteorstaff' }),
  T('unlock_titanbolt', 'Titan Ballista', 'Unlock the Titan Ballista', [520], 'hero', { group: 'Weapons', weapon: 'titanbolt' }),
  T('unlock_chainwhip', 'Chain Whip', 'Unlock the Chain Whip', [150], 'hero', { group: 'Weapons', weapon: 'chainwhip' }),
  T('unlock_grapple', 'Grapple Crossbow', 'Unlock the Grapple Crossbow', [200], 'hero', { group: 'Weapons', weapon: 'grapple' }),
  T('unlock_flasks', "Alchemist's Flasks", "Unlock the Alchemist's Flasks", [240], 'hero', { group: 'Weapons', weapon: 'flasks' }),
  T('unlock_harpoon', 'Harpoon Gun', 'Unlock the Harpoon Gun', [280], 'hero', { group: 'Weapons', weapon: 'harpoon' }),
  T('unlock_bell', 'Bell of Thunder', 'Unlock the Bell of Thunder', [380], 'hero', { group: 'Weapons', weapon: 'bell' }),
  ...WEAPON_PERK_NODES,

  // ---- Towers
  T('unlock_mint', 'Royal Mint', 'Unlock the Mint tower', [25], 'towers', { group: 'Unlocks', tower: 'mint' }),
  T('unlock_firetrap', 'Fire Trap', 'Unlock the Fire Trap', [30], 'towers', { group: 'Unlocks', tower: 'firetrap' }),
  T('unlock_ballista', 'Ballista', 'Unlock the Ballista', [45], 'towers', { group: 'Unlocks', tower: 'ballista' }),
  T('unlock_barracks', 'Barracks', 'Unlock the Barracks', [60], 'towers', { group: 'Unlocks', tower: 'barracks' }),
  T('unlock_catapult', 'Catapult', 'Unlock the Catapult', [90], 'towers', { group: 'Unlocks', tower: 'catapult' }),
  T('unlock_banner', 'Artillery', 'Unlock the Artillery battery', [110], 'towers', { group: 'Unlocks', tower: 'artillery' }),
  T('unlock_tesla', 'Tesla Coil', 'Unlock the Tesla Coil', [160], 'towers', { group: 'Unlocks', tower: 'tesla' }),
  T('unlock_frost', 'Frost Spire', 'Unlock the Frost Spire', [200], 'towers', { group: 'Unlocks', tower: 'frost' }),
  T('unlock_obelisk', 'Sun Obelisk', 'Unlock the Sun Obelisk', [280], 'towers', { group: 'Unlocks', tower: 'obelisk' }),
  T('unlock_venom', 'Venom Spire', 'Unlock the Venom Spire', [240], 'towers', { group: 'Unlocks', tower: 'venom' }),
  T('unlock_sanctum', 'Sanctum', 'Unlock the Sanctum', [300], 'towers', { group: 'Unlocks', tower: 'sanctum' }),
  T('unlock_gatling', 'Gatling Nest', 'Unlock the Gatling Nest', [340], 'towers', { group: 'Unlocks', tower: 'gatling' }),
  T('unlock_voidwell', 'Void Well', 'Unlock the Void Well', [420], 'towers', { group: 'Unlocks', tower: 'voidwell' }),
  T('unlock_trebuchet', 'Trebuchet', 'Unlock the Trebuchet', [480], 'towers', { group: 'Unlocks', tower: 'trebuchet' }),
  T('siegecraft', 'Siegecraft', '+9% damage for all towers', [40, 80, 150, 250, 400, 600, 900, 1300], 'towers', { group: 'All towers' }),
  T('optics', "Surveyor's Eye", '+3% range for all towers', [45, 100, 190, 330, 540], 'towers', { group: 'All towers' }),
  T('gears', 'Well-Oiled Gears', 'All towers fire 3% faster', [45, 100, 190, 330, 540], 'towers', { group: 'All towers' }),
  T('hilltop', 'High Command', 'Towers on high ground deal 8% more damage', [60, 130, 250, 430], 'towers', { group: 'All towers' }),
  T('powder', 'Powder Keg', '+5% splash radius for all towers', [50, 110, 210, 360, 580], 'towers', { group: 'All towers' }),
  T('giantbane', 'Giant Slayer', 'Towers deal 6% more damage to bosses', [60, 130, 250, 430, 700], 'towers', { group: 'All towers' }),
  T('armorbane', 'Armor-Piercing Tips', 'Towers deal 5% more damage to armored foes', [55, 120, 230, 400, 640], 'towers', { group: 'All towers' }),
  T('skyhunters', 'Sky Hunters', 'Towers deal 6% more damage to flyers', [50, 110, 210, 360, 580], 'towers', { group: 'All towers' }),
  TRAIN('archer', 'Archery Range'), TRAIN('cannon', 'Gun Foundry'), TRAIN('mage', 'Arcane Academy'), TRAIN('flak', 'Sky Watch'),
  TRAIN('mint', 'Counting House', 'unlock_mint'), TRAIN('firetrap', "Alchemists' Guild", 'unlock_firetrap'), TRAIN('ballista', 'Bolt Works', 'unlock_ballista'),
  TRAIN('barracks', 'Drill Yard', 'unlock_barracks'), TRAIN('catapult', 'Siege Workshop', 'unlock_catapult'), TRAIN('artillery', 'Gunnery School', 'unlock_banner'),
  TRAIN('tesla', 'Storm Lab', 'unlock_tesla'), TRAIN('obelisk', 'Sun Priests', 'unlock_obelisk'),
  TRAIN('venom', 'Apothecaries', 'unlock_venom'), TRAIN('gatling', 'Gunsmiths', 'unlock_gatling'), TRAIN('voidwell', 'Rift Scholars', 'unlock_voidwell'), TRAIN('trebuchet', 'Siege Engineers', 'unlock_trebuchet'),

  // ---- Garrison: troops you train in the keep and send into the field
  T('unlock_pikeman', 'Pikemen', 'Unlock Pikemen: armor and reach, double damage to fast foes', [40], 'garrison', { group: 'Troops', troop: 'pikeman' }),
  T('unlock_crossbowman', 'Crossbowmen', 'Unlock Crossbowmen: armor-piercing bolts that hit flyers', [70], 'garrison', { group: 'Troops', troop: 'crossbow' }),
  T('unlock_knight', 'Knights', 'Unlock Knights: heavy armored tanks', [120], 'garrison', { group: 'Troops', troop: 'knight' }),
  T('unlock_cleric', 'Clerics', 'Unlock Clerics: they heal your troops', [140], 'garrison', { group: 'Troops', troop: 'cleric' }),
  T('unlock_cavalry', 'Cavalry', 'Unlock Cavalry: fast riders that hunt thieves, archers and casters', [170], 'garrison', { group: 'Troops', troop: 'cavalry' }),
  T('unlock_engineer', 'Engineers', 'Unlock Engineers: they repair towers in the middle of a wave', [180], 'garrison', { group: 'Troops', troop: 'engineer' }),
  T('unlock_griffon', 'Griffon Riders', 'Unlock Griffon Riders: elite flyers that hit air and ground', [420], 'garrison', { group: 'Troops', troop: 'griffon' }),
  T('gar_slots', 'Barracks Annex', '+2 troop slots', [50, 110, 210, 360, 580], 'garrison', { group: 'Barracks' }),
  T('gar_train', 'Drill Sergeants', 'Troops train 8% faster', [35, 80, 150, 260, 420], 'garrison', { group: 'Barracks' }),
  T('gar_cost', 'Quartermaster', 'Troops cost 6% less gold', [40, 90, 170, 300, 480], 'garrison', { group: 'Barracks' }),
  T('gar_muster', 'Call to Arms', 'The Muster fills 12% faster', [45, 100, 190, 330], 'garrison', { group: 'Barracks' }),
  T('gar_hp', 'Forged Mail', 'Troops have 12% more health', [40, 90, 170, 300, 480, 720], 'garrison', { group: 'Training' }),
  T('gar_dmg', 'Whetstones', 'Troops deal 12% more damage', [40, 90, 170, 300, 480, 720], 'garrison', { group: 'Training' }),
  T('gar_valor', 'Heroic Deeds', 'Earn 10% more Valor', [50, 110, 210, 360, 580], 'garrison', { group: 'Training' }),
  T('gar_heal', 'Field Hospital', 'Troops heal 25% faster in the castle', [45, 100, 190, 330], 'garrison', { group: 'Care' }),
  T('gar_save', 'Stretcher Bearers', '8% chance a fallen troop is carried back alive', [80, 180, 340, 580], 'garrison', { group: 'Care' }),

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
    ['castle:bogwood', 'Bogwood Lodge', 500], ['castle:thunder', 'Thunderhold', 900],
    ['kill:spores', 'Bog Spores', 550], ['kill:runes', 'Rune Scatter', 750], ['skin:crystal', 'Crystal', 1000],
  ].map(([c, n, cost]) => T('cos_' + c.replace(':', '_'), n, { castle: 'Castle style', kill: 'Defeat effect', skin: 'Tower style' }[c.split(':')[0]], [cost], 'wardrobe', { group: 'Wild Marches', cosmetic: c })),
  ...[
    ['hero:ranger', 'Ranger', 300], ['hero:corsair', 'Corsair', 600], ['hero:wizard', 'Battlemage', 750],
    ['hero:royal', 'Crowned Prince', 1000], ['hero:shadow', 'Shadow Stalker', 1300],
  ].map(([c, n, cost]) => T('cos_' + c.replace(':', '_'), n, 'Hero outfit: your archer on the battlements', [cost], 'wardrobe', { group: 'Hero outfits', cosmetic: c })),
  ...[
    ['Squire', 150], ['Knight-Errant', 400], ['Shieldbearer', 800], ['Lionheart', 1500], ['Warden of Aldermere', 3000],
  ].map(([t, cost]) => T('title_' + t.toLowerCase().replace(/[^a-z]+/g, ''), t, 'Leaderboard title', [cost], 'wardrobe', { group: 'Titles', title: t })),
];
// Every unlockable ability beyond Frost Nova and War Horn shares one shape: unlock it, shorten its cooldown, boost its signature stat.
{
  let at = KEEP.findIndex((k) => k.id === 'horndur') + 1;
  const r10 = (n) => Math.max(10, Math.round(n / 10) * 10);
  for (const [id, A] of Object.entries(ABILITIES)) {
    if (!A.buy) continue;
    const base = A.buy;
    const nodes = [
      T('unlock_' + id, A.name, `Unlock ${A.name}. ${A.desc}`, [base], 'arts', { group: A.name, ability: id }),
      T(id + 'cd', 'Quick Recovery', `${A.name} recharges 6% faster`, [0.2, 0.45, 0.8, 1.3].map((f) => r10(base * f)), 'arts', { group: A.name, req: 'unlock_' + id }),
      T(id + 'pow', A.up.name, A.up.desc, [0.3, 0.65, 1.2].map((f) => r10(base * f)), 'arts', { group: A.name, req: 'unlock_' + id }),
    ];
    KEEP.splice(at, 0, ...nodes);
    at += nodes.length;
  }
}

export const KEEP_BRANCHES = { towers: 'Towers', garrison: 'Garrison', hero: 'Hero', economy: 'Treasury', defense: 'Defenses', arts: 'Castle Arts', wardrobe: 'Wardrobe' };

export const GIFTS = {
  gold:   { name: 'Gold Cache', desc: '+120 starting gold in your next run.' },
  repair: { name: 'Repair Kit', desc: 'One free full wall repair.' },
  tower:  { name: 'Allied Tower', desc: 'A friend\'s tower fights for you for 10 waves.' },
};
export const GIFT_DAILY_CAP = 5;
GIFTS.reroll = { name: 'Boon Token', desc: '+1 boon reroll in your next run.' };
export const SALUTE_DAILY_CAP = 10;
export const SALUTES = ['Well fought!', 'Hold the line!', 'Thanks for the help!', 'Join me for a run?', 'Nice wave!', 'For the Realm!'];
export const MOTTOS = ['For the Realm!', 'Hold the line.', 'One more wave.', 'Towers, towers, towers.', 'Never leak.', 'Hero shots only.', 'Boon hoarder.', 'Daily rally regular.'];

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

// The Daily Rally: one shared goal for the whole Realm every Central day. Beat it and every contributor gets spoils.
export const RALLY = { floorKills: 1500, perActive: 600, carry: 0.8, cap: 25000, minKills: 30, renown: 30 }   // cap: a sanity ceiling per citizen per day (was 1,500);

export const SIEGE = { durationDays: 3, bosses: ['The Iron Colossus', 'Queen of Ash', 'The Hollow King', 'Stormwyrm', 'Mother of Rats'] };

// ---------------------------------------------------------------------------
// The Realm: one nation, every player a citizen. Shared weekly and monthly goals.
// Progress is the average of two meters: enemies defeated and waves held.
// ---------------------------------------------------------------------------
export const REALM = {
  name: 'The Realm of Aldermere',
  tiers: [0.25, 0.5, 0.75, 1, 1.5],                       // fractions of the goal
  tierNames: ['Watchfire', 'Palisade', 'Garrison', 'Victory', 'Legend'],
  wavesPerKills: 20,                                       // waves goal = kills goal / 20
  // Goals follow the Realm: max(turnout × perActive, last period's output × carry), rising at most maxRise× a period.
  // With carry 0.85, a Realm that repeats last week lands near 118%: Victory is in reach, Legend takes a push.
  carry: 0.85, maxRise: 2.5,
  week: {
    label: 'Weekly Muster', floorKills: 5000, perActive: 2500, cap: 250000, minKills: 50,
    rewards: [25, 35, 50, 90, 110],
    perks: [
      { startGold: 25 }, { killGold: 0.03 }, { repairDiscount: 0.1 }, { towerDiscount: 0.03 }, { towerDmg: 0.04 },
    ],
    perkText: ['+25 starting gold', '+3% kill gold', 'Repairs cost 10% less', 'Towers cost 3% less', '+4% tower damage'],
  },
  month: {
    label: 'Monthly Campaign', floorKills: 20000, perActive: 9000, cap: 1000000, minKills: 150,
    rewards: [90, 130, 200, 350, 450],
    perks: [
      { castleHpMult: 0.05 }, { startGold: 40 }, { killGold: 0.04 }, { towerDmg: 0.04 }, { weaponDmg: 0.05 },
    ],
    perkText: ['+5% keep HP', '+40 starting gold', '+4% kill gold', '+4% tower damage', '+5% hero damage'],
    topTitles: ['Realm Champion', 'Realm Warden', 'Realm Warden'],
  },
};
