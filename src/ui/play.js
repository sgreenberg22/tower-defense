// A running game: loop, HUD, dock, panels, input, and engine→FX/audio wiring.
import { Game } from '../game/engine.js';
import { Renderer, drawIcon } from '../game/render.js';
import { FX, KILL_FX } from '../game/fx.js';
import { audio } from '../game/audio.js';
import { TOWERS, TOWER_ORDER, ENEMIES, BOSSES, BOONS, ARMORY, WEAPONS, GAME, COMBO, TIER, BIOMES } from '../data/balance.js';
import { previewTypes, biomeFor } from '../game/waves.js';
import { isBuildable, T } from '../game/maps.js';
import { h, fmt, toast, modal, confirmBox, bar } from './dom.js';
import { saveRun, clearRun, checkAchievements, saveProfile, clanPerkLevel } from '../meta/profile.js';
import { Tutorial } from './tutorial.js';

const BOON_BY_ID = Object.fromEntries(BOONS.map((b) => [b.id, b]));
const HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', '['];
const TARGET_MODES = [['first', 'First'], ['last', 'Last'], ['strong', 'Strong'], ['close', 'Close']];

export class PlaySession {
  constructor(app, opts) {
    this.app = app;
    this.p = app.profile;
    this.opts = opts;
    this.view = document.getElementById('game-view');
    this.canvas = document.getElementById('board');
    this.wrap = document.getElementById('board-wrap');
    this.speed = 1;
    this.paused = false;
    this.placing = null;
    this.selected = null;
    this.panelMode = null; // 'tower' | 'war' | null
    this.hitStop = 0;
    this.acc = 0;
    this.cache = {};
    this.touchGhost = null;
    this.alive = true;
  }

  start() {
    document.getElementById('screen').replaceChildren();
    this.view.hidden = false;
    const r = this.wrap.getBoundingClientRect();
    const portrait = this.opts.save ? this.opts.save.portrait : r.height > r.width * 1.05;
    const s = this.p.settings;
    this.game = new Game({ ...this.opts, portrait, bonus: this.app.runBonus(), save: this.opts.save });
    this.renderer = new Renderer(this.canvas);
    this.renderer.cosmetics = { castle: this.p.equip.castle, trail: this.p.equip.trail, towerSkin: this.p.equip.skin };
    this.renderer.colorblind = s.colorblind;
    this.renderer.quality = s.quality; this.renderer.reduced = !!s.reducedMotion;
    this.renderer.onLootExpire = (l) => this.collectLoot(l, 1);
    this.streak = { n: 0, t: 0 };
    this.renderer.clanBanner = this.app.clan && clanPerkLevel(this.app.clan) >= 3 ? this.app.clan.color : null;
    this.fx = new FX();
    this.fx.setQuality(s.quality); this.fx.reduced = s.reducedMotion; this.fx.shakeOn = s.shake;
    this.killFx = KILL_FX[this.p.equip.kill] || KILL_FX.poof;
    this.buildHud(); this.buildDock(); this.buildOverlay();
    this.wire();
    this.bindInput();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.wrap);
    this.resize();
    audio.init(); audio.startMusic();
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
    if (!this.opts.save) this.save();
    if (this.opts.tutorial) this.tutorial = new Tutorial(this);
    this.banner(`Wave ${this.game.wave}`, this.opts.save ? 'Welcome back, commander' : biomeFor(this.game.wave).name, '', 1800);
    this.onVis = () => { if (document.hidden) { if (!this.paused) this.pause(true); this.save(); } };
    document.addEventListener('visibilitychange', this.onVis);
  }

  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
    window.removeEventListener('keydown', this.onKey);
    this.tutorial?.destroy();
    this.view.hidden = true;
    document.getElementById('panel').hidden = true;
    document.getElementById('board-overlay').replaceChildren();
    document.getElementById('wave-banner').replaceChildren();
  }

  resize() {
    const r = this.wrap.getBoundingClientRect();
    this.renderer.resize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1), this.game);
  }

  save() { if (this.game.phase === 'build' && !this.game.over) saveRun(this.game.serialize()); }

  // ---------------- loop ----------------
  frame(t) {
    if (!this.alive) return;
    try { this.tick(t); } catch (err) {
      // Never let one bad frame freeze the game; report once per message.
      const msg = String(err && err.message);
      if (this.lastErr !== msg) { this.lastErr = msg; console.error(err); }
    }
    this.raf = requestAnimationFrame((tt) => this.frame(tt));
  }

  tick(t) {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    const g = this.game;
    if (!this.paused && !g.over) {
      if (this.hitStop > 0) this.hitStop -= dt;
      else {
        this.acc += dt * this.speed;
        let n = 0;
        while (this.acc >= GAME.step && n < 12) { g.update(GAME.step); this.acc -= GAME.step; n++; }
        if (n >= 12) this.acc = 0;
      }
    }
    this.fx.update(dt);
    if (this.charge) this.renderer.charge = { x: this.charge.x, y: this.charge.y, amount: this.chargeAmount() };
    else this.renderer.charge = null;
    this.renderer.selected = this.selected;
    this.renderer.draw(g, this.fx, dt, { placing: this.placing });
    this.updateHud();
    this.tutorial?.tick(dt);
  }

  chargeAmount() {
    if (!this.charge) return 0;
    const held = (performance.now() - this.charge.t0) / 1000;
    return held < 0.18 ? 0 : Math.min(1, (held - 0.18) / COMBO.chargeTime);
  }

  // ---------------- HUD ----------------
  buildHud() {
    const hud = document.getElementById('hud');
    this.el = {};
    const e = this.el;
    e.wave = h('b'); e.biome = h('span');
    e.castleBar = bar(1, 'moss'); e.wallBar = bar(1, 'gold');
    e.gold = h('span'); e.score = h('span');
    e.speed = h('button', { class: 'btn small', title: 'Game speed (F)', onclick: () => this.cycleSpeed() }, '1×');
    hud.replaceChildren(
      h('button', { class: 'btn small ghost', 'aria-label': 'Pause menu', title: 'Pause (P)', onclick: () => this.pause() }, '❚❚'),
      h('div', { class: 'hud-wave' }, e.wave, e.biome),
      h('div', { class: 'hud-bars' }, h('span', {}, 'Keep'), e.castleBar, h('span', {}, 'Wall'), e.wallBar),
      e.goldBox = h('div', { class: 'hud-stat gold', title: 'Gold' }, '⛁ ', e.gold),
      h('div', { class: 'hud-stat', title: 'Score' }, h('span', { class: 'lbl' }, 'SCORE'), e.score),
      h('div', { class: 'hud-right' }, e.speed),
    );
  }

  buildOverlay() {
    const ov = document.getElementById('board-overlay');
    const e = this.el;
    e.next = h('div', { class: 'next-chip' });
    e.ammo = h('div', { class: 'ammo', 'aria-label': 'Ammo' });
    e.combo = h('div', { class: 'combo dead' }, '×1.0');
    e.hazard = h('div', { class: 'hazard-chip', hidden: true });
    ov.replaceChildren(e.next, h('div', { class: 'hero-hud' }, e.ammo, e.combo), e.hazard);
  }

  buildDock() {
    const dock = document.getElementById('dock');
    const e = this.el;
    e.towerBar = h('div', { class: 'tower-bar', role: 'toolbar', 'aria-label': 'Towers' });
    e.tbtns = {};
    TOWER_ORDER.forEach((id, i) => {
      const def = TOWERS[id];
      const cv = h('canvas');
      drawIcon(cv, 'tower', id, { size: 44 });
      const b = h('button', { class: 'tbtn', 'aria-label': def.name, title: `${def.name} — ${def.desc}`, onclick: () => this.selectBuild(id) },
        h('span', { class: 'k' }, HOTKEYS[i] || ''), cv, h('span', { class: 'c' }));
      e.tbtns[id] = b;
      e.towerBar.append(b);
    });
    e.war = h('button', { class: 'btn small blue', title: 'Repairs & Armory', onclick: () => this.togglePanel('war') }, '⚒ War Room');
    e.start = h('button', { class: 'btn gold start-btn', onclick: () => this.startWave() }, h('span', {}, 'Start wave'), h('small', {}));
    dock.replaceChildren(e.towerBar, h('div', { class: 'dock-actions' }, e.war, e.start));
  }

  set(key, val, fn) { if (this.cache[key] !== val) { this.cache[key] = val; fn(val); } }

  updateHud() {
    const g = this.game, e = this.el, c = this.cache;
    this.set('wave', g.wave, (v) => { e.wave.textContent = 'Wave ' + v; });
    this.set('biome', g.biome.name + (g.mode === 'daily' ? ' · Daily' : ''), (v) => { e.biome.textContent = v; });
    this.set('castle', Math.ceil(g.castle.hp) + '/' + g.castle.maxHp, () => { e.castleBar.firstChild.style.width = (100 * g.castle.hp / g.castle.maxHp) + '%'; e.castleBar.title = `Keep ${Math.ceil(g.castle.hp)} / ${Math.round(g.castle.maxHp)}`; });
    this.set('wall', Math.ceil(g.wall.hp) + '/' + g.wall.maxHp, () => { e.wallBar.firstChild.style.width = (100 * g.wall.hp / g.wall.maxHp) + '%'; e.wallBar.title = `Wall ${Math.ceil(g.wall.hp)} / ${Math.round(g.wall.maxHp)}`; });
    this.set('gold', Math.floor(g.gold), (v) => { e.gold.textContent = fmt(v); this.refreshAfford(); });
    this.set('score', g.score, (v) => { e.score.textContent = fmt(v); });
    this.set('speed', this.speed, (v) => { e.speed.textContent = v + '×'; });
    // Start button
    const label = g.phase === 'build' ? (g.boonOffer ? 'Choose a boon' : 'Start wave') : `Wave ${g.wave}`;
    const sub = g.phase === 'build'
      ? (Number.isFinite(g.buildTimer) ? `${Math.ceil(g.buildTimer)}s · +${fmt(this.earlyBonus())} early` : 'Ready when you are')
      : `${g.enemies.length + g.spawnQueue.length} left`;
    this.set('startLabel', label + '|' + sub + '|' + g.phase, () => {
      e.start.firstChild.textContent = label; e.start.lastChild.textContent = sub;
      e.start.disabled = g.phase !== 'build' || !!g.boonOffer;
    });
    this.set('phase', g.phase, () => { e.war.disabled = false; this.renderNext(); if (this.panelMode) this.renderPanel(); });
    // Ammo
    const W = g.weaponStats();
    const reloadFrac = g.weapon.reloadT > 0 ? 1 - g.weapon.reloadT / W.reload : 0;
    this.set('ammo', g.weapon.ammo + '|' + W.ammo + '|' + Math.round(reloadFrac * 8), () => {
      e.ammo.replaceChildren(...Array.from({ length: W.ammo }, (_, i) => {
        if (i < g.weapon.ammo) return h('i');
        if (i === g.weapon.ammo) { const el = h('i', { class: 'loading' }); el.style.setProperty('--p', Math.round(reloadFrac * 100) + '%'); return el; }
        return h('i', { class: 'off' });
      }));
    });
    this.set('combo', g.combo, (v) => {
      e.combo.textContent = '×' + g.comboMult().toFixed(1) + (v ? ` · ${v} hits` : '');
      e.combo.classList.toggle('dead', v === 0);
      if (v) { e.combo.classList.remove('pop'); void e.combo.offsetWidth; e.combo.classList.add('pop'); }
    });
    const hz = g.hazard.active > 0 && g.phase === 'wave' ? g.hazard.kind : '';
    this.set('hazard', hz, (v) => {
      e.hazard.hidden = !v;
      e.hazard.textContent = { sandstorm: '🌪 Sandstorm: tower range −15%', blizzard: '❄ Blizzard: all slowed, towers −10% rate', meteors: '☄ Meteor shower', stealth: '👁 Shadows: some foes hidden from towers. Shoot them yourself!' }[v] || '';
    });
    if (this.panelMode && performance.now() - (c.panelT || 0) > 250) {
      const key = [Math.floor(g.gold), g.phase, this.selected?.tier, this.selected?.mastery, Math.round(this.selected?.hp || 0), Math.round(g.wall.hp), Math.round(g.castle.hp), this.selected?.kills, g.repairKits].join('|');
      c.panelT = performance.now();
      this.set('panelKey', key, () => this.renderPanel());
    }
  }

  earlyBonus() {
    const g = this.game;
    if (!Number.isFinite(g.buildTimer) || g.buildTimer <= 1) return 0;
    return Math.ceil(g.buildTimer * 0.8 * (1 + 0.05 * g.wave));
  }

  refreshAfford() {
    const g = this.game;
    for (const [id, b] of Object.entries(this.el.tbtns)) {
      const unlocked = g.isTowerUnlocked(id);
      const known = !g.bonus.unlockedTowers || g.bonus.unlockedTowers.has(id);
      const cost = g.buildCost(id);
      b.classList.toggle('locked', !unlocked);
      b.classList.toggle('poor', unlocked && g.gold < cost);
      b.classList.toggle('sel', this.placing === id);
      const c = b.querySelector('.c');
      c.textContent = !known ? '🔒 Keep' : !unlocked ? `Wave ${TOWERS[id].unlockWave}` : fmt(cost);
      if (unlocked && known && !b.dataset.seen && g.wave === TOWERS[id].unlockWave && g.wave > 1) { b.classList.add('new'); b.dataset.seen = '1'; }
      if (g.wave > TOWERS[id].unlockWave + 2) b.classList.remove('new');
    }
  }

  renderNext() {
    const g = this.game, e = this.el;
    if (g.phase !== 'build') { e.next.hidden = true; return; }
    e.next.hidden = false;
    const plan = g.nextPlan;
    const items = previewTypes(plan);
    const kids = [h('span', { class: 'lbl' }, `Next · wave ${g.wave}`)];
    let air = false;
    for (const it of items.slice(0, 7)) {
      const boss = it.key.startsWith('boss:');
      const def = boss ? BOSSES.find((b) => b.id === it.key.slice(5)) : ENEMIES[it.key];
      if (def.air) air = true;
      const cv = h('canvas');
      drawIcon(cv, 'enemy', boss ? it.key : it.key, { def, size: 26, gear: plan.gear });
      kids.push(h('span', { class: 'ico', title: def.name }, cv, boss ? '' : '×' + it.count));
    }
    if (plan.boss) kids.push(h('span', { class: 'warn' }, 'BOSS'));
    if (air) {
      const aa = g.towers.filter((t) => TOWERS[t.type].targets?.includes('a') && !t.ruined).length;
      if (aa < 3) kids.push(h('span', { class: 'warn', title: 'Flyers ignore the road and your wall. Archers, Mages, Flak, Tesla, Frost and the Obelisk can hit them.' }, 'Flyers! Need anti-air'));
    }
    e.next.replaceChildren(...kids);
  }

  // ---------------- banners ----------------
  banner(title, sub = '', cls = '', ms = 1600) {
    const root = document.getElementById('wave-banner');
    const el = h('div', { class: 'pennant ' + cls }, h('div', { class: 't' }, title), sub ? h('div', { class: 's' }, sub) : null);
    root.replaceChildren(el);
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 420); }, ms);
  }

  pop(text) {
    const root = document.getElementById('board-overlay');
    const el = h('div', { class: 'streak-pop' }, text);
    root.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  collectLoot(l, mult) {
    const g = this.game, v = Math.round(l.value * mult);
    g.gold += v; g.stats.goldEarned += v; if (l.kind === 'gem') g.stats.gems = (g.stats.gems || 0) + 1;
    this.fx.text(l.x, l.y - 0.4, '+' + v, { color: l.kind === 'gem' ? '#7fe9ff' : '#f2b33d', size: 0.3, bold: mult > 1 });
    if (mult > 1) audio.play('coin');
    this.refreshAfford?.();
  }

  // ---------------- engine events ----------------
  wire() {
    const g = this.game, fx = this.fx, s = this.p.settings;
    const dmgMode = s.dmgNumbers;
    g.on('shoot', ({ tower, kind }) => {
      if (kind === 'arrow' || kind === 'flak') audio.play('arrow');
      else if (kind === 'ball' || kind === 'boulder') { audio.play('cannon'); fx.burst(tower.cx, tower.cy - 0.35, 4, { color: ['#d9d9d9', '#aaa'], speed: 1, life: 0.4, gravity: -1, size: 0.08 }); }
      else if (kind === 'orb') audio.play('orb');
      else if (kind === 'bolt') audio.play('bolt');
      else if (kind === 'zap') audio.play('zap');
    });
    g.on('impact', ({ x, y, kind, splash }) => {
      if (kind === 'ball' || kind === 'boulder' || kind === 'meteor' || kind === 'heroBlast' || kind === 'hero') {
        audio.play('boom');
        fx.flash(x, y, splash || 0.6, kind === 'meteor' ? '#ff7a3d' : '#ffe2a8');
        fx.burst(x, y, kind === 'meteor' ? 18 : 10, { color: ['#ffb347', '#ffdf8a', '#8a8a8a'], speed: 3, life: 0.5, size: 0.09, gravity: 3 });
        if (kind === 'boulder' || kind === 'meteor') fx.shake(0.12, 0.2);
      } else if (kind === 'flak') fx.burst(x, y, 5, { color: ['#ffb347', '#fff'], speed: 2, life: 0.3, size: 0.06, gravity: 0 });
      else if (kind === 'orb') fx.burst(x, y, 5, { color: ['#c79bff', '#fff'], speed: 1.6, life: 0.35, size: 0.06, gravity: 0 });
    });
    g.on('zap', ({ points, color }) => fx.zap(points, color));
    g.on('pulse', ({ x, y, r }) => { fx.ring(x, y, r, '#bfefff', 0.5, 0.1); audio.play('frost'); });
    g.on('hit', ({ enemy, dmg, crit, hero, headshot }) => {
      if (headshot) { fx.text(enemy.x, enemy.y - 0.9, 'HEADSHOT', { color: '#f2b33d', size: 0.3, bold: true }); audio.play('headshot'); this.hitStop = 0.05; }
      const show = dmgMode === 'all' || (dmgMode === 'hero' && (hero || crit));
      if (show) fx.text(enemy.x + (Math.random() - 0.5) * 0.3, enemy.y - 0.5, fmt(dmg), { color: crit ? '#ffd25e' : hero ? '#ffffff' : '#ffdcd6', size: crit ? 0.36 : 0.28, bold: crit });
      if (hero) { audio.play('heroHit', { combo: g.combo }); fx.burst(enemy.x, enemy.y - 0.3, 4, { color: ['#fff', '#f2b33d'], speed: 2, life: 0.25, size: 0.05, gravity: 0 }); }
    });
    g.on('kill', ({ enemy, gold, hero }) => {
      this.renderer.addCorpse(enemy);
      const bounty = Math.max(1, gold || 1);
      if (enemy.boss) for (let i = 0; i < 6; i++) this.renderer.addLoot(enemy.x, enemy.y, bounty * 0.5, i % 3 ? 'coin' : 'gem');
      else if (Math.random() < (hero ? 0.12 : 0.03)) this.renderer.addLoot(enemy.x, enemy.y, bounty * 3, Math.random() < 0.5 ? 'gem' : 'coin');
      const now = performance.now();
      this.streak.n = now - this.streak.t < 1600 ? this.streak.n + 1 : 1; this.streak.t = now;
      const names = { 3: 'Triple kill!', 5: 'Rampage!', 8: 'Unstoppable!', 12: 'Godlike!', 20: 'LEGENDARY!' };
      if (names[this.streak.n]) this.pop(names[this.streak.n]);
      this.killFx(fx, enemy.x, enemy.y - 0.2 - (enemy.air ? 0.35 : 0), enemy.color);
      audio.play('kill');
      if (hero) { fx.text(enemy.x, enemy.y - 0.2, '+' + gold, { color: '#f2b33d', size: 0.3, life: 0.8 }); audio.play('coin'); }
      if (enemy.boss) { fx.shake(0.3, 0.5); this.hitStop = 0.12; this.banner('Boss defeated!', enemy.name, 'clear', 1800); audio.play('clear'); fx.burst(enemy.x, enemy.y, 40, { color: ['#f2b33d', '#fff', '#d9473b'], speed: 5, life: 1.2, size: 0.1, gravity: 3 }); }
    });
    g.on('heroShot', ({ x, y }) => { audio.play('bow'); this.renderer.onHeroShot(x, y, g.map.castle.x, g.map.castle.y - 0.66); });
    g.on('miss', () => audio.play('miss'));
    g.on('combo', ({ combo, broke }) => {
      if (broke) fx.text(g.map.castle.x, g.map.castle.y - 1.4, 'Combo lost', { color: '#a9b0d6', size: 0.28 });
      if ([10, 25, 50, 100].includes(combo)) { fx.text(g.map.castle.x, g.map.castle.y - 1.5, `${combo} combo!`, { color: '#f2b33d', size: 0.4, bold: true, life: 1.2 }); audio.play('combo', { n: combo / 5 }); }
    });
    g.on('leak', ({ enemy, target }) => {
      audio.play('leak'); fx.shake(enemy.boss ? 0.4 : 0.15, 0.3);
      fx.flash(g.map.castle.x, g.map.castle.y, 0.9, 'rgba(217,71,59,0.7)', 0.25);
      const barEl = target === 'wall' ? this.el.wallBar : this.el.castleBar;
      barEl.classList.remove('hud-flash'); void barEl.offsetWidth; barEl.classList.add('hud-flash');
    });
    g.on('waveStart', ({ wave, boss }) => {
      this.clearSelection();
      if (boss) { this.banner(boss.name, `Wave ${wave} · Boss`, 'boss', 2400); audio.play('boss'); fx.shake(0.15, 0.6); }
      else this.banner(`Wave ${wave}`, waveSubtitle(g.plan), '', 1500);
      audio.play('horn');
      this.renderNext();
      this.tutorial?.event('waveStart');
    });
    g.on('waveClear', ({ wave, gold, mint, interest, flawless, boss }) => {
      setTimeout(() => this.app.syncRealm(g), 300);
      audio.play('clear');
      const bits = [`+${fmt(gold)} gold`];
      if (mint) bits.push(`${fmt(mint)} from mints`);
      if (interest) bits.push(`${fmt(interest)} interest`);
      this.banner(flawless ? 'Flawless!' : `Wave ${wave} cleared`, bits.join(' · '), 'clear', 1600);
      if (biomeFor(wave + 1) !== biomeFor(wave)) setTimeout(() => this.banner(biomeFor(wave + 1).name, 'The land changes around you', '', 2200), 1700);
      this.liveAchievements();
      this.tutorial?.event('waveClear');
    });
    g.on('buildPhase', () => { this.save(); this.refreshAfford(); this.renderNext(); });
    g.on('boonOffer', () => setTimeout(() => this.showBoons(), 350));
    g.on('build', ({ tower }) => { audio.play('build'); fx.burst(tower.cx, tower.cy, 10, { color: ['#d8c7a8', '#a99a7c'], speed: 1.6, life: 0.5, gravity: 2, size: 0.09 }); this.tutorial?.event('build'); });
    g.on('upgrade', ({ tower }) => { audio.play('upgrade'); fx.ring(tower.cx, tower.cy - 0.2, 0.8, '#f2b33d', 0.5); fx.burst(tower.cx, tower.cy - 0.3, 10, { color: ['#f2b33d', '#fff'], speed: 2, life: 0.6, gravity: -1, size: 0.06, shape: 'star' }); });
    g.on('sell', ({ tower, value }) => { audio.play('sell'); fx.text(tower.cx, tower.cy - 0.4, '+' + value, { color: '#f2b33d' }); });
    g.on('repair', () => audio.play('repair'));
    g.on('earlyCall', ({ gold }) => { fx.text(g.map.castle.x, g.map.castle.y - 1.2, `+${gold} early call`, { color: '#f2b33d', size: 0.32 }); audio.play('coin'); });
    g.on('bossSpawn', ({ enemy }) => fx.ring(enemy.x, enemy.y, 2, '#d9473b', 0.8, 0.12));
    g.on('stomp', ({ x, y, r }) => { fx.ring(x, y, r, '#c9a27a', 0.6, 0.18); fx.shake(0.3, 0.4); audio.play('stomp'); });
    g.on('breath', ({ from, x, y }) => { fx.burst(x, y, 20, { color: ['#ffb347', '#e0532f', '#ffd25e'], speed: 2.5, life: 0.6, size: 0.1, gravity: -1 }); audio.play('boom'); });
    g.on('summon', ({ enemy, raise }) => fx.ring(enemy.x, enemy.y, 1.2, raise ? '#9fe7ff' : '#d9473b', 0.6));
    g.on('heal', ({ enemy }) => { if (Math.random() < 0.3) fx.text(enemy.x, enemy.y - 0.5, '+', { color: '#7fe08a', size: 0.3, life: 0.5 }); });
    g.on('ward', ({ enemy }) => fx.ring(enemy.x, enemy.y, 1.6, '#b79bff', 0.5));
    g.on('sabotage', ({ tower }) => { fx.burst(tower.cx, tower.cy - 0.4, 8, { color: ['#f2b33d', '#fff'], speed: 2, life: 0.4, size: 0.05 }); fx.text(tower.cx, tower.cy - 0.8, 'Sabotaged', { color: '#ffb3a8', size: 0.24 }); });
    g.on('towerRuined', ({ tower }) => { fx.burst(tower.cx, tower.cy, 16, { color: ['#888', '#aaa', '#6b5a4a'], speed: 2.5, life: 0.7, size: 0.1, gravity: 3 }); fx.shake(0.15, 0.25); toast(`${TOWERS[tower.type].name} was wrecked. Repair it in the build phase.`); });
    g.on('hazard', ({ kind, on }) => { if (on) audio.play('error'); });
    g.on('secondWind', () => { this.banner('Second Wind!', 'The keep refuses to fall', 'clear', 2000); fx.shake(0.4, 0.6); });
    g.on('enrage', () => toast('The horde grows desperate and enraged!'));
    g.on('boon', () => { audio.play('boon'); this.refreshAfford(); });
    g.on('gameOver', (summary) => this.onGameOver(summary));
  }

  liveAchievements() {
    const g = this.game, p = this.p;
    // Evaluate with lifetime stats + this run so far, without persisting the merged stats.
    const run = g.summary();
    const merged = { ...p, stats: { ...p.stats } };
    for (const k of ['kills', 'heroKills', 'shots', 'hits', 'headshots', 'bossKills', 'towersBuilt']) merged.stats[k] = (p.stats[k] || 0) + (run[k] || 0);
    merged.stats.maxCombo = Math.max(p.stats.maxCombo, run.maxCombo);
    merged.stats.maxFlawlessStreak = Math.max(p.stats.maxFlawlessStreak || 0, run.maxFlawlessStreak);
    merged.stats.maxMastery = Math.max(p.stats.maxMastery || 0, run.maxMastery);
    merged.stats.killsByType = { ...p.stats.killsByType };
    for (const [k, v] of Object.entries(run.killsByType)) merged.stats.killsByType[k] = (merged.stats.killsByType[k] || 0) + v;
    merged.best = { wave: { ...p.best.wave, [run.map]: Math.max(p.best.wave[run.map] || 0, run.wave) }, score: p.best.score };
    merged.specsSeen = [...new Set([...p.specsSeen, ...run.specs])];
    const got = checkAchievements(merged, null);
    if (got.length) {
      Object.assign(p.achievements, merged.achievements); p.owned = merged.owned; p.titles = merged.titles;
      saveProfile(p);
      for (const a of got) { toast(h('div', {}, h('b', {}, a.name), h('div', { class: 'muted' }, a.desc)), { kind: 'ach', icon: '🏆', ms: 3600 }); audio.play('achievement'); }
    }
  }

  // ---------------- actions ----------------
  startWave() {
    const g = this.game;
    if (g.boonOffer) { this.showBoons(); return; }
    if (g.startWave()) { this.placing = null; this.renderer.ghost = null; this.refreshAfford(); }
  }

  cycleSpeed() { this.speed = this.speed === 3 ? 1 : this.speed + 1; }

  selectBuild(id) {
    const g = this.game;
    const known = !g.bonus.unlockedTowers || g.bonus.unlockedTowers.has(id);
    if (!known) { toast(`Unlock the ${TOWERS[id].name} in The Keep with Renown.`); audio.play('error'); return; }
    if (!g.isTowerUnlocked(id)) { toast(`${TOWERS[id].name} becomes available on wave ${TOWERS[id].unlockWave}.`); audio.play('error'); return; }
    this.placing = this.placing === id ? null : id;
    this.el.tbtns[id].classList.remove('new');
    this.clearSelection(false);
    if (!this.placing) this.renderer.ghost = null;
    this.refreshAfford();
    if (this.placing) this.tutorial?.event('select');
  }

  clearSelection(closePanel = true) {
    this.selected = null;
    if (closePanel && this.panelMode === 'tower') this.togglePanel(null);
  }

  togglePanel(mode) {
    this.panelMode = this.panelMode === mode ? null : mode;
    if (mode === 'war') this.selected = null;
    this.renderPanel();
  }

  renderPanel() {
    const panel = document.getElementById('panel');
    if (this.panelMode === 'tower' && (!this.selected || !this.game.towers.includes(this.selected))) { this.panelMode = null; this.selected = null; }
    if (!this.panelMode) { panel.hidden = true; return; }
    panel.hidden = false;
    panel.replaceChildren(this.panelMode === 'tower' ? this.towerPanel(this.selected) : this.warPanel());
    this.cache.panelKey = null;
  }

  towerPanel(t) {
    const g = this.game, def = TOWERS[t.type], s = t.stats || {};
    const close = h('button', { class: 'btn small ghost', 'aria-label': 'Close', onclick: () => this.clearSelection() }, '✕');
    const title = def.name + (t.spec ? ` · ${def.specs[t.spec].name}` : '');
    const tierTxt = t.mastery ? `Tier 5 · Mastery ★${t.mastery}` : `Tier ${t.tier}`;
    const rows = [];
    const stat = (label, val) => rows.push(h('div', {}, h('span', {}, label), h('b', {}, val)));
    if (s.dmg) stat('Damage', fmt(s.dmg));
    if (s.rate) stat('Rate', s.rate.toFixed(2) + '/s');
    if (s.range && !def.trap) stat('Range', s.range.toFixed(1));
    if (s.splash) stat('Splash', s.splash.toFixed(1));
    if (s.chain) stat('Chains', s.chain);
    if (s.pierce) stat('Pierce', s.pierce);
    if (s.burn) stat('Burn', fmt(s.burn) + '/s');
    if (s.dps) stat('Beam', fmt(s.dps) + '/s');
    if (s.slow) stat('Slow', Math.round(s.slow * 100) + '%');
    if (s.income) stat('Income', fmt(s.income) + '/wave');
    if (s.soldiers) { stat('Soldiers', s.soldiers); stat('Soldier HP', fmt(s.soldierHp)); }
    if (t.type === 'banner') stat('Aura', `+${Math.round((s.auraDmg || 0) * 100)}%`);
    stat('Kills', fmt(t.kills)); stat('Dealt', fmt(t.dmg));
    stat('HP', `${Math.ceil(t.hp)}/${Math.round(t.maxHp)}`);
    if (t.high) stat('High ground', '+range');
    if (t.rally) stat('Rally point', '+10% rate');
    const kids = [
      h('div', { class: 'panel-head' }, h('h3', {}, title), close),
      h('div', { class: 'muted' }, tierTxt, t.ally ? ` · Allied tower from ${t.ally} (${t.allyWaves} waves left)` : ''),
      h('div', { class: 'stat-grid' }, rows),
    ];
    if (t.ally) return h('div', { class: 'plaque' }, kids);
    if (!def.passive && !def.trap && t.type !== 'barracks') {
      kids.push(h('div', { class: 'section-label' }, 'Targeting'));
      kids.push(h('div', { class: 'seg', role: 'group' }, TARGET_MODES.map(([m, l]) => h('button', { 'aria-pressed': String(t.targetMode === m), onclick: () => { g.setTargeting(t, m); this.renderPanel(); } }, l))));
    }
    if (t.tier === TIER.max - 1) {
      const cost = g.upgradeCost(t);
      kids.push(h('div', { class: 'section-label' }, `Choose a specialization · ⛁ ${fmt(cost)}`));
      kids.push(h('div', { class: 'spec-choice' }, Object.entries(def.specs).map(([id, sp]) =>
        h('button', { class: 'btn gold', disabled: !g.canSpec(t), onclick: () => { g.chooseSpec(t, id); this.renderPanel(); } }, h('b', {}, sp.name), h('small', {}, sp.desc)))));
    } else {
      const cost = g.upgradeCost(t);
      const lbl = t.tier >= TIER.max ? `Mastery ★${t.mastery + 1}` : `Upgrade to tier ${t.tier + 1}`;
      kids.push(h('div', { class: 'row', style: { marginTop: '.6rem' } },
        h('button', { class: 'btn gold wide', disabled: !g.canUpgrade(t), title: 'U', onclick: () => { g.upgrade(t); this.renderPanel(); } }, lbl, h('span', { class: 'cost' }, '⛁ ' + fmt(cost)))));
    }
    const row = h('div', { class: 'row', style: { marginTop: '.5rem' } });
    if (t.hp < t.maxHp) {
      const rc = g.towerRepairCost(t);
      row.append(h('button', { class: 'btn small moss', disabled: !g.canRepair() || g.gold < rc, title: g.canRepair() ? 'Repair (R)' : 'Repairs happen between waves', onclick: () => { g.repairTower(t); this.renderPanel(); } }, `Repair ⛁ ${fmt(rc)}`));
    }
    row.append(h('span', { class: 'spacer' }));
    row.append(h('button', { class: 'btn small red', title: 'Sell (S)', onclick: () => { g.sell(t); this.clearSelection(); } }, `Sell +${fmt(g.sellValue(t))}`));
    kids.push(row);
    return h('div', { class: 'plaque' }, kids);
  }

  warPanel() {
    const g = this.game;
    const W = g.weaponStats();
    const close = h('button', { class: 'btn small ghost', 'aria-label': 'Close', onclick: () => this.togglePanel(null) }, '✕');
    const canRep = g.canRepair();
    const kids = [h('div', { class: 'panel-head' }, h('h3', {}, 'War Room'), close)];
    kids.push(h('div', { class: 'section-label' }, canRep ? 'Repairs' : g.mod.norepair ? 'Repairs are disabled (No Repairs)' : 'Repairs open between waves'));
    const wc = g.wallRepairCost(), cc = g.castleRepairCost();
    kids.push(h('div', { class: 'armory-row' }, h('div', {}, 'Wall', h('small', {}, `${Math.ceil(g.wall.hp)} / ${Math.round(g.wall.maxHp)}`)),
      h('button', { class: 'btn small moss', disabled: !canRep || g.wall.hp >= g.wall.maxHp || g.gold < 1, onclick: () => { g.repairWall(); this.renderPanel(); } }, g.wall.hp >= g.wall.maxHp ? 'Full' : wc > g.gold ? `Patch ⛁ ${fmt(g.gold)}` : `Repair ⛁ ${fmt(wc)}`)));
    kids.push(h('div', { class: 'armory-row' }, h('div', {}, 'Keep', h('small', {}, `${Math.ceil(g.castle.hp)} / ${Math.round(g.castle.maxHp)}`)),
      h('button', { class: 'btn small moss', disabled: !canRep || g.castle.hp >= g.castle.maxHp || g.gold < 1, onclick: () => { g.repairCastle(); this.renderPanel(); } }, g.castle.hp >= g.castle.maxHp ? 'Full' : cc > g.gold ? `Patch ⛁ ${fmt(g.gold)}` : `Repair ⛁ ${fmt(cc)}`)));
    const damaged = g.towers.filter((t) => t.hp < t.maxHp && !t.ally);
    if (damaged.length) {
      const total = damaged.reduce((a, t) => a + g.towerRepairCost(t), 0);
      kids.push(h('div', { class: 'armory-row' }, h('div', {}, `Towers`, h('small', {}, `${damaged.length} damaged`)),
        h('button', { class: 'btn small moss', disabled: !canRep, onclick: () => { g.repairAllTowers(); this.renderPanel(); } }, `Repair all ⛁ ${fmt(total)}`)));
    }
    if (g.repairKits) kids.push(h('button', { class: 'btn small blue wide', disabled: g.wall.hp >= g.wall.maxHp, onclick: () => { g.useRepairKit(); this.renderPanel(); } }, `Use Repair Kit (${g.repairKits})`));
    kids.push(h('div', { class: 'section-label' }, `Armory · ${WEAPONS[g.weapon.id].name}`));
    kids.push(h('div', { class: 'stat-grid' },
      h('div', {}, h('span', {}, 'Damage'), h('b', {}, fmt(W.dmg))), h('div', {}, h('span', {}, 'Reload'), h('b', {}, W.reload.toFixed(2) + 's')),
      h('div', {}, h('span', {}, 'Quiver'), h('b', {}, W.ammo)), h('div', {}, h('span', {}, 'Crit'), h('b', {}, Math.round(W.crit * 100) + '%'))));
    for (const [stat, a] of Object.entries(ARMORY)) {
      const c = g.armoryCost(stat);
      const maxed = !Number.isFinite(c);
      kids.push(h('div', { class: 'armory-row' }, h('div', {}, `${a.name} · lv ${g.weapon.lv[stat]}`, h('small', {}, a.desc)),
        h('button', { class: 'btn small gold', disabled: maxed || g.gold < c || g.phase !== 'build', onclick: () => { g.buyArmory(stat); this.renderPanel(); } }, maxed ? 'Max' : `⛁ ${fmt(c)}`)));
    }
    if (g.phase !== 'build') kids.push(h('p', { class: 'muted' }, 'Armory upgrades open between waves.'));
    const boons = Object.entries(g.boons).filter(([, n]) => n > 0);
    if (boons.length) {
      kids.push(h('div', { class: 'section-label' }, 'Boons'));
      kids.push(h('div', { class: 'row' }, boons.map(([id, n]) => h('span', { class: 'chip', title: BOON_BY_ID[id].desc }, BOON_BY_ID[id].name + (n > 1 ? ' ×' + n : '')))));
    }
    return h('div', { class: 'plaque' }, kids);
  }

  showBoons() {
    const g = this.game;
    if (!g.boonOffer || this.boonModal) return;
    const pick = (id) => { g.chooseBoon(id); this.boonModal.close(); this.boonModal = null; this.refreshAfford(); this.tutorial?.event('boon'); };
    const cards = g.boonOffer.map((id, i) => {
      const b = BOON_BY_ID[id];
      const have = g.boon(id);
      return h('button', { class: 'boon ' + b.rarity, style: { animationDelay: i * 0.07 + 's' }, onclick: () => pick(id) },
        h('span', { class: 'r' }, b.rarity.toUpperCase()), h('span', { class: 'n' }, b.name), h('span', { class: 'd' }, b.desc),
        have ? h('span', { class: 'stk' }, `You have ${have}/${b.stack}`) : null);
    });
    const reroll = g.rerolls > 0 ? h('button', { class: 'btn small ghost', onclick: () => { g.rerollBoons(); this.boonModal.close(); this.boonModal = null; this.showBoons(); } }, `Reroll (${g.rerolls})`) : null;
    this.boonModal = modal([h('h2', {}, 'Choose a boon'), h('p', { class: 'muted' }, 'It lasts for the rest of this run.'), h('div', { class: 'boons' }, cards), reroll], { wide: true, dismiss: false });
  }

  async pause(auto = false) {
    if (this.paused || this.game.over) return;
    this.paused = true;
    const g = this.game;
    const canSave = g.phase === 'build';
    const m = modal([
      h('h2', {}, 'Paused'),
      h('p', { class: 'muted' }, `Wave ${g.wave} · Score ${fmt(g.score)} · ${g.stats.kills} kills`),
      h('div', { class: 'grid' },
        h('button', { class: 'btn gold big', onclick: () => m.close() }, 'Resume'),
        h('button', { class: 'btn', onclick: () => { m.close(); this.app.openSettings(true); } }, 'Settings'),
        h('button', { class: 'btn', onclick: () => { m.close(); this.showHelp(); } }, 'How to play'),
        canSave ? h('button', { class: 'btn blue', onclick: () => { this.save(); const g = this.game; m.close(); this.app.exitToHome(); this.app.syncRealm(g).then(() => this.app.refreshOnline()); } }, 'Save and quit') : h('p', { class: 'muted' }, 'You can save and quit between waves.'),
        h('button', { class: 'btn red', onclick: async () => { m.close(); if (await confirmBox('End this run now? You keep the Renown you have earned.', 'End run', true)) { this.game.gameOver(); } else this.pause(); } }, 'End run'),
      ),
    ], { onClose: () => { this.paused = false; this.last = performance.now(); } });
    this.pauseModal = m;
  }

  showHelp() {
    this.paused = true;
    modal([
      h('h2', {}, 'How to play'),
      h('p', {}, 'Build towers on grass between waves. Tap a tower to upgrade it; at tier 4 choose a specialization, then keep buying Mastery stars.'),
      h('p', {}, 'Tap or click enemies to shoot your own weapon. Aim at heads for headshots. Hold to charge a piercing power shot. Hits build your combo; misses break it. Your own kills earn bonus gold and double points.'),
      h('p', {}, 'Leaking enemies hit the wall first, then the keep. Flyers skip the road and the wall, so build anti-air.'),
      h('p', {}, 'Between waves: repair, upgrade your weapon in the War Room, and start the next wave early for bonus gold.'),
      h('p', { class: 'muted' }, 'Keys: 1–9 towers · Space start wave · U upgrade · S sell · R repair · F speed · P pause · Esc cancel'),
    ], { onClose: () => { this.paused = false; this.last = performance.now(); } });
  }

  onGameOver(summary) {
    audio.play('gameover');
    clearRun();
    this.banner('The keep has fallen', `Wave ${summary.wave} · ${fmt(summary.score)} points`, 'boss', 2600);
    this.fx.shake(0.5, 0.8);
    setTimeout(() => { this.destroy(); this.app.finishRun(summary); }, 2200);
  }

  // ---------------- input ----------------
  bindInput() {
    const cv = this.canvas;
    const world = (e) => { const r = cv.getBoundingClientRect(); return this.renderer.toWorld(e.clientX - r.left, e.clientY - r.top); };
    const tileOf = (w) => ({ x: Math.floor(w.x), y: Math.floor(w.y) });
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); this.cancel(); });
    cv.addEventListener('pointermove', (e) => {
      const w = world(e); const t = tileOf(w);
      this.renderer.hover = t;
      if (this.placing && e.pointerType === 'mouse') this.renderer.ghost = { type: this.placing, x: t.x, y: t.y, ok: this.game.canBuild(this.placing, t.x, t.y) };
      if (this.charge) { this.charge.x = w.x; this.charge.y = w.y; }
    });
    cv.addEventListener('pointerleave', () => { this.renderer.hover = null; if (this.placing && !this.touchGhost) this.renderer.ghost = null; });
    cv.addEventListener('pointerdown', (e) => {
      audio.init();
      if (e.button === 2) return;
      cv.setPointerCapture?.(e.pointerId);
      const w = world(e);
      const g = this.game;
      const lt = this.renderer.pickLoot(w.x, w.y);
      if (lt) { this.collectLoot(lt, 2); this.lootTap = true; return; }
      if (!this.placing && g.phase === 'wave' && g.weapon.ammo >= 1 && g.pickEnemy(w.x, w.y)) {
        this.charge = { x: w.x, y: w.y, t0: performance.now() };
      }
    });
    cv.addEventListener('pointerup', (e) => {
      if (e.button === 2) return;
      const w = world(e); const t = tileOf(w);
      const g = this.game;
      if (this.lootTap) { this.lootTap = false; return; }
      if (this.charge) {
        const amt = this.chargeAmount();
        this.charge = null;
        if (g.heroFire(w.x, w.y, amt)) { this.tutorial?.event('shot'); return; }
      }
      if (this.placing) {
        const touch = e.pointerType !== 'mouse';
        const ok = g.canBuild(this.placing, t.x, t.y);
        if (touch && (!this.touchGhost || this.touchGhost.x !== t.x || this.touchGhost.y !== t.y)) {
          // First tap previews, second tap on the same tile builds.
          this.touchGhost = t;
          this.renderer.ghost = { type: this.placing, x: t.x, y: t.y, ok };
          if (ok) this.fx.text(t.x + 0.5, t.y - 0.1, 'Tap again to build', { color: '#ffffff', size: 0.24, life: 1.1, vy: -0.4 });
          return;
        }
        if (ok) {
          const built = g.build(this.placing, t.x, t.y);
          this.touchGhost = null;
          if (built && (touch || !e.shiftKey && !this.p.settings.stickyBuild)) { this.placing = null; this.renderer.ghost = null; }
          if (built && !this.placing) { this.selected = built; this.panelMode = 'tower'; this.renderPanel(); }
          this.refreshAfford();
        } else {
          audio.play('error');
          if (g.gold < g.buildCost(this.placing)) this.fx.text(t.x + 0.5, t.y, 'Not enough gold', { color: '#ffb3a8', size: 0.26 });
          else if (!isBuildable(g.map, t.x, t.y, !!TOWERS[this.placing].trap)) this.fx.text(t.x + 0.5, t.y, TOWERS[this.placing].trap ? 'Traps go on the road' : 'Build on grass', { color: '#ffb3a8', size: 0.26 });
        }
        return;
      }
      // Select a tower
      const tower = g.towerAt(t.x, t.y);
      if (tower) { this.selected = tower; this.panelMode = 'tower'; this.renderPanel(); this.tutorial?.event('selectTower'); }
      else if (this.panelMode === 'tower') this.clearSelection();
    });
    cv.addEventListener('pointercancel', () => { this.charge = null; });

    this.onKey = (e) => {
      if (e.target.closest && e.target.closest('input, textarea')) return;
      if (document.querySelector('.modal-back')) return;
      const g = this.game;
      const i = HOTKEYS.indexOf(e.key);
      if (i >= 0 && TOWER_ORDER[i]) { this.selectBuild(TOWER_ORDER[i]); e.preventDefault(); return; }
      switch (e.key.toLowerCase()) {
        case ' ': e.preventDefault(); this.startWave(); break;
        case 'escape': this.cancel(); break;
        case 'p': this.pause(); break;
        case 'f': this.cycleSpeed(); break;
        case 'u': if (this.selected) { if (this.selected.tier === TIER.max - 1) this.renderPanel(); else g.upgrade(this.selected); this.renderPanel(); } break;
        case 's': if (this.selected) { g.sell(this.selected); this.clearSelection(); } break;
        case 'r': if (this.selected) g.repairTower(this.selected); else if (g.canRepair()) { g.repairWall(); g.repairAllTowers(); } this.renderPanel(); break;
        case 'w': this.togglePanel('war'); break;
      }
    };
    window.addEventListener('keydown', this.onKey);
  }

  cancel() {
    if (this.placing) { this.placing = null; this.renderer.ghost = null; this.touchGhost = null; this.refreshAfford(); return; }
    if (this.panelMode) { this.selected = null; this.togglePanel(null); return; }
    this.pause();
  }
}

function waveSubtitle(plan) {
  const items = previewTypes(plan).filter((i) => !i.key.startsWith('boss:')).sort((a, b) => b.count - a.count).slice(0, 3);
  const names = items.map((i) => ENEMIES[i.key].name + 's');
  const fresh = plan.gear > 0 && (plan.wave - 1) % 10 === 0;
  const gear = fresh ? ` · New arms: ${['', 'swords', 'axes', 'halberds', 'flails', 'runeblades'][Math.min(5, plan.gear)]}!` : '';
  return names.join(', ') + gear;
}
