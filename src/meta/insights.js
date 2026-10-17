// Motivation: turns raw numbers into "here is what is within reach" nudges. Pure functions, easy to test.
import { localDateKey } from '../core/rng.js';
import { RANKS } from '../data/events.js';
import { REALM, RALLY } from '../data/balance.js';
import { rankFor, activeEvent, eventState, nextReward } from './events.js';
import { prestigeStatus, roman } from './prestige.js';
import { codexProgress } from './medals.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const todayKey = (now) => localDateKey(now);

export function bestWave(p) { return Math.max(0, ...Object.values(p.best?.wave || {})); }

// Runs since the player's own average; local history works offline.
export function trend(p) {
  const w = (p.history || []).filter((h) => (h.start || 1) <= 1).map((h) => h.wave);
  if (w.length < 6) return null;
  const last = w.slice(-5), before = w.slice(-10, -5);
  if (before.length < 3) return { last: avg(last), before: null, delta: 0 };
  return { last: avg(last), before: avg(before), delta: avg(last) - avg(before) };
}

// Ordered nudges, strongest first. `ctx`: { profile, realm, front, you, now }.
export function insights({ profile: p, realm, front, you, now = new Date() }, limit = 6) {
  const out = [];
  const add = (score, icon, text) => out.push({ score, icon, text });
  const runs = p.stats?.runs || 0;
  const best = bestWave(p);
  const t = trend(p);

  // The player's own record is the nearest goal.
  if (runs >= 3 && best > 0 && t && t.last < best) {
    const gap = Math.max(1, Math.ceil(best - t.last));
    add(60, '🎯', `Your best is wave ${best}. Your last 5 runs averaged wave ${Math.round(t.last)}, so you are about ${gap} wave${gap === 1 ? '' : 's'} off a new record.`);
  }
  if (t && t.before != null && Math.abs(t.delta) >= 1) {
    add(t.delta > 0 ? 70 : 30, t.delta > 0 ? '📈' : '💪', t.delta > 0
      ? `You are improving: your last 5 runs reached ${Math.round(t.delta)} waves further than the 5 before.`
      : `Your last 5 runs dipped by about ${Math.round(-t.delta)} waves. Try a new tower mix or spend Renown in the Keep.`);
  }

  // Commander rank.
  const life = p.stats?.renownEarned || 0, rk = rankFor(life);
  if (rk.next) {
    const need = rk.next.at - life, perRun = runs ? life / runs : 0;
    const runsLeft = perRun > 0 ? Math.max(1, Math.ceil(need / perRun)) : null;
    add(rk.progress > 0.6 ? 75 : 40, '🎖', `${fmt(need)} more Renown to ${rk.next.name}${runsLeft ? ` — about ${runsLeft} run${runsLeft === 1 ? '' : 's'} at your pace` : ''}.`);
  }

  // Dynasty and Codex: long-term goals.
  const ps = prestigeStatus(p);
  if (ps.ok) add(88, '👑', `Your line is ready to ascend to Dynasty ${roman(ps.next)}. Visit The Dynasty for a Legacy perk and royal rewards.`);
  else if (ps.frac >= 0.6) add(55, '👑', `${fmt(ps.need - ps.have)} more Renown until you may ascend to Dynasty ${roman(ps.next)}.`);
  const cp = codexProgress(p);
  if (cp.next && cp.needForNext <= 8) add(48, '📚', `${cp.needForNext} more Codex medal${cp.needForNext === 1 ? '' : 's'} earns the title ${cp.next.name}.`);

  // Event reward within reach.
  const ev = activeEvent(now);
  if (ev) {
    const st = eventState(p, ev), nr = nextReward(p, ev);
    if (nr) {
      const left = Math.max(1, nr.at - st.waves);
      const what = nr.cosmetic ? 'a new cosmetic' : nr.title ? `the title "${nr.title}"` : 'Renown';
      add(left <= 15 ? 85 : 50, ev.icon, `${left} wave${left === 1 ? '' : 's'} of ${ev.name} until ${what}. ${ev.daysLeft} day${ev.daysLeft === 1 ? '' : 's'} left.`);
    }
  }

  // Daily streak.
  const s = p.streak;
  if (s && s.n >= 2) {
    const played = s.day === todayKey(now);
    add(played ? 25 : 80, '🔥', played ? `${s.n}-day streak, kept for today. Your best is ${s.best || s.n}.` : `Your ${s.n}-day streak ends tonight. One wave keeps it alive.`);
  }

  // Together: the Realm needs you.
  const mine = runs ? (p.stats.kills || 0) / runs : 0;
  const week = realm?.week;
  if (week && week.reached < REALM.tiers.length) {
    const next = REALM.tiers[week.reached];
    const need = Math.max(0, Math.ceil(week.goal.kills * next - week.kills * 1));
    if (mine > 0 && need > 0) {
      const share = Math.min(100, Math.round((mine / Math.max(1, need)) * 100));
      add(65, '🏰', `The Realm needs ~${fmt(need)} more enemies for ${REALM.tierNames[week.reached]} this week. An average run of yours covers about ${share}% of that.`);
    } else if (need > 0) add(55, '🏰', `The Realm needs ~${fmt(need)} more enemies for ${REALM.tierNames[week.reached]} this week. Every wave counts.`);
  }
  const ra = front?.rally;
  if (ra && !ra.done) {
    const need = Math.max(0, ra.goal - ra.kills);
    const left = Math.max(0, RALLY.minKills - (ra.mine?.kills || 0));
    add(left > 0 ? 72 : 58, '📣', left > 0
      ? `Today's Rally is ${Math.round((ra.kills / ra.goal) * 100)}% done. Defeat ${left} more enemies to earn your share of the spoils (✦ ${ra.renown}).`
      : `Today's Rally needs ${fmt(need)} more enemies, and you are already in for the spoils. Call a friend in!`);
  } else if (ra?.done && !(ra.mine?.rewarded)) {
    add(35, '📣', `The Realm won today's Rally. Defeat ${Math.max(0, RALLY.minKills - (ra.mine?.kills || 0)) || RALLY.minKills} enemies to claim your share.`);
  }
  const sg = front?.siege;
  if (sg && !sg.defeated && sg.maxHp) {
    const pct = Math.round((sg.hp / sg.maxHp) * 100);
    add(45, '🗡', `${sg.name} has ${pct}% of its strength left. ${sg.yourDamage ? `You have dealt ${fmt(sg.yourDamage)} of the damage.` : 'Every run chips at it.'}`);
  }

  // Standing among citizens (server).
  if (you?.weekRank && you.weekCitizens > 1) {
    const top = Math.max(1, Math.round((you.weekRank / you.weekCitizens) * 100));
    add(you.weekRank <= 3 ? 90 : 35, '🏅', `You are #${you.weekRank} of ${you.weekCitizens} citizens this week (top ${top}%).`);
  }
  if (you?.cheers >= 1) add(20, '👏', `Your deeds have been cheered ${you.cheers} time${you.cheers === 1 ? '' : 's'} by other citizens.`);

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Short "what next" lines for the end-of-run screen.
export function afterRun(ctx) { return insights(ctx, 3); }

export { RANKS };
