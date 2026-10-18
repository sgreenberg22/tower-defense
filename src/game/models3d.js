// Low-poly 3D models for the 3D view: one builder per tower type, plus the castle.
// Units are tiles. A model's origin is the middle of its tile at ground level; +x is "forward" (the way it aims).
// Every builder returns { g, turret?, parts, tick(t, time) } and never touches the game: render3d.js feeds it state each frame.
import { TOWERS } from '../data/balance.js';

const WOOD = '#8a5a32', DARK = '#2d2f36', STEEL = '#aab2c0', GOLD = '#f2b33d';

export function makeKit(THREE) {
  const mats = new Map(), geos = new Map();
  const M = (color, o = {}) => {
    const key = color + JSON.stringify(o);
    let m = mats.get(key);
    if (!m) { m = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), flatShading: true, ...o }); mats.set(key, m); }
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
  return { THREE, M, G, mesh, cyl, cone, box, sph, oct, tor, glow };
}

const lerpN = (a, b, k) => a + (b - a) * k;

// ---------- towers ----------
const B = {
  archer(k, col, st) {
    const g = new k.THREE.Group(), turret = new k.THREE.Group(), p = {};
    g.add(k.cyl(0.38, 0.4, 0.14, st[1], 9), k.cyl(0.26, 0.31, 0.62, st[0], 9, 0, 0.14), k.cyl(0.35, 0.3, 0.13, WOOD, 9, 0, 0.74), k.cone(0.42, 0.4, col, 9, 0, 0.87));
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; g.add(k.box(0.07, 0.1, 0.07, st[1], Math.cos(a) * 0.3, 0.14 + 0.62 + 0.0, Math.sin(a) * 0.3)); }
    p.bow = k.tor(0.13, 0.022, '#3a2a1a', 0.3, 0.78, 0); p.bow.rotation.set(0, 0, 0); p.bow.scale.set(0.6, 1, 1);
    turret.add(p.bow, k.box(0.34, 0.025, 0.025, '#4a3520', 0.3, 0.78, 0)); g.add(turret);
    return { g, turret, p, top: 1.3 };
  },
  cannon(k, col, st) {
    const g = new k.THREE.Group(), turret = new k.THREE.Group(), p = {};
    g.add(k.cyl(0.4, 0.42, 0.16, st[1], 10), k.cyl(0.32, 0.36, 0.22, st[0], 10, 0, 0.16));
    for (const z of [-0.3, 0.3]) g.add(k.cyl(0.09, 0.09, 0.05, '#5a4634', 8, 0, 0.15, z)), g.children[g.children.length - 1].rotation.x = Math.PI / 2;
    p.barrel = k.cyl(0.1, 0.13, 0.62, col, 10); p.barrel.rotation.z = -Math.PI / 2; p.barrel.position.set(0.2, 0.5, 0);
    p.muzzle = k.cyl(0.14, 0.14, 0.06, DARK, 10); p.muzzle.rotation.z = -Math.PI / 2; p.muzzle.position.set(0.52, 0.5, 0);
    turret.add(p.barrel, p.muzzle, k.sph(0.18, '#555a66', 0, 0.5, 0)); g.add(turret);
    return { g, turret, p, top: 0.8 };
  },
  mage(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(k.cyl(0.36, 0.4, 0.12, st[1], 8), k.cyl(0.14, 0.26, 0.95, '#7d6aa8', 8, 0, 0.12), k.cyl(0.22, 0.14, 0.1, st[0], 8, 0, 1.07), k.tor(0.25, 0.025, GOLD, 0, 0.7));
    p.crystal = k.oct(0.17, col, 0, 1.4, 0, k.glow(col)); g.add(p.crystal);
    return { g, p, top: 1.65 };
  },
  flak(k, col, st) {
    const g = new k.THREE.Group(), turret = new k.THREE.Group(), p = {};
    g.add(k.cyl(0.4, 0.42, 0.14, st[1], 8), k.cyl(0.3, 0.34, 0.26, st[0], 8, 0, 0.14));
    for (const z of [-0.1, 0.1]) { const b = k.cyl(0.05, 0.07, 0.55, col, 8, 0, 0, z); b.rotation.z = -1.0; b.position.set(0.18, 0.7, z); turret.add(b); (p.barrels ||= []).push(b); }
    turret.add(k.box(0.22, 0.14, 0.34, '#555a66', 0, 0.42, 0)); g.add(turret);
    return { g, turret, p, top: 0.95 };
  },
  mint(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(k.box(0.78, 0.1, 0.78, st[1]), k.box(0.62, 0.42, 0.62, st[0], 0, 0.1), k.cone(0.5, 0.32, GOLD, 4, 0, 0.52).rotateY(Math.PI / 4));
    p.coin = k.cyl(0.14, 0.14, 0.03, '#ffd45a', 14, 0, 0.98, 0); p.coin.rotation.x = Math.PI / 2; p.coin.material = k.M('#ffd45a', k.glow('#a07a10')); g.add(p.coin);
    return { g, p, top: 1.2 };
  },
  barracks(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(k.box(0.8, 0.1, 0.8, st[1]), k.box(0.66, 0.38, 0.66, st[0], 0, 0.1), k.cone(0.55, 0.36, col, 4, 0, 0.48).rotateY(Math.PI / 4), k.box(0.16, 0.24, 0.04, '#3a2a22', 0.0, 0.1, 0.34));
    g.add(k.cyl(0.015, 0.015, 0.5, '#3a2a22', 5, 0.28, 0.6, -0.2)); p.flag = k.box(0.2, 0.12, 0.01, col, 0.38, 0.98, -0.2); g.add(p.flag);
    return { g, p, top: 1.1 };
  },
  ballista(k, col, st) {
    const g = new k.THREE.Group(), turret = new k.THREE.Group(), p = {};
    g.add(k.cyl(0.4, 0.42, 0.14, st[1], 8), k.cyl(0.3, 0.34, 0.3, st[0], 8, 0, 0.14));
    p.bolt = k.box(0.7, 0.04, 0.04, '#5e3a1a', 0.1, 0.62, 0);
    turret.add(p.bolt, k.box(0.06, 0.05, 0.62, WOOD, 0.26, 0.62, 0), k.box(0.1, 0.12, 0.12, '#6d5a48', 0, 0.58, 0), k.cone(0.05, 0.12, STEEL, 4, 0.5, 0.57).rotateZ(-Math.PI / 2));
    g.add(turret);
    return { g, turret, p, top: 0.85 };
  },
  catapult(k, col, st) {
    const g = new k.THREE.Group(), turret = new k.THREE.Group(), p = {};
    g.add(k.box(0.8, 0.12, 0.7, st[1]), k.box(0.7, 0.14, 0.12, WOOD, 0, 0.12, -0.26), k.box(0.7, 0.14, 0.12, WOOD, 0, 0.12, 0.26));
    for (const z of [-0.26, 0.26]) g.add(k.box(0.08, 0.42, 0.08, WOOD, 0, 0.12, z));
    p.arm = new k.THREE.Group(); p.arm.position.set(0, 0.5, 0);
    p.arm.add(k.box(0.78, 0.07, 0.07, WOOD, 0.08, 0, 0), k.cyl(0.11, 0.08, 0.1, '#6d5a48', 8, 0.46, 0.0));
    turret.add(p.arm); g.add(turret);
    return { g, turret, p, top: 0.95 };
  },
  artillery(k, col, st) {
    const g = new k.THREE.Group(), turret = new k.THREE.Group(), p = {};
    g.add(k.cyl(0.42, 0.45, 0.16, st[1], 10), k.cyl(0.34, 0.38, 0.22, st[0], 10, 0, 0.16));
    p.barrel = k.cyl(0.13, 0.17, 0.78, col, 10); p.barrel.rotation.z = -1.1; p.barrel.position.set(0.2, 0.68, 0);
    turret.add(p.barrel, k.sph(0.22, '#555a66', 0, 0.5, 0)); g.add(turret);
    return { g, turret, p, top: 1.05 };
  },
  tesla(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(k.cyl(0.38, 0.4, 0.12, st[1], 8), k.cyl(0.1, 0.22, 0.9, '#6d7a8c', 8, 0, 0.12));
    for (let i = 0; i < 3; i++) g.add(k.tor(0.2 - i * 0.03, 0.03, '#c9a35a', 0, 0.3 + i * 0.25));
    p.orb = k.sph(0.17, col, 0, 1.2, 0, k.glow(col)); g.add(p.orb);
    return { g, p, top: 1.4 };
  },
  frost(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(k.cyl(0.38, 0.4, 0.12, st[1], 7), k.cone(0.26, 0.9, '#bfeaff', 5, 0, 0.12), k.cone(0.15, 0.55, '#9ad8ff', 5, 0.24, 0.12), k.cone(0.12, 0.45, '#9ad8ff', 5, -0.22, 0.12, 0.1));
    p.core = k.oct(0.1, '#e8fbff', 0, 0.6, 0, k.glow('#7fd3f2')); g.add(p.core);
    return { g, p, top: 1.1 };
  },
  obelisk(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(k.cyl(0.4, 0.42, 0.12, st[1], 8), k.cyl(0.12, 0.26, 1.15, '#e0c06a', 4, 0, 0.12).rotateY(Math.PI / 4), k.cone(0.13, 0.2, GOLD, 4, 0, 1.27).rotateY(Math.PI / 4));
    p.sun = k.sph(0.15, '#fff2b0', 0, 1.75, 0, k.glow('#ffd45a')); g.add(p.sun);
    return { g, p, top: 1.95 };
  },
  venom(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(k.cyl(0.38, 0.4, 0.12, st[1], 8), k.cyl(0.13, 0.2, 0.5, '#5f7a4a', 8, 0, 0.12));
    p.flask = k.sph(0.28, col, 0, 0.8, 0, { transparent: true, opacity: 0.85, ...k.glow('#4a8a20') }); g.add(p.flask, k.cyl(0.08, 0.1, 0.22, '#5f7a4a', 8, 0, 1.0));
    return { g, p, top: 1.3 };
  },
  sanctum(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(k.cyl(0.42, 0.44, 0.12, st[1], 10));
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.add(k.cyl(0.05, 0.06, 0.5, '#f1ead2', 8, Math.cos(a) * 0.27, 0.12, Math.sin(a) * 0.27)); }
    g.add(k.sph(0.34, col, 0, 0.64, 0, {}), k.cone(0.04, 0.2, GOLD, 6, 0, 0.95));
    g.children[g.children.length - 2].scale.y = 0.65;
    p.glow = k.sph(0.1, '#fff2b0', 0, 0.38, 0, k.glow('#ffe08a')); g.add(p.glow);
    return { g, p, top: 1.2 };
  },
  gatling(k, col, st) {
    const g = new k.THREE.Group(), turret = new k.THREE.Group(), p = {};
    g.add(k.cyl(0.38, 0.4, 0.14, st[1], 8), k.cyl(0.26, 0.3, 0.3, st[0], 8, 0, 0.14));
    p.spin = new k.THREE.Group(); p.spin.position.set(0.18, 0.62, 0);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, b = k.cyl(0.04, 0.04, 0.55, col, 6, 0, 0, 0); b.rotation.z = -Math.PI / 2; b.position.set(0.1, Math.cos(a) * 0.08, Math.sin(a) * 0.08); p.spin.add(b); }
    turret.add(p.spin, k.box(0.22, 0.2, 0.26, '#555a66', 0, 0.58, 0)); g.add(turret);
    return { g, turret, p, top: 0.9 };
  },
  voidwell(k, col, st) {
    const g = new k.THREE.Group(), p = {};
    g.add(k.cyl(0.42, 0.45, 0.12, st[1], 12), k.tor(0.3, 0.09, '#3a2f55', 0, 0.16));
    p.vortex = k.cyl(0.26, 0.26, 0.02, '#8a5ad8', 16, 0, 0.18); p.vortex.material = k.M('#8a5ad8', k.glow('#6a3fc4')); g.add(p.vortex);
    p.mote = k.oct(0.08, '#d9c2ff', 0, 0.7, 0, k.glow('#b79bff')); g.add(p.mote);
    return { g, p, top: 0.9 };
  },
  trebuchet(k, col, st) {
    const g = new k.THREE.Group(), turret = new k.THREE.Group(), p = {};
    g.add(k.box(0.84, 0.12, 0.56, st[1]));
    for (const z of [-0.2, 0.2]) { const l1 = k.box(0.07, 0.95, 0.07, WOOD, 0.14, 0.1, z); l1.rotation.z = 0.25; const l2 = k.box(0.07, 0.95, 0.07, WOOD, -0.14, 0.1, z); l2.rotation.z = -0.25; turret.add(l1, l2); }
    p.arm = new k.THREE.Group(); p.arm.position.set(0, 0.95, 0);
    p.arm.add(k.box(1.1, 0.07, 0.07, '#6d4a2a', -0.2, 0, 0), k.box(0.18, 0.18, 0.18, '#555a66', -0.72, -0.1, 0), k.box(0.14, 0.05, 0.14, WOOD, 0.36, 0.0, 0));
    turret.add(p.arm); g.add(turret);
    return { g, turret, p, top: 1.4 };
  },
};

// What a tower does on every frame: aim, recoil, spin, glow.
const TICK = {
  archer: (m, t, T, rec) => { m.p.bow.position.x = 0.3 - rec * 0.05; },
  cannon: (m, t, T, rec) => { m.p.barrel.position.x = 0.2 - rec * 0.14; m.p.muzzle.position.x = 0.52 - rec * 0.14; },
  mage: (m, t, T) => { m.p.crystal.position.y = 1.4 + Math.sin(T * 3 + t.cx) * 0.06; m.p.crystal.rotation.y = T * 1.4; },
  flak: (m, t, T, rec) => { for (const b of m.p.barrels) b.position.x = 0.18 - rec * 0.06; },
  mint: (m, t, T) => { m.p.coin.rotation.z = T * 2; m.p.coin.position.y = 0.98 + Math.sin(T * 2) * 0.03; },
  barracks: (m, t, T) => { m.p.flag.rotation.y = Math.sin(T * 4 + t.cx) * 0.25; },
  ballista: (m, t, T, rec) => { m.p.bolt.position.x = 0.1 - rec * 0.12; },
  catapult: (m, t, T, rec) => { m.p.arm.rotation.z = -rec * 1.1 + 0.2; },
  artillery: (m, t, T, rec) => { m.p.barrel.position.x = 0.2 - rec * 0.1; },
  tesla: (m, t, T, rec) => { const s = 1 + 0.12 * Math.sin(T * 9 + t.cx) + rec * 0.4; m.p.orb.scale.setScalar(s); },
  frost: (m, t, T) => { m.p.core.rotation.y = T * 1.5; m.p.core.position.y = 0.6 + Math.sin(T * 2) * 0.05; },
  obelisk: (m, t, T) => { m.p.sun.position.y = 1.75 + Math.sin(T * 2) * 0.05; m.p.sun.scale.setScalar(1 + 0.1 * Math.sin(T * 4)); },
  venom: (m, t, T) => { m.p.flask.scale.y = 1 + 0.05 * Math.sin(T * 3); },
  sanctum: (m, t, T) => { m.p.glow.scale.setScalar(1 + 0.25 * Math.sin(T * 2.5 + t.cx)); },
  gatling: (m, t, T, rec) => { m.p.spin.rotation.x = T * (2 + rec * 20) + (m.spin = (m.spin || 0) + rec * 0.4); },
  voidwell: (m, t, T) => { m.p.vortex.rotation.y = T * 2; m.p.mote.position.y = 0.7 + Math.sin(T * 2.4) * 0.08; m.p.mote.rotation.y = T * 3; },
  trebuchet: (m, t, T, rec) => { m.p.arm.rotation.z = -rec * 1.3 + 0.35; },
};

export function buildTowerModel(kit, type, skinColors, tint) {
  const THREE = kit.THREE, def = TOWERS[type], build = B[type];
  if (!build) return null;
  const root = new THREE.Group(), m = build(kit, def.color, skinColors);
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
  g.add(kit.box(2.5, 0.06, 1.1, '#a79f8e', 0, 0, 0.45));                                  // courtyard slab
  g.add(kit.box(2.1, 0.62, 0.5, W2, 0, 0.06, -0.12));                                     // curtain wall
  for (let i = -5; i <= 5; i++) g.add(kit.box(0.14, 0.12, 0.5, W2, i * 0.2, 0.68, -0.12));   // battlements
  g.add(kit.box(1.0, 1.15, 0.8, W, 0, 0.06, 0.0));                                        // gatehouse
  for (let i = -2; i <= 2; i++) g.add(kit.box(0.14, 0.14, 0.8, W, i * 0.22, 1.21, 0.0));
  g.add(kit.box(0.34, 0.5, 0.06, '#2a1c14', 0, 0.06, 0.41));                              // gate
  g.add(kit.cyl(0.17, 0.17, 0.06, '#2a1c14', 10, 0, 0.56, 0.41).rotateX(Math.PI / 2));
  for (const sx of [-1, 1]) {
    g.add(kit.cyl(0.36, 0.4, 1.45, W, 10, sx * 0.95, 0.0, 0.0), kit.cone(0.46, 0.55, R, 10, sx * 0.95, 1.45, 0.0));
    g.add(kit.box(0.08, 0.16, 0.03, '#2a2f4f', sx * 0.95, 0.9, 0.37));
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
  return { g, p };
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
