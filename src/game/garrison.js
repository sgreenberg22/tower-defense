// The Garrison: troops trained in the keep (gold + time, elites also Valor), deployed to the road, where they hunt foes.
// Mixed into Game.prototype by engine.js so the engine stays one class; everything here is headless-safe.
import { TROOPS, TROOP_ORDER, GARRISON, VALOR, WEATHER, ENEMIES } from '../data/balance.js';
import { LASTSTAND } from './modes.js';

let TUID = 1;
const hyp = Math.hypot;

export const garrisonMethods = {
  initGarrison() {
    this.garrison = { units: [], queue: [], valor: 0, muster: 0, stance: 'hunt', auto: true, immortalUsed: false, slotSeq: 0, refreshT: 0, full: false };
  },

  // ---------- numbers ----------
  planHp() { const p = this.phase === 'wave' && this.plan ? this.plan : this.nextPlan; return p ? p.hp : 1; },
  troopHpScale() { return Math.max(1, Math.pow(this.planHp(), GARRISON.hpExp) * GARRISON.hpMul); },
  troopDmgScale() { return Math.max(1, Math.pow(this.planHp(), GARRISON.dmgExp) * GARRISON.dmgMul); },
  troopSlotsMax() {
    const S = GARRISON.slots;
    if (this.mode === 'laststand') return LASTSTAND.slots;
    return Math.min(S.max, S.base + Math.floor((this.wave - 1) / S.perWaves) + this.bonus.troopSlots + 2 * this.boon('barracksplus'));
  },
  troopSlotsUsed() {
    const G = this.garrison;
    let n = 0;
    for (const u of G.units) n += TROOPS[u.kind].slots;
    for (const q of G.queue) n += TROOPS[q.kind].slots;
    return n;
  },
  troopCost(kind) {
    const D = TROOPS[kind];
    if (this.freeSetup()) return { gold: 0, valor: 0 };
    const disc = Math.min(0.5, this.bonus.troopDiscount + 0.08 * this.boon('drillmaster'));
    return { gold: Math.round(D.cost * (1 + GARRISON.costPerWave * (this.wave - 1)) * (1 - disc)), valor: D.valor };
  },
  trainSpeed() { return 1 + this.bonus.trainSpeed + 0.25 * this.boon('drillmaster'); },
  troopUnlocked(kind) { const D = TROOPS[kind]; return !!D && this.unlockLevel() >= D.unlockWave && this.troopKnown(kind); },
  troopKnown(kind) { return !this.bonus.unlockedTroops || this.bonus.unlockedTroops.has(kind); },
  troopCount(kind) { return this.garrison.units.reduce((a, u) => a + (u.kind === kind ? 1 : 0), 0); },
  castleGate() {
    if (this._gate) return this._gate;
    const p = this.map.paths[0], end = p[p.length - 1];
    let need = 1.15, x = end.x, y = end.y;
    for (let i = p.length - 2; i >= 0 && need > 0; i--) {
      const d = hyp(p[i].x - x, p[i].y - y);
      if (d >= need) { x += ((p[i].x - x) * need) / d; y += ((p[i].y - y) * need) / d; need = 0; }
      else { x = p[i].x; y = p[i].y; need -= d; }
    }
    return (this._gate = { x, y });
  },
  troopHome(u) {
    const g = this.castleGate(), a = u.slot * 2.399963 + 0.5, r = 0.2 + 0.13 * Math.sqrt(u.slot % 24);
    return { x: g.x + Math.cos(a) * r, y: g.y + Math.sin(a) * r * 0.7 };
  },

  // ---------- training ----------
  // Why a troop can't be queued right now (null = it can).
  trainBlock(kind) {
    const D = TROOPS[kind];
    if (this.over) return 'over';
    if (!D) return 'unknown';
    if (!this.troopKnown(kind)) return 'keep';
    if (this.unlockLevel() < D.unlockWave) return 'wave';
    if (this.locked()) return 'locked';
    const G = this.garrison;
    if (G.queue.length >= GARRISON.queueMax) return 'queue';
    if (this.troopSlotsUsed() + D.slots > this.troopSlotsMax()) return 'slots';
    const c = this.troopCost(kind);
    if (this.gold < c.gold) return 'gold';
    if (G.valor < c.valor) return 'valor';
    return null;
  },
  canTrain(kind) { return this.trainBlock(kind) === null; },
  trainTroop(kind) {
    if (this.trainBlock(kind)) return false;
    // Last Stand's garrison is raised on the spot, for nothing.
    if (this.freeSetup()) { this.addTroop(kind, true); return true; }
    const c = this.troopCost(kind), G = this.garrison;
    this.spend(c.gold); G.valor -= c.valor;
    G.queue.push({ kind, t: 0, gold: c.gold, valor: c.valor });
    this.emit('troopQueued', { kind });
    return true;
  },
  cancelTrain(i) {
    const G = this.garrison, q = G.queue[i];
    if (!q) return false;
    G.queue.splice(i, 1);
    this.gold += q.gold; this.stats.goldSpent -= q.gold; G.valor += q.valor;
    this.emit('troopCancelled', { kind: q.kind });
    return true;
  },
  makeTroop(kind, paid = 0) {
    const g = this.castleGate();
    return {
      troop: true, uid: TUID++, kind, x: g.x, y: g.y, state: 'reserve', hp: 1, maxHp: 1, armor: 0, pin: 0, dmg: 0, dead: false, xp: 0, rank: 0, kills: 0, dmgDone: 0,
      cd: 0.4, retarget: 0, target: null, holding: null, swing: 0, flash: 0, held: false, slot: this.garrison.slotSeq++, healCd: 0, charged: null, face: 1, paid,
    };
  },
  addTroop(kind, free = false, paid = 0) {
    const G = this.garrison, tr = this.makeTroop(kind, paid);
    this.refreshTroop(tr);
    tr.hp = tr.maxHp;
    G.units.push(tr);
    this.stats.troopsTrained++;
    this.emit('troopReady', { troop: tr, free });
    if (this.phase === 'wave' && G.auto) this.deployTroop(tr);
    return tr;
  },
  refreshTroop(tr) {
    const D = TROOPS[tr.kind], rk = 1 + GARRISON.rankBonus * tr.rank, v = 0.2 * this.boon('vanguard');
    const land = 1 + (this.bonus.troopTrain?.[tr.kind] || 0);   // a Realm province that trains this troop
    const maxHp = D.hp * this.troopHpScale() * rk * (1 + this.bonus.troopHp + v) * land;
    if (tr.maxHp !== maxHp) { tr.hp *= maxHp / (tr.maxHp || maxHp); tr.maxHp = maxHp; }
    tr.dmg = D.dmg * this.troopDmgScale() * rk * (1 + this.bonus.troopDmg + v) * land;
    tr.armor = D.armor; tr.pin = (D.pin || 0) * (1 + 0.1 * tr.rank);
  },
  refreshGarrison() {
    for (const u of this.garrison.units) {
      this.refreshTroop(u);
      if (u.frac != null) { u.hp = u.maxHp * u.frac; delete u.frac; }
    }
  },

  // ---------- orders ----------
  setStance(s) { if (s === 'hunt' || s === 'guard') { this.garrison.stance = s; this.emit('garrisonOrder', { stance: s }); return true; } return false; },
  setAuto(on) { this.garrison.auto = !!on; return true; },
  deployTroop(tr) {
    if (!tr || tr.dead || this.phase !== 'wave' || this.over) return false;
    if (tr.state === 'out') return false;
    tr.held = false;
    if (tr.state === 'back') { tr.state = 'out'; return true; }
    const g = this.castleGate();
    tr.state = 'out'; tr.x = g.x; tr.y = g.y; tr.target = null; tr.retarget = 0;
    this.emit('troopDeploy', { troop: tr });
    return true;
  },
  deployAll(kind = null) {
    let n = 0;
    for (const u of this.garrison.units.slice()) if ((!kind || u.kind === kind) && (u.state !== 'out') && this.deployTroop(u)) n++;
    return n;
  },
  recallTroop(tr) {
    if (!tr || tr.dead || tr.state !== 'out') return false;
    this.releaseTroop(tr);
    tr.state = 'back'; tr.held = true;
    return true;
  },
  recallAll(kind = null) {
    let n = 0;
    for (const u of this.garrison.units.slice()) if ((!kind || u.kind === kind) && this.recallTroop(u)) n++;
    return n;
  },
  releaseTroop(tr) {
    tr.holding = null; tr.target = null;
    for (const e of this.enemies) if (e.blocker === tr) e.blocker = null;
  },
  toReserve(u) {
    this.releaseTroop(u);
    const g = this.castleGate();
    u.state = 'reserve'; u.x = g.x; u.y = g.y;
  },
  // Let a troop go from the castle: 40% of what it cost comes back and its slot frees up.
  dismissTroop(u) {
    const G = this.garrison;
    if (!u || u.dead || u.state === 'out' || !G.units.includes(u) || this.locked()) return false;
    this.releaseTroop(u);
    G.units = G.units.filter((x) => x !== u);
    const back = Math.floor((u.paid || 0) * GARRISON.dismissRefund);
    if (back > 0) this.gold += back;
    this.emit('troopDismissed', { troop: u, gold: back });
    return true;
  },
  tendCost() {
    if (this.mode === 'laststand') return 0;   // no mending in the stand: the keep's own rest is all the healing there is
    let c = 0;
    for (const u of this.garrison.units) if (u.state === 'reserve' && u.hp < u.maxHp) c += (1 - u.hp / u.maxHp) * this.troopCost(u.kind).gold * GARRISON.tend;
    return Math.ceil(c);
  },
  tendWounds() {
    const c = this.tendCost();
    if (c <= 0 || this.gold < c) return false;
    this.spend(c);
    for (const u of this.garrison.units) if (u.state === 'reserve') u.hp = u.maxHp;
    this.emit('troopsTended', { gold: c });
    return true;
  },

  // ---------- valor and muster ----------
  addValor(v) {
    v *= 1 + this.bonus.valorMult + 0.3 * this.boon('valorous');
    this.garrison.valor += v; this.stats.valorEarned += v;
  },
  musterNeed() { return Math.round(GARRISON.muster.base + GARRISON.muster.perWave * (this.wave - 1)); },
  addMuster(n) {
    const G = this.garrison, need = this.musterNeed();
    G.muster += n * (1 + this.bonus.musterMult + 0.5 * this.boon('battlecry'));
    if (G.muster < need) { G.full = false; return; }
    const kind = this.musterPick();
    if (!kind) { G.muster = need; G.full = true; return; }   // the garrison is full: the recruit waits for a free slot
    G.muster -= need; G.full = false;
    this.stats.musterRecruits++;
    this.addTroop(kind, true);
    this.emit('muster', { kind });
  },
  musterPick() {
    const free = this.troopSlotsMax() - this.troopSlotsUsed();
    const cand = TROOP_ORDER.filter((k) => { const D = TROOPS[k]; return D.valor === 0 && !D.heal && D.slots <= free && this.troopUnlocked(k); });
    if (!cand.length) return null;
    const have = (k) => this.garrison.units.filter((u) => u.kind === k).length + this.garrison.queue.filter((q) => q.kind === k).length;
    const air = this.enemies.some((e) => !e.dead && e.air) || (this.nextPlan && this.nextPlan.groups.some((g) => g.type !== 'boss' && ENEMIES[g.type]?.air));
    if (air && cand.includes('bowman') && have('bowman') < 3) return 'bowman';
    return cand.slice().sort((a, b) => have(a) - have(b) || TROOPS[a].cost - TROOPS[b].cost)[0];
  },

  // ---------- wave hooks ----------
  garrisonWaveStart() {
    const G = this.garrison;
    G.immortalUsed = false;
    if (!G.auto) return;
    for (const u of G.units.slice()) if (u.state === 'reserve' && u.hp >= u.maxHp * 0.5) this.deployTroop(u);
  },
  garrisonWaveEnd(flawless, bossWave) {
    const G = this.garrison;
    this.addValor(VALOR.waveClear + (flawless ? VALOR.flawless : 0) + (bossWave ? VALOR.boss : 0));
    const heal = this.mod.norepair ? 0 : GARRISON.waveHeal * (1 + 0.25 * this.boon('fieldmedic'));
    for (const u of G.units) { this.toReserve(u); u.held = false; u.hp = Math.min(u.maxHp, u.hp + u.maxHp * heal); u.charged = null; }
  },

  // ---------- per-tick ----------
  updateGarrison(dt) {
    const G = this.garrison;
    if (G.queue.length) {
      const q = G.queue[0];
      q.t += dt * this.trainSpeed();
      if (q.t >= TROOPS[q.kind].train) { G.queue.shift(); this.addTroop(q.kind, false, q.gold); }
    }
    if (!G.units.length) return;
    const wave = this.phase === 'wave';
    G.refreshT -= dt;
    if (G.refreshT <= 0) { G.refreshT = 0.25; for (const u of G.units) this.refreshTroop(u); }
    let clerics = 0;
    for (const u of G.units) if (u.kind === 'cleric' && u.state === 'reserve') clerics++;
    const healRate = GARRISON.reserveHeal * (1 + this.bonus.troopHeal + this.boon('fieldmedic') + 0.35 * Math.min(3, clerics)) * (this.mod.norepair ? 0.35 : 1);
    const tally = new Map();
    if (wave) for (const u of G.units) if (u.state === 'out' && u.target) tally.set(u.target, (tally.get(u.target) || 0) + 1);
    for (const u of G.units.slice()) {
      if (u.dead) continue;
      u.flash = Math.max(0, u.flash - dt); u.swing = Math.max(0, u.swing - dt); u.cd -= dt;
      if (u.state === 'reserve') {
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * healRate * dt);
        if (wave && G.auto && !u.held && u.hp >= u.maxHp * GARRISON.rejoinAt) this.deployTroop(u);
        continue;
      }
      if (!wave) { this.toReserve(u); continue; }
      this.stepTroop(u, dt, tally);
    }
  },

  troopMove(u, tx, ty, speed, dt, stop = 0) {
    const dx = tx - u.x, dy = ty - u.y, d = hyp(dx, dy);
    if (d <= stop || d < 1e-6) return d;
    const step = Math.min(speed * (this.weatherOn('blizzard') ? WEATHER.blizzTroop : 1) * dt, d - stop);
    u.x += (dx / d) * step; u.y += (dy / d) * step;
    if (Math.abs(dx) > 0.02) u.face = dx < 0 ? -1 : 1;
    return d - step;
  },

  canHold(e) { return !e.air && !e.boss && e.type !== 'ram' && !(e.burrowT > 0); },

  stepTroop(u, dt, tally) {
    const D = TROOPS[u.kind], G = this.garrison, gate = this.castleGate();
    if (u.state === 'back') {
      if (this.troopMove(u, gate.x, gate.y, D.speed * 1.15, dt) < 0.3) this.toReserve(u);
      return;
    }
    if (G.auto && !u.held && u.hp < u.maxHp * GARRISON.retreatAt) {
      this.releaseTroop(u); u.state = 'back';
      this.emit('troopRetreat', { troop: u });
      return;
    }
    if (D.heal) { this.clericStep(u, D, dt); return; }
    // choose a target
    u.retarget -= dt;
    let e = u.target;
    if (e && (e.dead || (e.air && !D.air) || e.burrowT > 0)) e = null;
    if (e && G.stance === 'guard' && hyp(e.x - this.map.castle.x, e.y - this.map.castle.y) > GARRISON.guardRadius + 1.5) e = null;
    if (!e || u.retarget <= 0) {
      const pick = this.pickTroopTarget(u, D, tally);
      if (pick !== e) {
        if (u.holding && u.holding !== pick) { if (u.holding.blocker === u) u.holding.blocker = null; u.holding = null; }
        e = pick;
      }
      u.retarget = 0.35;
    }
    if (u.target !== e) {
      if (u.target) tally.set(u.target, Math.max(0, (tally.get(u.target) || 1) - 1));
      if (e) tally.set(e, (tally.get(e) || 0) + 1);
      if (u.holding && u.holding !== e) { if (u.holding.blocker === u) u.holding.blocker = null; u.holding = null; }
    }
    u.target = e;
    if (!e) {
      const h = this.troopHome(u);
      this.troopMove(u, h.x, h.y, D.speed * 0.85, dt, 0.05);
      return;
    }
    const d = hyp(e.x - u.x, e.y - u.y);
    if (D.ranged) {
      const rg = D.range * this.hazardRangeMult();
      if (d > rg * 0.88) this.troopMove(u, e.x, e.y, D.speed, dt, rg * 0.8);
      if (d <= rg && u.cd <= 0) this.troopShoot(u, D, e);
      return;
    }
    const reach = D.reach + e.size * 0.55;
    if (d > reach) {
      const a = u.slot * 2.4;
      this.troopMove(u, e.x + Math.cos(a) * e.size * 0.5, e.y + Math.sin(a) * e.size * 0.3, D.speed, dt, reach * 0.8);
    }
    if (d <= reach + 0.15) {
      if (D.holds && !e.blocker && this.canHold(e)) { e.blocker = u; u.holding = e; }
      if (u.cd <= 0) this.troopStrike(u, D, e);
    }
  },

  // Whom to fight: foes close to me and to the castle first, spread across the squad, with each class leaning to its role.
  pickTroopTarget(u, D, tally) {
    const cs = this.map.castle, guard = this.garrison.stance === 'guard';
    let best = null, bv = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.burrowT > 0) continue;
      if (e.air && !D.air) continue;
      if (guard && hyp(e.x - cs.x, e.y - cs.y) > GARRISON.guardRadius) continue;
      let v = hyp(e.x - u.x, e.y - u.y) + 0.8 * (e.total - e.dist);
      v += (D.ranged ? 0.35 : 0.9) * (tally.get(e) || 0);
      if (D.holds && e.blocker && e.blocker !== u) v += 0.8;
      const df = e.def;
      if (e.markT > 0) v -= 4;
      if (D.hunter && (df.steal || df.shoots || df.heal || df.ward || df.sabotage || df.hunts)) v -= 3;
      if (D.antiFast && (df.speed >= 1.5 || e.type === 'cavalry')) v -= 2.5;
      if (D.antiBoss && (e.boss || e.armor >= 35)) v -= 2.5;
      if ((D.preferAir || (D.ranged && D.air)) && e.air) v -= D.preferAir ? 2.5 : 1.5;
      if (v < bv) { bv = v; best = e; }
    }
    return best;
  },

  noteTroopDmg(u, amt) { if (amt > 0) { u.dmgDone += amt; this.stats.troopDmg += amt; } },

  troopStrike(u, D, e) {
    u.cd = 1 / D.rate; u.swing = 0.22;
    this.emit('troopHit', { troop: u, enemy: e });
    let dmg = u.dmg;
    if (D.antiFast && (e.def.speed >= 1.5 || e.type === 'cavalry')) dmg *= D.antiFast;
    if (D.charge && u.charged !== e) {
      dmg *= D.charge; u.charged = e;
      if (!e.boss) this.stun(e, 0.5);
      this.emit('troopCharge', { troop: u, enemy: e });
    }
    this.noteTroopDmg(u, this.damage(e, dmg, 'physical', u));
    if (D.splash) {
      for (const n of this.enemies) {
        if (n === e || n.dead || hyp(n.x - e.x, n.y - e.y) > D.splash) continue;
        this.noteTroopDmg(u, this.damage(n, dmg * 0.5, 'physical', u));
      }
    }
  },
  troopShoot(u, D, e) {
    u.cd = 1 / D.rate; u.swing = 0.2;
    this.projectiles.push({ kind: 'arrow', src: u, dmg: u.dmg, type: 'physical', x: u.x, y: u.y - 0.25, target: e, lx: e.x, ly: e.y, speed: 13, splash: 0, chain: 0, s: {}, pierceArmor: D.pierce || 0, bossMult: D.pierce ? 1.25 : 1 });
    this.emit('troopShoot', { troop: u });
  },

  clericStep(u, D, dt) {
    u.healCd -= dt;
    let hurt = null, hv = 1, lead = null, ld = Infinity;
    for (const o of this.garrison.units) {
      if (o === u || o.state !== 'out' || o.dead) continue;
      const f = o.hp / o.maxHp;
      if (f < hv) { hv = f; hurt = o; }
      const d = hyp(o.x - u.x, o.y - u.y);
      if (o.kind !== 'cleric' && d < ld) { ld = d; lead = o; }
    }
    if (hurt && hv < 0.92 && u.healCd <= 0 && hyp(hurt.x - u.x, hurt.y - u.y) <= D.healRange) {
      u.healCd = D.healCd; u.swing = 0.25;
      hurt.hp = Math.min(hurt.maxHp, hurt.hp + hurt.maxHp * D.heal * (1 + GARRISON.rankBonus * u.rank));
      this.emit('troopHeal', { from: u, to: hurt });
    }
    const goal = hurt && hv < 0.92 ? hurt : lead;
    if (goal) { if (hyp(goal.x - u.x, goal.y - u.y) > D.healRange * 0.55) this.troopMove(u, goal.x, goal.y, D.speed, dt); }
    else { const h = this.troopHome(u); this.troopMove(u, h.x, h.y, D.speed * 0.85, dt, 0.05); }
  },

  // ---------- damage taken and glory ----------
  nearestTroop(e, range) {
    let best = null, bd = range;
    for (const u of this.garrison.units) {
      if (u.dead || u.state === 'reserve') continue;
      const d = hyp(u.x - e.x, u.y - e.y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },
  hurtTroop(u, dmg) {
    if (u.dead || u.state === 'reserve') return;
    u.hp -= dmg * (1 - Math.min(0.8, u.armor / 100));
    u.flash = 0.12;
    if (u.hp <= 0) this.troopFalls(u);
  },
  troopFalls(u) {
    const G = this.garrison;
    if (this.boon('immortal') && !G.immortalUsed) {
      G.immortalUsed = true; u.hp = u.maxHp * 0.5;
      this.emit('troopRise', { troop: u });
      return;
    }
    if (this.bonus.troopSave && this.rng.chance(this.bonus.troopSave)) {
      this.releaseTroop(u); u.hp = u.maxHp * 0.15; u.state = 'back'; u.held = false;
      this.emit('troopSaved', { troop: u });
      return;
    }
    u.dead = true;
    this.releaseTroop(u);
    G.units = G.units.filter((x) => x !== u);
    this.stats.troopsLost++;
    this.emit('troopDown', { troop: u });
  },
  troopKilled(u, e) {
    this.stats.troopKills++; u.kills++;
    u.xp += e.boss ? 6 : e.def.hp >= 200 ? 3 : 1;
    let r = 0;
    while (r < GARRISON.ranks.length && u.xp >= GARRISON.ranks[r]) r++;
    if (r > u.rank) {
      u.rank = r; this.refreshTroop(u);
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.3);
      this.stats.maxTroopRank = Math.max(this.stats.maxTroopRank, r);
      this.emit('troopRank', { troop: u, rank: r });
    }
  },
  // A foe that fights back against the troop beside it instead of being held: bosses, rams and flyers.
  foeStrike(e, dt) {
    e.strikeT = (e.strikeT || 0) - dt;
    if (e.strikeT > 0) return;
    const u = this.nearestTroop(e, 0.85);
    if (!u) { e.strikeT = 0.25; return; }
    e.strikeT = 1.4;
    const cyc = e.boss ? 1 + 0.3 * (this.plan.boss?.cycle || 0) : 1;
    this.hurtTroop(u, Math.max(3, e.def.dmg * 1.2) * Math.sqrt(this.plan.hp) * cyc);
    this.emit('foeStrike', { enemy: e, troop: u });
  },

  // ---------- saves ----------
  serializeGarrison() {
    const G = this.garrison;
    return {
      units: G.units.map((u) => ({ kind: u.kind, f: u.maxHp ? u.hp / u.maxHp : 1, xp: u.xp, rank: u.rank, kills: u.kills, paid: u.paid || 0 })),
      queue: G.queue.map((q) => ({ kind: q.kind, t: q.t, gold: q.gold, valor: q.valor })),
      valor: G.valor, muster: G.muster, stance: G.stance, auto: G.auto,
    };
  },
  loadGarrison(s) {
    const G = this.garrison;
    if (!s) return;
    G.valor = s.valor || 0; G.muster = s.muster || 0; G.stance = s.stance === 'guard' ? 'guard' : 'hunt'; G.auto = s.auto !== false;
    G.queue = (s.queue || []).filter((q) => TROOPS[q.kind]).map((q) => ({ kind: q.kind, t: q.t || 0, gold: q.gold || 0, valor: q.valor || 0 }));
    for (const d of s.units || []) {
      if (!TROOPS[d.kind]) continue;
      const u = this.makeTroop(d.kind, d.paid || 0);
      G.units.push(u);
      u.xp = d.xp || 0; u.rank = d.rank || 0; u.kills = d.kills || 0; u.frac = Math.max(0.05, Math.min(1, d.f ?? 1));
    }
  },
};
