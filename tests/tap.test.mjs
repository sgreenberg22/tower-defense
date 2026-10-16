// Taps on the tall part of a tower (e.g. a War Banner's flag) must pick that tower, not the tile above it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';

function setup() {
  const g = new Game({ seed: 'tap', mapId: 'meadow', startWave: 30 });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  g.gold = 1e6;
  const p = g.freePlots()[0];
  return { g, p, t: g.build('artillery', p.x, p.y) };
}

test('a tap on the upper part of a tower picks that tower', () => {
  const { g, p, t } = setup();
  assert.ok(t);
  assert.equal(g.towerAtPoint(p.x + 0.5, p.y + 0.5), t, 'centre of its own tile');
  assert.equal(g.towerAtPoint(p.x + 0.7, p.y - 0.2), t, 'on the flag, in the tile above');
});

test('taps well above, or beside, a tower do not pick it', () => {
  const { g, p, t } = setup();
  assert.notEqual(g.towerAtPoint(p.x + 0.5, p.y - 0.7), t, 'too far above');
  assert.notEqual(g.towerAtPoint(p.x + 1.4, p.y - 0.2), t, 'too far to the side');
});

test('a tower in the tapped tile always wins over one below it', () => {
  const { g, p, t } = setup();
  const above = g.map.plots.find((q) => q.x === p.x && q.y === p.y - 1);
  if (!above) return;                         // layout has no plot directly above this one
  g.claimed.add(above.k);
  const t2 = g.build('archer', above.x, above.y);
  assert.ok(t2);
  assert.equal(g.towerAtPoint(p.x + 0.5, p.y - 0.2), t2);
});
