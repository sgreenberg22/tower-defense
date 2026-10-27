import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/game/dominion.js';
import { Game } from '../src/game/engine.js';
import { MAPS } from '../src/game/maps.js';
import { START_WAVES, validateRun } from '../src/game/rules.js';
import { warlordById } from '../src/game/living.js';

test('a new Dominion world: connected land, four capitals, three warlords, fog', () => {
  const s = D.newCampaign('t1', 'knight');
  assert.equal(s.factions.length, 3);
  assert.equal(new Set(s.factions.map((f) => f.id)).size, 3);
  for (const f of s.factions) assert.ok(warlordById(f.id) && s.provs[f.cap].capital === f.id);
  assert.equal(s.provs.filter((p) => p.capital === 'you').length, 1);
  for (const p of s.provs) assert.ok(MAPS[p.map], p.map);
  // every province reachable
  const seen = new Set([0]), st = [0];
  while (st.length) for (const n of D.neighbors(s, st.pop())) if (!seen.has(n)) { seen.add(n); st.push(n); }
  assert.equal(seen.size, s.provs.length);
  assert.ok(s.provs.some((p) => !p.seen), 'fog');
  assert.deepEqual(JSON.parse(JSON.stringify(D.newCampaign('t1', 'knight'))), JSON.parse(JSON.stringify(s)), 'same seed, same world');
});

test('a fought battle spends an order and levies, and the province changes hands on victory', () => {
  const s = D.newCampaign('t2', 'knight');
  const target = D.borders(s).find((id) => !D.canAttack(s, id));
  const before = { orders: s.orders, levy: s.levy };
  const B = D.battleSetup(s, target);
  assert.ok(START_WAVES.includes(B.startWave));
  const r = D.beginBattle(s, target);
  assert.ok(r.setup && s.battle);
  assert.equal(s.orders, before.orders - 1);
  assert.equal(s.levy, before.levy - B.cost);
  assert.ok(D.endTurn(s).error, 'no turn end mid-battle');
  assert.equal(D.applyBattle(s, { victory: true, seed: 'wrong' }), null, 'a different run cannot settle it');
  const out = D.applyBattle(s, { victory: true, seed: B.seed });
  assert.ok(out.victory);
  assert.equal(s.provs[target].owner, 'you');
  assert.equal(s.battle, null);
});

test('storming a capital breaks the warlord and its land swears fealty; breaking all three wins', () => {
  const s = D.newCampaign('t3', 'squire');
  for (const f of s.factions) {
    const cap = f.cap, theirs = s.provs.filter((p) => p.owner === f.id && p.id !== cap).map((p) => p.id);
    s.battle = { prov: cap, kind: 'attack', seed: 'x' + cap, foe: f.id, power: 5, cost: 4, waves: 7, startWave: 20 };
    const out = D.applyBattle(s, { victory: true, seed: 'x' + cap });
    assert.equal(out.eliminated, f.id);
    for (const id of theirs) assert.equal(s.provs[id].owner, 'you');
  }
  assert.ok(s.over && s.over.won);
  assert.ok(D.score(s) > 0);
});

test('turns: income arrives, rivals move, an unanswered attack is fought without you', () => {
  const s = D.newCampaign('t4', 'warlord');
  const g0 = s.gold, inc = D.income(s);
  const r = D.endTurn(s);
  assert.equal(s.turn, 2);
  assert.ok(s.gold >= g0 + inc.gold - 60 && s.levy > 0);
  const mine = D.yours(s)[0];
  const f = s.factions[0];
  s.threat = { prov: mine.id, faction: f.id, power: 1 };
  const r2 = D.endTurn(s);
  assert.ok(r2.forced && typeof r2.forced.victory === 'boolean');
  assert.equal(r.error, undefined);
});

test('auto-resolve odds rise with extra levies and research; build, muster, research, truce', () => {
  const s = D.newCampaign('t5', 'knight');
  const t = D.borders(s).find((id) => !D.canAttack(s, id));
  assert.ok(D.autoOdds(s, t, 3) > D.autoOdds(s, t, 0));
  s.lore = 100; assert.ok(D.research(s, 'drill').ok);
  assert.ok(D.research(s, 'logistics').ok);
  assert.ok(D.research(s, 'crown').error, 'needs arcana');
  const cap = D.yours(s)[0];
  s.gold = 500;
  const o = s.orders;
  assert.ok(D.build(s, cap.id, 'farm').error, 'capital already has a market');
  assert.ok(D.muster(s).ok); assert.equal(s.orders, o - 1);
  assert.ok(D.truce(s, s.factions[0].id).ok);
  assert.ok(D.canAttack(s, s.factions[0].cap) !== null);
  assert.ok(D.cleanCampaign(JSON.parse(JSON.stringify(s))));
  assert.equal(D.cleanCampaign({ v: 9 }), null);
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
