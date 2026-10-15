// A running game: loop, HUD, dock, panels, input, and engine→FX/audio wiring.
import { Game } from '../game/engine.js';
import { Renderer, drawIcon } from '../game/render.js';
import { FX, KILL_FX } from '../game/fx.js';
import { audio } from '../game/audio.js';
import { currentTheme } from '../meta/events.js';
import { TOWERS, TOWER_ORDER, TROOPS, TROOP_ORDER, GARRISON, ENEMIES, BOSSES, BOSS_DESC, BOONS, ARMORY, WEAPONS, GAME, WEATHER, COMBO, TIER, BIOMES, THREATS, ABILITIES, ART_KEYS, PLOTS, MASTERY_PERKS, PERK_STARS } from '../data/balance.js';
import { previewTypes, biomeFor } from '../game/waves.js';
import * as eco from '../game/economy.js';
import { isBuildable, T } from '../game/maps.js';
import { h, fmt, clockText, toast, modal, confirmBox, bar, kbd } from './dom.js';
import { MODES, SPRINT, GAUNTLET } from '../game/modes.js';
import { MAPS } from '../game/maps.js';
import { saveRun, clearRun, checkAchievements, saveProfile, clanPerkLevel, checkpointRun } from '../meta/profile.js';
import { fillText } from '../meta/quests.js';
import { Tutorial } from './tutorial.js';

const BOON_BY_ID = Object.fromEntries(BOONS.map((b) => [b.id, b]));
const HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', '[', ']', ';', "'", ',', '.'];   // one per tower in TOWER_ORDER
const AUTO_DELAY = 4;
const TARGET_MODES = [['first', 'First'], ['last', 'Last'], ['strong', 'Strong'], ['close', 'Close']];

const WEATHER_ICON = { sandstorm: '🌪', blizzard: '❄', meteors: '☄', stealth: '👁' };

export class PlaySession {
  constructor(app, opts) {
    this.app = app;
    this.p = app.profile;
    this.opts = opts;
    this.view = document.getElementById('game-view');
    this.canvas = document.getElementById('board');
    this.wrap = document.getElementById('board-wrap');
    this.speed = app.profile.settings.rememberSpeed ? Math.max(1, Math.min(4, app.profile.settings.speed || 1)) : 1;
    this.paused = false;
    this.placing = null;
    this.selected = null;
    this.panelMode = null; // 'tower' | 'war' | 'plot' | 'garrison' | null
    this.iconCache = {};
    this.selPlot = null;
    this.aiming = null;    // castle ability waiting for a target tap
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
    this.game.wallClockBuild = true; // the break between waves runs on the clock, not on game speed (see Game.tickBuild)
    this.renderer = new Renderer(this.canvas);
    this.renderer.cosmetics = { castle: this.p.equip.castle, trail: this.p.equip.trail, towerSkin: this.p.equip.skin, hero: this.p.equip.hero };
    this.renderer.theme = currentTheme(this.p);
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
    audio.init(); audio.startMusic(this.game.biome.id); this.moodT = 0;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
    if (!this.opts.save) this.save();
    if (this.opts.tutorial) this.tutorial = new Tutorial(this);
    if (this.game.special && !this.opts.save) setTimeout(() => this.modeIntro(), 1900);
    this.banner(this.game.special ? MODES[this.game.mode].name : `Wave ${this.game.wave}`, this.game.special && !this.opts.save ? MODES[this.game.mode].short : this.opts.save ? 'Welcome back, commander' : this.game.march ? `March on ${this.game.march.name}: its kills count double for the Rally` : this.game.start > 1 ? 'Your head start is ready: choose your boons' : this.game.biome.name, '', this.game.march ? 2600 : 1800);
    if (this.game.boonOffer) setTimeout(() => this.showBoons(), 1200);
    // One-time announcement for players who have not met the Garrison yet.
    if (!this.opts.tutorial && !this.p.seenGarrisonNews && !this.p.seenGarrison) {
      setTimeout(() => {
        if (!this.alive || this.p.seenGarrison) return;
        this.p.seenGarrisonNews = true; saveProfile(this.p);
        const body = h('div', { onclick: () => { if (this.alive && this.panelMode !== 'garrison') this.togglePanel('garrison'); } }, h('b', {}, '⚔ New: The Garrison'), h('div', { class: 'muted' }, 'Train troops in your keep and send them out to hunt. Tap here or press G.'));
        toast(body, { ms: 12000, key: 'garnews', icon: '⚔' });
      }, 3500);
    }
    this.onVis = () => { if (document.hidden) { if (!this.paused) this.pause(true); this.save(); } };
    document.addEventListener('visibilitychange', this.onVis);
  }

  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.dockRo?.disconnect();
    document.documentElement.style.removeProperty('--toast-bottom');
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

  // The first moments of Gauntlet, Last Stand and Sprint: what is different here, in a line or two.
  modeIntro() {
    if (!this.alive) return;
    const g = this.game;
    const line = g.mode === 'laststand' ? 'Everything is free and fully mastered. Tap a tower, then tap plots to raise it; open the Garrison to fill your troops. Press Begin when ready.'
      : g.mode === 'gauntlet' ? 'Fell the boss on wave 10 to move on to a new map with a gold grant. Your towers stay behind.'
      : `Clear ${SPRINT.waves} waves as fast as you can. Call waves early to save time.`;
    toast(h('div', {}, h('b', {}, `${MODES[g.mode].icon} ${MODES[g.mode].name}`), h('div', { class: 'muted' }, line)), { ms: 9000, key: 'modeintro', icon: MODES[g.mode].icon });
  }

  // Pay order and event progress for the waves held so far (see checkpointRun).
  checkpoint() {
    try {
      const g = this.game;
      g.stats.credited = g.stats.credited || {};
      const r = checkpointRun(this.p, g.summary(), g.stats.credited);
      for (const q of r.quests) toast(`📜 Order complete: ${fillText(q)} · +${q.reward} Renown`, { key: 'order' + q.id, ms: 3500 });
      for (const x of r.event?.gained || []) toast(`🎁 Event reward: ${x.title ? 'Title ' + x.title : x.cosmetic ? 'a new look' : ''} +${x.renown} Renown`, { key: 'evr' + x.at, ms: 3500 });
    } catch (err) { console.error(err); }
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
      // The break between waves counts real seconds, whatever the game speed.
      g.tickBuild(dt);
    }
    this.fx.update(dt);
    this.moodT = (this.moodT || 0) - dt;
    if (this.moodT <= 0) { this.moodT = 0.3; this.updateMood(); }
    if (this.charge) this.renderer.charge = { x: this.charge.x, y: this.charge.y, amount: this.chargeAmount() };
    else this.renderer.charge = null;
    this.renderer.selected = this.selected;
    this.renderer.draw(g, this.fx, dt, { placing: this.placing });
    this.updateHud();
    this.tutorial?.tick(dt);
  }

  // Tell the music how hot the fight is: calm while building, drums and strings as the field fills, brass for bosses.
  updateMood() {
    const g = this.game;
    let alive = 0, boss = false;
    for (const e of g.enemies) if (!e.dead) { alive++; if (e.boss) boss = true; }
    const out = g.garrison.units.reduce((a, u) => a + (u.state === 'out' ? 1 : 0), 0);
    const danger = 1 - Math.min(g.castle.hp / g.castle.maxHp, 0.4 + 0.6 * (g.wall.hp / Math.max(1, g.wall.maxHp)));
    const fight = g.phase === 'wave' && !g.over;
    audio.setMood({ phase: fight ? 'wave' : 'build', intensity: fight ? Math.min(1, alive / (7 + g.wave * 0.5) + (boss ? 0.3 : 0) + out * 0.01) : 0, boss: fight && boss, danger: fight ? Math.max(0, danger) : 0, biome: g.biome.id });
    audio.weather(fight && g.hazard.active > 0 ? g.hazard.kind : null);
  }

  chargeAmount() {
    if (!this.charge) return 0;
    const held = (performance.now() - this.charge.t0) / 1000;
    return held < 0.18 ? 0 : Math.min(1, (held - 0.18) / (COMBO.chargeTime * this.game.bonus.chargeTime));
  }

  // ---------------- HUD ----------------
  buildHud() {
    const hud = document.getElementById('hud');
    this.el = {};
    const e = this.el;
    e.wave = h('b'); e.biome = h('span');
    e.castleBar = bar(1, 'moss'); e.wallBar = bar(1, 'gold');
    e.gold = h('span'); e.score = h('span'); e.clock = h('span');
    e.speed = h('span', {}, '1×');
    e.speedBtn = h('button', { class: 'btn small', title: 'Game speed (F)', onclick: () => this.cycleSpeed() }, e.speed, kbd('F'));
    hud.replaceChildren(
      h('button', { class: 'btn small ghost', 'aria-label': 'Pause menu', title: 'Pause (P)', onclick: () => this.pause() }, '❚❚', kbd('P')),
      h('div', { class: 'hud-wave' }, e.wave, e.biome),
      h('div', { class: 'hud-bars' }, h('span', {}, 'Keep'), e.castleBar, h('span', {}, 'Wall'), e.wallBar),
      e.goldBox = h('div', { class: 'hud-stat gold', title: 'Gold' }, '⛁ ', e.gold),
      e.clockBox = h('div', { class: 'hud-stat clock', title: 'Time on the clock', hidden: !this.game.special }, h('span', { class: 'lbl' }, 'TIME'), e.clock),
      h('div', { class: 'hud-stat', title: 'Score' }, h('span', { class: 'lbl' }, 'SCORE'), e.score),
      h('div', { class: 'hud-right' }, this.app.muteButton('ghost'), h('button', { class: 'btn small ghost keys-btn', title: 'Controls (H or ?)', onclick: () => this.showHelp() }, '⌨ Keys', kbd('?')), e.speedBtn),
    );
  }

  buildOverlay() {
    const ov = document.getElementById('board-overlay');
    const e = this.el;
    e.next = h('div', { class: 'next-chip' });
    e.ammo = h('div', { class: 'ammo', 'aria-label': 'Ammo' });
    e.combo = h('div', { class: 'combo dead' }, '×1.0');
    e.hazard = h('div', { class: 'hazard-chip', hidden: true });
    e.abil = {};
    const abBar = h('div', { class: 'abil-bar' + (this.game.loadout.length > 4 ? ' many' : ''), role: 'toolbar', 'aria-label': 'Castle abilities' },
      this.game.loadout.map((id) => {
        const A = ABILITIES[id], key = this.game.abilityKey(id);
        const b = h('button', { class: 'abil', title: `${A.name} (${key}) — ${A.desc}`, 'aria-label': `${A.name}. ${A.desc}`, onclick: (ev) => { ev.stopPropagation(); this.triggerAbility(id); } },
          h('span', { class: 'ic' }, A.icon), h('span', { class: 'nm' }, A.name), h('span', { class: 'key' }, key), h('i', { class: 'cd' }), h('i', { class: 'on' }));
        e.abil[id] = b;
        return b;
      }));
    ov.replaceChildren(e.next, h('div', { class: 'hero-hud' }, e.ammo, e.combo), e.hazard, abBar);
    // On portrait phones the next-wave chip lives in the top bar so it never covers the map (or where enemies enter).
    const mq = window.matchMedia('(orientation: portrait) and (max-width: 700px)');
    const place = () => (mq.matches ? document.getElementById('hud') : ov).append(e.next);
    place();
    mq.addEventListener?.('change', place);
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
    e.war = h('button', { class: 'btn small blue', title: 'Repairs & Armory (W)', onclick: () => this.togglePanel('war') }, '⚒ War Room', kbd('W'));
    e.garLbl = h('span', {}, '0/4');
    e.gar = h('button', { class: 'btn small blue gar-btn', title: 'Garrison: train troops and send them out (G)', onclick: () => this.togglePanel('garrison') }, '⚔ Garrison ', e.garLbl, kbd('G'));
    e.start = h('button', { class: 'btn gold start-btn', title: 'Start the wave (Space)', onclick: () => this.startWave() }, h('span', {}, 'Start wave'), h('small', {}), kbd('Space'));
    e.auto = h('button', { class: 'btn small auto-btn', 'aria-pressed': String(!!this.p.settings.autoWave), title: 'Auto-start: the next wave starts by itself a few seconds after each clear (A)', onclick: () => this.toggleAuto(), 'aria-label': 'Auto-start waves' }, '⏩', h('span', { class: 'lbl' }, ' Auto'), kbd('A'));
    dock.replaceChildren(e.towerBar, h('div', { class: 'dock-actions' }, e.gar, e.war, e.auto, e.start));
    // Notices live at the bottom of the screen, above the dock, so they never sit over the top of the map where foes enter.
    const syncToasts = () => {
      const r = dock.getBoundingClientRect();
      document.documentElement.style.setProperty('--toast-bottom', (r.top > window.innerHeight / 2 ? window.innerHeight - r.top : 0) + 'px');
    };
    syncToasts();
    this.dockRo?.disconnect();
    if (typeof ResizeObserver !== 'undefined') { this.dockRo = new ResizeObserver(syncToasts); this.dockRo.observe(dock); }
  }

  set(key, val, fn) { if (this.cache[key] !== val) { this.cache[key] = val; fn(val); } }

  updateHud() {
    const g = this.game, e = this.el, c = this.cache;
    this.set('wave', g.wave + '|' + g.stage, (v) => { e.wave.textContent = g.mode === 'sprint' ? `Wave ${Math.min(g.wave, SPRINT.waves)} / ${SPRINT.waves}` : g.mode === 'gauntlet' ? `Stage ${g.stage} · Wave ${g.wave}` : 'Wave ' + g.wave; });
    this.set('biome', (g.march ? g.march.name : g.mode === 'gauntlet' ? MAPS[g.mapId].name : g.biome.name) + (g.mode === 'daily' ? ' · Daily' : g.march ? ' · March' : g.special ? ' · ' + MODES[g.mode].name : ''), (v) => { e.biome.textContent = v; });
    if (g.special) {
      this.set('clock', Math.floor(g.clock), (v) => { e.clock.textContent = clockText(v); });
      const locked = g.locked();
      this.set('lsLock', g.mode + '|' + locked + '|' + g.freeSetup(), () => {
        e.goldBox.hidden = g.mode === 'laststand';
        e.towerBar.hidden = locked; e.war.hidden = g.mode === 'laststand'; e.auto.hidden = g.mode === 'laststand';
        e.start.hidden = locked;
        if (g.mode === 'laststand' && this.panelMode && (locked || this.panelMode === 'war')) this.softRenderPanel();
      });
    }
    this.set('castle', Math.ceil(g.castle.hp) + '/' + g.castle.maxHp, () => { e.castleBar.firstChild.style.width = (100 * g.castle.hp / g.castle.maxHp) + '%'; e.castleBar.title = `Keep ${Math.ceil(g.castle.hp)} / ${Math.round(g.castle.maxHp)}`; });
    this.set('wall', Math.ceil(g.wall.hp) + '/' + g.wall.maxHp, () => { e.wallBar.firstChild.style.width = (100 * g.wall.hp / g.wall.maxHp) + '%'; e.wallBar.title = `Wall ${Math.ceil(g.wall.hp)} / ${Math.round(g.wall.maxHp)}`; });
    this.set('gold', Math.floor(g.gold), (v) => { e.gold.textContent = fmt(v); this.refreshAfford(); });
    this.set('score', g.score, (v) => { e.score.textContent = fmt(v); });
    this.set('speed', this.speed, (v) => { e.speed.textContent = v + '×'; });
    // Start button
    const label = g.phase === 'build' ? (g.boonOffer ? 'Choose a boon' : g.freeSetup() ? 'Begin Last Stand' : 'Start wave') : `Wave ${g.wave}`;
    const sub = g.phase === 'build'
      ? (Number.isFinite(g.buildTimer) ? `${Math.ceil(g.buildTimer)}s · +${fmt(this.earlyBonus())} early` : g.freeSetup() ? `${g.towers.length} towers · ${g.troopSlotsUsed()} troops` : 'Ready when you are')
      : `${g.enemies.length + g.spawnQueue.length} left`;
    this.set('startLabel', label + '|' + sub + '|' + g.phase, () => {
      e.start.querySelector('span').textContent = label; e.start.querySelector('small').textContent = sub;
      e.start.disabled = g.phase !== 'build' || !!g.boonOffer;
    });
    this.set('phase', g.phase, () => { e.war.disabled = false; this.renderNext(); if (this.panelMode) this.softRenderPanel(); });
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
    for (const [id, b] of Object.entries(e.abil)) {
      const a = g.abilities[id], A = ABILITIES[id];
      const frac = a.cd > 0 ? a.cd / (a.max || A.cd) : 0;
      const act = g.abilityActive(id);
      const st = (g.phase === 'wave' ? (frac ? 'cd' : 'ready') : 'idle') + (this.aiming === id ? '-aim' : '');
      this.set('ab_' + id, st + '|' + Math.round(frac * 40) + '|' + Math.round(act * 20), () => {
        b.classList.toggle('active', act > 0);
        b.querySelector('.on').style.width = (act * 100) + '%';
        b.classList.toggle('ready', st.startsWith('ready'));
        b.classList.toggle('aiming', this.aiming === id);
        b.classList.toggle('idle', g.phase !== 'wave');
        b.querySelector('.cd').style.height = (frac * 100) + '%';
        b.disabled = g.phase !== 'wave';
      });
    }
    const hz = g.hazard.active > 0 && g.phase === 'wave' ? g.hazard.kind : '';
    const hl = hz ? Math.ceil(g.hazard.active) : 0;
    this.set('hazard', hz + '|' + hl, () => {
      e.hazard.hidden = !hz;
      const W = hz && WEATHER.text[hz];
      e.hazard.className = 'hazard-chip ' + hz;
      e.hazard.replaceChildren(...(W ? [h('b', {}, `${WEATHER_ICON[hz]} ${W[0]} · ${hl}s`), h('small', {}, W[1])] : []));
    });
    {
      const G = g.garrison, used = g.troopSlotsUsed(), max = g.troopSlotsMax();
      const idle = !G.units.length && !G.queue.length && g.canTrain('footman') && !this.p.seenGarrison;
      this.set('gar', used + '/' + max + '|' + Math.floor(G.valor) + '|' + (G.muster >= g.musterNeed() ? 1 : 0) + '|' + (idle ? 1 : 0), () => {
        e.garLbl.textContent = `${used}/${max}` + (G.valor >= 1 ? ` · ⚜${Math.floor(G.valor)}` : '');
        e.gar.classList.toggle('pulse', idle);
        e.gar.classList.toggle('full', G.muster >= g.musterNeed());
      });
    }
    // Never rebuild the panel while a button in it is being pressed or hovered mid-click: the click would be lost.
    // :active is unreliable on touch screens, so a finger-down flag (set in bindInput) is what really guards it.
    const panelEl = document.getElementById('panel');
    const panelBusy = !panelEl.hidden && (performance.now() < (this.panelPressUntil || 0) || panelEl.matches(':active'));
    if (this.panelMode && !panelBusy && performance.now() - (c.panelT || 0) > 250) {
      const key = [Math.floor(g.gold), g.phase, this.selected?.tier, this.selected?.mastery, Math.round(this.selected?.hp || 0), Math.round(g.wall.hp), Math.round(g.castle.hp), this.selected?.kills, g.repairKits, this.panelMode === 'garrison' ? this.garSig() : ''].join('|');
      c.panelT = performance.now();
      this.set('panelKey', key, () => this.renderPanel());
    }
  }

  // Exactly what calling the wave now would pay, Keep upgrades and Gold Rush included.
  earlyBonus() {
    const g = this.game;
    return Math.round(g.earlyCallValue() * g.goldMult());
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
      c.textContent = !known ? '🔒 Keep' : !unlocked ? `Wave ${TOWERS[id].unlockWave}` : g.freeSetup() ? 'Free' : fmt(cost);
      b.hidden = !known;   // towers you have not bought in The Keep stay out of the bar: less to look at
      if (unlocked && known && !g.special && !b.dataset.seen && g.wave === TOWERS[id].unlockWave && g.wave > 1) { b.classList.add('new'); b.dataset.seen = '1'; }
      if (g.wave > TOWERS[id].unlockWave + 2) b.classList.remove('new');
    }
    // Only tease the next two towers still waiting on a wave; the rest appear when they get close.
    const waiting = Object.keys(this.el.tbtns).filter((id) => !this.el.tbtns[id].hidden && !g.isTowerUnlocked(id)).sort((a, b) => TOWERS[a].unlockWave - TOWERS[b].unlockWave);
    waiting.slice(2).forEach((id) => { this.el.tbtns[id].hidden = true; });
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
      const info = boss ? BOSS_DESC[it.key.slice(5)] : def.desc;
      kids.push(h('button', { class: 'ico', title: `${def.name}: ${info || ''}`, 'aria-label': `${def.name}. ${info || ''}`, onclick: () => toast(h('div', { class: 'foe-intro' }, (() => { const c = h('canvas'); drawIcon(c, 'enemy', it.key, { def, size: 36, gear: plan.gear }); return c; })(), h('div', {}, h('b', {}, def.name), h('div', { class: 'muted' }, info || ''))), { ms: 4500, key: 'foeinfo' }) }, cv, boss ? '' : '×' + it.count));
    }
    if (plan.boss) kids.push(h('span', { class: 'warn' }, 'BOSS'));
    if (plan.threat) {
      const T = THREATS[plan.threat];
      kids.splice(1, 0, h('span', { class: 'threat', title: T.tip }, `${T.icon} ${T.name}`));
      kids.push(h('span', { class: 'tip' }, T.tip));
    }
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
    const g = this.game, v = Math.round(l.value * mult * (1 + g.bonus.lootBonus));
    g.gold += v; g.stats.goldEarned += v; g.stats.peakGold = Math.max(g.stats.peakGold, g.gold); if (l.kind === 'gem') g.stats.gems = (g.stats.gems || 0) + 1;
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
        audio.play('boom'); if (kind === 'meteor') audio.play('whistle');
        fx.flash(x, y, splash || 0.6, kind === 'meteor' ? '#ff7a3d' : '#ffe2a8');
        fx.burst(x, y, kind === 'meteor' ? 18 : 10, { color: ['#ffb347', '#ffdf8a', '#8a8a8a'], speed: 3, life: 0.5, size: 0.09, gravity: 3 });
        if (kind === 'boulder' || kind === 'meteor') fx.shake(0.12, 0.2);
      } else if (kind === 'flak') fx.burst(x, y, 5, { color: ['#ffb347', '#fff'], speed: 2, life: 0.3, size: 0.06, gravity: 0 });
      else if (kind === 'orb') fx.burst(x, y, 5, { color: ['#c79bff', '#fff'], speed: 1.6, life: 0.35, size: 0.06, gravity: 0 });
    });
    g.on('zap', ({ points, color }) => fx.zap(points, color));
    g.on('pulse', ({ x, y, r, tower }) => {
      if (tower && tower.type === 'voidwell') { fx.ring(x, y, r, '#c9a8ff', 0.5, 0.12); fx.ring(x, y, r * 0.5, '#7a4fd0', 0.4, 0.1); audio.play('orb'); } else { fx.ring(x, y, r, '#bfefff', 0.5, 0.1); audio.play('frost'); }
    });
    g.on('hit', ({ enemy, dmg, crit, hero, headshot }) => {
      if (headshot) { fx.text(enemy.x, enemy.y - 0.9, 'HEADSHOT', { color: '#f2b33d', size: 0.3, bold: true }); audio.play('headshot'); this.hitStop = 0.05; }
      const show = dmgMode === 'all' || (dmgMode === 'hero' && (hero || crit));
      if (show) fx.text(enemy.x + (Math.random() - 0.5) * 0.3, enemy.y - 0.5, fmt(dmg) + (crit ? '!' : ''), { color: crit ? '#ffd25e' : hero ? '#ffffff' : '#ffdcd6', size: crit ? 0.46 : 0.28, bold: crit, life: crit ? 1.1 : undefined });
      if (hero) { audio.play('heroHit', { combo: g.combo }); fx.burst(enemy.x, enemy.y - 0.3, 4, { color: ['#fff', '#f2b33d'], speed: 2, life: 0.25, size: 0.05, gravity: 0 }); }
    });
    g.on('kill', ({ enemy, gold, hero }) => {
      this.renderer.addCorpse(enemy);
      const bounty = Math.max(1, gold || 1);
      if (enemy.boss) for (let i = 0; i < 6; i++) this.renderer.addLoot(enemy.x, enemy.y, bounty * 0.5, i % 3 ? 'coin' : 'gem');
      else if (enemy.def?.steal) { for (let i = 0; i < 5; i++) this.renderer.addLoot(enemy.x, enemy.y, bounty * 0.4, i % 2 ? 'coin' : 'gem'); fx.text(enemy.x, enemy.y - 0.7, 'Thief caught!', { color: '#ffd666', size: 0.3, bold: true }); }
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
    g.on('smiteHit', ({ x, y, big }) => {
      audio.play('zap');
      fx.zap([{ x: x + (Math.random() - 0.5) * 0.6, y: y - 6 }, { x: x + (Math.random() - 0.5) * 0.4, y: y - 3 }, { x, y }], '#fff3a8');
      fx.flash(x, y, big ? 1.3 : 0.7, 'rgba(255,245,170,0.6)', 0.18);
      fx.burst(x, y, big ? 14 : 6, { color: ['#fff3a8', '#ffffff', '#9fd8ff'], speed: 3, life: 0.4, gravity: 2, size: 0.07 });
      if (big) fx.shake(0.15, 0.25);
    });
    g.on('ability', ({ id, x, y, r, ox, oy, ang, arc, range }) => {
      const say = (txt, col = '#ffd666') => fx.text(g.map.castle.x, g.map.castle.y - 1.4, txt, { color: col, size: 0.34, life: 1.3 });
      if (id === 'grapeshot') {
        audio.play('cannon'); fx.shake(0.2, 0.3);
        for (let i = 0; i < 38; i++) { const a = ang + (Math.random() * 2 - 1) * arc, d = 1 + Math.random() * range; fx.burst(ox + Math.cos(a) * d, oy + Math.sin(a) * d, 1, { color: ['#ffd25e', '#e0632f', '#8a8a8a'], speed: 0.8, life: 0.45, gravity: 0, size: 0.09 }); }
        fx.flash(ox + Math.cos(ang) * 1.5, oy + Math.sin(ang) * 1.5, 1.6, 'rgba(255,200,90,0.5)', 0.2);
      } else if (id === 'mend') {
        audio.play('repair'); say('Field Repairs!', '#a8e6a1');
        for (const t of g.towers) fx.ring(t.cx, t.cy, 0.6, 'rgba(140,230,150,0.9)', 0.6, 0.07);
      } else if (id === 'caltrops' || id === 'plague') {
        audio.play(id === 'plague' ? 'frost' : 'arrow'); fx.ring(x, y, r, id === 'plague' ? 'rgba(160,235,100,0.9)' : 'rgba(230,220,200,0.9)', 0.6, 0.08);
      } else if (id === 'smite') { say('Smite!'); fx.shake(0.2, 0.35);
      } else if (id === 'tithe') { audio.play('coin'); say('Royal Tithe! Kills pay more', '#ffd666');
      } else if (id === 'aegis') { audio.play('boon'); say('Aegis!', '#9fd8ff'); fx.ring(g.map.castle.x, g.map.castle.y, 3, 'rgba(160,215,255,0.95)', 0.8, 0.14); fx.flash(g.map.castle.x, g.map.castle.y, 3, 'rgba(160,215,255,0.35)', 0.5);
      } else if (id === 'focus') { audio.play('boon'); say("Hunter's Focus!", '#ffb3a8');
      } else if (id === 'storm') { audio.play('boss'); say('Thunderstorm!', '#cfe8ff'); fx.shake(0.15, 0.4);
      } else if (id === 'stasis') { audio.play('frost'); say('Time Stop!', '#e6d7ff'); fx.flash(g.map.castle.x, g.map.castle.y, 16, 'rgba(210,190,255,0.28)', 0.6); fx.ring(g.map.castle.x, g.map.castle.y, 10, 'rgba(210,190,255,0.9)', 0.9, 0.12);
      } else if (id === 'meteor') { audio.play('boss'); say('Meteor incoming!', '#ffb36b');
      } else if (id === 'volley') {
        audio.play('volley');
        fx.ring(x, y, r, 'rgba(255,214,102,0.9)', 0.5, 0.06);
      } else if (id === 'oil') {
        audio.play('oil'); fx.shake(0.18, 0.4);
        fx.flash(x, y, r, 'rgba(255,140,40,0.55)', 0.35);
        fx.ring(x, y, r, 'rgba(255,170,60,0.95)', 0.6, 0.1);
        for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, d = Math.random() * r; fx.burst(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, 2, { color: ['#3a2a1a', '#e0632f', '#ffb347'], speed: 1.2, life: 0.8, gravity: -1.5, size: 0.09 }); }
      } else if (id === 'nova') {
        audio.play('zap'); fx.shake(0.2, 0.5);
        for (const rr of [3, 6, 9, 12]) fx.ring(x, y, rr, 'rgba(160,225,255,0.9)', 0.9, 0.12);
        fx.flash(x, y, 14, 'rgba(190,235,255,0.35)', 0.5);
      } else if (id === 'horn') {
        audio.play('boon'); fx.ring(x, y, 2.5, 'rgba(255,214,102,0.95)', 0.7, 0.1);
        fx.text(x, y - 1.3, 'War Horn!', { color: '#ffd666', size: 0.34, life: 1.2 });
        for (const t of g.towers) fx.ring(t.cx, t.cy, 0.7, 'rgba(255,214,102,0.8)', 0.5, 0.06);
      }
    });
    g.on('volleyHit', ({ x, y, r, meteor }) => {
      if (meteor) {
        audio.play('boom'); fx.shake(0.5, 0.6); fx.flash(x, y, r * 1.4, 'rgba(255,170,70,0.6)', 0.4); fx.ring(x, y, r, 'rgba(255,140,40,0.95)', 0.6, 0.14);
        for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2, d = Math.random() * r; fx.burst(x + Math.cos(a) * d, y + Math.sin(a) * d, 1, { color: ['#3a2a1a', '#e0632f', '#ffb347'], speed: 2, life: 0.8, gravity: 2, size: 0.1 }); }
        return;
      }
      audio.play('arrow');
      for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r; fx.burst(x + Math.cos(a) * d, y + Math.sin(a) * d, 1, { color: ['#f1e4c3', '#8a5a32'], speed: 0.6, life: 0.3, gravity: 6, size: 0.06 }); }
      fx.ring(x, y, r * 0.9, 'rgba(255,255,255,0.5)', 0.25, 0.04);
    });
    g.on('claim', ({ x, y }) => {
      audio.play('claim');
      fx.burst(x + 0.5, y + 0.5, 16, { color: ['#d8ceb6', '#a69d8b', '#7d7466'], speed: 1.8, life: 0.6, gravity: 3, size: 0.08 });
      fx.ring(x + 0.5, y + 0.5, 0.6, '#ffd666', 0.5, 0.06);
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
      this.introduceFoes(g.plan);
      this.tutorial?.event('waveStart');
    });
    g.on('waveClear', ({ wave, gold, mint, interest, flawless, boss }) => {
      this.checkpoint();
      setTimeout(() => this.app.syncRealm(g), 300);
      audio.play('clear');
      const bits = [`+${fmt(gold)} gold`];
      if (mint) bits.push(`${fmt(mint)} from mints`);
      if (interest) bits.push(`${fmt(interest)} interest`);
      this.banner(flawless ? 'Flawless!' : `Wave ${wave} cleared`, bits.join(' · '), 'clear', 1600);
      if (!g.march && biomeFor(wave + 1) !== biomeFor(wave)) setTimeout(() => this.banner(biomeFor(wave + 1).name, 'The land changes around you', '', 2200), 1700);
      this.liveAchievements();
      this.tutorial?.event('waveClear');
    });
    g.on('stageStart', ({ stage, map, grant, plots }) => {
      this.placing = null; this.renderer.ghost = null; this.touchGhost = null; this.selected = null; this.selPlot = null; this.aiming = null; this.renderer.aim = null;
      if (this.panelMode === 'tower' || this.panelMode === 'plot') this.panelMode = null;
      this.cache.panelKey = null;
      this.banner(`Stage ${stage}`, `${MAPS[map].name} · ${fmt(grant)} gold to build with`, 'clear', 3200);
      audio.play('achievement');
      toast(`🗺 New ground: ${MAPS[map].name}. Your towers stay behind; build again with ${fmt(grant)} gold and ${plots} plots open.`, { ms: 6000, key: 'stage' });
      this.refreshAfford(); this.renderNext(); this.save();
    });
    g.on('standBegin', () => {
      this.placing = null; this.renderer.ghost = null; this.touchGhost = null; this.selected = null; this.panelMode = null;
      this.cache.panelKey = null; document.getElementById('panel').hidden = true;
      this.banner('The stand begins', 'Nothing can be built or mended now. Hold as long as you can.', 'boss', 2600);
    });
    g.on('buildPhase', () => { this.autoRepair(); this.applyAuto(); this.save(); this.refreshAfford(); this.renderNext(); });
    g.on('boonOffer', () => setTimeout(() => this.showBoons(), 350));
    g.on('build', ({ tower }) => { audio.play('build'); fx.burst(tower.cx, tower.cy, 10, { color: ['#d8c7a8', '#a99a7c'], speed: 1.6, life: 0.5, gravity: 2, size: 0.09 }); this.tutorial?.event('build'); });
    g.on('upgrade', ({ tower }) => { audio.play('upgrade'); fx.ring(tower.cx, tower.cy - 0.2, 0.8, '#f2b33d', 0.5); fx.burst(tower.cx, tower.cy - 0.3, 10, { color: ['#f2b33d', '#fff'], speed: 2, life: 0.6, gravity: -1, size: 0.06, shape: 'star' }); });
    g.on('sell', ({ tower, value }) => { audio.play('sell'); fx.text(tower.cx, tower.cy - 0.4, '+' + value, { color: '#f2b33d' }); });
    g.on('repair', () => audio.play('repair'));
    g.on('earlyCall', ({ gold }) => { fx.text(g.map.castle.x, g.map.castle.y - 1.2, `+${gold} early call`, { color: '#f2b33d', size: 0.32 }); audio.play('coin'); });
    g.on('bossSpawn', ({ enemy }) => { fx.ring(enemy.x, enemy.y, 2, '#d9473b', 0.8, 0.12); audio.play('roar'); });
    g.on('troopHit', ({ troop, enemy }) => audio.play(enemy.armor >= 20 || troop.armor >= 20 ? 'clangHit' : 'thud'));
    g.on('stomp', ({ x, y, r }) => { fx.ring(x, y, r, '#c9a27a', 0.6, 0.18); fx.shake(0.3, 0.4); audio.play('stomp'); });
    g.on('blast', ({ x, y, r }) => {
      audio.play('boom'); fx.shake(0.12, 0.2);
      fx.flash(x, y, r, 'rgba(255,170,70,0.55)', 0.2); fx.ring(x, y, r, 'rgba(255,140,40,0.9)', 0.4, 0.1);
      fx.burst(x, y, 16, { color: ['#ffb347', '#e0532f', '#3a2a1a'], speed: 3, life: 0.5, size: 0.09, gravity: 2 });
    });
    g.on('stolen', ({ enemy, gold }) => {
      audio.play('leak');
      fx.text(g.map.castle.x, g.map.castle.y - 1.3, gold ? `A thief stole ${fmt(gold)} gold!` : 'The thief got away empty-handed', { color: '#ffb3a8', size: 0.3, life: 1.4, bold: !!gold });
      this.el.goldBox.classList.remove('hud-flash'); void this.el.goldBox.offsetWidth; this.el.goldBox.classList.add('hud-flash');
    });
    g.on('burrow', ({ enemy }) => { fx.burst(enemy.x, enemy.y, 8, { color: ['#7a5a3a', '#9a7650'], speed: 1.8, life: 0.5, gravity: 5, lift: 2, size: 0.08 }); });
    g.on('surface', ({ enemy }) => { fx.burst(enemy.x, enemy.y, 10, { color: ['#7a5a3a', '#9a7650'], speed: 2.2, life: 0.5, gravity: 5, lift: 2.5, size: 0.08 }); });
    g.on('blink', ({ from, to }) => {
      fx.burst(from.x, from.y - 0.3, 8, { color: ['#a8e4ff', '#ffffff', '#7fa6c9'], speed: 1.4, life: 0.4, gravity: -1, size: 0.07 });
      fx.ring(to.x, to.y - 0.3, 0.5, 'rgba(168,228,255,0.9)', 0.3, 0.06); audio.play('orb');
    });
    g.on('spit', ({ from, x, y, tower }) => {
      fx.burst(x, y - 0.3, 14, { color: ['#a0e65a', '#5f9b34', '#e8ff9a'], speed: 2, life: 0.6, size: 0.08, gravity: 2 });
      fx.text(x, y - 0.9, 'Acid!', { color: '#c8ff7a', size: 0.26 }); audio.play('boom');
    });
    g.on('breath', ({ from, x, y }) => { fx.burst(x, y, 20, { color: ['#ffb347', '#e0532f', '#ffd25e'], speed: 2.5, life: 0.6, size: 0.1, gravity: -1 }); audio.play('boom'); });
    g.on('summon', ({ enemy, raise }) => fx.ring(enemy.x, enemy.y, 1.2, raise ? '#9fe7ff' : '#d9473b', 0.6));
    g.on('heal', ({ enemy }) => { if (Math.random() < 0.3) fx.text(enemy.x, enemy.y - 0.5, '+', { color: '#7fe08a', size: 0.3, life: 0.5 }); });
    g.on('ward', ({ enemy }) => fx.ring(enemy.x, enemy.y, 1.6, '#b79bff', 0.5));
    g.on('sabotage', ({ tower }) => { fx.burst(tower.cx, tower.cy - 0.4, 8, { color: ['#f2b33d', '#fff'], speed: 2, life: 0.4, size: 0.05 }); fx.text(tower.cx, tower.cy - 0.8, 'Sabotaged', { color: '#ffb3a8', size: 0.24 }); });
    g.on('towerRuined', ({ tower }) => { fx.burst(tower.cx, tower.cy, 16, { color: ['#888', '#aaa', '#6b5a4a'], speed: 2.5, life: 0.7, size: 0.1, gravity: 3 }); fx.shake(0.15, 0.25); toast('Towers wrecked. Repair them between waves.', { key: 'wrecked' }); });
    g.on('mark', ({ enemy }) => { audio.play('mark'); fx.text(enemy.x, enemy.y - enemy.size - 0.5, '🎯 Marked', { color: '#ffb3a8', size: 0.22, life: 0.7 }); fx.ring(enemy.x, enemy.y, 0.9, '#ff8a7a', 0.4, 0.05); });
    g.on('hazardWarn', ({ kind }) => { audio.play('weatherWarn'); const W = WEATHER.text[kind]; toast(`${WEATHER_ICON[kind]} ${W[0]} rolling in…`, { key: 'hzwarn', ms: 2400 }); });
    g.on('hazard', ({ kind, on }) => {
      const W = WEATHER.text[kind];
      if (on) {
        audio.play('error'); fx.shake(0.15, 0.4);
        // On a phone the small chip at the top already names the weather and counts it down; a full pennant would hide the battlefield.
        if (!window.matchMedia('(max-width: 700px), (max-height: 520px)').matches) this.banner(`${WEATHER_ICON[kind]} ${W[0]}`, W[1], 'warn', 2400);
      }
      else toast(`${W[0]} has passed`, { key: 'hzend', ms: 1800 });
    });
    g.on('secondWind', () => { this.banner('Second Wind!', 'The keep refuses to fall', 'clear', 2000); fx.shake(0.4, 0.6); });
    g.on('enrage', () => toast('The horde grows desperate and enraged!'));
    g.on('boon', () => { audio.play('boon'); this.refreshAfford(); });
    g.on('troopReady', ({ troop, free }) => {
      const gate = g.castleGate();
      audio.play(free ? 'muster' : 'trained');
      fx.text(gate.x, gate.y - 0.9, (free ? 'Muster! ' : '') + TROOPS[troop.kind].name + ' ready', { color: free ? '#ffe27a' : '#a8e6a1', size: 0.28, life: 1.3 });
      fx.burst(gate.x, gate.y - 0.2, 8, { color: ['#a8e6a1', '#fff'], speed: 1.6, life: 0.5, gravity: -1, size: 0.06 });
      if (this.panelMode === 'garrison') this.softRenderPanel();
    });
    g.on('muster', () => this.pop('Muster! A free recruit'));
    g.on('troopDeploy', ({ troop }) => { if (troop.kind === 'griffon') audio.play('screech'); else if (troop.kind === 'cavalry') audio.play('gallop'); fx.burst(troop.x, troop.y, 4, { color: ['#e8e1c9', '#a99a7c'], speed: 1, life: 0.35, gravity: 1, size: 0.06 }); });
    g.on('troopShoot', () => audio.play('twang'));
    g.on('troopCharge', ({ enemy }) => { fx.text(enemy.x, enemy.y - 0.8, 'CHARGE!', { color: '#ffd666', size: 0.28, bold: true }); fx.shake(0.05, 0.12); audio.play('gallop'); audio.play('clangHit'); });
    g.on('troopHeal', ({ to }) => { audio.play('heal'); fx.text(to.x, to.y - 0.7, '+', { color: '#9be9a0', size: 0.34, life: 0.6 }); fx.ring(to.x, to.y - 0.3, 0.35, 'rgba(160,240,170,0.9)', 0.4, 0.05); });
    g.on('troopDown', ({ troop }) => {
      fx.burst(troop.x, troop.y - 0.2, 12, { color: ['#c9a27a', '#8a8a8a', '#d9473b'], speed: 2, life: 0.6, gravity: 3, size: 0.08 });
      fx.text(troop.x, troop.y - 0.7, TROOPS[troop.kind].name + ' fell', { color: '#ffb3a8', size: 0.26, life: 1.3 });
      audio.play('fall');
      if (troop.rank >= 2) toast(`${GARRISON.rankNames[troop.rank]} ${TROOPS[troop.kind].name} fell after ${troop.kills} kills.`, { key: 'troopdown' });
      if (this.panelMode === 'garrison') this.softRenderPanel();
    });
    g.on('troopRank', ({ troop, rank }) => {
      fx.text(troop.x, troop.y - 0.9, GARRISON.rankNames[rank] + '!', { color: '#f2b33d', size: 0.32, bold: true, life: 1.4 });
      fx.ring(troop.x, troop.y - 0.2, 0.7, '#f2b33d', 0.6, 0.07); audio.play('rank');
    });
    g.on('troopRise', ({ troop }) => { fx.text(troop.x, troop.y - 0.9, 'Immortal Guard!', { color: '#fff3a8', size: 0.3, bold: true }); fx.ring(troop.x, troop.y - 0.2, 0.9, '#fff3a8', 0.7, 0.1); audio.play('boon'); });
    g.on('troopSaved', ({ troop }) => { fx.text(troop.x, troop.y - 0.8, 'Carried to safety', { color: '#a8e6a1', size: 0.26, life: 1.3 }); });
    g.on('troopRetreat', ({ troop }) => fx.text(troop.x, troop.y - 0.8, 'Falling back', { color: '#ffd666', size: 0.24, life: 1 }));
    g.on('foeStrike', ({ troop }) => { audio.play('thud'); fx.burst(troop.x, troop.y - 0.3, 5, { color: ['#fff', '#d9473b'], speed: 1.8, life: 0.3, size: 0.06 }); });
    g.on('cleave', ({ x, y, r }) => { fx.ring(x, y, r, '#c9a27a', 0.4, 0.14); fx.shake(0.1, 0.2); audio.play('stomp'); });
    g.on('gameOver', (summary) => this.onGameOver(summary));
  }

  // The first time you ever meet a kind of foe (or boss), say what it does and how to beat it.
  introduceFoes(plan) {
    const p = this.p, seen = new Set(p.seenFoes || []);
    if (!p.seenFoes) { for (const [k, n] of Object.entries(p.stats.killsByType || {})) if (n > 0) seen.add(k); }
    const fresh = [];
    for (const it of previewTypes(plan)) {
      const boss = it.key.startsWith('boss:'), id = boss ? it.key.slice(5) : it.key;
      if (seen.has(id)) continue;
      seen.add(id);
      const def = boss ? BOSSES.find((b) => b.id === id) : ENEMIES[id];
      const desc = boss ? BOSS_DESC[id] : def?.desc;
      if (def && desc && (boss || id !== 'grunt')) fresh.push({ id, def, boss, desc });
    }
    p.seenFoes = [...seen]; saveProfile(p);
    fresh.slice(0, 2).forEach((f, i) => setTimeout(() => {
      if (!this.alive) return;
      const cv = h('canvas'); drawIcon(cv, 'enemy', f.boss ? 'boss:' + f.id : f.id, { def: f.def, size: 40 });
      toast(h('div', { class: 'foe-intro' }, cv, h('div', {}, h('b', {}, `New foe: ${f.def.name}`), h('div', { class: 'muted' }, f.desc))), { ms: 6000, key: 'foe-' + f.id });
    }, 900 + i * 1600));
  }

  // War Room toggle: patch the wall and keep with whatever gold allows as soon as a wave is cleared.
  autoRepair() {
    const g = this.game;
    if (!this.p.settings.autoRepair || !g.canRepair()) return;
    const before = g.gold;
    if (g.wall.hp < g.wall.maxHp && g.gold >= 1) g.repairWall();
    if (g.castle.hp < g.castle.maxHp && g.gold >= 1) g.repairCastle();
    const spent = before - g.gold;
    if (spent > 0) this.fx.text(g.map.castle.x, g.map.castle.y - 1.6, `Auto-repair −${fmt(spent)}`, { color: '#a8e6a1', size: 0.26, life: 1.2 });
  }

  liveAchievements() {
    const g = this.game, p = this.p;
    if (g.special) return;   // the new modes' waves are not the main game's waves
    // Evaluate with lifetime stats + this run so far, without persisting the merged stats.
    const run = g.summary();
    const merged = { ...p, stats: { ...p.stats } };
    for (const k of ['kills', 'heroKills', 'shots', 'hits', 'headshots', 'bossKills', 'towersBuilt']) merged.stats[k] = (p.stats[k] || 0) + (run[k] || 0);
    merged.stats.maxCombo = Math.max(p.stats.maxCombo, run.maxCombo);
    merged.stats.maxFlawlessStreak = Math.max(p.stats.maxFlawlessStreak || 0, run.maxFlawlessStreak);
    merged.stats.maxMastery = Math.max(p.stats.maxMastery || 0, run.maxMastery);
    merged.stats.killsByType = { ...p.stats.killsByType };
    for (const [k, v] of Object.entries(run.killsByType)) merged.stats.killsByType[k] = (merged.stats.killsByType[k] || 0) + v;
    merged.best = { wave: { ...p.best.wave, [run.map]: Math.max(p.best.wave[run.map] || 0, run.rankWave || run.wave) }, score: p.best.score };
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

  toggleAuto() {
    const st = this.p.settings; st.autoWave = !st.autoWave; saveProfile(this.p);
    this.el.auto.setAttribute('aria-pressed', String(st.autoWave));
    toast(st.autoWave ? `Auto-start on: waves begin ${AUTO_DELAY}s after each clear` : 'Auto-start off', { key: 'auto' });
    if (st.autoWave) this.applyAuto();
  }
  // In auto mode the build countdown shrinks to a few seconds (repairs and boons still happen first).
  applyAuto() {
    const g = this.game;
    if (!this.p.settings.autoWave || g.phase !== 'build' || g.over || this.tutorial) return;
    if (Number.isFinite(g.buildTimer)) g.buildTimer = Math.min(g.buildTimer, AUTO_DELAY);
    else if (g.wave > g.start) g.buildTimer = AUTO_DELAY;
  }
  // 1× → 2× → 3× → 4×. The last choice is remembered for the next run.
  cycleSpeed() {
    this.speed = this.speed >= 4 ? 1 : this.speed + 1;
    const st = this.p.settings; st.speed = this.speed; st.rememberSpeed = true; saveProfile(this.p);
  }

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
    if (this.placing) {
      this.tutorial?.event('select');
      // First time you pick a tower this session, say what it does.
      this.seenTips = this.seenTips || new Set();
      if (!this.seenTips.has(id)) { this.seenTips.add(id); toast(`${TOWERS[id].name}: ${TOWERS[id].desc}`, { ms: 4200, key: 'buildtip' }); }
    }
  }

  clearSelection(closePanel = true) {
    this.selected = null;
    if (closePanel && this.panelMode === 'tower') this.togglePanel(null);
  }

  togglePanel(mode) {
    this.panelMode = this.panelMode === mode ? null : mode;
    if (mode === 'war' || mode === 'garrison') this.selected = null;
    if (mode === 'garrison' && this.panelMode && !this.p.seenGarrison) { this.p.seenGarrison = true; saveProfile(this.p); }
    this.renderPanel();
  }

  // For rebuilds the game triggers itself (not a tap handler): wait out a finger that is mid-press.
  softRenderPanel() {
    const wait = (this.panelPressUntil || 0) - performance.now();
    if (wait > 0) { clearTimeout(this.softT); this.softT = setTimeout(() => this.alive && this.softRenderPanel(), wait + 20); return; }
    this.renderPanel();
  }

  renderPanel() {
    const panel = document.getElementById('panel');
    if (this.panelMode === 'tower' && (!this.selected || !this.game.towers.includes(this.selected))) { this.panelMode = null; this.selected = null; }
    if (!this.panelMode) { panel.hidden = true; return; }
    panel.hidden = false;
    if (this.panelMode === 'plot' && (!this.selPlot || !this.game.isRuin(this.selPlot.x, this.selPlot.y))) { this.panelMode = null; this.selPlot = null; panel.hidden = true; return; }
    const keepScroll = this.panelMode === 'garrison' ? panel.scrollTop : 0;
    panel.replaceChildren(this.panelMode === 'tower' ? this.towerPanel(this.selected) : this.panelMode === 'plot' ? this.plotPanel(this.selPlot) : this.panelMode === 'garrison' ? this.garrisonPanel() : this.warPanel());
    if (keepScroll) panel.scrollTop = keepScroll;
    this.cache.panelKey = null;
  }

  plotPanel(pl) {
    const g = this.game, cost = g.claimCost();
    const open = g.openPlots().length, total = g.map.plots.length;
    return h('div', { class: 'plaque' },
      h('div', { class: 'row' }, h('h3', { style: { margin: 0 } }, 'Ruined foundation'), h('span', { class: 'spacer' }),
        h('button', { class: 'btn small ghost', 'aria-label': 'Close', onclick: () => { this.selPlot = null; this.togglePanel(null); } }, '✕')),
      h('p', { class: 'muted', style: { margin: '.3rem 0 .6rem' } }, `Clear the rubble to raise a tower here. You hold ${open} of ${total} plots; each claim costs more than the last.`),
      h('button', { class: 'btn gold wide', disabled: !g.canClaim(pl.x, pl.y), onclick: () => this.claim(pl) }, 'Claim plot', h('span', { class: 'cost' }, '⛁ ' + fmt(cost))));
  }

  claim(pl) {
    const g = this.game;
    if (!g.claimPlot(pl.x, pl.y)) { audio.play('error'); return; }
    this.selPlot = null; this.togglePanel(null);
    // If a tower was waiting to be placed, drop it straight onto the new plot when affordable.
    if (this.placing && g.canBuild(this.placing, pl.x, pl.y)) {
      const built = g.build(this.placing, pl.x, pl.y);
      if (built) { this.placing = null; this.renderer.ghost = null; this.touchGhost = null; this.selected = built; this.panelMode = 'tower'; this.renderPanel(); }
    }
    this.refreshAfford();
  }

  aimFor(id, x, y) {
    const A = ABILITIES[id], o = this.game.heroOrigin();
    if (A.arc) return { x, y, r: 0.3, cone: { ox: o.x, oy: o.y, arc: A.arc, range: A.range } };
    return { x, y, r: this.game.abilityRadius(id) };
  }

  // Castle abilities: Arrow Rain waits for a tap on the field; Boiling Oil fires at once.
  triggerAbility(id) {
    const g = this.game, A = ABILITIES[id];
    if (!g.abilityReady(id)) {
      if (g.phase !== 'wave') { toast(`${A.icon} ${A.name}: ${A.desc} Works during waves.`, { ms: 4500, key: 'abilinfo' }); return; }
      audio.play('error');
      this.fx.text(g.map.castle.x, g.map.castle.y - 1.2, `${A.name} recharging`, { color: '#ffb3a8', size: 0.26 });
      return;
    }
    if (A.aim) {
      this.aiming = this.aiming === id ? null : id;
      this.placing = null; this.renderer.ghost = null;
      if (this.aiming && this.renderer.hover) this.renderer.aim = this.aimFor(id, this.renderer.hover.x + 0.5, this.renderer.hover.y + 0.5);
      if (!this.aiming) this.renderer.aim = null;
      else this.fx.text(g.map.castle.x, g.map.castle.y - 1.2, A.aimHint || (A.range ? 'Tap a direction to fire' : 'Tap where to use it'), { color: '#ffffff', size: 0.24, life: 1.3 });
      this.refreshAfford();
      return;
    }
    g.useAbility(id);
  }

  towerPanel(t) {
    const g = this.game, def = TOWERS[t.type], s = t.stats || {};
    const close = h('button', { class: 'btn small ghost', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => this.clearSelection() }, '✕', kbd('Esc'));
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
    if (s.soldiers) {
      stat('Soldiers', s.soldiers); stat('Soldier HP', fmt(s.soldierHp));
      stat('Holds foes', `+${Math.round((s.pin || 0) * 100)}% dmg taken`);
    }
    if (s.heatMax) stat('Spin-up', `×${(1 + s.heatMax * (t.heat || 0)).toFixed(1)} of ×${(1 + s.heatMax).toFixed(1)}`);
    if (s.poison) { stat('Poison', `${fmt(s.poison)}/s per stack`); stat('Stacks', `${s.poisonCap} · ${s.poisonTime.toFixed(1)}s`); }
    if (s.pull) stat('Pull', `${s.pull.toFixed(1)} tiles / pulse`);
    if (t.type === 'sanctum') { stat('Heals towers', `${(s.heal * 100).toFixed(1)}% / s`); stat('Heals wall', `${(s.wallHeal * 100).toFixed(2)}% / s`); if (s.ward) stat('Damage taken', `−${Math.round(s.ward * 100)}%`); }
    if (t.type === 'banner') {
      stat('Towers', `+${Math.round((s.auraDmg || 0) * 100)}% dmg, +${Math.round((s.auraRate || 0) * 100)}% rate`);
      stat('Your weapon', `+${Math.round((s.hero || 0) * 100)}% dmg`);
      stat('Radius', (s.aura || 0).toFixed(1));
    }
    stat('Kills', fmt(t.kills)); stat('Dealt', fmt(t.dmg));
    stat('HP', `${Math.ceil(t.hp)}/${Math.round(t.maxHp)}`);
    if (t.high) stat('High ground', '+range');
    if (t.rally) {
      if (t.type === 'barracks') stat('Flagged plot', '+1 soldier, faster respawn');
      else if (t.type === 'banner') stat('Flagged plot', 'wider, stronger aura');
      else stat('Flagged plot', '+20% rate');
    }
    const kids = [
      h('div', { class: 'panel-head' }, h('h3', {}, title), close),
      h('div', { class: 'muted' }, tierTxt, t.ally ? ` · Allied tower from ${t.ally} (${t.allyWaves} waves left)` : ''),
      h('p', { class: 'muted', style: { margin: '.25rem 0 .1rem', fontSize: '.88rem' } }, def.desc),
      h('div', { class: 'stat-grid' }, rows),
    ];
    if (t.tier >= TIER.max && MASTERY_PERKS[t.type]) {
      const stars = t.mastery || 0;
      kids.push(h('div', { class: 'section-label' }, `Mastery perks · ★${stars}`));
      kids.push(h('ul', { class: 'perk-list' }, MASTERY_PERKS[t.type].map((p, i) =>
        h('li', { class: stars >= PERK_STARS[i] ? 'on' : '' }, `${stars >= PERK_STARS[i] ? '★' : '☆'}${PERK_STARS[i]} ${p.name}: ${p.desc}`))));
    }
    if (t.ally) return h('div', { class: 'plaque' }, kids);
    if (t.type === 'barracks') {
      kids.push(h('div', { class: 'section-label' }, 'Rally flag'));
      kids.push(h('div', { class: 'muted' }, 'Tap any road tile in the ring to send your soldiers there. Held foes take extra damage from every tower, so plant the flag where your towers overlap.'));
    }
    if (!def.passive && !def.trap && t.type !== 'barracks') {
      kids.push(h('div', { class: 'section-label' }, 'Targeting'));
      kids.push(h('div', { class: 'seg', role: 'group' }, TARGET_MODES.map(([m, l]) => h('button', { 'aria-pressed': String(t.targetMode === m), onclick: () => { g.setTargeting(t, m); this.renderPanel(); } }, l))));
    }
    if (g.mode === 'laststand') {
      if (g.freeSetup()) {
        kids.push(h('div', { class: 'section-label' }, 'Specialization · free to change before the stand'));
        kids.push(h('div', { class: 'spec-choice' }, Object.entries(def.specs).map(([id, sp]) =>
          h('button', { class: 'btn ' + (t.spec === id ? 'moss' : 'gold'), 'aria-pressed': String(t.spec === id), onclick: () => { g.setSpec(t, id); this.renderPanel(); } }, h('b', {}, sp.name), h('small', {}, sp.desc)))));
        kids.push(h('div', { class: 'row', style: { marginTop: '.5rem' } }, h('span', { class: 'spacer' }),
          h('button', { class: 'btn small red', onclick: () => { g.sell(t); this.clearSelection(); this.refreshAfford(); } }, 'Remove')));
      } else kids.push(h('p', { class: 'muted', style: { margin: '.5rem 0 0' } }, 'Fully mastered. In the stand nothing can be upgraded, mended or sold.'));
      return h('div', { class: 'plaque' }, kids);
    }
    if (t.tier === TIER.max - 1) {
      const cost = g.upgradeCost(t);
      kids.push(h('div', { class: 'section-label' }, `Choose a specialization · ⛁ ${fmt(cost)}`));
      kids.push(h('div', { class: 'spec-choice' }, Object.entries(def.specs).map(([id, sp]) =>
        h('button', { class: 'btn gold', disabled: !g.canSpec(t), onclick: () => { g.chooseSpec(t, id); this.renderPanel(); } }, h('b', {}, sp.name), h('small', {}, sp.desc)))));
    } else {
      const cost = g.upgradeCost(t);
      const lbl = t.tier >= TIER.max ? `Mastery ★${t.mastery + 1}` : `Upgrade to tier ${t.tier + 1}`;
      const pv = this.upgradePreview(t);
      if (pv) kids.push(h('div', { class: 'upg-preview' }, pv.map(([k, a, b]) => h('span', {}, `${k} `, h('b', {}, a), ' → ', h('b', { class: 'up' }, b)))));
      const maxN = t.tier >= TIER.max ? this.maxBuyable(t) : 0;
      kids.push(h('div', { class: 'row', style: { marginTop: '.6rem', flexWrap: 'nowrap' } },
        h('button', { class: 'btn gold wide', disabled: !g.canUpgrade(t), title: 'U', onclick: () => { g.upgrade(t); this.renderPanel(); } }, lbl, h('span', { class: 'cost' }, '⛁ ' + fmt(cost)), kbd('U')),
        t.tier >= TIER.max ? h('button', { class: 'btn gold max-btn', disabled: maxN < 2, title: 'Buy as many Mastery stars as your gold allows (M)', onclick: () => { this.buyMax(t); this.renderPanel(); } }, maxN >= 2 ? `+${maxN}★` : 'Max', kbd('M')) : null));
    }
    const row = h('div', { class: 'row', style: { marginTop: '.5rem' } });
    if (t.hp < t.maxHp) {
      const rc = g.towerRepairCost(t);
      row.append(h('button', { class: 'btn small moss', disabled: !g.canRepair() || g.gold < rc, title: g.canRepair() ? 'Repair (R)' : 'Repairs happen between waves', onclick: () => { g.repairTower(t); this.renderPanel(); } }, `Repair ⛁ ${fmt(rc)}`, kbd('R')));
    }
    row.append(h('span', { class: 'spacer' }));
    const arming = this.sellArm && this.sellArm.t === t && performance.now() < this.sellArm.until;
    row.append(h('button', { class: 'btn small red' + (arming ? ' pulse' : ''), title: 'Sell (S)', onclick: () => this.trySell(t) }, arming ? `Tap again to sell +${fmt(g.sellValue(t))}` : `Sell +${fmt(g.sellValue(t))}`, kbd('S')));
    kids.push(row);
    return h('div', { class: 'plaque' }, kids);
  }

  // What the next upgrade changes, e.g. Damage 46 → 74. Specialization choices describe themselves.
  upgradePreview(t) {
    const g = this.game, s = t.stats || {};
    if (t.tier === TIER.max - 1 || t.ally) return null;
    const next = t.tier >= TIER.max ? { ...t, mastery: (t.mastery || 0) + 1 } : { ...t, tier: t.tier + 1 };
    let n; try { n = g.computeStats(next); } catch { return null; }
    const out = [];
    const add = (k, a, b, f = fmt) => { if (a != null && b != null && Math.abs(b - a) > 1e-6) out.push([k, f(a), f(b)]); };
    add('Damage', s.dmg, n.dmg); add('Beam', s.dps, n.dps); add('Burn', s.burn, n.burn); add('Income', s.income, n.income);
    add('Rate', s.rate, n.rate, (v) => v.toFixed(2)); add('Range', s.range, n.range, (v) => v.toFixed(1));
    if (t.type === 'barracks') add('Soldier HP', s.soldierHp, n.soldierHp);
    if (t.type === 'venom') add('Poison', s.poison, n.poison);
    return out.slice(0, 3);
  }
  // How many Mastery stars the current gold buys, without spending it.
  maxBuyable(t) {
    const g = this.game;
    let gold = g.gold, n = 0, m = t.mastery || 0;
    const disc = Math.min(0.6, g.discount() + g.bonus.masteryDiscount);
    while (n < 50) { const c = eco.masteryCost(t.type, m, disc); if (c > gold) break; gold -= c; m++; n++; }
    return n;
  }
  buyMax(t) {
    const g = this.game;
    let n = 0;
    while (t.tier >= TIER.max && g.canUpgrade(t) && n < 50) { g.upgrade(t); n++; }
    if (n > 1) this.fx.text(t.cx, t.cy - 1, `+${n}★`, { color: '#ffd666', size: 0.36, bold: true });
    return n;
  }
  // Selling a well-built tower takes two taps (or two presses of S), so a stray key can't wipe out a ★10 tower.
  trySell(t) {
    const g = this.game, worth = t.invested >= 250 || t.tier >= TIER.max - 1;
    const armed = this.sellArm && this.sellArm.t === t && performance.now() < this.sellArm.until;
    if (worth && !armed && !(t.fresh && g.phase === 'build')) {
      this.sellArm = { t, until: performance.now() + 2500 };
      this.renderPanel();
      this.fx.text(t.cx, t.cy - 0.9, 'Sell? Tap again', { color: '#ffb3a8', size: 0.26 });
      setTimeout(() => { if (this.sellArm?.t === t) { this.sellArm = null; if (this.selected === t) this.renderPanel(); } }, 2600);
      return false;
    }
    this.sellArm = null;
    g.sell(t); this.clearSelection();
    return true;
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
    if (!g.mod.norepair) kids.push(h('label', { class: 'toggle-row' }, h('input', { type: 'checkbox', checked: !!this.p.settings.autoRepair, onchange: (ev) => { this.p.settings.autoRepair = ev.target.checked; saveProfile(this.p); if (ev.target.checked) { this.autoRepair(); this.renderPanel(); } } }),
      h('span', {}, 'Auto-repair the wall and keep after every wave')));
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

  // ---------------- garrison ----------------
  garSig() {
    const G = this.game.garrison;
    return Math.floor(G.valor) + '/' + Math.floor(G.muster) + '/' + G.units.map((u) => u.kind[0] + u.state[0] + Math.round((u.hp / u.maxHp) * 10) + u.rank).join('') + '/' + G.queue.map((q) => q.kind[0] + Math.floor(q.t * 2)).join('') + '/' + G.stance + G.auto;
  }

  troopIcon(kind, size = 38) {
    const key = kind + size;
    if (!this.iconCache[key]) { const cv = document.createElement('canvas'); drawIcon(cv, 'troop', kind, { size }); this.iconCache[key] = cv.toDataURL(); }
    return h('img', { class: 'gar-ico', src: this.iconCache[key], width: size, height: size, alt: '' });
  }

  deployToggle() {
    const g = this.game;
    if (g.phase !== 'wave') { toast('Troops go out when a wave begins. With Auto on, they march by themselves.', { key: 'gardeploy' }); return; }
    const out = g.garrison.units.some((u) => u.state === 'out');
    if (out) { g.recallAll(); this.fx.text(g.map.castle.x, g.map.castle.y - 1.4, 'Fall back!', { color: '#ffd666', size: 0.3 }); }
    else if (g.deployAll()) { audio.play('rally'); this.fx.text(g.map.castle.x, g.map.castle.y - 1.4, 'Troops, forward!', { color: '#ffd666', size: 0.3 }); }
    this.renderPanel();
  }

  garrisonPanel() {
    const g = this.game, G = g.garrison;
    const close = h('button', { class: 'btn small ghost', 'aria-label': 'Close', onclick: () => this.togglePanel(null) }, '✕');
    const used = g.troopSlotsUsed(), max = g.troopSlotsMax();
    const kids = [h('div', { class: 'panel-head' }, h('h3', {}, 'Garrison'), close)];
    kids.push(h('div', { class: 'stat-grid' },
      h('div', { title: 'Troop slots in use' }, h('span', {}, 'Slots'), h('b', {}, `${used} / ${max}`)),
      h('div', { title: 'Valor is earned from points. Elite troops cost it.' }, h('span', {}, '⚜ Valor'), h('b', {}, Math.floor(G.valor))),
      h('div', {}, h('span', {}, 'In the field'), h('b', {}, G.units.filter((u) => u.state !== 'reserve').length)),
      h('div', {}, h('span', {}, 'In the keep'), h('b', {}, G.units.filter((u) => u.state === 'reserve').length))));
    const need = g.musterNeed();
    kids.push(h('div', { class: 'gar-muster', title: 'Every kill fills the Muster (your own shots count triple). When it fills, a free recruit marches in.' },
      h('div', { class: 'barlabel' }, h('span', {}, G.full ? 'Muster full: free a slot for a recruit' : 'Muster · free recruit'), h('span', {}, `${Math.min(need, Math.floor(G.muster))} / ${need}`)),
      bar(Math.min(1, G.muster / need), 'gold')));
    kids.push(h('div', { class: 'section-label' }, 'Orders'));
    kids.push(h('div', { class: 'seg', role: 'group', 'aria-label': 'Stance' },
      h('button', { 'aria-pressed': String(G.stance === 'hunt'), title: 'Troops seek foes anywhere along the road', onclick: () => { g.setStance('hunt'); this.renderPanel(); } }, '⚔ Hunt'),
      h('button', { 'aria-pressed': String(G.stance === 'guard'), title: 'Troops stay near the castle gate', onclick: () => { g.setStance('guard'); this.renderPanel(); } }, '🛡 Guard')));
    kids.push(h('label', { class: 'toggle-row' }, h('input', { type: 'checkbox', checked: G.auto, onchange: (ev) => { g.setAuto(ev.target.checked); this.renderPanel(); } }),
      h('span', {}, 'Auto: march out each wave, fall back when hurt, return when healed')));
    const out = G.units.some((u) => u.state === 'out');
    const tend = g.tendCost();
    kids.push(h('div', { class: 'row gar-orders' },
      h('button', { class: 'btn small gold', disabled: !G.units.length, onclick: () => this.deployToggle() }, out ? 'Recall all' : 'Deploy all', kbd('D')),
      h('button', { class: 'btn small moss', disabled: tend <= 0 || g.gold < tend, title: 'Mend every wounded troop in the keep right now', onclick: () => { if (g.tendWounds()) audio.play('repair'); this.renderPanel(); } }, tend > 0 ? `Tend wounds ⛁ ${fmt(tend)}` : 'All healthy')));
    // training
    kids.push(h('div', { class: 'section-label' }, 'Train'));
    for (const kind of TROOP_ORDER) {
      const D = TROOPS[kind], c = g.troopCost(kind), why = g.trainBlock(kind);
      const label = why === 'keep' ? '🔒 Keep' : why === 'wave' ? `Wave ${D.unlockWave}` : why === 'slots' ? 'Full' : why === 'queue' ? 'Queue full' : why === 'locked' ? 'Closed'
        : g.freeSetup() ? 'Free' : `⛁ ${fmt(c.gold)}${c.valor ? ` ⚜${c.valor}` : ''}`;
      const poor = why === 'gold' || why === 'valor';
      const stats = D.heal ? `Heals ${Math.round(D.heal * 100)}%` : `${D.ranged ? 'Range ' + D.range : 'Melee'}${D.air ? ' · hits flyers' : ''}`;
      kids.push(h('div', { class: 'gar-row' + (why === 'keep' || why === 'wave' ? ' locked' : '') },
        this.troopIcon(kind),
        h('div', { class: 'gar-info' }, h('b', {}, D.name, D.slots > 1 ? h('small', {}, ` ×${D.slots} slots`) : null), h('small', { title: D.desc }, `${D.role} · ${stats} · ${D.train}s`)),
        h('button', { class: 'btn small ' + (poor ? 'ghost' : 'gold'), disabled: (!!why && !poor) || why === 'locked', title: D.desc, onclick: () => { if (g.trainTroop(kind)) audio.play('build'); else audio.play('error'); this.renderPanel(); } }, label)));
    }
    if (G.queue.length) {
      kids.push(h('div', { class: 'section-label' }, 'Training'));
      G.queue.forEach((q, i) => {
        const D = TROOPS[q.kind], f = i === 0 ? Math.min(1, q.t / D.train) : 0;
        kids.push(h('div', { class: 'gar-row' }, this.troopIcon(q.kind, 28),
          h('div', { class: 'gar-info' }, h('b', {}, D.name), bar(f, 'moss')),
          h('button', { class: 'btn small ghost', 'aria-label': 'Cancel and refund', title: 'Cancel and refund', onclick: () => { g.cancelTrain(i); this.renderPanel(); } }, '✕')));
      });
    }
    // roster
    if (G.units.length) {
      kids.push(h('div', { class: 'section-label' }, `Roster (${G.units.length})`));
      const order = [...G.units].sort((a, b) => b.rank - a.rank || b.kills - a.kills);
      for (const u of order) {
        const D = TROOPS[u.kind], f = u.hp / u.maxHp;
        const state = u.state === 'out' ? 'In the field' : u.state === 'back' ? 'Falling back' : f < 0.999 ? 'Healing' : 'Ready';
        const stars = '★'.repeat(u.rank) || '';
        kids.push(h('div', { class: 'gar-row' },
          this.troopIcon(u.kind, 30),
          h('div', { class: 'gar-info' },
            h('b', {}, D.name, stars ? h('span', { class: 'rankpips', title: GARRISON.rankNames[u.rank] }, ' ' + stars) : null, h('small', {}, ` ${u.kills} kills`)),
            bar(f, f > 0.5 ? 'moss' : f > 0.25 ? 'gold' : ''), h('small', {}, state)),
          h('div', { class: 'gar-btns' },
            u.state === 'out'
              ? h('button', { class: 'btn small', title: 'Call this troop back to the keep to heal', onclick: () => { g.recallTroop(u); this.renderPanel(); } }, 'Recall')
              : h('button', { class: 'btn small', disabled: g.phase !== 'wave', title: 'Send this troop out', onclick: () => { g.deployTroop(u); this.renderPanel(); } }, 'Send'),
            u.state === 'reserve' && !g.locked() ? h('button', { class: 'btn small ghost', 'aria-label': 'Dismiss', title: `Dismiss: frees the slot${u.paid ? ` and returns ⛁ ${Math.floor(u.paid * GARRISON.dismissRefund)}` : ''}`, onclick: async () => { if (u.rank >= 1 && !(await confirmBox(`Dismiss this ${GARRISON.rankNames[u.rank]} ${D.name}?`, 'Dismiss', true))) return; g.dismissTroop(u); this.renderPanel(); } }, '🗑') : null)));
      }
    }
    return h('div', { class: 'plaque gar-panel' }, kids);
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
    this.paused = true; audio.setPaused(true);
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
    ], { onClose: () => { this.paused = false; audio.setPaused(false); this.last = performance.now(); } });
    this.pauseModal = m;
  }

  showHelp() {
    this.paused = true; audio.setPaused(true);
    const K = (k, d) => [h('span', { class: 'kbd' }, k), h('span', {}, d)];
    const abil = this.game.loadout.flatMap((id) => K(this.game.abilityKey(id), `${ABILITIES[id].name}: ${ABILITIES[id].desc}`));
    modal([
      h('h2', {}, 'How to play'),
      h('p', {}, 'Towers stand on stone plots beside the road. You start with a few; tap rubble to claim more, each claim dearer than the last. With limited plots, upgrades and the right mix win: at tier 4 choose a specialization, then keep buying Mastery stars.'),
      h('p', {}, 'Each wave may bring a threat (' + Object.values(THREATS).map((t) => t.name).join(', ') + '). The next-wave banner shows it with a counter tip: adapt your towers. Tap any foe in the banner to see what it does.'),
      h('p', {}, 'Click or tap enemies to shoot your own weapon. Aim at heads for headshots. Hold to charge a piercing power shot. Hits build your combo; misses break it. Your own kills earn bonus gold and double points.'),
      h('p', {}, 'The Garrison trains troops with gold and time. Elite troops also cost Valor, which you earn from points (combos and your own kills pay most). Troops fight where you send them, level up as they win, and are gone for good if they fall. Pull the wounded back, or keep a Cleric close.'),
      h('p', {}, 'Leaking enemies hit the wall first, then the keep. Flyers skip the road and the wall, so build anti-air. Between waves: repair, upgrade your weapon in the War Room, and start early for bonus gold.'),
      h('h3', {}, 'Keyboard'),
      h('div', { class: 'keys-table' },
        ...abil,
        ...K('1–9', `Pick a tower to build (${HOTKEYS.slice(9).join(' ')} for the rest)`),
        ...K('Space', 'Start the next wave early for bonus gold'),
        ...K('U', 'Upgrade the selected tower'), ...K('S', 'Sell the selected tower'), ...K('R', 'Repair the selected tower, or the wall and towers'),
        ...K('W', 'Open the War Room (repairs and weapon upgrades)'),
        ...K('G', 'Open the Garrison: train troops, send them out, set their orders'), ...K('D', 'Send the whole garrison out, or call it home'),
        ...K('A', 'Auto-start waves on or off'), ...K('M', 'Buy as many Mastery stars as you can afford'),
        ...K('F', 'Cycle game speed (1× to 4×)'), ...K('N', 'Mute or unmute music and sounds'), ...K('P', 'Pause'), ...K('Esc', 'Cancel / close a panel'), ...K('H or ?', 'Show this list')),
    ], { onClose: () => { this.paused = false; audio.setPaused(false); this.last = performance.now(); } });
  }

  onGameOver(summary) {
    clearRun();
    if (summary.victory) {
      audio.play('achievement');
      this.banner('Sprint complete!', `${clockText(summary.clock)} on the clock`, 'clear', 2600);
    } else {
      audio.play('gameover');
      this.banner('The keep has fallen', summary.mode === 'laststand' ? `Held for ${clockText(summary.clock)} · ${fmt(summary.kills)} foes` : summary.mode === 'gauntlet' ? `Stage ${summary.stage} · wave ${summary.wave} · ${fmt(summary.score)} points` : `Wave ${summary.wave} · ${fmt(summary.score)} points`, 'boss', 2600);
    }
    this.fx.shake(0.5, 0.8);
    setTimeout(() => { this.destroy(); this.app.finishRun(summary); }, 2200);
  }

  // ---------------- input ----------------
  bindInput() {
    const cv = this.canvas;
    const world = (e) => { const r = cv.getBoundingClientRect(); return this.renderer.toWorld(e.clientX - r.left, e.clientY - r.top); };
    const tileOf = (w) => ({ x: Math.floor(w.x), y: Math.floor(w.y) });
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); this.cancel(); });
    // A panel rebuilt between finger-down and finger-up eats the tap (the button vanishes under the finger).
    // Hold rebuilds off while any press on the panel is in flight, and for a moment after it lifts.
    const panelEl = document.getElementById('panel');
    this.panelPressUntil = 0;
    panelEl.addEventListener('pointerdown', () => { this.panelPressUntil = performance.now() + 2500; }, true);
    const lift = () => { this.panelPressUntil = performance.now() + 350; };
    panelEl.addEventListener('pointerup', lift, true);
    panelEl.addEventListener('pointercancel', lift, true);
    panelEl.addEventListener('pointerleave', lift, true);
    cv.addEventListener('pointermove', (e) => {
      const w = world(e); const t = tileOf(w);
      this.renderer.hover = t;
      if (this.placing && e.pointerType === 'mouse') this.renderer.ghost = { type: this.placing, x: t.x, y: t.y, ok: this.game.canBuild(this.placing, t.x, t.y) };
      if (this.charge) { this.charge.x = w.x; this.charge.y = w.y; }
      if (this.aiming) this.renderer.aim = this.aimFor(this.aiming, w.x, w.y);
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
      if (this.aiming) { this.aimTap = true; return; }
      if (!this.placing && g.phase === 'wave' && (g.weapon.ammo >= 1 || g.focusT > 0) && g.pickEnemy(w.x, w.y, e.pointerType === 'mouse' ? undefined : 1.3)) {
        this.charge = { x: w.x, y: w.y, t0: performance.now() };
      }
    });
    cv.addEventListener('pointerup', (e) => {
      if (e.button === 2) return;
      const w = world(e); const t = tileOf(w);
      const g = this.game;
      if (this.lootTap) { this.lootTap = false; return; }
      if (this.aimTap || this.aiming) {
        this.aimTap = false;
        const id = this.aiming;
        this.aiming = null; this.renderer.aim = null;
        if (id && g.useAbility(id, w.x, w.y)) this.tutorial?.event('ability');
        return;
      }
      if (this.charge) {
        const amt = this.chargeAmount();
        this.charge = null;
        if (g.heroFire(w.x, w.y, amt)) { this.tutorial?.event('shot'); return; }
      }
      if (this.placing) {
        const touch = e.pointerType !== 'mouse';
        const ok = g.canBuild(this.placing, t.x, t.y);
        if (touch && !g.freeSetup() && (!this.touchGhost || this.touchGhost.x !== t.x || this.touchGhost.y !== t.y)) {
          // First tap previews, second tap on the same tile builds.
          this.touchGhost = t;
          this.renderer.ghost = { type: this.placing, x: t.x, y: t.y, ok };
          if (ok) this.fx.text(t.x + 0.5, t.y - 0.1, 'Tap again to build', { color: '#ffffff', size: 0.24, life: 1.1, vy: -0.4 });
          return;
        }
        if (ok) {
          const built = g.build(this.placing, t.x, t.y);
          this.touchGhost = null;
          if (built && g.freeSetup()) this.fx.text(built.cx, built.cy - 0.8, 'Free · full mastery', { color: '#ffd666', size: 0.22, life: 0.9 });
          if (built && !g.freeSetup() && (touch || !e.shiftKey && !this.p.settings.stickyBuild)) { this.placing = null; this.renderer.ghost = null; }
          if (built && !this.placing) { this.selected = built; this.panelMode = 'tower'; this.renderPanel(); }
          this.refreshAfford();
        } else {
          audio.play('error');
          const trap = !!TOWERS[this.placing].trap;
          if (!trap && g.isRuin(t.x, t.y) && !g.towerAt(t.x, t.y)) { this.selPlot = t; this.panelMode = 'plot'; this.renderPanel(); this.fx.text(t.x + 0.5, t.y, 'Claim this ruin first', { color: '#ffd666', size: 0.26 }); }
          else if (!isBuildable(g.map, t.x, t.y, trap)) this.fx.text(t.x + 0.5, t.y, trap ? 'Traps go on the road' : 'Build on a stone plot', { color: '#ffb3a8', size: 0.26 });
          else if (trap && g.trapCount() >= PLOTS.trapCap) this.fx.text(t.x + 0.5, t.y, `Only ${PLOTS.trapCap} traps at a time`, { color: '#ffb3a8', size: 0.26 });
          else if (g.gold < g.buildCost(this.placing)) this.fx.text(t.x + 0.5, t.y, 'Not enough gold', { color: '#ffb3a8', size: 0.26 });
        }
        return;
      }
      // Move a selected barracks' rally flag by tapping the road.
      if (this.selected && this.selected.type === 'barracks' && !g.towerAt(t.x, t.y)) {
        if (g.moveRally(this.selected, t.x, t.y)) { this.fx.text(t.x + 0.5, t.y, 'Rally here', { color: '#ffd666', size: 0.26 }); audio.play('claim'); return; }
      }
      // Mid-wave, a fingertip near a foe means "shoot it", never "open that tower": the tap is
      // swallowed (and fires at the nearest foe if the bow is ready) so the panel doesn't pop up.
      // Fire pits sit on the road, right where the foes are, so they get a wider berth than towers.
      const hit = g.phase === 'wave' && e.pointerType !== 'mouse' ? g.towerAtPoint(w.x, w.y) : null;
      if (hit) {
        const near = g.pickEnemy(w.x, w.y, TOWERS[hit.type].trap ? 2.6 : 1.5);
        if (near) { const ne = near.enemy; if (!g.heroFire(ne.x, ne.y - ne.size * 0.35 - (ne.air ? 0.35 : 0), 0)) audio.play('error'); return; }
      }
      // Select a tower
      const tower = g.towerAtPoint(w.x, w.y);
      if (tower) { this.selected = tower; this.panelMode = 'tower'; this.renderPanel(); this.tutorial?.event('selectTower'); }
      else if (g.isRuin(t.x, t.y)) { this.selected = null; this.selPlot = t; this.panelMode = 'plot'; this.renderPanel(); }
      else if (this.panelMode === 'tower' || this.panelMode === 'plot') { this.selPlot = null; this.clearSelection(); if (this.panelMode === 'plot') this.togglePanel(null); }
    });
    cv.addEventListener('pointercancel', () => { this.charge = null; });

    this.onKey = (e) => {
      if (e.target.closest && e.target.closest('input, textarea')) return;
      if (document.querySelector('.modal-back')) return;
      const g = this.game;
      const slot = ART_KEYS.indexOf(e.key.toUpperCase());
      if (slot >= 0 && !e.ctrlKey && !e.metaKey && !e.altKey && g.loadout[slot]) { this.triggerAbility(g.loadout[slot]); e.preventDefault(); return; }
      const i = HOTKEYS.indexOf(e.key);
      if (i >= 0 && TOWER_ORDER[i]) { this.selectBuild(TOWER_ORDER[i]); e.preventDefault(); return; }
      switch (e.key.toLowerCase()) {
        case ' ': e.preventDefault(); this.startWave(); break;
        case 'escape': this.cancel(); break;
        case 'p': this.pause(); break;
        case 'h': case '?': this.showHelp(); break;
        case 'n': this.app.toggleMute(); break;
        case 'f': this.cycleSpeed(); break;
        case 'u': if (this.selected && g.mode !== 'laststand') { if (this.selected.tier === TIER.max - 1) this.renderPanel(); else g.upgrade(this.selected); this.renderPanel(); } break;
        case 's': if (this.selected && g.mode !== 'laststand') this.trySell(this.selected); break;
        case 'r': if (this.selected) g.repairTower(this.selected); else if (g.canRepair()) { g.repairWall(); g.repairAllTowers(); } this.renderPanel(); break;
        case 'w': if (g.mode !== 'laststand') this.togglePanel('war'); break;
        case 'g': this.togglePanel('garrison'); break;
        case 'd': this.deployToggle(); break;
        case 'a': if (g.mode !== 'laststand') this.toggleAuto(); break;
        case 'm': if (this.selected && this.selected.tier >= TIER.max) { this.buyMax(this.selected); this.renderPanel(); } break;
      }
    };
    window.addEventListener('keydown', this.onKey);
  }

  cancel() {
    if (this.aiming) { this.aiming = null; this.renderer.aim = null; return; }
    if (this.placing) { this.placing = null; this.renderer.ghost = null; this.touchGhost = null; this.refreshAfford(); return; }
    if (this.panelMode) { this.selected = null; this.togglePanel(null); return; }
    this.pause();
  }
}

function waveSubtitle(plan) {
  if (plan.threat) { const T = THREATS[plan.threat]; return `${T.icon} ${T.name} · ${T.tip}`; }
  const items = previewTypes(plan).filter((i) => !i.key.startsWith('boss:')).sort((a, b) => b.count - a.count).slice(0, 3);
  const names = items.map((i) => ENEMIES[i.key].name + 's');
  const fresh = plan.gear > 0 && (plan.wave - 1) % 10 === 0;
  const gear = fresh ? ` · New arms: ${['', 'swords', 'axes', 'halberds', 'flails', 'runeblades'][Math.min(5, plan.gear)]}!` : '';
  return names.join(', ') + gear;
}
