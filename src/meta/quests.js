// Daily play streak + rotating quests. Pure functions over the profile so they're easy to test.
import { hashStr, mulberry32, utcDateKey, weekKey } from '../core/rng.js';

const DAY = 86400000;
export const QUEST_POOL = [
  { id: 'kills', text: 'Defeat {n} enemies', goals: [120, 200, 300], stat: (r) => r.kills, reward: 6 },
  { id: 'hero', text: 'Land {n} hero kills', goals: [20, 35, 50], stat: (r) => r.heroKills, reward: 7 },
  { id: 'head', text: 'Score {n} headshots', goals: [6, 10, 15], stat: (r) => r.headshots, reward: 7 },
  { id: 'waves', text: 'Clear {n} waves', goals: [8, 12, 18], stat: (r) => r.wavesCleared, reward: 6 },
  { id: 'boss', text: 'Defeat {n} boss', goals: [1, 1, 2], stat: (r) => r.bossKills, reward: 9 },
  { id: 'combo', text: 'Reach a {n} combo', goals: [10, 20, 30], stat: (r) => r.maxCombo, max: true, reward: 7 },
  { id: 'gems', text: 'Collect {n} gems', goals: [3, 5, 8], stat: (r) => r.gems || 0, reward: 6 },
  { id: 'flaw', text: 'Win {n} flawless waves', goals: [2, 4, 6], stat: (r) => r.flawless || 0, reward: 7 },
  { id: 'deep', text: 'Reach wave {n} in a run', goals: [10, 15, 20], stat: (r) => r.wave, max: true, reward: 8 },
];
const WEEKLY = { id: 'wk', text: 'Defeat {n} enemies this week', goals: [1500], stat: (r) => r.kills, reward: 40 };

export const fillText = (q) => q.text.replace('{n}', q.goal.toLocaleString('en-US'));

function make(def, goal) { return { id: def.id, text: def.text, goal, prog: 0, done: false, reward: def.reward }; }

export function dailyQuests(day) {
  const rnd = mulberry32(hashStr('quests|' + day));
  const pool = [...QUEST_POOL];
  const out = [];
  for (let i = 0; i < 3; i++) {
    const def = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    out.push(make(def, def.goals[Math.floor(rnd() * def.goals.length)]));
  }
  return out;
}

// Make sure the profile holds today's quests. Safe to call often.
export function ensureQuests(p, now = new Date()) {
  const day = utcDateKey(now), wk = weekKey(now);
  if (!p.quests || p.quests.day !== day) p.quests = { ...(p.quests || {}), day, list: dailyQuests(day) };
  if (!p.quests.week || p.quests.week.key !== wk) p.quests.week = { key: wk, ...make(WEEKLY, WEEKLY.goals[0]) };
  return p.quests;
}

// Advance quests with a finished run. Returns the quests completed by it (renown is credited here).
export function progressQuests(p, run, now = new Date()) {
  const q = ensureQuests(p, now);
  const done = [];
  for (const item of [...q.list, q.week]) {
    if (item.done) continue;
    const def = item === q.week ? WEEKLY : QUEST_POOL.find((d) => d.id === item.id);
    const v = def.stat(run) || 0;
    item.prog = def.max ? Math.max(item.prog, v) : item.prog + v;
    if (item.prog >= item.goal) { item.done = true; item.prog = item.goal; p.renown += item.reward; done.push(item); }
  }
  return done;
}

// Daily streak. Returns {n, bonus, fresh}; bonus renown is credited once per day.
export function touchStreak(p, now = new Date()) {
  const today = utcDateKey(now), yesterday = utcDateKey(new Date(now.getTime() - DAY));
  const s = p.streak || (p.streak = { day: null, n: 0, best: 0 });
  if (s.day === today) return { n: s.n, bonus: 0, fresh: false };
  s.n = s.day === yesterday ? s.n + 1 : 1;
  s.day = today; s.best = Math.max(s.best || 0, s.n);
  const bonus = Math.min(4 + s.n * 2, 30);
  p.renown += bonus;
  return { n: s.n, bonus, fresh: true };
}
