// What to bring against each foe, worked out from the foe's own numbers so the advice can never drift from the rules.
// Used by the Foe Guide, the "new foe" card and the tower-damage callouts.
import { ENEMIES, BOSSES, BOSS_DESC } from '../data/balance.js';

// Tower families by how their damage is dealt (see TOWERS[..].type and targets).
const MAGIC = ['Mage', 'Tesla', 'Frost Spire', 'Sun Obelisk', 'Void Well'];
const AIR = ['Archer', 'Mage', 'Flak', 'Tesla', 'Frost Spire', 'Gatling', 'Venom Spire'];

export function foeDef(key) {
  const boss = key.startsWith('boss:');
  const id = boss ? key.slice(5) : key;
  const def = boss ? BOSSES.find((b) => b.id === id) : ENEMIES[id];
  return { id, boss, def, desc: boss ? BOSS_DESC[id] : def?.desc };
}

// → { tags: ['Armored', …], use: 'Mage, Tesla, …' | null, avoid: '…' | null, tip: '…' | null }
export function adviceFor(key) {
  const { def, boss } = foeDef(key);
  if (!def) return { tags: [], use: null, avoid: null, tips: [] };
  const tags = [], use = [], avoid = [], tips = [];
  const add = (list, ...xs) => { for (const x of xs) if (!list.includes(x)) list.push(x); };
  if (def.air) { tags.push('Flying'); add(use, 'Flak', 'Archer', 'Mage', 'Tesla', 'Frost', 'Gatling'); add(avoid, 'ground-only towers (Cannon, Ballista, Catapult) cannot hit it'); }
  if (def.armor >= 30 || def.armored) { tags.push('Armored'); add(use, 'Mage', 'Tesla', 'Ballista', 'Venom (ignores armor)', 'Fire Trap'); add(avoid, 'plain arrows and cannon shells bounce off'); }
  if (def.mr >= 40) { tags.push('Resists magic'); add(use, 'Archer', 'Cannon', 'Gatling', 'Ballista'); add(avoid, 'Mage and Tesla'); }
  if (def.mr <= -10) { tags.push('Weak to magic'); add(use, 'Mage', 'Tesla'); }
  if (def.ward) { tags.push('Casts bubbles'); add(use, 'Mage', 'Tesla'); tips.push('Its bubble soaks damage. A Mage bolt dispels it outright (and stops it re-warding for a moment), other magic bursts it twice as fast. Kill the Warlock itself with arrows or your bow: it resists magic.'); }
  if (def.shoots) { tags.push('Shoots towers'); tips.push('Its arrows wreck towers from the road. Kill it early, and a Sanctum nearby soaks the damage.'); }
  if (def.blast) { tags.push('Explodes'); tips.push('Its keg blows up towers beside it when it dies. Pop it far away: Ballista, Catapult, Trebuchet or your own bow.'); }
  if (def.sabotage) { tags.push('Disables towers'); tips.push('It switches a nearby tower off. Kill it before it reaches your towers; a Sanctum cleanses sabotage.'); }
  if (def.heal) { tags.push('Heals foes'); tips.push('Burst it down first with your bow or chain lightning (Mage, Tesla).'); }
  if (def.steal) { tags.push('Steals gold'); add(use, 'Frost', 'Barracks'); tips.push('Slow it and kill it before it escapes; a caught thief spills a fortune.'); }
  if (def.burrow) { tags.push('Burrows'); add(use, 'Fire Trap', 'Cannon', 'Frost'); tips.push('Underground it cannot be targeted. Traps, splash and slows catch it when it surfaces.'); }
  if (def.regen) { tags.push('Regenerates'); add(use, 'Fire Trap', 'Venom'); tips.push('Fire and poison stop its regrowth.'); }
  if (def.blink) { tags.push('Blinks'); add(use, 'Ballista', 'Mage'); tips.push('It teleports past soldiers. Burst it down rather than holding it.'); }
  if (def.split) { tags.push('Splits'); add(use, 'Cannon', 'Flak', 'Artillery'); tips.push('It bursts into spiderlings: splash towers clean them up.'); }
  if (def.aura) { tags.push('Buffs foes'); add(use, 'Mage'); tips.push('Its banner toughens everything nearby. Kill it first, or let Mage bolts dispel the buff.'); }
  if (def.wallMult > 1) { tags.push('Smashes the wall'); add(use, 'Mage', 'Tesla'); tips.push('Triple damage to your wall. It is weak to magic: stop it before it arrives.'); }
  if (def.drain) { tags.push('Chills towers'); add(use, 'Archer', 'Cannon', 'Ballista'); tips.push('Towers beside it fire at half speed for a few seconds. Kill it from range; a Sanctum cleanses the chill.'); }
  if (def.rage) { tags.push('Berserks'); add(use, 'Frost', 'Barracks'); tips.push('Below half health it sprints. Burst it down in one go, or keep it slowed.'); }
  if (def.ignoreWall) { tags.push('Climbs the wall'); tips.push('Ladders carry it over the wall straight to the keep. Stop it on the road.'); }
  if (def.aura && !def.aura.speed && def.aura.armor) { add(use, 'Mage', 'Ballista'); tips.push('Foes standing near it are armored. Break the line with magic or armor-piercing shots.'); }
  if (def.striker && def.shoots) { tags.push('Siege artillery'); tips.push('It outranges most towers. Ballistas, Catapults and your bow reach it; Sanctums soak the damage.'); }
  if (def.cleave || def.crush || def.hunts) { tags.push('Hurts troops'); tips.push('It smashes your soldiers. Shoot it from range or slow it.'); }
  if (def.flock) { tags.push('Flock'); add(use, 'Flak', 'Cannon'); }
  if (def.phalanx) { tags.push('Shield wall'); add(use, 'Cannon', 'Catapult', 'Artillery', 'Fire Trap', 'Mage'); tips.push('Locked together they halve single arrows, bolts and shot. Splash, fire, your own bow and Mage dispels break the wall.'); }
  if (def.barricade) { tags.push('Builds barricades'); add(use, 'Catapult', 'Artillery', 'Mage'); tips.push('Its barricades soak shots aimed at the front of the line. Set key towers to target the strongest, or splash past them.'); }
  if (def.structure) { tags.push('Barricade'); tips.push('It never moves or attacks, and falls apart on its own.'); }
  if (def.reflect) { tags.push('Reflects magic'); add(use, 'Archer', 'Cannon', 'Ballista', 'Gatling'); add(avoid, 'leading with Mage or Tesla: the first bolt comes back and jams the tower'); tips.push('Its mirror turns one magic bolt back every few seconds. Physical damage first.'); }
  if (def.charge) { tags.push('Charge under the wall'); tips.push(`If it reaches the keep it blows a charge worth ${def.charge} breaches, straight past the wall. Catch it when it surfaces.`); }
  if (def.banner) { tags.push('War standard'); add(use, 'Mage'); tips.push('Foes near it take 25% less damage and march faster. Kill the Standard-Bearer first (your bow, a Ballista), or dispel its banner with Mage bolts.'); }
  if (def.speed >= 1.4) tags.push('Fast');
  if (boss) {
    const B = def;
    if (B.summon) { tags.push('Summons'); tips.push('It keeps calling reinforcements. Kill the boss, not the grunts: your bow and Ballistas.'); }
    if (B.frost) { tags.push('Freezes towers'); add(use, 'Fire Trap', 'Catapult', 'Trebuchet'); tips.push('Its breath freezes every tower near it for a moment. Keep some towers out of its reach and burn it.'); }
    if (B.raise) { tags.push('Raises the dead'); tips.push('It turns fallen foes back into grunts. Kill it fast.'); }
    if (B.stomp) { tags.push('Stuns towers'); tips.push('Its stomp jams towers close to the road. Keep key towers a few tiles back, and attack it from range.'); }
    if (B.breath) { tags.push('Breathes fire'); tips.push('Its breath burns a whole cluster of towers. Spread your towers out; anti-air hurts it: Flak, Archer, Mage.'); }
    if (B.spit && B.spit.disable >= 4) { tags.push('Roots towers'); tips.push('It roots every tower it passes. A Sanctum cleanses it; fire and poison stop its regrowth.'); } else if (B.spit) { tags.push('Spits acid'); tips.push('Its acid wrecks and jams towers. A Sanctum cleanses it. Fire and poison stop its regrowth.'); }
  }
  if (!tags.length) tags.push('No special trick');
  return { tags, use: use.length ? use.join(', ') : null, avoid: avoid.length ? avoid.join('; ') : null, tips };
}

// Where tower damage comes from, so a wrecked tower can say why.
export const TOWER_HIT = {
  archer: { icon: '🏹', name: 'Archer arrows', tip: 'Kill Archers early. A Sanctum soaks damage; Warding cuts it by 40%.' },
  bomber: { icon: '💣', name: 'Bomber blast', tip: 'Kill Bombers far from your towers. Their keg goes off where they fall.' },
  meteor: { icon: '☄', name: 'Meteor storm', tip: 'Meteors hit the road and what is beside it. Repair between waves.' },
  stomp: { icon: '💥', name: 'Boss stomp', tip: 'Keep key towers a few tiles back from the road.' },
  breath: { icon: '🔥', name: 'Dragon fire', tip: 'The breath burns a whole cluster. Spread towers out and shoot the Dragon down.' },
  reflect: { icon: '🪞', name: 'Mirror Mage reflection', tip: 'Hit Mirror Mages with arrows or shot before magic.' },
  spit: { icon: '🧪', name: 'Hydra acid', tip: 'A Sanctum cleanses the acid. Fire and poison stop the Hydra regrowing.' },
};
export const towerHitSrc = (kind, bossName) => ({ kind, ...(TOWER_HIT[kind] || { icon: '💥', name: 'Enemy attack', tip: '' }), ...(bossName ? { name: `${bossName}'s ${TOWER_HIT[kind]?.name.split(' ').slice(-1)[0] || 'attack'}` } : {}) });
