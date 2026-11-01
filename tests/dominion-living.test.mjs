// v1.57: the living realm in Dominion: glory and Golden Ages, the Marshal, garrisons, focus, roads, barbarian camps,
// royal decrees, dilemmas, the advisor, the odds breakdown and the score history.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/game/dominion.js';

const fresh = (seed, o = {}) => D.newCampaign(seed, { size: 'small', diff: 'knight', ...o });
const capital = (s) => s.provs.find((p) => p.capital === 'you');
const take = (s, id) => { const p = s.provs[id]; p.owner = 'you'; p.seen = true; return p; };

test('a new war has a Marshal, no glory yet and a first line of history', () => {
  const s = fresh('l1');
  assert.ok(s.general.name && D.GENERAL_TRAITS[s.general.trait] && s.general.rank === 1);
  assert.equal(s.glory, 0); assert.equal(s.history.length, 1); assert.ok(s.history[0].sc.you > 0);
  assert.deepEqual(fresh('l1').general, s.general, 'the same Marshal for the same seed');
});

test('glory fills to a Golden Age: +25% gold and lore for a few turns', () => {
  const s = fresh('l2');
  const before = D.income(s);
  assert.equal(D.addGlory(s, D.GLORY.max), true);
  assert.ok(D.goldenAge(s) && s.glory === 0);
  const during = D.income(s);
  assert.ok(during.gold > before.gold && during.lore >= before.lore);
  for (let i = 0; i < D.GLORY.turns; i++) D.endTurn(s);
  assert.ok(!D.goldenAge(s), 'it ends');
});

test('the Marshal rises in rank with victories and lifts the odds and battle perks', () => {
  const s = fresh('l3');
  const id = D.borders(s).find((x) => !D.canAttack(s, x));
  const o1 = D.autoOdds(s, id);
  s.general.trait = 'learned';
  for (let i = 0; i < 3; i++) D.generalXp(s, true, true);
  assert.ok(s.general.rank >= 2);
  assert.ok(D.autoOdds(s, id) > o1);
  assert.ok(D.battlePerks(s, s.provs[id], 'attack').startGold >= D.GENERAL.gold);
  const O = D.oddsParts(s, id);
  assert.ok(O.parts.some(([k]) => k.includes(s.general.name)), 'the breakdown names the Marshal');
  assert.ok(Math.abs(O.parts.reduce((a, [, v]) => a + v, 0) - O.raw) < 1e-9);
});

test('garrisons guard a province, focus shapes its yields, roads link it to the capital', () => {
  const s = fresh('l4');
  const cap = capital(s), n = D.neighbors(s, cap.id)[0], p = take(s, n);
  const levy = s.levy;
  assert.ok(D.station(s, p.id, 3).ok); assert.equal(p.garrison, 3); assert.equal(s.levy, levy - 3);
  assert.ok(D.station(s, p.id, -1).ok); assert.equal(p.garrison, 2);
  assert.ok(D.station(s, p.id, 99).garrison <= D.GARRISON_MAX);
  assert.ok(D.battlePerks(s, p, 'defend').castleHpMult > 0);
  const g0 = D.provYields(s, p).gold;
  D.setFocus(s, p.id, 'gold'); assert.ok(D.provYields(s, p).gold > g0);
  assert.ok(D.linked(s).has(p.id), 'next to the capital: on the road');
  // a province of yours across the map, joined by nothing: cut off and restless
  const far = s.provs.find((x) => !x.owner && D.hexDist(x, cap) >= 3);
  take(s, far.id);
  assert.ok(!D.linked(s).has(far.id));
  assert.ok(D.unrestDrift(s, far) > D.unrestDrift(s, p));
  // losing it loses the guard
  s.threat = { prov: p.id, faction: s.factions[0].id, power: 1 };
  assert.ok(D.yieldProvince(s).ok);
  assert.equal(p.garrison, 0); assert.equal(p.focus, null);
});

test('barbarian camps raid your border and pay plunder when taken; they cannot be settled', () => {
  const s = fresh('l5');
  const id = D.borders(s).find((x) => !s.provs[x].owner);
  const p = s.provs[id]; p.camp = true; p.level = 1;
  assert.match(D.canSettle(s, id) || '', /barbarian/);
  const pw = D.provPower(s, p);
  p.camp = false; assert.equal(D.provPower(s, p), pw - 1); p.camp = true;
  const gold = s.gold;
  const r = D.autoResolve(s, id, 0, 'attack', 0);   // a sure win
  assert.ok(r.victory && r.camp && !p.camp);
  assert.ok(s.gold >= gold + D.CAMP.loot);
  assert.ok(s.glory > 0);
  // over many turns, camps appear on free land and raid
  const t = fresh('l5b', { size: 'medium' });
  let camps = 0;
  for (let i = 0; i < 30 && !t.over; i++) { if (t.threat) D.yieldProvince(t); if (t.threat) D.autoResolve(t, t.threat.prov, 0, 'defend'); D.endTurn(t); camps = Math.max(camps, t.provs.filter((x) => x.camp).length); }
  assert.ok(camps >= 1, 'camps appear');
  assert.ok(t.provs.every((x) => !x.camp || !x.owner), 'only on free land');
});

test('royal decrees: met in time they pay; left too long they lapse', () => {
  const s = fresh('l6');
  s.quest = { kind: 'learn', need: s.techs.length + 1, deadline: s.turn + 3, turn: s.turn, reward: { gold: 90 } };
  assert.equal(D.questProgress(s).done, false);
  s.lore = 99; D.research(s, 'masonry');
  const gold = s.gold;
  const r = D.checkQuest(s);
  assert.ok(r.done && s.gold === gold + 90 && !s.quest && s.glory > 0);
  s.quest = { kind: 'expand', need: 99, deadline: s.turn, turn: s.turn, reward: { gold: 1 } };
  assert.ok(D.checkQuest(s, true).lapsed && !s.quest);
  // a long campaign hands out decrees on its own
  const t = fresh('l6b');
  let seen = 0;
  for (let i = 0; i < 20 && !t.over; i++) { if (t.threat) D.autoResolve(t, t.threat.prov, 0, 'defend'); D.endTurn(t); if (t.quest) seen++; }
  assert.ok(seen > 0);
});

test('dilemmas: two courses, the first may cost gold; unanswered, the second is taken', () => {
  for (const d of D.DILEMMAS) assert.ok(d.title && d.a.label && d.b.label && typeof d.a.fx === 'function' && typeof d.b.fx === 'function', d.id);
  const s = fresh('l7');
  s.dilemma = { id: 'mercenaries', turn: s.turn };
  s.gold = 10;
  assert.ok(D.canChoose(s, 0), 'too poor for the sellswords');
  s.gold = 200; const levy = s.levy;
  const r = D.answerDilemma(s, 0);
  assert.ok(r.ok && s.levy === levy + 10 && s.gold === 120 && !s.dilemma);
  s.dilemma = { id: 'festival', turn: s.turn };
  const rep = D.endTurn(s);
  assert.equal(rep.dilemma.pick, 1, 'left alone, the second course');
  for (const d of D.DILEMMAS) { const t = fresh('l7' + d.id); t.gold = 500; t.dilemma = { id: d.id, turn: 1 }; if (!d.when || d.when(t)) { assert.ok(D.answerDilemma(t, 0).ok, d.id); t.dilemma = { id: d.id, turn: 1 }; assert.ok(D.answerDilemma(t, 1).ok, d.id); } }
});

test('the advisor points at something useful, and the history grows each turn', () => {
  const s = fresh('l8');
  const a = D.advice(s);
  assert.ok(a.length > 0 && a.every((x) => x.icon && x.text && x.tab));
  s.lore = 100;
  assert.ok(D.advice(s).some((x) => x.tab === 'research'));
  D.endTurn(s); D.endTurn(s);
  assert.equal(s.history.length, 3);
});

test('campaigns from before v1.57 load with the new parts', () => {
  const s = fresh('l9');
  delete s.general; delete s.glory; delete s.history; delete s.quest; delete s.dilemma; delete s.golden; delete s.questNext;
  for (const p of s.provs) { delete p.garrison; delete p.focus; }
  const c = D.cleanCampaign(JSON.parse(JSON.stringify(s)));
  assert.ok(c.general && c.glory === 0 && Array.isArray(c.history));
  assert.ok(D.endTurn(c).income);
});
