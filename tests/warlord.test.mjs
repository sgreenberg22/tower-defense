// v1.58: Warlord as a real-time strategy game: a base to defend, things to build, a hero, the map and the side objective.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AssaultGame, WARLORD, WARLORD_TECH, WARLORD_OBJECTIVES, AUNITS, validateAssaultRun } from '../src/game/assault.js';

const fresh = (seed = 'wl', o = {}) => new AssaultGame({ seed, mode: 'warlord', career: 6, ...o });
const step = (g, sec) => { for (let t = 0; t < sec && !g.over; t += 0.05) g.update(0.05); };
// a raider standing at the keep's gate
const atGate = (g, type = 'grunt') => { const e = g.spawnFoe(type, g.map.paths[0], 0, 0); const p = e.path; e.seg = p.length - 1; e.x = p[p.length - 1].x; e.y = p[p.length - 1].y; return e; };
const clearField = (g) => { for (const e of g.enemies) e.dead = true; g.enemies = []; g.sallyT = 999; g.warbandT = 999; };

test('raiders at the walls lay siege: the palisade first, then the keep, a little at a time', () => {
  const g = fresh('siege');
  clearField(g);
  for (const u of g.units) u.dead = true; g.units = [];
  g.militiaMax = () => 0;                 // no home guard for this test
  g.updateKeep = () => {};                 // and no archer
  const e = atGate(g); e.hp = e.maxHp = 1e6;
  const keep0 = g.castle.hp, wall0 = g.wall.hp;
  assert.ok(wall0 > 0 && wall0 === WARLORD.keep.wall[0]);
  step(g, 0.2);
  assert.ok(e.siege && !e.dead, 'the raider stays at the walls');
  assert.equal(g.castle.hp, keep0, 'the keep takes nothing at once');
  step(g, 4);
  assert.ok(g.wall.hp < wall0 && g.castle.hp === keep0, 'the palisade takes the blows while it stands');
  let down = 0; g.on('wallDown', () => down++);
  step(g, 120);
  assert.ok(down === 1 && g.wallBroke, 'the palisade falls');
  assert.ok(g.castle.hp < keep0, 'then the keep');
  assert.ok(g.stats.besiegers >= 1 && g.stats.keepDmg > wall0);
  // in a plain Assault a raider at the gate still costs the keep at once
  const a = new AssaultGame({ seed: 'siege', mode: 'assault', career: 6 });
  clearField(a); const r = atGate(a); const k0 = a.castle.hp; a.updateEnemies(0.05);
  assert.ok(r.dead && a.castle.hp < k0 && a.wall.maxHp === 0 && !a.posts.length && !a.marshal);
});

test('the palisade mends while no raider is at it, and the War Tent mends it at once', () => {
  const g = fresh('mend'); clearField(g);
  g.wall.hp = 10; step(g, 5);
  assert.ok(g.wall.hp > 10, 'it mends itself');
  g.wall.hp = 10; g.gold = 1000;
  assert.ok(g.repairWall()); assert.equal(g.wall.hp, g.wall.maxHp);
  assert.ok(!g.repairWall(), 'nothing to mend');
});

test('militia turn out when the horde nears the keep, up to the keep level; they do not count against the army', () => {
  const g = fresh('mil'); clearField(g);
  g.besiege = () => {};   // they stand at the gate without striking (this test is about who turns out)
  for (let i = 0; i < 4; i++) { const e = atGate(g); e.hp = e.maxHp = 1e6; e.dmg = 0; }
  step(g, 30);
  assert.equal(g.militiaCount(), WARLORD.militia.max[0], 'level 1 keep: two militia');
  const before = g.alive();
  assert.equal(before, g.engines.length + g.units.filter((u) => !u.def.militia && !u.def.hero).length);
  assert.ok(g.units.filter((u) => u.def.militia).every((u) => u.cmd?.kind === 'hold' && u.cmd.home), 'they hold at the gate');
  g.gold = 1000; assert.ok(g.upgradeKeep());
  assert.ok(g.ringBell(), 'the bell rings');
  assert.equal(g.militiaCount(), WARLORD.militia.max[1], 'the bell brings the rest at once');
  assert.ok(g.bellT > 0 && !g.ringBell(), 'then it recharges');
});

test('raising the keep: more walls, more archers, longer bows; it costs supply and stops at three', () => {
  const g = fresh('up'); g.gold = 0;
  assert.ok(!g.upgradeKeep(), 'not without supply');
  g.gold = 1000;
  const hp0 = g.castle.maxHp, w0 = g.wall.maxHp;
  assert.ok(g.upgradeKeep()); assert.equal(g.keepLv, 2);
  assert.equal(g.gold, 1000 - WARLORD.keep.up[1]);
  assert.ok(g.castle.maxHp > hp0 && g.wall.maxHp > w0 && g.wall.hp === g.wall.maxHp);
  assert.ok(g.upgradeKeep() && g.keepLv === 3 && !g.upgradeKeep() && g.keepUpCost() == null);
  // three archers loose at once
  clearField(g); g.projectiles = [];
  for (let i = 0; i < 3; i++) { const e = atGate(g); e.hp = e.maxHp = 1e6; }
  g.keepCd = 0; g.updateKeep(0.05);
  assert.equal(g.projectiles.length, WARLORD.keep.archers[2]);
});

test('watchtowers stand on free plots near the keep, one more per keep level, and shoot the horde', () => {
  const g = fresh('watch'); clearField(g); g.gold = 5000;
  const slots = g.watchSlots(), c = g.map.castle;
  assert.ok(slots.length >= 1 && slots.every((p) => !g.towerAt(p.x, p.y) && Math.hypot(p.x + 0.5 - c.x, p.y + 0.5 - c.y) <= WARLORD.watch.near));
  assert.ok(g.buildWatch()); assert.equal(g.buildWatch(), null, 'one at keep level 1');
  g.upgradeKeep(); assert.ok(g.buildWatch(), 'two at level 2');
  const t = g.watch[0];
  const e = g.spawnFoe('grunt', g.map.paths[0], 0, 0); e.x = t.x + 1; e.y = t.y; e.goto = { x: e.x, y: e.y }; e.hp = e.maxHp = 1e6;
  g.projectiles = []; g.updateWarlord(0.6);
  assert.ok(g.projectiles.some((p) => p.mine && p.target === e), 'it shoots');
  // the towers carry over to the next field
  const n = g.watch.length; g.nextStage();
  assert.equal(g.watch.length, Math.min(n, g.watchSlots().length));
});

test('the smithy: blades, plate, fletching, logistics, masonry and drill each do what they say', () => {
  const g = fresh('tech'); g.gold = 10000;
  const u = g.units.find((x) => x.id === 'marshal');
  const d0 = g.unitDmg(u), a0 = g.armorOf(u), s0 = g.supplyRate(), w0 = g.wall.maxHp;
  for (const id of WARLORD_TECH) assert.ok(g.buyTech(id), id);
  assert.ok(g.unitDmg(u) > d0 * 1.1, 'blades');
  assert.equal(g.armorOf(u), a0 + WARLORD.tech.plate.per, 'plate');
  assert.ok(g.supplyRate() > s0 * 1.1, 'logistics');
  assert.ok(g.wall.maxHp > w0 * 1.3, 'masonry');
  g.cards.footman = 0; g.deploy('footman');
  assert.ok(Math.abs(g.cards.footman - AUNITS.footman.cd * (1 - WARLORD.tech.drill.per)) < 1e-9, 'drill');
  for (const id of WARLORD_TECH) while (g.buyTech(id));
  for (const id of WARLORD_TECH) { assert.equal(g.tech[id], WARLORD.tech[id].cost.length); assert.equal(g.techCost(id), null); }
  assert.ok(g.summary().warlord.techs >= 6);
});

test('buildings on posts: only on posts you hold; a depot pays more, a barracks trains guards, both burn with the post', () => {
  const g = fresh('posts'); clearField(g); g.gold = 5000;
  const [A, B] = g.posts;
  assert.ok(!g.buildPost(A, 'depot'), 'not on a post you do not hold');
  for (const P of [A, B]) { P.owner = 'you'; P.prog = 1; }
  const pay0 = g.postPays(A);
  assert.ok(g.buildPost(A, 'depot') && !g.buildPost(A, 'tower'), 'one building a post');
  assert.ok(Math.abs(g.postPays(A) - pay0 * (1 + WARLORD.builds.depot.income)) < 1e-9);
  assert.ok(g.buildPost(B, 'barracks'));
  step(g, WARLORD.builds.barracks.every + 4);
  assert.ok(B.build.levy.length >= 1, 'the barracks trains a guard');
  assert.ok(B.build.levy.every((u) => Math.hypot(u.x - B.x, u.y - B.y) < 1.5 && u.cmd?.kind === 'hold'), 'who stands at the post');
  let lost = 0; g.on('buildLost', () => lost++);
  for (const u of g.ours()) if (Math.hypot(u.x - A.x, u.y - A.y) < 2) { u.dead = true; }
  g.units = g.units.filter((u) => !u.dead);
  for (let i = 0; i < 4; i++) { const e = g.spawnFoe('grunt', g.map.paths[0], 0, 0); e.x = A.x; e.y = A.y; e.goto = { x: A.x, y: A.y }; e.hp = e.maxHp = 1e6; e.dmg = 0; }
  step(g, 12);
  assert.ok(A.owner !== 'you' && !A.build && lost === 1, 'the depot burns when the horde takes the post');
});

test('veterans: soldiers rank up with kills, the Marshal levels up and keeps his level into the next stronghold', () => {
  const g = fresh('vet'); clearField(g);
  g.cards.footman = 0; g.gold = 999; const u = g.deploy('footman');
  const d0 = u.dmg, hp0 = u.maxHp;
  for (let i = 0; i < WARLORD.vet.at[0]; i++) { const e = g.spawnFoe('grunt', g.map.paths[0], 0, 0); g.hurtFoe(e, 1e9, u); }
  assert.equal(u.rank, 1); assert.ok(u.dmg > d0 && u.maxHp > hp0);
  const M = g.marshal;
  assert.ok(M && M.def.hero && g.units.includes(M));
  for (let i = 0; i < WARLORD.marshal.xp[1]; i++) { const e = g.spawnFoe('grunt', g.map.paths[0], 0, 0); g.hurtFoe(e, 1e9, M); }
  assert.equal(g.marshalRank, 2);
  const lvlHp = M.maxHp;
  g.nextStage();
  assert.ok(g.marshal !== M && g.marshal.rank === 2 && g.marshal.maxHp >= lvlHp * 0.99, 'his level carries over');
});

test('the Marshal: his aura guards those beside him, his Rally Cry heals them, and he rises again at the keep', () => {
  const g = fresh('hero'); clearField(g);
  const M = g.marshal; g.cards.footman = 0; g.gold = 999; const u = g.deploy('footman');
  u.x = M.x + 0.5; u.y = M.y; g.updateUnits(0.01);
  assert.ok(u.inspired, 'within the aura');
  assert.equal(g.armorOf(u), u.armor + WARLORD.marshal.auraArmor);
  u.hp = u.maxHp * 0.3; g.cryCd = 0;
  assert.ok(g.useCry());
  assert.ok(u.hp > u.maxHp * 0.55 && u.cryT > 0);
  assert.ok(!g.useCry(), 'then it recharges');
  let back = 0; g.on('marshalBack', () => back++);
  const lost0 = g.stats.lost;
  g.hurtUnit(M, 1e9, true);
  assert.equal(g.stats.lost, lost0, 'the Marshal falling is not a soldier lost');
  assert.ok(M.dead && g.marshalT > 0 && !g.cryReady());
  step(g, WARLORD.marshal.respawn + 1);
  assert.ok(back === 1 && g.marshal && !g.marshal.dead && g.marshal !== M);
});

test('the mercenary camp keeps to itself until attacked; break it for its chest and three knights', () => {
  let g = null;
  for (const s of ['camp1', 'camp2', 'camp3', 'camp4']) { g = fresh(s); if (g.camp) break; }
  assert.ok(g.camp, 'a camp on the field');
  const C = g.camp;
  g.sallyT = 999; g.warbandT = 999;
  for (const e of g.enemies) if (!e.neutral) e.dead = true;
  assert.equal(C.guards.length, WARLORD.camp.guards);
  assert.ok(g.roadDist(C.x, C.y) >= 1.9, 'off the road');
  assert.equal(g.nearestFoe(C.x, C.y, 3), null, 'your army does not pick a fight with them by itself');
  const x0 = C.guards.map((e) => e.x);
  step(g, 3);
  assert.deepEqual(C.guards.map((e) => e.x), x0, 'they stay put');
  let broke = null; g.on('campBroken', (d) => (broke = d));
  const gold0 = g.gold;
  for (const e of C.guards) g.hurtFoe(e, 1e9, null);
  assert.ok(C.aggro);
  g.updateWarlord(0.05);
  assert.ok(C.cleared && broke && broke.mercs.length === WARLORD.camp.mercs && g.gold > gold0);
  assert.ok(broke.mercs.every((u) => u.id === 'knight' && Math.hypot(u.x - C.x, u.y - C.y) < 1.2));
});

test('a Warchief leads the second warband from the second stronghold, and pays a bounty', () => {
  const g = fresh('chief'); g.nextStage(); g.nextStage();
  assert.ok(g.stage >= WARLORD.chief.from);
  for (const P of g.posts) { P.owner = 'none'; P.prog = 0; P.guards = []; }
  let chief = null; g.on('chief', ({ enemy }) => (chief = enemy));
  g.warbandT = 0; g.updatePosts(0.05);
  assert.equal(chief, null, 'not the first warband');
  g.warbandT = 0; g.updatePosts(0.05);
  assert.ok(chief && chief.chief && chief.champion && chief.maxHp > 1000, 'the second');
  const gold0 = g.gold; let slain = 0; g.on('chiefSlain', () => slain++);
  g.hurtFoe(chief, 1e12, null);
  assert.ok(slain === 1 && g.gold >= gold0 + WARLORD.chief.bounty && g.stats.chiefs === 1);
});

test('a side objective for every stronghold, the same for everyone on that field; it pays when done', () => {
  const a = fresh('obj'), b = fresh('obj');
  assert.ok(a.objective && WARLORD_OBJECTIVES[a.objective.id]);
  assert.equal(a.objective.id, b.objective.id);
  const g = fresh('obj2'); clearField(g);
  g.objective = { id: 'hold', ...WARLORD_OBJECTIVES.hold, done: false, failed: false };
  for (const P of g.posts) { P.owner = 'you'; P.prog = 1; }
  const gold0 = g.gold; let done = 0; g.on('objective', () => done++);
  g.checkObjective();
  assert.ok(done === 1 && g.objective.done && g.gold > gold0 && g.stats.objectives === 1);
  // the palisade objective is settled when the camp falls
  const w = fresh('obj3'); w.objective = { id: 'wall', ...WARLORD_OBJECTIVES.wall, done: false, failed: false };
  let report = null; w.on('stageReport', (r) => (report = r));
  w.hurtFortress(1e12, null);
  assert.ok(w.objective.done && report && report.objective.done && report.stage === 1 && report.of === w.posts.length);
});

test('raids and warbands are called before they march: when, how many and which post', () => {
  const g = fresh('warn');
  let raid = null, wb = null, band = null;
  g.on('raidWarn', (d) => (raid = raid || d)); g.on('warbandWarn', (d) => (wb = wb || d)); g.on('warband', (d) => (band = band || d));
  let sallied = false; g.on('sally', () => { sallied = true; });
  for (let t = 0; t < 60 && !band; t += 0.05) { g.update(0.05); if (sallied && !raid) assert.fail('a raid with no warning'); }
  assert.ok(raid && raid.n >= 1, 'the raid is called');
  assert.ok(wb && band && band.post === wb.post, 'the warband goes where it was called');
});

test('patrol, formations and the rally point', () => {
  const g = fresh('cmd'); clearField(g); g.gold = 9999;
  const foot = [], bows = [];
  for (let i = 0; i < 3; i++) { g.cards.footman = 0; foot.push(g.deploy('footman')); g.cards.archer = 0; bows.push(g.deploy('archer')); }
  step(g, 2);
  // a formation: the bows a step behind the footmen, on the side they come from
  const tx = g.map.cols / 2, ty = g.map.rows / 2;
  g.command([...foot, ...bows], 'move', { x: tx, y: ty });
  const fd = Math.min(...foot.map((u) => Math.hypot(u.cmd.x - tx, u.cmd.y - ty))), bd = Math.min(...bows.map((u) => Math.hypot(u.cmd.x - tx, u.cmd.y - ty)));
  assert.ok(bd > fd + 0.4, 'archers form up behind');
  // patrol back and forth
  const u = foot[0], ax = u.x, ay = u.y;
  g.command([u], 'patrol', { x: ax + 2, y: ay });
  assert.equal(u.cmd.kind, 'patrol');
  const legs = new Set(); for (let t = 0; t < 8; t += 0.05) { g.update(0.05); legs.add(u.cmd?.leg); }
  assert.ok(legs.has(0) && legs.has(1), 'it turns at each end');
  // rally
  assert.ok(g.setRally(tx, ty));
  g.cards.knight = 0; const k = g.deploy('knight');
  assert.ok(k.cmd && k.cmd.kind === 'move' && Math.hypot(k.cmd.x - tx, k.cmd.y - ty) < 0.6, 'new soldiers head for the rally point');
  g.cards.ram = 0; const ram = g.deploy('ram');
  assert.ok(!ram.cmd, 'rams keep to the road');
  g.setRally(null); g.cards.footman = 0; assert.ok(!g.deploy('footman').cmd);
});

test('the home front holds: an empty field keeps the Warlord keep standing far longer than an Assault keep', () => {
  let wl = 0, as = 0;
  for (const seed of ['k1', 'k2', 'k3']) {
    const g = fresh(seed); g.command(g.units, 'retreat');
    let t = 0; for (; t < 900 && !g.over; t += 0.05) g.update(0.05); wl += t;
    const a = new AssaultGame({ seed, mode: 'assault', career: 6 });
    let u = 0; for (; u < 900 && !a.over; u += 0.05) a.update(0.05); as += u;
  }
  assert.ok(wl > as * 1.4, `warlord ${Math.round(wl)}s vs assault ${Math.round(as)}s`);
});

test('a played Warlord run is accepted and reports what was built', () => {
  const g = fresh('acc'); g.gold = 3000;
  g.upgradeKeep(); g.buildWatch(); g.buyTech('blades');
  step(g, 90);
  g.end(false, 'quit');
  const s = g.summary();
  assert.equal(validateAssaultRun(s), null);
  assert.ok(s.warlord && s.warlord.keepLv === 2 && s.warlord.watch >= 1 && s.warlord.techs === 1);
});
