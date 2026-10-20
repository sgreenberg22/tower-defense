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
      e.set((p.rx || 0) + (p.spin || 0) * p.t, (p.ry || 0) + (p.spin || 0) * p.t * 0.7, 0); q.setFromEuler(e);
      s.set(size * (p.sx || 1), size * (p.sy || 1), size * (p.sz || 1));
      m4.compose(v.set(p.x, p.y, p.z), q, s);
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
    for (const p of [this.scorch, this.ring, this.smoke, this.debris, this.fire, this.spark, this.balls, this.rocks, this.bolts]) this.group.add(p.mesh);
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

  update(dt) {
    for (const p of [this.fire, this.smoke, this.debris, this.spark, this.ring, this.scorch]) p.update(dt);
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity *= Math.max(0, 1 - dt * 14); if (this.lightT <= 0) this.light.intensity = 0; }
  }
  clear() { for (const p of [this.fire, this.smoke, this.debris, this.spark, this.ring, this.scorch]) p.clear(); this.light.intensity = 0; }
  dispose() { this.scene.remove(this.group); this.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
}
