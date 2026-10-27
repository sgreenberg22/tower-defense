// The living world: what changes from week to week and from run to run. Pure data and rules, shared by the engine, the
// client and the server, so everyone in the Realm meets the same warlord, the same decrees and the same Warfront.
//
//  · Warlords: each week a named horde warlord leads the enemy. Their favored foes march more often and a little tougher,
//    their twist bends every ordinary run, and their Champions (one oversized, named foe every few waves) carry a bounty.
//  · Encounters: every few waves of an ordinary run, someone turns up at the gate with an offer. Take it or leave it.
//  · Royal Decrees: three shared weekly tasks for the whole Realm, counted from every citizen's runs.
//  · Wonders: great works the Realm raises together, stone by stone. Each one built blesses every run for good.
//  · Warfront: a weekly ranked mode that pits everyone against this week's warlord at full fury, with two war rules.
import { seedFor, Rng, seasonKey } from '../core/rng.js';
import { ENEMIES, MODIFIERS } from '../data/balance.js';

const WAR_FOES = (ids) => ids.filter((id) => ENEMIES[id]);

// ---------- Warlords ----------
// favor: foe types that march more often under them (weight ×boost) and are a little tougher (hp ×favorHp).
// twist: what they change about every ordinary run that week (all mild: Warfront doubles them).
export const WARLORDS = [
  { id: 'grukk', name: 'Grukk Ironhide', title: 'the Shield-Breaker', icon: '🛡', color: '#8b97a8',
    blurb: 'An old orc in a coat of captured plate. His shield walls grind forward and shrug off arrows.',
    favor: WAR_FOES(['shield', 'pavise', 'phalanx', 'golem', 'dread', 'ram']), twist: { armor: 6 }, twistText: 'Every foe wears +6 armor.', counter: 'Mages, Ballistas and Siege Shells break plate.' },
  { id: 'skarra', name: 'Skarra Stormwing', title: 'Queen of the Eyrie', icon: '🦅', color: '#6fa8c9',
    blurb: 'She rides a storm-gray wyvern and her flocks darken the sky. The walls mean nothing to them.',
    favor: WAR_FOES(['wyvern', 'harpy', 'gargoyle', 'fellrider']), twist: { airSpeed: 0.1 }, twistText: 'Flyers are 10% faster.', counter: 'Flak, Tesla and a Harpoon Gun. Sky Chains drags them down.' },
  { id: 'vargul', name: 'Vargul the Swift', title: 'Lord of the Hunt', icon: '🐺', color: '#b0874f',
    blurb: 'His riders and wolf packs never stop moving. By the time you see them they are at the gate.',
    favor: WAR_FOES(['runner', 'cavalry', 'warg', 'rat', 'berserker']), twist: { speed: 0.06 }, twistText: 'Every foe is 6% faster.', counter: 'Frost Spires, Barracks and Pikemen. Slow the leaders.' },
  { id: 'morwen', name: 'Morwen the Hollow', title: 'Seer of the Fen', icon: '🔮', color: '#9a74c9',
    blurb: 'A witch who speaks to the drowned. Her wards turn spells aside and her healers never rest.',
    favor: WAR_FOES(['warlock', 'mirror', 'healer', 'wight', 'wraith']), twist: { mr: 12 }, twistText: 'Every foe has +12 magic resist.', counter: 'Arrows, cannon and fire. Kill the healers first.' },
  { id: 'brakka', name: 'Brakka Stonebreaker', title: 'Master of Engines', icon: '🪨', color: '#a07a5a',
    blurb: 'An engineer of the horde. Rams, mangonels and siege towers roll behind his banner.',
    favor: WAR_FOES(['ram', 'mangonel', 'escalade', 'sapper']), boost: 1.6, twist: { towerHit: 0.08 }, twistText: 'Foes hit your towers 8% harder.', counter: 'Engineers and a Sanctum keep towers standing. Shoot the engines early.' },
  { id: 'pale', name: 'The Pale Count', title: 'Who Will Not Stay Dead', icon: '💀', color: '#9fb8a4',
    blurb: 'He rose from a barrow on the moor and the dead rose with him. Wounds close on his soldiers as you watch.',
    favor: WAR_FOES(['wraith', 'wight', 'dread', 'troll', 'treant']), twist: { regen: 0.004 }, twistText: 'Foes regenerate 0.4% health a second unless burning or poisoned.', counter: 'Fire Traps, Venom Spires and anything that burns.' },
  { id: 'ghaz', name: 'Ghazgar Goldtooth', title: 'the Plunder King', icon: '💰', color: '#d8b04a',
    blurb: 'A warlord who fights for loot. His thieves raid the treasury, but his host carries a fortune.',
    favor: WAR_FOES(['thief', 'skirmisher', 'archer', 'grunt', 'bomber']), twist: { hp: 0.04, killGold: 0.15 }, twistText: 'Foes are 4% tougher but pay 15% more gold.', counter: 'Cavalry hunt thieves. Spend the extra gold.' },
  { id: 'rotmaw', name: 'Rotmaw', title: 'Mother of the Swarm', icon: '🕷', color: '#7d9a4a',
    blurb: 'Something vast and old beneath the hills. Her brood pours out in numbers you cannot count.',
    favor: WAR_FOES(['rat', 'brood', 'runner', 'grunt', 'troll']), twist: { count: 0.1, hp: -0.06 }, twistText: '10% more foes in every wave, each 6% weaker.', counter: 'Splash: Cannons, Mage chains, Catapults and Fire Traps.' },
];
export const WARLORD_FAVOR = { boost: 2.4, hp: 0.12 };
// Consecutive weeks always bring a different warlord (the step is coprime with the roster's size).
export function warlordFor(season = seasonKey()) {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(String(season).replace(/^w:/, ''));
  const n = m ? Number(m[1]) * 53 + Number(m[2]) : seedFor('warlord', season);
  return WARLORDS[(n * 3) % WARLORDS.length];
}
export const warlordById = (id) => WARLORDS.find((w) => w.id === id) || null;
// The modes a warlord's host marches in: the ordinary runs (the classic run, the Frontier, Marches and the Daily challenge).
export const LIVING_MODES = ['normal', 'frontier', 'march', 'daily'];
export const isLivingMode = (m) => LIVING_MODES.includes(m || 'normal');

// What a warlord changes, scaled by `fury` (1 in ordinary runs, 2 in the Warfront). All fields are optional.
export function warlordTwist(wl, fury = 1) {
  if (!wl) return null;
  const t = { favor: wl.favor, boost: 1 + ((wl.boost || WARLORD_FAVOR.boost) - 1) * fury, favorHp: WARLORD_FAVOR.hp * fury };
  for (const [k, v] of Object.entries(wl.twist || {})) t[k] = v * fury;
  return t;
}

// ---------- Champions ----------
// One of the warlord's favored foes marches as a named Champion every few waves: far tougher and bigger, with a bounty.
export const CHAMPION = { from: 12, every: 8, hp: 9, size: 1.35, armor: 10, bounty: 8, points: 6, furyEvery: 5 };
export function isChampionWave(w, fury = 1) {
  const every = fury > 1 ? CHAMPION.furyEvery : CHAMPION.every;
  return w >= CHAMPION.from && (w - CHAMPION.from) % every === 0 && w % 10 !== 0;
}
// Which foe type the Champion is: a favored type already marching by this wave, else a sturdy common foe. Heavy foes (rams,
// golems, siege towers) never become Champions: nine times their health would be a second boss.
export function championType(w, seed, wl) {
  const open = (wl?.favor || []).filter((id) => ENEMIES[id] && ENEMIES[id].unlock <= w && ENEMIES[id].weight > 0 && ENEMIES[id].hp < 200);
  const pool = open.length ? open : Object.keys(ENEMIES).filter((id) => ENEMIES[id].unlock <= w && ENEMIES[id].weight > 0 && ENEMIES[id].hp >= 40 && ENEMIES[id].hp < 200);
  if (!pool.length) return 'grunt';
  return pool[new Rng(seedFor(seed, 'champion', w)).int(0, pool.length - 1)];
}

// ---------- Encounters ----------
// Offered at the start of some breaks in an ordinary run (deterministic per seed and wave, so a Daily is the same for all).
// Two choices each; ignoring the offer and starting the wave declines it. Effects live in Game.resolveEncounter.
export const ENCOUNTER = { from: 4, every: 7, chance: 0.85 };
export const encounterCost = (w) => Math.round(30 + 11 * w);
export const ENCOUNTERS = {
  merchant:  { icon: '🧳', name: 'A Wandering Merchant', text: 'A peddler with a sealed scroll of power begs an audience at the gate.', a: (c) => `Buy a boon · ⛁ ${c}`, b: 'Send him on his way', cost: 1 },
  refugees:  { icon: '🧺', name: 'Refugees at the Gate', text: 'Villagers fleeing the horde ask for shelter. Some of them can hold a spear.', a: (c) => `Take them in · ⛁ ${c}`, b: 'Turn them away', cost: 0.4, needs: 'troops' },
  bloodmoon: { icon: '🌕', name: 'A Blood Moon Rises', text: 'The horde howls at a red moon. More will come tonight, but the plunder will be rich.', a: () => 'Fight under it: +35% foes, kills pay double gold and +50% score', b: 'Bar the gates', cost: 0 },
  shrine:    { icon: '⛩', name: 'A Forgotten Shrine', text: 'Your scouts found an old shrine in the woods. A prayer here mends stone, but the noise carries.', a: () => 'Pray: keep and wall heal 30%, next wave foes are 15% faster', b: 'Leave it be', cost: 0, needs: 'mend' },
  cache:     { icon: '💰', name: "A Smugglers' Cache", text: 'Gold hidden in a ditch by the road. Its owners will want it back, and they will come angry.', a: (c) => `Take ⛁ ${c}: next wave foes are 25% tougher`, b: 'Leave it', cost: -2.5 },
  mason:     { icon: '🧱', name: 'A Master Mason', text: 'A guild mason offers to rebuild your wall thicker than before.', a: (c) => `Hire him · ⛁ ${c}: wall repaired, +15% wall health for the run`, b: 'Not today', cost: 1, needs: 'mend' },
  alchemist: { icon: '⚗', name: 'A Traveling Alchemist', text: 'She sells a black draught that makes a bow sing.', a: (c) => `Buy it · ⛁ ${c}: your weapon +15% damage for the run`, b: 'Pass', cost: 0.7 },
  deserter:  { icon: '🗺', name: "A Deserter's Map", text: 'A horde deserter trades a map of old foundations for his life.', a: () => 'Follow it: open the best ruined plot for free', b: (c) => `Sell it · +⛁ ${c}`, cost: -0.6, needs: 'ruin' },
  envoy:     { icon: '👑', name: 'A Royal Envoy', text: 'The crown sends an envoy: pay the war tithe and the royal engineers will tune every tower.', a: (c) => `Pay the tithe · ⛁ ${c}: +6% tower damage for the run`, b: 'Decline', cost: 1.5 },
  captain:   { icon: '⚔', name: 'A Mercenary Captain', text: 'A sellsword captain and her company offer their service.', a: (c) => `Hire them · ⛁ ${c}: +2 troop slots for the run`, b: 'Send them off', cost: 1.2, needs: 'troops' },
};
export const ENCOUNTER_IDS = Object.keys(ENCOUNTERS);
export const isEncounterWave = (w) => w >= ENCOUNTER.from && (w - ENCOUNTER.from) % ENCOUNTER.every === 0;
// The offer for the break before wave `w` (null if none). `ok(id)` says whether an encounter makes sense right now.
export function encounterFor(w, seed, ok = () => true) {
  if (!isEncounterWave(w)) return null;
  const rng = new Rng(seedFor(seed, 'encounter', w));
  if (!rng.chance(ENCOUNTER.chance)) return null;
  const pool = ENCOUNTER_IDS.filter(ok);
  if (!pool.length) return null;
  const id = pool[rng.int(0, pool.length - 1)];
  const E = ENCOUNTERS[id], c = Math.round(Math.abs(E.cost) * encounterCost(w));
  return { id, wave: w, cost: E.cost > 0 ? c : 0, gain: E.cost < 0 ? c : 0 };
}

// ---------- Warfront: a weekly ranked mode against the warlord at full fury ----------
export const WARFRONT = { fury: 2, mods: 2, renown: 1.1, board: 'warfront' };
export const WARFRONT_MAPS = ['meadow', 'hamlet', 'twin', 'frostmere', 'cross', 'coil', 'bridge', 'bog', 'mirror', 'spine', 'hive', 'fork', 'ravine', 'cinder'];
const WAR_MODS = ['fog', 'double', 'glass', 'iron', 'swarm', 'norepair', 'lonehero'].filter((m) => MODIFIERS[m]);
export function warfrontSetup(season = seasonKey()) {
  const key = String(season).replace(/^w:/, '');
  const seed = `warfront-${key}`, h = seedFor(seed, 'setup');
  const rng = new Rng(h);
  const mods = rng.shuffle([...WAR_MODS]).slice(0, WARFRONT.mods);
  return { key, seed, map: WARFRONT_MAPS[h % WARFRONT_MAPS.length], modifiers: mods, warlord: warlordFor(key) };
}

// ---------- Royal Decrees: three shared tasks a week ----------
// `per` is the share each active citizen is asked for: the goal is per × the Realm's turnout (never below a floor).
// `reward` is a blessing on every run the following week when the decree is fulfilled.
const AIR = Object.keys(ENEMIES).filter((id) => ENEMIES[id].air);
const ARMORED = Object.keys(ENEMIES).filter((id) => ENEMIES[id].armored || ENEMIES[id].armor >= 25);
const BEASTS = WAR_FOES(['warg', 'cavalry', 'rat', 'brood', 'troll', 'treant', 'berserker']);
const sumOf = (o, ids) => ids.reduce((a, id) => a + (o?.[id] || 0), 0);
export const DECREE = { floorCitizens: 12, renown: 40, minShare: 1 };
export const DECREES = {
  warlord:   { icon: '⚔', name: (d) => `Break ${d.warlord?.name || 'the warlord'}'s host`, unit: 'of the warlord\'s favored foes', per: 220, reward: { towerDmg: 0.04 }, rewardText: '+4% tower damage' },
  champions: { icon: '🏆', name: () => 'Hunt the Champions', unit: 'Champions slain', per: 1.2, reward: { killGold: 0.06 }, rewardText: '+6% kill gold' },
  skies:     { icon: '🦅', name: () => 'Clear the Skies', unit: 'flyers downed', per: 140, reward: { airDmg: 0.06 }, rewardText: '+6% damage to flyers' },
  iron:      { icon: '🛡', name: () => 'Break the Iron Wall', unit: 'armored foes defeated', per: 160, reward: { armoredDmg: 0.06 }, rewardText: '+6% damage to armored foes' },
  beasts:    { icon: '🐺', name: () => 'Drive Off the Beasts', unit: 'beasts slain', per: 90, reward: { troopDmg: 0.08 }, rewardText: '+8% troop damage' },
  tyrants:   { icon: '👑', name: () => 'Fell the Tyrants', unit: 'bosses felled', per: 1.5, reward: { bossDmg: 0.07 }, rewardText: '+7% damage to bosses' },
  watch:     { icon: '🏰', name: () => 'Hold the Long Watch', unit: 'waves held', per: 45, reward: { castleHpMult: 0.06 }, rewardText: '+6% keep health' },
  marksmen:  { icon: '🏹', name: () => "The King's Marksmen", unit: 'foes slain by your own hand', per: 60, reward: { weaponDmg: 0.08 }, rewardText: '+8% weapon damage' },
  arcane:    { icon: '✨', name: () => 'Arcane Barrage', unit: 'castle arts cast', per: 18, reward: { startGold: 40 }, rewardText: '+40 starting gold' },
  field:     { icon: '🗺', name: (d) => `Hold the line at ${d.mapName || 'the front'}`, unit: 'waves held on that battlefield', per: 12, reward: { waveGold: 0.08 }, rewardText: '+8% wave gold', map: true },
};
const DECREE_POOL = ['champions', 'skies', 'iron', 'beasts', 'tyrants', 'watch', 'marksmen', 'arcane', 'field'];
const FIELD_MAPS = ['meadow', 'hamlet', 'twin', 'frostmere', 'cross', 'coil', 'bridge', 'bog', 'mirror', 'spine', 'hive', 'fork', 'ravine'];
// This week's three decrees: always the warlord's, plus two more (never two of the same).
export function weeklyDecrees(season = seasonKey(), mapNames = {}) {
  const key = String(season).replace(/^w:/, '');
  const rng = new Rng(seedFor('decrees', key));
  const picks = rng.shuffle([...DECREE_POOL]).slice(0, 2);
  const wl = warlordFor(key);
  const field = FIELD_MAPS[seedFor('decree-field', key) % FIELD_MAPS.length];
  return ['warlord', ...picks].map((id) => {
    const D = DECREES[id];
    const ctx = { warlord: wl, mapName: mapNames[field] || field };
    return { id, icon: D.icon, name: D.name(ctx), unit: D.unit, per: D.per, reward: D.reward, rewardText: D.rewardText, ...(D.map ? { map: field } : {}), ...(id === 'warlord' ? { favor: wl.favor } : {}) };
  });
}
// How much a run gave a decree. `u` is the server-cleaned usage record (see worldstats.cleanUsage) or a bare one
// built from the run when no usage was sent (only kills, waves and hero kills are then known).
export function decreeAmount(d, u) {
  if (!d || !u) return 0;
  switch (d.id) {
    case 'warlord': return sumOf(u.fk, d.favor || []);
    case 'champions': return u.ch | 0;
    case 'skies': return sumOf(u.fk, AIR);
    case 'iron': return sumOf(u.fk, ARMORED);
    case 'beasts': return sumOf(u.fk, BEASTS);
    case 'tyrants': return u.bk | 0;
    case 'watch': return u.wc | 0;
    case 'marksmen': return u.hk | 0;
    case 'arcane': return Object.values(u.au || {}).reduce((a, n) => a + n, 0);
    case 'field': return u.m === d.map ? u.wc | 0 : 0;
    default: return 0;
  }
}
export const decreeGoal = (d, citizens) => Math.max(5, Math.round(d.per * Math.max(DECREE.floorCitizens, citizens | 0)));
// The blessing the decrees fulfilled last week grant every run this week.
export function decreePerks(list) {
  const perks = {};
  for (const d of list || []) if (d.done) for (const [k, v] of Object.entries(d.reward || DECREES[d.id]?.reward || {})) perks[k] = (perks[k] || 0) + v;
  return perks;
}

// ---------- Wonders: the Realm builds them together ----------
// Every accepted run lays stones (WONDER.perWave per wave held, capped per run); citizens can also give Renown (one stone
// each). When a Wonder's last stone is laid it stands for good and blesses every run; the next one begins.
export const WONDER = { perWave: 3, runCap: 600, giveMax: 20000 };
export const WONDERS = [
  { id: 'beacon',    icon: '🔥', name: 'The Great Beacon',        cost: 6000,    perk: { renownBonus: 0.05 }, text: '+5% Renown from every run' },
  { id: 'granary',   icon: '🌾', name: 'The Royal Granary',       cost: 15000,   perk: { startGold: 40 },     text: '+40 starting gold' },
  { id: 'foundry',   icon: '⚒',  name: "The King's Foundry",      cost: 35000,   perk: { towerDmg: 0.03 },    text: '+3% tower damage' },
  { id: 'cathedral', icon: '⛪', name: 'Cathedral of the Dawn',   cost: 70000,   perk: { castleHpMult: 0.06 }, text: '+6% keep health' },
  { id: 'harbor',    icon: '⚓', name: 'The Sky Harbor',          cost: 130000,  perk: { airDmg: 0.05 },      text: '+5% damage to flyers' },
  { id: 'academy',   icon: '📚', name: 'The Arcane Academy',      cost: 240000,  perk: { weaponDmg: 0.06 },   text: '+6% weapon damage' },
  { id: 'colossus',  icon: '🗽', name: 'The Colossus of Aldermere', cost: 450000, perk: { towerDmg: 0.04, killGold: 0.04 }, text: '+4% tower damage and +4% kill gold' },
];
export const wonderStones = (wavesHeld) => Math.min(WONDER.runCap, Math.max(0, wavesHeld | 0) * WONDER.perWave);
// Perks of every Wonder built so far (`built` = how many stand).
export function wonderPerks(built = 0) {
  const perks = {};
  for (const w of WONDERS.slice(0, Math.max(0, Math.min(WONDERS.length, built | 0)))) for (const [k, v] of Object.entries(w.perk)) perks[k] = (perks[k] || 0) + v;
  return perks;
}
