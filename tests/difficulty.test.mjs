import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import * as eco from '../src/game/economy.js';
import { validateRun, headStartPackage, cleanStart, START_WAVES } from '../src/game/rules.js';
import { DIFFICULTY, HEADSTART, ECON } from '../src/data/balance.js';
import { simulate } from '../tools/sim.mjs';

test('difficulty presets start at wave 1 and climb', () => {
  assert.equal(DIFFICULTY[0].wave, 1);
  for (let i = 1; i < DIFFICULTY.length; i++) assert.ok(DIFFICULTY[i].wave > DIFFICULTY[i - 1].wave);
  assert.deepEqual(START_WAVES, DIFFICULTY.map((d) => d.wave));
  assert.equal(cleanStart(30), 30);
  assert.equal(cleanStart(33), 1, 'unknown start waves count as wave 1');
});

test('starting higher hands out a head start that grows with the wave', () => {
  const none = headStartPackage(1);
  assert.deepEqual(none, { gold: 0, plots: 0, boons: 0 });
  let prev = 0;
  for (const d of DIFFICULTY.slice(1)) {
    const p = headStartPackage(d.wave);
    assert.ok(p.gold > prev, `gold grows at wave ${d.wave}`);
    assert.ok(p.plots <= HEADSTART.plotCap && p.boons <= HEADSTART.boonCap);
    prev = p.gold;
  }
});

test('a start-wave run begins on that wave with gold, extra plots and a boon pick waiting', () => {
  const base = new Game({ seed: 'hs' });
  const g = new Game({ seed: 'hs', startWave: 30 });
  assert.equal(g.wave, 30);
  assert.ok(g.gold > base.gold + 1000);
  assert.ok(g.claimed.size > base.claimed.size);
  assert.ok(g.boonOffer, 'a boon offer is waiting');
  assert.equal(g.startWave(), false, 'cannot start the wave before choosing');
  const picks = headStartPackage(30).boons;
  let n = 0;
  while (g.boonOffer && n++ < 20) g.chooseBoon(g.boonOffer[0]);
  assert.equal(n, picks, 'one pick per head-start boon');
  assert.equal(g.stats.boonsTaken, picks);
  assert.equal(g.startWave(), true);
});

test('waves cleared counts only the waves you played, and ranking credit is discounted', () => {
  const g = simulate({ seed: 'rel', startWave: 20, maxWave: 24, keepLevel: 2, hero: true });
  const s = g.summary();
  assert.equal(s.start, 20);
  assert.equal(s.wavesCleared, Math.max(0, s.wave - 20));
  assert.ok(s.rankWave < s.wave);
  assert.equal(eco.rankWave(20, 20), Math.floor(20 - 19 * (1 - HEADSTART.rankCredit)));
  assert.equal(eco.rankWave(12, 1), 12);
});

test('start wave survives save and load', () => {
  const g = new Game({ seed: 'sv', startWave: 10 });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  const s = JSON.parse(JSON.stringify(g.serialize()));
  const h = new Game({ seed: s.seed, save: s });
  assert.equal(h.start, 10);
  assert.equal(h.wave, g.wave);
});

test('server validation: start waves must be real presets and cannot be used for dailies', () => {
  const base = { seed: 'x', map: 'meadow', mode: 'normal', modifiers: [], ascension: 0, wave: 35, wavesCleared: 5, score: 20000, kills: 400, heroKills: 80, duration: 120 };
  assert.equal(validateRun({ ...base, start: 30 }), null, 'a short run from wave 30 is plausible');
  assert.ok(validateRun({ ...base, start: 1 }), 'the same run from wave 1 is too fast');
  assert.ok(validateRun({ ...base, start: 31 }), 'unknown start wave');
  assert.ok(validateRun({ ...base, start: 30, mode: 'daily' }), 'dailies start on wave 1');
  assert.ok(validateRun({ ...base, start: 40, wave: 35 }), 'cannot end before the start');
});

test('renown pays more per wave later in a run and for later starts, plus bosses and score', () => {
  const r = (waves, o = {}) => eco.renownFor(0, waves, 0, 0, o.start || 0);
  assert.ok(r(20) > 2 * r(10), 'waves pay more the deeper you go');
  assert.ok(r(10, { start: 40 }) > r(10), 'a later start pays more per wave');
  assert.ok(eco.renownFor(0, 10, 0, 2) > eco.renownFor(0, 10, 0, 0));
  assert.ok(eco.renownFor(15000, 0) >= 100, 'score contributes');
  assert.equal(eco.renownFor(0, 0), 0);
  const b = eco.renownBreakdown(3000, 12, { bosses: 1 });
  assert.equal(b.total, Math.floor(b.fromScore + b.fromWaves + b.fromBosses));
  // A decent first run lands in a rewarding range (it used to take far longer to afford anything).
  assert.ok(eco.renownFor(4000, 15, 0, 1) >= 70);
  assert.ok(ECON.renownDailyCap > 0);
});
