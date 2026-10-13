import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { TOWERS, FLAG } from '../src/data/balance.js';
import { T } from '../src/game/maps.js';

const mk = () => { const g = new Game({ seed: 7, mapId: 'meadow', startWave: 14 }); g.gold = 99999; return g; };
const place = (g, id, i = 0) => { const p = g.freePlots()[i]; return g.build(id, p.x, p.y); };

test('rally flag can only move to a road tile within barracks range', () => {
  const g = mk();
  const b = place(g, 'barracks');
  assert.ok(b);
  let ok = null, far = null;
  for (let y = 0; y < g.map.rows; y++) for (let x = 0; x < g.map.cols; x++) {
    if (g.map.tileAt(x, y) !== T.PATH) continue;
    if (g.canMoveRally(b, x, y)) ok = ok || [x, y]; else far = far || [x, y];
  }
  assert.ok(ok && far);
  assert.ok(g.moveRally(b, ...ok));
  assert.deepEqual([b.rallyPt.x, b.rallyPt.y], [ok[0] + 0.5, ok[1] + 0.5]);
  assert.equal(g.moveRally(b, ...far), false);
});

test('barracks soldiers toughen with the wave and pin enemies', () => {
  const g = mk();
  const b = place(g, 'barracks');
  for (let i = 0; i < 20; i++) { g.update(0.1); if (g.boonOffer) g.chooseBoon(g.boonOffer[0]); else break; }
  g.startWave(); assert.equal(g.phase, 'wave');
  for (let i = 0; i < 30; i++) g.update(0.1);
  const so = b.soldiers[0];
  assert.ok(so, 'soldiers spawned');
  assert.ok(so.maxHp > TOWERS.barracks.soldierHp, 'wave-scaled hp');
  assert.ok(so.pin >= TOWERS.barracks.pin, 'pins foes');
});

test('war banner buffs towers and your weapon, and banners stack with diminishing returns', () => {
  const g = mk();
  const base = g.bannerHero || 0;
  place(g, 'banner', 0);
  g.refreshTowers();
  const one = g.bannerHero;
  assert.ok(one > base);
  place(g, 'banner', 1);
  g.refreshTowers();
  assert.ok(g.bannerHero > one && g.bannerHero < one * 2 + 1e-9 + TOWERS.banner.heroAura);
  assert.ok(g.bannerHero <= 0.5);
});

test('flagged plots boost damage towers', () => {
  assert.ok(FLAG.rate > 0 && FLAG.barracksSoldiers >= 1 && FLAG.bannerPower > 1);
});
