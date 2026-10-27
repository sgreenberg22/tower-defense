// Dominion: the campaign screen. Tabs for the map, the realm's economy, research, diplomacy, wonders and the nations.
// Rules live in src/game/dominion.js. The campaign is saved on the profile (p.dominion); its battles are ordinary runs
// in the 'dominion' slot, settled back here by settleDominion when they end.
import { h, fmt, toast, modal, confirmBox } from './dom.js';
import { saveProfile, loadRun, clearRun } from '../meta/profile.js';
import { randomSeed } from '../core/rng.js';
import { MAPS } from '../game/maps.js';
import { warlordById } from '../game/living.js';
import { pickLoadout } from './loadout.js';
import * as D from '../game/dominion.js';
import * as MP from './dommap.js';

const {
  DOMINION, SIZES, TURN_LIMITS, DIFFICULTIES, NATIONS, RIVAL_COLORS, TERRAIN, SPECIALS, RESOURCES, BUILDINGS, TECHS, TECH_ORDER, POLICIES, POLICY_COST,
  WONDERS, WONDER_ORDER, VICTORIES, TAX, newCampaign, cleanCampaign, hexCenter, yours, factionOf, lordName, income, provYields, provPower, canAttack,
  battleSetup, beginBattle, applyBattle, autoOdds, autoResolve, ordersPerTurn, armiesPerTurn, attackCost, has, borders, seasonOf,
} = D;

const YOU = '#e2b33c';
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rivalColor = (s, id) => { const i = s.factions.findIndex((f) => f.id === id); return s.factions[i]?.color || RIVAL_COLORS[Math.max(0, i)]; };
const ownerColor = (s, p) => (p.owner === 'you' ? YOU : p.owner ? rivalColor(s, p.owner) : TERRAIN[p.terrain].color);
const ownerName = (p) => (p.owner === 'you' ? 'Yours' : p.owner ? lordName(p.owner) : 'Free land');
const lordIcon = (id) => warlordById(id)?.icon || '👑';
const pct = (x) => `${Math.round(x * 100)}%`;
const relWord = (r) => (r >= 50 ? 'Friendly' : r >= 15 ? 'Warm' : r > -15 ? 'Neutral' : r > -50 ? 'Wary' : 'Hostile');
const STANCE = { war: { label: 'At war', cls: 'war' }, peace: { label: 'At peace', cls: 'peace' }, alliance: { label: 'Allied', cls: 'ally' } };
const TABS = [['map', '🗺', 'Map'], ['realm', '🏛', 'Realm'], ['research', '📜', 'Research'], ['diplomacy', '🕊', 'Diplomacy'], ['wonders', '🏆', 'Wonders'], ['nations', '📊', 'Nations']];

export function loadCampaign(p) { const s = p.dominion ? cleanCampaign(p.dominion) : null; if (!s) p.dominion = null; return s; }

// A battle has ended: settle its province. Returns what happened (for the summary screen) or null.
export function settleDominion(p, summary) {
  const s = loadCampaign(p);
  if (!s || !s.battle || s.battle.seed !== summary.seed) return null;
  const out = applyBattle(s, { victory: !!summary.victory, seed: summary.seed, kills: summary.kills });
  if (out) recordOver(p, s);
  p.dominion = s;
  return out;
}

function recordOver(p, s) {
  if (!s.over || s.over.recorded) return;
  s.over.recorded = true;
  const R = (p.local ||= {}).dominion ||= { runs: 0, best: 0, battles: 0, won: 0, campaigns: 0, wins: 0 };
  R.campaigns = (R.campaigns || 0) + 1;
  if (s.over.won) {
    R.wins = (R.wins || 0) + 1; R.bestTurns = Math.min(R.bestTurns || Infinity, s.over.turn);
    (R.diffWins ||= {})[s.diff] = (R.diffWins[s.diff] || 0) + 1;
    (R.ways ||= {})[s.over.how] = (R.ways[s.over.how] || 0) + 1;
  }
  R.best = Math.max(R.best || 0, s.over.score || 0);
}

export function dominionBestLine(p) {
  const R = p.local?.dominion, s = p.dominion;
  if (s && !s.over) return `In progress · turn ${s.turn} · ${(s.provs || []).filter((x) => x.owner === 'you').length} provinces`;
  if (!R?.campaigns && !R?.battles) return 'New · conquer the land';
  return R.wins ? `${R.wins} war${R.wins === 1 ? '' : 's'} won · fastest ${R.bestTurns} turns` : `${R.won || 0} battles won`;
}

// ---------- the screen ----------
export function dominionScreen(app, opts = {}) {
  app.where = 'dominion';
  const p = app.profile, screen = document.getElementById('screen');
  const s = loadCampaign(p);
  if (!s) return setupScreen(app);
  const ui = app.domUi ||= { sel: s.provs.find((x) => x.capital === 'you')?.id ?? 0, extra: 0, tab: 'map', overlay: 'political' };
  if (!s.provs[ui.sel]) ui.sel = 0;
  const keepY = screen.scrollTop;
  const save = () => { p.dominion = s; recordOver(p, s); saveProfile(p); app.checkAch?.(); };
  const rerender = () => { save(); dominionScreen(app, { keep: true }); };
  const act = (r, ok) => { if (r?.error) { toast(r.error); return false; } if (ok) toast(ok, { ms: 3500 }); rerender(); return true; };
  const ctx = { app, s, ui, act, rerender, save };

  const inc = income(s), season = seasonOf(s.turn);
  const res = (icon, label, v, d, title) => h('div', { class: 'dom-res', title: title || label }, h('span', { 'aria-hidden': 'true' }, icon), h('b', {}, fmt(v)), d != null ? h('small', { class: d < 0 ? 'neg' : '' }, `${d < 0 ? '' : '+'}${d}`) : null, h('span', { class: 'sr' }, ' ' + label));
  const top = h('div', { class: 'dom-top plaque' },
    res('🪙', 'gold', s.gold, inc.net, `Gold: +${inc.gold} income (incl. ${inc.trade} trade), -${inc.upkeep} levy upkeep, -${inc.admin} administration`),
    res('⚔', 'levies', s.levy, inc.levy, `Levies: +${inc.levy} a turn; at most ${D.levyCap(s)} (the rest go home)`),
    res('📜', 'lore', s.lore, inc.lore),
    h('div', { class: 'dom-res orders', title: 'Civil orders left this turn: build, develop, settle, scout, muster, raise wonders' }, h('span', { 'aria-hidden': 'true' }, '🎖'), h('b', {}, `${s.orders}/${ordersPerTurn(s)}`), h('small', {}, 'orders')),
    h('div', { class: 'dom-res orders', title: 'Armies left this turn: each can attack once' }, h('span', { 'aria-hidden': 'true' }, '🚩'), h('b', {}, `${s.armies}/${armiesPerTurn(s)}`), h('small', {}, 'armies')),
    h('span', { class: 'chip season', title: season.desc }, `${season.icon} ${season.name}`),
    h('span', { class: 'spacer' }),
    s.over ? null : h('button', { class: 'btn gold', disabled: !!s.battle, onclick: () => doEndTurn(app, s, save) }, s.orders + s.armies > 0 ? `End turn (${s.orders + s.armies} unused)` : 'End turn ▶'));

  const banners = bannersFor(ctx);
  const tabs = h('div', { class: 'seg dom-tabs', role: 'tablist' }, TABS.map(([id, icon, name]) => h('button', { role: 'tab', 'aria-selected': String(ui.tab === id), class: ui.tab === id ? 'on' : '', onclick: () => { ui.tab = id; dominionScreen(app); } },
    h('span', { 'aria-hidden': 'true' }, icon), ' ', name, id === 'diplomacy' && s.envoys.length ? h('b', { class: 'dot' }, String(s.envoys.length)) : null, id === 'research' && TECH_ORDER.some((t) => !D.canResearch(s, t)) ? h('b', { class: 'dot' }, '•') : null)));
  const body = ui.tab === 'realm' ? realmTab(ctx) : ui.tab === 'research' ? researchTab(ctx) : ui.tab === 'diplomacy' ? diplomacyTab(ctx) : ui.tab === 'wonders' ? wondersTab(ctx) : ui.tab === 'nations' ? nationsTab(ctx) : mapTab(ctx);

  screen.replaceChildren(h('div', { class: 'screen-inner dominion' },
    h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => app.showHome(), 'aria-label': 'Back' }, '← Home'),
      h('h2', { class: 'dom-title' }, `👑 Turn ${s.turn}${s.turnLimit ? `/${s.turnLimit}` : ''}`), h('span', { class: 'spacer' }), h('button', { class: 'btn small ghost', onclick: () => helpModal() }, 'How to play')),
    top, ...banners, tabs, body));
  if (opts.keep) screen.scrollTop = keepY;
  if (opts.flash) toast(opts.flash, { ms: 5000 });
}

function bannersFor({ app, s, ui, act, rerender }) {
  const out = [];
  if (s.over) {
    const V = VICTORIES[s.over.how];
    out.push(h('div', { class: 'plaque dom-over ' + (s.over.won ? 'won' : 'lost') },
      h('h3', {}, s.over.won ? `${V.icon} ${V.name} victory on turn ${s.over.turn}!` : s.over.how === 'capital' ? '💀 Your capital has fallen. The war is lost.' : `${lordIcon(s.over.by)} ${lordName(s.over.by)} wins the ${V?.name || ''} victory on turn ${s.over.turn}.`),
      h('p', {}, `Score ${fmt(s.over.score)} · ${DIFFICULTIES[s.diff].name} · ${SIZES[s.size].name} map · ${s.stats.won} battles won, ${s.stats.held} held, ${s.stats.lost} lost, ${s.stats.settled} settled.`),
      h('div', { class: 'row' }, h('button', { class: 'btn gold', onclick: () => { app.profile.dominion = null; saveProfile(app.profile); app.domUi = null; setupScreen(app); } }, 'A new war'))));
    return out;
  }
  if (s.battle) {
    const B = s.battle, sv = loadRun('dominion');
    const live = sv && sv.dominion && sv.seed === B.seed;
    out.push(h('div', { class: 'plaque dom-threat' },
      h('b', {}, `⚔ The battle for ${s.provs[B.prov].name} is under way.`), h('span', { class: 'muted' }, ` Hold ${B.waves} waves to ${B.kind === 'defend' ? 'keep it' : 'take it'}.`),
      h('div', { class: 'row' },
        live ? h('button', { class: 'btn gold', onclick: () => app.resumeRun(sv) }, '▶ Continue the battle') : h('button', { class: 'btn gold', onclick: () => launch(app, s, B.prov, B.kind, true) }, '⚔ To the field'),
        h('button', { class: 'btn ghost', onclick: async () => { if (await confirmBox(`Concede the battle for ${s.provs[B.prov].name}? It counts as a defeat.`, 'Concede', true)) { clearRun('dominion'); applyBattle(s, { victory: false }); rerender(); } } }, 'Concede'))));
    return out;
  }
  if (s.threat) {
    const T = s.threat, tp = s.provs[T.prov], B = battleSetup(s, T.prov, 'defend');
    const odds = autoOdds(s, T.prov, ui.extra, 'defend');
    out.push(h('div', { class: 'plaque dom-threat' },
      h('b', {}, `🔥 ${lordName(T.faction)} marches on ${tp.name}!`), h('span', { class: 'muted' }, ` Strength ${T.power}. Answer it this turn: an unanswered attack is fought without you when the turn ends.`),
      h('div', { class: 'row' },
        h('button', { class: 'btn gold', onclick: () => launch(app, s, T.prov, 'defend') }, `⚔ Defend it (hold ${B.waves} waves from wave ${B.startWave})`),
        h('button', { class: 'btn', onclick: () => { const r = autoResolve(s, T.prov, ui.extra, 'defend'); ui.extra = 0; if (!r.error) toast(r.victory ? `${tp.name} held (${pct(r.odds)} odds).` : `${tp.name} fell (${pct(r.odds)} odds).`, { ms: 4000 }); act(r); } }, `🎲 Auto-resolve · ${pct(odds)}`),
        levyStepper(s, ui, rerender, B.cost),
        tp.capital === 'you' ? null : h('button', { class: 'btn ghost', onclick: () => act(D.yieldProvince(s)) }, 'Yield it'))));
  }
  s.envoys.forEach((e, i) => {
    const who = `${lordIcon(e.from)} ${lordName(e.from)}`;
    const text = e.kind === 'peace' ? `${who} offers peace.` : e.kind === 'trade' ? `${who} proposes a trade agreement (+${D.tradeValue(s)} gold a turn).` : e.kind === 'alliance' ? `${who} proposes an alliance.`
      : e.kind === 'tribute' ? `${who} demands ${e.gold} gold in tribute, or else.` : `${who}, your ally, asks you to join its war on ${lordName(e.target)}.`;
    out.push(h('div', { class: 'plaque dom-envoy' }, h('span', {}, '📜 ', text, h('small', { class: 'muted' }, ' Answer this turn.')),
      h('span', { class: 'row' }, h('button', { class: 'btn small gold', onclick: () => act(D.answerEnvoy(s, i, true)) }, e.kind === 'tribute' ? `Pay ${e.gold}` : e.kind === 'joinwar' ? 'Join the war' : 'Accept'),
        h('button', { class: 'btn small ghost', onclick: () => act(D.answerEnvoy(s, i, false)) }, e.kind === 'tribute' ? 'Refuse' : 'Decline'))));
  });
  return out;
}

// ---------- map ----------
function mapTab(ctx) {
  const { app, s, ui } = ctx;
  const Z = D.sizeOf(s), W = 64, R = W / Math.sqrt(3);
  const pts = (cx, cy) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30); return `${(cx + R * Math.cos(a)).toFixed(1)},${(cy + R * Math.sin(a)).toFixed(1)}`; }).join(' ');
  const maxX = Z.cols + 0.5, maxY = (Z.rows - 1) * 0.866 + 1;
  const front = new Set(borders(s));
  const ov = ui.overlay;
  let svg = '';
  const allPolys = [...(s.lakes || []).map(([lq, lr]) => { const c = hexCenter(lq, lr); return pts(c.x * W, c.y * W); }), ...s.provs.map((q) => { const c = hexCenter(q.q, q.r); return pts(c.x * W, c.y * W); })];
  const VW = Number((maxX * W).toFixed(0)), VH = Number((maxY * W).toFixed(0));
  for (const [lq, lr] of s.lakes || []) {
    const c = hexCenter(lq, lr), near = s.provs.some((x) => x.seen && Math.abs(x.r - lr) <= 1 && Math.abs(x.q - lq) <= 1);
    svg += near ? `<g class="lake"><polygon points="${pts(c.x * W, c.y * W)}"/><text x="${c.x * W}" y="${c.y * W + 2}">${(lq * 7 + lr) % 3 ? '🌊' : '🏔'}</text></g>`
      : `<g class="hex fog lakefog" aria-hidden="true"><polygon points="${pts(c.x * W, c.y * W)}" class="fogfill"/><polygon points="${pts(c.x * W, c.y * W)}" fill="url(#haze)"/><text x="${c.x * W}" y="${c.y * W + 2}" class="hi">?</text></g>`;
  }
  const inset = (cx, cy) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30); return `${(cx + R * 0.84 * Math.cos(a)).toFixed(1)},${(cy + R * 0.84 * Math.sin(a)).toFixed(1)}`; }).join(' ');
  for (const q of s.provs) {
    const c = hexCenter(q.q, q.r), cx = c.x * W, cy = c.y * W;
    const fog = !q.seen;
    const wash = MP.WASH[q.terrain] || '#cbd193', tint = q.owner ? ownerColor(s, q) : null;
    let fill = fog ? '#d9c9a2' : wash, op = 1;
    if (!fog && ov === 'growth') { fill = q.owner === 'you' ? (q.unrest >= DOMINION.unrestHalf ? '#d9473b' : q.unrest >= 25 ? '#e0a03a' : '#7fb24a') : '#c9b88e'; op = q.owner === 'you' ? 0.4 + q.dev * 0.12 : 0.85; }
    if (!fog && ov === 'resources') { fill = TERRAIN[q.terrain].color; op = 0.8; }
    const sel = q.id === ui.sel, threat = s.threat?.prov === q.id || s.battle?.prov === q.id;
    const wonder = WONDER_ORDER.find((w) => s.wonders[w]?.prov === q.id);
    const icon = fog ? '?' : ov === 'resources' ? (q.res ? RESOURCES[q.res].icon : q.special ? SPECIALS[q.special].icon : TERRAIN[q.terrain].icon)
      : ov === 'growth' ? (q.owner === 'you' ? String(q.dev) : '') : q.capital ? (q.capital === 'you' ? '🏰' : lordIcon(q.capital)) : wonder ? WONDERS[wonder].icon : q.buildings[0] ? BUILDINGS[q.buildings[0]].icon : q.res ? RESOURCES[q.res].icon : q.special ? SPECIALS[q.special].icon : TERRAIN[q.terrain].icon;
    const sub = fog ? '' : ov === 'growth' && q.owner === 'you' ? `${'●'.repeat(q.dev)}${q.unrest >= 25 ? ` 🔥${q.unrest}` : ''}` : '';
    svg += `<g class="hex${fog ? ' fog' : ''}${sel ? ' sel' : ''}${threat ? ' threat' : ''}${front.has(q.id) && !fog ? ' front' : ''}${q.owner === 'you' ? ' mine' : ''}" data-id="${q.id}" tabindex="0" role="button" aria-label="${esc(fog ? 'Unexplored land' : `${q.name}, ${ownerName(q)}, ${TERRAIN[q.terrain].name}`)}">`
      + `<polygon points="${pts(cx, cy)}" fill="${fill}" fill-opacity="${op}"/>`
      + (fog ? `<polygon points="${pts(cx, cy)}" fill="url(#haze)" />` : ov === 'political' && tint ? `<polygon points="${pts(cx, cy)}" fill="${tint}" fill-opacity="${q.owner === 'you' ? 0.34 : 0.3}" />` : '')
      + (!fog && ov === 'political' && tint ? `<polygon points="${inset(cx, cy)}" class="own" stroke="${tint}" />` : '')
      + (!fog && ov === 'political' && q.owner && q.owner !== 'you' ? `<polygon points="${pts(cx, cy)}" fill="url(#hatch)" />` : '')
      + (!fog && ov !== 'growth' ? MP.glyphs(q.terrain, cx, cy, q.q, q.r) : '')
      + `<text x="${cx}" y="${cy + 2}" class="hi${ov === 'growth' ? ' num' : ''}">${esc(icon)}</text>`
      + (!fog ? `<text x="${cx}" y="${cy + 21}" class="hn">${esc(sub || (q.name.length > 10 ? q.name.slice(0, 9) + '…' : q.name))}</text>` : '')
      + (!fog && ov === 'political' && q.owner !== 'you' ? `<text x="${cx}" y="${cy - 15}" class="hp">${'◆'.repeat(Math.min(7, provPower(s, q)))}</text>` : '')
      + (!fog && ov === 'political' && q.owner === 'you' && q.unrest >= DOMINION.unrestHalf ? `<text x="${cx + 15}" y="${cy - 13}" class="hu">🔥</text>` : '')
      + '</g>';
  }
  // A margin of open sea all round, with the cartouche and compass sitting in it, so no hex is ever covered.
  const MX = 44, MT = 52, MB = 44, TW = VW + 2 * MX, TH = VH + MT + MB;
  const map = h('div', { class: 'dom-map plaque', html: `<svg style="min-width:${Math.round(TW * 0.72)}px" viewBox="0 0 ${TW} ${TH}" role="group" aria-label="Campaign map">${MP.defs}<g transform="translate(${MX} ${MT})">${MP.sea(allPolys, VW, VH)}${svg}</g>${MP.decor(TW, TH, 'The Dominion War', `Turn ${s.turn} · as surveyed by the Royal Cartographers`)}</svg>` });
  const pickHex = (e) => { const g = e.target.closest('.hex'); if (!g || g.dataset.id == null) return; ui.sel = Number(g.dataset.id); ui.extra = 0; dominionScreen(app, { keep: true }); };
  map.addEventListener('click', pickHex);
  map.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickHex(e); } });
  const overlays = h('div', { class: 'seg dom-overlay' }, [['political', 'Realms'], ['resources', 'Land & resources'], ['growth', 'Growth & unrest']].map(([id, name]) =>
    h('button', { 'aria-pressed': String(ov === id), onclick: () => { ui.overlay = id; dominionScreen(app, { keep: true }); } }, name)));
  const legend = h('div', { class: 'dom-legend muted' }, h('span', {}, h('i', { style: { background: YOU } }), 'You'),
    ...s.factions.map((f) => h('span', { class: f.alive ? '' : 'gone' }, h('i', { style: { background: rivalColor(s, f.id) } }), `${lordIcon(f.id)} ${lordName(f.id)}${f.alive ? ` · ${STANCE[f.stance].label.toLowerCase()}` : ' · broken'}`)),
    h('span', {}, '◆ strength'));
  const log = h('div', { class: 'plaque dom-log' }, h('h3', {}, 'Chronicle'), s.log.slice(0, 8).map((l) => h('div', { class: 'dl ' + l.kind }, h('small', {}, `T${l.turn}`), ' ', l.text)),
    h('button', { class: 'btn small ghost', onclick: () => { ui.tab = 'nations'; dominionScreen(app); } }, 'Full chronicle ›'));
  return h('div', {}, h('div', { class: 'dom-grid' }, h('div', {}, overlays, map, legend), provincePanel(ctx, s.provs[ui.sel])), log);
}

function levyStepper(s, ui, rerender, cost) {
  const max = Math.max(0, s.levy - cost);
  return h('span', { class: 'dom-step', title: 'Extra levies committed to an auto-resolve: each one adds 5% to the odds, and all of them are spent.' },
    h('button', { class: 'btn small ghost', disabled: ui.extra <= 0, 'aria-label': 'Fewer levies', onclick: () => { ui.extra--; rerender(); } }, '−'),
    h('span', {}, `+${ui.extra} levies`),
    h('button', { class: 'btn small ghost', disabled: ui.extra >= max, 'aria-label': 'More levies', onclick: () => { ui.extra++; rerender(); } }, '+'));
}

function provincePanel(ctx, q) {
  const { app, s, ui, act, rerender } = ctx;
  if (!q.seen) return h('div', { class: 'plaque dom-panel' }, h('h3', {}, 'Unexplored land'), h('p', { class: 'muted' }, 'Nobody has mapped it. Scout from a province beside it, take a neighbour, or research Cartography.'));
  const T = TERRAIN[q.terrain], y = provYields(s, q), mine = q.owner === 'you';
  const wonder = WONDER_ORDER.find((w) => s.wonders[w]?.prov === q.id);
  const facts = [
    ['Land', `${T.icon} ${T.name} · ${MAPS[q.map]?.name || q.map}`],
    ['Held by', q.capital ? `${ownerName(q)} (capital)` : ownerName(q)],
    ['Development', `${'●'.repeat(q.dev)}${'○'.repeat(5 - q.dev)}${mine && q.dev < 5 ? ` · grows ${q.grow}/${D.growNeed(q)}` : ''}`],
    ['Yields', `🪙 ${y.gold || 0} · ⚔ ${y.levy || 0} · 📜 ${y.lore || 0}`],
    mine ? ['Unrest', `${q.unrest}${q.unrest >= DOMINION.unrestHalf ? ' · yields halved' : ''}${q.unrest >= DOMINION.revolt ? ' · may revolt!' : ''} (${D.unrestDrift(s, q) >= 0 ? '+' : ''}${D.unrestDrift(s, q)} a turn)`] : null,
    q.res ? ['Resource', `${RESOURCES[q.res].icon} ${RESOURCES[q.res].name}: ${RESOURCES[q.res].desc}`] : null,
    q.special ? ['Landmark', `${SPECIALS[q.special].icon} ${SPECIALS[q.special].name}: ${SPECIALS[q.special].desc}`] : null,
    wonder ? ['Wonder', `${WONDERS[wonder].icon} ${WONDERS[wonder].name}`] : null,
    ['Buildings', q.buildings.length ? q.buildings.map((b) => `${BUILDINGS[b].icon} ${BUILDINGS[b].name}`).join(', ') + ` (${q.buildings.length}/${D.slotsOf(q)})` : `none (${D.slotsOf(q)} slot${D.slotsOf(q) > 1 ? 's' : ''})`],
    !mine ? ['Strength', '◆'.repeat(provPower(s, q)) + ` (${provPower(s, q)})`] : null,
  ].filter(Boolean);
  const kids = [h('h3', {}, q.name), h('div', { class: 'dom-facts' }, facts.map(([k, v]) => h('div', {}, h('span', {}, k), h('b', {}, v))))];
  if (s.over) return h('div', { class: 'plaque dom-panel' }, kids);
  if (!mine) {
    const why = canAttack(s, q.id);
    const B = battleSetup(s, q.id, 'attack');
    const f = q.owner ? factionOf(s, q.owner) : null;
    const settleWhy = !q.owner ? D.canSettle(s, q.id) : 'x';
    kids.push(h('div', { class: 'dom-battle' },
      h('div', { class: 'muted' }, `Battle: hold ${B.waves} waves from wave ${B.startWave} on ${MAPS[B.map]?.name || B.map}${B.foe ? `, against ${lordName(B.foe)}'s host (their favoured foes and rule)` : ''}. Costs ${attackCost(s, q)} levies and an army.`),
      why ? h('div', { class: 'dom-why' }, '⛔ ' + why) : null,
      f && f.stance !== 'war' && f.alive ? h('button', { class: 'btn small red', onclick: async () => { if (await confirmBox(`Declare war on ${lordName(f.id)}?${f.stance === 'alliance' || f.treaty > s.turn ? ' You would break your oath, and every nation will remember.' : ''}`, 'Declare war', true)) act(D.declareWar(s, f.id)); } }, `⚔ Declare war on ${lordName(f.id)}`) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn gold', disabled: !!why, onclick: () => launch(app, s, q.id, 'attack') }, '⚔ Fight the battle'),
        h('button', { class: 'btn', disabled: !!why || s.levy < attackCost(s, q) + ui.extra, onclick: () => { const r = autoResolve(s, q.id, ui.extra); ui.extra = 0; if (!r.error) toast(r.victory ? `${q.name} taken (${pct(r.odds)} odds)${r.eliminated ? ` · ${lordName(r.eliminated)} is broken!` : ''}.` : `Thrown back from ${q.name} (${pct(r.odds)} odds).`, { ms: 4500 }); act(r); } }, `🎲 Auto-resolve · ${pct(autoOdds(s, q.id, ui.extra))}`),
        why ? null : levyStepper(s, ui, rerender, attackCost(s, q))),
      !q.owner ? h('div', { class: 'row' }, h('button', { class: 'btn small', disabled: !!settleWhy, title: settleWhy || '', onclick: () => act(D.settle(s, q.id)) }, `🏡 Settle it · ${D.settleCost(s, q)} 🪙`), settleWhy ? h('small', { class: 'muted' }, settleWhy) : h('small', { class: 'muted' }, 'No battle: an order and gold.')) : null,
      h('div', { class: 'row' }, h('button', { class: 'btn small ghost', disabled: s.orders < 1 && !has(s, 'cartography'), onclick: () => act(D.scout(s, q.id)) }, `🔭 Scout around${has(s, 'cartography') ? ' (free)' : ''}`))));
  } else {
    if (q.buildings.length < D.slotsOf(q)) {
      const opts = Object.entries(BUILDINGS).filter(([b, B]) => !D.hasB(q, b) && (!B.lands || B.lands.includes(q.terrain)) && (!B.needs || has(s, B.needs) || (b === 'harbor' && s.nation === 'river')));
      const later = Object.entries(BUILDINGS).filter(([b, B]) => B.needs && !has(s, B.needs) && !(b === 'harbor' && s.nation === 'river')).map(([, B]) => `${B.icon} ${B.name} (${TECHS[B.needs].name})`);
      kids.push(h('h4', {}, `Build · ${q.buildings.length}/${D.slotsOf(q)} slots (an order)`), h('div', { class: 'dom-builds' }, opts.map(([b, B]) => {
        const why = D.canBuild(s, q.id, b);
        return h('button', { class: 'opt', disabled: !!why, title: why || '', onclick: () => act(D.build(s, q.id, b)) }, h('span', { class: 'box' }, B.icon),
          h('span', {}, h('b', {}, `${B.name} · ${D.buildCost(s, b)} 🪙`), h('small', {}, B.desc)), h('span', {}));
      })), later.length ? h('small', { class: 'muted' }, `Research unlocks more: ${later.join(', ')}.`) : null);
    } else kids.push(h('p', { class: 'muted' }, `Every slot is built. Develop ${q.name} to open another (at development 2 and 4).`));
    kids.push(h('div', { class: 'row' },
      q.dev < 5 ? h('button', { class: 'btn small', disabled: s.orders < 1 || s.gold < D.developCost(s, q), onclick: () => act(D.develop(s, q.id)) }, `📈 Develop · ${D.developCost(s, q)} 🪙`) : null,
      h('button', { class: 'btn small', disabled: s.orders < 1, onclick: () => act(D.muster(s)) }, `📯 Muster (+${D.musterSize(s)} levies)`),
      h('button', { class: 'btn small ghost', disabled: s.orders < 1 && !has(s, 'cartography'), onclick: () => act(D.scout(s, q.id)) }, `🔭 Scout${has(s, 'cartography') ? ' (free)' : ''}`)));
  }
  return h('div', { class: 'plaque dom-panel' }, kids);
}

// ---------- realm ----------
function realmTab({ s, act }) {
  const inc = income(s);
  const line = (k, v, cls = '') => h('div', { class: cls }, h('span', {}, k), h('b', {}, v));
  const treasury = h('div', { class: 'plaque dom-card' }, h('h3', {}, '🪙 Treasury'),
    h('div', { class: 'dom-facts' },
      line('Income from the land', `+${inc.gold - inc.trade}`), line(`Trade (${s.factions.filter((f) => f.alive && f.trade).length} agreement${s.factions.filter((f) => f.alive && f.trade).length === 1 ? '' : 's'})`, `+${inc.trade}`),
      line(`Levy upkeep (${s.levy} levies)`, inc.upkeep ? `-${inc.upkeep}` : '0'), line(`Administration (${yours(s).length} provinces)`, inc.admin ? `-${inc.admin}` : '0'), line('Gold each turn', `${inc.net >= 0 ? '+' : ''}${inc.net}`, 'total'),
      line('Levies each turn', `+${inc.levy} (cap ${D.levyCap(s)})`), line('Lore each turn', `+${inc.lore}`)));
  const tax = h('div', { class: 'plaque dom-card' }, h('h3', {}, '⚖ Taxes'),
    h('div', { class: 'seg' }, Object.entries(TAX).map(([id, T]) => h('button', { 'aria-pressed': String(s.tax === id), onclick: () => act(D.setTax(s, id)) }, T.name))),
    h('p', { class: 'muted' }, `${TAX[s.tax].name}: gold ×${TAX[s.tax].gold}, unrest ${TAX[s.tax].unrest >= 0 ? '+' : ''}${TAX[s.tax].unrest} a turn in every province.`));
  const slots = D.policySlots(s);
  const policies = h('div', { class: 'plaque dom-card' }, h('h3', {}, `📜 Policies · ${s.policies.length}/${slots} slots`),
    h('p', { class: 'muted' }, `Adopting costs ${POLICY_COST} gold, one a turn. Code of Laws and Statecraft open more slots.`),
    h('div', { class: 'opt-list' }, Object.entries(POLICIES).map(([id, P]) => {
      const on = D.policyOn(s, id);
      return h('div', { class: 'opt' + (on ? ' done' : '') }, h('span', { class: 'box' }, P.icon), h('span', {}, h('b', {}, P.name), h('small', {}, P.desc)),
        on ? h('button', { class: 'btn small ghost', onclick: () => act(D.repealPolicy(s, id)) }, 'Repeal')
          : h('button', { class: 'btn small gold', disabled: s.policies.length >= slots || s.gold < POLICY_COST || s.policyTurn === s.turn, onclick: () => act(D.adoptPolicy(s, id)) }, 'Adopt'));
    })));
  const pr = D.marketPrices(s);
  const market = h('div', { class: 'plaque dom-card' }, h('h3', {}, '🏪 Exchange'),
    h('p', { class: 'muted' }, 'Prices climb with every deal this turn, and the seasons move the price of levies. No order needed.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn small', disabled: s.gold < pr.levy, onclick: () => act(D.trade5(s, 'levy')) }, `Hire 5 levies · ${pr.levy} 🪙`),
      h('button', { class: 'btn small', disabled: s.gold < pr.lore, onclick: () => act(D.trade5(s, 'lore')) }, `Hire scholars (+5 📜) · ${pr.lore} 🪙`),
      h('button', { class: 'btn small ghost', disabled: s.levy < 5, onclick: () => act(D.trade5(s, 'sell')) }, `Release 5 levies · +${pr.sell} 🪙`)));
  const held = D.resourcesOf(s);
  const resources = h('div', { class: 'plaque dom-card' }, h('h3', {}, '⛓ Strategic resources'),
    h('div', { class: 'dom-res-list' }, Object.entries(RESOURCES).map(([id, R]) => h('div', { class: held.has(id) ? 'on' : 'off' }, h('span', { class: 'ri' }, R.icon), h('span', {}, h('b', {}, R.name), h('small', {}, R.desc + (held.has(id) ? '' : ` Found on ${R.lands.map((t) => TERRAIN[t].name.toLowerCase()).join(', ')}.`))), h('span', { class: 'chip' }, held.has(id) ? 'Held' : '—')))));
  const nat = NATIONS[s.nation];
  const nation = h('div', { class: 'plaque dom-card' }, h('h3', {}, `${nat.icon} ${nat.name}`), h('p', { class: 'muted' }, nat.desc), h('p', { class: 'muted' }, `${seasonOf(s.turn).icon} ${seasonOf(s.turn).name}: ${seasonOf(s.turn).desc}`));
  const rows = yours(s).sort((a, b) => b.dev - a.dev || a.name.localeCompare(b.name)).map((q) => { const y = provYields(s, q); return h('tr', {}, h('td', {}, q.capital === 'you' ? '🏰 ' + q.name : q.name), h('td', {}, '●'.repeat(q.dev)), h('td', { class: q.unrest >= 50 ? 'neg' : '' }, String(q.unrest)), h('td', {}, `${y.gold}/${y.levy}/${y.lore}`), h('td', {}, q.buildings.map((b) => BUILDINGS[b].icon).join(' ') || '—')); });
  const table = h('div', { class: 'plaque dom-card wide' }, h('h3', {}, `🗺 Your provinces · ${yours(s).length}`),
    h('div', { class: 'dom-table-wrap' }, h('table', { class: 'dom-table' }, h('thead', {}, h('tr', {}, ['Province', 'Dev', 'Unrest', '🪙/⚔/📜', 'Built'].map((t) => h('th', {}, t)))), h('tbody', {}, rows))));
  return h('div', { class: 'dom-cards' }, treasury, tax, nation, policies, market, resources, table);
}

// ---------- research ----------
function researchTab({ s, act }) {
  const tiers = [1, 2, 3, 4].map((tier) => h('div', { class: 'dom-tier' }, h('h4', {}, ['', 'First age', 'Second age', 'Third age', 'The crown of the age'][tier]),
    TECH_ORDER.filter((t) => TECHS[t].tier === tier).map((t) => {
      const T = TECHS[t], why = D.canResearch(s, t), known = has(s, t);
      const rivals = D.alive(s).filter((f) => f.techs.includes(t) && D.met(s, f.id));
      return h('div', { class: 'dom-tech' + (known ? ' done' : why ? '' : ' ready') + (t === 'ascendancy' ? ' star' : '') },
        h('div', { class: 'row' }, h('b', {}, `${T.icon} ${T.name}`), h('span', { class: 'spacer' }), known ? h('span', { class: 'chip' }, '✓') : h('small', {}, `${D.techCost(s, t)} 📜`)),
        h('small', {}, T.desc), T.needs.length || T.needsT3 ? h('small', { class: 'muted' }, `Needs ${[...T.needs.map((n) => TECHS[n].name), T.needsT3 ? `${T.needsT3} third-age techs` : null].filter(Boolean).join(', ')}`) : null,
        rivals.length ? h('small', { class: 'muted' }, `Known to ${rivals.map((f) => lordName(f.id)).join(', ')}`) : null,
        known ? null : h('button', { class: 'btn small gold', disabled: !!why, title: why || '', onclick: () => act(D.research(s, t), `${T.icon} ${T.name} mastered.`) }, 'Learn'));
    })));
  const race = D.alive(s).filter((f) => D.met(s, f.id)).map((f) => h('span', { class: 'chip' }, `${lordIcon(f.id)} ${lordName(f.id)} · ${f.techs.length} techs${f.techs.includes('crown') ? ' · has the Crown!' : ''}`));
  return h('div', {}, h('p', { class: 'muted' }, `You hold ${s.lore} lore (+${income(s).lore} a turn). Learning takes no order. Research grows dearer as your realm grows. Ascendancy wins the Science victory: watch the rivals' scholars.`),
    race.length ? h('div', { class: 'row dom-race' }, race) : null, h('div', { class: 'dom-tree' }, tiers));
}

// ---------- diplomacy ----------
function diplomacyTab({ s, act }) {
  const cards = s.factions.map((f) => {
    const T = D.traitsOf(f.id), metNow = D.met(s, f.id), N = NATIONS[f.nation];
    if (!f.alive) return h('div', { class: 'plaque dom-rival gone' }, h('h3', {}, `${lordIcon(f.id)} ${lordName(f.id)}`), h('p', { class: 'muted' }, 'Broken. Their banners are gone from the land.'));
    if (!metNow) return h('div', { class: 'plaque dom-rival' }, h('h3', {}, '❔ An unknown nation'), h('p', { class: 'muted' }, 'Somewhere beyond the fog. Explore or research Cartography to meet them.'));
    const why = D.canDiplo(s, f.id), rel = f.relation;
    const relBar = h('div', { class: 'dom-rel', title: `${rel}` }, h('i', { style: { left: `${(rel + 100) / 2}%` } }));
    const actions = [];
    if (f.stance === 'war') {
      actions.push(h('button', { class: 'btn small gold', disabled: !!why, onclick: () => act(D.offerPeace(s, f.id)) }, `🕊 Offer peace · ${pct(D.peaceOdds(s, f))}`));
      actions.push(h('button', { class: 'btn small', disabled: !!why || s.gold < 100, onclick: () => act(D.offerPeace(s, f.id, 100)) }, `🕊 Peace + 100 🪙 · ${pct(D.peaceOdds(s, f, 100))}`));
    } else {
      if (!f.trade) actions.push(h('button', { class: 'btn small gold', disabled: !!why, onclick: () => act(D.proposeTrade(s, f.id)) }, `🤝 Propose trade · ${pct(D.tradeOdds(s, f))}`));
      else actions.push(h('button', { class: 'btn small ghost', onclick: () => act(D.cancelTrade(s, f.id)) }, 'End trade'));
      if (f.stance === 'peace') actions.push(h('button', { class: 'btn small', disabled: !!why || D.allyOdds(s, f) <= 0, title: D.allyOdds(s, f) <= 0 ? 'They need to be friendlier (35+).' : '', onclick: () => act(D.proposeAlliance(s, f.id)) }, `🛡 Propose alliance · ${pct(D.allyOdds(s, f))}`));
      actions.push(h('button', { class: 'btn small red', onclick: async () => { if (await confirmBox(`Declare war on ${lordName(f.id)}?${f.stance === 'alliance' || f.treaty > s.turn ? ' You would break your oath, and every nation will remember.' : ''}`, 'Declare war', true)) act(D.declareWar(s, f.id)); } }, '⚔ Declare war'));
    }
    actions.push(h('button', { class: 'btn small ghost', disabled: !!why || s.gold < D.GIFT, onclick: () => act(D.sendGift(s, f.id)) }, `🎁 Gift ${D.GIFT} 🪙`));
    const wars = s.rivalWars.filter((w) => w.includes(f.id)).map((w) => lordName(w[0] === f.id ? w[1] : w[0]));
    return h('div', { class: 'plaque dom-rival', style: { borderLeftColor: rivalColor(s, f.id) } },
      h('div', { class: 'row' }, h('h3', {}, `${lordIcon(f.id)} ${lordName(f.id)}`), h('span', { class: 'spacer' }), h('span', { class: 'chip stance ' + STANCE[f.stance].cls }, STANCE[f.stance].label)),
      h('small', { class: 'muted' }, `${T.title} · ${N?.icon || ''} ${N?.name || ''}${f.trade ? ' · trading with you' : ''}${f.treaty > s.turn && f.stance === 'peace' ? ` · treaty to turn ${f.treaty}` : ''}`),
      h('div', { class: 'dom-relrow' }, h('span', {}, `${relWord(rel)} (${rel})`), relBar),
      h('div', { class: 'dom-facts' },
        h('div', {}, h('span', {}, 'Provinces · might'), h('b', {}, `${D.ownedBy(s, f.id).length} · ${f.might}`)),
        h('div', {}, h('span', {}, 'Research'), h('b', {}, `${f.techs.length} techs${f.techs.includes('crown') ? ' · the Crown' : ''}`)),
        h('div', {}, h('span', {}, 'Wonders'), h('b', {}, D.wondersOf(s, f.id).map((w) => WONDERS[w].icon).join(' ') || '—')),
        wars.length ? h('div', {}, h('span', {}, 'At war with'), h('b', {}, wars.join(', '))) : null,
        f.stance === 'war' ? h('div', {}, h('span', {}, 'War score'), h('b', {}, (f.warScore > 0 ? '+' : '') + f.warScore)) : null),
      why && why !== 'They are no more.' ? h('small', { class: 'muted' }, why) : null,
      h('div', { class: 'row' }, actions));
  });
  return h('div', {}, h('p', { class: 'muted' }, 'One proposal or gift to each nation a turn; diplomacy takes no order. Rivals remember: breaking a treaty or an alliance angers everyone. Allies share their maps, fight your wars and count toward the Grand Alliance.'),
    h('div', { class: 'dom-cards' }, cards));
}

// ---------- wonders ----------
function wondersTab({ s, act }) {
  return h('div', {}, h('p', { class: 'muted' }, 'One of each in the whole world: rivals race you for them, and a Wonder changes hands with its province. Raising one takes an order.'),
    h('div', { class: 'dom-cards' }, WONDER_ORDER.map((w) => {
      const W = WONDERS[w], site = D.wonderSite(s, w), why = D.canRaise(s, w, site?.id), c = D.wonderCost(s, w, site), at = s.wonders[w];
      return h('div', { class: 'plaque dom-card dom-wonder' + (at?.owner === 'you' ? ' mine' : at ? ' taken' : '') },
        h('h3', {}, `${W.icon} ${W.name}`), h('p', {}, W.desc),
        h('small', { class: 'muted' }, `Needs ${TECHS[W.needs].name}${W.needsWonders ? ` and ${W.needsWonders} other Wonders` : ''}${W.lands ? ` · on ${W.lands.map((t) => TERRAIN[t].name.toLowerCase()).join(' or ')}` : ''} · ${c.gold} 🪙${c.lore ? ` + ${c.lore} 📜` : ''}`),
        at ? h('div', { class: 'chip' }, at.owner === 'you' ? `Yours, in ${s.provs[at.prov].name}` : `${lordIcon(at.owner)} ${lordName(at.owner)}'s${s.provs[at.prov].seen ? `, in ${s.provs[at.prov].name}` : ''}`)
          : h('div', { class: 'row' }, h('button', { class: 'btn small gold', disabled: !!why, title: why || '', onclick: () => act(D.raiseWonder(s, w, site.id)) }, site ? `Raise it in ${site.name}` : 'Raise it'), why ? h('small', { class: 'muted' }, why) : null));
    })));
}

// ---------- nations ----------
function nationsTab({ s }) {
  const st = D.standings(s);
  const rows = st.map((r, i) => {
    const me = r.who === 'you', f = me ? null : factionOf(s, r.who), known = me || D.met(s, r.who);
    const land = D.ownedBy(s, r.who);
    return h('tr', { class: me ? 'me' : '' }, h('td', {}, String(i + 1)), h('td', {}, me ? `${NATIONS[s.nation].icon} You` : known ? `${lordIcon(r.who)} ${lordName(r.who)}` : '❔ Unknown'), h('td', {}, fmt(r.score)),
      h('td', {}, known ? String(land.length) : '?'), h('td', {}, known ? String(land.reduce((a, p) => a + p.dev, 0)) : '?'), h('td', {}, known ? String((me ? s.techs : f.techs).length) : '?'),
      h('td', {}, known ? D.wondersOf(s, r.who).map((w) => WONDERS[w].icon).join('') || '—' : '?'), h('td', {}, me ? String(D.armyQuality(s)) : known ? String(f.might) : '?'));
  });
  const V = D.victoryProgress(s);
  const vcard = (id, line, frac) => h('div', { class: 'plaque dom-vic' }, h('b', {}, `${VICTORIES[id].icon} ${VICTORIES[id].name}`), h('small', {}, VICTORIES[id].desc), h('div', { class: 'dom-bar' }, h('i', { style: { width: `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%` } })), h('small', { class: 'muted' }, line));
  const vic = h('div', { class: 'dom-vics' },
    vcard('conquest', `${V.conquest.done} of ${V.conquest.of} rivals broken`, V.conquest.done / V.conquest.of),
    vcard('science', V.science.have ? 'Mastered!' : `${V.science.crown ? 'Crown ✓' : 'Crown ✗'} · third-age techs ${V.science.t3}/3 · ${V.science.lore}/${V.science.cost} lore`, (V.science.crown ? 0.5 : 0.2 * V.science.t3 / 3) + (V.science.crown ? 0.5 * Math.min(1, V.science.lore / V.science.cost) : 0)),
    vcard('prosperity', `${V.prosperity.banking ? 'Banking ✓' : 'Banking ✗'} · Wonders ${V.prosperity.wonders}/2 · ${fmt(V.prosperity.gold)}/${fmt(V.prosperity.cost)} gold`, (V.prosperity.banking ? 0.2 : 0) + 0.3 * Math.min(1, V.prosperity.wonders / 2) + 0.5 * Math.min(1, V.prosperity.gold / V.prosperity.cost)),
    vcard('diplomacy', `${V.diplomacy.allied}/${V.diplomacy.of} allied · ${V.diplomacy.run}/${DOMINION.allyTurns} turns · land ${V.diplomacy.land}/${V.diplomacy.need}`, V.diplomacy.of ? (V.diplomacy.allied / V.diplomacy.of) * 0.7 + 0.3 * (V.diplomacy.run / DOMINION.allyTurns) : 0),
    s.turnLimit ? vcard('score', `Rank ${V.score.rank} of ${st.length} · turn ${V.score.turn} of ${V.score.limit}`, V.score.turn / V.score.limit) : null);
  return h('div', {}, h('h3', {}, 'The ways to win'), vic,
    h('h3', {}, 'The nations'), h('div', { class: 'plaque dom-table-wrap' }, h('table', { class: 'dom-table' }, h('thead', {}, h('tr', {}, ['#', 'Nation', 'Score', 'Land', 'Dev', 'Techs', 'Wonders', 'Might'].map((t) => h('th', {}, t)))), h('tbody', {}, rows))),
    h('div', { class: 'plaque dom-log' }, h('h3', {}, 'Chronicle'), s.log.map((l) => h('div', { class: 'dl ' + l.kind }, h('small', {}, `T${l.turn}`), ' ', l.text))));
}

// Choose weapon, arts and squad, then march to the field. The army is committed once the battle begins.
function launch(app, s, id, kind, again = false) {
  const p = app.profile, q = s.provs[id];
  const B = again ? { ...battleSetup(s, id, kind), seed: s.battle.seed, waves: s.battle.waves, startWave: s.battle.startWave, foe: s.battle.foe, power: s.battle.power } : battleSetup(s, id, kind);
  if (!again) { const why = kind === 'attack' ? canAttack(s, id) : null; if (why) { toast(why); return; } }
  pickLoadout(app, {
    key: 'dominion', title: `${kind === 'defend' ? '🛡 Defend' : '⚔ Take'} ${q.name}`, go: 'To the field',
    intro: `Hold ${B.waves} waves, starting from wave ${B.startWave}, on ${MAPS[B.map]?.name || B.map}.${B.foe ? ` ${lordName(B.foe)} leads the horde: ${warlordById(B.foe).twistText}` : ''} Your research, resources, policies and wonders ride with you.`,
    onGo: (c) => {
      if (!again) { const r = beginBattle(s, id, kind); if (r.error) { toast(r.error); return; } }
      p.dominion = s; saveProfile(p);
      clearRun('dominion');
      app.startRun({ mode: 'dominion', mapId: B.map, seed: B.seed, startWave: B.startWave, modifiers: [], ascension: 0, weapon: c.weapon, loadout: c.loadout, squad: c.squad,
        living: !!B.foe, warlord: B.foe || undefined, dominion: { campaign: s.id, prov: id, kind, name: q.name, waves: B.waves, foe: B.foe, perks: B.perks } });
    },
  });
}

function doEndTurn(app, s, save) {
  const r = D.endTurn(s);
  if (r.error) { toast(r.error); return; }
  save();
  const bits = [];
  if (r.forced) bits.push(r.forced.victory ? `🛡 ${r.forced.name} held without you.` : `🔥 ${r.forced.name} fell while you were away.`);
  if (r.income) bits.push(`${r.income.net >= 0 ? '+' : ''}${r.income.net} 🪙 · +${r.income.levy} ⚔ · +${r.income.lore} 📜`);
  if (r.disbanded) bits.push(`${r.disbanded} levies went home (your land feeds ${D.levyCap(s)}).`);
  if (r.grew.length) bits.push(`📈 ${r.grew.join(', ')} grew.`);
  for (const n of r.revolts) bits.push(`🔥 ${n} revolted!`);
  for (const w of r.wars) bits.push(`⚔ ${lordName(w)} declared war on you!`);
  bits.push(...r.events);
  if (s.envoys.length) bits.push(`📜 ${s.envoys.length} envoy${s.envoys.length > 1 ? 's' : ''} await your answer.`);
  if (r.threat) bits.push(`🔥 ${lordName(r.threat.faction)} marches on ${s.provs[r.threat.prov].name}!`);
  if (app.domUi) app.domUi.extra = 0;
  dominionScreen(app);
  toast(h('div', {}, h('b', {}, `Turn ${s.turn} · ${seasonOf(s.turn).icon} ${seasonOf(s.turn).name}`), ...bits.map((b) => h('div', { class: 'muted' }, b))), { ms: 6000, key: 'domturn' + s.turn });
}

function helpModal() {
  let m;
  m = modal(h('div', {}, h('h2', { style: { margin: '0 0 .3rem' } }, '👑 How Dominion works'),
    h('ul', { class: 'mode-rules' },
      h('li', {}, h('b', {}, 'Each turn '), 'you have civil orders (build, develop, settle, scout, muster, raise a Wonder) and armies (each attacks once). Research, policies, taxes, the exchange and diplomacy are free.'),
      h('li', {}, h('b', {}, 'Explore. '), 'Fog hides the land and the other nations. Taking land reveals its neighbours; Scouts map two provinces deep; allies share their maps.'),
      h('li', {}, h('b', {}, 'Expand. '), 'Attack a province beside your land: fight the battle yourself (hold a few waves on its battlefield) or auto-resolve it on the odds. Weak free land can simply be settled for gold. Rival land needs a declaration of war.'),
      h('li', {}, h('b', {}, 'Exploit. '), 'Provinces grow in development (more yield, more building slots). Conquered and over-taxed land grows restless: unrest halves yields and can end in revolt. Strategic resources, policies, trade and Wonders shape your realm; a big realm costs more to run and to research.'),
      h('li', {}, h('b', {}, 'Exterminate, or outdo. '), 'Win by Conquest, Science (Ascendancy), Prosperity (the Golden Throne), a Grand Alliance, or the best score at the turn limit. The rivals play for the same victories: if one of them gets there first, the age is theirs.'),
      h('li', {}, 'Rival nations have their own economies, research, wonders, wars and moods. They trade, demand tribute, make and break peace, and march on you.'),
      h('li', {}, 'Battles start later the stronger the province (◆) and the longer the war goes on. Your Keep, weapon and arts come with you, plus everything your realm has earned, and every battle feeds the Realm.')),
    h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn gold', onclick: () => m.close() }, 'To war'))), { wide: true });
}

function setupScreen(app) {
  app.where = 'dominion';
  const p = app.profile, screen = document.getElementById('screen');
  const pick = p.modePicks?.dominion || {};
  const st = { diff: pick.diff || ((p.stats.runs || 0) < 10 ? 'squire' : 'knight'), nation: NATIONS[pick.nation] ? pick.nation : 'highland', size: SIZES[pick.size] ? pick.size : 'small', rivals: pick.rivals || 3, turnLimit: TURN_LIMITS.includes(pick.turnLimit) ? pick.turnLimit : 60 };
  const R = p.local?.dominion;
  const opt = (on, icon, name, desc, onclick) => h('button', { class: 'opt', 'aria-pressed': String(on), onclick }, h('span', { class: 'box' }, on ? '✓' : icon), h('span', {}, h('b', {}, name), h('small', {}, desc)), h('span', {}));
  const render = () => {
    const Z = SIZES[st.size];
    st.rivals = Math.max(Z.rivals[0], Math.min(Z.rivals[1], st.rivals));
    screen.replaceChildren(h('div', { class: 'screen-inner setup-screen' },
      h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => app.showHome(), 'aria-label': 'Back' }, '← Home'), h('h2', {}, '👑 Dominion')),
      h('p', { class: 'muted' }, 'A turn-based war of nations on a hex map that is new every campaign. Explore, settle and conquer; grow your provinces, keep them loyal, trade, research and raise Wonders; make peace, alliances and war with rival nations who play to win too. Every contested province is a battle: fight it yourself or trust the dice.'),
      R?.campaigns ? h('p', { class: 'chip' }, dominionBestLine(p)) : null,
      h('h3', {}, 'Your nation'), h('div', { class: 'opt-list' }, Object.entries(NATIONS).map(([id, N]) => opt(st.nation === id, N.icon, N.name, N.desc, () => { st.nation = id; render(); }))),
      h('h3', {}, 'The land'), h('div', { class: 'opt-list' }, Object.values(SIZES).map((Sz) => opt(st.size === Sz.id, '🗺', Sz.name, `${Sz.blurb} ${Sz.rivals[0]}–${Sz.rivals[1]} rivals.`, () => { st.size = Sz.id; render(); }))),
      h('div', { class: 'row dom-setup-row' }, h('span', {}, 'Rival nations'), h('div', { class: 'seg' }, Array.from({ length: Z.rivals[1] - Z.rivals[0] + 1 }, (_, i) => Z.rivals[0] + i).map((n) => h('button', { 'aria-pressed': String(st.rivals === n), onclick: () => { st.rivals = n; render(); } }, String(n))))),
      h('div', { class: 'row dom-setup-row' }, h('span', {}, 'Turn limit'), h('div', { class: 'seg' }, TURN_LIMITS.map((n) => h('button', { 'aria-pressed': String(st.turnLimit === n), onclick: () => { st.turnLimit = n; render(); } }, n ? String(n) : 'None')))),
      h('h3', {}, 'Difficulty'), h('div', { class: 'opt-list' }, Object.values(DIFFICULTIES).map((Df) => opt(st.diff === Df.id, Df.icon, Df.name, Df.blurb, () => { st.diff = Df.id; render(); }))),
      h('div', { class: 'setup-foot' }, h('button', { class: 'btn ghost', onclick: () => helpModal() }, 'How it works'), h('span', { class: 'spacer' }),
        h('button', { class: 'btn gold big', onclick: () => { (p.modePicks ||= {}).dominion = { ...(p.modePicks.dominion || {}), ...st }; p.dominion = newCampaign(randomSeed(), st); app.domUi = null; saveProfile(p); dominionScreen(app); } }, 'Raise your banner'))));
  };
  render();
  screen.scrollTop = 0;
}
