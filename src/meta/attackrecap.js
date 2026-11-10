// v1.64 · Pure helpers for the attack modes (Assault, Raid, Conquest, Blitz, Warlord, Warrior attack).
// No DOM here: the screens draw what these return, and tests/attack-qol.test.mjs pins it.
import { ASSAULT, AUNITS, AUNIT_ORDER, RAID, RAID_MAX, BLITZ, BLITZ_MAX, WARLORD, WARLORD_TECH } from '../game/assault.js';
import { realmDayEnd, realmDay } from '../core/rng.js';
import { MAX_PROVINCES } from '../game/realmmap.js';

const num = (n) => Math.round(n).toLocaleString('en-US');
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const clockStr = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---------- AS-02 · what each unit is good against ----------
const COUNTERS = {
  footman:  { strong: 'Raiders on the road and archers who have run out of cover.', weak: 'Boiling oil, cannon splash and knights in the line.', best: 'Open with them: cheap bodies make the defenders waste shots.' },
  archer:   { strong: 'Defenders and emplacements from behind the line.', weak: 'Cavalry raiders and anything that reaches them.', best: 'Keep footmen or a mantlet in front and they never stop shooting.' },
  knight:   { strong: 'Packs of raiders: every swing hits three.', weak: 'Cannon fire and long sieges; they are slow and dear.', best: 'The answer to a sally; send them when a raid leaves the camp.' },
  cavalry:  { strong: 'Raiders anywhere near the road, and archers behind the line.', weak: 'Walls of spears and emplacements up close.', best: 'Hunt the raid, then pull them back out of range.' },
  ram:      { strong: 'The gate: it rolls past everything and pounds it.', weak: 'Boiling oil, and it cannot touch a single defender.', best: 'Send it with a mantlet in front and troops to draw the oil.' },
  mantlet:  { strong: 'Arrows and bolts: troops beside it take far less.', weak: 'Cannon and catapults; it deals no damage.', best: 'Lead the column with it, then pack your archers behind.' },
  sapper:   { strong: 'Emplacements: one charge blows half of one apart.', weak: 'Anything that sees them coming; they carry no weapon.', best: 'Send them while the defenders are busy with a ram.' },
  bombard:  { strong: 'Emplacements and towers, with splash on clustered troops.', weak: 'Raiders and cavalry once they close in.', best: 'Park it behind a mantlet and let it work down the line.' },
  drummer:  { strong: 'Any group of troops: +20% damage and +15% speed near him.', weak: 'Everything; he cannot fight and is frail.', best: 'March him behind a knight line, never out front.' },
  surgeon:  { strong: 'Long fights: patches up the wounded behind the line.', weak: 'Cavalry and archers who pick him out.', best: 'Pair with knights and a mantlet for a column that will not die.' },
  catapult: { strong: 'Emplacements from beyond their range.', weak: 'Very slow and cannot hit anything that is close.', best: 'Send it first so it is in range by the time the raids come.' },
  tower:    { strong: 'The wall: tears a breach and unloads four troops inside.', weak: 'Slow, dear, and it cannot fight on its own.', best: 'Time it with a ram so the gate and the wall fall together.' },
};
export function unitCounter(uid) {
  const U = AUNITS[uid], C = COUNTERS[uid];
  if (!U || !C) return null;
  return { id: uid, name: U.name, cost: U.cost, cd: U.cd, ...C, line: `Strong: ${C.strong} Weak: ${C.weak}` };
}
export const allCounters = () => AUNIT_ORDER.map(unitCounter);

// ---------- AS-01 / AS-06 · where the supply comes from ----------
export function supplyIncome(stage = 1) {
  const S = ASSAULT.supply, st = Math.max(1, stage | 0);
  const regen = +(S.regen + S.regenPerStage * (st - 1)).toFixed(2);
  return {
    stage: st, start: S.start, regen, perRaze: S.perRaze, perSlain: S.perSlain, grant: S.stageGrant, carry: Math.round(S.carry * 100),
    scale: +Math.pow(ASSAULT.scale, st - 1).toFixed(2),
    line: `Supply: ${regen}/s trickle, +${S.perRaze} per emplacement razed, +${S.perSlain} per defender slain, +${S.stageGrant} when a stronghold falls and ${Math.round(S.carry * 100)}% of what is left carries over.`,
    growth: `Each stronghold is ${Math.round((ASSAULT.scale - 1) * 100)}% stronger than the last (×${Math.pow(ASSAULT.scale, st - 1).toFixed(2)} at stronghold ${st}).`,
  };
}

// ---------- RD-02 / BZ-02 · where the points came from ----------
export function raidBreakdown(run) {
  if (!run) return null;
  const clock = Math.max(0, run.clock || 0), keep = Math.max(0, Math.min(1, run.keepPct ?? 0));
  const score = Math.round(run.score || 0);
  if (run.victory) {
    const time = Math.round(5 * Math.max(0, RAID.limit - clock)), keepPts = Math.round(500 * keep);
    return { win: true, total: score, max: RAID_MAX, rows: [
      { label: 'Camp taken', pts: 1000 }, { label: `Time left (${clockStr(RAID.limit - clock)})`, pts: time }, { label: `Keep intact (${Math.round(keep * 100)}%)`, pts: keepPts }] };
  }
  const razedPts = Math.min(score, 25 * (run.razed || 0)), fort = Math.max(0, score - razedPts);
  return { win: false, total: score, max: RAID_MAX, capped: score >= 900, rows: [
    { label: `Fortress damaged`, pts: fort }, { label: `Emplacements razed (${run.razed || 0})`, pts: razedPts }] };
}
export function blitzBreakdown(run) {
  if (!run) return null;
  const clock = Math.max(0, run.clock || 0), score = Math.round(run.score || 0);
  if (run.victory) return { win: true, total: score, max: BLITZ_MAX, rows: [
    { label: 'All three camps taken', pts: 5000 }, { label: `Under ten minutes (${clockStr(600 - clock)} to spare)`, pts: Math.round(10 * Math.max(0, 600 - clock)) }] };
  const taken = Math.max(0, run.taken || 0), campPts = Math.min(score, 1200 * taken);
  return { win: false, total: score, max: BLITZ_MAX, capped: score >= 4500, rows: [
    { label: `Camps taken (${taken} of ${BLITZ.camps})`, pts: campPts }, { label: `Emplacements razed (${run.razed || 0})`, pts: Math.max(0, score - campPts) }] };
}
export const breakdownLine = (b) => !b ? '' : !b.rows.some((r) => r.pts > 0) ? `No points scored; a full ${b.win ? 'run' : 'clear'} can reach ${num(b.max)}.` : `${b.rows.filter((r) => r.pts > 0).map((r) => `${r.label} ${num(r.pts)}`).join(' + ')} = ${num(b.total)} of a possible ${num(b.max)}.`;

// RD-06 · a raid done right
export function raidChecklist(run) {
  if (!run) return [];
  return [
    { text: 'Take the camp', done: !!run.victory },
    { text: 'Under three minutes', done: !!run.victory && (run.clock || 0) <= 180 },
    { text: 'Keep above 75%', done: !!run.victory && (run.keepPct ?? 0) >= 0.75 },
    { text: 'Raze ten emplacements', done: (run.razed || 0) >= 10 },
  ];
}

// ---------- RD-04 · when the day turns over ----------
export function nextSetupIn(now = Date.now(), dayKey = realmDay(new Date(now))) {
  const ms = Math.max(0, realmDayEnd(dayKey) - now), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return { ms, text: h >= 1 ? `${h}h ${m}m` : `${m}m` };
}

// ---------- RD-05 / BZ-03 · a short run of results ----------
export function blitzHistory(weeks = {}, thisWeek, n = 6) {
  const keys = Object.keys(weeks).sort().filter((k) => k <= thisWeek).slice(-n);
  return keys.map((k) => ({ week: k, win: !!weeks[k].win, clock: weeks[k].clock || 0, score: weeks[k].score || 0 }));
}
export function historyLine(hist) {
  const tried = hist.filter((d) => d.tried !== false);
  if (!tried.length) return '';
  const wins = tried.filter((d) => d.win).length, best = Math.max(...tried.map((d) => d.score || 0));
  return `${plural(tried.length, 'try', 'tries')} lately, ${wins} taken · best ${num(best)}`;
}

// ---------- CQ-01 / CQ-05 / CQ-06 · what a province asks ----------
export function conquestDifficulty(C, heldWon = 0) {
  if (!C) return null;
  const ring = Math.max(1, C.ring | 0), stage = C.stage || ring + 1;
  const label = ring <= 1 ? 'Easy' : ring === 2 ? 'Fair' : ring === 3 ? 'Hard' : 'Brutal';
  return { ring, stage, label, scale: +Math.pow(ASSAULT.scale, stage - 1).toFixed(2), won: heldWon, of: MAX_PROVINCES,
    line: `${label} · ring ${ring}, camps at stronghold ${stage} strength (×${Math.pow(ASSAULT.scale, stage - 1).toFixed(2)}) · ${heldWon} of ${MAX_PROVINCES} provinces stormed.` };
}
// AS-04 · a column that suits the land's emplacements
const EMPL_NOTES = {
  archer: 'mantlets shrug off arrows', ballista: 'mantlets and knights take bolts best', barracks: 'cavalry and knights beat the garrison',
  cannon: 'spread the column wide: cannon splash punishes clumps', mage: 'footmen and knights are cheap to spare against magic', flak: 'ground troops over engines',
  catapult: 'catapults of your own outrange them', frost: 'knights keep fighting when slowed', tesla: 'spread out: lightning jumps between troops',
  gatling: 'mantlets and knights absorb gatling fire',
};
export function suggestColumn(empl = []) {
  const notes = empl.map((e) => EMPL_NOTES[e]).filter(Boolean);
  const wants = new Set(['footman']);
  for (const e of empl) {
    if (['archer', 'ballista', 'gatling'].includes(e)) wants.add('mantlet');
    if (['cannon', 'tesla', 'mage'].includes(e)) { wants.add('knight'); wants.add('sapper'); }
    if (['barracks'].includes(e)) wants.add('cavalry');
    if (['catapult', 'flak'].includes(e)) wants.add('bombard');
    if (['frost'].includes(e)) wants.add('knight');
  }
  wants.add('ram');
  return { units: AUNIT_ORDER.filter((u) => wants.has(u)), notes };
}

// ---------- WA-06 · you against the column ----------
export function warriorShare(run) {
  const mine = run?.champ?.kos || 0, all = run?.slain || 0;
  if (!run?.champ || !all) return null;
  const pc = Math.min(100, Math.round(100 * mine / all));
  return { mine, all, pct: pc, line: `You cut down ${num(mine)} of the ${num(all)} defenders slain (${pc}%); your column did the rest.` };
}

// ---------- WL-12 / WL-14 · the Warlord tent ----------
export function techSummary(g) {
  const ids = WARLORD_TECH;
  let spent = 0, left = 0, maxed = 0;
  for (const id of ids) {
    const costs = WARLORD.tech[id].cost, lv = g.tech?.[id] || 0;
    for (let i = 0; i < costs.length; i++) { if (i < lv) spent += costs[i]; else left += costs[i]; }
    if (lv >= costs.length) maxed++;
  }
  return { spent, left, maxed, total: ids.length, line: `${num(spent)} supply spent, ${num(left)} still to buy · ${maxed}/${ids.length} fully upgraded` };
}
