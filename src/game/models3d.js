// Low-poly 3D models for the 3D view: one builder per tower type, plus the castle.
// Units are tiles. A model's origin is the middle of its tile at ground level; +x is "forward" (the way it aims).
// Every builder returns { g, turret?, parts, tick(t, time) } and never touches the game: render3d.js feeds it state each frame.
import { TOWERS } from '../data/balance.js';

const WOOD = '#8a5a32', DARK = '#2d2f36', STEEL = '#aab2c0', GOLD = '#f2b33d';

// ---------- surface textures ----------
// Small canvas textures drawn once, light-toned so a material's colour tints them: dressed stone, planks, roof shingles.
function noiseRng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function surfaceCanvas(kind) {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), r = noiseRng(kind.length * 977 + 13);
  const shadeOf = (v) => { const n = Math.round(255 * v); return `rgb(${n},${n},${n})`; };
  if (kind === 'stone') {
    g.fillStyle = shadeOf(0.62); g.fillRect(0, 0, N, N);                       // mortar
    const rows = 6, bh = N / rows;
    for (let y = 0; y < rows; y++) {
      const cols = 3 + (y % 2), bw = N / cols, off = (y % 2) * bw * 0.5;
      for (let x = -1; x <= cols; x++) {
        const v = 0.84 + r() * 0.16;
        g.fillStyle = shadeOf(v); g.fillRect(x * bw + off + 1.5, y * bh + 1.5, bw - 3, bh - 3);
        g.fillStyle = shadeOf(Math.min(1, v + 0.08)); g.fillRect(x * bw + off + 1.5, y * bh + 1.5, bw - 3, 2);            // lit top edge
        g.fillStyle = shadeOf(v - 0.12); g.fillRect(x * bw + off + 1.5, y * bh + bh - 3.5, bw - 3, 2);                  // shaded bottom edge
      }
    }
    for (let i = 0; i < 260; i++) { g.fillStyle = shadeOf(0.7 + r() * 0.3); g.globalAlpha = 0.35; g.fillRect(r() * N, r() * N, 1.5, 1.5); }
  } else if (kind === 'wood') {
    const planks = 4, pw = N / planks;
    for (let i = 0; i < planks; i++) {
      const v = 0.8 + r() * 0.18;
      g.fillStyle = shadeOf(v); g.fillRect(i * pw, 0, pw, N);
      g.globalAlpha = 0.25;
      for (let k = 0; k < 7; k++) { g.strokeStyle = shadeOf(v - 0.25); g.lineWidth = 1; g.beginPath(); const x0 = i * pw + 3 + r() * (pw - 6); g.moveTo(x0, 0); g.bezierCurveTo(x0 + 3, N * 0.3, x0 - 3, N * 0.7, x0 + 1, N); g.stroke(); }
      g.globalAlpha = 1; g.fillStyle = shadeOf(0.45); g.fillRect(i * pw, 0, 1.5, N);
    }
  } else if (kind === 'roof') {
    g.fillStyle = shadeOf(0.7); g.fillRect(0, 0, N, N);
    const rows = 8, rh = N / rows, tw = N / 8;
    for (let y = 0; y < rows; y++) for (let x = -1; x <= 8; x++) {
      const v = 0.82 + r() * 0.18, cx = x * tw + (y % 2) * tw / 2;
      g.fillStyle = shadeOf(v); g.beginPath(); g.moveTo(cx, y * rh); g.lineTo(cx + tw, y * rh); g.lineTo(cx + tw, y * rh + rh * 0.7); g.quadraticCurveTo(cx + tw / 2, y * rh + rh * 1.15, cx, y * rh + rh * 0.7); g.closePath(); g.fill();
      g.fillStyle = shadeOf(v - 0.2); g.fillRect(cx, y * rh + rh - 2, tw, 1.2);
    }
  } else if (kind === 'grain') {   // weathered flagstone: mottled, speckled, a few hairline cracks
    g.fillStyle = shadeOf(0.9); g.fillRect(0, 0, N, N);
    for (let i = 0; i < 40; i++) { g.fillStyle = shadeOf(0.8 + r() * 0.2); g.globalAlpha = 0.4; g.beginPath(); g.arc(r() * N, r() * N, 6 + r() * 16, 0, Math.PI * 2); g.fill(); }
    for (let i = 0; i < 500; i++) { g.fillStyle = shadeOf(0.6 + r() * 0.4); g.globalAlpha = 0.5; g.fillRect(r() * N, r() * N, 1.2, 1.2); }
    g.globalAlpha = 0.35; g.strokeStyle = shadeOf(0.55); g.lineWidth = 1;
    for (let i = 0; i < 4; i++) { let x = r() * N, y = r() * N; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 20; y += (r() - 0.5) * 20; g.lineTo(x, y); } g.stroke(); }
  } else if (kind === 'blob') {   // a soft round contact shadow
    const grd = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.3)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, N, N);
  }
  g.globalAlpha = 1;
  return c;
}

export function makeKit(THREE) {
  const mats = new Map(), geos = new Map(), texs = {};
  const canTex = typeof document !== 'undefined';
  const TEX_REPEAT = { stone: [2, 1.5], wood: [1, 1], roof: [3, 1.5] };
  const tex = (kind) => {
    if (!canTex) return null;
    if (texs[kind]) return texs[kind];
    // 'stone4x3' style kinds: the same stonework at a finer repeat, for big walls
    const fine = /^stone(\d+)x(\d+)$/.exec(kind);
    if (fine) { const t = tex('stone').clone(); t.repeat.set(+fine[1], +fine[2]); t.needsUpdate = true; return (texs[kind] = t); }
    const t = new THREE.CanvasTexture(surfaceCanvas(kind));
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (TEX_REPEAT[kind]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...TEX_REPEAT[kind]); }
    return (texs[kind] = t);
  };
  // While a tower or the castle is being built, colours registered here pick up a surface texture (stone, wood, roof).
  const kinds = new Map();
  const M = (color, o = {}) => {
    const kind = o.tex === 'plain' ? null : o.tex || (kit.texOn ? kinds.get(color) : null);
    const { tex: _t, ...rest } = o;
    const key = color + (kind || '') + JSON.stringify(rest);
    let m = mats.get(key);
    if (!m) {
      const map = kind ? tex(kind) : null;
      m = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), flatShading: true, ...rest, ...(map ? { map } : {}) });
      mats.set(key, m);
    }
    return m;
  };
  const G = (key, make) => { let g = geos.get(key); if (!g) { g = make(); geos.set(key, g); } return g; };
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
  const cyl = (rt, rb, h, c, seg = 10, x = 0, y = 0, z = 0) => mesh(G(`cy${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), M(c), x, y + h / 2, z);
  const cone = (r, h, c, seg = 8, x = 0, y = 0, z = 0) => mesh(G(`co${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)), M(c), x, y + h / 2, z);
  const box = (w, h, d, c, x = 0, y = 0, z = 0) => mesh(G(`bx${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), M(c), x, y + h / 2, z);
  const sph = (r, c, x = 0, y = 0, z = 0, o = {}) => mesh(G(`sp${r}`, () => new THREE.SphereGeometry(r, 10, 8)), M(c, o), x, y, z);
  const oct = (r, c, x = 0, y = 0, z = 0, o = {}) => mesh(G(`oc${r}`, () => new THREE.OctahedronGeometry(r)), M(c, o), x, y, z);
  const tor = (r, tube, c, x = 0, y = 0, z = 0, o = {}) => { const m = mesh(G(`to${r},${tube}`, () => new THREE.TorusGeometry(r, tube, 6, 16)), M(c, o), x, y, z); m.rotation.x = Math.PI / 2; return m; };
  const glow = (c) => ({ emissive: new THREE.Color(c), emissiveIntensity: 0.9 });
  // Many small parts of one colour (merlons, slits, rivets) merged into a single mesh: detail without extra draw calls.
  const merged = (key, parts, c, o = {}) => {
    const geo = G('mg' + key, () => {
      const pos = [], nor = [], uv = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      for (const pt of parts) {
        const g = pt.geo.clone().toNonIndexed();
        e.set(pt.rx || 0, pt.ry || 0, pt.rz || 0); q.setFromEuler(e);
        m4.compose(new THREE.Vector3(pt.x || 0, pt.y || 0, pt.z || 0), q, new THREE.Vector3(1, 1, 1));
        g.applyMatrix4(m4);
        pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
        if (g.attributes.uv) uv.push(...g.attributes.uv.array); else uv.push(...new Array(g.attributes.position.count * 2).fill(0));
        g.dispose();
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      return out;
    });
    return mesh(geo, M(c, o));
  };
  const BOXG = (w, h, d) => G(`bx${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  // A ring of n merlons (battlements) of size w×h at radius r, standing on height y.
  const merlons = (r, y, n, c, w = 0.09, h = 0.1, d = 0.07) => merged(`ml${r},${y},${n},${w},${h},${d}`,
    Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return { geo: BOXG(w, h, d), x: Math.cos(a) * r, y: y + h / 2, z: Math.sin(a) * r, ry: -a }; }), c);
  // n dark arrow slits around a round wall of radius r at height y (or glowing windows, with `o`).
  const slits = (r, y, n, c = '#1d1a20', w = 0.035, h = 0.12, a0 = 0, o = {}) => merged(`sl${r},${y},${n},${c},${w},${h},${a0}`,
    Array.from({ length: n }, (_, i) => { const a = a0 + (i / n) * Math.PI * 2; return { geo: BOXG(w, h, 0.03), x: Math.cos(a) * r, y: y + h / 2, z: Math.sin(a) * r, ry: Math.PI / 2 - a }; }), c, o);
  // A thin band (stone course, iron hoop) around a cylinder.
  const band = (r, y, c, h = 0.035, seg = 10) => cyl(r, r, h, c, seg, 0, y);
  // Spokes for a wheel lying in the XY plane.
  const wheel = (r, c, x, y, z) => {
    const g = new THREE.Group();
    const rim = mesh(G(`wh${r}`, () => new THREE.TorusGeometry(r, r * 0.16, 5, 12)), M(c)); g.add(rim);
    g.add(merged(`sp${r}`, [0, 1, 2].map((i) => ({ geo: BOXG(r * 1.9, r * 0.14, r * 0.14), rz: i * Math.PI / 3 })), c));
    g.add(mesh(G(`hub${r}`, () => new THREE.CylinderGeometry(r * 0.25, r * 0.25, r * 0.4, 8)), M('#3a2a1a'))); g.children[2].rotation.x = Math.PI / 2;
    g.position.set(x, y, z); return g;
  };
  // A soft contact shadow on the ground under a model (r = radius in tiles).
  const blob = (r, x = 0, z = 0) => {
    const m = new THREE.Mesh(G('blob', () => new THREE.PlaneGeometry(1, 1)), blobMat || (blobMat = new THREE.MeshBasicMaterial({ map: tex('blob'), transparent: true, depthWrite: false, opacity: 0.85 })));
    m.rotation.x = -Math.PI / 2; m.scale.set(r * 2, r * 2, 1); m.position.set(x, 0.012, z); m.renderOrder = 2; m.castShadow = false; m.receiveShadow = false; return m;
  };
  let blobMat = null;
  const kit = { THREE, M, G, mesh, cyl, cone, box, sph, oct, tor, glow, merged, merlons, slits, band, wheel, BOXG, blob, kinds, tex, texOn: false };
  for (const c of [WOOD, '#5a3d22', '#6a4a2c', '#6d4a2a', '#5e3a1a', '#6d5a48', '#6a5030']) kinds.set(c, 'wood');
  return kit;
}

const lerpN = (a, b, k) => a + (b - a) * k;

// ---------- towers ----------
// A two-step stone plinth every tower stands on (st = the tower skin's [light, dark] stone).
const plinth = (k, st, r = 0.42, seg = 8) => { const a = k.cyl(r, r + 0.03, 0.08, st[1], seg), b = k.cyl(r - 0.05, r - 0.02, 0.07, st[0], seg, 0, 0.08); a.material = k.M(st[1], { tex: 'plain' }); b.material = k.M(st[0], { tex: 'plain' }); return [a, b]; };
const SLATE = '#3b3f4a', IRON = '#4a4d55', ROPE = '#c9b38a', COPPER = '#c27a3a';

const B = {
  archer(k, col, st) {
    const g = new k.THREE.Group(), turret = new k.THREE.Group(), p = {};
    g.add(...plinth(k, st, 0.4, 9), k.cyl(0.25, 0.31, 0.66, st[0], 9, 0, 0.15), k.band(0.285, 0.34, st[1]), k.slits(0.27, 0.42, 3, '#1d1a20', 0.035, 0.13, 0.5));
    // a wooden gallery with battlements, and a pointed roof on four posts
    g.add(k.cyl(0.36, 0.3, 0.1, WOOD, 9, 0, 0.8), k.merlons(0.33, 0.9, 8, st[1], 0.08, 0.09, 0.06));
    g.add(k.merged('archposts', [0, 1, 2, 3].map((i) => { const a = i * Math.PI / 2 + Math.PI / 4; return { geo: k.BOXG(0.04, 0.3, 0.04), x: Math.cos(a) * 0.27, y: 1.05, z: Math.sin(a) * 0.27 }; }), '#5a3d22'));
    g.add(k.cone(0.42, 0.42, col, 9, 0, 1.2), k.cone(0.03, 0.14, GOLD, 5, 0, 1.6)); g.children[g.children.length - 2].material = k.M(col, { tex: 'roof' });
    // the archer: body, head and bow, turning to aim
    turret.add(k.cyl(0.06, 0.08, 0.16, '#4a5a3a', 6, 0.05, 0.9), k.sph(0.05, '#e3b48a', 0.05, 1.11, 0));
    p.bow = k.tor(0.12, 0.018, '#3a2a1a', 0.17, 1.0, 0); p.bow.rotation.set(0, 0, 0); p.bow.scale.set(0.55, 1, 1);
    turret.add(p.bow, k.box(0.26, 0.02, 0.02, '#4a3520', 0.2, 0.99, 0)); g.add(turret);
    return { g, turret, p, top: 1.7 };
  },
  cannon(k, col, st) {
    const g = new k.THREE.Group(), turret = new k.THREE.Group(), p = {};
    // a squat round bastion with battlements; the gun sits on a wheeled carriage inside
    g.add(...plinth(k, st, 0.44, 10), k.cyl(0.36, 0.4, 0.2, st[0], 10, 0, 0.15), k.band(0.385, 0.25, st[1]), k.merlons(0.37, 0.35, 10, st[1], 0.09, 0.1, 0.07));
    turret.add(k.box(0.34, 0.1, 0.26, '#6a4a2c', 0, 0.36, 0));
    for (const z of [-0.15, 0.15]) turret.add(k.wheel(0.09, '#4a3220', -0.05, 0.44, z));
    p.barrel = k.cyl(0.08, 0.11, 0.6, col, 10); p.barrel.rotation.z = -Math.PI / 2 + 0.12; p.barrel.position.set(0.17, 0.52, 0);
    p.muzzle = k.cyl(0.115, 0.1, 0.07, DARK, 10); p.muzzle.rotation.z = -Math.PI / 2 + 0.12; p.muzzle.position.set(0.47, 0.56, 0);
    const hoops = k.merged('canhoops', [-0.1, 0.06, 0.2].map((x) => ({ geo: k.G('hp', () => new k.THREE.CylinderGeometry(0.115, 0.115, 0.03, 10)), x, rz: Math.PI / 2 })), IRON);
    hoops.position.set(0.17, 0.52, 0); hoops.rotation.z = 0.12; p.hoops = hoops;
    turret.add(p.barrel, p.muzzle, hoops, k.sph(0.13, '#555a66', -0.12, 0.5, 0)); g.add(turret);
    // a stack of shot by the wall
    g.add(k.merged('shot', [[-0.22, 0.27, 0.2], [-0.15, 0.27, 0.24], [-0.19, 0.33, 0.22]].map(([x, y, z]) => ({ geo: k.G('sp0.05', () => new k.THREE.SphereGeometry(0.05, 8, 6)), x, y, z })), DARK));
    return { g, turret, p, top: 0.9 };
  },
  mage(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(...plinth(k, st, 0.38, 8), k.cyl(0.15, 0.27, 0.95, '#7d6aa8', 8, 0, 0.15), k.band(0.215, 0.45, '#5d4c88'), k.band(0.175, 0.8, '#5d4c88'));
    g.add(k.slits(0.2, 0.55, 3, '#ffe6a0', 0.04, 0.1, 0.3, k.glow('#c8a0ff')));   // lit windows
    g.add(k.cyl(0.24, 0.15, 0.1, st[0], 8, 0, 1.1), k.cone(0.2, 0.32, '#4a3a78', 8, 0, 1.2));
    p.ring = k.tor(0.3, 0.02, GOLD, 0, 1.0, 0, k.glow('#a07a10')); g.add(p.ring);
    p.ring2 = k.tor(0.22, 0.015, col, 0, 1.0, 0, k.glow(col)); g.add(p.ring2);
    p.crystal = k.oct(0.15, col, 0, 1.72, 0, k.glow(col)); g.add(p.crystal);
    return { g, p, top: 1.95 };
  },
  flak(k, col, st) {
    const g = new k.THREE.Group(), turret = new k.THREE.Group(), p = {};
    g.add(...plinth(k, st, 0.42, 8), k.cyl(0.3, 0.34, 0.24, st[0], 8, 0, 0.15));
    // sandbags round the rim and an ammo crate
    g.add(k.merged('bags', Array.from({ length: 9 }, (_, i) => { const a = (i / 9) * Math.PI * 2; return { geo: k.G('bag', () => { const s = new k.THREE.SphereGeometry(0.08, 7, 5); s.scale(1.3, 0.6, 0.8); return s; }), x: Math.cos(a) * 0.33, y: 0.43, z: Math.sin(a) * 0.33, ry: -a + Math.PI / 2 }; }), '#b9a77a'));
    g.add(k.box(0.14, 0.1, 0.1, '#6a5030', -0.18, 0.39, 0.15));
    turret.add(k.box(0.24, 0.13, 0.3, '#555a66', 0, 0.44, 0), k.box(0.06, 0.18, 0.34, '#6a6f7c', -0.12, 0.5, 0));
    for (const z of [-0.09, 0.09]) { const b = k.cyl(0.04, 0.06, 0.55, col, 8, 0, 0, z); b.rotation.z = -1.0; b.position.set(0.17, 0.72, z); turret.add(b); (p.barrels ||= []).push(b); }
    g.add(turret);
    return { g, turret, p, top: 1.0 };
  },
  mint(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(k.box(0.82, 0.08, 0.82, st[1]), k.box(0.66, 0.06, 0.66, st[0], 0, 0.08), k.box(0.56, 0.4, 0.5, '#efe3c2', 0, 0.14, -0.04));
    // a pillared front porch under a gold roof
    g.add(k.merged('mintcols', [-0.2, -0.07, 0.07, 0.2].map((x) => ({ geo: k.G('mcol', () => new k.THREE.CylinderGeometry(0.03, 0.03, 0.36, 6)), x, y: 0.32, z: 0.27 })), '#f6f0de'));
    g.add(k.box(0.6, 0.05, 0.16, '#efe3c2', 0, 0.5, 0.25), k.cone(0.52, 0.28, GOLD, 4, 0, 0.55).rotateY(Math.PI / 4), k.box(0.1, 0.2, 0.02, '#5a3d22', 0, 0.14, 0.215));
    g.add(k.box(0.08, 0.22, 0.08, '#8a7a6a', 0.18, 0.6, -0.15));   // chimney for the smelter
    p.coin = k.cyl(0.13, 0.13, 0.03, '#ffd45a', 14, 0, 1.0, 0); p.coin.rotation.x = Math.PI / 2; p.coin.material = k.M('#ffd45a', k.glow('#a07a10')); g.add(p.coin);
    return { g, p, top: 1.25 };
  },
  barracks(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(k.box(0.84, 0.08, 0.84, st[1]), k.box(0.7, 0.34, 0.56, st[0], 0, 0.08, 0), k.box(0.72, 0.06, 0.58, '#5a3d22', 0, 0.42));
    // a pitched roof: two slabs meeting at a ridge
    for (const sz of [-1, 1]) { const r = k.box(0.78, 0.04, 0.36, col, 0, 0.53, sz * 0.15); r.rotation.x = sz * 0.55; r.material = k.M(col, { tex: 'roof' }); g.add(r); }
    g.add(k.box(0.16, 0.22, 0.03, '#3a2a22', 0, 0.08, 0.29));
    // shields hung on the wall and a weapon rack
    g.add(k.merged('shields', [-0.24, 0.24].map((x) => ({ geo: k.G('shld', () => new k.THREE.CylinderGeometry(0.07, 0.07, 0.02, 8)), x, y: 0.28, z: 0.29, rx: Math.PI / 2 })), col));
    g.add(k.merged('spears', [-0.1, -0.05, 0].map((z) => ({ geo: k.BOXG(0.015, 0.36, 0.015), x: -0.38, y: 0.26, z, rz: 0.15 })), '#8a8f99'));
    g.add(k.cyl(0.015, 0.015, 0.5, '#3a2a22', 5, 0.3, 0.62, -0.2)); p.flag = k.box(0.2, 0.12, 0.01, col, 0.4, 1.0, -0.2); g.add(p.flag);
    return { g, p, top: 1.15 };
  },
  ballista(k, col, st) {
    const g = new k.THREE.Group(), turret = new k.THREE.Group(), p = {};
    g.add(...plinth(k, st, 0.42, 8), k.cyl(0.3, 0.34, 0.3, st[0], 8, 0, 0.15), k.merlons(0.31, 0.45, 8, st[1], 0.08, 0.08, 0.06));
    // the stock, the bow arms (two bent planks) and a bowstring
    turret.add(k.box(0.12, 0.12, 0.12, '#6d5a48', 0, 0.56, 0), k.box(0.62, 0.05, 0.08, WOOD, 0.1, 0.63, 0));
    for (const sz of [-1, 1]) { const arm = k.box(0.05, 0.05, 0.34, '#5e3a1a', 0.3, 0.64, sz * 0.17); arm.rotation.y = sz * 0.45; turret.add(arm); }
    turret.add(k.merged('bstr', [-1, 1].map((sz) => ({ geo: k.BOXG(0.01, 0.01, 0.34), x: 0.12, y: 0.65, z: sz * 0.15, ry: -sz * 0.9 })), ROPE));
    p.bolt = k.box(0.62, 0.03, 0.03, '#5e3a1a', 0.12, 0.68, 0);
    turret.add(p.bolt, k.cone(0.045, 0.12, STEEL, 4, 0.48, 0.63).rotateZ(-Math.PI / 2));
    g.add(turret);
    return { g, turret, p, top: 0.9 };
  },
  catapult(k, col, st) {
    const g = new k.THREE.Group(), turret = new k.THREE.Group(), p = {};
    g.add(k.box(0.82, 0.08, 0.72, st[1]));
    turret.add(k.box(0.72, 0.1, 0.1, WOOD, 0, 0.12, -0.24), k.box(0.72, 0.1, 0.1, WOOD, 0, 0.12, 0.24), k.box(0.1, 0.08, 0.56, WOOD, -0.25, 0.14, 0), k.box(0.1, 0.08, 0.56, WOOD, 0.25, 0.14, 0));
    for (const x of [-0.25, 0.25]) for (const z of [-0.32, 0.32]) turret.add(k.wheel(0.1, '#4a3220', x, 0.12, z));
    for (const z of [-0.2, 0.2]) { const up = k.box(0.07, 0.46, 0.07, WOOD, 0.02, 0.18, z); up.rotation.z = -0.15; turret.add(up); }
    turret.add(k.box(0.06, 0.06, 0.48, '#5e3a1a', 0.04, 0.6, 0));
    p.arm = new k.THREE.Group(); p.arm.position.set(-0.05, 0.36, 0);
    p.arm.add(k.box(0.8, 0.06, 0.06, WOOD, 0.1, 0, 0), k.cyl(0.11, 0.07, 0.09, '#6d5a48', 8, 0.48, 0.0), k.sph(0.07, '#8a8a8a', 0.48, 0.1, 0));
    turret.add(p.arm); g.add(turret);
    return { g, turret, p, top: 1.0 };
  },
  artillery(k, col, st) {
    const g = new k.THREE.Group(), turret = new k.THREE.Group(), p = {};
    g.add(...plinth(k, st, 0.45, 10), k.cyl(0.34, 0.38, 0.2, st[0], 10, 0, 0.15), k.merlons(0.36, 0.35, 10, st[1], 0.08, 0.09, 0.07));
    turret.add(k.box(0.36, 0.12, 0.3, '#5a4a3a', 0, 0.36, 0));
    for (const z of [-0.17, 0.17]) turret.add(k.wheel(0.12, '#4a3220', -0.02, 0.46, z));
    p.barrel = k.cyl(0.12, 0.16, 0.7, col, 10); p.barrel.rotation.z = -1.1; p.barrel.position.set(0.18, 0.66, 0);
    const hoops = k.merged('arthoops', [-0.2, 0.05, 0.28].map((y) => ({ geo: k.G('ahp', () => new k.THREE.CylinderGeometry(0.16, 0.16, 0.035, 10)), y })), IRON);
    hoops.rotation.z = -1.1; hoops.position.set(0.18, 0.66, 0);
    turret.add(p.barrel, hoops, k.sph(0.18, '#555a66', 0, 0.5, 0)); g.add(turret);
    g.add(k.merged('shells', [[-0.25, 0.2], [-0.25, 0.08], [-0.17, 0.27]].map(([x, z]) => ({ geo: k.G('shell', () => new k.THREE.CylinderGeometry(0.035, 0.04, 0.12, 6)), x, y: 0.41, z })), '#9a8a5a'));
    return { g, turret, p, top: 1.1 };
  },
  tesla(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(...plinth(k, st, 0.38, 8), k.cyl(0.1, 0.22, 0.95, '#6d7a8c', 8, 0, 0.15));
    // four copper prongs around the foot, coils stacked up the mast, a crown of spikes under the orb
    g.add(k.merged('tprong', [0, 1, 2, 3].map((i) => { const a = i * Math.PI / 2 + Math.PI / 4; return { geo: k.BOXG(0.04, 0.32, 0.04), x: Math.cos(a) * 0.28, y: 0.32, z: Math.sin(a) * 0.28, rx: Math.sin(a) * 0.25, rz: -Math.cos(a) * 0.25 }; }), COPPER));
    p.coils = [];
    for (let i = 0; i < 4; i++) { const c = k.tor(0.21 - i * 0.03, 0.028, COPPER, 0, 0.32 + i * 0.2); g.add(c); p.coils.push(c); }
    g.add(k.merged('tspike', Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2; return { geo: k.G('tsp', () => new k.THREE.ConeGeometry(0.025, 0.14, 4)), x: Math.cos(a) * 0.12, y: 1.15, z: Math.sin(a) * 0.12 }; }), '#dfe6ee'));
    p.orb = k.sph(0.16, col, 0, 1.3, 0, k.glow(col)); g.add(p.orb);
    return { g, p, top: 1.5 };
  },
  frost(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(k.cyl(0.4, 0.43, 0.08, st[1], 7), k.cyl(0.36, 0.38, 0.05, '#dff4ff', 7, 0, 0.08));
    g.add(k.cone(0.24, 1.0, '#bfeaff', 5, 0, 0.13), k.cone(0.14, 0.58, '#9ad8ff', 5, 0.22, 0.13), k.cone(0.12, 0.48, '#9ad8ff', 5, -0.2, 0.13, 0.12), k.cone(0.1, 0.4, '#d6f3ff', 5, -0.06, 0.13, -0.22));
    p.core = k.oct(0.1, '#e8fbff', 0, 0.62, 0, k.glow('#7fd3f2')); g.add(p.core);
    // shards that circle the spire
    p.shards = new k.THREE.Group(); p.shards.position.y = 0.85;
    p.shards.add(k.merged('fshard', [0, 1, 2].map((i) => { const a = i * Math.PI * 2 / 3; return { geo: k.G('fsh', () => new k.THREE.OctahedronGeometry(0.05)), x: Math.cos(a) * 0.32, z: Math.sin(a) * 0.32 }; }), '#e8fbff', k.glow('#7fd3f2')));
    g.add(p.shards);
    return { g, p, top: 1.25 };
  },
  obelisk(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(k.box(0.78, 0.08, 0.78, st[1]), k.box(0.6, 0.08, 0.6, st[0], 0, 0.08), k.box(0.44, 0.06, 0.44, '#e8d49a', 0, 0.16));
    g.add(k.cyl(0.12, 0.25, 1.15, '#e0c06a', 4, 0, 0.22).rotateY(Math.PI / 4), k.cone(0.13, 0.2, GOLD, 4, 0, 1.37).rotateY(Math.PI / 4));
    g.add(k.merged('glyph', [0.45, 0.7, 0.95].map((y, i) => ({ geo: k.BOXG(0.32 - i * 0.06, 0.03, 0.32 - i * 0.06), y })), '#b08a2a'));
    p.sun = k.sph(0.15, '#fff2b0', 0, 1.85, 0, k.glow('#ffd45a')); g.add(p.sun);
    p.halo = k.tor(0.24, 0.015, '#ffe08a', 0, 1.85, 0, k.glow('#ffd45a')); p.halo.rotation.x = 0; g.add(p.halo);
    return { g, p, top: 2.05 };
  },
  venom(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(...plinth(k, st, 0.38, 8), k.cyl(0.13, 0.2, 0.5, '#5f7a4a', 8, 0, 0.15));
    // twisting vines up the stem and a glass flask held in an iron cage
    g.add(k.merged('vine', Array.from({ length: 6 }, (_, i) => ({ geo: k.G('vn', () => new k.THREE.SphereGeometry(0.05, 6, 4)), x: Math.cos(i * 1.4) * 0.17, y: 0.2 + i * 0.08, z: Math.sin(i * 1.4) * 0.17 })), '#3e6a2a'));
    p.flask = k.sph(0.27, col, 0, 0.88, 0, { transparent: true, opacity: 0.85, ...k.glow('#4a8a20') }); g.add(p.flask);
    g.add(k.merged('cage', [0, 1, 2, 3].map((i) => ({ geo: k.G('cg', () => new k.THREE.TorusGeometry(0.28, 0.012, 4, 14)), y: 0.88, ry: i * Math.PI / 4 })), IRON));
    g.add(k.cyl(0.07, 0.09, 0.2, '#5f7a4a', 8, 0, 1.12), k.sph(0.05, '#9ae05a', 0, 1.36, 0, k.glow('#4a8a20')));
    return { g, p, top: 1.45 };
  },
  sanctum(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(k.cyl(0.44, 0.46, 0.08, st[1], 10), k.cyl(0.38, 0.4, 0.07, st[0], 10, 0, 0.08));
    g.add(k.merged('scol', Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3 + Math.PI / 6; return { geo: k.G('sc', () => new k.THREE.CylinderGeometry(0.035, 0.045, 0.46, 8)), x: Math.cos(a) * 0.28, y: 0.38, z: Math.sin(a) * 0.28 }; }), '#f1ead2'));
    g.add(k.cyl(0.34, 0.34, 0.06, '#e8e0c4', 10, 0, 0.61));
    const dome = k.sph(0.3, col, 0, 0.67, 0); dome.scale.set(1, 0.7, 1); g.add(dome);
    g.add(k.cone(0.04, 0.2, GOLD, 6, 0, 0.86));
    p.glow = k.sph(0.1, '#fff2b0', 0, 0.36, 0, k.glow('#ffe08a')); g.add(p.glow);
    return { g, p, top: 1.25 };
  },
  gatling(k, col, st) {
    const g = new k.THREE.Group(), turret = new k.THREE.Group(), p = {};
    g.add(...plinth(k, st, 0.4, 8), k.cyl(0.26, 0.3, 0.3, st[0], 8, 0, 0.15), k.band(0.28, 0.3, IRON));
    turret.add(k.box(0.24, 0.2, 0.28, '#555a66', 0, 0.56, 0), k.box(0.03, 0.26, 0.34, '#6a6f7c', 0.1, 0.55, 0));   // a shield plate
    const drum = k.cyl(0.09, 0.09, 0.12, '#8a7a4a', 10, -0.06, 0.56, 0.2); drum.rotation.x = Math.PI / 2; turret.add(drum);
    p.spin = new k.THREE.Group(); p.spin.position.set(0.2, 0.64, 0);
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, b = k.cyl(0.03, 0.03, 0.52, col, 6, 0, 0, 0); b.rotation.z = -Math.PI / 2; b.position.set(0.1, Math.cos(a) * 0.075, Math.sin(a) * 0.075); p.spin.add(b); }
    const collar = k.cyl(0.1, 0.1, 0.04, DARK, 10); collar.rotation.z = Math.PI / 2; collar.position.set(0.3, 0, 0); p.spin.add(collar);
    turret.add(p.spin); g.add(turret);
    return { g, turret, p, top: 0.95 };
  },
  voidwell(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(k.cyl(0.44, 0.47, 0.1, st[1], 12), k.tor(0.32, 0.09, '#3a2f55', 0, 0.16));
    g.add(k.merged('vrunes', Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return { geo: k.BOXG(0.06, 0.03, 0.03), x: Math.cos(a) * 0.32, y: 0.26, z: Math.sin(a) * 0.32, ry: -a }; }), '#c9a8ff', k.glow('#8a5ad8')));
    p.vortex = k.cyl(0.26, 0.26, 0.02, '#8a5ad8', 16, 0, 0.18); p.vortex.material = k.M('#8a5ad8', k.glow('#6a3fc4')); g.add(p.vortex);
    p.mote = k.oct(0.08, '#d9c2ff', 0, 0.72, 0, k.glow('#b79bff')); g.add(p.mote);
    // rocks torn from the ground, circling the rift
    p.rocks = new k.THREE.Group(); p.rocks.position.y = 0.45;
    p.rocks.add(k.merged('vrock', [0, 1, 2, 3].map((i) => { const a = i * Math.PI / 2; return { geo: k.G('vr', () => new k.THREE.DodecahedronGeometry(0.05)), x: Math.cos(a) * 0.36, y: (i % 2) * 0.12, z: Math.sin(a) * 0.36 }; }), '#5a5068'));
    g.add(p.rocks);
    return { g, p, top: 1.0 };
  },
  trebuchet(k, col, st) {
    const g = new k.THREE.Group(), turret = new k.THREE.Group(), p = {};
    g.add(k.box(0.86, 0.08, 0.6, st[1]));
    turret.add(k.box(0.82, 0.08, 0.08, WOOD, 0, 0.1, -0.22), k.box(0.82, 0.08, 0.08, WOOD, 0, 0.1, 0.22));
    for (const x of [-0.3, 0.3]) for (const z of [-0.29, 0.29]) turret.add(k.wheel(0.09, '#4a3220', x, 0.11, z));
    for (const z of [-0.2, 0.2]) { const l1 = k.box(0.06, 0.95, 0.06, WOOD, 0.14, 0.1, z); l1.rotation.z = 0.25; const l2 = k.box(0.06, 0.95, 0.06, WOOD, -0.14, 0.1, z); l2.rotation.z = -0.25; turret.add(l1, l2); }
    turret.add(k.box(0.05, 0.05, 0.46, '#5e3a1a', 0, 1.0, 0));
    p.arm = new k.THREE.Group(); p.arm.position.set(0, 0.98, 0);
    p.arm.add(k.box(1.1, 0.06, 0.06, '#6d4a2a', -0.2, 0, 0), k.box(0.2, 0.2, 0.2, '#555a66', -0.72, -0.12, 0), k.box(0.13, 0.04, 0.13, WOOD, 0.36, 0.0, 0), k.box(0.01, 0.22, 0.01, ROPE, 0.36, -0.11, 0));
    turret.add(p.arm); g.add(turret);
    return { g, turret, p, top: 1.45 };
  },
};

// What a tower does on every frame: aim, recoil, spin, glow.
const TICK = {
  archer: (m, t, T, rec) => { m.p.bow.position.x = 0.17 - rec * 0.05; },
  cannon: (m, t, T, rec) => { m.p.barrel.position.x = 0.17 - rec * 0.12; m.p.muzzle.position.x = 0.47 - rec * 0.12; m.p.hoops.position.x = 0.17 - rec * 0.12; },
  mage: (m, t, T) => { m.p.crystal.position.y = 1.72 + Math.sin(T * 3 + t.cx) * 0.06; m.p.crystal.rotation.y = T * 1.4; m.p.ring.rotation.y = T * 0.8; m.p.ring.rotation.x = Math.PI / 2 + Math.sin(T * 1.3) * 0.35; m.p.ring2.rotation.x = Math.PI / 2 + Math.cos(T * 1.1) * 0.5; },
  flak: (m, t, T, rec) => { for (const b of m.p.barrels) b.position.x = 0.17 - rec * 0.06; },
  mint: (m, t, T) => { m.p.coin.rotation.z = T * 2; m.p.coin.position.y = 1.0 + Math.sin(T * 2) * 0.03; },
  barracks: (m, t, T) => { m.p.flag.rotation.y = Math.sin(T * 4 + t.cx) * 0.25; },
  ballista: (m, t, T, rec) => { m.p.bolt.position.x = 0.12 - rec * 0.12; },
  catapult: (m, t, T, rec) => { m.p.arm.rotation.z = -rec * 1.1 + 0.25; },
  artillery: (m, t, T, rec) => { m.p.barrel.position.x = 0.18 - rec * 0.1; },
  tesla: (m, t, T, rec) => { const s = 1 + 0.12 * Math.sin(T * 9 + t.cx) + rec * 0.4; m.p.orb.scale.setScalar(s); m.p.coils.forEach((c, i) => { c.rotation.z = Math.sin(T * 3 + i) * 0.1 * (1 + rec * 3); }); },
  frost: (m, t, T) => { m.p.core.rotation.y = T * 1.5; m.p.core.position.y = 0.62 + Math.sin(T * 2) * 0.05; m.p.shards.rotation.y = T * 0.9; m.p.shards.position.y = 0.85 + Math.sin(T * 1.6) * 0.05; },
  obelisk: (m, t, T) => { m.p.sun.position.y = 1.85 + Math.sin(T * 2) * 0.05; m.p.sun.scale.setScalar(1 + 0.1 * Math.sin(T * 4)); m.p.halo.position.y = m.p.sun.position.y; m.p.halo.rotation.y = T; m.p.halo.rotation.x = Math.PI / 2 + Math.sin(T * 0.7) * 0.4; },
  venom: (m, t, T) => { m.p.flask.scale.y = 1 + 0.05 * Math.sin(T * 3); },
  sanctum: (m, t, T) => { m.p.glow.scale.setScalar(1 + 0.25 * Math.sin(T * 2.5 + t.cx)); },
  gatling: (m, t, T, rec) => { m.p.spin.rotation.x = T * (2 + rec * 20) + (m.spin = (m.spin || 0) + rec * 0.4); },
  voidwell: (m, t, T) => { m.p.vortex.rotation.y = T * 2; m.p.mote.position.y = 0.72 + Math.sin(T * 2.4) * 0.08; m.p.mote.rotation.y = T * 3; m.p.rocks.rotation.y = -T * 1.2; },
  trebuchet: (m, t, T, rec) => { m.p.arm.rotation.z = -rec * 1.3 + 0.35; },
};

export function buildTowerModel(kit, type, skinColors, tint) {
  const THREE = kit.THREE, def = TOWERS[type], build = B[type];
  if (!build) return null;
  const root = new THREE.Group();
  kit.kinds.set(skinColors[0], 'stone'); kit.kinds.set(skinColors[1], 'stone'); kit.texOn = true;
  let m;
  try { m = build(kit, def.color, skinColors); } finally { kit.texOn = false; }
  root.add(kit.blob(def.trap ? 0.3 : 0.52));
  m.type = type; m.root = root; m.body = m.g; root.add(m.g);
  // rubble for a wrecked tower
  m.rubble = new THREE.Group();
  [[-0.15, -0.1, 0.16], [0.12, -0.05, 0.13], [0.02, 0.14, 0.11], [-0.04, 0.0, 0.09]].forEach(([x, z, r], i) => m.rubble.add(kit.sph(r, i % 2 ? '#8a8a8a' : '#6f6f6f', x, r * 0.6, z)));
  m.rubble.visible = false; root.add(m.rubble);
  m.decor = new THREE.Group(); root.add(m.decor); m.decorKey = '';
  m.top = m.top || 1.2;
  return m;
}

// Per-frame update. `rec` is the 0..1 recoil kick, `aim` the angle in tile space (y down).
export function tickTowerModel(kit, m, t, T, def) {
  const ruined = !!t.ruined;
  m.body.visible = !ruined; m.rubble.visible = ruined; m.decor.visible = !ruined;
  if (ruined) return;
  const tier = t.tier || 1, sc = 1 + 0.05 * (Math.min(tier, 5) - 1);
  m.body.scale.setScalar(sc);
  const aim = t.aim ?? -Math.PI / 2;
  if (m.turret) m.turret.rotation.y = -aim;
  TICK[m.type]?.(m, t, T, Math.min(1, t.recoil || 0));
  const key = `${tier}|${t.mastery || 0}|${def.color}`;
  if (key !== m.decorKey) {
    m.decorKey = key;
    for (const c of [...m.decor.children]) m.decor.remove(c);
    const THREE = kit.THREE;
    if (tier >= 2 && !def.noDecor) {
      const flag = new THREE.Mesh(kit.G('flag', () => new THREE.PlaneGeometry(0.2, 0.12)), new THREE.MeshLambertMaterial({ color: def.color, side: THREE.DoubleSide }));
      flag.position.set(0.4, 0.78, 0.1); m.flag = flag;
      m.decor.add(kit.cyl(0.012, 0.012, 0.5, '#3a2a22', 5, 0.3, 0.2, 0.1), flag); flag.position.set(0.4, 0.58, 0.1);
    }
    if (tier >= 3) m.decor.add(kit.tor(0.4, 0.025, GOLD, 0, 0.16));
    if (tier >= 4) for (const a of [0.6, 2.2, 3.8, 5.4]) m.decor.add(kit.oct(0.045, '#7fe0ff', Math.cos(a) * 0.4, 0.22, Math.sin(a) * 0.4, kit.glow('#3fb0e0')));
    if (t.mastery || tier >= 5) { m.aura = kit.tor(0.52, 0.02, '#f5c542', 0, 0.03, 0, { transparent: true, opacity: 0.6, ...kit.glow('#f5c542') }); m.decor.add(m.aura); } else m.aura = null;
  }
  if (m.flag) m.flag.rotation.y = Math.sin(T * 5 + t.cy) * 0.35;
  if (m.aura) { m.aura.material.opacity = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(T * 3 + t.cx)); }
}

// ---------- the castle ----------
// Keep, two round towers, curtain walls, gate, flag, and a palisade of stakes across the front. Tile units; origin = the castle's tile.
export function buildCastle(kit, sk) {
  const THREE = kit.THREE, g = new THREE.Group(), p = {};
  const W = sk.wall, W2 = sk.wall2, R = sk.roof;
  kit.kinds.set(W, 'stone'); kit.kinds.set(W2, 'stone'); kit.kinds.set(R, 'roof'); kit.texOn = true;
  try { buildCastleParts(kit, sk, g, p); } finally { kit.texOn = false; }
  g.add(kit.blob(1.6, 0, 0.1));
  return { g, p };
}
function buildCastleParts(kit, sk, g, p) {
  const THREE = kit.THREE;
  const W = sk.wall, W2 = sk.wall2, R = sk.roof;
  const row = (key, n, step, w, h, d, y, z, c, x0 = 0) => kit.merged(key, Array.from({ length: n }, (_, i) => ({ geo: kit.BOXG(w, h, d), x: x0 + (i - (n - 1) / 2) * step, y: y + h / 2, z })), c);
  g.add(kit.box(2.6, 0.06, 1.2, '#a79f8e', 0, 0, 0.42));                                   // courtyard slab
  g.add(kit.box(2.2, 0.08, 0.62, W2, 0, 0.06, -0.12));                                     // wall footing
  g.add(kit.box(2.1, 0.62, 0.5, W2, 0, 0.06, -0.12));                                      // curtain wall
  g.add(row('cbat', 11, 0.2, 0.13, 0.12, 0.5, 0.68, -0.12, W2));                             // its battlements
  // the donjon: a tall square keep behind the gate, with a pitched roof
  g.add(kit.box(0.62, 1.55, 0.5, W, 0, 0.06, -0.3));
  g.add(row('dwin', 2, 0.26, 0.07, 0.16, 0.03, 1.15, -0.04, '#2a2f4f'));
  for (const sz of [-1, 1]) { const r = kit.box(0.7, 0.04, 0.34, R, 0, 1.69, -0.3 + sz * 0.13); r.rotation.x = sz * 0.75; g.add(r); }
  // the gatehouse, its battlements, an arched gate with a portcullis, and banners either side
  g.add(kit.box(1.0, 1.15, 0.8, W, 0, 0.06, 0.0));
  g.add(row('gbat', 5, 0.22, 0.14, 0.14, 0.8, 1.21, 0.0, W));
  g.add(row('gwin', 2, 0.5, 0.07, 0.14, 0.03, 0.8, 0.41, '#2a2f4f'));
  g.add(kit.box(0.36, 0.42, 0.04, '#2a1c14', 0, 0.06, 0.41));
  g.add(kit.cyl(0.18, 0.18, 0.04, '#2a1c14', 12, 0, 0.47, 0.41).rotateX(Math.PI / 2));
  g.add(kit.merged('pcul', [-0.12, -0.04, 0.04, 0.12].map((x) => ({ geo: kit.BOXG(0.02, 0.5, 0.02), x, y: 0.31, z: 0.44 })).concat([0.18, 0.34].map((y) => ({ geo: kit.BOXG(0.32, 0.02, 0.02), y, z: 0.44 }))), '#4a4d55'));
  g.add(kit.box(0.46, 0.06, 0.06, W2, 0, 0.66, 0.42));                                     // the arch's lintel
  for (const sx of [-1, 1]) {
    const ban = new THREE.Mesh(kit.G('cban', () => new THREE.PlaneGeometry(0.16, 0.34)), new THREE.MeshLambertMaterial({ color: sk.flag, side: THREE.DoubleSide }));
    ban.position.set(sx * 0.33, 0.78, 0.415); g.add(ban);
    g.add(kit.sph(0.035, '#ffcf6a', sx * 0.24, 0.6, 0.45, kit.glow('#ff9a3c')));       // gate torches
  }
  // two round towers at the front, two smaller ones at the back
  for (const sx of [-1, 1]) {
    g.add(kit.cyl(0.36, 0.41, 1.45, W, 12, sx * 0.95, 0.0, 0.0), kit.band(0.385, 0.5, W2, 0.04, 12), kit.merlons(0.37, 1.45, 10, W, 0.1, 0.12, 0.08));
    g.add(kit.cone(0.4, 0.62, R, 12, sx * 0.95, 1.5, 0.0), kit.cone(0.03, 0.16, sk.flag, 5, sx * 0.95, 2.1, 0.0));
    g.add(kit.slits(0.37, 0.85, 3, '#2a2f4f', 0.06, 0.16, Math.PI / 2 - 0.6).translateX(sx * 0.95), kit.slits(0.385, 0.35, 2, '#1d1a20', 0.035, 0.12, Math.PI / 2 + (sx > 0 ? -0.9 : 0.9)).translateX(sx * 0.95));
    g.add(kit.cyl(0.24, 0.27, 1.0, W2, 10, sx * 1.02, 0.0, -0.36), kit.merlons(0.25, 1.0, 8, W2, 0.08, 0.1, 0.06).translateX(sx * 1.02).translateZ(-0.36), kit.cone(0.28, 0.4, R, 10, sx * 1.02, 1.05, -0.36));
  }
  g.add(kit.cyl(0.015, 0.015, 0.55, '#3a2a22', 5, 0, 1.28, 0));
  p.flag = new THREE.Mesh(kit.G('cflag', () => { const f = new THREE.PlaneGeometry(0.4, 0.22, 6, 1); return f; }), new THREE.MeshLambertMaterial({ color: sk.flag, side: THREE.DoubleSide }));
  p.flag.position.set(0.2, 1.72, 0); p.flag.castShadow = true; g.add(p.flag);
  // palisade
  p.stakes = [];
  const n = 15, cy = 0.37, rx = 1.3, rz = 0.55;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.1 + 0.8 * (i / (n - 1)));
    const s = kit.cone(0.045, 0.24, '#b08d62', 5, Math.cos(a) * rx, 0, cy + Math.sin(a) * rz + 0.55);
    g.add(s); p.stakes.push(s);
  }
  p.heroPerch = { x: 0, y: 1.26, z: 0.0 };
}

export function tickCastle(m, game, T, sk) {
  const wf = game.wall.maxHp > 0 ? game.wall.hp / game.wall.maxHp : 0, n = m.p.stakes.length, alive = Math.ceil(n * Math.max(0, wf));
  m.p.stakes.forEach((s, i) => {
    const d = Math.abs(i - (n - 1) / 2), intact = alive > 0 && d <= (alive - 1) / 2 + 0.01;
    s.scale.y = intact ? 1 : 0.3; s.visible = game.wall.maxHp > 0;
  });
  const f = m.p.flag, pos = f.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, Math.sin(T * 6 + x * 9) * 0.04 * (x + 0.2) * 3); }
  pos.needsUpdate = true;
}

// ---------- the battlements under your feet in Hero Mode ----------
// What you see when you look down from the wall in first person: a stone walk, the parapet and its merlons in front of you,
// the wall face dropping to the ground, side parapets and two corner towers, all in your castle's colours and stonework.
// Local frame: origin at the castle tile, +z is the way you face; you stand at z = -1.1, eyes at 3.7.
export function buildParapet(kit, sk) {
  const THREE = kit.THREE, g = new THREE.Group(), p = {};
  const W = sk.wall, W2 = sk.wall2, R = sk.roof;
  const fine = (m, kind) => { m.material = kit.M('#' + m.material.color.getHexString(), { tex: kind }); return m; };
  kit.kinds.set(W, 'stone'); kit.kinds.set(W2, 'stone'); kit.kinds.set(R, 'roof'); kit.texOn = true;
  try {
    const floorY = 1.6, front = 0.45, span = 7.2;
    // the wall walk: flagstones with dark joints between them
    g.add(fine(kit.box(2.9, 0.1, 2.0, W2, 0, floorY - 0.1, front - 1.1), 'plain'));
    g.children[0].material = kit.M('#3a3530', { tex: 'plain' });
    const slabs = [];
    for (let ix = 0; ix < 6; ix++) for (let iz = 0; iz < 4; iz++) slabs.push({ geo: kit.BOXG(0.44 - (iz % 2) * 0.04, 0.04, 0.44), x: -1.2 + ix * 0.48 + (iz % 2) * 0.12, y: floorY + 0.02, z: front - 0.3 - iz * 0.48 });
    const fl = kit.merged('ppslab', slabs, W2); fl.material = kit.M(W2, { tex: 'grain' }); g.add(fl);
    // the front wall dropping to the ground, a string course and a plinth
    g.add(fine(kit.box(span, floorY, 0.3, W, 0, 0, front + 0.05), 'stone10x3'));
    g.add(fine(kit.box(span + 0.1, 0.08, 0.38, W2, 0, floorY * 0.55, front + 0.07), 'plain'));
    g.add(fine(kit.box(span + 0.2, 0.26, 0.44, W2, 0, 0, front + 0.05), 'stone12x1'));
    // the parapet in front of you: a low breastwork and merlons with capstones
    g.add(fine(kit.box(span, 0.24, 0.28, W, 0, floorY, front + 0.05), 'stone10x1'));
    g.add(kit.merged('ppm', Array.from({ length: 10 }, (_, i) => ({ geo: kit.BOXG(0.36, 0.26, 0.28), x: (i - 4.5) * 0.66, y: floorY + 0.24 + 0.13, z: front + 0.05 })), W));
    g.add(kit.merged('ppcap', Array.from({ length: 10 }, (_, i) => ({ geo: kit.BOXG(0.4, 0.04, 0.32), x: (i - 4.5) * 0.66, y: floorY + 0.52, z: front + 0.05 })), W2));
    g.add(kit.merged('ppslit', Array.from({ length: 7 }, (_, i) => ({ geo: kit.BOXG(0.05, 0.26, 0.02), x: (i - 3) * 1.0, y: floorY * 0.62, z: front + 0.21 })), '#1d1a20'));
    g.add(kit.merged('ppbut', [-3, -1.5, 1.5, 3].map((x) => ({ geo: kit.BOXG(0.24, floorY * 0.8, 0.26), x, y: floorY * 0.4, z: front + 0.3 })), W2));
    // side parapets running back along the walk
    for (const sx of [-1, 1]) {
      g.add(fine(kit.box(0.22, 0.34, 2.0, W, sx * 1.45, floorY, front - 1.05), 'stone3x1'));
      g.add(kit.merged('pps' + sx, [0, 1, 2].map((i) => ({ geo: kit.BOXG(0.24, 0.22, 0.32), x: sx * 1.45, y: floorY + 0.45, z: front - 0.35 - i * 0.62 })), W));
    }
    // two round corner towers ahead of you, with roofs and banners
    for (const sx of [-1, 1]) {
      const x = sx * 2.3, z = front + 0.2;
      g.add(fine(kit.cyl(0.55, 0.6, floorY + 0.7, W, 14, x, 0, z), 'stone6x3'), kit.band(0.585, floorY * 0.55, W2, 0.06, 14).translateX(x).translateZ(z));
      g.add(kit.merlons(0.56, floorY + 0.7, 10, W, 0.15, 0.18, 0.12).translateX(x).translateZ(z));
      g.add(kit.cone(0.64, 0.9, R, 14, x, floorY + 0.9, z), kit.cone(0.04, 0.2, sk.flag, 5, x, floorY + 1.8, z));
      g.add(kit.slits(0.58, floorY * 0.6, 4, '#2a2f4f', 0.06, 0.2, 0.3).translateX(x).translateZ(z));
      const ban = new THREE.Mesh(kit.G('ppban', () => new THREE.PlaneGeometry(0.3, 0.55)), new THREE.MeshLambertMaterial({ color: sk.flag, side: THREE.DoubleSide }));
      ban.position.set(x - sx * 0.05, floorY * 0.8, z + 0.62); g.add(ban);
    }
    // a brazier on the walk, glowing
    g.add(kit.cyl(0.08, 0.05, 0.18, '#4a4d55', 8, 0.9, floorY, front - 0.4), kit.sph(0.06, '#ffcf6a', 0.9, floorY + 0.22, front - 0.4, kit.glow('#ff8a2a')));
  } finally { kit.texOn = false; }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { g, p };
}
