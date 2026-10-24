// Touch-first controls for the first-person wall view (Hero Mode), in the style of mobile shooters:
//  - a big FIRE button under your right thumb: tap to shoot, hold to keep firing as fast as the weapon reloads;
//  - aim assist: the foe nearest the crosshair is locked (gold ring, gold crosshair), and FIRE always hits the lock;
//  - auto-look: when you leave the view alone for a moment, it glides to keep the closest threat in sight;
//  - flick to look, with a little momentum; taps on the field still shoot whatever is near the tap;
//  - hit markers and a kill flash on the crosshair, a short buzz on phones, and an ammo/reload ring on the button;
//  - castle arts that need a target land where you aim (on the locked foe) with a single tap.
import { h } from './dom.js';
import { buzz } from './haptics.js';
import { saveProfile } from '../meta/profile.js';

export class HeroControls {
  constructor(session) {
    this.s = session;
    this.lastLook = 0;
    this.vel = { yaw: 0, pitch: 0 };
    this.lock = null;
    this.holding = false; this.lastShot = 0;
    const st = session.p.settings;
    if (st.heroAutoLook === undefined) st.heroAutoLook = true;
    this.fire = h('button', { class: 'hero-fire', type: 'button', 'aria-label': 'Fire at the locked foe (hold to keep firing)' },
      h('span', { class: 'hf-ring', 'aria-hidden': 'true' }), h('b', { 'aria-hidden': 'true' }, '🎯'), h('small', { class: 'hf-ammo' }, ''));
    this.auto = h('button', { class: 'hero-autolook', type: 'button', 'aria-pressed': String(!!st.heroAutoLook), title: 'Auto-look: the view follows the closest threat when you leave it alone' },
      '👁 Auto-look');
    this.auto.addEventListener('click', () => { st.heroAutoLook = !st.heroAutoLook; this.auto.setAttribute('aria-pressed', String(st.heroAutoLook)); saveProfile(session.p); });
    const down = (e) => { e.preventDefault(); e.stopPropagation(); this.fire.setPointerCapture?.(e.pointerId); this.holding = true; this.shoot(true); };
    const up = (e) => { e.preventDefault(); this.holding = false; };
    this.fire.addEventListener('pointerdown', down);
    this.fire.addEventListener('pointerup', up); this.fire.addEventListener('pointercancel', up); this.fire.addEventListener('lostpointercapture', up);
    this.fire.addEventListener('contextmenu', (e) => e.preventDefault());
    // first runs: two little coach bubbles, gone after your first shot and first look
    const fresh = (session.p.hero?.runs || 0) < 2;
    this.coachFire = fresh ? h('div', { class: 'hero-coach hc-fire', 'aria-hidden': 'true' }, 'Hold to fire') : null;
    this.coachLook = fresh ? h('div', { class: 'hero-coach hc-look', 'aria-hidden': 'true' }, '👆 Drag anywhere to look') : null;
    session.wrap.append(this.fire, this.auto, ...[this.coachFire, this.coachLook].filter(Boolean));
    this.sync(false);
  }

  get on() { const r = this.s.renderer; return !!(r && r.isWall) && !this.s.game.over && !this.s.tutorial; }
  sync(show) { this.fire.hidden = !show; this.auto.hidden = !show; if (this.coachFire) this.coachFire.hidden = !show || this.s.game.phase !== 'wave'; if (this.coachLook) this.coachLook.hidden = !show; }

  // The foe to aim at: whoever is nearest the crosshair (generously), otherwise the closest threat in view.
  pick() {
    const r = this.s.renderer, g = this.s.game;
    if (!r.pickScreen) return null;
    const near = r.pickScreen(g, r.w / 2, r.h / 2, Math.max(70, Math.min(r.w, r.h) * 0.28));
    if (near) return near;
    return this.threat(true);
  }
  // The foe closest to the castle (optionally only those on screen).
  threat(onScreen) {
    const r = this.s.renderer, g = this.s.game, c = g.map.castle;
    let best = null, bd = Infinity;
    if (onScreen) r.matrices();
    for (const e of g.enemies) {
      if (e.dead || e.burrowT > 0 || !g.isVisible(e)) continue;
      if (onScreen) { const p = r.proj(e.x, e.y, 0.3); if (!p || p.x < 0 || p.x > r.w || p.y < 0 || p.y > r.h) continue; }
      const d = Math.hypot(e.x - c.x, e.y - c.y) - (e.boss ? 2 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  aimPoint(e) { return { x: e.x, y: e.y - e.size * 0.35 - (e.air ? 0.35 : 0) }; }

  // Fire at the lock. `press` = a fresh press (gives feedback even when nothing can fire).
  shoot(press = false) {
    const g = this.s.game;
    if (g.phase !== 'wave') { if (press) this.flash('nope'); return false; }
    const t = this.lock && !this.lock.dead ? this.lock : this.pick();
    if (!t) { if (press) this.flash('nope'); return false; }
    const a = this.aimPoint(t);
    const ok = g.heroFire(a.x, a.y, 0, 0.7);
    if (ok && this.coachFire) { this.coachFire.remove(); this.coachFire = null; }
    if (ok) { this.lastShot = performance.now(); this.s.tutorial?.event('shot'); buzz('tap', 60); }
    else if (press) this.flash('nope');
    return ok;
  }

  // Where an aimed castle art should land: on the locked foe, else on the ground under the crosshair.
  artPoint() {
    const r = this.s.renderer, g = this.s.game;
    const t = this.lock && !this.lock.dead ? this.lock : this.pick();
    if (t) return { x: t.x, y: t.y };
    const w = r.toWorld(r.w / 2, r.h * 0.55);
    if (w.x < 0 || w.y < 0 || w.x > g.map.cols || w.y > g.map.rows) return null;
    return w;
  }

  flash(kind) {
    const el = this.s.wrap; el.classList.remove('hm-hit', 'hm-kill', 'hm-crit', 'hm-nope'); void el.offsetWidth; el.classList.add('hm-' + kind);
    clearTimeout(this._ft); this._ft = setTimeout(() => el.classList.remove('hm-' + kind), kind === 'kill' ? 260 : 160);
  }
  hit(crit) { this.flash(crit ? 'crit' : 'hit'); }
  kill() { this.flash('kill'); buzz('hit', 120); }

  // A drag on the field turned the view: remember when, and its speed for a little glide afterwards.
  looked(dyaw, dpitch, dtMs) {
    this.lastLook = performance.now();
    if (this.coachLook) { this.coachLook.remove(); this.coachLook = null; }
    const k = 1000 / Math.max(8, dtMs);
    this.vel.yaw = dyaw * k; this.vel.pitch = dpitch * k;
  }
  release() { this.lastLook = performance.now(); }
  grab() { this.vel.yaw = 0; this.vel.pitch = 0; this.lastLook = performance.now(); }

  tick(dt) {
    const show = this.on, r = this.s.renderer, g = this.s.game;
    this.sync(show);
    if (!show) { if (r) r.heroLock = null; this.s.wrap.classList.remove('locked'); return; }
    // momentum after a flick
    if (Math.abs(this.vel.yaw) > 0.01 || Math.abs(this.vel.pitch) > 0.01) {
      r.lookBy(this.vel.yaw * dt, this.vel.pitch * dt, g);
      const f = Math.exp(-dt * 7); this.vel.yaw *= f; this.vel.pitch *= f;
    }
    // aim assist
    this.lock = g.phase === 'wave' ? this.pick() : null;
    r.heroLock = this.lock;
    this.s.wrap.classList.toggle('locked', !!this.lock);
    // keep firing while FIRE is held
    if (this.holding && performance.now() - this.lastShot > 110) this.shoot(false);
    // auto-look: glide towards the closest threat when the player has left the view alone
    const idle = performance.now() - this.lastLook > 1600 && !this.holding && Math.abs(this.vel.yaw) < 0.05;
    if (this.s.p.settings.heroAutoLook && idle && g.phase === 'wave') {
      const t = this.threat(false);
      if (t) {
        const cam = r.camera.position, base = r.wallBase(g), L = r.look || { yaw: 0, pitch: -0.36 };
        let want = Math.atan2(t.x - cam.x, t.y - cam.z) - base;
        want = Math.atan2(Math.sin(want), Math.cos(want));
        const dist = Math.hypot(t.x - cam.x, t.y - cam.z);
        const wantP = -Math.atan2(cam.y - 0.4, Math.max(1, dist)) + 0.1;
        const k = Math.min(1, dt * 1.8);
        const dy = (want - L.yaw) * k, dp = (wantP - L.pitch) * k;
        if (Math.abs(dy) > 0.002 || Math.abs(dp) > 0.002) r.lookBy(dy, dp, g);
      }
    }
    // ammo and reload on the button
    const W = g.weaponStats(), ammo = Math.floor(g.weapon.ammo), max = W.ammo;
    const reload = g.focusT > 0 ? 1 : ammo >= 1 ? 1 : 1 - Math.max(0, g.weapon.reloadT) / Math.max(0.01, W.reload);
    this.fire.style.setProperty('--rl', reload.toFixed(3));
    this.fire.classList.toggle('empty', ammo < 1 && g.focusT <= 0);
    this.fire.classList.toggle('armed', !!this.lock);
    const txt = (g.focusT > 0 ? '∞' : `${ammo}/${max}`) + (g.weapon.id === 'flasks' ? ' ' + ['🔥', '🧪', '❄'][((g.flaskIdx ?? -1) + 1) % 3] : '');   // the next Alchemist's flask
    if (this._ammoTxt !== txt) { this._ammoTxt = txt; this.fire.lastChild.textContent = txt; }
  }

  destroy() { this.fire.remove(); this.auto.remove(); this.coachFire?.remove(); this.coachLook?.remove(); this.s.wrap.classList.remove('locked', 'hm-hit', 'hm-kill', 'hm-crit', 'hm-nope'); if (this.s.renderer) this.s.renderer.heroLock = null; }
}
