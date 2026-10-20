// 3D weather for the 3D view, driven by the game's weather spells (game.hazard): it never changes the simulation.
//  - Blizzard (Frostlands): thick driving snow, swirling gusts low over the ground, frost settling, the fog closing in.
//  - Sandstorm (Dunes): sheets of sand streaming sideways, dust twisters (tornadoes) wandering across the field, the sky turning ochre.
//  - Meteor shower (Ashlands): falling embers and ash, a reddened sky, and a burning streak down to every meteor that lands.
//  - Shadows (Shadowfen): a low violet mist creeping over the road, drifting wisps, the light dimming.
// A storm gathers during the warning (clouds darken, the wind picks up), peaks while active and fades after.
const TAU = Math.PI * 2;

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// N particles that drift through a box with a velocity and wrap around it; each has its own phase and size.
class Field {
  constructor(T, geo, mat, n, seed) {
    this.T = T; this.n = n;
    this.mesh = new T.InstancedMesh(geo, mat, n); this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const r = rng(seed); this.p = Array.from({ length: n }, () => ({ x: r(), y: r(), z: r(), ph: r() * TAU, s: 0.6 + r() * 0.8 }));
    this.m4 = new T.Matrix4(); this.q = new T.Quaternion(); this.e = new T.Euler(); this.v = new T.Vector3(); this.sc = new T.Vector3();
  }
  // box: {x0, y0, z0, w, h, d}; vel: units per second; count: how many to show; shape(p, t) -> {sx, sy, sz, rx, ry, rz, wob}
  update(t, box, vel, count, shape) {
    const { m4, q, e, v, sc } = this;
    const n = Math.min(this.n, Math.max(0, Math.round(count)));
    for (let i = 0; i < n; i++) {
      const p = this.p[i], f = shape(p, t);
      const fx = ((p.x + (vel.x * t) / box.w) % 1 + 1) % 1, fy = ((p.y + (vel.y * t * p.s) / box.h) % 1 + 1) % 1, fz = ((p.z + (vel.z * t) / box.d) % 1 + 1) % 1;
      v.set(box.x0 + fx * box.w + Math.sin(t * 1.7 + p.ph) * (f.wob || 0), box.y0 + fy * box.h, box.z0 + fz * box.d + Math.cos(t * 1.3 + p.ph) * (f.wob || 0));
      e.set(f.rx || 0, f.ry || 0, f.rz || 0); q.setFromEuler(e); sc.set(f.sx, f.sy, f.sz);
      m4.compose(v, q, sc); this.mesh.setMatrixAt(i, m4);
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true;
  }
  hide() { this.mesh.count = 0; }
}

export class Weather3D {
  constructor(THREE, scene, kit) {
    const T = this.T = THREE;
    this.scene = scene; this.group = new T.Group(); scene.add(this.group);
    const basic = (o) => new T.MeshBasicMaterial({ transparent: true, depthWrite: false, ...o });
    this.snow = new Field(T, new T.OctahedronGeometry(1, 0), basic({ color: '#ffffff', opacity: 0.9 }), 1400, 11);
    this.gust = new Field(T, new T.PlaneGeometry(1, 1), basic({ color: '#eef6ff', opacity: 0.22, map: kit.tex('glow'), side: T.DoubleSide }), 90, 12);
    this.sand = new Field(T, new T.BoxGeometry(1, 1, 1), basic({ color: '#d8b070', opacity: 0.55 }), 1100, 13);
    this.haze = new Field(T, new T.PlaneGeometry(1, 1), basic({ color: '#d0a060', opacity: 0.18, map: kit.tex('glow'), side: T.DoubleSide }), 70, 14);
    this.ember = new Field(T, new T.OctahedronGeometry(1, 0), basic({ color: '#ff8a3a', blending: T.AdditiveBlending }), 600, 15);
    this.ash = new Field(T, new T.PlaneGeometry(1, 1), basic({ color: '#2a2422', opacity: 0.7, side: T.DoubleSide }), 500, 16);
    this.mist = new Field(T, new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), basic({ color: '#4a3a70', opacity: 0.5, map: kit.tex('glow') }), 80, 17);
    this.wisp = new Field(T, new T.OctahedronGeometry(1, 0), basic({ color: '#b89aff', blending: T.AdditiveBlending }), 160, 18);
    this.fields = [this.snow, this.gust, this.sand, this.haze, this.ember, this.ash, this.mist, this.wisp];
    for (const f of this.fields) this.group.add(f.mesh);
    // twisters: each a column of dust puffs spiralling up, wandering over the field
    this.twMat = new T.MeshLambertMaterial({ color: '#c8a26a', transparent: true, opacity: 0.32, depthWrite: false });
    this.twist = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), this.twMat, 3 * 96); this.twist.frustumCulled = false; this.twist.count = 0;
    this.twist.instanceMatrix.setUsage(T.DynamicDrawUsage); this.group.add(this.twist);
    this.twisters = [];
    this.streaks = [];   // burning trails down to landed meteors
    this.streakMesh = new T.InstancedMesh(new T.CylinderGeometry(1, 1, 1, 6, 1, true), basic({ color: '#ffb060', blending: T.AdditiveBlending, side: T.DoubleSide }), 16);
    this.streakMesh.frustumCulled = false; this.streakMesh.count = 0; this.group.add(this.streakMesh);
    this.k = 0;          // storm strength, 0..1 (eases in and out)
    this.kind = null;
    this.t = 0;
    this.m4 = new T.Matrix4(); this.q = new T.Quaternion(); this.e = new T.Euler(); this.v = new T.Vector3(); this.sc = new T.Vector3(); this.up = new T.Vector3(0, 1, 0);
  }

  // How the scene's atmosphere should shift right now (render3d applies it): fog distance scale, fog/sky tint, light scale.
  atmosphere() {
    const k = this.k;
    if (!this.kind || k <= 0.001) return { fog: 1, tint: null, amt: 0, light: 1 };
    const tint = { blizzard: '#e8f2fa', sandstorm: '#d9b27a', meteors: '#a04a2a', stealth: '#2a2240' }[this.kind];
    const fog = { blizzard: 0.16, sandstorm: 0.2, meteors: 0.6, stealth: 0.3 }[this.kind];
    const light = { blizzard: 0.8, sandstorm: 0.75, meteors: 0.8, stealth: 0.55 }[this.kind];
    return { fog: 1 - (1 - fog) * k, tint, amt: k * (this.kind === 'meteors' ? 0.4 : 0.75), light: 1 - (1 - light) * k };
  }

  meteorStreak(x, y) {
    const sx = x + 4 + Math.random() * 2, sy = 14, sz = y - 2 - Math.random() * 2;
    this.streaks.push({ ax: sx, ay: sy, az: sz, bx: x, by: 0.2, bz: y, t: 0, life: 0.5 });
    if (this.streaks.length > 16) this.streaks.shift();
  }

  update(game, dt, quality = 'high') {
    this.t += dt;
    const h = game.hazard || {}, kind = h.kind;
    // strength: rises through the warning, full while active, falls away after
    const warn = kind && h.active <= 0 && h.warned ? 0.35 : 0;
    const want = kind && game.phase === 'wave' ? (h.active > 0 ? 1 : warn) : 0;
    if (kind && kind !== this.kind && this.k < 0.05) this.kind = kind;
    this.k += (want - this.k) * Math.min(1, dt * (want > this.k ? 0.9 : 0.6));
    if (this.k < 0.002) { this.k = 0; for (const f of this.fields) f.hide(); this.twist.count = 0; }
    const m = game.map, W = m.cols, H = m.rows, t = this.t, k = this.k;
    const many = quality === 'low' ? 0.35 : quality === 'med' ? 0.65 : 1;
    const box = { x0: -4, y0: 0, z0: -4, w: W + 8, h: 7, d: H + 8 };
    const off = (f) => f.hide();
    for (const f of this.fields) off(f);
    this.twist.count = 0;
    if (k > 0) {
      if (this.kind === 'blizzard') {
        this.snow.update(t, box, { x: 2.2, y: -1.6, z: 0.6 }, 1400 * k * many, (p) => { const s = 0.018 + p.s * 0.016; return { sx: s, sy: s, sz: s, rx: p.ph + t, ry: t * 2, wob: 0.25 }; });
        this.gust.update(t, { ...box, y0: 0.05, h: 1.2 }, { x: 4, y: 0, z: 1 }, 90 * k * many, (p) => ({ sx: 2.2 * p.s, sy: 0.35 * p.s, sz: 1, ry: -0.3, rx: 0, wob: 0.6 }));
      } else if (this.kind === 'sandstorm') {
        this.sand.update(t, { ...box, h: 3.5 }, { x: 7.5, y: -0.2, z: 1.2 }, 1100 * k * many, (p) => ({ sx: 0.09 + p.s * 0.05, sy: 0.012, sz: 0.012, ry: -0.16, wob: 0.15 }));
        this.haze.update(t, { ...box, y0: 0.2, h: 2.5 }, { x: 5, y: 0, z: 0.8 }, 70 * k * many, (p) => ({ sx: 3.4 * p.s, sy: 1.4 * p.s, sz: 1, ry: -0.2, wob: 0.8 }));
        this.updateTwisters(game, dt, k);
      } else if (this.kind === 'meteors') {
        this.ember.update(t, { ...box, h: 6 }, { x: 0.6, y: -0.9, z: 0.3 }, 600 * k * many, (p) => { const s = 0.014 + p.s * 0.014 * (0.6 + 0.4 * Math.sin(t * 6 + p.ph)); return { sx: s, sy: s, sz: s, wob: 0.35 }; });
        this.ash.update(t, { ...box, h: 6 }, { x: 0.4, y: -0.5, z: 0.2 }, 500 * k * many, (p) => ({ sx: 0.04 * p.s, sy: 0.04 * p.s, sz: 1, rx: t * 2 + p.ph, ry: t + p.ph, wob: 0.4 }));
      } else if (this.kind === 'stealth') {
        this.mist.update(t, { ...box, y0: 0.06, h: 0.25 }, { x: 0.35, y: 0, z: 0.15 }, 80 * k * many, (p) => ({ sx: 3.2 * p.s, sy: 3.2 * p.s, sz: 1, wob: 0.5 }));
        this.wisp.update(t, { ...box, y0: 0.1, h: 1.6 }, { x: 0.2, y: 0.35, z: 0.1 }, 160 * k * many, (p) => { const s = 0.02 + 0.02 * Math.sin(t * 3 + p.ph) ** 2; return { sx: s, sy: s, sz: s, wob: 0.5 }; });
      }
      if (this.kind !== 'sandstorm') this.twisters = [];
    } else this.twisters = [];
    // meteor streaks (from the shower's impacts)
    let n = 0;
    this.streaks = this.streaks.filter((s) => (s.t += dt) < s.life);
    for (const s of this.streaks) {
      const q = s.t / s.life, a = this.v.set(s.ax, s.ay, s.az), b = new this.T.Vector3(s.bx, s.by, s.bz);
      const dir = new this.T.Vector3().subVectors(b, a), len = dir.length();
      this.q.setFromUnitVectors(this.up, dir.normalize());
      const mid = new this.T.Vector3().addVectors(a, b).multiplyScalar(0.5), w = 0.08 * (1 - q);
      this.sc.set(w, len, w); this.m4.compose(mid, this.q, this.sc); this.streakMesh.setMatrixAt(n++, this.m4);
    }
    this.streakMesh.count = n; this.streakMesh.instanceMatrix.needsUpdate = true;
  }

  // Sandstorm twisters: up to three funnels that wander over the board, kicking up dust at their feet.
  updateTwisters(game, dt, k) {
    const m = game.map, W = m.cols, H = m.rows, want = k > 0.5 ? 2 + (W * H > 200 ? 1 : 0) : 0;
    while (this.twisters.length < want) {
      const r = Math.random;
      this.twisters.push({ x: -2, z: 1 + r() * (H - 2), vx: 0.9 + r() * 0.6, vz: (r() - 0.5) * 0.6, ph: r() * TAU, h: 2.6 + r() * 1.4, born: this.t });
    }
    if (want === 0) this.twisters = this.twisters.filter((tw) => (tw.fade = (tw.fade || 1) - dt * 0.8) > 0);
    let n = 0;
    const { m4, q, e, v, sc } = this, t = this.t;
    for (const tw of this.twisters) {
      tw.x += tw.vx * dt; tw.z += tw.vz * dt + Math.sin(t * 0.7 + tw.ph) * dt * 0.6;
      if (tw.z < 0.5 || tw.z > H - 0.5) tw.vz = -tw.vz;
      if (tw.x > W + 3) { tw.x = -2; tw.z = 1 + Math.random() * (H - 2); }
      const grow = Math.min(1, (t - tw.born) / 2) * (tw.fade ?? 1) * k;
      // a funnel: rings of overlapping dust puffs, narrow at the ground and wide at the top, each ring spinning faster lower down
      for (let L = 0; L < 16; L++) {
        const f = L / 15, y = 0.05 + f * tw.h, rad = (0.08 + f * f * 0.75) * grow, lean = Math.sin(t * 1.3 + tw.ph) * 0.4 * f * f;
        for (let j = 0; j < 6; j++) {
          const a = t * (9 - f * 5) + j * TAU / 6 + L * 0.4 + tw.ph;
          v.set(tw.x + Math.cos(a) * rad + lean, y, tw.z + Math.sin(a) * rad);
          const s0 = (0.1 + rad * 0.55) * Math.max(0.2, grow);
          e.set(a, a * 0.5, 0); q.setFromEuler(e); sc.set(s0, s0 * 0.6, s0);
          m4.compose(v, q, sc); this.twist.setMatrixAt(n++, m4);
        }
      }
    }
    this.twist.count = n; this.twist.instanceMatrix.needsUpdate = true;
  }

  // Twister positions, for dust at their feet (render3d asks so it can kick up particles with its fx layer).
  feet() { return this.twisters.map((tw) => ({ x: tw.x, z: tw.z })); }

  dispose() { this.scene.remove(this.group); this.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
}
