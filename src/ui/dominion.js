// Dominion: the campaign screen. A hex map of provinces under fog; your orders for the turn; research; rival warlords.
// Rules live in src/game/dominion.js. The campaign is saved on the profile (p.dominion); its battles are ordinary runs
// in the 'dominion' slot, settled back here by settleDominion when they end.
import { h, fmt, toast, modal, confirmBox } from './dom.js';
import { saveProfile, loadRun, clearRun } from '../meta/profile.js';
import { randomSeed } from '../core/rng.js';
import { MAPS } from '../game/maps.js';
import { warlordById } from '../game/living.js';
import { pickLoadout } from './loadout.js';
import {
  DOMINION, DIFFICULTIES, RIVAL_COLORS, TERRAIN, SPECIALS, BUILDINGS, TECHS, TECH_ORDER, newCampaign, cleanCampaign, hexCenter, neighbors, yours, factionOf,
  income, provYields, provPower, canAttack, battleSetup, beginBattle, applyBattle, autoOdds, autoResolve, build, research, canResearch,
  scout, muster, truce, truceCost, endTurn, yieldProvince, ordersPerTurn, attackCost, has, borders,
} from '../game/dominion.js';

const YOU = '#e2b33c';
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lordName = (id) => warlordById(id)?.name || 'the horde';
const rivalColor = (s, id) => { const i = s.factions.findIndex((f) => f.id === id); return s.factions[i]?.color || RIVAL_COLORS[Math.max(0, i)]; };
const ownerColor = (s, p) => (p.owner === 'you' ? YOU : p.owner ? rivalColor(s, p.owner) : TERRAIN[p.terrain].color);
const ownerName = (p) => (p.owner === 'you' ? 'Yours' : p.owner ? lordName(p.owner) : 'Free land');

export function loadCampaign(p) { return p.dominion ? cleanCampaign(p.dominion) : null; }

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
  if (s.over.won) { R.wins = (R.wins || 0) + 1; R.bestTurns = Math.min(R.bestTurns || Infinity, s.over.turn); (R.diffWins ||= {})[s.diff] = (R.diffWins[s.diff] || 0) + 1; }
  R.best = Math.max(R.best || 0, s.over.score || 0);
}

export function dominionBestLine(p) {
  const R = p.local?.dominion, s = p.dominion;
  if (s && !s.over) return `In progress · turn ${s.turn} · ${yours(cleanCampaign(s) || s).length} provinces`;
  if (!R?.campaigns && !R?.battles) return 'New · conquer the land';
  return R.wins ? `${R.wins} war${R.wins === 1 ? '' : 's'} won · fastest ${R.bestTurns} turns` : `${R.won || 0} battles won`;
}

// ---------- the screen ----------
export function dominionScreen(app, opts = {}) {
  app.where = 'dominion';
  const p = app.profile, screen = document.getElementById('screen');
  const s = loadCampaign(p);
  if (!s) return setupScreen(app);
  const ui = app.domUi ||= { sel: s.provs.find((x) => x.capital === 'you')?.id ?? 0, extra: 0 };
  if (!s.provs[ui.sel]) ui.sel = 0;
  const save = () => { p.dominion = s; recordOver(p, s); saveProfile(p); app.checkAch?.(); };
  const rerender = () => { save(); dominionScreen(app); };
  const act = (r, ok) => { if (r?.error) { toast(r.error); return false; } if (ok) toast(ok); rerender(); return true; };

  const inc = income(s);
  const res = (icon, label, v, d) => h('div', { class: 'dom-res', title: label }, h('span', { 'aria-hidden': 'true' }, icon), h('b', {}, fmt(v)), d ? h('small', {}, `+${d}`) : null, h('span', { class: 'sr' }, ' ' + label));
  const top = h('div', { class: 'dom-top plaque' },
    res('🪙', 'gold', s.gold, inc.gold), res('⚔', 'levies', s.levy, inc.levy), res('📜', 'lore', s.lore, inc.lore),
    h('div', { class: 'dom-res orders', title: 'Orders left this turn' }, h('span', { 'aria-hidden': 'true' }, '🎖'), h('b', {}, `${s.orders}/${ordersPerTurn(s)}`), h('small', {}, 'orders')),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn small', onclick: () => techModal(app, s, rerender) }, `📜 Research${TECH_ORDER.some((t) => !canResearch(s, t)) ? ' •' : ''}`),
    s.over ? null : h('button', { class: 'btn gold', disabled: !!s.battle, onclick: () => doEndTurn(app, s, save) }, s.orders > 0 ? `End turn (${s.orders} unused)` : 'End turn ▶'));

  // Banners: a battle under way, an attack to answer, or the war's end.
  const banners = [];
  if (s.over) {
    banners.push(h('div', { class: 'plaque dom-over ' + (s.over.won ? 'won' : 'lost') },
      h('h3', {}, s.over.won ? `👑 The land is yours: every warlord broken on turn ${s.over.turn}.` : '💀 Your capital has fallen. The war is lost.'),
      h('p', {}, `Score ${fmt(s.over.score)} · ${DIFFICULTIES[s.diff].name} · ${s.stats.won} battles won, ${s.stats.held} held, ${s.stats.lost} lost.`),
      h('div', { class: 'row' }, h('button', { class: 'btn gold', onclick: () => { p.dominion = null; saveProfile(p); app.domUi = null; setupScreen(app); } }, 'A new war'))));
  } else if (s.battle) {
    const B = s.battle, sv = loadRun('dominion');
    const live = sv && sv.dominion && sv.seed === B.seed;
    banners.push(h('div', { class: 'plaque dom-threat' },
      h('b', {}, `⚔ The battle for ${s.provs[B.prov].name} is under way.`), h('span', { class: 'muted' }, ` Hold ${B.waves} waves to ${B.kind === 'defend' ? 'keep it' : 'take it'}.`),
      h('div', { class: 'row' },
        live ? h('button', { class: 'btn gold', onclick: () => app.resumeRun(sv) }, '▶ Continue the battle') : h('button', { class: 'btn gold', onclick: () => launch(app, s, B.prov, B.kind, true) }, '⚔ To the field'),
        h('button', { class: 'btn ghost', onclick: async () => { if (await confirmBox(`Concede the battle for ${s.provs[B.prov].name}? It counts as a defeat.`, 'Concede', true)) { clearRun('dominion'); applyBattle(s, { victory: false }); rerender(); } } }, 'Concede'))));
  } else if (s.threat) {
    const T = s.threat, tp = s.provs[T.prov], B = battleSetup(s, T.prov, 'defend');
    const odds = autoOdds(s, T.prov, ui.extra, 'defend');
    banners.push(h('div', { class: 'plaque dom-threat' },
      h('b', {}, `🔥 ${lordName(T.faction)} marches on ${tp.name}!`), h('span', { class: 'muted' }, ` Strength ${T.power}. Answer it this turn: an unanswered attack is fought without you when the turn ends.`),
      h('div', { class: 'row' },
        h('button', { class: 'btn gold', onclick: () => launch(app, s, T.prov, 'defend') }, `⚔ Defend it (hold ${B.waves} waves from wave ${B.startWave})`),
        h('button', { class: 'btn', onclick: () => { const r = autoResolve(s, T.prov, ui.extra, 'defend'); ui.extra = 0; if (!r.error) toast(r.victory ? `${tp.name} held (${Math.round(r.odds * 100)}% odds).` : `${tp.name} fell (${Math.round(r.odds * 100)}% odds).`, { ms: 4000 }); act(r); } }, `🎲 Auto-resolve · ${Math.round(odds * 100)}%`),
        levyStepper(s, ui, rerender, B.cost),
        tp.capital === 'you' ? null : h('button', { class: 'btn ghost', onclick: () => act(yieldProvince(s)) }, 'Yield it'))));
  }

  // The map: SVG hexes, drawn as markup (internal data only, escaped).
  const W = 64, R = W / Math.sqrt(3);
  const pts = (cx, cy) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30); return `${(cx + R * Math.cos(a)).toFixed(1)},${(cy + R * Math.sin(a)).toFixed(1)}`; }).join(' ');
  const maxX = DOMINION.cols + 0.5, maxY = (DOMINION.rows - 1) * 0.866 + 1;
  const front = new Set(borders(s));
  let svg = '';
  // Lakes and peaks: impassable, drawn once you have seen the land beside them.
  for (const [lq, lr] of s.lakes || []) {
    const c = hexCenter(lq, lr), near = s.provs.some((x) => x.seen && Math.abs(x.r - lr) <= 1 && Math.abs(x.q - lq) <= 1);
    svg += near ? `<g class="lake"><polygon points="${pts(c.x * W, c.y * W)}"/><text x="${c.x * W}" y="${c.y * W + 2}">${(lq * 7 + lr) % 3 ? '🌊' : '⛰'}</text></g>`
      : `<g class="hex fog lakefog" aria-hidden="true"><polygon points="${pts(c.x * W, c.y * W)}" fill="#2b2540"/><text x="${c.x * W}" y="${c.y * W + 2}" class="hi">?</text></g>`;
  }
  for (const q of s.provs) {
    const c = hexCenter(q.q, q.r), cx = c.x * W, cy = c.y * W;
    const fog = !q.seen;
    const fill = fog ? '#2b2540' : ownerColor(s, q);
    const sel = q.id === ui.sel, threat = s.threat?.prov === q.id || s.battle?.prov === q.id;
    const icon = fog ? '?' : q.capital ? (q.capital === 'you' ? '🏰' : warlordById(q.capital)?.icon || '👑') : q.building ? BUILDINGS[q.building].icon : q.special ? SPECIALS[q.special].icon : TERRAIN[q.terrain].icon;
    svg += `<g class="hex${fog ? ' fog' : ''}${sel ? ' sel' : ''}${threat ? ' threat' : ''}${front.has(q.id) && !fog ? ' front' : ''}${q.owner === 'you' ? ' mine' : ''}" data-id="${q.id}" tabindex="0" role="button" aria-label="${esc(fog ? 'Unexplored land' : `${q.name}, ${ownerName(q)}, ${TERRAIN[q.terrain].name}`)}">`
      + `<polygon points="${pts(cx, cy)}" fill="${fill}" fill-opacity="${fog ? 1 : q.owner ? 0.95 : 0.42}"/>`
      + (!fog && q.owner && q.owner !== 'you' ? `<polygon points="${pts(cx, cy)}" fill="url(#hatch)" />` : '')
      + `<text x="${cx}" y="${cy + 2}" class="hi">${esc(icon)}</text>`
      + (!fog ? `<text x="${cx}" y="${cy + 21}" class="hn">${esc(q.name.length > 10 ? q.name.slice(0, 9) + '…' : q.name)}</text>` : '')
      + (!fog && q.owner !== 'you' ? `<text x="${cx}" y="${cy - 15}" class="hp">${'◆'.repeat(Math.min(6, provPower(s, q)))}</text>` : '')
      + '</g>';
  }
  const map = h('div', { class: 'dom-map plaque', html: `<svg viewBox="0 0 ${(maxX * W).toFixed(0)} ${(maxY * W).toFixed(0)}" role="group" aria-label="Campaign map"><defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="rgba(0,0,0,0.22)" stroke-width="3"/></pattern></defs>${svg}</svg>` });
  const pickHex = (e) => { const g = e.target.closest('.hex'); if (!g || g.dataset.id == null) return; ui.sel = Number(g.dataset.id); ui.extra = 0; dominionScreen(app); };
  map.addEventListener('click', pickHex);
  map.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickHex(e); } });

  const panel = provincePanel(app, s, s.provs[ui.sel], ui, act, rerender);
  const legend = h('div', { class: 'dom-legend muted' }, h('span', {}, h('i', { style: { background: YOU } }), 'You'),
    ...s.factions.map((f) => h('span', { class: f.alive ? '' : 'gone' }, h('i', { style: { background: rivalColor(s, f.id) } }), `${warlordById(f.id).icon} ${warlordById(f.id).name}${f.alive ? ` · might ${f.might} · ${s.provs.filter((x) => x.owner === f.id).length} lands${f.truce >= s.turn ? ` · truce to turn ${f.truce}` : ''}` : ' · broken'}`)),
    h('span', {}, '◆ strength'));
  const log = h('div', { class: 'plaque dom-log' }, h('h3', {}, 'Chronicle'), s.log.slice(0, 10).map((l) => h('div', { class: 'dl ' + l.kind }, h('small', {}, `T${l.turn}`), ' ', l.text)));

  screen.replaceChildren(h('div', { class: 'screen-inner dominion' },
    h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => app.showHome(), 'aria-label': 'Back' }, '← Home'),
      h('h2', {}, `👑 Dominion · Turn ${s.turn}`), h('span', { class: 'spacer' }), h('button', { class: 'btn small ghost', onclick: () => helpModal() }, 'How to play')),
    top, ...banners,
    h('div', { class: 'dom-grid' }, h('div', {}, map, legend), panel),
    log));
  if (opts.flash) toast(opts.flash, { ms: 5000 });
}

function levyStepper(s, ui, rerender, cost) {
  const max = Math.max(0, s.levy - cost);
  return h('span', { class: 'dom-step', title: 'Extra levies committed to an auto-resolve: each one adds 5% to the odds, and all of them are spent.' },
    h('button', { class: 'btn small ghost', disabled: ui.extra <= 0, 'aria-label': 'Fewer levies', onclick: () => { ui.extra--; rerender(); } }, '−'),
    h('span', {}, `+${ui.extra} levies`),
    h('button', { class: 'btn small ghost', disabled: ui.extra >= max, 'aria-label': 'More levies', onclick: () => { ui.extra++; rerender(); } }, '+'));
}

function provincePanel(app, s, q, ui, act, rerender) {
  if (!q.seen) return h('div', { class: 'plaque dom-panel' }, h('h3', {}, 'Unexplored land'), h('p', { class: 'muted' }, 'Nobody has mapped it. Scout from a province beside it, or take a neighbour.'),
    neighbors(s, q.id).some((n) => s.provs[n].owner === 'you' || neighbors(s, n).some((m) => s.provs[m].owner === 'you')) ? null : null);
  const T = TERRAIN[q.terrain], y = provYields(s, q), mine = q.owner === 'you';
  const facts = [
    ['Land', `${T.icon} ${T.name} · ${MAPS[q.map]?.name || q.map}`],
    ['Held by', q.capital ? `${ownerName(q)} (capital)` : ownerName(q)],
    ['Yields', `🪙 ${y.gold || 0} · ⚔ ${y.levy || 0} · 📜 ${y.lore || 0}`],
    q.special ? ['Feature', `${SPECIALS[q.special].icon} ${SPECIALS[q.special].name}${q.special === 'ruins' ? ' (loot when taken)' : ''}`] : null,
    q.building ? ['Building', `${BUILDINGS[q.building].icon} ${BUILDINGS[q.building].name}`] : null,
    !mine ? ['Strength', '◆'.repeat(provPower(s, q)) + ` (${provPower(s, q)})`] : null,
  ].filter(Boolean);
  const kids = [h('h3', {}, q.name), h('div', { class: 'dom-facts' }, facts.map(([k, v]) => h('div', {}, h('span', {}, k), h('b', {}, v))))];
  if (s.over) return h('div', { class: 'plaque dom-panel' }, kids);
  if (!mine) {
    const why = canAttack(s, q.id);
    const B = battleSetup(s, q.id, 'attack');
    const f = q.owner ? factionOf(s, q.owner) : null;
    kids.push(h('div', { class: 'dom-battle' },
      h('div', { class: 'muted' }, `Battle: hold ${B.waves} waves from wave ${B.startWave} on ${MAPS[B.map]?.name || B.map}${B.foe ? `, against ${lordName(B.foe)}'s host (their favoured foes and rule)` : ''}. Costs ${attackCost(s, q)} levies and an order.`),
      why ? h('div', { class: 'dom-why' }, '⛔ ' + why) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn gold', disabled: !!why, onclick: () => launch(app, s, q.id, 'attack') }, '⚔ Fight the battle'),
        h('button', { class: 'btn', disabled: !!why || s.levy < attackCost(s, q) + ui.extra, onclick: () => { const r = autoResolve(s, q.id, ui.extra); ui.extra = 0; if (!r.error) toast(r.victory ? `${q.name} taken (${Math.round(r.odds * 100)}% odds)${r.eliminated ? ` · ${lordName(r.eliminated)} is broken!` : ''}.` : `Thrown back from ${q.name} (${Math.round(r.odds * 100)}% odds).`, { ms: 4500 }); act(r); } }, `🎲 Auto-resolve · ${Math.round(autoOdds(s, q.id, ui.extra) * 100)}%`),
        why ? null : levyStepper(s, ui, rerender, attackCost(s, q))),
      h('div', { class: 'row' },
        h('button', { class: 'btn small ghost', disabled: s.orders < 1 && !has(s, 'cartography'), onclick: () => act(scout(s, q.id)) }, `🔭 Scout around${has(s, 'cartography') ? ' (free)' : ''}`),
        f && f.alive ? h('button', { class: 'btn small ghost', disabled: f.truce >= s.turn || s.orders < 1 || s.gold < truceCost(s, f.id), onclick: () => act(truce(s, f.id)) }, `🕊 Truce with ${warlordById(f.id).name} · ${truceCost(s, f.id)} 🪙`) : null)));
  } else {
    if (!q.building) kids.push(h('h4', {}, 'Build (one per province, an order)'), h('div', { class: 'dom-builds' }, Object.entries(BUILDINGS).map(([id, B]) =>
      h('button', { class: 'opt', disabled: s.orders < 1 || s.gold < B.cost, onclick: () => act(build(s, q.id, id)) }, h('span', { class: 'box' }, B.icon), h('span', {}, h('b', {}, `${B.name} · ${B.cost} 🪙`), h('small', {}, B.desc)), h('span', {})))));
    kids.push(h('div', { class: 'row' },
      h('button', { class: 'btn small', disabled: s.orders < 1, onclick: () => act(muster(s)) }, `📯 Muster levies (+${2 + Math.ceil(yours(s).length / 2)})`),
      h('button', { class: 'btn small ghost', disabled: s.orders < 1 && !has(s, 'cartography'), onclick: () => act(scout(s, q.id)) }, `🔭 Scout${has(s, 'cartography') ? ' (free)' : ''}`)));
  }
  return h('div', { class: 'plaque dom-panel' }, kids);
}

// Choose weapon, arts and squad, then march to the field. The order is spent once the battle begins.
function launch(app, s, id, kind, again = false) {
  const p = app.profile, q = s.provs[id];
  const B = again ? { ...battleSetup(s, id, kind), seed: s.battle.seed, waves: s.battle.waves, startWave: s.battle.startWave, foe: s.battle.foe, power: s.battle.power } : battleSetup(s, id, kind);
  if (!again) { const why = kind === 'attack' ? canAttack(s, id) : null; if (why) { toast(why); return; } }
  pickLoadout(app, {
    key: 'dominion', title: `${kind === 'defend' ? '🛡 Defend' : '⚔ Take'} ${q.name}`, go: 'To the field',
    intro: `Hold ${B.waves} waves, starting from wave ${B.startWave}, on ${MAPS[B.map]?.name || B.map}.${B.foe ? ` ${lordName(B.foe)} leads the horde: ${warlordById(B.foe).twistText}` : ''} Your research rides with you.`,
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
  const r = endTurn(s);
  if (r.error) { toast(r.error); return; }
  save();
  const bits = [];
  if (r.forced) bits.push(r.forced.victory ? `🛡 ${r.forced.name} held without you.` : `🔥 ${r.forced.name} fell while you were away.`);
  if (r.income) bits.push(`+${r.income.gold} 🪙 · +${r.income.levy} ⚔ · +${r.income.lore} 📜`);
  bits.push(...r.events);
  if (r.threat) bits.push(`🔥 ${lordName(r.threat.faction)} marches on ${s.provs[r.threat.prov].name}!`);
  app.domUi && (app.domUi.extra = 0);
  dominionScreen(app);
  toast(h('div', {}, h('b', {}, `Turn ${s.turn}`), ...bits.map((b) => h('div', { class: 'muted' }, b))), { ms: 5500, key: 'domturn' + s.turn });
}

function techModal(app, s, rerender) {
  let m;
  const rows = TECH_ORDER.map((t) => {
    const T = TECHS[t], why = canResearch(s, t), known = has(s, t);
    return h('div', { class: 'opt' + (known ? ' done' : '') }, h('span', { class: 'box' }, known ? '✓' : T.icon),
      h('span', {}, h('b', {}, `${T.name} · ${T.cost} 📜`), h('small', {}, T.desc + (T.needs.length ? ` Needs ${T.needs.map((n) => TECHS[n].name).join(' + ')}.` : ''))),
      known ? h('span', { class: 'chip' }, 'Known') : h('button', { class: 'btn small gold', disabled: !!why, title: why || '', onclick: () => { const r = research(s, t); if (r.error) { toast(r.error); return; } m.close(); rerender(); toast(`${T.icon} ${T.name} mastered.`); } }, 'Learn'));
  });
  m = modal(h('div', {}, h('h2', { style: { margin: '0 0 .3rem' } }, '📜 Research'), h('p', { class: 'muted' }, `You hold ${s.lore} lore (+${income(s).lore} a turn). Learning takes no order.`), h('div', { class: 'opt-list' }, rows),
    h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '.6rem' } }, h('button', { class: 'btn', onclick: () => m.close() }, 'Close'))), { wide: true });
}

function helpModal() {
  let m;
  m = modal(h('div', {}, h('h2', { style: { margin: '0 0 .3rem' } }, '👑 How Dominion works'),
    h('ul', { class: 'mode-rules' },
      h('li', {}, h('b', {}, 'Explore. '), 'Fog hides the land. Taking a province reveals its neighbours; Scouts map two provinces deep; Cartography reveals everything.'),
      h('li', {}, h('b', {}, 'Expand. '), 'Attack a province beside your land. Fight the battle yourself (hold a few waves on its battlefield) or auto-resolve it on the odds. An attack costs levies and an order.'),
      h('li', {}, h('b', {}, 'Exploit. '), 'Every province yields gold, levies and lore each turn. Raise one building in each, and spend lore on research that rides into every battle.'),
      h('li', {}, h('b', {}, 'Exterminate. '), 'Three warlords hold the far corners and grow stronger as the turns pass. Storm a warlord’s capital and its provinces swear fealty to you. Break all three to win; lose your own capital and the war is lost.'),
      h('li', {}, 'Battles start later the stronger the province (◆) and the longer the war goes on. Your Keep, weapon and arts all come with you, and every battle feeds the Realm like any other run.')),
    h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn gold', onclick: () => m.close() }, 'To war'))), { wide: true });
}

function setupScreen(app) {
  app.where = 'dominion';
  const p = app.profile, screen = document.getElementById('screen');
  let diff = p.modePicks?.dominion?.diff || ((p.stats.runs || 0) < 10 ? 'squire' : 'knight');
  const R = p.local?.dominion;
  const render = () => {
    screen.replaceChildren(h('div', { class: 'screen-inner setup-screen' },
      h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => app.showHome(), 'aria-label': 'Back' }, '← Home'), h('h2', {}, '👑 Dominion')),
      h('p', { class: 'muted' }, 'A war of conquest, turn by turn, across a land of hex provinces that is new every campaign. Explore the fog, expand province by province, build and research, and break the three warlords who hold the far corners. Every contested province is a battle: fight it yourself or trust the dice.'),
      R?.campaigns ? h('p', { class: 'chip' }, dominionBestLine(p)) : null,
      h('h3', {}, 'Difficulty'),
      h('div', { class: 'opt-list' }, Object.values(DIFFICULTIES).map((D) => h('button', { class: 'opt', 'aria-pressed': String(diff === D.id), onclick: () => { diff = D.id; render(); } },
        h('span', { class: 'box' }, diff === D.id ? '✓' : D.icon), h('span', {}, h('b', {}, D.name), h('small', {}, D.blurb)), h('span', {})))),
      h('div', { class: 'setup-foot' }, h('button', { class: 'btn ghost', onclick: () => helpModal() }, 'How it works'), h('span', { class: 'spacer' }),
        h('button', { class: 'btn gold big', onclick: () => { (p.modePicks ||= {}).dominion = { ...(p.modePicks.dominion || {}), diff }; p.dominion = newCampaign(randomSeed(), diff); app.domUi = null; saveProfile(p); dominionScreen(app); } }, 'Raise your banner'))));
  };
  render();
  screen.scrollTop = 0;
}
