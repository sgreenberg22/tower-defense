// v1.61.0 · Classic quality of life: undo, per-wave breach tracking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { TOWERS, UNDO, TIER } from '../src/data/balance.js';

function fresh(seed = 'qol-1') {
  const g = new Game({ seed, mapId: 'meadow' });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  g.gold = 5000;
  return g;
}
const plot = (g, i = 0) => g.freePlots()[i];

test('undo takes back a build: the tower goes, the gold returns, the counters follow', () => {
  const g = fresh();
  const gold0 = g.gold, built0 = g.stats.towersBuilt, spent0 = g.stats.goldSpent, p = plot(g);
  const t = g.build('archer', p.x, p.y);
  assert.ok(t); assert.ok(g.gold < gold0);
  assert.deepEqual(g.undoInfo(), { kind: 'build', type: 'archer', amount: gold0 - g.gold });
  assert.equal(g.undo(), true);
  assert.ok(!g.towers.includes(t));
  assert.equal(g.gold, gold0); assert.equal(g.stats.towersBuilt, built0); assert.equal(g.stats.goldSpent, spent0);
  assert.equal(g.undo(), false, 'nothing left to take back');
});

test('undo takes back an upgrade exactly', () => {
  const g = fresh();
  const p = plot(g), t = g.build('cannon', p.x, p.y);
  g.undoStack.length = 0;
  const before = { tier: t.tier, invested: t.invested, hp: t.hp, gold: g.gold };
  assert.ok(g.upgrade(t)); assert.equal(t.tier, before.tier + 1);
  assert.equal(g.undoInfo().kind, 'upgrade');
  assert.ok(g.undo());
  assert.equal(t.tier, before.tier); assert.equal(t.invested, before.invested); assert.equal(g.gold, before.gold);
  assert.equal(t.hp, before.hp);
});

test('undo takes back a sale only when the gold and the plot are still there', () => {
  const g = fresh();
  const p = plot(g), t = g.build('cannon', p.x, p.y);
  for (let i = 0; i < 2; i++) g.upgrade(t);
  g.undoStack.length = 0;
  const gold0 = g.gold;
  assert.ok(g.sell(t)); assert.ok(g.gold > gold0);
  const got = g.gold - gold0;
  const kept = g.gold; g.gold = got - 1;   // spend nearly everything
  assert.equal(g.undoInfo(), null, 'not enough gold to buy it back');
  g.gold = kept;
  assert.ok(g.undo()); assert.ok(g.towers.includes(t)); assert.equal(g.gold, gold0);
  g.sell(t);
  const other = g.build('archer', p.x, p.y);
  assert.ok(other);
  assert.equal(g.undoInfo().kind, 'build', 'the newest step is the build, not the old sale');
});

test('undo only reaches back to the current wave and phase', () => {
  const g = fresh();
  const p = plot(g); g.build('archer', p.x, p.y);
  assert.ok(g.undoInfo());
  g.startWave();
  assert.equal(g.undoInfo(), null, 'the wave has begun');
  assert.equal(g.undo(), false);
});

test('undo respects its age limit in game seconds', () => {
  const g = fresh();
  const p = plot(g); g.build('archer', p.x, p.y);
  g.stats.time += UNDO.seconds + 1;
  assert.equal(g.undoInfo(UNDO.seconds), null);
  assert.ok(g.undoInfo(), 'without a limit it still stands');
});

test('the classic stack holds one step, a siege holds many', () => {
  const g = fresh();
  g.build('archer', plot(g).x, plot(g).y); g.build('archer', plot(g).x, plot(g).y);
  assert.equal(g.undoStack.length, UNDO.depth);
  const s = new Game({ seed: 'qol-siege', mapId: 'meadow', mode: 'siege' });
  assert.equal(s.puzzle, true);
  let n = 0;
  for (const pl of s.freePlots()) { if (n >= 3) break; if (s.build('archer', pl.x, pl.y)) n++; }
  assert.ok(n >= 2);
  assert.equal(s.undoStack.length, n, 'every placement can be taken back');
  const pts = s.points;
  assert.ok(s.undo()); assert.ok(s.points > pts, 'the supply points come back');
});

test('an undone build does not change what the next wave does', () => {
  const run = (undo) => {
    const g = fresh('qol-det');
    const p = plot(g);
    if (undo) { g.build('cannon', p.x, p.y); g.undo(); }
    g.build('archer', p.x, p.y);
    g.on('leak', () => {});
    g.startWave();
    for (let i = 0; i < 60 * 40 && g.phase === 'wave'; i++) g.update(1 / 60);
    return [g.stats.kills, g.stats.leaks, Math.round(g.gold)];
  };
  assert.deepEqual(run(true), run(false));
});

test('breaches are tallied per wave, the last five are kept, and an old save has neither', () => {
  const g = new Game({ seed: 'qol-leak', mapId: 'meadow' });
  g.on('leak', () => {});
  let steps = 0;
  while (!g.over && steps < 60 * 60 * 30) {
    if (g.phase === 'build') { while (g.boonOffer) g.chooseBoon(g.boonOffer[0]); g.startWave(); }
    g.update(1 / 60); steps++;
  }
  assert.ok(g.over);
  const lw = g.summary().leakWave;
  assert.equal(Object.values(lw).reduce((a, b) => a + b, 0), g.stats.leaks, 'every breach lands in a wave');
  assert.ok(g.stats.recentLeaks.length > 0 && g.stats.recentLeaks.length <= 5);
  assert.ok(g.stats.recentLeaks.every((r) => r.name && r.wave >= 1 && r.dmg >= 0));
  assert.ok(g.stats.waveMark && typeof g.stats.waveMark.kills === 'number');

  const g2 = fresh('qol-old');
  const save = JSON.parse(JSON.stringify(g2.serialize()));
  delete save.stats.leakWave; delete save.stats.recentLeaks; delete save.stats.waveMark;
  const g3 = new Game({ seed: 'qol-old', mapId: 'meadow', save }); g3.load(save);
  assert.deepEqual(g3.summary().leakWave, {});
  assert.doesNotThrow(() => g3.summary());
});

test('the new tunable lives in balance.js', () => {
  assert.ok(UNDO.depth >= 1 && UNDO.puzzleDepth > UNDO.depth && UNDO.seconds > 0);
  assert.ok(TIER.max >= 5 && TOWERS.archer);
});

// ---------- the screens use what the engine and helpers provide ----------
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the play screen offers undo, answers Ctrl+Z, shows the wave strip, and the pause menu shows the breach log', () => {
  const play = read('src/ui/play.js');
  assert.match(play, /for \(const ev of \['build', 'upgrade', 'sell'\]\) g\.on\(ev, \(\) => this\.offerUndo\(\)\)/);
  assert.match(play, /if \(g\.auto \|\| !this\.alive\) return;/, "a commander's engineers never offer undo");
  assert.match(play, /\(e\.ctrlKey \|\| e\.metaKey\) && !e\.shiftKey && e\.key\.toLowerCase\(\) === 'z'/);
  assert.match(play, /waveStrip\(g\)\.slice\(1\)/);
  assert.match(play, /'Armoured wave'/);
  assert.match(play, /Last through the gate/);
  assert.match(read('src/ui/dom.js'), /closest\('button'\)\) return; ev\.preventDefault/, 'a button inside a toast is not swallowed by the dismiss tap');
});

test('the summary, setup and siege screens use the recap helpers', () => {
  const sc = read('src/ui/screens.js'), lo = read('src/ui/local.js');
  assert.match(sc, /leakCard\(run\)/); assert.match(sc, /compareToPrevious\(run, p\.history/); assert.match(sc, /Play this seed again/);
  assert.match(sc, /mapNotes\(id\)/); assert.match(sc, /ascensionLadder\(st\.asc, maxAsc\)/);
  assert.match(sc, /parLine\(run, tr\)/);
  assert.match(lo, /siegeStreakShield/); assert.match(lo, /siegeForecast/); assert.match(lo, /Next unsolved/);
});

test('upgrade-all raises every tower of a type, cheapest first, as far as gold goes, and leaves specialization to the player', () => {
  const g = fresh('qol-upall');
  const ps = g.freePlots(); const ts = [0, 1, 2].map((i) => g.build('archer', ps[i].x, ps[i].y));
  g.gold = 10000; g.undoStack.length = 0;
  assert.equal(g.upgradableOf('archer'), 3);
  const n = g.upgradeAllOf('archer');
  assert.ok(n >= 3 && ts.every((t) => t.tier === TIER.max - 1), `every archer stops below the specialization tier (${ts.map((t) => t.tier)})`);
  assert.equal(g.upgradeAllOf('archer'), 0, 'nothing more to do');
  const h2 = fresh('qol-upall2'); const q = h2.freePlots(); const a = h2.build('archer', q[0].x, q[0].y), b = h2.build('archer', q[1].x, q[1].y);
  h2.gold = h2.upgradeCost(a) + 1;
  assert.equal(h2.upgradeAllOf('archer'), 1, 'only what the gold buys');
  assert.equal(a.tier + b.tier, 3);
  assert.equal(h2.upgradeAllOf('cannon'), 0, 'no towers of that type');
});

test('a newcomer gets one goal per early run and veterans get none', async () => {
  const { firstRunGoal } = await import('../src/meta/recap.js');
  const g = fresh('qol-goal');
  assert.match(firstRunGoal(0, g).text, /wave 5/); assert.equal(firstRunGoal(0, g).done, false);
  g.stats.builtByTower = { archer: 1, cannon: 1, mage: 2 };
  assert.equal(firstRunGoal(1, g).done, true); assert.match(firstRunGoal(1, g).text, /3\/3/);
  assert.match(firstRunGoal(2, g).text, /wave 10/);
  assert.equal(firstRunGoal(3, g), null);
  assert.equal(firstRunGoal(0, new Game({ seed: 'x', mapId: 'meadow', mode: 'siege' })), null, 'puzzles have their own aim');
});
