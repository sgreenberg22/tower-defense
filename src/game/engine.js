// Bastion Siege simulation. Pure logic: no DOM, no canvas. Presentation subscribes to events.
import { GAME, PLOTS, ABILITIES, TOWERS, TIER, ENEMIES, BOSSES, WEAPONS, ARMORY, BOONS, RARITY_WEIGHT, COMBO, WEAPON_SCALE_PER_WAVE, BREAKTHROUGH, WEATHER, GARRISON, VALOR, FLAG, ART_KEYS, ART_SLOTS, BIOMES, masteryMods, hardening, WEAPON_PERK_NODES } from '../data/balance.js';
import { Rng, seedFor } from '../core/rng.js';
import { towerHitSrc } from './counters.js';
import { planWave, biomeIndex, isBossWave } from './waves.js';
import * as eco from './economy.js';
import { buildMap, isBuildable, T, MUD_SLOW } from './maps.js';
import { headStartPackage } from './rules.js';
import { garrisonMethods } from './garrison.js';
import { marchSetup } from './realmmap.js';
import { ECON } from '../data/balance.js';
import { autoCommand } from './autobuild.js';
import { HERO, SIEGE, SIEGE_COST, siegeSetup, siegeScore, BOSSRUSH, bossRushFights, DRAFT, NIGHT, DUO, trialById, trialStars } from './modes.js';
import { sprintLevel, cleanSprintLevel, towerCapOf, GAUNTLET, LASTSTAND, SPRINT, ENDURANCE, isNewMode, gauntletStage, gauntletStart, gauntletMap, gauntletMapSeed, gauntletFights, lastStandWaves } from './modes.js';

const BOON_BY_ID = Object.fromEntries(BOONS.map((b) => [b.id, b]));
// Boons that only matter when gold does.
const GOLD_BOONS = new Set(['prospectors', 'interest', 'bloodlust', 'bounty', 'thrifty', 'taxman', 'golden', 'warfund', 'critgold']);
const BOON_REQUIRES = { cannon_splash: 'cannon', concussive: 'cannon', deepfreeze: 'frost', mage_chain: 'mage', frostbite: 'frost', pierce: 'ballista', taxman: 'mint', garrison: 'barracks', kindling: 'firetrap', pyro: 'firetrap' };
const DEFAULT_BONUS = {
  castleHpMult: 1, startGold: 0, killGold: 0, towerDiscount: 0, sellBonus: 0, weaponDmg: 0, reloadMult: 1,
  ammoAdd: 0, boonChoices: 0, secondWind: false, repairDiscount: 0, towerDmg: 0, rerolls: 0,
  unlockedTowers: null, // null = all unlocked (sim/tests)
  unlockedWeapons: null, // null = every weapon allowed (sim/tests)
  unlockedAbilities: null, // null = only the two base abilities
  wallHpMult: 1, castleDR: 0, wallRegen: 0, wallMend: 0, castleMend: 0, towerHpMult: 1,
  waveGold: 0, earlyCall: 0, interest: 0, lootBonus: 0, mintMult: 1, masteryDiscount: 0, claimDiscount: 0, startPlots: 0,
  weaponCrit: 0, headshotMult: 0, comboDecay: 1, chargeTime: 1, heroPierce: 0, heroGold: 0, armoryDiscount: 0,
  boonRarity: 1, startBoons: 0, secondWindHeal: 0.4,
  towerRange: 0, towerRate: 0, highDmg: 0, splashMult: 1, bossDmg: 0, armoredDmg: 0, airDmg: 0, towerTrain: {}, weaponPerks: {},
  quartermaster: 0, abilityCd: {}, abilityDmg: {}, abilityRadius: {}, abilityLv: {}, artSlots: ART_SLOTS.base, novaFreeze: 0, hornTime: 0,
  unlockedTroops: null, // null = every troop type unlocked (sim/tests)
  troopTrain: {},       // per-troop HP and damage bonus (Realm provinces)
  troopSlots: 0, trainSpeed: 0, troopDiscount: 0, musterMult: 0, troopHp: 0, troopDmg: 0, valorMult: 0, troopHeal: 0, troopSave: 0,
};

let UID = 1;
const FLASKS = ['fire', 'acid', 'frost'];
// A foe can only be held so long: soldiers and troops that could never kill it (high armour, tiny damage, endless respawns)
// used to pin it in place for good, with the wave unable to end. After HOLD.max seconds in one hold it shoves free and
// cannot be held again for HOLD.immune seconds; enraged foes (a wave that has dragged on) cannot be held at all.
export const HOLD = { max: 7, immune: 3, stunChain: 3 };
const MARCH_WEATHER = 6;   // TERRITORY.marchWeather (kept local so the engine has no cycle with realmmap)

export class Game {
  constructor(opts = {}) {
    this.opts = opts;
    this.seed = opts.seed || 'seed';
    this.mapId = opts.mapId || 'meadow';
    this.mode = opts.mode || 'normal';
    this.level = this.mode === 'sprint' ? cleanSprintLevel(opts.level ?? opts.save?.level) : null;   // Sprint difficulty
    this.sprintCfg = sprintLevel(this.level);
    this.hero = this.mode === 'hero' || !!(opts.hero ?? opts.save?.hero);   // Hero Mode: fought from the castle wall in first person
    this.auto = this.mode === 'hero';       // the commander raises and upgrades the towers (see autobuild.js)
    this.puzzle = this.mode === 'siege' || this.mode === 'trials';    // the Daily Siege and the Trials: a fixed supply of points, then waves you only watch
    this.trial = this.mode === 'trials' ? trialById(opts.trial ?? opts.save?.trial) : null;
    this.siegeCfg = this.trial ? { ...SIEGE, ...this.trial } : SIEGE;
    this.siege = this.trial ? { roster: this.trial.roster, map: this.trial.map, seed: this.seed } : this.puzzle ? siegeSetup(String(this.seed).replace(/^siege-/, '').slice(0, 10)) : null;
    this.points = this.puzzle ? this.siegeCfg.points : 0;
    this.bossRush = this.mode === 'bossrush';
    this.drafting = this.mode === 'draft';
    this.night = this.mode === 'night';
    this.duo = this.mode === 'duo';
    if (this.duo) this.hero = true;   // the hero half of a Duo fights from the wall
    this.draft = this.drafting ? { hand: {}, offer: null, picks: 0 } : null;
    this.autoT = 0;
    this.free = this.mode === 'laststand' || this.mode === 'endurance';   // no gold: towers, plots and troops are free and fully mastered
    this.special = isNewMode(this.mode);   // Gauntlet, Last Stand or Sprint (see src/game/modes.js)
    this.modifiers = opts.modifiers || [];
    this.mod = Object.fromEntries(this.modifiers.map((m) => [m, true]));
    if (this.mode === 'laststand' || this.puzzle) this.mod.norepair = true;
    if (this.night) this.mod.fog = true;   // the night hides what no light reaches (see isVisible and lights())   // no mending, no Mend art, no repair boons
    // Nothing mends a building in a stand but the mode's own rule: Last Stand has none, Endurance has its scheduled free repair.
    this.noMend = !!this.mod.norepair || this.mode === 'endurance';
    this.ascension = opts.ascension || 0;
    // A March on a frontier province: its land, its weather and its native foe (see src/game/realmmap.js).
    const mid = opts.march || opts.save?.march;
    const ms = mid ? marchSetup(mid) : null;
    this.march = ms ? { id: ms.province, name: ms.name, foe: ms.foe, biome: ms.biome } : null;
    // Last Stand and Endurance: no Keep, Realm or clan stat bonuses, but only what you have unlocked is on offer.
    // What your Keep has unlocked (towers, troops, arts, weapons, art slots) still applies; its stat bonuses do not.
    const ob = opts.bonus || {};
    const LOCKS = { unlockedTowers: ob.unlockedTowers, unlockedTroops: ob.unlockedTroops, unlockedAbilities: ob.unlockedAbilities, unlockedWeapons: ob.unlockedWeapons, artSlots: ob.artSlots };
    for (const k of Object.keys(LOCKS)) if (LOCKS[k] === undefined) delete LOCKS[k];
    this.bonus = { ...DEFAULT_BONUS, ...(this.puzzle ? {} : this.free ? LOCKS : ob) };   // the Daily Siege is the same puzzle for everyone
    this.portrait = !!opts.portrait;
    this.tutorial = !!opts.tutorial && !this.special;
    // Gauntlet plays a new map every stage; the stage follows the wave, so a saved run resumes on the right one.
    this.stage = 1; this.mapSeed = this.seed;
    if (this.mode === 'gauntlet') {
      this.stage = gauntletStage(opts.save ? opts.save.wave : GAUNTLET.firstWave);
      this.mapId = gauntletMap(this.stage);
      this.mapSeed = gauntletMapSeed(this.seed, this.stage);
    }
    this.started = false;   // the first wave has been called (Last Stand locks the build once it has)
    this.clock = 0;         // seconds on the clock: wave time at game speed plus the real-time breaks (see tickBuild)
    this.victory = false;
    this.map = buildMap(this.mapId, this.mapSeed, this.portrait);
    this.listeners = {};
    this.rng = new Rng(seedFor(this.seed, 'combat'));

    this.vanguard = !!(opts.vanguard ?? opts.save?.vanguard);        // began at or above the player's adaptive wave
    this.start = this.special ? 1 : Math.max(1, Math.floor(opts.startWave || 1));   // difficulty: the wave this run begins on
    this.wave = this.start;
    if (this.mode === 'gauntlet') this.wave = GAUNTLET.firstWave;
    if (this.mode === 'laststand') this.wave = LASTSTAND.startWave;
    if (this.puzzle) this.wave = this.start = this.siegeCfg.start;
    if (this.bossRush) this.wave = this.start = BOSSRUSH.firstWave;
    this.pickQueue = 0;                                          // free boon picks still waiting (head start)
    this.phase = 'build';
    this.buildTimer = Infinity;
    this.gold = GAME.startGold + this.bonus.startGold;
    this.foeAdapt = this.metaPower();
    this.score = 0;
    const hpMult = this.bonus.castleHpMult * (this.mod.glass ? 0.5 : 1);
    this.castle = { hp: GAME.castleHp * hpMult, maxHp: GAME.castleHp * hpMult };
    this.wall = { hp: GAME.wallHp * hpMult * this.bonus.wallHpMult, maxHp: GAME.wallHp * hpMult * this.bonus.wallHpMult };
    this.towers = [];
    this.claimed = new Set(this.free || this.puzzle ? this.map.plots.map((p) => p.k) : this.map.startPlots);   // plot keys you may build on
    this.claims = 0;                                // ruins claimed this run (drives the price)
    // Loadout: the castle arts you carry this run, in slot order (slot n answers to ART_KEYS[n]).
    const slots = Math.max(1, Math.min(ART_SLOTS.max, this.bonus.artSlots || ART_SLOTS.base));
    const want = (opts.save && opts.save.loadout) || opts.loadout || Object.keys(ABILITIES);
    let load = [...new Set(want)].filter((id) => this.abilityKnown(id)).slice(0, slots);
    if (!load.length) load = Object.keys(ABILITIES).filter((id) => this.abilityKnown(id)).slice(0, slots);
    this.loadout = load;
    this.abilities = Object.fromEntries(load.map((id) => [id, { cd: 0, max: 0 }]));
    this.hornT = 0; this.titheT = 0; this.aegisT = 0; this.focusT = 0; this.stormT = 0; this.stormGap = 0; this.stasisT = 0; this.hymnT = 0; this.callerT = 0;
    this.zones = [];
    this.volleys = [];
    this.enemies = [];
    this.projectiles = [];
    this.fields = [];          // burning ground
    this.spawnQueue = [];
    this.waveTotal = 0;
    this.waveClock = 0;
    this.plan = null;
    this.waveLeaks = 0;
    this.boons = {};
    this.boonOffer = null;
    this.rerolls = this.bonus.rerolls;
    this.secondWind = !!this.bonus.secondWind;
    this.repairKits = 0;
    this.streamT = Infinity; this.bossDown = false;
    this.hazard = { t: 0, active: 0, kind: null };
    this.time = 0;
    this.combo = 0; this.comboT = 0;
    const wid = opts.weapon && WEAPONS[opts.weapon] && (!this.bonus.unlockedWeapons || !WEAPONS[opts.weapon].keep || this.bonus.unlockedWeapons.has(opts.weapon)) ? opts.weapon : 'longbow';
    this.weapon = { id: wid, lv: this.free ? { ...ENDURANCE.weaponLv } : { dmg: 0, reload: 0, ammo: 0, crit: 0 }, ammo: 0, reloadT: 0 };
    // Free modes hand out everything at its best: all four Mastery perks for the chosen weapon and every castle art at full power.
    if (this.free) {
      const perks = {};
      for (const n of WEAPON_PERK_NODES) if (n.weaponPerk === wid) for (const [f, v] of Object.entries(n.fx)) perks[f] = (perks[f] || 0) + v;
      this.bonus.weaponPerks = { [wid]: perks };
      this.bonus.abilityLv = Object.fromEntries(Object.keys(ABILITIES).map((id) => [id, 3]));
    }
    this.weapon.ammo = this.weaponStats().ammo;
    this.stats = {
      kills: 0, heroKills: 0, shots: 0, hits: 0, headshots: 0, killsByType: {}, killsByTower: {}, dmgByTower: {}, builtByTower: {}, artUses: {}, heroDmg: 0, maxMastery: 0,
      goldEarned: 0, goldSpent: 0, leaks: 0, towersBuilt: 0, bossKills: 0, flawless: 0, flawlessStreak: 0, maxFlawlessStreak: 0,
      maxCombo: 0, peakGold: this.gold, specs: [], mintGold: 0, maxTowers: 0, bossDmg: 0, repairs: 0, earlyCalls: 0,
      boonsTaken: 0, time: 0, wavesCleared: 0, gems: 0,
      troopKills: 0, troopDmg: 0, troopsTrained: 0, troopsLost: 0, valorEarned: 0, maxTroopRank: 0, musterRecruits: 0,
    };
    this.over = false;
    this.initGarrison();
    if (opts.reinforcements) this.applyReinforcements(opts.reinforcements);
    if (this.free || this.puzzle) this.gold = 0;
    if (opts.save) this.load(opts.save);
    else if (!this.puzzle) this.applyRunStart();
    if (!opts.save && !this.puzzle && Array.isArray(opts.squad)) this.musterSquad(opts.squad);
    if (this.bossRush && !opts.save) this.gold += BOSSRUSH.startGold;
    if (this.drafting && !opts.save) { for (const id of this.draftPool().slice(0, DRAFT.startCards)) this.draft.hand[id] = (this.draft.hand[id] || 0) + 1; this.offerDraft(); }
    if (this.auto && !opts.save) { this.buildTimer = HERO.firstBreak; autoCommand(this); }
    this.refreshTowers();
    this.nextPlan = planWave(this.wave, this.seed, this.waveOpts());
    this.refreshGarrison();
  }

  // ---------- events ----------
  on(type, fn) { (this.listeners[type] ||= []).push(fn); return () => this.off(type, fn); }
  off(type, fn) { const l = this.listeners[type]; if (l) this.listeners[type] = l.filter((f) => f !== fn); }
  emit(type, data) { const l = this.listeners[type]; if (l) for (const f of l) f(data); const a = this.listeners['*']; if (a) for (const f of a) f(type, data); }

  // Everything a fresh run begins with beyond the basics: Keep plots and blessings, plus the head start
  // for runs that begin above wave 1 (a share of the skipped waves' gold, open plots and free boons).
  applyRunStart() {
    const pack = headStartPackage(this.start, this.seed, this.waveOpts(), this.bonus.killGold);
    if (this.start > 1) this.tutorial = false;
    if (this.mode === 'sprint') this.gold += this.sprintCfg.startGold;
    this.gold += pack.gold;
    this.stats.peakGold = Math.max(this.stats.peakGold, this.gold);
    const ruins = this.map.plots.filter((p) => !this.claimed.has(p.k));
    for (const p of ruins.slice(0, pack.plots + this.bonus.startPlots)) this.claimed.add(p.k);
    const picks = pack.boons + (this.tutorial ? 0 : this.bonus.startBoons);
    if (picks > 0) { this.pickQueue = picks - 1; this.offerBoons(); }
  }

  waveOpts() { return { ascension: this.ascension, swarm: this.mod.swarm, double: this.mod.double, ...(this.bossRush ? { countScale: BOSSRUSH.escort } : {}), ...(this.mode === 'sprint' ? { hpScale: this.sprintCfg.hpScale, countScale: this.sprintCfg.countScale, gapScale: this.sprintCfg.gapScale } : {}), ...(this.march ? { marchFoe: this.march.foe } : {}), ...(this.opts.scout ? { scout: this.opts.scout } : {}) }; }
  // How strong your Keep upgrades make you, relative to a fresh keep (1). Foes toughen by power^adapt, so the early
  // and middle waves keep their bite however much you have unlocked, while the upgrades still help.
  metaPower() {
    const b = this.bonus;
    const p = (1 + b.towerDmg) * (1 / Math.max(0.5, b.reloadMult || 1)) * (1 + 0.5 * b.weaponDmg) * (1 + 0.5 * ((b.castleHpMult || 1) - 1)) * (1 + 0.5 * b.killGold) / (1 - Math.min(0.5, b.towerDiscount || 0));
    return Math.min(GAME.adaptCap, Math.max(1, Math.pow(p, GAME.adapt)));
  }
  boon(id) { return this.boons[id] || 0; }
  get biome() { return BIOMES[this.biomeIdx()]; }
  biomeIdx() { if (this.march) { const i = BIOMES.findIndex((b) => b.id === this.march.biome); if (i >= 0) return i; } return biomeIndex(this.wave); }
  goldMult() { return this.mod.goldrush ? 1.5 : 1; }

  addGold(g, track = true) {
    if (this.puzzle) return 0;   // nothing to buy in a siege
    g = Math.round(g * this.goldMult());
    this.gold += g;
    if (track) this.stats.goldEarned += g;
    if (this.gold > this.stats.peakGold) this.stats.peakGold = this.gold;
    return g;
  }
  spend(g) { this.gold -= g; this.stats.goldSpent += g; }

  // ---------- towers ----------
  towerAt(x, y) { return this.towers.find((t) => t.x === x && t.y === y); }
  // Which tower does a tap at this world point mean? Tower sprites stand taller than their tile (a War Banner's flag
  // sits almost entirely in the tile above), so a tap on the top of a tower counts for it, unless the tile you
  // tapped holds a tower of its own.
  towerAtPoint(wx, wy, reach = 0.4) {
    const x = Math.floor(wx), y = Math.floor(wy);
    const here = this.towerAt(x, y);
    if (here) return here;
    const below = this.towerAt(x, y + 1);
    if (below && !TOWERS[below.type].trap && y + 1 - wy <= reach && Math.abs(wx - below.cx) <= 0.45) return below;
    return null;
  }
  // The wave that gates what is open to build and train. Last Stand opens everything; a Gauntlet stage opens a few waves ahead.
  unlockLevel() {
    if (this.free) return Infinity;
    if (this.mode === 'gauntlet') return Math.max(this.wave, gauntletStart(this.stage) + GAUNTLET.unlockLead);
    return this.wave;
  }
  // Last Stand's set-up, before the first wave: towers, specs and troops cost nothing.
  // Last Stand and Endurance: free until the first wave is called.
  freeSetup() { return this.free && !this.started && !this.over; }
  // Once the first wave is called (the stand, or the endless stream) nothing may be built, changed or sold any more.
  locked() { return (this.free || this.puzzle) && this.started; }
  siegeCost(id) { return SIEGE_COST[id] ?? 99; }
  isTowerUnlocked(id) {
    const def = TOWERS[id];
    if (!def) return false;
    if (this.puzzle) return this.siege.roster.includes(id);
    if (this.bonus.unlockedTowers && !this.bonus.unlockedTowers.has(id)) return false;
    return this.unlockLevel() >= def.unlockWave;
  }
  discount() { return Math.min(0.5, this.bonus.towerDiscount + 0.08 * this.boon('thrifty')); }
  buildCost(id) { if (this.freeSetup() || this.puzzle || this.drafting) return 0; return eco.towerCost(id, { discount: this.discount(), owned: this.towers.filter((t) => t.type === id && !t.ally).length }); }

  // ---------- plots ----------
  plotKey(x, y) { return y * this.map.cols + x; }
  isPlot(x, y) { return this.map.plotSet.has(this.plotKey(x, y)); }
  plotOpen(x, y) { return this.claimed.has(this.plotKey(x, y)); }
  isRuin(x, y) { return this.isPlot(x, y) && !this.plotOpen(x, y); }
  claimCost() { if (this.free) return Infinity; return Math.round((PLOTS.claimBase + PLOTS.claimStep * this.claims) * (1 + PLOTS.claimPerWave * (this.wave - 1)) * (1 - this.discount() * 0.5) * (1 - this.bonus.claimDiscount) * (1 - 0.2 * this.boon('prospectors'))); }
  canClaim(x, y) { return !this.over && this.isRuin(x, y) && !this.towerAt(x, y) && this.gold >= this.claimCost(); }
  claimPlot(x, y) {
    if (!this.canClaim(x, y)) return false;
    const c = this.claimCost();
    this.spend(c);
    this.claimed.add(this.plotKey(x, y));
    this.claims++;
    this.emit('claim', { x, y, cost: c });
    return true;
  }
  openPlots() { return this.map.plots.filter((p) => this.claimed.has(p.k)); }
  freePlots() { return this.openPlots().filter((p) => !this.towerAt(p.x, p.y)); }
  // ---------- castle abilities ----------
  abilityKnown(id) {
    const A = ABILITIES[id];
    if (id === 'mend' && this.noMend) return false;
    return !!A && (!A.keep || !!this.bonus.unlockedAbilities?.has(id));
  }
  // Quartermaster (Keep): between waves, change your weapon and castle arts. Armory levels stay with you; arts you bring in must recharge.
  canSwapKit() { return this.bonus.quartermaster > 0 && this.phase === 'build' && !this.over && !this.free && !this.puzzle; }
  swapKit({ weapon, loadout }) {
    if (!this.canSwapKit()) return false;
    const slots = Math.max(1, Math.min(ART_SLOTS.max, this.bonus.artSlots || ART_SLOTS.base));
    const load = [...new Set(loadout || this.loadout)].filter((id) => this.abilityKnown(id)).slice(0, slots);
    if (!load.length) return false;
    if (weapon && weapon !== this.weapon.id && WEAPONS[weapon] && (!this.bonus.unlockedWeapons || !WEAPONS[weapon].keep || this.bonus.unlockedWeapons.has(weapon))) {
      this.weapon.id = weapon; this.weapon.ammo = this.weaponStats().ammo; this.weapon.reloadT = 0;
    }
    const was = this.abilities;
    this.abilities = {};
    for (const id of load) {
      if (was[id]) { this.abilities[id] = was[id]; continue; }
      const cd = ABILITIES[id].cd * (this.bonus.abilityCd[id] || 1) * Math.pow(0.9, this.boon('artificer')) * (this.bonus.quartermaster >= 2 ? 0.5 : 1);
      this.abilities[id] = { cd, max: cd };
    }
    this.loadout = load;
    this.emit('kitSwap', {});
    return true;
  }
  abilityKey(id) { return ART_KEYS[this.loadout.indexOf(id)] || ''; }
  abilityLv(id) { return this.bonus.abilityLv?.[id] || 0; }
  // What the ability's third Keep upgrade adds, for the stat it improves.
  abilityUp(id, stat) { const u = ABILITIES[id].up; return u && u.stat === stat ? u.per * this.abilityLv(id) : 0; }
  abilityRadius(id) { const A = ABILITIES[id]; return A.radius ? A.radius * (this.bonus.abilityRadius[id] || 1) * (1 + this.abilityUp(id, 'rad')) : 0; }
  abilityDuration(id) { return ABILITIES[id].duration + this.abilityUp(id, 'dur'); }
  abilityReady(id) { return this.phase === 'wave' && !this.over && this.abilities[id] && this.abilities[id].cd <= 0; }
  abilityPower(id, frac = ABILITIES[id].dmg) { return ENEMIES.grunt.hp * (this.plan ? this.plan.hp : 1) * frac * (1 + 0.1 * this.boon('overclock')) * (1 + 0.1 * this.boon('artificer')) * (this.bonus.abilityDmg[id] || 1) * (1 + this.abilityUp(id, 'dmg')); }
  // Seconds of an active effect left, as a fraction of its full length (0 when idle).
  abilityActive(id) {
    const t = { horn: this.hornT, tithe: this.titheT, aegis: this.aegisT, focus: this.focusT, storm: this.stormT, stasis: this.stasisT, hymn: this.hymnT }[id];
    return t > 0 ? Math.min(1, t / this.abilityDuration(id)) : 0;
  }
  useAbility(id, x, y) {
    if (this.puzzle || !this.abilityReady(id)) return false;
    const A = ABILITIES[id];
    const cd = A.cd * (this.bonus.abilityCd[id] || 1) * Math.pow(0.9, this.boon('artificer'));
    // Echoing Arts: one cast in four comes straight back
    const echo = this.boon('echo') > 0 && this.rng.next() < 0.25;
    this.abilities[id].cd = echo ? 0 : cd; this.abilities[id].max = cd;
    if (echo) this.emit('artEcho', { id });
    this.stats.abilities = (this.stats.abilities || 0) + 1;
    this.stats.artUses[id] = (this.stats.artUses[id] || 0) + 1;
    const info = {};
    if (id === 'volley') {
      for (let i = 0; i < A.hits; i++) this.volleys.push({ x, y, t: i * A.gap, r: this.abilityRadius(id), dmg: this.abilityPower(id) });
    } else if (id === 'oil') {
      x = this.map.castle.x; y = this.map.castle.y;
      const dmg = this.abilityPower(id);
      for (const e of this.enemies) {
        if (e.dead || e.air || Math.hypot(e.x - x, e.y - y) > this.abilityRadius(id)) continue;
        e.slow = Math.max(e.slow, A.slow); e.slowT = Math.max(e.slowT, A.slowTime);
        e.burnT = Math.max(e.burnT, A.burnTime); e.burn = Math.max(e.burn, dmg * A.burn);
        this.damage(e, dmg, 'fire', null);
      }
    }
    else if (id === 'nova') {
      x = this.map.castle.x; y = this.map.castle.y;
      const dmg = this.abilityPower(id);
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.slow = Math.max(e.slow, A.slow); e.slowT = Math.max(e.slowT, A.slowTime);
        if (!e.air) this.stun(e, A.freeze + this.bonus.novaFreeze);
        this.damage(e, dmg, 'magic', null);
      }
    } else if (id === 'horn') {
      this.hornT = A.duration + this.bonus.hornTime;
    } else if (id === 'grapeshot') {
      const o = this.heroOrigin(), ang = Math.atan2(y - o.y, x - o.x), dmg = this.abilityPower(id);
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - o.x, e.y - o.y);
        if (d > A.range) continue;
        const da = Math.atan2(Math.sin(Math.atan2(e.y - o.y, e.x - o.x) - ang), Math.cos(Math.atan2(e.y - o.y, e.x - o.x) - ang));
        if (Math.abs(da) <= A.arc || d < 0.8) this.damage(e, dmg, 'physical', null);
      }
      Object.assign(info, { ox: o.x, oy: o.y, ang, arc: A.arc, range: A.range });
    } else if (id === 'smite') {
      const dmg = this.abilityPower(id);
      const foes = this.enemies.filter((e) => !e.dead).sort((a, b) => b.hp - a.hp).slice(0, A.targets);
      for (const e of foes) { const ex = e.x, ey = e.y; this.damage(e, dmg, 'magic', null, { bossMult: A.bossMult, pierceMr: true }); this.emit('smiteHit', { x: ex, y: ey, big: true }); }
    } else if (id === 'meteor') {
      this.volleys.push({ x, y, t: A.delay, warn: A.delay, r: this.abilityRadius(id), dmg: this.abilityPower(id), type: 'fire', ground: true, burn: A.burn, burnTime: A.burnTime, stun: A.stun, meteor: true });
    } else if (id === 'caltrops' || id === 'plague') {
      const dur = this.abilityDuration(id);
      this.zones.push({ kind: id, x, y, r: this.abilityRadius(id), t: dur, max: dur, dps: this.abilityPower(id, A.dps), slow: A.slow || 0, vuln: A.vuln || 0, air: id === 'plague' });
    } else if (id === 'mend') {
      const amt = 1 + this.abilityUp(id, 'amt');
      this.wall.hp = Math.min(this.wall.maxHp, this.wall.hp + this.wall.maxHp * A.wall * amt);
      let revived = false;
      for (const t of this.towers) {
        if (t.ruined) { if (!TOWERS[t.type].trap) { t.ruined = false; t.hp = t.maxHp * A.revive; revived = true; } continue; }
        t.hp = Math.min(t.maxHp, t.hp + t.maxHp * A.tower * amt);
      }
      if (revived) this.refreshTowers();
    } else if (id === 'tithe') {
      this.titheT = this.abilityDuration(id);
    } else if (id === 'aegis') {
      this.aegisT = this.abilityDuration(id);
    } else if (id === 'focus') {
      this.focusT = this.abilityDuration(id);
      this.weapon.ammo = this.weaponStats().ammo; this.weapon.reloadT = 0;
    } else if (id === 'storm') {
      this.stormT = this.abilityDuration(id); this.stormGap = 0;
    } else if (id === 'stasis') {
      this.stasisT = this.abilityDuration(id);
    } else if (id === 'hymn') {
      this.hymnT = this.abilityDuration(id);
    } else if (id === 'skychains') {
      const dmg = this.abilityPower(id), dur = this.abilityDuration(id), hit = [];
      for (const e of this.enemies) {
        if (e.dead || !e.air) continue;
        hit.push({ x: e.x, y: e.y });
        this.damage(e, dmg, 'magic', null, { pierceMr: true });
        if (!e.dead && !e.boss) { e.air = false; e.wasAir = true; e.groundT = Math.max(e.groundT || 0, dur); this.emit('grounded', { enemy: e }); }
      }
      info.hits = hit;
    } else if (id === 'gale') {
      const r = this.abilityRadius(id), dmg = this.abilityPower(id);
      for (const e of this.enemies) {
        if (e.dead || e.def.structure || Math.hypot(e.x - x, e.y - y) > r) continue;
        this.damage(e, dmg, 'physical', null);
        if (!e.dead) this.pull(e, A.push * (e.boss ? 0.5 : 1));
      }
    } else if (id === 'inferno') {
      const dur = this.abilityDuration(id);
      this.zones.push({ kind: id, x, y, r: this.abilityRadius(id), t: dur, max: dur, dps: this.abilityPower(id, A.dps), burn: this.abilityPower(id, A.burn), fire: true, air: false });
    } else if (id === 'barrage') {
      const r = this.abilityRadius(id), dmg = this.abilityPower(id);
      for (let i = 0; i < A.shells; i++) {
        const a = this.rng.next() * Math.PI * 2, d = Math.sqrt(this.rng.next()) * r * 0.85, t = 0.35 + (i / A.shells) * A.spread;
        this.volleys.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, t, warn: t, r: A.splash, dmg, ground: true, shell: true });
      }
    } else if (id === 'quake') {
      const r = this.abilityRadius(id), dmg = this.abilityPower(id);
      for (const e of this.enemies) {
        if (e.dead || e.air || Math.hypot(e.x - x, e.y - y) > r) continue;
        if (e.burrowT > 0) { e.burrowT = 0; this.emit('surfaced', { enemy: e }); }
        this.damage(e, e.def.structure ? e.maxHp : dmg, 'physical', null, { splash: true });
        if (!e.dead) this.stun(e, A.stun);
      }
    }
    this.emit('ability', { id, x, y, r: id === 'nova' ? 14 : this.abilityRadius(id) || 0, ...info });
    return true;
  }
  updateAbilities(dt) {
    for (const a of Object.values(this.abilities)) if (a.cd > 0) a.cd = Math.max(0, a.cd - dt);
    for (const k of ['hornT', 'titheT', 'aegisT', 'focusT', 'stasisT', 'hymnT']) if (this[k] > 0) this[k] = Math.max(0, this[k] - dt);
    if (this.stormT > 0) {
      this.stormT = Math.max(0, this.stormT - dt);
      this.stormGap -= dt;
      while (this.stormGap <= 0) {
        this.stormGap += ABILITIES.storm.gap;
        const live = this.enemies.filter((e) => !e.dead);
        if (!live.length) break;
        const e = this.rng.pick(live), ex = e.x, ey = e.y;
        this.damage(e, this.abilityPower('storm'), 'magic', null, { pierceMr: true });
        this.emit('smiteHit', { x: ex, y: ey });
      }
    }
    // Stormcaller (boon): every 10 seconds of a wave, a bolt finds the toughest foe
    if (this.boon('stormcaller') && this.phase === 'wave') {
      this.callerT += dt;
      if (this.callerT >= 10) {
        this.callerT = 0;
        const e = this.enemies.filter((q) => !q.dead && !q.def.structure).sort((a, b) => b.hp - a.hp)[0];
        if (e) { const ex = e.x, ey = e.y; this.damage(e, ENEMIES.grunt.hp * (this.plan ? this.plan.hp : 1) * 2.5, 'magic', null, { pierceMr: true, bossMult: 1.5 }); this.emit('smiteHit', { x: ex, y: ey, big: true }); }
      }
    }
    for (const v of this.volleys) {
      v.t -= dt;
      if (v.t > 0) continue;
      v.done = true;
      for (const e of this.enemies) {
        if (e.dead || (v.ground && e.air) || Math.hypot(e.x - v.x, e.y - v.y) > v.r) continue;
        this.damage(e, v.dmg, v.type || 'physical', null);
        if (e.dead) continue;
        if (v.burn) { e.burnT = Math.max(e.burnT, v.burnTime); e.burn = Math.max(e.burn, v.dmg * v.burn); }
        if (v.stun) this.stun(e, v.stun);
      }
      this.emit('volleyHit', { x: v.x, y: v.y, r: v.r, meteor: !!v.meteor, shell: !!v.shell });
    }
    this.volleys = this.volleys.filter((v) => !v.done);
    this.updateZones(dt);
  }
  updateZones(dt) {
    for (const z of this.zones) {
      z.t -= dt;
      for (const e of this.enemies) {
        if (e.dead || (e.air && !z.air) || Math.hypot(e.x - z.x, e.y - z.y) > z.r) continue;
        if (z.slow) { e.slow = Math.max(e.slow, z.slow); e.slowT = Math.max(e.slowT, 0.35); }
        if (z.vuln) { e.zv = Math.max(e.zv || 0, z.vuln); e.zvT = 0.35; }
        if (z.burn) { e.burnT = Math.max(e.burnT, 2); e.burn = Math.max(e.burn, z.burn); }
        this.damage(e, z.dps * dt, z.kind === 'plague' ? 'magic' : z.fire ? 'fire' : 'physical', null, { dot: true, pierceMr: true });
      }
    }
    this.zones = this.zones.filter((z) => z.t > 0);
  }

  // Special modes cap each tower type (see TOWER_CAP in modes.js); the endless run is limited by rising prices instead.
  // Road traps also share the board-wide trap limit (PLOTS.trapCap), so the build bar never shows a bigger number than can be placed.
  towerCap(id) { const mode = this.special ? towerCapOf(id) : Infinity; return TOWERS[id]?.trap ? Math.min(mode, PLOTS.trapCap) : mode; }
  towersOf(id) { return this.towers.filter((t) => t.type === id && !t.ally).length; }
  towerCapReached(id) { return this.towersOf(id) >= this.towerCap(id); }
  trapCount() { return this.towers.filter((t) => TOWERS[t.type].trap).length; }

  canBuild(id, x, y) {
    const def = TOWERS[id];
    if (!def || !this.isTowerUnlocked(id) || this.over || this.locked()) return false;
    if (!isBuildable(this.map, x, y, !!def.trap)) return false;
    if (def.trap ? this.trapCount() >= PLOTS.trapCap : !this.plotOpen(x, y)) return false;
    if (this.towerAt(x, y)) return false;
    if (this.towerCapReached(id)) return false;
    if (this.puzzle) return this.points >= this.siegeCost(id);
    if (this.drafting) return (this.draft.hand[id] || 0) > 0;
    return this.gold >= this.buildCost(id);
  }

  build(id, x, y) {
    if (!this.canBuild(id, x, y)) return null;
    const cost = this.buildCost(id);
    this.spend(cost);
    // Last Stand towers arrive at tier 5 with full mastery and their first specialization (change it while setting up).
    const free = this.freeSetup();
    if (this.drafting) { this.draft.hand[id]--; if (this.draft.hand[id] <= 0) delete this.draft.hand[id]; }
    const t = this.makeTower(id, x, y, free ? TIER.max : this.puzzle ? this.siegeCfg.tier : 1);
    if (this.puzzle) { this.points -= this.siegeCost(id); t.pts = this.siegeCost(id); this.applyTierHp(t); t.hp = t.maxHp; }
    if (free) {
      t.mastery = LASTSTAND.mastery;
      const first = Object.keys(TOWERS[id].specs || {})[0];
      if (first) { t.spec = first; if (TOWERS[id].specs[first].target) t.targetMode = TOWERS[id].specs[first].target; if (!this.stats.specs.includes(id + ':' + first)) this.stats.specs.push(id + ':' + first); }
      this.stats.maxMastery = Math.max(this.stats.maxMastery || 0, t.mastery);
      this.applyTierHp(t); t.hp = t.maxHp;
    }
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
      hp: def.hp * this.bonus.towerHpMult, maxHp: def.hp * this.bonus.towerHpMult, cd: 0.3, targetMode: def.target || 'first', disabledT: 0, ruined: false,
      fresh: this.phase === 'build', kills: 0, dmg: 0, aim: 0, recoil: 0,
      high: this.map.tileAt(x, y) === T.HIGH, rally: this.map.rally.has(y * this.map.cols + x),
      beam: null, soldiers: [], ally: null, allyWaves: 0, mastery: 0,
    };
    if (id === 'barracks') t.rallyPt = this.findRallyPoint(t);
    return t;
  }

  // Let the player choose where a barracks holds the line: any road tile within its reach.
  canMoveRally(t, x, y) {
    if (!t || t.type !== 'barracks' || t.ruined || this.over) return false;
    if (this.map.tileAt(x, y) !== T.PATH) return false;
    return Math.hypot(x + 0.5 - t.cx, y + 0.5 - t.cy) <= (t.stats?.range || TOWERS.barracks.range) + 0.01;
  }
  moveRally(t, x, y) {
    if (!this.canMoveRally(t, x, y)) return false;
    t.rallyPt = { x: x + 0.5, y: y + 0.5 };
    for (const so of t.soldiers) { if (so.target) { if (so.target.blocker === so) so.target.blocker = null; so.target = null; } }
    this.emit('rallyMoved', { tower: t });
    return true;
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
    if (t.tier >= TIER.max) return eco.masteryCost(t.type, t.mastery, Math.min(0.6, this.discount() + this.bonus.masteryDiscount));
    return eco.upgradeCost(t.type, t.tier, this.discount());
  }
  canUpgrade(t) { return !this.free && (t.tier < TIER.max - 1 || t.tier === TIER.max) && this.gold >= this.upgradeCost(t) && !t.ally; }
  upgrade(t) {
    if (!this.canUpgrade(t)) return false;
    const c = this.upgradeCost(t);
    this.spend(c); t.invested += c;
    if (t.tier >= TIER.max) {
      t.mastery++; this.stats.maxMastery = Math.max(this.stats.maxMastery || 0, t.mastery);
      if (TIER.harden.stars.includes(t.mastery)) {   // a hardening milestone: the bigger frame arrives fully healed
        const before = t.maxHp; this.applyTierHp(t); t.hp = Math.min(t.maxHp, t.hp + (t.maxHp - before)); this.emit('harden', { tower: t });
      }
    }
    else { t.tier++; this.applyTierHp(t); }
    this.refreshTowers();
    this.emit('upgrade', { tower: t, mastery: t.tier >= TIER.max ? t.mastery : 0 });
    return true;
  }
  canSpec(t) { return t.tier === TIER.max - 1 && !this.locked() && this.gold >= this.upgradeCost(t) && !t.ally; }
  chooseSpec(t, specId) {
    if (!this.canSpec(t) || !TOWERS[t.type].specs[specId]) return false;
    const c = this.upgradeCost(t);
    this.spend(c); t.invested += c; t.tier = TIER.max; t.spec = specId;
    // A specialization may suggest its own targeting (Sharpshooter: strongest). The player can still change it.
    if (TOWERS[t.type].specs[specId].target) t.targetMode = TOWERS[t.type].specs[specId].target;
    this.applyTierHp(t);
    if (!this.stats.specs.includes(t.type + ':' + specId)) this.stats.specs.push(t.type + ':' + specId);
    this.refreshTowers();
    this.emit('upgrade', { tower: t, spec: specId });
    return true;
  }
  // Last Stand set-up: swap a tower's specialization for free.
  setSpec(t, specId) {
    if (!this.freeSetup() || t.tier !== TIER.max || t.ally || !TOWERS[t.type].specs?.[specId]) return false;
    t.spec = specId;
    if (TOWERS[t.type].specs[specId].target) t.targetMode = TOWERS[t.type].specs[specId].target;
    if (!this.stats.specs.includes(t.type + ':' + specId)) this.stats.specs.push(t.type + ':' + specId);
    this.refreshTowers();
    this.emit('upgrade', { tower: t, spec: specId });
    return true;
  }
  applyTierHp(t) {
    const base = TOWERS[t.type].hp * this.bonus.towerHpMult;
    const frac = t.hp / t.maxHp;
    t.maxHp = base * TIER.hp[t.tier - 1] * hardening(t.mastery || 0).hp;
    t.hp = t.maxHp * frac;
  }
  sellValue(t) { return t.ally ? 0 : eco.sellValue(t.invested, t.fresh && this.phase === 'build', this.bonus.sellBonus); }
  sell(t) {
    if (t.ally || this.locked()) return false;
    const v = this.puzzle ? 0 : this.sellValue(t);
    this.gold += v;
    if (this.puzzle) this.points += t.pts || this.siegeCost(t.type);
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
  canUseHero() { return !this.puzzle; }
  wallRepairCost() { return eco.wallRepairCost(this.wall.maxHp - this.wall.hp, this.wave, this.repairDiscount()); }
  castleRepairCost() { return eco.castleRepairCost(this.castle.maxHp - this.castle.hp, this.wave, this.repairDiscount()); }
  towerRepairCost(t) { return t.ally ? 0 : eco.towerRepairCost(t.invested, 1 - t.hp / t.maxHp, this.repairDiscount()); }
  repairWall(partial = true) {
    if (!this.canRepair() || this.wall.hp >= this.wall.maxHp) return false;
    let missing = this.wall.maxHp - this.wall.hp;
    let cost = this.wallRepairCost();
    if (cost > this.gold) { if (!partial) return false; missing = this.affordableHp(eco.wallRepairCost, missing); cost = eco.wallRepairCost(missing, this.wave, this.repairDiscount()); }
    if (missing <= 0) return false;
    this.spend(cost); this.wall.hp = Math.min(this.wall.maxHp, this.wall.hp + missing);
    this.stats.repairs++;
    this.emit('repair', { what: 'wall' });
    return true;
  }
  repairCastle(partial = true) {
    if (!this.canRepair() || this.castle.hp >= this.castle.maxHp) return false;
    let missing = this.castle.maxHp - this.castle.hp;
    let cost = this.castleRepairCost();
    if (cost > this.gold) { if (!partial) return false; missing = this.affordableHp(eco.castleRepairCost, missing); cost = eco.castleRepairCost(missing, this.wave, this.repairDiscount()); }
    if (missing <= 0) return false;
    this.spend(cost); this.castle.hp = Math.min(this.castle.maxHp, this.castle.hp + missing);
    this.stats.repairs++;
    this.emit('repair', { what: 'castle' });
    return true;
  }
  // The most HP a partial repair can patch with the gold on hand. Repair prices are fractional per HP (the
  // wall costs about 0.5 gold per HP early on), so this works from the real rate rather than a rounded one.
  affordableHp(costFn, missing) {
    const rate = costFn(1000, this.wave, this.repairDiscount()) / 1000;
    let hp = Math.min(missing, Math.floor(this.gold / Math.max(1e-6, rate)));
    while (hp > 0 && costFn(hp, this.wave, this.repairDiscount()) > this.gold) hp--;
    return hp;
  }
  repairTower(t) {
    if (!this.canRepair() || t.hp >= t.maxHp) return false;
    const c = this.towerRepairCost(t);
    if (c > this.gold) return false;
    const wasRuined = t.ruined;
    this.spend(c); t.hp = t.maxHp; t.ruined = false;
    // A rebuilt banner, sanctum or mint must count again right away, not only after the next build or sale.
    if (wasRuined) this.refreshTowers();
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
    if (this.noMend || this.repairKits <= 0 || this.wall.hp >= this.wall.maxHp) return false;
    this.repairKits--; this.wall.hp = this.wall.maxHp; this.emit('repair', { what: 'wall', kit: true });
    return true;
  }

  // ---------- armory / weapon ----------
  armoryCost(stat) { return Math.round(eco.armoryCost(stat, this.weapon.lv[stat]) * (1 - this.bonus.armoryDiscount)); }
  buyArmory(stat) {
    const c = this.armoryCost(stat);
    if (!Number.isFinite(c) || this.gold < c || this.phase !== 'build' || this.free) return false;
    this.spend(c); this.weapon.lv[stat]++;
    if (stat === 'ammo') this.weapon.ammo++;
    this.emit('armory', { stat });
    return true;
  }
  weaponStats() {
    const W = WEAPONS[this.weapon.id], lv = this.weapon.lv;
    let dmg = W.dmg * (1 + ARMORY.dmg.per * lv.dmg) * (1 + this.bonus.weaponDmg + (this.bannerHero || 0)) * (1 + WEAPON_SCALE_PER_WAVE * (this.wave - 1));
    if (this.mod.lonehero) dmg *= 1.6;
    if (this.auto) dmg *= HERO.weaponMult;
    if (this.focusT > 0) dmg *= 1 + ABILITIES.focus.dmg;
    const reload = W.reload * Math.max(0.3, (1 - ARMORY.reload.per * lv.reload) * this.bonus.reloadMult * Math.pow(0.85, this.boon('steady')));
    const ammo = W.ammo + lv.ammo + this.bonus.ammoAdd + 2 * this.boon('quiver');
    const P = this.bonus.weaponPerks?.[this.weapon.id] || {};   // Weapon Mastery from the Keep
    dmg *= 1 + (P.dmg || 0);
    const crit = Math.min(0.9, W.crit + (P.crit || 0) + ARMORY.crit.per * lv.crit + 0.08 * this.boon('lucky') + 0.12 * this.boon('deadeye') + this.bonus.weaponCrit);
    return { ...W, dmg, reload: reload * (1 - Math.min(0.5, P.reload || 0)), ammo: ammo + (P.ammo || 0), crit,
      splash: (W.splash || 0) + (P.splash || 0), pierce: (W.pierce || 0) + (P.pierce || 0), chain: (W.chain || 0) + (P.chain || 0),
      burn: (W.burn || 0) * (1 + (P.burn || 0)), bossPct: (W.bossPct || 0) + (P.bossPct || 0), extra: P.extra || 0 };
  }
  comboMult() { return 1 + Math.min(this.combo, COMBO.cap + 10 * this.boon('combo')) * COMBO.perStep; }

  heroOrigin() { return { x: this.map.castle.x, y: this.map.castle.y - 0.66 }; }

  // How far through the current wave we are, 0 to 1: foes already beaten out of every foe the wave has sent or still has to send.
  // Null when there is no wave to measure (the build phase, or Endurance's unending stream).
  waveProgress() {
    if (this.phase !== 'wave' || this.mode === 'endurance' || !this.waveTotal) return null;
    const left = this.spawnQueue.length + this.enemies.length;
    this.waveTotal = Math.max(this.waveTotal, left);   // summoners add foes mid-wave: never let the bar run backwards past empty
    return Math.max(0, Math.min(1, 1 - left / this.waveTotal));
  }

  // Find the enemy under a tap. Returns {enemy, headshot} or null.
  pickEnemy(x, y, radius = 0.85) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.burrowT > 0 || !this.isVisible(e)) continue;
      const cy = e.y - e.size * 0.35 - (e.air ? 0.35 : 0);
      const d = Math.hypot(e.x - x, cy - y) - e.size * 0.6;
      if (d < radius && d < bd) { bd = d; best = e; }
    }
    if (!best) return null;
    const headY = best.y - best.size * 0.75 - (best.air ? 0.35 : 0);
    return { enemy: best, headshot: Math.abs(y - headY) < best.size * 0.45 && Math.abs(x - best.x) < best.size * 0.7 };
  }

  // Fire the personal weapon at the tapped point. charge in [0,1]. Returns true if a shot was fired.
  // `radius` widens the pick for fingertips: a touch is allowed to land near a foe rather than exactly on it.
  heroFire(x, y, charge = 0, radius = undefined) {
    if (this.puzzle || this.over || this.phase !== 'wave' || (this.weapon.ammo < 1 && this.focusT <= 0)) return false;
    const pick = this.pickEnemy(x, y, radius);
    if (!pick) return false;
    const W = this.weaponStats();
    const e = pick.enemy;
    const o = this.heroOrigin();
    // Lead the target.
    const dist = Math.hypot(e.x - o.x, e.y - o.y);
    const tt = dist / W.speed;
    const tx = e.x + (e.vx || 0) * tt, ty = e.y + (e.vy || 0) * tt;
    if (this.focusT <= 0) { this.weapon.ammo -= 1; if (this.weapon.reloadT <= 0) this.weapon.reloadT = W.reload; }
    this.stats.shots++;
    const full = charge >= 0.95;
    const dmg = W.dmg * (1 + (COMBO.chargeMult + 0.5 * this.boon('chargeup') - 1) * charge);
    const crit = this.rng.chance(W.crit);
    const base = { kind: 'hero', weapon: this.weapon.id, x: o.x, y: o.y, speed: W.speed, dmg, type: W.type,
      splash: W.splash || (this.boon('explosive') ? 0.8 : 0), splashFrac: W.splash ? 0.7 : 0.5, burn: W.burn || 0, chain: W.chain || 0,
      pierce: W.pierce + (full ? 2 : 0), bossPct: W.bossPct * (full ? 1.4 : 1), crit, headshot: pick.headshot, intended: e, hitSet: new Set(), main: true, charge,
      chainRange: W.chainRange || 1.6, pull: W.pull || 0, ground: W.ground || 0, airMult: W.airMult || 1 };
    // Alchemist's Flasks: fire, acid and frost in turn.
    if (W.flask) { base.flaskKind = FLASKS[(this.flaskIdx = ((this.flaskIdx ?? -1) + 1) % FLASKS.length)]; if (base.flaskKind !== 'fire') base.burn = 0; }
    // Bell of Thunder: no projectile, a cone of thunder from the wall.
    if (W.cone) { this.bellToll(o, Math.atan2(ty - o.y, tx - o.x), dmg, W, crit); this.emit('heroShot', { x: tx, y: ty, charge, weapon: this.weapon.id }); return true; }
    this.fireStraight(base, tx, ty);
    // Extra arrows (the Multishot boon and Weapon Mastery) fan out either side of the main shot at half damage.
    const extras = (this.boon('multishot') ? 2 : 0) + (W.extra || 0);
    for (let i = 0; i < extras; i++) {
      const da = (i % 2 ? 1 : -1) * 0.22 * (1 + Math.floor(i / 2) * 0.8);
      const ang = Math.atan2(ty - o.y, tx - o.x) + da;
      const len = Math.hypot(tx - o.x, ty - o.y) + 0.5;
      this.fireStraight({ ...base, dmg: dmg * 0.5, main: false, headshot: false, hitSet: new Set(), intended: null }, o.x + Math.cos(ang) * len, o.y + Math.sin(ang) * len);
    }
    this.emit('heroShot', { x: tx, y: ty, charge, weapon: this.weapon.id });
    return true;
  }

  fireStraight(p, tx, ty) {
    const d = Math.hypot(tx - p.x, ty - p.y) || 0.01;
    p.dx = (tx - p.x) / d; p.dy = (ty - p.y) / d; p.left = d + 0.35; p.tx = tx; p.ty = ty;
    this.projectiles.push(p);
  }

  // Night Siege: where the light falls (castle, every tower's torch, the glowing towers further, and burning foes light themselves).
  lights() {
    if (!this.night) return null;
    const L = [{ x: this.map.castle.x, y: this.map.castle.y, r: NIGHT.castle }];
    for (const t of this.towers) if (!t.ruined) L.push({ x: t.cx, y: t.cy, r: NIGHT.glow[t.type] || NIGHT.torch, glow: !!NIGHT.glow[t.type] });
    return L;
  }
  isVisible(e) {
    if (!this.mod.fog) return true;
    if (this.night) {
      if (e.burnT > 0 || e.markT > 0 || e.boss) return true;   // fire, the hero's mark and a boss's bulk give them away
      for (const l of this.lights()) if (Math.hypot(e.x - l.x, e.y - l.y) <= l.r) return true;
      return false;
    }
    if (Math.hypot(e.x - this.map.castle.x, e.y - this.map.castle.y) < 3.2) return true;
    for (const t of this.towers) if (t.stats.range && Math.hypot(e.x - t.cx, e.y - t.cy) <= t.stats.range + 0.3) return true;
    return false;
  }

  // ---------- draft (Draft mode) ----------
  // Tower types on offer: what is unlocked by now, weighted towards variety (fewer of what you already hold or have built).
  draftPool() {
    const ids = Object.keys(TOWERS).filter((id) => !TOWERS[id].passive || id === 'mint').filter((id) => this.isTowerUnlockedRaw(id));
    const rng = new Rng(seedFor(this.seed, 'draft', this.wave * 10 + (this.draft?.picks || 0)));
    return ids.map((id) => ({ id, w: rng.next() / (1 + this.towersOf(id) * 0.6 + (this.draft?.hand[id] || 0)) })).sort((a, b) => b.w - a.w).map((o) => o.id);
  }
  offerDraft() { if (!this.draft || this.over) return; this.draft.offer = this.draftPool().slice(0, DRAFT.offer); this.emit('draftOffer', { offer: this.draft.offer }); }
  chooseDraft(id) {
    if (!this.draft?.offer || !this.draft.offer.includes(id)) return false;
    this.draft.hand[id] = (this.draft.hand[id] || 0) + 1; this.draft.picks++; this.draft.offer = null;
    this.emit('draftPick', { id });
    return true;
  }
  isTowerUnlockedRaw(id) { const def = TOWERS[id]; if (!def) return false; if (this.bonus.unlockedTowers && !this.bonus.unlockedTowers.has(id)) return false; return this.unlockLevel() >= def.unlockWave; }

  // ---------- boons ----------
  offerBoons(extra = false) {
    const n = 3 + this.bonus.boonChoices + this.boon('scholar');
    const rng = new Rng(seedFor(this.seed, 'boon', this.wave, this.stats.boonsTaken, extra ? 'r' + this.rerolls : ''));
    let pool = BOONS.filter((b) => this.boon(b.id) < b.stack && (!BOON_REQUIRES[b.id] || this.isTowerKnown(BOON_REQUIRES[b.id])) && !(b.minWave > this.wave) && (b.needs !== 'troops' || this.stats.troopsTrained > 0));
    if (this.noMend) pool = pool.filter((b) => b.id !== 'masonry' && b.id !== 'fieldrepair');
    if (this.free) pool = pool.filter((b) => !GOLD_BOONS.has(b.id));   // Endurance and Last Stand have no gold: nothing to earn or save
    const out = [];
    while (out.length < n && pool.length) {
      const b = rng.weighted(pool, (x) => RARITY_WEIGHT[x.rarity] * (x.rarity === 'common' ? 1 : this.bonus.boonRarity));
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
    if (id === 'masonry') { this.wall.maxHp *= 1.35; this.wall.hp = this.wall.maxHp; }
    if (id === 'secondwind') this.secondWind = true;
    if (id === 'warfund') this.addGold(150 + 12 * this.wave, false);   // scales with the wave so it is still worth a pick late
    if (id === 'quiver') this.weapon.ammo += 2;
    this.refreshTowers();
    this.emit('boon', { id });
    if (this.pickQueue > 0) { this.pickQueue--; this.offerBoons(); }
    return true;
  }

  // ---------- reinforcements ----------
  applyReinforcements(list) {
    for (const r of list) {
      if (r.kind === 'gold') this.gold += 120;
      else if (r.kind === 'repair') this.repairKits++;
      else if (r.kind === 'reroll') this.rerolls++;
      else if (r.kind === 'tower') this.pendingAllies = [...(this.pendingAllies || []), r];
    }
  }
  placeAllies() {
    if (!this.pendingAllies) return;
    // A friend's tower camps on a ruin if one is free, so it never steals one of your open plots.
    const plots = [...this.map.plots].sort((a, b) => (this.claimed.has(a.k) ? 1 : 0) - (this.claimed.has(b.k) ? 1 : 0));
    for (const r of this.pendingAllies) {
      const type = ['archer', 'cannon', 'mage'].includes(r.tower) ? r.tower : 'archer';
      const spot = plots.find((p) => !this.towerAt(p.x, p.y));
      if (!spot) break;
      const { x, y } = spot;
      const t = this.makeTower(type, x, y, Math.min(4, r.tier || 2));
      t.ally = r.from || 'Ally'; t.allyWaves = 10; this.applyTierHp(t); t.hp = t.maxHp;
      this.towers.push(t);
    }
    this.pendingAllies = null;
    this.refreshTowers();
  }

  // ---------- stats ----------
  refreshTowers() {
    const hits = new Map();
    for (const t of this.towers) { t.auraDmg = 0; t.auraRate = 0; }
    this.bannerHero = 0;
    for (const [t, list] of hits) {
      const ds = list.map((x) => x.dmg).sort((a, b) => b - a), rs = list.map((x) => x.rate).sort((a, b) => b - a);
      t.auraDmg = ds.reduce((acc, v, i) => acc + v * [1, 0.5, 0.25, 0.25][Math.min(i, 3)], 0);
      t.auraRate = rs.reduce((acc, v, i) => acc + v * [1, 0.5, 0.25, 0.25][Math.min(i, 3)], 0);
    }
    for (const t of this.towers) t.stats = this.computeStats(t);
    // Sanctum shrines mend nearby towers and the wall, and can ward them.
    for (const t of this.towers) { t.healRate = 0; t.ward = 0; t.cleanse = false; }
    let wallHeal = 0;
    for (const sn of this.towers) {
      if (sn.type !== 'sanctum' || sn.ruined || sn.disabledT > 0) continue;
      const st = sn.stats;
      wallHeal += st.wallHeal;
      for (const t of this.towers) {
        if (t === sn || TOWERS[t.type].trap || Math.hypot(t.cx - sn.cx, t.cy - sn.cy) > st.range + 0.01) continue;
        t.healRate += st.heal; t.ward = Math.max(t.ward, st.ward); t.cleanse = t.cleanse || st.cleanse;
      }
    }
    this.wallHealRate = Math.min(0.02, wallHeal);
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
    if (def.bossMult) s.bossMult = def.bossMult;
    if (sp.range) s.range += sp.range;
    if (sp.critChance) { s.critChance = sp.critChance; s.critMult = sp.critMult; }
    if (def.multi) s.multi = def.multi;
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
    if (t.high) { const k = this.puzzle ? this.siegeCfg.hillMult : 1; s.range += TIER.highGroundRange * k; s.dmg *= 1 + TIER.highGroundDmg * k + this.bonus.highDmg; }
    const mDmg = Math.pow(1 + TIER.mastery.dmg, t.mastery || 0), mUtil = 1 + TIER.mastery.util * (t.mastery || 0);
    s.dmg *= mDmg;
    // Per-tower mastery perks (3 / 6 / 10 / 15 stars).
    const M = masteryMods(t.type, t.mastery || 0);
    s.dmg *= M.dmgMult; s.rate *= M.rateMult; s.splash *= M.splashMult; s.chain += M.chainAdd; s.pierce += M.pierceAdd;
    if (s.range) s.range += M.rangeAdd;
    s.critChance += M.critAdd; s.multi += M.multiAdd; s.bossMult *= M.bossMult; s.armoredMult *= M.armoredMult;
    s.stunChance += M.stunChanceAdd; s.shred += M.shredAdd; s.stun += M.stunAdd; s.vuln += M.vulnAdd; s.freezeChance += M.freezeAdd;
    if (M.pierceMr) s.pierceMr = true;
    if (t.rally && t.type !== 'barracks') s.rate *= 1 + FLAG.rate;
    // Boons
    if (t.type === 'archer') s.dmg *= 1 + 0.25 * this.boon('archer_dmg');
    if (t.type === 'cannon') { s.splash *= 1 + 0.3 * this.boon('cannon_splash'); s.dmg *= 1 + 0.2 * this.boon('cannon_splash'); }
    if (t.type === 'mage' || t.type === 'tesla') s.chain += this.boon('mage_chain');
    if (t.type === 'ballista') { s.pierce += 2 * this.boon('pierce'); s.dmg *= 1 + 0.25 * this.boon('pierce'); }
    if (s.type === 'magic') s.dmg *= 1 + 0.22 * this.boon('arcane');
    s.rate *= 1 + 0.08 * this.boon('overclock') + this.bonus.towerRate;
    s.range *= 1 + 0.08 * this.boon('eagle') + this.bonus.towerRange;
    s.splash *= this.bonus.splashMult;
    s.bossMult *= 1 + this.bonus.bossDmg;
    s.armoredMult *= 1 + this.bonus.armoredDmg;
    if (s.dmg > 0 && s.range > 0 && !def.beam) s.critChance += 0.05 + 0.08 * this.boon('lucky');
    if (s.critChance > 0) s.critMult += 0.5 * this.boon('killer');
    s.dmg *= 1 + 0.06 * this.boon('seasoned');
    s.bossMult *= 1 + 0.2 * this.boon('giantslayer'); s.armoredMult *= 1 + 0.2 * this.boon('giantslayer');
    if (t.type === 'frost') s.freezeChance += 0.06 * this.boon('deepfreeze');
    if (t.type === 'cannon') s.stun += 0.5 * this.boon('concussive');
    s.dmg *= 1 + t.auraDmg + this.bonus.towerDmg;
    s.rate *= 1 + t.auraRate;
    if (this.mod.lonehero) s.dmg *= 0.65;
    if (this.auto) s.dmg *= HERO.towerMult;
    // Type specifics
    if (t.type === 'mint') {
      s.income = def.income * TIER.income[i] * (sp.incomeMult || 1) * (1 + 0.35 * this.boon('taxman')) * mUtil * this.bonus.mintMult * M.incomeMult;
      s.killGold = (sp.killGold || 0) + M.killGoldAdd;
    }
    if (t.type === 'firetrap') {
      s.burn = def.burn * TIER.dmg[i] * mDmg * (sp.burnMult || 1) * M.burnMult * (1 + 0.35 * this.boon('pyro')) * (1 + t.auraDmg) * (this.mod.lonehero ? 0.65 : 1) * (this.auto ? HERO.towerMult : 1);
      s.burnTime = def.burnTime + M.burnTimeAdd; s.slow = sp.slow || 0; s.spread = !!sp.spread || M.spread; s.range = 0.6;
    }
    if (t.type === 'barracks') {
      const g = this.boon('garrison');
      s.soldiers = (sp.soldiersSet || def.soldiers) + (t.rally ? FLAG.barracksSoldiers : 0) + M.soldiersAdd;
      s.soldierHp = def.soldierHp * TIER.hp[i] * mUtil * (sp.hpMult || 1) * M.hpMult * (1 + 0.5 * g) * (1 + t.auraDmg);
      s.soldierDmg = def.soldierDmg * TIER.dmg[i] * mDmg * (sp.dmgMult || 1) * M.soldierDmgMult * (1 + 0.5 * g) * (1 + t.auraDmg);
      s.soldierArmor = sp.armor || 0; s.ranged = !!sp.ranged; s.respawn = def.respawn * (t.rally ? FLAG.barracksRespawn : 1);
      s.pin = def.pin * (1 + 0.15 * i) * (sp.pinMult || 1) + M.pinAdd;
      s.range = def.range;
    }
    if (t.type === 'frost') {
      s.slow = (sp.slowSet || Math.min(0.6, def.slow + 0.03 * i)) + M.slowAdd;
      s.slowTime = def.slowTime * (1 + 0.5 * this.boon('frostbite'));
      s.slow = Math.min(0.8, s.slow * (1 + 0.25 * this.boon('frostbite')));
    }
    if (t.type === 'obelisk') {
      s.dps = def.dps * TIER.dmg[i] * mDmg * (1 + 0.22 * this.boon('arcane')) * (1 + t.auraDmg + this.bonus.towerDmg) * (this.mod.lonehero ? 0.65 : 1) * (this.auto ? HERO.towerMult : 1);
      s.dps *= M.dmgMult;
      s.rampMax = (sp.rampMaxSet || def.rampMax) + M.rampAdd; s.ramp = def.ramp * (sp.rampMult || 1); s.beams = (sp.beams || 1) + M.beamsAdd;
    }
    if (t.type === 'gatling') s.heatMax = (sp.heatMaxSet || def.heatMax) + M.heatAdd;
    const wc = this.boon('witchcraft');
    if (def.hex) { s.hex = def.hex + (sp.hexAdd || 0) + 0.08 * wc; s.hexTime = def.hexTime + wc; }
    if (t.type === 'venom') {
      s.poisonPct = def.poisonPct * mUtil * (1 + 0.4 * wc);
      s.poison = def.poison * (1 + 0.4 * wc) * TIER.dmg[i] * mDmg * M.poisonMult * (1 + t.auraDmg + this.bonus.towerDmg) * (this.mod.lonehero ? 0.65 : 1) * (this.auto ? HERO.towerMult : 1);
      s.poisonCap = (sp.poisonCapSet || def.poisonCap) + M.capAdd; s.poisonTime = def.poisonTime + (sp.poisonTimeAdd || 0) + M.timeAdd;
      s.poisonSpread = !!sp.poisonSpread;
    }
    if (t.type === 'voidwell') {
      s.pull = def.pull * (sp.pullMult || 1) * M.pullMult * (1 + 0.1 * i);
      s.slow = sp.slowSet || 0; s.slowTime = 1.2;
    }
    if (t.type === 'sanctum') {
      s.range = (def.aura + (sp.auraAdd || 0) + 0.15 * i + M.rangeAdd) * (t.rally ? FLAG.bannerRadius : 1);
      s.aura = true;
      s.heal = def.heal * TIER.income[i] * (sp.healMult || 1) * M.healMult * mUtil;
      s.wallHeal = def.wallHeal * TIER.income[i] * M.wallMult * mUtil;
      s.ward = Math.min(0.75, (sp.ward || 0) + M.wardAdd); s.cleanse = !!sp.cleanse;
    }
    if (t.type === 'catapult' && s.fireField) s.fireField = sp.fireField;
    // Keep training for this tower type.
    const tr = 1 + (this.bonus.towerTrain[t.type] || 0);
    if (tr !== 1) for (const f of ['dmg', 'dps', 'burn', 'soldierDmg', 'income']) if (s[f]) s[f] *= tr;
    return s;
  }

  killGoldBonus() {
    let b = this.bonus.killGold + 0.12 * this.boon('bounty') + (this.titheT > 0 ? ABILITIES.tithe.gold : 0);
    for (const t of this.towers) if (t.type === 'mint' && t.stats?.killGold && !t.ruined) b += t.stats.killGold;
    return b;
  }

  // ---------- wave flow ----------
  startWave() {
    if (this.phase !== 'build' || this.over || this.boonOffer || this.draft?.offer) return false;
    if (!this.started) { this.started = true; this.beginStand(); this.streamT = ENDURANCE.beat; }
    if (!this.free && Number.isFinite(this.buildTimer) && this.buildTimer > 1) {
      const base = this.earlyCallValue();
      const g = this.addGold(base);
      this.score += Math.round(base * this.scoreMult());
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
    this.waveTotal = this.spawnQueue.length;   // for the wave progress bar; summoned foes can push it up (see waveProgress)
    this.waveClock = 0; this.waveLeaks = 0; this.enraged = false;
    const weather = this.march && this.wave < MARCH_WEATHER ? null : this.biome.hazard;
    this.hazard = { t: 5 + this.rng.range(0, 5), active: 0, kind: weather, warned: false };
    for (const t of this.towers) t.fresh = false;
    this.garrisonWaveStart();
    this.emit('waveStart', { wave: this.wave, plan: this.plan, boss: this.plan.boss });
    return true;
  }

  // Last Stand: the first wave is called and the doors close. Nothing more can be built, changed or sold.
  beginStand() {
    if (!this.free) return;
    this.emit('standBegin', { mode: this.mode });
  }

  // Gold for calling the next wave now (before Gold Rush, which addGold applies). The HUD shows the same number.
  earlyCallValue() {
    if (this.free) return 0;
    if (this.phase !== 'build' || !Number.isFinite(this.buildTimer) || this.buildTimer <= 1) return 0;
    return Math.round(eco.earlyCallGold(this.buildTimer, this.wave) * (1 + this.bonus.earlyCall));
  }

  scoreMult() { return eco.scoreMultiplier(this.modifiers, this.ascension) * (this.night ? NIGHT.score : 1); }

  completeWave() {
    const w = this.wave;
    const flawless = this.waveLeaks === 0;
    let gold = eco.waveClearGold(w, 0.2 * this.boon('warfund') + this.bonus.waveGold) * (this.bossRush ? BOSSRUSH.purse : 1);
    let mint = 0;
    for (const t of this.towers) if (t.type === 'mint' && !t.ruined) mint += t.stats.income;
    mint = Math.round(mint);
    const iRate = 0.06 * this.boon('interest') + this.bonus.interest;
    const interest = iRate > 0 ? Math.min(60 * this.boon('interest') + 1500 * this.bonus.interest, Math.floor(this.gold * iRate)) : 0;
    const total = this.addGold(gold + mint + interest);
    this.stats.mintGold += mint;
    const pts = Math.round(eco.waveClearPoints(w, flawless) * this.scoreMult());
    this.score += pts;
    if (flawless) { this.stats.flawless++; this.stats.flawlessStreak++; this.stats.maxFlawlessStreak = Math.max(this.stats.maxFlawlessStreak, this.stats.flawlessStreak); }
    else this.stats.flawlessStreak = 0;
    this.stats.wavesCleared = this.wavesClearedAt(w);
    if (!this.noMend) {
      if (this.bonus.wallMend) this.wall.hp = Math.min(this.wall.maxHp, this.wall.hp + this.wall.maxHp * this.bonus.wallMend);
      if (this.bonus.castleMend) this.castle.hp = Math.min(this.castle.maxHp, this.castle.hp + this.castle.maxHp * this.bonus.castleMend);
    }
    this.garrisonWaveEnd(flawless, isBossWave(w));
    // Ally towers expire.
    for (const t of this.towers) if (t.ally) t.allyWaves--;
    const leaving = this.towers.filter((t) => t.ally && t.allyWaves <= 0);
    if (leaving.length) { this.towers = this.towers.filter((t) => !leaving.includes(t)); this.refreshTowers(); }
    this.hornT = this.titheT = this.aegisT = this.focusT = this.stormT = this.stasisT = this.hymnT = 0; this.callerT = 0;
    this.zones = [];
    this.emit('waveClear', { wave: w, gold: total, mint, interest, points: pts, flawless, boss: isBossWave(w) });
    // Sprint ends the moment its last wave falls, with the clock stopped there.
    if (this.mode === 'sprint' && this.stats.wavesCleared >= SPRINT.waves) { this.victory = true; this.wave++; this.gameOver(); return; }
    if (this.puzzle && this.stats.wavesCleared >= this.siegeCfg.waves) { this.victory = true; this.score = this.siegeScore(); if (this.trial) this.stars = trialStars({ victory: true, castlePct: this.castle.hp / this.castle.maxHp, wallPct: this.wall.hp / this.wall.maxHp }); this.wave++; this.gameOver(); return; }
    this.wave += this.mode === 'gauntlet' ? GAUNTLET.step : this.bossRush ? BOSSRUSH.step : 1;
    this.phase = 'build';
    this.buildTimer = this.tutorial && w < 3 ? Infinity : this.breakTime();
    this.weapon.ammo = this.weaponStats().ammo;
    this.combo = 0;
    this.nextPlan = planWave(this.wave, this.seed, this.waveOpts());
    this.refreshTowers();
    if (this.mode === 'gauntlet' && isBossWave(w)) this.advanceStage();
    if (!this.free && !this.puzzle && (w % GAME.boonEvery === 0 || isBossWave(w))) this.offerBoons();
    if (this.drafting) this.offerDraft();
    this.emit('buildPhase', { wave: this.wave });
    if (this.auto) autoCommand(this);
  }

  // Seconds of break after a wave. Gauntlet and Sprint keep it short; Last Stand barely pauses.
  breakTime() {
    if (this.mode === 'gauntlet') return GAUNTLET.buildTime;
    if (this.mode === 'sprint') return this.sprintCfg.buildTime;
    if (this.mode === 'laststand') return LASTSTAND.gap;
    if (this.puzzle) return this.siegeCfg.gap;
    if (this.bossRush) return BOSSRUSH.buildTime;
    if (this.duo) return DUO.buildTime;
    if (this.auto) return HERO.buildTime;
    return GAME.buildTime;
  }
  // Waves that count as cleared once wave w has fallen.
  wavesClearedAt(w) {
    if (this.mode === 'gauntlet') return gauntletFights(w) + 1;
    if (this.mode === 'laststand') return lastStandWaves(this.stats.kills);
    if (this.bossRush) return this.stats.bossKills;   // Boss Rush counts bosses felled, not fights survived
    return w - this.start + 1;
  }

  // Endurance has no waves: a new surge of foes is queued every beat, one level tougher than the last, and the old ones are
  // not waited for. Level n is exactly wave n's roster, so the bosses and new foes arrive on the usual schedule.
  updateStream(dt) {
    this.streamT -= dt;
    while (this.streamT <= 0 && !this.over) {
      this.streamT += ENDURANCE.beat;
      this.wave++;
      const plan = planWave(this.wave, this.seed, this.waveOpts());
      this.plan = plan;
      this.nextPlan = planWave(this.wave + 1, this.seed, this.waveOpts());
      for (const g of plan.groups) for (let i = 0; i < g.count; i++) this.spawnQueue.push({ t: this.waveClock + g.delay + i * g.gap, type: g.type, boss: g.boss, spawn: g.spawn, plan });
      this.spawnQueue.sort((a, b) => a.t - b.t);
      this.emit('waveStart', { wave: this.wave, plan, boss: plan.boss });
    }
    if (this.bossDown || this.stats.kills >= (this.stats.freeRepairAt ?? ENDURANCE.repairKills)) { this.enduranceRepair(this.bossDown); this.bossDown = false; }
  }

  // Endurance: when a boss falls, or every ENDURANCE.repairKills foes, every building is made whole for free.
  enduranceRepair(boss) {
    const next = this.stats.freeRepairAt ?? ENDURANCE.repairKills;
    const byKills = this.stats.kills >= next;
    if (!boss && !byKills) return false;
    for (const t of this.towers) if (!t.ally) { t.hp = t.maxHp; t.ruined = false; }
    for (const u of this.garrison.units) if (!u.dead && u.state === 'reserve') u.hp = u.maxHp;
    this.wall.hp = this.wall.maxHp;
    this.castle.hp = Math.min(this.castle.maxHp, this.castle.hp + this.castle.maxHp * ENDURANCE.castleHeal);
    this.stats.freeRepairAt = this.stats.kills + ENDURANCE.repairKills;
    this.stats.freeRepairs = (this.stats.freeRepairs || 0) + 1;
    this.emit('freeRepair', { boss, wave: this.wave });
    return true;
  }

  // Gauntlet: the boss is down. Leave this map behind and start over on the next, richer and with more unlocked.
  advanceStage() {
    const from = this.stage;
    this.stage = gauntletStage(this.wave);
    if (this.stage === from) return;
    this.mapId = gauntletMap(this.stage);
    this.mapSeed = gauntletMapSeed(this.seed, this.stage);
    this.map = buildMap(this.mapId, this.mapSeed, this.portrait);
    this._gate = null;
    this.claimed = new Set(this.map.startPlots); this.claims = 0;
    this.towers = []; this.enemies = []; this.projectiles = []; this.fields = []; this.zones = []; this.volleys = [];
    const opts = this.waveOpts();
    const pack = headStartPackage(this.wave, this.seed, opts, this.bonus.killGold);
    const before = headStartPackage(this.wave - GAUNTLET.stageEvery, this.seed, opts, this.bonus.killGold);
    const grant = Math.round(pack.gold * GAUNTLET.goldMult);
    this.gold += grant;
    this.stats.peakGold = Math.max(this.stats.peakGold, this.gold);
    const ruins = this.map.plots.filter((p) => !this.claimed.has(p.k));
    for (const p of ruins.slice(0, pack.plots + this.bonus.startPlots)) this.claimed.add(p.k);
    this.castle.hp = Math.min(this.castle.maxHp, this.castle.hp + this.castle.maxHp * GAUNTLET.castleHeal);
    this.wall.hp = this.wall.maxHp;
    for (const u of this.garrison.units) { this.toReserve(u); u.hp = u.maxHp; }
    this.hazard = { t: 0, active: 0, kind: null };
    this.refreshTowers();
    this.pickQueue = Math.max(0, pack.boons - before.boons);   // free picks on top of the boss's own, offered one after another
    this.buildTimer = GAUNTLET.stageBuild;
    this.emit('stageStart', { stage: this.stage, map: this.mapId, grant, plots: this.claimed.size });
  }

  // ---------- spawning ----------
  spawnEnemy(type, spawnIdx, opts = {}) {
    const plan = opts.plan || this.plan;
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
    const hp = def.hp * plan.hp * cycleMult * (opts.hpScale || 1) * (opts.noAdapt ? 1 : 1 + (this.foeAdapt - 1) * Math.min(1, Math.max(0, (this.wave - 3) / GAME.adaptRamp)));
    const armorBase = def.armor + (def.armored || boss ? plan.armor : 0) + (this.mod.iron ? 20 : 0) + (plan.threatArmor || 0);
    const e = {
      uid: UID++, type, boss: boss ? boss.id : null, def, name: def.name, path, seg: 0,
      x: opts.x ?? path[0].x, y: opts.y ?? path[0].y, vx: 0, vy: 0, dist: opts.dist || 0,
      hp, maxHp: hp, armor: armorBase, mr: def.mr + (this.mod.iron ? 20 : 0) + (plan.threatMr || 0),
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

  // Ground foes that skip the front of the road: some arrive mid-road (ambush), some sprint through it behind a shield (vanguard).
  breakthrough(e) {
    const B = BREAKTHROUGH, w = this.wave;
    if (!e || e.boss || e.air || this.tutorial || e.path.length < 3) return;
    const total = e.total || 1;
    const pA = w >= B.ambushFrom ? Math.min(B.ambushCap, B.ambushBase + B.ambushPerWave * (w - B.ambushFrom)) : 0;
    const pV = w >= B.vanguardFrom ? Math.min(B.vanguardCap, B.vanguardBase + B.vanguardPerWave * (w - B.vanguardFrom)) : 0;
    const r = this.rng.next();
    if (r < pA) {
      const want = total * (B.ambushAt[0] + (B.ambushAt[1] - B.ambushAt[0]) * this.rng.range(0, 1));
      let acc = 0, i = 0;
      while (i < e.path.length - 2) { const d = Math.hypot(e.path[i + 1].x - e.path[i].x, e.path[i + 1].y - e.path[i].y); if (acc + d >= want) break; acc += d; i++; }
      const a = e.path[i], b = e.path[i + 1], d = Math.hypot(b.x - a.x, b.y - a.y) || 1, k = Math.max(0, Math.min(1, (want - acc) / d));
      e.seg = i; e.x = a.x + (b.x - a.x) * k; e.y = a.y + (b.y - a.y) * k; e.dist = want; e.ambush = true;
      this.emit('ambush', { x: e.x, y: e.y });
    } else if (r < pA + pV) {
      e.vanguard = total * B.vanguardUntil; e.shield = Math.max(e.shield, e.maxHp * B.vanguardShield);
    }
  }

  // The countdown between waves. It ticks with the simulation by default (headless runs, tests); the play screen sets
  // wallClockBuild and calls this with real elapsed seconds, so 2×–4× game speed never shortens the break.
  tickBuild(dt) {
    if (this.over || this.phase !== 'build' || this.boonOffer || this.draft?.offer || !Number.isFinite(this.buildTimer)) return;
    this.buildTimer -= dt;
    if (this.started) this.clock += dt;
    if (this.buildTimer <= 0) { this.buildTimer = 0; this.startWave(); }
  }

  // ---------- main step ----------
  update(dt = GAME.step) {
    if (this.over) return;
    this.time += dt;
    if (this.auto && (this.autoT -= dt) <= 0) { this.autoT = 2.5; autoCommand(this); }
    this.stats.time += dt;
    if (this.phase === 'build') {
      if (!this.wallClockBuild) this.tickBuild(dt);
      this.updateWeapon(dt);
      this.updateProjectiles(dt);
      this.updateGarrison(dt);
      return;
    }
    this.waveClock += dt;
    this.clock += dt;
    if (this.free) {
      const before = this.stats.wavesCleared;
      this.stats.wavesCleared = lastStandWaves(this.stats.kills);
      if (this.stats.wavesCleared > before) this.emit('hundred', { waves: this.stats.wavesCleared });
    }
    if (this.mode === 'endurance') this.updateStream(dt);
    while (this.spawnQueue.length && this.spawnQueue[0].t <= this.waveClock) {
      const s = this.spawnQueue.shift();
      const e = this.spawnEnemy(s.type, s.spawn, { boss: s.boss, plan: s.plan });
      this.breakthrough(e);
    }
    if (this.waveClock > 180 && !this.enraged && this.mode !== 'endurance') {
      // Safety valve: a wave can't stall forever (stun/heal stalemates).
      this.enraged = true;
      for (const e of this.enemies) { e.enraged = true; e.stunT = 0; }
      this.emit('enrage', {});
    }
    this.updateHazard(dt);
    this.updateWeapon(dt);
    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateGarrison(dt);
    this.updateProjectiles(dt);
    this.updateFields(dt);
    this.updateAbilities(dt);
    if (this.bonus.wallRegen && !this.noMend) this.wall.hp = Math.min(this.wall.maxHp, this.wall.hp + this.wall.maxHp * this.bonus.wallRegen * dt);
    if (this.wallHealRate && !this.noMend) this.wall.hp = Math.min(this.wall.maxHp, this.wall.hp + this.wall.maxHp * this.wallHealRate * dt);
    if (this.boon('fieldrepair') && !this.noMend) this.wall.hp = Math.min(this.wall.maxHp, this.wall.hp + this.wall.maxHp * 0.01 * this.boon('fieldrepair') * dt);
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0 && this.combo > 0) { this.combo = 0; this.emit('combo', { combo: 0 }); } }
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (!this.over && this.mode !== 'endurance' && this.spawnQueue.length === 0 && this.enemies.length === 0) this.completeWave();
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
        if (h.tick <= 0) { h.tick = WEATHER.meteorEvery; this.meteor(); }
      }
      if (h.kind === 'stealth') for (const e of this.enemies) if (!e.dead && !e.boss && e.stealthT <= 0 && !e.hazRolled && this.rng.chance(WEATHER.stealthChance)) { e.stealthT = Math.min(WEATHER.stealthT, h.active + 0.5); e.hazRolled = true; }
      if (h.active <= 0) this.emit('hazard', { kind: h.kind, on: false });
      return;
    }
    h.t -= dt;
    if (h.t <= WEATHER.warn && !h.warned) { h.warned = true; this.emit('hazardWarn', { kind: h.kind }); }
    if (h.t <= 0) {
      h.t = WEATHER.gapMin + this.rng.range(0, WEATHER.gapRand);
      h.warned = false;
      h.active = WEATHER.dur[h.kind] || 8;
      for (const e of this.enemies) e.hazRolled = h.kind === 'stealth' ? false : e.hazRolled;
      if (h.kind === 'stealth') for (const e of this.enemies) if (!e.dead && !e.boss && this.rng.chance(WEATHER.stealthChance)) { e.stealthT = WEATHER.stealthT; e.hazRolled = true; }
      this.emit('hazard', { kind: h.kind, on: true });
    }
  }
  weatherOn(kind) { return this.hazard.kind === kind && this.hazard.active > 0; }
  hazardRangeMult() { return this.weatherOn('sandstorm') ? WEATHER.sandRange : this.weatherOn('blizzard') ? WEATHER.blizzRange : 1; }
  hazardRateMult() { return this.weatherOn('blizzard') ? WEATHER.blizzRate : this.weatherOn('sandstorm') ? WEATHER.sandRate : 1; }

  meteor() {
    const pathTiles = [];
    for (let y = 0; y < this.map.rows; y++) for (let x = 0; x < this.map.cols; x++) if (this.map.tileAt(x, y) === T.PATH) pathTiles.push([x, y]);
    const [mx, my] = this.rng.pick(pathTiles);
    const x = mx + 0.5, y = my + 0.5;
    const dmg = WEATHER.meteorDmg * (this.plan?.hp || 1), R = WEATHER.meteorRadius;
    for (const e of this.enemies) if (!e.dead && !e.air && Math.hypot(e.x - x, e.y - y) < R) this.damage(e, dmg, 'fire', null);
    for (const t of this.towers) if (!t.ruined && Math.hypot(t.cx - x, t.cy - y) < R) this.damageTower(t, t.maxHp * WEATHER.meteorTower, towerHitSrc('meteor'));
    for (const u of this.garrison.units.slice()) if (u.state === 'out' && Math.hypot(u.x - x, u.y - y) < R) this.hurtTroop(u, u.maxHp * WEATHER.meteorTroop);
    this.emit('impact', { x, y, kind: 'meteor', splash: R });
  }

  updateEnemies(dt) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt);
      if (e.stealthT > 0) e.stealthT -= dt;
      if (e.markT > 0) e.markT -= dt;
      if (e.shredT > 0) { e.shredT -= dt; if (e.shredT <= 0) e.shred = 0; }
      if (e.buffT > 0) e.buffT -= dt;
      if (e.bannerT > 0) e.bannerT -= dt;
      if (e.groundT > 0) { e.groundT -= dt; if (e.groundT <= 0 && e.wasAir) { e.air = true; e.wasAir = false; } }
      if (e.def.structure) {   // barricades stand still and fall apart on their own
        e.vx = e.vy = 0; e.life -= dt;
        if (e.life <= 0) { e.dead = true; e.expired = true; this.emit('barricadeGone', { enemy: e }); }
        continue;
      }
      if (e.burnT > 0) {
        e.burnT -= dt;
        this.damage(e, e.burn * dt, 'fire', e.burnSrc, { dot: true });
        if (e.dead) continue;
      }
      if (e.poisonT > 0) {
        e.poisonT -= dt;
        this.damage(e, (e.poisonPer + (e.poisonPct || 0) * e.maxHp * (e.boss ? 0.35 : 1)) * e.poisonStacks * dt, 'poison', e.poisonSrc, { dot: true });
        if (e.poisonT <= 0) e.poisonStacks = 0;
        if (e.dead) continue;
      }
      // Trolls and the Hydra knit their wounds shut, unless fire or poison is eating at them.
      if (e.def.regen && e.hp < e.maxHp && !(e.burnT > 0) && !(e.poisonT > 0)) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.def.regen * (e.enraged ? 0.5 : 1) * dt);
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      if (e.zvT > 0) { e.zvT -= dt; if (e.zvT <= 0) e.zv = 0; }
      if (e.hexT > 0) { e.hexT -= dt; if (e.hexT <= 0) e.hex = 0; }
      if (e.pullT > 0) { e.pullT -= dt; if (e.pullT <= 0) e.pullStack = 0; }
      if (this.stasisT > 0) { e.vx = e.vy = 0; continue; }
      this.enemyAbilities(e, dt);
      if (e.dead) continue;
      if (e.stunImmune > 0) e.stunImmune -= dt;
      if (e.stunT > 0) { e.stunT -= dt; e.stunChain = (e.stunChain || 0) + dt; e.vx = e.vy = 0; if (e.stunT <= 0) e.stunImmune = 1.5; continue; }
      if (e.holdImmune > 0) e.holdImmune -= dt;
      if (e.blocker && !e.blocker.dead && ((e.heldT = (e.heldT || 0) + dt) > HOLD.max || e.enraged)) {
        const b = e.blocker; e.blocker = null; e.heldT = 0; e.holdImmune = HOLD.immune;
        if (b.troop) { if (b.holding === e) b.holding = null; } else if (b.target === e) b.target = null;
        this.emit('breakFree', { enemy: e });
      }
      if (e.blocker && !e.blocker.dead) {
        e.vx = e.vy = 0;
        e.atkT = (e.atkT || 0) - dt;
        if (e.atkT <= 0) {
          e.atkT = 1;
          const hit = Math.max(2, e.def.dmg * 4 * (this.plan.hp ** 0.5)) * (e.def.crush || 1);
          if (e.blocker.troop) this.hurtTroop(e.blocker, hit);
          else { e.blocker.hp -= hit * (1 - (e.blocker.armor || 0) / 100); if (e.blocker.hp <= 0) this.killSoldier(e.blocker); }
        }
        continue;
      }
      e.blocker = null; e.heldT = 0;
      if (e.boss || e.air || e.type === 'ram' || e.def.striker) this.foeStrike(e, dt);
      let spd = e.speed * (1 - (e.enraged ? e.slow * 0.3 : e.slow));
      if (e.enraged) spd *= 1.6;
      if (e.def.rage && e.hp < e.maxHp * e.def.rage.below) spd *= e.def.rage.speed;
      if (e.vanguard) { if (e.dist < e.vanguard) spd *= BREAKTHROUGH.vanguardSpeed; else e.vanguard = 0; }
      if (e.buffT > 0) spd *= 1 + ENEMIES.warchief.aura.speed;
      if (e.bannerT > 0) spd *= 1 + ENEMIES.herald.banner.speed;
      if (this.weatherOn('blizzard')) spd *= WEATHER.blizzFoe;
      if (e.burrowT > 0) spd *= e.def.burrow.speed;
      else if (!e.air && this.map.mud && this.map.mud[Math.floor(e.y) * this.map.cols + Math.floor(e.x)]) spd *= MUD_SLOW;
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
    if (e.reflectCd > 0) e.reflectCd -= dt;
    if (e.brokeT > 0) e.brokeT -= dt;
    if (def.phalanx) {
      for (const o of this.enemies) if (o !== e && !o.dead && o.def.phalanx && Math.hypot(o.x - e.x, o.y - e.y) < def.phalanx.range) { e.lockAt = this.time; break; }
    }
    if (def.banner) for (const o of this.enemies) if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < def.banner.range) o.bannerT = 0.3;
    if (def.barricade && !(e.burrowT > 0)) {
      e.barrCd = (e.barrCd ?? def.barricade.cd * this.rng.range(0.4, 0.8)) - dt;
      if (e.barrCd <= 0 && e.seg < e.path.length - 2) {
        e.barrCd = def.barricade.cd;
        const b = this.spawnChild(e, 'barricade', def.barricade.hp);
        b.x = e.x; b.y = e.y; this.advance(b, def.barricade.ahead); b.life = def.barricade.life; b.speed = 0;
        this.emit('barricade', { enemy: b, by: e });
      }
    }
    if (def.shoots && e.cd <= 0) {
      const tw = this.nearestTower(e, def.shoots.range);
      if (tw) { e.cd = def.shoots.cd; this.projectiles.push({ kind: 'earrow', x: e.x, y: e.y - 0.2, target: tw, speed: 7, dmg: def.shoots.dmg * Math.sqrt(this.plan.hp), src: towerHitSrc('archer') }); }
      else {
        const tr = this.nearestTroop(e, def.shoots.range);
        if (tr) { e.cd = def.shoots.cd; this.projectiles.push({ kind: 'jav', x: e.x, y: e.y - 0.2, target: tr, speed: 8, dmg: def.shoots.dmg * Math.sqrt(this.plan.hp) }); }
        else e.cd = 0.3;
      }
    }
    if (def.hunts && e.cd <= 0) {
      const tr = this.nearestTroop(e, def.hunts.range);
      if (tr) { e.cd = def.hunts.cd; this.projectiles.push({ kind: 'jav', x: e.x, y: e.y - 0.2, target: tr, speed: 8, dmg: def.hunts.dmg * Math.sqrt(this.plan.hp) }); }
      else e.cd = 0.3;
    }
    if (def.cleave && e.cd <= 0) {
      let hit = 0;
      for (const u of [...this.garrison.units]) if (u.state === 'out' && Math.hypot(u.x - e.x, u.y - e.y) <= def.cleave.range) { this.hurtTroop(u, def.cleave.dmg * Math.sqrt(this.plan.hp)); hit++; }
      e.cd = hit ? def.cleave.cd : 0.4;
      if (hit) this.emit('cleave', { x: e.x, y: e.y, r: def.cleave.range });
    }
    if (def.heal && e.cd <= 0) {
      e.cd = def.heal.cd;
      for (const o of this.enemies) if (!o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < def.heal.range && o.hp < o.maxHp) {
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * def.heal.pct); this.emit('heal', { enemy: o });
      }
    }
    if (def.drain && e.cd <= 0) {
      // Barrow Wight / Wraith King: a grave-cold pulse. Every tower in reach fires at half speed for a few seconds.
      let hit = 0;
      for (const t of this.towers) if (!t.ruined && !TOWERS[t.type].trap && !t.cleanse && Math.hypot(t.cx - e.x, t.cy - e.y) <= def.drain.range) { t.chilledT = Math.max(t.chilledT || 0, def.drain.time); hit++; }
      e.cd = hit ? def.drain.cd : 0.4;
      if (hit) this.emit('drain', { x: e.x, y: e.y, r: def.drain.range, enemy: e });
    }
    if (def.sabotage && e.cd <= 0) {
      const tw = this.nearestTower(e, def.sabotage.range);
      if (tw) { e.cd = def.sabotage.cd; tw.disabledT = def.sabotage.time; this.emit('sabotage', { tower: tw }); } else e.cd = 0.3;
    }
    if (def.burrow) {
      if (e.burrowT > 0) { e.burrowT -= dt; if (e.burrowT <= 0) { e.burrowT = 0; e.burrowCd = def.burrow.every; this.emit('surface', { enemy: e }); } }
      else if (!(e.stunT > 0)) {
        e.burrowCd = (e.burrowCd ?? def.burrow.every * this.rng.range(0.3, 0.8)) - dt;
        if (e.burrowCd <= 0) { e.burrowT = def.burrow.time; e.blocker = null; this.emit('burrow', { enemy: e }); }
      }
    }
    if (def.blink && !(e.stunT > 0)) {
      e.blinkCd = (e.blinkCd ?? def.blink.cd * this.rng.range(0.4, 0.9)) - dt;
      if (e.blinkCd <= 0 && e.seg < e.path.length - 1) {
        e.blinkCd = def.blink.cd;
        const from = { x: e.x, y: e.y };
        this.advance(e, def.blink.dist);
        e.blocker = null;
        this.emit('blink', { enemy: e, from, to: { x: e.x, y: e.y } });
      }
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
    if (def.frost && e.cd <= 0) {
      // The Frost Giant's breath: every tower near it freezes solid for a moment.
      e.cd = def.frost.cd;
      let hit = 0;
      for (const t of this.towers) if (!t.ruined && !TOWERS[t.type].trap && !t.cleanse && Math.hypot(t.cx - e.x, t.cy - e.y) < def.frost.range) { t.disabledT = Math.max(t.disabledT || 0, def.frost.time); t.frozenT = def.frost.time; hit++; }
      this.emit('frostBreath', { x: e.x, y: e.y, r: def.frost.range, enemy: e, hit });
    }
    if (def.stomp && e.cd <= 0) {
      e.cd = def.stomp.cd;
      for (const t of this.towers) if (Math.hypot(t.cx - e.x, t.cy - e.y) < def.stomp.range) { t.disabledT = def.stomp.time; this.damageTower(t, 20, towerHitSrc('stomp', def.name)); }
      this.emit('stomp', { x: e.x, y: e.y, r: def.stomp.range });
    }
    if (def.breath && e.cd <= 0) {
      const tw = this.nearestTower(e, def.breath.range);
      if (tw) { e.cd = def.breath.cd; for (const t of this.towers) if (Math.hypot(t.cx - tw.cx, t.cy - tw.cy) < 1.1) this.damageTower(t, def.breath.dmg * (1 + 0.5 * (this.plan.boss?.cycle || 0)), towerHitSrc('breath', def.name)); this.emit('breath', { from: e, x: tw.cx, y: tw.cy }); }
      else e.cd = 0.5;
    }
    if (def.spit && e.cd <= 0) {
      const tw = this.nearestTower(e, def.spit.range);
      if (tw) {
        e.cd = def.spit.cd;
        this.damageTower(tw, def.spit.dmg * (1 + 0.5 * (this.plan.boss?.cycle || 0)), towerHitSrc('spit', def.name));
        if (!tw.cleanse) tw.disabledT = Math.max(tw.disabledT || 0, def.spit.disable);
        this.emit('spit', { from: e, x: tw.cx, y: tw.cy, tower: tw });
      } else e.cd = 0.5;
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

  // Move a foe forward along its road by `d` tiles (Phase Wraith blink).
  advance(e, d) {
    while (d > 0 && e.seg < e.path.length - 1) {
      const b = e.path[e.seg + 1];
      const left = Math.hypot(b.x - e.x, b.y - e.y);
      if (left <= d) { e.x = b.x; e.y = b.y; e.seg++; d -= left; e.dist += left; }
      else { e.x += ((b.x - e.x) / left) * d; e.y += ((b.y - e.y) / left) * d; e.dist += d; d = 0; }
    }
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

  damageTower(t, dmg, src = null) {
    if (t.ruined || TOWERS[t.type].trap) return;
    if (t.ward) dmg *= 1 - t.ward;
    if (t.mastery >= TIER.harden.stars[0]) dmg *= 1 - hardening(t.mastery).resist;
    t.hp -= dmg;
    this.emit('towerHit', { tower: t, dmg, src });
    if (t.hp <= 0) { t.hp = 0; t.ruined = true; t.beam = null; this.refreshTowers(); this.emit('towerRuined', { tower: t, src }); }
  }

  leak(e) {
    e.dead = true; e.leaked = true;
    if (e.def.steal) {
      // A Gold Thief never touches the wall: it just makes off with some of your treasury.
      const st = e.def.steal;
      const gold = this.boon('thieftaker') ? 0 : Math.max(0, Math.min(Math.floor(this.gold), Math.max(st.min, Math.min(st.max * (1 + 0.04 * this.wave), Math.floor(this.gold * st.pct)))));
      this.gold -= gold; this.stats.goldStolen = (this.stats.goldStolen || 0) + gold;
      this.emit('stolen', { enemy: e, gold });
      return;
    }
    this.waveLeaks++; this.stats.leaks++;
    let dmg = eco.leakDamage(e.def.dmg, this.wave) * (e.boss ? 1 + 0.3 * (this.plan.boss?.cycle || 0) : 1) * (e.def.charge || 1);   // a Tunnel Sapper's charge
    if (this.aegisT > 0) dmg *= 1 - ABILITIES.aegis.reduce;
    let target = 'castle', wallDmg = 0, spill = 0;
    // A boss breaching is a disaster: it smashes the wall for double and what it does not crush still bleeds into the keep.
    const wallMult = (e.def.wallMult || 1) * (e.boss ? ECON.bossBreachWall : 1);
    if (!e.air && !e.def.ignoreWall && this.wall.hp > 0) {
      target = 'wall';
      if (e.boss) spill = dmg * ECON.bossBreachSpill;
      const wd = dmg * wallMult;
      wallDmg = Math.min(wd, this.wall.hp);
      this.wall.hp -= wd;
      if (this.wall.hp < 0) { dmg = -this.wall.hp / wallMult; this.wall.hp = 0; target = 'both'; }
      else dmg = spill;
    }
    if (dmg > 0) {
      if (spill && target === 'wall') target = 'both';
      dmg *= Math.pow(0.88, this.boon('thickskin')) * (1 - this.bonus.castleDR);
      this.castle.hp -= dmg;
    }
    this.emit('leak', { enemy: e, target, dmg, wallDmg });
    if (this.castle.hp <= 0) {
      if (this.secondWind) {
        this.secondWind = false; this.boons.secondwind = 0;
        this.castle.hp = this.castle.maxHp * this.bonus.secondWindHeal;
        this.emit('secondWind', {});
      } else this.gameOver();
    }
  }

  siegeScore() {
    return siegeScore({ wavesCleared: this.stats.wavesCleared, castlePct: this.castle.hp / this.castle.maxHp, wallPct: this.wall.hp / this.wall.maxHp, left: this.points, victory: this.victory }, this.siegeCfg);
  }
  gameOver() {
    if (this.over) return;
    if (this.puzzle && !this.victory) this.score = this.siegeScore();
    this.castle.hp = 0;
    this.over = true; this.phase = 'over';
    this.emit('gameOver', this.summary());
  }

  // ---------- combat ----------
  // Venom: stacks, ignores armor and magic resist, ticks until it wears off.
  poison(e, s, src) {
    if (e.dead) return;
    const live = e.poisonT > 0;
    e.poisonStacks = Math.min(s.poisonCap, (live ? e.poisonStacks : 0) + 1);
    e.poisonPer = live ? Math.max(e.poisonPer, s.poison) : s.poison;
    e.poisonPct = live ? Math.max(e.poisonPct || 0, s.poisonPct || 0) : (s.poisonPct || 0);
    e.poisonT = Math.max(live ? e.poisonT : 0, s.poisonTime);
    e.poisonSrc = src;
  }
  // Drag a foe back along its road by `d` tiles.
  pull(e, d) {
    const path = e.path;
    if (!path || d <= 0 || e.enraged) return;
    // Foes get used to it: each repeat within 6s pulls 40% less, so no one is held back forever.
    d *= Math.pow(0.6, e.pullStack || 0);
    e.pullStack = (e.pullStack || 0) + 1; e.pullT = 6;
    while (d > 0) {
      const a = path[e.seg];
      const back = Math.hypot(e.x - a.x, e.y - a.y);
      if (d <= back) { const k = (back - d) / (back || 1); e.x = a.x + (e.x - a.x) * k; e.y = a.y + (e.y - a.y) * k; e.dist = Math.max(0, e.dist - d); return; }
      e.x = a.x; e.y = a.y; e.dist = Math.max(0, e.dist - back); d -= back;
      if (e.seg <= 0) return;
      e.seg--;
    }
  }

  // Stuns no longer stack forever: while a foe is stunned, new stuns may only stretch it to HOLD.stunChain seconds in all,
  // then it gets its usual moment of immunity. (Frost freezes and stun hits arriving faster than they wore off used to
  // freeze a foe in place for the rest of the wave.)
  stun(e, t) {
    if (e.dead || e.boss || e.stunImmune > 0 || e.enraged) return;
    if (e.stunT > 0) { e.stunT = Math.max(e.stunT, Math.min(t, HOLD.stunChain - (e.stunChain || 0))); return; }
    e.stunChain = 0; e.stunT = t;
  }

  damage(e, amount, type, src, o = {}) {
    if (e.dead || amount <= 0) return 0;
    const D = e.def;
    // Mirror Mage: the first magic bolt in a while is turned back on the tower that cast it.
    if (D.reflect && type === 'magic' && !o.dot && src && src.type && TOWERS[src.type] && !(e.reflectCd > 0)) {
      e.reflectCd = D.reflect.cd;
      if (!src.cleanse) src.disabledT = Math.max(src.disabledT || 0, D.reflect.disable);
      this.damageTower(src, src.maxHp * D.reflect.dmg, towerHitSrc('reflect', D.name));
      this.emit('reflect', { enemy: e, tower: src });
      return 0;
    }
    let mult = 1;
    // Phalanx: shields locked together shrug off single shots; splash, fire and the hero's shots from above break the wall.
    if (D.phalanx && !o.dot) {
      if (o.splash || type === 'fire' || o.hero) e.brokeT = D.phalanx.broken;
      else if (type === 'physical' && this.time - (e.lockAt ?? -9) < 0.3 && !(e.brokeT > 0)) mult *= D.phalanx.cut;
    }
    if (e.bannerT > 0) mult *= 1 - ENEMIES.herald.banner.cut;   // near a Standard-Bearer
    const vital = o.crit && this.boons.vital;
    if (vital) { /* crits skip armor and resistance */ }
    else if (type === 'physical' || type === 'fire') {
      let armor = e.armor + (e.buffT > 0 ? ENEMIES.warchief.aura.armor : 0) - e.shred - 15 * this.boon('armorbreak') - (o.hero ? this.bonus.heroPierce : 0) - (o.pierce || 0);
      if (type === 'fire') armor *= 0.5;
      armor = Math.max(0, Math.min(80, armor));
      mult *= 1 - armor / 100;
    } else if (type === 'magic') {
      if (!o.pierceMr) mult *= 1 - Math.max(-50, Math.min(80, e.mr)) / 100;
    }
    if (e.markT > 0) mult *= 1 + GARRISON.mark.dmg;
    if (e.slowT > 0 && e.vuln) mult *= 1 + e.vuln;
    if (e.zvT > 0) mult *= 1 + e.zv;
    if (e.hexT > 0) mult *= 1 + e.hex;
    if (e.burnT > 0 && this.boons.kindling) mult *= 1 + 0.15 * this.boons.kindling;
    if (e.blocker && !e.blocker.dead && e.blocker.pin) mult *= 1 + e.blocker.pin;
    if (this.boons.executioner && e.hp < e.maxHp * 0.25) mult *= 1 + 0.3 * this.boons.executioner;
    if (this.boons.coldsnap && ((e.slowT > 0 && e.slow > 0) || e.stunT > 0)) mult *= 1 + 0.1 * this.boons.coldsnap;
    if (this.boons.opening && e.hp >= e.maxHp && !o.dot) mult *= 1 + 0.25 * this.boons.opening;
    if (this.hymnT > 0 && (src === 'hero' || src?.type || src?.troop)) mult *= 1 + ABILITIES.hymn.boost;
    if (this.boons.warpath && src?.type && this.combo >= 10) mult *= 1 + 0.15 * this.boons.warpath;
    if (e.air) mult *= (1 + 0.3 * this.boon('antiair')) * (1 + this.bonus.airDmg);
    if (o.bossMult && e.boss) mult *= o.bossMult;
    if (o.armoredMult && e.armor >= 30) mult *= o.armoredMult;
    let dmg = amount * mult;
    if (e.shield > 0) {
      // Bubble shields (Warlock wards, Vanguard shields) soak damage, but arcane damage bursts them twice as fast.
      const k = type === 'magic' ? 2 : 1, need = dmg * k;
      if (need <= e.shield) { e.shield -= need; dmg = 0; } else { dmg -= e.shield / k; e.shield = 0; }
    }
    e.hp -= dmg;
    if (!o.dot) e.flash = 0.08;
    const total = amount * mult;
    if (src === 'hero') this.stats.heroDmg += total;
    else if (src && src.type) {
      src.dmg += total;
      this.stats.dmgByTower[src.type] = (this.stats.dmgByTower[src.type] || 0) + total;
    }
    if (e.boss) this.stats.bossDmg += total;
    if (o.crit && !o.dot && !o.noCritFx) {
      if (this.boons.critgold) this.addGold(2 * this.boons.critgold);
      if (this.boons.critboom) {
        for (const n of this.enemies) {
          if (n === e || n.dead || n.air !== e.air || Math.hypot(n.x - e.x, n.y - e.y) > 0.9) continue;
          this.damage(n, total * 0.4, 'magic', src, { dot: true, noCritFx: true });
        }
        this.emit('impact', { x: e.x, y: e.y, kind: 'ball', splash: 0.9 });
      }
    }
    if (!o.dot && (o.hero || o.crit || total > e.maxHp * 0.2)) this.emit('hit', { enemy: e, dmg: total, crit: o.crit, hero: o.hero, headshot: o.headshot });
    if (e.hp <= 0) this.kill(e, src, o.hero && !o.dmgDealt ? { ...o, dmgDealt: amount } : o);
    return total;
  }

  kill(e, src, o = {}) {
    if (e.dead) return;
    e.dead = true;
    const hero = src === 'hero';
    const w = this.wave;
    let bounty = e.def.bounty * (e.raised ? 0.3 : 1) * (e.boss ? 1 + this.boon('plunder') : 1) * (e.def.steal ? 1 + this.boon('thieftaker') : 1);
    const gold = this.addGold(eco.killGold(bounty, w, { hero, goldBonus: this.killGoldBonus() + (hero ? 0.6 * this.boon('golden') + this.bonus.heroGold : 0) }) + (hero ? (3 + Math.floor(w / 10)) * this.boon('bloodlust') : 0));
    const points = Math.round(eco.killPoints(e.def.points * (e.boss ? 1 + this.boon('plunder') : 1), w, { hero, combo: this.comboMult() }) * this.scoreMult());
    this.score += points;
    this.stats.kills++;
    this.stats.killsByType[e.boss || e.type] = (this.stats.killsByType[e.boss || e.type] || 0) + 1;
    if (hero) this.stats.heroKills++;
    if (e.boss) { this.stats.bossKills++; if (this.mode === 'endurance') this.bossDown = true; }
    if (src && src.type) { src.kills++; this.stats.killsByTower[src.type] = (this.stats.killsByTower[src.type] || 0) + 1; }
    else if (src && src.troop) this.troopKilled(src, e);
    this.addValor(points * VALOR.perPoint);
    this.addMuster(hero ? GARRISON.muster.hero : e.boss ? GARRISON.muster.boss : 1);
    if (e.def.split) for (let i = 0; i < e.def.split.n; i++) this.spawnChild(e, e.def.split.into, 1);
    if (e.def.blast) {
      // Powder Goblin: the keg goes up where it falls, hurting and jamming towers beside it.
      const B = e.def.blast;
      for (const t of this.towers) {
        if (t.ruined || TOWERS[t.type].trap || Math.hypot(t.cx - e.x, t.cy - e.y) > B.range + 0.5) continue;
        this.damageTower(t, B.dmg * Math.sqrt(this.plan?.hp || 1), towerHitSrc('bomber'));
        if (!t.cleanse) t.disabledT = Math.max(t.disabledT || 0, B.stun);
      }
      this.emit('blast', { x: e.x, y: e.y, r: B.range });
    }
    if (e.def.steal) this.stats.thieves = (this.stats.thieves || 0) + 1;
    if (e.burnSrc && e.burnSrc.stats?.spread) {
      for (const n of this.enemies) if (!n.dead && !n.air && Math.hypot(n.x - e.x, n.y - e.y) < 1) { n.burnT = Math.max(n.burnT, 2); n.burn = Math.max(n.burn, e.burn * 0.6); n.burnSrc = e.burnSrc; }
    }
    if (e.poisonT > 0 && e.poisonSrc && e.poisonSrc.stats?.poisonSpread) {
      for (const n of this.enemies) if (!n.dead && n !== e && Math.hypot(n.x - e.x, n.y - e.y) < 1.2) this.poison(n, e.poisonSrc.stats, e.poisonSrc);
    }
    if (e.blocker) e.blocker = null;
    if (!e.def.structure) {
      if (this.boons.bloodmortar && !this.noMend) this.wall.hp = Math.min(this.wall.maxHp, this.wall.hp + this.wall.maxHp * 0.0025 * this.boons.bloodmortar);
      if (this.boons.soulharvest) for (const a of Object.values(this.abilities)) if (a.cd > 0) a.cd = Math.max(0, a.cd - 0.12 * this.boons.soulharvest);
      // Volatile Corpses: tower kills burst (a burst kill does not burst again)
      if (this.boons.volatile && src?.type && !o.corpse) {
        for (const n of this.enemies) if (n !== e && !n.dead && n.air === e.air && Math.hypot(n.x - e.x, n.y - e.y) < 0.85) this.damage(n, e.maxHp * 0.2, 'physical', src, { dot: true, corpse: true, splash: true });
        this.emit('impact', { x: e.x, y: e.y, kind: 'ball', splash: 0.85 });
      }
      // Ricochet: a killing shot from the wall carries on to the nearest foe
      if (hero && this.boons.ricochet && !o.ricochet && o.dmgDealt) {
        let best = null, bd = 2.2;
        for (const n of this.enemies) { if (n === e || n.dead || n.burrowT > 0) continue; const d = Math.hypot(n.x - e.x, n.y - e.y); if (d < bd) { bd = d; best = n; } }
        if (best) { this.emit('ricochet', { x: e.x, y: e.y, tx: best.x, ty: best.y }); this.damage(best, o.dmgDealt * (0.3 + 0.3 * this.boons.ricochet), 'physical', 'hero', { hero: true, ricochet: true }); }
      }
    }
    this.emit('kill', { enemy: e, gold, points, hero, src });
  }

  pickTarget(t, s, exclude) {
    let best = null, bv = Infinity;
    const range = s.range * this.hazardRangeMult();
    const mode = t.targetMode;
    for (const e of this.enemies) {
      if (e.dead || e.stealthT > 0 || e.burrowT > 0) continue;
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
    const rateMult = this.hazardRateMult() * (this.hornT > 0 ? 1 + ABILITIES.horn.rate : 1) * (this.boon('lastline') && this.wall.hp < this.wall.maxHp * 0.35 ? 1 + 0.25 * this.boon('lastline') : 1);
    for (const t of this.towers) {
      const s = t.stats;
      t.recoil = Math.max(0, t.recoil - dt * 4);
      if (t.frozenT > 0) t.frozenT -= dt;
      if (t.ruined) { t.beam = null; continue; }
      if (t.cleanse && t.disabledT > 0) t.disabledT = 0;
      if (t.healRate && t.hp < t.maxHp && !this.noMend) t.hp = Math.min(t.maxHp, t.hp + t.maxHp * t.healRate * dt);
      if (t.disabledT > 0) { t.disabledT -= dt; t.beam = null; continue; }
      if (s.heatMax) t.heat = (this.time - (t.lastFire ?? -9) < 0.7) ? Math.min(1, (t.heat || 0) + dt / (TOWERS[t.type].heatTime || 4)) : Math.max(0, (t.heat || 0) - dt * 0.7);
      const def = TOWERS[t.type];
      if (def.passive) continue;
      if (def.trap) { this.trapStep(t, s, dt); continue; }
      if (t.type === 'barracks') { this.barracksStep(t, s, dt); continue; }
      if (def.beam) { this.beamStep(t, s, dt); continue; }
      if (t.chilledT > 0) t.chilledT -= dt;
      t.cd -= dt * rateMult * (t.chilledT > 0 ? 0.5 : 1);
      if (t.cd > 0) continue;
      if (def.pulse) {
        let any = false;
        for (const e of this.enemies) {
          if (e.dead || Math.hypot(e.x - t.cx, e.y - t.cy) > s.range * this.hazardRangeMult()) continue;
          any = true;
          e.slow = Math.max(e.slow, s.slow); e.slowT = Math.max(e.slowT, s.slowTime); e.vuln = Math.max(e.vuln || 0, s.vuln);
          if (s.freezeChance && this.rng.chance(s.freezeChance)) this.stun(e, 1);
          if (s.pull) this.pull(e, s.pull * (e.boss ? 0.5 : 1));
          this.damage(e, s.dmg, 'magic', t, { bossMult: s.bossMult, armoredMult: s.armoredMult });
        }
        if (any) { t.cd = 1 / s.rate; t.recoil = 1; this.emit('pulse', { x: t.cx, y: t.cy, r: s.range, tower: t }); }
        else t.cd = 0.15;
        continue;
      }
      const targets = [];
      const ex = new Set();
      for (let k = 0; k < s.multi; k++) { const e = this.pickTarget(t, s, ex); if (!e) break; targets.push(e); ex.add(e); }
      if (!targets.length) { t.cd = 0.1; continue; }
      t.cd = 1 / (s.rate * (1 + (s.heatMax || 0) * (t.heat || 0)));
      t.lastFire = this.time;
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
      this.damage(cur, dmg, common.type, common.src, { crit: common.crit, pierceMr: s.pierceMr, bossMult: common.bossMult, armoredMult: common.armoredMult, hero: common.src === 'hero' });
      const hx = common.src && common.src.stats && common.src.stats.hex;
      if (hx && !cur.dead) { cur.hex = Math.max(cur.hex || 0, hx); cur.hexT = common.src.stats.hexTime; }
      dmg *= s.chainFalloff;
      let next = null, nd = s.chainRange;
      for (const e of this.enemies) {
        if (e.dead || hit.has(e) || e.stealthT > 0 || e.burrowT > 0) continue;
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
    // Foes hit harder every wave, so the garrison toughens with them or it would melt by wave 20.
    const hpScale = Math.max(1, Math.sqrt(this.plan.hp) * 0.75);
    for (const so of t.soldiers) {
      so.maxHp = s.soldierHp * hpScale; so.dmg = s.soldierDmg * Math.max(1, Math.sqrt(this.plan.hp) * 0.6); so.armor = s.soldierArmor; so.pin = s.pin; so.respawnT = s.respawn;
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
          if (e.dead || e.air || e.boss || e.type === 'ram' || e.blocker || e.burrowT > 0 || e.holdImmune > 0 || e.enraged || e.def.structure) continue;
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
          if (s.ranged && foe !== so.target) this.projectiles.push({ kind: 'arrow', src: t, dmg: so.dmg, type: 'physical', x: so.x, y: so.y, target: foe, lx: foe.x, ly: foe.y, speed: 12, splash: 0, chain: 0, s: {} });
          else this.damage(foe, so.dmg, 'physical', t);
          so.swing = 0.2;
        }
      }
      if (so.swing > 0) so.swing -= dt;
    }
  }

  killSoldier(so) {
    so.dead = true; so.respawn = so.respawnT || TOWERS.barracks.respawn;
    for (const e of this.enemies) if (e.blocker === so) e.blocker = null;
    so.target = null;
    this.emit('soldierDown', { x: so.x, y: so.y });
  }

  beamStep(t, s, dt) {
    const want = s.beams;
    t.beam = (t.beam || []).filter((b) => !b.e.dead && b.e.stealthT <= 0 && !(b.e.burrowT > 0) && Math.hypot(b.e.x - t.cx, b.e.y - t.cy) <= s.range * this.hazardRangeMult());
    const ex = new Set(t.beam.map((b) => b.e));
    while (t.beam.length < want) {
      const e = this.pickTarget(t, s, ex);
      if (!e) break;
      t.beam.push({ e, ramp: 1 }); ex.add(e);
    }
    for (const b of t.beam) {
      b.ramp = Math.min(s.rampMax, b.ramp + s.ramp * dt);
      this.damage(b.e, s.dps * b.ramp * dt * this.hazardRateMult(), 'magic', t, { dot: true, bossMult: s.bossMult, armoredMult: s.armoredMult });
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
      if (d < p.speed * dt || t.ruined) { this.damageTower(t, p.dmg, p.src); return false; }
      p.x += ((t.cx - p.x) / d) * p.speed * dt; p.y += ((t.cy - p.y) / d) * p.speed * dt;
      return true;
    }
    if (p.kind === 'jav') {
      const t = p.target;
      if (t.dead || t.state === 'reserve') return false;
      const d = Math.hypot(t.x - p.x, t.y - 0.2 - p.y);
      if (d < p.speed * dt) { this.hurtTroop(t, p.dmg); return false; }
      p.x += ((t.x - p.x) / d) * p.speed * dt; p.y += ((t.y - 0.2 - p.y) / d) * p.speed * dt;
      p.ang = Math.atan2(t.y - 0.2 - p.y, t.x - p.x);
      return true;
    }
    if (p.kind === 'hero') return this.stepHero(p, dt);
    if (p.kind === 'bolt') {
      const mv = p.speed * dt;
      p.x += p.dx * mv; p.y += p.dy * mv; p.left -= mv;
      for (const e of this.enemies) {
        if (e.dead || e.air || p.hitSet.has(e) || e.burrowT > 0) continue;
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
        else {
          const got = this.damage(tgt, p.dmg, p.type, p.src, { crit: p.crit, bossMult: p.bossMult, armoredMult: p.armoredMult, pierce: p.pierceArmor, pierceMr: p.pierceMr });
          if (p.src && p.src.troop) this.noteTroopDmg(p.src, got);
          if (p.s && p.s.poison && !tgt.dead) this.poison(tgt, p.s, p.src);
          const hx = p.src && p.src.stats && p.src.stats.hex;
          if (hx && !tgt.dead) { tgt.hex = Math.max(tgt.hex || 0, hx); tgt.hexT = p.src.stats.hexTime; }
        }
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
      this.damage(e, p.dmg * fall * (p.splashScale || 1), p.type, p.src, { crit: p.crit, bossMult: p.bossMult, armoredMult: p.armoredMult, hero: p.src === 'hero', splash: true });
      if (p.flaskKind && !e.dead) this.applyFlask(e, p.flaskKind, p);
      if (p.shred) { e.shred = Math.max(e.shred, p.shred); e.shredT = 4; }
      if (p.stun) this.stun(e, p.stun);
      if (p.burn && !p.flaskKind) { e.burn = Math.max(e.burn, p.burn); e.burnT = Math.max(e.burnT, 3); e.burnSrc = p.src === 'hero' ? 'hero' : p.src || 'hero'; }
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
        if (e.dead || p.hitSet.has(e) || e.burrowT > 0) continue;
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

  // The effects of an Alchemist's flask on one foe.
  applyFlask(e, kind, p) {
    if (kind === 'fire') { e.burn = Math.max(e.burn, (p.burnBase || WEAPONS.flasks.burn) * (1 + 0.35 * this.boon('pyro'))); e.burnT = Math.max(e.burnT, 3); e.burnSrc = 'hero'; }
    else if (kind === 'acid') { e.shred = Math.max(e.shred, 25); e.shredT = Math.max(e.shredT || 0, 5); }
    else if (kind === 'frost') { e.slow = Math.max(e.slow, 0.5); e.slowT = Math.max(e.slowT, 3); }
  }
  // The Bell of Thunder: every foe in a cone ahead of the wall is struck and stunned. Extra tolls (Mastery) fan out at half damage.
  bellToll(o, ang, dmg, W, crit) {
    const C = W.cone, tolls = [[0, 1], ...Array.from({ length: W.extra || 0 }, (_, i) => [(i % 2 ? 1 : -1) * C.arc * 1.6 * (1 + Math.floor(i / 2)), 0.5])];
    let n = 0;
    for (const [da, k] of tolls) {
      const a0 = ang + da;
      for (const e of this.enemies) {
        if (e.dead || e.burrowT > 0 || !this.isVisible(e)) continue;
        const d = Math.hypot(e.x - o.x, e.y - o.y);
        if (d > C.range) continue;
        const da2 = Math.atan2(Math.sin(Math.atan2(e.y - o.y, e.x - o.x) - a0), Math.cos(Math.atan2(e.y - o.y, e.x - o.x) - a0));
        if (Math.abs(da2) > C.arc && d > 0.8) continue;
        this.damage(e, dmg * k * (crit ? 2.5 : 1), W.type, 'hero', { hero: true, crit });
        if (!e.dead) this.stun(e, C.stun);
        n++;
      }
    }
    this.registerHeroHit(n > 0, false);
    this.emit('bellToll', { ox: o.x, oy: o.y, ang, arc: C.arc, range: C.range, n });
  }
  heroHit(p, e) {
    const isMain = p.main && p.hitSet.size === 1;
    const head = isMain && p.headshot && e === p.intended;
    let dmg = p.dmg * (p.crit ? 2.5 + 0.5 * this.boon('killer') + 0.5 * this.boon('deadeye') : 1) * (head ? COMBO.headshotMult + 0.6 * this.boon('headhunter') + this.bonus.headshotMult : 1);
    if (p.main) dmg *= this.comboMult() > 1 ? 1 + (this.comboMult() - 1) * 0.5 : 1;
    if (p.airMult > 1 && e.air) dmg *= p.airMult;
    if (isMain) this.registerHeroHit(true, head);
    this.damage(e, dmg, p.type, 'hero', { hero: true, crit: p.crit || head, headshot: head });
    // Boss-breaker shots: a slice of the boss's own health, ignoring armor and resistance.
    if (p.bossPct && e.boss && !e.dead) this.damage(e, e.maxHp * p.bossPct, 'true', 'hero', { hero: true });
    if (!e.dead) { if (!(e.markT > 0)) this.emit('mark', { enemy: e }); e.markT = GARRISON.mark.time; }
    if (p.burn && !e.dead) { e.burn = Math.max(e.burn, p.burn * (1 + 0.35 * this.boon('pyro'))); e.burnT = 3; e.burnSrc = 'hero'; }
    if (p.splash) this.explode({ ...p, dmg: dmg * p.splashFrac, src: 'hero', kind: 'heroBlast', exclude: e }, e.x, e.y);
    if (p.chain) this.chainHit(e, { chain: p.chain, chainRange: p.chainRange || 1.6, chainFalloff: 0.75 }, { src: 'hero', dmg: dmg * 0.75, type: p.type }, [{ x: e.x, y: e.y }]);
    if (p.flaskKind && !e.dead) this.applyFlask(e, p.flaskKind, p);
    // Grapple Crossbow: yank it back down the road.
    if (p.pull && !e.dead && !e.air) this.pull(e, p.pull * (e.boss ? 0.5 : 1));
    // Harpoon Gun: drag a flyer out of the sky for a while.
    if (p.ground && e.air && !e.dead && !e.boss) { e.air = false; e.wasAir = true; e.groundT = p.ground; this.emit('grounded', { enemy: e }); }
  }

  registerHeroHit(hit, head = false) {
    if (hit) {
      this.stats.hits++;
      if (head) this.stats.headshots++;
      this.combo++;
      this.comboT = COMBO.decay * (1 + 0.5 * this.boon('combo')) * this.bonus.comboDecay;
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
      v: 1, seed: this.seed, mapId: this.mapId, mode: this.mode, level: this.level, hero: this.hero, points: this.points, trial: this.trial?.id, draft: this.draft, autoSpent: this.autoSpent || null, modifiers: this.modifiers, ascension: this.ascension,
      portrait: this.portrait, wave: this.wave, start: this.start, pickQueue: this.pickQueue, gold: this.gold, score: this.score,
      castle: this.castle, wall: this.wall, boons: this.boons, boonOffer: this.boonOffer, rerolls: this.rerolls,
      secondWind: this.secondWind, repairKits: this.repairKits, weapon: { id: this.weapon.id, lv: this.weapon.lv },
      claimed: [...this.claimed], claims: this.claims, abilities: this.abilities, loadout: this.loadout,
      stats: this.stats, rng: this.rng.state, started: this.started, clock: this.clock, stage: this.stage, mapSeed: this.mapSeed, challenge: this.opts.challenge || null, scout: this.opts.scout || null, tutorial: this.tutorial, march: this.march?.id || null, vanguard: this.vanguard,
      garrison: this.serializeGarrison(),
      towers: this.towers.map((t) => ({ pts: t.pts, type: t.type, x: t.x, y: t.y, tier: t.tier, spec: t.spec, invested: t.invested, hp: t.hp, targetMode: t.targetMode, ruined: t.ruined, kills: t.kills, dmg: t.dmg, ally: t.ally, allyWaves: t.allyWaves, mastery: t.mastery })),
    };
  }

  load(s) {
    this.started = !!s.started; this.clock = s.clock || 0;
    if (this.puzzle) this.points = s.points ?? this.siegeCfg.points;
    if (this.drafting && s.draft) this.draft = { hand: { ...s.draft.hand }, offer: s.draft.offer || null, picks: s.draft.picks || 0 };
    if (s.autoSpent) this.autoSpent = { ...s.autoSpent };
    this.wave = s.wave; this.start = s.start || 1; this.pickQueue = s.pickQueue || 0; this.gold = s.gold; this.score = s.score;
    this.castle = { ...s.castle }; this.wall = { ...s.wall };
    // Retired boons from older saves are swapped or dropped (Highlander became Witchcraft in v1.27).
    const fix = (id) => (id === 'highlander' ? 'witchcraft' : id);
    this.boons = {}; for (const [id, n] of Object.entries(s.boons || {})) { const k = fix(id); if (BOONS.some((b) => b.id === k)) this.boons[k] = (this.boons[k] || 0) + n; }
    this.boonOffer = Array.isArray(s.boonOffer) ? s.boonOffer.map(fix).filter((id) => BOONS.some((b) => b.id === id)) : s.boonOffer; this.rerolls = s.rerolls;
    this.secondWind = s.secondWind; this.repairKits = s.repairKits || 0;
    this.weapon = { id: s.weapon.id, lv: { ...s.weapon.lv }, ammo: 0, reloadT: 0 };
    this.stats = { ...this.stats, ...s.stats };
    this.rng.state = s.rng;
    this.towers = s.towers.map((d) => {
      const t = this.makeTower(d.type, d.x, d.y, d.tier);
      Object.assign(t, { pts: d.pts, mastery: d.mastery || 0, spec: d.spec, invested: d.invested, targetMode: d.targetMode, ruined: d.ruined, kills: d.kills, dmg: d.dmg, ally: d.ally, allyWaves: d.allyWaves, fresh: false });
      this.applyTierHp(t); t.hp = d.hp;
      return t;
    });
    // Older saves predate plots: keep every tower where it stands and open the plots under them.
    this.claimed = new Set(Array.isArray(s.claimed) ? s.claimed : this.map.startPlots);
    this.claims = s.claims || 0;
    this.loadGarrison(s.garrison);
    for (const id of Object.keys(this.abilities)) this.abilities[id].cd = s.abilities?.[id]?.cd || 0;
    if (!Array.isArray(s.claimed)) for (const t of this.towers) if (!TOWERS[t.type].trap) this.claimed.add(this.plotKey(t.x, t.y));
    this.phase = 'build';
    this.buildTimer = this.started ? this.breakTime() : (this.mode === 'laststand' || this.mode === 'endurance' || this.puzzle ? Infinity : GAME.buildTime);
    this.refreshTowers();
    this.weapon.ammo = this.weaponStats().ammo;
  }

  summary() {
    const s = this.stats;
    const dmgTotal = Object.values(s.dmgByTower).reduce((a, b) => a + b, 0) + s.heroDmg;
    return {
      seed: this.seed, map: this.mapId, mode: this.mode, modifiers: this.modifiers, ascension: this.ascension,
      wave: this.wave, start: this.start, rankWave: eco.rankFor(this.wave, this.start, s.wavesCleared), wavesCleared: s.wavesCleared, score: this.score, kills: s.kills, heroKills: s.heroKills,
      shots: s.shots, hits: s.hits, headshots: s.headshots, duration: Math.round(s.time), maxCombo: s.maxCombo,
      bossKills: s.bossKills, bossDmg: Math.round(s.bossDmg), towersBuilt: s.towersBuilt, goldEarned: s.goldEarned,
      killsByType: s.killsByType, killsByTower: s.killsByTower, artUses: s.artUses, dmgByTower: s.dmgByTower, heroDmg: s.heroDmg, dmgTotal, flawless: s.flawless,
      specs: s.specs, mintGold: s.mintGold, peakGold: s.peakGold, goldSpent: s.goldSpent, maxTowers: s.maxTowers,
      maxFlawlessStreak: s.maxFlawlessStreak, repairs: s.repairs, earlyCalls: s.earlyCalls, boons: this.boons,
      gems: s.gems || 0, credited: s.credited || {}, clock: Math.round(this.clock), victory: this.victory, stage: this.stage, level: this.level, hero: this.hero, points: this.points, trial: this.trial?.id, stars: this.stars || 0, roster: this.siege?.roster,
      troopKills: s.troopKills, troopDmg: Math.round(s.troopDmg), troopsTrained: s.troopsTrained, troopsLost: s.troopsLost, valorEarned: Math.round(s.valorEarned), maxTroopRank: s.maxTroopRank, musterRecruits: s.musterRecruits,
      abilities: s.abilities || 0, vanguard: this.vanguard, march: this.march?.id || null, challenge: this.opts.challenge || null, weapon: this.weapon.id, builtByTower: s.builtByTower, maxMastery: s.maxMastery || 0,
    };
  }
}

Object.assign(Game.prototype, garrisonMethods);

function pathLength(p) {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return L;
}
