// v1.20 · Phone pass: the wave progress bar's numbers and the wider fingertip pick for the hero's weapon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';

function fresh(mode = 'normal') {
  const g = new Game({ seed: 'phone', mapId: 'meadow', mode });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  return g;
}

test('wave progress is empty between waves, runs 0 to 1 through a wave, and never runs backwards past empty', () => {
  const g = fresh();
  assert.equal(g.waveProgress(), null, 'no bar in the build phase');
  g.startWave();
  const total = g.spawnQueue.length;
  assert.ok(total > 0 && g.waveTotal === total);
  assert.equal(g.waveProgress(), 0, 'nothing beaten yet');
  g.spawnQueue.splice(0, Math.floor(total / 2));   // half the wave has marched in and been dealt with
  const half = g.waveProgress();
  assert.ok(half > 0.4 && half < 0.6, 'about half way: ' + half);
  // A summoner adds foes mid-wave: the bar may stall but must stay within 0..1.
  for (let i = 0; i < 5; i++) g.spawnEnemy('grunt', 0);
  const after = g.waveProgress();
  assert.ok(after >= 0 && after <= 1);
  g.spawnQueue = []; g.enemies = [];
  assert.equal(g.waveProgress(), 1, 'everything beaten');
});

test('Endurance has no waves, so it has no wave progress', () => {
  const g = new Game({ seed: 'phone-e', mapId: 'meadow', mode: 'endurance' });
  g.startWave?.();
  assert.equal(g.waveProgress(), null);
});

test('a wider pick radius lets a fingertip land near a foe and still shoot it', () => {
  const g = fresh();
  g.startWave(); g.spawnQueue = []; g.enemies = [];
  const e = g.spawnEnemy('grunt', 0);
  e.x = 5; e.y = 5; e.dead = false;
  const aim = { x: e.x + 1.2, y: e.y - e.size * 0.35 };   // 1.2 tiles off: a fat fingertip
  g.weapon.ammo = 3;
  assert.equal(g.heroFire(aim.x, aim.y, 0), false, 'the default pick is tight, so this misses');
  assert.equal(g.weapon.ammo, 3, 'a miss costs no ammo');
  assert.equal(g.heroFire(aim.x, aim.y, 0, 1.3 + 1), true, 'a fingertip radius finds the foe');
  assert.equal(g.weapon.ammo, 2);
});

test('towerAtPoint still finds a tower for a tap on its tile (menus on touch are gated in the UI, not the engine)', () => {
  const g = fresh();
  const p = g.map.plots[0];
  g.claimed.add(p.k); g.gold = 1e6;
  const t = g.build('archer', p.x, p.y);
  assert.equal(g.towerAtPoint(p.x + 0.5, p.y + 0.5), t);
});
