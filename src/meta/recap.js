// v1.61 · Pure helpers for the run summary, the pause menu, the wave strip and the setup notes.
// No DOM here: the screens draw what these return, and the tests pin it.
import { ENEMIES, RECAP, ASCENSION, MODIFIERS } from '../data/balance.js';
import { planWave } from '../game/waves.js';
import { buildMap, MAPS } from '../game/maps.js';
import { siegeScore } from '../game/modes.js';

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
