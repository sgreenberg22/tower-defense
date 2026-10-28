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
    const root = grp(), body = grp(), u = { root, body, legs: [], knees: [], arms: [], elbows: [], tag: 'human' };
    const bk = o.bulk || 1, col = o.col, skin = o.skin || SKIN, boot = o.boot || '#3a2a22', pants = o.pants || shadeHex(col, -0.3), sleeve = o.sleeve || col;
    const h = o.helm, armoured = typeof h === 'number' && h >= 1, plate = armoured ? HELM[h] : null;
    root.add(body);
    // legs (thigh, knee, shin, boot with a toe) or a robe hem
    if (o.robe || o.ghost) {
      const hem = k.cyl(0.2 * bk, 0.44 * bk, 1.0, o.robe || col, 9, 0, 0.0);      // a robe that widens towards the ground
      hem.scale.x = 0.85; body.add(hem);
      body.add(k.cyl(0.445 * bk, 0.45 * bk, 0.06, shadeHex(o.robe || col, -0.25), 9, 0, 0.0));   // a darker hem band
      u.hem = hem;
    } else {
      for (const z of [-0.12, 0.12]) {
        const leg = grp(0, 0.8, z * bk), knee = grp(0, -0.38, 0);
        leg.add(k.cyl(0.1 * bk, 0.08 * bk, 0.38, pants, 7, 0, -0.38, 0));
        knee.add(k.sph(0.075 * bk, pants, 0, 0, 0), k.cyl(0.075 * bk, 0.062 * bk, 0.26, pants, 7, 0, -0.27, 0),
          k.cyl(0.08 * bk, 0.075 * bk, 0.16, boot, 7, 0, -0.42, 0), k.box(0.13, 0.07, 0.12 * bk, boot, 0.08, -0.42, 0), k.box(0.17, 0.025, 0.13 * bk, shadeHex(boot, -0.3), 0.04, -0.425, 0));
        if (plate && h >= 3) knee.add(k.box(0.07, 0.1, 0.1 * bk, plate, 0.06, -0.06, 0));   // knee cops for the heavily armoured
        leg.add(knee); body.add(leg); u.legs.push(leg); u.knees.push(knee);
      }
      // a tunic skirt (or mail for the heavily armoured) over the hips
      const skirt = k.cyl(0.22 * bk, 0.27 * bk, 0.3, plate && h >= 3 ? '#7d8394' : col, 8, 0, 0.6, 0); skirt.scale.x = 0.72; body.add(skirt);
    }
    const hy = o.robe || o.ghost ? 0.95 : 0.8;
    // torso: a chest that narrows to the waist, a belt and buckle, and a breastplate for the armoured
    const torso = grp(0, 0, 0); body.add(torso); u.torso = torso;
    const chest = k.cyl(0.29 * bk, 0.23 * bk, 0.62, col, 8, 0, hy); chest.scale.x = 0.66; torso.add(chest);
    if (o.belly) { const b = k.sph(0.3 * bk, col, 0.08, hy + 0.2, 0); b.scale.set(0.9, 0.85, 1); torso.add(b); }
    const belt = k.cyl(0.245 * bk, 0.245 * bk, 0.07, o.belt || '#4a3626', 8, 0, hy + 0.02); belt.scale.x = 0.7; torso.add(belt);
    torso.add(k.box(0.05, 0.06, 0.07, GOLD, 0.17 * bk, hy + 0.025, 0));
    if (armoured) {
      const cu = k.cyl(0.3 * bk, 0.25 * bk, 0.4, plate, 8, 0, hy + 0.18); cu.scale.x = 0.7; torso.add(cu);
      torso.add(k.box(0.03, 0.36, 0.035, shadeHex(plate, 0.2), 0.205 * bk, hy + 0.2, 0));   // the ridge down the front
    } else if (!o.robe && !o.ghost) {
      torso.add(k.box(0.02, 0.3, 0.03, shadeHex(col, -0.25), 0.19 * bk, hy + 0.25, 0));    // the lacing of a tunic
    }
    if (o.tabard) torso.add(k.box(0.03, 0.62, 0.22 * bk, o.tabard, 0.2 * bk, hy - 0.12, 0));
    if (o.hunch) torso.rotation.z = o.hunch;
    // neck and head: a face with a nose and a jaw, eyes, ears or tusks, hair or a helmet
    torso.add(k.cyl(0.075, 0.09, 0.14, skin, 6, 0.01, hy + 0.6));
    const head = grp(0.02, hy + 0.88, 0); u.head = head; torso.add(head);
    const hs = o.headScale || 1, face = o.faceCol || skin;
    const skull = k.sph(0.2 * hs, face, 0, 0, 0); skull.scale.set(1, 1.06, 0.94); head.add(skull);
    head.add(k.box(0.13, 0.09, 0.2 * hs, face, 0.07, -0.16, 0));                         // jaw
    head.add(k.box(0.06, 0.07, 0.045, shadeHex(face, -0.12), 0.2 * hs, -0.03, 0));       // nose
    for (const z of [-0.075, 0.075]) head.add(k.sph(0.032, o.eye || '#111', 0.17 * hs, 0.04, z, o.eyeGlow ? k.glow(o.eyeGlow) : {}));
    head.add(k.box(0.04, 0.03, 0.22, shadeHex(face, -0.3), 0.18 * hs, 0.09, 0));         // brow
    if (o.tusks) for (const z of [-0.06, 0.06]) head.add(k.cone(0.022, 0.08, '#efe8d0', 4, 0.15, -0.14, z));
    if (o.beard) { const bd = k.cone(0.12, 0.2, o.beard, 6, 0.12, -0.32, 0); bd.rotation.z = Math.PI; bd.position.y = -0.24; head.add(bd); }
    if (typeof h === 'number') {
      const hc = HELM[h];
      head.add(k.cyl(0.215, 0.225, 0.16, hc, 9, 0, 0.02)); head.add(k.cone(0.205, 0.12, hc, 9, 0, 0.18));
      head.add(k.box(0.18, 0.025, 0.46, shadeHex(hc, -0.2), 0.02, 0.02, 0));                 // the brim
      if (h >= 1) head.add(k.box(0.05, 0.16, 0.04, hc, 0.2, -0.06, 0));                        // nasal guard
      if (h >= 3) { const pl = k.box(0.05, 0.12, 0.34, '#c0392b', -0.02, 0.26, 0); head.add(pl); }   // a crest
      if (h >= 4) for (const z of [-1, 1]) head.add(k.box(0.14, 0.18, 0.03, hc, 0.06, -0.14, z * 0.2));   // cheek plates
    } else if (h === 'pot') { head.add(k.cyl(0.22, 0.22, 0.15, '#8a8f9c', 9, 0, 0.0), k.sph(0.2, '#8a8f9c', 0, 0.1, 0), k.cyl(0.27, 0.27, 0.025, '#6a6f7c', 9, 0, 0.0)); }
    else if (h === 'hood') {   // a hood that frames the face: a peak behind, a cowl round the back and sides
      const hc = o.hood || shadeHex(col, -0.2), pk = k.cone(0.23, 0.44, hc, 8, -0.07, 0.0); pk.rotation.z = 0.25; head.add(pk);
      const cowl = k.sph(0.25, hc, -0.07, -0.04, 0); cowl.scale.set(0.95, 1.05, 1.08); head.add(cowl); head.add(k.cyl(0.2, 0.28, 0.12, hc, 8, -0.04, -0.28));
      head.add(k.box(0.05, 0.08, 0.38, shadeHex(hc, -0.25), 0.12, 0.13, 0));
    }
    else if (h === 'cap') head.add(k.cyl(0.215, 0.22, 0.1, o.hood || col, 8, 0, 0.1), k.box(0.18, 0.035, 0.3, o.hood || col, 0.14, 0.1, 0), k.sph(0.04, shadeHex(o.hood || col, 0.3), 0, 0.22, 0));
    else if (h === 'hat') head.add(k.cyl(0.33, 0.33, 0.03, '#3a2160', 12, 0, 0.12), k.cone(0.2, 0.55, '#3a2160', 8, -0.02, 0.14), k.cyl(0.205, 0.205, 0.04, GOLD, 8, 0, 0.15));
    else if (h === 'horns') { head.add(k.cyl(0.22, 0.23, 0.14, '#5b5f6b', 9, 0, 0.04)); const dm = k.sph(0.222, '#5b5f6b', 0, 0.14, 0); dm.scale.y = 0.7; head.add(dm); for (const z of [-1, 1]) { const hn = k.cyl(0.035, 0.06, 0.3, '#e8e0c8', 6, 0, 0.1, z * 0.2); hn.rotation.x = z * 1.0; hn.position.set(0, 0.1 + 0.15 * Math.cos(1.0), z * (0.2 + 0.15 * Math.sin(1.0))); head.add(hn); const tip = k.cone(0.035, 0.18, '#e8e0c8', 6); tip.rotation.x = z * 0.15; tip.position.set(0, 0.1 + 0.3 * Math.cos(1.0) + 0.09, z * (0.2 + 0.3 * Math.sin(1.0) + 0.014)); head.add(tip); } }
    else if (h === 'crown') { head.add(k.cyl(0.2, 0.22, 0.1, GOLD, 8, 0, 0.12)); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; head.add(k.cone(0.04, 0.12, GOLD, 4, Math.cos(a) * 0.17, 0.2, Math.sin(a) * 0.17)); } head.add(k.sph(0.035, '#d9473b', 0.2, 0.17, 0)); }
    else if (h === 'skull') { skull.material = k.M('#e8e4d6'); }
    else if (o.hair !== false) { const hr = k.sph(0.21 * hs, o.hair || '#4a3020', -0.035, 0.05, 0); hr.scale.set(0.95, 0.85, 1.02); head.add(hr); }
    if (o.ears) for (const z of [-1, 1]) { const e = k.cone(0.06, 0.22, skin, 4, -0.02, -0.02, z * 0.2); e.rotation.x = z * -1.25; head.add(e); }
    // arms: shoulder, upper arm, elbow, forearm, a hand; pauldrons and bracers for the armoured
    for (const z of [-1, 1]) {
      const arm = grp(0, hy + 0.54, z * 0.31 * bk), elbow = grp(0, -0.27, 0);
      arm.add(k.sph(0.095 * bk, sleeve, 0, 0, 0), k.cyl(0.075 * bk, 0.065 * bk, 0.27, sleeve, 7, 0, -0.27, 0));
      if (plate && h >= 2) { const pd = k.sph(0.125 * bk, plate, 0, 0.02, 0); pd.scale.set(1.1, 0.7, 1.2); arm.add(pd); }
      elbow.add(k.sph(0.064 * bk, sleeve, 0, 0, 0), k.cyl(0.064 * bk, 0.052 * bk, 0.22, o.bare ? skin : sleeve, 7, 0, -0.22, 0));
      elbow.add(k.cyl(0.07 * bk, 0.07 * bk, 0.08, plate && h >= 2 ? plate : '#5a3d22', 7, 0, -0.2, 0));   // bracer or cuff
      const hand = k.sph(0.065 * bk, skin, 0.01, -0.27, 0); hand.scale.set(1, 1.1, 0.85); elbow.add(hand);
      arm.add(elbow); torso.add(arm); u.arms.push(arm); u.elbows.push(elbow);
    }
    const handR = grp(0.01, -0.27, 0); u.elbows[1].add(handR); u.handR = handR; u.armR = u.arms[1]; u.armL = u.arms[0]; u.elbowR = u.elbows[1]; u.elbowL = u.elbows[0];
    const wp = weapon(o.weapon, o.weaponCol); if (wp) { handR.add(wp); u.weapon = wp; }
    if (o.bow) { const b = bow(); b.position.set(0.06, -0.27, 0); u.elbowL.add(b); u.bow = b; }
    if (o.shield) {
      const big = o.shield === 'big', sc = o.shieldCol || '#8b95a8';
      const sh = k.box(0.06, big ? 0.72 : 0.5, big ? 0.5 : 0.42, sc, 0.13, big ? -0.5 : -0.38, 0);
      sh.add(k.box(0.02, big ? 0.74 : 0.52, 0.05, shadeHex(sc, -0.3), 0.035, -(big ? 0.36 : 0.25), 0), k.box(0.02, 0.05, big ? 0.52 : 0.44, shadeHex(sc, -0.3), 0.035, -0.025, 0), k.sph(0.07, GOLD, 0.04, 0, 0));
      u.elbowL.add(sh); u.shield = sh;
    }
    // back gear
    if (o.cape) { const c = k.box(0.04, 0.95, 0.52 * bk, o.cape, -0.2, hy - 0.25); c.rotation.z = 0.12; torso.add(c); u.cape = c; torso.add(k.box(0.06, 0.06, 0.5 * bk, shadeHex(o.cape, 0.25), -0.15, hy + 0.58)); }
    if (o.quiver) { const q = k.cyl(0.07, 0.06, 0.5, '#7a5130', 6, -0.2, hy + 0.1, 0.12); q.rotation.z = 0.4; torso.add(q); for (const dz of [-0.03, 0.03]) torso.add(k.cyl(0.012, 0.012, 0.14, '#d9dde6', 4, -0.28, hy + 0.62, 0.12 + dz)); }
    if (o.keg) { const g = k.cyl(0.17, 0.17, 0.34, '#7a4a22', 8, -0.28, hy + 0.1, 0); torso.add(g, k.cyl(0.175, 0.175, 0.03, '#4a4f5c', 8, -0.28, hy + 0.2, 0), k.cyl(0.175, 0.175, 0.03, '#4a4f5c', 8, -0.28, hy + 0.36, 0)); u.fuse = k.sph(0.05, '#ffd25e', -0.28, hy + 0.5, 0, k.glow('#ff9a3a')); torso.add(u.fuse); }
    if (o.sack) torso.add(k.sph(0.2, '#c9a66b', -0.26, hy + 0.15, 0), k.sph(0.05, GOLD, -0.26, hy + 0.36, 0, k.glow('#a07a10')));
    if (o.banner) { torso.add(k.cyl(0.02, 0.02, 1.7, WOOD, 5, -0.3, hy - 0.2, 0), k.sph(0.04, GOLD, -0.3, hy + 1.52, 0)); const f = k.box(0.02, 0.4, 0.55, o.bannerCol || '#d9473b', -0.3, hy + 1.1, -0.28); torso.add(f); u.flag = f; }
    if (o.cross) torso.add(k.box(0.02, 0.28, 0.07, '#fff', 0.2, hy + 0.3, 0), k.box(0.02, 0.07, 0.24, '#fff', 0.2, hy + 0.32, 0));
    if (o.orb) { u.orb = k.sph(0.13, o.orb, 0, 0, 0, k.glow(o.orb)); u.orb.position.set(0.3, hy + 0.9, 0); torso.add(u.orb); }
    return u;
  }

  // ---------- big brutes: trolls and ogres ----------
  function brute(col, o = {}) {
    return humanoid({ col, skin: o.skin || col, bulk: 1.45, hunch: -0.18, belly: true, weapon: 'club', ears: true, tusks: true, bare: true, hair: false, helm: o.helm, sleeve: col, pants: shadeHex(col, -0.35), headScale: 1.05, eye: '#f2b33d', ...o });
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
    const root = grp(), body = grp(), u = { root, body, legs: [], knees: [], arms: [], tag: 'quad' };
    root.add(body);
    const col = o.col, lg = o.legCol || shadeHex(col, -0.25), L = o.len || 1.1, H = o.h || 0.55, dk = shadeHex(col, -0.18), w = o.girth || 1;
    // a barrel of a body with a deep chest and round haunches
    const trunk = k.sph(0.5, col, 0, H + 0.05, 0); trunk.scale.set(L * 0.95, 0.52 * w, 0.5 * w); body.add(trunk);
    const chest = k.sph(0.3 * w, col, L * 0.3, H + 0.06, 0); chest.scale.set(1.05, 1.05, 0.95); body.add(chest);
    const haunch = k.sph(0.27 * w, dk, -L * 0.32, H + 0.08, 0); haunch.scale.set(1, 1.05, 1); body.add(haunch);
    if (o.belly) { const b = k.sph(0.24 * w, o.belly, 0, H - 0.08, 0); b.scale.set(L * 1.4, 0.6, 0.9); body.add(b); }
    // neck and head: skull, muzzle, nose, jaw, ears and eyes
    const neck = k.cyl(0.13 * w, 0.19 * w, 0.5, col, 7, L * 0.42, H + 0.1); neck.rotation.z = -0.75; neck.position.set(L * 0.5, H + 0.32, 0); body.add(neck);
    const head = grp(L * 0.66, H + 0.52, 0);
    const skull = k.sph(0.16, col, 0, 0, 0); skull.scale.set(1.2, 0.95, 0.9); head.add(skull);
    const muz = o.muzzle ?? 0.24, mc = o.muzzleCol || shadeHex(col, 0.12);
    head.add(k.box(muz, 0.13, 0.16, mc, 0.12 + muz / 2, -0.09, 0), k.box(0.06, 0.06, 0.1, '#1e1a1a', 0.13 + muz, -0.02, 0), k.box(muz * 0.85, 0.05, 0.13, shadeHex(col, -0.3), 0.1 + muz / 2, -0.12, 0));
    if (o.fangs) for (const z of [-0.04, 0.04]) { const f = k.cone(0.018, 0.06, '#f2ecd8', 4, 0.1 + muz, -0.15, z); f.rotation.z = Math.PI; head.add(f); }
    for (const z of [-0.075, 0.075]) head.add(k.sph(0.03, o.eye || '#141010', 0.12, 0.04, z, o.eyeGlow ? k.glow(o.eyeGlow) : {}));
    for (const z of [-1, 1]) { const e = k.cone(0.05, o.ears || 0.16, o.earCol || col, 4, -0.04, 0.07, z * 0.08); e.rotation.x = z * -0.35; head.add(e); }
    body.add(head); u.head = head;
    if (o.mane) { for (let i = 0; i < 5; i++) { const m = k.box(0.12, 0.1 + (i % 2) * 0.04, 0.08, o.mane, L * 0.18 + i * 0.09, H + 0.36 + i * 0.07, 0); m.rotation.z = -0.6; body.add(m); } }
    // legs: thigh, knee, shin and a hoof or paw
    for (const [x, z, back] of [[L * 0.32, 0.15, 0], [L * 0.32, -0.15, 0], [-L * 0.32, 0.15, 1], [-L * 0.32, -0.15, 1]]) {
      const leg = grp(x, H, z * w), kn = grp(0, -H * 0.5, 0);
      leg.add(k.cyl(0.085 * w, 0.065, H * 0.5, back ? dk : lg, 6, 0, -H * 0.5, 0));
      kn.add(k.sph(0.06, lg, 0, 0, 0), k.cyl(0.055, 0.045, H * 0.5, lg, 6, 0, -H * 0.5, 0), k.box(o.hoof ? 0.11 : 0.14, 0.07, 0.11, o.hoof || '#2a2622', 0.02, -H * 0.5 - 0.02, 0));
      leg.add(kn); body.add(leg); u.legs.push(leg); u.knees.push(kn); kn.userData.back = back;
    }
    const tail = k.cone(0.06, 0.55, o.tailCol || o.mane || dk, 5, -L * 0.5, H + 0.1); tail.rotation.z = 2.1; tail.position.set(-L * 0.58, H + 0.08, 0); body.add(tail); u.tail = tail;
    u.seatY = H + 0.3;
    return u;
  }

  // Sit a rider down: legs astride, bent at the knee, and no walking.
  function seat(rider) {
    if (!rider.legs.length) return;
    rider.legs.forEach((l, i) => { l.rotation.order = 'XZY'; l.rotation.z = 1.15; l.rotation.x = (i ? 1 : -1) * 0.55; });
    for (const kn of rider.knees || []) kn.rotation.z = -1.5;
    rider.legsLocked = true;
  }
  function mount(rider, horseCol, o = {}) {
    const h = quad({ col: horseCol, mane: o.mane || '#3a2a22', len: 1.15, muzzle: 0.3, ears: 0.12, hoof: '#2a2622', girth: 0.95 });
    // the rider sits in the saddle with the legs astride and bent at the knee
    rider.root.position.set(-0.05, h.seatY - 0.8 * 0.62 + 0.02, 0); rider.root.scale.setScalar(0.62);
    seat(rider);
    h.body.add(k.box(0.36, 0.06, 0.5, '#5a2a1a', -0.05, h.seatY - 0.06, 0), k.box(0.3, 0.12, 0.04, o.cloth || '#9a2a2a', -0.05, h.seatY - 0.2, 0.25), k.box(0.3, 0.12, 0.04, o.cloth || '#9a2a2a', -0.05, h.seatY - 0.2, -0.25));   // saddle and cloth
    h.body.add(rider.root); h.rider = rider;
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
  // Wings are real membranes: an inner panel on the arm and an outer panel on the "hand" that folds a beat behind, with a scalloped trailing edge.
  const MEMBRANE = {
    inner: [[0.15, 0], [0.25, 0.6], [-0.35, 0.6], [-0.48, 0.38], [-0.33, 0.2], [-0.42, 0]],
    outer: [[0, 0], [-0.2, 0.65], [-0.42, 0.42], [-0.38, 0.22], [-0.6, 0]],
  };
  const membraneGeo = (pts, side) => k.G(`mem${pts.length}${pts[1][1]}${side}`, () => {
    const sh = new T.Shape(); pts.forEach(([x, z], i) => (i ? sh.lineTo(x, z * side) : sh.moveTo(x, z * side)));
    return new T.ShapeGeometry(sh).rotateX(Math.PI / 2);
  });
  function flyer(col, o = {}) {
    const root = grp(), body = grp(), u = { root, body, legs: [], arms: [], wings: [], tips: [], tag: 'flyer' };
    root.add(body);
    const bs = o.boss ? 1.6 : 1, belly = o.belly || shadeHex(col, 0.25), wc = o.wing || shadeHex(col, -0.1), bone = o.bone || shadeHex(col, -0.35);
    const bod = k.sph(0.4 * bs, col, 0, 0.8, 0); bod.scale.set(1.45, 0.78, 0.82); body.add(bod);
    const bel = k.sph(0.3 * bs, belly, 0.08 * bs, 0.7, 0); bel.scale.set(1.5, 0.7, 0.85); body.add(bel);
    // a neck of tapering segments up to a horned head with a jaw
    for (let i = 0; i < 3; i++) body.add(k.sph((0.16 - i * 0.025) * bs, i % 2 ? shadeHex(col, -0.08) : col, (0.45 + i * 0.13) * bs, 0.86 + i * 0.1 * bs, 0));
    const head = grp(0.86 * bs, 1.12 * bs + (o.boss ? -0.12 : 0), 0);
    const sk = k.sph(0.14 * bs, col, 0, 0, 0); sk.scale.set(1.35, 0.9, 0.9); head.add(sk);
    head.add(k.box(0.24 * bs, 0.08 * bs, 0.14 * bs, belly, 0.2 * bs, -0.07 * bs, 0), k.box(0.2 * bs, 0.06 * bs, 0.15 * bs, col, 0.2 * bs, 0.0, 0));
    for (const z of [-0.06, 0.06]) head.add(k.sph(0.03 * bs, '#ffd25e', 0.1 * bs, 0.05 * bs, z * bs, k.glow('#ffaa20')));
    for (const z of [-1, 1]) { const hn = k.cone(0.035 * bs, 0.24 * bs, '#e8e0c8', 5, -0.1 * bs, 0.05, z * 0.07 * bs); hn.rotation.z = 1.1; hn.rotation.x = z * -0.3; head.add(hn); }
    if (o.boss) for (let i = 0; i < 4; i++) head.add(k.cone(0.025 * bs, 0.1 * bs, '#e8e0c8', 4, (-0.14 - i * 0.03) * bs, 0.12 * bs, 0));
    body.add(head); u.head = head;
    // a spine of plates down the back
    for (let i = 0; i < 5; i++) body.add(k.cone(0.04 * bs, (0.12 - i * 0.012) * bs, bone, 4, (0.35 - i * 0.18) * bs, 0.98 + (i < 2 ? 0.02 : -0.03 * (i - 1)), 0));
    // a tail that tapers to a spade
    const tail = grp(-0.5 * bs, 0.78, 0); let tx = 0;
    for (let i = 0; i < 4; i++) { const r = (0.12 - i * 0.025) * bs; tail.add(k.sph(r, i % 2 ? shadeHex(col, -0.08) : col, tx, -i * 0.02, 0)); tx -= r * 1.55; }
    const spade = k.cone(0.07 * bs, 0.16 * bs, bone, 4, tx - 0.04 * bs, -0.06, 0); spade.rotation.z = Math.PI / 2; spade.position.x = tx - 0.04 * bs; tail.add(spade);
    body.add(tail); u.tail = tail;
    // little clawed legs tucked under
    for (const z of [-0.14, 0.14]) { const lgp = grp(-0.05 * bs, 0.6, z * bs); lgp.add(k.cyl(0.05 * bs, 0.035 * bs, 0.22 * bs, shadeHex(col, -0.15), 6, 0, -0.22 * bs, 0), k.box(0.1 * bs, 0.04, 0.08 * bs, bone, 0.04 * bs, -0.24 * bs, 0)); lgp.rotation.z = 0.8; body.add(lgp); u.legs.push(lgp); }
    // the wings
    const wm = k.M(wc, { side: T.DoubleSide });
    for (const z of [-1, 1]) {
      const wing = grp(0.05 * bs, 1.0, z * 0.16 * bs);
      const inner = new T.Mesh(membraneGeo(MEMBRANE.inner, z), wm); inner.scale.setScalar(bs); inner.castShadow = true; wing.add(inner);
      const arm = k.cyl(0.03 * bs, 0.04 * bs, 0.62 * bs, bone, 5, 0, 0, 0); arm.rotation.x = z * (Math.PI / 2 - 0.16); arm.position.set(0.2 * bs, 0, z * 0.3 * bs); wing.add(arm);
      const tip = grp(0.25 * bs, 0, z * 0.6 * bs);
      const outer = new T.Mesh(membraneGeo(MEMBRANE.outer, z), wm); outer.scale.setScalar(bs); outer.castShadow = true; tip.add(outer);
      for (const [fx, fz] of [[-0.2, 0.65], [-0.38, 0.22]]) { const len = Math.hypot(fx, fz) * bs, f = k.cyl(0.015 * bs, 0.025 * bs, len, bone, 4, 0, 0, 0); f.rotation.x = z * Math.PI / 2; f.rotation.y = z * Math.atan2(-fx, fz) * -1; f.position.set(fx * bs / 2, 0, z * fz * bs / 2); tip.add(f); }
      tip.add(k.cone(0.02 * bs, 0.08 * bs, '#e8e0c8', 4, 0.02 * bs, -0.02, 0));   // the thumb claw
      wing.add(tip); body.add(wing); u.wings.push(wing); u.tips.push(tip); wing.userData.side = z; tip.userData.side = z;
    }
    if (o.boss) { u.glow = k.sph(0.07 * bs, '#ffb020', 1.2 * bs, 1.12 * bs - 0.24, 0, k.glow('#ff7a20')); body.add(u.glow); }   // fire in the jaws
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

  // ---------- v1.35: siege engines, tree-folk, demons ----------
  function wheel(r, x, z, c = '#4a3626') {
    const g = grp(x, r, z), w = k.cyl(r, r, 0.08, c, 10); w.rotation.x = Math.PI / 2; w.position.set(0, 0, 0);
    g.add(w, k.box(r * 2, 0.05, 0.1, '#2a1e14', 0, -0.02, 0), k.box(0.05, r * 2, 0.1, '#2a1e14', 0, -r, 0)); return g;
  }
  function catapult(o = {}) {
    const root = grp(), body = grp(), u = { root, body, legs: [], arms: [], wheels: [], tag: 'siege' }, sc = o.big ? 1.5 : 1, wood = o.wood || '#7a5a3a';
    root.add(body);
    body.add(k.box(1.5 * sc, 0.14, 0.7 * sc, wood, 0, 0.26 * sc), k.box(1.4 * sc, 0.1, 0.1, '#5a3a1a', 0, 0.4 * sc, 0.26 * sc), k.box(1.4 * sc, 0.1, 0.1, '#5a3a1a', 0, 0.4 * sc, -0.26 * sc));
    for (const x of [-0.5, 0.5]) for (const z of [-0.42, 0.42]) { const w = wheel(0.26 * sc, x * sc, z * sc); body.add(w); u.wheels.push(w); }
    for (const z of [-0.3, 0.3]) body.add(k.box(0.12, 0.7 * sc, 0.1, '#5a3a1a', 0.1 * sc, 0.3 * sc, z * sc));
    const arm = grp(0.1 * sc, 0.95 * sc, 0); arm.add(k.box(1.5 * sc, 0.1, 0.12, '#6b4a2a', -0.45 * sc, 0), k.box(0.4 * sc, 0.14, 0.34, '#3a3a3a', -1.1 * sc, 0.04), k.cyl(0.22 * sc, 0.16 * sc, 0.2 * sc, '#5a3a1a', 8, 0.35 * sc, -0.06, 0), k.sph(0.16 * sc, '#8a8f9c', 0.35 * sc, 0.2 * sc, 0));
    body.add(arm); u.arm = arm;
    if (o.big) body.add(k.box(0.5, 0.5, 0.6, '#3a3a3a', -0.9, 0.3, 0));
    body.add(k.box(0.4 * sc, 0.45, 0.4 * sc, o.crew || '#c0392b', -0.55 * sc, 0.28 * sc));
    return u;
  }
  function siegeTower() {
    const root = grp(), body = grp(), u = { root, body, legs: [], arms: [], wheels: [], tag: 'siege' };
    root.add(body);
    body.add(k.box(1.0, 1.9, 0.9, '#6a5236', 0, 0.3), k.box(1.1, 0.12, 1.0, '#4a3822', 0, 2.1), k.box(1.15, 0.5, 0.06, '#3a2a18', 0, 2.2, 0.48), k.box(1.15, 0.5, 0.06, '#3a2a18', 0, 2.2, -0.48));
    for (const y of [0.9, 1.5]) body.add(k.box(1.02, 0.08, 0.92, '#4a3822', 0, y));
    body.add(k.box(0.06, 1.0, 0.7, '#8a6a3a', 0.54, 0.6), k.cone(0.2, 0.3, '#c0392b', 4, 0, 2.3));
    for (const x of [-0.35, 0.35]) for (const z of [-0.5, 0.5]) { const w = wheel(0.27, x, z); body.add(w); u.wheels.push(w); }
    return u;
  }
  function treant(col, boss) {
    const root = grp(), body = grp(), u = { root, body, legs: [], arms: [], tag: 'golem' }, bark = '#5a4028', dk = shadeHex(bark, -0.3);
    root.add(body);
    for (const z of [-0.2, 0.2]) { const leg = grp(0, 0.7, z); leg.add(k.cyl(0.14, 0.2, 0.7, bark, 7, 0, -0.7), k.cone(0.26, 0.12, dk, 6, 0, -0.74)); body.add(leg); u.legs.push(leg); }
    const torso = grp(); body.add(torso); u.torso = torso;
    torso.add(k.cyl(0.34, 0.28, 1.0, bark, 8, 0, 0.7), k.cyl(0.18, 0.32, 0.25, dk, 8, 0, 0.55));
    for (let i = 0; i < 5; i++) torso.add(k.cone(0.06, 0.25, '#7a5a38', 4, 0.3, 0.9 + i * 0.12, (i - 2) * 0.1).rotateZ(-0.9));
    const head = grp(0.1, 1.85, 0); head.add(k.sph(0.3, col, 0, 0.2, 0), k.sph(0.3, shadeHex(col, -0.15), -0.1, 0.38, 0.12), k.sph(0.26, shadeHex(col, 0.1), 0.0, 0.5, -0.14), k.sph(0.05, '#ffcf4a', 0.28, 0.22, -0.1, k.glow('#ffaa20')), k.sph(0.05, '#ffcf4a', 0.28, 0.22, 0.1, k.glow('#ffaa20'))); torso.add(head); u.head = head;
    for (const z of [-1, 1]) { const arm = grp(0, 1.45, z * 0.4); arm.add(k.cyl(0.1, 0.13, 0.9, bark, 6, 0, -0.9), k.sph(0.16, dk, 0, -0.95, 0)); for (const dz of [-0.1, 0, 0.1]) arm.add(k.cone(0.03, 0.22, bark, 4, 0.04, -1.02, dz)); torso.add(arm); u.arms.push(arm); }
    u.armR = u.arms[1]; u.armL = u.arms[0];
    if (boss) { for (const [x, y, z, r] of [[-0.25, 0.55, 0.3, 0.3], [0.15, 0.62, -0.3, 0.32], [-0.1, 0.85, 0, 0.3], [0.22, 0.5, 0.15, 0.26]]) head.add(k.sph(r, shadeHex(col, 0.12), x, y, z)); torso.add(k.sph(0.07, '#ffcf4a', 0.33, 1.1, 0, k.glow('#ffaa20'))); }
    return u;
  }
  function fiend(col) {
    const u = humanoid({ col, skin: shadeHex(col, -0.15), bulk: 1.55, helm: 'horns', weapon: 'staff', weaponCol: '#ff8a30', cape: '#2a0c06', eye: '#ffb020', eyeGlow: '#ffb020', sleeve: col, pants: shadeHex(col, -0.4) });
    for (const z of [-1, 1]) { const wing = k.box(0.05, 1.3, 0.9, '#3a1008', -0.25, 1.0, z * 0.75); wing.rotation.x = z * 0.35; wing.material = k.M('#3a1008', { side: T.DoubleSide }); u.torso.add(wing); }
    u.torso.add(k.sph(0.16, '#ff7a20', 0.2, 1.1, 0, k.glow('#ff5a10')));
    return u;
  }
  function riderOn(mountU, rider, sc = 0.6, y = 1.05) { seat(rider); rider.root.scale.setScalar(sc); rider.root.position.set(0.05, y - 0.8 * sc + 0.08, 0); mountU.body.add(rider.root); mountU.rider = rider; return mountU; }
  function escaladeTeam(col) {
    const u = humanoid({ col, helm: 'cap', hood: shadeHex(col, -0.2), weapon: 'sword' });
    const lad = grp(-0.25, 1.1, 0); lad.rotation.z = 0.5;
    for (const z of [-0.12, 0.12]) lad.add(k.box(0.05, 1.5, 0.05, '#8a6a3a', 0, -0.2, z));
    for (let i = 0; i < 6; i++) lad.add(k.box(0.04, 0.04, 0.26, '#8a6a3a', 0, -0.85 + i * 0.25, 0));
    u.torso.add(lad); return u;
  }

  // ---------- baking ----------
  // A unit is built from dozens of small parts. Each part that never moves on its own is merged with its rigid siblings into
  // one vertex-coloured mesh per moving piece (torso, head, each limb...), so a foe costs a handful of draw calls, not forty.
  // Parts that glow, are see-through, have their own children or are animated by name (u.fuse, u.flag...) are kept as they are.
  const vcMat = () => k.M('#ffffff', { vertexColors: true });
  function keep(u, out = new Set(), seen = new Set()) {
    if (!u || typeof u !== 'object' || seen.has(u)) return out;
    seen.add(u);
    if (u.isObject3D) { out.add(u); return out; }
    for (const v of Object.values(u)) {
      if (!v || typeof v !== 'object') continue;
      if (v.isObject3D) out.add(v);
      else if (Array.isArray(v)) v.forEach((x) => keep(x, out, seen));
      else if (v.constructor === Object) keep(v, out, seen);
    }
    return out;
  }
  const plain = (m) => m.isMesh && !m.children.length && m.material?.isMeshLambertMaterial && !m.material.transparent && !m.material.map && !m.material.vertexColors
    && m.material.side === T.FrontSide && m.material.emissive.r + m.material.emissive.g + m.material.emissive.b === 0;
  function bake(u) {
    const kept = keep(u);
    for (const p of [u.rider, ...(u.pets || [])]) if (p) keep(p, kept);
    const groups = []; u.root.traverse((o) => { if (!o.isMesh) groups.push(o); });
    for (const g of groups) {
      const parts = g.children.filter((c) => plain(c) && !kept.has(c));
      if (parts.length < 2) continue;
      const pos = [], nor = [], colr = [], c = new T.Color();
      for (const m of parts) {
        m.updateMatrix();
        const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        geo.applyMatrix4(m.matrix);
        pos.push(...geo.attributes.position.array); nor.push(...geo.attributes.normal.array);
        c.copy(m.material.color);
        for (let i = 0; i < geo.attributes.position.count; i++) colr.push(c.r, c.g, c.b);
        geo.dispose(); g.remove(m);
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(colr, 3));
      const mesh = new T.Mesh(geo, vcMat()); mesh.castShadow = mesh.receiveShadow = true; mesh.userData.baked = true;
      g.add(mesh);
    }
    return u;
  }

  // ---------- catalogue ----------
  function enemy(e) {
    const type = e.boss ? 'boss_' + e.boss : e.type, col = e.color, tier = Math.min(5, e.gear || 0);
    const helm = tier > 0 ? Math.min(5, tier) : undefined;
    switch (type) {
      case 'grunt': return humanoid({ col, helm, weapon: ['club', 'sword', 'axe', 'halberd', 'flail', 'glaive'][tier], ears: true, tusks: true, skin: '#a8c98a', hair: '#2a2a1a' });
      case 'runner': return humanoid({ col, weapon: 'sword', helm: 'cap', hood: shadeHex(col, -0.2), skin: SKIN, lean: 1 });
      case 'shield': return humanoid({ col, helm: 1, weapon: 'sword', shield: 'big', shieldCol: '#8b95a8', skin: '#e0b894' });
      case 'archer': return humanoid({ col, helm: 'hood', hood: shadeHex(col, -0.25), bow: true, quiver: true, weapon: 'none' });
      case 'healer': return humanoid({ col, robe: '#efe9da', helm: 'hood', hood: '#efe9da', weapon: 'staff', weaponCol: '#9bf0a6', cross: true });
      case 'bomber': return humanoid({ col, helm: 'cap', hood: '#3a3a3a', keg: true, weapon: 'none', skin: '#8fbf5a' });
      case 'thief': return humanoid({ col, helm: 'hood', hood: '#1f4a37', sack: true, weapon: 'sword', skin: '#e8c39a', eye: '#222' });
      case 'sapper': return humanoid({ col, helm: 'pot', weapon: 'hammer', keg: false, skin: SKIN, beard: '#6a4a2a' });
      case 'warchief': return humanoid({ col, helm: 'horns', weapon: 'axe', banner: true, bulk: 1.15, cape: '#7a1624', skin: '#c98a6a', ears: true, beard: '#3a2418', tusks: true });
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
      case 'boss_warlord': return humanoid({ col, helm: 'horns', weapon: 'axe', bulk: 1.3, cape: '#7a1624', skin: '#c98a6a', shield: true, shieldCol: '#5b1620', banner: false, ears: true, tusks: true, beard: '#2a1a10' });
      case 'boss_lich': return humanoid({ col, robe: '#2c4d66', helm: 'crown', weapon: 'staff', weaponCol: '#9fe7ff', orb: '#9fe7ff', skin: '#dfe9ef', eye: '#bff', eyeGlow: '#7fd6ff', bulk: 1.15 });
      case 'boss_hydra': return hydra(col);
      case 'warg': return quad({ col, len: 1.0, h: 0.44, girth: 0.85, mane: shadeHex(col, -0.25), fangs: true, ears: 0.18, muzzle: 0.27, eye: '#ffcf4a', eyeGlow: '#d08a10', belly: shadeHex(col, 0.2) });
      case 'rat': return quad({ col, len: 0.7, h: 0.22, tailCol: '#c99a8a', muzzle: 0.2, ears: 0.1, earCol: '#c99a8a', fangs: true, eye: '#ff4a3a', girth: 1.1 });
      case 'pavise': { const u = humanoid({ col, helm: 2, weapon: 'sword', skin: SKIN }); const pv = k.box(0.08, 1.15, 0.7, '#8a7a55', 0.28, -0.75, 0); pv.add(k.box(0.09, 0.12, 0.72, '#4a3a22', 0, 0.45, 0)); u.armL.add(pv); u.armL.rotation.z = 0.1; u.fixedL = true; return u; }
      case 'mangonel': return catapult({ crew: '#c0392b' });
      case 'berserker': return humanoid({ col, helm: undefined, weapon: 'axe', bulk: 1.18, skin: '#9aaa6a', belt: '#3a2a1a', ears: true, tusks: true, bare: true, hair: '#7a2a10', eye: '#ff5a3a', eyeGlow: '#ff3a20', hunch: -0.1 });
      case 'escalade': return escaladeTeam(col);
      case 'siegetower': return siegeTower();
      case 'wight': { const u = humanoid({ col, ghost: true, robe: shadeHex(col, -0.35), skin: '#cfe3d4', helm: 'hood', hood: shadeHex(col, -0.45), eye: '#bff', eyeGlow: '#7fffd0', weapon: 'sword', weaponCol: '#8a9a94' }); u.ghost = true; return u; }
      case 'treant': return treant(col, false);
      case 'fellrider': { const f = flyer(col, { wing: '#23262e', belly: '#4a4f5c' }); return riderOn(f, humanoid({ col: '#1c1e26', helm: 'hood', hood: '#1c1e26', weapon: 'lance', skin: '#9ab', eyeGlow: '#7fd6ff', eye: '#bff' }), 0.55, 1.05); }
      case 'boss_pitfiend': return fiend(col);
      case 'boss_wraithking': { const f = flyer('#2b303b', { boss: true, wing: '#1c1f28', belly: '#3a4050' }); return riderOn(f, humanoid({ col: '#2a3140', robe: '#2a3140', helm: 'crown', weapon: 'sword', weaponCol: '#9fe7ff', skin: '#dfe9ef', eye: '#bff', eyeGlow: '#7fd6ff', bulk: 1.1 }), 0.75, 1.15); }
      case 'boss_beastmaster': { const u = humanoid({ col, helm: 'horns', weapon: 'glaive', bulk: 1.3, skin: '#c98a6a', cape: '#4a3018', ears: false, belt: '#2a1a0a' }); const w = quad({ col: '#6b6258', len: 0.95, h: 0.42, mane: '#4a4238', fangs: true, ears: 0.18, muzzle: 0.22, eye: '#ffcf4a', eyeGlow: '#d08a10' }); w.root.scale.setScalar(0.75); w.root.position.set(0.1, 0, 0.95); u.root.add(w.root); (u.pets ||= []).push(w); return u; }
      case 'boss_trebuchet': return catapult({ big: true, wood: '#6a4a2a', crew: '#8a2a2a' });
      case 'boss_elderoak': return treant(col, true);
      // v1.39 foes
      case 'phalanx': { const u = humanoid({ col, helm: Math.max(2, helm || 2), weapon: 'pike', shield: 'big', shieldCol: '#8a6a3a', skin: '#e0b894' }); return u; }
      case 'sapwright': { const u = humanoid({ col, helm: 'pot', weapon: 'hammer', skin: SKIN, belt: '#5a3d22' }); const plank = k.box(0.06, 0.7, 0.22, '#8a6a3a', -0.24, 1.0, 0); plank.rotation.z = 0.3; u.torso.add(plank); return u; }
      case 'barricade': {
        const root = grp(), body = grp(), u = { root, body, legs: [], arms: [], tag: 'structure', legsLocked: true };
        root.add(body);
        for (const z of [-0.35, 0, 0.35]) { const post = k.box(0.12, 0.9, 0.12, '#6a4a2a', 0, 0, z); body.add(post); body.add(k.cone(0.07, 0.18, '#8a6a3a', 4, 0, 0.9, z)); }
        for (const y of [0.25, 0.6]) body.add(k.box(0.1, 0.12, 0.95, '#8a6a3a', 0.05, y, 0));
        for (const z of [-1, 1]) { const st = k.box(0.08, 0.08, 0.9, '#5a3d22', 0.3, 0.35, z * 0.18); st.rotation.x = z * 0.9; st.rotation.z = 0.6; body.add(st); }
        return u;
      }
      case 'mirror': { const u = humanoid({ col, robe: '#d8eef4', helm: 'hood', hood: '#9adbe8', weapon: 'staff', weaponCol: '#e8fbff', skin: '#e0d0e8', eye: '#9adbe8', eyeGlow: '#7fd3f2' }); const m = k.cyl(0.24, 0.24, 0.03, '#e8fbff', 12, 0.3, 1.5, 0, k.glow('#9adbe8')); m.rotation.z = Math.PI / 2; u.torso.add(m); u.orb = m; return u; }
      case 'minesapper': { const u = mole(col); u.body.add(k.cyl(0.12, 0.12, 0.22, '#7a4a22', 8, -0.2, 0.55, 0), k.sph(0.04, '#ffd25e', -0.2, 0.72, 0, k.glow('#ff8a2a'))); return u; }
      case 'herald': return humanoid({ col, helm: 3, weapon: 'sword', banner: true, bannerCol: '#c8a030', tabard: '#c8a030', bulk: 1.1, cape: '#7a5a18', skin: '#e0b894', shield: true, shieldCol: '#c8a030' });
      case 'boss_frostgiant': return brute('#9ac8e8', { skin: '#bfe0f2', helm: 'horns', weapon: 'club', bulk: 1.7, eye: '#7fe9ff', eyeGlow: '#5fd0ff', belt: '#4a6a8a' });
      default: return humanoid({ col, weapon: 'sword', helm });
    }
  }

  const TC = { footman: ['#3a8fd0', { helm: 1, weapon: 'sword', shield: true, shieldCol: '#3a8fd0' }], bowman: ['#5a9a3a', { helm: 'hood', hood: '#4a7a2a', bow: true, quiver: true, weapon: 'none' }],
    pikeman: ['#6a7ab0', { helm: 2, weapon: 'pike' }], crossbow: ['#8a6a3a', { helm: 'pot', bow: true, weapon: 'none' }], knight: ['#c0c8d8', { helm: 4, weapon: 'sword', shield: 'big', shieldCol: '#2a4a9a', tabard: '#2a4a9a', cape: '#2a4a9a', bulk: 1.15 }],
    cleric: ['#f0ebdd', { robe: '#f0ebdd', helm: 'hood', hood: '#f0ebdd', weapon: 'mace', cross: true }], engineer: ['#c98a3a', { helm: 'cap', hood: '#c98a3a', weapon: 'hammer' }] };
  function troop(u) {
    const D = TROOPS[u.kind], c = D.color || '#3a8fd0';
    if (u.kind === 'cavalry') return mount(humanoid({ col: c, helm: 3, weapon: 'lance', skin: SKIN, cape: '#9a2a2a' }), '#e8e0d0', { mane: '#8a6a3a' });
    if (u.kind === 'griffon') { const g = flyer('#c79a4a', { wing: '#e8d7a8', belly: '#f2e6c4' }); const r = humanoid({ col: c, helm: 3, weapon: 'lance' }); seat(r); r.root.scale.setScalar(0.55); r.root.position.set(0.05, 1.05 - 0.44 + 0.08, 0); g.body.add(r.root); g.rider = r; return g; }
    const cfg = TC[u.kind] || ['#3a8fd0', { helm: 1, weapon: 'sword' }];
    return humanoid({ col: D.color || cfg[0], ...cfg[1] });
  }
  function soldier(so) { return humanoid({ col: '#3a7fc0', helm: 1, weapon: 'sword', shield: true, shieldCol: '#3a7fc0' }); }
  // Your warrior (Warrior mode): a hero of its class, a head taller in its gear than the rank and file.
  function champion(cls) {
    if (cls === 'berserker') return humanoid({ col: '#7a3a22', skin: SKIN, helm: 'horns', weapon: 'axe', weaponCol: '#d8dde8', bare: true, sleeve: SKIN, beard: '#a0522d', bulk: 1.3, cape: '#3a2418', belt: '#2a1a10', pants: '#4a3426' });
    if (cls === 'ranger') return humanoid({ col: '#3f6a3a', helm: 'hood', hood: '#2a4f2a', bow: true, quiver: true, weapon: 'none', cape: '#2f4a2a', belt: '#5a3a1a' });
    if (cls === 'mage') return humanoid({ col: '#3a2c7a', robe: '#3a2c7a', helm: 'hat', weapon: 'staff', weaponCol: '#ff8a3a', tabard: '#e2b04a' });
    return humanoid({ col: '#c9ced9', helm: 4, weapon: 'sword', weaponCol: '#eef2fa', shield: true, shieldCol: '#b8233a', tabard: '#b8233a', cape: '#8a1a2a', bulk: 1.15 });
  }

  // ---------- animation ----------
  function animate(u, st) {
    const mv = st.moving ? 1 : 0, ph = st.ph, t = st.t, sw = Math.sin(ph) * mv;
    const bob = Math.abs(Math.sin(ph)) * 0.06 * mv;
    u.body.position.y = u.fly ? Math.sin(t * 3) * 0.06 : bob;
    if (u.tag === 'human') {
      if (!u.legsLocked) u.legs.forEach((l, i) => {
        const p = ph + (i ? Math.PI : 0);
        l.rotation.z = Math.sin(p) * 0.65 * mv;
        // the knee bends as the leg swings through, and a little at every step
        if (u.knees[i]) u.knees[i].rotation.z = -(0.08 + 0.85 * Math.max(0, Math.cos(p))) * mv - 0.04;
      });
      const atk = st.swing > 0 ? 1 - st.swing / 0.25 : st.attack ? (Math.sin(t * 9) + 1) / 2 : -1;
      if (u.armR) u.armR.rotation.z = atk >= 0 ? -0.5 + atk * 2.3 : Math.sin(ph + Math.PI) * 0.45 * mv + 0.12;
      if (u.armL && !u.fixedL) u.armL.rotation.z = Math.sin(ph) * 0.45 * mv + 0.1;
      // elbows: bent a little at rest, more on the back-swing; a blow straightens the arm
      if (u.elbowR) u.elbowR.rotation.z = atk >= 0 ? 0.9 - atk * 0.8 : 0.25 + 0.35 * Math.max(0, Math.sin(ph)) * mv;
      if (u.elbowL && !u.fixedL) u.elbowL.rotation.z = u.bow ? 0.15 : 0.25 + 0.35 * Math.max(0, Math.sin(ph + Math.PI)) * mv + (u.shield ? 0.5 : 0);
      if (u.bow && st.attack) { u.armL.rotation.z = 1.45; if (u.elbowL) u.elbowL.rotation.z = 0.05; }
      if (u.cape) u.cape.rotation.z = 0.12 + 0.15 * mv + Math.sin(t * 3) * 0.04;
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
      u.legs.forEach((l, i) => {
        const p = ph + (i === 0 || i === 3 ? 0 : Math.PI);
        l.rotation.z = Math.sin(p) * 0.6 * mv;
        // front knees fold back as the leg lifts, hind hocks the other way
        if (u.knees[i]) u.knees[i].rotation.z = (u.knees[i].userData.back ? 1 : -1) * (0.1 + 0.7 * Math.max(0, Math.cos(p))) * mv;
      });
      u.body.position.y = Math.abs(Math.sin(ph)) * 0.05 * mv;
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
      const fl = t * 8 + (u.flapOff || 0);
      u.wings.forEach((w) => { w.rotation.x = -w.userData.side * (0.1 + Math.sin(fl) * 0.55); });
      (u.tips || []).forEach((tp) => { tp.rotation.x = -tp.userData.side * (Math.sin(fl - 0.9) * 0.45 - 0.05); });   // the outer wing follows a beat behind
      u.body.rotation.z = Math.sin(fl) * 0.05;
      if (u.tail) u.tail.rotation.y = Math.sin(t * 2.5) * 0.3;
      if (u.glow) u.glow.scale.setScalar(0.8 + 0.4 * Math.sin(t * 6));
      if (u.rider && u.rider.armR) { const a = st.swing > 0 ? 1 - st.swing / 0.25 : 0; u.rider.armR.rotation.z = -0.2 + a * 1.4; }
    } else if (u.tag === 'hydra') {
      u.necks.forEach(({ neck, segs, hd, phase }) => {
        const sway = Math.sin(t * 1.6 + phase), lunge = st.attack ? Math.max(0, Math.sin(t * 5 + phase)) : 0;
        segs.forEach((s, i) => { s.position.set(i * 0.1 + lunge * i * 0.12, i * 0.28 - lunge * i * 0.06, sway * i * 0.1); });
        hd.position.set(0.4 + lunge * 0.4, 1.12 - lunge * 0.2, sway * 0.4); hd.rotation.y = -sway * 0.4;
      });
    } else if (u.tag === 'siege') {
      u.wheels.forEach((w) => { w.rotation.z = -ph * 0.35 * (mv ? 1 : 0); });
      u.body.position.y = Math.abs(Math.sin(ph * 0.7)) * 0.015 * mv;
      if (u.arm) u.arm.rotation.z = -0.9 + 1.9 * Math.pow(Math.max(0, Math.sin(t * 1.3)), 6) * (st.attack || st.moving ? 1 : 0.3);
    }
    if (u.pets) for (const p of u.pets) animate(p, st);
    if (u.head && u.tag === 'human') u.head.rotation.z = -st.hit * 0.3;
  }

  return { enemy: (e) => bake(enemy(e)), troop: (u) => bake(troop(u)), soldier: (so) => bake(soldier(so)), champion: (cls) => bake(champion(cls)), animate, shadeHex, bake };
}
