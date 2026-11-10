// v1.65.0 · Dominion and Sea Siege quality of life.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as D from '../src/game/dominion.js';
import * as R from '../src/meta/dominionrecap.js';
import { NAVAL } from '../src/game/naval.js';
import { Game } from '../src/game/engine.js';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const camp = (seed = 'dq-1') => D.newCampaign(seed, {});

test('end-turn warnings list what is left undone, and a spent turn has none', () => {
  const s = camp();
  const w = R.endTurnWarnings(s);
  assert.ok(Array.isArray(w));
  s.threat = { faction: s.factions[0].id, prov: D.yours(s)[0].id, power: 5 };
  assert.ok(R.endTurnWarnings(s).some((x) => /marching/.test(x)));
  s.threat = null; s.orders = 0; s.armies = 0; s.lore = 0; s.dilemma = null; s.envoys = [];
  s.policies = Array(D.policySlots(s)).fill('tithes').map((_, i) => Object.keys(D.POLICIES)[i]);
  assert.deepEqual(R.endTurnWarnings(s), []);
  s.over = { won: true }; assert.deepEqual(R.endTurnWarnings(s), []);
});

test('treaty reminders appear two turns out and not before', () => {
  const s = camp();
  const f = s.factions[0]; f.alive = true; f.stance = 'peace'; f.treaty = s.turn + 2;
  assert.equal(R.treatyReminders(s).filter((r) => r.kind === 'treaty').length, 1);
  f.treaty = s.turn + 5; assert.equal(R.treatyReminders(s).filter((r) => r.kind === 'treaty').length, 0);
  s.allianceRun = 2; assert.match(R.treatyReminders(s).find((r) => r.kind === 'alliance').text, /3 more turns/);
});

test('the season strip follows seasonOf and flags the turn it changes', () => {
  const st = R.seasonStrip(1, 6);
  assert.equal(st.length, 6);
  assert.ok(st.every((x) => x.id === D.seasonOf(x.turn).id));
  assert.equal(st.filter((x) => x.change).length, 1);
  assert.equal(R.nextSeason(1).in, 3);
});

test('a policy preview does not change the campaign and matches what adopting does', () => {
  const s = camp(); s.gold = 500;
  const before = JSON.stringify(s);
  const pv = R.policyPreview(s, 'scholasticism');
  assert.equal(JSON.stringify(s), before, 'previewing leaves everything alone');
  const inc0 = D.income(s);
  assert.ok(D.adoptPolicy(s, 'scholasticism').ok);
  const inc1 = D.income(s);
  assert.equal(pv.delta.lore, inc1.lore - inc0.lore);
  assert.equal(pv.delta.gold, inc1.net - inc0.net);
  assert.equal(R.policyPreview(s, 'scholasticism').on, true);
  assert.equal(R.policyPreview(s, 'nope'), null);
});

test('the unrest watch lists the worst provinces with fixes', () => {
  const s = camp(); const p = D.yours(s)[0];
  assert.deepEqual(R.unrestWatch(s), []);
  p.unrest = 85;
  const w = R.unrestWatch(s);
  assert.equal(w[0].id, p.id); assert.ok(w[0].revolt); assert.ok(w[0].fixes.length >= 1);
});

test('score breakdown and campaign stats read the campaign', () => {
  const s = camp(); s.stats.won = 3; s.stats.held = 1;
  const b = R.scoreBreakdown(s);
  assert.ok(b.rows.some((r) => /Battles won/.test(r.label) && r.pts === 6));
  assert.match(b.line, /Provinces/);
  const st = R.campaignStats(s);
  assert.ok(st.length >= 4 && /3 won/.test(st[0]));
});

test('a battle brief names the waves and the foe', () => {
  const s = camp(); const id = D.borders(s)[0];
  const b = R.battleBrief(s, id);
  assert.ok(b.waves >= 3 && b.line.includes(`${b.waves} waves`));
});

test('naval notes: hull multipliers, fleet forecast and the sea line', () => {
  assert.match(R.navalHullNote('cannon'), /1.5× vs ships$/);
  assert.match(R.navalHullNote('archer'), /weak/);
  assert.equal(R.navalHullNote('obelisk'), '');
  const f1 = R.fleetForecast(1, 8), f10 = R.fleetForecast(10, 20);
  assert.equal(f1.galleys, 0); assert.equal(f1.carracks, 0); assert.ok(f1.longships >= 1);
  assert.ok(f10.galleys >= 3 && f10.carracks >= 1 && f10.cogs >= 1);
  assert.match(f10.line, /fire galley/);
  assert.equal(R.fleetForecast(1, 0).line, '');
  assert.equal(R.seaLine(null), '');
  assert.match(R.seaLine({ ships: 10, sunk: 6, drowned: 20, landed: 4, shelled: 2, bestSink: 5 }), /6 ships sunk of 10 · 20 crew drowned · 4 waded ashore · 2 shells hit your keep · best sinking took 5/);
});

test('the forecast agrees with the real fleet plan for galleys and carracks', () => {
  const g = new Game({ seed: 'sea-fc', mapId: 'harbour', mode: 'seasiege' });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  g.wave = 10; g.startWave();
  const real = (t) => g.spawnQueue.filter((q) => q.ship === t).length;
  const fc = R.fleetForecast(10, 30);
  assert.equal(real('galley'), fc.galleys); assert.equal(real('carrack'), fc.carracks);
  assert.ok(NAVAL.galleyFrom > 0);
});

test('the screens use the helpers and the new setting', () => {
  const dom = read('src/ui/dominion.js'), pl = read('src/ui/play.js'), sc = read('src/ui/screens.js'), mn = read('src/main.js');
  for (const k of ['endTurnWarnings', 'treatyReminders', 'seasonStrip', 'policyPreview', 'unrestWatch', 'scoreBreakdown', 'battleBrief']) assert.match(dom, new RegExp(k), k);
  assert.match(dom, /confirmEnd\(app, s, save\)/);
  assert.match(pl, /fleetForecast\(g\.wave/); assert.match(pl, /navalHullNote\(id\)/);
  assert.match(sc, /seaLine\(run\.sea\)/); assert.match(sc, /'domWarn'/);
  assert.match(mn, /domWarn === undefined/);
});
