// v1.59: Commander Mode (internally mode 'hero'): ⚡ and a deck of commands, the active reload, Fever, Ultimates,
// Commander levels and perks, weak points, bounties, quests, the engineers' orders.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { GAME, WEAPONS } from '../src/data/balance.js';
import { COMMANDER, COMMANDS, DEFAULT_DECK, DOCTRINES, ULTS, PERKS, QUESTS, BUILD_ORDERS, cleanDeck } from '../src/game/commander.js';
import { validateRun } from '../src/game/rules.js';
import { defaultProfile, recordRun } from '../src/meta/profile.js';
import { ACHIEVEMENTS } from '../src/meta/achievements.js';

const step = (g, sec) => { for (let t = 0; t < sec && !g.over; t += GAME.step) { g.update(GAME.step); g.tickBuild(GAME.step); } };
// A Commander at wave 12, mid-wave, with the field cleared for the test
const arena = (cmd = {}, o = {}) => {
  const g = new Game({ seed: 'cm-t', mapId: 'meadow', mode: 'hero', startWave: 12, commander: cmd, ...o });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  g.startWave(); g.spawnQueue = []; g.enemies = [];
  g.keeper = foe(g, 'grunt', 1.2, 1.2, 1e12);   // keeps the wave going while a test runs
  return g;
};
const foe = (g, type = 'grunt', x = 8, y = 6, hp = 1e6) => { const e = g.spawnEnemy(type, 0); e.x = x; e.y = y; e.hp = e.maxHp = hp; e.armor = 0; e.mr = 0; e.speed = 0; e.seg = 0; return e; };
const shoot = (g, e) => g.heroFire(e.x, e.y - e.size * 0.35 - (e.air ? 0.35 : 0), 0, 0.7);

test('only Commander Mode has a Commander; the doctrine and deck are cleaned', () => {
  assert.equal(new Game({ seed: 'n', mapId: 'meadow', mode: 'normal' }).cmdr, null);
  assert.equal(new Game({ seed: 'd', mapId: 'meadow', mode: 'duo' }).cmdr, null, 'the Duo hero is not a Commander');
  const g = new Game({ seed: 'c', mapId: 'meadow', mode: 'hero', commander: { doctrine: 'nope', deck: ['volley', 'volley', 'bogus', 'mark'] } });
  assert.equal(g.cmdr.doctrine, 'marksman');
  assert.equal(g.cmdr.deck.length, COMMANDER.deckSize);
  assert.deepEqual(g.cmdr.deck.slice(0, 2), ['volley', 'mark']);
  assert.deepEqual(cleanDeck(), DEFAULT_DECK);
  for (const D of Object.values(DOCTRINES)) assert.ok(ULTS[D.ult]);
});

test('⚡ fills with time, hand hits and kills; commands spend it and recharge', () => {
  const g = arena(); const C = g.cmdr;
  C.cp = 0; step(g, 2);
  assert.ok(C.cp > 0.5, 'it regenerates during a wave');
  C.cp = 0;
  const e = foe(g, 'grunt', 8, 6, 30);
  assert.ok(shoot(g, e)); step(g, 1);
  assert.ok(C.cp >= COMMANDER.cp.hit, 'a hit pays');
  C.cp = 10;
  assert.equal(C.cmdBlock('overcharge'), null);
  assert.ok(C.command('overcharge'));
  assert.equal(C.cp, 10 - COMMANDS.overcharge.cost);
  assert.equal(C.cmdBlock('overcharge'), 'cd');
  C.cp = 0; C.cds.frost = 0;
  assert.equal(C.cmdBlock('frost'), 'cp');
  assert.equal(C.command('volley'), false, 'aimed commands need a point');
  g.enemies = []; g.spawnQueue = []; step(g, 0.2);
  assert.equal(g.phase, 'build'); C.cp = 10;
  assert.equal(C.cmdBlock('frost'), 'wave', 'commands work in a wave only');
});

test('every command does what it says', () => {
  let g = arena(); let C = g.cmdr; C.deck = Object.keys(COMMANDS); for (const id of C.deck) C.cds[id] = 0;
  const pay = () => { C.cp = 99; };
  // Volley
  let e = foe(g); pay(); assert.ok(C.command('volley', { x: e.x, y: e.y })); step(g, 1.2); assert.ok(e.hp < 1e6, 'volley');
  // Firebomb
  e = foe(g, 'grunt', 10, 6); pay(); const n0 = g.fields.length; assert.ok(C.command('firebomb', { x: e.x, y: e.y })); assert.equal(g.fields.length, n0 + 1); const h0 = e.hp; step(g, 1); assert.ok(e.hp < h0, 'firebomb');
  // Frost Rounds
  pay(); assert.ok(C.command('frost')); assert.equal(C.frostShots, COMMANDS.frost.shots);
  e = foe(g, 'grunt', 9, 6); g.weapon.ammo = 9; assert.ok(shoot(g, e)); step(g, 1.2); assert.ok(g.enemies.some((x) => x.slowT > 0 && x.slow >= COMMANDS.frost.slow) && C.frostShots === COMMANDS.frost.shots - 1, 'frost');
  // Piercing Shot
  pay(); assert.ok(C.command('pierce')); const p0 = g.projectiles.length; g.weapon.ammo = 9; shoot(g, e); const p = g.projectiles[p0];
  assert.ok(p.pierce >= 99 && p.cmdrPierce && C.pierceShots === 0, 'pierce');
  // Mark for Death: towers shoot it first and it takes more from everything
  const far = foe(g, 'grunt', 3, 3), near = foe(g, 'grunt', 12, 8);
  pay(); assert.ok(C.command('mark', null, far));
  assert.ok(far.cmdrMarkT > 0 && C.vulnOf(far) > 1 && C.vulnOf(near) === 1);
  const t = { cx: 3.5, cy: 3.5, targetMode: 'close' }, s = { range: 9, minRange: 0, targets: 'ga' };
  assert.equal(g.pickTarget(t, s, null), far);
  // Overcharge
  pay(); assert.ok(C.command('overcharge')); assert.ok(C.towerRate() > 1);
  // Shield Wall
  g.wall.hp = g.wall.maxHp * 0.5; const w0 = g.wall.hp; pay(); assert.ok(C.command('shield')); assert.ok(g.wall.hp > w0 && C.leakCut() < 1);
  // Muster
  const u0 = g.garrison.units.length; pay(); assert.ok(C.command('muster')); assert.equal(g.garrison.units.length, u0 + COMMANDS.muster.n);
  // Plunder: hand kills pay twice
  pay(); assert.ok(C.command('plunder'));
  const k = foe(g, 'grunt', 9, 7, 1); const gold0 = g.gold; g.damage(k, 10, 'physical', 'hero', { hero: true });
  const plain = new Game({ seed: 'cm-t', mapId: 'meadow', mode: 'normal', startWave: 12 });
  assert.ok(g.gold - gold0 > 0 && C.stats.commands >= 9);
  void plain;
});

test('the active reload: an empty quiver reloads all at once; the gold window gives a full quiver and a boost, an early tap jams', () => {
  const g = arena(); const C = g.cmdr, W = g.weaponStats();
  g.weapon.ammo = 0; step(g, 0.05);
  const w = C.reloadWindow();
  assert.ok(w && w.p < w.a, 'a window to aim for');
  // too early: a jam, once per reload
  assert.equal(C.activeReload(), 'jam'); assert.ok(C.jammed); const t1 = C.fullT;
  assert.equal(C.activeReload(), 'jammed'); assert.equal(C.fullT, t1);
  // the reload finishes anyway, and a fresh one can be timed
  step(g, C.fullMax * 2); assert.equal(g.weapon.ammo, g.weaponStats().ammo);
  g.weapon.ammo = 0; step(g, 0.05);
  C.fullT = C.fullMax * (1 - (C.reloadWindow().a + 0.05));
  let perfect = 0; g.on('perfectReload', () => perfect++);
  assert.equal(C.activeReload(), 'perfect');
  assert.ok(perfect === 1 && g.weapon.ammo === W.ammo && C.perfectT > 0 && C.stats.perfects === 1);
  const e = foe(g); assert.ok(C.hitMult({}, e, false, true) > 1.2, 'perfect reload: +25% damage');
  // Steady Hands widens the window
  const a = C.reloadWindow; void a;
  g.weapon.ammo = 0; step(g, 0.05); const narrow = C.reloadWindow(); C.perks.steady = 2; const wide = C.reloadWindow();
  assert.ok(wide.b - wide.a > (narrow.b - narrow.a) * 1.8);
});

test('Fever: a long combo makes every shot free for a while, then rests', () => {
  const g = arena(); const C = g.cmdr;
  let on = 0; g.on('fever', (d) => { if (d.on) on++; });
  g.combo = COMMANDER.fever.at; step(g, 0.05);
  assert.ok(on === 1 && C.feverT > 0 && C.freeShot());
  const e = foe(g); g.weapon.ammo = 0;
  assert.ok(shoot(g, e), 'no ammo needed');
  assert.equal(g.weapon.ammo, 0);
  step(g, C.feverT + 0.1);
  assert.ok(!C.freeShot());
  g.combo = 0; step(g, 0.05); g.combo = 30; step(g, 0.05);
  assert.equal(on, 1, 'it rests before it can come again');
  step(g, COMMANDER.fever.rest + 0.2); g.combo = 0; step(g, 0.05); g.combo = 30; step(g, 0.05);
  assert.equal(on, 2);
});

test('Ultimates: charged by hand damage; Arrow Storm, Time Warp and Meteor Rain', () => {
  for (const doctrine of Object.keys(DOCTRINES)) {
    const g = arena({ doctrine }); const C = g.cmdr;
    assert.ok(!C.useUlt(), 'not before it is charged');
    for (let i = 0; i < 6; i++) foe(g, 'grunt', 6 + i * 0.4, 6);
    C.ult = COMMANDER.ult.need;
    let fired = null; g.on('ultimate', (d) => (fired = d.kind));
    assert.ok(C.useUlt()); assert.equal(fired, DOCTRINES[doctrine].ult);
    assert.equal(C.ult, 0);
    step(g, 0.5);
    if (doctrine === 'tactician') assert.ok(g.enemies.every((e) => e.slow >= ULTS.warp.slow), 'the horde crawls');
    step(g, 6);
    assert.ok(g.enemies.some((e) => e.hp < 1e6) || g.enemies.length < 6, doctrine + ' hurts the horde');
  }
});

test('Commander levels: hand kills level you up; a choice of three perks waits for the break, and the break waits for you', () => {
  const g = arena(); const C = g.cmdr;
  C.gainXp(COMMANDER.xp.need(1) + COMMANDER.xp.need(2));
  assert.equal(C.lv, 3); assert.equal(C.pending, 2);
  g.enemies = []; g.spawnQueue = []; step(g, 0.1);
  assert.equal(g.phase, 'build'); assert.ok(C.offer && C.offer.length === 3);
  const t0 = g.buildTimer; step(g, 2); assert.equal(g.buildTimer, t0, 'the break waits for your pick');
  const W0 = g.weaponStats(), cp0 = C.cpMax(), w0 = g.wall.maxHp;
  C.offer = ['heavy', 'battery', 'mason']; C.choosePerk('heavy');
  assert.ok(C.offer, 'the second pick follows'); C.offer = ['battery', 'twin', 'mason']; C.choosePerk('battery');
  assert.equal(C.offer, null); assert.equal(C.pending, 0);
  assert.ok(g.weaponStats().dmg > W0.dmg * 1.15 && C.cpMax() === cp0 + 3);
  C.pending = 1; C.offer = ['mason', 'twin', 'eagle']; C.choosePerk('mason'); assert.ok(g.wall.maxHp > w0 * 1.1);
  C.pending = 1; C.offer = ['twin', 'eagle', 'rapid']; C.choosePerk('twin');
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  assert.ok(g.startWave()); g.spawnQueue = []; g.enemies = []; const e = foe(g); g.weapon.ammo = 9; const n0 = g.projectiles.length; shoot(g, e);
  assert.equal(g.projectiles.length - n0, 1 + C.extraArrows(), 'Twin Shot: an extra arrow');
  for (const P of Object.values(PERKS)) assert.ok(P.max >= 1 && P.desc);
});

test('weak points open on bosses: a hit there lands far harder and pays ⚡', () => {
  const g = arena(); const C = g.cmdr;
  const b = foe(g, 'grunt'); b.boss = 'test';
  let opened = 0; g.on('weakPoint', () => opened++);
  step(g, COMMANDER.weak.first + 0.2);
  assert.ok(opened === 1 && b.weakT > 0);
  C.cp = 0; const m = C.hitMult({}, b, false, true);
  assert.ok(m >= COMMANDER.weak.mult && C.cp >= COMMANDER.cp.weak && C.stats.weakHits === 1);
  step(g, COMMANDER.weak.time + 0.2); assert.ok(!(b.weakT > 0), 'it closes again');
});

test('a bounty every wave: slain by hand it pays gold and ⚡; slain by a tower it is lost', () => {
  const g = arena(); const C = g.cmdr;
  for (let i = 0; i < 4; i++) foe(g, 'grunt', 6 + i, 6, 1e7);
  step(g, 2.5);
  const B = C.bounty; assert.ok(B && B.bounty);
  let slain = null; g.on('bountySlain', (d) => (slain = d));
  const gold0 = g.gold; C.cp = 0;
  g.damage(B, B.maxHp * 10, 'physical', 'hero', { hero: true });
  assert.ok(slain && slain.gold > 0 && g.gold > gold0 && C.cp >= COMMANDER.cp.bounty && C.stats.bounties === 1);
  const h = arena(); for (let i = 0; i < 4; i++) foe(h, 'grunt', 6 + i, 6, 1e7);
  step(h, 2.5); let lost = 0; h.on('bountyLost', () => lost++);
  h.damage(h.cmdr.bounty, h.cmdr.bounty.maxHp * 10, 'physical', h.towers[0] || null);
  step(h, 0.1); assert.equal(lost, 1);
});

test('a quest every wave, the same on the same wave and seed; done, it pays', () => {
  const a = arena(), b = arena();
  assert.ok(a.cmdr.quest && QUESTS[a.cmdr.quest.id]);
  assert.equal(a.cmdr.quest.id, b.cmdr.quest.id);
  const C = a.cmdr; C.quest = { id: 'orders', ...QUESTS.orders, prog: 0, done: false, failed: false };
  let done = 0; a.on('questDone', () => done++);
  C.cp = 99; for (const id of C.deck) { C.cds[id] = 0; C.command(id, { x: 8, y: 6 }, foe(a)); }
  assert.ok(done === 1 && C.quest.done && C.stats.quests === 1);
});

test('orders for the engineers: what they spend on and when they mend', () => {
  const g = arena(); const C = g.cmdr;
  assert.equal(C.weaponShare(), BUILD_ORDERS.balanced.weaponShare);
  assert.ok(C.setOrder('arms')); assert.ok(C.weaponShare() > 0.3);
  assert.ok(C.setOrder('walls')); assert.ok(C.wallAt() > 0.9);
  assert.ok(!C.setOrder('nonsense'));
  // arms: the treasury goes to your weapon between waves
  const h = new Game({ seed: 'arm', mapId: 'meadow', mode: 'hero', startWave: 10, commander: { } });
  h.cmdr.setOrder('arms');
  for (let i = 0; i < 6; i++) { h.gold += 2000; step(h, 3); }
  const lv = Object.values(h.weapon.lv).reduce((a, b) => a + b, 0);
  const k = new Game({ seed: 'arm', mapId: 'meadow', mode: 'hero', startWave: 10, commander: { } });
  k.cmdr.setOrder('towers');
  for (let i = 0; i < 6; i++) { k.gold += 2000; step(k, 3); }
  assert.ok(lv > Object.values(k.weapon.lv).reduce((a, b) => a + b, 0), 'Arm me buys more for your weapon than Towers');
});

test('a saved Commander run comes back with its level, perks, ⚡ and stats', () => {
  const g = arena({ doctrine: 'siegebreaker', deck: ['firebomb', 'mark', 'muster', 'plunder'] }); const C = g.cmdr;
  C.lv = 6; C.xp = 3; C.perks = { heavy: 2, twin: 1 }; C.cp = 7; C.ult = 80; C.stats.perfects = 9; C.setOrder('walls');
  const back = new Game({ seed: 'cm-t', mapId: 'meadow', mode: 'hero', save: JSON.parse(JSON.stringify(g.serialize())) });
  const B = back.cmdr;
  assert.equal(B.doctrine, 'siegebreaker'); assert.deepEqual(B.deck, ['firebomb', 'mark', 'muster', 'plunder']);
  assert.equal(B.lv, 6); assert.deepEqual(B.perks, { heavy: 2, twin: 1 }); assert.equal(B.cp, 7); assert.equal(B.ult, 80); assert.equal(B.stats.perfects, 9); assert.equal(B.order, 'walls');
});

test('the run is accepted, and the profile keeps Commander records and achievements', () => {
  const g = new Game({ seed: 'cm-acc', mapId: 'meadow', mode: 'hero' }); g.cmdr.lv = 16; g.cmdr.stats.perfects = 50; g.cmdr.stats.bounties = 25;
  step(g, 40); g.gameOver();
  const s = g.summary();
  assert.ok(s.commander && s.commander.lv === 16);
  assert.equal(validateRun(s), null);
  const p = defaultProfile(); recordRun(p, s);
  assert.equal(p.hero.bestLv, 16); assert.equal(p.hero.perfects, 50); assert.equal(p.hero.bounties, 25);
  const by = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
  assert.ok(by.cmdr_perfect50.check(p) && by.cmdr_lv15.check(p) && by.cmdr_bounty25.check(p));
});

test('working the controls matters: a Commander who fights goes much further than one who only watches', () => {
  const run = (fight) => {
    const g = new Game({ seed: 'cm-play', mapId: 'meadow', mode: 'hero', weapon: 'longbow', commander: { doctrine: 'marksman' } });
    let shotT = 0;
    for (let t = 0; t < 900 && !g.over; t += 0.05) {
      if (g.cmdr.offer) g.cmdr.choosePerk(g.cmdr.offer[0]);
      while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
      if (fight && g.phase === 'wave' && (shotT -= 0.05) <= 0) {
        shotT = 0.15;
        const c = g.map.castle, e = g.enemies.filter((x) => !x.dead && !(x.burrowT > 0)).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
        if (e) { if (!shoot(g, e)) { const w = g.cmdr.reloadWindow(); if (w && w.p > w.a + 0.02 && w.p < w.b - 0.02) g.cmdr.activeReload(); } for (const id of g.cmdr.deck) g.cmdr.command(id, { x: e.x, y: e.y }, e); g.cmdr.useUlt(); }
      }
      g.update(0.05); g.tickBuild(0.05);
    }
    return g;
  };
  const idle = run(false), fought = run(true);
  assert.ok(fought.wave > idle.wave + 3 || (!fought.over && idle.over), `fought to ${fought.wave}, watched to ${idle.wave}`);
  assert.ok(fought.cmdr.stats.commands > 20 && fought.cmdr.stats.ults >= 1 && fought.cmdr.lv > 3);
  void WEAPONS;
});
