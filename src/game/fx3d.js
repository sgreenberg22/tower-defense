// Real 3D effects for the 3D view: heavy projectiles (cannonballs, boulders, ballista bolts, mortar shells) as lit models
// with smoke trails, and explosions as a fireball, rolling smoke, flying debris, a shockwave ring, a scorch mark and a
// flash of light. Everything is pooled in a few instanced meshes, so a big wave costs a handful of draw calls.
// The simulation never knows: render3d.js feeds this from the game state and from the play screen's impact events.

const TAU = Math.PI * 2;

// One pool of instanced particles. Each particle: position, velocity, life, size curve and colour curve.
class Pool {
  constructor(THREE, geo, mat, cap) {
    this.T = THREE; this.cap = cap; this.list = [];
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(); this.c = new THREE.Color(); this.c2 = new THREE.Color();
    this.mesh.setColorAt(0, this.c.set('#ffffff'));
  }
  add(p) { if (this.list.length >= this.cap) this.list.shift(); p.t = 0; this.list.push(p); return p; }
  update(dt) {
    const { m4, q, e, v, s, c, c2 } = this;
    let n = 0;
    this.list = this.list.filter((p) => (p.t += dt) < p.life);
    for (const p of this.list) {
      const k = p.t / p.life;
      if (p.vx !== undefined) {
        p.vy -= (p.g || 0) * dt;
        const drag = Math.max(0, 1 - (p.drag || 0) * dt);
        p.vx *= drag; p.vz *= drag; if (p.drag) p.vy *= drag;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.bounce && p.y < p.r0) { p.y = p.r0; p.vy = -p.vy * 0.35; p.vx *= 0.6; p.vz *= 0.6; p.spin *= 0.6; }
      }
      const size = p.size(k);
      if (p.q) q.copy(p.q); else { e.set((p.rx || 0) + (p.spin || 0) * p.t, (p.ry || 0) + (p.spin || 0) * p.t * 0.7, p.rz || 0); q.setFromEuler(e); }
      s.set(size * (p.sx || 1), size * (p.sy || 1), size * (p.sz || 1));
      if (p.wobble) v.set(p.x + Math.sin(p.t * 3 + p.wobble) * 0.08, p.y, p.z + Math.cos(p.t * 2.6 + p.wobble) * 0.08); else v.set(p.x, p.y, p.z);
      m4.compose(v, q, s);
      this.mesh.setMatrixAt(n, m4);
      c.set(p.c0); if (p.c1) c.lerp(c2.set(p.c1), Math.min(1, k * (p.cs || 1)));
      if (p.fade) c.multiplyScalar(Math.max(0, 1 - Math.pow(k, p.fade)));
      this.mesh.setColorAt(n, c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.list = []; this.mesh.count = 0; }
}

export class Fx3D {
  constructor(THREE, scene, kit) {
    this.T = THREE; this.scene = scene; this.kit = kit;
    const lamb = (o = {}) => new THREE.MeshLambertMaterial({ flatShading: true, ...o });
    const add = (o = {}) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...o });
    this.group = new THREE.Group(); scene.add(this.group);
    // particles
    this.fire = new Pool(THREE, new THREE.IcosahedronGeometry(1, 1), add(), 160);
    this.smoke = new Pool(THREE, new THREE.IcosahedronGeometry(1, 0), lamb({ transparent: true, opacity: 0.5, depthWrite: false }), 320);
    this.debris = new Pool(THREE, new THREE.BoxGeometry(1, 1, 1), lamb(), 220);
    this.spark = new Pool(THREE, new THREE.OctahedronGeometry(1, 0), add(), 200);
    this.ring = new Pool(THREE, new THREE.RingGeometry(0.8, 1, 28).rotateX(-Math.PI / 2), add({ side: THREE.DoubleSide }), 40);
    this.scorch = new Pool(THREE, new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: kit.tex('blob'), transparent: true, depthWrite: false, opacity: 0.9 }), 60);
    this.scorch.mesh.renderOrder = 2;
    this.smoke.mesh.castShadow = false; this.debris.mesh.castShadow = true;
    // projectiles
    const boltGeo = (() => {
      const shaft = new THREE.CylinderGeometry(0.025, 0.025, 0.5, 5).rotateZ(Math.PI / 2).toNonIndexed();
      const tip = new THREE.ConeGeometry(0.05, 0.14, 5).rotateZ(-Math.PI / 2).translate(0.31, 0, 0).toNonIndexed();
      const fin = new THREE.BoxGeometry(0.12, 0.01, 0.1).translate(-0.2, 0, 0).toNonIndexed();
      const out = new THREE.BufferGeometry(), pos = [], nor = [];
      for (const g of [shaft, tip, fin]) { pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
      out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      return out;
    })();
    this.balls = new Pool(THREE, new THREE.SphereGeometry(1, 12, 8), lamb({ flatShading: false }), 120);
    this.rocks = new Pool(THREE, new THREE.DodecahedronGeometry(1, 0), lamb(), 80);
    this.bolts = new Pool(THREE, boltGeo, lamb(), 80);
    for (const p of [this.balls, this.rocks, this.bolts]) p.mesh.castShadow = true;
    // castle arts
    this.meteors = new Pool(THREE, new THREE.DodecahedronGeometry(1, 1), lamb({ emissive: new THREE.Color('#ff5a14'), emissiveIntensity: 0.8 }), 8);
    this.arrows = new Pool(THREE, boltGeo, lamb(), 260);
    this.spikes = new Pool(THREE, new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0), lamb({ color: '#9aa1ad' }), 400);
    this.shards = new Pool(THREE, new THREE.ConeGeometry(1, 1, 5).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ flatShading: true, transparent: true, opacity: 0.85, emissive: new THREE.Color('#2a6a8a'), emissiveIntensity: 0.5 }), 260);
    this.glows = new Pool(THREE, new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: kit.tex('glow'), transparent: true, depthWrite: false }), 60);
    this.glows.mesh.renderOrder = 2;
    this.bolt = new Pool(THREE, new THREE.BoxGeometry(1, 1, 1), add(), 260);
    this.motes = new Pool(THREE, new THREE.OctahedronGeometry(1, 0), add(), 300);
    this.thin = new Pool(THREE, new THREE.RingGeometry(0.965, 1, 64).rotateX(-Math.PI / 2), add({ side: THREE.DoubleSide }), 12);
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#8fd0ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.dome.visible = false;
    this.cloud = null;   // the thunderstorm's sky
    for (const p of [this.meteors, this.arrows, this.spikes]) p.mesh.castShadow = true;
    this.group.add(this.dome);
    for (const p of [this.scorch, this.ring, this.smoke, this.debris, this.fire, this.spark, this.balls, this.rocks, this.bolts, this.meteors, this.arrows, this.spikes, this.shards, this.glows, this.bolt, this.motes, this.thin]) this.group.add(p.mesh);
    this.seen = new WeakSet();
    // one light for every flash (always in the scene so materials never need recompiling)
    this.light = new THREE.PointLight('#ffb35a', 0, 6, 1.6); this.light.position.set(0, -10, 0); this.group.add(this.light);
    this.lightT = 0;
    this.trailT = new WeakMap();
  }

  // Which projectiles this layer draws (the rest stay 2D).
  handles(p) {
    if (p.kind === 'ball' || p.kind === 'boulder' || p.kind === 'bolt') return true;
    return p.kind === 'hero' && (p.weapon === 'mortar' || p.weapon === 'handcannon' || p.weapon === 'meteorstaff' || p.weapon === 'titanbolt');
  }

  // Place this frame's heavy projectiles. Lobbed shot rides its arc; bolts point where they fly.
  projectiles(game, dt, liftOf) {
    const B = [], R = [], L = [];
    for (const p of game.projectiles) {
      if (!this.handles(p)) continue;
      const h = 0.5 + (p.arc || 0) * 1.1;
      if (p.kind === 'ball' || (p.kind === 'hero' && (p.weapon === 'mortar' || p.weapon === 'handcannon'))) {
        const big = p.kind === 'hero' ? (p.weapon === 'mortar' ? 0.13 : 0.09) * (p.charge >= 0.95 ? 1.4 : 1) : 0.09;
        B.push({ x: p.x, y: p.kind === 'hero' ? 1.1 : h, z: p.y, r: big, c: '#2d2f36' });
        this.trail(p, p.x, p.kind === 'hero' ? 1.1 : h, p.y, 0.6, '#cfcfcf');
      } else if (p.kind === 'boulder' || p.weapon === 'meteorstaff') {
        const fire = p.fireField || p.weapon === 'meteorstaff';
        R.push({ x: p.x, y: p.kind === 'hero' ? 1.1 : h, z: p.y, r: p.kind === 'hero' ? 0.16 : 0.15, c: fire ? '#e0632f' : '#7b6a4f', spin: (p.travelled || p.t || 0) * 4 });
        this.trail(p, p.x, p.kind === 'hero' ? 1.1 : h, p.y, fire ? 1 : 0.8, fire ? '#ff8a3c' : '#bdb3a2', fire);
      } else {
        const ang = Math.atan2(p.dy || 0, p.dx || 1);
        L.push({ x: p.x, y: p.kind === 'hero' ? 1.1 : 0.55, z: p.y, ang, c: p.kind === 'hero' ? '#3d2a14' : '#6d4a2a', s: p.kind === 'hero' ? 1.5 : 1.2 });
      }
    }
    this.place(this.balls, B, (o) => [o.r, 0, 0]);
    this.place(this.rocks, R, (o) => [o.r, o.spin, o.spin * 0.7]);
    this.place(this.bolts, L, (o) => [o.s, 0, -o.ang]);
  }
  place(pool, items, f) {
    const { m4, q, e, v, s, c } = pool;
    items.forEach((o, i) => {
      if (i >= pool.cap) return;
      const [sc, rx, ry] = f(o);
      e.set(rx, ry, 0); q.setFromEuler(e); s.set(sc, sc, sc);
      m4.compose(v.set(o.x, o.y, o.z), q, s); pool.mesh.setMatrixAt(i, m4); pool.mesh.setColorAt(i, c.set(o.c));
    });
    pool.mesh.count = Math.min(items.length, pool.cap);
    pool.mesh.instanceMatrix.needsUpdate = true;
    if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
  }
  // A puff of smoke left behind a flying shot every few hundredths of a second.
  trail(p, x, y, z, s, col, fire = false) {
    const now = performance.now(), last = this.trailT.get(p) || 0;
    if (now - last < 45) return;
    this.trailT.set(p, now);
    this.smoke.add({ x, y, z, vx: 0, vy: 0.25, vz: 0, drag: 1, life: 0.7, size: (k) => 0.05 * s + 0.12 * s * k, c0: col, c1: '#e8e8e8' });
    if (fire) this.fire.add({ x, y, z, life: 0.25, size: (k) => 0.08 * (1 - k), c0: '#ffd27a', c1: '#ff5a1a' });
  }

  // An explosion of radius r at tile (x, y). `scale` grows everything for the big guns.
  boom(x, y, r = 0.7, kind = 'ball') {
    const big = kind === 'boulder' || kind === 'meteor' ? 1.35 : kind === 'hero' ? 1.1 : 1, R = Math.max(0.4, r) * big, z = y;
    const rnd = Math.random;
    // the fireball: a hot core and licks of flame
    this.fire.add({ x, y: 0.22, z, life: 0.32, size: (k) => R * (0.2 + 0.35 * Math.sqrt(k)) * (k > 0.6 ? (1 - k) / 0.4 : 1), c0: '#d8a050', c1: '#902a08', cs: 1.4 });
    for (let i = 0; i < 7; i++) {
      const a = rnd() * TAU, sp = 0.6 + rnd() * 1.4;
      this.fire.add({ x, y: 0.2, z, vx: Math.cos(a) * sp * R, vy: 0.6 + rnd() * 1.2, vz: Math.sin(a) * sp * R, drag: 3, life: 0.35 + rnd() * 0.2, size: (k) => R * 0.16 * (1 - k), c0: '#c87830', c1: '#701808' });
    }
    // rolling smoke that rises and spreads
    for (let i = 0; i < 7; i++) {
      const a = rnd() * TAU, sp = 0.3 + rnd() * 0.8, g = 0.62 + rnd() * 0.2;
      this.smoke.add({ x: x + Math.cos(a) * R * 0.2, y: 0.2, z: z + Math.sin(a) * R * 0.2, vx: Math.cos(a) * sp * R, vy: 0.5 + rnd() * 0.7, vz: Math.sin(a) * sp * R, drag: 1.6, life: 1.1 + rnd() * 0.8,
        size: (k) => R * (0.07 + 0.2 * Math.sqrt(k)) * (k > 0.75 ? (1 - k) * 4 : 1), c0: '#7a7068', c1: `rgb(${Math.round(g * 255)},${Math.round(g * 250)},${Math.round(g * 245)})`, cs: 2.2, rx: rnd() * 3, ry: rnd() * 3, spin: (rnd() - 0.5) * 1.5 });
    }
    // debris: clods and stones thrown out, bouncing to rest
    for (let i = 0; i < 9; i++) {
      const a = rnd() * TAU, sp = 1 + rnd() * 2.2, s0 = 0.03 + rnd() * 0.05;
      this.debris.add({ x, y: 0.15, z, vx: Math.cos(a) * sp, vy: 1.5 + rnd() * 2.5, vz: Math.sin(a) * sp, g: 9, bounce: true, r0: s0 * 0.5, life: 1.1 + rnd() * 0.6, size: (k) => s0 * (k > 0.85 ? (1 - k) / 0.15 : 1), c0: rnd() < 0.5 ? '#5a4632' : '#7a7266', rx: rnd() * 3, ry: rnd() * 3, spin: (rnd() - 0.5) * 14 });
    }
    // sparks
    for (let i = 0; i < 10; i++) {
      const a = rnd() * TAU, sp = 2 + rnd() * 3;
      this.spark.add({ x, y: 0.3, z, vx: Math.cos(a) * sp, vy: 1 + rnd() * 3, vz: Math.sin(a) * sp, g: 7, life: 0.4 + rnd() * 0.3, size: (k) => 0.035 * (1 - k), c0: '#fff3c0', c1: '#ff8a2a' });
    }
    // shockwave and scorch
    this.ring.add({ x, y: 0.05, z, life: 0.35, size: (k) => R * (0.3 + 0.8 * k), c0: '#b07a40', c1: '#402010', fade: 1 });
    this.scorch.add({ x, y: 0.02, z, life: 5, size: (k) => R * 1.5 * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1), c0: '#ffffff' });
    // the flash of light
    this.light.position.set(x, 0.8, z); this.light.intensity = 1.6 * big; this.light.distance = 2.5 + R * 2; this.lightT = 0.22;
  }
  // A little burst where a cannon or catapult fires.
  muzzle(tower, kind) {
    const x = tower.cx, z = tower.cy, a = tower.aim ?? -Math.PI / 2, dx = Math.cos(a), dz = Math.sin(a), y = kind === 'ball' ? 0.6 : 0.9;
    for (let i = 0; i < 5; i++) this.smoke.add({ x: x + dx * 0.45, y, z: z + dz * 0.45, vx: dx * (0.5 + Math.random()), vy: 0.3 + Math.random() * 0.3, vz: dz * (0.5 + Math.random()), drag: 2.5, life: 0.8, size: (k) => 0.06 + 0.16 * k, c0: '#d8d4cc', c1: '#f0f0f0' });
    if (kind === 'ball') this.fire.add({ x: x + dx * 0.5, y, z: z + dz * 0.5, life: 0.12, size: (k) => 0.14 * (1 - k * 0.5), c0: '#fff2b0', c1: '#ff8a2a' });
  }
  // A puff of dust when a foe falls, in its own colour.
  dust(x, y, col = '#b8a88a', air = false) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * TAU;
      this.smoke.add({ x, y: air ? 0.4 : 0.08, z: y, vx: Math.cos(a) * 0.6, vy: 0.2 + Math.random() * 0.3, vz: Math.sin(a) * 0.6, drag: 3, life: 0.6, size: (k) => 0.05 + 0.12 * k * (1 - k), c0: col, c1: '#d8d0c0' });
    }
  }

  // The Frost Giant's breath: a burst of ice shards and a cold ring round it.
  frostBreath(x, y, r) {
    this.thin.add({ x, y: 0.06, z: y, life: 0.7, size: (k) => r * (0.3 + 0.7 * k), c0: '#bfe9ff', c1: '#2a6aa0', fade: 1.2 });
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * TAU, d = 0.4 + Math.sqrt(Math.random()) * r, s0 = 0.06 + Math.random() * 0.1;
      this.shards.add({ x: x + Math.cos(a) * d, y: 0, z: y + Math.sin(a) * d, life: 1.4, size: (k) => s0 * Math.min(1, k * 8) * (k > 0.7 ? (1 - k) / 0.3 : 1), sy: 2.4, rx: (Math.random() - 0.5) * 0.6, rz: (Math.random() - 0.5) * 0.6, ry: Math.random() * TAU, c0: '#d8f2ff' });
    }
    for (let i = 0; i < 8; i++) this.smoke.add({ x, y: 0.4, z: y, vx: (Math.random() - 0.5) * 2, vy: 0.2, vz: (Math.random() - 0.5) * 2, drag: 2, life: 1.2, size: (k) => 0.2 + 0.4 * k, c0: '#e8f6ff', c1: '#ffffff' });
  }
  // The Bell of Thunder: a wedge of thunder rolling out from the wall.
  bell(o) {
    const steps = Math.ceil(o.range / 0.7);
    for (let i = 1; i <= steps; i++) {
      const d = i * 0.7, w = d * Math.tan(o.arc), delay = i * 0.03;
      for (const side of [-1, 0, 1]) {
        const a = o.ang + side * o.arc * 0.8, x = o.ox + Math.cos(a) * d, z = o.oy + Math.sin(a) * d;
        this.motes.add({ x, y: 0.6, z, vx: Math.cos(a) * 2, vy: 0.4, vz: Math.sin(a) * 2, life: 0.35 + delay, size: (k) => (k * (0.35 + delay) < delay ? 0 : 0.06 + w * 0.05), c0: '#e8eeff', c1: '#5a70c0' });
      }
    }
    this.thin.add({ x: o.ox, y: 1.2, z: o.oy, life: 0.4, size: (k) => 0.4 + 2.5 * k, c0: '#c8d4ff', c1: '#3040a0', fade: 1 });
    this.light.color.set('#c8d4ff'); this.light.position.set(o.ox + Math.cos(o.ang) * 2, 1.4, o.oy + Math.sin(o.ang) * 2); this.light.intensity = 2; this.light.distance = 7; this.lightT = 0.2;
    setTimeout(() => this.light.color.set('#ffb35a'), 220);
  }

  // ---------- castle arts ----------
  // Every frame: meteors falling towards their mark, the plague's cloud, the spike field, the Aegis dome and the storm's sky.
  arts(game, dt) {
    const rnd = Math.random, V = this.T.Vector3;
    // meteors: a burning rock dropping out of the sky at a slant, with a warning glow where it will land
    const M = [];
    for (const v of game.volleys) {
      if (!v.meteor) continue;
      const k = Math.max(0, v.t) / (v.warn || 1.3), h = 0.3 + k * 16;
      const x = v.x + k * 6, z = v.y - k * 3;
      M.push({ x, y: h, z, r: 0.42 * (v.r / 2), spin: game.time * 3, c: '#6a3a22' });
      if (!this.seen.has(v)) { this.seen.add(v); this.glows.add({ x: v.x, y: 0.02, z: v.y, life: (v.warn || 1.3) + 0.1, size: (q) => v.r * 2 * (0.6 + 0.4 * q), c0: '#401000', c1: '#ff5a14' }); }
      if (rnd() < dt * 60) {
        this.fire.add({ x: x + (rnd() - 0.5) * 0.2, y: h, z: z + (rnd() - 0.5) * 0.2, vx: 0, vy: 0, vz: 0, life: 0.45, size: (q) => 0.35 * (1 - q), c0: '#e0a040', c1: '#801a04' });
        this.smoke.add({ x, y: h + 0.2, z, vx: 0.4, vy: 0.4, vz: -0.2, drag: 1, life: 1.2, size: (q) => 0.15 + 0.35 * q, c0: '#5a4a40', c1: '#b8b0a8', cs: 1.5 });
      }
    }
    this.place(this.meteors, M, (o) => [o.r, o.spin, o.spin * 0.6]);
    // zones: a rolling green cloud for the plague, steel spikes for the spike field
    for (const zn of game.zones) {
      if (zn.kind === 'plague') {
        if (!this.seen.has(zn)) { this.seen.add(zn); this.glows.add({ x: zn.x, y: 0.02, z: zn.y, life: zn.t, size: (q) => zn.r * 2.1 * (q < 0.08 ? q / 0.08 : q > 0.9 ? (1 - q) * 10 : 1), c0: '#3a7a10', c1: '#2a5a08' }); }
        const rate = 26 * zn.r * dt;
        for (let i = 0; i < rate || (i === 0 && rnd() < rate); i++) {
          const a = rnd() * TAU, d = Math.sqrt(rnd()) * zn.r * 0.9;
          this.smoke.add({ x: zn.x + Math.cos(a) * d, y: 0.1 + rnd() * 0.3, z: zn.y + Math.sin(a) * d, vx: (rnd() - 0.5) * 0.3, vy: 0.12 + rnd() * 0.2, vz: (rnd() - 0.5) * 0.3, drag: 0.5, life: 1.6 + rnd(), wobble: rnd() * 6,
            size: (q) => (0.14 + 0.3 * Math.sin(q * Math.PI)) * Math.min(1, zn.r / 1.6), c0: '#6fbf3a', c1: '#a8d870', cs: 1, rx: rnd() * 3, ry: rnd() * 3, spin: (rnd() - 0.5) });
        }
        if (rnd() < dt * 8) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * zn.r; this.motes.add({ x: zn.x + Math.cos(a) * d, y: 0.05, z: zn.y + Math.sin(a) * d, vx: 0, vy: 0.5, vz: 0, life: 1.2, size: (q) => 0.04 * Math.sin(q * Math.PI), c0: '#c8ff70', c1: '#407010' }); }
      } else if (zn.kind === 'caltrops' && !this.seen.has(zn)) {
        this.seen.add(zn);
        const n = Math.round(22 * zn.r);
        for (let i = 0; i < n; i++) {
          const a = rnd() * TAU, d = Math.sqrt(rnd()) * zn.r, s0 = 0.05 + rnd() * 0.04;
          this.spikes.add({ x: zn.x + Math.cos(a) * d, y: 0, z: zn.y + Math.sin(a) * d, life: zn.t, size: (q) => s0 * (q < 0.05 ? q / 0.05 : q > 0.92 ? (1 - q) / 0.08 : 1), sy: 2.2, rx: (rnd() - 0.5) * 0.6, ry: rnd() * TAU, c0: '#a8aeb8' });
        }
      }
    }
    // Aegis: a shimmering dome over the castle while it lasts
    if (game.aegisT > 0) {
      const c = game.map.castle; this.dome.visible = true; this.dome.position.set(c.x, 0, c.y); this.dome.scale.set(2.8, 2.2, 2.8);
      this.dome.material.opacity = 0.16 + 0.06 * Math.sin(game.time * 5) + (game.aegisT < 1 ? -0.16 * (1 - game.aegisT) : 0);
    } else this.dome.visible = false;
    // Time Stop: frozen motes hang in the air around every foe
    if (game.stasisT > 0 && rnd() < dt * 30) {
      const e = game.enemies[Math.floor(rnd() * game.enemies.length)];
      if (e && !e.dead) this.motes.add({ x: e.x + (rnd() - 0.5) * 0.5, y: 0.2 + rnd() * 0.6, z: e.y + (rnd() - 0.5) * 0.5, life: 0.9, size: (q) => 0.035 * Math.sin(q * Math.PI), c0: '#d8c8ff', c1: '#6a4ac8' });
    }
    // Thunderstorm: a low, dark cloud deck rolls over the field
    if (game.stormT > 0 && rnd() < dt * 14) {
      const W = game.map.cols, H = game.map.rows;
      this.smoke.add({ x: rnd() * W, y: 5.5 + rnd(), z: rnd() * H, vx: 0.6, vy: 0, vz: 0, life: 2.6, size: (q) => 1.4 * Math.sin(q * Math.PI), sy: 0.45, c0: '#3a3f4e', c1: '#5a6070' });
    }
  }

  // A forked bolt of lightning from the sky to (x, y), with a flash and a scorch.
  lightning(x, y, big = false) {
    const T = this.T, pts = [], top = 7 + Math.random() * 2;
    let px = x + (Math.random() - 0.5) * 2, pz = y + (Math.random() - 0.5) * 2;
    const n = 9;
    for (let i = 0; i <= n; i++) { const k = i / n; pts.push(new T.Vector3(px + (x - px) * k + (i && i < n ? (Math.random() - 0.5) * 0.5 : 0), top * (1 - k), pz + (y - pz) * k + (i && i < n ? (Math.random() - 0.5) * 0.5 : 0))); }
    const seg = (a, b, w, life, col) => {
      const d = new T.Vector3().subVectors(b, a), len = d.length(), mid = new T.Vector3().addVectors(a, b).multiplyScalar(0.5);
      const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
      this.bolt.add({ x: mid.x, y: mid.y, z: mid.z, q, life, size: () => 1, sx: w, sy: len, sz: w, c0: col, c1: '#3050a0', fade: 1.5 });
    };
    const w = big ? 0.09 : 0.06;
    for (let i = 0; i < n; i++) { seg(pts[i], pts[i + 1], w, 0.22, '#f4f8ff'); seg(pts[i], pts[i + 1], w * 3, 0.16, '#6a90ff'); }
    // a fork or two
    for (let f = 0; f < (big ? 2 : 1); f++) {
      const i = 2 + Math.floor(Math.random() * 4), a = pts[i], b = new T.Vector3(a.x + (Math.random() - 0.5) * 2, a.y - 1.2 - Math.random(), a.z + (Math.random() - 0.5) * 2);
      seg(a, b, w * 0.7, 0.16, '#dfe8ff');
    }
    for (let i = 0; i < 10; i++) { const a = Math.random() * TAU, sp = 1.5 + Math.random() * 2.5; this.spark.add({ x, y: 0.1, z: y, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 2.5, vz: Math.sin(a) * sp, g: 7, life: 0.35, size: (k) => 0.03 * (1 - k), c0: '#ffffff', c1: '#6aa0ff' }); }
    this.ring.add({ x, y: 0.05, z: y, life: 0.3, size: (k) => (big ? 0.9 : 0.6) * (0.3 + k), c0: '#9ab8ff', c1: '#2040a0', fade: 1 });
    this.scorch.add({ x, y: 0.02, z: y, life: 3, size: (k) => (big ? 0.9 : 0.6) * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1), c0: '#ffffff' });
    this.light.color.set('#a8c4ff'); this.light.position.set(x, 1.5, y); this.light.intensity = big ? 3 : 2; this.light.distance = 6; this.lightT = 0.15;
    setTimeout(() => this.light.color.set('#ffb35a'), 160);
  }

  // A volley or a meteor reaching the ground.
  volleyHit(x, y, r, meteor) {
    if (meteor) {
      this.boom(x, y, r * 0.9, 'meteor');
      for (let i = 0; i < 8; i++) { const a = Math.random() * TAU, d = Math.random() * r; this.fire.add({ x: x + Math.cos(a) * d, y: 0.1, z: y + Math.sin(a) * d, life: 1.4 + Math.random(), size: (k) => 0.14 * Math.sin(k * Math.PI), c0: '#d88a30', c1: '#801a04' }); }
      this.scorch.add({ x, y: 0.021, z: y, life: 9, size: (k) => r * 2 * (k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1), c0: '#ffffff' });
      for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; this.debris.add({ x: x + Math.cos(a) * r * 0.75, y: 0.05, z: y + Math.sin(a) * r * 0.75, life: 7, size: (k) => 0.09 * (k > 0.85 ? (1 - k) / 0.15 : 1), sy: 0.6, rx: Math.random(), ry: a, c0: '#4a3e34' }); }   // the crater's rim
      return;
    }
    for (let i = 0; i < 8; i++) { const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r; this.smoke.add({ x: x + Math.cos(a) * d, y: 0.05, z: y + Math.sin(a) * d, vx: 0, vy: 0.3, vz: 0, drag: 2, life: 0.5, size: (k) => 0.04 + 0.08 * k, c0: '#c8b898', c1: '#e8e0d0' }); }
  }

  // The moment a castle art is used.
  art(id, o, game) {
    const rnd = Math.random, c = game.map.castle;
    if (id === 'volley') {
      // three volleys of arrows dropping out of the sky at a slant, landing where they strike, then standing in the ground
      for (let h = 0; h < 3; h++) for (let i = 0; i < 24; i++) {
        const a = rnd() * TAU, d = Math.sqrt(rnd()) * o.r, tx = o.x + Math.cos(a) * d, tz = o.y + Math.sin(a) * d, fall = 0.32, delay = h * 0.22;
        const sp = 18, vx = -4, vz = 2, sy = sp * (fall + delay);
        this.arrows.add({ x: tx - vx * (fall + delay), y: sy, z: tz - vz * (fall + delay), vx, vy: -sp, vz, life: fall + delay, size: (k) => ((k * (fall + delay)) < delay ? 0 : 0.9), rz: -Math.PI / 2 + 0.22, ry: Math.atan2(-vz, vx), c0: '#6d4a2a' });
        if (i % 3 === 0) this.arrows.add({ x: tx, y: 0.12, z: tz, life: 2.2 + delay + fall, size: (k) => ((k * (2.2 + delay + fall)) < delay + fall ? 0 : 0.6 * (k > 0.85 ? (1 - k) / 0.15 : 1)), rz: -Math.PI / 2 + 0.3, ry: Math.atan2(-vz, vx), c0: '#6d4a2a' });
      }
    } else if (id === 'oil') {
      // boiling oil sheets off the walls, splashes, and bursts into flame across the ground
      for (let i = 0; i < 40; i++) { const a = rnd() * TAU, sp = 0.5 + rnd() * 2; this.debris.add({ x: c.x + (rnd() - 0.5) * 1.6, y: 1.2, z: c.y - 0.3, vx: Math.cos(a) * sp, vy: 0.5 + rnd(), vz: Math.sin(a) * sp - 1, g: 7, bounce: true, r0: 0.02, life: 0.8 + rnd() * 0.5, size: (k) => 0.045 * (1 - k * 0.5), c0: '#2a1a0a', c1: '#5a3010' }); }
      for (let i = 0; i < 26; i++) {
        const a = rnd() * TAU, d = Math.sqrt(rnd()) * o.r;
        this.fire.add({ x: c.x + Math.cos(a) * d, y: 0.1, z: c.y + Math.sin(a) * d, vx: 0, vy: 0.4 + rnd() * 0.4, vz: 0, drag: 1, life: 0.6 + rnd() * 0.9, size: (k) => 0.18 * Math.sin(k * Math.PI), c0: '#e09040', c1: '#701808' });
        if (i % 2) this.smoke.add({ x: c.x + Math.cos(a) * d, y: 0.3, z: c.y + Math.sin(a) * d, vx: 0, vy: 0.6, vz: 0, drag: 1, life: 1.6, size: (k) => 0.12 + 0.3 * k, c0: '#3a3028', c1: '#8a8480', cs: 1.4 });
      }
      this.glows.add({ x: c.x, y: 0.02, z: c.y, life: 2.5, size: (k) => o.r * 2 * (k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1), c0: '#a04010', c1: '#200800' });
    } else if (id === 'nova') {
      // a ring of frost racing out from the castle, ice shards bursting from the ground behind it, and a chill mist
      for (const [dl, col] of [[0, '#9fd8f0'], [0.15, '#5aa8d8']]) this.thin.add({ x: c.x, y: 0.08, z: c.y, life: 1.1 + dl, size: (k) => 14 * Math.max(0, k * 1.1 - dl), c0: col, c1: '#2a6aa0', fade: 1.2 });
      for (let i = 0; i < 240; i++) {
        const a = rnd() * TAU, d = 1 + Math.sqrt(rnd()) * 12, s0 = 0.08 + rnd() * 0.14, delay = d / 12;
        this.shards.add({ x: c.x + Math.cos(a) * d, y: 0, z: c.y + Math.sin(a) * d, life: 1.6 + delay, size: (k) => { const t = k * (1.6 + delay) - delay; return t < 0 ? 0 : s0 * Math.min(1, t * 8) * (t > 1.2 ? Math.max(0, 1 - (t - 1.2) / 0.4) : 1); }, sy: 2.6, rx: (rnd() - 0.5) * 0.7, rz: (rnd() - 0.5) * 0.7, ry: rnd() * TAU, c0: '#d8f2ff' });
      }
      this.glows.add({ x: c.x, y: 0.02, z: c.y, life: 1.8, size: (k) => 26 * Math.min(1, k * 1.4), c0: '#4a7a98', c1: '#000000' });   // a chill that spreads over the ground
      for (const e of game.enemies) if (!e.dead) this.motes.add({ x: e.x, y: 0.3, z: e.y, vx: 0, vy: 0.3, vz: 0, life: 1, size: (k) => 0.05 * Math.sin(k * Math.PI), c0: '#e8f8ff', c1: '#4a8ac0' });
    } else if (id === 'grapeshot') {
      for (let i = 0; i < 40; i++) {
        const a = o.ang + (rnd() * 2 - 1) * o.arc, sp = 10 + rnd() * 6;
        this.spark.add({ x: o.ox, y: 1.0, z: o.oy, vx: Math.cos(a) * sp, vy: -0.5 - rnd() * 1.5, vz: Math.sin(a) * sp, g: 2, life: o.range / sp, size: () => 0.04, c0: '#ffe0a0', c1: '#c0602a' });
      }
      for (let i = 0; i < 10; i++) this.smoke.add({ x: o.ox + Math.cos(o.ang) * 0.6, y: 1.0, z: o.oy + Math.sin(o.ang) * 0.6, vx: Math.cos(o.ang + (rnd() - 0.5)) * 2, vy: 0.4, vz: Math.sin(o.ang + (rnd() - 0.5)) * 2, drag: 3, life: 1, size: (k) => 0.1 + 0.3 * k, c0: '#d8d0c8', c1: '#f0f0f0' });
      this.fire.add({ x: o.ox + Math.cos(o.ang) * 0.6, y: 1.0, z: o.oy + Math.sin(o.ang) * 0.6, life: 0.15, size: (k) => 0.4 * (1 - k), c0: '#e0a050', c1: '#802008' });
    } else if (id === 'mend') {
      for (const t of game.towers) for (let i = 0; i < 6; i++) this.motes.add({ x: t.cx + (rnd() - 0.5) * 0.6, y: 0.1 + rnd() * 0.3, z: t.cy + (rnd() - 0.5) * 0.6, vx: 0, vy: 0.8 + rnd() * 0.6, vz: 0, life: 1.1, size: (k) => 0.05 * Math.sin(k * Math.PI), c0: '#b8ffb0', c1: '#2a8a30' });
    } else if (id === 'horn') {
      for (const t of game.towers) this.ring.add({ x: t.cx, y: 0.1, z: t.cy, life: 0.7, size: (k) => 0.3 + 0.6 * k, c0: '#ffd666', c1: '#a06010', fade: 1 });
    } else if (id === 'tithe') {
      for (let i = 0; i < 24; i++) { const a = rnd() * TAU; this.motes.add({ x: c.x, y: 1.4, z: c.y, vx: Math.cos(a) * 1.5, vy: 1 + rnd() * 2, vz: Math.sin(a) * 1.5, g: 4, life: 1.1, size: (k) => 0.06 * (1 - k * 0.5), c0: '#ffe070', c1: '#a07010' }); }
    }
  }

  update(dt) {
    for (const p of [this.fire, this.smoke, this.debris, this.spark, this.ring, this.scorch, this.arrows, this.spikes, this.shards, this.glows, this.bolt, this.motes, this.thin]) p.update(dt);
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity *= Math.max(0, 1 - dt * 14); if (this.lightT <= 0) this.light.intensity = 0; }
  }
  clear() { for (const p of [this.fire, this.smoke, this.debris, this.spark, this.ring, this.scorch, this.arrows, this.spikes, this.shards, this.glows, this.bolt, this.motes, this.thin]) p.clear(); this.light.intensity = 0; }
  dispose() { this.scene.remove(this.group); this.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
}
