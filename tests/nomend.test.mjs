import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { ENEMIES, BOSSES } from '../src/data/balance.js';

const mk = (mode) => new Game({ seed: 'nm', mapId: 'meadow', mode, bonus: { unlockedTroops: new Set(['footman', 'engineer', 'cleric']) } });

test('no mending: engineers cannot be raised in Last Stand or Endurance', () => {
  for (const mode of ['laststand', 'endurance']) {
    const g = mk(mode);
    assert.equal(g.noMend, true, mode);
    assert.equal(g.trainBlock('engineer'), 'nomend', mode);
  }
  assert.notEqual(mk('normal').trainBlock('engineer'), 'nomend');
});

test('no mending: kits, the Mend art and sanctum/wall regen do nothing', () => {
  const g = mk('laststand');
  g.repairKits = 2; g.wall.hp = 10;
  assert.equal(g.useRepairKit(), false);
  assert.equal(g.abilityKnown('mend'), false);
  g.wallHealRate = 0.02; g.bonus.wallRegen = 0.02;
  g.update?.(1);
  assert.ok(g.wall.hp <= 10 + 1e-6);
});

test('boss breach: wall takes double and some damage bleeds into the keep', () => {
  const g = new Game({ seed: 'b', mapId: 'meadow' });
  const boss = { def: BOSSES[0], boss: true, air: false, dead: false, x: 0, y: 0 };
  g.plan = { boss: { cycle: 0 }, hp: 1 };
  const w0 = g.wall.hp, c0 = g.castle.hp;
  g.leak(boss);
  assert.ok(w0 - g.wall.hp > 0);
  assert.ok(c0 - g.castle.hp > 0, 'castle takes spill damage while the wall holds');
  const grunt = { def: ENEMIES.grunt, boss: false, air: false, dead: false, x: 0, y: 0 };
  const c1 = g.castle.hp; g.leak(grunt);
  assert.equal(g.castle.hp, c1, 'ordinary foes do not bleed through');
});
