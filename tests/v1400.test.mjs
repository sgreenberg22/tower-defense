// v1.40: six new castle arts and twelve new boons.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { GAME, ABILITIES, BOONS, KEEP } from '../src/data/balance.js';

const NEW_ARTS = ['skychains', 'gale', 'inferno', 'barrage', 'quake', 'hymn'];
const arena = (boons = {}) => {
  const g = new Game({ seed: 'v140', mapId: 'meadow', mode: 'normal', startWave: 30 });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  g.boons = { ...boons };
  for (const id of NEW_ARTS) g.abilities[id] = { cd: 0, max: 1 };
  g.startWave(); g.spawnQueue = []; g.enemies = [];
  return g;
};
const foe = (g, type = 'grunt', x = 8, y = 6) => { const e = g.spawnEnemy(type, 0); for (let i = 0; i < 40; i++) g.update(GAME.step); e.x = x; e.y = y; e.hp = e.maxHp = 1e6; e.armor = 0; e.mr = 0; return e; };

test('every new art is bought in the Keep with a cooldown and a signature upgrade', () => {
  for (const id of NEW_ARTS) {
    assert.ok(ABILITIES[id].desc && ABILITIES[id].icon, id);
    for (const k of ['unlock_' + id, id + 'cd', id + 'pow']) assert.ok(KEEP.find((n) => n.id === k), k);
  }
});

test('Sky Chains drags every flyer down; it flies again afterwards', () => {
  const g = arena(); const w = foe(g, 'wyvern'); assert.equal(w.air, true);
  assert.ok(g.useAbility('skychains')); assert.equal(w.air, false); assert.ok(w.hp < 1e6);
  for (let t = 0; t < ABILITIES.skychains.duration + 0.5; t += GAME.step) g.update(GAME.step);
  assert.equal(w.air, true);
});

test('Gale Force blows foes back down the road', () => {
  const g = arena(); const e = foe(g); e.dist = 8; e.seg = Math.min(e.seg, e.path.length - 1);
  for (let i = 0; i < 60; i++) g.update(GAME.step);
  const d = e.dist; assert.ok(g.useAbility('gale', e.x, e.y)); assert.ok(e.dist < d - 1, `pushed back (${d} → ${e.dist})`);
});

test('Inferno burns what stands in it; Earthquake stuns and unearths', () => {
  const g = arena(); const e = foe(g), s = foe(g, 'minesapper'); s.burrowT = 3;
  assert.ok(g.useAbility('quake', 8, 6)); assert.ok(e.stunT > 1); assert.equal(s.burrowT, 0);
  e.x = 8; e.y = 6; assert.ok(g.useAbility('inferno', 8, 6));
  g.update(GAME.step); assert.ok(e.burnT > 0);
});

test('Cannon Barrage drops eight shells over the area', () => {
  const g = arena(); const e = foe(g); e.stunImmune = 99;
  assert.ok(g.useAbility('barrage', 8, 6)); assert.equal(g.volleys.filter((v) => v.shell).length, ABILITIES.barrage.shells);
  for (let t = 0; t < 2.2; t += GAME.step) { e.x = 8; e.y = 6; g.update(GAME.step); }
  assert.equal(g.volleys.length, 0); assert.ok(e.hp < 1e6);
});

test('Battle Hymn: towers and the hero hit 30% harder while it plays', () => {
  const g = arena(); const e = foe(g), tw = { type: 'archer', dmg: 0 };
  const h0 = e.hp; g.damage(e, 100, 'physical', tw); const plain = h0 - e.hp;
  assert.ok(g.useAbility('hymn')); const h1 = e.hp; g.damage(e, 100, 'physical', tw);
  assert.ok(Math.abs((h1 - e.hp) / plain - 1.3) < 1e-6);
});

test('the twelve new boons are offered and do what they say', () => {
  for (const id of ['coldsnap', 'opening', 'bloodmortar', 'prospectors', 'ricochet', 'soulharvest', 'artificer', 'lastline', 'volatile', 'stormcaller', 'echo', 'warpath']) assert.ok(BOONS.find((b) => b.id === id), id);
  const tw = { type: 'archer', dmg: 0 };
  // Opening Volley: full-health foes take more
  let g = arena({ opening: 1 }); let e = foe(g); g.damage(e, 100, 'physical', tw); assert.ok(Math.abs(1e6 - e.hp - 125) < 1e-6);
  // Cold Snap: slowed foes take more
  g = arena({ coldsnap: 2 }); e = foe(g); e.hp = 5e5; e.slow = 0.3; e.slowT = 2; let h = e.hp; g.damage(e, 100, 'physical', tw); assert.ok(Math.abs(h - e.hp - 120) < 1e-6);
  // Warpath: towers hit harder on a combo of 10
  g = arena({ warpath: 1 }); e = foe(g); e.hp = 5e5; g.combo = 10; h = e.hp; g.damage(e, 100, 'physical', tw); assert.ok(Math.abs(h - e.hp - 115) < 1e-6);
  // Prospectors: cheaper ruins
  g = arena(); const c0 = g.claimCost(); g.boons.prospectors = 1; assert.ok(Math.abs(g.claimCost() / c0 - 0.8) < 0.02);
  // Soul Harvest and Blood and Mortar: a kill shortens cooldowns and mends the wall
  g = arena({ soulharvest: 1, bloodmortar: 1 });
  e = foe(g); g.abilities.volley = { cd: 10, max: 26 }; g.wall.hp = g.wall.maxHp / 2; e.hp = 1; const w0 = g.wall.hp; g.damage(e, 10, 'physical', tw);
  assert.ok(Math.abs(g.abilities.volley.cd - 9.88) < 1e-6); assert.ok(g.wall.hp > w0);
  // Volatile Corpses: a tower kill bursts on its neighbours
  g = arena({ volatile: 1 }); e = foe(g); const n = foe(g); n.x = e.x + 0.3; n.y = e.y; e.hp = 1; g.damage(e, 10, 'physical', tw); assert.ok(n.hp < 1e6);
  // Ricochet: a killing shot from the wall carries on
  g = arena({ ricochet: 1 }); e = foe(g); const r = foe(g); r.x = e.x + 1; r.y = e.y; e.hp = 1; g.damage(e, 100, 'physical', 'hero', { hero: true }); assert.ok(Math.abs(1e6 - r.hp - 60) < 1e-6);
  // Echoing Arts: some casts come straight back
  g = arena({ echo: 1 }); let back = 0; for (let i = 0; i < 40; i++) { g.abilities.hymn.cd = 0; g.useAbility('hymn'); if (g.abilities.hymn.cd === 0) back++; } assert.ok(back > 3 && back < 20, String(back));
  // Royal Artificers: shorter cooldowns, harder arts
  g = arena({ artificer: 1 }); const p1 = g.abilityPower('quake'); g.useAbility('quake', 0, 0); assert.ok(Math.abs(g.abilities.quake.cd - ABILITIES.quake.cd * (g.bonus.abilityCd.quake || 1) * 0.9) < 1e-6);
  g.boons = {}; assert.ok(p1 > g.abilityPower('quake'));
  // Stormcaller: a bolt every ten seconds
  g = arena({ stormcaller: 1 }); e = foe(g); for (let t = 0; t < 10.1; t += GAME.step) { e.x = 8; e.y = 6; g.update(GAME.step); } assert.ok(e.hp < 1e6);
  // Last Line: towers fire faster when the wall is low
  const shots = (low) => {
    const q = arena({ lastline: 1 }); q.gold = 1e5; const p = q.map.plots.find((pl) => q.plotOpen(pl.x, pl.y)); const t = q.build('archer', p.x, p.y);
    const f = foe(q); let n = 0; q.on('towerFire', () => n++); const fire = q.towerFire.bind(q); q.towerFire = (...a) => { n++; return fire(...a); };
    for (let i = 0; i < 300; i++) { f.x = t.cx + 0.5; f.y = t.cy; q.wall.hp = q.wall.maxHp * (low ? 0.2 : 1); q.update(GAME.step); }
    return n;
  };
  assert.ok(shots(true) > shots(false) * 1.15, `${shots(true)} vs ${shots(false)}`);
});
