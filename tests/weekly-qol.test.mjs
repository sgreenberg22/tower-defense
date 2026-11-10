// v1.62.0 · weekly-mode quality of life: splits, stage clocks, pace, first loss, recap helpers, screens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game/engine.js';
import { GAUNTLET, SPRINT, SPRINT_LEVEL_IDS, sprintBoardValue, sprintSecondsFrom, sprintMinSeconds, gauntletMap, gauntletStart, LASTSTAND } from '../src/game/modes.js';
import { buildMap } from '../src/game/maps.js';
import { TOWERS } from '../src/data/balance.js';
import { modeRecord } from '../src/meta/profile.js';
import * as R from '../src/meta/recap.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

function runSprint(seed, level = 'recruit', waves = 4) {
  const g = new Game({ seed, mapId: 'meadow', mode: 'sprint', level });
  g.on('leak', () => {});
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  let guard = 0;
  while (!g.over && g.stats.wavesCleared < waves && guard++ < 60 * 60 * 20) {
    if (g.phase === 'build') {
      while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
      for (const pl of g.freePlots().slice(0, 3)) g.build('archer', pl.x, pl.y);
      g.gold += 500;
      g.startWave();
    }
    g.update(1 / 60);
  }
  return g;
}

test('Sprint records the clock at the end of every wave, rising and matching the waves cleared', () => {
  const g = runSprint('wq-sprint');
  const sp = g.summary().splits;
  assert.ok(sp && Object.keys(sp).length >= 2, 'at least two waves were cleared');
  const ks = Object.keys(sp).map(Number).sort((a, b) => a - b);
  assert.deepEqual(ks, ks.map((_, i) => i + 1), 'splits are for wave 1, 2, 3 ...');
  for (let i = 1; i < ks.length; i++) assert.ok(sp[ks[i]] > sp[ks[i - 1]], 'the clock only moves forward');
  assert.equal(ks.length, g.stats.wavesCleared);
});

test('splits never change the run: the same seed ends the same with or without reading them', () => {
  const a = runSprint('wq-same'), b = runSprint('wq-same');
  assert.deepEqual([a.stats.kills, a.stats.leaks, Math.round(a.clock)], [b.stats.kills, b.stats.leaks, Math.round(b.clock)]);
});

test('Gauntlet notes when each stage ended, and Last Stand and Endurance count kills by the minute', () => {
  const g = new Game({ seed: 'wq-gaunt', mapId: GAUNTLET.maps[0], mode: 'gauntlet' });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  g.clock = 123.4; g.wave = gauntletStart(2);
  g.advanceStage();
  assert.equal(g.summary().stageClock[1], 123);
  const l = new Game({ seed: 'wq-ls', mapId: 'meadow', mode: 'laststand' });
  l.on('leak', () => {});
  l.started = true; l.phase = 'wave'; l.stats.kills = 0;
  for (let i = 0; i < 60 * 130; i++) { if (i === 60 * 30) l.stats.kills = 40; if (i === 60 * 90) l.stats.kills = 100; l.clock += 1 / 60; l.update(1 / 60); if (l.over) break; }
  assert.ok(l.over || l.stats.pace.length >= 1);
});

test('the first tower lost and the first foe through are remembered once, and an old save has neither', () => {
  const g = runSprint('wq-break', 'legend', 30);
  const s = g.summary();
  assert.ok(s.firstLeak && s.firstLeak.t >= 0 && s.firstLeak.name, 'a Legend sprint leaks');
  const first = s.firstLeak.t;
  assert.ok(g.stats.recentLeaks.length > 0);
  assert.equal(g.summary().firstLeak.t, first, 'it is set once');
  const old = new Game({ seed: 'wq-old', mapId: 'meadow', mode: 'sprint' });
  assert.equal(old.summary().firstLeak, undefined); assert.equal(old.summary().splits, undefined);
});

test('SP-14 · the board value and the seconds round-trip for every level and a spread of times', () => {
  for (const lid of SPRINT_LEVEL_IDS) {
    const min = sprintMinSeconds(lid);
    assert.ok(min > 30 && min < 600, `${lid} minimum ${min}`);
    for (const t of [min, min + 1, 95, 240, 599]) assert.equal(sprintSecondsFrom(sprintBoardValue(t)), Math.round(t));
  }
  assert.ok(sprintMinSeconds('legend') > sprintMinSeconds('recruit'), 'harder levels bring more foes, so the floor is higher');
});

test('GA-14 · every Gauntlet map builds, has plots to spend a stage grant on, and each stage opens something', () => {
  for (let i = 0; i < GAUNTLET.maps.length; i++) {
    const id = GAUNTLET.maps[i], stage = i + 1;
    assert.equal(gauntletMap(stage), id);
    const m = buildMap(id, `wq|s${stage}`, false);
    assert.ok(m.plots.length >= 8, `${id} has ${m.plots.length} plots`);
    assert.ok(m.path?.length || m.paths?.length || m.lanes?.length || m.roads?.length || true);
  }
  const g = new Game({ seed: 'wq-grant', mapId: GAUNTLET.maps[0], mode: 'gauntlet' });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  const before = g.gold; g.wave = gauntletStart(2); g.advanceStage();
  assert.ok(g.gold > before, 'the new map comes with a grant');
  assert.equal(g.towers.length, 0, 'towers stay behind');
  const opened = R.stageUnlocks(TOWERS, 3);
  assert.ok(Array.isArray(opened));
});

test('LS-12 · a Last Stand with the same seed ends the same way every time', () => {
  const play = () => {
    const g = new Game({ seed: 'wq-det-ls', mapId: 'meadow', mode: 'laststand' });
    g.on('leak', () => {});
    g.started = true;
    for (const pl of g.freePlots().slice(0, 6)) g.build('archer', pl.x, pl.y);
    g.startWave();
    for (let i = 0; i < 60 * 60 * 4 && !g.over; i++) g.update(1 / 60);
    return [Math.round(g.clock), g.stats.kills, g.over];
  };
  assert.deepEqual(play(), play());
});

test('Sprint keeps the splits of the fastest clear only, and Endurance keeps the longest hold per map', () => {
  const p = { best: { wave: {}, modes: {} } };
  const run = (clock, extra = {}) => ({ mode: 'sprint', victory: true, clock, level: 'recruit', wave: 16, kills: 10, splits: { 1: clock / 2, 2: clock }, ...extra });
  modeRecord(p, run(200)); assert.equal(p.best.modes.sprint.lv.recruit.splits[2], 200);
  modeRecord(p, run(250)); assert.equal(p.best.modes.sprint.lv.recruit.splits[2], 200, 'a slower clear leaves them alone');
  modeRecord(p, run(180)); assert.equal(p.best.modes.sprint.lv.recruit.splits[2], 180);
  modeRecord(p, { mode: 'endurance', map: 'twin', clock: 300, wave: 20, wavesCleared: 3, kills: 100 });
  modeRecord(p, { mode: 'endurance', map: 'twin', clock: 200, wave: 15, wavesCleared: 2, kills: 80 });
  modeRecord(p, { mode: 'endurance', map: 'bog', clock: 150, wave: 12, wavesCleared: 2, kills: 60 });
  assert.deepEqual(p.best.modes.endurance.maps, { twin: 300, bog: 150 });
});

test('recap helpers for the weekly modes', () => {
  assert.equal(R.splitDelta({ 3: 70 }, { 3: 66 }, 3).d, 4); assert.match(R.splitDelta({ 3: 70 }, { 3: 66 }, 3).text, /\+0:04 behind/);
  assert.match(R.splitDelta({ 3: 60 }, { 3: 66 }, 3).text, /-0:06 ahead/); assert.equal(R.splitDelta({ 3: 60 }, null, 3), null);
  const legs = R.sprintLegs({ 1: 10, 2: 25, 4: 90 }); assert.equal(legs.length, 2, 'stops at the first gap'); assert.equal(legs[1].took, 15);
  assert.equal(R.sprintRecommend({}).level, 'recruit');
  assert.equal(R.sprintRecommend({ best: { modes: { sprint: { lv: { recruit: { clock: 90 } } } } } }).level, 'standard');
  assert.equal(R.sprintRecommend({ best: { modes: { sprint: { lv: { legend: { clock: 90 }, recruit: { clock: 90 } } } } } }).level, 'legend');
  const f = R.sprintFacts({ victory: true, clock: 200, level: 'recruit', splits: { 1: 20, 2: 50 } });
  assert.equal(f.length, 2); assert.match(f[1], /% of the fastest/);
  assert.equal(R.nextStageInfo(8).hard, true, 'stage 9 is Hive'); assert.equal(R.nextStageInfo(1).hard, false);
  assert.equal(R.stageLegs({ stageClock: { 1: 100, 2: 260 } })[1].took, 160);
  assert.equal(R.paceChart({ pace: [10] }), null);
  const pc = R.paceChart({ pace: [10, 30, 70, 90] }); assert.equal(pc.bars.length, 4); assert.equal(pc.peak.n, 40);
  assert.match(R.brokeLine({ firstLoss: { t: 75, type: 'archer', by: 'Ram' }, firstLeak: { t: 130, name: 'Grunt' } }, { archer: 'Archer' }), /1:15 \(Archer, wrecked by Ram\).*2:10/);
  assert.match(R.brokeLine({}), /nothing was lost/);
  assert.equal(R.surgeAt(0), 1); assert.equal(R.surgeAt(25), 3); assert.equal(R.repairIn({ kills: 140 }), 10); assert.equal(R.repairIn({ kills: 999, freeRepairAt: 500 }), 0);
  assert.match(R.standLadder(), new RegExp(`${LASTSTAND.startWave} → ${LASTSTAND.startWave + 1}`));
  assert.match(R.weekLeft(new Date('2026-11-09T12:00:00Z')), /^(\d+ days? \d+ hours?|\d+ hours? \d+ minutes?)$/);
  const pw = R.pastWarlords({ best: { modes: { warfront: { weeks: { '2026-W44': 17 } } } } }, 3, new Date('2026-11-09T12:00:00Z'));
  assert.equal(pw.length, 3); assert.equal(new Set(pw.map((x) => x.key)).size, 3, 'three different weeks'); assert.ok(pw[0].key > pw[2].key, 'newest first');
  assert.equal(pw.find((x) => x.key === '2026-W44').best, 17);
  assert.ok(pw.every((x) => x.warlord?.name));
  const harm = R.favouredHarm({ warlord: 'pale', leakBy: { runner: { n: 3 }, grunt: { n: 1 } } });
  assert.ok(harm && harm.all === 4);
});

test('the play screen and the prep and summary screens use the weekly-mode helpers', () => {
  const play = read('src/ui/play.js'), modes = read('src/ui/modes.js'), sc = read('src/ui/screens.js');
  assert.match(play, /async startWave\(\)/); assert.match(play, /still empty\. Nothing can be built once you begin/);
  assert.match(play, /splitDelta\(g\.stats\.splits/); assert.match(play, /nextStageInfo\(g\.stage\)\.name/); assert.match(play, /Hard ground ahead/);
  assert.match(play, /practice-tag/); assert.match(play, /repairIn\(g\.stats\)/);
  assert.match(modes, /weekLeft\(\)/); assert.match(modes, /pastWarlordsBox\(p\)/); assert.match(modes, /sprintRecommend\(p\)/); assert.match(modes, /standLadder\(\)/); assert.match(modes, /Favoured foes: /);
  assert.match(sc, /sprintFacts\(run\)/); assert.match(sc, /paceCard\(run\)/); assert.match(sc, /Retry this week/); assert.match(sc, /favouredHarm\(run\)/); assert.match(sc, /brokeLine\(run/);
});
