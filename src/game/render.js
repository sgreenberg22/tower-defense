// Canvas renderer. Procedural "tabletop minis" art: chunky ink outlines, flat fills, soft drop shadows.
import { TOWERS, BIOMES } from '../data/balance.js';
import { T } from './maps.js';
import { biomeIndex } from './waves.js';

const INK = '#1e2433';
const TAU = Math.PI * 2;

export const CASTLE_SKINS = {
  stone: { wall: '#cfd3dc', wall2: '#aab0bd', roof: '#3d5fae', flag: '#f2b33d' },
  royal: { wall: '#eef0f7', wall2: '#c7cbe0', roof: '#7a3fc4', flag: '#f2b33d' },
  obsidian: { wall: '#4a4f63', wall2: '#363a4c', roof: '#d9473b', flag: '#f2b33d' },
  candy: { wall: '#ffd9e6', wall2: '#f5b8cf', roof: '#5ec2b7', flag: '#ff7aa8' },
  gold: { wall: '#f5d77a', wall2: '#ddb84e', roof: '#b8233a', flag: '#ffffff' },
};
export const TRAILS = {
  none: null, ember: ['#ffb347', '#e0532f'], frost: ['#bfefff', '#7fd3f2'], rainbow: ['#ff5e5e', '#ffd25e', '#5eff8a', '#5ecbff', '#c55eff'], starlight: ['#ffffff', '#fff6c2'],
};

export class Renderer {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.bg = document.createElement('canvas');
    this.bgKey = '';
    this.ts = 40; this.ox = 0; this.oy = 0;
    this.time = 0;
    this.hover = null;          // {x,y} tile
    this.ghost = null;          // {type, x, y, ok}
    this.selected = null;       // tower
    this.colorblind = false;
    this.quality = 'high';
    this.cosmetics = { castle: 'stone', trail: 'none', towerSkin: 'classic' };
    this.charge = null;         // {x,y,amount}
    this.trails = [];
    this.clanBanner = null;
  }

  resize(w, h, dpr, game) {
    this.dpr = dpr;
    this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
    this.c.style.width = w + 'px'; this.c.style.height = h + 'px';
    this.w = w; this.h = h;
    if (game) this.fit(game);
  }

  fit(game) {
    const m = game.map;
    this.ts = Math.floor(Math.min(this.w / m.cols, this.h / m.rows));
    this.ox = Math.floor((this.w - this.ts * m.cols) / 2);
    this.oy = Math.floor((this.h - this.ts * m.rows) / 2);
    this.bgKey = '';
  }

  toWorld(px, py) { return { x: (px - this.ox) / this.ts, y: (py - this.oy) / this.ts }; }

  // ---------- background ----------
  buildBg(game) {
    const bi = biomeIndex(game.wave);
    const key = `${bi}|${this.ts}|${game.map.id}|${game.seed}|${this.dpr}|${this.colorblind}`;
    if (key === this.bgKey) return;
    this.bgKey = key;
    const m = game.map, ts = this.ts, B = BIOMES[bi];
    const W = m.cols * ts, H = m.rows * ts;
    this.bg.width = Math.round(W * this.dpr); this.bg.height = Math.round(H * this.dpr);
    const g = this.bg.getContext('2d');
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Grass
    for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
      g.fillStyle = (x + y) % 2 ? B.grass : B.grass2;
      g.fillRect(x * ts, y * ts, ts + 1, ts + 1);
    }
    // Speckles
    let r = 1234 + bi * 99;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    g.fillStyle = shade(B.grass, -0.12);
    for (let i = 0; i < m.cols * m.rows * 3; i++) { g.beginPath(); g.arc(rnd() * W, rnd() * H, ts * 0.025 + rnd() * ts * 0.02, 0, TAU); g.fill(); }
    // Path with rounded edges: draw a thick stroked road for each path then tile fill.
    for (const p of m.paths) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = shade(B.path, -0.25); g.lineWidth = ts * 0.98;
      g.beginPath(); p.forEach((pt, i) => (i ? g.lineTo(pt.x * ts, pt.y * ts) : g.moveTo(pt.x * ts, pt.y * ts))); g.stroke();
      g.strokeStyle = B.path; g.lineWidth = ts * 0.84;
      g.stroke();
      g.strokeStyle = B.path2; g.lineWidth = ts * 0.1; g.setLineDash([ts * 0.12, ts * 0.3]);
      g.stroke(); g.setLineDash([]);
    }
    // Tiles: high ground, rocks, water, trees, rally flags
    for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
      const t = m.tileAt(x, y);
      const cx = (x + 0.5) * ts, cy = (y + 0.5) * ts;
      if (t === T.HIGH) {
        g.fillStyle = 'rgba(0,0,0,0.18)'; roundRect(g, x * ts + ts * 0.08, y * ts + ts * 0.16, ts * 0.9, ts * 0.86, ts * 0.18); g.fill();
        g.fillStyle = shade(B.grass, 0.12); g.strokeStyle = INK; g.lineWidth = ts * 0.04;
        roundRect(g, x * ts + ts * 0.06, y * ts + ts * 0.04, ts * 0.88, ts * 0.84, ts * 0.18); g.fill(); g.stroke();
        g.fillStyle = shade(B.grass, -0.08); g.fillRect(x * ts + ts * 0.08, y * ts + ts * 0.72, ts * 0.84, ts * 0.12);
        // chevron marks
        g.strokeStyle = shade(B.grass, -0.25); g.lineWidth = ts * 0.035;
        g.beginPath(); g.moveTo(cx - ts * 0.12, cy + ts * 0.02); g.lineTo(cx, cy - ts * 0.1); g.lineTo(cx + ts * 0.12, cy + ts * 0.02); g.stroke();
      } else if (t === T.ROCK) {
        drawRock(g, cx, cy, ts, B);
      } else if (t === T.WATER) {
        g.fillStyle = bi === 2 ? '#bfe6f5' : bi === 3 ? '#e0632f' : '#5aa7d8';
        roundRect(g, x * ts + ts * 0.04, y * ts + ts * 0.04, ts * 0.92, ts * 0.92, ts * 0.28); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = ts * 0.04;
        g.beginPath(); g.arc(cx - ts * 0.12, cy, ts * 0.12, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
        g.beginPath(); g.arc(cx + ts * 0.14, cy + ts * 0.18, ts * 0.1, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      } else if (t === T.TREE) {
        drawTree(g, cx, cy, ts, bi, rnd());
      }
      if (m.rally.has(y * m.cols + x)) {
        g.fillStyle = 'rgba(242,179,61,0.18)'; g.beginPath(); g.arc(cx, cy, ts * 0.4, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(242,179,61,0.7)'; g.lineWidth = ts * 0.03; g.setLineDash([ts * 0.06, ts * 0.06]); g.stroke(); g.setLineDash([]);
      }
    }
    // Spawn markers
    for (const sp of m.spawns) {
      const cx = sp.x * ts, cy = sp.y * ts;
      g.fillStyle = 'rgba(30,36,51,0.25)'; g.beginPath(); g.ellipse(cx, cy + ts * 0.1, ts * 0.42, ts * 0.22, 0, 0, TAU); g.fill();
      g.fillStyle = '#4a3a3a'; g.strokeStyle = INK; g.lineWidth = ts * 0.04;
      g.beginPath(); g.arc(cx, cy, ts * 0.34, Math.PI, 0); g.lineTo(cx + ts * 0.34, cy + ts * 0.15); g.lineTo(cx - ts * 0.34, cy + ts * 0.15); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#1e1a22'; g.beginPath(); g.arc(cx, cy + ts * 0.02, ts * 0.2, Math.PI, 0); g.lineTo(cx + ts * 0.2, cy + ts * 0.15); g.lineTo(cx - ts * 0.2, cy + ts * 0.15); g.fill();
    }
    // Board frame
    g.strokeStyle = INK; g.lineWidth = ts * 0.06; g.strokeRect(0, 0, W, H);
  }

  // ---------- main draw ----------
  draw(game, fx, dt, ui = {}) {
    this.time += dt;
    const ctx = this.ctx, ts = this.ts;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const B = BIOMES[biomeIndex(game.wave)];
    ctx.fillStyle = B.sky; ctx.fillRect(0, 0, this.w, this.h);
    this.buildBg(game);
    const [sx, sy] = fx.shakeOffset();
    ctx.save();
    ctx.translate(this.ox + sx * ts, this.oy + sy * ts);
    ctx.drawImage(this.bg, 0, 0, game.map.cols * ts, game.map.rows * ts);

    // Burning fields
    for (const f of game.fields) {
      const a = Math.min(1, f.t);
      ctx.fillStyle = `rgba(255,120,40,${0.25 * a})`; ctx.beginPath(); ctx.arc(f.x * ts, f.y * ts, f.r * ts, 0, TAU); ctx.fill();
      if (Math.random() < 0.3) fx.burst(f.x + (Math.random() - 0.5) * f.r, f.y + (Math.random() - 0.5) * f.r, 1, { color: ['#ffb347', '#e0532f'], speed: 0.4, life: 0.5, gravity: -2, size: 0.06 });
    }

    // Range preview (hover/selected/ghost)
    if (this.selected && game.towers.includes(this.selected)) this.drawRange(this.selected.cx, this.selected.cy, this.selected.stats.range || TOWERS[this.selected.type].range || 0, this.selected.stats.minRange, true);
    if (this.ghost) {
      const def = TOWERS[this.ghost.type];
      const hg = game.map.tileAt(this.ghost.x, this.ghost.y) === T.HIGH ? 0.6 : 0;
      const r = def.aura || (def.range ? def.range + hg : 0.6);
      this.drawRange(this.ghost.x + 0.5, this.ghost.y + 0.5, r, def.minRange, this.ghost.ok);
    }

    // Castle (drawn before enemies so they overlap when arriving)
    this.drawCastle(game);

    // Traps (under enemies)
    for (const t of game.towers) if (TOWERS[t.type].trap) this.drawTower(t, game);

    // Sort enemies + towers by y for depth.
    const list = [];
    for (const t of game.towers) if (!TOWERS[t.type].trap) list.push({ y: t.cy + 0.3, t });
    for (const e of game.enemies) if (!e.dead) list.push({ y: e.y + (e.air ? 0.6 : 0), e });
    for (const t of game.towers) for (const so of t.soldiers) if (!so.dead) list.push({ y: so.y, so });
    list.sort((a, b) => a.y - b.y);
    const fog = game.mod.fog;
    for (const it of list) {
      if (it.t) this.drawTower(it.t, game);
      else if (it.so) this.drawSoldier(it.so);
      else if (!fog || game.isVisible(it.e)) this.drawEnemy(it.e, game);
    }

    // Beams
    for (const t of game.towers) if (t.beam) for (const b of t.beam) this.drawBeam(t, b);

    // Projectiles
    for (const p of game.projectiles) this.drawProjectile(p, fx);

    // Hero trail particles
    this.drawTrails(dt);

    // Fog overlay
    if (fog) this.drawFog(game);

    // FX layers
    this.drawFx(fx);

    // Ghost tower
    if (this.ghost) {
      ctx.globalAlpha = 0.6;
      this.drawTower({ type: this.ghost.type, cx: this.ghost.x + 0.5, cy: this.ghost.y + 0.5, tier: 1, aim: -Math.PI / 2, recoil: 0, soldiers: [], ghost: true, hp: 1, maxHp: 1 }, game);
      ctx.globalAlpha = 1;
      if (!this.ghost.ok) {
        ctx.strokeStyle = '#d9473b'; ctx.lineWidth = ts * 0.06;
        const gx = this.ghost.x * ts, gy = this.ghost.y * ts;
        ctx.beginPath(); ctx.moveTo(gx + ts * 0.25, gy + ts * 0.25); ctx.lineTo(gx + ts * 0.75, gy + ts * 0.75); ctx.moveTo(gx + ts * 0.75, gy + ts * 0.25); ctx.lineTo(gx + ts * 0.25, gy + ts * 0.75); ctx.stroke();
      }
    } else if (this.hover && ui.placing === null && !game.over) {
      const h = this.hover;
      if (h.x >= 0 && h.y >= 0 && h.x < game.map.cols && h.y < game.map.rows) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = ts * 0.03;
        roundRect(ctx, h.x * ts + 2, h.y * ts + 2, ts - 4, ts - 4, ts * 0.12); ctx.stroke();
      }
    }

    // Charge reticle
    if (this.charge) {
      const { x, y, amount } = this.charge;
      ctx.strokeStyle = amount >= 0.95 ? '#f2b33d' : 'rgba(255,255,255,0.9)'; ctx.lineWidth = ts * 0.05;
      if (amount > 0) { ctx.beginPath(); ctx.arc(x * ts, y * ts, ts * (0.5 - 0.2 * amount), -Math.PI / 2, -Math.PI / 2 + TAU * amount); ctx.stroke(); }
    }
    ctx.restore();

    // Hazard tint
    if (game.hazard.active > 0 && game.phase === 'wave') {
      const k = game.hazard.kind;
      ctx.fillStyle = k === 'sandstorm' ? 'rgba(230,190,110,0.22)' : k === 'blizzard' ? 'rgba(230,245,255,0.25)' : k === 'meteors' ? 'rgba(255,90,40,0.1)' : 'rgba(40,20,70,0.22)';
      ctx.fillRect(0, 0, this.w, this.h);
      if (k === 'sandstorm' || k === 'blizzard') {
        ctx.fillStyle = k === 'sandstorm' ? 'rgba(210,170,90,0.6)' : 'rgba(255,255,255,0.85)';
        for (let i = 0; i < 60; i++) {
          const px = ((i * 97 + this.time * (k === 'sandstorm' ? 420 : 90)) % (this.w + 40)) - 20;
          const py = ((i * 53 + this.time * (k === 'sandstorm' ? 40 : 120)) % (this.h + 40)) - 20;
          ctx.fillRect(px, py, k === 'sandstorm' ? 10 : 3, k === 'sandstorm' ? 1.5 : 3);
        }
      }
    }
  }

  drawRange(cx, cy, r, minR, ok) {
    if (!r) return;
    const ctx = this.ctx, ts = this.ts;
    ctx.fillStyle = ok ? 'rgba(255,255,255,0.14)' : 'rgba(217,71,59,0.14)';
    ctx.strokeStyle = ok ? 'rgba(255,255,255,0.75)' : 'rgba(217,71,59,0.8)';
    ctx.lineWidth = ts * 0.035; ctx.setLineDash([ts * 0.12, ts * 0.08]);
    ctx.beginPath(); ctx.arc(cx * ts, cy * ts, r * ts, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    if (minR) { ctx.fillStyle = 'rgba(217,71,59,0.12)'; ctx.beginPath(); ctx.arc(cx * ts, cy * ts, minR * ts, 0, TAU); ctx.fill(); }
  }

  drawFog(game) {
    const ctx = this.ctx, ts = this.ts, m = game.map;
    ctx.save();
    ctx.fillStyle = 'rgba(40,46,64,0.55)';
    ctx.beginPath(); ctx.rect(0, 0, m.cols * ts, m.rows * ts);
    const hole = (x, y, r) => { ctx.moveTo(x * ts + r * ts, y * ts); ctx.arc(x * ts, y * ts, r * ts, 0, TAU, true); };
    hole(m.castle.x, m.castle.y, 3.2);
    for (const t of game.towers) if (t.stats?.range) hole(t.cx, t.cy, t.stats.range + 0.3);
    ctx.fill('evenodd');
    ctx.restore();
  }

  // ---------- castle ----------
  drawCastle(game) {
    const ctx = this.ctx, ts = this.ts;
    const { x, y } = game.map.castle;
    const sk = CASTLE_SKINS[this.cosmetics.castle] || CASTLE_SKINS.stone;
    const cx = x * ts, cy = y * ts;
    const dmg = 1 - game.castle.hp / game.castle.maxHp;
    const s = ts * 1.15;
    ctx.save();
    ctx.translate(cx, cy);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, s * 0.42, s * 0.62, s * 0.2, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = ts * 0.05; ctx.strokeStyle = INK;
    // wall ring (shows wall hp)
    const wf = game.wall.hp / game.wall.maxHp;
    // keep body
    ctx.fillStyle = sk.wall;
    roundRect(ctx, -s * 0.45, -s * 0.35, s * 0.9, s * 0.75, s * 0.06); ctx.fill(); ctx.stroke();
    ctx.fillStyle = sk.wall2; ctx.fillRect(-s * 0.43, s * 0.2, s * 0.86, s * 0.18);
    // towers left/right
    for (const sxn of [-1, 1]) {
      ctx.fillStyle = sk.wall;
      roundRect(ctx, sxn * s * 0.45 - s * 0.16, -s * 0.55, s * 0.32, s * 0.95, s * 0.05); ctx.fill(); ctx.stroke();
      ctx.fillStyle = sk.roof;
      ctx.beginPath(); ctx.moveTo(sxn * s * 0.45 - s * 0.2, -s * 0.55); ctx.lineTo(sxn * s * 0.45, -s * 0.88); ctx.lineTo(sxn * s * 0.45 + s * 0.2, -s * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // crenellations
    ctx.fillStyle = sk.wall;
    for (let i = -2; i <= 2; i++) { ctx.fillRect(i * s * 0.12 - s * 0.04, -s * 0.44, s * 0.08, s * 0.1); ctx.strokeRect(i * s * 0.12 - s * 0.04, -s * 0.44, s * 0.08, s * 0.1); }
    // gate
    ctx.fillStyle = '#5b3a24'; ctx.beginPath(); ctx.moveTo(-s * 0.13, s * 0.4); ctx.lineTo(-s * 0.13, s * 0.08); ctx.arc(0, s * 0.08, s * 0.13, Math.PI, 0); ctx.lineTo(s * 0.13, s * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
    // flag
    const wave = Math.sin(this.time * 4) * s * 0.03;
    ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(s * 0.45, -s * 0.88); ctx.lineTo(s * 0.45, -s * 1.15); ctx.stroke();
    ctx.fillStyle = this.clanBanner || sk.flag;
    ctx.beginPath(); ctx.moveTo(s * 0.45, -s * 1.15); ctx.quadraticCurveTo(s * 0.6, -s * 1.1 + wave, s * 0.72, -s * 1.08); ctx.lineTo(s * 0.45, -s * 0.98); ctx.closePath(); ctx.fill(); ctx.stroke();
    // cracks by damage
    if (dmg > 0.3) {
      ctx.strokeStyle = 'rgba(30,36,51,0.7)'; ctx.lineWidth = ts * 0.025;
      ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.2); ctx.lineTo(-s * 0.2, -s * 0.05); ctx.lineTo(-s * 0.26, s * 0.1); ctx.stroke();
      if (dmg > 0.6) { ctx.beginPath(); ctx.moveTo(s * 0.25, -s * 0.25); ctx.lineTo(s * 0.18, -s * 0.1); ctx.lineTo(s * 0.28, s * 0.05); ctx.stroke(); }
    }
    // wall palisade arc in front
    if (game.wall.maxHp > 0) {
      ctx.lineWidth = ts * 0.1; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(30,36,51,0.35)';
      ctx.beginPath(); ctx.arc(0, s * 0.15, s * 0.78, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
      ctx.strokeStyle = wf > 0.5 ? '#9a7b55' : wf > 0.2 ? '#b8874f' : '#c9553c';
      ctx.beginPath(); ctx.arc(0, s * 0.15, s * 0.78, Math.PI * 0.5 - Math.PI * 0.35 * wf, Math.PI * 0.5 + Math.PI * 0.35 * wf); ctx.stroke();
      ctx.lineCap = 'butt';
    }
    // hero on the battlements
    const W = game.weapon;
    ctx.translate(0, -s * 0.5);
    ctx.fillStyle = '#3d7bd9'; ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.035;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.1, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2d1a8'; ctx.beginPath(); ctx.arc(0, -s * 0.13, s * 0.07, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (dmg > 0.5 && Math.random() < 0.08) this._smoke = true;
  }

  // ---------- towers ----------
  drawTower(t, game) {
    const ctx = this.ctx, ts = this.ts;
    const def = TOWERS[t.type];
    const x = t.cx * ts, y = t.cy * ts;
    ctx.save();
    ctx.translate(x, y);
    if (t.ally) ctx.globalAlpha *= 0.85;
    const skin = this.cosmetics.towerSkin;
    const stone = skin === 'marble' ? '#eceef3' : skin === 'ironwood' ? '#6b5a4a' : '#bfc4cf';
    const stone2 = skin === 'marble' ? '#cfd3de' : skin === 'ironwood' ? '#54473a' : '#9aa1b0';
    ctx.lineWidth = ts * 0.045; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    if (def.trap) {
      ctx.fillStyle = '#3a3030'; roundRect(ctx, -ts * 0.38, -ts * 0.38, ts * 0.76, ts * 0.76, ts * 0.1); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#6b5a5a'; ctx.lineWidth = ts * 0.05;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * ts * 0.18, -ts * 0.3); ctx.lineTo(i * ts * 0.18, ts * 0.3); ctx.stroke(); }
      const glow = 0.4 + 0.3 * Math.sin(this.time * 6 + t.cx) + (t.recoil || 0) * 0.3;
      ctx.fillStyle = t.spec === 'tar' ? `rgba(60,40,30,${glow})` : `rgba(255,${120 + 40 * glow},40,${glow})`;
      roundRect(ctx, -ts * 0.3, -ts * 0.3, ts * 0.6, ts * 0.6, ts * 0.08); ctx.fill();
      if (!t.ghost && Math.random() < 0.15) this._ember = (this._ember || []).concat([[t.cx, t.cy]]);
      this.tierPips(t, ts * 0.42);
      ctx.restore();
      return;
    }
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(ts * 0.04, ts * 0.3, ts * 0.42, ts * 0.16, 0, 0, TAU); ctx.fill();
    // base platform
    const ruined = t.ruined;
    ctx.fillStyle = ruined ? '#8a8a8a' : stone2;
    roundRect(ctx, -ts * 0.36, -ts * 0.05, ts * 0.72, ts * 0.38, ts * 0.12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ruined ? '#9a9a9a' : stone;
    roundRect(ctx, -ts * 0.36, -ts * 0.16, ts * 0.72, ts * 0.32, ts * 0.12); ctx.fill(); ctx.stroke();
    if (ruined) {
      ctx.fillStyle = '#7a7a7a';
      for (const [bx, by] of [[-0.15, -0.25], [0.1, -0.3], [0.02, -0.18]]) { ctx.beginPath(); ctx.arc(bx * ts, by * ts, ts * 0.1, 0, TAU); ctx.fill(); ctx.stroke(); }
      if (Math.random() < 0.05) this._smokeAt = [t.cx, t.cy - 0.3];
      ctx.restore();
      return;
    }
    const col = def.color;
    const rec = (t.recoil || 0) * ts * 0.06;
    const a = t.aim ?? -Math.PI / 2;
    switch (t.type) {
      case 'archer': {
        ctx.fillStyle = '#9a6a3c'; roundRect(ctx, -ts * 0.22, -ts * 0.62, ts * 0.44, ts * 0.52, ts * 0.06); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-ts * 0.3, -ts * 0.6); ctx.lineTo(0, -ts * 0.85); ctx.lineTo(ts * 0.3, -ts * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.translate(0, -ts * 0.38); ctx.rotate(a);
        ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = ts * 0.05; ctx.beginPath(); ctx.arc(-rec, 0, ts * 0.17, -1.1, 1.1); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'cannon': {
        ctx.fillStyle = '#6d5a48'; roundRect(ctx, -ts * 0.26, -ts * 0.36, ts * 0.52, ts * 0.28, ts * 0.08); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.translate(0, -ts * 0.32); ctx.rotate(a);
        ctx.fillStyle = col; roundRect(ctx, -ts * 0.08 - rec, -ts * 0.11, ts * 0.42, ts * 0.22, ts * 0.08); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ts * 0.32 - rec, 0, ts * 0.06, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.fillStyle = shade(col, -0.2); ctx.beginPath(); ctx.arc(0, -ts * 0.32, ts * 0.13, 0, TAU); ctx.fill(); ctx.stroke();
        break;
      }
      case 'mage': {
        ctx.fillStyle = '#7d6aa8'; ctx.beginPath(); ctx.moveTo(-ts * 0.2, -ts * 0.1); ctx.lineTo(-ts * 0.12, -ts * 0.58); ctx.lineTo(ts * 0.12, -ts * 0.58); ctx.lineTo(ts * 0.2, -ts * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
        const bob = Math.sin(this.time * 3 + t.cx) * ts * 0.04;
        ctx.fillStyle = 'rgba(199,155,255,0.35)'; ctx.beginPath(); ctx.arc(0, -ts * 0.75 + bob, ts * 0.22, 0, TAU); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -ts * 0.75 + bob, ts * 0.14, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-ts * 0.04, -ts * 0.79 + bob, ts * 0.04, 0, TAU); ctx.fill();
        break;
      }
      case 'flak': {
        ctx.fillStyle = '#5a5f6b'; roundRect(ctx, -ts * 0.24, -ts * 0.34, ts * 0.48, ts * 0.26, ts * 0.06); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.translate(0, -ts * 0.34); ctx.rotate(a);
        ctx.fillStyle = col;
        for (const o of [-0.08, 0.08]) { roundRect(ctx, -ts * 0.04 - rec, o * ts - ts * 0.05, ts * 0.38, ts * 0.1, ts * 0.04); ctx.fill(); ctx.stroke(); }
        ctx.restore();
        break;
      }
      case 'mint': {
        ctx.fillStyle = '#f3e3b5'; roundRect(ctx, -ts * 0.26, -ts * 0.56, ts * 0.52, ts * 0.46, ts * 0.05); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-ts * 0.32, -ts * 0.54); ctx.lineTo(0, -ts * 0.76); ctx.lineTo(ts * 0.32, -ts * 0.54); ctx.closePath(); ctx.fill(); ctx.stroke();
        const sp = (Math.sin(this.time * 2 + t.cx) + 1) / 2;
        ctx.fillStyle = '#f2b33d'; ctx.beginPath(); ctx.ellipse(0, -ts * 0.32, ts * 0.12 * (0.4 + 0.6 * sp), ts * 0.12, 0, 0, TAU); ctx.fill(); ctx.stroke();
        break;
      }
      case 'ballista': {
        ctx.fillStyle = '#7a5130'; roundRect(ctx, -ts * 0.2, -ts * 0.34, ts * 0.4, ts * 0.24, ts * 0.06); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.translate(0, -ts * 0.3); ctx.rotate(a);
        ctx.fillStyle = col; roundRect(ctx, -ts * 0.2 - rec, -ts * 0.05, ts * 0.52, ts * 0.1, ts * 0.03); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.05; ctx.beginPath(); ctx.arc(ts * 0.06 - rec, 0, ts * 0.28, -1.2, 1.2); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'barracks': {
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-ts * 0.32, -ts * 0.08); ctx.lineTo(0, -ts * 0.62); ctx.lineTo(ts * 0.32, -ts * 0.08); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = shade(col, -0.3); ctx.beginPath(); ctx.moveTo(-ts * 0.08, -ts * 0.08); ctx.lineTo(0, -ts * 0.3); ctx.lineTo(ts * 0.08, -ts * 0.08); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(0, -ts * 0.62); ctx.lineTo(0, -ts * 0.82); ctx.stroke();
        ctx.fillStyle = '#f2b33d'; ctx.beginPath(); ctx.moveTo(0, -ts * 0.82); ctx.lineTo(ts * 0.18, -ts * 0.76); ctx.lineTo(0, -ts * 0.7); ctx.fill(); ctx.stroke();
        if (t.rallyPt && this.selected === t) { ctx.fillStyle = 'rgba(242,179,61,0.8)'; ctx.beginPath(); ctx.arc((t.rallyPt.x - t.cx) * ts, (t.rallyPt.y - t.cy) * ts, ts * 0.08, 0, TAU); ctx.fill(); }
        break;
      }
      case 'catapult': {
        ctx.fillStyle = '#8a6a44'; roundRect(ctx, -ts * 0.26, -ts * 0.28, ts * 0.52, ts * 0.18, ts * 0.05); ctx.fill(); ctx.stroke();
        const arm = -Math.PI * 0.75 + (t.recoil || 0) * 1.4;
        ctx.save(); ctx.translate(-ts * 0.05, -ts * 0.26); ctx.rotate(arm);
        ctx.fillStyle = col; roundRect(ctx, 0, -ts * 0.04, ts * 0.5, ts * 0.08, ts * 0.03); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.arc(ts * 0.5, 0, ts * 0.08, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'banner': {
        ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.06; ctx.beginPath(); ctx.moveTo(0, -ts * 0.05); ctx.lineTo(0, -ts * 0.9); ctx.stroke();
        const wv = Math.sin(this.time * 5 + t.cx) * ts * 0.05;
        ctx.fillStyle = col; ctx.lineWidth = ts * 0.04;
        ctx.beginPath(); ctx.moveTo(0, -ts * 0.88); ctx.lineTo(ts * 0.4, -ts * 0.82 + wv); ctx.lineTo(ts * 0.34, -ts * 0.62 + wv); ctx.lineTo(ts * 0.4, -ts * 0.45 + wv); ctx.lineTo(0, -ts * 0.48); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f2b33d'; ctx.beginPath(); ctx.arc(ts * 0.18, -ts * 0.67 + wv * 0.7, ts * 0.06, 0, TAU); ctx.fill();
        if (!t.ghost) { ctx.strokeStyle = 'rgba(210,60,75,0.25)'; ctx.lineWidth = ts * 0.03; ctx.beginPath(); ctx.arc(0, 0, (t.stats?.range || 1.6) * ts, 0, TAU); ctx.stroke(); }
        break;
      }
      case 'tesla': {
        ctx.fillStyle = '#4b5566'; roundRect(ctx, -ts * 0.14, -ts * 0.66, ts * 0.28, ts * 0.58, ts * 0.06); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = ts * 0.05;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, -ts * (0.25 + i * 0.14), ts * 0.2, ts * 0.06, 0, 0, TAU); ctx.stroke(); }
        ctx.fillStyle = '#d6fbff'; ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.04; ctx.beginPath(); ctx.arc(0, -ts * 0.74, ts * 0.11, 0, TAU); ctx.fill(); ctx.stroke();
        if (Math.random() < 0.1) { ctx.strokeStyle = '#8ef2ff'; ctx.lineWidth = ts * 0.025; ctx.beginPath(); ctx.moveTo(0, -ts * 0.74); ctx.lineTo((Math.random() - 0.5) * ts * 0.5, -ts * 0.74 + (Math.random() - 0.5) * ts * 0.4); ctx.stroke(); }
        break;
      }
      case 'frost': {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(0, -ts * 0.95); ctx.lineTo(ts * 0.16, -ts * 0.35); ctx.lineTo(0, -ts * 0.08); ctx.lineTo(-ts * 0.16, -ts * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e8f8ff';
        ctx.beginPath(); ctx.moveTo(-ts * 0.18, -ts * 0.55); ctx.lineTo(-ts * 0.08, -ts * 0.3); ctx.lineTo(-ts * 0.28, -ts * 0.22); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ts * 0.18, -ts * 0.5); ctx.lineTo(ts * 0.08, -ts * 0.28); ctx.lineTo(ts * 0.28, -ts * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      }
      case 'obelisk': {
        ctx.fillStyle = '#e9d9a6'; ctx.beginPath(); ctx.moveTo(-ts * 0.16, -ts * 0.1); ctx.lineTo(-ts * 0.1, -ts * 0.8); ctx.lineTo(0, -ts * 0.95); ctx.lineTo(ts * 0.1, -ts * 0.8); ctx.lineTo(ts * 0.16, -ts * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
        const g = 0.5 + 0.5 * Math.sin(this.time * 4);
        ctx.fillStyle = `rgba(245,197,66,${0.5 + 0.5 * g})`; ctx.beginPath(); ctx.arc(0, -ts * 0.78, ts * 0.08, 0, TAU); ctx.fill();
        break;
      }
    }
    if (t.disabledT > 0) {
      ctx.fillStyle = 'rgba(30,36,51,0.45)'; ctx.beginPath(); ctx.arc(0, -ts * 0.4, ts * 0.32, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#f2b33d'; ctx.lineWidth = ts * 0.04;
      ctx.beginPath(); ctx.moveTo(-ts * 0.1, -ts * 0.55); ctx.lineTo(ts * 0.02, -ts * 0.4); ctx.lineTo(-ts * 0.04, -ts * 0.38); ctx.lineTo(ts * 0.1, -ts * 0.24); ctx.stroke();
    }
    if (!t.ghost) {
      this.tierPips(t, ts * 0.42);
      if (t.hp < t.maxHp) this.bar(-ts * 0.3, ts * 0.38, ts * 0.6, t.hp / t.maxHp, '#7fb24a');
      if (t.ally) {
        ctx.font = `700 ${Math.max(9, ts * 0.22)}px "Baloo 2", system-ui`; ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
        const label = `${t.ally} · ${t.allyWaves}`;
        ctx.strokeText(label, 0, -ts * 0.98); ctx.fillText(label, 0, -ts * 0.98);
      }
      if (this.selected === t) { ctx.strokeStyle = '#f2b33d'; ctx.lineWidth = ts * 0.05; ctx.beginPath(); ctx.ellipse(0, ts * 0.12, ts * 0.46, ts * 0.22, 0, 0, TAU); ctx.stroke(); }
    }
    ctx.restore();
  }

  tierPips(t, y) {
    const ctx = this.ctx, ts = this.ts;
    const n = t.tier || 1;
    if (t.mastery) {
      ctx.font = `800 ${Math.max(9, ts * 0.22)}px "Baloo 2", system-ui`; ctx.textAlign = 'center';
      ctx.fillStyle = '#f2b33d'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.strokeText('★' + t.mastery, 0, y + ts * 0.08); ctx.fillText('★' + t.mastery, 0, y + ts * 0.08);
      return;
    }
    for (let i = 0; i < n; i++) {
      const px = (i - (n - 1) / 2) * ts * 0.12;
      ctx.fillStyle = n === 5 ? '#f2b33d' : '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.025;
      ctx.beginPath(); ctx.arc(px, y, ts * 0.045, 0, TAU); ctx.fill(); ctx.stroke();
    }
  }

  bar(x, y, w, f, color) {
    const ctx = this.ctx, ts = this.ts;
    const h = Math.max(3, ts * 0.07);
    ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#5a2a2a'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = this.colorblind ? (f > 0.5 ? '#3d9ad9' : f > 0.25 ? '#f2b33d' : '#ff8a00') : color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, f)), h);
  }

  drawSoldier(so) {
    const ctx = this.ctx, ts = this.ts;
    ctx.save(); ctx.translate(so.x * ts, so.y * ts);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0, ts * 0.12, ts * 0.14, ts * 0.06, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = ts * 0.035; ctx.strokeStyle = INK;
    ctx.fillStyle = so.armor ? '#9aa1b0' : '#3a8a52';
    ctx.beginPath(); ctx.arc(0, -ts * 0.02, ts * 0.12, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d9dde6'; ctx.beginPath(); ctx.arc(0, -ts * 0.17, ts * 0.08, Math.PI, 0); ctx.fill(); ctx.stroke();
    const sw = so.swing > 0 ? -0.8 : 0.3;
    ctx.save(); ctx.translate(ts * 0.1, -ts * 0.04); ctx.rotate(sw);
    ctx.strokeStyle = '#e9edf2'; ctx.lineWidth = ts * 0.035; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -ts * 0.2); ctx.stroke();
    ctx.restore();
    if (so.hp < so.maxHp) this.bar(-ts * 0.15, -ts * 0.34, ts * 0.3, so.hp / so.maxHp, '#7fb24a');
    ctx.restore();
  }

  // ---------- enemies ----------
  drawEnemy(e, game) {
    const ctx = this.ctx, ts = this.ts;
    const s = e.size * ts;
    const hop = e.stunT > 0 || (e.vx === 0 && e.vy === 0) ? 0 : Math.abs(Math.sin(this.time * 9 * Math.max(0.6, e.speed) + e.bob)) * s * 0.18;
    const fly = e.air ? ts * 0.35 + Math.sin(this.time * 3 + e.bob) * ts * 0.05 : 0;
    const x = e.x * ts, y = e.y * ts;
    ctx.save();
    ctx.translate(x, y);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, s * 0.35, s * (e.air ? 0.6 : 0.85), s * 0.28, 0, 0, TAU); ctx.fill();
    ctx.translate(0, -hop - fly);
    if (e.stealthT > 0) ctx.globalAlpha = 0.35;
    const face = e.vx < -0.01 ? -1 : 1;
    ctx.scale(face, 1);
    ctx.lineWidth = Math.max(1.5, ts * 0.04); ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    const col = e.flash > 0 ? '#ffffff' : e.color;
    if (e.buffT > 0 && e.type !== 'warchief') { ctx.fillStyle = 'rgba(217,71,59,0.25)'; ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 1.05, 0, TAU); ctx.fill(); }
    const type = e.boss ? 'boss_' + e.boss : e.type;
    switch (type) {
      case 'wyvern': drawWyvern(ctx, s, col, this.time + e.bob); break;
      case 'cavalry': drawCavalry(ctx, s, col, this.time * 10 + e.bob, e.gear); break;
      case 'ram': drawRam(ctx, s, col, this.time * 6 + e.bob); break;
      case 'brood': case 'spider': drawSpider(ctx, s, col, this.time * 12 + e.bob); break;
      case 'golem': drawGolem(ctx, s, col); break;
      case 'boss_dragon': drawWyvern(ctx, s, col, this.time * 0.7 + e.bob, true); break;
      case 'boss_titan': drawGolem(ctx, s, col, true); break;
      default: drawSoldierEnemy(ctx, s, col, e, type);
    }
    ctx.restore();
    // Status overlays (unflipped)
    ctx.save(); ctx.translate(x, y - hop - fly);
    if (e.shield > 0) { ctx.strokeStyle = 'rgba(160,120,255,0.8)'; ctx.lineWidth = ts * 0.03; ctx.beginPath(); ctx.arc(0, -s * 0.3, s * 1.1, 0, TAU); ctx.stroke(); }
    if (e.slowT > 0) { ctx.fillStyle = this.colorblind ? 'rgba(80,140,255,0.35)' : 'rgba(127,211,242,0.35)'; ctx.beginPath(); ctx.arc(0, -s * 0.3, s * 0.95, 0, TAU); ctx.fill(); }
    if (e.burnT > 0 && Math.random() < 0.35) this._burnAt = (this._burnAt || []).concat([[e.x, e.y - (e.air ? 0.35 : 0) - e.size * 0.5]]);
    if (e.stunT > 0) {
      ctx.fillStyle = '#f2b33d';
      for (let i = 0; i < 3; i++) { const a = this.time * 5 + (i * TAU) / 3; star(ctx, Math.cos(a) * s * 0.6, -s * 1.3 + Math.sin(a) * s * 0.2, s * 0.15); }
    }
    if (e.enraged) { ctx.fillStyle = '#d9473b'; ctx.font = `800 ${Math.max(10, ts * 0.25)}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('!', s * 0.9, -s * 1.2); }
    if (e.hp < e.maxHp || e.boss) {
      const w = e.boss ? ts * 1.4 : Math.max(ts * 0.5, s * 1.8);
      this.bar(-w / 2, -s * (e.boss ? 1.9 : 1.55) - ts * 0.05, w, e.hp / e.maxHp, e.boss ? '#d9473b' : '#7fb24a');
      if (e.shield > 0) { ctx.fillStyle = '#b79bff'; ctx.fillRect(-w / 2, -s * (e.boss ? 1.9 : 1.55) - ts * 0.05, w * Math.min(1, e.shield / e.maxHp), Math.max(2, ts * 0.03)); }
    }
    ctx.restore();
  }

  drawBeam(t, b) {
    const ctx = this.ctx, ts = this.ts;
    const k = b.ramp / (t.stats.rampMax || 4);
    const x0 = t.cx * ts, y0 = (t.cy - 0.78) * ts, x1 = b.e.x * ts, y1 = (b.e.y - (b.e.air ? 0.35 : 0.15)) * ts;
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255,220,120,${0.35 + 0.3 * k})`; ctx.lineWidth = ts * (0.12 + 0.12 * k);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = '#fffbe6'; ctx.lineWidth = ts * (0.04 + 0.04 * k); ctx.stroke();
    ctx.lineCap = 'butt';
  }

  drawProjectile(p, fx) {
    const ctx = this.ctx, ts = this.ts;
    const x = p.x * ts, y = p.y * ts;
    ctx.save(); ctx.translate(x, y);
    ctx.lineWidth = ts * 0.035; ctx.strokeStyle = INK;
    switch (p.kind) {
      case 'arrow': case 'earrow': {
        const a = p.ang ?? (p.target ? Math.atan2((p.target.cy ?? p.target.y) - p.y, (p.target.cx ?? p.target.x) - p.x) : 0);
        ctx.rotate(a);
        ctx.strokeStyle = p.kind === 'earrow' ? '#5e3a1a' : '#4a3520'; ctx.lineWidth = ts * 0.04;
        ctx.beginPath(); ctx.moveTo(-ts * 0.18, 0); ctx.lineTo(ts * 0.12, 0); ctx.stroke();
        ctx.fillStyle = '#d9dde6'; ctx.beginPath(); ctx.moveTo(ts * 0.18, 0); ctx.lineTo(ts * 0.1, -ts * 0.04); ctx.lineTo(ts * 0.1, ts * 0.04); ctx.fill();
        break;
      }
      case 'orb': {
        ctx.fillStyle = 'rgba(199,155,255,0.45)'; ctx.beginPath(); ctx.arc(0, 0, ts * 0.16, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c79bff'; ctx.beginPath(); ctx.arc(0, 0, ts * 0.08, 0, TAU); ctx.fill(); ctx.stroke();
        break;
      }
      case 'flak': {
        ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(0, 0, ts * 0.06, 0, TAU); ctx.fill(); ctx.stroke();
        break;
      }
      case 'bolt': {
        ctx.rotate(Math.atan2(p.dy, p.dx));
        ctx.fillStyle = '#8a5a32'; roundRect(ctx, -ts * 0.28, -ts * 0.035, ts * 0.5, ts * 0.07, ts * 0.02); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d9dde6'; ctx.beginPath(); ctx.moveTo(ts * 0.3, 0); ctx.lineTo(ts * 0.2, -ts * 0.07); ctx.lineTo(ts * 0.2, ts * 0.07); ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      }
      case 'ball': case 'boulder': {
        const r = p.kind === 'ball' ? ts * 0.1 : ts * 0.15;
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.5, 0, 0, TAU); ctx.fill();
        ctx.translate(0, -(p.arc || 0) * ts);
        ctx.fillStyle = p.kind === 'ball' ? '#2d2f36' : (p.fireField ? '#e0632f' : '#7b6a4f'); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
        break;
      }
      case 'hero': {
        const ang = Math.atan2(p.dy, p.dx);
        const trail = TRAILS[this.cosmetics.trail];
        if (trail) this.trails.push({ x: p.x, y: p.y, t: 0, color: trail[Math.floor(Math.random() * trail.length)] });
        else if (Math.random() < 0.5) this.trails.push({ x: p.x, y: p.y, t: 0, color: 'rgba(255,255,255,0.7)' });
        ctx.rotate(ang);
        const big = p.charge >= 0.95 ? 1.4 : 1;
        if (p.weapon === 'wand') { ctx.fillStyle = '#c79bff'; ctx.beginPath(); ctx.arc(0, 0, ts * 0.1 * big, 0, TAU); ctx.fill(); ctx.stroke(); }
        else if (p.weapon === 'javelin') { ctx.strokeStyle = '#e0632f'; ctx.lineWidth = ts * 0.06 * big; ctx.beginPath(); ctx.moveTo(-ts * 0.25, 0); ctx.lineTo(ts * 0.2, 0); ctx.stroke(); }
        else if (p.weapon === 'handcannon') { ctx.fillStyle = '#2d2f36'; ctx.beginPath(); ctx.arc(0, 0, ts * 0.09 * big, 0, TAU); ctx.fill(); ctx.stroke(); }
        else {
          ctx.strokeStyle = '#3d2a14'; ctx.lineWidth = ts * 0.05 * big; ctx.beginPath(); ctx.moveTo(-ts * 0.22 * big, 0); ctx.lineTo(ts * 0.14 * big, 0); ctx.stroke();
          ctx.fillStyle = '#f2b33d'; ctx.beginPath(); ctx.moveTo(ts * 0.22 * big, 0); ctx.lineTo(ts * 0.12 * big, -ts * 0.06 * big); ctx.lineTo(ts * 0.12 * big, ts * 0.06 * big); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        break;
      }
    }
    ctx.restore();
  }

  drawTrails(dt) {
    const ctx = this.ctx, ts = this.ts;
    for (const tr of this.trails) {
      tr.t += dt;
      const k = 1 - tr.t / 0.3;
      if (k <= 0) continue;
      ctx.globalAlpha = k;
      ctx.fillStyle = tr.color; ctx.beginPath(); ctx.arc(tr.x * ts, tr.y * ts, ts * 0.05 * k, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.trails = this.trails.filter((t) => t.t < 0.3);
    if (this.trails.length > 200) this.trails.splice(0, this.trails.length - 200);
  }

  drawFx(fx) {
    const ctx = this.ctx, ts = this.ts;
    // Deferred ember/burn/smoke emitters requested during draw
    if (this._burnAt) { for (const [x, y] of this._burnAt) fx.burst(x, y, 1, { color: ['#ffb347', '#e0532f', '#ffd25e'], speed: 0.5, life: 0.45, gravity: -3, size: 0.07 }); this._burnAt = null; }
    if (this._ember) { for (const [x, y] of this._ember) fx.burst(x, y, 1, { color: ['#ffb347', '#e0532f'], speed: 0.4, life: 0.5, gravity: -2.5, size: 0.05 }); this._ember = null; }
    if (this._smokeAt) { fx.burst(this._smokeAt[0], this._smokeAt[1], 1, { color: ['#888', '#aaa'], speed: 0.3, life: 1, gravity: -1.2, size: 0.12 }); this._smokeAt = null; }
    for (const f of fx.flashes) {
      const k = 1 - f.t / f.life;
      ctx.fillStyle = f.color; ctx.globalAlpha = k * 0.8;
      ctx.beginPath(); ctx.arc(f.x * ts, f.y * ts, Math.max(0.1, f.r * ts * (0.6 + 0.4 * (1 - k))), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const r of fx.rings) {
      const k = r.t / r.life;
      ctx.strokeStyle = r.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = r.width * ts * (1 - k * 0.5);
      ctx.beginPath(); ctx.arc(r.x * ts, r.y * ts, Math.max(0.1, r.r * ts * (0.3 + 0.7 * k)), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const z of fx.zaps) {
      const k = 1 - z.t / z.life;
      ctx.strokeStyle = z.color; ctx.lineWidth = ts * 0.06 * k; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < z.points.length; i++) {
        const p = z.points[i];
        if (i === 0) { ctx.moveTo(p.x * ts, p.y * ts); continue; }
        const q = z.points[i - 1];
        for (let j = 1; j <= 3; j++) {
          const f = j / 4;
          ctx.lineTo((q.x + (p.x - q.x) * f) * ts + (Math.random() - 0.5) * ts * 0.25, (q.y + (p.y - q.y) * f) * ts + (Math.random() - 0.5) * ts * 0.25);
        }
        ctx.lineTo(p.x * ts, p.y * ts);
      }
      ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = ts * 0.02 * k; ctx.stroke();
    }
    for (const p of fx.parts) {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.fillStyle = p.color;
      const r = Math.max(0.1, p.size * ts * (0.5 + 0.5 * k));
      if (p.shape === 'rect') { ctx.save(); ctx.translate(p.x * ts, p.y * ts); ctx.rotate(p.spin); ctx.fillRect(-r, -r * 0.5, r * 2, r); ctx.restore(); }
      else if (p.shape === 'square') ctx.fillRect(p.x * ts - r, p.y * ts - r, r * 2, r * 2);
      else if (p.shape === 'star') star(ctx, p.x * ts, p.y * ts, r * 1.4);
      else { ctx.beginPath(); ctx.arc(p.x * ts, p.y * ts, r, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    for (const t of fx.texts) {
      const k = 1 - t.t / t.life;
      const pop = t.t < 0.12 ? 1 + (0.12 - t.t) * 4 : 1;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `${t.bold ? 800 : 700} ${Math.round(t.size * ts * pop)}px "Baloo 2", system-ui`;
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, ts * 0.08);
      ctx.strokeText(t.str, t.x * ts, t.y * ts); ctx.fillStyle = t.color; ctx.fillText(t.str, t.x * ts, t.y * ts);
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- enemy art ----------
const GEAR_WEAPONS = ['club', 'sword', 'axe', 'halberd', 'flail', 'glaive'];

function drawSoldierEnemy(ctx, s, col, e, type) {
  const tier = Math.min(GEAR_WEAPONS.length - 1, e.gear || 0);
  const isBoss = type.startsWith('boss_');
  // body
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.ellipse(0, -s * 0.15, s * 0.62, s * 0.55, 0, 0, TAU); ctx.fill(); ctx.stroke();
  // belt
  ctx.fillStyle = shade(col, -0.35); ctx.fillRect(-s * 0.55, -s * 0.05, s * 1.1, s * 0.14);
  // head
  ctx.fillStyle = '#f2d1a8'; ctx.beginPath(); ctx.arc(s * 0.05, -s * 0.78, s * 0.36, 0, TAU); ctx.fill(); ctx.stroke();
  // eye
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(s * 0.2, -s * 0.8, s * 0.06, 0, TAU); ctx.fill();
  // helmet by gear tier
  const helm = ['#8a5a32', '#9aa1b0', '#7d8394', '#c9a24b', '#5b5f6b', '#2f3240'][tier];
  if (type === 'healer') {
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(s * 0.05, -s * 0.88, s * 0.38, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d9473b'; ctx.fillRect(-s * 0.1, -s * 0.35, s * 0.2, s * 0.5); ctx.fillRect(-s * 0.25, -s * 0.2, s * 0.5, s * 0.2);
  } else if (type === 'warlock' || type === 'boss_lich') {
    ctx.fillStyle = type === 'boss_lich' ? '#2c4d66' : '#3a2160';
    ctx.beginPath(); ctx.moveTo(-s * 0.35, -s * 0.9); ctx.lineTo(s * 0.1, -s * 1.7); ctx.lineTo(s * 0.45, -s * 0.9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = type === 'boss_lich' ? '#9fe7ff' : '#c79bff'; ctx.beginPath(); ctx.arc(-s * 0.55, -s * 0.5, s * 0.14, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-s * 0.55, -s * 0.36); ctx.lineTo(-s * 0.55, s * 0.3); ctx.stroke();
  } else if (type === 'runner') {
    ctx.fillStyle = '#d4af6a'; ctx.beginPath(); ctx.arc(s * 0.05, -s * 0.9, s * 0.36, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); ctx.stroke();
  } else if (type === 'sapper') {
    ctx.fillStyle = '#2d2f36'; ctx.beginPath(); ctx.arc(-s * 0.55, -s * 0.15, s * 0.3, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#f2b33d'; ctx.beginPath(); ctx.moveTo(-s * 0.55, -s * 0.45); ctx.quadraticCurveTo(-s * 0.4, -s * 0.7, -s * 0.6, -s * 0.8); ctx.stroke();
    ctx.fillStyle = '#5b5f6b'; ctx.beginPath(); ctx.arc(s * 0.05, -s * 0.9, s * 0.37, Math.PI, 0); ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
  } else {
    ctx.fillStyle = helm; ctx.beginPath(); ctx.arc(s * 0.05, -s * 0.88, s * 0.38, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (tier >= 2) { ctx.fillStyle = '#d9473b'; ctx.beginPath(); ctx.moveTo(s * 0.05, -s * 1.25); ctx.lineTo(-s * 0.15, -s * 1.45); ctx.lineTo(s * 0.0, -s * 1.15); ctx.fill(); }
  }
  // weapon / held item
  if (type === 'shield') {
    ctx.fillStyle = '#9aa1b0'; ctx.beginPath(); ctx.moveTo(s * 0.35, -s * 0.7); ctx.lineTo(s * 0.85, -s * 0.7); ctx.lineTo(s * 0.85, -s * 0.1); ctx.quadraticCurveTo(s * 0.6, s * 0.3, s * 0.35, -s * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d9473b'; ctx.fillRect(s * 0.55, -s * 0.6, s * 0.1, s * 0.5);
  } else if (type === 'archer') {
    ctx.strokeStyle = '#5e3a1a'; ctx.lineWidth = s * 0.12; ctx.beginPath(); ctx.arc(s * 0.4, -s * 0.35, s * 0.45, -1.2, 1.2); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = s * 0.04; ctx.beginPath(); ctx.moveTo(s * 0.55, -s * 0.78); ctx.lineTo(s * 0.55, s * 0.08); ctx.stroke();
  } else if (type === 'warchief') {
    ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-s * 0.5, s * 0.1); ctx.lineTo(-s * 0.5, -s * 1.6); ctx.stroke();
    ctx.fillStyle = '#d9473b'; ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 1.6); ctx.lineTo(-s * 1.1, -s * 1.45); ctx.lineTo(-s * 0.5, -s * 1.25); ctx.fill(); ctx.stroke();
    drawWeapon(ctx, s, tier);
  } else if (type !== 'healer' && type !== 'warlock' && type !== 'sapper' && type !== 'boss_lich') {
    drawWeapon(ctx, s, tier, isBoss);
  }
  if (type === 'boss_warlord') {
    ctx.fillStyle = '#f2b33d'; ctx.beginPath();
    ctx.moveTo(-s * 0.25, -s * 1.18); ctx.lineTo(-s * 0.2, -s * 1.45); ctx.lineTo(-s * 0.05, -s * 1.28); ctx.lineTo(s * 0.05, -s * 1.5); ctx.lineTo(s * 0.15, -s * 1.28); ctx.lineTo(s * 0.3, -s * 1.45); ctx.lineTo(s * 0.35, -s * 1.18); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

function drawWeapon(ctx, s, tier, big) {
  const k = big ? 1.3 : 1;
  ctx.save(); ctx.translate(s * 0.5, -s * 0.3); ctx.rotate(-0.5);
  ctx.strokeStyle = '#5e3a1a'; ctx.lineWidth = s * 0.12 * k;
  const len = [0.7, 0.8, 0.8, 1.2, 0.9, 1.2][tier] * s * k;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len); ctx.stroke();
  ctx.lineWidth = s * 0.05; ctx.strokeStyle = INK;
  ctx.fillStyle = tier === 5 ? '#9a7ad8' : '#d9dde6';
  switch (GEAR_WEAPONS[tier]) {
    case 'club': ctx.fillStyle = '#8a5a32'; ctx.beginPath(); ctx.ellipse(0, -len, s * 0.16 * k, s * 0.24 * k, 0, 0, TAU); ctx.fill(); ctx.stroke(); break;
    case 'sword': ctx.beginPath(); ctx.moveTo(-s * 0.07, -len * 0.4); ctx.lineTo(0, -len * 1.35); ctx.lineTo(s * 0.07, -len * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case 'axe': ctx.beginPath(); ctx.moveTo(0, -len); ctx.quadraticCurveTo(s * 0.45 * k, -len - s * 0.1, s * 0.3 * k, -len + s * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case 'halberd': ctx.beginPath(); ctx.moveTo(0, -len - s * 0.3); ctx.lineTo(s * 0.25, -len + s * 0.05); ctx.lineTo(0, -len + s * 0.15); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case 'flail': ctx.strokeStyle = '#7d8394'; ctx.beginPath(); ctx.moveTo(0, -len); ctx.lineTo(s * 0.25, -len - s * 0.2); ctx.stroke(); ctx.fillStyle = '#5b5f6b'; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(s * 0.3, -len - s * 0.25, s * 0.16 * k, 0, TAU); ctx.fill(); ctx.stroke(); break;
    default: ctx.beginPath(); ctx.moveTo(0, -len); ctx.quadraticCurveTo(s * 0.4, -len - s * 0.3, s * 0.15, -len - s * 0.55); ctx.lineTo(0, -len - s * 0.1); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawWyvern(ctx, s, col, t, boss) {
  const flap = Math.sin(t * (boss ? 5 : 10)) * 0.6;
  ctx.fillStyle = shade(col, -0.15);
  for (const side of [-1, 1]) {
    ctx.save(); ctx.scale(1, 1); ctx.rotate(side * 0.1);
    ctx.beginPath(); ctx.moveTo(0, -s * 0.3);
    ctx.lineTo(side * s * 1.2, -s * (0.9 + flap * side * 0.3)); ctx.lineTo(side * s * 0.9, -s * 0.1); ctx.lineTo(side * s * 0.4, -s * 0.15); ctx.closePath();
    ctx.fill(); ctx.stroke(); ctx.restore();
  }
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -s * 0.2, s * 0.55, s * 0.38, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(s * 0.55, -s * 0.5, s * 0.28, s * 0.22, -0.4, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff6c2'; ctx.beginPath(); ctx.arc(s * 0.65, -s * 0.56, s * 0.07, 0, TAU); ctx.fill();
  ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.15); ctx.quadraticCurveTo(-s * 0.9, -s * 0.05, -s * 1.0, -s * 0.35); ctx.stroke();
  if (boss) { ctx.fillStyle = '#ffb347'; ctx.globalAlpha *= 0.6; ctx.beginPath(); ctx.arc(s * 0.85, -s * 0.5, s * 0.12, 0, TAU); ctx.fill(); ctx.globalAlpha /= 0.6; }
}

function drawCavalry(ctx, s, col, t, gear) {
  const leg = Math.sin(t) * s * 0.15;
  ctx.fillStyle = '#8a5a32';
  ctx.beginPath(); ctx.ellipse(0, -s * 0.1, s * 0.75, s * 0.35, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = s * 0.12;
  for (const [lx, d] of [[-0.45, 1], [0.45, -1]]) { ctx.beginPath(); ctx.moveTo(lx * s, s * 0.1); ctx.lineTo(lx * s + leg * d, s * 0.45); ctx.stroke(); }
  ctx.lineWidth = s * 0.06;
  ctx.fillStyle = '#8a5a32'; ctx.beginPath(); ctx.ellipse(s * 0.75, -s * 0.45, s * 0.22, s * 0.32, 0.5, 0, TAU); ctx.fill(); ctx.stroke();
  // rider
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(-s * 0.05, -s * 0.6, s * 0.3, s * 0.35, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#9aa1b0'; ctx.beginPath(); ctx.arc(-s * 0.05, -s * 1.05, s * 0.22, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#5e3a1a'; ctx.lineWidth = s * 0.08; ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.5); ctx.lineTo(s * 1.0, -s * 0.95); ctx.stroke();
  ctx.fillStyle = gear >= 3 ? '#c9a24b' : '#d9dde6'; ctx.strokeStyle = INK; ctx.lineWidth = s * 0.05;
  ctx.beginPath(); ctx.moveTo(s * 1.15, -s * 1.02); ctx.lineTo(s * 0.92, -s * 1.05); ctx.lineTo(s * 0.98, -s * 0.86); ctx.closePath(); ctx.fill(); ctx.stroke();
}

function drawRam(ctx, s, col, t) {
  ctx.fillStyle = shade(col, 0.1);
  roundRect(ctx, -s * 0.85, -s * 0.75, s * 1.6, s * 0.65, s * 0.12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8a5a32'; ctx.beginPath(); ctx.moveTo(-s * 0.9, -s * 0.75); ctx.lineTo(0, -s * 1.15); ctx.lineTo(s * 0.8, -s * 0.75); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5e3a1a'; roundRect(ctx, -s * 0.4, -s * 0.5, s * 1.55, s * 0.2, s * 0.06); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#7d8394'; ctx.beginPath(); ctx.arc(s * 1.15, -s * 0.4, s * 0.18, 0, TAU); ctx.fill(); ctx.stroke();
  for (const wx of [-0.55, 0.45]) {
    ctx.save(); ctx.translate(wx * s, -s * 0.08); ctx.rotate(t);
    ctx.fillStyle = '#5e3a1a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.24, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.2, 0); ctx.lineTo(s * 0.2, 0); ctx.stroke();
    ctx.restore();
  }
}

function drawSpider(ctx, s, col, t) {
  ctx.strokeStyle = INK; ctx.lineWidth = s * 0.1;
  for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
    const w = Math.sin(t + i) * s * 0.1;
    ctx.beginPath(); ctx.moveTo(side * s * 0.2, -s * 0.2); ctx.lineTo(side * s * 0.75, -s * 0.55 + i * s * 0.18 + w); ctx.lineTo(side * s * 0.9, s * 0.15 + i * s * 0.05); ctx.stroke();
  }
  ctx.lineWidth = s * 0.06;
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(-s * 0.2, -s * 0.25, s * 0.5, s * 0.42, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(s * 0.35, -s * 0.25, s * 0.26, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffdf6b'; ctx.beginPath(); ctx.arc(s * 0.45, -s * 0.3, s * 0.06, 0, TAU); ctx.arc(s * 0.32, -s * 0.33, s * 0.05, 0, TAU); ctx.fill();
}

function drawGolem(ctx, s, col, boss) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(-s * 0.7, s * 0.2); ctx.lineTo(-s * 0.8, -s * 0.6); ctx.lineTo(-s * 0.3, -s * 1.05); ctx.lineTo(s * 0.4, -s * 1.0); ctx.lineTo(s * 0.8, -s * 0.5); ctx.lineTo(s * 0.7, s * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = shade(col, -0.2);
  ctx.beginPath(); ctx.arc(-s * 0.3, -s * 0.4, s * 0.15, 0, TAU); ctx.arc(s * 0.3, -s * 0.2, s * 0.12, 0, TAU); ctx.fill();
  ctx.fillStyle = boss ? '#ff6a3d' : '#7fd3f2'; ctx.beginPath(); ctx.arc(s * 0.2, -s * 0.72, s * 0.1, 0, TAU); ctx.fill(); ctx.stroke();
  if (boss) { ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.arc(-s * 0.95, -s * 0.3, s * 0.3, 0, TAU); ctx.arc(s * 0.95, -s * 0.3, s * 0.3, 0, TAU); ctx.fill(); ctx.stroke(); }
}

function drawRock(g, cx, cy, ts, B) {
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(cx + ts * 0.04, cy + ts * 0.25, ts * 0.38, ts * 0.14, 0, 0, TAU); g.fill();
  g.fillStyle = '#9aa1b0'; g.strokeStyle = INK; g.lineWidth = ts * 0.04;
  g.beginPath(); g.moveTo(cx - ts * 0.38, cy + ts * 0.22); g.lineTo(cx - ts * 0.3, cy - ts * 0.15); g.lineTo(cx - ts * 0.05, cy - ts * 0.32); g.lineTo(cx + ts * 0.28, cy - ts * 0.18); g.lineTo(cx + ts * 0.38, cy + ts * 0.22); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#c3c8d2'; g.beginPath(); g.moveTo(cx - ts * 0.22, cy - ts * 0.1); g.lineTo(cx - ts * 0.05, cy - ts * 0.24); g.lineTo(cx + ts * 0.05, cy - ts * 0.05); g.closePath(); g.fill();
}

function drawTree(g, cx, cy, ts, bi, r) {
  const k = 0.85 + r * 0.3;
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(cx + ts * 0.04, cy + ts * 0.3, ts * 0.32 * k, ts * 0.12, 0, 0, TAU); g.fill();
  g.strokeStyle = INK; g.lineWidth = ts * 0.04;
  g.fillStyle = '#7a5130'; g.fillRect(cx - ts * 0.05, cy + ts * 0.05, ts * 0.1, ts * 0.25); g.strokeRect(cx - ts * 0.05, cy + ts * 0.05, ts * 0.1, ts * 0.25);
  if (bi === 1) { // cactus
    g.fillStyle = '#5f9a3a'; roundRect(g, cx - ts * 0.1, cy - ts * 0.35, ts * 0.2, ts * 0.6, ts * 0.1); g.fill(); g.stroke();
    roundRect(g, cx + ts * 0.08, cy - ts * 0.15, ts * 0.16, ts * 0.08, ts * 0.04); g.fill(); g.stroke();
    return;
  }
  const leaf = ['#4f8f3a', '#4f8f3a', '#e8f3f8', '#5a4a48', '#4a3d6b'][bi];
  const leaf2 = ['#68a84a', '#68a84a', '#ffffff', '#7a6a62', '#6a5a8f'][bi];
  if (bi === 2 || bi === 4) {
    g.fillStyle = bi === 2 ? '#3f7a5a' : leaf;
    for (let i = 0; i < 3; i++) { const w = ts * (0.36 - i * 0.08) * k, yy = cy - ts * (0.02 + i * 0.18) * k; g.beginPath(); g.moveTo(cx - w, yy + ts * 0.1); g.lineTo(cx, yy - ts * 0.22); g.lineTo(cx + w, yy + ts * 0.1); g.closePath(); g.fill(); g.stroke(); }
    if (bi === 2) { g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(cx - ts * 0.12, cy - ts * 0.32); g.lineTo(cx, cy - ts * 0.48); g.lineTo(cx + ts * 0.12, cy - ts * 0.32); g.fill(); }
    return;
  }
  g.fillStyle = leaf; g.beginPath(); g.arc(cx, cy - ts * 0.12, ts * 0.32 * k, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = leaf2; g.beginPath(); g.arc(cx - ts * 0.08, cy - ts * 0.2, ts * 0.14 * k, 0, TAU); g.fill();
}

// ---------- helpers ----------
export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2; const rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return '#' + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
}

// Small icon renderer used by the UI (tower buttons, bestiary, previews).
export function drawIcon(canvas, kind, id, opts = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = opts.size || 48;
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
  const r = new Renderer(canvas);
  r.ts = size * 0.62; r.time = 1;
  const ctx = r.ctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  if (kind === 'tower') {
    r.drawTower({ type: id, cx: size / 2 / r.ts, cy: (size * 0.66) / r.ts, tier: 1, aim: -0.6, recoil: 0, soldiers: [], ghost: true, hp: 1, maxHp: 1 }, null);
  } else if (kind === 'enemy') {
    const boss = id.startsWith('boss:') ? id.slice(5) : null;
    const def = opts.def;
    r.ts = size * (boss ? 0.62 : 0.3 / Math.max(0.2, def.size));
    const e = { x: size / 2 / r.ts, y: (size * (boss ? 0.8 : 0.8)) / r.ts, size: def.size, color: opts.silhouette ? '#3a3f52' : def.color, type: boss ? 'boss' : id, boss, gear: opts.gear || 0, vx: 0.1, vy: 0, bob: 0, hp: 1, maxHp: 1, air: !!def.air, speed: 0, flash: 0, shield: 0, slowT: 0, burnT: 0, stunT: 0, stealthT: 0, buffT: 0 };
    if (opts.silhouette) ctx.globalAlpha = 0.9;
    r.drawEnemy(e, null);
  }
}
