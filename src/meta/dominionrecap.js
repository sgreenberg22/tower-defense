// v1.65 · Pure helpers for Dominion and Sea Siege. No DOM: the screens draw what these return, and
// tests/dominion-sea-qol.test.mjs pins it.
import * as D from '../game/dominion.js';
import { NAVAL } from '../game/naval.js';
import { TOWERS } from '../data/balance.js';

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// ---------- DM-04 · what you are about to leave undone ----------
export function endTurnWarnings(s) {
  if (!s || s.over || s.battle) return [];
  const out = [];
  if (s.threat) out.push(`${D.lordName(s.threat.faction)} is marching on ${s.provs[s.threat.prov].name} and nobody has answered.`);
  if (s.armies > 0) {
    const ripe = D.borders(s).filter((id) => !D.canAttack(s, id));
    if (ripe.length) out.push(`${plural(s.armies, 'army', 'armies')} unused with ${plural(ripe.length, 'province')} you could attack.`);
  }
  if (s.orders > 0) {
    const free = D.yours(s).some((p) => p.buildings.length < D.slotsOf(p) && Object.keys(D.BUILDINGS).some((b) => !D.canBuild(s, p.id, b)));
    if (free) out.push(`${plural(s.orders, 'order')} unused and a province has a free building slot.`);
  }
  const cheapest = Math.min(...D.TECH_ORDER.filter((t) => !D.canResearch(s, t)).map((t) => D.techCost(s, t)));
  if (Number.isFinite(cheapest) && s.lore >= cheapest * 1.5) out.push(`${s.lore} lore is unspent; a technology costs ${cheapest}.`);
  if (s.policies.length < D.policySlots(s) && s.gold >= D.POLICY_COST && s.policyTurn !== s.turn) out.push('A policy slot stands empty.');
  if (s.dilemma) out.push('A choice still waits for you.');
  if (s.envoys?.length) out.push(`${plural(s.envoys.length, 'envoy')} still await an answer.`);
  return out;
}

// ---------- DM-21 · a treaty or alliance about to lapse ----------
export function treatyReminders(s, within = 2) {
  if (!s || s.over) return [];
  const out = [];
  for (const f of D.alive(s)) {
    if (f.stance === 'peace' && f.treaty > s.turn && f.treaty - s.turn <= within) out.push({ who: f.id, kind: 'treaty', turns: f.treaty - s.turn, text: `Your treaty with ${D.lordName(f.id)} ends in ${plural(f.treaty - s.turn, 'turn')}.` });
  }
  if (s.allianceRun > 0 && s.allianceRun < D.DOMINION.allyTurns) out.push({ who: null, kind: 'alliance', turns: D.DOMINION.allyTurns - s.allianceRun, text: `Grand Alliance: ${D.DOMINION.allyTurns - s.allianceRun} more turn${D.DOMINION.allyTurns - s.allianceRun === 1 ? '' : 's'} to hold it.` });
  return out;
}

// ---------- DM-25 · the next few seasons ----------
export function seasonStrip(turn, n = 6) {
  const out = [];
  for (let i = 0; i < n; i++) { const t = turn + i, se = D.seasonOf(t); out.push({ turn: t, id: se.id, icon: se.icon, name: se.name, desc: se.desc, change: i > 0 && D.seasonOf(t - 1).id !== se.id }); }
  return out;
}
export function nextSeason(turn) {
  for (let i = 1; i <= 4; i++) { const t = turn + i; if (D.seasonOf(t).id !== D.seasonOf(turn).id) return { in: i, turn: t, season: D.seasonOf(t) }; }
  return null;
}

// ---------- DM-16 · what a policy would change before you pay for it ----------
export function policyPreview(s, id) {
  const P = D.POLICIES[id];
  if (!P) return null;
  const before = D.income(s), on = D.policyOn(s, id);
  const saved = s.policies;
  s.policies = on ? saved.filter((x) => x !== id) : [...saved, id];
  let after;
  try { after = D.income(s); } finally { s.policies = saved; }
  const d = { gold: after.net - before.net, levy: after.levy - before.levy, lore: after.lore - before.lore };
  const sign = (n) => (n > 0 ? '+' : '') + n;
  return { id, on, delta: d, line: `${on ? 'Repealing' : 'Adopting'} ${P.name}: gold ${sign(d.gold)}, levies ${sign(d.levy)}, lore ${sign(d.lore)} a turn${on ? '' : ` (costs ${D.POLICY_COST} gold)`}.` };
}

// ---------- DM-08 · provinces about to revolt ----------
export function unrestWatch(s, from = 60) {
  if (!s) return [];
  return D.yours(s).filter((p) => p.unrest >= from).sort((a, b) => b.unrest - a.unrest).map((p) => {
    const fixes = [];
    if (!p.buildings.includes('temple') && D.BUILDINGS.temple) fixes.push('build a temple');
    if ((p.garrison || 0) < D.GARRISON_MAX) fixes.push('station a garrison');
    if (s.tax !== 'low') fixes.push('lower the tax');
    return { id: p.id, name: p.name, unrest: p.unrest, revolt: p.unrest >= D.DOMINION.revolt, fixes, line: `${p.name} (${p.unrest}${p.unrest >= D.DOMINION.revolt ? ', may revolt' : ''}): ${fixes.join(', ') || 'hold on'}.` };
  });
}

// ---------- DM-34 / DM-35 · how the campaign scored ----------
export function scoreBreakdown(s) {
  if (!s) return null;
  const land = D.yours(s), r = s.stats || {};
  const rows = [
    { label: `Provinces (${land.length})`, pts: land.length * 5 },
    { label: 'Development', pts: land.reduce((a, p) => a + p.dev, 0) * 2 },
    { label: `Technologies (${s.techs?.length || 0})`, pts: (s.techs?.length || 0) * 4 },
    { label: `Wonders (${D.wondersOf(s).length})`, pts: D.wondersOf(s).length * 25 },
    { label: 'Battles won', pts: (r.won || 0) * 2 },
    { label: 'Held against attack', pts: (r.held || 0) * 6 },
  ].filter((x) => x.pts > 0);
  const total = s.over?.score ?? rows.reduce((a, b) => a + b.pts, 0);
  return { rows, total, line: rows.map((x) => `${x.label} ${x.pts}`).join(' + ') };
}
export function campaignStats(s) {
  if (!s) return [];
  const r = s.stats || {};
  const broken = (s.factions || []).filter((f) => !f.alive).length;
  return [
    `Battles: ${r.won || 0} won, ${r.lost || 0} lost, ${r.auto || 0} auto-resolved`,
    `Provinces: ${r.taken || 0} taken, ${r.settled || 0} settled, ${r.razed || 0} capitals stormed, ${r.revolts || 0} revolts`,
    `Defence: ${r.held || 0} attacks held`,
    `Rivals broken: ${broken} of ${(s.factions || []).length}`,
    `Turn ${s.turn}${s.over ? ` · ${s.over.won ? 'won' : 'lost'}` : ''}`,
  ];
}

// ---------- DM-39 · what a battle will throw at you ----------
export function battleBrief(s, id, kind = 'attack') {
  const B = D.battleSetup(s, id, kind);
  const foe = B.foe ? D.lordName(B.foe) : 'the wild';
  return { waves: B.waves, startWave: B.startWave, foe, terrain: B.terrain, line: `${B.waves} waves from wave ${B.startWave} against ${foe} (${B.terrain}); ${B.cost ? `costs ${B.cost} levies` : 'no levy cost'}.` };
}

// ---------- Sea Siege ----------
// SS-03: what a tower does to a hull
export function navalHullNote(type) {
  const m = NAVAL.vs[type];
  if (m == null) return '';
  return m > 1 ? `${m}× vs ships` : `${m}× vs ships (weak)`;
}
export function navalTowerTitle(type) {
  const n = navalHullNote(type);
  return n ? `${TOWERS[type]?.name || type}: ${n}` : '';
}
// SS-01: the hulls of a wave. Galleys and carracks are fixed by the wave number; the longships and cogs depend on the crowd.
export function fleetForecast(wave, foot = 0, cargo = 4) {
  const w = Math.max(1, wave | 0);
  const galleys = w >= NAVAL.galleyFrom ? Math.min(5, 1 + Math.floor((w - NAVAL.galleyFrom) / NAVAL.galleyEvery)) : 0;
  const carracks = w >= NAVAL.carrackFrom ? Math.min(4, 1 + Math.floor((w - NAVAL.carrackFrom) / NAVAL.carrackEvery)) : 0;
  const carriers = foot > 0 ? Math.max(1, Math.ceil(foot / Math.max(1, cargo))) : 0;
  const cogs = w >= NAVAL.cogFrom ? Math.floor(carriers / 2) : 0;
  const longships = Math.max(0, carriers - cogs);
  const parts = [];
  if (longships) parts.push(plural(longships, 'longship'));
  if (cogs) parts.push(plural(cogs, 'cog'));
  if (galleys) parts.push(plural(galleys, 'fire galley', 'fire galleys'));
  if (carracks) parts.push(plural(carracks, 'war carrack'));
  return { longships, cogs, galleys, carracks, line: parts.length ? `Fleet: about ${parts.join(', ')}.` : '' };
}
// SS-10: the sea line on the summary
export function seaLine(sea) {
  if (!sea || !sea.ships) return '';
  const bits = [`🌊 ${plural(sea.sunk || 0, 'ship')} sunk of ${sea.ships}`];
  if (sea.drowned) bits.push(`${plural(sea.drowned, 'crewman', 'crew')} drowned`);
  if (sea.landed) bits.push(`${sea.landed} waded ashore`);
  if (sea.shelled) bits.push(`${plural(sea.shelled, 'shell')} hit your keep`);
  if (sea.bestSink >= 3) bits.push(`best sinking took ${sea.bestSink} with it`);
  return bits.join(' · ') + '.';
}
