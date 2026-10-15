import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProfile } from '../src/meta/profile.js';
import { ensureQuests, progressQuests, touchStreak, dailyQuests } from '../src/meta/quests.js';

test('daily quests are deterministic per day and distinct', () => {
  const a = dailyQuests('2026-10-08'), b = dailyQuests('2026-10-08');
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map((q) => q.id)).size, 4, 'three ordinary orders plus the Vanguard order');
  assert.equal(a.at(-1).id, 'vg');
});

test('streak grows on consecutive days and resets after a gap', () => {
  const p = defaultProfile();
  assert.equal(touchStreak(p, new Date('2026-10-08T10:00:00Z')).n, 1);
  assert.equal(touchStreak(p, new Date('2026-10-08T20:00:00Z')).fresh, false);
  assert.equal(touchStreak(p, new Date('2026-10-09T10:00:00Z')).n, 2);
  const r0 = p.renown;
  assert.equal(touchStreak(p, new Date('2026-10-12T10:00:00Z')).n, 1);
  assert.ok(p.renown > r0);
});

test('quests complete once, credit renown, and the weekly accumulates', () => {
  const p = defaultProfile(); const now = new Date('2026-10-08T10:00:00Z');
  ensureQuests(p, now);
  const run = { kills: 5000, heroKills: 500, headshots: 500, wavesCleared: 99, bossKills: 9, maxCombo: 99, gems: 99, flawless: 99, wave: 99 };
  const r0 = p.renown;
  const done = progressQuests(p, run, now);
  assert.equal(done.length, 4);
  assert.ok(p.renown > r0);
  assert.equal(progressQuests(p, run, now).length, 0);
});

test('orders are paid at each cleared wave and the final summary pays only the difference', async () => {
  const { checkpointRun, recordRun } = await import('../src/meta/profile.js');
  const p = defaultProfile(); const now = new Date(2026, 9, 14, 12, 0, 0);
  const q = ensureQuests(p, now);
  q.list = [{ id: 'kills', text: 'Defeat {n} enemies', goal: 100, prog: 0, done: false, reward: 15 }, { id: 'gems', text: 'Collect {n} gems', goal: 3, prog: 0, done: false, reward: 15 }];
  const run = (o) => ({ seed: 's', map: 'meadow', mode: 'normal', modifiers: [], ascension: 0, wave: 6, start: 1, score: 500, kills: 0, heroKills: 0, shots: 0, hits: 0, headshots: 0, bossKills: 0, towersBuilt: 0, goldEarned: 0, heroDmg: 0, duration: 100, maxCombo: 3, wavesCleared: 5, killsByType: {}, dmgByTower: {}, specs: [], gems: 0, flawless: 0, ...o });
  const credited = {};
  checkpointRun(p, run({ kills: 60, gems: 2 }), credited, now);
  assert.equal(p.quests.list[0].prog, 60);
  assert.equal(p.quests.list[1].prog, 2);
  checkpointRun(p, run({ kills: 60, gems: 2 }), credited, now);          // nothing new: nothing added
  assert.equal(p.quests.list[0].prog, 60);
  recordRun(p, run({ kills: 110, gems: 3, credited }), { now });           // run ends: only the 50 new kills and 1 new gem
  assert.equal(p.quests.list[0].done, true);
  assert.equal(p.quests.list[1].done, true);
  assert.equal(p.quests.list[0].prog, 100);
});

test('the weekday blessing and daily orders follow the player\'s own calendar day', async () => {
  const { blessingFor } = await import('../src/meta/events.js');
  const wed = new Date(2026, 9, 14, 20, 0, 0);
  assert.equal(blessingFor(wed).name, 'Wealthy Wednesday');
  const p = defaultProfile();
  assert.equal(ensureQuests(p, wed).day, '2026-10-14');
});

test('progress and streak written under the old UTC day are kept, not wiped, on the first local-day load', () => {
  const p = defaultProfile(); const now = new Date(2026, 9, 14, 20, 0, 0);   // Wed evening local
  ensureQuests(p, now);
  p.quests.day = '2026-10-15'; p.quests.list[0].prog = 7;                    // what the old UTC clock stored
  p.streak = { day: '2026-10-15', n: 4, best: 4 };
  assert.equal(ensureQuests(p, now).list[0].prog, 7);
  assert.equal(touchStreak(p, now).n, 4);
  assert.equal(p.streak.n, 4);
});
