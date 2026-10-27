import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/game/dominion.js';
import { Game } from '../src/game/engine.js';
import { MAPS } from '../src/game/maps.js';
import { START_WAVES, validateRun } from '../src/game/rules.js';
import { warlordById } from '../src/game/living.js';

const atWar = (s, f) => { f.stance = 'war'; f.since = s.turn; return f; };
const fresh = (seed, o = {}) => D.newCampaign(seed, { size: 'small', diff: 'knight', ...o });

test('a new Dominion world: connected land, capitals, rival nations, fog, the same world for the same seed', () => {
  for (const [size, rivals] of [['small', 3], ['medium', 4], ['large', 5]]) {
    const s = D.newCampaign('t1', { size, rivals });
    assert.equal(s.factions.length, rivals, size);
    assert.equal(new Set(s.factions.map((f) => f.id)).size, rivals);
    for (const f of s.factions) { assert.ok(warlordById(f.id) && s.provs[f.cap].capital === f.id); assert.equal(f.stance, 'peace'); assert.ok(D.NATIONS[f.nation]); }
    assert.equal(s.provs.filter((p) => p.capital === 'you').length, 1);
    for (const p of s.provs) { assert.ok(MAPS[p.map], p.map); assert.ok(p.dev >= 1 && Array.isArray(p.buildings)); }
    const seen = new Set([0]), st = [0];
    while (st.length) for (const n of D.neighbors(s, st.pop())) if (!seen.has(n)) { seen.add(n); st.push(n); }
    assert.equal(seen.size, s.provs.length, 'every province reachable');
    assert.ok(s.provs.some((p) => !p.seen), 'fog');
  }
  assert.deepEqual(JSON.parse(JSON.stringify(fresh('t1'))), JSON.parse(JSON.stringify(fresh('t1'))));
  assert.equal(fresh('t1b', { nation: 'merchant' }).gold, D.DOMINION.start.gold + 100);
});

test('a fought battle spends an army and levies, and the province changes hands on victory', () => {
  const s = fresh('t2');
  const target = D.borders(s).find((id) => !D.canAttack(s, id));
  const before = { armies: s.armies, orders: s.orders, levy: s.levy };
  const B = D.battleSetup(s, target);
  assert.ok(START_WAVES.includes(B.startWave));
  assert.ok(D.beginBattle(s, target).setup && s.battle);
  assert.equal(s.armies, before.armies - 1);
  assert.equal(s.orders, before.orders, 'civil orders untouched');
  assert.equal(s.levy, before.levy - B.cost);
  assert.ok(D.endTurn(s).error, 'no turn end mid-battle');
  assert.equal(D.applyBattle(s, { victory: true, seed: 'wrong' }), null, 'a different run cannot settle it');
  assert.ok(D.applyBattle(s, { victory: true, seed: B.seed }).victory);
  assert.equal(s.provs[target].owner, 'you');
  assert.ok(s.provs[target].unrest > 0, 'conquered land is restless');
  assert.equal(D.canAttack(s, D.borders(s).find((id) => !s.provs[id].owner) ?? target), 'Your armies have all marched this turn.');
});

test('rival land needs a declaration of war; storming every capital wins by conquest', () => {
  const s = fresh('t3', { diff: 'squire' });
  const f0 = s.factions[0];
  const theirs = s.provs.find((p) => p.owner === f0.id && !p.capital);
  theirs.seen = true;
  for (const n of D.neighbors(s, theirs.id)) if (!s.provs[n].owner) { s.provs[n].owner = 'you'; break; }
  if (D.neighbors(s, theirs.id).some((n) => s.provs[n].owner === 'you')) assert.match(D.canAttack(s, theirs.id), /Declare war/);
  assert.ok(D.declareWar(s, f0.id).ok);
  assert.equal(f0.stance, 'war');
  for (const f of s.factions) {
    const cap = f.cap, land = s.provs.filter((p) => p.owner === f.id && p.id !== cap).map((p) => p.id);
    s.battle = { prov: cap, kind: 'attack', seed: 'x' + cap, foe: f.id, power: 5, cost: 4, waves: 7, startWave: 20 };
    const out = D.applyBattle(s, { victory: true, seed: 'x' + cap });
    assert.equal(out.eliminated, f.id);
    for (const id of land) assert.equal(s.provs[id].owner, 'you', 'fealty');
  }
  assert.deepEqual([s.over.won, s.over.how], [true, 'conquest']);
});

test('turns: income with upkeep and administration, growth, an unanswered attack is fought without you', () => {
  const s = fresh('t4', { diff: 'warlord' });
  const inc = D.income(s);
  assert.equal(inc.net, inc.gold - inc.upkeep - inc.admin);
  const g0 = s.gold, cap = D.yours(s)[0];
  D.endTurn(s);
  assert.equal(s.turn, 2);
  assert.equal(s.gold, g0 + inc.net);
  assert.ok(cap.grow > 0, 'the capital grows');
  const f = atWar(s, s.factions[0]);
  s.threat = { prov: cap.id, faction: f.id, power: 1 };
  const r2 = D.endTurn(s);
  assert.ok(r2.forced && typeof r2.forced.victory === 'boolean');
});

test('losing your capital ends the war', () => {
  const s = fresh('t4b');
  const cap = D.yours(s)[0], f = atWar(s, s.factions[0]);
  s.threat = { prov: cap.id, faction: f.id, power: 3 };
  D.beginBattle(s, cap.id, 'defend');
  D.applyBattle(s, { victory: false });
  assert.equal(cap.owner, f.id);
  assert.deepEqual([s.over.won, s.over.how], [false, 'capital']);
});

test('economy: build slots grow with development, settle weak free land, unrest halves yields and can end in revolt', () => {
  const s = fresh('t5');
  s.gold = 5000; s.orders = 20;
  const cap = D.yours(s)[0];
  assert.equal(D.slotsOf(cap), 2);
  assert.ok(D.build(s, cap.id, 'library').ok);
  assert.match(D.canBuild(s, cap.id, 'farm'), /No free slot/);
  assert.match(D.canBuild(s, cap.id, 'academy'), /Needs Scholarship|No free slot/);
  assert.ok(D.develop(s, cap.id).ok); assert.equal(cap.dev, 4);
  assert.ok(D.build(s, cap.id, 'farm').ok, 'development 4 opens a third slot');
  const free = D.borders(s).map((id) => s.provs[id]).find((p) => !p.owner && p.level <= 2);
  assert.ok(D.settle(s, free.id).ok);
  assert.equal(free.owner, 'you');
  const y0 = D.provYields(s, free).gold;
  free.unrest = 60;
  assert.ok(D.provYields(s, free).gold <= Math.floor(y0 / 2) + 0);
  free.unrest = 100; s.tax = 'high';
  for (let i = 0; i < 6 && free.owner === 'you'; i++) { free.unrest = 100; D.endTurn(s); }
  assert.equal(free.owner, null, 'it revolts');
  assert.ok(s.stats.revolts >= 1);
});

test('research, policies, the exchange and the levy cap', () => {
  const s = fresh('t6');
  s.lore = 500; s.gold = 1000;
  assert.ok(D.research(s, 'drill').ok);
  const a = s.armies;
  assert.ok(D.research(s, 'logistics').ok);
  assert.equal(s.armies, a + 1, 'Logistics: another army this turn');
  assert.match(D.research(s, 'crown').error, /Needs/);
  assert.match(D.research(s, 'ascendancy').error, /Needs/);
  assert.ok(D.adoptPolicy(s, 'conscription').ok);
  assert.match(D.adoptPolicy(s, 'tithes').error, /slot|One new policy/);
  assert.ok(D.repealPolicy(s, 'conscription').ok);
  const p0 = D.marketPrices(s).levy;
  assert.ok(D.trade5(s, 'levy').ok);
  assert.ok(D.marketPrices(s).levy > p0, 'prices climb');
  s.levy = 999; D.endTurn(s);
  assert.ok(s.levy <= D.levyCap(s) + D.income(s).levy + 10);
});

test('diplomacy: trade, peace, alliance, gifts, envoys and broken oaths', () => {
  const s = fresh('t7');
  const f = s.factions[0];
  for (const p of s.provs) p.seen = true;
  f.relation = 90;
  const t = D.proposeTrade(s, f.id);
  assert.ok(t.ok);
  assert.match(D.proposeTrade(s, f.id).error, /next turn|already/);
  s.turn++;
  if (!f.trade) { f.trade = true; }
  assert.ok(D.income(s).trade > 0, 'trade pays');
  f.relation = 95;
  const a = D.proposeAlliance(s, f.id);
  assert.ok(a.ok && a.odds > 0);
  f.stance = 'alliance';
  const others = s.factions.filter((x) => x !== f).map((x) => x.relation), r0 = f.relation;
  assert.ok(D.declareWar(s, f.id).ok);
  assert.ok(f.relation <= r0 - 80, 'betrayal');
  assert.ok(s.factions.filter((x) => x !== f).every((x, i) => x.relation <= others[i]), 'every nation remembers');
  s.turn++;
  f.warScore = 6; f.relation = 50;
  const pc = D.offerPeace(s, f.id, 100);
  assert.ok(pc.ok && pc.odds > 0.5);
  s.envoys.push({ from: s.factions[1].id, kind: 'tribute', gold: 50, turn: s.turn });
  s.gold = 500;
  assert.ok(D.answerEnvoy(s, 0, true).ok);
  assert.equal(s.gold, 450);
});

test('wonders: one of each in the world, the Golden Throne wins by prosperity', () => {
  const s = fresh('t8');
  s.lore = 2000; s.gold = 5000; s.orders = 10;
  for (const t of ['coinage', 'laws', 'banking', 'husbandry', 'cartography', 'scholarship']) assert.ok(D.research(s, t).ok, t);
  assert.ok(D.raiseWonder(s, 'hanging_gardens').ok);
  s.wonders.great_library = { owner: s.factions[0].id, prov: s.factions[0].cap, turn: 1 };
  assert.match(D.canRaise(s, 'great_library', D.yours(s)[0].id), /raised it first/);
  assert.match(D.canRaise(s, 'golden_throne', D.yours(s)[0].id), /other Wonders/);
  s.wonders.great_library = { owner: 'you', prov: D.yours(s)[0].id, turn: 1 };
  assert.ok(D.raiseWonder(s, 'golden_throne').ok);
  assert.deepEqual([s.over.won, s.over.how], [true, 'prosperity']);
});

test('a rival that masters Ascendancy first wins the science race; the turn limit decides by score', () => {
  const s = fresh('t9');
  s.factions[1].techs.push('ascendancy');
  D.endTurn(s);
  assert.deepEqual([s.over.won, s.over.how, s.over.by], [false, 'science', s.factions[1].id]);
  const q = fresh('t9b', { turnLimit: 40 });
  q.turn = 40; q.gold = 99999;
  D.endTurn(q);
  assert.equal(q.over.how, 'score');
  assert.equal(q.over.won, D.standings(q)[0].who === 'you');
});

test('a Grand Alliance of every surviving rival wins after a few turns', () => {
  const s = fresh('t10');
  for (const p of s.provs) if (!p.owner) p.owner = 'you';
  for (const f of s.factions) { f.stance = 'alliance'; f.relation = 100; }
  for (let i = 0; i < D.DOMINION.allyTurns + 1 && !s.over; i++) { s.threat = null; s.envoys = []; D.endTurn(s); for (const f of s.factions) { f.stance = 'alliance'; f.relation = 100; } }
  assert.deepEqual([s.over?.won, s.over?.how], [true, 'diplomacy']);
});

test('campaigns from v1.49 are brought up to date', () => {
  const v2 = fresh('t11');
  const v1 = { v: 1, id: 'old', seed: 'old', diff: 'knight', turn: 7, orders: 2, gold: 300, levy: 12, lore: 9, techs: ['drill', 'nonsense'], threat: null, battle: null, over: null, log: [], stats: { won: 2 }, lakes: v2.lakes,
    provs: v2.provs.map((p) => ({ id: p.id, q: p.q, r: p.r, name: p.name, terrain: p.terrain, map: p.map, owner: p.owner, level: p.level, building: p.capital ? 'fort' : null, special: p.special === 'goldmine' ? 'mine' : null, seen: p.seen, capital: p.capital })),
    factions: v2.factions.map((f) => ({ id: f.id, cap: f.cap, alive: true, might: 5, truce: 0, color: f.color })) };
  const s = D.cleanCampaign(JSON.parse(JSON.stringify(v1)));
  assert.equal(s.v, 2);
  assert.deepEqual(s.techs, ['drill']);
  assert.ok(s.provs.every((p) => Array.isArray(p.buildings) && p.dev >= 1 && !('building' in p)));
  assert.ok(s.factions.every((f) => f.stance === 'war' && Array.isArray(f.techs)));
  assert.ok(!D.endTurn(s).error);
  assert.equal(D.cleanCampaign({ v: 9, provs: [], factions: [] }), null);
});

test('sims: rivals act on their own, and a long idle campaign ends', () => {
  const s = fresh('t12', { size: 'medium' });
  while (!s.over && s.turn < 200) D.endTurn(s);
  assert.ok(s.over, 'someone wins, or you fall');
  assert.ok(s.factions.some((f) => f.techs.length > 3));
});

test('engine: a Dominion battle is won by holding its waves, and the server accepts it', () => {
  const g = new Game({ seed: 'dom-x', mapId: 'meadow', mode: 'dominion', startWave: 10, dominion: { campaign: 'c', prov: 3, kind: 'attack', name: 'Ashford', waves: 2 } });
  assert.ok(g.dominion && g.start === 10);
  let ended = null; g.on('gameOver', (s) => { ended = s; });
  for (let w = 0; w < 2 && !ended; w++) {
    while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
    g.startWave(); g.spawnQueue = [];
    for (let i = 0; i < 80 && g.phase === 'wave' && !ended; i++) { for (const e of g.enemies) e.dead = true; g.update(0.1); }
  }
  assert.ok(ended && ended.victory, 'victory after two waves');
  assert.equal(ended.dominion.name, 'Ashford');
  assert.equal(g.serialize().dominion.waves, 2);
  assert.equal(validateRun({ ...ended, start: 10, duration: 60, mode: 'dominion' }), null);
});

test('server: a Dominion battle feeds the Realm and a won war is announced in the chronicle', async () => {
  const { makeD1, call } = await import('./helpers/d1.mjs');
  const { onRequest } = await import('../functions/api/[[path]].js');
  const env = { DB: makeD1() };
  const a = (await call(onRequest, env, 'POST', 'register', { body: { name: 'Dom Lord' }, ip: '3.3.3.3' })).data;
  const body = { seed: 'dom-abc-4-12-a', map: 'bog', mode: 'dominion', modifiers: [], ascension: 0, wave: 16, wavesCleared: 5, start: 10, score: 4000, kills: 180, heroKills: 12, duration: 260, victory: true, dominion: { won: true, turns: 18 } };
  const r = await call(onRequest, env, 'POST', 'runs', { token: a.token, body });
  assert.equal(r.data.accepted, true, r.data.reason);
  assert.ok(r.data.realm.added.kills > 0, 'kills feed the Realm');
  const feed = (await call(onRequest, env, 'GET', 'realm/feed', { token: a.token })).data;
  assert.ok(feed.items.some((d) => d.kind === 'dominion' && /18 turns/.test(d.text)));
});
