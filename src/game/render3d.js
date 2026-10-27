// 3D view (v1): a real perspective camera looking over the battlefield, with the far end sinking toward a horizon.
// Layers, back to front:
//   1. #board3d  - a WebGL scene (Three.js): sky, fogged hills and forests, the map as a textured ground plane, raised stone terraces.
//   2. #board    - the familiar 2D art for towers, foes, troops, shots and effects, drawn upright (billboarded) and scaled by the
//                  camera at every foot point, so everything shrinks toward the horizon and can overlap properly.
// The simulation is untouched: this class is a drop-in for Renderer (same fields, draw(), resize(), toWorld(), pickLoot()).
import { Renderer, drawRock } from './render.js';
import { drawTreeV2 } from './scenery.js';
import { drawHero } from './sprites.js';
import { CASTLE_SKINS, TOWER_SKINS, heroLook } from './render.js';
import { makeUnits } from './units3d.js';
import { makeKit, buildTowerModel, tickTowerModel, buildCastle, tickCastle, buildParapet } from './models3d.js';
import { Fx3D } from './fx3d.js';
import { Weather3D } from './weather3d.js';
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
  { id: 'wall', name: 'Castle wall', wall: true, fov: 72 },   // first person, standing on the battlements: look around and shoot
];

const SKIES = [
  { top: '#6fb2ea', horizon: '#e4f2d6' },   // meadow
  { top: '#82bde8', horizon: '#f6e3b0' },   // dunes
  { top: '#9cc7e8', horizon: '#eef7fb' },   // frost
  { top: '#241818', horizon: '#74463a' },   // ash
  { top: '#10151f', horizon: '#3a4660' },   // shadow
];

const LIGHTS = [
  { amb: ['#ffffff', 1.3], sun: ['#fff3dc', 1.5], fog: [38, 190], shadow: 0.3 },     // meadow
  { amb: ['#fff0d0', 1.35], sun: ['#ffe2a8', 1.6], fog: [34, 170], shadow: 0.32 },   // dunes
  { amb: ['#e6f2ff', 1.5], sun: ['#dbeaff', 1.1], fog: [26, 140], shadow: 0.22 },    // frost
  { amb: ['#ffd4c4', 1.0], sun: ['#ff8a50', 1.05], fog: [22, 120], shadow: 0.4 },   // ash
  { amb: ['#9fb0ff', 0.75], sun: ['#8ea0ff', 0.6], fog: [18, 100], shadow: 0.35 },   // shadow
];

const rngOf = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---------- upright sprites with real depth ----------
// The 2D art for foes, troops and so on is drawn into a texture atlas each frame and shown on camera-facing quads inside the
// 3D scene, so towers, hills and sprites hide one another correctly. One instanced draw call; cells are packed by size.
const BB_VERT = `
attribute vec3 iFoot; attribute vec2 iSize; attribute float iFb; attribute vec4 iUV; attribute float iA;
uniform vec3 uRight; uniform vec3 uUp;
varying vec2 vUv; varying float vA;
void main() {
  vec2 c = position.xy;
  vec3 wp = iFoot + uRight * ((c.x - 0.5) * iSize.x) + uUp * ((c.y - iFb) * iSize.y);
  wp += normalize(cameraPosition - wp) * 0.35;           // nudge toward the camera so shadows at the feet are not buried in the ground
  vUv = vec2(mix(iUV.x, iUV.z, c.x), mix(iUV.y, iUV.w, c.y)); vA = iA;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const BB_FRAG = `
uniform sampler2D uMap; varying vec2 vUv; varying float vA;
void main() { vec4 t = texture2D(uMap, vUv); if (t.a < 0.07) discard; gl_FragColor = vec4(t.rgb, t.a * vA); }`;

class Billboards {
  constructor(max, atlasW, label) {
    this.max = max; this.W = atlasW; this.items = []; this.H = 0; this.label = label;
    this.canvas = document.createElement('canvas'); this.canvas.width = atlasW; this.canvas.height = 256; this.ctx = this.canvas.getContext('2d');
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (n, c) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * c), c); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aFoot = mk('f', 3); this.aSize = mk('s', 2); this.aFb = mk('b', 1); this.aUV = mk('u', 4); this.aA = mk('a', 1);
    this.geo.setAttribute('iFoot', this.aFoot); this.geo.setAttribute('iSize', this.aSize); this.geo.setAttribute('iFb', this.aFb); this.geo.setAttribute('iUV', this.aUV); this.geo.setAttribute('iA', this.aA);
    this.uniforms = { uMap: { value: null }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) } };
    this.mat = new THREE.ShaderMaterial({ vertexShader: BB_VERT, fragmentShader: BB_FRAG, uniforms: this.uniforms, transparent: true, depthWrite: true, depthTest: true, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    this.tex = null; this.texH = 0;
  }
  begin() { this.items.length = 0; }
  // wx,wz: foot on the ground; lift: height of the foot; wT,hT: box in tiles; fb: foot height as a fraction of the box; ppt: pixels per tile
  add(it) { if (this.items.length < this.max) this.items.push(it); }
  flush(renderer, camera) {
    const items = this.items, W = this.W, pad = 2;
    let k = 1, H = 0, placed;
    const cap = this.cap || (this.cap = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 1024 : 2048);   // phones: a smaller atlas to upload each frame
    for (let attempt = 0; attempt < 7; attempt++) {
      placed = []; let x = 0, y = 0, rowH = 0;
      const order = items.map((it, i) => ({ it, i, pw: Math.max(4, Math.ceil(it.wT * it.ppt * k)) + pad * 2, ph: Math.max(4, Math.ceil(it.hT * it.ppt * k)) + pad * 2 })).sort((a, b) => b.ph - a.ph);
      for (const o of order) {
        if (x + o.pw > W) { x = 0; y += rowH; rowH = 0; }
        o.px = x; o.py = y; x += o.pw; rowH = Math.max(rowH, o.ph); placed.push(o);
      }
      H = y + rowH;
      if (H <= cap) break;
      k *= 0.8;
    }
    // The atlas only ever grows: re-creating a big GPU texture each time a wave's count of health bars changed churned memory on phones.
    const need = Math.max(256, Math.ceil(H / 256) * 256, this.texH);
    if (need !== this.texH) {
      this.tex?.dispose(); this.canvas.height = need; this.texH = need;
      this.tex = new THREE.CanvasTexture(this.canvas); this.tex.generateMipmaps = false; this.tex.minFilter = THREE.LinearFilter; this.tex.magFilter = THREE.LinearFilter;
      this.uniforms.uMap.value = this.tex;
    }
    const ctx = this.ctx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, need);
    let n = 0;
    for (const o of placed) {
      const it = o.it, ppt = it.ppt * k, cw = o.pw - pad * 2, ch = o.ph - pad * 2, cx0 = o.px + pad, cy0 = o.py + pad;
      ctx.save(); ctx.beginPath(); ctx.rect(cx0, cy0, cw, ch); ctx.clip();
      ctx.setTransform(1, 0, 0, 1, cx0 + cw / 2 - it.ex * ppt, cy0 + ch * (1 - it.fb) - it.ey * ppt);
      it.draw(ppt, ctx);
      ctx.restore();
      this.aFoot.setXYZ(n, it.wx, it.lift || 0, it.wz); this.aSize.setXY(n, cw / ppt, ch / ppt);
      this.aFb.setX(n, it.fb); this.aA.setX(n, it.alpha ?? 1);
      this.aUV.setXYZW(n, cx0 / W, 1 - (cy0 + ch) / need, (cx0 + cw) / W, 1 - cy0 / need);
      n++;
    }
    this.geo.instanceCount = n;
    for (const a of [this.aFoot, this.aSize, this.aFb, this.aUV, this.aA]) a.needsUpdate = true;
    this.tex.needsUpdate = true;
    this.axes(camera);
  }
  axes(camera) {
    camera.updateMatrixWorld(); const e = camera.matrixWorld.elements;
    this.uniforms.uRight.value.set(e[0], e[1], e[2]); this.uniforms.uUp.value.set(e[4], e[5], e[6]);
  }
  dispose() { this.tex?.dispose(); this.geo.dispose(); this.mat.dispose(); }
}

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
    this.amb = new THREE.AmbientLight(0xffffff, 1.35); this.scene.add(this.amb);
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a7040, 0.7); this.scene.add(this.hemi);   // sky above, grass bounce below: tops lit, sides shaded
    this.sun = new THREE.DirectionalLight(0xfff3dc, 1.4); this.scene.add(this.sun, this.sun.target);
    this.R.shadowMap.type = THREE.PCFSoftShadowMap;
    // If the phone reclaims the GPU (memory pressure, app switch), don't die with a frozen frame: tell the play screen.
    this.lost = false;
    glCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; try { this.onLost?.(); } catch { /* ignore */ } }, false);
    this.kit = makeKit(THREE); this.U = makeUnits(this.kit); this.um = new Map(); this.bodyless = true;
    this.models = new Map(); this.castleModel = null; this.ghostModel = null;
    this.bb = new Billboards(700, 2048); this.scene.add(this.bb.mesh);
    this.fx3 = new Fx3D(THREE, this.scene, this.kit);   // 3D shot, smoke, fire and debris
    this.weather = new Weather3D(THREE, this.scene, this.kit);   // snow, sand and twisters, embers, mist
    // soft contact shadows under every foe, soldier and troop (one instanced draw)
    this.unitBlobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.kit.tex('blob'), transparent: true, depthWrite: false, opacity: 0.8 }), 600);
    this.unitBlobs.frustumCulled = false; this.unitBlobs.renderOrder = 2; this.unitBlobs.count = 0; this.scene.add(this.unitBlobs);
    this.bbStatic = new Billboards(260, 2048); this.scene.add(this.bbStatic.mesh);
  }

  // Low-power mode for devices that cannot keep up: no shadow maps, 1x resolution, no grass tufts, lighter weather.
  setLowPower(on, game) {
    this.lowPower = !!on;
    this.R.shadowMap.enabled = !on && this.quality !== 'low' && !this.reduced; this.sun.castShadow = this.R.shadowMap.enabled;
    if (this.world) this.world.traverse((o) => { if (o.userData.detail) o.visible = !on; });
    this._size = '';
  }
  setTilt(i, game) { this.tiltIdx = Math.max(0, Math.min(TILTS.length - 1, i | 0)); if (game) this.fit(game); }

  // ---------- sizing ----------
  resize(w, h, dpr, game) {
    // Phones: a 3D frame at 1.5x looks nearly as sharp as 2x for far less GPU memory and fill; low-power mode drops to 1x.
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    dpr = this.lowPower ? 1 : coarse ? Math.min(dpr, 1.5) : dpr;
    // Re-allocating the canvases on every tiny layout change (iOS address bar, toasts) churns GPU memory: skip no-op resizes.
    if (this._size === `${w}|${h}|${dpr}`) { if (game) this.fit(game); return; }
    this._size = `${w}|${h}|${dpr}`;
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

  get isWall() { return !!TILTS[this.tiltIdx].wall; }

  // First-person pose: eyes on the battlements, turned toward where the horde comes from; `look` is the player's turn and tilt.
  wallBase(game) {
    const c = game.map.castle, p = game.map.paths[0][0], dx = p.x - c.x, dz = p.y - c.y;
    return Math.atan2(dx, dz);
  }
  lookBy(dyaw, dpitch, game) {
    const L = this.look || (this.look = { yaw: 0, pitch: -0.36 });
    L.yaw = Math.max(-1.9, Math.min(1.9, L.yaw + dyaw)); L.pitch = Math.max(-1.0, Math.min(0.15, L.pitch + dpitch));
    this.fitCamera(game);
  }
  fitWall(game) {
    const cam = this.camera, c = game.map.castle, L = this.look || (this.look = { yaw: 0, pitch: -0.36 });
    cam.fov = TILTS[this.tiltIdx].fov; cam.aspect = this.w / Math.max(1, this.h); cam.updateProjectionMatrix();
    const a = this.wallBase(game) + L.yaw, cp = Math.cos(L.pitch);
    // eyes on the battlements, at the very edge of the wall, so nothing of your own blocks the field
    const b0 = this.wallBase(game), ex = c.x + Math.sin(b0) * 0.15, ez = c.y + Math.cos(b0) * 0.15, ey = 3.7;   // right at the parapet's edge
    cam.position.set(ex, ey, ez);
    cam.lookAt(ex + Math.sin(a) * cp, ey + Math.sin(L.pitch), ez + Math.cos(a) * cp); cam.updateMatrixWorld(true);
    this.cam = { wall: true, cx: c.x, tz: c.y, D: 0, pitch: 0, shift: 0, yaw: 0 };
    this.pickCam.position.copy(cam.position); this.pickCam.quaternion.copy(cam.quaternion); this.pickCam.fov = cam.fov; this.pickCam.aspect = cam.aspect;
    this.pickCam.projectionMatrix.copy(cam.projectionMatrix); this.pickCam.projectionMatrixInverse.copy(cam.projectionMatrixInverse); this.pickCam.updateMatrixWorld(true);
    this.fitSky(game);
  }

  // The foe nearest a screen point (CSS px) within `r` px, judged where it is drawn (so tall and flying foes are hit where they appear).
  pickScreen(game, px, py, r = 46) {
    this.matrices();
    let best = null, bd = r;
    for (const e of game.enemies) {
      if (e.dead || e.burrowT > 0 || !game.isVisible(e)) continue;
      const lift = e.size * 0.45 + (e.air ? 0.5 : 0), p = this.proj(e.x, e.y, lift);
      if (!p) continue;
      const d = Math.hypot(p.x - px, p.y - py) - e.size * 0.35 * p.s;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  fitCamera(game) {
    if (TILTS[this.tiltIdx].wall) return this.fitWall(game);
    const { cols, rows } = game.map, tilt = TILTS[this.tiltIdx], cam = this.camera, V = THREE.Vector3;
    // tall phone boards tip further over, so the map is not a thin strip
    const pitch = (tilt.pitch + (this.w < this.h * 0.9 ? 16 : 0)) * Math.PI / 180;
    cam.fov = tilt.fov; cam.aspect = this.w / Math.max(1, this.h); cam.updateProjectionMatrix();
    const yaw = this.yaw || 0;
    const corners = [new V(0, 0, 0), new V(cols, 0, 0), new V(0, 0, rows), new V(cols, 0, rows)];
    const pose = (D, tz) => {
      cam.position.set(cols / 2 + D * Math.cos(pitch) * Math.sin(yaw), D * Math.sin(pitch), tz + D * Math.cos(pitch) * Math.cos(yaw)); cam.lookAt(cols / 2, 0, tz); cam.updateMatrixWorld(true);
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
    this.cam = { D, tz, pitch, cx: cols / 2, shift, yaw };
    this.pickCam.position.copy(cam.position); this.pickCam.quaternion.copy(cam.quaternion); this.pickCam.fov = cam.fov; this.pickCam.aspect = cam.aspect;
    this.pickCam.projectionMatrix.copy(cam.projectionMatrix); this.pickCam.projectionMatrixInverse.copy(cam.projectionMatrixInverse); this.pickCam.updateMatrixWorld(true);
    if (!this.orbiting) this.fitSky(game);
  }

  // Swing the view around the field (radians; 0 = the default view from the south).
  setYaw(y, game) {
    y = Math.max(-1.4, Math.min(1.4, y));
    if (Math.abs(y - (this.yaw || 0)) < 1e-4) return;
    this.yaw = y; this.orbiting = true; this.fitCamera(game);
    clearTimeout(this._skyT); this._skyT = setTimeout(() => { this.orbiting = false; try { this.fitSky(game); } catch {} }, 250);
  }

  // A horizon haze behind everything, lined up with where the camera's horizon falls on screen.
  fitSky(game) {
    const bi = (game.biomeIdx ? game.biomeIdx() : biomeIndex(game.wave)), S = SKIES[bi] || SKIES[0];
    const far = this.isWall ? new THREE.Vector3().setFromMatrixPosition(this.camera.matrixWorld).add(new THREE.Vector3(0, 0, 0).setFromMatrixColumn(this.camera.matrixWorld, 2).multiplyScalar(-1).setY(0).normalize().multiplyScalar(1e5)).project(this.camera) : new THREE.Vector3(this.cam.cx, 0, -1e5).project(this.camera);
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
    if (this.flat) return true;
    const p = this.proj(x, y, lift), ctx = this.sctx;
    if (!p) { this.ts = 0.001; ctx.setTransform(1, 0, 0, 1, -9999, -9999); return false; }
    this.ts = p.s; this._item = true;
    const d = this.dpr; ctx.setTransform(d, 0, 0, d, p.x * d - x * p.s * d, p.y * d - y * p.s * d);
    return true;
  }
  endItem() { if (this.flat) return; this.sctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.ts = this.baseTs; this._item = false; }
  put(x, y, fn, lift = 0) {
    if (!this.beginItem(x, y, lift)) { this.endItem(); return; }
    const p = this._p;
    if (p.x < -160 || p.x > this.w + 160 || p.y < -200 || p.y > this.h + 120) { this.endItem(); return; }
    fn(); this.endItem();
  }

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
    const big = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: grass, map: fieldTexture(THREE, bi) }));
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
      const side = new THREE.MeshLambertMaterial({ color: 0xa39a88, map: this.kit.tex('stone') }), topM = new THREE.MeshLambertMaterial({ color: new THREE.Color(shade(B.grass, 0.14)), map: fieldTexture(THREE, bi, 1) });
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.94, 0.45, 0.94), [side, side, topM, side, side, side], highs.length);
      const mx = new THREE.Matrix4();
      highs.forEach(([x, y], i) => { mx.makeTranslation(x + 0.5, 0.225, y + 0.5); im.setMatrixAt(i, mx); });
      grp.add(im);
    }
    addBoardEdge(THREE, grp, this.kit, cols, rows, B, bi, rnd);
    // terrain detail: a fine grain of blades, pebbles and soil multiplied over the painted board, and 3D grass tufts
    if (typeof document !== 'undefined') {
      const dm = new THREE.MeshBasicMaterial({ map: detailTexture(THREE, cols, rows), transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true, fog: false });
      const det = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows), dm); det.rotation.x = -Math.PI / 2; det.position.set(cols / 2, 0.006, rows / 2); det.renderOrder = 0; grp.add(det);
    }
    if (this.quality !== 'low') { const tufts = grassTufts(THREE, m, bi, B, rnd); tufts.userData.detail = true; tufts.visible = !this.lowPower; grp.add(tufts); }
    // water: a glossy, rippling sheet over the painted pools (it catches the sun; the ripples drift in draw())
    const wet = []; for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (m.tileAt(x, y) === T.WATER) wet.push([x, y]);
    this.waterTex = null;
    if (wet.length && typeof document !== 'undefined') {
      this.waterTex = waterTexture(THREE);
      const wm = new THREE.MeshPhongMaterial({ color: bi === 2 ? '#cfeaff' : bi === 3 ? '#ff8a40' : '#7cc4f0', map: this.waterTex, transparent: true, opacity: bi === 3 ? 0.75 : 0.5, shininess: 90, specular: new THREE.Color('#ffffff'), depthWrite: false, ...(bi === 3 ? { emissive: new THREE.Color('#a03a10'), emissiveIntensity: 0.6 } : {}) });
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), wm, wet.length), mx = new THREE.Matrix4(), rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
      wet.forEach(([x, y], i) => { mx.makeTranslation(x + 0.5, 0.03, y + 0.5).multiply(rot); im.setMatrixAt(i, mx); });
      im.renderOrder = 3; grp.add(im);
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
    this.fitSky(game);
    // atmosphere: light colour and strength follow the land
    const L = LIGHTS[bi] || LIGHTS[0];
    this.amb.color.set(L.amb[0]); this.amb.intensity = L.amb[1] * 0.55; this.sun.color.set(L.sun[0]); this.sun.intensity = L.sun[1] * 1.25;
    this.hemi.color.set(S.top).lerp(new THREE.Color('#ffffff'), 0.5); this.hemi.groundColor.set(grass).multiplyScalar(0.8); this.hemi.intensity = L.amb[1] * 0.6;
    this.scene.fog.near = L.fog[0]; this.scene.fog.far = L.fog[1];
    this.fogBase = { near: L.fog[0], far: L.fog[1], color: this.scene.fog.color.clone(), sun: this.sun.intensity, hemi: this.hemi.intensity };
    // sun and shadows
    const cx = cols / 2, cz = rows / 2, R = Math.hypot(cols, rows) / 2 + 3;
    this.sun.position.set(cx - 12, 24, cz + 9); this.sun.target.position.set(cx, 0, cz);
    const shOn = this.quality !== 'low' && !this.reduced && !this.lowPower;
    this.R.shadowMap.enabled = shOn; this.sun.castShadow = shOn;
    const sc = this.sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 80; sc.updateProjectionMatrix();
    const sm = this.quality === 'high' && this.w > 900 ? 2048 : 1024; this.sun.shadow.mapSize.set(sm, sm); this.sun.shadow.bias = -0.0008; this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows), new THREE.ShadowMaterial({ opacity: L.shadow, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(cx, 0.008, cz); sh.receiveShadow = true; sh.renderOrder = 1; grp.add(sh);
    this.scene.add(grp); this.world = grp;
    // the castle
    const sk = CASTLE_SKINS[this.cosmetics.castle] || CASTLE_SKINS.stone;
    this.castleModel = buildCastle(this.kit, sk); this.castleSk = sk;
    this.castleModel.g.position.set(m.castle.x, 0, m.castle.y); this.castleModel.g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    grp.add(this.castleModel.g);
    // the battlements you stand on in the first-person wall view
    this.parapet = buildParapet(this.kit, sk);
    this.parapet.g.position.set(m.castle.x, 0, m.castle.y); this.parapet.g.rotation.y = this.wallBase(game); this.parapet.g.visible = false;
    grp.add(this.parapet.g);
    // trees and rocks that stand on the board: drawn once into their own atlas
    this.tall = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const t = m.tileAt(x, y);
      if (t === T.TREE || t === T.ROCK) this.tall.push({ x: x + 0.5, y: y + 0.5, kind: t, seed: (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 / 1000 });
    }
    this.bbStatic.begin();
    const Bm = this.biome(game), keep = { ctx: null };
    if (this.tall.length) grp.add(boardScenery(THREE, this.tall, bi, B));
    for (const o of this.quality === 'sprites' ? this.tall : []) {
      this.bbStatic.add({ wx: o.x, wz: o.y, lift: 0, wT: 2.2, hT: 2.2, fb: 0.28, ppt: 72, ex: o.x, ey: o.y,
        draw: (ppt, ctx) => { if (o.kind === T.TREE) drawTreeV2(ctx, o.x * ppt, o.y * ppt, ppt, bi, o.seed); else drawRock(ctx, o.x * ppt, o.y * ppt, ppt, Bm); } });
    }
    this.bbStatic.flush(this.R, this.camera);
  }

  disposeWorld() {
    if (!this.world) return;
    this.scene.remove(this.world);
    for (const m of this.models.values()) this.scene.remove(m.root); this.models.clear();
    for (const r of this.um.values()) this.dropUnit(r); this.um.clear();
    if (this.ghostModel) { this.scene.remove(this.ghostModel.root); this.ghostModel = null; }
    this.castleModel = null;
    this.world.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((q) => { q.map?.dispose?.(); q.dispose?.(); }); });
    this.world = null;
  }

  destroy() { this.disposeWorld(); this.fx3.dispose(); this.weather.dispose(); this.bb.dispose(); this.bbStatic.dispose(); this.scene.background?.dispose?.(); this.R.dispose(); this.R.forceContextLoss?.(); }

  // ---------- frame ----------
  draw(game, fx, dt, ui = {}) {
    if (this.lost) return;
    this.time += dt; this.dt = dt; this.fx = fx; this.ui = ui;
    const B = this.biome(game), ts0 = this.baseTs = Math.max(8, Math.floor(this.h / (game.map.rows + 2)));
    this.ensureWorld(game, B);
    const bi = (game.biomeIdx ? game.biomeIdx() : biomeIndex(game.wave));
    if (bi !== this.skyBi) { this.worldKey = ''; this.ensureWorld(game, B); }
    // shake nudges the camera; the pick camera stays put so aiming is steady
    const [shx, shy] = fx.shakeOffset();
    const cam = this.camera, c0 = this.cam;
    if (c0.wall) { /* first person: the pose is set by fitWall */ } else { cam.position.set(c0.cx + c0.D * Math.cos(c0.pitch) * Math.sin(c0.yaw || 0) + shx * 0.6, c0.D * Math.sin(c0.pitch) + shy * 0.4, c0.tz + c0.D * Math.cos(c0.pitch) * Math.cos(c0.yaw || 0)); cam.lookAt(c0.cx, 0, c0.tz); }
    this.bbStatic.axes(cam);
    if (this.waterTex && !this.reduced) { this.waterTex.offset.x = (this.time * 0.03) % 1; this.waterTex.offset.y = (this.time * 0.018) % 1; }
    if (this.castleModel) this.castleModel.g.visible = !c0.wall;
    if (this.parapet) this.parapet.g.visible = !!c0.wall;
    this.matrices();

    // ---- ground textures ----
    const sctx = this.sctx, gctx = this.gctx;
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
    this.ctx = gctx; this.ts = this.gts; this.flat = true;
    gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.clearRect(0, 0, this.ground.width, this.ground.height);
    this.drawGroundLayer(game, fx, dt, ui);
    this.flat = false;
    this.ovTex.needsUpdate = true;

    // ---- solid things: tower models, castle, sprite billboards ----
    this.syncTowers(game);
    this.updateHero(game, dt);
    if (this.castleModel) {
      tickCastle(this.castleModel, game, this.time, this.castleSk);
      const dmg = 1 - game.castle.hp / game.castle.maxHp, c = game.map.castle;
      if (dmg > 0.5 && Math.random() < 0.1) fx.burst(c.x + (Math.random() < 0.5 ? -0.6 : 0.6), c.y - 0.3, 1, { color: ['#777', '#999', '#bbb'], speed: 0.25, life: 1.2, gravity: -0.9, size: 0.12 });
    }
    this.ctx = sctx;
    this.syncUnits(game);
    // 3D weather runs on phones too (the flat screen tint is what small screens skip); Reduced motion turns it off
    if (!this.reduced) {
      this.weather.update(game, dt, this.quality === 'low' || this.lowPower ? 'low' : this.w < 700 ? 'med' : this.quality);
      const A = this.weather.atmosphere(), F = this.fogBase;
      if (F) {
        this.scene.fog.near = F.near * A.fog; this.scene.fog.far = Math.max(F.near * A.fog + 6, F.far * A.fog);
        this.scene.fog.color.copy(F.color); if (A.tint) { this._tint ||= new THREE.Color(); this.scene.fog.color.lerp(this._tint.set(A.tint), A.amt); }
        this.sun.intensity = F.sun * A.light; this.hemi.intensity = F.hemi * (0.5 + 0.5 * A.light);
      }
      // dust kicked up at the feet of the sandstorm's twisters
      if (Math.random() < dt * 20) for (const f of this.weather.feet()) this.fx3.smoke.add({ x: f.x + (Math.random() - 0.5) * 0.6, y: 0.05, z: f.z + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 1.5, vy: 0.4, vz: (Math.random() - 0.5) * 1.5, drag: 1.5, life: 1, size: (k) => 0.1 + 0.25 * k, c0: '#c8a26a', c1: '#e0c89a' });
    }
    if (game.night && this.fogBase) {
      const F = this.fogBase; this.sun.intensity = F.sun * 0.22; this.sun.color.set('#9fb0ff'); this.amb.intensity = (this._amb0 ??= this.amb.intensity) * 0.35; this.hemi.intensity = F.hemi * 0.3;
      this.scene.fog.color.set('#0b1028'); this.scene.fog.near = F.near * 0.4; this.scene.fog.far = F.far * 0.45;
      this.nightLights(game);
    }
    this.fx3.projectiles(game); this.fx3.arts(game, dt); this.fx3.update(this.reduced ? dt * 1.5 : dt);
    this.buildBillboards(game, bi);
    this.R.render(this.scene, cam);

    // ---- screen-space layer: bars, labels, shots, effects ----
    this.ts = ts0;
    sctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); sctx.clearRect(0, 0, this.w, this.h);
    this.drawOverlay(game, fx, dt, ui);
  }

  liftOf(game, x, y) { return game.map.tileAt(Math.floor(x), Math.floor(y)) === T.HIGH ? 0.45 : 0; }

  // Keep one 3D model per tower; create, pose and retire them as the game changes.
  syncTowers(game) {
    const live = new Set();
    for (const t of game.towers) {
      if (TOWERS[t.type].trap) continue;
      live.add(t);
      let m = this.models.get(t);
      if (!m) {
        const sk = TOWER_SKINS[this.cosmetics.towerSkin] || TOWER_SKINS.classic;
        m = buildTowerModel(this.kit, t.type, sk);
        if (!m) continue;
        m.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.scene.add(m.root); this.models.set(t, m);
      }
      m.root.position.set(t.cx, this.liftOf(game, t.cx, t.cy), t.cy);
      tickTowerModel(this.kit, m, t, this.time, TOWERS[t.type]);
    }
    for (const [t, m] of this.models) if (!live.has(t)) { this.scene.remove(m.root); this.models.delete(t); }
    // the ghost while placing
    const g = this.ghost;
    if (g && !TOWERS[g.type].trap) {
      if (!this.ghostModel || this.ghostModel.type !== g.type) {
        if (this.ghostModel) this.scene.remove(this.ghostModel.root);
        const sk = TOWER_SKINS[this.cosmetics.towerSkin] || TOWER_SKINS.classic;
        const gm = buildTowerModel(this.kit, g.type, sk);
        if (gm) {
          gm.root.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; o.castShadow = false; } });
          this.scene.add(gm.root);
        }
        this.ghostModel = gm;
      }
      if (this.ghostModel) {
        this.ghostModel.root.visible = true;
        this.ghostModel.root.position.set(g.x + 0.5, this.liftOf(game, g.x, g.y), g.y + 0.5);
        tickTowerModel(this.kit, this.ghostModel, { aim: -Math.PI / 2, tier: 1, cx: g.x, cy: g.y }, this.time, TOWERS[g.type]);
      }
    } else if (this.ghostModel) this.ghostModel.root.visible = false;
  }

  // ---------- unit models: foes, bosses, soldiers and troops ----------
  dropUnit(r) { this.scene.remove(r.u.root); for (const m of r.mats) m.dispose(); if (r.mound) { this.scene.remove(r.mound); } }

  unitRec(obj, make, x, y) {
    let r = this.um.get(obj);
    if (r) return r;
    const u = make(), mats = [], cache = new Map();
    u.root.rotation.order = 'YXZ';
    u.root.traverse((o) => {
      if (!o.isMesh) return;
      let m = cache.get(o.material);
      if (!m) { m = o.material.clone(); m.userData.e0 = m.emissive.clone(); m.userData.i0 = m.emissiveIntensity; m.userData.o0 = m.opacity; cache.set(o.material, m); mats.push(m); }
      o.material = m; o.castShadow = false; o.receiveShadow = false;   // units have soft blob shadows; real ones doubled the draw calls of a big wave
    });
    this.scene.add(u.root);
    r = { u, mats, st: { ph: Math.random() * 6, t: 0, moving: false, attack: false, swing: 0, hit: 0 }, lx: x, ly: y, heading: 0, age: 0, flash: false, alpha: 1 };
    u.flapOff = Math.random() * 6;
    this.um.set(obj, r);
    return r;
  }

  poseUnit(r, x, y, lift, scale, o) {
    const { u, st } = r, dt = this.dt;
    const dx = x - r.lx, dy = y - r.ly, moved = Math.hypot(dx, dy);
    if (dt > 0) {
      r.age += dt;
      st.moving = moved > o.eps && !o.still;
      if (st.moving) { st.ph += (moved / o.stride) * Math.PI; const want = -Math.atan2(dy, dx); let d = want - r.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); r.heading += d * Math.min(1, dt * 12); }
      st.hit = o.hit ? 1 : Math.max(0, st.hit - dt * 5);
    }
    r.lx = x; r.ly = y; st.t = this.time + (o.phase || 0); st.attack = !!o.attack; st.swing = o.swing || 0;
    this.U.animate(u, st);
    const pop = o.noPop ? 1 : Math.min(1, r.age / 0.3), pp = pop < 1 ? 1 - Math.pow(1 - pop, 3) * Math.cos(pop * 6) * 0.9 : 1;
    u.root.position.set(x, lift, y); u.root.rotation.y = r.heading; u.root.scale.setScalar(Math.max(0.02, scale * pp));
    const flash = !!o.hit;
    if (flash !== r.flash) { r.flash = flash; for (const m of r.mats) { if (flash) { m.emissive.setRGB(0.55, 0.55, 0.55); m.emissiveIntensity = 1; } else { m.emissive.copy(m.userData.e0); m.emissiveIntensity = m.userData.i0; } } }
    const a = Math.max(0, Math.min(1, o.alpha ?? 1));
    if (Math.abs(a - r.alpha) > 0.01) { r.alpha = a; for (const m of r.mats) { const t = a < 0.995; if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; } m.opacity = m.userData.o0 * a; } }
  }

  syncUnits(game) {
    const live = new Set(), fog = game.mod.fog, K = this.kit;
    for (const e of game.enemies) {
      if (e.dead) continue;
      const r = this.unitRec(e, () => this.U.enemy(e), e.x, e.y);
      live.add(e); r.u.root.visible = !(fog && !game.isVisible(e));
      const buried = e.burrowT > 0;
      if (buried) {
        if (!r.mound) { r.mound = K.sph(0.5, '#7a5a3a', 0, 0, 0); r.mound.scale.set(1, 0.45, 0.8); r.mound.castShadow = true; this.scene.add(r.mound); }
        r.mound.visible = r.u.root.visible; r.mound.position.set(e.x, 0, e.y); r.mound.scale.set(e.size * 3, e.size * 1.4, e.size * 2.6);
        r.u.root.visible = false; r.lx = e.x; r.ly = e.y; continue;
      }
      if (r.mound) r.mound.visible = false;
      const fly = e.air ? 0.32 + Math.sin(this.time * 3 + (e.bob || 0)) * 0.04 : 0;
      this.poseUnit(r, e.x, e.y, fly + (e.air ? 0 : this.liftOf(game, e.x, e.y) * 0), e.size * 1.25 * (e.boss ? 1.1 : 1) * (r.u.tag === 'flyer' ? (e.boss ? 0.75 : 0.9) : 1),
        { eps: 0.0004, stride: Math.max(0.05, e.size * 0.9), hit: e.flash > 0, attack: !!e.blocker || !!(e.def && e.def.shoots && e.cd < 0.35), still: e.stunT > 0, phase: (e.bob || 0) * 3,
          alpha: e.stealthT > 0 ? 0.35 : r.u.ghost ? 0.62 : 1 });
    }
    for (const c of this.corpses) {
      const r = this.unitRec(c, () => this.U.enemy(c.e), c.e.x, c.e.y);
      live.add(c);
      const k = Math.min(1, c.t / c.life);
      r.heading = r.heading || (c.e.vx < 0 ? Math.PI : 0);
      const e = c.e, scale = e.size * 1.25 * (e.boss ? 1.1 : 1) * (r.u.tag === 'flyer' ? (e.boss ? 0.75 : 0.9) : 1);
      this.poseUnit(r, e.x, e.y, e.air ? Math.max(0, 0.32 * (1 - k * k * 1.6)) : 0, scale, { eps: 1, stride: 1, hit: k < 0.14, noPop: true, alpha: Math.max(0, 1 - k * k) });
      r.u.root.rotation.x = c.dir * Math.min(1, k * 1.6) * 1.45; r.u.root.position.y -= k * 0.02;
    }
    for (const t of game.towers) for (const so of t.soldiers) {
      if (so.dead) continue;
      const r = this.unitRec(so, () => this.U.soldier(so), so.x, so.y); live.add(so);
      this.poseUnit(r, so.x, so.y, this.liftOf(game, so.x, so.y) * 0, 0.17, { eps: 0.0005, stride: 0.14, swing: so.swing || 0, attack: false, hit: false });
    }
    for (const u of game.garrison.units) {
      if (u.state === 'reserve' || u.dead) continue;
      const D = TROOPS[u.kind], r = this.unitRec(u, () => this.U.troop(u), u.x, u.y); live.add(u);
      this.poseUnit(r, u.x, u.y, D.flies ? 0.4 + Math.sin(this.time * 3 + u.slot) * 0.04 : 0, D.slots > 1 ? 0.24 : 0.2,
        { eps: 0.0005, stride: D.flies ? 0.3 : D.speed > 3 ? 0.35 : 0.14, swing: u.swing || 0, attack: !!u.target && u.swing <= 0 && false, hit: u.flash > 0, phase: u.slot });
    }
    for (const [obj, r] of this.um) if (!live.has(obj)) { this.dropUnit(r); this.um.delete(obj); }
    // contact shadows: smaller and fainter for flyers, which hover above theirs
    const bl = this.unitBlobs, mx = this._bm || (this._bm = new THREE.Matrix4());
    let n = 0;
    for (const [obj, r] of this.um) {
      if (n >= 600 || !r.u.root.visible) continue;
      const pos = r.u.root.position, sc = r.u.root.scale.x, air = pos.y > 0.15, rad = Math.max(0.12, sc * (r.u.tag === 'quad' || r.u.tag === 'golem' ? 1.7 : 1.15)) * (air ? 0.7 : 1);
      mx.makeScale(rad, 1, rad); mx.setPosition(pos.x, 0.011, pos.z); bl.setMatrixAt(n++, mx);
    }
    bl.count = n; bl.instanceMatrix.needsUpdate = true;
  }

  // Everything that walks, flies or stands as flat art goes into the atlas.
  buildBillboards(game, bi) {
    const bb = this.bb, m = game.map; bb.begin();
    const dpr = this.dpr;
    const ppt = (x, y, lo = 22, hi = 100) => { const p = this.proj(x, y); return p ? Math.max(lo, Math.min(hi, p.s * dpr)) : lo; };
    const add = (x, y, lift, box, fb, fn, extra = {}) => {
      const p = this.proj(x, y, lift); if (!p || p.x < -200 || p.x > this.w + 200 || p.y < -260 || p.y > this.h + 160) return;
      bb.add({ wx: x, wz: y, lift, wT: box, hT: box, fb, ppt: ppt(x, y), ex: x, ey: y, draw: (pp, ctx) => { this.ctx = ctx; this.ts = pp; fn(); this.ctx = this.sctx; }, ...extra });
    };
    const fog = game.mod.fog;
    // the bodies are 3D models (syncUnits); these sprites carry only what floats over them: bars, status rings, stars, ranks
    this.bodyless = true;
    for (const e of game.enemies) {
      if (e.dead || (fog && !game.isVisible(e))) continue;
      const over = e.hp < e.maxHp || e.boss || e.champion || e.shield > 0 || e.vanguard || e.slowT > 0 || e.poisonT > 0 || e.burnT > 0 || e.stunT > 0 || e.enraged;
      if (over) add(e.x, e.y, 0, Math.max(1.9, e.size * 6), 0.22, () => this.drawEnemy(e, game));
      else this.animState(e, this.dt);
    }
    for (const c of this.corpses) c.t += this.dt;
    this.corpses = this.corpses.filter((c) => c.t < c.life);
    for (const t of game.towers) for (const so of t.soldiers) if (!so.dead && so.hp < so.maxHp) add(so.x, so.y, 0, 1.5, 0.22, () => this.drawSoldier(so));
    for (const u of game.garrison.units) if (u.state !== 'reserve' && !u.dead && (u.hp < u.maxHp || u.rank > 0 || u.flash > 0)) add(u.x, u.y, 0, TROOPS[u.kind].slots > 1 ? 2.4 : 1.9, 0.22, () => this.drawTroop(u));
    // the hero on the gatehouse
    const c = m.castle;
    if (this.castleModel && !this.isWall) {   // in the wall view you are the hero: no figure in front of the lens
      const sk = this.castleSk, W = game.weapon || {};
      bb.add({ wx: c.x, wz: c.y + 0.05, lift: 1.26 - 0.4, wT: 1.9, hT: 1.9, fb: 0.2, ppt: ppt(c.x, c.y), ex: 0, ey: 0, draw: (pp, ctx) => {
        this.ts = pp; const s = pp * 1.1;
        ctx.lineWidth = pp * 0.035; ctx.strokeStyle = INK;
        drawHero(ctx, s, { aim: !game.enemies ? -0.6 : this.heroAim, t: this.time, pull: this.charge ? this.charge.amount || 0 : 0, kick: this.heroKick, weapon: W.id || 'longbow', ammo: W.ammo ?? 1, ...heroLook(this.cosmetics.hero, sk), hot: (game.combo || 0) >= 10 });
      } });
    }
    bb.flush(this.R, this.camera);
  }

  // Ground-level art: portals, plot foundations, ruins, ranges, zones, selection rings, traps.
  drawGroundLayer(game, fx, dt, ui) {
    const g = this.gctx, ts = this.gts;
    if (game.night) this.drawNightGround(game);
    this.drawPortals(game);
    this.drawPlotsFlat(game, ui);
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
    // traps lie flat on the ground
    for (const t of game.towers) if (TOWERS[t.type].trap) this.drawTower(t, game);
    const sel = this.selected;
    if (sel && game.towers.includes(sel)) {
      this.drawRange(sel.cx, sel.cy, sel.stats.range || TOWERS[sel.type].range || 0, sel.stats.minRange, true);
      g.strokeStyle = '#f2b33d'; g.lineWidth = ts * 0.07; g.beginPath(); g.arc(sel.cx * ts, sel.cy * ts, ts * 0.5, 0, TAU); g.stroke();
      if (sel.type === 'barracks' && sel.rallyPt) {
        const rp = sel.rallyPt; g.strokeStyle = 'rgba(242,179,61,0.9)'; g.lineWidth = ts * 0.05; g.setLineDash([ts * 0.12, ts * 0.08]);
        g.beginPath(); g.arc(rp.x * ts, rp.y * ts, ts * 0.42, 0, TAU); g.stroke(); g.setLineDash([]);
      }
    }
    if (this.ghost) {
      const def = TOWERS[this.ghost.type], hg = game.map.tileAt(this.ghost.x, this.ghost.y) === T.HIGH ? 0.6 : 0;
      this.drawRange(this.ghost.x + 0.5, this.ghost.y + 0.5, def.aura || (def.range ? def.range + hg : 0.6), def.minRange, this.ghost.ok);
      if (def.trap) { g.globalAlpha = 0.6; this.drawTower({ type: this.ghost.type, cx: this.ghost.x + 0.5, cy: this.ghost.y + 0.5, tier: 1, aim: -Math.PI / 2, recoil: 0, soldiers: [], ghost: true, hp: 1, maxHp: 1 }, game); g.globalAlpha = 1; }
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

  // Night Siege: darkness over the board with soft pools of light round the castle, the towers' torches and glowing towers.
  drawNightGround(game) {
    const g = this.gctx, ts = this.gts, W = game.map.cols * ts, H = game.map.rows * ts;
    if (!this._night || this._night.width !== W) { this._night = document.createElement('canvas'); this._night.width = W; this._night.height = H; }
    const n = this._night.getContext('2d');
    n.globalCompositeOperation = 'source-over'; n.clearRect(0, 0, W, H); n.fillStyle = 'rgba(6,10,28,0.72)'; n.fillRect(0, 0, W, H);
    n.globalCompositeOperation = 'destination-out';
    const flick = 1 + 0.04 * Math.sin(this.time * 9);
    for (const l of game.lights() || []) {
      const r = l.r * ts * flick, grd = n.createRadialGradient(l.x * ts, l.y * ts, r * 0.15, l.x * ts, l.y * ts, r);
      grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.7, 'rgba(0,0,0,0.85)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      n.fillStyle = grd; n.beginPath(); n.arc(l.x * ts, l.y * ts, r, 0, TAU); n.fill();
    }
    n.globalCompositeOperation = 'source-over';
    g.drawImage(this._night, 0, 0);
    // warm light where torches burn
    for (const l of game.lights() || []) { const r = l.r * ts * 0.9, grd = g.createRadialGradient(l.x * ts, l.y * ts, 0, l.x * ts, l.y * ts, r); grd.addColorStop(0, l.glow ? 'rgba(150,170,255,0.16)' : 'rgba(255,190,100,0.16)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.beginPath(); g.arc(l.x * ts, l.y * ts, r, 0, TAU); g.fill(); }
  }

  // Night Siege: dim the sun to moonlight and hang a few real lights on the castle and the brightest towers.
  nightLights(game) {
    const T = THREE;
    if (!this._nl) { this._nl = Array.from({ length: 8 }, () => { const l = new T.PointLight('#ffbf70', 0, 4, 1.4); this.scene.add(l); return l; }); }
    const L = (game.lights() || []).slice().sort((a, b) => b.r - a.r).slice(0, 8);
    this._nl.forEach((pl, i) => { const l = L[i]; if (!l) { pl.intensity = 0; return; } pl.position.set(l.x, 1.3, l.y); pl.color.set(l.glow ? '#a8b8ff' : '#ffbf70'); pl.distance = l.r * 1.8; pl.intensity = 2.2 * (1 + 0.06 * Math.sin(this.time * 8 + i)); });
  }

  // Plot foundations and ruins as flat top-down art (the ground layer foreshortens them for us).
  drawPlotsFlat(game, ui) {
    const g = this.gctx, ts = this.gts;
    if (!game.map.plots) return;
    const placing = ui.placing && !TOWERS[ui.placing]?.trap, pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    for (const p of game.map.plots) {
      if (game.towerAt(p.x, p.y)) continue;
      const cx = (p.x + 0.5) * ts, cy = (p.y + 0.5) * ts, open = game.claimed.has(p.k);
      g.lineJoin = 'round';
      if (open) {
        if (placing) { g.fillStyle = `rgba(255,214,102,${0.22 + 0.25 * pulse})`; g.beginPath(); g.arc(cx, cy, ts * 0.5, 0, TAU); g.fill(); }
        g.strokeStyle = INK; g.lineWidth = ts * 0.05; g.fillStyle = '#9c927f';
        g.beginPath(); g.arc(cx, cy, ts * 0.4, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = '#b4ab97'; g.beginPath(); g.arc(cx, cy, ts * 0.27, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(30,36,51,0.35)'; g.lineWidth = ts * 0.03;
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.moveTo(cx + Math.cos(a) * ts * 0.27, cy + Math.sin(a) * ts * 0.27); g.lineTo(cx + Math.cos(a) * ts * 0.4, cy + Math.sin(a) * ts * 0.4); g.stroke(); }
        if (p.high) { g.fillStyle = '#f2b33d'; g.beginPath(); g.moveTo(cx - ts * 0.08, cy); g.lineTo(cx, cy - ts * 0.09); g.lineTo(cx + ts * 0.08, cy); g.lineTo(cx, cy + ts * 0.09); g.closePath(); g.fill(); }
      } else {
        g.strokeStyle = INK; g.lineWidth = ts * 0.04; g.fillStyle = '#7d7466';
        g.beginPath(); g.arc(cx, cy, ts * 0.36, 0, TAU); g.fill(); g.stroke();
        for (const [dx, dy, r] of [[-0.18, -0.1, 0.11], [0.14, -0.12, 0.09], [0.02, 0.14, 0.08], [0.2, 0.1, 0.07]]) { g.fillStyle = '#a69d8b'; g.beginPath(); g.arc(cx + dx * ts, cy + dy * ts, r * ts, 0, TAU); g.fill(); }
      }
    }
  }

  // Screen-space UI on top of the scene: bars and pips on towers, claim prices, shots, rings and effects.
  drawOverlay(game, fx, dt, ui) {
    const ctx = this.sctx, m = game.map;
    // claim price tags over ruined plots
    if (m.plots && !game.auto && (game.phase === 'build' || (ui.placing && !TOWERS[ui.placing]?.trap))) {   // Hero Mode's commander claims land itself
      const cost = game.claimCost ? game.claimCost() : 0;
      for (const p of m.plots) {
        if (game.towerAt(p.x, p.y) || game.claimed.has(p.k)) continue;
        const q = this.proj(p.x + 0.5, p.y + 0.5, 0.35); if (!q) continue;
        const ts = Math.min(Math.max(q.s, this.baseTs * 0.7), this.baseTs * 2.5), can = game.gold >= cost, label = '⛁' + cost;
        ctx.font = `800 ${Math.max(9, ts * 0.2)}px "Baloo 2", system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const w = ctx.measureText(label).width + ts * 0.16;
        ctx.fillStyle = can ? 'rgba(30,36,51,0.85)' : 'rgba(30,36,51,0.55)'; roundRect(ctx, q.x - w / 2, q.y - ts * 0.12, w, ts * 0.24, ts * 0.1); ctx.fill();
        ctx.fillStyle = can ? '#ffd666' : '#a9a29a'; ctx.fillText(label, q.x, q.y); ctx.textBaseline = 'alphabetic';
      }
    }
    // tower pips, health bars, jam marks and ally labels
    for (const t of game.towers) {
      if (TOWERS[t.type].trap || t.ghost) continue;
      const lift = this.liftOf(game, t.cx, t.cy);
      this.put(t.cx, t.cy, () => {
        const ts = this.ts;
        ctx.save(); ctx.translate(t.cx * ts, t.cy * ts);
        if (!t.ruined) {
          this.tierPips(t, ts * 0.47);
          if (t.disabledT > 0) {
            ctx.fillStyle = 'rgba(30,36,51,0.55)'; ctx.beginPath(); ctx.arc(0, -ts * 0.75, ts * 0.2, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#f2b33d'; ctx.lineWidth = ts * 0.05; ctx.beginPath(); ctx.moveTo(-ts * 0.07, -ts * 0.88); ctx.lineTo(ts * 0.02, -ts * 0.74); ctx.lineTo(-ts * 0.03, -ts * 0.72); ctx.lineTo(ts * 0.08, -ts * 0.6); ctx.stroke();
          }
        }
        if (t.hp < t.maxHp) this.bar(-ts * 0.3, ts * 0.25, ts * 0.6, t.hp / t.maxHp, '#7fb24a');
        if (t.ally) {
          ctx.font = `700 ${Math.max(9, ts * 0.22)}px "Baloo 2", system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
          const label = `${t.ally} · ${t.allyWaves}`; ctx.strokeText(label, 0, -ts * 1.4); ctx.fillText(label, 0, -ts * 1.4);
        }
        ctx.restore();
      }, lift);
    }
    for (const t of game.towers) if (t.beam) for (const b of t.beam) this.beam3d(t, b);
    // Arc Fences between linked Tesla Coils.
    if (game.fences && game.fences.length) {
      const now = performance.now() / 1000;
      for (const f of game.fences) {
        if (f.a.ruined || f.b.ruined) continue;
        const pa = this.proj(f.a.cx, f.a.cy, 1.05), A = pa && { x: pa.x, y: pa.y, s: pa.s };   // proj() reuses one object
        const pb = this.proj(f.b.cx, f.b.cy, 1.05), B = pb && { x: pb.x, y: pb.y };
        if (!A || !B) continue;
        const off = f.a.disabledT > 0 || f.b.disabledT > 0, pulse = 0.5 + 0.2 * Math.sin(now * 7 + f.a.uid), n = 6;
        const line = () => { ctx.beginPath(); ctx.moveTo(A.x, A.y); for (let i = 1; i < n; i++) { const k = i / n, j = off ? 0 : Math.sin(now * 23 + i * 1.7 + f.b.uid) * A.s * 0.08; ctx.lineTo(A.x + (B.x - A.x) * k, A.y + (B.y - A.y) * k + j); } ctx.lineTo(B.x, B.y); };
        ctx.lineCap = 'round';
        ctx.strokeStyle = off ? 'rgba(140,160,170,0.3)' : `rgba(47,182,201,${pulse})`; ctx.lineWidth = Math.max(2, A.s * 0.09); line(); ctx.stroke();
        if (!off) { ctx.strokeStyle = `rgba(220,252,255,${pulse + 0.2})`; ctx.lineWidth = Math.max(1, A.s * 0.03); line(); ctx.stroke(); }
      }
    }
    for (const p of game.projectiles) if (!this.fx3.handles(p)) this.put(p.x, p.y, () => this.drawProjectile(p, fx));
    this.drawLoot(dt);
    this.drawTrails(dt);
    this.drawFx3d(fx);
    // Hero Mode aim assist: a gold lock ring with turning ticks round the foe the FIRE button will hit
    const L = this.heroLock;
    if (this.isWall && L && !L.dead) {
      const p = this.proj(L.x, L.y, L.size * 0.45 + (L.air ? 0.5 : 0));
      if (p) {
        const rr = Math.max(14, L.size * 1.25 * p.s), t = this.time * 3;
        ctx.save(); ctx.translate(p.x, p.y);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#ffd666'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
        ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) { const a = t + i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (rr + 3), Math.sin(a) * (rr + 3)); ctx.lineTo(Math.cos(a) * (rr + 10), Math.sin(a) * (rr + 10)); ctx.stroke(); }
        ctx.restore();
      }
    }
    if (game.hazard.active > 0 && game.phase === 'wave' && !this.noWeatherFx) {
      const k = game.hazard.kind;
      ctx.fillStyle = k === 'sandstorm' ? 'rgba(230,190,110,0.08)' : k === 'blizzard' ? 'rgba(230,245,255,0.08)' : k === 'meteors' ? 'rgba(255,90,40,0.05)' : 'rgba(40,20,70,0.1)';
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


// ---------- scenery helpers for the 3D world ----------
const FIELD = ['#7fae5a', '#d9c48a', '#e9f1f4', '#5a4a44', '#3a4460'];
// A tiling grass (or sand, snow, ash) texture for the open country, so the land round the board is not one flat colour.
function fieldTexture(THREE, bi, rep = 140) {
  if (typeof document === 'undefined') return null;
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), r = rngOf(991 + bi * 31);
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 900; i++) { const v = 170 + Math.floor(r() * 85); g.fillStyle = `rgb(${v},${v},${v})`; g.globalAlpha = 0.5; const w = 1 + r() * 2.5; g.fillRect(r() * N, r() * N, w, w * (bi === 2 ? 1 : 2.4)); }
  for (let i = 0; i < 14; i++) { const v = 150 + Math.floor(r() * 40); g.fillStyle = `rgb(${v},${v},${v})`; g.globalAlpha = 0.18; g.beginPath(); g.arc(r() * N, r() * N, 6 + r() * 14, 0, TAU); g.fill(); }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8;
  return t;
}

// The board's rim: a low dressed-stone curb all round, a band of trodden earth outside it, and bushes and boulders dotted along it.
function addBoardEdge(THREE, grp, kit, cols, rows, B, bi, rnd) {
  const stone = new THREE.MeshLambertMaterial({ color: bi === 3 ? '#6a625c' : bi === 4 ? '#5a6078' : '#b3aa98', map: kit.tex('stone') });
  const earth = new THREE.MeshLambertMaterial({ color: new THREE.Color(shade(B.grass, -0.28)), map: kit.tex('stone') });
  const t = 0.22, h = 0.16;
  for (const [w, d, x, z] of [[cols + 2 * t, t, cols / 2, -t / 2], [cols + 2 * t, t, cols / 2, rows + t / 2], [t, rows, -t / 2, rows / 2], [t, rows, cols + t / 2, rows / 2]]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone); curb.position.set(x, h / 2 - 0.02, z); curb.castShadow = curb.receiveShadow = true; grp.add(curb);
  }
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(cols + 2.4, rows + 2.4), earth); apron.rotation.x = -Math.PI / 2; apron.position.set(cols / 2, -0.03, rows / 2); apron.receiveShadow = true; grp.add(apron);
  // bushes and boulders along the outside of the curb
  const nB = 70, bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.35, 0), new THREE.MeshLambertMaterial({ flatShading: true }), nB);
  const nR = 30, rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.3, 0), new THREE.MeshLambertMaterial({ flatShading: true }), nR);
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const leaf = new THREE.Color(bi === 2 ? '#cfe3ea' : bi === 3 ? '#4a3a30' : bi === 4 ? '#2f3d5a' : shade(B.grass, -0.3)), grey = new THREE.Color(bi === 3 ? '#3a3432' : '#8d8a84');
  // the near side (towards the default camera) stays almost clear, so nothing hides the castle
  const edgePt = () => {
    const side = rnd() < 0.08 ? 1 : [0, 2, 3][Math.floor(rnd() * 3)], u = rnd(), off = 0.5 + rnd() * 2.2;
    return side === 0 ? [u * cols, -off] : side === 1 ? [u * cols, rows + 0.4 + rnd() * 0.6] : side === 2 ? [-off, u * rows] : [cols + off, u * rows];
  };
  for (let i = 0; i < nB; i++) {
    const [x, z] = edgePt(), s0 = (0.6 + rnd() * 0.9) * (z > rows ? 0.5 : 1);
    e.set(0, rnd() * TAU, 0); q.setFromEuler(e); sc.set(s0 * (1 + rnd() * 0.4), s0 * 0.8, s0); mx.compose(v.set(x, 0.18 * s0, z), q, sc); bush.setMatrixAt(i, mx);
    col.copy(leaf).offsetHSL((rnd() - 0.5) * 0.05, 0, (rnd() - 0.5) * 0.12); bush.setColorAt(i, col);
  }
  for (let i = 0; i < nR; i++) {
    const [x, z] = edgePt(), s0 = (0.5 + rnd() * 1.1) * (z > rows ? 0.5 : 1);
    e.set(rnd(), rnd() * TAU, rnd()); q.setFromEuler(e); sc.set(s0, s0 * 0.6, s0 * 0.9); mx.compose(v.set(x, 0.1 * s0, z), q, sc); rock.setMatrixAt(i, mx);
    col.copy(grey).offsetHSL(0, 0, (rnd() - 0.5) * 0.15); rock.setColorAt(i, col);
  }
  bush.castShadow = rock.castShadow = true;
  grp.add(bush, rock);
}

// The trees and rocks standing on the board as real low-poly models (instanced: a handful of draw calls for all of them).
// Meadow and dunes get round-topped broadleaves mixed with pines, frost gets snow-capped pines, ash gets bare dead trees,
// the shadow lands get dark violet pines.
function boardScenery(THREE, tall, bi, B) {
  const grp = new THREE.Group();
  const trees = tall.filter((o) => o.kind === T.TREE), rocks = tall.filter((o) => o.kind === T.ROCK);
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const lamb = (o = {}) => new THREE.MeshLambertMaterial({ flatShading: true, ...o });
  const n = Math.max(1, trees.length);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.11, 0.6, 6), lamb({ color: bi === 3 ? '#2e2420' : '#6b4a2c' }), n);
  const pine = [0, 1, 2].map((k) => new THREE.InstancedMesh(new THREE.ConeGeometry(0.42 - k * 0.1, 0.55, 7), lamb(), n));
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.36, 1), lamb(), n);
  const snow = new THREE.InstancedMesh(new THREE.ConeGeometry(0.2, 0.25, 7), lamb({ color: '#ffffff' }), n);
  const branch = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.04, 0.38, 4), lamb({ color: '#2e2420' }), n * 3);
  const leafBase = new THREE.Color(bi === 2 ? '#3f6a52' : bi === 4 ? '#3c3460' : bi === 1 ? '#7b8a3a' : shade(B.grass, -0.25));
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  let nb = 0;
  trees.forEach((o, i) => {
    const s0 = 0.85 + o.seed * 0.45, rot = o.seed * TAU, round = (bi === 0 || bi === 1) && o.seed > 0.45, dead = bi === 3;
    e.set(0, rot, 0); q.setFromEuler(e);
    sc.set(s0, s0 * (dead ? 1.5 : 1), s0); mx.compose(v.set(o.x, 0.3 * s0 * (dead ? 1.5 : 1), o.y), q, sc); trunk.setMatrixAt(i, mx);
    col.copy(leafBase).offsetHSL((o.seed - 0.5) * 0.06, 0, (o.seed - 0.5) * 0.12);
    for (let k = 0; k < 3; k++) {
      if (round || dead) { pine[k].setMatrixAt(i, hide); continue; }
      sc.set(s0, s0, s0); mx.compose(v.set(o.x, (0.55 + k * 0.3) * s0, o.y), q, sc); pine[k].setMatrixAt(i, mx);
      pine[k].setColorAt(i, col.clone().offsetHSL(0, 0, k * 0.04));
    }
    if (round) { sc.set(s0 * 1.1, s0, s0 * 1.1); mx.compose(v.set(o.x, 0.85 * s0, o.y), q, sc); crown.setMatrixAt(i, mx); crown.setColorAt(i, col.clone().offsetHSL(0.02, 0.05, 0.04)); }
    else crown.setMatrixAt(i, hide);
    if (bi === 2 && !round) { sc.set(s0, s0, s0); mx.compose(v.set(o.x, 1.18 * s0, o.y), q, sc); snow.setMatrixAt(i, mx); } else snow.setMatrixAt(i, hide);
    if (dead) for (let k = 0; k < 3; k++) {
      const a = rot + k * 2.1;
      e.set(0.9 * Math.cos(a), 0, 0.9 * Math.sin(a)); q.setFromEuler(e);
      sc.set(s0, s0, s0); mx.compose(v.set(o.x + Math.cos(a) * 0.12 * s0, (0.55 + k * 0.16) * s0, o.y + Math.sin(a) * 0.12 * s0), q, sc); branch.setMatrixAt(nb++, mx);
    }
  });
  for (let k = nb; k < n * 3; k++) branch.setMatrixAt(k, hide);
  const parts = [trunk, ...pine, crown, snow, branch];
  if (!trees.length) parts.forEach((p) => { p.count = 0; });
  // rocks: two or three boulders a tile
  const nr = Math.max(1, rocks.length * 3);
  const rk = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.22, 0), lamb(), nr);
  const grey = new THREE.Color(bi === 3 ? '#4a4240' : bi === 2 ? '#a9b4bc' : bi === 1 ? '#b59a72' : '#8f8c86');
  let ni = 0;
  for (const o of rocks) for (let k = 0; k < 3; k++) {
    const r = rngOf(Math.floor(o.seed * 1e6) + k * 101), s0 = k === 0 ? 1.3 : 0.55 + r() * 0.5;
    e.set(r() * 3, r() * 3, r() * 3); q.setFromEuler(e); sc.set(s0, s0 * 0.75, s0);
    mx.compose(v.set(o.x + (k ? (r() - 0.5) * 0.6 : 0), 0.1 * s0, o.y + (k ? (r() - 0.5) * 0.6 : 0)), q, sc); rk.setMatrixAt(ni, mx);
    rk.setColorAt(ni++, grey.clone().offsetHSL(0, 0, (r() - 0.5) * 0.14));
  }
  if (!rocks.length) rk.count = 0;
  for (const p of [...parts, rk]) { p.castShadow = true; p.receiveShadow = true; if (p.instanceColor) p.instanceColor.needsUpdate = true; p.instanceMatrix.needsUpdate = true; grp.add(p); }
  return grp;
}

// Soft ripples for the water sheet: bright wavy streaks on a mid-grey, tinted by the material.
function waterTexture(THREE) {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), r = rngOf(4242);
  g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, N, N);
  g.strokeStyle = '#ffffff'; g.lineWidth = 1.6; g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const x = r() * N, y = r() * N, w = 8 + r() * 18;
    g.globalAlpha = 0.35 + r() * 0.4; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 3, x + w, y); g.stroke();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1);
  return t;
}

// A fine, tiling grain for the board: short dark blades, pebbles and soil specks around mid-grey, multiplied over the painted map.
function detailTexture(THREE, cols, rows) {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), r = rngOf(7331);
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 18; i++) { const v = 222 + Math.floor(r() * 26); g.fillStyle = `rgb(${v},${v},${v})`; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(r() * N, r() * N, 14 + r() * 30, 8 + r() * 18, r() * 3, 0, TAU); g.fill(); }
  g.globalAlpha = 1; g.lineCap = 'round';
  for (let i = 0; i < 700; i++) {
    const x = r() * N, y = r() * N, v = 150 + Math.floor(r() * 80), len = 2 + r() * 4, lean = (r() - 0.5) * 2;
    g.strokeStyle = `rgb(${v},${v},${v})`; g.globalAlpha = 0.55; g.lineWidth = 0.8 + r() * 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + lean, y - len); g.stroke();
  }
  for (let i = 0; i < 160; i++) { const v = 170 + Math.floor(r() * 60); g.fillStyle = `rgb(${v},${v},${v})`; g.globalAlpha = 0.6; g.beginPath(); g.arc(r() * N, r() * N, 0.6 + r() * 1.4, 0, TAU); g.fill(); }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(cols / 2, rows / 2); t.anisotropy = 8;
  return t;
}

// Clumps of 3D grass on the open grass tiles (not on plots, roads or water): each a few leaning blades.
function grassTufts(THREE, m, bi, B, rnd) {
  const blade = new THREE.ConeGeometry(0.018, 0.16, 3).translate(0, 0.08, 0);
  const parts = [];
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; const g = blade.clone().rotateZ(Math.cos(a) * 0.35).rotateX(Math.sin(a) * 0.35).translate(Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03).toNonIndexed(); parts.push(g); }
  const pos = [], nor = [];
  for (const g of parts) { pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const spots = [];
  for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
    if (m.tileAt(x, y) !== T.GRASS || m.plotSet?.has(y * m.cols + x)) continue;
    for (let k = 0; k < 3; k++) spots.push([x + 0.1 + rnd() * 0.8, y + 0.1 + rnd() * 0.8]);
  }
  const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ flatShading: true }), Math.max(1, spots.length));
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const base = new THREE.Color(bi === 2 ? '#dfeaf0' : bi === 3 ? '#5a4436' : bi === 4 ? '#3c4a6a' : bi === 1 ? '#b9a85a' : shade(B.grass, -0.12));
  spots.forEach(([x, z], i) => {
    const s0 = 0.7 + rnd() * 0.9; e.set(0, rnd() * TAU, 0); q.setFromEuler(e); sc.set(s0, s0 * (0.8 + rnd() * 0.6), s0);
    mx.compose(v.set(x, 0, z), q, sc); im.setMatrixAt(i, mx); im.setColorAt(i, col.copy(base).offsetHSL((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.14));
  });
  if (!spots.length) im.count = 0;
  im.receiveShadow = true;
  return im;
}
