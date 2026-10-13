// Realm rules shared by the server (authoritative) and the client (display + blessings).
import { REALM, RALLY } from '../data/balance.js';

export const kindOf = (key) => (key.startsWith('m:') ? 'month' : 'week');

// Goals are fixed when a period opens, from the previous period. Two signals, whichever asks more:
//   turnout  how many citizens fought (active × perActive), so a bigger Realm gets a bigger goal, and
//   output   what the Realm actually did last time (× carry), so harder-playing citizens raise the bar too.
// The rise from one period to the next is capped (maxRise × last goal) so a single viral week can't
// set an impossible target; the floor keeps a quiet Realm's goal winnable.
// `prev` is the old signature's number of active citizens, or { active, kills, waves, goal }.
export function goalsFor(kind, prev = 0) {
  const c = REALM[kind];
  const p = typeof prev === 'number' ? { active: prev } : prev || {};
  const turnout = (p.active || 0) * c.perActive;
  const output = (p.kills || 0) * REALM.carry;
  let target = Math.max(c.floorKills, turnout, output);
  if (p.goal > 0) target = Math.min(target, Math.max(c.floorKills, p.goal * REALM.maxRise));
  const kills = Math.max(c.floorKills, Math.round(target / 500) * 500);
  // Waves follow kills, but if citizens held unusually many waves last time, that sets the bar instead.
  const waves = Math.max(Math.round(kills / REALM.wavesPerKills / 10) * 10, Math.round(((p.waves || 0) * REALM.carry) / 10) * 10);
  return { kills, waves: Math.min(waves, Math.round((kills / REALM.wavesPerKills) * REALM.maxRise / 10) * 10) };
}

// Plain-language reason for a goal, for the UI ("set from 14 citizens and 31,200 enemies last week").
export function goalBasis(kind, prev = {}) {
  const c = REALM[kind];
  const turnout = (prev.active || 0) * c.perActive, output = (prev.kills || 0) * REALM.carry;
  const by = output > turnout && output > c.floorKills ? 'output' : turnout > c.floorKills ? 'turnout' : 'floor';
  return { ...prev, by };
}

// Overall progress: average of the two meters (each capped at 2x so one stat cannot carry the nation alone).
export function fraction(kills, waves, goal) {
  const a = Math.min(2, kills / Math.max(1, goal.kills)), b = Math.min(2, waves / Math.max(1, goal.waves));
  return (a + b) / 2;
}
export const tiersReached = (f) => REALM.tiers.filter((t) => f >= t).length;

// Combined perks for a given number of tiers reached in the week and the month.
export function blessing(weekTiers, monthTiers) {
  const perks = {}, text = [];
  const add = (kind, n) => {
    for (let i = 0; i < n; i++) {
      for (const [k, v] of Object.entries(REALM[kind].perks[i])) perks[k] = (perks[k] || 0) + v;
      text.push({ kind, tier: i, text: REALM[kind].perkText[i], name: REALM.tierNames[i] });
    }
  };
  add('week', weekTiers); add('month', monthTiers);
  return { perks, text, weekTiers, monthTiers };
}

export function rewardFor(kind, tier) { return REALM[kind].rewards[tier]; }

// Daily Rally goal, fixed when the day opens from yesterday: how many pitched in, and how much they did.
export function rallyGoal(prev = 0) {
  const p = typeof prev === 'number' ? { active: prev } : prev || {};
  let target = Math.max(RALLY.floorKills, (p.active || 0) * RALLY.perActive, (p.kills || 0) * RALLY.carry);
  if (p.goal > 0) target = Math.min(target, Math.max(RALLY.floorKills, p.goal * REALM.maxRise));
  return Math.max(RALLY.floorKills, Math.round(target / 100) * 100);
}
