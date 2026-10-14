// Adaptive play: pick the wave a run should begin on from how the player has actually been doing,
// so a veteran is not asked to click through waves 1-20 again for every order and event reward.
// Pure functions over the profile. Nothing here is forced: the manual difficulty picker still works,
// and a run counts as a "Vanguard" run when it begins at or above the adaptive wave, however it was chosen.
import { DIFFICULTY } from '../data/balance.js';

export const ADAPT = {
  step: 5,            // starts snap down to a multiple of this
  min: 10,            // below this the head start is not worth having: begin on wave 1
  max: 70,
  minRuns: 3,         // runs needed before it tunes itself
  recent: 6,          // runs that set the current form
  peakRuns: 20,       // runs searched for a recent best
  peakShare: 0.75,    // one bad day should not drag the start down: form is at least this share of the third-best recent reach
  startShare: 0.6,    // start at this share of the wave you usually reach
  tooEasy: 25,        // median waves held past the start in the last head-start runs: above this, step up
  tooHard: 4,         // ...and below this, step down
};

const FIGHTS = (h) => (h.mode || 'normal') === 'normal' || h.mode === 'frontier';
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Where should this player's next run begin on `mapId`?
// → { start, calibrated, runs, need, skill, why }
export function adaptiveStart(p, mapId) {
  const all = (p.history || []).filter(FIGHTS);
  const onMap = mapId ? all.filter((h) => h.map === mapId) : [];
  const pool = onMap.length >= ADAPT.minRuns ? onMap : all;
  if (pool.length < ADAPT.minRuns) {
    return { start: 1, calibrated: false, runs: pool.length, need: ADAPT.minRuns - pool.length, skill: 0, why: `Play ${ADAPT.minRuns - pool.length} more run${ADAPT.minRuns - pool.length === 1 ? '' : 's'} and it will tune itself to you. Until then it starts on wave 1.` };
  }
  const recent = pool.slice(-ADAPT.recent).map((h) => h.wave);
  const peaks = pool.slice(-ADAPT.peakRuns).map((h) => h.wave).sort((a, b) => b - a);
  const peak = peaks[Math.min(2, peaks.length - 1)];
  const skill = Math.max(median(recent), ADAPT.peakShare * peak);
  let target = skill * ADAPT.startShare;
  // Feedback from the head-start runs themselves: if they were over in a few waves it was too hard, if you walked it, too easy.
  const lately = pool.slice(-3).filter((h) => (h.start || 1) > 1);
  let nudge = 0;
  if (lately.length >= 2) {
    const held = median(lately.map((h) => h.wave - h.start));
    if (held < ADAPT.tooHard) nudge = -ADAPT.step; else if (held >= ADAPT.tooEasy) nudge = ADAPT.step;
  }
  target += nudge;
  let start = Math.floor(target / ADAPT.step) * ADAPT.step;
  start = start < ADAPT.min ? 1 : Math.min(ADAPT.max, start);
  const why = start === 1
    ? 'Your recent runs say the full climb from wave 1 is still the right challenge.'
    : `You usually reach about wave ${Math.round(skill)}, so wave ${start} should keep it tense${nudge > 0 ? ' (your last runs were easy)' : nudge < 0 ? ' (your last runs were rough)' : ''}.`;
  return { start, calibrated: true, runs: pool.length, need: 0, skill: Math.round(skill), why };
}

// The Vanguard test: this run began at or above the adaptive wave, so it was a real challenge for this player.
// New players (nothing to measure yet) always qualify, so nobody is locked out.
export function isVanguardStart(p, mapId, start, mode = 'normal') {
  if (mode !== 'normal' && mode !== 'frontier') return false;
  return Math.max(1, start | 0) >= adaptiveStart(p, mapId).start;
}

// Named tier at or below a wave, for labels.
export const tierName = (wave) => [...DIFFICULTY].reverse().find((d) => d.wave <= wave)?.name || 'Recruit';
