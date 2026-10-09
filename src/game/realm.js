// Realm rules shared by the server (authoritative) and the client (display + blessings).
import { REALM } from '../data/balance.js';

export const kindOf = (key) => (key.startsWith('m:') ? 'month' : 'week');

// Goals are fixed when a period opens, from how many citizens fought in the previous one.
export function goalsFor(kind, prevActive) {
  const c = REALM[kind];
  const kills = Math.max(c.floorKills, Math.round((prevActive * c.perActive) / 500) * 500);
  return { kills, waves: Math.round(kills / REALM.wavesPerKills / 10) * 10 };
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
