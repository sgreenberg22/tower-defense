// Visual effects: particles, floating text, rings, zaps, screen shake. Pure presentation.

export class FX {
  constructor() {
    this.parts = [];
    this.texts = [];
    this.rings = [];
    this.zaps = [];
    this.flashes = [];
    this.shakeT = 0; this.shakeMag = 0;
    this.cap = 420;
    this.reduced = false;
    this.shakeOn = true;
  }
  setQuality(q) { this.cap = q === 'low' ? 140 : 420; }

  burst(x, y, n, opt = {}) {
    if (this.reduced) n = Math.ceil(n / 2);
    for (let i = 0; i < n && this.parts.length < this.cap; i++) {
      const a = (opt.angle ?? Math.random() * Math.PI * 2) + (opt.spread ? (Math.random() - 0.5) * opt.spread : 0);
      const sp = (opt.speed || 2) * (0.4 + Math.random() * 0.8);
      this.parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.lift || 0), g: opt.gravity ?? 4,
        life: (opt.life || 0.6) * (0.6 + Math.random() * 0.6), t: 0, size: (opt.size || 0.08) * (0.6 + Math.random() * 0.8),
        color: Array.isArray(opt.color) ? opt.color[Math.floor(Math.random() * opt.color.length)] : opt.color || '#fff',
        shape: opt.shape || 'circle', spin: Math.random() * 6, drag: opt.drag ?? 1.5,
      });
    }
  }
  text(x, y, str, opt = {}) {
    if (this.texts.length > 60) this.texts.shift();
    this.texts.push({ x, y, str, color: opt.color || '#fff', size: opt.size || 0.32, t: 0, life: opt.life || 0.9, vy: opt.vy ?? -1.1, bold: !!opt.bold });
  }
  ring(x, y, r, color, life = 0.4, width = 0.08) { this.rings.push({ x, y, r, color, life, t: 0, width }); }
  zap(points, color = '#8ef2ff') { this.zaps.push({ points, color, t: 0, life: 0.16, seed: Math.random() * 100 }); }
  flash(x, y, r, color, life = 0.12) { this.flashes.push({ x, y, r, color, t: 0, life }); }
  shake(mag, t = 0.25) { if (!this.shakeOn || this.reduced) return; this.shakeMag = Math.max(this.shakeMag, mag); this.shakeT = Math.max(this.shakeT, t); }

  update(dt) {
    for (const p of this.parts) {
      p.t += dt; p.vy += p.g * dt; p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt * 0.5;
      p.x += p.vx * dt; p.y += p.vy * dt; p.spin += dt * 6;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const t of this.texts) { t.t += dt; t.y += t.vy * dt; t.vy *= 1 - 2 * dt; }
    this.texts = this.texts.filter((t) => t.t < t.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    for (const z of this.zaps) z.t += dt;
    this.zaps = this.zaps.filter((z) => z.t < z.life);
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < f.life);
    if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeMag = 0; }
  }

  shakeOffset() {
    if (this.shakeT <= 0) return [0, 0];
    const m = this.shakeMag * Math.min(1, this.shakeT * 4);
    return [(Math.random() - 0.5) * m, (Math.random() - 0.5) * m];
  }

  clear() { this.parts = []; this.texts = []; this.rings = []; this.zaps = []; this.flashes = []; this.shakeT = 0; }
}

// Kill effect presets (cosmetic).
export const KILL_FX = {
  poof: (fx, x, y, color) => fx.burst(x, y, 8, { color: ['#ffffff', '#e8e8ef', color], speed: 1.8, life: 0.45, size: 0.09, gravity: -0.5 }),
  confetti: (fx, x, y) => fx.burst(x, y, 14, { color: ['#f2b33d', '#3d7bd9', '#d9473b', '#7fb24a', '#c79bff'], speed: 3, life: 0.9, size: 0.07, shape: 'rect', gravity: 5, lift: 2 }),
  sparkle: (fx, x, y) => fx.burst(x, y, 10, { color: ['#fff6c2', '#f5c542', '#ffffff'], speed: 2.4, life: 0.7, size: 0.06, shape: 'star', gravity: -1 }),
  coins: (fx, x, y) => fx.burst(x, y, 12, { color: ['#f2b33d', '#ffe08a', '#c98a1b'], speed: 2.8, life: 0.9, size: 0.08, gravity: 7, lift: 3 }),
  embers: (fx, x, y) => fx.burst(x, y, 14, { color: ['#ffb347', '#e0532f', '#ffd25e'], speed: 2, life: 0.8, size: 0.07, gravity: -2.2 }),
  petals: (fx, x, y) => fx.burst(x, y, 14, { color: ['#ffc2d9', '#ff8fb8', '#ffffff'], speed: 1.8, life: 1.1, size: 0.08, shape: 'rect', gravity: 1.6, lift: 1 }),
  shatter: (fx, x, y) => fx.burst(x, y, 14, { color: ['#e8f9ff', '#9fdcf5', '#ffffff'], speed: 3, life: 0.6, size: 0.08, shape: 'square', gravity: 5, lift: 1 }),
  void: (fx, x, y) => fx.burst(x, y, 12, { color: ['#2b1b4a', '#7a4fd8', '#d8b8ff'], speed: 1.6, life: 0.8, size: 0.09, gravity: -1.2 }),
  spooky: (fx, x, y) => fx.burst(x, y, 14, { color: ['#2b1b3a', '#ff8a1f', '#6b3f9e', '#9dff6b'], speed: 2.4, life: 0.8, size: 0.08, shape: 'star', gravity: -0.8 }),
  leaves: (fx, x, y) => fx.burst(x, y, 14, { color: ['#e0782b', '#b8431f', '#f2b33d', '#8a5a2b'], speed: 2, life: 1.1, size: 0.08, shape: 'rect', gravity: 1.5, lift: 1.2 }),
  snow: (fx, x, y) => fx.burst(x, y, 14, { color: ['#ffffff', '#d7ecff', '#bfe0ff'], speed: 1.8, life: 1, size: 0.07, shape: 'star', gravity: 1 }),
  hearts: (fx, x, y) => fx.burst(x, y, 12, { color: ['#ff7aa8', '#ff3d7f', '#ffd1dc'], speed: 2.2, life: 0.9, size: 0.09, shape: 'star', gravity: -1.4 }),
  bloom: (fx, x, y) => fx.burst(x, y, 14, { color: ['#fff0a8', '#ffc2d9', '#9ce37d'], speed: 2, life: 0.9, size: 0.08, shape: 'rect', gravity: 1.2, lift: 1 }),
  fireworks: (fx, x, y) => fx.burst(x, y, 22, { color: ['#ff5e5e', '#ffd25e', '#5ecbff', '#7fe08a', '#c55eff'], speed: 4, life: 0.7, size: 0.07, shape: 'star', gravity: 2 }),
  lightning: (fx, x, y) => fx.burst(x, y, 12, { color: ['#ffffff', '#9fd8ff', '#ffe96b'], speed: 4.5, life: 0.35, size: 0.06, shape: 'square', gravity: 0 }),
  smoke: (fx, x, y) => fx.burst(x, y, 10, { color: ['#555', '#888', '#bbb'], speed: 1.2, life: 1, size: 0.14, gravity: -1.2 }),
  feathers: (fx, x, y) => fx.burst(x, y, 12, { color: ['#ffffff', '#e8dcc8', '#c98a4b'], speed: 1.6, life: 1.3, size: 0.1, shape: 'rect', gravity: 0.8, lift: 1.4, drag: 2.5 }),
  runes: (fx, x, y) => fx.burst(x, y, 12, { color: ['#9fe7ff', '#c79bff', '#ffffff'], speed: 1.4, life: 0.9, size: 0.09, shape: 'square', gravity: -1.6 }),
  spores: (fx, x, y) => fx.burst(x, y, 16, { color: ['#c8e07a', '#8fbf5a', '#f2f0c0'], speed: 1.2, life: 1.2, size: 0.07, gravity: -0.6, drag: 2 }),
  goldburst: (fx, x, y) => { fx.burst(x, y, 16, { color: ['#ffe08a', '#f2b33d', '#ffffff'], speed: 3.4, life: 0.7, size: 0.08, shape: 'star', gravity: 3, lift: 2 }); fx.ring(x, y, 0.6, 'rgba(255,214,102,0.9)', 0.35, 0.06); },
  crown: (fx, x, y) => { fx.burst(x, y, 16, { color: ['#ffd45a', '#fff1b0', '#b58cff'], speed: 3.2, life: 0.8, size: 0.085, shape: 'star', gravity: 1.5, lift: 2.4 }); fx.ring(x, y, 0.55, 'rgba(255,212,90,0.9)', 0.4, 0.06); },
  eclipse: (fx, x, y) => { fx.burst(x, y, 14, { color: ['#1c1830', '#ffd45a', '#ffffff'], speed: 2.8, life: 0.8, size: 0.09, shape: 'star', gravity: -0.6 }); fx.ring(x, y, 0.7, 'rgba(255,212,90,0.85)', 0.5, 0.07); fx.ring(x, y, 0.35, 'rgba(30,24,48,0.85)', 0.4, 0.1); },
  pixels: (fx, x, y, color) => fx.burst(x, y, 12, { color: [color, '#1e2433', '#ffffff'], speed: 2.6, life: 0.6, size: 0.09, shape: 'square', gravity: 6, lift: 1.5 }),
};
