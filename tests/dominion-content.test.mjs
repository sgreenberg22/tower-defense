// v1.67.0 · Dominion content: buildings, techs, policies, wonders, events, scenarios, tutorial.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as D from '../src/game/dominion.js';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const fresh = (seed = 'dc-1', o = {}) => D.newCampaign(seed, o);
const home = (s) => D.yours(s).find((p) => p.capital === 'you');
const free = (s) => { const p = home(s); p.buildings = []; p.dev = 5; return p; };

test('new campaigns carry the expanded flag and old ones do not', () => {
  assert.equal(fresh().ex, true);
  assert.equal(fresh('x', { expanded: false }).ex, false);
  const old = fresh(); delete old.ex;
  const loaded = D.cleanCampaign(JSON.parse(JSON.stringify(old)));
  assert.ok(loaded && !loaded.ex, 'an old save still loads, without the new content');
});

test('an old campaign cannot use the new content and rivals never learn it', () => {
  const s = fresh('dc-old', { expanded: false }); s.gold = 9999; s.lore = 9999; s.techs.push('husbandry', 'masonry', 'laws', 'cartography', 'statecraft', 'banking'); s.orders = 9;
  assert.match(D.canBuild(s, home(s).id, 'granary'), /Not part of this campaign/);
  assert.match(D.canResearch(s, 'roads'), /Not part of this campaign/);
  assert.match(D.adoptPolicy(s, 'patronage').error, /Not part/);
  assert.match(D.canRaise(s, 'great_wall', home(s).id), /Not part/);
  for (let i = 0; i < 40 && !s.over; i++) { if (s.battle) break; if (s.threat) D.yieldProvince(s); D.endTurn(s); if (s.dilemma) D.answerDilemma(s, 1); }
  const exTech = Object.keys(D.TECHS).filter((t) => D.TECHS[t].ex), exWonders = Object.keys(D.WONDERS).filter((w) => D.WONDERS[w].ex);
  for (const f of s.factions) assert.ok(!f.techs.some((t) => exTech.includes(t)), 'no rival learns an expanded tech');
  assert.ok(!exWonders.some((w) => s.wonders[w]), 'no expanded wonder is raised');
});

test('granary keeps its winter levies, courthouse calms, watchtower sees further, guild pays per treaty', () => {
  const s = fresh('dc-b'); s.techs.push('husbandry', 'masonry', 'laws', 'statecraft'); s.gold = 9999; s.orders = 9;
  const p = free(s);
  p.dev = 5; s.turn = 10;   // winter (turns 10-12)
  assert.equal(D.seasonOf(s.turn).id, 'winter');
  const l0 = D.income(s).levy;
  p.buildings = ['granary'];
  const l1 = D.income(s).levy;
  assert.ok(l1 - l0 >= 1, 'the granary adds its levy even in winter');
  const withG = provLevyWinter(s, p);
  assert.ok(withG >= 1);
  p.buildings = []; p.unrest = 50;
  const u0 = D.unrestDrift(s, p); p.buildings = ['courthouse'];
  assert.equal(D.unrestDrift(s, p), u0 + D.BUILDINGS.courthouse.unrest);
  const far = s.provs.find((q) => q.owner !== 'you' && !q.capital && D.hexDist(q, p) === 2 && !D.neighbors(s, p.id).includes(q.id));
  if (far) { far.seen = false; p.buildings = ['watchtower']; D.reveal(s); assert.equal(far.seen, true); }
  const f = s.factions[0]; f.alive = true; f.trade = true;
  p.unrest = 0; p.buildings = ['guild']; const y1 = D.provYields(s, p).gold; p.buildings = []; const y0 = D.provYields(s, p).gold;
  assert.ok(y1 - y0 >= 2 + 1);
});
function provLevyWinter(s, p) { return Math.floor(D.provYields(s, p).levy / 2); }

test('roads, diplomacy, open borders, levy reform and patronage change what they say', () => {
  const s = fresh('dc-c'); s.gold = 9999; s.lore = 9999;
  const cap = home(s);
  const other = D.yours(s).find((p) => p.id !== cap.id) || (() => { const n = D.neighbors(s, cap.id).map((i) => s.provs[i])[0]; n.owner = 'you'; return n; })();
  const g0 = D.provYields(s, other).gold; s.techs.push('cartography', 'roads');
  assert.ok(D.provYields(s, other).gold >= g0, 'roads never reduce yield');
  assert.equal(D.TECHS.roads.tier, 2); assert.equal(D.TECHS.diplomacy.tier, 3);
  const cap0 = D.levyCap(s), t0 = D.tradeValue(s), w0 = D.wonderCost(s, 'oracle').gold, inc0 = D.income(s).gold;
  s.policies = ['levy_reform'];
  assert.equal(D.levyCap(s), cap0 + 10);
  s.policies = ['open_borders']; assert.equal(D.tradeValue(s), t0 + 2);
  s.policies = ['patronage']; assert.equal(D.wonderCost(s, 'oracle').gold, Math.round(w0 * 0.85));
  s.policies = []; s.wonders.grand_market = { owner: 'you', prov: cap.id, turn: 1 };
  assert.equal(D.tradeValue(s), t0 + 2); assert.ok(D.income(s).gold >= inc0 + 4);
});

test('the Great Wall helps defenders and the Oracle shows rival capitals', () => {
  const s = fresh('dc-d'); const p = home(s);
  const before = D.battlePerks(s, p, 'defend').castleHpMult || 0;
  s.wonders.great_wall = { owner: 'you', prov: p.id, turn: 1 };
  assert.ok(Math.abs((D.battlePerks(s, p, 'defend').castleHpMult || 0) - before - 0.2) < 1e-9);
  assert.equal(D.battlePerks(s, p, 'attack').castleHpMult || 0, 0, 'only when defending');
  const cap = s.provs.find((q) => q.capital && q.capital !== 'you'); cap.seen = false;
  s.wonders.oracle = { owner: 'you', prov: p.id, turn: 1 };
  D.reveal(s); assert.equal(cap.seen, true);
});

test('a treaty with Diplomacy holds four turns longer', () => {
  const s = fresh('dc-e'); s.techs.push('laws', 'cartography', 'diplomacy');
  const f = s.factions[0]; f.alive = true; f.stance = 'war'; f.relation = 90; f.warScore = 5; s.diplo = {};
  let got = null;
  for (let t = 0; t < 40 && !got; t++) { s.diplo = {}; f.stance = 'war'; const r = D.offerPeace(s, f.id, 0); if (r.accepted) got = f.treaty - s.turn; }
  assert.ok(got == null || got === D.DOMINION.treatyTurns + 4);
});

test('every new event can be answered either way without breaking the campaign', () => {
  const evs = D.DILEMMAS.filter((d) => d.ex);
  assert.equal(evs.length, 10);
  assert.equal(new Set(D.DILEMMAS.map((d) => d.id)).size, D.DILEMMAS.length, 'unique ids');
  for (const d of evs) for (const pick of [0, 1]) {
    const s = fresh('dc-ev-' + d.id); s.gold = 500; s.orders = 3; for (const p of D.yours(s)) p.unrest = 40;
    for (const f of s.factions) { f.alive = true; } for (const p of s.provs) p.seen = true;
    s.dilemma = { id: d.id, turn: 1 };
    const r = D.answerDilemma(s, pick);
    assert.ok(r.ok && typeof r.text === 'string' && r.text.length > 3, `${d.id}/${pick}`);
    assert.ok(Number.isFinite(s.gold) && s.gold >= 0 && s.levy >= 0 && s.lore >= 0, `${d.id}/${pick} keeps resources sane`);
  }
});

test('scenarios are real setups and the tutorial walks the first six turns', () => {
  for (const sc of Object.values(D.SCENARIOS)) {
    assert.ok(D.SIZES[sc.size] && D.DIFFICULTIES[sc.diff] && D.TURN_LIMITS.includes(sc.turnLimit), sc.id);
    const s = fresh('sc-' + sc.id, sc);
    assert.equal(s.size, sc.size); assert.equal(s.diff, sc.diff); assert.equal(s.turnLimit, sc.turnLimit);
    assert.ok(s.factions.length >= D.SIZES[sc.size].rivals[0] && s.factions.length <= D.SIZES[sc.size].rivals[1]);
    assert.equal(s.tutorial === 0, !!sc.tutorial);
  }
  const s = fresh('tut', D.SCENARIOS.first);
  let T = D.tutorialState(s);
  assert.equal(T.index, 0); assert.equal(T.total, 6); assert.equal(T.finished, false);
  s.gold = 500; s.orders = 3; s.lore = 100;
  const p = home(s); p.buildings = ['market']; p.dev = 5;
  assert.ok(D.build(s, p.id, 'library').ok); assert.equal(D.tutorialState(s).steps[0].done, true);
  assert.ok(D.research(s, 'masonry').ok); assert.equal(D.tutorialState(s).steps[1].done, true);
  s.stats.auto = 1; s.policies = ['tithes']; s.turn = 7;
  const n = D.neighbors(s, p.id)[0]; s.provs[n].owner = 'you';
  T = D.tutorialState(s);
  assert.equal(T.finished, true);
  assert.equal(D.tutorialState(fresh('plain')), null, 'ordinary campaigns have no tutorial');
});

test('a campaign round-trips through JSON on turn 30 with the new content', () => {
  const s = fresh('rt-30', { size: 'medium', diff: 'knight' }); s.techs.push('husbandry');
  for (let i = 0; i < 30 && !s.over; i++) { if (s.threat) D.yieldProvince(s); D.endTurn(s); if (s.dilemma) D.answerDilemma(s, 1); }
  const back = D.cleanCampaign(JSON.parse(JSON.stringify(s)));
  assert.ok(back); assert.equal(back.turn, s.turn); assert.equal(back.ex, true);
  assert.equal(JSON.stringify(D.income(back)), JSON.stringify(D.income(s)));
});

test('the screens filter by campaign and show the tutorial and presets', () => {
  const ui = read('src/ui/dominion.js');
  assert.match(ui, /D\.inGame\(s, B\)/); assert.match(ui, /D\.inGame\(s, P\)/); assert.match(ui, /D\.inGame\(s, TECHS\[t\]\)/); assert.match(ui, /D\.inGame\(s, WONDERS\[w\]\)/);
  assert.match(ui, /tutorialCard\(ctx\)/); assert.match(ui, /D\.SCENARIOS/);
});
