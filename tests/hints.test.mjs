// v1.56: readability hints shared by the 2D and 3D views (upgrade arrows) and the attack guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { AssaultGame } from '../src/game/assault.js';
import { upgradeReady, drawPathFlow } from '../src/game/hints-draw.js';

test('the upgrade arrow shows only when the treasury can pay for the next tier', () => {
  const g = new Game({ seed: 'h1', mapId: 'meadow' });
  const p = g.map.plots.find((q) => g.plotOpen(q.x, q.y));
  g.gold = 1000;
  const t = g.build('archer', p.x, p.y);
  assert.ok(t);
  assert.ok(upgradeReady(g, t), 'gold in hand: arrow');
  g.gold = 0;
  assert.ok(!upgradeReady(g, t), 'no gold: no arrow');
  const hero = new Game({ seed: 'h1', mapId: 'meadow', mode: 'hero' });
  hero.gold = 5000;
  for (const x of hero.towers) assert.ok(!upgradeReady(hero, x), 'the Hero Mode commander upgrades by itself');
});

test('hints never trip over an attack, whose towers are the enemy', () => {
  const a = new AssaultGame({ seed: 'h2', mode: 'warlord', career: 2 });
  for (const t of a.towers) assert.equal(upgradeReady(a, t), false);
  const calls = []; const ctx = new Proxy({}, { get: (_, k) => (k in _ ? _[k] : () => calls.push(k)), set: (o, k, v) => { o[k] = v; return true; } });
  drawPathFlow(ctx, 30, a, 1);
  assert.equal(calls.length, 0);
  const g = new Game({ seed: 'h3', mapId: 'meadow' });
  drawPathFlow(ctx, 30, g, 1);
  assert.ok(calls.includes('stroke'), 'between waves the road shows its flow');
});
