// Prestige ("Dynasty"): for players who have bought most of the Keep. Ascend to a new Dynasty to reset the Keep's stat upgrades
// in exchange for permanent power, a Legacy perk of your choice, exclusive cosmetics and a royal endowment to rebuild with.
// Unlocks (towers, weapons, castle arts), the Wardrobe, titles, achievements, stats and rank are never reset.

export const PRESTIGE = {
  // Renown that must be earned inside the current Dynasty before you may ascend. `level` = ascensions done so far.
  need: (level) => Math.round((90000 * Math.pow(1.1, level)) / 1000) * 1000,
  // Royal endowment paid when you ascend, so the first Keep upgrades are within reach straight away.
  endowment: (newLevel) => 3000 + 1000 * Math.min(newLevel, 20),
  // Permanent power for every Dynasty reached (each capped, so very old Dynasties still have a ceiling).
  perLevel: {
    renown:   { per: 0.05, cap: 1.0,  label: 'Renown from every run' },
    towerDmg: { per: 0.02, cap: 0.5,  label: 'tower damage' },
    hp:       { per: 0.02, cap: 0.5,  label: 'castle and wall HP' },
    gold:     { per: 12,   cap: 360,  label: 'starting gold' },
  },
  choices: 3,        // Legacy perks offered at each ascension
};

// Legacy perks: pick one of three at every ascension. Each can be taken up to `max` times, and stacks.
// `fx` keys are the run-bonus fields in src/meta/profile.js runBonus(); `cd` multiplies every Castle Art cooldown.
export const LEGACY = {
  treasury:       { name: 'Royal Treasury',       icon: '💰', desc: '+60 starting gold',                 fx: { startGold: 60 },                    max: 5 },
  ironblood:      { name: 'Iron Blood',           icon: '🛡', desc: '+8% castle and wall HP',            fx: { castleHpMult: 0.08, wallHpMult: 0.08 }, max: 5 },
  archers:        { name: 'House of Archers',     icon: '🏹', desc: '+8% weapon damage',                 fx: { weaponDmg: 0.08 },                  max: 5 },
  engineers:      { name: 'Master Engineers',     icon: '🛠', desc: 'Towers cost 3% less',               fx: { towerDiscount: 0.03 },              max: 4 },
  tithes:         { name: 'Tithe Rights',         icon: '🪙', desc: '+5% kill gold',                     fx: { killGold: 0.05 },                   max: 5 },
  scholars:       { name: 'Court Scholars',       icon: '📚', desc: '+1 boon reroll every run',          fx: { rerolls: 1 },                       max: 3 },
  landlords:      { name: 'Landed Gentry',        icon: '🏡', desc: '+1 plot already open at the start', fx: { startPlots: 1 },                    max: 3 },
  alchemists:     { name: 'Court Alchemists',     icon: '⚗', desc: 'Castle Arts recharge 4% faster',    fx: { cd: 0.96 },                         max: 5 },
  quartermasters: { name: 'Quartermasters',       icon: '📦', desc: '+6% gold for every wave cleared',   fx: { waveGold: 0.06 },                   max: 5 },
  sentinels:      { name: 'Eagle-Eyed Sentinels', icon: '🔭', desc: '+3% tower range',                   fx: { towerRange: 0.03 },                 max: 4 },
  drills:         { name: 'Drilled Crews',        icon: '⚙', desc: '+3% tower fire rate',               fx: { towerRate: 0.03 },                  max: 4 },
  giantkillers:   { name: 'Giant-Killers',        icon: '🗡', desc: '+8% damage to bosses',              fx: { bossDmg: 0.08 },                    max: 5 },
};

// What each ascension hands over, by the Dynasty reached. Cosmetics are keys into COSMETICS; themes unlock by level on their own.
export const PRESTIGE_REWARDS = [
  { level: 1,  title: 'Heir of Aldermere',  cosmetic: 'castle:dynasty',    theme: 'Royal Court' },
  { level: 2,  title: 'Scion of Kings',     cosmetic: 'trail:monarch' },
  { level: 3,  title: 'Dynast',             cosmetic: 'kill:crown',        theme: 'Starforged Throne' },
  { level: 4,  title: 'Crowned Dynast',     cosmetic: 'skin:amethyst' },
  { level: 5,  title: 'Monarch of Ages',    cosmetic: 'hero:monarch',      theme: 'Eternal Dynasty' },
  { level: 6,  title: 'High Sovereign',     cosmetic: 'castle:eternal' },
  { level: 7,  title: 'Dragon-Crowned',     cosmetic: 'trail:eclipse' },
  { level: 8,  title: 'Immortal Regent',    cosmetic: 'kill:eclipse' },
  { level: 9,  title: 'Lord of Lords',      cosmetic: 'skin:sunsteel' },
  { level: 10, title: 'Legend Eternal',     cosmetic: 'hero:dragonlord' },
];

// Commander ranks beyond Grand Marshal pay a one-off Renown gift when reached.
export const RANK_REWARDS = {
  'Lord Protector': { renown: 1000 }, 'Archduke': { renown: 1500 }, 'Prince Regent': { renown: 2500 },
  'High King': { renown: 4000 }, 'Emperor': { renown: 6000 }, 'Eternal Sovereign': { renown: 10000 },
};
