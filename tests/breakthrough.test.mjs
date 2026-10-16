import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { BREAKTHROUGH } from '../src/data/balance.js';

function mid(wave = 30, mapId = 'meadow') {
  const g = new Game({ seed: 'bt', mapId, startWave: wave });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  g.startWave(); g.spawnQueue = []; g.enemies = [];
  return g;
}

test('from the early waves some ground foes ambush mid-road and some sprint behind a shield', () => {
  const g = mid(30);
  let ambush = 0, vanguard = 0, n = 400;
  for (let i = 0; i < n; i++) {
    const e = g.spawnEnemy('grunt', 0); g.breakthrough(e);
    if (e.ambush) { ambush++; assert.ok(e.dist > 0 && e.dist < e.total, 'placed part-way down the road'); assert.ok(Math.hypot(e.x - e.path[0].x, e.y - e.path[0].y) > 1, 'not at the gate'); }
    if (e.vanguard) { vanguard++; assert.ok(e.shield > 0); }
  }
  assert.ok(ambush / n > 0.1 && ambush / n < BREAKTHROUGH.ambushCap + 0.08, `ambush share ${ambush / n}`);
  assert.ok(vanguard / n > 0.05, `vanguard share ${vanguard / n}`);
});

test('flyers and bosses never ambush or sprint, and wave 1-4 are untouched', () => {
  const g = mid(30);
  for (let i = 0; i < 100; i++) {
    const w = g.spawnEnemy('wyvern', 0); g.breakthrough(w); assert.ok(!w.ambush && !w.vanguard);
    const b = g.spawnEnemy('boss', 0, { boss: 'warlord' }); g.breakthrough(b); assert.ok(!b.ambush && !b.vanguard);
  }
  const g2 = mid(3);
  for (let i = 0; i < 100; i++) { const e = g2.spawnEnemy('grunt', 0); g2.breakthrough(e); assert.ok(!e.ambush && !e.vanguard); }
});

test('a vanguard foe is fast only through the opening stretch of road', () => {
  const g = mid(30);
  const a = g.spawnEnemy('grunt', 0), b = g.spawnEnemy('grunt', 0);
  a.vanguard = a.total * BREAKTHROUGH.vanguardUntil; b.x = b.path[0].x + 0.2; b.y = b.path[0].y;
  const x0 = a.x, y0 = a.y; g.enemies = [a]; g.update(0.5);
  const fast = Math.hypot(a.x - x0, a.y - y0);
  const c = g.spawnEnemy('grunt', 0); g.enemies = [c]; const cx = c.x, cy = c.y; g.update(0.5);
  assert.ok(fast > Math.hypot(c.x - cx, c.y - cy) * 1.3, 'sprinting');
  a.dist = a.total * 0.6; g.enemies = [a]; g.update(0.1);
  assert.equal(a.vanguard, 0, 'sprint ends past the opening stretch');
});

test('the new hard maps have several spawns and every road ends at the keep', async () => {
  const { buildMap } = await import('../src/game/maps.js');
  for (const [id, n] of [['hive', 6], ['fork', 4], ['ravine', 3]]) for (const portrait of [false, true]) {
    const m = buildMap(id, 's', portrait);
    assert.equal(m.spawns.length, n);
    for (const p of m.paths) { const l = p[p.length - 1]; assert.ok(Math.abs(l.x - m.castle.x) < 1e-9 && Math.abs(l.y - m.castle.y) < 1e-9, `${id} road reaches the keep`); }
  }
});
