// Low-poly 3D models for foes, bosses, barracks soldiers and garrison troops (see render3d.js).
// Every model is built facing +x with its feet on y = 0 and about 1.8 units tall; the renderer scales it by the unit's size and turns it
// to its heading. `animate(u, st)` poses it from a small state { ph walk phase, t time, moving, attack, swing, hit }.
import { TROOPS } from '../data/balance.js';

const SKIN = '#f2d1a8', DARK = '#2b2d36', STEEL = '#aab1c0', WOOD = '#7a5130', GOLD = '#e2b04a';
const HELM = ['#8a5a32', '#9aa1b0', '#7d8394', '#c9a24b', '#5b5f6b', '#2f3240'];

function shadeHex(hex, f) {   // f > 0 lightens, f < 0 darkens
  const n = parseInt(hex.slice(1), 16), ch = (v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('');
}

export function makeUnits(k) {
  const T = k.THREE;
  const grp = (x = 0, y = 0, z = 0) => { const g = new T.Group(); g.position.set(x, y, z); return g; };
  const hang = (r, len, c, seg = 6) => k.cyl(r, r * 0.85, len, c, seg, 0, -len, 0);          // a limb hanging from its pivot

  // ---------- weapons: held upright in the right hand, blade towards +y ----------
  function weapon(kind, col = STEEL) {
    const w = grp();
    switch (kind) {
      case 'club': w.add(k.cyl(0.03, 0.04, 0.5, WOOD, 6), k.cyl(0.11, 0.07, 0.3, '#8a5a32', 7, 0, 0.5)); break;
      case 'sword': w.add(k.box(0.06, 0.62, 0.03, col, 0, 0.1), k.box(0.06, 0.04, 0.2, GOLD, 0, 0.1), k.cyl(0.025, 0.025, 0.14, WOOD, 5, 0, -0.04)); break;
      case 'axe': w.add(k.cyl(0.03, 0.03, 0.8, WOOD, 5, 0, -0.1), k.box(0.05, 0.28, 0.3, col, 0, 0.5, 0.12)); break;
      case 'halberd': case 'glaive': w.add(k.cyl(0.03, 0.03, 1.0, WOOD, 5, 0, -0.1), k.cone(0.07, 0.3, col, 4, 0, 0.9), k.box(0.04, 0.2, 0.2, col, 0, 0.78, 0.1)); break;
      case 'pike': w.add(k.cyl(0.025, 0.025, 1.5, WOOD, 5, 0, -0.2), k.cone(0.06, 0.28, STEEL, 4, 0, 1.28)); break;
      case 'flail': w.add(k.cyl(0.03, 0.03, 0.4, WOOD, 5), k.sph(0.12, '#6b7080', 0.1, 0.55, 0)); break;
      case 'mace': w.add(k.cyl(0.03, 0.03, 0.5, WOOD, 5), k.sph(0.1, GOLD, 0, 0.55, 0)); break;
      case 'hammer': w.add(k.cyl(0.03, 0.03, 0.55, WOOD, 5), k.box(0.12, 0.12, 0.22, '#8a8f9c', 0, 0.55)); break;
      case 'staff': w.add(k.cyl(0.03, 0.03, 1.3, WOOD, 5, 0, -0.3), k.sph(0.1, col, 0, 1.08, 0, k.glow(col))); break;
      case 'lance': w.add(k.cyl(0.03, 0.03, 1.4, WOOD, 5, 0, -0.2), k.cone(0.06, 0.28, STEEL, 4, 0, 1.2)); break;
      default: return null;
    }
    return w;
  }
  const bow = (col = '#5a3a1a') => { const b = k.tor(0.3, 0.025, col, 0, 0, 0); b.rotation.set(0, 0, 0); b.scale.set(0.45, 1, 1); const g = grp(); b.rotation.x = 0; g.add(b); return g; };

  // ---------- the person-shaped body ----------
  // o: col (tunic), skin, boot, bulk, hunch, helm (0..5 | 'hood' | 'horns' | 'crown' | 'skull' | 'pot' | 'cap' | 'hat'), weapon, shield, cape, quiver, keg,
  //    sack, banner, robe, ghost, ears, belly, bow, lean
  function humanoid(o) {
    const root = grp(), body = grp(), u = { root, body, legs: [], arms: [], tag: 'human' };
    const bk = o.bulk || 1, col = o.col, skin = o.skin || SKIN, boot = o.boot || '#3a2a22';
    root.add(body);
    // legs / robe hem
    if (o.robe || o.ghost) {
      const hem = k.cone(0.46 * bk, 1.05, o.robe || col, 9, 0, 0.0);      // a robe that widens towards the ground
      body.add(hem);
      u.hem = hem;
    } else {
      for (const z of [-0.13, 0.13]) {
        const leg = grp(0, 0.8, z * bk); leg.add(hang(0.085 * bk, 0.58, o.pants || shadeHex(col, -0.3)), k.cyl(0.075 * bk, 0.07 * bk, 0.24, boot, 6, 0, -0.8, 0), k.box(0.2, 0.1, 0.13, boot, 0.05, -0.8, 0));
        body.add(leg); u.legs.push(leg);
      }
    }
    const hy = o.robe || o.ghost ? 0.95 : 0.8;
    // torso
    const torso = grp(0, 0, 0); body.add(torso); u.torso = torso;
    torso.add(k.box(0.34 * bk, 0.62, 0.52 * bk, col, 0, hy));
    if (o.belly) torso.add(k.sph(0.3 * bk, col, 0.08, hy + 0.2, 0));
    torso.add(k.box(0.36 * bk, 0.07, 0.54 * bk, o.belt || '#4a3626', 0, hy + 0.02));
    if (o.hunch) torso.rotation.z = o.hunch;
    // head
    const head = grp(0.02, hy + 0.9, 0); u.head = head; torso.add(head);
    head.add(k.sph(0.2 * (o.headScale || 1), o.faceCol || skin, 0, 0, 0));
    for (const z of [-0.07, 0.07]) head.add(k.sph(0.035, o.eye || '#111', 0.17, 0.03, z, o.eyeGlow ? k.glow(o.eyeGlow) : {}));
    const h = o.helm;
    if (typeof h === 'number') { const hc = HELM[h]; head.add(k.cyl(0.215, 0.225, 0.16, hc, 9, 0, 0.02)); head.add(k.cone(0.2, 0.1, hc, 9, 0, 0.18)); if (h >= 3) head.add(k.box(0.04, 0.2, 0.06, '#c0392b', 0, 0.2, 0)); if (h >= 1) head.add(k.box(0.05, 0.14, 0.04, hc, 0.2, -0.04, 0)); }
    else if (h === 'pot') { head.add(k.cyl(0.22, 0.22, 0.15, '#8a8f9c', 9, 0, 0.0), k.sph(0.2, '#8a8f9c', 0, 0.1, 0)); }
    else if (h === 'hood') { head.add(k.cone(0.3, 0.4, o.hood || shadeHex(col, -0.2), 8, -0.03, 0.02)); }
    else if (h === 'cap') head.add(k.cyl(0.22, 0.22, 0.1, o.hood || col, 8, 0, 0.1), k.box(0.18, 0.04, 0.3, o.hood || col, 0.14, 0.1, 0));
    else if (h === 'hat') head.add(k.cyl(0.32, 0.32, 0.03, '#3a2160', 10, 0, 0.12), k.cone(0.2, 0.55, '#3a2160', 8, 0, 0.14));
    else if (h === 'horns') { head.add(k.cyl(0.22, 0.23, 0.14, '#5b5f6b', 9, 0, 0.04)); for (const z of [-1, 1]) { const hn = k.cone(0.06, 0.3, '#e8e0c8', 6, 0, 0.1, z * 0.2); hn.rotation.x = z * -0.5; head.add(hn); } }
    else if (h === 'crown') { head.add(k.cyl(0.2, 0.22, 0.1, GOLD, 8, 0, 0.12)); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; head.add(k.cone(0.04, 0.12, GOLD, 4, Math.cos(a) * 0.17, 0.2, Math.sin(a) * 0.17)); } }
    else if (h === 'skull') { head.children[0].material = k.M('#e8e4d6'); }
    if (o.ears) for (const z of [-1, 1]) { const e = k.cone(0.06, 0.2, skin, 4, -0.02, 0.0, z * 0.2); e.rotation.x = z * -1.2; head.add(e); }
    // arms
    for (const z of [-1, 1]) {
      const arm = grp(0, hy + 0.55, z * 0.33 * bk); arm.add(hang(0.065 * bk, 0.5, o.sleeve || col), k.sph(0.07 * bk, skin, 0, -0.5, 0));
      torso.add(arm); u.arms.push(arm);
    }
    const handR = grp(0, -0.5, 0); u.arms[1].add(handR); u.handR = handR; u.armR = u.arms[1]; u.armL = u.arms[0];
    const wp = weapon(o.weapon, o.weaponCol); if (wp) { wp.rotation.z = 0; handR.add(wp); u.weapon = wp; }
    if (o.bow) { const b = bow(); b.position.set(0.12, -0.05, 0); u.armL.add(b); b.position.y = -0.5; u.bow = b; }
    if (o.shield) { const sh = k.box(0.06, o.shield === 'big' ? 0.7 : 0.5, o.shield === 'big' ? 0.5 : 0.4, o.shieldCol || '#8b95a8', 0.14, -0.4, 0); sh.add(k.sph(0.07, GOLD, 0.04, 0, 0)); u.armL.add(sh); }
    // back gear
    if (o.cape) { const c = k.box(0.04, 0.9, 0.5 * bk, o.cape, -0.2, hy - 0.2); c.rotation.z = 0.12; torso.add(c); u.cape = c; }
    if (o.quiver) { const q = k.cyl(0.07, 0.06, 0.5, '#7a5130', 6, -0.2, hy + 0.1, 0.12); q.rotation.z = 0.4; torso.add(q); for (const dz of [-0.03, 0.03]) torso.add(k.cyl(0.012, 0.012, 0.14, '#d9dde6', 4, -0.28, hy + 0.62, 0.12 + dz)); }
    if (o.keg) { const g = k.cyl(0.17, 0.17, 0.34, '#7a4a22', 8, -0.28, hy + 0.1, 0); torso.add(g, k.cyl(0.175, 0.175, 0.03, '#4a4f5c', 8, -0.28, hy + 0.2, 0)); u.fuse = k.sph(0.05, '#ffd25e', -0.28, hy + 0.5, 0, k.glow('#ff9a3a')); torso.add(u.fuse); }
    if (o.sack) torso.add(k.sph(0.2, '#c9a66b', -0.26, hy + 0.15, 0), k.sph(0.05, GOLD, -0.26, hy + 0.36, 0, k.glow('#a07a10')));
    if (o.banner) { torso.add(k.cyl(0.02, 0.02, 1.7, WOOD, 5, -0.3, hy - 0.2, 0)); const f = k.box(0.02, 0.4, 0.55, '#d9473b', -0.3, hy + 1.1, -0.28); torso.add(f); u.flag = f; }
    if (o.cross) torso.add(k.box(0.02, 0.28, 0.07, '#fff', 0.18, hy + 0.3, 0), k.box(0.02, 0.07, 0.24, '#fff', 0.18, hy + 0.32, 0));
    if (o.orb) { u.orb = k.sph(0.13, o.orb, 0, 0, 0, k.glow(o.orb)); u.orb.position.set(0.3, hy + 0.9, 0); torso.add(u.orb); }
    return u;
  }

  // ---------- big brutes: trolls and ogres ----------
  function brute(col, o = {}) {
    return humanoid({ col, skin: o.skin || col, bulk: 1.45, hunch: -0.18, belly: true, weapon: 'club', ears: true, helm: o.helm, sleeve: col, pants: shadeHex(col, -0.35), headScale: 1.05, eye: '#f2b33d', ...o });
  }

  // ---------- golem / titan ----------
  function golem(col, boss) {
    const root = grp(), body = grp(), u = { root, body, legs: [], arms: [], tag: 'golem' };
    root.add(body);
    const dk = shadeHex(col, -0.25), lt = shadeHex(col, 0.15);
    for (const z of [-0.22, 0.22]) { const leg = grp(0, 0.7, z); leg.add(k.box(0.3, 0.7, 0.3, dk, 0, -0.7), k.box(0.4, 0.12, 0.38, col, 0.05, -0.76)); body.add(leg); u.legs.push(leg); }
    const torso = grp(); body.add(torso); u.torso = torso;
    torso.add(k.box(0.7, 0.8, 0.9, col, 0, 0.7), k.box(0.5, 0.35, 0.7, lt, 0.1, 1.35), k.box(0.2, 0.3, 0.2, '#6fe3ff', 0.34, 0.85, 0));
    torso.children[2].material = k.M('#6fe3ff', k.glow('#3fb0d0'));
    const head = grp(0.15, 1.75, 0); head.add(k.box(0.35, 0.3, 0.34, col, 0, 0), k.box(0.04, 0.06, 0.24, '#ffd25e', 0.18, 0.02, 0)); head.children[1].material = k.M('#ffd25e', k.glow('#ffb020')); torso.add(head); u.head = head;
    for (const z of [-1, 1]) { const arm = grp(0, 1.4, z * 0.58); arm.add(k.box(0.3, 0.75, 0.3, dk, 0, -0.4), k.box(0.4, 0.4, 0.42, col, 0.05, -0.85), k.box(0.32, 0.3, 0.32, lt, 0, 0.05)); torso.add(arm); u.arms.push(arm); }
    u.armR = u.arms[1]; u.armL = u.arms[0];
    if (boss) { for (let i = 0; i < 4; i++) { const sp = k.cone(0.1, 0.5, '#6fe3ff', 5, -0.2, 1.4, -0.3 + i * 0.2); sp.rotation.z = 0.5; sp.material = k.M('#6fe3ff', k.glow('#3fb0d0')); torso.add(sp); } torso.add(k.box(0.5, 0.15, 1.2, lt, 0, 1.55)); }
    return u;
  }

  // ---------- four-legged things ----------
  function quad(o) {
    const root = grp(), body = grp(), u = { root, body, legs: [], arms: [], tag: 'quad' };
    root.add(body);
    const col = o.col, lg = o.legCol || shadeHex(col, -0.3), L = o.len || 1.1, H = o.h || 0.55;
    body.add(k.box(L, 0.5, 0.5, col, 0, H));
    const neck = k.box(0.3, 0.55, 0.28, col, L * 0.45, H + 0.3); neck.rotation.z = -0.5; body.add(neck);
    const head = grp(L * 0.62, H + 0.65, 0); head.add(k.box(0.4, 0.22, 0.22, col, 0.1, 0), k.box(0.12, 0.16, 0.2, shadeHex(col, -0.2), 0.34, -0.04)); head.add(k.cone(0.05, 0.14, col, 4, 0, 0.17, 0.07), k.cone(0.05, 0.14, col, 4, 0, 0.17, -0.07)); body.add(head); u.head = head;
    if (o.mane) body.add(k.box(0.5, 0.1, 0.12, o.mane, L * 0.32, H + 0.58));
    for (const [x, z] of [[L * 0.38, 0.16], [L * 0.38, -0.16], [-L * 0.38, 0.16], [-L * 0.38, -0.16]]) { const leg = grp(x, H, z); leg.add(hang(0.07, H, lg, 6), k.box(0.14, 0.07, 0.12, '#2a2a2a', 0.02, -H)); body.add(leg); u.legs.push(leg); }
    const tail = k.cone(0.07, 0.5, o.mane || shadeHex(col, -0.3), 5, -L * 0.5, H + 0.1); tail.rotation.z = 1.9; body.add(tail); u.tail = tail;
    u.seatY = H + 0.28;
    return u;
  }

  function mount(rider, horseCol, o = {}) {
    const h = quad({ col: horseCol, mane: o.mane || '#3a2a22', len: 1.15 });
    rider.root.position.set(0.0, h.seatY, 0); rider.root.scale.setScalar(0.62);
    if (rider.legs.length) for (const l of rider.legs) { l.rotation.z = 0.9; }
    h.root.add(rider.root); h.rider = rider; h.legsLocked = true;
    return h;
  }

  function ram() {
    const root = grp(), body = grp(), u = { root, body, legs: [], arms: [], tag: 'ram' };
    root.add(body);
    for (let i = 0; i < 4; i++) { const leg = grp(-0.55 + i * 0.4, 0.5, (i % 2 ? 1 : -1) * 0.32); leg.add(hang(0.08, 0.5, '#4a3626', 6), k.box(0.16, 0.07, 0.14, '#3a2a22', 0.03, -0.5)); body.add(leg); u.legs.push(leg); }
    const log = k.cyl(0.17, 0.17, 1.8, '#6b4a2a', 8, 0, 0, 0); log.rotation.z = Math.PI / 2; log.position.set(0.3, 0.62, 0); body.add(log); u.log = log;
    body.add(k.cone(0.2, 0.3, '#9aa1b0', 8, 1.28, 0.62, 0).rotateZ(-Math.PI / 2));
    body.children[body.children.length - 1].position.set(1.3, 0.62, 0);
    const roof = k.box(1.5, 0.08, 0.9, '#7a5130', 0, 0.98); roof.rotation.x = 0; body.add(roof, k.box(1.5, 0.12, 0.08, '#5a3a1a', 0, 0.92, 0.44), k.box(1.5, 0.12, 0.08, '#5a3a1a', 0, 0.92, -0.44));
    for (const x of [-0.6, 0.6]) for (const z of [-0.4, 0.4]) body.add(k.cyl(0.04, 0.04, 0.42, '#5a3a1a', 5, x, 0.55, z));
    return u;
  }

  function spider(col, big) {
    const root = grp(), body = grp(), u = { root, body, legs: [], arms: [], tag: 'spider' };
    root.add(body);
    body.add(k.sph(0.38, col, 0.25, 0.45, 0), k.sph(0.5, shadeHex(col, -0.2), -0.35, 0.55, 0));
    for (const z of [-0.12, 0.12]) body.add(k.sph(0.07, '#ffdd55', 0.58, 0.52, z, k.glow('#ffaa00')));
    if (big) for (let i = 0; i < 4; i++) body.add(k.sph(0.09, '#e8e0c8', -0.5 + i * 0.1, 0.95, (i - 1.5) * 0.14));
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1, row = i >> 1, leg = grp(0.25 - row * 0.2, 0.45, 0);
      const up = k.cyl(0.03, 0.03, 0.55, shadeHex(col, -0.3), 5, 0, 0, 0); up.rotation.x = side * 1.0; up.position.set(0, 0.15, side * 0.25);
      const lo = k.cyl(0.025, 0.02, 0.6, shadeHex(col, -0.3), 5, 0, 0, 0); lo.rotation.x = side * 0.15; lo.position.set(0, -0.1, side * 0.55);
      leg.add(up, lo); leg.userData = { side, row }; body.add(leg); u.legs.push(leg);
    }
    return u;
  }

  function mole(col) {
    const root = grp(), body = grp(), u = { root, body, legs: [], arms: [], tag: 'mole' };
    root.add(body);
    const b = k.sph(0.5, col, 0, 0.5, 0); b.scale.set(1.2, 0.9, 0.9); body.add(b);
    const snout = k.cone(0.13, 0.4, '#e8a0a0', 6, 0.7, 0.5, 0); snout.rotation.z = -Math.PI / 2; snout.position.set(0.8, 0.45, 0); body.add(snout, k.sph(0.06, '#e8a0a0', 1.0, 0.45, 0));
    for (const z of [-0.08, 0.08]) body.add(k.sph(0.03, '#111', 0.62, 0.7, z));
    for (const z of [-1, 1]) { const arm = grp(0.4, 0.4, z * 0.42); arm.add(k.box(0.3, 0.1, 0.2, shadeHex(col, -0.2), 0.12, -0.05), k.cone(0.03, 0.2, '#e8e0c8', 4, 0.32, -0.05, -0.06), k.cone(0.03, 0.2, '#e8e0c8', 4, 0.32, -0.05, 0.06)); arm.children[1].rotation.z = -Math.PI / 2; arm.children[2].rotation.z = -Math.PI / 2; body.add(arm); u.arms.push(arm); }
    for (const z of [-0.28, 0.28]) { const leg = grp(-0.3, 0.2, z); leg.add(k.box(0.22, 0.2, 0.14, shadeHex(col, -0.2), 0, -0.1)); body.add(leg); u.legs.push(leg); }
    return u;
  }

  // ---------- flyers ----------
  function flyer(col, o = {}) {
    const root = grp(), body = grp(), u = { root, body, legs: [], arms: [], wings: [], tag: 'flyer' };
    root.add(body);
    const bs = o.boss ? 1.6 : 1, belly = o.belly || shadeHex(col, 0.25);
    const bod = k.sph(0.4 * bs, col, 0, 0.8, 0); bod.scale.set(1.5, 0.8, 0.8); body.add(bod);
    const neck = k.cyl(0.1 * bs, 0.14 * bs, 0.5 * bs, col, 6, 0.5 * bs, 0.85, 0); neck.rotation.z = -0.9; body.add(neck);
    const head = grp(0.78 * bs, 1.15 * bs + (o.boss ? -0.1 : 0), 0); head.add(k.box(0.34 * bs, 0.2 * bs, 0.22 * bs, col, 0.04, 0), k.box(0.2 * bs, 0.1 * bs, 0.18 * bs, belly, 0.26 * bs, -0.04)); for (const z of [-0.07, 0.07]) head.add(k.sph(0.035 * bs, '#ffd25e', 0.12, 0.06, z, k.glow('#ffaa20')));
    for (const z of [-1, 1]) { const hn = k.cone(0.04 * bs, 0.25 * bs, '#e8e0c8', 4, -0.05, 0.08, z * 0.08); hn.rotation.z = 0.7; head.add(hn); }
    body.add(head); u.head = head;
    const tail = k.cone(0.14 * bs, 0.9 * bs, col, 6, -0.9 * bs, 0.8); tail.rotation.z = Math.PI / 2 + 0.2; tail.position.set(-0.95 * bs, 0.75, 0); body.add(tail); u.tail = tail;
    for (const z of [-1, 1]) {
      const wing = grp(0, 1.0, z * 0.2);
      const m1 = k.box(0.6 * bs, 0.03, 0.8 * bs, o.wing || shadeHex(col, -0.1), -0.05, 0, z * 0.45 * bs), m2 = k.box(0.35 * bs, 0.03, 0.55 * bs, o.wing || shadeHex(col, -0.1), -0.3 * bs, 0, z * 1.0 * bs);
      m1.material = m2.material = k.M(o.wing || shadeHex(col, -0.1), { side: T.DoubleSide });
      wing.add(m1, m2, k.cyl(0.03, 0.03, 1.4 * bs, '#4a3a2a', 4, 0, 0, z * 0.7 * bs)); wing.children[2].rotation.x = Math.PI / 2; wing.children[2].position.set(0.3 * bs, 0, z * 0.7 * bs);
      body.add(wing); u.wings.push(wing); wing.userData.side = z;
    }
    if (o.boss) { u.glow = k.sph(0.12, '#ffb020', 1.2 * bs, 1.1, 0, k.glow('#ff7a20')); body.add(u.glow); }
    u.fly = true;
    return u;
  }

  function harpy(col) {
    const u = flyer(col, { wing: '#8a5a2a', belly: '#e8c39a' });
    u.root.scale.setScalar(0.8); return u;
  }

  function wraith(col) {
    const u = humanoid({ col, ghost: true, robe: shadeHex(col, -0.1), skin: '#dfeaf5', helm: 'hood', hood: shadeHex(col, -0.3), eye: '#bff', eyeGlow: '#7fd6ff', weapon: 'none', sleeve: shadeHex(col, -0.1) });
    u.ghost = true; return u;
  }

  function hydra(col) {
    const root = grp(), body = grp(), u = { root, body, legs: [], arms: [], necks: [], tag: 'hydra' };
    root.add(body);
    const b = k.sph(0.8, col, 0, 0.7, 0); b.scale.set(1.3, 0.8, 1.0); body.add(b);
    for (const [x, z] of [[0.5, 0.45], [0.5, -0.45], [-0.5, 0.45], [-0.5, -0.45]]) body.add(k.cyl(0.14, 0.17, 0.5, shadeHex(col, -0.25), 6, x, 0, z));
    const tl = k.cone(0.2, 1.0, shadeHex(col, -0.15), 6, -1.1, 0.5); tl.rotation.z = Math.PI / 2 + 0.3; tl.position.set(-1.2, 0.5, 0); body.add(tl);
    [-0.45, 0, 0.45].forEach((z, i) => {
      const neck = grp(0.55, 1.0, z); const segs = [];
      for (let s = 0; s < 4; s++) { const seg = k.sph(0.17 - s * 0.012, col, 0, 0.0, 0); seg.position.set(s * 0.1, s * 0.28, 0); neck.add(seg); segs.push(seg); }
      const hd = grp(0.45, 1.2, 0); hd.add(k.box(0.36, 0.2, 0.22, col, 0.05, 0), k.box(0.2, 0.1, 0.2, shadeHex(col, 0.2), 0.24, -0.04), k.sph(0.04, '#ffd25e', 0.1, 0.07, 0.09, k.glow('#ffaa20')), k.sph(0.04, '#ffd25e', 0.1, 0.07, -0.09, k.glow('#ffaa20')));
      neck.add(hd); body.add(neck); u.necks.push({ neck, segs, hd, phase: i * 2.1 });
    });
    return u;
  }

  function griffon(col) {
    const h = quad({ col: '#c79a4a', len: 1.0, mane: '#f2e6c4' });
    const f = flyer('#c79a4a', { wing: '#e8d7a8', belly: '#f2e6c4' });
    // griffon = a flyer body; the rider sits on top
    return f;
  }

  // ---------- catalogue ----------
  function enemy(e) {
    const type = e.boss ? 'boss_' + e.boss : e.type, col = e.color, tier = Math.min(5, e.gear || 0);
    const helm = tier > 0 ? Math.min(5, tier) : undefined;
    switch (type) {
      case 'grunt': return humanoid({ col, helm, weapon: ['club', 'sword', 'axe', 'halberd', 'flail', 'glaive'][tier], ears: true, skin: '#a8c98a' });
      case 'runner': return humanoid({ col, weapon: 'sword', helm: 'cap', hood: shadeHex(col, -0.2), skin: SKIN, lean: 1 });
      case 'shield': return humanoid({ col, helm: 1, weapon: 'sword', shield: 'big', shieldCol: '#8b95a8', skin: '#e0b894' });
      case 'archer': return humanoid({ col, helm: 'hood', hood: shadeHex(col, -0.25), bow: true, quiver: true, weapon: 'none' });
      case 'healer': return humanoid({ col, robe: '#efe9da', helm: 'hood', hood: '#efe9da', weapon: 'staff', weaponCol: '#9bf0a6', cross: true });
      case 'bomber': return humanoid({ col, helm: 'cap', hood: '#3a3a3a', keg: true, weapon: 'none', skin: '#8fbf5a' });
      case 'thief': return humanoid({ col, helm: 'hood', hood: '#1f4a37', sack: true, weapon: 'sword', skin: '#e8c39a', eye: '#222' });
      case 'sapper': return humanoid({ col, helm: 'pot', weapon: 'hammer', keg: false, skin: SKIN });
      case 'warchief': return humanoid({ col, helm: 'horns', weapon: 'axe', banner: true, bulk: 1.15, cape: '#7a1624', skin: '#c98a6a', ears: true });
      case 'warlock': return humanoid({ col, robe: '#3a2160', helm: 'hat', weapon: 'staff', weaponCol: '#c79bff', orb: '#c79bff', skin: '#a89bb8', eye: '#c79bff' });
      case 'skirmisher': return humanoid({ col, helm: 'cap', hood: shadeHex(col, -0.2), weapon: 'lance', skin: SKIN });
      case 'dread': return humanoid({ col, helm: 5, weapon: 'glaive', bulk: 1.15, cape: '#1d1a2a', skin: '#444', eye: '#ff5a5a', eyeGlow: '#ff3030', shield: true, shieldCol: '#2f3240' });
      case 'wraith': return wraith(col);
      case 'troll': return brute(col, { weapon: 'club', skin: '#7aa874' });
      case 'ogre': return brute(col, { weapon: 'club', helm: 'horns', skin: '#c9966a', belt: '#6a4a2a' });
      case 'golem': return golem(col, false);
      case 'boss_titan': return golem(col, true);
      case 'cavalry': return mount(humanoid({ col, helm: Math.max(1, tier), weapon: 'lance', skin: SKIN }), '#8a5a3a');
      case 'ram': return ram();
      case 'spider': return spider(col, false);
      case 'brood': return spider(col, true);
      case 'burrower': return mole(col);
      case 'wyvern': return flyer(col, { belly: '#d8c9f0' });
      case 'gargoyle': return flyer('#8b94a3', { wing: '#6a7280', belly: '#a8afbb' });
      case 'harpy': return harpy(col);
      case 'boss_dragon': return flyer(col, { boss: true, wing: '#8a2a18' });
      case 'boss_warlord': return humanoid({ col, helm: 'horns', weapon: 'axe', bulk: 1.3, cape: '#7a1624', skin: '#c98a6a', shield: true, shieldCol: '#5b1620', banner: false, ears: true });
      case 'boss_lich': return humanoid({ col, robe: '#2c4d66', helm: 'crown', weapon: 'staff', weaponCol: '#9fe7ff', orb: '#9fe7ff', skin: '#dfe9ef', eye: '#bff', eyeGlow: '#7fd6ff', bulk: 1.15 });
      case 'boss_hydra': return hydra(col);
      default: return humanoid({ col, weapon: 'sword', helm });
    }
  }

  const TC = { footman: ['#3a8fd0', { helm: 1, weapon: 'sword', shield: true, shieldCol: '#3a8fd0' }], bowman: ['#5a9a3a', { helm: 'hood', hood: '#4a7a2a', bow: true, quiver: true, weapon: 'none' }],
    pikeman: ['#6a7ab0', { helm: 2, weapon: 'pike' }], crossbow: ['#8a6a3a', { helm: 'pot', bow: true, weapon: 'none' }], knight: ['#c0c8d8', { helm: 4, weapon: 'sword', shield: 'big', shieldCol: '#c0c8d8', cape: '#2a4a9a', bulk: 1.15 }],
    cleric: ['#f0ebdd', { robe: '#f0ebdd', helm: 'hood', hood: '#f0ebdd', weapon: 'mace', cross: true }], engineer: ['#c98a3a', { helm: 'cap', hood: '#c98a3a', weapon: 'hammer' }] };
  function troop(u) {
    const D = TROOPS[u.kind], c = D.color || '#3a8fd0';
    if (u.kind === 'cavalry') return mount(humanoid({ col: c, helm: 3, weapon: 'lance', skin: SKIN, cape: '#9a2a2a' }), '#e8e0d0', { mane: '#8a6a3a' });
    if (u.kind === 'griffon') { const g = flyer('#c79a4a', { wing: '#e8d7a8', belly: '#f2e6c4' }); const r = humanoid({ col: c, helm: 3, weapon: 'lance' }); r.root.scale.setScalar(0.55); r.root.position.set(0.1, 1.05, 0); g.body.add(r.root); g.rider = r; return g; }
    const cfg = TC[u.kind] || ['#3a8fd0', { helm: 1, weapon: 'sword' }];
    return humanoid({ col: D.color || cfg[0], ...cfg[1] });
  }
  function soldier(so) { return humanoid({ col: '#3a7fc0', helm: 1, weapon: 'sword', shield: true, shieldCol: '#3a7fc0' }); }

  // ---------- animation ----------
  function animate(u, st) {
    const mv = st.moving ? 1 : 0, ph = st.ph, t = st.t, sw = Math.sin(ph) * mv;
    const bob = Math.abs(Math.sin(ph)) * 0.06 * mv;
    u.body.position.y = u.fly ? Math.sin(t * 3) * 0.06 : bob;
    if (u.tag === 'human') {
      u.legs.forEach((l, i) => { l.rotation.z = Math.sin(ph + (i ? Math.PI : 0)) * 0.7 * mv; });
      const atk = st.swing > 0 ? 1 - st.swing / 0.25 : st.attack ? (Math.sin(t * 9) + 1) / 2 : -1;
      if (u.armR) u.armR.rotation.z = atk >= 0 ? -0.4 + atk * 2.2 : Math.sin(ph + Math.PI) * 0.5 * mv + 0.15;
      if (u.armL) u.armL.rotation.z = Math.sin(ph) * 0.5 * mv + 0.1;
      if (u.bow && st.attack) u.armL.rotation.z = 1.4;
      if (u.torso) u.torso.rotation.z = (u.torso.userData.base ?? (u.torso.userData.base = u.torso.rotation.z)) - st.hit * 0.25 + 0.04 * sw;
      if (u.hem) u.body.position.y = 0.08 + Math.sin(t * 2.2) * 0.06;
      if (u.flag) u.flag.rotation.y = Math.sin(t * 6) * 0.3;
      if (u.fuse) u.fuse.scale.setScalar(0.8 + 0.5 * Math.abs(Math.sin(t * 20)));
      if (u.orb) u.orb.position.y += Math.sin(t * 3) * 0.0015;
    } else if (u.tag === 'golem') {
      u.legs.forEach((l, i) => { l.rotation.z = Math.sin(ph + (i ? Math.PI : 0)) * 0.45 * mv; });
      const atk = st.swing > 0 || st.attack ? (Math.sin(t * 5) + 1) / 2 : 0;
      u.arms.forEach((a, i) => { a.rotation.z = (st.attack ? -0.3 + atk * 1.8 : Math.sin(ph + (i ? 0 : Math.PI)) * 0.35 * mv); });
      u.body.position.y = Math.abs(Math.sin(ph)) * 0.04 * mv; u.torso.rotation.z = -st.hit * 0.15;
    } else if (u.tag === 'quad') {
      u.legs.forEach((l, i) => { l.rotation.z = Math.sin(ph * 1.0 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.75 * mv; });
      if (u.tail) u.tail.rotation.y = Math.sin(t * 3) * 0.3;
      if (u.head) u.head.rotation.z = Math.sin(ph * 2) * 0.08 * mv;
      if (u.rider) { const a = st.swing > 0 ? 1 - st.swing / 0.25 : st.attack ? (Math.sin(t * 9) + 1) / 2 : 0; if (u.rider.armR) u.rider.armR.rotation.z = -0.2 + a * 1.4; }
    } else if (u.tag === 'ram') {
      u.legs.forEach((l, i) => { l.rotation.z = Math.sin(ph + (i % 2) * Math.PI) * 0.6 * mv; });
      u.log.position.x = 0.3 + Math.sin(t * 2.2) * 0.07;
    } else if (u.tag === 'spider') {
      u.legs.forEach((l, i) => { const { side, row } = l.userData; l.rotation.y = Math.sin(ph * 1.5 + row * 1.2 + (i % 2) * Math.PI) * 0.45 * mv + side * (row - 1.5) * 0.25; });
    } else if (u.tag === 'mole') {
      u.arms.forEach((a, i) => { a.rotation.z = Math.sin(ph * 1.5 + i * Math.PI) * 0.6 * mv; });
      u.legs.forEach((l, i) => { l.rotation.z = Math.sin(ph * 1.5 + i * Math.PI) * 0.5 * mv; });
    } else if (u.tag === 'flyer') {
      u.wings.forEach((w) => { w.rotation.x = -w.userData.side * (0.12 + Math.sin(t * 9 + (u.flapOff || 0)) * 0.5); });
      if (u.tail) u.tail.rotation.y = Math.sin(t * 2.5) * 0.3;
      if (u.glow) u.glow.scale.setScalar(0.8 + 0.4 * Math.sin(t * 6));
      if (u.rider && u.rider.armR) { const a = st.swing > 0 ? 1 - st.swing / 0.25 : 0; u.rider.armR.rotation.z = -0.2 + a * 1.4; }
    } else if (u.tag === 'hydra') {
      u.necks.forEach(({ neck, segs, hd, phase }) => {
        const sway = Math.sin(t * 1.6 + phase), lunge = st.attack ? Math.max(0, Math.sin(t * 5 + phase)) : 0;
        segs.forEach((s, i) => { s.position.set(i * 0.1 + lunge * i * 0.12, i * 0.28 - lunge * i * 0.06, sway * i * 0.1); });
        hd.position.set(0.4 + lunge * 0.4, 1.12 - lunge * 0.2, sway * 0.4); hd.rotation.y = -sway * 0.4;
      });
    }
    if (u.head && u.tag === 'human') u.head.rotation.z = -st.hit * 0.3;
  }

  return { enemy, troop, soldier, animate, shadeHex };
}
