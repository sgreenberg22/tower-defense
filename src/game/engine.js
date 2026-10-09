// Bastion Siege simulation. Pure logic: no DOM, no canvas. Presentation subscribes to events.
import { GAME, TOWERS, TIER, ENEMIES, BOSSES, WEAPONS, ARMORY, BOONS, RARITY_WEIGHT, MODIFIERS, COMBO, WEAPON_SCALE_PER_WAVE } from '../data/balance.js';
import { Rng, seedFor } from '../core/rng.js';
import { planWave, armorAdd, biomeFor, isBossWave } from './waves.js';
import * as eco from './economy.js';
import { buildMap, isBuildable, T } from './maps.js';

const BOON_BY_ID = Object.fromEntries(BOONS.map((b) => [b.id, b]));
const BOON_REQUIRES = { cannon_splash: 'cannon', mage_chain: 'mage', pierce: 'ballista', taxman: 'mint', garrison: 'barracks' };
const DEFAULT_BONUS = {
  castleHpMult: 1, startGold: 0, killGold: 0, towerDiscount: 0, sellBonus: 0, weaponDmg: 0, reloadMult: 1,
  ammoAdd: 0, boonChoices: 0, secondWind: false, repairDiscount: 0, towerDmg: 0, rerolls: 0,
  unlockedTowers: null, // null = all unlocked (sim/tests)
};

let UID = 1;

export class Game {
  constructor(opts = {}) {
    this.opts = opts;
    this.seed = opts.seed || 'seed';
    this.mapId = opts.mapId || 'meadow';
    this.mode = opts.mode || 'normal';
    this.modifiers = opts.modifiers || [];
    this.mod = Object.fromEntries(this.modifiers.map((m) => [m, true]));
    this.ascension = opts.ascension || 0;
    this.bonus = { ...DEFAULT_BONUS, ...(opts.bonus || {}) };
    this.portrait = !!opts.portrait;
    this.tutorial = !!opts.tutorial;
    this.map = buildMap(this.mapId, this.seed, this.portrait);
    this.listeners = {};
    this.rng = new Rng(seedFor(this.seed, 'combat'));

    this.wave = 1;
    this.phase = 'build';
    this.buildTimer = Infinity;
    this.gold = GAME.startGold + this.bonus.startGold;
    this.score = 0;
    const hpMult = this.bonus.castleHpMult * (this.mod.glass ? 0.5 : 1);
    this.castle = { hp: GAME.castleHp * hpMult, maxHp: GAME.castleHp * hpMult };
    this.wall = { hp: GAME.wallHp * hpMult, maxHp: GAME.wallHp * hpMult };
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.fields = [];          // burning ground
    this.spawnQueue = [];
    this.waveClock = 0;
    this.plan = null;
    this.waveLeaks = 0;
    this.boons = {};
    this.boonOffer = null;
    this.rerolls = this.bonus.rerolls;
    this.secondWind = !!this.bonus.secondWind;
    this.repairKits = 0;
    this.hazard = { t: 0, active: 0, kind: null };
    this.time = 0;
    this.combo = 0; this.comboT = 0;
    const wid = opts.weapon && WEAPONS[opts.weapon] ? opts.weapon : 'longbow';
    this.weapon = { id: wid, lv: { dmg: 0, reload: 0, ammo: 0, crit: 0 }, ammo: 0, reloadT: 0 };
    this.weapon.ammo = this.weaponStats().ammo;
    this.stats = {
      kills: 0, heroKills: 0, shots: 0, hits: 0, headshots: 0, killsByType: {}, dmgByTower: {}, builtByTower: {}, heroDmg: 0, maxMastery: 0,
      goldEarned: 0, goldSpent: 0, leaks: 0, towersBuilt: 0, bossKills: 0, flawless: 0, flawlessStreak: 0, maxFlawlessStreak: 0,
      maxCombo: 0, peakGold: this.gold, specs: [], mintGold: 0, maxTowers: 0, bossDmg: 0, repairs: 0, earlyCalls: 0,
      boonsTaken: 0, time: 0, wavesCleared: 0, gems: 0,
    };
    this.over = false;
    if (opts.reinforcements) this.applyReinforcements(opts.reinforcements);
    if (opts.save) this.load(opts.save);
    this.refreshTowers();
    this.nextPlan = planWave(this.wave, this.seed, this.waveOpts());
  }

  // ---------- events ----------
  on(type, fn) { (this.listeners[type] ||= []).push(fn); return () => this.off(type, fn); }
  off(type, fn) { const l = this.listeners[type]; if (l) this.listeners[type] = l.filter((f) => f !== fn); }
  emit(type, data) { const l = this.listeners[type]; if (l) for (const f of l) f(data); const a = this.listeners['*']; if (a) for (const f of a) f(type, data); }

  waveOpts() { return { ascension: this.ascension, swarm: this.mod.swarm, double: this.mod.double }; }
  boon(id) { return this.boons[id] || 0; }
  get biome() { return biomeFor(this.wave); }
  goldMult() { return this.mod.goldrush ? 1.5 : 1; }

  addGold(g, track = true) {
    g = Math.round(g * this.goldMult());
    this.gold += g;
    if (track) this.stats.goldEarned += g;
    if (this.gold > this.stats.peakGold) this.stats.peakGold = this.gold;
    return g;
  }
  spend(g) { this.gold -= g; this.stats.goldSpent += g; }

  // ---------- towers ----------
  towerAt(x, y) { return this.towers.find((t) => t.x === x && t.y === y); }
  isTowerUnlocked(id) {
    const def = TOWERS[id];
    if (!def) return false;
    if (this.bonus.unlockedTowers && !this.bonus.unlockedTowers.has(id)) return false;
    return this.wave >= def.unlockWave;
  }
  discount() { return Math.min(0.5, this.bonus.towerDiscount + 0.08 * this.boon('thrifty')); }
  buildCost(id) { return eco.towerCost(id, { discount: this.discount(), owned: this.towers.filter((t) => t.type === id && !t.ally).length }); }

  canBuild(id, x, y) {
    const def = TOWERS[id];
    if (!def || !this.isTowerUnlocked(id) || this.over) return false;
    if (!isBuildable(this.map, x, y, !!def.trap)) return false;
    if (this.towerAt(x, y)) return false;
    return this.gold >= this.buildCost(id);
  }

  build(id, x, y) {
    if (!this.canBuild(id, x, y)) return null;
    const cost = this.buildCost(id);
    this.spend(cost);
    const t = this.makeTower(id, x, y, 1);
    t.invested = cost;
    this.towers.push(t);
    this.stats.towersBuilt++;
    this.stats.builtByTower[id] = (this.stats.builtByTower[id] || 0) + 1;
    this.stats.maxTowers = Math.max(this.stats.maxTowers, this.towers.length);
    this.refreshTowers();
    this.emit('build', { tower: t });
    return t;
  }

  makeTower(id, x, y, tier) {
    const def = TOWERS[id];
    const t = {
      uid: UID++, type: id, x, y, cx: x + 0.5, cy: y + 0.5, tier, spec: null, invested: 0,
      hp: def.hp, maxHp: def.hp, cd: 0.3, targetMode: 'first', disabledT: 0, ruined: false,
      fresh: this.phase === 'build', kills: 0, dmg: 0, aim: 0, recoil: 0,
      high: this.map.tileAt(x, y) === T.HIGH, rally: this.map.rally.has(y * this.map.cols + x),
      beam: null, soldiers: [], ally: null, allyWaves: 0, mastery: 0,
    };
    if (id === 'barracks') t.rallyPt = this.findRallyPoint(t);
    return t;
  }

  findRallyPoint(t) {
    let best = null, bd = Infinity;
    for (let y = 0; y < this.map.rows; y++) for (let x = 0; x < this.map.cols; x++) {
      if (this.map.tileAt(x, y) !== T.PATH) continue;
      const d = Math.hypot(x + 0.5 - t.cx, y + 0.5 - t.cy);
      if (d < bd && d <= TOWERS.barracks.range) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; }
    }
    return best || { x: t.cx, y: t.cy };
  }

  upgradeCost(t) {
    if (t.ally) return Infinity;
    if (t.tier >= TIER.max) return eco.masteryCost(t.type, t.mastery, this.discount());
    return eco.upgradeCost(t.type, t.tier, this.discount());
  }
  canUpgrade(t) { return (t.tier < TIER.max - 1 || t.tier === TIER.max) && this.gold >= this.upgradeCost(t) && !t.ally; }
  upgrade(t) {
    if (!this.canUpgrade(t)) return false;
    const c = this.upgradeCost(t);
    this.spend(c); t.invested += c;
    if (t.tier >= TIER.max) { t.mastery++; this.stats.maxMastery = Math.max(this.stats.maxMastery || 0, t.mastery); }
    else { t.tier++; this.applyTierHp(t); }
    this.refreshTowers();
    this.emit('upgrade', { tower: t, mastery: t.tier >= TIER.max ? t.mastery : 0 });
    return true;
  }
  canSpec(t) { return t.tier === TIER.max - 1 && this.gold >= this.upgradeCost(t) && !t.ally; }
  chooseSpec(t, specId) {
    if (!this.canSpec(t) || !TOWERS[t.type].specs[specId]) return false;
    const c = this.upgradeCost(t);
    this.spend(c); t.invested += c; t.tier = TIER.max; t.spec = specId;
    this.applyTierHp(t);
    if (!this.stats.specs.includes(t.type + ':' + specId)) this.stats.specs.push(t.type + ':' + specId);
    this.refreshTowers();
    this.emit('upgrade', { tower: t, spec: specId });
    return true;
  }
  applyTierHp(t) {
    const base = TOWERS[t.type].hp;
    const frac = t.hp / t.maxHp;
    t.maxHp = base * TIER.hp[t.tier - 1];
    t.hp = t.maxHp * frac;
  }
  sellValue(t) { return t.ally ? 0 : eco.sellValue(t.invested, t.fresh && this.phase === 'build', this.bonus.sellBonus); }
  sell(t) {
    if (t.ally) return false;
    const v = this.sellValue(t);
    this.gold += v;
    this.towers = this.towers.filter((o) => o !== t);
    for (const e of this.enemies) if (e.blocker && t.soldiers.includes(e.blocker)) e.blocker = null;
    this.refreshTowers();
    this.emit('sell', { tower: t, value: v });
    return true;
  }
  setTargeting(t, mode) { t.targetMode = mode; }

  // ---------- repairs ----------
  repairDiscount() { return this.bonus.repairDiscount; }
  canRepair() { return this.phase === 'build' && !this.mod.norepair; }
  wallRepairCost() { return eco.wallRepairCost(this.wall.maxHp - this.wall.hp, this.wave, this.repairDiscount()); }
  castleRepairCost() { return eco.castleRepairCost(this.castle.maxHp - this.castle.hp, this.wave, this.repairDiscount()); }
  towerRepairCost(t) { return t.ally ? 0 : eco.towerRepairCost(t.invested, 1 - t.hp / t.maxHp, this.repairDiscount()); }
  repairWall(partial = true) {
    if (!this.canRepair() || this.wall.hp >= this.wall.maxHp) return false;
    const perHp = eco.wallRepairCost(1, this.wave, this.repairDiscount());
    let missing = this.wall.maxHp - this.wall.hp;
    let cost = this.wallRepairCost();
    if (cost > this.gold) { if (!partial) return false; missing = Math.floor(this.gold / perHp); cost = eco.wallRepairCost(missing, this.wave, this.repairDiscount()); }
    if (missing <= 0) return false;
    this.spend(cost); this.wall.hp = Math.min(this.wall.maxHp, this.wall.hp + missing);
    this.stats.repairs++;
    this.emit('repair', { what: 'wall' });
    return true;
  }
  repairCastle(partial = true) {
    if (!this.canRepair() || this.castle.hp >= this.castle.maxHp) return false;
    const perHp = eco.castleRepairCost(1, this.wave, this.repairDiscount());
    let missing = this.castle.maxHp - this.castle.hp;
    let cost = this.castleRepairCost();
    if (cost > this.gold) { if (!partial) return false; missing = Math.floor(this.gold / perHp); cost = eco.castleRepairCost(missing, this.wave, this.repairDiscount()); }
    if (missing <= 0) return false;
    this.spend(cost); this.castle.hp = Math.min(this.castle.maxHp, this.castle.hp + missing);
    this.stats.repairs++;
    this.emit('repair', { what: 'castle' });
    return true;
  }
  repairTower(t) {
    if (!this.canRepair() || t.hp >= t.maxHp) return false;
    const c = this.towerRepairCost(t);
    if (c > this.gold) return false;
    this.spend(c); t.hp = t.maxHp; t.ruined = false;
    this.stats.repairs++;
    this.emit('repair', { what: 'tower', tower: t });
    return true;
  }
  repairAllTowers() {
    let any = false;
    for (const t of [...this.towers].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)) if (t.hp < t.maxHp && this.repairTower(t)) any = true;
    return any;
  }
  useRepairKit() {
    if (this.repairKits <= 0 || this.wall.hp >= this.wall.maxHp) return false;
    this.repairKits--; this.wall.hp = this.wall.maxHp; this.emit('repair', { what: 'wall', kit: true });
    return true;
  }

  // ---------- armory / weapon ----------
  armoryCost(stat) { return eco.armoryCost(stat, this.weapon.lv[stat]); }
  buyArmory(stat) {
    const c = this.armoryCost(stat);
    if (!Number.isFinite(c) || this.gold < c || this.phase !== 'build') return false;
    this.spend(c); this.weapon.lv[stat]++;
    if (stat === 'ammo') this.weapon.ammo++;
    this.emit('armory', { stat });
    return true;
  }
  weaponStats() {
    const W = WEAPONS[this.weapon.id], lv = this.weapon.lv;
    let dmg = W.dmg * (1 + ARMORY.dmg.per * lv.dmg) * (1 + this.bonus.weaponDmg) * (1 + WEAPON_SCALE_PER_WAVE * (this.wave - 1));
    if (this.mod.lonehero) dmg *= 1.6;
    const reload = W.reload * Math.max(0.3, (1 - ARMORY.reload.per * lv.reload) * this.bonus.reloadMult * Math.pow(0.85, this.boon('steady')));
    const ammo = W.ammo + lv.ammo + this.bonus.ammoAdd + 2 * this.boon('quiver');
    const crit = Math.min(0.9, W.crit + ARMORY.crit.per * lv.crit + 0.08 * this.boon('lucky'));
    return { ...W, dmg, reload, ammo, crit };
  }
  comboMult() { return 1 + Math.min(this.combo, COMBO.cap + 10 * this.boon('combo')) * COMBO.perStep; }

  heroOrigin() { return { x: this.map.castle.x, y: this.map.castle.y - 0.66 }; }

  // Find the enemy under a tap. Returns {enemy, headshot} or null.
  pickEnemy(x, y, radius = 0.85) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead || !this.isVisible(e)) continue;
      const cy = e.y - e.size * 0.35 - (e.air ? 0.35 : 0);
      const d = Math.hypot(e.x - x, cy - y) - e.size * 0.6;
      if (d < radius && d < bd) { bd = d; best = e; }
    }
    if (!best) return null;
    const headY = best.y - best.size * 0.75 - (best.air ? 0.35 : 0);
    return { enemy: best, headshot: Math.abs(y - headY) < best.size * 0.45 && Math.abs(x - best.x) < best.size * 0.7 };
  }

  // Fire the personal weapon at the tapped point. charge in [0,1]. Returns true if a shot was fired.
  heroFire(x, y, charge = 0) {
    if (this.over || this.phase !== 'wave' || this.weapon.ammo < 1) return false;
    const pick = this.pickEnemy(x, y);
    if (!pick) return false;
    const W = this.weaponStats();
    const e = pick.enemy;
    const o = this.heroOrigin();
    // Lead the target.
    const dist = Math.hypot(e.x - o.x, e.y - o.y);
    const tt = dist / W.speed;
    const tx = e.x + (e.vx || 0) * tt, ty = e.y + (e.vy || 0) * tt;
    this.weapon.ammo -= 1;
    if (this.weapon.reloadT <= 0) this.weapon.reloadT = W.reload;
    this.stats.shots++;
    const full = charge >= 0.95;
    const dmg = W.dmg * (1 + (COMBO.chargeMult - 1) * charge);
    const crit = this.rng.chance(W.crit);
    const base = { kind: 'hero', weapon: this.weapon.id, x: o.x, y: o.y, speed: W.speed, dmg, type: W.type,
      splash: W.splash || (this.boon('explosive') ? 0.8 : 0), splashFrac: W.splash ? 0.7 : 0.5, burn: W.burn || 0, chain: W.chain || 0,
      pierce: (W.pierce || 0) + (full ? 2 : 0), crit, headshot: pick.headshot, intended: e, hitSet: new Set(), main: true, charge };
    this.fireStraight(base, tx, ty);
    if (this.boon('multishot')) {
      for (const da of [-0.22, 0.22]) {
        const ang = Math.atan2(ty - o.y, tx - o.x) + da;
        const len = Math.hypot(tx - o.x, ty - o.y) + 0.5;
        this.fireStraight({ ...base, dmg: dmg * 0.5, main: false, headshot: false, hitSet: new Set(), intended: null }, o.x + Math.cos(ang) * len, o.y + Math.sin(ang) * len);
      }
    }
    this.emit('heroShot', { x: tx, y: ty, charge, weapon: this.weapon.id });
    return true;
  }

  fireStraight(p, tx, ty) {
    const d = Math.hypot(tx - p.x, ty - p.y) || 0.01;
    p.dx = (tx - p.x) / d; p.dy = (ty - p.y) / d; p.left = d + 0.35; p.tx = tx; p.ty = ty;
    this.projectiles.push(p);
  }

  isVisible(e) {
    if (!this.mod.fog) return true;
    if (Math.hypot(e.x - this.map.castle.x, e.y - this.map.castle.y) < 3.2) return true;
    for (const t of this.towers) if (t.stats.range && Math.hypot(e.x - t.cx, e.y - t.cy) <= t.stats.range + 0.3) return true;
    return false;
  }

  // ---------- boons ----------
  offerBoons(extra = false) {
    const n = 3 + this.bonus.boonChoices + this.boon('scholar');
    const rng = new Rng(seedFor(this.seed, 'boon', this.wave, this.stats.boonsTaken, extra ? 'r' + this.rerolls : ''));
    let pool = BOONS.filter((b) => this.boon(b.id) < b.stack && (!BOON_REQUIRES[b.id] || this.isTowerKnown(BOON_REQUIRES[b.id])));
    if (this.mod.norepair) pool = pool.filter((b) => b.id !== 'masonry' && b.id !== 'fieldrepair');
    const out = [];
    while (out.length < n && pool.length) {
      const b = rng.weighted(pool, (x) => RARITY_WEIGHT[x.rarity]);
      out.push(b.id); pool = pool.filter((x) => x !== b);
    }
    this.boonOffer = out;
    this.emit('boonOffer', { ids: out });
  }
  isTowerKnown(id) { return !this.bonus.unlockedTowers || this.bonus.unlockedTowers.has(id); }
  rerollBoons() {
    if (!this.boonOffer || this.rerolls <= 0) return false;
    this.rerolls--; this.offerBoons(true); return true;
  }
  chooseBoon(id) {
    if (!this.boonOffer || !this.boonOffer.includes(id)) return false;
    this.boons[id] = (this.boons[id] || 0) + 1;
    this.boonOffer = null;
    this.stats.boonsTaken++;
    if (id === 'masonry') { this.wall.maxHp *= 1.25; this.wall.hp = this.wall.maxHp; }
    if (id === 'secondwind') this.secondWind = true;
    if (id === 'warfund') this.addGold(150, false);
    if (id === 'quiver') this.weapon.ammo += 2;
    this.refreshTowers();
    this.emit('boon', { id });
    return true;
  }

  // ---------- reinforcements ----------
  applyReinforcements(list) {
    for (const r of list) {
      if (r.kind === 'gold') this.gold += 120;
      else if (r.kind === 'repair') this.repairKits++;
      else if (r.kind === 'tower') this.pendingAllies = [...(this.pendingAllies || []), r];
    }
  }
  placeAllies() {
    if (!this.pendingAllies) return;
    const spots = [...this.map.coverage.entries()].sort((a, b) => b[1] - a[1]);
    for (const r of this.pendingAllies) {
      const type = ['archer', 'cannon', 'mage'].includes(r.tower) ? r.tower : 'archer';
      const spot = spots.find(([k]) => { const x = k % this.map.cols, y = Math.floor(k / this.map.cols); return isBuildable(this.map, x, y) && !this.towerAt(x, y); });
      if (!spot) break;
      const x = spot[0] % this.map.cols, y = Math.floor(spot[0] / this.map.cols);
      const t = this.makeTower(type, x, y, Math.min(4, r.tier || 2));
      t.ally = r.from || 'Ally'; t.allyWaves = 10; this.applyTierHp(t); t.hp = t.maxHp;
      this.towers.push(t);
    }
    this.pendingAllies = null;
    this.refreshTowers();
  }

  // ---------- stats ----------
  refreshTowers() {
    // Banner auras first.
    for (const t of this.towers) { t.auraDmg = 0; t.auraRate = 0; }
    for (const b of this.towers) {
      if (b.type !== 'banner' || b.ruined) continue;
      const def = TOWERS.banner, sp = b.spec ? def.specs[b.spec] : {};
      const r = def.aura + (sp.auraAdd || 0) + 0.15 * (b.tier - 1);
      const mu = 1 + TIER.mastery.util * (b.mastery || 0);
      const dmg = (def.auraDmg * (1 + 0.25 * (b.tier - 1)) + (sp.auraDmgAdd || 0)) * mu;
      const rate = (def.auraRate * (1 + 0.25 * (b.tier - 1)) + (sp.auraRateAdd || 0)) * mu;
      b.stats = { range: r, aura: true };
      for (const t of this.towers) {
        if (t === b || t.type === 'banner') continue;
        if (Math.hypot(t.cx - b.cx, t.cy - b.cy) <= r + 0.01) { t.auraDmg = Math.max(t.auraDmg, dmg); t.auraRate = Math.max(t.auraRate, rate); }
      }
    }
    for (const t of this.towers) if (t.type !== 'banner') t.stats = this.computeStats(t);
  }

  computeStats(t) {
    const def = TOWERS[t.type], i = t.tier - 1, sp = t.spec ? def.specs[t.spec] : {};
    const s = {
      dmg: (def.dmg || 0) * TIER.dmg[i], rate: (def.rate || 0) * TIER.rate[i], range: def.range ? def.range + TIER.range[i] : 0,
      minRange: def.minRange || 0, splash: def.splash || 0, chain: def.chain || 0, chainRange: def.chainRange || 0,
      chainFalloff: def.chainFalloff || 0.7, pierce: def.pierce || 0, targets: def.targets, type: def.type,
      critChance: 0, critMult: 2, multi: 1, bossMult: 1, armoredMult: 1, shred: 0, stun: 0, stunChance: 0, fireField: 0,
      pierceMr: false, freezeChance: 0, vuln: 0,
    };
    if (sp.range) s.range += sp.range;
    if (sp.critChance) { s.critChance = sp.critChance; s.critMult = sp.critMult; }
    if (sp.multi) s.multi = sp.multi;
    if (sp.rateMult) s.rate *= sp.rateMult;
    if (sp.dmgMult) s.dmg *= sp.dmgMult;
    if (sp.splashMult) s.splash *= sp.splashMult;
    if (sp.chainAdd) s.chain += sp.chainAdd;
    if (sp.chainSet !== undefined) s.chain = sp.chainSet;
    if (sp.chainRangeAdd) s.chainRange += sp.chainRangeAdd;
    if (sp.pierceSet) s.pierce = sp.pierceSet;
    if (sp.bossMult) s.bossMult = sp.bossMult;
    if (sp.armoredMult) s.armoredMult = sp.armoredMult;
    if (sp.shred) s.shred = sp.shred;
    if (sp.stun) s.stun = sp.stun;
    if (sp.stunChance) s.stunChance = sp.stunChance;
    if (sp.fireField) s.fireField = sp.fireField;
    if (sp.pierceMr) s.pierceMr = true;
    if (sp.freezeChance) s.freezeChance = sp.freezeChance;
    if (sp.vuln) s.vuln = sp.vuln;
    if (t.high) { s.range += TIER.highGroundRange; s.dmg *= 1 + TIER.highGroundDmg; }
    const mDmg = Math.pow(1 + TIER.mastery.dmg, t.mastery || 0), mUtil = 1 + TIER.mastery.util * (t.mastery || 0);
    s.dmg *= mDmg;
    if (t.rally) s.rate *= 1.1;
    // Boons
    if (t.type === 'archer') s.dmg *= 1 + 0.25 * this.boon('archer_dmg');
    if (t.type === 'cannon') { s.splash *= 1 + 0.25 * this.boon('cannon_splash'); s.dmg *= 1 + 0.15 * this.boon('cannon_splash'); }
    if (t.type === 'mage' || t.type === 'tesla') s.chain += this.boon('mage_chain');
    if (t.type === 'ballista') { s.pierce += 2 * this.boon('pierce'); s.dmg *= 1 + 0.15 * this.boon('pierce'); }
    if (s.type === 'magic') s.dmg *= 1 + 0.22 * this.boon('arcane');
    s.rate *= 1 + 0.08 * this.boon('overclock');
    s.range *= 1 + 0.08 * this.boon('eagle');
    s.critChance += 0.08 * this.boon('lucky') * (s.critChance > 0 || t.type === 'archer' ? 1 : 0);
    s.dmg *= 1 + t.auraDmg + this.bonus.towerDmg;
    s.rate *= 1 + t.auraRate;
    if (this.mod.lonehero) s.dmg *= 0.65;
    // Type specifics
    if (t.type === 'mint') {
      s.income = def.income * TIER.income[i] * (sp.incomeMult || 1) * (1 + 0.35 * this.boon('taxman')) * mUtil;
      s.killGold = sp.killGold || 0;
    }
    if (t.type === 'firetrap') {
      s.burn = def.burn * TIER.dmg[i] * mDmg * (sp.burnMult || 1) * (1 + 0.35 * this.boon('pyro')) * (1 + t.auraDmg) * (this.mod.lonehero ? 0.65 : 1);
      s.burnTime = def.burnTime; s.slow = sp.slow || 0; s.spread = !!sp.spread; s.range = 0.6;
    }
    if (t.type === 'barracks') {
      const g = this.boon('garrison');
      s.soldiers = sp.soldiersSet || def.soldiers;
      s.soldierHp = def.soldierHp * TIER.hp[i] * mUtil * (sp.hpMult || 1) * (1 + 0.5 * g);
      s.soldierDmg = def.soldierDmg * TIER.dmg[i] * mDmg * (sp.dmgMult || 1) * (1 + 0.5 * g) * (1 + t.auraDmg);
      s.soldierArmor = sp.armor || 0; s.ranged = !!sp.ranged; s.respawn = def.respawn;
      s.range = def.range;
    }
    if (t.type === 'frost') {
      s.slow = sp.slowSet || Math.min(0.6, def.slow + 0.03 * i);
      s.slowTime = def.slowTime * (1 + 0.5 * this.boon('frostbite'));
      s.slow = Math.min(0.8, s.slow * (1 + 0.25 * this.boon('frostbite')));
    }
    if (t.type === 'obelisk') {
      s.dps = def.dps * TIER.dmg[i] * mDmg * (1 + 0.22 * this.boon('arcane')) * (1 + t.auraDmg + this.bonus.towerDmg) * (this.mod.lonehero ? 0.65 : 1);
      s.rampMax = sp.rampMaxSet || def.rampMax; s.ramp = def.ramp; s.beams = sp.beams || 1;
    }
    if (t.type === 'catapult' && s.fireField) s.fireField = sp.fireField;
    return s;
  }

  killGoldBonus() {
    let b = this.bonus.killGold + 0.12 * this.boon('bounty');
    for (const t of this.towers) if (t.type === 'mint' && t.stats?.killGold && !t.ruined) b += t.stats.killGold;
    return b;
  }

  // ---------- wave flow ----------
  startWave() {
    if (this.phase !== 'build' || this.over || this.boonOffer) return false;
    if (Number.isFinite(this.buildTimer) && this.buildTimer > 1) {
      const g = eco.earlyCallGold(this.buildTimer, this.wave);
      this.addGold(g);
      this.score += Math.round(g * this.scoreMult());
      this.stats.earlyCalls++;
      this.emit('earlyCall', { gold: g });
    }
    this.placeAllies();
    this.phase = 'wave';
    this.plan = this.nextPlan;
    this.spawnQueue = [];
    for (const g of this.plan.groups) {
      for (let i = 0; i < g.count; i++) this.spawnQueue.push({ t: g.delay + i * g.gap, type: g.type, boss: g.boss, spawn: g.spawn });
    }
    this.spawnQueue.sort((a, b) => a.t - b.t);
    this.waveClock = 0; this.waveLeaks = 0; this.enraged = false;
    this.hazard = { t: 6 + this.rng.range(0, 6), active: 0, kind: this.biome.hazard };
    for (const t of this.towers) t.fresh = false;
    this.emit('waveStart', { wave: this.wave, plan: this.plan, boss: this.plan.boss });
    return true;
  }

  scoreMult() { return eco.scoreMultiplier(this.modifiers, this.ascension); }

  completeWave() {
    const w = this.wave;
    const flawless = this.waveLeaks === 0;
    let gold = eco.waveClearGold(w, 0.2 * this.boon('warfund'));
    let mint = 0;
    for (const t of this.towers) if (t.type === 'mint' && !t.ruined) mint += t.stats.income;
    mint = Math.round(mint);
    const interest = this.boon('interest') ? Math.min(60 * this.boon('interest'), Math.floor(this.gold * 0.06 * this.boon('interest'))) : 0;
    const total = this.addGold(gold + mint + interest);
    this.stats.mintGold += mint;
    const pts = Math.round(eco.waveClearPoints(w, flawless) * this.scoreMult());
    this.score += pts;
    if (flawless) { this.stats.flawless++; this.stats.flawlessStreak++; this.stats.maxFlawlessStreak = Math.max(this.stats.maxFlawlessStreak, this.stats.flawlessStreak); }
    else this.stats.flawlessStreak = 0;
    this.stats.wavesCleared = w;
    // Ally towers expire.
    for (const t of this.towers) if (t.ally) t.allyWaves--;
    const leaving = this.towers.filter((t) => t.ally && t.allyWaves <= 0);
    if (leaving.length) { this.towers = this.towers.filter((t) => !leaving.includes(t)); this.refreshTowers(); }
    this.emit('waveClear', { wave: w, gold: total, mint, interest, points: pts, flawless, boss: isBossWave(w) });
    this.wave++;
    this.phase = 'build';
    this.buildTimer = this.tutorial && w < 3 ? Infinity : GAME.buildTime;
    this.weapon.ammo = this.weaponStats().ammo;
    this.combo = 0;
    this.nextPlan = planWave(this.wave, this.seed, this.waveOpts());
    this.refreshTowers();
    if (w % GAME.boonEvery === 0 || isBossWave(w)) this.offerBoons();
    this.emit('buildPhase', { wave: this.wave });
  }

  // ---------- spawning ----------
  spawnEnemy(type, spawnIdx, opts = {}) {
    const plan = this.plan;
    let def, boss = null;
    if (type === 'boss') {
      const b = BOSSES.find((x) => x.id === opts.boss);
      boss = { ...b, cycle: plan.boss?.cycle || 0 };
      def = b;
    } else def = ENEMIES[type];
    const pathIdx = spawnIdx % this.map.paths.length;
    let path = this.map.paths[pathIdx];
    if (def.air && !def.roads) path = [path[0], this.map.castle];
    const cycleMult = boss ? 1 + boss.cycle * 0.6 : 1;
    const hp = def.hp * plan.hp * cycleMult * (opts.hpScale || 1);
    const armorBase = def.armor + (def.armored || boss ? plan.armor : 0) + (this.mod.iron ? 20 : 0);
    const e = {
      uid: UID++, type, boss: boss ? boss.id : null, def, name: def.name, path, seg: 0,
      x: opts.x ?? path[0].x, y: opts.y ?? path[0].y, vx: 0, vy: 0, dist: opts.dist || 0,
      hp, maxHp: hp, armor: armorBase, mr: def.mr + (this.mod.iron ? 20 : 0),
      speed: def.speed * plan.speed * (opts.speedScale || 1), size: def.size, air: !!def.air,
      slowT: 0, slow: 0, burnT: 0, burn: 0, burnSrc: null, stunT: 0, shield: 0, shredT: 0, shred: 0, buffT: 0,
      stealthT: 0, cd: 1 + this.rng.range(0, 1), cd2: 2, dead: false, flash: 0, gear: plan.gear, bob: this.rng.range(0, 6),
      blocker: null, raised: !!opts.raised, color: def.color, stunImmune: 0, enraged: !!this.enraged,
    };
    if (opts.seg !== undefined) e.seg = opts.seg;
    if (opts.path) e.path = opts.path;
    // Remaining distance to castle for targeting.
    e.total = pathLength(e.path);
    this.enemies.push(e);
    if (boss) this.emit('bossSpawn', { enemy: e });
    return e;
  }

  // ---------- main step ----------
  update(dt = GAME.step) {
    if (this.over) return;
    this.time += dt;
    this.stats.time += dt;
    if (this.phase === 'build') {
      if (!this.boonOffer && Number.isFinite(this.buildTimer)) {
        this.buildTimer -= dt;
        if (this.buildTimer <= 0) { this.buildTimer = 0; this.startWave(); }
      }
      this.updateWeapon(dt);
      this.updateProjectiles(dt);
      return;
    }
    this.waveClock += dt;
    while (this.spawnQueue.length && this.spawnQueue[0].t <= this.waveClock) {
      const s = this.spawnQueue.shift();
      this.spawnEnemy(s.type, s.spawn, { boss: s.boss });
    }
    if (this.waveClock > 180 && !this.enraged) {
      // Safety valve: a wave can't stall forever (stun/heal stalemates).
      this.enraged = true;
      for (const e of this.enemies) { e.enraged = true; e.stunT = 0; }
      this.emit('enrage', {});
    }
    this.updateHazard(dt);
    this.updateWeapon(dt);
    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateFields(dt);
    if (this.boon('fieldrepair')) this.wall.hp = Math.min(this.wall.maxHp, this.wall.hp + this.wall.maxHp * 0.01 * this.boon('fieldrepair') * dt);
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0 && this.combo > 0) { this.combo = 0; this.emit('combo', { combo: 0 }); } }
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (!this.over && this.spawnQueue.length === 0 && this.enemies.length === 0) this.completeWave();
  }

  updateWeapon(dt) {
    const W = this.weaponStats();
    if (this.weapon.ammo < W.ammo) {
      this.weapon.reloadT -= dt;
      if (this.weapon.reloadT <= 0) { this.weapon.ammo++; this.weapon.reloadT = this.weapon.ammo < W.ammo ? W.reload : 0; }
    } else this.weapon.reloadT = 0;
  }

  updateHazard(dt) {
    const h = this.hazard;
    if (!h.kind) return;
    if (h.active > 0) {
      h.active -= dt;
      if (h.kind === 'meteors') {
        h.tick = (h.tick || 0) - dt;
        if (h.tick <= 0) { h.tick = 1.6; this.meteor(); }
      }
      if (h.active <= 0) this.emit('hazard', { kind: h.kind, on: false });
      return;
    }
    h.t -= dt;
    if (h.t <= 0) {
      h.t = 12 + this.rng.range(0, 8);
      h.active = h.kind === 'meteors' ? 5 : h.kind === 'stealth' ? 3 : 6;
      if (h.kind === 'stealth') for (const e of this.enemies) if (!e.boss && this.rng.chance(0.35)) e.stealthT = 3;
      this.emit('hazard', { kind: h.kind, on: true });
    }
  }
  hazardRangeMult() { return this.hazard.kind === 'sandstorm' && this.hazard.active > 0 ? 0.85 : 1; }
  hazardRateMult() { return this.hazard.kind === 'blizzard' && this.hazard.active > 0 ? 0.9 : 1; }

  meteor() {
    const pathTiles = [];
    for (let y = 0; y < this.map.rows; y++) for (let x = 0; x < this.map.cols; x++) if (this.map.tileAt(x, y) === T.PATH) pathTiles.push([x, y]);
    const [mx, my] = this.rng.pick(pathTiles);
    const x = mx + 0.5, y = my + 0.5;
    const dmg = 20 * (this.plan?.hp || 1);
    for (const e of this.enemies) if (!e.dead && !e.air && Math.hypot(e.x - x, e.y - y) < 1.1) this.damage(e, dmg, 'fire', null);
    this.emit('impact', { x, y, kind: 'meteor', splash: 1.1 });
  }

  updateEnemies(dt) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt);
      if (e.stealthT > 0) e.stealthT -= dt;
      if (e.shredT > 0) { e.shredT -= dt; if (e.shredT <= 0) e.shred = 0; }
      if (e.buffT > 0) e.buffT -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt;
        this.damage(e, e.burn * dt, 'fire', e.burnSrc, { dot: true });
        if (e.dead) continue;
      }
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      this.enemyAbilities(e, dt);
      if (e.dead) continue;
      if (e.stunImmune > 0) e.stunImmune -= dt;
      if (e.stunT > 0) { e.stunT -= dt; e.vx = e.vy = 0; if (e.stunT <= 0) e.stunImmune = 1.5; continue; }
      if (e.blocker && !e.blocker.dead) {
        e.vx = e.vy = 0;
        e.atkT = (e.atkT || 0) - dt;
        if (e.atkT <= 0) { e.atkT = 1; e.blocker.hp -= Math.max(2, e.def.dmg * 4 * (this.plan.hp ** 0.5)) * (1 - (e.blocker.armor || 0) / 100); if (e.blocker.hp <= 0) this.killSoldier(e.blocker); }
        continue;
      }
      e.blocker = null;
      let spd = e.speed * (1 - (e.enraged ? e.slow * 0.3 : e.slow));
      if (e.enraged) spd *= 1.6;
      if (e.buffT > 0) spd *= 1 + ENEMIES.warchief.aura.speed;
      if (this.hazard.kind === 'blizzard' && this.hazard.active > 0) spd *= 0.8;
      let move = spd * dt;
      const px = e.x, py = e.y;
      while (move > 0 && e.seg < e.path.length - 1) {
        const b = e.path[e.seg + 1];
        const d = Math.hypot(b.x - e.x, b.y - e.y);
        if (d <= move) { e.x = b.x; e.y = b.y; e.seg++; move -= d; e.dist += d; }
        else { e.x += ((b.x - e.x) / d) * move; e.y += ((b.y - e.y) / d) * move; e.dist += move; move = 0; }
      }
      e.vx = (e.x - px) / dt; e.vy = (e.y - py) / dt;
      if (e.seg >= e.path.length - 1) this.leak(e);
    }
  }

  enemyAbilities(e, dt) {
    const def = e.def;
    e.cd -= dt;
    if (def.shoots && e.cd <= 0) {
      const tw = this.nearestTower(e, def.shoots.range);
      if (tw) { e.cd = def.shoots.cd; this.projectiles.push({ kind: 'earrow', x: e.x, y: e.y - 0.2, target: tw, speed: 7, dmg: def.shoots.dmg * Math.sqrt(this.plan.hp) }); }
      else e.cd = 0.3;
    }
    if (def.heal && e.cd <= 0) {
      e.cd = def.heal.cd;
      for (const o of this.enemies) if (!o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < def.heal.range && o.hp < o.maxHp) {
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * def.heal.pct); this.emit('heal', { enemy: o });
      }
    }
    if (def.sabotage && e.cd <= 0) {
      const tw = this.nearestTower(e, def.sabotage.range);
      if (tw) { e.cd = def.sabotage.cd; tw.disabledT = def.sabotage.time; this.emit('sabotage', { tower: tw }); } else e.cd = 0.3;
    }
    if (def.aura) for (const o of this.enemies) if (!o.dead && Math.hypot(o.x - e.x, o.y - e.y) < def.aura.range) o.buffT = 0.25;
    if (def.ward && e.cd <= 0) {
      e.cd = def.ward.cd;
      for (const o of this.enemies) if (!o.dead && Math.hypot(o.x - e.x, o.y - e.y) < def.ward.range) o.shield = Math.max(o.shield, o.maxHp * def.ward.pct);
      this.emit('ward', { enemy: e });
    }
    if (!e.boss) return;
    if (def.summon && e.cd <= 0) {
      e.cd = def.summon.cd;
      for (let i = 0; i < def.summon.n; i++) this.spawnChild(e, def.summon.type, 0.9);
      this.emit('summon', { enemy: e });
    }
    if (def.stomp && e.cd <= 0) {
      e.cd = def.stomp.cd;
      for (const t of this.towers) if (Math.hypot(t.cx - e.x, t.cy - e.y) < def.stomp.range) { t.disabledT = def.stomp.time; this.damageTower(t, 20); }
      this.emit('stomp', { x: e.x, y: e.y, r: def.stomp.range });
    }
    if (def.breath && e.cd <= 0) {
      const tw = this.nearestTower(e, def.breath.range);
      if (tw) { e.cd = def.breath.cd; for (const t of this.towers) if (Math.hypot(t.cx - tw.cx, t.cy - tw.cy) < 1.1) this.damageTower(t, def.breath.dmg * (1 + 0.5 * (this.plan.boss?.cycle || 0))); this.emit('breath', { from: e, x: tw.cx, y: tw.cy }); }
      else e.cd = 0.5;
    }
    if (def.raise && e.cd <= 0) {
      e.cd = def.raise.cd;
      for (let i = 0; i < def.raise.n; i++) this.spawnChild(e, 'grunt', 1, { raised: true });
      this.emit('summon', { enemy: e, raise: true });
    }
  }

  spawnChild(parent, type, hpScale, extra = {}) {
    const e = this.spawnEnemy(type, 0, {
      x: parent.x + this.rng.range(-0.25, 0.25), y: parent.y + this.rng.range(-0.25, 0.25), hpScale,
      path: parent.air ? this.map.paths[0] : parent.path, seg: parent.air ? 0 : parent.seg, dist: parent.dist, ...extra,
    });
    if (parent.air) { e.x = parent.x; e.y = parent.y; e.path = [{ x: parent.x, y: parent.y }, ...this.nearestPathTail(parent.x, parent.y)]; e.seg = 0; e.total = pathLength(e.path); e.dist = 0; }
    return e;
  }

  nearestPathTail(x, y) {
    const p = this.map.paths[0];
    let bi = 0, bd = Infinity;
    for (let i = 0; i < p.length; i++) { const d = Math.hypot(p[i].x - x, p[i].y - y); if (d < bd) { bd = d; bi = i; } }
    return p.slice(bi);
  }

  nearestTower(e, range) {
    let best = null, bd = range;
    for (const t of this.towers) {
      if (t.ruined || TOWERS[t.type].trap) continue;
      const d = Math.hypot(t.cx - e.x, t.cy - e.y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  damageTower(t, dmg) {
    if (t.ruined || TOWERS[t.type].trap) return;
    t.hp -= dmg;
    this.emit('towerHit', { tower: t, dmg });
    if (t.hp <= 0) { t.hp = 0; t.ruined = true; t.beam = null; this.refreshTowers(); this.emit('towerRuined', { tower: t }); }
  }

  leak(e) {
    e.dead = true; e.leaked = true;
    this.waveLeaks++; this.stats.leaks++;
    let dmg = eco.leakDamage(e.def.dmg, this.wave) * (e.boss ? 1 + 0.3 * (this.plan.boss?.cycle || 0) : 1);
    let target = 'castle';
    if (!e.air && this.wall.hp > 0) {
      target = 'wall';
      const wd = dmg * (e.def.wallMult || 1);
      this.wall.hp -= wd;
      if (this.wall.hp < 0) { dmg = -this.wall.hp / (e.def.wallMult || 1); this.wall.hp = 0; target = 'both'; }
      else dmg = 0;
    }
    if (dmg > 0) {
      dmg *= Math.pow(0.88, this.boon('thickskin'));
      this.castle.hp -= dmg;
    }
    this.emit('leak', { enemy: e, target, dmg });
    if (this.castle.hp <= 0) {
      if (this.secondWind) {
        this.secondWind = false; this.boons.secondwind = 0;
        this.castle.hp = this.castle.maxHp * 0.4;
        this.emit('secondWind', {});
      } else this.gameOver();
    }
  }

  gameOver() {
    if (this.over) return;
    this.castle.hp = 0;
    this.over = true; this.phase = 'over';
    this.emit('gameOver', this.summary());
  }

  // ---------- combat ----------
  stun(e, t) {
    if (e.dead || e.boss || e.stunImmune > 0 || e.enraged) return;
    e.stunT = Math.max(e.stunT, t);
  }

  damage(e, amount, type, src, o = {}) {
    if (e.dead || amount <= 0) return 0;
    let mult = 1;
    if (type === 'physical' || type === 'fire') {
      let armor = e.armor + (e.buffT > 0 ? ENEMIES.warchief.aura.armor : 0) - e.shred - 15 * this.boon('armorbreak');
      if (type === 'fire') armor *= 0.5;
      armor = Math.max(0, Math.min(80, armor));
      mult *= 1 - armor / 100;
    } else if (type === 'magic') {
      if (!o.pierceMr) mult *= 1 - Math.max(-50, Math.min(80, e.mr)) / 100;
    }
    if (e.slowT > 0 && e.vuln) mult *= 1 + e.vuln;
    if (e.air) mult *= 1 + 0.3 * this.boon('antiair');
    if (o.bossMult && e.boss) mult *= o.bossMult;
    if (o.armoredMult && e.armor >= 30) mult *= o.armoredMult;
    let dmg = amount * mult;
    if (e.shield > 0) { const a = Math.min(e.shield, dmg); e.shield -= a; dmg -= a; }
    e.hp -= dmg;
    if (!o.dot) e.flash = 0.08;
    const total = amount * mult;
    if (src === 'hero') this.stats.heroDmg += total;
    else if (src && src.type) {
      src.dmg += total;
      this.stats.dmgByTower[src.type] = (this.stats.dmgByTower[src.type] || 0) + total;
    }
    if (e.boss) this.stats.bossDmg += total;
    if (!o.dot && (o.hero || o.crit || total > e.maxHp * 0.2)) this.emit('hit', { enemy: e, dmg: total, crit: o.crit, hero: o.hero, headshot: o.headshot });
    if (e.hp <= 0) this.kill(e, src, o);
    return total;
  }

  kill(e, src, o = {}) {
    if (e.dead) return;
    e.dead = true;
    const hero = src === 'hero';
    const w = this.wave;
    let bounty = e.def.bounty * (e.raised ? 0.3 : 1) * (e.boss ? 1 + this.boon('plunder') : 1);
    const gold = this.addGold(eco.killGold(bounty, w, { hero, goldBonus: this.killGoldBonus() + (hero ? 0.6 * this.boon('golden') : 0) }) + (hero ? 3 * this.boon('bloodlust') : 0));
    const points = Math.round(eco.killPoints(e.def.points * (e.boss ? 1 + this.boon('plunder') : 1), w, { hero, combo: this.comboMult() }) * this.scoreMult());
    this.score += points;
    this.stats.kills++;
    this.stats.killsByType[e.boss || e.type] = (this.stats.killsByType[e.boss || e.type] || 0) + 1;
    if (hero) this.stats.heroKills++;
    if (e.boss) this.stats.bossKills++;
    if (src && src.type) src.kills++;
    if (e.def.split) for (let i = 0; i < e.def.split.n; i++) this.spawnChild(e, e.def.split.into, 1);
    if (e.burnSrc && e.burnSrc.stats?.spread) {
      for (const n of this.enemies) if (!n.dead && !n.air && Math.hypot(n.x - e.x, n.y - e.y) < 1) { n.burnT = Math.max(n.burnT, 2); n.burn = Math.max(n.burn, e.burn * 0.6); n.burnSrc = e.burnSrc; }
    }
    if (e.blocker) e.blocker = null;
    this.emit('kill', { enemy: e, gold, points, hero, src });
  }

  pickTarget(t, s, exclude) {
    let best = null, bv = Infinity;
    const range = s.range * this.hazardRangeMult();
    const mode = s.critChance >= 0.25 && t.spec === 'sharpshooter' ? 'strong' : t.targetMode;
    for (const e of this.enemies) {
      if (e.dead || e.stealthT > 0) continue;
      if (e.air ? !s.targets.includes('a') : !s.targets.includes('g')) continue;
      if (exclude && exclude.has(e)) continue;
      const d = Math.hypot(e.x - t.cx, e.y - t.cy);
      if (d > range || d < s.minRange) continue;
      let v;
      if (mode === 'first') v = e.total - e.dist;
      else if (mode === 'last') v = -(e.total - e.dist);
      else if (mode === 'strong') v = -e.hp;
      else v = d;
      if (v < bv) { bv = v; best = e; }
    }
    return best;
  }

  updateTowers(dt) {
    const rateMult = this.hazardRateMult();
    for (const t of this.towers) {
      const s = t.stats;
      t.recoil = Math.max(0, t.recoil - dt * 4);
      if (t.ruined) { t.beam = null; continue; }
      if (t.disabledT > 0) { t.disabledT -= dt; t.beam = null; continue; }
      const def = TOWERS[t.type];
      if (def.passive) continue;
      if (def.trap) { this.trapStep(t, s, dt); continue; }
      if (t.type === 'barracks') { this.barracksStep(t, s, dt); continue; }
      if (def.beam) { this.beamStep(t, s, dt); continue; }
      t.cd -= dt * rateMult;
      if (t.cd > 0) continue;
      if (def.pulse) {
        let any = false;
        for (const e of this.enemies) {
          if (e.dead || Math.hypot(e.x - t.cx, e.y - t.cy) > s.range * this.hazardRangeMult()) continue;
          any = true;
          e.slow = Math.max(e.slow, s.slow); e.slowT = Math.max(e.slowT, s.slowTime); e.vuln = Math.max(e.vuln || 0, s.vuln);
          if (s.freezeChance && this.rng.chance(s.freezeChance)) this.stun(e, 1);
          this.damage(e, s.dmg, 'magic', t);
        }
        if (any) { t.cd = 1 / s.rate; t.recoil = 1; this.emit('pulse', { x: t.cx, y: t.cy, r: s.range, tower: t }); }
        else t.cd = 0.15;
        continue;
      }
      const targets = [];
      const ex = new Set();
      for (let k = 0; k < s.multi; k++) { const e = this.pickTarget(t, s, ex); if (!e) break; targets.push(e); ex.add(e); }
      if (!targets.length) { t.cd = 0.1; continue; }
      t.cd = 1 / s.rate;
      t.recoil = 1;
      t.aim = Math.atan2(targets[0].y - t.cy, targets[0].x - t.cx);
      for (const e of targets) this.towerFire(t, s, e);
    }
  }

  towerFire(t, s, e) {
    const def = TOWERS[t.type];
    const crit = s.critChance > 0 && this.rng.chance(s.critChance);
    const dmg = s.dmg * (crit ? s.critMult : 1);
    const common = { src: t, dmg, type: s.type, crit, bossMult: s.bossMult, armoredMult: s.armoredMult };
    if (t.type === 'tesla') {
      this.chainHit(e, s, common, [{ x: t.cx, y: t.cy - 0.5 }]);
      if (s.stunChance && this.rng.chance(s.stunChance)) this.stun(e, 0.6);
      this.emit('shoot', { tower: t, kind: 'zap' });
      return;
    }
    if (def.proj === 'bolt') {
      const d = Math.hypot(e.x - t.cx, e.y - t.cy) || 1;
      this.projectiles.push({ kind: 'bolt', ...common, x: t.cx, y: t.cy, dx: (e.x - t.cx) / d, dy: (e.y - t.cy) / d, speed: def.projSpeed, left: s.range + 1, pierce: s.pierce, hitSet: new Set() });
    } else if (def.proj === 'ball' || def.proj === 'boulder') {
      const tt = Math.hypot(e.x - t.cx, e.y - t.cy) / def.projSpeed;
      const tx = e.x + e.vx * tt * 0.9, ty = e.y + e.vy * tt * 0.9;
      const d = Math.hypot(tx - t.cx, ty - t.cy) || 0.01;
      this.projectiles.push({ kind: def.proj, ...common, x: t.cx, y: t.cy, sx: t.cx, sy: t.cy, tx, ty, speed: def.projSpeed, dist: d, travelled: 0, splash: s.splash, shred: s.shred, stun: s.stun, fireField: s.fireField });
    } else {
      this.projectiles.push({ kind: def.proj, ...common, x: t.cx, y: t.cy - 0.3, target: e, lx: e.x, ly: e.y, speed: def.projSpeed, splash: s.splash, chain: s.chain, s, pierceMr: s.pierceMr });
    }
    this.emit('shoot', { tower: t, kind: def.proj });
  }

  chainHit(first, s, common, points) {
    const hit = new Set();
    let cur = first, dmg = common.dmg;
    for (let i = 0; i <= s.chain && cur; i++) {
      hit.add(cur);
      points.push({ x: cur.x, y: cur.y - 0.2 });
      this.damage(cur, dmg, common.type, common.src, { crit: common.crit, pierceMr: s.pierceMr, bossMult: common.bossMult, hero: common.src === 'hero' });
      dmg *= s.chainFalloff;
      let next = null, nd = s.chainRange;
      for (const e of this.enemies) {
        if (e.dead || hit.has(e) || e.stealthT > 0) continue;
        const d = Math.hypot(e.x - cur.x, e.y - cur.y);
        if (d < nd) { nd = d; next = e; }
      }
      cur = next;
    }
    if (points.length > 1) this.emit('zap', { points, color: common.src?.type === 'mage' ? '#c79bff' : '#8ef2ff' });
  }

  trapStep(t, s, dt) {
    for (const e of this.enemies) {
      if (e.dead || e.air) continue;
      if (Math.abs(e.x - t.cx) < 0.55 && Math.abs(e.y - t.cy) < 0.55) {
        e.burn = Math.max(e.burn, s.burn); e.burnT = Math.max(e.burnT, s.burnTime); e.burnSrc = t;
        if (s.slow) { e.slow = Math.max(e.slow, s.slow); e.slowT = Math.max(e.slowT, 0.4); }
        t.recoil = 1;
      }
    }
  }

  barracksStep(t, s, dt) {
    while (t.soldiers.length < s.soldiers) t.soldiers.push({ uid: UID++, hp: s.soldierHp, maxHp: s.soldierHp, dead: true, respawn: 0.5, x: t.cx, y: t.cy, cd: 0, armor: s.soldierArmor, slot: t.soldiers.length });
    if (t.soldiers.length > s.soldiers) t.soldiers.length = s.soldiers;
    const rp = t.rallyPt;
    for (const so of t.soldiers) {
      so.maxHp = s.soldierHp; so.armor = s.soldierArmor;
      if (so.dead) {
        so.respawn -= dt;
        if (so.respawn <= 0) { so.dead = false; so.hp = so.maxHp; so.x = t.cx; so.y = t.cy; so.target = null; }
        continue;
      }
      const ang = (so.slot / s.soldiers) * Math.PI * 2;
      const hx = rp.x + Math.cos(ang) * 0.28, hy = rp.y + Math.sin(ang) * 0.28;
      // Acquire a target to block.
      if (!so.target || so.target.dead || so.target.blocker !== so) {
        so.target = null;
        for (const e of this.enemies) {
          if (e.dead || e.air || e.boss || e.type === 'ram' || e.blocker) continue;
          if (Math.hypot(e.x - rp.x, e.y - rp.y) < 0.9) { e.blocker = so; so.target = e; break; }
        }
      }
      const tx = so.target ? so.target.x : hx, ty = so.target ? so.target.y : hy;
      const d = Math.hypot(tx - so.x, ty - so.y);
      const step = 2.2 * dt;
      if (d > 0.25) { so.x += ((tx - so.x) / d) * Math.min(step, d - 0.2); so.y += ((ty - so.y) / d) * Math.min(step, d - 0.2); }
      so.cd -= dt;
      if (so.cd <= 0) {
        let foe = so.target && d < 0.5 ? so.target : null;
        if (!foe && s.ranged) foe = this.pickTarget({ cx: so.x, cy: so.y, targetMode: 'first' }, { range: 1.6, minRange: 0, targets: 'ga' });
        if (foe) {
          so.cd = 1 / TOWERS.barracks.soldierRate;
          if (s.ranged && foe !== so.target) this.projectiles.push({ kind: 'arrow', src: t, dmg: s.soldierDmg, type: 'physical', x: so.x, y: so.y, target: foe, lx: foe.x, ly: foe.y, speed: 12, splash: 0, chain: 0, s: {} });
          else this.damage(foe, s.soldierDmg, 'physical', t);
          so.swing = 0.2;
        }
      }
      if (so.swing > 0) so.swing -= dt;
    }
  }

  killSoldier(so) {
    so.dead = true; so.respawn = TOWERS.barracks.respawn;
    for (const e of this.enemies) if (e.blocker === so) e.blocker = null;
    so.target = null;
    this.emit('soldierDown', { x: so.x, y: so.y });
  }

  beamStep(t, s, dt) {
    const want = s.beams;
    t.beam = (t.beam || []).filter((b) => !b.e.dead && b.e.stealthT <= 0 && Math.hypot(b.e.x - t.cx, b.e.y - t.cy) <= s.range * this.hazardRangeMult());
    const ex = new Set(t.beam.map((b) => b.e));
    while (t.beam.length < want) {
      const e = this.pickTarget(t, s, ex);
      if (!e) break;
      t.beam.push({ e, ramp: 1 }); ex.add(e);
    }
    for (const b of t.beam) {
      b.ramp = Math.min(s.rampMax, b.ramp + s.ramp * dt);
      this.damage(b.e, s.dps * b.ramp * dt * this.hazardRateMult(), 'magic', t, { dot: true });
    }
  }

  updateProjectiles(dt) {
    const keep = [];
    for (const p of this.projectiles) {
      if (this.stepProjectile(p, dt)) keep.push(p);
    }
    this.projectiles = keep;
  }

  stepProjectile(p, dt) {
    if (p.kind === 'earrow') {
      const t = p.target;
      const d = Math.hypot(t.cx - p.x, t.cy - p.y);
      if (d < p.speed * dt || t.ruined) { this.damageTower(t, p.dmg); return false; }
      p.x += ((t.cx - p.x) / d) * p.speed * dt; p.y += ((t.cy - p.y) / d) * p.speed * dt;
      return true;
    }
    if (p.kind === 'hero') return this.stepHero(p, dt);
    if (p.kind === 'bolt') {
      const mv = p.speed * dt;
      p.x += p.dx * mv; p.y += p.dy * mv; p.left -= mv;
      for (const e of this.enemies) {
        if (e.dead || e.air || p.hitSet.has(e)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < e.size + 0.2) {
          p.hitSet.add(e);
          this.damage(e, p.dmg, p.type, p.src, { crit: p.crit, bossMult: p.bossMult, armoredMult: p.armoredMult });
          if (p.hitSet.size > p.pierce) return false;
        }
      }
      return p.left > 0;
    }
    if (p.kind === 'ball' || p.kind === 'boulder') {
      const mv = p.speed * dt;
      p.travelled += mv;
      const f = Math.min(1, p.travelled / p.dist);
      p.x = p.sx + (p.tx - p.sx) * f; p.y = p.sy + (p.ty - p.sy) * f; p.arc = Math.sin(f * Math.PI) * Math.min(1.4, p.dist * 0.25);
      if (f >= 1) { this.explode(p, p.tx, p.ty); return false; }
      return true;
    }
    // Homing: arrow, orb, flak
    const tgt = p.target;
    if (tgt && !tgt.dead) { p.lx = tgt.x; p.ly = tgt.y - (tgt.air ? 0.35 : 0.1); }
    const d = Math.hypot(p.lx - p.x, p.ly - p.y);
    const mv = p.speed * dt;
    if (d <= mv + 0.05) {
      if (p.splash) this.explode(p, p.lx, p.ly);
      else if (tgt && !tgt.dead) {
        if (p.chain) this.chainHit(tgt, { chain: p.chain, chainRange: p.s.chainRange, chainFalloff: p.s.chainFalloff, pierceMr: p.pierceMr }, p, [{ x: p.x, y: p.y }]);
        else this.damage(tgt, p.dmg, p.type, p.src, { crit: p.crit, bossMult: p.bossMult });
        this.emit('impact', { x: p.lx, y: p.ly, kind: p.kind });
      }
      return false;
    }
    p.x += ((p.lx - p.x) / d) * mv; p.y += ((p.ly - p.y) / d) * mv;
    p.ang = Math.atan2(p.ly - p.y, p.lx - p.x);
    return true;
  }

  explode(p, x, y) {
    const r = p.splash;
    let n = 0;
    for (const e of this.enemies) {
      if (e.dead || e === p.exclude) continue;
      const canHit = p.kind === 'flak' ? e.air : p.src === 'hero' ? true : !e.air;
      if (!canHit) continue;
      const ey = e.y - (e.air ? 0.35 : 0);
      const d = Math.hypot(e.x - x, ey - y);
      if (d > r + e.size * 0.5) continue;
      const fall = 1 - 0.4 * Math.min(1, d / (r + 0.01));
      n++;
      this.damage(e, p.dmg * fall * (p.splashScale || 1), p.type, p.src, { crit: p.crit, bossMult: p.bossMult, hero: p.src === 'hero' });
      if (p.shred) { e.shred = Math.max(e.shred, p.shred); e.shredT = 4; }
      if (p.stun) this.stun(e, p.stun);
      if (p.burn) { e.burn = Math.max(e.burn, p.burn); e.burnT = Math.max(e.burnT, 3); e.burnSrc = 'hero'; }
    }
    if (p.fireField) this.fields.push({ x, y, r: Math.max(0.8, r * 0.8), t: p.fireField, dps: p.dmg * 0.35, src: p.src });
    this.emit('impact', { x, y, kind: p.kind, splash: r });
    return n;
  }

  updateFields(dt) {
    for (const f of this.fields) {
      f.t -= dt;
      for (const e of this.enemies) if (!e.dead && !e.air && Math.hypot(e.x - f.x, e.y - f.y) < f.r) this.damage(e, f.dps * dt, 'fire', f.src, { dot: true });
    }
    this.fields = this.fields.filter((f) => f.t > 0);
  }

  stepHero(p, dt) {
    const mv = p.speed * dt;
    // Gentle homing toward the tapped enemy so corners don't eat good shots.
    const it = p.intended;
    if (it && p.hitSet.size === 0) {
      if (it.dead) { p.stolen = true; p.intended = null; }
      else {
        const ty = it.y - (it.air ? 0.35 : 0.1);
        const d = Math.hypot(it.x - p.x, ty - p.y) || 0.001;
        const k = Math.min(1, 10 * dt);
        let dx = p.dx + ((it.x - p.x) / d - p.dx) * k, dy = p.dy + ((ty - p.y) / d - p.dy) * k;
        const n = Math.hypot(dx, dy) || 1;
        p.dx = dx / n; p.dy = dy / n;
        p.left = Math.max(p.left, d + 0.35);
      }
    }
    const steps = Math.max(1, Math.ceil(mv / 0.2));
    for (let i = 0; i < steps; i++) {
      p.x += (p.dx * mv) / steps; p.y += (p.dy * mv) / steps; p.left -= mv / steps;
      for (const e of this.enemies) {
        if (e.dead || p.hitSet.has(e)) continue;
        const ey = e.y - (e.air ? 0.35 : 0.1);
        if (Math.hypot(e.x - p.x, ey - p.y) < e.size * 0.8 + 0.12) {
          p.hitSet.add(e);
          this.heroHit(p, e);
          if (p.hitSet.size > p.pierce) return false;
        }
      }
      if (p.left <= 0) {
        if (p.splash && p.hitSet.size === 0) {
          const n = this.explode({ ...p, dmg: p.dmg * p.splashFrac, src: 'hero' }, p.x, p.y);
          if (p.main) this.registerHeroHit(n > 0, false);
        } else if (p.main && p.hitSet.size === 0) {
          if (p.stolen) this.stats.shots = Math.max(0, this.stats.shots - 1); // a tower got there first: no penalty
          else this.registerHeroHit(false);
        }
        return false;
      }
    }
    return true;
  }

  heroHit(p, e) {
    const isMain = p.main && p.hitSet.size === 1;
    const head = isMain && p.headshot && e === p.intended;
    let dmg = p.dmg * (p.crit ? 2 : 1) * (head ? COMBO.headshotMult + 0.6 * this.boon('headhunter') : 1);
    if (p.main) dmg *= this.comboMult() > 1 ? 1 + (this.comboMult() - 1) * 0.5 : 1;
    if (isMain) this.registerHeroHit(true, head);
    this.damage(e, dmg, p.type, 'hero', { hero: true, crit: p.crit || head, headshot: head });
    if (p.burn && !e.dead) { e.burn = Math.max(e.burn, p.burn * (1 + 0.35 * this.boon('pyro'))); e.burnT = 3; e.burnSrc = 'hero'; }
    if (p.splash) this.explode({ ...p, dmg: dmg * p.splashFrac, src: 'hero', kind: 'heroBlast', exclude: e }, e.x, e.y);
    if (p.chain) this.chainHit(e, { chain: p.chain, chainRange: 1.6, chainFalloff: 0.75 }, { src: 'hero', dmg: dmg * 0.75, type: p.type }, [{ x: e.x, y: e.y }]);
  }

  registerHeroHit(hit, head = false) {
    if (hit) {
      this.stats.hits++;
      if (head) this.stats.headshots++;
      this.combo++;
      this.comboT = COMBO.decay * (1 + 0.5 * this.boon('combo'));
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      this.emit('combo', { combo: this.combo, mult: this.comboMult() });
    } else {
      if (this.combo > 0) this.emit('combo', { combo: 0, broke: true });
      this.combo = 0;
      this.emit('miss', {});
    }
  }

  // ---------- persistence ----------
  serialize() {
    return {
      v: 1, seed: this.seed, mapId: this.mapId, mode: this.mode, modifiers: this.modifiers, ascension: this.ascension,
      portrait: this.portrait, wave: this.wave, gold: this.gold, score: this.score,
      castle: this.castle, wall: this.wall, boons: this.boons, boonOffer: this.boonOffer, rerolls: this.rerolls,
      secondWind: this.secondWind, repairKits: this.repairKits, weapon: { id: this.weapon.id, lv: this.weapon.lv },
      stats: this.stats, rng: this.rng.state, challenge: this.opts.challenge || null, tutorial: this.tutorial,
      towers: this.towers.map((t) => ({ type: t.type, x: t.x, y: t.y, tier: t.tier, spec: t.spec, invested: t.invested, hp: t.hp, targetMode: t.targetMode, ruined: t.ruined, kills: t.kills, dmg: t.dmg, ally: t.ally, allyWaves: t.allyWaves, mastery: t.mastery })),
    };
  }

  load(s) {
    this.wave = s.wave; this.gold = s.gold; this.score = s.score;
    this.castle = { ...s.castle }; this.wall = { ...s.wall };
    this.boons = { ...s.boons }; this.boonOffer = s.boonOffer; this.rerolls = s.rerolls;
    this.secondWind = s.secondWind; this.repairKits = s.repairKits || 0;
    this.weapon = { id: s.weapon.id, lv: { ...s.weapon.lv }, ammo: 0, reloadT: 0 };
    this.stats = { ...this.stats, ...s.stats };
    this.rng.state = s.rng;
    this.towers = s.towers.map((d) => {
      const t = this.makeTower(d.type, d.x, d.y, d.tier);
      Object.assign(t, { mastery: d.mastery || 0, spec: d.spec, invested: d.invested, targetMode: d.targetMode, ruined: d.ruined, kills: d.kills, dmg: d.dmg, ally: d.ally, allyWaves: d.allyWaves, fresh: false });
      this.applyTierHp(t); t.hp = d.hp;
      return t;
    });
    this.phase = 'build';
    this.buildTimer = GAME.buildTime;
    this.refreshTowers();
    this.weapon.ammo = this.weaponStats().ammo;
  }

  summary() {
    const s = this.stats;
    const dmgTotal = Object.values(s.dmgByTower).reduce((a, b) => a + b, 0) + s.heroDmg;
    return {
      seed: this.seed, map: this.mapId, mode: this.mode, modifiers: this.modifiers, ascension: this.ascension,
      wave: this.wave, wavesCleared: s.wavesCleared, score: this.score, kills: s.kills, heroKills: s.heroKills,
      shots: s.shots, hits: s.hits, headshots: s.headshots, duration: Math.round(s.time), maxCombo: s.maxCombo,
      bossKills: s.bossKills, bossDmg: Math.round(s.bossDmg), towersBuilt: s.towersBuilt, goldEarned: s.goldEarned,
      killsByType: s.killsByType, dmgByTower: s.dmgByTower, heroDmg: s.heroDmg, dmgTotal, flawless: s.flawless,
      specs: s.specs, mintGold: s.mintGold, peakGold: s.peakGold, goldSpent: s.goldSpent, maxTowers: s.maxTowers,
      maxFlawlessStreak: s.maxFlawlessStreak, repairs: s.repairs, earlyCalls: s.earlyCalls, boons: this.boons,
      challenge: this.opts.challenge || null, weapon: this.weapon.id, builtByTower: s.builtByTower, maxMastery: s.maxMastery || 0,
    };
  }
}

function pathLength(p) {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return L;
}
