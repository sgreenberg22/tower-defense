// v1.64.0 · attack-mode quality of life: counters, breakdowns, planning notes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AssaultGame, AUNIT_ORDER, RAID_MAX, BLITZ_MAX, raidScore, blitzScore, conquestSetup, conquestTarget, WARLORD, WARLORD_TECH, ASSAULT } from '../src/game/assault.js';
import * as R from '../src/meta/attackrecap.js';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('every unit card has a counter note', () => {
  for (const u of AUNIT_ORDER) { const c = R.unitCounter(u); assert.ok(c && c.strong && c.weak && c.best, u); }
  assert.equal(R.unitCounter('nope'), null);
  assert.equal(R.allCounters().length, AUNIT_ORDER.length);
});

test('supply income follows the tunables and grows per stronghold', () => {
  const a = R.supplyIncome(1), b = R.supplyIncome(5);
  assert.equal(a.regen, ASSAULT.supply.regen);
  assert.ok(b.regen > a.regen && b.scale > a.scale);
  assert.match(a.line, new RegExp(`${ASSAULT.supply.perRaze} per emplacement`));
});

test('raid breakdown adds up to the score, win or loss', () => {
  const win = { victory: true, clock: 120, keepPct: 0.8 };
  win.score = raidScore(win);
  const b = R.raidBreakdown(win);
  assert.equal(b.rows.reduce((a, r) => a + r.pts, 0), win.score);
  assert.equal(b.max, RAID_MAX);
  const loss = { victory: false, razed: 6, fortPct: 0.5, clock: 200, keepPct: 0 }; loss.score = raidScore(loss);
  const l = R.raidBreakdown(loss);
  assert.equal(l.rows.reduce((a, r) => a + r.pts, 0), loss.score);
  assert.equal(R.raidBreakdown(null), null);
});

test('blitz breakdown adds up to the score, win or loss', () => {
  const win = { victory: true, clock: 400 }; win.score = blitzScore(win);
  assert.equal(R.blitzBreakdown(win).rows.reduce((a, r) => a + r.pts, 0), win.score);
  const loss = { victory: false, taken: 2, razed: 10 }; loss.score = blitzScore(loss);
  const l = R.blitzBreakdown(loss);
  assert.equal(l.rows.reduce((a, r) => a + r.pts, 0), loss.score);
  assert.equal(l.max, BLITZ_MAX);
  assert.match(R.breakdownLine(l), /Camps taken/);
});

test('the raid checklist and the countdown', () => {
  const ck = R.raidChecklist({ victory: true, clock: 150, keepPct: 0.9, razed: 4 });
  assert.deepEqual(ck.map((c) => c.done), [true, true, true, false]);
  assert.ok(R.raidChecklist({ victory: false }).every((c) => !c.done));
  const t = R.nextSetupIn(Date.now());
  assert.ok(t.ms > 0 && t.ms <= 25 * 3600000 && /\d+m/.test(t.text));
});

test('blitz history keeps the last weeks up to this one', () => {
  const w = { '2026-W40': { win: true, clock: 500, score: 5500 }, '2026-W41': { win: false, score: 2400 }, '2026-W45': { win: true, clock: 420, score: 5700 } };
  const hs = R.blitzHistory(w, '2026-W41', 6);
  assert.deepEqual(hs.map((x) => x.week), ['2026-W40', '2026-W41']);
  assert.match(R.historyLine(hs), /2 tries lately, 1 taken/);
  assert.equal(R.historyLine([]), '');
  assert.match(R.breakdownLine({ win: false, max: 3000, rows: [{ label: 'x', pts: 0 }] }), /No points scored/);
});

test('conquest difficulty and suggested column', () => {
  const pr = conquestSetup(conquestTarget(3));
  assert.ok(pr);
  const d = R.conquestDifficulty(pr, 2); assert.ok(d.ring >= 1 && /provinces stormed/.test(d.line));
  const s = R.suggestColumn(['archer', 'cannon', 'barracks']);
  assert.ok(s.units.includes('mantlet') && s.units.includes('knight') && s.units.includes('cavalry') && s.units.includes('ram'));
  assert.equal(R.conquestDifficulty(null), null);
});

test('the warrior share line, and the smithy summary on a real Warlord game', () => {
  assert.equal(R.warriorShare({ slain: 10 }), null);
  assert.equal(R.warriorShare({ champ: { kos: 4 }, slain: 10 }).pct, 40);
  const g = new AssaultGame({ mode: 'warlord', seed: 'tent-1' });
  const t0 = R.techSummary(g);
  assert.equal(t0.spent, 0); assert.equal(t0.total, WARLORD_TECH.length);
  g.gold = 10000; g.buyTech('blades');
  const t1 = R.techSummary(g);
  assert.equal(t1.spent, WARLORD.tech.blades.cost[0]); assert.ok(t1.left < t0.left);
});

test('a finished raid summary carries what the breakdown needs', () => {
  const g = new AssaultGame({ mode: 'raid', seed: 'raid-2026-11-09' });
  g.gameOver?.('quit');
  const s = g.summary();
  assert.ok(typeof s.fortPct === 'number' && typeof s.supplySpent === 'number');
  const b = R.raidBreakdown(s);
  assert.equal(b.rows.reduce((a, r) => a + r.pts, 0), Math.round(s.score));
});

test('the screens use the helpers', () => {
  const ui = read('src/ui/assault.js'), sc = read('src/ui/screens.js');
  for (const k of ['unitCounter', 'supplyIncome', 'nextSetupIn', 'conquestDifficulty', 'suggestColumn', 'techSummary', 'blitzHistory']) assert.match(ui, new RegExp(k), k);
  assert.match(sc, /breakdownLine\(bd\)/); assert.match(sc, /warriorShare\(run\)/);
});
