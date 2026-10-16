// v1.23 · Overtime Orders and Realm Works.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProfile, runBonus } from '../src/meta/profile.js';
import { ensureQuests, progressQuests } from '../src/meta/quests.js';
import { OVERTIME, WORKS, overtimeOrder, ensureOvertime, progressOvertime, buyWork, worksLevel, worksCost, rallyMult } from '../src/meta/campaign.js';

const NOW = new Date('2026-10-15T15:00:00');
const BIG = { kills: 100000, heroKills: 100000, headshots: 100000, wavesCleared: 1000, bossKills: 100, maxCombo: 1000, gems: 1000, flawless: 1000, wave: 1000, start: 1, vanguard: true };

function doneToday() {
  const p = defaultProfile();
  const q = ensureQuests(p, NOW);
  q.list.forEach((x) => { x.done = true; x.prog = x.goal; });
  return p;
}

test('overtime is locked until every daily order is done, then hands out one order at a time', () => {
  const p = defaultProfile();
  ensureQuests(p, NOW);
  assert.equal(ensureOvertime(p, NOW).open, false);
  assert.deepEqual(progressOvertime(p, BIG, NOW), [], 'nothing counts while locked');
  const q = ensureQuests(p, NOW); q.list.forEach((x) => { x.done = true; });
  const o = ensureOvertime(p, NOW);
  assert.equal(o.open, true); assert.equal(o.tier, 0); assert.ok(o.cur && !o.cur.done);
});

test('overtime orders get tougher and pay more with each tier, and are stable for a day', () => {
  const a = overtimeOrder('2026-10-15', 0), b = overtimeOrder('2026-10-15', 5);
  assert.deepEqual(a, overtimeOrder('2026-10-15', 0));
  assert.ok(b.reward > a.reward);
  const same = [0, 1, 2, 3, 4, 5, 6, 7].map((t) => overtimeOrder('2026-10-15', t));
  assert.ok(same.every((o) => o.goal > 0 && o.supply >= 1));
});

test('finishing overtime orders pays Renown and Supply, climbs the ladder and stops at the daily limit', () => {
  const p = doneToday(); const r0 = p.renown;
  let total = 0;
  for (let i = 0; i < 12; i++) total += progressOvertime(p, BIG, NOW).length;
  const o = ensureOvertime(p, NOW);
  assert.equal(o.tier, OVERTIME.maxPerDay); assert.equal(o.cur, null, 'done for today');
  assert.equal(total, OVERTIME.maxPerDay);
  assert.ok(p.supply >= OVERTIME.maxPerDay && p.renown > r0);
  assert.equal(progressOvertime(p, BIG, NOW).length, 0);
});

test('a new day starts the ladder over', () => {
  const p = doneToday();
  progressOvertime(p, BIG, NOW);
  const tomorrow = new Date('2026-10-16T15:00:00');
  ensureQuests(p, tomorrow);
  const o = ensureOvertime(p, tomorrow);
  assert.equal(o.tier, 0); assert.equal(o.open, false, 'and the new daily orders are not done yet');
});

test('progress is gradual: a small run advances the live order without finishing it', () => {
  const p = doneToday();
  const cur = ensureOvertime(p, NOW).cur;
  const tiny = { kills: 1, heroKills: 1, headshots: 1, wavesCleared: 1, bossKills: 0, maxCombo: 1, gems: 1, flawless: 1, wave: 2, start: 1 };
  assert.equal(progressOvertime(p, tiny, NOW).length, cur.goal <= 2 ? 1 : 0);
});

test('Realm Works: buying costs Supply, levels cap, and Warbanner/Wardens change what they should', () => {
  const p = defaultProfile();
  assert.equal(buyWork(p, 'banner'), false, 'no Supply yet');
  p.supply = 1000;
  for (let i = 0; i < 20; i++) buyWork(p, 'banner');
  assert.equal(worksLevel(p, 'banner'), WORKS.banner.costs.length); assert.equal(worksCost(p, 'banner'), null);
  assert.equal(p.supply, 1000 - WORKS.banner.costs.reduce((a, b) => a + b, 0));
  assert.ok(Math.abs(rallyMult(99) - (1 + WORKS.banner.per * WORKS.banner.costs.length)) < 1e-9, 'the server clamps a claimed level');
  assert.equal(rallyMult(undefined), 1); assert.equal(rallyMult(-3), 1);
  const before = runBonus(p);
  for (let i = 0; i < 20; i++) buyWork(p, 'wardens');
  const after = runBonus(p);
  assert.ok(after.castleHpMult > before.castleHpMult && after.wallHpMult > before.wallHpMult && after.castleDR > before.castleDR);
});

test('overtime orders do not count as the daily/weekly orders the achievements track', () => {
  const p = doneToday();
  const done = progressQuests(p, { ...BIG }, NOW);
  assert.ok(done.every((q) => !q.overtime));
});
