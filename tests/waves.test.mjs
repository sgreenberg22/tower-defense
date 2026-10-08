import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rawCount, waveCount, hpMult, speedMult, armorAdd, isBossWave, biomeIndex, planWave, previewTypes, bossFor, unlockedTypes } from '../src/game/waves.js';
import { GAME, ENEMIES, BIOMES, BOSSES } from '../src/data/balance.js';

test('enemy count grows and is capped', () => {
  let prev = 0;
  for (let w = 1; w <= 300; w++) {
    const c = waveCount(w);
    assert.ok(c >= prev, `count shrank at wave ${w}`);
    assert.ok(c <= GAME.maxEnemies);
    prev = c;
  }
  assert.equal(waveCount(300), GAME.maxEnemies);
  assert.ok(rawCount(300) > GAME.maxEnemies, 'overflow exists so HP must absorb it');
});

test('HP multiplier rises monotonically and stays finite at wave 200+', () => {
  let prev = 0;
  for (let w = 1; w <= 250; w++) {
    const m = hpMult(w);
    assert.ok(Number.isFinite(m) && m > prev, `hp mult not increasing at ${w}`);
    prev = m;
  }
  assert.ok(hpMult(1) === 1, 'wave 1 is the baseline');
  assert.ok(hpMult(200) < 1e7, `wave 200 multiplier sane (${hpMult(200).toFixed(0)})`);
  assert.ok(hpMult(200, { ascension: 10 }) > hpMult(200), 'ascension makes enemies tougher');
});

test('overflowed enemies fold into HP (no wave gets easier past the cap)', () => {
  for (let w = 40; w <= 200; w++) {
    const total = (w2) => waveCount(w2) * hpMult(w2);
    assert.ok(total(w) > total(w - 1), `total wave HP dipped at ${w}`);
  }
});

test('speed and armor are capped', () => {
  assert.ok(speedMult(1000) <= 1.45 + 1e-9);
  assert.ok(speedMult(10, { double: true }) > speedMult(10));
  assert.ok(armorAdd(1000) <= 25);
});

test('bosses every 10 waves, biomes every 25', () => {
  assert.ok(isBossWave(10) && isBossWave(20) && !isBossWave(15) && !isBossWave(0));
  assert.equal(biomeIndex(1), 0); assert.equal(biomeIndex(25), 0); assert.equal(biomeIndex(26), 1);
  assert.equal(biomeIndex(25 * BIOMES.length + 1), 0, 'biomes cycle');
  assert.equal(bossFor(10).id, BOSSES[0].id);
  assert.equal(bossFor(10 * BOSSES.length + 10).cycle, 1, 'bosses come back stronger');
});

test('wave plans are deterministic per seed and match their totals', () => {
  for (const w of [1, 5, 10, 33, 77, 150]) {
    const a = planWave(w, 'seed-a'), b = planWave(w, 'seed-a'), c = planWave(w, 'seed-b');
    assert.deepEqual(a, b);
    const n = a.groups.reduce((s, g) => s + g.count, 0);
    assert.equal(n, a.total);
    if (w > 3) assert.notDeepEqual(a.groups, c.groups, 'different seeds differ');
    for (const g of a.groups) if (g.type !== 'boss') assert.ok(ENEMIES[g.type].unlock <= w, `${g.type} appeared too early`);
    assert.ok(previewTypes(a).length >= 1);
  }
  assert.ok(planWave(10, 'x').boss, 'boss wave has a boss');
});

test('new enemy types get unlocked over time', () => {
  assert.deepEqual(unlockedTypes(1), ['grunt']);
  assert.ok(unlockedTypes(30).length >= 12);
});
