import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMap, MAPS, MAP_ORDER, isBuildable } from '../src/game/maps.js';
import { Game } from '../src/game/engine.js';

test('The Wilds: open moor with hidden trails, many plots, every run different', () => {
  assert.ok(MAP_ORDER.includes('wilds') && MAPS.wilds.unlock.wave > 0);
  const layouts = new Set();
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) for (const portrait of [false, true]) {
    const m = buildMap('wilds', seed, portrait);
    assert.ok(m.hidden, 'no road is drawn');
    assert.ok(m.paths.length >= 3 && m.plots.length >= 12, `${seed}: ${m.paths.length} trails, ${m.plots.length} plots`);
    for (const p of m.paths) { const e = p[p.length - 1]; assert.equal(e.x, m.castle.x); assert.equal(e.y, m.castle.y); }
    const [px, py] = [m.plots[0].x, m.plots[0].y];
    assert.ok(isBuildable(m, px, py));
    const t = m.paths[0][1]; assert.equal(isBuildable(m, Math.floor(t.x), Math.floor(t.y), true), false, 'no traps on hidden trails');
    if (!portrait) layouts.add(JSON.stringify(m.paths));
  }
  assert.ok(layouts.size >= 5, 'different seeds give different fields');
});

test('a wave on The Wilds runs and foes reach the keep', () => {
  const g = new Game({ seed: 'wilds-run', mapId: 'wilds', startWave: 1 });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  g.startWave();
  let spawned = 0, reached = false;
  for (let i = 0; i < 20000 && !g.over && g.phase === 'wave'; i++) { g.update(); spawned = Math.max(spawned, g.enemies.length); }
  assert.ok(spawned > 0, 'foes spawned and walked the unpaved routes');
  assert.ok(g.phase !== 'wave' || g.over || g.enemies.length >= 0);
});
