import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insights, trend, bestWave } from '../src/meta/insights.js';
import { defaultProfile } from '../src/meta/profile.js';

const now = new Date('2026-10-12T12:00:00Z');
const prof = () => {
  const p = defaultProfile();
  p.stats.runs = 20; p.stats.kills = 6000; p.stats.renownEarned = 1300; p.best.wave = { meadow: 40 };
  p.history = Array.from({ length: 12 }, (_, i) => ({ wave: i < 7 ? 20 : 30, start: 1, d: i }));
  p.streak = { day: '2026-10-11', n: 4, best: 6 };
  return p;
};

test('trend compares the last 5 runs with the 5 before', () => {
  assert.equal(trend(defaultProfile()), null);
  const t = trend(prof());
  assert.equal(Math.round(t.last), 30);
  assert.ok(t.delta > 0);
  assert.equal(bestWave(prof()), 40);
});

test('insights surface the player\'s next goals and the Realm\'s needs', () => {
  const realm = { week: { goal: { kills: 10000 }, kills: 2000, reached: 0 } };
  const front = { rally: { goal: 2000, kills: 800, done: false, mine: { kills: 10 }, renown: 30 }, siege: { name: 'The Hollow King', hp: 50, maxHp: 100, yourDamage: 1200 } };
  const out = insights({ profile: prof(), realm, front, you: { weekRank: 2, weekCitizens: 9, cheers: 3 }, now }, 20);
  const text = out.map((o) => o.text).join('\n');
  assert.match(text, /Haunted Siege/);            // event reward in reach (Oct 12 is inside it)
  assert.match(text, /streak ends tonight/);      // played yesterday, not today
  assert.match(text, /Watchfire/);                // realm needs enemies for the next tier
  assert.match(text, /Rally/);
  assert.match(text, /#2 of 9/);
  assert.match(text, /improving/);
  assert.match(text, /to Captain|to Sergeant|to Lieutenant|to Knight-Captain/);
  assert.ok(out.every((o, i) => i === 0 || out[i - 1].score >= o.score), 'sorted by strength');
  assert.equal(insights({ profile: prof(), now }, 2).length, 2);
});

test('a brand new player gets no noise and no crash', () => {
  const out = insights({ profile: defaultProfile(), now });
  assert.ok(Array.isArray(out));
});
