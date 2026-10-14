// v1.16 · Adaptive play: a start wave tuned to the player, and Vanguard prerequisites that are never forced.
import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveStart, isVanguardStart, ADAPT } from '../src/meta/adaptive.js';
import { defaultProfile, recordRun } from '../src/meta/profile.js';
import { ensureQuests, progressQuests, dailyQuests } from '../src/meta/quests.js';
import { activeEvent, eventState, progressEvent, vanguardNeed, rewardGap } from '../src/meta/events.js';
import { cleanStart, validateRun } from '../src/game/rules.js';
import { Game } from '../src/game/engine.js';

const hist = (waves, extra = {}) => waves.map((wave, i) => ({ d: i, map: 'meadow', wave, start: 1, mode: 'normal', ...extra }));
const prof = (waves, extra) => { const p = defaultProfile(); p.history = hist(waves, extra); return p; };

test('new players start on wave 1 until three runs tune it, and nobody is locked out', () => {
  const p = defaultProfile();
  const a = adaptiveStart(p, 'meadow');
  assert.equal(a.start, 1); assert.equal(a.calibrated, false); assert.equal(a.need, ADAPT.minRuns);
  assert.ok(isVanguardStart(p, 'meadow', 1), 'wave 1 is a Vanguard run for someone with no history');
  p.history = hist([8, 9]);
  assert.equal(adaptiveStart(p, 'meadow').need, 1);
});

test('the start follows how far you usually get, in steps of five', () => {
  const lo = adaptiveStart(prof([12, 14, 11, 13, 12, 15]), 'meadow');
  assert.equal(lo.start, 1, 'a wave-13 player still gets the full climb');
  const mid = adaptiveStart(prof([30, 32, 28, 31, 30, 29]), 'meadow');
  assert.equal(mid.start, 15);
  const hi = adaptiveStart(prof([60, 66, 58, 64, 62, 61]), 'meadow');
  assert.equal(hi.start, 35);
  for (const r of [lo, mid, hi]) assert.equal(r.start % 5 === 0 || r.start === 1, true);
  assert.ok(adaptiveStart(prof([400, 400, 400]), 'meadow').start <= ADAPT.max);
});

test('one bad run does not crash the start, but a run of bad ones does', () => {
  const steady = [40, 42, 41, 39, 43];
  const oneBad = adaptiveStart(prof([...steady, 12]), 'meadow').start;
  assert.ok(oneBad >= 20, 'form is held up by the recent best: ' + oneBad);
  const allBad = adaptiveStart(prof([40, 42, 12, 10, 11, 12, 9, 10]), 'meadow').start;
  assert.ok(allBad < oneBad);
});

test('head-start runs feed back: over in a few waves means step down, walked it means step up', () => {
  const base = [30, 30, 30, 30];
  const same = adaptiveStart(prof(base), 'meadow').start;
  const hard = prof([...base, 17, 18]); hard.history[4].start = 15; hard.history[5].start = 15;   // died 2-3 waves in
  const hardStart = adaptiveStart(hard, 'meadow').start;
  assert.ok(hardStart < same + 1 && hardStart <= 10 + 5, `too hard steps down (${hardStart} vs ${same})`);
  const easy = prof([...base, 55, 58]); easy.history[4].start = 15; easy.history[5].start = 15;
  assert.ok(adaptiveStart(easy, 'meadow').start > same - 1, 'too easy does not step down');
});

test('it reads the map you are about to play when you have history there', () => {
  const p = prof([20, 20, 20]);
  p.history.push(...hist([60, 60, 60], { map: 'bog' }));
  assert.ok(adaptiveStart(p, 'bog').start > adaptiveStart(p, 'meadow').start);
  assert.equal(adaptiveStart(p, 'spine').start, adaptiveStart({ ...p, history: p.history }, undefined).start, 'a map with no history falls back to all your runs');
  // Dailies, challenges and Marches do not measure your normal form.
  const q = prof([20, 20, 20]); q.history.push(...hist([90, 90, 90], { mode: 'daily' }), ...hist([90], { mode: 'march' }));
  assert.equal(adaptiveStart(q, 'meadow').start, adaptiveStart(prof([20, 20, 20]), 'meadow').start);
});

test('Vanguard is "at or above the adaptive wave", however you got there; dailies never count', () => {
  const p = prof([30, 32, 28, 31, 30, 29]);
  assert.equal(isVanguardStart(p, 'meadow', 1), false, 'grinding wave 1 does not');
  assert.equal(isVanguardStart(p, 'meadow', 20), true, 'picking Knight by hand does');
  assert.equal(isVanguardStart(p, 'meadow', 15), true);
  assert.equal(isVanguardStart(p, 'meadow', 10), false);
  assert.equal(isVanguardStart(p, 'meadow', 40, 'daily'), false);
});

test('the server accepts adaptive start waves and still rejects nonsense', () => {
  assert.equal(cleanStart(35), 35); assert.equal(cleanStart(33), 1);
  const run = { wave: 40, score: 5000, kills: 400, heroKills: 10, duration: 900, start: 35, mode: 'normal', modifiers: [], ascension: 0 };
  assert.equal(validateRun(run), null);
  assert.equal(validateRun({ ...run, start: 33 }), 'bad start wave');
});

test('a run remembers it was Vanguard, through a save', () => {
  const g = new Game({ seed: 'v', mapId: 'meadow', startWave: 15, vanguard: true });
  assert.equal(g.vanguard, true);
  const back = new Game({ seed: 'v', mapId: 'meadow', save: g.serialize() });
  assert.equal(back.vanguard, true);
  assert.equal(new Game({ seed: 'v', mapId: 'meadow' }).vanguard, false);
  assert.equal(g.summary ? g.summary().vanguard : true, true);
});

test('a Vanguard order asks for waves held in a Vanguard run, and only those', () => {
  const p = defaultProfile(); const now = new Date('2026-10-14T12:00:00Z');
  const q = ensureQuests(p, now); const vg = q.list.find((x) => x.id === 'vg');
  assert.ok(vg && vg.reward >= 30);
  progressQuests(p, { kills: 0, wavesCleared: 50, vanguard: false }, now);
  assert.equal(vg.prog, 0, 'easy-wave grinding does nothing for it');
  const done = progressQuests(p, { kills: 0, wavesCleared: vg.goal, vanguard: true }, now);
  assert.ok(done.some((x) => x.id === 'vg'));
  // Orders issued before this version gain the Vanguard order instead of breaking.
  const old = defaultProfile(); old.quests = { day: '2026-10-14', list: dailyQuests('2026-10-14').slice(0, 3), week: { key: 'x', id: 'wk', text: 't', goal: 1, prog: 0, done: false, reward: 1 } };
  assert.ok(ensureQuests(old, now).list.some((x) => x.id === 'vg'));
});

test('the last two event rewards also ask for Vanguard waves; the rest do not', () => {
  const p = defaultProfile();
  const when = new Date('2026-12-20T12:00:00Z');   // winter event
  const ev = activeEvent(when); assert.ok(ev);
  const n = ev.rewards.length;
  for (let i = 0; i < n - 2; i++) assert.equal(vanguardNeed(ev, i), 0);
  assert.ok(vanguardNeed(ev, n - 2) > 0 && vanguardNeed(ev, n - 1) > 0);
  // Plenty of easy waves: everything up to the last two pays out, those two wait.
  const total = ev.rewards.at(-1).at + 10;
  const out = progressEvent(p, { wavesCleared: total, vanguard: false }, when);
  assert.equal(out.gained.length, n - 2);
  const gap = rewardGap(p, ev);
  assert.equal(gap.waves, 0); assert.ok(gap.vanguard > 0);
  // Holding the waves in Vanguard runs releases them.
  const more = progressEvent(p, { wavesCleared: gap.vanguard + vanguardNeed(ev, n - 1), vanguard: true }, when);
  assert.equal(eventState(p, ev).claimed, n);
  assert.ok(more.gained.length === 2);
});

test('finishing a Vanguard run is counted for the lifetime tally', () => {
  const p = defaultProfile();
  const sum = (v) => ({ seed: 's', map: 'meadow', mode: 'normal', modifiers: [], ascension: 0, wave: 20, start: 15, wavesCleared: 6, score: 3000, kills: 120, heroKills: 10, duration: 400, dmgByTower: {}, killsByType: {}, builtByTower: {}, specs: [], maxCombo: 3, vanguard: v });
  recordRun(p, sum(true)); recordRun(p, sum(false));
  assert.equal(p.stats.vanguardRuns, 1); assert.equal(p.stats.vanguardWaves, 6);
  assert.equal(p.history.at(-2).vg, 1); assert.equal(p.history.at(-1).vg, 0);
});
