// The animated "How the Realm works" tour: a timeline per scene, no DOM, so it can be tested in Node.
// Each scene says how many provinces the map holds at time t, which goal rows are filling, and what to say.
import { TERRITORY, applyDelta, PROVINCES } from '../game/realmmap.js';

const { day, week, month } = TERRITORY;
const START = TERRITORY.start;

// Scene 2 and 3 move the border in steps; `steps` are the moments a goal closes.
function stepper(from, steps) {
  const at = (t) => { let s = { held: from, bulwark: 0 }; for (const k of steps) if (t >= k.at) s = applyDelta(s, k.delta); return s.held; };
  return at;
}
const GAIN = [
  { row: 'day', at: 2.5, ok: true, delta: day.win, label: 'Daily Rally won', short: 'Won', tag: `+${day.win} province` },
  { row: 'week', at: 5.5, ok: true, delta: week.victory, label: 'Weekly Muster: Victory', short: 'Victory', tag: `+${week.victory} provinces` },
  { row: 'month', at: 8.5, ok: true, delta: month.victory, label: 'Monthly Campaign: Victory', short: 'Victory', tag: `+${month.victory} provinces` },
];
const LOSS = [
  { row: 'day', at: 2.2, ok: false, delta: day.miss, label: 'Daily Rally missed', short: 'Missed', tag: `${day.miss} province` },
  { row: 'week', at: 4.8, ok: false, delta: week.fail, label: 'Weekly Muster failed', short: 'Failed', tag: `${week.fail} provinces` },
  { row: 'month', at: 7.4, ok: false, delta: month.fail, label: 'Monthly Campaign failed', short: 'Failed', tag: `${month.fail} provinces` },
];
const afterGain = START + day.win + week.victory + month.victory;

export const TOUR_PROVINCES = [6, 12, 27].map((i) => PROVINCES[i]);

export const SCENES = [
  { id: 'together', title: 'One Realm, one enemy', len: 9, held: () => START,
    text: 'Every player fights the same horde. Each enemy you defeat, in any run, fills the Realm\'s shared goals: the Daily Rally, the Weekly Muster and the Monthly Campaign.' },
  { id: 'grow', title: 'Won goals push the border out', len: 11, held: stepper(START, GAIN), steps: GAIN, from: START,
    text: 'When a goal closes, the Realm takes new provinces on the map. A day is worth a little, a week more, a month the most. Nobody has to carry it alone.' },
  { id: 'shrink', title: 'Missed goals pull it back', len: 9.5, held: stepper(afterGain, LOSS), steps: LOSS, from: afterGain,
    text: `If the Realm misses a goal, the horde takes ground back. But the capital and its nearest ${TERRITORY.floor - 1} provinces never fall (${TERRITORY.floor} is the floor), and a full map builds a Bulwark that cushions the losses.` },
  { id: 'gifts', title: 'Every land has a gift and a foe', len: 12, held: () => START + 8,
    text: 'Each province you hold blesses every run for every player: a tower bonus, a troop bonus, more gold. Each also has its own horde, and enemies and weather to match.' },
  { id: 'march', title: 'March on the front', len: 8, held: () => START, 
    text: 'Pick the contested province and March on it: you fight its horde, in its land and weather. Your kills in a March count double toward the Daily Rally.' },
  { id: 'you', title: 'Your part', len: 8, held: () => START + 3,
    text: 'You do not have to do anything special. Play any run and every kill counts. Dailies, Marches and long runs just count a little more.' },
];

export const TOUR_LENGTH = SCENES.reduce((a, s) => a + s.len, 0);
export const sceneAt = (t) => { let acc = 0; for (let i = 0; i < SCENES.length; i++) { if (t < acc + SCENES[i].len) return { i, t: t - acc }; acc += SCENES[i].len; } return { i: SCENES.length - 1, t: SCENES.at(-1).len }; };

// Scene 1: six citizens, each adding kills at their own pace until the Rally is full at the end of the scene.
export const CITIZENS = [
  { name: 'You', icon: '🏹', share: 0.2 }, { name: 'Aldric', icon: '🛡', share: 0.19 }, { name: 'Bree', icon: '🔮', share: 0.17 },
  { name: 'Cormac', icon: '💣', share: 0.16 }, { name: 'Dunya', icon: '❄', share: 0.15 }, { name: 'Ewan', icon: '⚔', share: 0.13 },
];
export const RALLY_GOAL = 1500;
export function crowdAt(t, len = SCENES[0].len) {
  const f = Math.min(1, Math.max(0, t / (len - 1.2)));
  const kills = CITIZENS.map((c) => Math.floor(RALLY_GOAL * c.share * f));
  const total = kills.reduce((a, b) => a + b, 0);
  return { kills, total, frac: Math.min(1, total / RALLY_GOAL) };
}

// Goal rows for scenes 2 and 3: the bar fills towards the moment the goal closes, then shows its result.
export function rowsAt(scene, t) {
  return ['day', 'week', 'month'].map((row) => {
    const s = scene.steps.find((x) => x.row === row);
    const start = row === 'day' ? 0 : s.at - 2.4;
    const f = Math.min(1, Math.max(0, (t - start) / Math.max(0.1, s.at - start)));
    const done = t >= s.at;
    return { row, frac: s.ok ? f : f * 0.55, done, ok: s.ok, label: s.label, short: s.short, tag: s.tag, delta: s.delta };
  });
}

// Scene 4 shows three provinces in turn.
export function giftAt(t, len = SCENES[3].len) {
  const i = Math.min(TOUR_PROVINCES.length - 1, Math.floor(t / (len / TOUR_PROVINCES.length)));
  return { i, province: TOUR_PROVINCES[i] };
}
