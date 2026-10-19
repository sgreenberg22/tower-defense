import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';

test('the break between waves does not tick with the simulation when the play screen drives it', () => {
  const g = new Game({ seed: 'timer' });
  g.wallClockBuild = true;
  g.buildTimer = 40;
  for (let i = 0; i < 4 * 60 * 5; i++) g.update(1 / 60);   // five simulated seconds at 4x speed
  assert.equal(g.buildTimer, 40);
  g.tickBuild(5);                                         // five real seconds
  assert.equal(g.buildTimer, 35);
});
