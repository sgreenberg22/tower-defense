// v1.8 · The Wild Marches: new foes, the Hydra, new maps, cosmetics wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { buildMap, MAPS, MAP_ORDER, T, MUD_SLOW } from '../src/game/maps.js';
import { bossFor, planWave, unlockedTypes } from '../src/game/waves.js';
import { dailySetup, DAILY_V18 } from '../src/game/rules.js';
import { ENEMIES, BOSSES, BOSS_DESC, KEEP, THREATS, WEAPONS } from '../src/data/balance.js';
import { ACHIEVEMENTS, COSMETICS, NEW_FOES } from '../src/meta/achievements.js';
import { EVENTS } from '../src/data/events.js';
import { CASTLE_SKINS, TOWER_SKINS, TRAILS, HERO_OUTFITS } from '../src/game/render.js';
import { KILL_FX } from '../src/game/fx.js';

// A game mid-wave with an empty field, ready for hand-placed foes.
function arena(mapId = 'meadow', wave = 40) {
  const g = new Game({ seed: 'arena', mapId, startWave: wave });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  g.startWave(); g.spawnQueue = []; g.enemies = [];
  return g;
}

test('new maps build in both orientations with roads that reach the keep', () => {
  for (const id of ['coil', 'bog', 'spine', 'hive', 'fork', 'ravine']) {
    assert.ok(MAP_ORDER.includes(id) && MAPS[id].unlock.wave > 0);
    for (const portrait of [false, true]) {
      const m = buildMap(id, 's', portrait);
      assert.ok(m.plots.length >= 12, `${id} has enough plots (${m.plots.length})`);
      for (const p of m.paths) { const end = p[p.length - 1]; assert.equal(end.x, m.castle.x); assert.equal(end.y, m.castle.y); }
      if (m.mud) for (let i = 0; i < m.mud.length; i++) if (m.mud[i]) assert.equal(m.tiles[i], T.PATH, 'mud only on the road');
    }
  }
  assert.ok(buildMap('bog').mud.some(Boolean), 'Bogwater Ford has mud');
});

test('mud slows walkers but not flyers', () => {
  const g = arena('bog', 20);
  const m = g.map;
  const mudIdx = m.mud.findIndex(Boolean), mx = mudIdx % m.cols + 0.5, my = Math.floor(mudIdx / m.cols) + 0.5;
  const walk = g.spawnEnemy('grunt', 0), fly = g.spawnEnemy('harpy', 0);
  for (const e of [walk, fly]) { e.x = mx; e.y = my; }
  const pw = { x: walk.x, y: walk.y }, pf = { x: fly.x, y: fly.y };
  g.updateEnemies(0.1);
  const dw = Math.hypot(walk.x - pw.x, walk.y - pw.y), df = Math.hypot(fly.x - pf.x, fly.y - pf.y);
  assert.ok(Math.abs(dw - walk.speed * 0.1 * MUD_SLOW) < 1e-6, `walker slowed to ${MUD_SLOW} (${dw})`);
  assert.ok(Math.abs(df - fly.speed * 0.1) < 1e-6, 'flyer unaffected');
});

test('every foe has a description, new foes unlock in order and get a spotlight', () => {
  for (const [id, e] of Object.entries(ENEMIES)) assert.ok(e.desc && e.desc.length > 10, `${id} has a description`);
  for (const b of BOSSES) assert.ok(BOSS_DESC[b.id], `${b.id} has a boss line`);
  for (const id of NEW_FOES) {
    assert.ok(ENEMIES[id], id);
    const w = ENEMIES[id].unlock;
    assert.ok(unlockedTypes(w).includes(id) && !unlockedTypes(w - 1).includes(id));
    assert.ok(planWave(w, 'spot').groups.some((g) => g.type === id), `${id} appears the wave it unlocks`);
  }
  for (const th of ['wild', 'tunnels', 'phantom']) assert.ok(THREATS[th].types.every((t) => ENEMIES[t]), th);
});

test('Tunnelers burrow: towers and your bow cannot target them, splash still can', () => {
  const g = arena();
  const e = g.spawnEnemy('burrower', 0);
  e.x += 0.5; e.burrowCd = 0;
  g.enemyAbilities(e, 0.01);
  assert.ok(e.burrowT > 0, 'it dug in');
  const fakeTower = { cx: e.x, cy: e.y, targetMode: 'first' };
  assert.equal(g.pickTarget(fakeTower, { range: 5, minRange: 0, targets: 'ga' }), null, 'towers lose it');
  assert.equal(g.pickEnemy(e.x, e.y - 0.2), null, 'your bow loses it');
  const hp = e.hp;
  g.explode({ splash: 1, dmg: 50, type: 'physical', src: null, kind: 'ball' }, e.x, e.y);
  assert.ok(e.hp < hp, 'splash still reaches it');
  e.burrowT = 0.001; g.enemyAbilities(e, 0.01);
  assert.equal(e.burrowT, 0, 'it surfaces');
  assert.ok(g.pickTarget(fakeTower, { range: 5, minRange: 0, targets: 'ga' }), 'and can be shot again');
});

test('Bog Trolls regenerate unless burning or poisoned', () => {
  const g = arena();
  const t = g.spawnEnemy('troll', 0);
  t.hp = t.maxHp * 0.5;
  g.updateEnemies(1);
  assert.ok(t.hp > t.maxHp * 0.5, 'regenerates');
  const before = t.hp;
  t.burn = 0.0001; t.burnT = 5;
  g.updateEnemies(1);
  assert.ok(t.hp <= before, 'burning stops it');
});

test('Gold Thieves steal gold instead of hitting the wall; Thief-Taker stops them', () => {
  const g = arena();
  g.gold = 1000;
  const wall = g.wall.hp, leaks = g.waveLeaks;
  const th = g.spawnEnemy('thief', 0);
  g.leak(th);
  assert.ok(g.gold < 1000, 'gold stolen');
  assert.equal(g.wall.hp, wall, 'wall untouched');
  assert.equal(g.waveLeaks, leaks, 'not counted as a leak');
  g.boons.thieftaker = 1; g.gold = 1000;
  g.leak(g.spawnEnemy('thief', 0));
  assert.equal(g.gold, 1000, 'Thief-Taker: nothing stolen');
});

test('Powder Goblins blow up next to towers', () => {
  const g = arena('meadow', 20);
  g.gold = 1e6;
  const p = g.freePlots()[0];
  const tw = g.build('archer', p.x, p.y);
  const b = g.spawnEnemy('bomber', 0);
  b.x = tw.cx + 0.4; b.y = tw.cy;
  const hp = tw.hp;
  g.kill(b, null);
  assert.ok(tw.hp < hp && tw.disabledT > 0, 'tower hurt and jammed');
});

test('Phase Wraiths blink forward along the road and shake off soldiers', () => {
  const g = arena();
  const w = g.spawnEnemy('wraith', 0);
  w.blocker = { dead: false };
  w.blinkCd = 0;
  const d0 = w.dist;
  g.enemyAbilities(w, 0.01);
  assert.ok(Math.abs(w.dist - d0 - ENEMIES.wraith.blink.dist) < 1e-6, 'moved exactly the blink distance');
  assert.equal(w.blocker, null);
});

test('the Bog Hydra joins the boss rotation on wave 50 and spits at towers', () => {
  assert.equal(bossFor(50).id, 'hydra');
  assert.equal(bossFor(10).id, 'warlord');
  const g = arena('meadow', 50);
  g.gold = 1e6;
  const p = g.freePlots()[0];
  const tw = g.build('archer', p.x, p.y);
  const hy = g.spawnEnemy('boss', 0, { boss: 'hydra' });
  hy.x = tw.cx + 1; hy.y = tw.cy; hy.cd = 0;
  g.enemyAbilities(hy, 0.01);
  assert.ok(tw.disabledT > 0, 'acid jams the tower');
});

test('the daily rotation adds the new maps from launch day only', () => {
  const before = new Set(), after = new Set();
  for (let i = 1; i <= 60; i++) {
    before.add(dailySetup(new Date(Date.UTC(2026, 7, i)).toISOString().slice(0, 10)).map);
    after.add(dailySetup(new Date(Date.UTC(2026, 10, i)).toISOString().slice(0, 10)).map);
  }
  for (const m of ['coil', 'bog', 'spine']) { assert.ok(!before.has(m)); }
  assert.ok(['coil', 'bog', 'spine'].some((m) => after.has(m)), 'new maps show up after launch');
  assert.ok(DAILY_V18 > '2026-10-01');
});

test('every cosmetic, outfit and weapon reward points at something that exists', () => {
  const refs = [...ACHIEVEMENTS.map((a) => a.reward?.cosmetic), ...KEEP.map((k) => k.cosmetic), ...EVENTS.flatMap((e) => e.rewards.map((r) => r.cosmetic))].filter(Boolean);
  for (const c of refs) { const [k, id] = c.split(':'); assert.ok(COSMETICS[k]?.[id], `${c} is a named cosmetic`); }
  assert.ok(KEEP.find((k) => k.weapon === 'repeater') && WEAPONS.repeater.keep === 'unlock_repeater');
  assert.ok(Object.keys(COSMETICS.hero).length >= 8);
  const palettes = { castle: CASTLE_SKINS, skin: TOWER_SKINS, trail: TRAILS, hero: HERO_OUTFITS, kill: KILL_FX };
  for (const [k, list] of Object.entries(COSMETICS)) for (const id of Object.keys(list)) assert.ok(id in palettes[k], `${k}:${id} can be drawn`);
});

test('v1.8.1 crit boons: Vital Strikes, Gilded Crits, Executioner, Killer Instinct', () => {
  const g = arena('meadow', 30);
  const e = g.spawnEnemy('shield', 0); e.hp = e.maxHp = 1e6;
  const base = g.damage(e, 100, 'physical', null, { crit: true });
  g.boons.vital = 1;
  const vital = g.damage(e, 100, 'physical', null, { crit: true });
  assert.ok(vital >= base, 'crits ignore armor');
  g.gold = 0; g.boons.critgold = 2;
  g.damage(e, 10, 'physical', null, { crit: true });
  assert.ok(g.gold > 0, 'crit gold');
  g.boons.executioner = 1; e.hp = e.maxHp * 0.1;
  const ex = g.damage(e, 100, 'magic', null);
  e.hp = e.maxHp; const nx = g.damage(e, 100, 'magic', null);
  assert.ok(ex > nx, 'executioner');
  const p = g.freePlots()[0]; g.gold = 1e6;
  const tw = g.build('archer', p.x, p.y);
  const c0 = g.computeStats(tw).critMult; g.boons.killer = 2;
  assert.ok(g.computeStats(tw).critMult > c0, 'killer instinct');
});
