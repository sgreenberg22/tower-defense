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
  pixels: (fx, x, y, color) => fx.burst(x, y, 12, { color: [color, '#1e2433', '#ffffff'], speed: 2.6, life: 0.6, size: 0.09, shape: 'square', gravity: 6, lift: 1.5 }),
};
