// v1.63.0 · Commander and Warrior quality of life.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game/engine.js';
import { COMMANDER, COMMANDS, COMMAND_IDS, DOCTRINE_IDS, PERKS, QUESTS, cleanDeck, commandValue, recommendDeck, perkTip, commandTable, reloadRate, cleanDecks, addDeck } from '../src/game/commander.js';
import { BOONS } from '../src/data/balance.js';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

function hero(seed = 'cq-1', deck) {
  const g = new Game({ seed, mapId: 'meadow', mode: 'hero', commander: { doctrine: 'marksman', deck } });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  return g;
}

test('every command has a value line, and the damaging ones are priced per ⚡', () => {
  for (const id of COMMAND_IDS) { const v = commandValue(id); assert.ok(v.line && v.cost > 0, id); }
  assert.ok(commandValue('volley').perCp > 0 && commandValue('firebomb').damaging && commandValue('pierce').damaging);
  assert.equal(commandValue('shield').damaging, false);
  assert.equal(commandValue('nope'), null);
});

test('a suggested deck exists for every doctrine, is legal, and says why', () => {
  for (const d of DOCTRINE_IDS) { const r = recommendDeck(d); assert.equal(r.deck.length, COMMANDER.deckSize); assert.deepEqual(r.deck, cleanDeck(r.deck)); assert.ok(r.why.length > 20); }
  assert.deepEqual(recommendDeck('nonsense').deck, recommendDeck('marksman').deck);
});

test('saved decks: capped, named, replaced by name, and junk is dropped', () => {
  let l = [];
  for (let i = 1; i <= 6; i++) l = addDeck(l, `D${i}`, 'tactician', ['volley', 'frost', 'mark', 'shield']);
  assert.equal(l.length, COMMANDER.decks); assert.equal(l[0].name, 'D3');
  l = addDeck(l, 'd6', 'siegebreaker', ['firebomb']);
  assert.equal(l.filter((d) => d.name.toLowerCase() === 'd6').length, 1); assert.equal(l.at(-1).doctrine, 'siegebreaker'); assert.equal(l.at(-1).deck.length, COMMANDER.deckSize);
  assert.deepEqual(cleanDecks([null, { name: '' }, { name: 'ok', doctrine: 'zzz', deck: 5 }]), [{ name: 'ok', doctrine: 'marksman', deck: cleanDeck([]) }]);
  assert.deepEqual(cleanDecks(undefined), []);
});

test('command use is tallied per command with its ⚡ cost, and the summary table sorts by use', () => {
  const g = hero('cq-use', ['frost', 'pierce', 'shield', 'overcharge']);
  g.startWave(); g.cmdr.cp = 10;
  assert.ok(g.cmdr.command('frost')); g.cmdr.cds.frost = 0; g.cmdr.cp = 10; assert.ok(g.cmdr.command('frost')); g.cmdr.cp = 10; assert.ok(g.cmdr.command('shield'));
  const t = commandTable(g.cmdr.summary());
  assert.equal(t.rows[0].id, 'frost'); assert.equal(t.rows[0].n, 2); assert.equal(t.totalCp, COMMANDS.frost.cost * 2 + COMMANDS.shield.cost);
  assert.equal(t.top.name, 'Frost Rounds');
  assert.deepEqual(commandTable({}).rows, []);
  assert.equal(reloadRate({ perfects: 3, jams: 1 }), 75); assert.equal(reloadRate({}), null);
});

test('the quest can be swapped once, never for itself, and a Mark quest needs Mark in the deck', () => {
  const g = hero('cq-q', ['frost', 'pierce', 'shield', 'overcharge']);
  assert.ok(!g.cmdr.questPool().includes('marked'));
  assert.ok(hero('cq-q2', ['mark', 'pierce', 'shield', 'overcharge']).cmdr.questPool().includes('marked'));
  g.startWave();
  const before = g.cmdr.quest.id;
  assert.ok(g.cmdr.rerollQuest()); assert.notEqual(g.cmdr.quest.id, before); assert.equal(g.cmdr.quest.prog, 0);
  assert.equal(g.cmdr.rerollQuest(), false, 'once a run');
  const save = JSON.parse(JSON.stringify(g.serialize()));
  const g2 = new Game({ seed: 'cq-q', mapId: 'meadow', mode: 'hero', save }); g2.load(save);
  assert.equal(g2.cmdr.questRerolled, true, 'the spent swap survives a save');
  const old = JSON.parse(JSON.stringify(save)); delete old.commander.qrr;
  const g3 = new Game({ seed: 'cq-q', mapId: 'meadow', mode: 'hero', save: old }); g3.load(old); assert.equal(g3.cmdr.questRerolled, false);
});

test('a quest to win without a command fails on the first command and completes only with hand kills', () => {
  const g = hero('cq-n', ['frost', 'pierce', 'shield', 'overcharge']);
  g.startWave();
  g.cmdr.quest = { id: 'nocmd', ...QUESTS.nocmd, prog: 0, done: false, failed: false };
  g.cmdr.cp = 10; g.cmdr.command('frost');
  assert.equal(g.cmdr.quest.failed, true);
  g.cmdr.quest = { id: 'nocmd', ...QUESTS.nocmd, prog: 0, done: false, failed: false };
  g.cmdr.waveClear(false); assert.equal(g.cmdr.quest.done, false, 'standing idle earns nothing');
  g.cmdr.waveHand = 3; g.cmdr.waveClear(false); assert.equal(g.cmdr.quest.done, true);
});

test('perk reroll: costs gold, once per offer, gives three different cards, and a second offer can reroll again', () => {
  const g = hero('cq-r');
  g.cmdr.pending = 2; g.cmdr.offerPerks();
  const first = [...g.cmdr.offer];
  g.gold = 0; assert.equal(g.cmdr.rerollPerks(), false, 'no gold');
  g.gold = 5000; const g0 = g.gold;
  assert.ok(g.cmdr.rerollPerks()); assert.equal(g.gold, g0 - (COMMANDER.reroll.gold + COMMANDER.reroll.perWave * g.wave));
  assert.equal(g.cmdr.offer.length, 3); assert.ok(first.every((id) => !g.cmdr.offer.includes(id)));
  assert.equal(g.cmdr.rerollPerks(), false, 'once per offer');
  g.cmdr.choosePerk(g.cmdr.offer[0]);
  assert.ok(g.cmdr.offer && g.cmdr.rerolled === false, 'the next offer is fresh and can be rerolled');
});

test('Spotter deepens the Mark, needs Mark in the deck, and Reserve Fund opens each wave with extra ⚡', () => {
  const g = hero('cq-s', ['mark', 'pierce', 'shield', 'overcharge']);
  assert.ok(g.cmdr.perkPool().includes('spotter'));
  assert.ok(!hero('cq-s2', ['frost', 'pierce', 'shield', 'overcharge']).cmdr.perkPool().includes('spotter'));
  g.startWave();
  const e = { dead: false, cmdrMarkT: 5 }; g.cmdr.mark = e;
  const base = g.cmdr.vulnOf(e);
  g.cmdr.perks.spotter = 2; assert.ok(Math.abs(g.cmdr.vulnOf(e) - (base + 0.3)) < 1e-9);
  const h2 = hero('cq-s3'); h2.cmdr.cp = 2; h2.cmdr.perks.reserve = 2; h2.cmdr.waveStart(1, { groups: [] });
  assert.ok(h2.cmdr.cp >= 4);
  for (const id of ['spotter', 'reserve']) assert.ok(PERKS[id].desc && perkTip(id, g.cmdr) !== undefined);
});

test('Warrior perks exist, and Second Wind and Hunter do what they say', async () => {
  for (const id of ['w_wind', 'w_hunter']) assert.ok(BOONS.find((b) => b.id === id && b.mode === 'warrior'));
  const src = read('src/game/champion.js');
  assert.match(src, /this\.b\('w_wind'\)\) this\.heal\(this\.baseHp\(\) \* 0\.04/); assert.match(src, /t\.hp \/ t\.maxHp < 0\.3 \? 1 \+ 0\.15 \* this\.b\('w_hunter'\)/);
});

test('the screens use the new Commander and Warrior pieces', () => {
  const ui = read('src/ui/commander.js'), loc = read('src/ui/local.js'), sc = read('src/ui/screens.js'), wr = read('src/ui/warrior.js'), hc = read('src/ui/herocontrols.js');
  assert.match(ui, /class: 'cdn', 'aria-hidden': 'true'/); assert.match(ui, /class: 'cost', 'aria-hidden': 'true'/); assert.match(ui, /class: 'k', 'aria-hidden': 'true'/); assert.match(hc, /hf-ammo', 'aria-hidden': 'true'/);
  assert.match(ui, /cpRegen\(\)\.toFixed\(1\)/); assert.match(ui, /showBuild\(\)/); assert.match(ui, /rerollPerks\(\)/); assert.match(ui, /rerollQuest\(\)/);
  assert.match(loc, /commandValue\(id\)\.line/); assert.match(loc, /Use the suggested deck/); assert.match(loc, /Save this deck/);
  assert.match(sc, /commandTable\(run\.commander\)/); assert.match(sc, /Large controls/);
  assert.match(wr, /wr-camp/); assert.match(read('src/main.js'), /classList\.toggle\('big-controls'/);
});
