import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVINCES, MAX_PROVINCES, TERRITORY, dominions, grandeur, mapPerks, scoutFoe, standingFor, frontier } from '../src/game/realmmap.js';
import { planWave } from '../src/game/waves.js';
import { ENEMIES } from '../src/data/balance.js';

test('Dominions: a land pays out at a foothold and again when wholly held', () => {
  const none = dominions(TERRITORY.start);
  assert.ok(none.every((d) => d.level === 0), 'the heartland ring alone earns no Dominion');
  const all = dominions(MAX_PROVINCES);
  for (const d of all) { assert.equal(d.have, d.total); assert.equal(d.level, 2, d.id); assert.ok(d.tiers.every((t) => t.text && t.need >= 1)); }
  for (const d of all) assert.ok(d.tiers[0].need < d.tiers[1].need, d.id + ' needs fewer provinces for its first gift');
});

test('every province the Realm holds only ever adds to the gifts, and losing ground takes them back', () => {
  let prev = 0;
  for (let n = TERRITORY.floor; n <= MAX_PROVINCES; n++) {
    const total = Object.values(mapPerks(n)).reduce((a, v) => a + v, 0);
    assert.ok(total >= prev - 1e-9, 'gifts never shrink as the Realm grows (' + n + ')');
    prev = total;
  }
  assert.ok((mapPerks(MAX_PROVINCES).startPlots || 0) >= 1 && !(mapPerks(8).startPlots > 0 && 8 < 12), 'Grandeur gifts arrive at their mark');
  const g = grandeur(20); assert.equal(g.filter((x) => x.earned).length, 2);
  assert.ok(mapPerks(MAX_PROVINCES).towerDmg > mapPerks(MAX_PROVINCES - 1).towerDmg - 1);
});

test('Scouts come from the next province to be taken and join ordinary waves', () => {
  assert.equal(scoutFoe(MAX_PROVINCES), null);
  const foe = scoutFoe(10); assert.equal(foe, frontier(10).next.foe); assert.ok(ENEMIES[foe]);
  const hasScout = (opts) => { let n = 0; for (let w = 12; w <= 40; w++) for (const g of planWave(w, 'sc-seed', opts).groups) if (g.type === foe) n += g.count; return n; };
  assert.ok(hasScout({ scout: foe }) > hasScout({}), 'scouts add to the foe');
  assert.deepEqual(planWave(5, 's', { scout: foe }).groups, planWave(5, 's', {}).groups, 'nothing changes in the opening waves');
  assert.ok(standingFor(MAX_PROVINCES).name && standingFor(6).name !== standingFor(MAX_PROVINCES).name);
});
