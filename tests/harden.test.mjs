import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { TIER, hardening } from '../src/data/balance.js';

test('hardening: milestones at mastery 5, 10 and 15 only, and modest', () => {
  assert.equal(hardening(4).n, 0);
  assert.equal(hardening(5).n, 1);
  assert.equal(hardening(15).n, 3);
  const h = hardening(30);
  assert.equal(h.n, 3);
  assert.ok(h.hp <= 1.6 + 1e-9 && h.resist < 0.15);
});

test('hardening: a mastered tower gains HP at ★5 and takes less damage', () => {
  const g = new Game({ seed: 'hd', mapId: 'meadow' });
  g.gold = 1e9;
  const plot = g.map.plots?.[0] || g.plots?.[0];
  const t = g.makeTower('archer', plot.x, plot.y, TIER.max);
  g.towers.push(t); g.applyTierHp(t); t.hp = t.maxHp;
  const base = t.maxHp;
  t.mastery = 4; g.applyTierHp(t);
  assert.equal(Math.round(t.maxHp), Math.round(base));
  t.mastery = 4; t.invested = 1;
  g.upgrade(t);
  assert.equal(t.mastery, 5);
  assert.ok(Math.abs(t.maxHp / base - 1.2) < 1e-6, 'maxHp +20%');
  assert.equal(t.hp, t.maxHp, 'milestone arrives healed');
  const before = t.hp; g.damageTower(t, 100);
  assert.ok(Math.abs((before - t.hp) - 95) < 1e-6, '5% resist');
});

test('starting squad: free soldiers wait at the gate, capped by slots and Valor', () => {
  const g = new Game({ seed: 'sq', mapId: 'meadow', squad: ['footman', 'bowman', 'knight', 'pikeman', 'footman'] });
  const kinds = g.garrison.units.map((u) => u.kind);
  assert.deepEqual(kinds, ['footman', 'bowman', 'pikeman'], 'knight needs too much Valor; the fourth is over the slot cap');
  assert.equal(g.gold, new Game({ seed: 'sq', mapId: 'meadow' }).gold, 'no gold spent');
});
