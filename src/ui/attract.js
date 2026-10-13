// The home-screen diorama: a small living battle that runs on the real engine and renderer.
// Towers fire, foes from every era march by (the newest ones most often), and tapping a foe fires your own weapon.
// It never ends and never costs anything: the keep can't fall, gold is endless, nothing is recorded.
import { Game } from '../game/engine.js';
import { Renderer } from '../game/render.js';
import { FX, KILL_FX } from '../game/fx.js';
import { audio } from '../game/audio.js';
import { planWave } from '../game/waves.js';
import { MAPS } from '../game/maps.js';
import { ENEMIES, BOSSES, TOWERS } from '../data/balance.js';
import { NEW_FOES } from '../meta/achievements.js';

// A run that cannot be lost and never moves on to the next wave.
class Diorama extends Game {
  completeWave() {}
  gameOver() {}
  leak(e) { e.dead = true; e.leaked = true; this.emit('leak', { enemy: e, target: 'wall', dmg: 0 }); }
}

const SHOWCASE_MAPS = ['meadow', 'coil', 'bog', 'twin', 'spine', 'cross'];
const BUILD = ['archer', 'cannon', 'mage', 'tesla', 'frost', 'flak', 'obelisk', 'ballista', 'banner', 'venom', 'barracks', 'catapult'];
const OLD_FOES = ['grunt', 'runner', 'shield', 'cavalry', 'wyvern', 'archer', 'healer', 'warchief', 'golem', 'brood', 'ram'];

export function startDiorama(canvas, profile, { onKill, visit = 0 } = {}) {
  const mapId = SHOWCASE_MAPS[visit % SHOWCASE_MAPS.length];
  const wave = 24;
  const g = new Diorama({ seed: 'diorama-' + mapId, mapId, startWave: wave, weapon: profile.weapon, tutorial: false, bonus: { startBoons: 0, weaponDmg: 2.5 } });  // taps should feel mighty
  g.pickQueue = 0; g.boonOffer = null;
  g.gold = 1e9;
  for (const p of g.map.plots) g.claimed.add(p.k);
  // Fill the best plots with a varied, upgraded defence.
  const plots = [...g.map.plots].sort((a, b) => (g.map.coverage.get(b.k) || 0) - (g.map.coverage.get(a.k) || 0)).slice(0, 9);
  plots.forEach((p, i) => {
    const t = g.build(BUILD[i % BUILD.length], p.x, p.y);
    if (!t) return;
    while (t.tier < 4) g.upgrade(t);
    const specs = Object.keys(TOWERS[t.type].specs || {});
    if (specs.length) g.chooseSpec(t, specs[i % specs.length]);
    for (let k = 0; k < 4; k++) g.upgrade(t);
  });
  g.phase = 'wave';
  g.plan = planWave(wave, g.seed, g.waveOpts());
  g.plan.hp *= 0.8;                                      // a parade, not a siege: foes fall at a satisfying pace
  g.buildTimer = Infinity;

  const r = new Renderer(canvas);
  r.cosmetics = { castle: profile.equip.castle, trail: profile.equip.trail, towerSkin: profile.equip.skin, hero: profile.equip.hero };
  r.quality = profile.settings.quality; r.reduced = !!profile.settings.reducedMotion; r.colorblind = !!profile.settings.colorblind;
  const fx = new FX(); fx.setQuality('low'); fx.reduced = !!profile.settings.reducedMotion; fx.shakeOn = false;
  const killFx = KILL_FX[profile.equip.kill] || KILL_FX.poof;
  let tapped = 0;
  g.on('kill', ({ enemy, hero }) => {
    r.addCorpse(enemy);
    killFx(fx, enemy.x, enemy.y - 0.2 - (enemy.air ? 0.35 : 0), enemy.color);
    if (enemy.def?.steal) for (let i = 0; i < 4; i++) r.addLoot(enemy.x, enemy.y, 1, i % 2 ? 'coin' : 'gem');
    if (hero) { tapped++; audio.play('kill'); onKill && onKill(tapped); }
  });
  g.on('hit', ({ enemy, headshot }) => { if (headshot) fx.text(enemy.x, enemy.y - 0.9, 'HEADSHOT', { color: '#f2b33d', size: 0.3, bold: true }); });
  g.on('heroShot', ({ x, y }) => { audio.play('bow'); r.onHeroShot(x, y, g.map.castle.x, g.map.castle.y - 0.66); });
  g.on('zap', ({ points, color }) => fx.zap(points, color));
  g.on('impact', ({ x, y, kind, splash }) => { if (kind === 'ball' || kind === 'boulder') fx.burst(x, y, 6, { color: ['#ffb347', '#ffdf8a', '#8a8a8a'], speed: 2.4, life: 0.4, size: 0.08, gravity: 3 }); });
  g.on('pulse', ({ x, y, r: rr }) => fx.ring(x, y, rr, '#bfefff', 0.5, 0.08));
  g.on('blink', ({ from }) => fx.burst(from.x, from.y - 0.3, 6, { color: ['#a8e4ff', '#ffffff'], speed: 1.2, life: 0.35, gravity: -1, size: 0.06 }));
  r.onLootExpire = () => {};

  // The parade: mostly the new foes of the Wild Marches, some old faces, now and then a boss.
  let spawnT = 0.2, bossT = 26, n = 0;
  const spawn = () => {
    n++;
    const pool = n % 3 === 0 ? OLD_FOES : NEW_FOES;
    const type = pool[Math.floor(Math.random() * pool.length)];
    const count = ENEMIES[type].flock ? 4 : 1, lane = Math.floor(Math.random() * g.map.paths.length);
    for (let i = 0; i < count; i++) queue.push({ type, lane, at: i * 0.35 });
  };
  const queue = [];

  let last = performance.now(), raf = 0, alive = true, acc = 0;
  const resize = () => {
    // Full width on phones; on wide screens the board is capped in height so the menu stays in view.
    const pw = canvas.parentElement?.clientWidth || 360;
    const h = Math.round(Math.min(pw * 10 / 16, Math.max(230, window.innerHeight * 0.46)));
    const w = Math.min(pw, Math.round(h * 16 / 10));
    r.resize(w, h, Math.min(2, window.devicePixelRatio || 1), g);
  };
  resize();
  const frame = (t) => {
    if (!alive) return;
    if (!canvas.isConnected) { if ((lostT += 1) > 3) { stop(); return; } raf = requestAnimationFrame(frame); return; }
    lostT = 0;
    const dt = Math.min(0.1, (t - last) / 1000); last = t;
    if (!document.hidden) {
      spawnT -= dt; bossT -= dt;
      if (spawnT <= 0 && g.enemies.length < 18) { spawn(); spawnT = 0.45 + Math.random() * 0.45; }
      for (const q of queue) q.at -= dt;
      while (queue.length && queue[0].at <= 0) { const q = queue.shift(); g.spawnEnemy(q.type, q.lane); }
      if (bossT <= 0) { bossT = 40; const b = BOSSES[Math.floor(Math.random() * BOSSES.length)]; const e = g.spawnEnemy('boss', 0, { boss: b.id, hpScale: 0.25 }); e.hp = e.maxHp; }
      acc += dt;
      let steps = 0;
      while (acc >= 1 / 60 && steps < 6) { g.update(1 / 60); acc -= 1 / 60; steps++; }
      if (steps >= 6) acc = 0;
      g.castle.hp = g.castle.maxHp; g.wall.hp = g.wall.maxHp; g.gold = 1e9;
      for (const tw of g.towers) { tw.hp = tw.maxHp; tw.ruined = false; }
      fx.update(dt);
      r.draw(g, fx, dt, { placing: null });
    }
    raf = requestAnimationFrame(frame);
  };
  const stop = () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  // Re-parented canvases are briefly detached: give them a moment before calling it a day.
  let lostT = 0;

  // Tap a foe to shoot it yourself, just like in a run.
  canvas.addEventListener('pointerdown', (ev) => {
    audio.init();
    const b = canvas.getBoundingClientRect();
    const w = r.toWorld(ev.clientX - b.left, ev.clientY - b.top);
    if (g.weapon.ammo < 1) { g.weapon.ammo = 1; }
    if (!g.heroFire(w.x, w.y, 0)) {
      const lt = r.pickLoot(w.x, w.y);
      if (lt) { audio.play('coin'); fx.text(lt.x, lt.y - 0.4, '✦', { color: '#ffd666', size: 0.32 }); }
    }
  });
  window.addEventListener('resize', resize);
  if (profile.settings.reducedMotion) {
    // One still frame with a few foes on the road.
    for (let i = 0; i < 240; i++) { if (i % 40 === 0) spawn(); while (queue.length) { const q = queue.shift(); g.spawnEnemy(q.type, q.lane); } g.update(1 / 60); }
    r.draw(g, fx, 1 / 60, { placing: null });
    return { stop, map: MAPS[mapId], wave, alive: () => true, kills: () => tapped };
  }
  raf = requestAnimationFrame(frame);
  return { stop, map: MAPS[mapId], wave, alive: () => alive, kills: () => tapped, game: g };
}
