// v1.60: Sea Siege — coastal fields, sea lanes, a fleet that lands the horde's crews, sinking ships with their crews aboard,
// fire galleys and war carracks that anchor to shell the keep, run validation and records.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { GAME, ENEMIES } from '../src/data/balance.js';
import { MAPS, MAP_ORDER, SEA_MAPS, buildMap, T } from '../src/game/maps.js';
import { NAVAL } from '../src/game/naval.js';
import { LOCAL_MODES } from '../src/game/modes.js';
import { validateRun } from '../src/game/rules.js';
import { defaultProfile, recordRun } from '../src/meta/profile.js';
import { ACHIEVEMENTS } from '../src/meta/achievements.js';

const step = (g, sec) => { for (let t = 0; t < sec && !g.over; t += GAME.step) { g.update(GAME.step); g.tickBuild(GAME.step); } };
const sea = (o = {}) => {
  const g = new Game({ seed: 'sea-t', mapId: 'harbour', mode: 'seasiege', ...o });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  return g;
};
const SHIPS = ['longship', 'cog', 'galley', 'carrack', 'flagship'];

test('the coastal fields: sea-only, with lanes, sea tiles and plots that reach the water', () => {
  assert.deepEqual(SEA_MAPS, ['harbour', 'cliffs', 'rivermouth', 'skerry']);
  for (const id of SEA_MAPS) {
    assert.ok(MAPS[id].seaOnly, `${id} is only for Sea Siege`);
    assert.ok(!MAP_ORDER.includes(id), `${id} stays out of the classic rotation`);
    for (const portrait of [false, true]) {
      const m = buildMap(id, 's', portrait);
      assert.ok(m.sea && m.lanes.length >= 3, 'lanes');
      assert.ok(m.lanes.some((L) => L.bombard) && m.lanes.some((L) => !L.bombard), 'landing and bombard lanes');
      for (const L of m.lanes) {
        assert.ok(L.land >= 0 && L.land < m.paths.length, 'each lane lands on a road');
        assert.ok(L.len > 2, 'lanes have length');
        const p0 = L.pts[0], last = L.pts[L.pts.length - 1];
        assert.ok(m.isSea(Math.floor(p0.x), Math.floor(p0.y)), 'a lane starts at sea');
        if (!L.bombard) assert.ok(Math.hypot(last.x - m.paths[L.land][0].x, last.y - m.paths[L.land][0].y) <= 1.6, 'a landing lane ends by its beach');
      }
      // ponds are not sea; every sea tile is water
      let seaN = 0;
      for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) if (m.isSea(x, y)) { seaN++; assert.equal(m.tileAt(x, y), T.WATER); }
      assert.ok(seaN > 10);
      // towers can reach the lanes: plenty of plots within 2.5 tiles of a lane
      const near = m.plots.filter((p) => m.lanes.some((L) => L.pts.some((q) => Math.hypot(q.x - p.x - 0.5, q.y - p.y - 0.5) < 2.5)));
      assert.ok(near.length >= 4, `${id}: ${near.length} plots by the sea`);
    }
  }
  // other modes never land on a sea map, and Sea Siege never leaves the coast
  assert.equal(new Game({ seed: 'x', mapId: 'harbour', mode: 'normal' }).mapId, 'meadow');
  assert.equal(new Game({ seed: 'x', mapId: 'meadow', mode: 'seasiege' }).mapId, 'harbour');
  assert.ok(LOCAL_MODES.includes('seasiege'));
});

test('the ships are proper foes: never in the land pool, worth points, with cargo or guns', () => {
  for (const id of SHIPS) {
    const d = ENEMIES[id];
    assert.ok(d && d.naval, id);
    assert.equal(d.weight, 0, 'never rolled into a land wave');
    assert.ok(d.hp > 0 && d.speed > 0);
  }
  assert.ok(ENEMIES.carrack.naval.bombard && ENEMIES.flagship.naval.bombard);
  assert.ok(ENEMIES.galley.naval.shoots || ENEMIES.galley.shoots);
  assert.ok(ENEMIES.cog.naval.cargo > ENEMIES.longship.naval.cargo);
});

test('a wave goes to sea: foot soldiers board ships, flyers fly in, the boss takes the flagship', () => {
  const g = sea({ startWave: 10 });
  g.startWave();
  const Q = g.spawnQueue;
  assert.ok(Q.length > 0);
  const ships = Q.filter((s) => s.ship), flyers = Q.filter((s) => !s.ship);
  assert.ok(ships.length > 0);
  for (const s of ships) {
    assert.ok(SHIPS.includes(s.ship));
    assert.ok(s.cargo.length <= (ENEMIES[s.ship].naval.cargo || 0), `${s.ship} not overloaded`);
    for (const c of s.cargo) assert.ok(c.type === 'boss' || !ENEMIES[c.type].air, 'no flyers aboard');
  }
  for (const f of flyers) assert.ok(ENEMIES[f.type]?.air && f.from, 'only flyers come without a ship, over the water');
  assert.ok(ships.some((s) => s.ship === 'galley'), 'fire galleys from wave 3');
  assert.ok(ships.some((s) => s.ship === 'carrack'), 'war carracks from wave 8');
  assert.ok(ships.some((s) => s.ship === 'cog'), 'cogs carry the bigger loads from wave 6');
  // the boss wave
  const b = sea({ startWave: 10 }); b.wave = 9; b.startWave();
  const boss = b.spawnQueue.find((s) => s.cargo?.some((c) => c.type === 'boss'));
  if (boss) assert.equal(boss.ship, 'flagship');
});

test('a ship sails its lane and lands its crew on the beach; the crew walks the road', () => {
  const g = sea({ startWave: 2 });
  g.startWave(); g.spawnQueue = [];
  const L = g.map.lanes.find((x) => !x.bombard);
  const ship = g.spawnShip({ ship: 'longship', lane: L, cargo: [{ type: 'grunt' }, { type: 'grunt' }, { type: 'shield' }] });
  ship.hp = ship.maxHp = 1e9;
  let landed = 0; g.on('shipLands', ({ enemy, n }) => { if (enemy === ship) landed = n; });
  const ashore = []; g.on('wadeAshore', ({ enemy, ship: s }) => { if (s === ship) ashore.push(enemy); });
  step(g, 60);
  assert.equal(landed, 3);
  assert.equal(ashore.length, 3, 'all three wade ashore');
  const beach = g.map.paths[L.land][0];
  assert.ok(ashore.every((e) => e.dead || e.dist > 0 || Math.hypot(e.x - beach.x, e.y - beach.y) < 1.5), 'they come up the road from the beach');
  assert.ok(ship.landed, 'the ship is empty now');
  assert.ok(!g.over);
});

test('sink a ship at sea and its crew drowns with it: kills, gold and the record', () => {
  const g = sea({ startWave: 4 });
  g.startWave(); g.spawnQueue = [];
  const L = g.map.lanes.find((x) => !x.bombard);
  const ship = g.spawnShip({ ship: 'cog', lane: L, cargo: [{ type: 'grunt' }, { type: 'shield' }, { type: 'grunt' }, { type: 'ogre' }] });
  const k0 = g.stats.kills, gold0 = g.gold;
  let ev = null; g.on('shipSunk', (d) => { ev = d; });
  g.damage(ship, 1e9, 'physical');
  assert.ok(ship.dead);
  assert.equal(ev.drowned, 4);
  assert.ok(ev.gold > 0 && g.gold > gold0);
  assert.equal(g.stats.kills - k0, 5, 'the ship and its four crewmen');
  assert.equal(g.stats.drowned, 4);
  assert.equal(g.stats.sunk, 1);
  assert.equal(g.stats.bestSink, 4);
  assert.equal(g.landQueue.length, 0, 'nobody comes ashore');
  // an empty ship sunk after landing drowns nobody
  const s2 = g.spawnShip({ ship: 'longship', lane: L, cargo: [{ type: 'grunt' }] });
  s2.landed = true;
  g.damage(s2, 1e9, 'physical');
  assert.equal(g.stats.drowned, 4);
  assert.equal(g.stats.sunk, 2);
});

test('a boss on a sinking flagship swims ashore', () => {
  const g = sea({ startWave: 10 });
  g.startWave(); g.spawnQueue = [];
  const L = g.map.lanes.find((x) => !x.bombard);
  const ship = g.spawnShip({ ship: 'flagship', lane: L, cargo: [{ type: 'boss', boss: 'warlord' }, { type: 'grunt' }] });
  let swam = false; g.on('bossSwims', () => { swam = true; });
  g.damage(ship, 1e9, 'physical');
  assert.ok(swam);
  assert.equal(g.landQueue.length, 1);
  step(g, 2);
  assert.ok(g.enemies.some((e) => e.boss), 'the boss is ashore');
});

test('war carracks anchor off the coast and shell towers, then the keep when in reach', () => {
  const g = sea({ startWave: 8 });
  g.gold = 1e6;
  g.startWave(); g.spawnQueue = [];
  const L = g.map.lanes.find((x) => x.bombard);
  const c = g.spawnShip({ ship: 'carrack', lane: L, cargo: [] });
  c.hp = c.maxHp = 1e9;
  let anchored = false, shots = 0, shelled = 0;
  g.on('shipAnchors', () => { anchored = true; }); g.on('broadside', () => shots++); g.on('keepShelled', () => shelled++);
  const wall0 = g.wall.hp, cas0 = g.castle.hp;
  // a tower near the anchorage to shoot at
  const end = L.pts[L.pts.length - 1];
  const p = g.map.plots.slice().sort((a, b) => Math.hypot(a.x + 0.5 - end.x, a.y + 0.5 - end.y) - Math.hypot(b.x + 0.5 - end.x, b.y + 0.5 - end.y))[0];
  if (!g.plotOpen(p.x, p.y)) g.claimPlot(p.x, p.y);
  const tw = g.build('archer', p.x, p.y);
  if (tw) { tw.hp = tw.maxHp = 1e6; }
  step(g, 30);
  assert.ok(anchored, 'it anchors');
  assert.ok(shots >= 2, `it fires (${shots})`);
  assert.ok(shelled > 0 || (tw && tw.hp < 1e6), 'its shot lands on the keep or a tower');
  if (shelled) assert.ok(g.wall.hp < wall0 || g.castle.hp < cas0);
  step(g, 40);
  assert.ok(c.dead, 'it weighs anchor and leaves after its stay');
});

test('heavy shot smashes hulls, arrows barely scratch them; troops and soldiers leave ships alone', () => {
  const g = sea({ startWave: 4 });
  g.startWave(); g.spawnQueue = [];
  const L = g.map.lanes[0];
  const s = g.spawnShip({ ship: 'cog', lane: L, cargo: [] });
  assert.ok(g.hullMult(s, 'physical', { type: 'cannon' }) > 1.3);
  assert.ok(g.hullMult(s, 'physical', { type: 'archer' }) < 0.7);
  assert.ok(g.hullMult(s, 'fire', { type: 'archer' }) > g.hullMult(s, 'physical', { type: 'archer' }));
  assert.equal(NAVAL.vs.trebuchet > 1, true);
  assert.equal(s.naval, true);
  // nothing on foot fights a ship
  g.garrison.units.forEach((u) => { assert.notEqual(u.target, s); });
});

test('a Sea Siege run validates, records its own best and the fleet it sank, and unlocks its feats', () => {
  const g = sea({ startWave: 1 });
  g.wave = 12; g.stats.wavesCleared = 11; g.stats.sunk = 120; g.stats.drowned = 40; g.stats.bestSink = 6;
  const run = g.summary();
  assert.equal(run.mode, 'seasiege');
  assert.ok(run.sea && run.sea.sunk === 120);
  assert.ok(validateRun(run).ok !== false);
  const p = defaultProfile();
  recordRun(p, run);
  const R = p.local.seasiege;
  assert.ok(R.runs === 1 && R.best >= 10);
  assert.equal(R.sunk, 120); assert.equal(R.bestSink, 6);
  const has = (id) => ACHIEVEMENTS.find((a) => a.id === id).check(p);
  assert.ok(has('sea10')); assert.ok(has('sea_sink100')); assert.ok(has('sea_drown'));
  assert.ok(!has('sea25'));
  const c = new Game({ seed: 'c', mapId: 'cliffs', mode: 'seasiege' });
  c.wave = 16; c.stats.wavesCleared = 15;
  recordRun(p, c.summary());
  assert.ok(has('sea_cliffs'));
});

test('a whole early Sea Siege wave plays out: ships come, crews land or drown, the wave clears', () => {
  const g = sea({ startWave: 1 });
  g.gold = 5000;
  // a few cannons by the water
  let n = 0;
  for (const p of g.map.plots) { if (n >= 5) break; if (!g.plotOpen(p.x, p.y)) g.claimPlot(p.x, p.y); if (g.build(n % 2 ? 'archer' : 'cannon', p.x, p.y)) n++; }
  let cleared = 0; g.on('waveClear', () => cleared++);
  g.startWave();
  step(g, 160);
  assert.ok(g.stats.ships > 0, 'ships sailed');
  assert.ok(cleared >= 1 || g.over, 'the wave ends');
  assert.ok(!g.over, 'and the keep holds wave 1');
});
