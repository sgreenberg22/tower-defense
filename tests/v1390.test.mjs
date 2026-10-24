// v1.39: six new foes, five new weapons, five new modes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { GAME, ENEMIES, WEAPONS, KEEP, BOSSES } from '../src/data/balance.js';
import { TRIALS, trialStars, LOCAL_MODES, BOSSRUSH } from '../src/game/modes.js';
import { ACHIEVEMENTS } from '../src/meta/achievements.js';
import { defaultProfile, recordRun } from '../src/meta/profile.js';
import { validateRun } from '../src/game/rules.js';
import { adviceFor } from '../src/game/counters.js';

const arena = (o = {}) => { const g = new Game({ seed: 'v139', mapId: 'meadow', mode: 'normal', startWave: 30, ...o }); while (g.boonOffer) g.chooseBoon(g.boonOffer[0]); g.startWave(); g.spawnQueue = []; g.enemies = []; return g; };

test('the new foes are described and appear in waves', async () => {
  const { planWave } = await import('../src/game/waves.js');
  for (const id of ['phalanx', 'sapwright', 'mirror', 'minesapper', 'herald']) { assert.ok(ENEMIES[id].desc, id); assert.ok(adviceFor(id).tags.length > 0, id); }
  assert.ok(BOSSES.find((b) => b.id === 'frostgiant'));
  const seen = new Set();
  for (let w = 20; w <= 60; w++) for (const g of planWave(w, 'seed-v139').groups) seen.add(g.type);
  for (const id of ['phalanx', 'sapwright', 'mirror', 'minesapper', 'herald']) assert.ok(seen.has(id), id);
  assert.ok(!seen.has('barricade'), 'barricades only come from engineers');
});

test('phalanx halves single shots while locked; splash breaks it', () => {
  const g = arena(); const [a, b] = [g.spawnEnemy('phalanx', 0), g.spawnEnemy('phalanx', 0)]; b.x += 0.3;
  g.update(GAME.step);
  let h = a.hp; g.damage(a, 100, 'physical', null); const locked = h - a.hp;
  g.damage(a, 10, 'physical', null, { splash: true }); h = a.hp; g.damage(a, 100, 'physical', null);
  assert.ok(Math.abs((h - a.hp) / locked - 2) < 0.05, 'broken wall takes double what the locked one did');
});

test('a Standard-Bearer protects foes near it; a Mirror Mage reflects magic once', () => {
  const g = arena(); const he = g.spawnEnemy('herald', 0), gr = g.spawnEnemy('grunt', 0); gr.x = he.x; gr.y = he.y; gr.armor = 0;
  g.update(GAME.step); let h = gr.hp; g.damage(gr, 100, 'physical', null); assert.ok(Math.abs(h - gr.hp - 75) < 0.5);
  const mm = g.spawnEnemy('mirror', 0), tw = { type: 'mage', hp: 100, maxHp: 100, cx: 1, cy: 1, dmg: 0 };
  assert.equal(g.damage(mm, 50, 'magic', tw), 0); assert.ok(tw.disabledT > 0 && tw.hp < 100);
  h = mm.hp; g.damage(mm, 50, 'magic', tw); assert.ok(mm.hp < h, 'the mirror needs time to come back');
});

test('Siege Engineers throw up barricades that never leak and fall apart', () => {
  const g = arena(); const sw = g.spawnEnemy('sapwright', 0); sw.barrCd = 0;
  g.update(GAME.step);
  const b = g.enemies.find((e) => e.type === 'barricade');
  assert.ok(b && b.dist > sw.dist, 'ahead of the engineer');
  const leaks = g.stats.leaks; for (let t = 0; t < 13; t += GAME.step) g.update(GAME.step);
  assert.ok(b.dead && b.expired, 'gone after its life'); assert.equal(g.stats.leaks >= leaks, true);
});

test('a Tunnel Sapper reaching the keep goes under the wall', () => {
  const g = arena(); const ms = g.spawnEnemy('minesapper', 0), w0 = g.wall.hp, c0 = g.castle.hp;
  g.leak(ms); assert.equal(g.wall.hp, w0); assert.ok(c0 - g.castle.hp > 0);
});

test('the Frost Giant freezes towers near it', () => {
  const g = arena(); g.gold = 1e4; const p = g.map.plots.find((q) => g.plotOpen(q.x, q.y)); const t = g.build('archer', p.x, p.y);
  const fg = g.spawnEnemy('boss', 0, { boss: 'frostgiant' }); fg.x = t.cx + 0.5; fg.y = t.cy; fg.cd = 0;
  g.enemyAbilities(fg, 0.016); assert.ok(t.disabledT > 2);
});

test('new weapons: each has a Keep unlock and four Mastery perks, and fires', () => {
  for (const id of ['chainwhip', 'grapple', 'flasks', 'harpoon', 'bell']) {
    assert.ok(KEEP.find((k) => k.id === WEAPONS[id].keep), id);
    assert.equal(KEEP.filter((k) => k.weaponPerk === id).length, 4, id);
    const g = arena({ weapon: id }); const e = g.spawnEnemy(id === 'harpoon' ? 'wyvern' : 'grunt', 0);
    for (let i = 0; i < 30 && !g.enemies.some((x) => x.x > 0); i++) g.update(GAME.step);
    if (id === 'bell') { const c = g.map.castle; e.x = c.x - 3; e.y = c.y; }
    g.weapon.ammo = 9; const h = e.hp;
    assert.ok(g.heroFire(e.x, e.y - (e.air ? 0.35 : 0.1), 0, 2), id);
    for (let i = 0; i < 120; i++) g.update(GAME.step);
    assert.ok(e.hp < h || e.dead, id + ' hurts');
  }
});

test('Boss Rush: every fight is a boss wave and the score is bosses felled', () => {
  const g = new Game({ seed: 'br', mapId: 'meadow', mode: 'bossrush' });
  assert.equal(g.wave, BOSSRUSH.firstWave); assert.ok(g.nextPlan.boss);
  const p = defaultProfile(); recordRun(p, { ...g.summary(), bossKills: 4, wavesCleared: 4, wave: 50 });
  assert.equal(p.local.bossrush.best, 4);
  assert.ok(ACHIEVEMENTS.find((a) => a.id === 'rush3').check(p));
  assert.equal(validateRun({ ...g.summary(), wave: 50, wavesCleared: 4, duration: 600, modifiers: [] }), null);
});

test('Draft: towers come only from cards, one more card each wave', () => {
  const g = new Game({ seed: 'dr', mapId: 'meadow', mode: 'draft' });
  assert.ok(g.draft.offer?.length >= 2); assert.equal(g.startWave(), false, 'pick a card first');
  const id = g.draft.offer[0]; g.chooseDraft(id); const p = g.map.plots.find((q) => g.plotOpen(q.x, q.y)), gold = g.gold;
  assert.ok(g.build(id, p.x, p.y)); assert.equal(g.gold, gold, 'cards build free');
  const s = g.serialize(); const g2 = new Game({ seed: 'dr', mapId: 'meadow', mode: 'draft', save: s }); assert.deepEqual(g2.draft.hand, g.draft.hand);
});

test('Night Siege: towers see only what is lit', () => {
  const g = new Game({ seed: 'nt', mapId: 'meadow', mode: 'night' });
  const e = { x: 0.5, y: 0.5, burnT: 0, markT: 0 };
  assert.equal(g.isVisible(e), g.lights().some((l) => Math.hypot(l.x - 0.5, l.y - 0.5) <= l.r));
  e.burnT = 2; assert.equal(g.isVisible(e), true, 'fire gives it away');
  assert.ok(g.scoreMult() > 1);
});

test('Siege Trials: ten levels, stars by keep and wall', () => {
  assert.equal(TRIALS.length, 10);
  assert.equal(trialStars({ victory: false }), 0); assert.equal(trialStars({ victory: true, castlePct: 0.5, wallPct: 0 }), 1);
  assert.equal(trialStars({ victory: true, castlePct: 0.95, wallPct: 0.6 }), 3);
  const g = new Game({ seed: 'trial-t1', mapId: 'meadow', mode: 'trials', trial: 't1' });
  assert.equal(g.points, TRIALS[0].points); assert.equal(g.wave, TRIALS[0].start); assert.equal(g.isTowerUnlocked('mage'), false);
  const p = defaultProfile(); recordRun(p, { ...g.summary(), stars: 2, victory: true }); assert.equal(p.trials.t1, 2);
  for (const id of ['bossrush', 'draft', 'night', 'duo', 'trials']) assert.ok(LOCAL_MODES.includes(id));
});

test('Duo Siege: an ordinary economy with the hero on the wall', () => {
  const g = new Game({ seed: 'du', mapId: 'meadow', mode: 'duo' });
  assert.equal(g.hero, true); assert.ok(!g.auto); assert.ok(g.gold > 0);
});
