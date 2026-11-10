// Daily play streak + rotating quests. Pure functions over the profile so they're easy to test.
import { hashStr, mulberry32, localDateKey, weekKey } from '../core/rng.js';

const DAY = 86400000;
export const QUEST_POOL = [
  { id: 'kills', text: 'Defeat {n} enemies', goals: [120, 200, 300], stat: (r) => r.kills, reward: 15 },
  { id: 'hero', text: 'Land {n} hero kills', goals: [20, 35, 50], stat: (r) => r.heroKills, reward: 18 },
  { id: 'head', text: 'Score {n} headshots', goals: [6, 10, 15], stat: (r) => r.headshots, reward: 18 },
  { id: 'waves', text: 'Clear {n} waves', goals: [8, 12, 18], stat: (r) => r.wavesCleared, reward: 15 },
  { id: 'boss', text: 'Defeat {n} boss', goals: [1, 1, 2], stat: (r) => r.bossKills, reward: 22 },
  { id: 'combo', text: 'Reach a {n} combo', goals: [10, 20, 30], stat: (r) => r.maxCombo, max: true, reward: 18 },
  { id: 'gems', text: 'Collect {n} gems', goals: [3, 5, 8], stat: (r) => r.gems || 0, reward: 15 },
  { id: 'flaw', text: 'Win {n} flawless waves', goals: [2, 4, 6], stat: (r) => r.flawless || 0, reward: 18 },
  { id: 'deep', text: 'Reach wave {n} in a run', goals: [10, 15, 20], stat: (r) => r.wave - ((r.start || 1) - 1), max: true, reward: 20 },
];
// v1.66: six more order types, in the pool from this day on (older days keep the pool they were drawn from).
export const QUEST_NEW_FROM = '2026-11-10';
export const QUEST_POOL_NEW = [
  { id: 'built', text: 'Build {n} towers in a run', goals: [10, 16, 24], stat: (r) => r.towersBuilt || 0, max: true, reward: 15 },
  { id: 'kinds', text: 'Use {n} different towers in a run', goals: [3, 4, 6], stat: (r) => Object.keys(r.builtByTower || {}).length, max: true, reward: 18 },
  { id: 'spec', text: 'Specialize {n} towers', goals: [1, 2, 3], stat: (r) => (r.specs || []).length, reward: 20 },
  { id: 'arts', text: 'Cast {n} Castle Arts', goals: [6, 10, 16], stat: (r) => Object.values(r.artUses || {}).reduce((a, b) => a + b, 0), reward: 15 },
  { id: 'norepair', text: 'Clear {n} waves without repairing', goals: [6, 10, 14], stat: (r) => ((r.repairs || 0) === 0 ? r.wavesCleared || 0 : 0), max: true, reward: 20 },
  { id: 'gold', text: 'Earn {n} gold in a run', goals: [3000, 6000, 10000], stat: (r) => r.goldEarned || 0, max: true, reward: 15 },
];
const poolFor = (day) => (String(day) >= QUEST_NEW_FROM ? [...QUEST_POOL, ...QUEST_POOL_NEW] : QUEST_POOL);
export const questDef = (id) => QUEST_POOL.find((d) => d.id === id) || QUEST_POOL_NEW.find((d) => d.id === id);
// The Vanguard order: only waves held in a run that began at or above the player's adaptive wave count.
const VANGUARD = { id: 'vg', text: 'Clear {n} waves in an Adaptive-level run', goals: [6, 8, 10], stat: (r) => (r.vanguard ? r.wavesCleared : 0), reward: 30, vanguard: true };
const WEEKLY = { id: 'wk', text: 'Defeat {n} enemies this week', goals: [1500], stat: (r) => r.kills, reward: 120 };

export const fillText = (q) => q.text.replace('{n}', q.goal.toLocaleString('en-US'));

function make(def, goal) { return { id: def.id, text: def.text, goal, prog: 0, done: false, reward: def.reward }; }

export function dailyQuests(day) {
  const rnd = mulberry32(hashStr('quests|' + day));
  const pool = [...poolFor(day)];
  const out = [];
  for (let i = 0; i < 3; i++) {
    const def = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    out.push(make(def, def.goals[Math.floor(rnd() * def.goals.length)]));
  }
  out.push(make(VANGUARD, VANGUARD.goals[Math.floor(rnd() * VANGUARD.goals.length)]));
  return out;
}

// Make sure the profile holds today's quests. Safe to call often.
export function ensureQuests(p, now = new Date()) {
  const day = localDateKey(now), wk = weekKey(now);
  // A day key ahead of ours was written by the old UTC clock this evening: keep that list rather than wiping the player's progress.
  if (!p.quests || (p.quests.day !== day && !(p.quests.day > day && p.quests.day <= localDateKey(new Date(now.getTime() + DAY))))) p.quests = { ...(p.quests || {}), day, list: dailyQuests(day) };
  else if (!p.quests.list.some((x) => x.id === 'vg')) p.quests.list.push(dailyQuests(day).at(-1));   // orders issued before v1.16
  if (!p.quests.week || p.quests.week.key !== wk) p.quests.week = { key: wk, ...make(WEEKLY, WEEKLY.goals[0]) };
  return p.quests;
}

// Advance quests with a finished run. Returns the quests completed by it (renown is credited here).
export function progressQuests(p, run, now = new Date()) {
  const q = ensureQuests(p, now);
  const done = [];
  for (const item of [...q.list, q.week]) {
    if (item.done) continue;
    const def = item === q.week ? WEEKLY : item.id === 'vg' ? VANGUARD : questDef(item.id);
    const v = def.stat(run) || 0;
    item.prog = def.max ? Math.max(item.prog, v) : item.prog + v;
    if (item.prog >= item.goal) { item.done = true; item.prog = item.goal; p.renown += item.reward; done.push(item); }
  }
  return done;
}

// Daily streak. Returns {n, bonus, fresh}. The bonus Renown is no longer credited here: it goes into the day's
// Daily Supplies chest (meta/supplies.js), which the player opens by hand.
export function touchStreak(p, now = new Date()) {
  const today = localDateKey(now), yesterday = (() => { const y = new Date(now); y.setDate(y.getDate() - 1); return localDateKey(y); })();
  const s = p.streak || (p.streak = { day: null, n: 0, best: 0 });
  if (s.day === today || (s.day > today && s.day <= localDateKey(new Date(now.getTime() + DAY)))) return { n: s.n, bonus: 0, fresh: false };   // a later key came from the old UTC clock
  s.n = s.day === yesterday ? s.n + 1 : 1;
  s.day = today; s.best = Math.max(s.best || 0, s.n);
  const bonus = Math.min(10 + s.n * 3, 60);
  return { n: s.n, bonus, fresh: true };
}
