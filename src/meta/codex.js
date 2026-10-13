// The Codex (encyclopedia): plain-data entries for every tower, foe, boss, weapon, castle art, boon, threat, battlefield and modifier.
// Pure data built from src/data/balance.js, so the screen, the tests and the game can never disagree about a number.
import { TOWERS, TOWER_ORDER, TROOPS, TROOP_ORDER, ENEMIES, BOSSES, BOSS_DESC, WEAPONS, ABILITIES, BOONS, THREATS, MODIFIERS, KEEP, MASTERY_PERKS, PERK_STARS, ARMORY, COMBO, ASCENSION, DIFFICULTY, BIOMES, ART_KEYS } from '../data/balance.js';
import { MAPS, MAP_ORDER } from '../game/maps.js';
import { towerRole } from './unlockinfo.js';

const TARGETS = { g: 'Ground only', a: 'Flyers only', ga: 'Ground and flyers' };
const DMG_TYPE = { physical: 'Physical', magic: 'Magic', fire: 'Fire' };
const num = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const pct = (n) => Math.round(n * 100) + '%';

export const CODEX_TABS = [
  { id: 'towers',   label: 'Emplacements', icon: '🏰' },
  { id: 'troops',   label: 'Garrison',     icon: '⚔' },
  { id: 'foes',     label: 'Foes',         icon: '👹' },
  { id: 'bosses',   label: 'Bosses',       icon: '🐉' },
  { id: 'weapons',  label: 'Weapons',      icon: '🏹' },
  { id: 'arts',     label: 'Castle Arts',  icon: '✨' },
  { id: 'boons',    label: 'Boons',        icon: '📜' },
  { id: 'threats',  label: 'Threats',      icon: '⚠' },
  { id: 'lands',    label: 'Lands',        icon: '🗺' },
  { id: 'rules',    label: 'Rules',        icon: '📖' },
];

// Where a tower comes from, in plain words.
function towerUnlock(id) {
  const t = TOWERS[id];
  if (!t.keep) return `Available from the start (wave ${t.unlockWave})`;
  const node = KEEP.find((k) => k.id === t.keep);
  return `Unlock in The Keep for ✦ ${node ? node.cost[0] : '?'} Renown · appears from wave ${t.unlockWave}`;
}

export function towerEntry(id) {
  const d = TOWERS[id];
  const facts = [['Role', towerRole(d)], ['Cost', `⛁ ${d.cost}`], ['Unlock', towerUnlock(id)]];
  if (d.targets) facts.push(['Hits', TARGETS[d.targets]]);
  if (d.type) facts.push(['Damage type', DMG_TYPE[d.type] || d.type]);
  if (d.dmg) facts.push(['Damage', `${d.dmg}${d.chain ? ` · chains ×${d.chain}` : ''}${d.splash ? ` · splash ${d.splash}` : ''}${d.pierce ? ` · pierces ${d.pierce}` : ''}`]);
  if (d.dps) facts.push(['Beam', `${d.dps} damage/s, ramps ×${d.rampMax}`]);
  if (d.rate) facts.push(['Fire rate', `${d.rate}/s`]);
  if (d.range) facts.push(['Range', num(d.range) + (d.minRange ? ` (not closer than ${d.minRange})` : '')]);
  if (d.income) facts.push(['Income', `⛁ ${d.income} per wave`]);
  if (d.aura) facts.push(['Aura', `radius ${d.aura}`]);
  if (d.soldiers) facts.push(['Soldiers', `${d.soldiers}, respawn ${d.respawn}s`]);
  if (d.burn) facts.push(['Burn', `${d.burn}/s for ${d.burnTime}s`]);
  if (d.poison) facts.push(['Poison', `${d.poison}/s for ${d.poisonTime}s, stacks to ${d.poisonCap}`]);
  if (d.slow) facts.push(['Slow', `${pct(d.slow)} for ${d.slowTime}s`]);
  if (d.trap) facts.push(['Placement', 'On the road, three traps at most']);
  facts.push(['Health', String(d.hp)]);
  return {
    id, kind: 'tower', name: d.name, blurb: d.desc, tip: d.tip || null, facts,
    specs: Object.values(d.specs || {}).map((s) => ({ name: s.name, desc: s.desc })),
    perks: (MASTERY_PERKS[id] || []).map((p, i) => ({ stars: PERK_STARS[i], name: p.name, desc: p.desc })),
    search: [d.name, d.desc, towerRole(d)].join(' ').toLowerCase(),
  };
}

export function troopEntry(id) {
  const d = TROOPS[id];
  const node = d.keep ? KEEP.find((k) => k.id === d.keep) : null;
  const facts = [['Role', d.role], ['Cost', `⛁ ${d.cost}${d.valor ? ` · ⚜ ${d.valor} Valor` : ''}`], ['Training', `${d.train}s · ${d.slots} slot${d.slots > 1 ? 's' : ''}`],
    ['Unlock', node ? `The Keep (Garrison) for ✦ ${node.cost[0]} Renown · trainable from wave ${d.unlockWave}` : `Trainable from wave ${d.unlockWave}`],
    ['Health', String(d.hp)], ['Armor', String(d.armor || 0)]];
  if (d.dmg) facts.push(['Damage', `${d.dmg} · ${num(d.rate)}/s${d.pierce ? ` · ignores ${d.pierce} armor` : ''}`]);
  facts.push(['Reach', d.range ? `Range ${num(d.range)}` : 'Melee']);
  const traits = [];
  if (d.air) traits.push('Can hit flyers');
  if (d.holds) traits.push('Holds a foe in place so towers hit it harder');
  if (d.antiFast) traits.push(`×${d.antiFast} damage to fast foes`);
  if (d.antiBoss) traits.push('Seeks out the toughest foes');
  if (d.charge) traits.push(`First strike on each foe hits ×${d.charge}`);
  if (d.hunter) traits.push('Hunts thieves, archers, healers and casters');
  if (d.heal) traits.push(`Mends the most wounded troop for ${pct(d.heal)} every ${d.healCd}s`);
  if (d.flies) traits.push('Flies: crosses the walls and the road');
  return { id, kind: 'troop', name: d.name, blurb: d.desc, tip: null, facts, traits, icon: d.icon,
    search: [d.name, d.desc, d.role].join(' ').toLowerCase() };
}

export function foeEntry(id) {
  const d = ENEMIES[id];
  const facts = [['Health', String(d.hp)], ['Speed', String(d.speed)], ['Armor', String(d.armor || 0)], ['Magic resist', String(d.mr || 0)], ['Bounty', `⛁ ${d.bounty}`],
    ['First seen', d.unlock && d.unlock < 999 ? `wave ${d.unlock}` : 'Spawned by other foes']];
  const traits = [];
  if (d.air) traits.push('Flying: skips the road and the wall');
  if (d.flock) traits.push('Arrives in flocks');
  if (d.armored) traits.push('Heavily armored');
  if (d.shoots) traits.push(`Shoots towers from ${d.shoots.range} tiles`);
  if (d.heal) traits.push(`Heals nearby foes ${pct(d.heal.pct)} every ${d.heal.cd}s`);
  if (d.split) traits.push(`Splits into ${d.split.n} spiderlings when it dies`);
  if (d.blast) traits.push('Explodes when it dies, stunning nearby towers');
  if (d.steal) traits.push('Steals gold instead of hitting the wall');
  if (d.sabotage) traits.push('Switches nearby towers off');
  if (d.aura) traits.push('Buffs the speed and armor of nearby foes');
  if (d.burrow) traits.push('Burrows: cannot be targeted underground');
  if (d.ward) traits.push('Shields nearby foes with magic');
  if (d.regen) traits.push('Regenerates unless burning or poisoned');
  if (d.blink) traits.push('Blinks forward along the road');
  if (d.wallMult) traits.push(`×${d.wallMult} damage to the wall`);
  return { id, kind: 'foe', name: d.name, blurb: d.desc, facts, traits, killKey: id, search: [d.name, d.desc, ...traits].join(' ').toLowerCase() };
}

export function bossEntry(b) {
  const facts = [['Health', String(b.hp)], ['Speed', String(b.speed)], ['Armor', String(b.armor)], ['Magic resist', String(b.mr)], ['Bounty', `⛁ ${b.bounty}`], ['Arrives', 'every 10th wave']];
  const traits = [];
  if (b.summon) traits.push(`Calls ${b.summon.n} ${ENEMIES[b.summon.type].name}s every ${b.summon.cd}s`);
  if (b.stomp) traits.push('Stomps: damages and stuns towers nearby');
  if (b.breath) traits.push('Flies along the road and breathes fire on towers');
  if (b.raise) traits.push(`Raises ${b.raise.n} fallen foes every ${b.raise.cd}s`);
  if (b.spit) traits.push('Spits acid that damages and jams towers');
  if (b.regen) traits.push('Regenerates unless burning or poisoned');
  return { id: b.id, kind: 'boss', name: b.name, blurb: b.desc || BOSS_DESC[b.id] || '', facts, traits, killKey: b.id, search: [b.name, BOSS_DESC[b.id] || '', ...traits].join(' ').toLowerCase() };
}

export function weaponEntry(id) {
  const w = WEAPONS[id];
  const facts = [['Damage', String(w.dmg)], ['Reload', `${w.reload}s`], ['Quiver', String(w.ammo)], ['Crit chance', pct(w.crit)], ['Damage type', DMG_TYPE[w.type] || w.type]];
  if (w.pierce) facts.push(['Pierces', `${w.pierce} foes`]);
  if (w.splash) facts.push(['Splash', String(w.splash)]);
  if (w.chain) facts.push(['Chains', `${w.chain} more foes`]);
  if (w.burn) facts.push(['Burn', `${w.burn}/s`]);
  const node = w.keep ? KEEP.find((k) => k.id === w.keep) : null;
  facts.push(['Unlock', node ? `The Keep · ✦ ${node.cost[0]} Renown` : 'Available from the start']);
  return { id, kind: 'weapon', name: w.name, blurb: w.desc, facts, search: [w.name, w.desc].join(' ').toLowerCase() };
}

export function artEntry(id) {
  const A = ABILITIES[id];
  const facts = [['Recharge', `${A.cd}s`]];
  if (A.duration) facts.push(['Lasts', `${A.duration}s`]);
  if (A.radius) facts.push(['Area', `radius ${A.radius}`]);
  if (A.range) facts.push(['Reach', `${A.range} tiles`]);
  facts.push(['Use', A.aim ? 'Press, then tap the field' : 'Press once']);
  const node = A.keep ? KEEP.find((k) => k.id === A.keep) : null;
  facts.push(['Unlock', node ? `The Keep · ✦ ${node.cost[0]} Renown` : 'Known from the start']);
  return { id, kind: 'art', icon: A.icon, name: A.name, blurb: A.desc, facts, extras: A.up ? [`Keep upgrade: ${A.up.name} (${A.up.desc})`] : [], search: [A.name, A.desc].join(' ').toLowerCase() };
}

export function boonEntry(b) {
  return { id: b.id, kind: 'boon', name: b.name, blurb: b.desc, rarity: b.rarity, facts: [['Rarity', b.rarity[0].toUpperCase() + b.rarity.slice(1)], ['Stacks', `up to ${b.stack}`], ...(b.minWave ? [['Offered from', `wave ${b.minWave}`]] : [])], search: [b.name, b.desc, b.rarity].join(' ').toLowerCase() };
}

export function threatEntry(id) {
  const t = THREATS[id];
  const facts = [['Announced from', `wave ${t.unlock}`], ['Leans on', t.types.map((x) => ENEMIES[x].name).join(', ')]];
  if (t.count) facts.push(['Numbers', `×${t.count}`]);
  if (t.speed) facts.push(['Speed', `×${t.speed}`]);
  if (t.hp) facts.push(['Health', `×${t.hp}`]);
  if (t.armor) facts.push(['Extra armor', `+${t.armor}`]);
  if (t.mr) facts.push(['Extra magic resist', `+${t.mr}`]);
  return { id, kind: 'threat', icon: t.icon, name: t.name, blurb: t.tip, facts, search: [t.name, t.tip, ...t.types].join(' ').toLowerCase() };
}

export function landEntry(id) {
  const m = MAPS[id];
  const facts = [['Roads', String(m.paths ? m.paths.length : '—')]];
  if (m.unlock) facts.push(['Unlock', m.unlock.label]);
  return { id, kind: 'land', name: m.name, blurb: m.desc, facts, search: [m.name, m.desc].join(' ').toLowerCase() };
}

export function modifierEntry(id) {
  const m = MODIFIERS[id];
  return { id, kind: 'modifier', name: m.name, blurb: m.desc, facts: [['Score', (m.score >= 0 ? '+' : '') + pct(m.score)]], search: [m.name, m.desc].join(' ').toLowerCase() };
}

// Short rules of the game, each a titled paragraph with the real numbers in it.
export function ruleEntries() {
  return [
    { id: 'tiers', name: 'Tiers and Mastery', blurb: 'Every emplacement upgrades to tier 4, then you choose one of two specializations (tier 5). After that you can buy Mastery stars forever: each star adds 16% damage, and special perks unlock at ★' + PERK_STARS.join(', ★') + '.' },
    { id: 'combo', name: 'Combos and charged shots', blurb: `Each hit adds ${pct(COMBO.perStep)} damage to your next shot, up to ${COMBO.cap} hits. A miss breaks it, and it fades after ${COMBO.decay}s. Headshots deal ×${COMBO.headshotMult}; holding a shot for ${COMBO.chargeTime}s charges a piercing ×${COMBO.chargeMult} blast.` },
    { id: 'armory', name: 'Weapon upgrades', blurb: 'Between waves, spend gold in the War Room: ' + Object.values(ARMORY).map((a) => `${a.name} (${a.desc})`).join(', ') + '.' },
    { id: 'ascension', name: 'Ascension', blurb: `Each Ascension level (up to ${ASCENSION.max}) makes foes ${pct(ASCENSION.hp)} tougher and ${pct(ASCENSION.speed)} faster, and your score ${pct(ASCENSION.score)} more valuable. Reach wave 20 plus 5 per level to unlock the next one.` },
    { id: 'difficulty', name: 'Starting waves', blurb: DIFFICULTY.map((d) => `${d.name} (wave ${d.wave})`).join(' · ') + '. Higher starts give you a head start of gold, plots and boons.' },
    { id: 'biomes', name: 'The five lands', blurb: 'The land changes every 25 waves: ' + BIOMES.map((b) => b.name).join(', ') + '. Dunes bring sandstorms, the Frostlands blizzards, the Ashlands meteors and the Shadowfen stealth.' },
    { id: 'keys', name: 'Keyboard', blurb: `1–9 select towers · ${ART_KEYS.join(' ')} castle arts · Space start wave · U upgrade · S sell · R repair · W war room · A auto-start · M buy max Mastery · F speed · P pause.` },
    { id: 'prestige', name: 'Prestige', blurb: 'Once you have earned enough Renown in a Dynasty you may ascend: the Keep\'s stat upgrades reset, but you gain permanent power, a Legacy perk of your choice, exclusive cosmetics and a royal endowment. Unlocks, cosmetics and titles are kept.' },
    { id: 'medals', name: 'Codex medals', blurb: 'Defeat foes and build emplacements to earn bronze, silver and gold medals. Each pays Renown once, and completing a quarter, half, three quarters and all of the codex earns a title and +1% Renown each.' },
  ];
}

// Every tab's entries, in display order.
export function codexEntries(tab) {
  switch (tab) {
    case 'towers': return TOWER_ORDER.map(towerEntry);
    case 'troops': return TROOP_ORDER.map(troopEntry);
    case 'foes': return Object.keys(ENEMIES).filter((id) => id !== 'spider').map(foeEntry).concat([foeEntry('spider')]);
    case 'bosses': return BOSSES.map(bossEntry);
    case 'weapons': return Object.keys(WEAPONS).map(weaponEntry);
    case 'arts': return Object.keys(ABILITIES).map(artEntry);
    case 'boons': return [...BOONS].sort((a, b) => ({ epic: 0, rare: 1, common: 2 })[a.rarity] - ({ epic: 0, rare: 1, common: 2 })[b.rarity]).map(boonEntry);
    case 'threats': return Object.keys(THREATS).map(threatEntry);
    case 'lands': return MAP_ORDER.map(landEntry);
    case 'rules': return ruleEntries().map((r) => ({ ...r, kind: 'rule', facts: [], search: (r.name + ' ' + r.blurb).toLowerCase() })).concat(Object.keys(MODIFIERS).map(modifierEntry));
    default: return [];
  }
}
