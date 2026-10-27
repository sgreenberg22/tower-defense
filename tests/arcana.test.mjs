import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { TOWERS } from '../src/data/balance.js';

const live = (g) => { g.startWave(); g.spawnQueue = []; return g; };
const place = (g, type, x, y, tier = 1) => { const t = g.makeTower(type, x, y, tier); g.towers.push(t); g.applyTierHp(t); t.hp = t.maxHp; g.refreshTowers(); return t; };

test('magic boons: Arcane Flux boosts every magic tower, Tesla included, and magic weapons', () => {
  const g = new Game({ seed: 'arc', mapId: 'meadow', weapon: 'wand', bonus: { unlockedWeapons: new Set(['wand']) } });
  const plots = g.map.plots;
  const tesla = place(g, 'tesla', plots[0].x, plots[0].y), mage = place(g, 'mage', plots[1].x, plots[1].y);
  const before = { tesla: tesla.stats.dmg, mage: mage.stats.dmg, w: g.weaponStats().dmg };
  g.boons.arcane = 2; g.refreshTowers();
  for (const [t, b] of [[tesla, before.tesla], [mage, before.mage]]) assert.ok(Math.abs(t.stats.dmg / b - 1.44) < 1e-9, t.type);
  assert.equal(g.weapon.id, 'wand');
  assert.ok(Math.abs(g.weaponStats().dmg / before.w - 1.44) < 1e-9, 'magic weapon');
  g.boons.mage_chain = 1; g.refreshTowers();
  assert.equal(tesla.stats.chain, TOWERS.tesla.chain + 1);
});

test('Conductive Air is offered with Tesla even when Mage is not in the roster', () => {
  const g = new Game({ seed: 'ca', mapId: 'meadow', bonus: { unlockedTowers: new Set(['archer', 'tesla']) } });
  const g2 = new Game({ seed: 'ca', mapId: 'meadow', bonus: { unlockedTowers: new Set(['archer', 'cannon']) } });
  assert.ok(g.boonPool().some((b) => b.id === 'mage_chain'));
  assert.ok(!g2.boonPool().some((b) => b.id === 'mage_chain'));
});

test('Arc Fence: two coils link and shock a foe crossing between them', () => {
  const g = live(new Game({ seed: 'fence', mapId: 'meadow' }));
  const e = g.spawnEnemy('grunt', 0); e.maxHp = e.hp = 1e6;
  const a = place(g, 'tesla', Math.floor(e.x) - 1, Math.floor(e.y)), b = place(g, 'tesla', Math.floor(e.x) + 1, Math.floor(e.y));
  a.cy = b.cy = e.y; a.cx = e.x - 1.2; b.cx = e.x + 1.2; g.refreshTowers();
  assert.equal(g.fences.length, 1);
  const hp = e.hp; g.fenceStep(0.01);
  assert.ok(e.hp < hp, 'fence hurt the foe');
  assert.ok(e.slow >= TOWERS.tesla.fence.slow);
  b.cx = a.cx + 9; g.refreshTowers();
  assert.equal(g.fences.length, 0, 'out of reach: no fence');
});

test('Mage Dispel pops a bubble and blocks re-warding; Hexweaver spreads Hex', () => {
  const g = live(new Game({ seed: 'disp', mapId: 'meadow' }));
  const m = place(g, 'mage', g.map.plots[0].x, g.map.plots[0].y);
  const e = g.spawnEnemy('grunt', 0), n = g.spawnEnemy('grunt', 0);
  n.x = e.x + 0.5; n.y = e.y;
  e.shield = 500; e.buffT = 1;
  g.dispel(e, m.stats);
  assert.equal(e.shield, 0); assert.equal(e.buffT, 0); assert.ok(e.dispelT > 0);
  m.spec = 'storm'; g.refreshTowers();
  g.spellTouch(e, m);
  assert.ok(n.hexT > 0 && n.slow > 0, 'hex spread with a slow');
});

test('Archmage: every 4th bolt is an Arcane Nova', () => {
  const g = live(new Game({ seed: 'nova', mapId: 'meadow' }));
  const m = place(g, 'mage', g.map.plots[0].x, g.map.plots[0].y, 5); m.mastery = 15; g.refreshTowers();
  assert.equal(m.stats.novaEvery, 4);
  const e = g.spawnEnemy('grunt', 0); e.maxHp = e.hp = 1e6;
  let novas = 0; g.on('nova', () => novas++);
  for (let i = 0; i < 8; i++) { g.towerFire(m, m.stats, e); const p = g.projectiles.at(-1); p.x = p.lx = e.x; p.y = p.ly = e.y; }
  for (let i = 0; i < 30; i++) g.updateProjectiles?.(0.05);
  assert.equal(novas, 2);
});
