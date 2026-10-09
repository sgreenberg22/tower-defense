import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProfile } from '../src/meta/profile.js';
import { ensureQuests, progressQuests, touchStreak, dailyQuests } from '../src/meta/quests.js';

test('daily quests are deterministic per day and distinct', () => {
  const a = dailyQuests('2026-10-08'), b = dailyQuests('2026-10-08');
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map((q) => q.id)).size, 3);
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
