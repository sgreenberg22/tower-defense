// Commander Mode (internally mode 'hero'): you fight from the castle wall in first person while your engineers build.
// v1.59 turns it into an action game you win by working the buttons hard, and choosing well when to press them:
//  - Command Points (⚡) fill as you hit and kill (Clash Royale's elixir, earned with your own aim) and pay for a deck of
//    four commands with short cooldowns, picked before the run;
//  - an active reload (Gears of War): tap FIRE in the gold window of an empty reload for a full quiver and a damage
//    boost, or tap too early and jam;
//  - Fever (Tap Titans' frenzy): a long enough combo and every shot is free for a few seconds;
//  - an Ultimate (Brawl Stars' super) charged by hand damage; three doctrines, each with its own ultimate;
//  - Commander levels with a choice of three perks (Archero), weak points on bosses, a bounty every wave, a quest every
//    wave, kill streaks, and orders for your engineers (arm me, towers, walls).
// Pure rules, attached to a Game as game.cmdr; the engine calls a handful of hooks (see engine.js) and the rest comes
// through the engine's own events.
import { ENEMIES } from '../data/balance.js';

export const COMMANDER = {
  cp: { max: 10, start: 4, regen: 0.4, hit: 0.12, head: 0.2, kill: 0.5, boss: 3, bounty: 4, perfect: 1.5, early: 2, weak: 1 },
  ult: { need: 150, hit: 0.6, head: 1, kill: 2.5, perfect: 6, weak: 4, streak: 15, flawless: 10 },
  reload: { start: 0.45, width: 0.22, steady: 0.6, perfectT: 3, perfectDmg: 0.25, jam: 0.5 },
  fever: { at: 20, perkAt: 15, time: 8, perkTime: 3, crit: 0.25, rest: 15 },
  weak: { first: 3, every: 7, time: 2.5, mult: 2.5, stun: 0.4 },
  xp: { kill: 1, boss: 8, bounty: 3, quest: 4, need: (lv) => 5 + 4 * lv },
  streaks: [10, 25, 50, 100],
  deckSize: 4,
  reroll: { gold: 30, perWave: 6 },   // a fresh set of three perks: once per level, paid from the engineers' treasury
  quests: { marked: 5 },
  decks: 4,                          // saved decks
};

// The commands: a deck of four, each paid in ⚡ with its own short recharge.
export const COMMANDS = {
  volley:     { name: 'Volley', icon: '🏹', cost: 3, cd: 5, aim: true, n: 5, r: 1.1, dmg: 0.9, blurb: 'Five arrow strikes rain on your target and the foes round it.' },
  firebomb:   { name: 'Firebomb', icon: '🔥', cost: 3, cd: 7, aim: true, r: 1.1, time: 5, dps: 0.9, blurb: 'A pot of fire bursts on your target and burns the road there for 5 seconds.' },
  frost:      { name: 'Frost Rounds', icon: '❄', cost: 2, cd: 6, shots: 4, slow: 0.6, slowT: 2, blurb: 'Your next 4 shots freeze what they hit, slowing it 60%.' },
  pierce:     { name: 'Piercing Shot', icon: '💥', cost: 2, cd: 4, mult: 3, blurb: 'Your next shot goes through every foe in its path for triple damage.' },
  mark:       { name: 'Mark for Death', icon: '🎯', cost: 2, cd: 8, foe: true, time: 8, vuln: 0.4, blurb: 'The foe you are locked on takes 40% more from everything, and every tower shoots it first.' },
  overcharge: { name: 'Overcharge', icon: '⚡', cost: 4, cd: 12, time: 5, rate: 0.6, blurb: 'Every tower fires 60% faster for 5 seconds.' },
  shield:     { name: 'Shield Wall', icon: '🛡', cost: 3, cd: 14, time: 6, cut: 0.6, mend: 0.08, blurb: 'Breaches hurt 60% less for 6 seconds, and the wall mends 8% at once.' },
  muster:     { name: 'Muster', icon: '🪖', cost: 4, cd: 12, n: 2, blurb: 'Two footmen run out of the gate to fight for you.' },
  plunder:    { name: 'Plunder', icon: '💰', cost: 5, cd: 20, time: 10, blurb: 'For 10 seconds, every foe you slay by hand pays double gold.' },
};
export const COMMAND_IDS = Object.keys(COMMANDS);
export const DEFAULT_DECK = ['volley', 'frost', 'overcharge', 'shield'];
export const cleanDeck = (list) => {
  const ok = [...new Set(Array.isArray(list) ? list : [])].filter((id) => COMMANDS[id]).slice(0, COMMANDER.deckSize);
  for (const id of DEFAULT_DECK) if (ok.length < COMMANDER.deckSize && !ok.includes(id)) ok.push(id);
  return ok;
};

// Doctrines: who you are on the wall. Each brings a passive and its own Ultimate.
export const DOCTRINES = {
  marksman: { name: 'Marksman', icon: '🎯', ult: 'storm', blurb: '+10% crit, headshots 25% harder.', crit: 0.1, head: 0.25 },
  tactician: { name: 'Tactician', icon: '📜', ult: 'warp', blurb: '⚡ comes 40% faster, commands recharge 20% faster, and you start with 3 more ⚡.', regen: 0.4, cdMult: 0.8, startCp: 3 },
  siegebreaker: { name: 'Siegebreaker', icon: '💣', ult: 'meteor', blurb: 'Every shot bursts on impact; bosses and champions take 25% more from you.', splash: 0.55, boss: 0.25 },
};
export const DOCTRINE_IDS = Object.keys(DOCTRINES);
export const ULTS = {
  storm: { name: 'Arrow Storm', icon: '🌧', time: 6, every: 0.12, dmg: 1.1, blurb: 'For 6 seconds arrows strike the foes nearest your keep, eight a second.' },
  warp: { name: 'Time Warp', icon: '⏳', time: 6, slow: 0.7, reload: 0.35, blurb: 'For 6 seconds the horde crawls (70% slower) and you reload three times as fast.' },
  meteor: { name: 'Meteor Rain', icon: '☄', n: 10, every: 0.28, r: 1.1, dmg: 3.5, blurb: 'Ten meteors fall on the thickest knots of the horde.' },
};

// Perks: a choice of three at every Commander level (levels come from slaying foes by hand).
export const PERKS = {
  rapid:   { name: 'Rapid Reload', icon: '⏩', max: 3, desc: 'Reload 15% faster.' },
  twin:    { name: 'Twin Shot', icon: '🏹', max: 2, desc: 'One more arrow with every shot (at half damage).' },
  heavy:   { name: 'Heavy Tips', icon: '🪨', max: 4, desc: 'Your weapon hits 18% harder.' },
  eagle:   { name: 'Eagle Eye', icon: '🦅', max: 3, desc: '+8% crit chance.' },
  head:    { name: 'Headhunter', icon: '💀', max: 2, desc: 'Headshots hit 30% harder.' },
  quiver:  { name: 'Deep Quiver', icon: '🎒', max: 3, desc: '+2 shots before you reload.' },
  battery: { name: 'Battery', icon: '🔋', max: 2, desc: '+3 to your ⚡ maximum.' },
  dynamo:  { name: 'Dynamo', icon: '⚙', max: 3, desc: '⚡ comes 30% faster.' },
  orders:  { name: 'Quick Orders', icon: '📯', max: 2, desc: 'Commands recharge 20% faster.' },
  surge:   { name: 'Surge', icon: '🌩', max: 2, desc: 'Your Ultimate charges 30% faster.' },
  fever:   { name: 'Fever Pitch', icon: '🔥', max: 1, desc: 'Fever starts at a 15-hit combo and lasts 3 seconds longer.' },
  steady:  { name: 'Steady Hands', icon: '✋', max: 2, desc: 'The perfect-reload window is 60% wider.' },
  bounty:  { name: 'Bounty Hunter', icon: '💰', max: 2, desc: 'Foes you slay by hand pay +2 gold; bounties pay twice as much.' },
  mason:   { name: 'Iron Will', icon: '🧱', max: 2, desc: 'The wall +15%, mended in full now.' },
  spark:   { name: 'Spark', icon: '✨', max: 2, desc: 'Every 6th hit arcs on to 3 foes nearby.' },
  spotter: { name: 'Spotter', icon: '🔭', max: 2, desc: 'Marked foes take 15% more from everything (needs Mark for Death in your deck).', needs: 'mark' },
  reserve: { name: 'Reserve Fund', icon: '🏦', max: 2, desc: 'Every wave opens with +1 ⚡.' },
};
export const PERK_IDS = Object.keys(PERKS);

// A quest every wave: a small aim for extra gold, ⚡ and Commander experience.
export const QUESTS = {
  heads:    { icon: '💀', text: 'Land 3 headshots', goal: 3 },
  combo:    { icon: '🔗', text: 'Reach a 12-hit combo', goal: 12 },
  orders:   { icon: '📯', text: 'Use 3 commands', goal: 3 },
  bounty:   { icon: '💰', text: 'Slay the bounty by hand', goal: 1 },
  perfects: { icon: '✨', text: 'Land 2 perfect reloads', goal: 2 },
  clean:    { icon: '🛡', text: 'Let nothing through the gate', goal: 1 },
  flyers:   { icon: '🦅', text: 'Shoot down 2 flyers by hand', goal: 2 },
  nocmd:    { icon: '🤐', text: 'Win the wave without a command, slaying 3 by hand', goal: 1, hand: 3 },
  marked:   { icon: '🎯', text: 'Land 5 hits on a marked foe', goal: 5 },
};
// What the engineers spend the treasury on (the auto builder reads weaponShare and wallAt).
export const BUILD_ORDERS = {
  balanced: { name: 'Balanced', icon: '⚖', weaponShare: 0.18, wallAt: 0.7, blurb: 'Towers first, a fair share for your weapon.' },
  arms: { name: 'Arm me', icon: '🏹', weaponShare: 0.42, wallAt: 0.6, blurb: 'Pour gold into your weapon: damage, reload, ammo, crit.' },
  towers: { name: 'Towers', icon: '🏰', weaponShare: 0.06, wallAt: 0.6, blurb: 'Every coin into more and bigger towers.' },
  walls: { name: 'Walls', icon: '🧱', weaponShare: 0.12, wallAt: 0.95, blurb: 'Keep the wall and keep mended first.' },
};

const hyp = Math.hypot;

export class Commander {
  constructor(game, o = {}) {
    this.g = game;
    this.doctrine = DOCTRINES[o.doctrine] ? o.doctrine : 'marksman';
    this.deck = cleanDeck(o.deck);
    this.order = BUILD_ORDERS[o.order] ? o.order : 'balanced';
    this.cp = COMMANDER.cp.start + (this.D.startCp || 0);
    this.ult = 0; this.ultT = 0; this.ultKind = null; this.ultTick = 0; this.ultQueue = [];
    this.lv = 1; this.xp = 0; this.perks = {}; this.pending = 0; this.offer = null;
    this.cds = Object.fromEntries(this.deck.map((id) => [id, 0]));
    this.feverT = 0; this.feverArmed = true; this.perfectT = 0; this.jammed = false;
    this.frostShots = 0; this.pierceShots = 0; this.overT = 0; this.shieldT = 0; this.plunderT = 0; this.mark = null;
    this.strikes = []; this.striking = false; this.hits = 0;
    this.bounty = null; this.bountyDone = false; this.quest = null; this.streak = 0;
    this.stats = { perfects: 0, jams: 0, fevers: 0, ults: 0, commands: 0, bounties: 0, quests: 0, weakHits: 0, streakBest: 0, perksTaken: 0 };
    this.wire();
  }
  get D() { return DOCTRINES[this.doctrine]; }
  perk(id) { return this.perks[id] || 0; }

  // ---------- the numbers your perks and doctrine change ----------
  cpMax() { return COMMANDER.cp.max + 3 * this.perk('battery'); }
  cpRegen() { return COMMANDER.cp.regen * (1 + (this.D.regen || 0) + 0.3 * this.perk('dynamo')); }
  cdMult() { return (this.D.cdMult || 1) * Math.pow(0.8, this.perk('orders')); }
  ultGain(n) { if (!this.ultT && !this.ultQueue.length) this.ult = Math.min(COMMANDER.ult.need, this.ult + n * (1 + 0.3 * this.perk('surge'))); }
  gainCp(n) { this.cp = Math.min(this.cpMax(), this.cp + n); }
  feverAt() { return this.perk('fever') ? COMMANDER.fever.perkAt : COMMANDER.fever.at; }
  weaponShare() { return BUILD_ORDERS[this.order].weaponShare; }
  wallAt() { return BUILD_ORDERS[this.order].wallAt; }
  // engine hook: the weapon as your perks, doctrine, Fever and Time Warp leave it
  weaponMods(W) {
    const crit = Math.min(0.95, W.crit + 0.08 * this.perk('eagle') + (this.D.crit || 0) + (this.feverT > 0 ? COMMANDER.fever.crit : 0));
    const reload = W.reload * Math.pow(0.85, this.perk('rapid')) * (this.ultT > 0 && this.ultKind === 'warp' ? ULTS.warp.reload : 1);
    return { ...W, dmg: W.dmg * (1 + 0.18 * this.perk('heavy')), crit, reload, ammo: W.ammo + 2 * this.perk('quiver') };
  }
  freeShot() { return this.feverT > 0; }
  extraArrows() { return this.perk('twin'); }
  // engine hook: an armed shot (Piercing Shot, Frost Rounds) and the Siegebreaker's burst
  shotMods(p) {
    if (this.pierceShots > 0) { this.pierceShots--; p.pierce = 99; p.dmg *= COMMANDS.pierce.mult; p.cmdrPierce = true; this.g.emit('cmdrArmed', { kind: 'pierce', left: this.pierceShots }); }
    if (this.frostShots > 0) { this.frostShots--; p.frost = true; }
    if (this.D.splash && !p.splash) { p.splash = this.D.splash; p.splashFrac = 0.5; }
    return p;
  }
  // engine hook: how much harder a hand hit lands (a perfect reload, a weak point, Headhunter, the Siegebreaker on bosses)
  hitMult(p, e, head, isMain) {
    let m = this.perfectT > 0 ? 1 + COMMANDER.reload.perfectDmg : 1;
    if (isMain && e === this.mark && e.cmdrMarkT > 0) this.questTick('marked');
    if (head) m *= 1 + 0.3 * this.perk('head') + (this.D.head || 0);
    if ((e.boss || e.champion) && this.D.boss) m *= 1 + this.D.boss;
    if (isMain && e.weakT > 0) {
      const W = COMMANDER.weak;
      m *= W.mult; this.stats.weakHits++;
      this.gainCp(COMMANDER.cp.weak); this.ultGain(COMMANDER.ult.weak);
      if (!e.boss) this.g.stun(e, W.stun); else e.slowT = Math.max(e.slowT, 0.5), e.slow = Math.max(e.slow, 0.5);
      this.g.emit('weakHit', { enemy: e });
    }
    return m;
  }
  // engine hook: after a hand hit (Frost Rounds, Spark)
  afterHit(p, e) {
    if (p.frost && !e.dead) { const C = COMMANDS.frost; e.slow = Math.max(e.slow, C.slow); e.slowT = Math.max(e.slowT, C.slowT); this.g.emit('frosted', { enemy: e }); }
    if (p.main && this.perk('spark') && ++this.hits % 6 === 0 && !e.dead) {
      this.striking = true;
      this.g.chainHit(e, { chain: 2 + this.perk('spark'), chainRange: 1.8, chainFalloff: 0.8 }, { src: 'hero', dmg: p.dmg * 0.6, type: 'magic' }, [{ x: e.x, y: e.y }]);
      this.striking = false;
    }
  }
  // engine hook: the marked foe takes more from everything
  vulnOf(e) { return e === this.mark && e.cmdrMarkT > 0 ? 1 + COMMANDS.mark.vuln + 0.15 * this.perk('spotter') : 1; }
  towerRate() { return this.overT > 0 ? 1 + COMMANDS.overcharge.rate : 1; }
  leakCut() { return this.shieldT > 0 ? 1 - COMMANDS.shield.cut : 1; }

  // ---------- the active reload ----------
  // A Commander's quiver, once empty, reloads all at once (engine hook from updateWeapon; true = it took the step).
  // A half-empty quiver still tops up one shot at a time, as in every other mode.
  reloadStep(dt, W) {
    const g = this.g;
    if (g.weapon.ammo >= 1 || this.feverT > 0 || g.focusT > 0) { this.fullT = 0; return false; }
    if (!(this.fullT > 0)) { this.fullMax = W.reload * Math.max(1, W.ammo * 0.55); this.fullT = this.fullMax; }
    this.fullT -= dt;
    if (this.fullT <= 0) { this.fullT = 0; g.weapon.ammo = W.ammo; g.weapon.reloadT = 0; this.jammed = false; }
    return true;
  }
  // Where the gold window sits on an empty reload: {p: progress 0-1, a, b, jammed} or null when the quiver is not empty.
  reloadWindow() {
    const g = this.g;
    if (g.weapon.ammo >= 1 || this.feverT > 0 || g.focusT > 0 || !(this.fullT > 0)) return null;
    const R = COMMANDER.reload, a = R.start, b = Math.min(0.95, a + R.width * (1 + R.steady * this.perk('steady')));
    return { p: Math.max(0, Math.min(1, 1 - this.fullT / this.fullMax)), a, b, jammed: this.jammed };
  }
  // FIRE pressed with an empty quiver: in the window, a full quiver and a damage boost; outside it, a jam (once a reload).
  activeReload() {
    const g = this.g, w = this.reloadWindow();
    if (!w || g.phase !== 'wave') return null;
    if (!w.jammed && w.p >= w.a && w.p <= w.b) {
      const W = g.weaponStats();
      g.weapon.ammo = W.ammo; g.weapon.reloadT = 0; this.fullT = 0;
      this.perfectT = COMMANDER.reload.perfectT; this.stats.perfects++;
      this.gainCp(COMMANDER.cp.perfect); this.ultGain(COMMANDER.ult.perfect);
      this.questTick('perfects');
      g.emit('perfectReload', {});
      return 'perfect';
    }
    if (w.jammed) return 'jammed';
    this.jammed = true; this.stats.jams++;
    this.fullT = Math.min(this.fullMax, this.fullT + this.fullMax * COMMANDER.reload.jam);
    g.emit('jam', {});
    return 'jam';
  }

  // ---------- commands ----------
  cmdCd(id) { return COMMANDS[id] ? COMMANDS[id].cd * this.cdMult() : 0; }
  // Why a command cannot be used now (null: it can)
  cmdBlock(id) {
    const C = COMMANDS[id], g = this.g;
    if (!C || !this.deck.includes(id)) return 'unknown';
    if (g.over || g.phase !== 'wave') return 'wave';
    if (this.cds[id] > 0) return 'cd';
    if (this.cp < C.cost) return 'cp';
    return null;
  }
  // Use a command. pt = where it lands (aimed ones), foe = the locked foe (Mark). Returns true when it went off.
  command(id, pt = null, foe = null) {
    if (this.cmdBlock(id)) return false;
    const C = COMMANDS[id], g = this.g, W = g.weaponStats();
    if (C.aim && !pt) return false;
    if (C.foe && (!foe || foe.dead)) return false;
    if (id === 'volley') for (let i = 0; i < C.n; i++) this.strikes.push({ t: 0.15 + i * 0.13, x: pt.x + (i ? g.rng.range(-0.55, 0.55) : 0), y: pt.y + (i ? g.rng.range(-0.45, 0.45) : 0), r: C.r * 0.75, dmg: W.dmg * C.dmg, kind: 'volley' });
    else if (id === 'firebomb') { g.fields.push({ x: pt.x, y: pt.y, r: C.r, t: C.time, dps: W.dmg * C.dps, src: 'hero' }); g.emit('impact', { x: pt.x, y: pt.y, kind: 'ball', splash: C.r }); }
    else if (id === 'frost') this.frostShots = C.shots;
    else if (id === 'pierce') this.pierceShots = 1;
    else if (id === 'mark') { if (this.mark && this.mark !== foe) this.mark.cmdrMarkT = 0; this.mark = foe; foe.cmdrMarkT = C.time; }
    else if (id === 'overcharge') this.overT = C.time;
    else if (id === 'shield') { this.shieldT = C.time; if (!g.noMend) g.wall.hp = Math.min(g.wall.maxHp, g.wall.hp + g.wall.maxHp * C.mend); }
    else if (id === 'muster') { for (let i = 0; i < C.n; i++) { const tr = g.addTroop('footman', true); tr.levy = true; g.deployTroop(tr); } }
    else if (id === 'plunder') this.plunderT = C.time;
    this.cp -= C.cost; this.cds[id] = this.cmdCd(id); this.stats.commands++;
    const U = (this.stats.used ||= {}), u = (U[id] ||= { n: 0, cp: 0 }); u.n++; u.cp += C.cost;
    if (this.quest?.id === 'nocmd') this.quest.failed = true;
    this.questTick('orders');
    g.emit('command', { id, x: pt?.x ?? foe?.x, y: pt?.y ?? foe?.y, foe });
    return true;
  }

  // ---------- the Ultimate ----------
  ultReady() { return this.ult >= COMMANDER.ult.need && !this.ultT && !this.ultQueue.length && this.g.phase === 'wave' && !this.g.over; }
  useUlt() {
    if (!this.ultReady()) return false;
    const kind = this.D.ult, U = ULTS[kind], g = this.g;
    this.ult = 0; this.stats.ults++; this.ultKind = kind;
    if (kind === 'meteor') {
      for (let i = 0; i < U.n; i++) this.ultQueue.push({ t: 0.3 + i * U.every });
    } else { this.ultT = U.time; this.ultTick = 0; }
    g.emit('ultimate', { kind });
    return true;
  }
  // the foes worth striking: those nearest the keep first
  targets(n = 12) {
    const g = this.g, c = g.map.castle;
    return g.enemies.filter((e) => !e.dead && !(e.burrowT > 0) && e.def && !e.def.structure && g.isVisible(e)).sort((a, b) => hyp(a.x - c.x, a.y - c.y) - hyp(b.x - c.x, b.y - c.y)).slice(0, n);
  }
  strike(e, dmg, type, kind, r = 0) {
    const g = this.g;
    this.striking = true;
    if (r) { for (const n of g.enemies) if (!n.dead && !(n.burrowT > 0) && hyp(n.x - e.x, n.y - e.y) <= r) g.damage(n, dmg, type, 'hero', { hero: true, splash: true }); }
    else g.damage(e, dmg, type, 'hero', { hero: true });
    this.striking = false;
  }

  // ---------- each step ----------
  update(dt) {
    const g = this.g, C = COMMANDER;
    for (const id of this.deck) if (this.cds[id] > 0) this.cds[id] -= dt;
    if (this.perfectT > 0) this.perfectT -= dt;
    if (g.weapon.ammo >= 1) this.jammed = false;
    if (g.phase !== 'wave') return;
    this.gainCp(this.cpRegen() * dt);
    for (const k of ['overT', 'shieldT', 'plunderT']) if (this[k] > 0) this[k] -= dt;
    if (this.mark && (this.mark.dead || (this.mark.cmdrMarkT -= dt) <= 0)) { if (!this.mark.dead) this.mark.cmdrMarkT = 0; this.mark = null; }
    // Fever: on at the combo mark, off when it runs out; it arms again once the combo has broken
    if (this.feverT > 0) { this.feverT -= dt; if (this.feverT <= 0) { this.feverRest = C.fever.rest; g.emit('fever', { on: false }); } }
    if (this.feverRest > 0) this.feverRest -= dt;
    if (g.combo === 0) this.feverArmed = true;
    if (this.feverArmed && this.feverT <= 0 && !(this.feverRest > 0) && g.combo >= this.feverAt()) {
      this.feverArmed = false; this.feverT = C.fever.time + (this.perk('fever') ? C.fever.perkTime : 0); this.stats.fevers++;
      g.weapon.ammo = g.weaponStats().ammo;
      g.emit('fever', { on: true });
    }
    // volley strikes
    for (const s of this.strikes) {
      if ((s.t -= dt) > 0) continue;
      s.done = true;
      this.strike({ x: s.x, y: s.y }, s.dmg, 'physical', s.kind, s.r);
      g.emit('cmdrStrike', { x: s.x, y: s.y, kind: s.kind, r: s.r });
    }
    if (this.strikes.length) this.strikes = this.strikes.filter((s) => !s.done);
    // the Ultimate
    const W = g.weaponStats();
    if (this.ultT > 0) {
      this.ultT -= dt;
      if (this.ultKind === 'storm') {
        this.ultTick -= dt;
        while (this.ultTick <= 0) {
          this.ultTick += ULTS.storm.every;
          const list = this.targets(8);
          if (!list.length) break;
          const e = list[g.rng.int(0, list.length - 1)];
          this.strike(e, W.dmg * ULTS.storm.dmg, 'physical', 'storm');
          g.emit('cmdrStrike', { x: e.x, y: e.y, kind: 'storm', r: 0.3 });
        }
      } else if (this.ultKind === 'warp') {
        for (const e of g.enemies) if (!e.dead) { e.slow = Math.max(e.slow, ULTS.warp.slow); e.slowT = Math.max(e.slowT, 0.25); }
      }
      if (this.ultT <= 0) { this.ultT = 0; this.ultKind = null; g.emit('ultimateEnd', {}); }
    }
    for (const q of this.ultQueue) {
      if ((q.t -= dt) > 0) continue;
      q.done = true;
      const list = this.targets(14);
      if (!list.length) continue;
      // the thickest knot: the foe with the most others close by
      let best = list[0], bn = -1;
      for (const e of list) { let n = 0; for (const o of list) if (hyp(o.x - e.x, o.y - e.y) < 1.2) n++; n += g.rng.range(0, 0.9); if (n > bn) { bn = n; best = e; } }
      const U = ULTS.meteor;
      this.strike(best, W.dmg * U.dmg, 'fire', 'meteor', U.r);
      g.emit('impact', { x: best.x, y: best.y, kind: 'meteor', splash: U.r });
    }
    if (this.ultQueue.length) { this.ultQueue = this.ultQueue.filter((q) => !q.done); if (!this.ultQueue.length) { this.ultKind = null; g.emit('ultimateEnd', {}); } }
    // weak points open and close on bosses and champions
    for (const e of g.enemies) {
      if (e.dead || !(e.boss || e.champion)) continue;
      if (e.weakT > 0) { e.weakT -= dt; continue; }
      e.weakCd = (e.weakCd ?? C.weak.first) - dt;
      if (e.weakCd <= 0) { e.weakCd = C.weak.every; e.weakT = C.weak.time; g.emit('weakPoint', { enemy: e }); }
    }
    // the bounty: one foe each wave, once the wave is under way
    if (!this.bounty && !this.bountyDone && g.waveClock > 2) {
      const pool = g.enemies.filter((e) => !e.dead && !e.boss && !e.champion && e.def && !e.def.structure && !e.def.steal && g.isVisible(e));
      if (pool.length >= 2) {
        const e = pool.sort((a, b) => b.maxHp - a.maxHp)[Math.min(pool.length - 1, g.rng.int(0, 2))];
        e.bounty = true; this.bounty = e;
        g.emit('bounty', { enemy: e });
      }
    }
    if (this.bounty && this.bounty.dead && !this.bountyDone) { this.bountyDone = true; if (!this.bounty.bountyPaid) g.emit('bountyLost', { enemy: this.bounty }); }
    if (this.quest && !this.quest.done && this.quest.id === 'combo') this.questSet(g.combo);
  }

  // ---------- events from the engine ----------
  wire() {
    const g = this.g, C = COMMANDER;
    g.on('combo', ({ combo, broke }) => {
      if (this.striking || combo <= 0 || broke) return;
      this.gainCp(C.cp.hit); this.ultGain(C.ult.hit);
    });
    g.on('hit', ({ hero, headshot }) => {
      if (!hero || this.striking || !headshot) return;
      this.gainCp(C.cp.head); this.ultGain(C.ult.head);
      this.questTick('heads');
    });
    g.on('kill', ({ enemy: e, hero, gold }) => {
      if (e.bounty && !e.bountyPaid && hero) {
        e.bountyPaid = true; this.stats.bounties++;
        const extra = g.addGold(Math.max(10, gold || 0) * 3 * (1 + this.perk('bounty')));
        this.gainCp(C.cp.bounty); this.gainXp(C.xp.bounty); this.questTick('bounty');
        g.emit('bountySlain', { enemy: e, gold: extra });
      }
      if (!hero) return;
      this.waveHand = (this.waveHand || 0) + 1;
      if (this.plunderT > 0 && gold) g.addGold(gold);
      if (this.perk('bounty') && !e.def?.structure) g.addGold(2 * this.perk('bounty'));
      this.gainCp(e.boss ? C.cp.boss : C.cp.kill); this.ultGain(C.ult.kill);
      this.gainXp(e.boss ? C.xp.boss : C.xp.kill);
      if (e.wasAir || (e.air && !e.def?.structure)) this.questTick('flyers');
      this.streak++;
      if (this.streak > this.stats.streakBest) this.stats.streakBest = this.streak;
      if (C.streaks.includes(this.streak)) { this.gainCp(2); this.ultGain(C.ult.streak); g.emit('cmdrStreak', { n: this.streak }); }
    });
    g.on('leak', () => { if (this.streak >= 5) g.emit('streakEnd', { n: this.streak }); this.streak = 0; if (this.quest?.id === 'clean' && !this.quest.done) this.quest.failed = true; });
    g.on('earlyCall', () => { this.gainCp(C.cp.early); this.ultGain(5); });
    g.on('waveStart', ({ wave, plan }) => this.waveStart(wave, plan));
    g.on('waveClear', ({ flawless }) => this.waveClear(flawless));
  }
  gainXp(n) {
    this.xp += n;
    while (this.xp >= COMMANDER.xp.need(this.lv)) { this.xp -= COMMANDER.xp.need(this.lv); this.lv++; this.pending++; this.g.emit('cmdrLevel', { lv: this.lv }); }
  }
  waveStart(wave, plan) {
    const g = this.g;
    this.waveHand = 0;
    this.bounty = null; this.bountyDone = false; this.strikes = []; this.overT = this.shieldT = this.plunderT = 0;
    const air = !!plan?.groups?.some((x) => ENEMIES[x.type]?.air);
    if (this.perk('reserve')) this.gainCp(this.perk('reserve'));
    const ids = this.questPool(air);
    const id = ids[(wave * 7 + g.seed.length) % ids.length];
    this.quest = { id, ...QUESTS[id], prog: 0, done: false, failed: false };
    this.questAir = air;
    g.emit('quest', { quest: this.quest });
  }
  // The quests a wave may bring: flyers only when some fly, Mark hits only with Mark in the deck.
  questPool(air = true) { return Object.keys(QUESTS).filter((id) => (id !== 'flyers' || air) && (id !== 'marked' || this.deck.includes('mark'))); }
  // Swap this wave's quest for another, once per run.
  rerollQuest() {
    const Q = this.quest;
    if (!Q || Q.done || this.questRerolled || this.g.phase !== 'wave') return false;
    const ids = this.questPool(this.questAir ?? true).filter((id) => id !== Q.id);
    if (!ids.length) return false;
    const id = ids[this.g.rng.int(0, ids.length - 1)];
    this.quest = { id, ...QUESTS[id], prog: 0, done: false, failed: false };
    this.questRerolled = true;
    this.g.emit('quest', { quest: this.quest });
    return true;
  }
  questSet(v) { const Q = this.quest; if (!Q || Q.done || Q.failed) return; Q.prog = Math.max(Q.prog, v); if (Q.prog >= Q.goal) this.questDone(); }
  questTick(id) { if (this.quest && this.quest.id === id) this.questSet(this.quest.prog + 1); }
  questDone() {
    const g = this.g, Q = this.quest;
    Q.done = true; this.stats.quests++;
    const gold = g.addGold(30 + 6 * g.wave);
    this.gainCp(3); this.gainXp(COMMANDER.xp.quest);
    g.emit('questDone', { quest: Q, gold });
  }
  waveClear(flawless) {
    if (this.quest && this.quest.id === 'clean' && !this.quest.failed && !this.quest.done && flawless) this.questDone();
    if (this.quest && this.quest.id === 'nocmd' && !this.quest.failed && !this.quest.done && (this.waveHand || 0) >= (this.quest.hand || 3)) this.questDone();   // by hand: standing idle earns nothing
    if (flawless) this.ultGain(COMMANDER.ult.flawless);
    this.mark = null; this.frostShots = this.frostShots > 0 ? this.frostShots : 0;
    if (this.pending > 0 && !this.offer) this.offerPerks();
  }

  // ---------- perks ----------
  perkPool() { return PERK_IDS.filter((id) => this.perk(id) < PERKS[id].max && (!PERKS[id].needs || this.deck.includes(PERKS[id].needs))); }
  rerollCost() { return COMMANDER.reroll.gold + COMMANDER.reroll.perWave * this.g.wave; }
  // A fresh three, once per offer, for gold. Avoids the cards just shown when the pool is big enough.
  rerollPerks() {
    const g = this.g;
    if (!this.offer || this.rerolled || g.gold < this.rerollCost()) return false;
    const cost = this.rerollCost(), old = this.offer;
    let pool = this.perkPool().filter((id) => !old.includes(id));
    if (pool.length < 3) pool = this.perkPool();
    const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(g.rng.int(0, pool.length - 1), 1)[0]);
    g.gold -= cost; g.stats.goldSpent += cost;
    this.offer = out; this.rerolled = true;
    g.emit('perkOffer', { ids: out, reroll: true });
    return true;
  }
  offerPerks() {
    const g = this.g, pool = this.perkPool(), out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(g.rng.int(0, pool.length - 1), 1)[0]);
    this.offer = out.length ? out : null;
    if (this.offer) g.emit('perkOffer', { ids: this.offer });
    else this.pending = 0;
  }
  choosePerk(id) {
    if (!this.offer || !this.offer.includes(id)) return false;
    const g = this.g;
    this.perks[id] = this.perk(id) + 1; this.pending = Math.max(0, this.pending - 1); this.offer = null; this.rerolled = false; this.stats.perksTaken++;
    if (id === 'mason') { g.wall.maxHp *= 1.15; if (!g.noMend) g.wall.hp = g.wall.maxHp; }
    if (id === 'quiver') g.weapon.ammo = g.weaponStats().ammo;
    g.emit('perk', { id });
    if (this.pending > 0) this.offerPerks();
    return true;
  }
  setOrder(id) { if (!BUILD_ORDERS[id]) return false; this.order = id; this.g.emit('buildOrder', { id }); return true; }

  // ---------- saving ----------
  serialize() { return { qrr: !!this.questRerolled, doctrine: this.doctrine, deck: this.deck, order: this.order, cp: this.cp, ult: this.ult, lv: this.lv, xp: this.xp, perks: this.perks, pending: this.pending, offer: this.offer, stats: this.stats }; }
  load(s) {
    if (!s) return;
    this.cp = Math.min(this.cpMax(), s.cp ?? this.cp); this.ult = Math.min(COMMANDER.ult.need, s.ult || 0); this.lv = s.lv || 1; this.xp = s.xp || 0;
    this.perks = {}; for (const [id, n] of Object.entries(s.perks || {})) if (PERKS[id]) this.perks[id] = Math.min(PERKS[id].max, n | 0);
    this.cp = Math.min(this.cpMax(), this.cp);
    this.questRerolled = !!s.qrr;
    this.pending = s.pending || 0; this.offer = Array.isArray(s.offer) ? s.offer.filter((id) => PERKS[id]) : null; if (this.offer && !this.offer.length) this.offer = null;
    this.stats = { ...this.stats, ...(s.stats || {}) };
  }
  summary() { return { doctrine: this.doctrine, deck: this.deck, lv: this.lv, perks: { ...this.perks }, ...this.stats }; }
}

// ---------- v1.63 · helpers for the deck builder and the recap (pure) ----------
// What a command is worth per ⚡, in "weapon shots of damage" for the damaging ones, so the choice is not a guess.
export function commandValue(id) {
  const C = COMMANDS[id]; if (!C) return null;
  let shots = 0, how = '';
  if (id === 'volley') { shots = C.n * C.dmg; how = `${C.n} strikes of ${C.dmg}× a shot`; }
  else if (id === 'firebomb') { shots = C.dps * C.time; how = `${C.dps}× a shot a second for ${C.time}s`; }
  else if (id === 'pierce') { shots = C.mult; how = `${C.mult}× a shot, through every foe in line`; }
  const perCp = shots ? Math.round((shots / C.cost) * 10) / 10 : 0;
  return { id, cost: C.cost, cd: C.cd, perCp, per10s: Math.round((C.cd ? 10 / C.cd : 0) * 10) / 10, how, damaging: !!shots, line: shots ? `≈ ${perCp} shots of damage per ⚡ (${how}; ${C.cd}s recharge)` : `Utility: ⚡${C.cost}, ${C.cd}s recharge` };
}
// A sensible deck for each doctrine, with the reason in a line.
export const DECK_ADVICE = {
  marksman: { deck: ['pierce', 'mark', 'volley', 'shield'], why: 'Piercing Shot and Mark for Death turn your crits and headshots into boss killers; Volley clears the crowd and Shield Wall covers a slip.' },
  tactician: { deck: ['volley', 'overcharge', 'frost', 'muster'], why: 'You have ⚡ to spare and short recharges, so cast often: Volley and Frost Rounds to thin the road, Overcharge and Muster to lean on your towers.' },
  siegebreaker: { deck: ['firebomb', 'volley', 'mark', 'shield'], why: 'Your shots burst already, so stack area damage: Firebomb and Volley, Mark for Death on the toughest foe and Shield Wall for the heavy waves.' },
};
export function recommendDeck(doctrine) { const a = DECK_ADVICE[doctrine] || DECK_ADVICE.marksman; return { deck: cleanDeck(a.deck), why: a.why }; }
// One line of advice on a perk, from what you already carry (the perk card shows it).
export function perkTip(id, C) {
  const P = PERKS[id]; if (!P) return '';
  const have = C.perk(id);
  if (have >= P.max - 1 && P.max > 1) return 'Last stack: it will be maxed.';
  if (id === 'spotter') return 'Strong with Mark for Death.';
  if (id === 'reserve') return 'A command ready the moment a wave opens.';
  if (['rapid', 'quiver', 'steady'].includes(id)) return 'Helps if you run dry or miss the reload window.';
  if (['heavy', 'eagle', 'head', 'twin', 'spark'].includes(id)) return 'More damage from your own hand.';
  if (['battery', 'dynamo', 'orders', 'surge', 'fever'].includes(id)) return 'More commands and Ultimates sooner.';
  if (['bounty'].includes(id)) return 'More gold for your engineers.';
  if (id === 'mason') return 'Pick it when the wall keeps breaking.';
  return '';
}
// Summary: which commands you used, what they cost and the most used one; plus your reload and headshot rates.
export function commandTable(summary) {
  const used = summary?.used || {};
  const rows = Object.entries(used).filter(([id]) => COMMANDS[id]).map(([id, u]) => ({ id, name: COMMANDS[id].name, icon: COMMANDS[id].icon, n: u.n, cp: u.cp })).sort((a, b) => b.n - a.n);
  return { rows, top: rows[0] || null, totalCp: rows.reduce((a, r) => a + r.cp, 0) };
}
export function reloadRate(summary) { const n = (summary?.perfects || 0), j = (summary?.jams || 0); return n + j ? Math.round(100 * n / (n + j)) : null; }
// Saved decks: up to COMMANDER.decks, each a name, a doctrine and four commands. Saving under a name already used replaces it.
export function cleanDecks(list) {
  return (Array.isArray(list) ? list : []).filter((d) => d && typeof d.name === 'string' && d.name.trim()).slice(0, COMMANDER.decks)
    .map((d) => ({ name: d.name.trim().slice(0, 24), doctrine: DOCTRINES[d.doctrine] ? d.doctrine : 'marksman', deck: cleanDeck(d.deck) }));
}
export function addDeck(list, name, doctrine, deck) {
  const nm = String(name || '').trim().slice(0, 24) || 'Deck';
  const out = cleanDecks(list).filter((d) => d.name.toLowerCase() !== nm.toLowerCase());
  out.push({ name: nm, doctrine: DOCTRINES[doctrine] ? doctrine : 'marksman', deck: cleanDeck(deck) });
  return out.slice(-COMMANDER.decks);
}
