// v1.61 · Pure helpers for the run summary, the pause menu, the wave strip and the setup notes.
// No DOM here: the screens draw what these return, and the tests pin it.
import { ENEMIES, RECAP, ASCENSION, MODIFIERS } from '../data/balance.js';
import { planWave } from '../game/waves.js';
import { buildMap, MAPS } from '../game/maps.js';
import { siegeScore, sprintMinSeconds, SPRINT, SPRINT_LEVELS, SPRINT_LEVEL_IDS, GAUNTLET, gauntletMap, gauntletStage, gauntletStart, LASTSTAND, ENDURANCE } from '../game/modes.js';
import { warlordById, warfrontSetup } from '../game/living.js';
import { seasonKey, periodBounds, prevSeasonKey } from '../core/rng.js';

const num = (n) => Math.round(n).toLocaleString('en-US');
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// Breaches per wave, folded into at most RECAP.chartBars bars so a wave-90 run still fits on a phone.
export function leakChart(run) {
  const last = Math.max(0, run?.wave | 0);
  if (last < 2) return null;
  const lw = run.leakWave || {}, size = Math.max(1, Math.ceil(last / RECAP.chartBars));
  const bars = [];
  for (let from = 1; from <= last; from += size) {
    const to = Math.min(last, from + size - 1);
    let n = 0;
    for (let w = from; w <= to; w++) n += lw[w] || 0;
    bars.push({ from, to, n });
  }
  const total = bars.reduce((a, b) => a + b.n, 0);
  const max = Math.max(1, ...bars.map((b) => b.n));
  const worst = bars.reduce((a, b) => (b.n > a.n ? b : a), { n: 0 });
  return { bars, total, max, size, worst: worst.n ? worst : null };
}
export function leakChartLine(chart) {
  if (!chart) return '';
  if (!chart.total) return 'Nothing got through the gate.';
  const w = chart.worst, where = w.from === w.to ? `wave ${w.from}` : `waves ${w.from}-${w.to}`;
  return `${plural(chart.total, 'foe')} got through; the worst stretch was ${where} (${w.n}).`;
}

// One line about the run's best moment. Priority: a long clean streak, then a big combo, then bosses, then headshots.
export function bestMoment(run) {
  if (!run) return null;
  if ((run.maxFlawlessStreak || 0) >= RECAP.streakMin) return `Best moment: ${run.maxFlawlessStreak} waves in a row with nothing through the gate.`;
  if ((run.maxCombo || 0) >= RECAP.comboMin) return `Best moment: a ${run.maxCombo}-hit combo.`;
  if (run.bossKills) return `Best moment: ${plural(run.bossKills, 'boss', 'bosses')} brought down.`;
  if (run.headshots) return `Best moment: ${plural(run.headshots, 'headshot')}.`;
  return null;
}

// How this run compares with the best earlier run on the same field and mode. `history` already holds this run as its last entry.
export function compareToPrevious(run, history = [], mapName = 'this field') {
  const prior = (history || []).slice(0, -1).filter((h) => h.map === run.map && h.mode === run.mode && (h.start || 1) === (run.start || 1) && (h.asc || 0) === (run.ascension || 0));
  if (!prior.length) return { first: true, line: `First run on ${mapName} with this setup: now you have a number to beat.` };
  const best = prior.reduce((a, b) => (b.wave > a.wave || (b.wave === a.wave && b.score > a.score) ? b : a));
  const dWave = run.wave - best.wave, dScore = run.score - best.score;
  const sg = (n) => (n > 0 ? '+' : n < 0 ? '-' : '±') + num(Math.abs(n));
  const waves = Math.abs(dWave) === 1 ? 'wave' : 'waves';
  return { first: false, dWave, dScore, best, line: `Against your best here (wave ${best.wave}, ${num(best.score)} points): ${sg(dWave)} ${waves}, ${sg(dScore)} points.` };
}

export function shareText(run, mapName, name = '') {
  const mods = (run.modifiers || []).map((m) => MODIFIERS[m]?.name).filter(Boolean);
  return [`Bastion Siege${name ? ` · ${name}` : ''}`, `Wave ${run.wave} on ${mapName} · ${num(run.score)} points · ${num(run.kills)} foes`,
    run.ascension ? `Ascension ${run.ascension}` : null, mods.length ? `Modifiers: ${mods.join(', ')}` : null, `Seed: ${run.seed}`].filter(Boolean).join('\n');
}

// What a plan holds, by weight: how much of it flies, how much is armoured, whether a boss leads it.
export function planProfile(plan) {
  let total = 0, air = 0, armoured = 0, boss = null;
  for (const g of plan.groups) {
    const def = g.type === 'boss' ? null : ENEMIES[g.type];
    total += g.count;
    if (g.type === 'boss') { boss = g.boss; continue; }
    if (def.air) air += g.count;
    if ((def.armor || 0) >= RECAP.armoured) armoured += g.count;
  }
  return { total, air, armoured, airShare: total ? air / total : 0, armourShare: total ? armoured / total : 0, boss, threat: plan.threat || null };
}
export function planKind(prof) {
  if (prof.boss) return 'boss';
  if (prof.airShare >= RECAP.airShare) return 'air';
  if (prof.armourShare >= RECAP.armourShare) return 'armour';
  return 'ground';
}
// The next few waves at a glance. `game` supplies the seed and the wave options; nothing in it is changed.
export function waveStrip(game, n = RECAP.strip) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const wave = game.wave + i;
    const plan = i === 0 && game.nextPlan ? game.nextPlan : planWave(wave, game.seed, game.waveOpts());
    const prof = planProfile(plan);
    out.push({ wave, kind: planKind(prof), ...prof });
  }
  return out;
}

// A one-line honest description of a field, worked out from its real layout.
const noteMemo = {};
export function mapNotes(id) {
  if (noteMemo[id]) return noteMemo[id];
  const def = MAPS[id];
  if (!def) return '';
  if (def.procedural) return (noteMemo[id] = 'Drawn fresh every run, so there is no layout to memorise.');
  let m;
  try { m = buildMap(id, 'preview'); } catch { return ''; }
  const roads = def.paths?.length || (m.paths?.length || 1);
  const plots = m.plots?.length || 0;
  const hills = (def.high || []).length;
  const seen = new Map();
  for (const p of m.paths || []) for (const t of new Set(p.map((q) => `${Math.round(q.x ?? q[0])},${Math.round(q.y ?? q[1])}`))) seen.set(t, (seen.get(t) || 0) + 1);
  const shared = [...seen.values()].filter((c) => c > 1).length;
  const bits = [plural(roads, 'road'), plural(plots, 'plot')];
  if (hills) bits.push(plural(hills, 'hill'));
  const tip = roads === 1 ? 'One road: stack towers on the bends.' : shared >= 3 ? `The roads share ${shared} tiles: that stretch is the kill zone.` : 'The roads stay apart: split your towers between them.';
  const extra = def.mud?.length ? ' Mud slows walkers.' : '';
  return (noteMemo[id] = `${bits.join(' · ')}. ${tip}${extra}`);
}

// The next few Ascension levels with their exact cost to you and what unlocks them.
export function ascensionLadder(current = 0, unlocked = 0, count = 3) {
  const out = [];
  for (let n = current + 1; n <= Math.min(ASCENSION.max, current + count); n++) {
    out.push({ n, hp: Math.round(n * ASCENSION.hp * 100), speed: Math.round(n * ASCENSION.speed * 100), score: Math.round(n * ASCENSION.score * 100), open: n <= unlocked, wave: ASCENSION.unlockWave(n - 1) });
  }
  return out;
}
export const ascensionLine = (r) => `Ascension ${r.n}: foes +${r.hp}% health and +${r.speed}% speed, score +${r.score}%. ${r.open ? 'Open.' : `Locked: reach wave ${r.wave} on the level below.`}`;

// ---------- Daily Siege and Trials ----------
// "Par" for a trial: what a three-star hold scores (keep 90%, wall 50%, no spare supply).
export const trialPar = (t) => siegeScore({ wavesCleared: t.waves, castlePct: 0.9, wallPct: 0.5, left: 0, victory: true }, { waves: t.waves });
export function parLine(run, trial) {
  if (!trial) return '';
  const par = trialPar(trial), d = run.score - par;
  return `Par for three stars is ${num(par)}: you scored ${num(run.score)} (${d >= 0 ? '+' : '-'}${num(Math.abs(d))}).`;
}

// The last `n` days, oldest first, from the profile's { 'YYYY-MM-DD': { score, win } } record.
export function siegeHistory(days = {}, today, n = 14) {
  const out = [], d = new Date(today + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    const k = d.toISOString().slice(0, 10), r = days[k];
    out.push({ day: k, tried: !!r, win: !!r?.win, score: r?.score || 0 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
// Days in a row with a held siege. One missed day is forgiven (a "shield") so long as no other day in the last six was
// forgiven too: a single slip does not wipe a long streak, but a habit of skipping still ends it.
export function siegeStreakShield(days = {}, today, shield = 7) {
  let n = 0, lastSkip = -Infinity, i = 0;
  const d = new Date(today + 'T12:00:00Z');
  if (!days[today]?.win) { d.setUTCDate(d.getUTCDate() - 1); i = 1; }   // today is still to play
  for (let guard = 0; guard < 4000; guard++, i++) {
    const k = d.toISOString().slice(0, 10);
    if (days[k]?.win) n++;
    else if (n > 0 && i - lastSkip >= shield && days[new Date(d.getTime() - 86400000).toISOString().slice(0, 10)]?.win) lastSkip = i;   // forgive it only if the streak carries on the day before
    else break;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return { n, shielded: lastSkip > -Infinity };
}

// What a siege will throw at you: the foes of every wave added up. `game` is a siege Game (nothing in it is changed).
export function siegeForecast(game) {
  const cfg = game.siegeCfg, tally = new Map();
  for (let w = cfg.start; w < cfg.start + cfg.waves; w++) {
    for (const g of planWave(w, game.seed, game.waveOpts()).groups) {
      const key = g.type === 'boss' ? 'boss:' + g.boss : g.type;
      tally.set(key, (tally.get(key) || 0) + g.count);
    }
  }
  return [...tally.entries()].map(([key, count]) => {
    const boss = key.startsWith('boss:'), def = boss ? null : ENEMIES[key];
    return { key, count, boss, air: !!def?.air, armour: (def?.armor || 0) >= RECAP.armoured, name: boss ? key.slice(5) : def.name };
  }).sort((a, b) => b.count - a.count);
}

// A first goal for each of a newcomer's first three runs; nothing after that. `game` supplies the live counters.
export function firstRunGoal(runs, game) {
  if (runs >= 3 || !game || game.puzzle || game.free) return null;
  if (runs === 0) return { text: 'Goal: reach wave 5', done: game.wave >= 5 };
  if (runs === 1) { const n = Object.keys(game.stats?.builtByTower || {}).length; return { text: `Goal: build 3 kinds of tower (${Math.min(3, n)}/3)`, done: n >= 3 }; }
  return { text: 'Goal: reach wave 10', done: game.wave >= 10 };
}

// ---------- v1.62 · weekly modes ----------
const mmss = (t) => { t = Math.max(0, Math.round(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
export const clockShort = mmss;

// Sprint: how long each wave took (the splits are the clock at the end of each wave), and how that stacks up.
export function sprintLegs(splits) {
  const out = []; let prev = 0;
  for (let w = 1; w <= SPRINT.waves; w++) {
    const at = splits?.[w]; if (at == null) break;
    out.push({ wave: w, at, took: Math.max(0, Math.round((at - prev) * 10) / 10) }); prev = at;
  }
  return out;
}
// "+0:03" against your best split for the same wave, or null when there is nothing to compare with.
export function splitDelta(splits, best, wave) {
  const a = splits?.[wave], b = best?.[wave];
  if (a == null || b == null) return null;
  const d = Math.round(a - b);
  return { d, text: d === 0 ? 'level with your best' : `${d > 0 ? '+' : '-'}${mmss(Math.abs(d))} ${d > 0 ? 'behind' : 'ahead of'} your best` };
}
// The best split per wave across runs: a run that sets a faster clear replaces them all (splits only make sense as one run).
export function sprintFacts(run) {
  const lines = [];
  const legs = sprintLegs(run.splits);
  if (legs.length) {
    const slow = legs.reduce((a, b) => (b.took > a.took ? b : a));
    lines.push(`⏱ Slowest leg: wave ${slow.wave} (${mmss(slow.took)}). Splits: ${legs.map((l) => mmss(l.at)).join(' · ')}.`);
  }
  if (run.victory && run.clock) {
    const min = sprintMinSeconds(run.level || 'standard'), pctOfMin = Math.round(100 * min / Math.max(min, run.clock));
    lines.push(`🎯 ${pctOfMin}% of the fastest the waves allow (${mmss(min)} of spawning at ${SPRINT_LEVELS[run.level || 'standard'].name}).`);
  }
  return lines;
}
// Which level to try: one step above the hardest you have cleared, a gentler start for a newcomer.
export function sprintRecommend(p) {
  const lv = p?.best?.modes?.sprint?.lv || {};
  const cleared = SPRINT_LEVEL_IDS.filter((l) => lv[l]?.clock);
  if (!cleared.length) return { level: 'recruit', why: 'You have no clear yet: Recruit gives you the route with kinder foes.' };
  const top = cleared[cleared.length - 1], next = SPRINT_LEVEL_IDS[Math.min(SPRINT_LEVEL_IDS.length - 1, SPRINT_LEVEL_IDS.indexOf(top) + 1)];
  return next === top ? { level: top, why: 'You have cleared Legend: now it is only about the clock.' } : { level: next, why: `You have cleared ${SPRINT_LEVELS[top].name}; ${SPRINT_LEVELS[next].name} is the next step.` };
}
// A run's best splits beat the stored ones only when the whole clear is faster.
export function betterSplits(oldClock, oldSplits, run) { return run.victory && run.splits && (!oldClock || run.clock < oldClock) ? run.splits : oldSplits; }

// Gauntlet: the clock at the end of each stage and the map it was fought on.
export function stageLegs(run) {
  const sc = run.stageClock || {}, out = []; let prev = 0;
  for (const k of Object.keys(sc).map(Number).sort((a, b) => a - b)) { out.push({ stage: k, map: MAPS[gauntletMap(k)]?.name || gauntletMap(k), at: sc[k], took: sc[k] - prev }); prev = sc[k]; }
  return out;
}
export function stageLine(run) {
  const legs = stageLegs(run);
  return legs.length ? `🗺 Stages: ${legs.map((l) => `${l.stage} ${l.map} ${mmss(l.took)}`).join(' · ')}.` : '';
}
// The map you are about to reach, and whether it is one of the hard ones, from the stage you are on.
export const HARD_STAGE_MAPS = ['hive', 'fork', 'ravine'];
export function nextStageInfo(stage) {
  const id = gauntletMap(stage + 1);
  return { id, name: MAPS[id]?.name || id, hard: HARD_STAGE_MAPS.includes(id), grantWave: gauntletStart(stage + 1) };
}
// Towers that open for the first time at the top of a stage (everything up to unlockLead waves ahead).
export function stageUnlocks(towers, stage) {
  const was = gauntletStart(stage) - GAUNTLET.stageEvery + GAUNTLET.unlockLead, now = gauntletStart(stage) + GAUNTLET.unlockLead;
  return Object.entries(towers).filter(([, t]) => (t.unlock || 0) > was && (t.unlock || 0) <= now).map(([id, t]) => ({ id, name: t.name, wave: t.unlock }));
}

// Endurance and Last Stand: foes defeated by the end of each minute, shown as a chart, and where it first went wrong.
export function paceChart(run) {
  const P = run.pace || [];
  if (P.length < 2) return null;
  const per = P.map((k, i) => k - (i ? P[i - 1] : 0));
  const size = Math.max(1, Math.ceil(per.length / RECAP.chartBars)), bars = [];
  for (let i = 0; i < per.length; i += size) bars.push({ from: i + 1, to: Math.min(per.length, i + size), n: Math.round(per.slice(i, i + size).reduce((a, b) => a + b, 0) / Math.min(size, per.length - i)) });
  const peak = bars.reduce((a, b) => (b.n > a.n ? b : a), bars[0]);
  return { bars, max: Math.max(1, ...bars.map((b) => b.n)), peak, line: `Peak pace: about ${peak.n} foes a minute around minute ${peak.from === peak.to ? peak.from : peak.from + '-' + peak.to}.` };
}
export function brokeLine(run, towerNames = {}) {
  const bits = [];
  if (run.firstLoss) bits.push(`the first tower fell at ${mmss(run.firstLoss.t)} (${towerNames[run.firstLoss.type] || run.firstLoss.type}${run.firstLoss.by ? ', wrecked by ' + run.firstLoss.by : ''})`);
  if (run.firstLeak) bits.push(`the first foe got through at ${mmss(run.firstLeak.t)} (${run.firstLeak.name})`);
  return bits.length ? `Where it broke: ${bits.join('; ')}.` : 'Where it broke: nothing was lost before the end.';
}
// Endurance: the surge you reached (one per beat of the clock) and the next free repair.
export const surgeAt = (clock) => 1 + Math.floor(Math.max(0, clock) / ENDURANCE.beat);
export const repairIn = (stats) => Math.max(0, (stats?.freeRepairAt ?? ENDURANCE.repairKills) - (stats?.kills || 0));

// Last Stand: the ladder of strength it opens at and how fast it climbs.
export function standLadder(waves = 5) {
  const a = []; for (let i = 0; i < waves; i++) a.push(LASTSTAND.startWave + i);
  return `Foes open at wave ${a[0]} strength and each wave that follows, ${LASTSTAND.gap} seconds apart, is one step stronger: ${a.join(' → ')} …`;
}

// Warfront: how much harm the warlord's favoured foes did, from the breach log.
export function favouredHarm(run) {
  const wl = warlordById(run.warlord); if (!wl || !run.leakBy) return null;
  let fav = 0, all = 0;
  for (const [k, r] of Object.entries(run.leakBy)) { all += r.n; if ((wl.favor || []).includes(k)) fav += r.n; }
  if (!all) return null;
  return { fav, all, line: fav ? `${wl.icon} ${fav} of the ${all} foes that got through were ${wl.name}'s favoured kind.` : `${wl.icon} None of the ${all} foes that got through were ${wl.name}'s favoured kind.` };
}
// Time left in the Realm's week (the weekly modes reset on Monday), as "2 days 5 hours" or "3 hours 12 minutes".
export function weekLeft(now = new Date()) {
  const end = periodBounds('w:' + seasonKey(now), now).end;
  const m = Math.max(0, Math.floor((end - now.getTime()) / 60000)), d = Math.floor(m / 1440), hr = Math.floor((m % 1440) / 60), mi = m % 60;
  return d ? `${d} day${d === 1 ? '' : 's'} ${hr} hour${hr === 1 ? '' : 's'}` : `${hr} hour${hr === 1 ? '' : 's'} ${mi} minute${mi === 1 ? '' : 's'}`;
}
// The last few weeks' warlords with your best wave against each.
export function pastWarlords(p, n = 6, now = new Date()) {
  const weeks = p?.best?.modes?.warfront?.weeks || {};
  const out = []; let d = now;
  for (let i = 0; i < n; i++) {
    d = new Date(periodBounds('w:' + seasonKey(d), d).start - 3600000);
    const key = seasonKey(d), wf = warfrontSetup(key);
    out.push({ key, warlord: wf.warlord, map: wf.map, best: weeks[key] || 0 });
  }
  return out;
}
