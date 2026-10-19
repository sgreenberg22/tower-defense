// v1.37 · Daily Supplies: the streak Renown arrives as a chest the player opens by hand, on a seven-day track.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProfile } from '../src/meta/profile.js';
import { touchStreak } from '../src/meta/quests.js';
import { SUPPLY_TRACK, supplyToday, supplyTomorrow, claimSupplies, streakBonus } from '../src/meta/supplies.js';

const at = (d) => new Date(d + 'T15:00:00');   // local noon-ish, so the local day key is the date written

test('a chest is ready once a day, opens once, and pays the streak bonus plus the track extra', () => {
  const p = defaultProfile();
  touchStreak(p, at('2026-10-08'));
  const s = supplyToday(p, at('2026-10-08'));
  assert.equal(s.ready, true);
  assert.equal(s.day, 1);
  const r0 = p.renown;
  const r = claimSupplies(p, at('2026-10-08'), () => 0.99);   // not lucky
  assert.equal(r.renown, streakBonus(1) + SUPPLY_TRACK[0].extra);
  assert.equal(p.renown, r0 + r.renown);
  assert.equal(claimSupplies(p, at('2026-10-08')), null, 'only once a day');
  assert.equal(supplyToday(p, at('2026-10-08')).ready, false);
});

test('the track climbs to the Royal Chest on day 7, then starts the next week', () => {
  const p = defaultProfile();
  let total = 0;
  for (let d = 1; d <= 8; d++) {
    const day = at(`2026-10-${String(d).padStart(2, '0')}`);
    touchStreak(p, day);
    const s = supplyToday(p, day);
    assert.equal(s.day, ((d - 1) % 7) + 1);
    if (d === 7) assert.equal(s.chest, 'royal');
    total += claimSupplies(p, day, () => 0.99).renown;
  }
  assert.equal(supplyToday(p, at('2026-10-08')).week, 2);
  assert.ok(total > 8 * streakBonus(1), 'a full week pays more than eight first days');
});

test('missing a day restarts the track, and a lucky chest doubles the streak bonus only', () => {
  const p = defaultProfile();
  touchStreak(p, at('2026-10-01')); claimSupplies(p, at('2026-10-01'));
  touchStreak(p, at('2026-10-02')); claimSupplies(p, at('2026-10-02'));
  touchStreak(p, at('2026-10-05'));
  assert.equal(supplyToday(p, at('2026-10-05')).day, 1);
  const r = claimSupplies(p, at('2026-10-05'), () => 0);
  assert.equal(r.lucky, true);
  assert.equal(r.renown, streakBonus(1) * 2 + SUPPLY_TRACK[0].extra);
  assert.equal(supplyTomorrow(p).day, 2);
});

test('no chest before the streak has been touched today', () => {
  const p = defaultProfile();
  touchStreak(p, at('2026-10-01'));
  assert.equal(supplyToday(p, at('2026-10-02')).ready, false, 'yesterday’s streak does not open today’s chest');
});
