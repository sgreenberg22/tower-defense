// Warrior mode: you take the field yourself, on foot, in the 3D world, in the style of Dynasty Warriors and Chivalry.
// Pure logic: no DOM, no canvas. The same Champion (your warrior) fights in a defence (a classic Game, the commander
// building the towers: mode 'warrior') and on the attack (an AssaultGame, your captain sending the column: mode
// 'warassault'). (Not to be confused with the horde's named Champions of living.js: those are foes, `e.champion`.)
// A small host adapter hides the difference between the two engines, so every swing, arrow and fury is written once.
// Everything the champion slays counts as a hero kill and feeds the Realm like any other run.
import { T } from './maps.js';
import { TOWERS } from '../data/balance.js';

export const CHAMP_IDS = ['knight', 'berserker', 'ranger', 'mage'];

// The four warriors. Damage numbers are per hit at wave 1 before scaling; arc is the swing's full width in radians.
export const CHAMP_CLASSES = {
  knight: {
    id: 'knight', name: 'Knight', icon: '⚔', role: 'Holds the line', hp: 380, dr: 0.38, speed: 2.5, holds: 4, dmg: 15,
    blurb: 'Sword and shield. Three-swing combos that cut through crowds, a Shield Charge that bowls foes over and a Whirlwind finisher. Hard to kill.',
    bars: { atk: 3, def: 5, spd: 3, reach: 2 },
    attack: { kind: 'melee', combo: [
      { mult: 1, arc: 1.9, reach: 0.95, time: 0.34 },
      { mult: 1.05, arc: 1.9, reach: 0.95, time: 0.34 },
      { mult: 1.75, arc: 3.4, reach: 1.1, time: 0.5, stun: 0.5, big: true },
    ] },
    skill: { id: 'charge', name: 'Shield Charge', icon: '🛡', cd: 7, dist: 2.5, time: 0.32, mult: 1.4, stun: 1.2, push: 0.8, dr: 0.6, desc: 'Dash forward behind your shield: everyone in the way is hit, stunned and knocked back.' },
    fury: { id: 'whirl', name: 'Whirlwind', icon: '🌪', time: 4, tick: 0.25, r: 1.4, mult: 0.8, dr: 0.5, desc: 'Spin through the horde for 4 seconds, hitting everything around you and shrugging off half the damage.' },
  },
  berserker: {
    id: 'berserker', name: 'Berserker', icon: '🪓', role: 'Wades in', hp: 340, dr: 0.16, speed: 2.75, holds: 3, dmg: 15, lifesteal: 0.035,
    blurb: 'A great two-handed axe. Slow, huge swings that heal you a little with every hit, a Leap Slam that lands among them, and a Bloodrage that turns you into a storm.',
    bars: { atk: 5, def: 3, spd: 3, reach: 3 },
    attack: { kind: 'melee', combo: [
      { mult: 1.55, arc: 2.5, reach: 1.05, time: 0.52 },
      { mult: 2.25, arc: 6.3, reach: 1.15, time: 0.7, big: true, spin: true },
    ] },
    skill: { id: 'leap', name: 'Leap Slam', icon: '💥', cd: 8, dist: 2.8, time: 0.45, r: 1.25, mult: 2.4, stun: 0.9, desc: 'Leap into the horde and crash down: big damage and a stun all around where you land.' },
    fury: { id: 'rage', name: 'Bloodrage', icon: '🩸', time: 8, dmg: 0.7, speed: 0.35, haste: 0.25, lifesteal: 0.2, desc: '8 seconds of fury: 70% more damage, faster swings and feet, and every hit heals you.' },
  },
  ranger: {
    id: 'ranger', name: 'Ranger', icon: '🏹', role: 'Strikes from afar', hp: 240, dr: 0.06, speed: 3.05, holds: 1, dmg: 13,
    blurb: 'A longbow that aims itself at the nearest foe, so you can shoot on the run. Volley fans out seven arrows as you hop back, and Arrow Storm rains death all around.',
    bars: { atk: 3, def: 1, spd: 5, reach: 5 },
    attack: { kind: 'bow', range: 4.7, time: 0.3, mult: 1.1, pierce: 2, speed: 13 },
    skill: { id: 'volley', name: 'Volley', icon: '🎯', cd: 6, n: 7, spread: 1.05, mult: 1.2, pierce: 2, hop: 0.9, desc: 'Seven piercing arrows in a fan, and a quick hop back out of reach.' },
    fury: { id: 'storm', name: 'Arrow Storm', icon: '🌧', time: 3.5, r: 2.5, rate: 14, mult: 0.9, desc: 'For 3.5 seconds, arrows rain on every foe around you.' },
  },
  mage: {
    id: 'mage', name: 'Battlemage', icon: '🔮', role: 'Blasts crowds', hp: 240, dr: 0.08, speed: 2.6, holds: 1, dmg: 15,
    blurb: 'A staff of fire. Bolts that burst among the horde, a Frost Nova that freezes everyone close, and a Meteor Storm that shakes the ground.',
    bars: { atk: 4, def: 1, spd: 3, reach: 4 },
    attack: { kind: 'bolt', range: 4.3, time: 0.55, mult: 1.25, splash: 0.7, speed: 9, type: 'magic' },
    skill: { id: 'nova', name: 'Frost Nova', icon: '❄', cd: 8, r: 1.75, mult: 1.3, stun: 1, slow: 0.55, slowT: 3, desc: 'A ring of frost bursts out of you: it freezes foes for a moment and slows them after.' },
    fury: { id: 'meteor', name: 'Meteor Storm', icon: '☄', n: 6, gap: 0.28, r: 1.1, mult: 3.2, delay: 0.6, desc: 'Six meteors crash down on the foes in front of you.' },
  },
};
export const champClass = (id) => CHAMP_CLASSES[id] || CHAMP_CLASSES.knight;
export const cleanChampClass = (id) => (CHAMP_CLASSES[id] ? id : 'knight');
const cleanMasteries = (m) => { const out = {}; if (m && typeof m === 'object') for (const id of CHAMP_IDS) if (Number.isFinite(m[id])) out[id] = Math.max(0, Math.min(20, m[id] | 0)); return out; };

export const CHAMP = {
  respawn: 5, respawnPer: 1.5, respawnMax: 12,   // seconds down after a fall: a little longer each time
  spawnShield: 2,                                  // seconds of safety after rising again
  regenDelay: 4, regen: 0.025, buildRegen: 0.25,   // share of health per second once out of the fight (much faster between waves)
  beset: { r: 0.85, cd: 1.3, mult: 0.75, boss: 2.2, captain: 2.6, bossR: 1.15, shot: 0.8 },   // a defence: foes around you that you do not hold still lash out; archers and bosses go for you
  grab: 0.5, release: 1.1,                         // foes this close are held in place by you (up to the class's `holds`)
  pin: 0.15,                                       // a foe you hold takes this much more from the towers
  crit: 0.08, critMult: 2,
  lock: 2.4,                                       // a melee lock reaches this far; ranged classes use their range
  magnet: 0.7,                                     // a swing steps you this far towards a locked foe out of reach
  dodge: { dist: 1.75, time: 0.28, cd: 0.9 },
  fury: { max: 100, hit: 3, shot: 2, kill: 5, hurt: 25 },
  level: { cap: 50, base: 10, per: 6, dmg: 0.05, hp: 0.05, heal: 0.3 },
  mastery: { cap: 20, per: 0.025, xp: 40 },        // lasting class mastery: +2.5% health and damage a level, level = sqrt(xp / 40)
  shotLife: 1.2,
  siege: { tower: 0.45, gate: 0.25 },             // share of a blow that bites into emplacements and the camp gate
  // a defence: towers a little softer, so you matter (the Hero Mode commander builds)
  // No long breaks: you build nothing, so the next wave follows a beat after the last (the commander builds and mends as it goes)
  towerMult: 0.85, buildTime: 1.5, firstBreak: 5,
  waveHeal: 0.2,                                   // share of health you get back as a wave falls
  boonEvery: 2, pickEvery: 5,                      // a Warrior boon after every 2nd wave, and a free pick every 5th level
  // allied foot soldiers (the Retinue): from this wave, every few waves a free company joins you and fights at your side
  levy: { from: 5, every: 3, n: 1, bigFrom: 26, bigN: 2 },
  mapScale: 2,                                     // a Warrior's field is twice as long and wide: a real march from the gate to the keep
  // standing still is dangerous: after a few seconds in one place the horde closes in and hits harder and harder
  camp: { r: 3, after: 7, rate: 0.14, max: 1.6 },
  // spoils: fallen foes sometimes leave an orb: walk over it (it also draws you out of a safe corner)
  orb: { chance: 0.1, big: 0.5, life: 11, grab: 0.85, heal: 0.14, fury: 22, shield: 3 },
  // a rampage: every this many foes slain in one run heals you, fills the fury and pays the war chest
  rampage: { every: 25, heal: 0.3, fury: 50 },
  swapCd: 25,                                      // seconds before you may change warrior again (with the Keep's Armory of Arms)
};

// Horde captains (Warrior defence): on waves 4, 9, 14 ... a named captain comes off the road and hunts your warrior.
const CAPTAIN_NAMES = ['Grukk the Butcher', 'Skarn Ironjaw', 'Mog the Flayer', 'Vrask Bloodaxe', 'Ulgar Skullsplitter', 'Thrak the Unbroken', 'Hesk Ravenmaw', 'Borg Ashhand', 'Nazra the Red', 'Kol Grimtusk', 'Drega Stormcaller', 'Ruk Bonecrusher'];
export const CAPTAIN = { hp: 1.3, speed: 1.15, fury: 40, xp: 8, wave: (w) => w >= 4 && w % 5 === 4 };
export function captainFor(wave, seed = '') {
  let h = 0; for (const ch of String(seed) + wave) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const type = wave < 10 ? 'grunt' : wave < 20 ? 'berserker' : wave < 30 ? 'warchief' : wave < 45 ? 'ogre' : 'dread';
  return { name: CAPTAIN_NAMES[h % CAPTAIN_NAMES.length], type };
}

// Lasting mastery of a class from the experience it has earned over all runs.
export const masteryLevel = (xp) => Math.min(CHAMP.mastery.cap, Math.floor(Math.sqrt(Math.max(0, xp || 0) / CHAMP.mastery.xp)));
export const masteryXpFor = (lvl) => lvl * lvl * CHAMP.mastery.xp;
// Kills needed to rise from `lvl` to the next run level.
export const levelNeed = (lvl) => CHAMP.level.base + CHAMP.level.per * lvl;

const hyp = Math.hypot;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const BLOCK = new Set([T.ROCK, T.WATER, T.CASTLE]);

// ---------- the two engines, behind one face ----------
function defendHost(g) {
  return {
    attack: false,
    foes: () => g.enemies,
    alive: (e) => !e.dead && !(e.burrowT > 0),
    seen: (e) => g.isVisible(e) && !(e.stealthT > 0),
    scale() { const S = Math.max(1, g.plan?.hp || g.nextPlan?.hp || 1); return { dmg: Math.pow(S, 0.8), hp: Math.pow(S, 0.5) }; },
    hurt(e, dmg, o = {}) { return g.damage(e, dmg, o.type || 'physical', 'hero', { hero: true, crit: !!o.crit, splash: !!o.splash }); },
    stun(e, t) { g.stun(e, t); },
    slow(e, v, t) { e.slow = Math.max(e.slow || 0, v); e.slowT = Math.max(e.slowT || 0, t); },
    push(e, d) { if (!e.boss && !e.air && !e.duelist) g.pull(e, d); },
    burn(e, dps, t) { e.burn = Math.max(e.burn || 0, dps); e.burnT = Math.max(e.burnT || 0, t); e.burnSrc = 'hero'; },
    towers: () => [], hurtTower() {}, fortress: () => null, hurtFort() {},
    // the warrior keeps its own hit chain (Champion.hits): the run's bow combo, and the combo achievements, stay the bow's
    landed() {},
    calm: () => g.phase === 'build',
    blocked: (x, y) => { const t = g.towerAt(Math.floor(x), Math.floor(y)); return !!t && !t.ruined && !TOWERS[t.type]?.trap; },
    path: () => g.map.paths[0],
    reward(n) { g.addGold(30 + 3 * g.wave + 2 * n, false); },
  };
}
function attackHost(g) {
  return {
    attack: true,
    foes: () => g.enemies,
    alive: (e) => !e.dead && !(e.delay > 0),
    seen: () => true,
    scale() { const S = Math.max(1, g.plan?.hp || 1); return { dmg: Math.pow(S, 0.7) * Math.pow(1.08, g.stage - 1), hp: Math.pow(S, 0.55) * Math.pow(1.05, g.stage - 1) }; },
    hurt(e, dmg) { g.hurtFoe(e, dmg, g.champ); return dmg; },
    stun(e, t) { e.stunT = Math.max(e.stunT || 0, t); },
    slow(e, v, t) { e.slow = Math.max(e.slow || 0, v); e.slowT = Math.max(e.slowT || 0, t); },
    push(e, d) { g.pushBack(e, d); },
    burn(e, dps, t) { e.burnT = Math.max(e.burnT || 0, t); e.burn = Math.max(e.burn || 0, dps); },
    towers: () => g.towers.filter((t) => !t.ruined),
    hurtTower(t, dmg) { g.hurtTower(t, dmg, 'champion'); },
    fortress: () => (g.fortress.hp > 0 && !(g.pauseT > 0) ? g.fortress : null),
    hurtFort(dmg) { g.hurtFortress(dmg, g.champ); },
    landed() {},
    calm: () => g.pauseT > 0,
    blocked: (x, y) => { const t = g.towerAt(Math.floor(x), Math.floor(y)); return !!t && !t.ruined; },
    path: () => g.map.paths[0],
    reward(n) { g.gold += 20 + 4 * g.stage + n; },
  };
}

let CUID = 1;

export class Champion {
  constructor(game, opts = {}) {
    this.game = game;
    this.host = game.assault ? attackHost(game) : defendHost(game);
    this.id = cleanChampClass(opts.cls);
    this.cls = champClass(this.id);
    this.uid = 'champ' + CUID++;
    this.champ = true; this.troop = false; this.def = { flies: false };   // engines read these when the champion stands in the road
    this.kind = this.cls.id === 'ranger' ? 'bowman' : this.cls.id === 'mage' ? 'cleric' : 'knight';   // the 2D figure to draw it with
    this.mastery = Math.max(0, Math.min(CHAMP.mastery.cap, opts.mastery | 0));
    this.masteries = cleanMasteries(opts.masteries); this.masteries[this.id] = this.mastery;   // lasting mastery of every warrior, for changing mid-run
    this.campT = 0; this.anchor = null; this.campWarned = false; this.orbs = []; this.rampages = 0;
    this.swapOk = !!opts.swap; this.swapCd = 0; this.by = {}; this.phoenixUsed = false; this.pendingPicks = 0;
    this.level = Math.max(1, opts.level | 0 || 1); this.xp = Math.max(0, opts.xp | 0);
    this.armor = 0; this.pin = CHAMP.pin;
    const sc = this.host.scale();
    this.sc = sc; this.maxHp = this.baseHp(sc); this.hp = this.maxHp;
    this.dead = false; this.respawnT = 0; this.deaths = 0; this.shieldT = CHAMP.spawnShield;
    this.ang = 0; this.vx = 0; this.vy = 0; this.moving = false; this.air = 0;
    this.input = { mx: 0, my: 0, attack: false, skill: false, dodge: false, fury: false };
    this.combo = 0; this.comboT = 0; this.atkT = 0; this.swing = 0; this.lastSwing = null;
    this.skillCd = 1.5; this.dodgeCd = 0; this.dodgeT = 0; this.dodgeV = null; this.dash = null;
    this.fury = 0; this.furyT = 0; this.furyTick = 0; this.meteors = [];
    this.hits = 0; this.hitsT = 0; this.bestHits = 0; this.kos = 0; this.dmgDone = 0; this.dmgTaken = 0;
    this.calmT = 9; this.flash = 0; this.lock = null; this.shots = []; this.trails = [];
    this.stats = { swings: 0, skills: 0, furies: 0, dodges: 0, levels: 0, deaths: 0, held: 0 };
    this.spawn();
  }

  // ---------- numbers ----------
  // Warrior boons (w_*, see BOONS): picked in a Warrior defence, they live in the game's boon list.
  b(id) { return typeof this.game.boon === 'function' ? this.game.boon(id) : 0; }
  baseHp(sc = this.sc) { return this.cls.hp * sc.hp * (1 + CHAMP.level.hp * (this.level - 1)) * (1 + CHAMP.mastery.per * this.mastery) * (1 + 0.12 * this.b('w_vigor')); }
  dmgMult() {
    const rage = this.furyT > 0 && this.cls.fury.id === 'rage' ? 1 + this.cls.fury.dmg : 1;
    return this.cls.dmg * this.sc.dmg * (1 + CHAMP.level.dmg * (this.level - 1)) * (1 + CHAMP.mastery.per * this.mastery) * rage * (1 + 0.10 * this.b('w_edge'));
  }
  speed() {
    const rage = this.furyT > 0 && this.cls.fury.id === 'rage' ? 1 + this.cls.fury.speed : 1;
    return this.cls.speed * rage * (1 + 0.08 * this.b('w_fleet'));
  }
  reachMult() { return 1 + 0.12 * this.b('w_reach'); }
  skillCdOf() { return this.cls.skill.cd * Math.max(0.4, 1 - 0.15 * this.b('w_drill')); }
  dodgeCdOf() { return CHAMP.dodge.cd * Math.max(0.4, 1 - 0.12 * this.b('w_fleet')); }
  get ranged() { return this.cls.attack.kind !== 'melee'; }
  get reach() { return (this.ranged ? this.cls.attack.range : CHAMP.lock) * this.reachMult(); }
  get furyReady() { return this.fury >= CHAMP.fury.max && this.furyT <= 0 && !this.dead; }
  get skillReady() { return this.skillCd <= 0 && !this.dead; }
  get busy() { return this.dodgeT > 0 || !!this.dash; }
  get invulnerable() { return this.dodgeT > 0 || this.shieldT > 0 || (this.dash && this.dash.kind === 'leap'); }

  // ---------- where it stands ----------
  spawnPoint() {
    const g = this.game, c = g.map.castle, p = this.host.path();
    // a step out along the road from the keep, facing the way the horde comes
    let best = { x: c.x, y: c.y }, ang = 0;
    if (p && p.length > 1) {
      let d = 2.1, i = p.length - 1, x = p[i].x, y = p[i].y;
      while (d > 0 && i > 0) { const a = p[i - 1], L = hyp(a.x - x, a.y - y); if (L >= d) { x += (a.x - x) / L * d; y += (a.y - y) / L * d; d = 0; } else { x = a.x; y = a.y; d -= L; i--; } }
      best = { x, y }; ang = Math.atan2(p[Math.max(0, i - 1)].y - y, p[Math.max(0, i - 1)].x - x);
    }
    return { ...best, ang };
  }
  spawn() {
    const s = this.spawnPoint();
    this.x = s.x; this.y = s.y; this.ang = s.ang; this.vx = this.vy = 0;
    this.dead = false; this.hp = this.maxHp; this.shieldT = CHAMP.spawnShield + 1.5 * this.b('w_unbroken'); this.dash = null; this.dodgeT = 0; this.air = 0;
    this.game.emit('champRise', { champ: this });
  }
  // A wave begins or falls (a defence): the phoenix is ready again, and a wave won mends you a little.
  // ---------- spoils ----------
  dropOrb(e) {
    const O = CHAMP.orb, big = e.boss || e.duelist || e.champion;
    if (!big && !this.game.rng.chance(O.chance)) return;
    const hurt = this.hp < this.maxHp * 0.65, r = this.game.rng.next();
    const kind = big || (hurt && r < 0.5) ? 'heal' : r < 0.6 ? 'fury' : r < 0.85 ? 'heal' : 'shield';
    this.orbs.push({ x: e.x, y: e.y, kind, t: O.life, max: O.life, big: !!big });
  }
  updateOrbs(dt) {
    if (!this.orbs.length) return;
    const O = CHAMP.orb;
    for (const o of this.orbs) {
      o.t -= dt;
      if (this.dead || hyp(o.x - this.x, o.y - this.y) > O.grab) continue;
      o.t = 0;
      const k = o.big ? 2 : 1;
      if (o.kind === 'heal') this.heal(this.maxHp * O.heal * k);
      else if (o.kind === 'fury') this.addFury(O.fury * k);
      else this.shieldT = Math.max(this.shieldT, O.shield * k);
      this.stats.orbs = (this.stats.orbs || 0) + 1;
      this.game.emit('champOrb', { champ: this, orb: o });
    }
    this.orbs = this.orbs.filter((o) => o.t > 0);
  }

  // How hard the horde presses a warrior that has not moved far for a while (a defence only).
  campMult() { return this.host.attack ? 1 : 1 + Math.min(CHAMP.camp.max, Math.max(0, this.campT - CHAMP.camp.after) * CHAMP.camp.rate); }
  waveStart() { this.phoenixUsed = false; }
  waveEnd() { this.phoenixUsed = false; this.heal(this.maxHp * CHAMP.waveHeal); }
  takePicks() { const n = this.pendingPicks; this.pendingPicks = 0; return n; }

  // ---------- changing warrior (the Keep's Armory of Arms) ----------
  get canSwap() { return this.swapOk && !this.dead; }
  swapReady() { return this.canSwap && this.swapCd <= 0; }
  swapTo(id) {
    id = cleanChampClass(id);
    if (id === this.id || !this.swapReady()) return false;
    const frac = this.hp / Math.max(1, this.maxHp);
    this.id = id; this.cls = champClass(id);
    this.kind = id === 'ranger' ? 'bowman' : id === 'mage' ? 'cleric' : 'knight';
    this.mastery = this.masteries[id] | 0;
    this.maxHp = this.baseHp(); this.hp = Math.max(this.maxHp * 0.3, this.maxHp * frac);
    this.releaseAll(); this.dash = null; this.dodgeT = 0; this.air = 0; this.shots = []; this.meteors = []; this.furyT = 0;
    this.combo = 0; this.comboT = 0; this.atkT = 0; this.swing = 0; this.hits = 0;
    this.skillCd = 2; this.fury = Math.floor(this.fury * 0.5); this.shieldT = Math.max(this.shieldT, 1.2);
    this.swapCd = CHAMP.swapCd; this.stats.swaps = (this.stats.swaps || 0) + 1;
    this.game.emit('champSwap', { champ: this, id });
    return true;
  }
  walkable(x, y) {
    const m = this.game.map;
    if (x < 0.3 || y < 0.3 || x > m.cols - 0.3 || y > m.rows - 0.3) return false;
    if (BLOCK.has(m.tileAt(Math.floor(x), Math.floor(y)))) return false;
    return !this.host.blocked(x, y);
  }
  // Move by (dx, dy), sliding along whatever blocks the way.
  moveBy(dx, dy) {
    const px = this.x, py = this.y;
    if (this.walkable(this.x + dx, this.y + dy)) { this.x += dx; this.y += dy; }
    else if (this.walkable(this.x + dx, this.y)) this.x += dx;
    else if (this.walkable(this.x, this.y + dy)) this.y += dy;
    else if (!this.walkable(this.x, this.y)) { this.x += dx; this.y += dy; }   // stuck inside something (a tower built on you): walk out
    this.vx = this.x - px; this.vy = this.y - py;
  }

  // ---------- the main step ----------
  update(dt) {
    const H = this.host, inp = this.input;
    this.sc = H.scale();
    const want = this.baseHp();
    if (Math.abs(want - this.maxHp) > 0.01) { const f = this.hp / (this.maxHp || 1); this.maxHp = want; this.hp = Math.min(want, f * want); }
    this.updateShots(dt); this.updateMeteors(dt); this.updateOrbs(dt);
    this.trails = this.trails.filter((t) => (t.t -= dt) > 0);
    if (this.dead) {
      this.respawnT -= dt;
      inp.skill = inp.dodge = inp.fury = false;
      if (this.respawnT <= 0) this.spawn();
      return;
    }
    this.flash = Math.max(0, this.flash - dt); this.swing = Math.max(0, this.swing - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.skillCd = Math.max(0, this.skillCd - dt); this.dodgeCd = Math.max(0, this.dodgeCd - dt); this.atkT -= dt; this.swapCd = Math.max(0, this.swapCd - dt);
    if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.combo = 0;
    if (this.hitsT > 0 && (this.hitsT -= dt) <= 0) this.hits = 0;
    this.calmT += dt;
    if (this.calmT > CHAMP.regenDelay || H.calm()) this.heal(this.maxHp * (H.calm() ? CHAMP.buildRegen : CHAMP.regen) * dt);
    // a press that lands mid-roll or mid-dash is kept for a moment, so a thumb never has to time it to the frame
    for (const k of ['dodge', 'skill', 'fury']) {
      if (!inp[k]) { inp[k + 'T'] = 0; continue; }
      const done = k === 'dodge' ? this.tryDodge() : k === 'skill' ? this.trySkill() : this.tryFury();
      if (done || !this.busy || (inp[k + 'T'] = (inp[k + 'T'] || 0) + dt) > 0.5) { inp[k] = false; inp[k + 'T'] = 0; }
    }
    if (this.furyT > 0) this.stepFury(dt);
    // camping: stay inside a small ring and the pressure builds; leave it and it resets
    if (!this.anchor || hyp(this.x - this.anchor.x, this.y - this.anchor.y) > CHAMP.camp.r) { this.anchor = { x: this.x, y: this.y }; this.campT = 0; this.campWarned = false; }
    else if (!H.calm()) {
      this.campT += dt;
      if (this.campT > CHAMP.camp.after && !this.campWarned && !this.host.attack) { this.campWarned = true; this.game.emit('champCamp', { champ: this }); }
    }
    // moving
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      const v = this.dodgeV; this.moveBy(v.x * dt, v.y * dt);
    } else if (this.dash) this.stepDash(dt);
    else {
      let mx = inp.mx || 0, my = inp.my || 0;
      const mag = Math.min(1, hyp(mx, my));
      if (mag > 0.12) {
        mx /= hyp(mx, my); my /= hyp(mx, my);
        const swinging = this.atkT > 0 && !this.ranged;
        const s = this.speed() * mag * (swinging ? 0.45 : this.ranged && inp.attack ? 0.8 : 1);
        this.moveBy(mx * s * dt, my * s * dt);
        this.moving = true;
        // face where you walk, unless an attack holds you to its target
        if (!(this.atkT > 0) && !(this.ranged && inp.attack && this.lock)) this.turnTo(Math.atan2(my, mx), dt * 12);
      } else { this.moving = false; this.vx = this.vy = 0; }
    }
    this.lock = this.pickLock();
    if (inp.attack && this.atkT <= 0 && !this.busy && !(this.furyT > 0 && this.cls.fury.id === 'whirl')) this.startAttack();
    this.holdFoes();
    if (!this.host.attack) this.beset(dt);
  }

  turnTo(a, k) { const d = wrapA(a - this.ang); this.ang = wrapA(this.ang + d * Math.min(1, k)); }
  heal(n) { if (n > 0 && !this.dead) this.hp = Math.min(this.maxHp, this.hp + n); }

  // ---------- who to hit ----------
  // The foe the next attack goes for: near you and in front of you counts most. On the attack, an emplacement or the gate
  // when no foe is close.
  pickLock() {
    const H = this.host, R = this.reach;
    let best = null, bs = Infinity;
    for (const e of H.foes()) {
      if (!H.alive(e) || !H.seen(e)) continue;
      const d = hyp(e.x - this.x, e.y - this.y);
      if (d > R) continue;
      const da = Math.abs(wrapA(Math.atan2(e.y - this.y, e.x - this.x) - this.ang));
      const s = d + da * (this.ranged ? 0.9 : 0.7) - (e.boss || e.champion ? 0.4 : 0);
      if (s < bs) { bs = s; best = e; }
    }
    if (best) return best;
    if (!H.attack) return null;
    for (const t of H.towers()) {
      const d = hyp(t.cx - this.x, t.cy - this.y);
      if (d > R + 0.3) continue;
      const s = d + Math.abs(wrapA(Math.atan2(t.cy - this.y, t.cx - this.x) - this.ang)) * 0.5;
      if (s < bs) { bs = s; best = t; }
    }
    if (best) return best;
    const F = H.fortress();
    if (F) for (const gt of this.game.gates) if (hyp(gt.x - this.x, gt.y - this.y) <= R + 0.6) return F;
    return null;
  }
  posOf(t) {
    if (t === this.game.fortress) { const gt = this.game.gates.reduce((a, b) => (hyp(a.x - this.x, a.y - this.y) < hyp(b.x - this.x, b.y - this.y) ? a : b)); return { x: gt.x, y: gt.y, r: 0.7 }; }
    if (t.cx !== undefined) return { x: t.cx, y: t.cy, r: 0.42 };
    return { x: t.x, y: t.y, r: (t.size || 0.3) * 0.6 };
  }
  crit() { return this.game.rng.chance(CHAMP.crit + 0.06 * this.b('w_keen')); }

  // One blow on one target (a foe, an emplacement or the gate). Returns true when it landed.
  strike(t, mult, o = {}) {
    const H = this.host;
    const crit = o.noCrit ? false : this.crit();
    const dmg = this.dmgMult() * mult * (crit ? CHAMP.critMult + 0.25 * this.b('w_keen') : 1);
    // a warrior is made for fighting soldiers: walls and emplacements give way slowly to a blade (siege engines are for those)
    if (t === this.game.fortress) { H.hurtFort(dmg * (o.siege ?? CHAMP.siege.gate)); this.dmgDone += dmg; return true; }
    if (t.cx !== undefined) { H.hurtTower(t, dmg * (o.siege ?? CHAMP.siege.tower)); this.dmgDone += dmg; return true; }
    if (!H.alive(t)) return false;
    const before = t.dead;
    H.hurt(t, dmg * (t.air && !this.ranged ? 0.7 : 1), { type: o.type || this.cls.attack.type || 'physical', crit, splash: !!o.splash });
    this.dmgDone += dmg;
    if (o.stun) H.stun(t, o.stun);
    if (o.slow) H.slow(t, o.slow, o.slowT || 2);
    if (o.push && !t.dead) H.push(t, o.push);
    if (o.burn && !t.dead) H.burn(t, dmg * o.burn, 3);
    const ls = (this.cls.lifesteal || 0) + (this.furyT > 0 && this.cls.fury.lifesteal ? this.cls.fury.lifesteal : 0);
    if (ls) this.heal(dmg * ls * 0.35);
    if (!before && t.dead) this.onKill(t);
    this.game.emit('champHit', { champ: this, target: t, dmg, crit });
    return true;
  }
  onKill(e) {
    this.kos++; this.by[this.id] = (this.by[this.id] || 0) + 1;
    this.addFury(CHAMP.fury.kill + (e.duelist ? CAPTAIN.fury : 0));
    this.xp += (e.duelist ? CAPTAIN.xp : e.boss ? 6 : e.champion ? 3 : 1) * (1 + 0.25 * this.b('w_lore'));
    if (e.duelist) { this.stats.captains = (this.stats.captains || 0) + 1; this.heal(this.maxHp * 0.25); this.game.emit('captainSlain', { champ: this, enemy: e }); }
    const thirst = this.b('w_thirst'); if (thirst) this.heal(this.maxHp * 0.012 * thirst);
    this.dropOrb(e);
    if (e.duelist) { if (!this.host.attack) { this.pendingPicks++; this.game.emit('champPick', { champ: this, level: this.level, captain: true }); } else this.game.offerSpoils?.(); }
    if (this.kos % CHAMP.rampage.every === 0) {
      this.rampages++; this.heal(this.maxHp * CHAMP.rampage.heal); this.fury = Math.min(CHAMP.fury.max, this.fury + CHAMP.rampage.fury);
      this.host.reward(this.kos);
      this.game.emit('champStreak', { champ: this, kos: this.kos });
    }
    while (this.level < CHAMP.level.cap && this.xp >= levelNeed(this.level)) {
      this.xp -= levelNeed(this.level); this.level++; this.stats.levels++;
      if (!this.host.attack && this.level % CHAMP.pickEvery === 0) { this.pendingPicks++; this.game.emit('champPick', { champ: this, level: this.level }); }
      const before = this.maxHp; this.maxHp = this.baseHp(); this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - before) + this.maxHp * CHAMP.level.heal);
      this.game.emit('champLevel', { champ: this, level: this.level });
    }
  }
  addFury(n) { if (this.furyT <= 0) this.fury = Math.min(CHAMP.fury.max, this.fury + n * (1 + 0.3 * this.b('w_frenzy') + 0.4 * this.b('w_titan'))); }
  landed(n) {
    if (!n) return;
    this.hits += n; this.hitsT = 2.2; this.bestHits = Math.max(this.bestHits, this.hits);
    this.calmT = Math.min(this.calmT, 1.5);
    this.host.landed();
  }

  // Everything in a wedge in front of you (or all around for a spin) within reach.
  inArc(reach, arc, ang = this.ang, ox = this.x, oy = this.y) {
    const H = this.host, out = [];
    for (const e of H.foes()) {
      if (!H.alive(e)) continue;
      const d = hyp(e.x - ox, e.y - oy) - (e.size || 0.3) * 0.5;
      if (d > reach) continue;
      if (arc < 6.2 && d > 0.15 && Math.abs(wrapA(Math.atan2(e.y - oy, e.x - ox) - ang)) > arc / 2) continue;
      out.push(e);
    }
    if (H.attack) {
      for (const t of H.towers()) { const d = hyp(t.cx - ox, t.cy - oy) - 0.4; if (d <= reach && (arc >= 6.2 || Math.abs(wrapA(Math.atan2(t.cy - oy, t.cx - ox) - ang)) <= arc / 2 + 0.3)) out.push(t); }
      const F = H.fortress();
      if (F && this.game.gates.some((gt) => hyp(gt.x - ox, gt.y - oy) <= reach + 0.55)) out.push(F);
    }
    return out;
  }

  // ---------- attacks ----------
  startAttack() {
    const A = this.cls.attack, L = this.lock;
    if (L) { const p = this.posOf(L); this.ang = Math.atan2(p.y - this.y, p.x - this.x); }
    this.stats.swings++;
    this.calmT = 0;
    if (A.kind === 'melee') {
      const step = A.combo[this.combo % A.combo.length];
      const haste = this.furyT > 0 && this.cls.fury.haste ? 1 - this.cls.fury.haste : 1;
      this.atkT = step.time * haste; this.swing = 0.25; this.comboT = 0.95;
      // close the gap on a foe just out of reach
      if (L) { const p = this.posOf(L), d = hyp(p.x - this.x, p.y - this.y) - p.r; if (d > step.reach * 0.75) { const s = Math.min(CHAMP.magnet, d - step.reach * 0.6); this.moveBy(Math.cos(this.ang) * s, Math.sin(this.ang) * s); } }
      const arc = step.arc, reach = step.reach * this.reachMult();
      let n = 0;
      for (const t of this.inArc(reach, arc)) if (this.strike(t, step.mult, { stun: step.stun })) n++;
      this.landed(n); this.addFury(CHAMP.fury.hit * Math.min(5, n));
      this.lastSwing = { arc, reach, big: !!step.big, spin: !!step.spin, n, i: this.combo % A.combo.length };
      this.trails.push({ kind: step.spin ? 'spin' : 'slash', x: this.x, y: this.y, ang: this.ang, arc: Math.min(arc, 6.3), r: reach, t: 0.22, max: 0.22, big: !!step.big, flip: this.combo % 2 });
      this.combo = (this.combo + 1) % A.combo.length;
      this.game.emit('champSwing', { champ: this, n, big: !!step.big, spin: !!step.spin });
      return;
    }
    // bow and staff: a shot at the lock (leading a moving foe), or straight ahead
    this.atkT = A.time * (this.furyT > 0 && this.cls.fury.haste ? 1 - this.cls.fury.haste : 1); this.swing = 0.2;
    let tx = this.x + Math.cos(this.ang) * A.range, ty = this.y + Math.sin(this.ang) * A.range;
    if (L) {
      // lead a walking foe (the defence engine keeps foe velocity per second; the attack engine does not, and shots home in anyway)
      const p = this.posOf(L), tt = hyp(p.x - this.x, p.y - this.y) / A.speed, lead = !this.host.attack && L.cx === undefined;
      tx = p.x + (lead ? (L.vx || 0) * tt : 0); ty = p.y + (lead ? (L.vy || 0) * tt : 0);
      this.ang = Math.atan2(ty - this.y, tx - this.x);
    }
    this.fire(this.ang, A.kind === 'bolt' ? 'bolt' : 'arrow', A.mult, { pierce: A.pierce || 0, splash: A.splash || 0, range: A.range * this.reachMult(), speed: A.speed, type: A.type, target: L });
    this.game.emit('champShoot', { champ: this, kind: A.kind });
  }

  fire(ang, kind, mult, o = {}) {
    this.shots.push({ kind, x: this.x + Math.cos(ang) * 0.25, y: this.y + Math.sin(ang) * 0.25, dx: Math.cos(ang), dy: Math.sin(ang), speed: o.speed || 12, left: o.range || 4.5,
      mult, pierce: o.pierce || 0, splash: o.splash || 0, type: o.type, hit: new Set(), target: o.target || null, sx: this.x, sy: this.y });
  }

  updateShots(dt) {
    const H = this.host;
    for (const s of this.shots) {
      if (s.done) continue;
      // aimed shots curve a little towards their target, so a moving foe is not missed by a hair (a fingertip is not a mouse)
      if (s.target && !(s.target.dead || s.target.ruined || (s.target === this.game.fortress && s.target.hp <= 0))) {
        const p = this.posOf(s.target), a = Math.atan2(p.y - s.y, p.x - s.x), cur = Math.atan2(s.dy, s.dx), na = cur + wrapA(a - cur) * Math.min(1, dt * (s.kind === 'bolt' ? 6 : 4));
        s.dx = Math.cos(na); s.dy = Math.sin(na);
      }
      const step = s.speed * dt;
      s.x += s.dx * step; s.y += s.dy * step; s.left -= step;
      let boom = s.left <= 0;
      for (const e of H.foes()) {
        if (boom) break;
        if (!H.alive(e) || s.hit.has(e)) continue;
        if (hyp(e.x - s.x, e.y - s.y) > (e.size || 0.3) * 0.75 + 0.12) continue;
        if (s.splash) { boom = true; break; }
        s.hit.add(e);
        if (this.strike(e, s.mult, { type: s.type })) { this.landed(1); this.addFury(CHAMP.fury.shot); }
        if (s.hit.size > s.pierce) { s.done = true; break; }
      }
      if (!s.done && !boom && H.attack) {
        for (const t of H.towers()) if (hyp(t.cx - s.x, t.cy - 0.2 - s.y) < 0.45) { if (s.splash) boom = true; else { this.strike(t, s.mult * 0.8); s.done = true; } break; }
        const F = H.fortress();
        if (!s.done && !boom && F && this.game.gates.some((gt) => hyp(gt.x - s.x, gt.y - s.y) < 0.75)) { if (s.splash) boom = true; else { this.strike(F, s.mult * 0.6); s.done = true; } }
      }
      if (boom) {
        s.done = true;
        if (s.splash) {
          let n = 0;
          for (const t of this.inArc(s.splash, 6.3, 0, s.x, s.y)) if (this.strike(t, t.cx !== undefined || t === this.game.fortress ? s.mult * 0.7 : s.mult, { type: s.type, splash: true })) n++;
          this.landed(n); this.addFury(CHAMP.fury.shot * Math.min(4, n));
          this.trails.push({ kind: 'burst', x: s.x, y: s.y, r: s.splash, t: 0.3, max: 0.3 });
          this.game.emit('champBoom', { x: s.x, y: s.y, r: s.splash, kind: 'bolt' });
        }
      }
    }
    this.shots = this.shots.filter((s) => !s.done);
  }

  // ---------- dodge, skills and fury ----------
  tryDodge() {
    if (this.dead || this.dodgeCd > 0 || this.dash) return false;
    const D = CHAMP.dodge, inp = this.input;
    let a = this.ang + Math.PI;
    if (hyp(inp.mx || 0, inp.my || 0) > 0.2) a = Math.atan2(inp.my, inp.mx);
    this.dodgeT = D.time; this.dodgeCd = this.dodgeCdOf(); this.dodgeV = { x: Math.cos(a) * D.dist / D.time, y: Math.sin(a) * D.dist / D.time };
    this.releaseAll(); this.stats.dodges++;
    this.game.emit('champDodge', { champ: this });
    return true;
  }

  trySkill() {
    if (!this.skillReady || this.busy) return false;
    const S = this.cls.skill, L = this.lock;
    if (L) { const p = this.posOf(L); this.ang = Math.atan2(p.y - this.y, p.x - this.x); }
    this.skillCd = this.skillCdOf(); this.stats.skills++; this.calmT = 0;
    if (S.id === 'charge') {
      this.dash = { kind: 'charge', t: S.time, max: S.time, vx: Math.cos(this.ang) * S.dist / S.time, vy: Math.sin(this.ang) * S.dist / S.time, hit: new Set() };
      this.releaseAll();
    } else if (S.id === 'leap') {
      let tx = this.x + Math.cos(this.ang) * S.dist, ty = this.y + Math.sin(this.ang) * S.dist;
      if (L) { const p = this.posOf(L); if (hyp(p.x - this.x, p.y - this.y) < S.dist + 0.6) { tx = p.x; ty = p.y; } }
      this.dash = { kind: 'leap', t: S.time, max: S.time, vx: (tx - this.x) / S.time, vy: (ty - this.y) / S.time };
      this.releaseAll();
    } else if (S.id === 'volley') {
      for (let i = 0; i < S.n; i++) this.fire(this.ang + (i / (S.n - 1) - 0.5) * S.spread, 'arrow', S.mult, { pierce: S.pierce, range: this.cls.attack.range, speed: 14 });
      // and a hop back, out of reach
      this.dodgeT = 0.2; this.dodgeV = { x: -Math.cos(this.ang) * S.hop / 0.2, y: -Math.sin(this.ang) * S.hop / 0.2 };
      this.releaseAll();
    } else if (S.id === 'nova') {
      let n = 0;
      for (const t of this.inArc(S.r, 6.3)) if (this.strike(t, S.mult, { stun: S.stun, slow: S.slow, slowT: S.slowT, type: 'magic', splash: true })) n++;
      this.landed(n); this.addFury(CHAMP.fury.hit * Math.min(6, n));
      this.trails.push({ kind: 'nova', x: this.x, y: this.y, r: S.r, t: 0.45, max: 0.45 });
    }
    this.game.emit('champSkill', { champ: this, id: S.id, x: this.x, y: this.y });
    return true;
  }

  stepDash(dt) {
    const D = this.dash, S = this.cls.skill;
    D.t -= dt;
    this.moveBy(D.vx * dt, D.vy * dt);
    if (D.kind === 'charge') {
      let n = 0;
      for (const t of this.inArc(0.6, 6.3)) { if (D.hit.has(t)) continue; D.hit.add(t); if (this.strike(t, S.mult, { stun: S.stun, push: S.push })) n++; }
      this.landed(n); this.addFury(CHAMP.fury.hit * Math.min(5, n));
    } else if (D.kind === 'leap') this.air = Math.sin(Math.PI * Math.min(1, 1 - D.t / D.max)) * 0.7;
    if (D.t <= 0) {
      this.dash = null; this.air = 0;
      if (D.kind === 'leap') {
        let n = 0;
        for (const t of this.inArc(S.r, 6.3)) if (this.strike(t, S.mult, { stun: S.stun, splash: true })) n++;
        this.landed(n); this.addFury(CHAMP.fury.hit * Math.min(6, n));
        this.trails.push({ kind: 'nova', x: this.x, y: this.y, r: S.r, t: 0.4, max: 0.4, fire: true });
        this.game.emit('champBoom', { x: this.x, y: this.y, r: S.r, kind: 'slam' });
      }
    }
  }

  tryFury() {
    if (!this.furyReady || this.busy) return false;
    const F = this.cls.fury;
    this.fury = 0; this.stats.furies++; this.calmT = 0;
    if (F.id === 'meteor') {
      // six meteors over the foes in front of you, the locked foe first
      const pts = [];
      const front = this.host.foes().filter((e) => this.host.alive(e) && hyp(e.x - this.x, e.y - this.y) < 5 && Math.abs(wrapA(Math.atan2(e.y - this.y, e.x - this.x) - this.ang)) < 1.1)
        .sort((a, b) => hyp(a.x - this.x, a.y - this.y) - hyp(b.x - this.x, b.y - this.y));
      for (let i = 0; i < F.n; i++) {
        const e = front[i % Math.max(1, front.length)];
        if (e && i < front.length * 2) pts.push({ x: e.x + (i >= front.length ? (this.game.rng.next() - 0.5) * 0.8 : 0), y: e.y + (i >= front.length ? (this.game.rng.next() - 0.5) * 0.8 : 0) });
        else { const d = 1.4 + i * 0.45, a = this.ang + (this.game.rng.next() - 0.5) * 0.9; pts.push({ x: this.x + Math.cos(a) * d, y: this.y + Math.sin(a) * d }); }
      }
      pts.forEach((p, i) => this.meteors.push({ x: p.x, y: p.y, t: F.delay + i * F.gap, max: F.delay + i * F.gap, r: F.r }));
    } else this.furyT = F.time * (1 + 0.4 * this.b('w_titan'));
    this.furyTick = 0;
    this.game.emit('champFury', { champ: this, id: F.id });
    return true;
  }

  stepFury(dt) {
    const F = this.cls.fury;
    this.furyT -= dt;
    if (F.id === 'whirl') {
      this.ang = wrapA(this.ang + dt * 14); this.swing = 0.25;
      if ((this.furyTick -= dt) <= 0) {
        this.furyTick = F.tick;
        let n = 0;
        for (const t of this.inArc(F.r, 6.3)) if (this.strike(t, F.mult, { noCrit: false })) n++;
        this.landed(n);
        this.trails.push({ kind: 'spin', x: this.x, y: this.y, ang: this.ang, arc: 6.3, r: F.r, t: 0.2, max: 0.2, big: true });
      }
    } else if (F.id === 'storm') {
      this.furyTick -= dt;
      while (this.furyTick <= 0) {
        this.furyTick += 1 / F.rate;
        const near = this.host.foes().filter((e) => this.host.alive(e) && hyp(e.x - this.x, e.y - this.y) <= F.r);
        if (!near.length) { const a = this.game.rng.next() * Math.PI * 2, d = Math.sqrt(this.game.rng.next()) * F.r; this.trails.push({ kind: 'arrowfall', x: this.x + Math.cos(a) * d, y: this.y + Math.sin(a) * d, t: 0.35, max: 0.35 }); continue; }
        const e = near[this.game.rng.int(0, near.length - 1)];
        if (this.strike(e, F.mult)) this.landed(1);
        this.trails.push({ kind: 'arrowfall', x: e.x, y: e.y, t: 0.35, max: 0.35 });
      }
    }
    if (this.furyT <= 0) { this.furyT = 0; this.game.emit('champFuryEnd', { champ: this }); }
  }

  updateMeteors(dt) {
    if (!this.meteors.length) return;
    const F = this.cls.fury;
    for (const m of this.meteors) {
      m.t -= dt;
      if (m.t > 0) continue;
      m.done = true;
      let n = 0;
      for (const t of this.inArc(m.r, 6.3, 0, m.x, m.y)) if (this.strike(t, t.cx !== undefined || t === this.game.fortress ? F.mult * 0.6 : F.mult, { type: 'fire', splash: true, burn: 0.12 })) n++;
      this.landed(n);
      this.trails.push({ kind: 'nova', x: m.x, y: m.y, r: m.r, t: 0.45, max: 0.45, fire: true });
      this.game.emit('champBoom', { x: m.x, y: m.y, r: m.r, kind: 'meteor' });
    }
    this.meteors = this.meteors.filter((m) => !m.done);
  }

  // ---------- holding foes and being hit ----------
  // In a defence, foes that walk into you stop and fight you (up to the class's limit), so towers get them as sitting targets.
  holdFoes() {
    if (this.host.attack) return;   // the attack engine finds the champion in the road by itself
    const g = this.game, cap = this.cls.holds + this.b('w_wall');
    let held = 0;
    for (const e of g.enemies) {
      if (e.blocker !== this) continue;
      if (e.dead || hyp(e.x - this.x, e.y - this.y) > CHAMP.release || this.dead) { e.blocker = null; e.heldT = 0; continue; }
      held++;
    }
    if (this.dead || this.busy || held >= cap) { this.holding = held; return; }
    for (const e of g.enemies) {
      if (held >= cap) break;
      if (e.dead || e.blocker || e.air || e.boss || e.duelist || e.enraged || e.burrowT > 0 || e.def.structure || e.holdImmune > 0 || e.delay > 0) continue;
      if (hyp(e.x - this.x, e.y - this.y) > CHAMP.grab) continue;
      e.blocker = this; e.heldT = 0; held++; this.stats.held++;
    }
    this.holding = held;
  }
  // The horde fights back. Foes beside you that you are not holding still take a swing as they pass, bosses stop to crush
  // you, and raider archers loose at you when you come close. (The held ones hit you through the engine's own loop.)
  beset(dt) {
    if (this.dead) return;
    const g = this.game, B = CHAMP.beset, base = Math.max(1, g.plan?.hp || 1);
    for (const e of g.enemies) {
      if (e.dead || e.delay > 0 || e.burrowT > 0 || e.def.structure || e.stunT > 0 || e.blocker === this) continue;
      if ((e.champCd = (e.champCd ?? Math.random() * B.cd) - dt) > 0) continue;
      const d = hyp(e.x - this.x, e.y - this.y);
      const hit = Math.max(2, e.def.dmg * 4 * Math.sqrt(base)) * (e.def.crush || 1), big = e.boss || e.duelist;
      if (big ? d <= B.bossR : d <= B.r) {
        e.champCd = B.cd * (big ? 1.4 : 1);
        if (this.takeHit(hit * (e.boss ? B.boss : e.duelist ? B.captain : B.mult), { enemy: e }) > 0) this.game.emit('champStruck', { champ: this, enemy: e });
      } else if (e.def.shoots && d <= e.def.shoots.range && d > B.r) {
        e.champCd = e.def.shoots.cd * 1.2;
        this.game.emit('champShotAt', { champ: this, enemy: e });
        this.takeHit(e.def.shoots.dmg * Math.sqrt(base) * B.shot, { enemy: e, shot: true });
      } else e.champCd = 0.2;
    }
  }
  releaseAll() { if (this.host.attack) return; for (const e of this.game.enemies) if (e.blocker === this) { e.blocker = null; e.heldT = 0; } this.holding = 0; }

  // A blow from a foe, an arrow or an emplacement. Returns the damage taken.
  takeHit(dmg, o = {}) {
    // a blow that lands as you roll is a perfect dodge: it costs you nothing and feeds the fury
    if (!this.dead && this.dodgeT > 0 && dmg > 0 && !(this.perfectT > this.game.time)) {
      this.perfectT = this.game.time + 0.5; this.addFury(14); this.heal(this.maxHp * 0.03); this.stats.perfect = (this.stats.perfect || 0) + 1;
      this.game.emit('champPerfect', { champ: this });
    }
    if (this.dead || this.invulnerable || !(dmg > 0)) return 0;
    dmg *= this.campMult();
    let dr = this.cls.dr;
    if (this.furyT > 0 && this.cls.fury.dr) dr = 1 - (1 - dr) * (1 - this.cls.fury.dr);
    if (this.dash && this.dash.kind === 'charge') dr = 1 - (1 - dr) * (1 - this.cls.skill.dr);
    if (o.magic) dr *= 0.5;
    dr = 1 - (1 - dr) * Math.pow(0.94, this.b('w_bulwark'));
    const d = dmg * (1 - dr);
    this.hp -= d; this.dmgTaken += d; this.flash = 0.12; this.calmT = 0;
    if (this.furyT <= 0) this.fury = Math.min(CHAMP.fury.max, this.fury + CHAMP.fury.hurt * d / Math.max(1, this.maxHp));
    if (this.hp <= 0) {
      // Phoenix Heart: once a wave, a deathblow leaves you standing
      if (this.b('w_phoenix') && !this.phoenixUsed) { this.phoenixUsed = true; this.hp = this.maxHp * 0.4; this.shieldT = Math.max(this.shieldT, 2); this.game.emit('champPhoenix', { champ: this }); }
      else this.die();
    }
    return d;
  }
  die() {
    this.hp = 0; this.dead = true; this.deaths++; this.stats.deaths++;
    this.respawnT = Math.min(CHAMP.respawnMax, CHAMP.respawn + CHAMP.respawnPer * (this.deaths - 1)) * Math.max(0.3, 1 - 0.3 * this.b('w_unbroken'));
    this.furyT = 0; this.dash = null; this.dodgeT = 0; this.fury = Math.floor(this.fury * 0.5); this.shots = []; this.hits = 0;
    this.releaseAll();
    this.game.emit('champDown', { champ: this, respawn: this.respawnT });
  }

  // What a run's summary and the profile keep.
  summary() {
    // the warrior that took most of the kills gets the run's name (and the credit for the best wave)
    const top = Object.entries(this.by).sort((a, b) => b[1] - a[1])[0];
    return { ...this.stats, cls: top && top[1] > this.kos * 0.5 ? top[0] : this.id, by: { ...this.by }, level: this.level, kos: this.kos, bestHits: this.bestHits, deaths: this.deaths, dmg: Math.round(this.dmgDone) };
  }
  serialize() {
    return { cls: this.id, level: this.level, xp: this.xp, mastery: this.mastery, masteries: this.masteries, swap: this.swapOk, by: this.by, picks: this.pendingPicks, kos: this.kos, deaths: this.deaths, bestHits: this.bestHits, fury: Math.floor(this.fury) };
  }
  load(s) {
    if (!s) return;
    this.level = Math.max(1, s.level | 0); this.xp = Math.max(0, +s.xp || 0); this.kos = Math.max(0, s.kos | 0); this.deaths = Math.max(0, s.deaths | 0); this.bestHits = s.bestHits | 0;
    this.fury = Math.max(0, Math.min(CHAMP.fury.max, s.fury | 0));
    this.pendingPicks = Math.max(0, Math.min(20, s.picks | 0));
    if (s.by && typeof s.by === 'object') for (const id of CHAMP_IDS) if (Number.isFinite(s.by[id])) this.by[id] = Math.max(0, s.by[id] | 0);
    this.maxHp = this.baseHp(); this.hp = this.maxHp;
  }
}

// A simple pilot for tests, the attract screen and the headless bot: walk to the nearest foe, swing, use the skill and fury.
export function autoChampion(c, dt = 0.05) {
  const H = c.host;
  let best = null, bd = Infinity;
  for (const e of H.foes()) { if (!H.alive(e)) continue; const d = hyp(e.x - c.x, e.y - c.y); if (d < bd) { bd = d; best = e; } }
  if (!best && H.attack) for (const t of H.towers()) { const d = hyp(t.cx - c.x, t.cy - c.y); if (d < bd) { bd = d; best = { x: t.cx, y: t.cy }; } }
  if (!best && H.attack && H.fortress()) { const gt = c.game.gates[0]; best = { x: gt.x, y: gt.y }; bd = hyp(gt.x - c.x, gt.y - c.y); }
  const keep = c.ranged ? c.cls.attack.range * 0.6 : 0.6;
  if (best && bd > keep) { const a = Math.atan2(best.y - c.y, best.x - c.x); c.input.mx = Math.cos(a); c.input.my = Math.sin(a); }
  else { c.input.mx = 0; c.input.my = 0; }
  c.input.attack = !!best && bd < c.reach + 0.5;
  if (c.skillReady && best && bd < 2) c.input.skill = true;
  if (c.furyReady && best && bd < 2.5) c.input.fury = true;
  if (c.hp < c.maxHp * 0.3 && c.dodgeCd <= 0) c.input.dodge = true;
}
