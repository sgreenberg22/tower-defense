import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adviceFor, towerHitSrc } from '../src/game/counters.js';
import { ENEMIES, BOSSES } from '../src/data/balance.js';
import { Game } from '../src/game/engine.js';

test('every foe and boss has advice', () => {
  for (const k of Object.keys(ENEMIES)) assert.ok(adviceFor(k).tags.length, k);
  for (const b of BOSSES) assert.ok(adviceFor('boss:' + b.id).tags.length, b.id);
});
test('warlock advice mentions bubbles', () => {
  assert.match(adviceFor('warlock').tips.join(' '), /bubble/i);
});
test('tower hit sources carry name and tip', () => {
  const s = towerHitSrc('archer');
  assert.ok(s.name && s.tip);
});
