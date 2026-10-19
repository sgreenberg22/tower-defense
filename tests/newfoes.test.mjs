import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { ENEMIES, BOSSES, BOSS_DESC, THREATS } from '../src/data/balance.js';
import { adviceFor } from '../src/game/counters.js';
import { planWave, bossFor } from '../src/game/waves.js';

function arena(wave = 40) {
  const g = new Game({ seed: 'nf', mapId: 'meadow', startWave: wave });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  g.startWave(); g.spawnQueue = []; g.enemies = [];
  return g;
}

test('fifteen new foes and bosses are fully described', () => {
  const foes = ['warg', 'pavise', 'rat', 'mangonel', 'berserker', 'escalade', 'siegetower', 'wight', 'treant', 'fellrider'];
  const bosses = ['pitfiend', 'wraithking', 'beastmaster', 'trebuchet', 'elderoak'];
  for (const id of foes) { assert.ok(ENEMIES[id] && ENEMIES[id].desc && ENEMIES[id].unlock > 1, id); assert.ok(adviceFor(id).tags.length, id); }
  for (const id of bosses) { assert.ok(BOSSES.find((b) => b.id === id), id); assert.ok(BOSS_DESC[id], id); assert.ok(adviceFor('boss:' + id).tags.length, id); }
  for (const t of ['warband', 'engines', 'undead']) assert.ok(THREATS[t]);
  assert.equal(bossFor(60).id, 'pitfiend'); assert.equal(bossFor(100).id, 'elderoak');
});

test('the new foes appear in waves', () => {
  const seen = new Set();
  for (let w = 15; w <= 90; w++) for (const g of planWave(w, 'seed-x').groups) seen.add(g.type === 'boss' ? 'boss:' + g.boss : g.type);
  for (const id of ['warg', 'pavise', 'rat', 'mangonel', 'berserker', 'escalade', 'siegetower', 'wight', 'treant', 'fellrider', 'boss:pitfiend']) assert.ok(seen.has(id), id);
});

test('Barrow Wight chills towers beside it, and a Sanctum cleanses it', () => {
  const g = arena();
  const p = g.map.plots.find((q) => g.claimed.has(q.k)); g.gold = 9999; g.build('archer', p.x, p.y);
  const tw = g.towers[g.towers.length - 1];
  const w = g.spawnEnemy('wight', 0, {}); w.x = tw.cx + 0.4; w.y = tw.cy; w.cd = 0;
  g.enemyAbilities(w, 0.016);
  assert.ok(tw.chilledT > 2, 'chilled');
  tw.chilledT = 0; tw.cleanse = true; w.cd = 0; g.enemyAbilities(w, 0.016);
  assert.ok(!(tw.chilledT > 0), 'cleansed towers shrug it off');
});

test('Berserkers sprint when hurt; Escalade Teams skip the wall', () => {
  const g = arena();
  const b = g.spawnEnemy('berserker', 0, {}); const x0 = b.dist;
  for (let i = 0; i < 60; i++) g.update(); const fresh = b.dist - x0;
  const b2 = g.spawnEnemy('berserker', 0, {}); b2.hp = b2.maxHp * 0.3; const y0 = b2.dist;
  for (let i = 0; i < 60; i++) g.update(); assert.ok(b2.dist - y0 > fresh * 1.5, 'enraged berserker is much faster');
  g.enemies = [];
  const wall0 = g.wall.hp, keep0 = g.castle.hp;
  const e = g.spawnEnemy('escalade', 0, {}); g.leak(e);
  assert.equal(g.wall.hp, wall0, 'the wall is untouched'); assert.ok(g.castle.hp < keep0, 'the keep takes the hit');
});

test('Siege Tower spills grunts; Mangonel outranges a tower', () => {
  const g = arena();
  const t = g.spawnEnemy('siegetower', 0, {}); t.hp = 1; g.damage(t, 9999, 'physical', null);
  assert.ok(g.enemies.filter((e) => e.type === 'grunt' && !e.dead).length >= 4);
  assert.ok(ENEMIES.mangonel.shoots.range > 4);
});
