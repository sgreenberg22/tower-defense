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

// ---- v1.23.1 · the map no longer zooms ----
import { Renderer } from '../src/game/render.js';

test('the whole board is always shown centred, and taps map straight to tiles', () => {
  const r = Object.create(Renderer.prototype);
  Object.assign(r, { w: 390, h: 640, dpr: 1, ts: 40, ox: 0, oy: 0, padRight: 0 });
  const g = new Game({ seed: 'fit', mapId: 'meadow', portrait: true });
  r.fit(g);
  assert.ok(r.ox >= 0 && r.oy >= 0 && r.ts * g.map.cols <= r.w, 'the whole board fits');
  const w = r.toWorld(r.ox + r.ts * 2.5, r.oy + r.ts * 3.5);
  assert.ok(Math.abs(w.x - 2.5) < 1e-9 && Math.abs(w.y - 3.5) < 1e-9);
  assert.equal(typeof r.setZoom, 'undefined');
});

test('portrait phones get a tool row for abilities, ammo and combo instead of covering the castle', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  const play = readFileSync(new URL('../src/ui/play.js', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="toolrow"') > html.indexOf('id="board-wrap"') && html.indexOf('id="toolrow"') < html.indexOf('id="dock"'));
  assert.match(css, /#toolrow:not\(\[hidden\]\)/);
  assert.match(play, /row\.replaceChildren\(abBar\); e\.waveBar\.append\(e\.heroHud\)/);
});
