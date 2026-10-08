import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as eco from '../src/game/economy.js';
import { validateRun, maxScore, dailySetup } from '../src/game/rules.js';
import { TOWERS, TIER, ARMORY } from '../src/data/balance.js';
import { simulate } from '../tools/sim.mjs';

test('tower and upgrade costs are positive and increase by tier', () => {
  for (const id of Object.keys(TOWERS)) {
    assert.ok(eco.towerCost(id) > 0);
    let prev = 0;
    for (let tier = 1; tier < TIER.max; tier++) {
      const c = eco.upgradeCost(id, tier);
      assert.ok(c > prev, `${id} tier ${tier}`);
      prev = c;
    }
    assert.equal(eco.upgradeCost(id, TIER.max), Infinity);
    assert.ok(eco.masteryCost(id, 5) > eco.masteryCost(id, 0), 'mastery gets pricier');
  }
  assert.ok(eco.towerCost('mint', { owned: 2 }) > eco.towerCost('mint'), 'extra mints cost more');
  assert.ok(eco.towerCost('archer', { discount: 0.2 }) < eco.towerCost('archer'));
});

test('selling refunds fully in the same build phase, partially afterwards', () => {
  assert.equal(eco.sellValue(100, true), 100);
  assert.equal(eco.sellValue(100, false), 70);
  assert.ok(eco.sellValue(100, false, 1) <= 95, 'refund capped');
});

test('gold scales up with waves; hero kills pay more', () => {
  assert.ok(eco.killGold(5, 50) > eco.killGold(5, 1));
  assert.ok(eco.killGold(5, 10, { hero: true }) > eco.killGold(5, 10));
  assert.ok(eco.waveClearGold(20) > eco.waveClearGold(1));
  assert.equal(eco.earlyCallGold(0, 10), 0);
  assert.ok(eco.earlyCallGold(20, 10) > eco.earlyCallGold(5, 10));
});

test('repairs get pricier later; castle costs more than wall', () => {
  assert.ok(eco.wallRepairCost(50, 30) > eco.wallRepairCost(50, 1));
  assert.ok(eco.castleRepairCost(10, 5) > eco.wallRepairCost(10, 5));
});

test('armory costs grow and respect caps', () => {
  assert.ok(eco.armoryCost('dmg', 3) > eco.armoryCost('dmg', 0));
  assert.equal(eco.armoryCost('ammo', ARMORY.ammo.cap), Infinity);
});

test('score multipliers and renown', () => {
  assert.equal(eco.scoreMultiplier([], 0), 1);
  assert.ok(eco.scoreMultiplier(['double', 'fog'], 2) > 1.5);
  assert.ok(eco.scoreMultiplier(['goldrush']) < 1);
  assert.ok(eco.renownFor(10000, 20) > eco.renownFor(1000, 5));
});

test('server validation accepts real simulated runs and rejects forged ones', () => {
  for (const [seed, keep, hero] of [['v1', 0, true], ['v2', 2, true], ['v3', 1, false]]) {
    const g = simulate({ seed, keepLevel: keep, hero, maxWave: 80 });
    const s = g.summary();
    const reason = validateRun({ ...s, mode: 'normal' });
    assert.equal(reason, null, `real run (wave ${s.wave}, score ${s.score}) was rejected: ${reason}`);
    assert.ok(s.score < maxScore(s.wave + 1, s.modifiers, s.ascension) / 5, 'bound has headroom');
  }
  const base = { wave: 20, score: 10000, kills: 500, heroKills: 50, duration: 900, modifiers: [], ascension: 0, mode: 'normal' };
  assert.equal(validateRun(base), null);
  assert.ok(validateRun({ ...base, score: 1e12 }));
  assert.ok(validateRun({ ...base, duration: 10 }));
  assert.ok(validateRun({ ...base, heroKills: 600 }));
  assert.ok(validateRun({ ...base, wave: -1 }));
  assert.ok(validateRun({ ...base, mode: 'daily', seed: 'daily-1999-01-01' }));
  assert.equal(validateRun({ ...base, mode: 'daily', seed: dailySetup().seed }), null);
});

test('daily setup is deterministic per date', () => {
  assert.deepEqual(dailySetup('2026-10-08'), dailySetup('2026-10-08'));
  assert.ok(dailySetup('2026-10-08').modifiers.length >= 1);
});
