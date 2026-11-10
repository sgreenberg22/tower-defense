// v1.61.0 · The pure helpers behind the summary lines, the wave strip and the setup notes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { MAPS } from '../src/game/maps.js';
import { RECAP, ASCENSION } from '../src/data/balance.js';
import { leakChart, leakChartLine, bestMoment, compareToPrevious, shareText, planProfile, planKind, waveStrip, mapNotes, ascensionLadder, ascensionLine } from '../src/meta/recap.js';

test('the leak chart counts every breach once and folds long runs into few bars', () => {
  const c = leakChart({ wave: 12, leakWave: { 3: 2, 4: 1, 12: 5 } });
  assert.equal(c.bars.length, 12); assert.equal(c.total, 8); assert.equal(c.worst.from, 12);
  assert.equal(leakChartLine(c), '8 foes got through; the worst stretch was wave 12 (5).');
  const long = leakChart({ wave: 90, leakWave: { 1: 1, 45: 4, 90: 2 } });
  assert.ok(long.bars.length <= RECAP.chartBars); assert.equal(long.total, 7);
  assert.equal(long.bars.at(-1).to, 90, 'the last bar reaches the last wave');
  assert.match(leakChartLine(long), /waves \d+-\d+/);
  assert.equal(leakChart({ wave: 1 }), null);
  assert.equal(leakChartLine(leakChart({ wave: 5, leakWave: {} })), 'Nothing got through the gate.');
  assert.equal(leakChart({ wave: 6 }).total, 0, 'an old run without the tally still draws');
});

test('best moment follows its priority and stays quiet when there is nothing to say', () => {
  assert.match(bestMoment({ maxFlawlessStreak: 4, maxCombo: 30, bossKills: 2 }), /4 waves in a row/);
  assert.match(bestMoment({ maxFlawlessStreak: 1, maxCombo: 14 }), /14-hit combo/);
  assert.match(bestMoment({ maxCombo: 3, bossKills: 1 }), /1 boss brought down/);
  assert.match(bestMoment({ bossKills: 3 }), /3 bosses/);
  assert.match(bestMoment({ headshots: 1 }), /1 headshot\./);
  assert.equal(bestMoment({}), null); assert.equal(bestMoment(null), null);
});

test('comparison ignores the run itself and other setups', () => {
  const run = { map: 'meadow', mode: 'normal', start: 1, ascension: 0, wave: 20, score: 5000 };
  const mk = (o) => ({ map: 'meadow', mode: 'normal', start: 1, asc: 0, wave: 10, score: 1000, ...o });
  assert.equal(compareToPrevious(run, [mk({ wave: 20, score: 5000 })], 'Meadow Pass').first, true, 'only this run: a first');
  const hist = [mk({ wave: 15, score: 3000 }), mk({ wave: 18, score: 4000 }), mk({ map: 'twin', wave: 99 }), mk({ asc: 2, wave: 99 }), mk({ wave: 20, score: 5000 })];
  const c = compareToPrevious(run, hist, 'Meadow Pass');
  assert.equal(c.first, false); assert.equal(c.best.wave, 18);
  assert.equal(c.line, 'Against your best here (wave 18, 4,000 points): +2 waves, +1,000 points.');
  const worse = compareToPrevious({ ...run, wave: 17, score: 3500 }, hist, 'x');
  assert.match(worse.line, /-1 wave, -500 points/);
  assert.equal(compareToPrevious(run, undefined).first, true);
});

test('share text carries what a friend needs to replay it', () => {
  const t = shareText({ wave: 31, score: 123456, kills: 2500, seed: 'abc', ascension: 2, modifiers: ['fog', 'swarm'] }, 'Meadow Pass', 'Steve');
  assert.match(t, /Bastion Siege · Steve/); assert.match(t, /Wave 31 on Meadow Pass · 123,456 points · 2,500 foes/);
  assert.match(t, /Ascension 2/); assert.match(t, /Modifiers: Fog of War, Swarm/); assert.match(t, /Seed: abc/);
  assert.ok(!/Ascension|Modifiers/.test(shareText({ wave: 1, score: 1, kills: 1, seed: 's' }, 'M')));
});

test('the wave strip reads the same plans the game will play, and never moves the game', () => {
  const g = new Game({ seed: 'strip-1', mapId: 'meadow', startWave: 30 });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  const w0 = g.wave, rngBefore = JSON.stringify(g.rng);
  const s = waveStrip(g);
  assert.equal(s.length, RECAP.strip);
  assert.deepEqual(s.map((x) => x.wave), Array.from({ length: RECAP.strip }, (_, i) => w0 + i));
  assert.ok(s.every((x) => ['boss', 'air', 'armour', 'ground'].includes(x.kind)));
  assert.equal(g.wave, w0); assert.equal(JSON.stringify(g.rng), rngBefore);
  const boss = waveStrip(new Game({ seed: 'strip-2', mapId: 'meadow', startWave: 10 }), 1)[0];
  assert.equal(boss.kind, 'boss', 'wave 10 has its boss');
  assert.equal(planKind({ boss: null, airShare: 0.5, armourShare: 0.9 }), 'air', 'flyers outrank armour');
  assert.equal(planKind({ boss: null, airShare: 0, armourShare: RECAP.armourShare }), 'armour');
  assert.equal(planProfile({ groups: [] }).total, 0);
});

test('every field has a note that is true to its layout', () => {
  for (const id of Object.keys(MAPS)) { const n = mapNotes(id); assert.ok(n && n.length > 10, id); }
  assert.match(mapNotes('meadow'), /^1 road · \d+ plots · 6 hills\. One road/);
  assert.match(mapNotes('frontier'), /fresh every run/);
  assert.match(mapNotes('bog'), /Mud slows walkers/);
});

test('the Ascension ladder shows exact costs and what is open', () => {
  const l = ascensionLadder(1, 3);
  assert.deepEqual(l.map((r) => r.n), [2, 3, 4]);
  assert.equal(l[0].hp, Math.round(2 * ASCENSION.hp * 100)); assert.equal(l[0].open, true); assert.equal(l[2].open, false);
  assert.equal(l[2].wave, ASCENSION.unlockWave(3));
  assert.match(ascensionLine(l[2]), /Locked: reach wave 35/);
  assert.equal(ascensionLadder(ASCENSION.max, ASCENSION.max).length, 0);
  assert.equal(ascensionLadder(9, 9).length, 1, 'stops at the top level');
});

// ---------- Daily Siege and Trials ----------
import { trialPar, parLine, siegeHistory, siegeStreakShield, siegeForecast } from '../src/meta/recap.js';
import { TRIALS, siegeScore } from '../src/game/modes.js';

test('par is the score of a three-star hold, and the line says how far you were from it', () => {
  const t = TRIALS[0];
  assert.equal(trialPar(t), t.waves * 100 + Math.round(500 * 0.9 + 200 * 0.5));
  assert.ok(trialPar(t) > 0 && trialPar(t) < siegeScore({ wavesCleared: t.waves, castlePct: 1, wallPct: 1, left: 99, victory: true }, { waves: t.waves }));
  assert.match(parLine({ score: trialPar(t) + 40 }, t), /\+40/);
  assert.match(parLine({ score: trialPar(t) - 5 }, t), /-5/);
  assert.equal(parLine({ score: 1 }, null), '');
});

test('the siege history lists exactly the last n days, oldest first', () => {
  const days = { '2026-11-07': { score: 900, win: true }, '2026-11-09': { score: 300, win: false } };
  const h = siegeHistory(days, '2026-11-09', 5);
  assert.deepEqual(h.map((x) => x.day), ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09']);
  assert.deepEqual(h.map((x) => [x.tried, x.win]), [[false, false], [false, false], [true, true], [false, false], [true, false]]);
  assert.equal(siegeHistory({}, '2026-03-01', 14).length, 14, 'crosses a month boundary cleanly');
});

test('one missed day does not end a streak; a second miss within a week does', () => {
  const win = (...ds) => Object.fromEntries(ds.map((d) => [d, { win: true, score: 1 }]));
  const today = '2026-11-09';
  assert.equal(siegeStreakShield(win('2026-11-09', '2026-11-08', '2026-11-07'), today).n, 3, 'a plain streak');
  assert.equal(siegeStreakShield(win('2026-11-08', '2026-11-07'), today).n, 2, 'today not played yet: still alive');
  const slip = siegeStreakShield(win('2026-11-09', '2026-11-07', '2026-11-06', '2026-11-05'), today);
  assert.equal(slip.n, 4, 'the 8th is forgiven and does not count'); assert.equal(slip.shielded, true);
  const two = siegeStreakShield(win('2026-11-09', '2026-11-07', '2026-11-05', '2026-11-04'), today);
  assert.equal(two.n, 2, 'a second miss inside a week ends it: 9th and 7th count');
  assert.equal(siegeStreakShield({}, today).n, 0);
  assert.equal(siegeStreakShield(win('2026-11-01'), today).n, 0, 'a long gap ends it');
  assert.equal(siegeStreakShield(win('2026-11-07'), today).n, 0, 'a lone win after a miss is not a streak of its own');
});

test('the forecast adds up every wave of a siege without touching the game', async () => {
  const { Game } = await import('../src/game/engine.js');
  const g = new Game({ seed: 'siege-test', mapId: 'meadow', mode: 'siege' });
  const wave0 = g.wave, f = siegeForecast(g);
  assert.equal(g.wave, wave0);
  assert.ok(f.length > 2);
  assert.ok(f.every((x, i) => i === 0 || f[i - 1].count >= x.count), 'most common first');
  assert.ok(f.some((x) => x.boss), 'the siege has a boss');
  const total = f.reduce((a, b) => a + b.count, 0);
  assert.ok(total > g.siegeCfg.waves * 5);
  const t = new Game({ seed: 'trial-t1', mapId: 'meadow', mode: 'trials', trial: 't1' });
  assert.ok(siegeForecast(t).reduce((a, b) => a + b.count, 0) < total, 'an early trial is gentler than the daily siege');
});
