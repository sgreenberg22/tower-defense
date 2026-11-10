// Sea Siege (v1.60): the horde comes by sea. On a coastal field (maps with `lanes`) every wave's foot soldiers are carried
// by ships that sail the sea lanes to a beach and land them there; sink a ship at sea and its crew drowns with it. Fire
// galleys loose burning arrows at your towers as they row past; war carracks anchor off the coast and shell your towers,
// and the keep itself when they can reach it; the boss arrives on the Horde Flagship. Flyers come in over the water.
// Mixed into Game like the garrison (Object.assign(Game.prototype, navalMethods)); the engine calls a few hooks.
import { ENEMIES } from '../data/balance.js';
import { towerHitSrc } from './counters.js';
import * as eco from './economy.js';

export const NAVAL = {
  ramFrom: 10, ramEvery: 8,   // v1.68 · Rough seas: ram ships
  // hull damage by tower: heavy shot smashes planks, arrows barely scratch them
  vs: { cannon: 1.5, catapult: 1.6, artillery: 1.5, trebuchet: 1.7, ballista: 1.4, archer: 0.6, gatling: 0.65, venom: 0.7, frost: 0.8, flak: 0.5 },
  fire: 1.25,         // fire (burning, fire towers, fire arts) eats a ship faster
  drownGold: 0.5,     // the gold each drowned crewman is worth, as a share of its bounty
  beachStay: 5,       // seconds an emptied ship sits on the beach before it pushes off
  landGap: 0.35,      // seconds between crewmen wading ashore
  cogFrom: 6,         // from this wave the bigger loads go in war cogs
  galleyFrom: 3, galleyEvery: 3,     // fire galleys: from wave 3, one more every 3 waves
  carrackFrom: 8, carrackEvery: 8,   // war carracks: from wave 8, one more every 8 waves
  gather: 4,          // foes due within this many seconds of the first share a ship
};
const hyp = Math.hypot;

export const navalMethods = {
  // ---------- the wave goes to sea ----------
  // Turn the wave's spawn queue into a fleet: foot soldiers board ships in arrival order, flyers fly in over the water,
  // and the boss boards the flagship. Fire galleys and war carracks are added by wave.
  navalPlan() {
    const lanes = this.map.lanes, land = lanes.filter((L) => !L.bombard), guns = lanes.filter((L) => L.bombard);
    const landing = land.length ? land : lanes, bombard = guns.length ? guns : lanes;
    const w = this.wave, out = [];
    let cur = null, li = 0;
    const laneOf = (list) => list[(li++) % list.length];
    for (const s of this.spawnQueue) {
      const def = s.type === 'boss' ? null : ENEMIES[s.type];
      if (def?.air) { const L = laneOf(lanes); out.push({ ...s, from: [L.pts[0], this.map.castle] }); continue; }
      if (s.type === 'boss') {   // the boss lands at the beach with the longest road to the keep
        const far = [...landing].sort((a, b) => (this.map.pathLen[b.land]?.at(-1) || 0) - (this.map.pathLen[a.land]?.at(-1) || 0))[0];
        out.push({ t: s.t, ship: 'flagship', lane: far, cargo: [s] }); cur = out[out.length - 1]; continue;
      }
      const cap = (n) => ENEMIES[n].naval.cargo;
      if (!cur || cur.cargo.length >= cap(cur.ship) || s.t - cur.t > NAVAL.gather) {
        cur = { t: s.t, ship: w >= NAVAL.cogFrom && cur && cur.cargo.length >= cap('longship') ? 'cog' : 'longship', lane: laneOf(landing), cargo: [] };
        out.push(cur);
      }
      cur.cargo.push(s);
      // a full longship becomes a cog once the cogs sail (bigger loads, fewer hulls)
      if (cur.ship === 'longship' && cur.cargo.length > cap('longship') - 1 && w >= NAVAL.cogFrom) cur.ship = 'cog';
    }
    const end = out.length ? out[out.length - 1].t : 0;
    const galleys = w >= NAVAL.galleyFrom ? 1 + Math.floor((w - NAVAL.galleyFrom) / NAVAL.galleyEvery) : 0;
    for (let i = 0; i < Math.min(5, galleys); i++) out.push({ t: 2 + (end * (i + 0.5)) / Math.max(1, galleys), ship: 'galley', lane: laneOf(lanes), cargo: [] });
    const carracks = w >= NAVAL.carrackFrom ? 1 + Math.floor((w - NAVAL.carrackFrom) / NAVAL.carrackEvery) : 0;
    for (let i = 0; i < Math.min(4, carracks); i++) out.push({ t: 4 + i * 6, ship: 'carrack', lane: laneOf(bombard), cargo: [] });
    const rams = this.seaPlus && w >= NAVAL.ramFrom ? 1 + Math.floor((w - NAVAL.ramFrom) / NAVAL.ramEvery) : 0;
    for (let i = 0; i < Math.min(3, rams); i++) out.push({ t: 8 + i * 7, ship: 'ramship', lane: laneOf(landing), cargo: [] });
    out.sort((a, b) => a.t - b.t);
    this.spawnQueue = out;
    this.landQueue = [];
  },

  // A ship takes to the water at the seaward end of its lane.
  spawnShip(s) {
    const L = s.lane, pts = L.pts;
    const e = this.spawnEnemy(s.ship, L.land, { path: pts, x: pts[0].x, y: pts[0].y });
    e.naval = true; e.lane = L; e.land = L.land; e.cargo = s.cargo || []; e.landed = false;
    this.stats.ships = (this.stats.ships || 0) + 1;
    this.emit('shipSpawn', { enemy: e });
    return e;
  },

  // The end of the lane: the crew wades ashore; a gunship drops anchor; an empty hull waits on the beach, then leaves.
  shipArrive(e) {
    const N = e.def.naval;
    e.vx = e.vy = 0;
    if (e.cargo.length && !e.landed) {
      e.landed = true;
      (this.landQueue ||= []).push(...e.cargo.map((c, i) => ({ t: i * NAVAL.landGap, c, land: e.land, ship: e })));
      this.stats.landed = (this.stats.landed || 0) + e.cargo.length;
      this.emit('shipLands', { enemy: e, n: e.cargo.length });
    }
    if (N.ram && !e.rammed) { e.rammed = true; this.shellKeep(N.ram.dmg); this.emit('shipRams', { enemy: e }); e.beached = true; e.stayT = 0.6; return; }
    if (N.bombard && !e.anchored) { e.anchored = true; e.stayT = N.bombard.stay; e.bcd = 1; this.emit('shipAnchors', { enemy: e }); }
    else if (!N.bombard) { e.beached = true; e.stayT = NAVAL.beachStay; }
  },

  // A ship that has stopped: beached (waiting to leave) or anchored (shelling). Returns true when it took the step.
  navalStep(e, dt) {
    const N = e.def.naval, B = N.bombard;
    if (!e.anchored && !e.beached && B && B.stand > 0 && e.total - e.dist <= B.stand) { e.anchored = true; e.stayT = B.stay; e.bcd = 1.2; this.emit('shipAnchors', { enemy: e }); }
    if (!e.anchored && !e.beached) return false;
    e.vx = e.vy = 0;
    if ((e.stayT -= dt) <= 0) { e.dead = true; e.expired = true; this.emit('shipLeaves', { enemy: e }); return true; }
    if (!e.anchored || !B) return true;
    if ((e.bcd -= dt) > 0) return true;
    e.bcd = B.cd;
    const c = this.map.castle, k = Math.sqrt(this.plan?.hp || 1);
    if (hyp(c.x - e.x, c.y - e.y) <= B.range + 0.6) {   // the keep is in reach: shell its walls
      this.projectiles.push({ kind: 'eball', x: e.x, y: e.y, sx: e.x, sy: e.y, tx: c.x, ty: c.y - 0.2, keep: true, dmg: B.wall * k, speed: 5.5, arc: 0 });
    } else {
      const tw = this.nearestTower(e, B.range);
      if (!tw) { e.bcd = 0.5; return true; }
      this.projectiles.push({ kind: 'eball', x: e.x, y: e.y, sx: e.x, sy: e.y, target: tw, tx: tw.cx, ty: tw.cy, dmg: B.dmg * k, speed: 5.5, arc: 0, src: towerHitSrc('mangonel', e.def.name) });
    }
    this.emit('broadside', { enemy: e });
    return true;
  },

  // A ship's cannonball in flight (a lobbed shot): it hits the tower it was aimed at, or the keep.
  stepEball(p, dt) {
    if (p.target && !p.target.ruined) { p.tx = p.target.cx; p.ty = p.target.cy; }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = hyp(dx, dy), s = p.speed * dt;
    const tot = hyp(p.tx - p.sx, p.ty - p.sy) || 1;
    p.arc = Math.sin(Math.PI * Math.min(1, 1 - (d - s) / tot)) * Math.min(1.4, tot * 0.3);
    if (d > s) { p.x += (dx / d) * s; p.y += (dy / d) * s; return true; }
    if (p.keep) this.shellKeep(p.dmg);
    else if (p.target && !p.target.ruined) this.damageTower(p.target, p.dmg, p.src);
    this.emit('impact', { x: p.tx, y: p.ty, kind: 'ball', splash: 0.5 });
    return false;
  },

  // The keep under the guns: the wall takes it first, then the keep (Shield Wall and Aegis soften it, as for a breach).
  shellKeep(dmg) {
    if (this.over) return;
    if (this.aegisT > 0) dmg *= 0.5;
    if (this.cmdr) dmg *= this.cmdr.leakCut();
    let wallDmg = 0, target = 'wall';
    if (this.wall.hp > 0) { wallDmg = Math.min(dmg, this.wall.hp); this.wall.hp -= dmg; if (this.wall.hp < 0) { dmg = -this.wall.hp * 0.6; this.wall.hp = 0; target = 'both'; } else dmg = 0; } else { dmg *= 0.6; target = 'castle'; }
    if (dmg > 0) this.castle.hp -= dmg;
    this.stats.shelled = (this.stats.shelled || 0) + 1;
    this.emit('keepShelled', { target, dmg, wallDmg });
    if (this.castle.hp <= 0) {
      if (this.secondWind) { this.secondWind = false; this.boons.secondwind = 0; this.castle.hp = this.castle.maxHp * this.bonus.secondWindHeal; this.emit('secondWind', {}); }
      else this.gameOver();
    }
  },

  // Crews wade ashore one by one at the start of their land road.
  navalTick(dt) {
    const Q = this.landQueue;
    if (!Q || !Q.length) return;
    for (const q of Q) {
      if ((q.t -= dt) > 0) continue;
      q.done = true;
      const c = q.c;
      const e = this.spawnEnemy(c.type, q.land, { boss: c.boss, champion: c.champion });
      e.ashore = true;
      this.emit('wadeAshore', { enemy: e, ship: q.ship });
    }
    this.landQueue = Q.filter((q) => !q.done);
  },

  // Sunk with its crew aboard: they drown (and count as slain); a boss swims ashore at its beach.
  shipSunk(e) {
    const w = this.wave;
    let n = 0, gold = 0;
    this.stats.sunk = (this.stats.sunk || 0) + 1;
    for (const c of e.landed ? [] : e.cargo) {
      if (c.type === 'boss') { (this.landQueue ||= []).push({ t: 0.6, c, land: e.land, ship: e }); this.emit('bossSwims', { enemy: e }); continue; }
      const d = ENEMIES[c.type]; if (!d) continue;
      n++; gold += eco.killGold(d.bounty * NAVAL.drownGold, w, {});
      this.stats.kills++; this.stats.killsByType[c.type] = (this.stats.killsByType[c.type] || 0) + 1;
    }
    e.cargo = [];
    if (n) {
      const g = this.addGold(gold);
      this.stats.drowned = (this.stats.drowned || 0) + n; this.stats.bestSink = Math.max(this.stats.bestSink || 0, n);
      this.score += Math.round(n * 6 * this.scoreMult());
      this.emit('shipSunk', { enemy: e, drowned: n, gold: g });
    } else this.emit('shipSunk', { enemy: e, drowned: 0, gold: 0 });
  },

  // Damage against a hull: heavy shot more, arrows less, fire more.
  hullMult(e, type, src) {
    let m = src && src.type ? NAVAL.vs[src.type] ?? 1 : 1;
    if (type === 'fire') m *= NAVAL.fire;
    return m;
  },
};
