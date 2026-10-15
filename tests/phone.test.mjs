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

// ---- v1.22 · map zoom ----
import { Renderer, ZOOM_MAX } from '../src/game/render.js';

function board(w = 390, h = 640) {
  const r = Object.create(Renderer.prototype);
  Object.assign(r, { w, h, dpr: 1, ts: 40, ox: 0, oy: 0, zoom: 1, panX: 0, panY: 0, live: null, baseTs: 40, padRight: 0 });
  const g = new Game({ seed: 'zoom', mapId: 'meadow', portrait: true });
  r.fit(g);
  return { r, g };
}

test('zoom 1 shows the whole board centred; zooming keeps the point under the fingers fixed', () => {
  const { r, g } = board();
  assert.equal(r.zoom, 1);
  assert.ok(r.ox >= 0 && r.oy >= 0 && r.ts * g.map.cols <= r.w, 'the whole board fits');
  const fx = r.w / 2 + 40, fy = r.h / 2, before = r.toWorld(fx, fy);
  r.setZoom(2, fx, fy);
  const after = r.toWorld(fx, fy);
  assert.ok(Math.abs(after.x - before.x) < 0.2 && Math.abs(after.y - before.y) < 0.2, `point stayed put: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  assert.ok(r.ts > 40 * 1.9, 'tiles are about twice as large');
});

test('zoom is clamped, pan never shows past the board, and returning to 1 recentres', () => {
  const { r, g } = board();
  r.setZoom(99, 100, 100);
  assert.equal(r.zoom, ZOOM_MAX);
  const cw = r.ts * g.map.cols, ch = r.ts * g.map.rows;
  assert.ok(cw > r.w && ch > r.h, 'zoomed in, the board overflows the view both ways');
  r.panBy(5000, 5000);
  assert.ok(r.ox <= 0 && r.oy <= 0, 'the top-left corner of the board cannot be dragged into view');
  r.panBy(-99999, -99999);
  assert.ok(r.ox + cw >= r.w - 1 && r.oy + ch >= r.h - 1, 'nor the bottom-right');
  r.setZoom(1, 100, 100);
  assert.equal(r.zoom, 1); assert.equal(r.panX, 0); assert.equal(r.panY, 0);
});

test('a pinch in progress maps screen taps through the live scale', () => {
  const { r } = board();
  const base = r.toWorld(200, 300);
  r.live = { s: 2, tx: -200, ty: -300 };   // scaled 2x about (200,300)
  const now = r.toWorld(200, 300);
  assert.ok(Math.abs(now.x - base.x) < 1e-9 && Math.abs(now.y - base.y) < 1e-9, 'the pinch centre stays on the same board point');
  r.live = null;
});

test('a new map starts unzoomed', () => {
  const { r } = board();
  r.setZoom(2, 100, 100);
  assert.equal(r.zoom, 2);
  r.fit(new Game({ seed: 'zoom2', mapId: 'twin' }));
  assert.equal(r.zoom, 1);
});
