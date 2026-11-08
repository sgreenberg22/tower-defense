// v1.60.2 · "How the castle fell": the engine records who breached, the defeat screen explains the loss.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { castleFall, fallLine } from '../src/meta/defeat.js';

// A castle with no towers falls in a few waves, so every breach is real engine output.
function playToDefeat(seed = 'fall-1', mapId = 'meadow') {
  const g = new Game({ seed, mapId });
  g.on('leak', () => {});
  let steps = 0;
  while (!g.over && steps < 60 * 60 * 40) {
    if (g.phase === 'build') { while (g.boonOffer) g.chooseBoon(g.boonOffer[0]); g.startWave(); }
    g.update(1 / 60); steps++;
  }
  return g;
}

test('a lost run records who got through and which foe landed the last blow', () => {
  const g = playToDefeat();
  assert.ok(g.over, 'the undefended castle fell');
  const s = g.summary();
  assert.ok(s.fatal, 'the final blow is recorded');
  assert.equal(typeof s.fatal.name, 'string');
  assert.equal(s.fatal.wave, g.wave);
  const rows = Object.values(s.leakBy);
  assert.ok(rows.length > 0, 'breaches are tallied by foe');
  assert.equal(rows.reduce((a, r) => a + r.n, 0), g.stats.leaks, 'every counted leak is in the tally');
  assert.ok(rows.every((r) => r.dmg >= 0 && r.n >= 1 && r.name));
  assert.ok(rows.some((r) => r.name === s.fatal.name), 'the fatal foe appears in the tally');
});

test('recording breaches does not change the simulation', () => {
  const a = playToDefeat('fall-2'), b = playToDefeat('fall-2');
  assert.equal(a.wave, b.wave); assert.equal(a.stats.kills, b.stats.kills); assert.equal(a.stats.leaks, b.stats.leaks);
  assert.deepEqual(a.summary().leakBy, b.summary().leakBy, 'same seed, same tally');
});

test('the tally survives a save and a resume', () => {
  const g = new Game({ seed: 'fall-3', mapId: 'meadow' });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  g.stats.leakBy = { grunt: { name: 'Grunt', n: 2, dmg: 9, air: false, boss: false } };
  const save = JSON.parse(JSON.stringify(g.serialize()));
  const g2 = new Game({ seed: 'fall-3', mapId: 'meadow', save });
  g2.load(save);
  assert.deepEqual(g2.stats.leakBy, g.stats.leakBy, 'the tally is restored');
  const old = JSON.parse(JSON.stringify(g.serialize())); delete old.stats.leakBy;
  const g3 = new Game({ seed: 'fall-3', mapId: 'meadow', save: old });
  g3.load(old);
  assert.equal(g3.stats.leakBy, undefined, 'a save from before v1.60.2 simply has no tally yet');
  assert.doesNotThrow(() => g3.summary(), 'and still summarises');
  assert.deepEqual(g3.summary().leakBy, {});
});

test('castleFall ranks the breachers, names the final blow and only mentions flyers when they matter', () => {
  const run = { victory: false, fatal: { name: 'Ogre', wave: 34, boss: false },
    leakBy: { ogre: { name: 'Ogre', n: 3, dmg: 60, air: false }, grunt: { name: 'Grunt', n: 12, dmg: 25, air: false }, bat: { name: 'Bat', n: 9, dmg: 15, air: true }, imp: { name: 'Imp', n: 1, dmg: 0.0001, air: false } } };
  const f = castleFall(run);
  assert.equal(f.headline, 'The final blow came from an Ogre.');
  assert.ok(!/\d/.test(f.headline), 'no wave number: the screen headline counts waves held');
  assert.deepEqual(f.parts.map((p) => p.name), ['Ogre', 'Grunt', 'Bat'], 'top three by damage');
  assert.deepEqual(f.parts.map((p) => p.pct), [60, 25, 15]);
  assert.equal(f.hint, null, '15% flyer damage is not worth a hint');
  assert.equal(fallLine(f.parts), 'Ogre ×3 (60%), Grunt ×12 (25%), Bat ×9 (15%)');

  const air = castleFall({ ...run, leakBy: { bat: { name: 'Bat', n: 9, dmg: 60, air: true }, ogre: { name: 'Ogre', n: 1, dmg: 40, air: false } } });
  assert.match(air.hint, /Flyers did 60% of the damage/);
  assert.match(air.hint, /Flak Batteries/);

  const boss = castleFall({ ...run, fatal: { name: 'Siege Titan', wave: 40, boss: true } });
  assert.equal(boss.headline, 'The boss, Siege Titan, landed the final blow.');
});

test('castleFall says nothing for a victory, a run with no breaches or no data', () => {
  assert.equal(castleFall(null), null);
  assert.equal(castleFall({ victory: true, leakBy: { a: { name: 'A', n: 1, dmg: 5 } } }), null);
  assert.equal(castleFall({ victory: false, leakBy: {} }), null);
  assert.equal(castleFall({ victory: false }), null, 'older saves and other modes carry no tally');
  const noFatal = castleFall({ victory: false, leakBy: { a: { name: 'Grunt', n: 1, dmg: 5 } } });
  assert.equal(noFatal.headline, null);
});
