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

test('mage hexes what it hits, so everything else hurts it more', () => {
  const g = mk(); while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  place(g, 'mage', 0); g.refreshTowers();
  const m = g.towers.find((t) => t.type === 'mage');
  assert.ok(m.stats.hex > 0 && m.stats.chain >= 3);
  g.startWave(); g.spawnQueue = []; g.enemies = [];
  const e = g.spawnEnemy('grunt', 0); e.x = m.cx + 1; e.y = m.cy; e.hp = e.maxHp = 1e6;
  const plain = (() => { const f = g.spawnEnemy('grunt', 0); f.hp = f.maxHp = 1e6; const h0 = f.hp; g.damage(f, 100, 'physical', 'x'); return h0 - f.hp; })();
  g.chainHit(e, { chain: 0, chainRange: 1, chainFalloff: 1 }, { src: m, dmg: 1, type: 'magic' }, []);
  assert.ok(e.hexT > 0 && e.hex === m.stats.hex);
  const h1 = e.hp; g.damage(e, 100, 'physical', 'x');
  assert.ok(h1 - e.hp > plain * 1.1, 'a hexed foe takes extra from any source');
});

test('venom poison also eats a share of max health, a third as much on bosses', () => {
  const g = new Game({ seed: 7, mapId: 'meadow', startWave: 20 }); g.gold = 99999; while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  place(g, 'venom', 0); g.refreshTowers();
  const v = g.towers.find((t) => t.type === 'venom');
  assert.ok(v.stats.poisonPct > 0 && v.stats.poisonCap >= 4);
  g.startWave(); g.spawnQueue = []; g.enemies = [];
  const a = g.spawnEnemy('grunt', 0), b = g.spawnEnemy('boss', 0, { boss: 'warlord' });
  for (const e of [a, b]) { e.hp = e.maxHp = 100000; e.x = e.y = 0; g.poison(e, v.stats, v); }
  const ha = a.hp, hb = b.hp;
  g.update(1);
  assert.ok((ha - a.hp) > (hb - b.hp), 'bosses take less of the percentage');
  assert.ok(ha - a.hp > 100000 * v.stats.poisonPct * 0.9, 'a real slice of max HP');
});

test('artillery lobs several shells at several ground foes and cannot hit close targets', () => {
  const g = mk(); while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  place(g, 'artillery', 0); g.refreshTowers();
  const t = g.towers.find((x) => x.type === 'artillery');
  assert.equal(t.stats.multi, 3); assert.ok(t.stats.range > 4 && t.stats.minRange > 1 && t.stats.splash > 0);
  assert.equal(t.stats.targets, 'g');
  assert.equal(TOWERS.banner, undefined);
});

test('flagged plots boost damage towers', () => {
  assert.ok(FLAG.rate > 0 && FLAG.barracksSoldiers >= 1);
});
