// World Stats: what the whole Realm builds, picks and kills with. Numbers come from the server (GET /world), counted from every
// finished, accepted run. Ranked bars throughout: the bar is the size of the thing, the text beside it is always the number.
import { h, fmt } from './dom.js';
import { drawIcon } from '../game/render.js';
import { ENEMIES, BOSSES } from '../data/balance.js';
import { summarizeWorld } from '../game/worldstats.js';
import { mapThumb } from './screens.js';

const screen = () => document.getElementById('screen');
const P = (x) => (x >= 0.995 ? '100%' : x >= 0.1 ? Math.round(x * 100) + '%' : x > 0 ? (Math.round(x * 1000) / 10) + '%' : '0%');
const TABS = [['overview', '🌍 Overview'], ['towers', '🏰 Towers'], ['hero', '🏹 Hero & Arts'], ['boons', '📜 Boons'], ['foes', '👹 Foes'], ['lands', '🗺 Lands & Rules']];
const RARITY_ICON = { common: '⚪', rare: '🔵', epic: '🟣' };
const WEAPON_ICON = { longbow: '🏹', crossbow: '🎯', javelin: '🔥', wand: '🔮', repeater: '⚙️', handcannon: '💥' };
const TOWER_METRICS = [['kills', 'Kills'], ['dmg', 'Damage'], ['used', 'Most used'], ['eff', 'Per tower']];

function ago(ms) {
  if (!ms) return 'not yet';
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

// One ranked row: a picture, a name, a number, a bar and a line of detail. `frac` is the bar (0–1).
function rankRow({ pic, name, value, frac, sub, tip, chips }) {
  return h('div', { class: 'wrow', title: tip || null },
    pic ? h('div', { class: 'wr-pic' }, pic) : null,
    h('div', { class: 'wr-main' },
      h('div', { class: 'wr-top' }, h('b', {}, name), h('span', { class: 'wr-val' }, value)),
      h('div', { class: 'wbar', role: 'img', 'aria-label': `${name}: ${value}` }, h('i', { style: { width: Math.max(frac > 0 ? 1.5 : 0, Math.min(100, frac * 100)) + '%' } })),
      sub ? h('small', { class: 'muted' }, sub) : null,
      chips && chips.length ? h('div', { class: 'wr-chips' }, chips) : null));
}
const towerPic = (id) => { const c = h('canvas'); drawIcon(c, 'tower', id, { size: 44 }); return c; };
const foePic = (f) => {
  const c = h('canvas');
  if (f.boss) drawIcon(c, 'enemy', 'boss:' + f.id, { def: BOSSES.find((b) => b.id === f.id), size: 44 });
  else drawIcon(c, 'enemy', f.id, { def: ENEMIES[f.id], size: 44 });
  return c;
};
const glyph = (g) => h('span', { class: 'wr-glyph', 'aria-hidden': 'true' }, g);
const plaque = (title, note, ...kids) => h('div', { class: 'plaque wsec' }, h('h3', { style: { marginTop: 0 } }, title), note ? h('p', { class: 'muted wnote' }, note) : null, ...kids);
const stat = (v, l) => h('div', { class: 'kpi' }, h('b', {}, v), h('span', {}, l));
const empty = (t) => h('div', { class: 'empty' }, t);

// ---------- the tabs ----------
function overview(app, d, S) {
  const t = S.totals, src = S.sources;
  const rows = S.towers.slice(0, 7).map((x) => ({ name: x.name, kills: x.kills, pic: towerPic(x.id), sub: `${P(x.killShare)} of all kills` }));
  if (src.handKills) rows.push({ name: 'You, with your own weapon', kills: src.handKills, pic: glyph('🏹'), sub: `${P(t.heroKillShare)} of all kills` });
  const other = t.kills - src.towerKills - src.handKills;
  if (other > t.kills * 0.01) rows.push({ name: 'Soldiers, traps and the rest', kills: other, pic: glyph('⚔'), sub: `${P(other / t.kills)} of all kills` });
  rows.sort((a, b) => b.kills - a.kills);
  const top = rows[0]?.kills || 1;
  const maxHist = Math.max(0.0001, ...S.hist.map((x) => x.share));
  const people = d.people || {};
  return [
    h('div', { class: 'kpis' },
      stat(fmt(t.runs), 'Runs counted'), stat(fmt(t.kills), 'Enemies slain'), stat(P(t.heroKillShare), 'Killed by hand'),
      stat(fmt(t.waves), 'Waves held'), stat(fmt(t.bosses), 'Bosses felled'), stat(fmt(t.built), 'Towers built'),
      stat(t.hours >= 100 ? fmt(Math.round(t.hours)) + 'h' : t.hours + 'h', 'Time defended'), stat(t.avgWave || '—', 'Average wave'),
      people.citizens != null ? stat(fmt(people.citizens), 'Citizens') : null, people.activeWeek != null ? stat(fmt(people.activeWeek), 'Active this week') : null),
    plaque('Who lands the killing blow?', 'Share of every enemy slain, by who struck it down.',
      rows.length ? rows.slice(0, 9).map((r) => rankRow({ pic: r.pic, name: r.name, value: fmt(r.kills), frac: r.kills / top, sub: r.sub })) : empty('No kills counted yet.')),
    plaque('How deep do runs go?', 'The wave each run ended on. Share of all runs.',
      h('div', { class: 'whist', role: 'list' }, S.hist.map((x) => h('div', { class: 'wh-col', role: 'listitem', title: `${fmt(x.runs)} runs (${P(x.share)}) ended on waves ${x.label}` },
        h('span', { class: 'wh-v' }, x.runs ? P(x.share) : ''), h('div', { class: 'wh-track' }, h('i', { style: { height: (x.runs ? Math.max(3, (x.share / maxHist) * 100) : 0) + '%' } })), h('span', { class: 'wh-l' }, x.label))))),
  ];
}

function towersTab(app, d, S) {
  const metric = app.worldMetric || 'kills';
  const mine = app.profile.stats?.builtByTower || {};
  const mineTotal = Object.values(mine).reduce((a, n) => a + n, 0);
  const val = { kills: (x) => x.kills, dmg: (x) => x.dmg, used: (x) => x.pick, eff: (x) => x.killsPerTower }[metric];
  const list = S.towers.filter((x) => x.built > 0 || x.kills > 0).slice().sort((a, b) => val(b) - val(a));
  const top = Math.max(1e-9, ...list.map(val));
  const specsFor = (id) => S.specs.filter((s) => s.tower === id).slice(0, 3);
  const rows = list.map((x) => {
    const m = mineTotal ? (mine[x.id] || 0) / mineTotal : null;
    const sub = {
      kills: `${P(x.killShare)} of all kills · built in ${P(x.pick)} of runs`,
      dmg: `${P(x.dmgShare)} of all damage · ${fmt(x.kills)} kills`,
      used: `${fmt(x.built)} built · ${x.runs ? (x.built / x.runs).toFixed(1) : '0'} per run that used it`,
      eff: `${fmt(x.dmgPerTower)} damage per tower built · built in ${P(x.pick)} of runs`,
    }[metric];
    const value = { kills: fmt(x.kills), dmg: fmt(x.dmg), used: P(x.pick), eff: fmt(x.killsPerTower) + ' each' }[metric];
    const frac = metric === 'used' ? x.pick : val(x) / top;
    const specs = specsFor(x.id).map((s) => h('span', { class: 'chip', title: `${fmt(s.runs)} runs picked ${s.name} on the ${x.name}` }, `${s.name} ${P(s.share)}`));
    const you = m ? `You: ${P(m)} of your builds · Realm: ${P(x.buildShare)}` : null;
    return rankRow({ pic: towerPic(x.id), name: x.name, value, frac, sub: you ? sub + ' · ' + you : sub, chips: specs });
  });
  const metricBtns = h('div', { class: 'tabs wmetric', role: 'tablist', 'aria-label': 'Rank towers by' }, TOWER_METRICS.map(([id, l]) => h('button', { class: 'btn small', role: 'tab', 'aria-selected': String(id === metric), onclick: () => { app.worldMetric = id; rerender(app); } }, l)));
  return [plaque('Towers of the Realm', 'Pick a measure. Chips show the specializations chosen for that tower, as a share of the runs that built it.', metricBtns, rows.length ? rows : empty('No tower data yet.')),
    S.specs.length ? plaque('Favourite specializations', 'Most chosen at tier 5, across every tower.', S.specs.slice(0, 8).map((s) => rankRow({ pic: towerPic(s.tower), name: `${s.towerName}: ${s.name}`, value: fmt(s.runs), frac: s.runs / S.specs[0].runs, sub: `${P(s.shareOfRuns)} of all runs · ${P(s.share)} of runs with a ${s.towerName}` }))) : null];
}

function heroTab(app, d, S) {
  const t = S.totals;
  return [
    plaque('Weapons', 'Which hero weapon runs start with, and how far they get.',
      S.weapons.length ? S.weapons.map((x) => rankRow({ pic: glyph(WEAPON_ICON[x.id] || '🏹'), name: x.name, value: P(x.share), frac: x.share, sub: `${fmt(x.runs)} runs · average wave ${x.avgWave.toFixed(1)} · ${fmt(x.heroKillsPerRun)} hand kills per run` })) : empty('No weapon data yet.')),
    plaque('Castle Arts', 'Share of runs that cast each art at least once, and how often.',
      S.arts.length ? S.arts.map((x) => rankRow({ pic: glyph(x.icon), name: x.name, value: P(x.share), frac: x.share, sub: `${fmt(x.uses)} casts · ${x.perRun.toFixed(1)} per run that used it` })) : empty('No Castle Art data yet.')),
    t.runs ? h('div', { class: 'plaque wsec trim' }, h('b', {}, `Your own hand struck ${P(t.heroKillShare)} of all kills and dealt ${P(t.heroDmgShare)} of all damage.`)) : null,
  ];
}

function boonsTab(app, d, S) {
  const all = !!app.worldAllBoons;
  const list = all ? S.boons : S.boons.slice(0, 12);
  const least = S.boons.length > 12 ? S.boons.slice(-5).reverse() : [];
  const top = S.boons[0]?.runs || 1;
  const row = (x) => rankRow({ pic: glyph(RARITY_ICON[x.rarity] || '📜'), name: x.name, value: P(x.share), frac: x.runs / top, sub: `${x.desc} Taken in ${fmt(x.runs)} runs · ${x.avgStacks.toFixed(1)} stacks on average.` });
  return [
    plaque('Boons the Realm picks', 'Share of runs that took each boon at least once.', list.length ? list.map(row) : empty('No boon data yet.'),
      S.boons.length > 12 ? h('button', { class: 'btn small ghost', onclick: () => { app.worldAllBoons = !all; rerender(app); } }, all ? 'Show fewer' : `Show all ${S.boons.length}`) : null),
    !all && least.length ? plaque('Rarely chosen', 'The five boons the Realm leaves on the table.', least.map(row)) : null,
  ];
}

function foesTab(app, d, S) {
  const reg = S.foes.filter((f) => !f.boss), boss = S.foes.filter((f) => f.boss);
  const total = S.foes.reduce((a, f) => a + f.kills, 0);
  const top = reg[0]?.kills || 1, bt = boss[0]?.kills || 1;
  return [
    plaque('What the Realm kills', 'Enemies defeated, by kind.', reg.length ? reg.slice(0, 20).map((f) => rankRow({ pic: foePic(f), name: f.name, value: fmt(f.kills), frac: f.kills / top, sub: `${P(f.share)} of ${fmt(total)} counted kills` })) : empty('No kill data yet.')),
    plaque('Bosses felled', null, boss.length ? boss.map((f) => rankRow({ pic: foePic(f), name: f.name, value: fmt(f.kills), frac: f.kills / bt })) : empty('No bosses felled yet.')),
  ];
}

function landsTab(app, d, S) {
  const asc = S.ascs.filter((x) => x.runs > 0);
  const aTop = Math.max(1e-9, ...asc.map((x) => x.share));
  const mTop = S.mods[0]?.share || 1;
  return [
    plaque('Battlefields', 'Where runs are fought, how far they get, and the deepest wave anyone has held there.',
      S.maps.length ? S.maps.map((x) => { const c = mapThumb(x.id, 'preview', 88); c.className = 'wr-map'; return rankRow({ pic: c, name: x.name, value: P(x.share), frac: x.share, sub: `${fmt(x.runs)} runs · average wave ${x.avgWave.toFixed(1)} · deepest ${x.bestWave}` }); }) : empty('No battlefield data yet.')),
    plaque('Ascension', 'How hard the Realm plays it.', asc.length ? asc.map((x) => rankRow({ pic: glyph(x.level ? '🔥' : '🌱'), name: x.level ? `Ascension ${x.level}` : 'No ascension', value: P(x.share), frac: x.share / aTop, sub: `${fmt(x.runs)} runs · average wave ${x.avgWave.toFixed(1)} · deepest ${x.bestWave}` })) : empty('No ascension data yet.')),
    plaque('Modifiers', 'Share of all runs played with each modifier.', S.mods.length ? S.mods.map((x) => rankRow({ pic: glyph('🎲'), name: x.name, value: P(x.share), frac: x.share / mTop, sub: `${fmt(x.runs)} runs · average wave ${x.avgWave.toFixed(1)}` })) : empty('Modifiers will appear here as runs are counted.')),
    plaque('Game modes', null, S.modes.map((x) => rankRow({ pic: glyph({ normal: '⚔', daily: '📅', challenge: '🎯', march: '🗺' }[x.id]), name: { normal: 'Standard runs', daily: 'Daily challenge', challenge: 'Friend challenges', march: 'Marches on the frontier' }[x.id], value: P(x.share), frac: x.share, sub: `${fmt(x.runs)} runs` }))),
  ];
}

const TAB_FN = { overview, towers: towersTab, hero: heroTab, boons: boonsTab, foes: foesTab, lands: landsTab };

// ---------- the screen ----------
let last = null; // the most recent response, so switching tabs does not refetch

function rerender(app) { if (last) paint(app, last); }

function paint(app, data) {
  const tab = app.worldTab || 'overview';
  const S = summarizeWorld(data.world);
  const period = data.period;
  const wrap = h('div', { class: 'screen-inner world' });
  const head = h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => app.showHome(), 'aria-label': 'Back' }, '← Back'), h('h2', {}, 'World Stats'),
    h('button', { class: 'btn small ghost', onclick: () => worldScreen(app, period), title: 'Fetch the latest tally' }, '↻'));
  const periodBtns = h('div', { class: 'tabs wperiod', role: 'tablist', 'aria-label': 'Period' },
    [['all', 'All time'], ['week', 'This week']].map(([id, l]) => h('button', { class: 'btn small', role: 'tab', 'aria-selected': String(period === id), onclick: () => worldScreen(app, id) }, l)));
  const tabs = h('div', { class: 'tabs cx-tabs wtabs', role: 'tablist' }, TABS.map(([id, l]) => h('button', { class: 'btn small', role: 'tab', 'aria-selected': String(id === tab), onclick: () => { app.worldTab = id; rerender(app); } }, l)));
  const note = h('p', { class: 'muted wnote' },
    S.totals.runs ? `Counted from ${fmt(S.totals.runs)} finished runs ${period === 'week' ? 'this week' : 'since World Stats began'}. Last tallied ${ago(data.updated)}.` : 'Nothing has been counted yet.',
    data.pending ? ` ${fmt(data.pending)} newer run${data.pending === 1 ? '' : 's'} will be added within a few minutes.` : '');
  wrap.append(head, periodBtns, note, tabs, ...[].concat(TAB_FN[tab](app, data, S)).filter(Boolean));
  if (!S.totals.runs) wrap.append(h('div', { class: 'plaque trim' }, h('b', {}, 'The ledger is empty.'), h('p', { class: 'muted', style: { margin: '.3rem 0 0' } }, 'Finish a run while online and it is counted here, along with everyone else\'s: which towers do the killing, what gets picked, how deep the Realm goes.')));
  const s = screen(); const keep = s.scrollTop; s.replaceChildren(wrap); s.scrollTop = keep;
}

export async function worldScreen(app, period = 'all') {
  const wrap = h('div', { class: 'screen-inner world' },
    h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => app.showHome(), 'aria-label': 'Back' }, '← Back'), h('h2', {}, 'World Stats')),
    h('div', { class: 'plaque' }, h('div', { class: 'empty' }, app.api.online === false ? 'World Stats need a connection. You are offline right now.' : 'Counting the Realm…')));
  const s = screen(); s.replaceChildren(wrap); s.scrollTop = 0;
  if (app.api.online === false) return;
  try {
    await app.api.ensureAccount();
    const data = await app.api.world(period);
    last = data;
    if (app.where === 'world') paint(app, data);
  } catch {
    if (app.where !== 'world') return;
    wrap.querySelector('.plaque').replaceChildren(h('div', { class: 'empty' }, 'Could not reach the Realm\'s ledger.'), h('button', { class: 'btn small', onclick: () => worldScreen(app, period) }, 'Try again'));
  }
}
