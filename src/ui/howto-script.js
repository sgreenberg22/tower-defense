// The scripted how-to-play demo: a real game on the real engine, driven by a timeline of "player" actions
// (build, start the wave, shoot, upgrade, cast, face a boss). No DOM in here, so the whole thing can be tested in Node.
import { Game } from '../game/engine.js';
import { BOSSES, TOWERS, TROOPS, ABILITIES } from '../data/balance.js';

export const LENGTH = 62;     // seconds before the demo loops

// `at` is when each step begins on the timeline.
export const STEPS = [
  { id: 'build',   icon: '🏗', title: 'Build towers',   at: 0,    text: 'Place towers on the stone plots beside the road. Each costs gold, then fires on its own.' },
  { id: 'wave',    icon: '📯', title: 'Call the wave',  at: 8.5,  text: 'Start the wave when you are ready. Calling it early earns bonus gold.' },
  { id: 'aim',     icon: '🏹', title: 'Take aim',       at: 15.5, text: 'Tap or click a foe to shoot it yourself. Headshots deal double damage, and hits build a combo.' },
  { id: 'upgrade', icon: '⬆',  title: 'Upgrade',        at: 24,   text: 'Tap a tower to upgrade it. At tier 4 choose a specialization, then buy Mastery stars forever.' },
  { id: 'art',     icon: '✨', title: 'Castle Arts',    at: 33,   text: 'Cast Arrow Rain, Frost Nova and more from the art bar. Aim them where the crowd is thickest.' },
  { id: 'troops',  icon: '⚔',  title: 'Train troops',   at: 41,   text: 'Open the Garrison (G) and train footmen, bowmen, knights and more. Deploy them (D) to hunt foes and hold the road. Bowmen and griffons hit flyers.' },
  { id: 'boss',    icon: '🐉', title: 'Fell the boss',  at: 51,   text: 'A boss marches every 10 waves. Win to earn Renown, spend it in the Keep and climb the ranks.' },
];
export const stepAt = (t) => { let i = 0; STEPS.forEach((s, k) => { if (t >= s.at) i = k; }); return i; };

// A game that cannot be lost and never moves to a next wave; every tower is available.
export class DemoGame extends Game {
  completeWave() {}
  gameOver() {}
  leak(e) { e.dead = true; e.leaked = true; this.emit('leak', { enemy: e, target: 'wall', dmg: 0 }); }
  isTowerUnlocked(id) { return !!TOWERS[id]; }
  troopUnlocked(kind) { return !!TROOPS[kind]; }
}

const dust = { color: ['#e8d6b0', '#c9b48a', '#ffffff'], speed: 1.6, life: 0.45, size: 0.07, gravity: 1.2 };

// Build a demo. `fx` needs text/burst/ring (the real FX in the browser, a stub in tests).
// Returns { g, ptr, step(dt), time() }; ptr is the on-screen "finger": { x, y, tx, ty, ripple, visible, sel, label }.
export function createDemo({ fx, weapon = 'longbow', mapId = 'meadow', seed = 'how-to-play' } = {}) {
  const g = new DemoGame({ seed, mapId, weapon, tutorial: false, bonus: { startBoons: 0, startGold: 140 } });
  g.pickQueue = 0; g.boonOffer = null; g.buildTimer = Infinity;
  const { cols, rows } = g.map;
  const ptr = { x: cols - 1, y: rows - 1, tx: cols - 1, ty: rows - 1, ripple: 0, visible: false, sel: null, label: '', bar: null, startBtn: null };

  // The four best plots, spread along the road.
  const plots = [...g.freePlots()].sort((a, b) => (g.map.coverage.get(b.k) || 0) - (g.map.coverage.get(a.k) || 0)).slice(0, 4);
  const centre = (p) => ({ x: p.x + 0.5, y: p.y + 0.35 });

  const events = [];
  const at = (t, fn) => events.push({ t, fn, done: false });
  const point = (x, y) => { ptr.tx = x; ptr.ty = y; ptr.visible = true; };
  const tap = () => { ptr.ripple = 1; };
  const say = (x, y, txt, color = '#ffd666', size = 0.3) => fx.text(x, y, txt, { color, size, bold: true });
  const spawn = (type, lane, o = {}) => g.spawnEnemy(type, lane, o);
  const lanes = g.map.paths.length;

  // ----- step 1: build -----
  const placeTower = (type, plot, t0) => {
    at(t0, () => { const c = centre(plot); point(c.x, c.y + 0.1); });
    at(t0 + 0.8, () => {
      tap();
      const t = g.build(type, plot.x, plot.y);
      if (!t) return;
      say(plot.x + 0.5, plot.y - 0.2, `-⛁ ${t.invested}`);
      fx.burst(plot.x + 0.5, plot.y + 0.7, 10, dust);
    });
  };
  at(0, () => { g.gold = 420; point(cols * 0.5, rows * 0.55); ptr.label = 'Pick a tower, tap a plot'; });
  placeTower('archer', plots[0], 0.8);
  placeTower('cannon', plots[1], 2.4);
  placeTower('mage', plots[2], 4.0);
  placeTower('frost', plots[3], 5.6);

  // ----- step 2: call the wave -----
  at(8.5, () => { ptr.label = ''; ptr.startBtn = 1; point(cols * 0.5, 0.75); });
  at(9.6, () => {
    tap();
    g.startWave();
    ptr.startBtn = null;
    say(cols * 0.5, 1.4, `Wave ${g.wave}`, '#ffffff', 0.42);
  });
  // The first wave's own foes arrive; add a few slower ones so there is always something on the road for step 3.
  at(10.5, () => point(cols * 0.5, rows * 0.7));
  for (let i = 0; i < 8; i++) at(12.5 + i * 0.85, () => spawn(i % 3 === 2 ? 'shield' : 'grunt', i % lanes, { hpScale: 1.6, speedScale: 0.8 }));

  // ----- step 3: take aim -----
  const target = () => {
    let best = null;
    for (const e of g.enemies) if (!e.dead && !e.air && e.dist > 1 && (!best || e.dist > best.dist)) best = e;
    return best;
  };
  const headOf = (e) => ({ x: e.x, y: e.y - e.size * 0.75 - (e.air ? 0.35 : 0) });
  const aimAt = () => { const e = target(); if (e) { const hp = headOf(e); point(hp.x, hp.y); } };
  const shoot = () => {
    const e = target(); if (!e) return;
    const hp = headOf(e);
    ptr.x = hp.x; ptr.y = hp.y; ptr.tx = hp.x; ptr.ty = hp.y; ptr.visible = true;
    g.weapon.ammo = Math.max(g.weapon.ammo, 1);
    tap();
    g.heroFire(hp.x, hp.y, 0);
  };
  at(15.5, () => { ptr.label = 'Tap a foe to shoot'; });
  for (let i = 0; i < 7; i++) { at(16.0 + i * 1.05, aimAt); at(16.55 + i * 1.05, shoot); }

  // ----- step 4: upgrade -----
  const first = () => g.towerAt(plots[0].x, plots[0].y);
  const upgradeStep = (t0, label) => {
    at(t0, () => { const c = centre(plots[0]); point(c.x, c.y + 0.1); ptr.label = ''; });
    at(t0 + 0.7, () => {
      tap(); const t = first(); if (!t) return;
      ptr.sel = t;
      g.gold = Math.max(g.gold, 700);
      if (t.tier < 4) { if (g.upgrade(t)) { say(t.cx, t.y - 0.5, label, '#9be5a8'); fx.burst(t.cx, t.cy, 12, { color: ['#ffd666', '#ffffff'], speed: 2, life: 0.5, size: 0.07, gravity: -0.5 }); } }
      else {
        const spec = Object.keys(TOWERS[t.type].specs || {})[0];
        if (spec && g.chooseSpec(t, spec)) { say(t.cx, t.y - 0.6, TOWERS[t.type].specs[spec].name, '#c27dff', 0.34); fx.ring(t.cx, t.cy, 1.4, '#c27dff', 0.6, 0.08); }
      }
    });
  };
  at(24, () => { ptr.label = 'Tap a tower to upgrade'; });
  upgradeStep(24.2, 'Tier 2'); upgradeStep(26.0, 'Tier 3'); upgradeStep(27.8, 'Tier 4'); upgradeStep(29.6, 'Tier 5');
  at(31.5, () => { ptr.sel = null; });
  for (let i = 0; i < 4; i++) at(25 + i * 1.8, () => spawn('grunt', i % lanes, { hpScale: 1.4 }));

  // ----- step 5: castle arts -----
  const art = g.loadout.includes('volley') ? 'volley' : g.loadout[0];
  const crowdCentre = () => {
    let best = null, bn = -1;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const n = g.enemies.filter((o) => !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < 1.6).length;
      if (n > bn) { bn = n; best = e; }
    }
    return best ? { x: best.x, y: best.y } : { x: cols * 0.5, y: rows * 0.5 };
  };
  at(33, () => { ptr.label = ''; ptr.bar = { icon: ABILITIES[art].icon, name: ABILITIES[art].name, hot: 0 }; });
  for (let i = 0; i < 12; i++) at(33.1 + i * 0.3, () => spawn(i % 4 === 3 ? 'runner' : 'grunt', i % lanes, { hpScale: 2.2 }));
  at(35.0, () => point(1.1, rows - 0.75));
  at(35.8, () => { tap(); if (ptr.bar) ptr.bar.hot = 1; });
  at(36.5, () => { const c = crowdCentre(); point(c.x, c.y); });
  at(37.4, () => {
    tap();
    const c = crowdCentre(); ptr.x = c.x; ptr.y = c.y; ptr.tx = c.x; ptr.ty = c.y;
    g.useAbility(art, c.x, c.y);
    say(c.x, c.y - 0.8, ABILITIES[art].name + '!', '#ffd666', 0.38);
    if (ptr.bar) ptr.bar.hot = 0;
  });
  at(39.5, () => { ptr.bar = null; ptr.visible = false; });

  // ----- step 6: train and deploy troops -----
  const squad = ['footman', 'footman', 'bowman', 'knight'];
  at(41, () => { ptr.label = ''; ptr.bar = { icon: '⚔', name: 'Garrison', hot: 0 }; point(1.1, rows - 0.75); });
  at(41.8, () => { tap(); if (ptr.bar) ptr.bar.hot = 1; });
  squad.forEach((k, i) => at(42.4 + i * 0.7, () => { const u = g.addTroop(k, true); say(u.x, u.y - 0.6, TROOPS[k].name, '#9be5a8', 0.3); fx.burst(u.x, u.y, 8, dust); }));
  at(45.5, () => { ptr.label = 'D: send them out to hunt'; if (ptr.bar) ptr.bar.hot = 0; ptr.bar = null; ptr.visible = false; });
  for (let i = 0; i < 10; i++) at(45.8 + i * 0.7, () => spawn(i % 5 === 4 ? 'wyvern' : i % 3 === 2 ? 'runner' : 'grunt', i % lanes, { hpScale: 1.8 }));
  at(50.5, () => { ptr.label = ''; });

  // ----- step 6: the boss -----
  const boss = BOSSES[0];
  at(51, () => {
    const e = spawn('boss', 0, { boss: boss.id, hpScale: 0.6 });
    e.hp = e.maxHp;
    say(e.x + 1, e.y - 1, boss.name, '#ff8a7a', 0.42);
  });
  for (let i = 0; i < 6; i++) at(53.4 + i * 0.9, () => { aimAt(); });
  for (let i = 0; i < 6; i++) at(53.9 + i * 0.9, () => {
    const b = g.enemies.find((e) => e.boss && !e.dead);
    if (!b) { ptr.visible = false; return; }
    const hp = headOf(b);
    ptr.x = hp.x; ptr.y = hp.y; ptr.tx = hp.x; ptr.ty = hp.y; ptr.visible = true;
    g.weapon.ammo = Math.max(g.weapon.ammo, 1); tap(); g.heroFire(hp.x, hp.y, 0);
  });
  g.on('kill', ({ enemy }) => { if (enemy.boss) say(enemy.x, enemy.y - 1.2, '+✦ Renown', '#ffd666', 0.5); });
  at(LENGTH - 2, () => { ptr.visible = false; });

  events.sort((a, b) => a.t - b.t);
  let T = 0, acc = 0;
  const refill = () => {
    g.castle.hp = g.castle.maxHp; g.wall.hp = g.wall.maxHp;
    for (const tw of g.towers) { tw.hp = tw.maxHp; tw.ruined = false; }
    for (const u of g.garrison.units) u.hp = u.maxHp;
  };
  const tick = (dt) => {
    T += dt;
    for (const ev of events) if (!ev.done && T >= ev.t) { ev.done = true; ev.fn(); }
    g.update(dt);
    refill();
    // The finger glides toward where it is pointing; a tap ripple fades.
    const k = Math.min(1, dt * 8);
    ptr.x += (ptr.tx - ptr.x) * k; ptr.y += (ptr.ty - ptr.y) * k;
    if (ptr.ripple > 0) ptr.ripple = Math.max(0, ptr.ripple - dt * 2.4);
    if (ptr.bar && ptr.bar.hot > 0) ptr.bar.hot = Math.max(0.0001, ptr.bar.hot);
  };
  return {
    g, ptr, plots, art,
    time: () => T,
    // Advance by real time in fixed 1/60 steps.
    step(dt) {
      acc += Math.min(0.1, dt);
      let n = 0;
      while (acc >= 1 / 60 && n < 6) { tick(1 / 60); acc -= 1 / 60; n++; }
      if (n >= 6) acc = 0;
      return T >= LENGTH;
    },
    // Fast-forward (no drawing) to a point on the timeline.
    seek(t) { while (T < t) { tick(1 / 60); fx.update && fx.update(1 / 60); } },
  };
}
