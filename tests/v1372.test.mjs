// v1.37.2: the trap cap shown in the build bar, long-road achievements, and the Blessings list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { PLOTS } from '../src/data/balance.js';
import { ACHIEVEMENTS } from '../src/meta/achievements.js';
import { blessingRows } from '../src/ui/blessings.js';
import { defaultProfile } from '../src/meta/profile.js';

test('the Fire Trap cap never reads higher than the traps that can be placed', () => {
  for (const mode of ['normal', 'laststand', 'endurance', 'sprint', 'gauntlet']) {
    const g = new Game({ seed: 'trapcap', mapId: 'meadow', mode });
    assert.equal(g.towerCap('firetrap'), PLOTS.trapCap, mode);
    assert.ok(g.towerCap('archer') >= 4, mode);
  }
});

test('high-wave achievements exist and unlock at their waves', () => {
  const by = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
  const p = defaultProfile(); p.best.wave.meadow = 499;
  for (const [id, wave] of [['wave200', 200], ['wave300', 300], ['wave400', 400], ['wave500', 500], ['wave750', 750], ['wave1000', 1000]]) {
    assert.ok(by[id], id);
    p.best.wave.meadow = wave - 1; assert.equal(!!by[id].check(p, null), false, id + ' too early');
    p.best.wave.meadow = wave; assert.equal(!!by[id].check(p, null), true, id);
  }
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
});

test('Daily Supplies achievements follow the chests opened', () => {
  const by = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
  const p = defaultProfile();
  assert.equal(!!by.supply1.check(p), false);
  p.supplyOpened = 7; assert.equal(!!by.supply7.check(p), true); assert.equal(!!by.supply30.check(p), false);
});

test('blessingRows names every bonus in plain words and is empty without any', () => {
  assert.deepEqual(blessingRows({ castleHpMult: 1, startGold: 0, towerDiscount: 0 }), []);
  const rows = blessingRows({ castleHpMult: 1.15, startGold: 60, towerDiscount: 0.06, secondWind: true });
  const text = rows.map((r) => r.text).join('|');
  assert.match(text, /Keep \+15% HP/); assert.match(text, /\+60 starting gold/); assert.match(text, /Towers 6% cheaper/); assert.match(text, /Second Wind/);
});
