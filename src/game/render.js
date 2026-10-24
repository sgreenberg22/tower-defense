// Canvas renderer. Procedural "tabletop minis" art: chunky ink outlines, flat fills, soft drop shadows.
import { TOWERS, BIOMES, TROOPS } from '../data/balance.js';
import { T } from './maps.js';
import { biomeIndex } from './waves.js';
import { INK, TAU, roundRect, star, shade, easeOutBack, clamp01, angleLerp } from './draw-util.js';
import { drawEnemySprite, drawSoldierSprite, drawHero } from './sprites.js';
import { drawTroopSprite } from './troop-sprites.js';
import { drawCastleBody, drawPalisade } from './castle-art.js';
import { paintGround, paintRoads, paintCamps, paintProps, drawTreeV2 } from './scenery.js';

export { roundRect, shade };

export const CASTLE_SKINS = {
  stone: { wall: '#cfc8b6', wall2: '#a79f8c', roof: '#a8323a', flag: '#f2b33d' },
  royal: { wall: '#eef0f7', wall2: '#c7cbe0', roof: '#7a3fc4', flag: '#f2b33d' },
  obsidian: { wall: '#4a4f63', wall2: '#363a4c', roof: '#d9473b', flag: '#f2b33d' },
  candy: { wall: '#ffd9e6', wall2: '#f5b8cf', roof: '#5ec2b7', flag: '#ff7aa8' },
  gold: { wall: '#f5d77a', wall2: '#ddb84e', roof: '#b8233a', flag: '#ffffff' },
  azure: { wall: '#d7e4f2', wall2: '#a9c1dc', roof: '#2f7fd1', flag: '#ffffff' },
  verdant: { wall: '#cfe0c0', wall2: '#9db98a', roof: '#2f7a46', flag: '#f2b33d' },
  crimson: { wall: '#e5c9bd', wall2: '#c19a8a', roof: '#a8292f', flag: '#f2b33d' },
  frost: { wall: '#f2fbff', wall2: '#bfdbe8', roof: '#4aa3c9', flag: '#ffffff' },
  sunset: { wall: '#ffd9b0', wall2: '#f2b07e', roof: '#c24a7a', flag: '#ffe08a' },
  midnight: { wall: '#5b6585', wall2: '#434b69', roof: '#2a2f4f', flag: '#9fe7ff' },
  // events
  haunted: { wall: '#8b7fa0', wall2: '#6a5e80', roof: '#e8731f', flag: '#9dff6b' },
  harvest: { wall: '#e7c98a', wall2: '#c79f58', roof: '#a8501f', flag: '#f2b33d' },
  snowkeep: { wall: '#f4f8ff', wall2: '#cfdcf0', roof: '#c4242f', flag: '#2f9e5a' },
  rosequartz: { wall: '#ffd1dc', wall2: '#f0a3b8', roof: '#c2185b', flag: '#ffffff' },
  blossom: { wall: '#fbe8ef', wall2: '#e8c4d2', roof: '#5fae6e', flag: '#ff8fb8' },
  sunstone: { wall: '#ffe9a8', wall2: '#f2c56a', roof: '#1f9ed6', flag: '#ff6b3d' },
  // achievements
  jade: { wall: '#c9e8d3', wall2: '#96c8a8', roof: '#1f7a5a', flag: '#f2e08a' },
  copper: { wall: '#e8b894', wall2: '#c28a60', roof: '#2f8f84', flag: '#ffd9a0' },
  // v1.8 · The Wild Marches
  bogwood: { wall: '#a89a78', wall2: '#857756', roof: '#3f6b46', flag: '#c8e07a' },
  serpent: { wall: '#bfe0c8', wall2: '#8fbf9c', roof: '#2f5a4a', flag: '#e8c84a' },
  starforged: { wall: '#3a3f6b', wall2: '#2a2e52', roof: '#e8c84a', flag: '#9fe7ff' },
  thunder: { wall: '#d7dce8', wall2: '#a9b1c4', roof: '#4a5aa8', flag: '#ffe96b' },
  // v1.10 · Prestige
  dynasty: { wall: '#e8dcff', wall2: '#b9a5e3', roof: '#6a3fc4', flag: '#ffd45a' },
  eternal: { wall: '#fff3d0', wall2: '#e0c987', roof: '#2b2b33', flag: '#ffd45a' },
};
// Hero outfits (Wardrobe → Hero). cape: null uses the castle's roof colour. hat: helm | hood | crown | tricorn | wizard.
export const HERO_OUTFITS = {
  classic: { tunic: '#3d7bd9', cape: null, hat: 'helm', plume: '#d9473b' },
  ranger: { tunic: '#3f7a46', cape: '#6b4a2a', hat: 'hood' },
  corsair: { tunic: '#b8233a', cape: '#1e2433', hat: 'tricorn', plume: '#f2b33d' },
  wizard: { tunic: '#3a2160', cape: '#5b3a9a', hat: 'wizard' },
  royal: { tunic: '#7a3fc4', cape: '#c4242f', hat: 'crown' },
  shadow: { tunic: '#2a2f4f', cape: '#141824', hat: 'hood' },
  paladin: { tunic: '#eef0f7', cape: '#f2b33d', hat: 'helm', plume: '#f2b33d' },
  frost: { tunic: '#bfdbe8', cape: '#4aa3c9', hat: 'hood' },
  bogwalker: { tunic: '#5f8a5a', cape: '#3f5a3a', hat: 'tricorn', plume: '#c8e07a' },
  monarch: { tunic: '#4a2a8a', cape: '#ffd45a', hat: 'crown' },
  dragonlord: { tunic: '#7a1f1f', cape: '#22181a', hat: 'helm', plume: '#ffb02e' },
};
// Tower stone colours: [light, shade].
export const TOWER_SKINS = {
  classic: ['#bfc4cf', '#9aa1b0'], marble: ['#eceef3', '#cfd3de'], ironwood: ['#6b5a4a', '#54473a'],
  sandstone: ['#e6cf9c', '#c9ae78'], moss: ['#9bb88a', '#789868'], frostglass: ['#cfeaf6', '#a6cfe3'],
  obsidian: ['#4d5266', '#383c4d'], gilded: ['#f0d27a', '#d1ab45'],
  bone: ['#efe6d0', '#cbbf9f'], oak: ['#b08a5a', '#8a6a40'], candy: ['#ffffff', '#e8a0a8'], rose: ['#f6b8c8', '#d98aa2'],
  lichen: ['#b6d6a0', '#8fb878'], coral: ['#ffb59a', '#e88d73'], jade: ['#b9e0c6', '#86bd9a'], copper: ['#d9966a', '#b0714a'],
  crystal: ['#d9ccff', '#b3a3ee'], emberbrick: ['#c96a4a', '#a24e36'], bogwood: ['#8a7a58', '#6b5d40'],
  amethyst: ['#e6d9ff', '#b79de8'], sunsteel: ['#f6dc9a', '#d0a24c'],
};
export const TRAILS = {
  none: null, ember: ['#ffb347', '#e0532f'], frost: ['#bfefff', '#7fd3f2'], rainbow: ['#ff5e5e', '#ffd25e', '#5eff8a', '#5ecbff', '#c55eff'], starlight: ['#ffffff', '#fff6c2'],
  sunset: ['#ff9a5e', '#ff5e8a', '#c55eff'], gold: ['#ffe08a', '#f2b33d'], emerald: ['#5effb0', '#1fae6b'],
  sakura: ['#ffc2d9', '#ff8fb8'], ocean: ['#5ecbff', '#1f6fd1'], shadow: ['#6b4fa0', '#2a1f40'],
  ghostfire: ['#b8ff8a', '#4fd66b'], autumn: ['#e0782b', '#b8431f', '#f2b33d'], snowflake: ['#ffffff', '#bfe6ff'], hearts: ['#ff7aa8', '#ff3d7f'],
  petalstorm: ['#ffc2d9', '#fff0a8'], firework: ['#ff5e5e', '#ffd25e', '#5ecbff'], comet: ['#ffffff', '#9fd8ff', '#5e8bff'], toxic: ['#c8ff3d', '#5fbf1f'],
  venom: ['#a0e65a', '#3f7a5a', '#e8ff9a'], aurora: ['#5effc8', '#5ecbff', '#c55eff'], thunder: ['#ffffff', '#ffe96b', '#9fb4ff'],
  monarch: ['#ffd45a', '#b58cff', '#ffffff'], eclipse: ['#2a2a44', '#ffd45a', '#ffffff'],
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
    this.quality = 'high'; this.reduced = false;
    this.cosmetics = { castle: 'stone', trail: 'none', towerSkin: 'classic', hero: 'classic' };
    this.charge = null;         // {x,y,amount}
    this.trails = [];
    this.clanBanner = null;
    this.anim = new WeakMap();  // per-entity animation state (walk phase, flinch, blink)
    this.corpses = [];          // dying enemies playing their tumble
    this.loot = [];             // tappable gems
    this.heroAim = -Math.PI / 2; this.heroKick = 0;
    this.dt = 0; this.fx = null;
    this.ambient = true;
    this.theme = null;          // seasonal look: {tint, fall, emoji}
  }

  // ---------- animation state ----------
  animState(e, dt) {
    let st = this.anim.get(e);
    if (!st) { st = { ph: e.bob || 0, age: 0, hit: 0, blinkT: 1 + Math.random() * 3, blink: false, lx: e.x, ly: e.y, face: 1, moving: false, attack: false, dead: null, t: 0, ph0: 0 }; this.anim.set(e, st); }
    const size = e.size || 0.25;
    if (dt > 0) {
      st.age += dt;
      const moved = Math.hypot(e.x - st.lx, e.y - st.ly);
      st.lx = e.x; st.ly = e.y;
      st.moving = moved > 0.0004 && !(e.stunT > 0);
      if (st.moving) st.ph += (moved / (size * 0.9)) * Math.PI;
      if (e.vx < -0.01) st.face = -1; else if (e.vx > 0.01) st.face = 1;
      if (e.flash > 0) st.hit = 1; else st.hit = Math.max(0, st.hit - dt * 5);
      st.blinkT -= dt; if (st.blinkT <= 0) { st.blink = true; st.blinkEnd = 0.12; st.blinkT = 2 + Math.random() * 3.5; }
      if (st.blink) { st.blinkEnd -= dt; if (st.blinkEnd <= 0) st.blink = false; }
      st.attack = !!e.blocker || !!(e.def && e.def.shoots && e.cd < 0.35);
    }
    st.t = this.time + (e.bob || 0) * 3;
    return st;
  }

  addCorpse(e) {
    if (this.corpses.length > 60) this.corpses.shift();
    const old = this.anim.get(e) || { ph: 0, face: 1 };
    this.corpses.push({
      e: { x: e.x, y: e.y, size: e.size, color: e.color, type: e.type, boss: e.boss, gear: e.gear, air: e.air, vx: old.face, vy: 0, bob: e.bob, def: e.def, speed: e.speed, stealthT: 0, flash: 0, shield: 0, slowT: 0, burnT: 0, stunT: 0, buffT: 0, hp: 1, maxHp: 1 },
      st: { ph: old.ph, t: this.time, moving: false, hit: 1, blink: false, attack: false, face: old.face, dead: 0, age: 9 },
      t: 0, life: e.boss ? 1.1 : e.size > 0.38 ? 0.8 : 0.55, dir: Math.random() < 0.5 ? -1 : 1,
    });
  }

  onHeroShot(x, y, cx, cy) { this.heroKick = 1; this.heroAim = Math.atan2(y - cy, x - cx); }

  addLoot(x, y, value, kind = 'gem') {
    if (this.loot.length > 40) this.loot.shift();
    this.loot.push({ x, y, value, kind, t: 0, life: 7, vx: (Math.random() - 0.5) * 1.6, vy: -2 - Math.random(), z: 0, spin: Math.random() * 6 });
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
    this.gmap = m;
    // padRight (in tiles) leaves meadow beyond the board's right edge, so a castle standing at the edge is not cropped.
    const pad = this.padRight || 0;
    this.ts = Math.floor(Math.min(this.w / (m.cols + pad), this.h / m.rows));
    // Portrait phones: when the board is wider than the map needs, stretch the picture sideways a little (maxStretch) instead of leaving empty strips.
    this.kx = Math.max(1, Math.min(this.maxStretch || 1, this.w / (this.ts * (m.cols + pad))));
    this.vw = this.w / this.kx;
    this.ox = Math.floor((this.vw - this.ts * (m.cols + pad)) / 2);
    this.oy = Math.floor((this.h - this.ts * m.rows) / 2);
    this.bgKey = '';
  }

  toWorld(px, py) { return { x: (px / (this.kx || 1) - this.ox) / this.ts, y: (py - this.oy) / this.ts }; }

  // ---------- background ----------
  // The biome palette for this wave. A chosen theme can repaint the meadow (the first land); other lands keep their own look.
  biome(game) {
    const bi = (game.biomeIdx ? game.biomeIdx() : biomeIndex(game.wave)), B = BIOMES[bi], G = this.theme?.ground;
    return G && bi === 0 ? { ...B, ...G } : B;
  }

  buildBg(game) {
    const bi = (game.biomeIdx ? game.biomeIdx() : biomeIndex(game.wave));
    const key = `${bi}|${this.ts}|${game.map.id}|${game.mapSeed || game.seed}|${this.dpr}|${this.colorblind}|${this.theme?.ground ? this.theme.id : ''}|${this.padRight || 0}|${this.noTall ? 1 : 0}`;
    if (key === this.bgKey) return;
    this.bgKey = key;
    const m = game.map, ts = this.ts, B = this.biome(game);
    const W = m.cols * ts, H = m.rows * ts, PW = W + (this.padRight || 0) * ts;
    this.bg.width = Math.round(PW * this.dpr); this.bg.height = Math.round(H * this.dpr);
    const g = this.bg.getContext('2d');
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    let r = 1234 + bi * 99;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    paintGround(g, m, ts, B, bi, rnd, PW);
    paintProps(g, m, ts, B, bi, rnd);
    paintRoads(g, m, ts, B, bi, rnd);
    // Mud: wet, dark patches on the road that slow walkers.
    if (m.mud) {
      for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
        if (!m.mud[y * m.cols + x]) continue;
        const cx = (x + 0.5) * ts, cy = (y + 0.5) * ts;
        g.fillStyle = bi === 2 ? '#7d93a6' : bi === 3 ? '#3a2622' : '#6b5232';
        g.beginPath(); g.ellipse(cx, cy, ts * 0.48, ts * 0.42, 0.3, 0, TAU); g.fill();
        g.fillStyle = bi === 2 ? '#93abbf' : '#7d6240';
        for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(cx + (rnd() - 0.5) * ts * 0.6, cy + (rnd() - 0.5) * ts * 0.5, ts * 0.1, ts * 0.06, rnd(), 0, TAU); g.fill(); }
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = ts * 0.03;
        g.beginPath(); g.arc(cx + ts * 0.12, cy - ts * 0.1, ts * 0.08, Math.PI * 1.1, Math.PI * 1.8); g.stroke();
      }
    }
    // Tiles: high ground, rocks, water, trees, rally flags
    for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
      const t = m.tileAt(x, y);
      const cx = (x + 0.5) * ts, cy = (y + 0.5) * ts;
      if (t === T.HIGH) {
        // A raised stone terrace: grassy top, masonry face and a gold-flecked lip
        const x0 = x * ts + ts * 0.05, y0 = y * ts + ts * 0.04, w0 = ts * 0.9, top = ts * 0.66, face = ts * 0.24;
        g.fillStyle = 'rgba(0,0,0,0.22)'; roundRect(g, x0 + ts * 0.03, y0 + ts * 0.1, w0, top + face, ts * 0.12); g.fill();
        g.strokeStyle = INK; g.lineWidth = ts * 0.04;
        g.fillStyle = '#8f8878'; roundRect(g, x0, y0 + top - ts * 0.1, w0, face + ts * 0.1, ts * 0.06); g.fill(); g.stroke();
        g.strokeStyle = 'rgba(30,36,51,0.28)'; g.lineWidth = ts * 0.02;
        for (let i = 0; i < 4; i++) { const bx = x0 + ts * (0.1 + i * 0.22); g.beginPath(); g.moveTo(bx, y0 + top); g.lineTo(bx, y0 + top + face - ts * 0.02); g.stroke(); }
        g.fillStyle = shade(B.grass, 0.14); g.strokeStyle = INK; g.lineWidth = ts * 0.04;
        roundRect(g, x0, y0, w0, top, ts * 0.12); g.fill(); g.stroke();
        g.fillStyle = shade(B.grass, 0.24); g.fillRect(x0 + ts * 0.08, y0 + ts * 0.06, w0 - ts * 0.16, ts * 0.05);
      } else if (t === T.ROCK) {
        if (!this.noTall) drawRock(g, cx, cy, ts, B);
      } else if (t === T.WATER) {
        g.fillStyle = bi === 2 ? '#bfe6f5' : bi === 3 ? '#e0632f' : '#5aa7d8';
        roundRect(g, x * ts + ts * 0.04, y * ts + ts * 0.04, ts * 0.92, ts * 0.92, ts * 0.28); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = ts * 0.04;
        g.beginPath(); g.arc(cx - ts * 0.12, cy, ts * 0.12, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
        g.beginPath(); g.arc(cx + ts * 0.14, cy + ts * 0.18, ts * 0.1, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      } else if (t === T.TREE) {
        const tr = rnd(); if (!this.noTall) drawTreeV2(g, cx, cy, ts, bi, tr);
      }
      if (m.rally.has(y * m.cols + x) && m.plotSet?.has(y * m.cols + x)) {
        // Rally plot (+10% fire rate): a small pennant beside the foundation.
        g.strokeStyle = INK; g.lineWidth = ts * 0.03;
        g.beginPath(); g.moveTo(cx + ts * 0.36, cy + ts * 0.2); g.lineTo(cx + ts * 0.36, cy - ts * 0.3); g.stroke();
        g.fillStyle = '#f2b33d'; g.beginPath(); g.moveTo(cx + ts * 0.36, cy - ts * 0.3); g.lineTo(cx + ts * 0.5, cy - ts * 0.24); g.lineTo(cx + ts * 0.36, cy - ts * 0.17); g.closePath(); g.fill(); g.stroke();
      }
    }
    // The enemy's war camps, where each road begins
    paintCamps(g, m, ts, B, bi);
    // Board frame
    if (!this.padRight) { g.strokeStyle = INK; g.lineWidth = ts * 0.06; g.strokeRect(0, 0, W, H); }
  }

  // ---------- build plots ----------
  // Open plots are stone foundations; ruins are rubble with a claim price. While placing, free plots glow.
  drawPlots(game, ui = {}) {
    if (!game.map.plots) return;
    const ctx = this.ctx; let ts = this.ts;
    const placing = ui.placing && !TOWERS[ui.placing]?.trap;
    const cost = game.claimCost ? game.claimCost() : 0;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    ctx.lineJoin = 'round';
    for (const p of game.map.plots) {
      if (game.towerAt(p.x, p.y)) continue;
      this.beginItem?.(p.x + 0.5, p.y + 0.55, game.map.tileAt(p.x, p.y) === T.HIGH ? 0.45 : 0); ts = this.ts;
      const cx = (p.x + 0.5) * ts, cy = (p.y + 0.55) * ts;
      const open = game.claimed.has(p.k);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(cx + ts * 0.03, cy + ts * 0.12, ts * 0.4, ts * 0.2, 0, 0, TAU); ctx.fill();
      if (open) {
        if (placing) {
          ctx.fillStyle = `rgba(255,214,102,${0.18 + 0.22 * pulse})`;
          ctx.beginPath(); ctx.ellipse(cx, cy, ts * 0.5, ts * 0.32, 0, 0, TAU); ctx.fill();
        }
        // Flagstone foundation
        ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.04;
        ctx.fillStyle = '#9c927f'; ctx.beginPath(); ctx.ellipse(cx, cy + ts * 0.05, ts * 0.38, ts * 0.21, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d8ceb6'; ctx.beginPath(); ctx.ellipse(cx, cy - ts * 0.01, ts * 0.38, ts * 0.21, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(30,36,51,0.35)'; ctx.lineWidth = ts * 0.025;
        ctx.beginPath(); ctx.ellipse(cx, cy - ts * 0.01, ts * 0.24, ts * 0.12, 0, 0, TAU); ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + Math.PI / 4;
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * ts * 0.24, cy - ts * 0.01 + Math.sin(a) * ts * 0.12); ctx.lineTo(cx + Math.cos(a) * ts * 0.37, cy - ts * 0.01 + Math.sin(a) * ts * 0.2); ctx.stroke();
        }
        if (p.high) { ctx.fillStyle = '#f2b33d'; ctx.beginPath(); ctx.moveTo(cx - ts * 0.07, cy + ts * 0.02); ctx.lineTo(cx, cy - ts * 0.07); ctx.lineTo(cx + ts * 0.07, cy + ts * 0.02); ctx.closePath(); ctx.fill(); }
      } else {
        // Overgrown ruin
        ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.035;
        ctx.fillStyle = '#7d7466';
        ctx.beginPath(); ctx.ellipse(cx, cy + ts * 0.04, ts * 0.34, ts * 0.17, 0, 0, TAU); ctx.fill(); ctx.stroke();
        const stones = [[-0.18, -0.02, 0.11], [0.12, -0.05, 0.09], [0.02, 0.06, 0.08], [0.22, 0.06, 0.06]];
        for (const [dx, dy, r] of stones) { ctx.fillStyle = '#a69d8b'; ctx.beginPath(); ctx.ellipse(cx + dx * ts, cy + dy * ts, r * ts, r * ts * 0.75, 0.3, 0, TAU); ctx.fill(); ctx.stroke(); }
        ctx.strokeStyle = '#5f9a3a'; ctx.lineWidth = ts * 0.03;
        ctx.beginPath(); ctx.moveTo(cx - ts * 0.28, cy + ts * 0.08); ctx.lineTo(cx - ts * 0.31, cy - ts * 0.04); ctx.moveTo(cx - ts * 0.26, cy + ts * 0.08); ctx.lineTo(cx - ts * 0.22, cy - ts * 0.05); ctx.stroke();
        if (game.phase === 'build' || placing) {
          const can = game.gold >= cost;
          const label = '⛁' + cost;
          ctx.font = `800 ${Math.max(9, ts * 0.2)}px "Baloo 2", system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const w = ctx.measureText(label).width + ts * 0.16;
          ctx.fillStyle = can ? 'rgba(30,36,51,0.85)' : 'rgba(30,36,51,0.55)';
          roundRect(ctx, cx - w / 2, cy - ts * 0.46, w, ts * 0.24, ts * 0.1); ctx.fill();
          ctx.fillStyle = can ? '#ffd666' : '#a9a29a'; ctx.fillText(label, cx, cy - ts * 0.335);
          ctx.textBaseline = 'alphabetic';
        }
      }
    }
    this.endItem?.();
    if (!this.splitAim) this.drawAim();
  }

  // Arrow Rain / ground-target aim reticle
  drawAim() {
    const ctx = this.ctx, ts = this.ts, pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    // Arrow Rain aim reticle
    if (this.aim && this.aim.cone) {
      const c = this.aim.cone, ang = Math.atan2(this.aim.y - c.oy, this.aim.x - c.ox);
      ctx.fillStyle = `rgba(217,71,59,${0.14 + 0.08 * pulse})`;
      ctx.beginPath(); ctx.moveTo(c.ox * ts, c.oy * ts); ctx.arc(c.ox * ts, c.oy * ts, c.range * ts, ang - c.arc, ang + c.arc); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,214,102,0.9)'; ctx.lineWidth = ts * 0.04; ctx.setLineDash([ts * 0.12, ts * 0.08]); ctx.stroke(); ctx.setLineDash([]);
    } else if (this.aim) {
      const r = this.aim.r * ts, x = this.aim.x * ts, y = this.aim.y * ts;
      ctx.fillStyle = `rgba(217,71,59,${0.12 + 0.08 * pulse})`; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,214,102,0.9)'; ctx.lineWidth = ts * 0.04; ctx.setLineDash([ts * 0.12, ts * 0.08]);
      ctx.beginPath(); ctx.arc(x, y, r, this.time, this.time + TAU); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // ---------- main draw ----------
  draw(game, fx, dt, ui = {}) {
    this.time += dt; this.dt = dt; this.fx = fx;
    const ctx = this.ctx, ts = this.ts;
    ctx.setTransform(this.dpr * (this.kx || 1), 0, 0, this.dpr, 0, 0);
    const B = this.biome(game);
    ctx.fillStyle = this.padRight || this.maxStretch > 1 ? shade(B.grass, -0.05) : B.sky; ctx.fillRect(0, 0, this.vw || this.w, this.h);
    this.buildBg(game);
    const [sx, sy] = fx.shakeOffset();
    ctx.save();
    ctx.translate(this.ox + sx * ts, this.oy + sy * ts);
    ctx.drawImage(this.bg, 0, 0, this.bg.width / this.dpr, game.map.rows * ts);
    this.drawPortals(game);
    this.drawCloudShadows(game);
    this.drawPlots(game, ui);

    // Burning fields
    for (const f of game.fields) {
      const a = Math.min(1, f.t);
      ctx.fillStyle = `rgba(255,120,40,${0.25 * a})`; ctx.beginPath(); ctx.arc(f.x * ts, f.y * ts, f.r * ts, 0, TAU); ctx.fill();
      if (Math.random() < 0.3) fx.burst(f.x + (Math.random() - 0.5) * f.r, f.y + (Math.random() - 0.5) * f.r, 1, { color: ['#ffb347', '#e0532f'], speed: 0.4, life: 0.5, gravity: -2, size: 0.06 });
    }

    // Castle-art ground effects: spike fields, poison clouds and incoming meteors
    for (const z of game.zones || []) {
      const a = Math.min(1, z.t, (z.max - z.t) * 3 + 0.3);
      const plague = z.kind === 'plague';
      ctx.fillStyle = plague ? `rgba(120,200,70,${0.26 * a})` : `rgba(160,150,130,${0.28 * a})`;
      ctx.beginPath(); ctx.arc(z.x * ts, z.y * ts, z.r * ts, 0, TAU); ctx.fill();
      ctx.strokeStyle = plague ? `rgba(170,240,110,${0.7 * a})` : `rgba(230,220,200,${0.7 * a})`; ctx.lineWidth = ts * 0.035;
      ctx.beginPath(); ctx.arc(z.x * ts, z.y * ts, z.r * ts, 0, TAU); ctx.stroke();
      if (Math.random() < 0.35) {
        const an = Math.random() * TAU, d = Math.sqrt(Math.random()) * z.r;
        fx.burst(z.x + Math.cos(an) * d, z.y + Math.sin(an) * d, 1, plague ? { color: ['#9be25a', '#5f9b34'], speed: 0.3, life: 0.9, gravity: -1, size: 0.1 } : { color: ['#cfc7b6', '#8a8472'], speed: 0.2, life: 0.4, gravity: -0.5, size: 0.05 });
      }
    }
    for (const v of game.volleys) {
      if (!v.warn) continue;
      const k = 1 - Math.max(0, v.t) / v.warn;
      ctx.strokeStyle = `rgba(255,90,40,${0.5 + 0.4 * Math.sin(this.time * 14)})`; ctx.lineWidth = ts * 0.05;
      ctx.beginPath(); ctx.arc(v.x * ts, v.y * ts, v.r * ts, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(255,90,40,${0.12 + 0.25 * k})`; ctx.beginPath(); ctx.arc(v.x * ts, v.y * ts, v.r * ts * k, 0, TAU); ctx.fill();
    }

    // Range preview (hover/selected/ghost)
    if (this.selected && game.towers.includes(this.selected)) this.drawRange(this.selected.cx, this.selected.cy, this.selected.stats.range || TOWERS[this.selected.type].range || 0, this.selected.stats.minRange, true);
    if (this.selected && this.selected.type === 'barracks' && this.selected.rallyPt && game.towers.includes(this.selected)) {
      const rp = this.selected.rallyPt;
      ctx.save();
      ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = ts * 0.05;
      ctx.beginPath(); ctx.moveTo(rp.x * ts, rp.y * ts + ts * 0.15); ctx.lineTo(rp.x * ts, rp.y * ts - ts * 0.45); ctx.stroke();
      ctx.fillStyle = '#f2b33d';
      ctx.beginPath(); ctx.moveTo(rp.x * ts, rp.y * ts - ts * 0.45); ctx.lineTo(rp.x * ts + ts * 0.3, rp.y * ts - ts * 0.34); ctx.lineTo(rp.x * ts, rp.y * ts - ts * 0.22); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(242,179,61,0.9)'; ctx.setLineDash([ts * 0.1, ts * 0.08]); ctx.beginPath(); ctx.arc(rp.x * ts, rp.y * ts, ts * 0.42, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (this.ghost) {
      const def = TOWERS[this.ghost.type];
      const hg = game.map.tileAt(this.ghost.x, this.ghost.y) === T.HIGH ? 0.6 : 0;
      const r = def.aura || (def.range ? def.range + hg : 0.6);
      this.drawRange(this.ghost.x + 0.5, this.ghost.y + 0.5, r, def.minRange, this.ghost.ok);
    }

    // Castle (drawn before enemies so they overlap when arriving)
    this.updateHero(game, dt);
    this.drawCastle(game);

    // Traps (under enemies)
    for (const t of game.towers) if (TOWERS[t.type].trap) this.drawTower(t, game);

    // Sort enemies + towers by y for depth.
    const list = [];
    for (const t of game.towers) if (!TOWERS[t.type].trap) list.push({ y: t.cy + 0.3, t });
    for (const e of game.enemies) if (!e.dead) list.push({ y: e.y + (e.air ? 0.6 : 0), e });
    for (const t of game.towers) for (const so of t.soldiers) if (!so.dead) list.push({ y: so.y, so });
    for (const u of game.garrison.units) if (u.state !== 'reserve' && !u.dead) list.push({ y: u.y + (TROOPS[u.kind].flies ? 0.6 : 0), tr: u });
    for (const c of this.corpses) { c.t += dt; list.push({ y: c.e.y, c }); }
    this.corpses = this.corpses.filter((c) => c.t < c.life);
    list.sort((a, b) => a.y - b.y);
    const fog = game.mod.fog;
    for (const it of list) {
      if (it.t) this.drawTower(it.t, game);
      else if (it.so) this.drawSoldier(it.so);
      else if (it.tr) this.drawTroop(it.tr);
      else if (it.c) this.drawCorpse(it.c);
      else if (!fog || game.isVisible(it.e)) this.drawEnemy(it.e, game);
    }

    // Beams
    for (const t of game.towers) if (t.beam) for (const b of t.beam) this.drawBeam(t, b);

    // Projectiles
    for (const p of game.projectiles) this.drawProjectile(p, fx);

    // Loot, hero trail particles
    this.drawLoot(dt);
    this.drawTrails(dt);

    // Fog overlay
    if (fog) this.drawFog(game);

    // FX layers
    this.drawFx(fx);
    this.drawAmbient(game);

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
    this.drawTheme(game);

    // Hazard tint: one steady, soft wash (no moving specks, which read as flicker). Phones skip it: the top bar names the weather.
    if (game.hazard.active > 0 && game.phase === 'wave' && !this.noWeatherFx) {
      const k = game.hazard.kind;
      ctx.fillStyle = k === 'sandstorm' ? 'rgba(230,190,110,0.16)' : k === 'blizzard' ? 'rgba(230,245,255,0.16)' : k === 'meteors' ? 'rgba(255,90,40,0.07)' : 'rgba(40,20,70,0.16)';
      ctx.fillRect(0, 0, this.vw || this.w, this.h);
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
    const lights = game.lights?.();
    if (lights) {   // Night Siege: darkness with soft pools of light (drawn off-screen so overlapping lights add up)
      const W = Math.ceil(m.cols * ts), H = Math.ceil(m.rows * ts);
      if (!this._night || this._night.width !== W || this._night.height !== H) { this._night = document.createElement('canvas'); this._night.width = W; this._night.height = H; }
      const n = this._night.getContext('2d');
      n.globalCompositeOperation = 'source-over'; n.clearRect(0, 0, W, H); n.fillStyle = 'rgba(6,10,30,0.72)'; n.fillRect(0, 0, W, H);
      n.globalCompositeOperation = 'destination-out';
      for (const l of lights) { const r = l.r * ts, g2 = n.createRadialGradient(l.x * ts, l.y * ts, r * 0.15, l.x * ts, l.y * ts, r); g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.7, 'rgba(0,0,0,0.85)'); g2.addColorStop(1, 'rgba(0,0,0,0)'); n.fillStyle = g2; n.beginPath(); n.arc(l.x * ts, l.y * ts, r, 0, TAU); n.fill(); }
      n.globalCompositeOperation = 'source-over';
      ctx.drawImage(this._night, 0, 0, W, H);
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(40,46,64,0.55)';
    ctx.beginPath(); ctx.rect(0, 0, m.cols * ts, m.rows * ts);
    const hole = (x, y, r) => { ctx.moveTo(x * ts + r * ts, y * ts); ctx.arc(x * ts, y * ts, r * ts, 0, TAU, true); };
    if (lights) for (const l of lights) hole(l.x, l.y, l.r);   // Night Siege: only what is lit
    else {
      hole(m.castle.x, m.castle.y, 3.2);
      for (const t of game.towers) if (t.stats?.range) hole(t.cx, t.cy, t.stats.range + 0.3);
    }
    ctx.fill('evenodd');
    ctx.restore();
  }

  // ---------- castle ----------
  updateHero(game, dt) {
    this.heroKick = Math.max(0, this.heroKick - dt * 6);
    if (!game.enemies) return;
    const m = game.map.castle, ox = m.x, oy = m.y - 0.66;
    let tx = null, ty = null;
    if (this.charge) { tx = this.charge.x; ty = this.charge.y; }
    else if (game.phase === 'wave') {
      if (this.hover) { tx = this.hover.x + 0.5; ty = this.hover.y + 0.5; }
      else {
        let best = 1e9;
        for (const e of game.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - m.x, e.y - m.y); if (d < best) { best = d; tx = e.x; ty = e.y; } }
      }
    }
    const want = tx == null ? -Math.PI / 2 + Math.sin(this.time * 0.7) * 0.55 : Math.atan2(ty - oy, tx - ox);
    this.heroAim = angleLerp(this.heroAim, want, Math.min(1, dt * 10));
  }

  drawCastle(game) {
    const ctx = this.ctx, ts = this.ts;
    const { x, y } = game.map.castle;
    const sk = CASTLE_SKINS[this.cosmetics.castle] || CASTLE_SKINS.stone;
    const dmg = 1 - game.castle.hp / game.castle.maxHp;
    const s = ts * 1.1;
    const T = this.time;
    const o = { ts, s, sk, T, dmg, flagCol: this.clanBanner };
    ctx.save();
    ctx.translate(x * ts, y * ts);
    drawCastleBody(ctx, o);
    if (game.wall.maxHp > 0) drawPalisade(ctx, o, game.wall.hp / game.wall.maxHp);
    // the hero on the gatehouse parapet
    const W = game.weapon || {};
    ctx.lineWidth = ts * 0.035; ctx.strokeStyle = INK;
    const still = !game.enemies;
    drawHero(ctx, s, {
      aim: still ? -0.6 : this.heroAim, t: T, pull: this.charge ? this.charge.amount || 0 : 0, kick: this.heroKick,
      weapon: W.id || 'longbow', ammo: W.ammo ?? 1, ...heroLook(this.cosmetics.hero, sk), hot: (game.combo || 0) >= 10,
    });
    if (this.theme?.emoji) { ctx.font = `${ts * 0.45}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(this.theme.emoji, -s * 0.9, s * 0.52); }
    ctx.restore();
    // smoke from a battered keep
    if (dmg > 0.5 && this.fx && Math.random() < 0.1) this.fx.burst(x + (Math.random() < 0.5 ? -0.6 : 0.6), y - 0.9, 1, { color: ['#777', '#999', '#bbb'], speed: 0.25, life: 1.2, gravity: -0.9, size: 0.12 });
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
    const [stone, stone2] = TOWER_SKINS[skin] || TOWER_SKINS.classic;
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
        // crew archer peeking from the window
        ctx.fillStyle = '#2b2a35'; roundRect(ctx, -ts * 0.1, -ts * 0.5, ts * 0.2, ts * 0.22, ts * 0.04); ctx.fill();
        const hb = Math.sin(this.time * 2.2 + t.cx * 3) * ts * 0.012;
        ctx.fillStyle = '#f1c9a0'; ctx.beginPath(); ctx.arc(Math.cos(a) * ts * 0.03, -ts * 0.4 + hb, ts * 0.065, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(Math.cos(a) * ts * 0.03, -ts * 0.42 + hb, ts * 0.07, Math.PI, TAU); ctx.fill();
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
        ctx.fillStyle = '#5a4634';
        for (const wx of [-0.2, 0.2]) { ctx.beginPath(); ctx.arc(wx * ts, -ts * 0.1, ts * 0.08, 0, TAU); ctx.fill(); ctx.stroke(); }
        if ((t.recoil || 0) > 0.5) { ctx.fillStyle = `rgba(255,200,90,${t.recoil})`; ctx.beginPath(); ctx.arc(Math.cos(a) * ts * 0.45, -ts * 0.32 + Math.sin(a) * ts * 0.45, ts * 0.14 * t.recoil, 0, TAU); ctx.fill(); }
        break;
      }
      case 'mage': {
        ctx.fillStyle = '#7d6aa8'; ctx.beginPath(); ctx.moveTo(-ts * 0.2, -ts * 0.1); ctx.lineTo(-ts * 0.12, -ts * 0.58); ctx.lineTo(ts * 0.12, -ts * 0.58); ctx.lineTo(ts * 0.2, -ts * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
        const bob = Math.sin(this.time * 3 + t.cx) * ts * 0.04;
        ctx.fillStyle = 'rgba(199,155,255,0.35)'; ctx.beginPath(); ctx.arc(0, -ts * 0.75 + bob, ts * 0.22, 0, TAU); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -ts * 0.75 + bob, ts * 0.14, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-ts * 0.04, -ts * 0.79 + bob, ts * 0.04, 0, TAU); ctx.fill();
        // wizard behind the orb
        ctx.fillStyle = '#f1c9a0'; ctx.beginPath(); ctx.arc(0, -ts * 0.5, ts * 0.07, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#4b3a7a'; ctx.beginPath(); ctx.moveTo(-ts * 0.1, -ts * 0.53); ctx.lineTo(0, -ts * 0.74 + bob * 0.3); ctx.lineTo(ts * 0.1, -ts * 0.53); ctx.closePath(); ctx.fill(); ctx.stroke();
        for (let i = 0; i < 2; i++) { const o = this.time * 2.5 + i * Math.PI; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(Math.cos(o) * ts * 0.27, -ts * 0.75 + bob + Math.sin(o) * ts * 0.08, ts * 0.035, 0, TAU); ctx.fill(); }
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
      case 'artillery': {
        // Armoured gun carriage on two wheels with a long barrel that follows its target.
        ctx.fillStyle = '#6a5a48'; roundRect(ctx, -ts * 0.3, -ts * 0.2, ts * 0.6, ts * 0.14, ts * 0.04); ctx.fill(); ctx.stroke();
        for (const wx of [-0.2, 0.2]) { ctx.fillStyle = '#4a3d30'; ctx.beginPath(); ctx.arc(wx * ts, -ts * 0.12, ts * 0.1, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#9a8468'; ctx.beginPath(); ctx.arc(wx * ts, -ts * 0.12, ts * 0.035, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#7d4a38'; roundRect(ctx, -ts * 0.17, -ts * 0.42, ts * 0.34, ts * 0.24, ts * 0.05); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.translate(0, -ts * 0.36); ctx.scale(Math.cos(a) >= 0 ? 1 : -1, 1); ctx.rotate(-0.55);
        const rc = (t.recoil || 0) * ts * 0.1;
        ctx.fillStyle = col; roundRect(ctx, -rc, -ts * 0.07, ts * 0.52, ts * 0.14, ts * 0.05); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2b2623'; ctx.fillRect(ts * 0.46 - rc, -ts * 0.09, ts * 0.09, ts * 0.18); ctx.strokeRect(ts * 0.46 - rc, -ts * 0.09, ts * 0.09, ts * 0.18);
        ctx.restore();
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
      case 'gatling': {
        ctx.fillStyle = '#7a5a3a'; roundRect(ctx, -ts * 0.24, -ts * 0.42, ts * 0.48, ts * 0.34, ts * 0.06); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; roundRect(ctx, -ts * 0.28, -ts * 0.52, ts * 0.56, ts * 0.14, ts * 0.05); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.translate(0, -ts * 0.4); ctx.rotate(a);
        const spin = (this.time * (3 + 24 * (t.heat || 0))) % TAU;
        for (let b = 0; b < 3; b++) {
          const off = Math.sin(spin + (b * TAU) / 3) * ts * 0.075;
          ctx.fillStyle = '#4a4f5c'; roundRect(ctx, ts * 0.04 - rec, off - ts * 0.025, ts * 0.34, ts * 0.05, ts * 0.02); ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = '#2b2a35'; ctx.beginPath(); ctx.arc(0, 0, ts * 0.1, 0, TAU); ctx.fill(); ctx.stroke();
        if ((t.heat || 0) > 0.5) { ctx.fillStyle = `rgba(255,${160 - 100 * t.heat},60,${0.3 + 0.4 * t.heat})`; ctx.beginPath(); ctx.arc(ts * 0.36, 0, ts * 0.09, 0, TAU); ctx.fill(); }
        ctx.restore();
        break;
      }
      case 'venom': {
        ctx.fillStyle = '#4d5a3a'; ctx.beginPath(); ctx.moveTo(-ts * 0.2, -ts * 0.1); ctx.lineTo(-ts * 0.12, -ts * 0.6); ctx.lineTo(ts * 0.12, -ts * 0.6); ctx.lineTo(ts * 0.2, -ts * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -ts * 0.74, ts * 0.2, 0, TAU); ctx.fill(); ctx.stroke();
        const bub = 0.5 + 0.5 * Math.sin(this.time * 5 + t.cx);
        ctx.fillStyle = `rgba(205,255,140,${0.5 + 0.4 * bub})`; ctx.beginPath(); ctx.arc(-ts * 0.05, -ts * (0.76 + 0.03 * bub), ts * 0.06, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(ts * 0.07, -ts * 0.7, ts * 0.04, 0, TAU); ctx.fill();
        ctx.fillStyle = '#9be25a'; ctx.beginPath(); ctx.ellipse(ts * 0.14, -ts * (0.45 - 0.05 * bub), ts * 0.025, ts * 0.05, 0, 0, TAU); ctx.fill();
        break;
      }
      case 'trebuchet': {
        ctx.fillStyle = '#7a5a3a';
        ctx.beginPath(); ctx.moveTo(-ts * 0.3, -ts * 0.08); ctx.lineTo(-ts * 0.05, -ts * 0.62); ctx.lineTo(ts * 0.05, -ts * 0.62); ctx.lineTo(ts * 0.3, -ts * 0.08); ctx.lineTo(ts * 0.18, -ts * 0.08); ctx.lineTo(0, -ts * 0.46); ctx.lineTo(-ts * 0.18, -ts * 0.08); ctx.closePath(); ctx.fill(); ctx.stroke();
        const sw = (t.recoil || 0);
        ctx.save(); ctx.translate(0, -ts * 0.6); ctx.rotate(-0.9 + sw * 1.9);
        ctx.fillStyle = '#9a6a3c'; roundRect(ctx, -ts * 0.46, -ts * 0.035, ts * 0.8, ts * 0.07, ts * 0.02); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#4a4f5c'; ctx.beginPath(); ctx.arc(-ts * 0.42, 0, ts * 0.1, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ts * 0.34, 0, ts * 0.06, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'voidwell': {
        ctx.fillStyle = '#3a3050'; ctx.beginPath(); ctx.ellipse(0, -ts * 0.12, ts * 0.34, ts * 0.16, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#120a22'; ctx.beginPath(); ctx.ellipse(0, -ts * 0.14, ts * 0.26, ts * 0.11, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = ts * 0.035;
        for (let k = 0; k < 3; k++) { const ph = this.time * 2.4 + k * 2.1; ctx.beginPath(); ctx.ellipse(0, -ts * 0.14, ts * 0.24 * (0.4 + 0.6 * ((ph * 0.3) % 1)), ts * 0.1 * (0.4 + 0.6 * ((ph * 0.3) % 1)), ph, 0, TAU * 0.7); ctx.stroke(); }
        ctx.fillStyle = '#6b4fb0'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * ts * 0.32, -ts * 0.12); ctx.lineTo(sx * ts * 0.26, -ts * 0.6); ctx.lineTo(sx * ts * 0.18, -ts * 0.12); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.04; ctx.stroke(); }
        break;
      }
      case 'sanctum': {
        ctx.fillStyle = '#f1ead2';
        for (const sx of [-0.2, 0.2]) { roundRect(ctx, sx * ts - ts * 0.05, -ts * 0.58, ts * 0.1, ts * 0.46, ts * 0.03); ctx.fill(); ctx.stroke(); }
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-ts * 0.32, -ts * 0.56); ctx.lineTo(0, -ts * 0.82); ctx.lineTo(ts * 0.32, -ts * 0.56); ctx.closePath(); ctx.fill(); ctx.stroke();
        const gl = 0.5 + 0.5 * Math.sin(this.time * 2.5 + t.cx);
        ctx.fillStyle = `rgba(255,236,150,${0.45 + 0.4 * gl})`; ctx.beginPath(); ctx.arc(0, -ts * 0.36, ts * (0.09 + 0.02 * gl), 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,236,150,${0.5 + 0.4 * gl})`; ctx.lineWidth = ts * 0.03;
        ctx.beginPath(); ctx.moveTo(0, -ts * 0.52); ctx.lineTo(0, -ts * 0.2); ctx.moveTo(-ts * 0.1, -ts * 0.36); ctx.lineTo(ts * 0.1, -ts * 0.36); ctx.stroke();
        break;
      }
    }
    if (!t.ghost) this.tierDecor(t);
    if (t.disabledT > 0) {
      ctx.fillStyle = 'rgba(30,36,51,0.45)'; ctx.beginPath(); ctx.arc(0, -ts * 0.4, ts * 0.32, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#f2b33d'; ctx.lineWidth = ts * 0.04;
      ctx.beginPath(); ctx.moveTo(-ts * 0.1, -ts * 0.55); ctx.lineTo(ts * 0.02, -ts * 0.4); ctx.lineTo(-ts * 0.04, -ts * 0.38); ctx.lineTo(ts * 0.1, -ts * 0.24); ctx.stroke();
    }
    if (!t.ghost) {
      this.tierPips(t, ts * 0.47);
      if (t.hp < t.maxHp) this.bar(-ts * 0.3, ts * 0.25, ts * 0.6, t.hp / t.maxHp, '#7fb24a');
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

  // Upgrade flair, drawn in the tower's local space: pennant, gold trim, gems, mastery aura.
  tierDecor(t) {
    const ctx = this.ctx, ts = this.ts, n = t.tier || 1;
    if (t.mastery || n >= 5) {
      const p = 0.5 + 0.5 * Math.sin(this.time * 3 + t.cx);
      ctx.strokeStyle = `rgba(245,197,66,${0.25 + 0.35 * p})`; ctx.lineWidth = ts * 0.05;
      ctx.beginPath(); ctx.ellipse(0, ts * 0.12, ts * (0.5 + 0.04 * p), ts * 0.24, 0, 0, TAU); ctx.stroke();
    }
    if (n >= 2 && !TOWERS[t.type].noDecor) {
      const wv = Math.sin(this.time * 5 + t.cy) * ts * 0.03;
      ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.03;
      ctx.beginPath(); ctx.moveTo(ts * 0.3, -ts * 0.1); ctx.lineTo(ts * 0.3, -ts * 0.5); ctx.stroke();
      ctx.fillStyle = TOWERS[t.type].color;
      ctx.beginPath(); ctx.moveTo(ts * 0.3, -ts * 0.5); ctx.lineTo(ts * 0.48, -ts * 0.45 + wv); ctx.lineTo(ts * 0.3, -ts * 0.4); ctx.fill();
    }
    if (n >= 3) { ctx.strokeStyle = '#f2b33d'; ctx.lineWidth = ts * 0.035; roundRect(ctx, -ts * 0.36, -ts * 0.16, ts * 0.72, ts * 0.32, ts * 0.12); ctx.stroke(); }
    if (n >= 4) { ctx.fillStyle = '#7fe0ff'; for (const gx of [-0.28, 0.28]) { ctx.beginPath(); ctx.moveTo(gx * ts, -ts * 0.08); ctx.lineTo(gx * ts + ts * 0.04, -ts * 0.02); ctx.lineTo(gx * ts, ts * 0.04); ctx.lineTo(gx * ts - ts * 0.04, -ts * 0.02); ctx.fill(); } }
  }

  tierPips(t, y) {
    const ctx = this.ctx, ts = this.ts;
    const n = t.tier || 1;
    if (t.mastery) {
      ctx.font = `800 ${Math.max(13, ts * 0.34)}px "Baloo 2", system-ui`; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd666'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(4, ts * 0.1); ctx.lineJoin = 'round';
      ctx.strokeText('★' + t.mastery, 0, y + ts * 0.12); ctx.fillText('★' + t.mastery, 0, y + ts * 0.12);
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
    let st = this.anim.get(so);
    if (!st) { st = { ph: 0, lx: so.x, ly: so.y, face: 1, moving: false, t: 0, swing: 0 }; this.anim.set(so, st); }
    if (this.dt > 0) {
      const dx = so.x - st.lx, moved = Math.hypot(dx, so.y - st.ly);
      st.lx = so.x; st.ly = so.y; st.moving = moved > 0.0005;
      if (st.moving) st.ph += (moved / 0.14) * Math.PI;
      if (Math.abs(dx) > 0.0005) st.face = dx < 0 ? -1 : 1;
    }
    st.t = this.time; st.swing = so.swing || 0;
    if (!this.bodyless) {
      ctx.save(); ctx.translate(so.x * ts, so.y * ts);
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0, ts * 0.12, ts * 0.14, ts * 0.06, 0, 0, TAU); ctx.fill();
      ctx.lineWidth = ts * 0.03; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
      ctx.scale(st.face, 1);
      drawSoldierSprite(ctx, ts, so, st);
      ctx.restore();
    }
    if (so.hp < so.maxHp) { ctx.save(); ctx.translate(so.x * ts, so.y * ts); this.bar(-ts * 0.15, -ts * 0.34, ts * 0.3, so.hp / so.maxHp, '#7fb24a'); ctx.restore(); }
  }

  // A deployed troop: sprite, rank pips, health bar. Flyers hover above their shadow.
  drawTroop(u) {
    const ctx = this.ctx, ts = this.ts, D = TROOPS[u.kind];
    let st = this.anim.get(u);
    if (!st) { st = { ph: 0, lx: u.x, ly: u.y, face: 1, moving: false, t: 0, swing: 0 }; this.anim.set(u, st); }
    if (this.dt > 0) {
      const dx = u.x - st.lx, moved = Math.hypot(dx, u.y - st.ly);
      st.lx = u.x; st.ly = u.y; st.moving = moved > 0.0005;
      if (st.moving) st.ph += (moved / (D.flies ? 0.3 : D.speed > 3 ? 0.35 : 0.14)) * Math.PI;
      if (Math.abs(dx) > 0.0005) st.face = dx < 0 ? -1 : 1;
    }
    st.t = this.time + u.slot; st.swing = u.swing || 0;
    const lift = D.flies ? ts * 0.42 : 0;
    if (!this.bodyless) {
      ctx.save(); ctx.translate(u.x * ts, u.y * ts);
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0, ts * 0.12, ts * (D.flies ? 0.26 : D.speed > 3 ? 0.24 : 0.14), ts * 0.06, 0, 0, TAU); ctx.fill();
      ctx.translate(0, -lift);
      ctx.lineWidth = ts * 0.03; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
      ctx.scale(st.face, 1);
      drawTroopSprite(ctx, ts, u, st, D);
      ctx.restore();
    }
    if (u.flash > 0) { ctx.save(); ctx.globalAlpha = Math.min(0.6, u.flash * 5); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(u.x * ts, u.y * ts - lift - ts * 0.2, ts * 0.2, 0, TAU); ctx.fill(); ctx.restore(); }
    ctx.save(); ctx.translate(u.x * ts, u.y * ts - lift);
    const hf = u.hp / u.maxHp;
    if (hf < 0.999) this.bar(-ts * 0.17, -ts * 0.46, ts * 0.34, hf, hf > 0.5 ? '#7fb24a' : hf > 0.25 ? '#f2b33d' : '#d9473b');
    for (let i = 0; i < u.rank; i++) { ctx.fillStyle = '#f2b33d'; ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.012; star(ctx, (i - (u.rank - 1) / 2) * ts * 0.1, -ts * 0.52, ts * 0.045); ctx.stroke(); }
    ctx.restore();
  }

  // ---------- enemies ----------
  drawEnemy(e, game) {
    const st = this.animState(e, game ? this.dt : 0);
    this.paintEnemy(e, st, game, false);
  }

  drawCorpse(c) {
    c.st.dead = clamp01(c.t / c.life); c.st.t = this.time; c.st.dir = c.dir;
    this.paintEnemy(c.e, c.st, null, true);
  }

  paintEnemy(e, st, game, corpse) {
    const ctx = this.ctx, ts = this.ts;
    if (e.burrowT > 0 && !corpse) { this.paintMound(e, st); return; }
    const pop = corpse || !game ? 1 : easeOutBack(clamp01(st.age / 0.32));
    const s = e.size * ts * 1.12 * Math.max(0.02, pop);
    const k = corpse ? st.dead : 0;
    const fly = e.air ? ts * 0.35 + Math.sin(this.time * 3 + e.bob) * ts * 0.05 : 0;
    const x = e.x * ts, y = e.y * ts;
    ctx.save();
    ctx.translate(x, y);
    if (!this.bodyless) { ctx.fillStyle = `rgba(0,0,0,${0.25 * (1 - k)})`; ctx.beginPath(); ctx.ellipse(0, s * 0.35, s * (e.air ? 0.6 : 0.85) * (1 - k * 0.4), s * 0.28 * (1 - k * 0.4), 0, 0, TAU); ctx.fill(); }
    ctx.translate(0, -fly);
    if (corpse) ctx.translate(0, -Math.sin(Math.PI * Math.min(1, k * 1.5)) * s * 0.9);
    if (e.stealthT > 0) ctx.globalAlpha = 0.35;
    if (corpse) ctx.globalAlpha *= Math.max(0, 1 - k * k);
    ctx.scale(st.face || 1, 1);
    if (corpse) { ctx.translate(0, -s * 0.3); ctx.rotate((st.dir || 1) * k * 2.6); ctx.translate(0, s * 0.3); }
    ctx.lineWidth = Math.max(1.5, ts * 0.04); ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    const col = e.flash > 0 || (corpse && k < 0.14) ? shade(e.color, 0.35) : e.color;
    if (e.buffT > 0 && e.type !== 'warchief' && !this.bodyless) { ctx.fillStyle = 'rgba(217,71,59,0.25)'; ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 1.05, 0, TAU); ctx.fill(); }
    if (!this.bodyless) drawEnemySprite(ctx, e, s, col, st);
    ctx.restore();
    if (corpse) return;
    // Status overlays (unflipped)
    ctx.save(); ctx.translate(x, y - fly);
    if (e.shield > 0) { ctx.strokeStyle = 'rgba(160,120,255,0.8)'; ctx.lineWidth = ts * 0.03; ctx.beginPath(); ctx.arc(0, -s * 0.3, s * 1.1, 0, TAU); ctx.stroke(); }
    if (e.vanguard) { ctx.fillStyle = '#ffb347'; ctx.font = `900 ${Math.max(10, ts * 0.26)}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('»', 0, -s * 1.25); }
    if (e.slowT > 0) { ctx.fillStyle = this.colorblind ? 'rgba(80,140,255,0.35)' : 'rgba(127,211,242,0.35)'; ctx.beginPath(); ctx.arc(0, -s * 0.3, s * 0.95, 0, TAU); ctx.fill(); }
    if (e.poisonT > 0) { ctx.fillStyle = 'rgba(130,210,70,0.38)'; ctx.beginPath(); ctx.arc(0, -s * 0.3, s * 0.9, 0, TAU); ctx.fill(); }
    if (e.burnT > 0 && Math.random() < 0.35) this._burnAt = (this._burnAt || []).concat([[e.x, e.y - (e.air ? 0.35 : 0) - e.size * 0.5]]);
    if (e.stunT > 0) {
      ctx.fillStyle = '#f2b33d';
      for (let i = 0; i < 3; i++) { const a = this.time * 5 + (i * TAU) / 3; star(ctx, Math.cos(a) * s * 0.6, -s * 1.3 + Math.sin(a) * s * 0.2, s * 0.15); }
    }
    if (e.enraged) { ctx.fillStyle = '#d9473b'; ctx.font = `800 ${Math.max(10, ts * 0.25)}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('!', s * 0.9, -s * 1.2); }
    if (e.hp < e.maxHp || e.boss) {
      const w = e.boss ? ts * 1.4 : Math.max(ts * 0.5, s * 1.6);
      this.bar(-w / 2, -s * (e.boss ? 1.95 : 1.6) - ts * 0.05, w, e.hp / e.maxHp, e.boss ? '#d9473b' : '#7fb24a');
      if (e.shield > 0) { ctx.fillStyle = '#b79bff'; ctx.fillRect(-w / 2, -s * (e.boss ? 1.95 : 1.6) - ts * 0.05, w * Math.min(1, e.shield / e.maxHp), Math.max(2, ts * 0.03)); }
    }
    ctx.restore();
  }

  // A Tunneler underground: a travelling ridge of dirt and flying clods.
  paintMound(e, st) {
    const ctx = this.ctx, ts = this.ts, x = e.x * ts, y = e.y * ts, s = e.size * ts * 1.1;
    const w = Math.sin(this.time * 18 + e.bob) * s * 0.05;
    if (this.bodyless) { if (this.fx && Math.random() < 0.25) this.fx.burst(e.x, e.y, 1, { color: ['#7a5a3a', '#9a7650'], speed: 1.2, life: 0.4, gravity: 6, lift: 1.5, size: 0.06 }); return; }
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0, s * 0.3, s * 0.95, s * 0.28, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(1.5, ts * 0.04); ctx.strokeStyle = INK;
    ctx.fillStyle = '#7a5a3a'; ctx.beginPath(); ctx.ellipse(0, s * 0.12 + w, s * 0.85, s * 0.42, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9a7650'; for (const [dx, dy, r] of [[-0.35, -0.05, 0.14], [0.15, -0.18, 0.12], [0.45, 0.02, 0.1]]) { ctx.beginPath(); ctx.arc(dx * s, dy * s + w, r * s, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.restore();
    if (this.fx && Math.random() < 0.25) this.fx.burst(e.x, e.y, 1, { color: ['#7a5a3a', '#9a7650'], speed: 1.2, life: 0.4, gravity: 6, lift: 1.5, size: 0.06 });
  }

  // ---------- atmosphere ----------
  drawPortals(game) {
    const m = game.map, ctx = this.ctx, T = this.time; let ts = this.ts;
    if (!m.spawns) return;
    const B = BIOMES[(game.biomeIdx ? game.biomeIdx() : biomeIndex(game.wave))];
    const act = game.phase === 'wave' ? 1 : 0.5;
    for (const sp of m.spawns) {
      this.beginItem?.(sp.x, sp.y); ts = this.ts;
      const cx = sp.x * ts, cy = sp.y * ts;
      const pulse = 0.6 + 0.4 * Math.sin(T * 3 + cx);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, ts * 0.7);
      g.addColorStop(0, hexA(B.accent, 0.55 * act * pulse)); g.addColorStop(1, hexA(B.accent, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, ts * 0.7, 0, TAU); ctx.fill();
      ctx.lineWidth = ts * 0.04; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = hexA(i === 1 ? '#ffffff' : B.accent, 0.55 * act);
        ctx.beginPath(); ctx.arc(cx, cy, ts * (0.26 + 0.07 * i), T * (i % 2 ? -2.2 : 2.6) + i * 2, T * (i % 2 ? -2.2 : 2.6) + i * 2 + 1.5); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    this.endItem?.();
  }

  drawCloudShadows(game) {
    if (this.quality === 'low' || this.reduced) return;
    const bi = (game.biomeIdx ? game.biomeIdx() : biomeIndex(game.wave));
    if (bi >= 3) return;
    const ctx = this.ctx, ts = this.ts, W = game.map.cols * ts, H = game.map.rows * ts;
    for (let i = 0; i < 3; i++) {
      const R = ts * (3.2 + i * 1.1);
      const cx = ((i * 0.41 * W + this.time * ts * (0.22 + i * 0.05)) % (W + 2 * R)) - R;
      const cy = H * (0.2 + 0.3 * i) + Math.sin(this.time * 0.1 + i) * ts;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, 'rgba(20,30,50,0.10)'); g.addColorStop(1, 'rgba(20,30,50,0)');
      ctx.fillStyle = g; ctx.save(); ctx.translate(cx, cy); ctx.scale(1.6, 0.8); ctx.translate(-cx, -cy); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill(); ctx.restore();
    }
  }

  drawAmbient(game) {
    if (this.quality === 'low' || this.reduced || !this.ambient) return;
    const bi = (game.biomeIdx ? game.biomeIdx() : biomeIndex(game.wave)), ctx = this.ctx, ts = this.ts, T = this.time;
    const W = game.map.cols * ts, H = game.map.rows * ts;
    ctx.save();
    if (bi === 0) {                       // butterflies
      const cols = ['#ffd25e', '#ff9ec4', '#ffffff', '#9ad7ff', '#ffb36b'];
      for (let i = 0; i < 6; i++) {
        const x = W * (0.5 + 0.46 * Math.sin(T * (0.07 + i * 0.013) + i * 2.1)), y = H * (0.5 + 0.42 * Math.sin(T * (0.09 + i * 0.011) + i * 3.7)) + Math.sin(T * 3 + i) * ts * 0.1;
        const flap = Math.abs(Math.sin(T * 14 + i)), w = ts * 0.07;
        ctx.fillStyle = cols[i % cols.length]; ctx.strokeStyle = 'rgba(30,36,51,0.5)'; ctx.lineWidth = 1;
        for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + sd * w * 0.6 * flap, y - w * 0.3, w * (0.3 + 0.7 * flap), w * 0.7, sd * 0.5, 0, TAU); ctx.fill(); ctx.stroke(); }
      }
    } else if (bi === 1) {                // blowing sand
      ctx.strokeStyle = 'rgba(255,235,180,0.35)'; ctx.lineWidth = Math.max(1, ts * 0.02);
      for (let i = 0; i < 16; i++) { const x = (i * 131.7 + T * ts * (0.9 + (i % 3) * 0.3)) % (W + 40) - 20, y = (i * 71.3 + Math.sin(T + i) * 6) % H; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ts * 0.35, y + ts * 0.03); ctx.stroke(); }
    } else if (bi === 2) {                // snowfall
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 40; i++) { const x = (i * 57.3 + Math.sin(T * 0.8 + i) * ts * 0.3 + T * ts * 0.1) % W, y = (i * 91.7 + T * ts * (0.35 + (i % 4) * 0.08)) % H; ctx.beginPath(); ctx.arc(x, y, ts * (0.02 + (i % 3) * 0.008), 0, TAU); ctx.fill(); }
    } else if (bi === 3) {                // rising embers
      for (let i = 0; i < 26; i++) { const k = (T * 0.25 + i * 0.137) % 1, x = (i * 83.1 + Math.sin(T + i) * ts * 0.2) % W, y = H * (1 - k); ctx.fillStyle = `rgba(255,${120 + (i % 4) * 25},50,${0.8 * (1 - k)})`; ctx.beginPath(); ctx.arc(x, y, ts * 0.03 * (1 - k * 0.5), 0, TAU); ctx.fill(); }
    } else {                              // fireflies
      for (let i = 0; i < 14; i++) { const x = W * (0.5 + 0.47 * Math.sin(T * (0.05 + i * 0.007) + i * 1.9)), y = H * (0.5 + 0.45 * Math.sin(T * (0.06 + i * 0.006) + i * 2.9)), g = 0.5 + 0.5 * Math.sin(T * 2.5 + i * 1.7);
        ctx.fillStyle = `rgba(190,160,255,${0.15 + 0.2 * g})`; ctx.beginPath(); ctx.arc(x, y, ts * 0.12, 0, TAU); ctx.fill(); ctx.fillStyle = `rgba(235,220,255,${0.4 + 0.5 * g})`; ctx.beginPath(); ctx.arc(x, y, ts * 0.035, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }

  // Theme tint and ambient particles. Screen space, drawn over the board.
  // `fall` picks the effect: bats · snow · sparks · embers · fireflies · motes · stars · rain · or an emoji set (leaves, hearts, petals, greenleaves).
  drawTheme(game) {
    const th = this.theme;
    if (!th) return;
    const ctx = this.ctx, T = this.time, W = this.vw || this.w, H = this.h, f = th.fall;
    ctx.fillStyle = th.tint; ctx.fillRect(0, 0, W, H);
    if (this.quality === 'low' || this.reduced) return;
    const sz = Math.max(8, this.ts * 0.32);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (f === 'rain') {
      ctx.strokeStyle = 'rgba(190,215,235,0.45)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i < 70; i++) {
        const sp = 0.9 + (i % 5) * 0.12, k = (T * sp + (i * 0.6180339) % 1) % 1;
        const x = (((Math.sin(i * 12.9898) * 0.5 + 0.5) * (W + 60)) - k * 40) % W, y = k * (H + 30) - 15;
        ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 11 + (i % 3) * 2);
      }
      ctx.stroke();
      ctx.restore(); return;
    }
    if (f === 'stars') {
      for (let i = 0; i < 34; i++) {
        const x = (Math.sin(i * 78.233) * 0.5 + 0.5) * W, y = (Math.sin(i * 37.719 + 1.3) * 0.5 + 0.5) * H, tw = 0.5 + 0.5 * Math.sin(T * (1.2 + (i % 5) * 0.4) + i * 2.1);
        ctx.globalAlpha = 0.25 + 0.65 * tw; ctx.fillStyle = i % 4 === 0 ? '#bfefff' : '#ffffff';
        const r = 1.1 + (i % 3) * 0.7 + tw * 0.8;
        ctx.beginPath(); ctx.moveTo(x, y - r * 2); ctx.lineTo(x + r * 0.45, y - r * 0.45); ctx.lineTo(x + r * 2, y); ctx.lineTo(x + r * 0.45, y + r * 0.45); ctx.lineTo(x, y + r * 2); ctx.lineTo(x - r * 0.45, y + r * 0.45); ctx.lineTo(x - r * 2, y); ctx.lineTo(x - r * 0.45, y - r * 0.45); ctx.closePath(); ctx.fill();
      }
      ctx.restore(); return;
    }
    if (f === 'fireflies') {
      for (let i = 0; i < 16; i++) {
        const x = W * (0.5 + 0.47 * Math.sin(T * (0.06 + i * 0.006) + i * 1.9)), y = H * (0.5 + 0.44 * Math.sin(T * (0.07 + i * 0.005) + i * 2.9)), g = 0.5 + 0.5 * Math.sin(T * 2.3 + i * 1.7);
        ctx.fillStyle = `rgba(210,255,120,${0.12 + 0.18 * g})`; ctx.beginPath(); ctx.arc(x, y, this.ts * 0.13, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(245,255,190,${0.35 + 0.55 * g})`; ctx.beginPath(); ctx.arc(x, y, this.ts * 0.035, 0, TAU); ctx.fill();
      }
      ctx.restore(); return;
    }
    if (f === 'motes' || f === 'embers') {
      const embers = f === 'embers';
      for (let i = 0; i < 30; i++) {
        const sp = embers ? 0.07 + (i % 5) * 0.015 : 0.03 + (i % 5) * 0.008, k = (T * sp + (i * 0.6180339) % 1) % 1;
        const x = ((Math.sin(i * 12.9898) * 0.5 + 0.5) * W + Math.sin(T * 0.7 + i) * (embers ? 14 : 22)) % W;
        const y = embers ? H - k * (H + 20) + 10 : (k * (H + 30) - 15);
        const fade = Math.sin(k * Math.PI), r = embers ? 1.4 + (i % 3) * 0.7 : 1.2 + (i % 4) * 0.7;
        ctx.globalAlpha = 0.85 * fade;
        if (embers) ctx.fillStyle = i % 3 ? '#ff9a3c' : '#ffd36b'; else ctx.fillStyle = i % 2 ? '#ffe6a0' : '#fff6d6';
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        if (!embers) { ctx.globalAlpha = 0.18 * fade; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, TAU); ctx.fill(); }
      }
      ctx.restore(); return;
    }
    const n = 26;
    for (let i = 0; i < n; i++) {
      const seed = i * 12.9898, sp = 0.05 + (i % 5) * 0.012;
      const k = (T * sp + (i * 0.6180339) % 1) % 1;
      let x = ((Math.sin(seed) * 0.5 + 0.5) * W + Math.sin(T * 0.8 + i) * 18) % W;
      let y = k * (H + 40) - 20;
      if (f === 'bats') { y = H * (0.08 + 0.5 * ((Math.sin(seed * 3) * 0.5 + 0.5))) + Math.sin(T * 1.3 + i) * 14; x = ((T * 40 * (0.6 + (i % 4) * 0.25) + i * 90) % (W + 60)) - 30; if (i < 7) { ctx.font = `${sz * 0.8}px serif`; ctx.fillText('🦇', x, y); } continue; }
      ctx.globalAlpha = 0.85;
      if (f === 'snow') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 1.5 + (i % 3), 0, 6.283); ctx.fill(); }
      else if (f === 'sparks') { y = H - k * H * 0.9; ctx.globalAlpha = 0.7 * (1 - k); ctx.fillStyle = i % 2 ? '#ffd23d' : '#ff8a3d'; ctx.beginPath(); ctx.arc(x, y, 2, 0, 6.283); ctx.fill(); }
      else { ctx.font = `${sz}px serif`; ctx.save(); ctx.translate(x, y); ctx.rotate(T * 0.8 + i); ctx.fillText(f === 'leaves' ? '🍁' : f === 'greenleaves' ? '🍃' : f === 'hearts' ? '💗' : '🌸', 0, 0); ctx.restore(); }
    }
    ctx.restore();
  }

  // ---------- loot ----------
  pickLoot(x, y, r = 0.75) {
    let best = -1, bd = r;
    this.loot.forEach((l, i) => { const d = Math.hypot(l.x + 0 - x, l.y + l.dy - y); if (d < bd) { bd = d; best = i; } });
    return best < 0 ? null : this.loot.splice(best, 1)[0];
  }

  drawLoot(dt) {
    const ctx = this.ctx; let ts = this.ts;
    const keep = [];
    for (const l of this.loot) {
      l.t += dt;
      if (l.dy === undefined) { l.dy = 0; l.y0 = l.y; }
      l.vy += 9 * dt; l.dy += l.vy * dt; l.x += l.vx * dt;
      if (l.dy >= 0) { l.dy = 0; if (Math.abs(l.vy) > 1.2) l.vy = -l.vy * 0.45; else l.vy = 0; l.vx *= 0.85; }
      if (l.t >= l.life) { this.onLootExpire && this.onLootExpire(l); continue; }
      keep.push(l);
      const left = l.life - l.t;
      if (left < 1.8 && Math.floor(left * 8) % 2 === 0) continue;       // blink before vanishing
      this.beginItem?.(l.x, l.y); ts = this.ts;
      const x = l.x * ts, y = (l.y + l.dy) * ts - ts * 0.12;
      const pulse = 0.5 + 0.5 * Math.sin(l.t * 8 + l.spin);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x, l.y * ts, ts * 0.1, ts * 0.04, 0, 0, TAU); ctx.fill();
      const col = l.kind === 'gem' ? '94,224,255' : '255,210,80';
      ctx.fillStyle = `rgba(${col},${0.2 + 0.2 * pulse})`; ctx.beginPath(); ctx.arc(x, y, ts * (0.17 + 0.04 * pulse), 0, TAU); ctx.fill();
      ctx.lineWidth = ts * 0.03; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
      if (l.kind === 'gem') {
        const r = ts * 0.1;
        ctx.fillStyle = '#5ee0ff'; ctx.beginPath(); ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r, y - r * 0.2); ctx.lineTo(x, y + r * 1.1); ctx.lineTo(x - r, y - r * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.moveTo(x - r * 0.1, y - r * 0.95); ctx.lineTo(x + r * 0.45, y - r * 0.2); ctx.lineTo(x - r * 0.1, y - r * 0.1); ctx.closePath(); ctx.fill();
      } else {
        const sq = Math.abs(Math.cos(l.t * 6 + l.spin)), r = ts * 0.09;
        ctx.fillStyle = '#ffd25e'; ctx.beginPath(); ctx.ellipse(x, y, r * (0.25 + 0.75 * sq), r, 0, 0, TAU); ctx.fill(); ctx.stroke();
      }
      if (pulse > 0.85) { ctx.fillStyle = '#fff'; star(ctx, x + ts * 0.08, y - ts * 0.1, ts * 0.05); }
    }
    this.loot = keep; this.endItem?.();
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
      case 'arrow': case 'earrow': case 'jav': {
        const a = p.ang ?? (p.target ? Math.atan2((p.target.cy ?? p.target.y) - p.y, (p.target.cx ?? p.target.x) - p.x) : 0);
        ctx.rotate(a);
        ctx.strokeStyle = p.kind === 'earrow' || p.kind === 'jav' ? '#5e3a1a' : '#4a3520'; ctx.lineWidth = ts * 0.04;
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
        else if (p.weapon === 'mortar') { ctx.fillStyle = '#3b3d45'; ctx.beginPath(); ctx.arc(0, 0, ts * 0.14 * big, 0, TAU); ctx.fill(); ctx.stroke(); }
        else if (p.weapon === 'meteorstaff') { ctx.fillStyle = '#ff9a3c'; ctx.beginPath(); ctx.arc(0, 0, ts * 0.17 * big, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff2b0'; ctx.beginPath(); ctx.arc(0, 0, ts * 0.07, 0, TAU); ctx.fill(); }
        else if (p.weapon === 'thunderlance') { ctx.strokeStyle = '#bfe9ff'; ctx.lineWidth = ts * 0.05 * big; ctx.beginPath(); ctx.moveTo(-ts * 0.3, 0); ctx.lineTo(-ts * 0.1, -ts * 0.06); ctx.lineTo(ts * 0.05, ts * 0.06); ctx.lineTo(ts * 0.25, 0); ctx.stroke(); }
        else if (p.weapon === 'titanbolt') { ctx.strokeStyle = '#3d2a14'; ctx.lineWidth = ts * 0.08 * big; ctx.beginPath(); ctx.moveTo(-ts * 0.4, 0); ctx.lineTo(ts * 0.2, 0); ctx.stroke(); ctx.fillStyle = '#d9dde6'; ctx.beginPath(); ctx.moveTo(ts * 0.38, 0); ctx.lineTo(ts * 0.18, -ts * 0.11); ctx.lineTo(ts * 0.18, ts * 0.11); ctx.closePath(); ctx.fill(); ctx.stroke(); }
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
    const ctx = this.ctx; let ts = this.ts;
    for (const tr of this.trails) {
      tr.t += dt;
      const k = 1 - tr.t / 0.3;
      if (k <= 0) continue;
      this.beginItem?.(tr.x, tr.y); ts = this.ts;
      ctx.globalAlpha = k;
      ctx.fillStyle = tr.color; ctx.beginPath(); ctx.arc(tr.x * ts, tr.y * ts, ts * 0.05 * k, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.endItem?.();
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
      ctx.fillStyle = f.color; ctx.globalAlpha = k * 0.4;
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

// Tunic, cape and hat for the hero from the equipped outfit (the cape falls back to the castle's roof colour).
export function heroLook(id, sk) {
  const o = HERO_OUTFITS[id] || HERO_OUTFITS.classic;
  return { tunic: o.tunic, cape: o.cape || sk.roof, hat: o.hat, plume: o.plume || '#d9473b' };
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}

export function drawRock(g, cx, cy, ts, B) {
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(cx + ts * 0.04, cy + ts * 0.25, ts * 0.38, ts * 0.14, 0, 0, TAU); g.fill();
  g.fillStyle = '#9aa1b0'; g.strokeStyle = INK; g.lineWidth = ts * 0.04;
  g.beginPath(); g.moveTo(cx - ts * 0.38, cy + ts * 0.22); g.lineTo(cx - ts * 0.3, cy - ts * 0.15); g.lineTo(cx - ts * 0.05, cy - ts * 0.32); g.lineTo(cx + ts * 0.28, cy - ts * 0.18); g.lineTo(cx + ts * 0.38, cy + ts * 0.22); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#c3c8d2'; g.beginPath(); g.moveTo(cx - ts * 0.22, cy - ts * 0.1); g.lineTo(cx - ts * 0.05, cy - ts * 0.24); g.lineTo(cx + ts * 0.05, cy - ts * 0.05); g.closePath(); g.fill();
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
  if (opts.skin) r.cosmetics.towerSkin = opts.skin;
  if (kind === 'tower') {
    r.drawTower({ type: id, cx: size / 2 / r.ts, cy: (size * 0.66) / r.ts, tier: 1, aim: -0.6, recoil: 0, soldiers: [], ghost: true, hp: 1, maxHp: 1 }, null);
  } else if (kind === 'troop') {
    const D = TROOPS[id], wide = D.flies || id === 'cavalry';
    r.ts = size * (wide ? 1.0 : 1.4);
    ctx.lineWidth = r.ts * 0.03; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    ctx.translate(size * (wide ? 0.46 : 0.5), size * (wide ? 0.74 : 0.68));
    drawTroopSprite(ctx, r.ts, { kind: id, rank: 0 }, { ph: 0, t: 1, moving: false, swing: 0 }, D);
  } else if (kind === 'enemy') {
    const boss = id.startsWith('boss:') ? id.slice(5) : null;
    const def = opts.def;
    r.ts = size * (boss ? 0.62 : 0.3 / Math.max(0.2, def.size));
    const e = { x: size / 2 / r.ts, y: (size * (boss ? 0.8 : 0.8)) / r.ts, size: def.size, color: opts.silhouette ? '#3a3f52' : def.color, type: boss ? 'boss' : id, boss, gear: opts.gear || 0, vx: 0.1, vy: 0, bob: 0, hp: 1, maxHp: 1, air: !!def.air, speed: 0, flash: 0, shield: 0, slowT: 0, burnT: 0, stunT: 0, stealthT: 0, buffT: 0 };
    if (opts.silhouette) ctx.globalAlpha = 0.9;
    r.drawEnemy(e, null);
  }
}
