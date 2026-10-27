// Plain-language list of the permanent bonuses a run starts with (Keep upgrades, Dynasty and Legacy perks, Realm gifts, clan perks),
// so players can see what is actually helping them. Reads the final run-bonus object the engine uses.
const pct = (v) => `${Math.round(v * 100)}%`;
const ROWS = [
  ['squire', (v) => v === true && "Squire's Grace: a new commander's first runs get Second Wind and +40 gold", '🌱'],
  ['castleHpMult', (v) => v > 1 && `Keep +${pct(v - 1)} HP`, '🏰'],
  ['wallHpMult', (v) => v > 1 && `Wall +${pct(v - 1)} HP`, '🧱'],
  ['castleDR', (v) => v > 0 && `Keep takes ${pct(v)} less damage`, '🛡'],
  ['towerHpMult', (v) => v > 1 && `Towers +${pct(v - 1)} HP`, '🧱'],
  ['startGold', (v) => v > 0 && `+${Math.round(v)} starting gold`, '🪙'],
  ['killGold', (v) => v > 0 && `+${pct(v)} gold from kills`, '🪙'],
  ['waveGold', (v) => v > 0 && `+${pct(v)} gold when a wave clears`, '🪙'],
  ['interest', (v) => v > 0 && `+${(v * 100).toFixed(v < 0.1 ? 1 : 0).replace(/\.0$/, '')}% interest on saved gold`, '🏦'],
  ['lootBonus', (v) => v > 0 && `+${pct(v)} loot`, '🎁'],
  ['towerDiscount', (v) => v > 0 && `Towers ${pct(v)} cheaper`, '🔨'],
  ['repairDiscount', (v) => v > 0 && `Repairs ${pct(v)} cheaper`, '🔧'],
  ['towerDmg', (v) => v > 0 && `Towers +${pct(v)} damage`, '⚔'],
  ['towerRange', (v) => v > 0 && `Towers +${pct(v)} range`, '🎯'],
  ['towerRate', (v) => v > 0 && `Towers +${pct(v)} fire rate`, '⚡'],
  ['weaponDmg', (v) => v > 0 && `Your weapon +${pct(v)} damage`, '🏹'],
  ['bossDmg', (v) => v > 0 && `+${pct(v)} damage to bosses`, '👑'],
  ['armoredDmg', (v) => v > 0 && `+${pct(v)} damage to armored foes`, '🛡'],
  ['airDmg', (v) => v > 0 && `+${pct(v)} damage to flyers`, '🦅'],
  ['troopHp', (v) => v > 0 && `Troops +${pct(v)} health`, '🪖'],
  ['troopDmg', (v) => v > 0 && `Troops +${pct(v)} damage`, '🪖'],
  ['startPlots', (v) => v > 0 && `+${v} open build plot${v === 1 ? '' : 's'} at the start`, '🏗'],
  ['startBoons', (v) => v > 0 && `+${v} free boon at the start`, '✨'],
  ['boonChoices', (v) => v > 0 && `+${v} choice on every boon offer`, '✨'],
  ['rerolls', (v) => v > 0 && `${v} boon reroll${v === 1 ? '' : 's'} per run`, '🎲'],
  ['secondWind', (v) => v === true && 'Second Wind: the keep survives one fatal blow', '💫'],
];

// -> [{ icon, text }] for every bonus that is switched on.
export function blessingRows(bonus) {
  const out = [];
  if (!bonus) return out;
  for (const [key, fmt, icon] of ROWS) {
    const text = fmt(bonus[key]);
    if (text) out.push({ icon, text });
  }
  return out;
}
