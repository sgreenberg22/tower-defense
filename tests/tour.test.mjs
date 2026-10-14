// v1.16.1 · sound is off by default; the Realm tour's timeline tells the truth about the map rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProfile } from '../src/meta/profile.js';
import { SCENES, TOUR_LENGTH, sceneAt, crowdAt, rowsAt, giftAt, RALLY_GOAL } from '../src/ui/realm-tour-script.js';
import { TERRITORY, MAX_PROVINCES } from '../src/game/realmmap.js';

test('new players start with sound off', () => {
  assert.equal(defaultProfile().settings.muted, true);
});

test('the tour covers the whole story in under a minute and a half', () => {
  assert.equal(SCENES.map((s) => s.id).join(), 'together,grow,shrink,gifts,march,you');
  assert.ok(TOUR_LENGTH > 30 && TOUR_LENGTH < 90, String(TOUR_LENGTH));
  assert.equal(sceneAt(0).i, 0);
  assert.equal(sceneAt(TOUR_LENGTH + 5).i, SCENES.length - 1);
});

test('the border in the tour moves by exactly the real rules, never past the floor or the cap', () => {
  const grow = SCENES[1], shrink = SCENES[2];
  assert.equal(grow.held(0), TERRITORY.start);
  assert.equal(grow.held(grow.len), TERRITORY.start + TERRITORY.day.win + TERRITORY.week.victory + TERRITORY.month.victory);
  assert.equal(shrink.held(0), grow.held(grow.len), 'the loss scene starts where the gain scene ended');
  for (const s of SCENES) for (let t = 0; t <= s.len; t += 0.25) { const h = s.held(t); assert.ok(h >= TERRITORY.floor && h <= MAX_PROVINCES, `${s.id}@${t}=${h}`); }
  assert.ok(shrink.held(shrink.len) < shrink.held(0));
});

test('the crowd fills the Rally together, and goal rows close in order', () => {
  const end = crowdAt(SCENES[0].len);
  assert.ok(end.total >= RALLY_GOAL * 0.95 && end.total <= RALLY_GOAL);
  assert.ok(crowdAt(2).total < crowdAt(6).total);
  const rows = rowsAt(SCENES[1], SCENES[1].len);
  assert.ok(rows.every((r) => r.done && r.ok));
  const lost = rowsAt(SCENES[2], SCENES[2].len);
  assert.ok(lost.every((r) => r.done && !r.ok && r.frac < 0.6));
  assert.equal(rowsAt(SCENES[1], 0).filter((r) => r.done).length, 0);
  assert.deepEqual([0, 5, 11].map((t) => giftAt(t).i), [0, 1, 2]);
});
