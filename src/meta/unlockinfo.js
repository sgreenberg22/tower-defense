// Plain-language "what does this do?" cards for things you can buy in The Keep. Pure data, no DOM.
import { TOWERS, WEAPONS, ABILITIES } from '../data/balance.js';

const TARGETS = { g: 'Ground only', a: 'Flyers only', ga: 'Ground and flyers' };

export function towerRole(def) {
  if (def.trap) return 'Road trap';
  if (def.passive) return 'Support';
  if (def.pulse) return 'Crowd control';
  if (def.beam) return 'Single-beam attacker';
  return 'Attacker';
}

// → { icon, name, kind, desc, how, facts: [[label, value]], extras: [string] } or null for nodes that aren't unlocks.
export function unlockInfo(node) {
  if (node.ability) {
    const A = ABILITIES[node.ability];
    const facts = [['Recharge', `${A.cd}s`]];
    if (A.duration) facts.push(['Lasts', `${A.duration}s`]);
    if (A.radius) facts.push(['Area', 'Radius ' + A.radius]);
    if (A.range) facts.push(['Reach', `${A.range} tiles`]);
    facts.push(['Use', A.aim ? 'Press, then tap the field' : 'Press once, takes effect at once']);
    return { icon: A.icon, name: A.name, kind: 'Castle art', desc: A.desc,
      how: 'Bring it on a run by ticking it in your castle-arts loadout when you set up a run. It works only during waves.', facts, extras: A.up ? [`Keep upgrades: faster recharge, and "${A.up.name}" (${A.up.desc.replace(/^[^ ]+ /, '')}).`] : [] };
  }
  if (node.tower) {
    const d = TOWERS[node.tower];
    const facts = [['Role', towerRole(d)], ['Cost', `⛁ ${d.cost}`], ['Available from', `wave ${d.unlockWave}`]];
    if (d.targets) facts.push(['Hits', TARGETS[d.targets]]);
    if (d.range) facts.push(['Range', String(d.range)]);
    if (d.trap) facts.push(['Placement', 'On the road, max 3 traps']);
    const specs = Object.values(d.specs || {}).map((s) => `${s.name}: ${s.desc}`);
    return { icon: null, tower: node.tower, name: d.name, kind: 'Emplacement', desc: d.desc, how: d.tip || 'Build it on a stone plot beside the road. Upgrade to tier 4, choose a specialization, then keep buying Mastery stars.', facts, extras: specs.length ? ['Specializations at tier 4: ' + specs.join(' · ')] : [] };
  }
  if (node.weapon) {
    const w = WEAPONS[node.weapon];
    return { icon: '🏹', name: w.name, kind: 'Hero weapon', desc: w.desc, how: 'Pick it in the "Your weapon" list when you set up a run. You aim and fire it yourself.',
      facts: [['Damage', String(w.dmg)], ['Reload', `${w.reload}s`], ['Quiver', String(w.ammo)], ['Crit', `${Math.round(w.crit * 100)}%`]], extras: [] };
  }
  return null;
}
