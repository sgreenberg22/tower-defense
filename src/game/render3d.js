// 3D view (v1): a real perspective camera looking over the battlefield, with the far end sinking toward a horizon.
// Layers, back to front:
//   1. #board3d  - a WebGL scene (Three.js): sky, fogged hills and forests, the map as a textured ground plane, raised stone terraces.
//   2. #board    - the familiar 2D art for towers, foes, troops, shots and effects, drawn upright (billboarded) and scaled by the
//                  camera at every foot point, so everything shrinks toward the horizon and can overlap properly.
// The simulation is untouched: this class is a drop-in for Renderer (same fields, draw(), resize(), toWorld(), pickLoot()).
import { Renderer } from './render.js';
import { drawRock } from './render.js';
import { drawTreeV2 } from './scenery.js';
import { TOWERS, TROOPS } from '../data/balance.js';
import { T } from './maps.js';
import { biomeIndex } from './waves.js';
import { INK, TAU, shade, roundRect } from './draw-util.js';

let THREE = null;
export async function loadThree() { return THREE || (THREE = await import('../../vendor/three.module.min.js')); }

// Camera presets. pitch = how far the view is tipped below the horizon, fov = vertical field of view, top = where the far edge of the map sits on screen.
export const TILTS = [
  { id: 'horizon', name: 'Horizon', pitch: 18, fov: 50, top: 0.62 },
  { id: 'angled', name: 'Angled', pitch: 30, fov: 46, top: 0.8 },
  { id: 'high', name: 'High', pitch: 46, fov: 42, top: 0.92 },
];

const SKIES = [
  { top: '#6fb2ea', horizon: '#e4f2d6' },   // meadow
  { top: '#82bde8', horizon: '#f6e3b0' },   // dunes
  { top: '#9cc7e8', horizon: '#eef7fb' },   // frost
  { top: '#241818', horizon: '#74463a' },   // ash
  { top: '#10151f', horizon: '#3a4660' },   // shadow
];

const rngOf = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export class Renderer3D extends Renderer {
  constructor(spriteCanvas, glCanvas, tiltIdx = 1) {
    super(spriteCanvas);
    if (!THREE) throw new Error('loadThree() first');
    this.sctx = this.ctx;                   // the sprite layer
    this.glc = glCanvas;
    this.noTall = true;                     // trees and rocks become upright sprites; the ground texture stays flat
    this.splitAim = true;                   // aim reticles go on the ground, not on the sprite layer
    this.tiltIdx = Math.max(0, Math.min(TILTS.length - 1, tiltIdx | 0));
    this.bgTs = 64; this.gts = 40;
    this.ground = document.createElement('canvas'); this.gctx = this.ground.getContext('2d');
    this.R = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: 'high-performance' });
    this.R.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.5, 700);
    this.pickCam = new THREE.PerspectiveCamera(46, 1, 0.5, 700);
    this.vp = new THREE.Matrix4();
    this._p = { x: 0, y: 0, s: 1, sv: 1 };
    this.worldKey = ''; this.world = null; this.tall = []; this.tallKey = '';
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.35));
    const sun = new THREE.DirectionalLight(0xfff3dc, 1.4); sun.position.set(-30, 60, 20); this.scene.add(sun);
  }

  setTilt(i, game) { this.tiltIdx = Math.max(0, Math.min(TILTS.length - 1, i | 0)); if (game) this.fit(game); }

  // ---------- sizing ----------
  resize(w, h, dpr, game) {
    this.dpr = dpr; this.w = w; this.h = h; this.vw = w; this.kx = 1;
    for (const c of [this.c, this.glc]) { c.style.width = w + 'px'; c.style.height = h + 'px'; }
    this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
    this.R.setPixelRatio(dpr); this.R.setSize(w, h, false);
    this.camera.aspect = this.pickCam.aspect = w / Math.max(1, h);
    if (game) this.fit(game);
  }

  fit(game) {
    this.gmap = game.map;
    this.bgKey = ''; this._bgSeen = '';
    this.worldKey = '';                      // rebuild scenery for the new map
    this.fitCamera(game);
    this.ts = Math.max(8, Math.floor(this.h / (game.map.rows + 2)));   // only used by code that wants a rough tile size
  }

  fitCamera(game) {
    const { cols, rows } = game.map, tilt = TILTS[this.tiltIdx], cam = this.camera, V = THREE.Vector3;
    // tall phone boards tip further over, so the map is not a thin strip
    const pitch = (tilt.pitch + (this.w < this.h * 0.9 ? 16 : 0)) * Math.PI / 180;
    cam.fov = tilt.fov; cam.aspect = this.w / Math.max(1, this.h); cam.updateProjectionMatrix();
    const corners = [new V(0, 0, 0), new V(cols, 0, 0), new V(0, 0, rows), new V(cols, 0, rows)];
    const pose = (D, tz) => {
      cam.position.set(cols / 2, D * Math.sin(pitch), tz + D * Math.cos(pitch)); cam.lookAt(cols / 2, 0, tz); cam.updateMatrixWorld(true);
      let minX = 9, maxX = -9, minY = 9, maxY = -9;
      for (const c of corners) { const p = c.clone().project(cam); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
      return { minX, maxX, minY, maxY };
    };
    const top = tilt.top, bottom = -0.97, tz = rows / 2;
    let D = 6;
    for (; D < 220; D += 0.5) { const e = pose(D, tz); if (e.maxX - e.minX <= 1.9 && e.maxY - e.minY <= top - bottom) break; }
    const e = pose(D, tz);
    // a lens shift (not a camera move) lifts the picture so the map's far edge sits at `top`: the scale stays put
    const shift = (top + bottom) / 2 - (e.minY + e.maxY) / 2;   // centred in the free band, so a wide, short board floats mid-screen
    cam.projectionMatrix.elements[9] -= shift; cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    this.cam = { D, tz, pitch, cx: cols / 2, shift };
    this.pickCam.position.copy(cam.position); this.pickCam.quaternion.copy(cam.quaternion); this.pickCam.fov = cam.fov; this.pickCam.aspect = cam.aspect;
    this.pickCam.projectionMatrix.copy(cam.projectionMatrix); this.pickCam.projectionMatrixInverse.copy(cam.projectionMatrixInverse); this.pickCam.updateMatrixWorld(true);
    this.fitSky(game);
  }

  // A horizon haze behind everything, lined up with where the camera's horizon falls on screen.
  fitSky(game) {
    const bi = (game.biomeIdx ? game.biomeIdx() : biomeIndex(game.wave)), S = SKIES[bi] || SKIES[0];
    const far = new THREE.Vector3(this.cam.cx, 0, -1e5).project(this.camera);
    const hy = Math.min(1, Math.max(0, (1 - far.y) / 2));            // 0 = top of screen
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, S.top); grad.addColorStop(Math.max(0.01, Math.min(0.99, hy)), S.horizon); grad.addColorStop(1, S.horizon);
    g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background?.dispose?.(); this.scene.background = tex;
    this.skyBi = bi;
  }

  // ---------- projection (world tile -> screen px) ----------
  matrices() {
    const cam = this.camera; cam.updateMatrixWorld(true);
    this.vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  }

  // Screen position and scale (px per tile) of the tile point (x, y) lifted h tiles off the ground. null when behind the camera.
  proj(x, y, h = 0) {
    const e = this.vp.elements, W = this.w, H = this.h;
    const cx = e[0] * x + e[4] * h + e[8] * y + e[12], cy = e[1] * x + e[5] * h + e[9] * y + e[13], cw = e[3] * x + e[7] * h + e[11] * y + e[15];
    if (cw < 0.05) return null;
    const p = this._p;
    p.x = (cx / cw * 0.5 + 0.5) * W; p.y = (0.5 - cy / cw * 0.5) * H;
    // horizontal scale = d(screen x)/d(world x); depth scale = d(screen y)/d(world z)
    p.s = Math.abs((e[0] * cw - cx * e[3]) / (cw * cw)) * 0.5 * W;
    p.sv = Math.abs((e[9] * cw - cy * e[11]) / (cw * cw)) * 0.5 * H;
    return p;
  }

  toWorld(px, py) {
    const nx = px / this.w * 2 - 1, ny = -(py / this.h * 2 - 1), cam = this.pickCam;
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(cam), o = cam.position;
    const dy = v.y - o.y;
    if (dy > -1e-6) return { x: -1000, y: -1000 };
    const t = -o.y / dy;
    return { x: o.x + (v.x - o.x) * t, y: o.z + (v.z - o.z) * t };
  }

  // Hooks used by the 2D drawers: aim every following draw at the projected foot point of (x, y).
  beginItem(x, y, lift = 0) {
    const p = this.proj(x, y, lift), ctx = this.sctx;
    if (!p) { this.ts = 0.001; ctx.setTransform(1, 0, 0, 1, -9999, -9999); return false; }
    this.ts = p.s; this._item = true;
    const d = this.dpr; ctx.setTransform(d, 0, 0, d, p.x * d - x * p.s * d, p.y * d - y * p.s * d);
    return true;
  }
  endItem() { this.sctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.ts = this.baseTs; this._item = false; }
  put(x, y, fn, lift = 0) {
    if (!this.beginItem(x, y, lift)) { this.endItem(); return; }
    const p = this._p;
    if (p.x < -160 || p.x > this.w + 160 || p.y < -200 || p.y > this.h + 120) { this.endItem(); return; }
    fn(); this.endItem();
  }
  liftOf(game, x, y) { return game.map.tileAt(Math.floor(x), Math.floor(y)) === T.HIGH ? 0.45 : 0; }

  // ---------- the 3D world ----------
  ensureWorld(game, B) {
    const bi = (game.biomeIdx ? game.biomeIdx() : biomeIndex(game.wave));
    const key = `${game.map.id}|${game.mapSeed || game.seed}|${bi}|${this.theme?.ground ? this.theme.id : ''}|${this.tiltIdx}`;
    if (key === this.worldKey) return;
    this.worldKey = key;
    this.disposeWorld();
    const m = game.map, cols = m.cols, rows = m.rows, grp = new THREE.Group(), S = SKIES[bi] || SKIES[0];
    const rnd = rngOf(hashStr(key));
    const grass = new THREE.Color(B.grass).multiplyScalar(0.9);
    this.scene.fog = new THREE.Fog(new THREE.Color(S.horizon), 38, 190);
    // the open country around the board
    const big = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: grass }));
    big.rotation.x = -Math.PI / 2; big.position.set(cols / 2, -0.04, rows / 2); grp.add(big);
    // the board itself
    this.mapMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const mapMesh = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows), this.mapMat);
    mapMesh.rotation.x = -Math.PI / 2; mapMesh.position.set(cols / 2, 0, rows / 2); grp.add(mapMesh);
    this.ovMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false });
    const ov = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows), this.ovMat);
    ov.rotation.x = -Math.PI / 2; ov.position.set(cols / 2, 0.015, rows / 2); grp.add(ov);
    this.ground.width = cols * this.gts; this.ground.height = rows * this.gts;
    this.ovMat.map?.dispose?.(); this.ovTex = new THREE.CanvasTexture(this.ground); this.ovTex.colorSpace = THREE.SRGBColorSpace; this.ovMat.map = this.ovTex; this.ovMat.needsUpdate = true;
    // raised terraces become real blocks
    const highs = []; for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (m.tileAt(x, y) === T.HIGH) highs.push([x, y]);
    if (highs.length) {
      const side = new THREE.MeshLambertMaterial({ color: 0x8f8878 }), topM = new THREE.MeshLambertMaterial({ color: new THREE.Color(shade(B.grass, 0.14)) });
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.94, 0.45, 0.94), [side, side, topM, side, side, side], highs.length);
      const mx = new THREE.Matrix4();
      highs.forEach(([x, y], i) => { mx.makeTranslation(x + 0.5, 0.225, y + 0.5); im.setMatrixAt(i, mx); });
      grp.add(im);
    }
    // mountains and hills far off
    const mtn = new THREE.Color(shade(S.horizon, bi >= 3 ? 0.05 : -0.32)), hill = new THREE.Color(B.grass).multiplyScalar(0.78);
    for (let i = 0; i < 30; i++) {
      const far = i < 18, h = far ? 14 + rnd() * 26 : 3 + rnd() * 5, r = far ? 10 + rnd() * 16 : 4 + rnd() * 5;
      const geo = far ? new THREE.ConeGeometry(r, h, 5 + Math.floor(rnd() * 3)) : new THREE.SphereGeometry(r, 10, 6, 0, TAU, 0, Math.PI / 2);
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: far ? mtn : hill, flatShading: true }));
      const side = rnd() < 0.5 ? -1 : 1;
      if (far) mesh.position.set(cols / 2 + (rnd() - 0.5) * 240, h / 2 - 0.5, -(75 + rnd() * 70));
      else mesh.position.set(cols / 2 + side * (cols / 2 + 18 + rnd() * 60), 0, -10 + rnd() * (rows + 24));
      grp.add(mesh);
    }
    // forests: low-poly pines scattered outside the board
    const N = 340, fol = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2.6, 6), new THREE.MeshLambertMaterial({ flatShading: true }), N);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.2, 0.9, 5), new THREE.MeshLambertMaterial({ color: 0x5b3d24 }), N);
    const mx = new THREE.Matrix4(), col = new THREE.Color(), base = new THREE.Color(bi === 2 ? '#d7ecf5' : bi === 3 ? '#3a2a28' : bi === 4 ? '#2a3550' : shade(B.grass, -0.36));
    let n = 0;
    while (n < N) {
      const x = cols / 2 + (rnd() - 0.5) * 150, z = -70 + rnd() * (rows + 80);
      if (x > -5 && x < cols + 5 && z > -5 && z < rows + 5) continue;
      if (rnd() < 0.45 && z > rows + 2 && Math.abs(x - cols / 2) < cols) continue;     // keep the foreground clear
      const sc = 0.5 + rnd() * 0.7;
      mx.makeScale(sc, sc, sc); mx.setPosition(x, 0.9 * sc + 0.3 * sc, z); fol.setMatrixAt(n, mx);
      mx.makeScale(sc, sc, sc); mx.setPosition(x, 0.45 * sc, z); trunk.setMatrixAt(n, mx);
      col.copy(base).offsetHSL((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.08); fol.setColorAt(n, col);
      n++;
    }
    grp.add(fol, trunk);
    this.scene.add(grp); this.world = grp;
    this.fitSky(game);
    // upright trees and rocks that stand on the board
    this.tall = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const t = m.tileAt(x, y);
      if (t === T.TREE || t === T.ROCK) this.tall.push({ x: x + 0.5, y: y + 0.5, kind: t, seed: (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 / 1000 });
    }
  }

  disposeWorld() {
    if (!this.world) return;
    this.scene.remove(this.world);
    this.world.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((q) => { q.map?.dispose?.(); q.dispose?.(); }); });
    this.world = null;
  }

  destroy() { this.disposeWorld(); this.scene.background?.dispose?.(); this.R.dispose(); this.R.forceContextLoss?.(); }

  // ---------- frame ----------
  draw(game, fx, dt, ui = {}) {
    this.time += dt; this.dt = dt; this.fx = fx;
    const B = this.biome(game), ts0 = this.baseTs = Math.max(8, Math.floor(this.h / (game.map.rows + 2)));
    this.ensureWorld(game, B);
    const bi = (game.biomeIdx ? game.biomeIdx() : biomeIndex(game.wave));
    if (bi !== this.skyBi) this.fitSky(game);
    // shake nudges the camera; the pick camera stays put so aiming is steady
    const [shx, shy] = fx.shakeOffset();
    const cam = this.camera, c0 = this.cam;
    cam.position.set(c0.cx + shx * 0.6, c0.D * Math.sin(c0.pitch) + shy * 0.4, c0.tz + c0.D * Math.cos(c0.pitch)); cam.lookAt(c0.cx, 0, c0.tz);
    this.matrices();

    // ---- ground textures ----
    const sctx = this.sctx, gctx = this.gctx, m = game.map;
    this.ts = this.bgTs; const dprKeep = this.dpr; this.dpr = 1;
    this.buildBg(game);
    this.dpr = dprKeep;
    if (this.bgKey !== this._bgSeen) {
      this._bgSeen = this.bgKey;
      this.mapTex?.dispose();
      this.mapTex = new THREE.CanvasTexture(this.bg); this.mapTex.colorSpace = THREE.SRGBColorSpace;
      this.mapTex.anisotropy = Math.min(8, this.R.capabilities.getMaxAnisotropy());
      this.mapMat.map = this.mapTex; this.mapMat.needsUpdate = true;
    }
    const gts = this.gts;
    this.ctx = gctx; this.ts = gts;
    gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.clearRect(0, 0, this.ground.width, this.ground.height);
    this.drawGroundLayer(game, fx, dt, ui);
    this.ovTex.needsUpdate = true;
    this.R.render(this.scene, cam);

    // ---- upright layer ----
    this.ctx = sctx; this.ts = ts0;
    sctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); sctx.clearRect(0, 0, this.w, this.h);
    this.drawUpright(game, fx, dt, ui, bi);
  }

  drawGroundLayer(game, fx, dt, ui) {
    const g = this.gctx, ts = this.gts, B = this;
    for (const f of game.fields) {
      const a = Math.min(1, f.t);
      g.fillStyle = `rgba(255,120,40,${0.3 * a})`; g.beginPath(); g.arc(f.x * ts, f.y * ts, f.r * ts, 0, TAU); g.fill();
      if (Math.random() < 0.3) fx.burst(f.x + (Math.random() - 0.5) * f.r, f.y + (Math.random() - 0.5) * f.r, 1, { color: ['#ffb347', '#e0532f'], speed: 0.4, life: 0.5, gravity: -2, size: 0.06 });
    }
    for (const z of game.zones || []) {
      const a = Math.min(1, z.t, (z.max - z.t) * 3 + 0.3), plague = z.kind === 'plague';
      g.fillStyle = plague ? `rgba(120,200,70,${0.3 * a})` : `rgba(160,150,130,${0.32 * a})`;
      g.beginPath(); g.arc(z.x * ts, z.y * ts, z.r * ts, 0, TAU); g.fill();
      g.strokeStyle = plague ? `rgba(170,240,110,${0.75 * a})` : `rgba(230,220,200,${0.75 * a})`; g.lineWidth = ts * 0.05;
      g.beginPath(); g.arc(z.x * ts, z.y * ts, z.r * ts, 0, TAU); g.stroke();
      if (Math.random() < 0.35) {
        const an = Math.random() * TAU, d = Math.sqrt(Math.random()) * z.r;
        fx.burst(z.x + Math.cos(an) * d, z.y + Math.sin(an) * d, 1, plague ? { color: ['#9be25a', '#5f9b34'], speed: 0.3, life: 0.9, gravity: -1, size: 0.1 } : { color: ['#cfc7b6', '#8a8472'], speed: 0.2, life: 0.4, gravity: -0.5, size: 0.06 });
      }
    }
    for (const v of game.volleys) {
      if (!v.warn) continue;
      const k = 1 - Math.max(0, v.t) / v.warn;
      g.strokeStyle = `rgba(255,90,40,${0.5 + 0.4 * Math.sin(this.time * 14)})`; g.lineWidth = ts * 0.07;
      g.beginPath(); g.arc(v.x * ts, v.y * ts, v.r * ts, 0, TAU); g.stroke();
      g.fillStyle = `rgba(255,90,40,${0.14 + 0.28 * k})`; g.beginPath(); g.arc(v.x * ts, v.y * ts, v.r * ts * k, 0, TAU); g.fill();
    }
    if (this.selected && game.towers.includes(this.selected)) this.drawRange(this.selected.cx, this.selected.cy, this.selected.stats.range || TOWERS[this.selected.type].range || 0, this.selected.stats.minRange, true);
    if (this.ghost) {
      const def = TOWERS[this.ghost.type], hg = game.map.tileAt(this.ghost.x, this.ghost.y) === T.HIGH ? 0.6 : 0;
      this.drawRange(this.ghost.x + 0.5, this.ghost.y + 0.5, def.aura || (def.range ? def.range + hg : 0.6), def.minRange, this.ghost.ok);
      if (!this.ghost.ok) {
        g.strokeStyle = '#d9473b'; g.lineWidth = ts * 0.1; const gx = this.ghost.x * ts, gy = this.ghost.y * ts;
        g.beginPath(); g.moveTo(gx + ts * 0.2, gy + ts * 0.2); g.lineTo(gx + ts * 0.8, gy + ts * 0.8); g.moveTo(gx + ts * 0.8, gy + ts * 0.2); g.lineTo(gx + ts * 0.2, gy + ts * 0.8); g.stroke();
      }
    } else if (this.hover && ui.placing === null && !game.over) {
      const h = this.hover;
      if (h.x >= 0 && h.y >= 0 && h.x < game.map.cols && h.y < game.map.rows) {
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = ts * 0.06;
        roundRect(g, h.x * ts + 2, h.y * ts + 2, ts - 4, ts - 4, ts * 0.12); g.stroke();
      }
    }
    this.drawAim();
    if (this.charge) {
      const { x, y, amount } = this.charge;
      g.strokeStyle = amount >= 0.95 ? '#f2b33d' : 'rgba(255,255,255,0.9)'; g.lineWidth = ts * 0.08;
      if (amount > 0) { g.beginPath(); g.arc(x * ts, y * ts, ts * (0.5 - 0.2 * amount), -Math.PI / 2, -Math.PI / 2 + TAU * amount); g.stroke(); }
    }
  }

  drawUpright(game, fx, dt, ui, bi) {
    const ctx = this.sctx, m = game.map, B = this.biome(game);
    // flat decals first: portals, plot foundations, ruins
    this.drawPortals(game);
    this.drawPlots(game, ui);
    if (this.selected?.type === 'barracks' && this.selected.rallyPt && game.towers.includes(this.selected)) {
      const rp = this.selected.rallyPt;
      this.put(rp.x, rp.y, () => {
        const ts = this.ts;
        ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = ts * 0.05;
        ctx.beginPath(); ctx.moveTo(rp.x * ts, rp.y * ts + ts * 0.15); ctx.lineTo(rp.x * ts, rp.y * ts - ts * 0.45); ctx.stroke();
        ctx.fillStyle = '#f2b33d'; ctx.beginPath(); ctx.moveTo(rp.x * ts, rp.y * ts - ts * 0.45); ctx.lineTo(rp.x * ts + ts * 0.3, rp.y * ts - ts * 0.34); ctx.lineTo(rp.x * ts, rp.y * ts - ts * 0.22); ctx.closePath(); ctx.fill(); ctx.stroke();
      });
    }
    this.updateHero(game, dt);
    // traps lie flat under everything
    for (const t of game.towers) if (TOWERS[t.type].trap) this.put(t.cx, t.cy, () => this.drawTower(t, game));

    const list = [];
    list.push({ y: m.castle.y + 0.2, castle: true });
    for (const o of this.tall) list.push({ y: o.y + 0.3, tall: o });
    for (const t of game.towers) if (!TOWERS[t.type].trap) list.push({ y: t.cy + 0.3, t });
    for (const e of game.enemies) if (!e.dead) list.push({ y: e.y + (e.air ? 0.6 : 0), e });
    for (const t of game.towers) for (const so of t.soldiers) if (!so.dead) list.push({ y: so.y, so });
    for (const u of game.garrison.units) if (u.state !== 'reserve' && !u.dead) list.push({ y: u.y + (TROOPS[u.kind].flies ? 0.6 : 0), tr: u });
    for (const c of this.corpses) { c.t += dt; list.push({ y: c.e.y, c }); }
    this.corpses = this.corpses.filter((c) => c.t < c.life);
    list.sort((a, b) => a.y - b.y);
    const fog = game.mod.fog;
    for (const it of list) {
      if (it.castle) this.put(m.castle.x, m.castle.y, () => this.drawCastle(game));
      else if (it.tall) {
        const o = it.tall;
        this.put(o.x, o.y, () => { const ts = this.ts; if (o.kind === T.TREE) drawTreeV2(ctx, o.x * ts, o.y * ts, ts, bi, o.seed); else drawRock(ctx, o.x * ts, o.y * ts, ts, B); });
      }
      else if (it.t) this.put(it.t.cx, it.t.cy, () => this.drawTower(it.t, game), this.liftOf(game, it.t.cx, it.t.cy));
      else if (it.so) this.put(it.so.x, it.so.y, () => this.drawSoldier(it.so));
      else if (it.tr) this.put(it.tr.x, it.tr.y, () => this.drawTroop(it.tr));
      else if (it.c) this.put(it.c.e.x, it.c.e.y, () => this.drawCorpse(it.c));
      else if (!fog || game.isVisible(it.e)) this.put(it.e.x, it.e.y, () => this.drawEnemy(it.e, game));
    }
    for (const t of game.towers) if (t.beam) for (const b of t.beam) this.beam3d(t, b);
    for (const p of game.projectiles) this.put(p.x, p.y, () => this.drawProjectile(p, fx));
    this.drawLoot(dt);
    this.drawTrails(dt);
    this.drawFx3d(fx);
    if (this.ghost) {
      ctx.globalAlpha = 0.65;
      const g = this.ghost;
      this.put(g.x + 0.5, g.y + 0.5, () => this.drawTower({ type: g.type, cx: g.x + 0.5, cy: g.y + 0.5, tier: 1, aim: -Math.PI / 2, recoil: 0, soldiers: [], ghost: true, hp: 1, maxHp: 1 }, game), this.liftOf(game, g.x, g.y));
      ctx.globalAlpha = 1;
    }
    if (game.hazard.active > 0 && game.phase === 'wave' && !this.noWeatherFx) {
      const k = game.hazard.kind;
      ctx.fillStyle = k === 'sandstorm' ? 'rgba(230,190,110,0.16)' : k === 'blizzard' ? 'rgba(230,245,255,0.16)' : k === 'meteors' ? 'rgba(255,90,40,0.07)' : 'rgba(40,20,70,0.16)';
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  beam3d(t, b) {
    const a = this.proj(t.cx, t.cy, 0.78); if (!a) return;
    const ax = a.x, ay = a.y;
    const e = b.e, c = this.proj(e.x, e.y, e.air ? 0.35 : 0.15); if (!c) return;
    const ctx = this.sctx, k = b.ramp / (t.stats.rampMax || 4), s = c.s;
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255,220,120,${0.35 + 0.3 * k})`; ctx.lineWidth = s * (0.12 + 0.12 * k);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(c.x, c.y); ctx.stroke();
    ctx.strokeStyle = '#fffbe6'; ctx.lineWidth = s * (0.04 + 0.04 * k); ctx.stroke(); ctx.lineCap = 'butt';
  }

  // Effects in screen space: ground rings lie flat (squashed by the camera), particles and words stand up.
  drawFx3d(fx) {
    const ctx = this.sctx;
    if (this._burnAt) { for (const [x, y] of this._burnAt) fx.burst(x, y, 1, { color: ['#ffb347', '#e0532f', '#ffd25e'], speed: 0.5, life: 0.45, gravity: -3, size: 0.07 }); this._burnAt = null; }
    if (this._ember) { for (const [x, y] of this._ember) fx.burst(x, y, 1, { color: ['#ffb347', '#e0532f'], speed: 0.4, life: 0.5, gravity: -2.5, size: 0.05 }); this._ember = null; }
    if (this._smokeAt) { fx.burst(this._smokeAt[0], this._smokeAt[1], 1, { color: ['#888', '#aaa'], speed: 0.3, life: 1, gravity: -1.2, size: 0.12 }); this._smokeAt = null; }
    for (const f of fx.flashes) {
      const p = this.proj(f.x, f.y); if (!p) continue;
      const k = 1 - f.t / f.life, r = Math.max(0.1, f.r * (0.6 + 0.4 * (1 - k)));
      ctx.fillStyle = f.color; ctx.globalAlpha = k * 0.4; ctx.beginPath(); ctx.ellipse(p.x, p.y, r * p.s, r * p.sv, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const r of fx.rings) {
      const p = this.proj(r.x, r.y); if (!p) continue;
      const k = r.t / r.life, rr = Math.max(0.1, r.r * (0.3 + 0.7 * k));
      ctx.strokeStyle = r.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = Math.max(1, r.width * p.s * (1 - k * 0.5));
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rr * p.s, rr * p.sv, 0, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const z of fx.zaps) {
      const k = 1 - z.t / z.life, pts = z.points.map((q) => { const p = this.proj(q.x, q.y, 0.5); return p && { x: p.x, y: p.y, s: p.s }; });
      if (pts.some((q) => !q)) continue;
      ctx.strokeStyle = z.color; ctx.lineWidth = pts[0].s * 0.06 * k; ctx.lineCap = 'round'; ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (i === 0) { ctx.moveTo(p.x, p.y); continue; }
        const q = pts[i - 1], j = p.s * 0.25;
        for (let n = 1; n <= 3; n++) { const f = n / 4; ctx.lineTo(q.x + (p.x - q.x) * f + (Math.random() - 0.5) * j, q.y + (p.y - q.y) * f + (Math.random() - 0.5) * j); }
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = pts[0].s * 0.02 * k; ctx.stroke();
    }
    for (const q of fx.parts) {
      const p = this.proj(q.x, q.y); if (!p) continue;
      const k = 1 - q.t / q.life, r = Math.max(0.5, q.size * p.s * (0.5 + 0.5 * k));
      ctx.globalAlpha = Math.min(1, k * 1.5); ctx.fillStyle = q.color;
      if (q.shape === 'rect') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(q.spin); ctx.fillRect(-r, -r * 0.5, r * 2, r); ctx.restore(); }
      else if (q.shape === 'square') ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      else { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    for (const t of fx.texts) {
      const p = this.proj(t.x, t.y, 0.4); if (!p) continue;
      const k = 1 - t.t / t.life, pop = t.t < 0.12 ? 1 + (0.12 - t.t) * 4 : 1, s = Math.max(p.s, this.baseTs * 0.8);
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `${t.bold ? 800 : 700} ${Math.round(t.size * s * pop)}px "Baloo 2", system-ui`;
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, s * 0.08);
      ctx.strokeText(t.str, p.x, p.y); ctx.fillStyle = t.color; ctx.fillText(t.str, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
}
