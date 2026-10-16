// Overtime Orders and Realm Works: what to work toward once the day's orders are done.
//
// Finish every daily order and the Quartermaster keeps handing out bonus orders, each tougher than the last (up to a daily
// limit). Every one pays a little Renown and Supply. Supply is spent on Realm Works, two tracks that never reset:
//   Warbanner  (conquer)  your kills count more toward the shared Daily Rally, so the Realm wins more land.
//   Wardens    (defend)   a sturdier castle and wall in every run, and the horde bites less.
// Pure functions over the profile, like quests.js.
import { QUEST_POOL, ensureQuests } from './quests.js';
import { hashStr, mulberry32, localDateKey } from '../core/rng.js';

export const OVERTIME = {
  maxPerDay: 8,      // bonus orders per day
  growth: 0.55,      // each tier asks this much more than the last
  baseRenown: 12, renownStep: 4,
  supplyEvery: 3,    // every third tier pays 2 Supply instead of 1
};

export const WORKS = {
  banner: { id: 'banner', icon: '🚩', name: 'Warbanner', blurb: 'Your kills count 10% more toward the Daily Rally per level, so the Realm wins land sooner. Applies to every run you play.',
    costs: [2, 3, 5, 8, 12], per: 0.10 },
  wardens: { id: 'wardens', icon: '🛡', name: 'Wardens', blurb: 'Each level adds 4% castle and wall health and trims 1% of the damage the castle takes, in every run.',
    costs: [1, 2, 3, 5, 7, 10], hp: 0.04, dr: 0.01 },
};

// The order for a given tier on a given day. Deterministic, so a reload shows the same one.
export function overtimeOrder(day, tier) {
  const rnd = mulberry32(hashStr(`overtime|${day}|${tier}`));
  const def = QUEST_POOL[Math.floor(rnd() * QUEST_POOL.length)];
  const top = def.goals[def.goals.length - 1];
  const raw = top * (1 + OVERTIME.growth * tier);
  const goal = raw < 30 ? Math.max(def.goals[0], Math.ceil(raw)) : Math.max(def.goals[0], def.max ? Math.round(raw / 5) * 5 : Math.round(raw / 10) * 10);
  return { id: def.id, text: def.text, goal, prog: 0, done: false, reward: OVERTIME.baseRenown + OVERTIME.renownStep * tier, supply: tier % OVERTIME.supplyEvery === OVERTIME.supplyEvery - 1 ? 2 : 1, tier, overtime: true };
}

export const worksLevel = (p, id) => Math.max(0, Math.min(WORKS[id]?.costs.length || 0, (p.works && p.works[id]) | 0));
export const worksCost = (p, id) => { const W = WORKS[id], lv = worksLevel(p, id); return lv >= W.costs.length ? null : W.costs[lv]; };
export function buyWork(p, id) {
  const c = WORKS[id] && worksCost(p, id);
  if (c == null || (p.supply || 0) < c) return false;
  p.supply -= c; p.works = { ...(p.works || {}), [id]: worksLevel(p, id) + 1 };
  return true;
}
// The run-bonus fields Realm Works adds (see profile.runBonus).
export function worksBonus(p) {
  const w = worksLevel(p, 'wardens');
  return { castleHpMult: WORKS.wardens.hp * w, wallHpMult: WORKS.wardens.hp * w, castleDR: WORKS.wardens.dr * w };
}
// How much more your kills count toward the Rally (1 = normal). The server clamps what it is sent to the same table.
export const rallyStandard = (p) => worksLevel(p, 'banner');
export const rallyMult = (level) => 1 + WORKS.banner.per * Math.max(0, Math.min(WORKS.banner.costs.length, level | 0));

// Today's overtime state: locked until every daily order is done, then one live order at a time.
export function ensureOvertime(p, now = new Date()) {
  const q = ensureQuests(p, now), day = localDateKey(now);
  if (!q.over || q.over.day !== day) q.over = { day, tier: 0, cur: null, cleared: 0 };
  const open = q.list.every((x) => x.done);
  if (open && !q.over.cur && q.over.tier < OVERTIME.maxPerDay) q.over.cur = overtimeOrder(day, q.over.tier);
  return { ...q.over, open, left: Math.max(0, OVERTIME.maxPerDay - q.over.tier), q };
}

// Feed a run's numbers to the live overtime order. Returns the orders it finished (Renown and Supply are credited here).
// The run that finishes the last daily order counts toward the first overtime order too.
export function progressOvertime(p, run, now = new Date()) {
  const day = localDateKey(now);
  const before = ensureOvertime(p, now);
  const o = before.q.over, finished = [];
  if (!before.open || !o.cur) return finished;
  for (let guard = 0; guard < OVERTIME.maxPerDay && o.cur; guard++) {
    const def = QUEST_POOL.find((d) => d.id === o.cur.id);
    const v = def.stat(run) || 0;
    o.cur.prog = def.max ? Math.max(o.cur.prog, v) : o.cur.prog + v;
    if (o.cur.prog < o.cur.goal) break;
    o.cur.done = true; o.cur.prog = o.cur.goal;
    p.renown += o.cur.reward; p.supply = (p.supply || 0) + o.cur.supply;
    finished.push(o.cur); o.cleared++; o.tier++;
    o.cur = o.tier < OVERTIME.maxPerDay ? overtimeOrder(day, o.tier) : null;
    run = { ...run, kills: 0, heroKills: 0, headshots: 0, wavesCleared: 0, bossKills: 0, gems: 0, flawless: 0, wave: 0, maxCombo: 0, start: 1 };   // each run's numbers pay one order, then the rest start fresh
  }
  return finished;
}
