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
import { audio } from '../game/audio.js';
import { buzz } from './haptics.js';

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
const sfx = (name, hap) => { try { audio.init(); audio.play(name); } catch { /* sound is optional */ } if (hap) buzz(hap, 60); };
const mood = (r) => (r >= 50 ? '😄' : r >= 15 ? '🙂' : r > -15 ? '😐' : r > -50 ? '😠' : '😡');
// A line from a rival's court, by temperament and stance.
function quoteOf(s, f) {
  const T = D.traitsOf(f.id);
  if (f.stance === 'war') return T.agg > 0.6 ? '“Your walls will burn, and your fields with them.”' : '“This war profits no one. Not yet.”';
  if (f.stance === 'alliance') return '“Our spears are yours, friend.”';
  if (f.relation >= 15) return T.trade > 0.6 ? '“Our roads are open to your merchants.”' : '“Peace suits us both.”';
  if (f.relation < -15) return T.agg > 0.6 ? '“We are watching your borders.”' : '“Keep to your lands.”';
  return T.sci > 0.7 ? '“Our scholars have much to do. Leave us to it.”' : '“Keep to your lands, and we keep to ours.”';
}
// A big card that flies in over the screen for a moment: a battle won or lost, a Golden Age, a promotion.
function splash(icon, title, sub = '', kind = '') {
  document.querySelectorAll('.dom-splash').forEach((x) => x.remove());
  const el = h('div', { class: 'dom-splash ' + kind, role: 'status', onclick: () => el.remove() }, h('div', { class: 'ds-card' }, h('div', { class: 'ds-icon', 'aria-hidden': 'true' }, icon), h('b', {}, title), sub ? h('small', {}, sub) : null));
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 2300); setTimeout(() => el.remove(), 2700);
}
// After a battle (fought or rolled): the right sound and a splash.
function battleFx(s, r, name) {
  if (!r || r.error) return;
  if (r.victory) { sfx('achievement', 'record'); splash(r.eliminated ? '👑' : r.kind === 'defend' ? '🛡' : '⚔', r.kind === 'defend' ? `${name} holds!` : r.eliminated ? `${lordName(r.eliminated)} is broken!` : `${name} is yours!`, [r.gold ? `+${r.gold} 🪙` : '', r.lore ? `+${r.lore} 📜` : '', r.camp ? 'camp scattered' : '', r.odds ? `${pct(r.odds)} odds` : ''].filter(Boolean).join(' · '), 'won'); }
  else { sfx('leak', 'leak'); splash(r.kind === 'defend' ? '🔥' : '💀', r.kind === 'defend' ? `${name} has fallen` : `Thrown back from ${name}`, r.odds ? `${pct(r.odds)} odds` : '', 'lost'); }
  if (r.promoted) setTimeout(() => { sfx('rank', 'upgrade'); splash('🎖', `${s.general.name}`, `raised to ${D.RANK_NAMES[r.promoted - 1]}`, 'promo'); }, 2700);
}

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
  const ui = app.domUi ||= { sel: s.provs.find((x) => x.capital === 'you')?.id ?? 0, extra: 0, tab: 'map', overlay: 'political', zoom: window.innerWidth < 640 ? 2 : 1 };
  if (!s.provs[ui.sel]) ui.sel = 0;
  const keepY = screen.scrollTop;
  const save = () => { p.dominion = s; recordOver(p, s); saveProfile(p); app.checkAch?.(); };
  const rerender = () => { save(); dominionScreen(app, { keep: true }); };
  const act = (r, ok, sound) => {
    if (r?.error) { sfx('error'); toast(r.error); return false; }
    const golden0 = s.golden;
    if (sound) sfx(sound, 'tap');
    if (ok) toast(ok, { ms: 3500 });
    if (s.golden !== golden0 && D.goldenAge(s)) setTimeout(() => { sfx('boon', 'record'); splash('✨', 'A Golden Age dawns!', `${D.GLORY.turns} turns of plenty: gold and lore +25%`, 'golden'); }, 300);
    rerender(); return true;
  };
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
    D.goldenAge(s) ? h('span', { class: 'chip golden', title: 'Golden Age: gold and lore +25%, unrest falls faster, faster growth' }, `✨ Golden Age · ${s.golden - s.turn + 1} turn${s.golden - s.turn ? 's' : ''}`)
      : h('div', { class: 'dom-glory', title: `Glory ${s.glory}/${D.GLORY.max}: win battles, raise Wonders, meet decrees and learn great techs. At ${D.GLORY.max} a Golden Age begins.` }, h('span', { 'aria-hidden': 'true' }, '✨'), h('i', { class: 'bar' }, h('i', { style: { width: `${s.glory}%` } })), h('small', {}, `${s.glory}`)),
    s.general ? h('span', { class: 'chip marshal', title: `${D.RANK_NAMES[s.general.rank - 1]} ${s.general.name} · ${D.GENERAL_TRAITS[s.general.trait].name}: ${D.GENERAL_TRAITS[s.general.trait].desc}` }, `🎖 ${'★'.repeat(s.general.rank)}`) : null,
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
        h('button', { class: 'btn', onclick: () => { const r = autoResolve(s, T.prov, ui.extra, 'defend'); ui.extra = 0; battleFx(s, r, tp.name); act(r); } }, `🎲 Auto-resolve · ${pct(odds)}`),
        levyStepper(s, ui, rerender, B.cost),
        tp.capital === 'you' ? null : h('button', { class: 'btn ghost', onclick: () => act(D.yieldProvince(s)) }, 'Yield it')),
      oddsList(s, T.prov, ui.extra, 'defend')));
  }
  if (s.dilemma) {
    const d = D.dilemmaById(s.dilemma.id);
    if (d) {
      const optBtn = (o, i) => { const why = D.canChoose(s, i); return h('button', { class: 'btn small ' + (i ? 'ghost' : 'gold'), disabled: !!why, title: why || o.hint, onclick: () => { const r = D.answerDilemma(s, i); if (!r.error) toast(`${d.icon} ${r.text}`, { ms: 4000 }); act(r, null, 'click'); } }, h('b', {}, o.label), h('small', { class: 'dl-hint' }, why || o.hint)); };
      out.push(h('div', { class: 'plaque dom-dilemma' }, h('div', { class: 'dd-icon', 'aria-hidden': 'true' }, d.icon), h('div', {}, h('b', {}, d.title), h('p', { class: 'muted' }, d.text, h('small', {}, ' Left unanswered, the second course is taken.')), h('div', { class: 'row' }, optBtn(d.a, 0), optBtn(d.b, 1)))));
    }
  }
  const q = D.questProgress(s);
  if (q) {
    const R = q.reward, frac = Math.max(0, Math.min(1, q.have / Math.max(1, q.need)));
    out.push(h('div', { class: 'plaque dom-decree' + (q.done ? ' done' : '') }, h('div', { class: 'dd-icon', 'aria-hidden': 'true' }, q.icon),
      h('div', { class: 'dd-body' }, h('b', {}, `Royal decree: ${q.text}`), h('div', { class: 'dom-bar' }, h('i', { style: { width: `${Math.round(frac * 100)}%` } })),
        h('small', { class: 'muted' }, `${q.kind === 'calm' ? (q.done ? 'Met' : 'Not yet') : `${q.have}/${q.need}`} · ${q.left > 0 ? `${q.left} turn${q.left === 1 ? '' : 's'} left` : 'last turn'} · reward ${[R.gold ? `${R.gold} 🪙` : '', R.levy ? `${R.levy} ⚔` : '', R.lore ? `${R.lore} 📜` : ''].filter(Boolean).join(' ')} + ✨`)),
      q.done ? h('button', { class: 'btn small gold', onclick: () => { const r = D.checkQuest(s); if (r?.done) splash('📯', 'Decree fulfilled!', r.text, 'won'); act(r || { ok: true }, null, 'coin'); } }, 'Claim') : null));
  }
  s.envoys.forEach((e, i) => {
    const who = `${lordIcon(e.from)} ${lordName(e.from)}`;
    const text = e.kind === 'peace' ? `${who} offers peace.` : e.kind === 'trade' ? `${who} proposes a trade agreement (+${D.tradeValue(s)} gold a turn).` : e.kind === 'alliance' ? `${who} proposes an alliance.`
      : e.kind === 'tribute' ? `${who} demands ${e.gold} gold in tribute, or else.` : `${who}, your ally, asks you to join its war on ${lordName(e.target)}.`;
    const ef = factionOf(s, e.from);
    out.push(h('div', { class: 'plaque dom-envoy' }, h('span', {}, h('span', { class: 'mood', 'aria-hidden': 'true' }, ef ? mood(ef.relation) : '📜'), ' ', text, ef ? h('small', { class: 'quote' }, ' ' + quoteOf(s, ef)) : null, h('small', { class: 'muted' }, ' Answer this turn.')),
      h('span', { class: 'row' }, h('button', { class: 'btn small gold', onclick: () => act(D.answerEnvoy(s, i, true)) }, e.kind === 'tribute' ? `Pay ${e.gold}` : e.kind === 'joinwar' ? 'Join the war' : 'Accept'),
        h('button', { class: 'btn small ghost', onclick: () => act(D.answerEnvoy(s, i, false)) }, e.kind === 'tribute' ? 'Refuse' : 'Decline'))));
  });
  return out;
}

// ---------- map ----------
const SEASON_WASH = { spring: 'rgba(140,200,90,.07)', summer: 'rgba(255,205,110,.10)', autumn: 'rgba(214,110,40,.13)', winter: 'rgba(236,244,255,.30)' };
function mapTab(ctx) {
  const { app, s, ui } = ctx;
  const Z = D.sizeOf(s), W = 64, R = W / Math.sqrt(3);
  const vx = (cx, cy, i, k = 1) => { const a = Math.PI / 180 * (60 * i - 30); return [cx + R * k * Math.cos(a), cy + R * k * Math.sin(a)]; };
  const pts = (cx, cy, k = 1) => Array.from({ length: 6 }, (_, i) => vx(cx, cy, i, k).map((v) => v.toFixed(1)).join(',')).join(' ');
  const C = (id) => { const c = hexCenter(s.provs[id].q, s.provs[id].r); return [c.x * W, c.y * W]; };
  const edgeOf = (a, b) => { const [ax, ay] = C(a), [bx, by] = C(b); return ((Math.round(Math.atan2(by - ay, bx - ax) * 180 / Math.PI / 60) % 6) + 6) % 6; };
  const f1 = (n) => n.toFixed(1);
  const maxX = Z.cols + 0.5, maxY = (Z.rows - 1) * 0.866 + 1;
  const front = new Set(borders(s));
  const ov = ui.overlay, pol = ov === 'political', season = seasonOf(s.turn);
  const VW = Number((maxX * W).toFixed(0)), VH = Number((maxY * W).toFixed(0));
  const allPolys = [...(s.lakes || []).map(([lq, lr]) => { const c = hexCenter(lq, lr); return pts(c.x * W, c.y * W); }), ...s.provs.map((q) => { const c = hexCenter(q.q, q.r); return pts(c.x * W, c.y * W); })];
  let fills = '', lines = '', marks = '', top = '';
  for (const [lq, lr] of s.lakes || []) {
    const c = hexCenter(lq, lr), near = s.provs.some((x) => x.seen && Math.abs(x.r - lr) <= 1 && Math.abs(x.q - lq) <= 1);
    fills += near ? `<g class="lake"><polygon points="${pts(c.x * W, c.y * W)}"/><text x="${c.x * W}" y="${c.y * W + 2}">${(lq * 7 + lr) % 3 ? '🌊' : '🏔'}</text></g>`
      : `<g class="hex fog lakefog" aria-hidden="true"><polygon points="${pts(c.x * W, c.y * W)}" fill="url(#clouds)"/><polygon points="${pts(c.x * W, c.y * W)}" fill="url(#haze)"/></g>`;
  }
  const seenNear = (q) => D.neighbors(s, q.id).some((n) => s.provs[n].seen);
  for (const q of s.provs) {
    const [cx, cy] = C(q.id), fog = !q.seen;
    const wash = MP.WASH[q.terrain] || '#cbd193', tint = q.owner ? ownerColor(s, q) : null;
    let fill = fog ? 'url(#clouds)' : wash, op = 1;
    if (!fog && ov === 'growth') { fill = q.owner === 'you' ? (q.unrest >= DOMINION.unrestHalf ? '#d9473b' : q.unrest >= 25 ? '#e0a03a' : '#7fb24a') : '#c9b88e'; op = q.owner === 'you' ? 0.4 + q.dev * 0.12 : 0.85; }
    if (!fog && ov === 'resources') { fill = TERRAIN[q.terrain].color; op = 0.8; }
    const sel = q.id === ui.sel, threat = s.threat?.prov === q.id || s.battle?.prov === q.id;
    const wonder = WONDER_ORDER.find((w) => s.wonders[w]?.prov === q.id);
    const icon = fog ? '?' : ov === 'resources' ? (q.res ? RESOURCES[q.res].icon : q.special ? SPECIALS[q.special].icon : TERRAIN[q.terrain].icon)
      : ov === 'growth' ? (q.owner === 'you' ? String(q.dev) : '') : q.capital ? (q.capital === 'you' ? '🏰' : lordIcon(q.capital)) : q.camp ? '⛺' : wonder ? WONDERS[wonder].icon : q.buildings[0] ? BUILDINGS[q.buildings[0]].icon : q.res ? RESOURCES[q.res].icon : q.special ? SPECIALS[q.special].icon : TERRAIN[q.terrain].icon;
    const sub = fog ? '' : ov === 'growth' && q.owner === 'you' ? `${'●'.repeat(q.dev)}${q.unrest >= 25 ? ` 🔥${q.unrest}` : ''}` : '';
    fills += `<g class="hex${fog ? ' fog' : ''}${fog && seenNear(q) ? ' edge' : ''}${sel ? ' sel' : ''}${threat ? ' threat' : ''}${front.has(q.id) && !fog ? ' front' : ''}${q.owner === 'you' ? ' mine' : ''}" data-id="${q.id}" tabindex="0" role="button" aria-label="${esc(fog ? 'Unexplored land' : `${q.name}, ${ownerName(q)}, ${TERRAIN[q.terrain].name}`)}">`
      + `<polygon points="${pts(cx, cy)}" fill="${fill}" fill-opacity="${op}"/>`
      + (fog ? `<polygon points="${pts(cx, cy)}" fill="url(#haze)" />` : pol && tint ? `<polygon points="${pts(cx, cy)}" fill="${tint}" fill-opacity="${q.owner === 'you' ? 0.3 : 0.26}" />` : '')
      + (!fog && pol && q.owner && q.owner !== 'you' ? `<polygon points="${pts(cx, cy)}" fill="url(#hatch)" />` : '')
      + (!fog && ov !== 'growth' ? MP.glyphs(q.terrain, cx, cy, q.q, q.r) : '')
      + '</g>';
    if (fog) { marks += `<text x="${cx}" y="${cy + 3}" class="hi fogq" aria-hidden="true">?</text>`; continue; }
    // the province's own marks, above roads and borders
    let m = `<text x="${cx}" y="${cy + 2}" class="hi${ov === 'growth' ? ' num' : ''}">${esc(icon)}</text>`
      + `<text x="${cx}" y="${cy + 22}" class="hn">${esc(sub || (q.name.length > 10 ? q.name.slice(0, 9) + '…' : q.name))}</text>`;
    if (pol && q.owner === 'you' && !q.capital) {   // houses: the settlement grows with its development
      const n = q.dev, x0 = cx - (n - 1) * 3.6;
      for (let i = 0; i < n; i++) { const x = x0 + i * 7.2, y = cy + 13; m += `<path class="house" d="M${f1(x - 3)} ${f1(y)}h6v-3.6l-3-2.6-3 2.6z"/>`; }
    }
    if (pol && q.owner !== 'you') m += `<text x="${cx}" y="${cy - 16}" class="hp">${'◆'.repeat(Math.min(7, provPower(s, q)))}</text>`;
    if (pol && q.owner === 'you' && q.unrest >= DOMINION.unrestHalf) m += `<text x="${cx + 17}" y="${cy - 12}" class="hu">🔥</text>`;
    if (q.owner === 'you' && q.garrison) m += `<g class="gar" aria-hidden="true"><circle cx="${cx - 18}" cy="${cy - 13}" r="7.5"/><text x="${cx - 18}" y="${cy - 10}">${q.garrison}</text></g>`;
    if (q.owner === 'you' && q.focus) m += `<text x="${cx + 19}" y="${cy + 12}" class="hf">${D.FOCUS[q.focus].icon}</text>`;
    // a rival host at war, camped on your border
    const f = q.owner && q.owner !== 'you' ? factionOf(s, q.owner) : null;
    if (f?.stance === 'war' && D.neighbors(s, q.id).some((n) => s.provs[n].owner === 'you')) m += `<g class="host"><path d="M${f1(cx - 22)} ${f1(cy + 2)}v-15" stroke="#3b2a1a" stroke-width="1.6"/><path d="M${f1(cx - 22)} ${f1(cy - 13)}l9 3-9 3z" fill="${f.color}" stroke="#3b2a1a" stroke-width=".8"/></g>`;
    // what you can do next door: the odds of a strike, or a hall to settle
    if (pol && front.has(q.id) && !s.over && !s.battle) {
      if (!canAttack(s, q.id)) { const o = autoOdds(s, q.id), col = o >= 0.65 ? '#3f8f3a' : o >= 0.4 ? '#c98a1a' : '#b3362c'; m += `<g class="badge"><rect x="${cx + 6}" y="${cy - 27}" width="30" height="15" rx="7.5" fill="${col}"/><text x="${cx + 21}" y="${cy - 16}">⚔${Math.round(o * 100)}</text></g>`; }
      else if (!q.owner && !D.canSettle(s, q.id)) m += `<g class="badge"><rect x="${cx + 8}" y="${cy - 27}" width="22" height="15" rx="7.5" fill="#3a6f9e"/><text x="${cx + 19}" y="${cy - 16}">🏡</text></g>`;
    }
    marks += `<g class="pm" aria-hidden="true">${m}</g>`;
    // political borders: a coloured line along every edge where the land changes hands
    if (q.owner) {
      const nb = D.neighbors(s, q.id), byEdge = {};
      for (const n of nb) byEdge[edgeOf(q.id, n)] = n;
      for (let i = 0; i < 6; i++) {
        const n = byEdge[i];
        if (n !== undefined && s.provs[n].owner === q.owner) continue;
        const [x1, y1] = vx(cx, cy, i, 0.9), [x2, y2] = vx(cx, cy, (i + 1) % 6, 0.9);
        lines += `<path class="bd${q.owner === 'you' ? ' me' : ''}" d="M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}" stroke="${tint}"/>`;
      }
    }
    // rivers wind from one river or marsh province to the next
    if (q.terrain === 'river' || q.terrain === 'marsh') for (const n of D.neighbors(s, q.id)) {
      const o = s.provs[n];
      if (n < q.id || !o.seen || !(o.terrain === 'river' || (q.terrain === 'river' && o.terrain === 'marsh'))) continue;
      const [bx, by] = C(n), mx = (cx + bx) / 2, my = (cy + by) / 2, nx = -(by - cy) * 0.18, ny = (bx - cx) * 0.18;
      lines += `<path class="river" d="M${f1(cx + 9)} ${f1(cy + 6)}Q${f1(mx + nx)} ${f1(my + ny)} ${f1(bx + 9)} ${f1(by + 6)}"/>`;
    }
  }
  // the king's roads: every province joined to the capital through your own land
  let roads = '';
  for (const [id, from] of D.linked(s)) {
    if (from == null) continue;
    const [ax, ay] = C(from), [bx, by] = C(id);
    roads += `<path d="M${f1(ax)} ${f1(ay + 6)}Q${f1((ax + bx) / 2 + (by - ay) * 0.08)} ${f1((ay + by) / 2 + 6 - (bx - ax) * 0.08)} ${f1(bx)} ${f1(by + 6)}"/>`;
  }
  // marching hosts: the attack on you, and your own battle under way
  const arrow = (fromId, toId, cls) => { const [ax, ay] = C(fromId), [bx, by] = C(toId), k = 0.62; return `<path class="march ${cls}" d="M${f1(ax)} ${f1(ay)}L${f1(ax + (bx - ax) * k)} ${f1(ay + (by - ay) * k)}" marker-end="url(#arrow-${cls})"/>`; };
  if (s.threat) { const src = D.neighbors(s, s.threat.prov).find((n) => s.provs[n].owner === s.threat.faction); if (src !== undefined) top += arrow(src, s.threat.prov, 'foe'); }
  if (s.battle && s.battle.kind === 'attack') { const src = D.neighbors(s, s.battle.prov).find((n) => s.provs[n].owner === 'you'); if (src !== undefined) top += arrow(src, s.battle.prov, 'mine'); }
  const cap = s.provs.find((p) => p.capital === 'you');
  if (cap && !s.over && s.armies > 0) { const [cx, cy] = C(cap.id); top += `<g class="host mine" aria-hidden="true"><path d="M${f1(cx + 22)} ${f1(cy + 4)}v-17" stroke="#3b2a1a" stroke-width="1.8"/><path d="M${f1(cx + 22)} ${f1(cy - 13)}l11 3.5-11 3.5z" fill="${YOU}" stroke="#3b2a1a" stroke-width=".8"/><text x="${f1(cx + 28)}" y="${f1(cy + 4)}" class="armyn">${s.armies}</text></g>`; }
  const MX = 44, MT = 52, MB = 44, TW = VW + 2 * MX, TH = VH + MT + MB;
  const seasonLayer = `<g class="season ${season.id}" pointer-events="none" aria-hidden="true"><rect x="-80" y="-80" width="${TW + 160}" height="${TH + 160}" fill="${SEASON_WASH[season.id]}"/>${season.id === 'winter' ? `<rect class="fall" x="-80" y="-140" width="${TW + 160}" height="${TH + 300}" fill="url(#snow)"/>` : season.id === 'autumn' ? `<rect class="fall slow" x="-80" y="-140" width="${TW + 160}" height="${TH + 300}" fill="url(#leaves)"/>` : ''}</g>`;
  const zoom = ui.zoom || 1;
  const svgHtml = `<svg style="width:${Math.round(zoom * 100)}%" viewBox="0 0 ${TW} ${TH}" role="group" aria-label="Campaign map">${MP.defs}${MP.moreDefs}<g transform="translate(${MX} ${MT})">${MP.sea(allPolys, VW, VH)}${fills}<g class="roads" aria-hidden="true">${roads}</g><g class="lines" aria-hidden="true">${lines}</g>${marks}${top}</g>${seasonLayer}${MP.decor(TW, TH, 'The Dominion War', `Turn ${s.turn} · ${season.icon} ${season.name} · as surveyed by the Royal Cartographers`)}</svg>`;
  const scroll = h('div', { class: 'dom-mapscroll', html: svgHtml });
  const map = h('div', { class: 'dom-map plaque' + (D.goldenAge(s) ? ' golden' : '') }, scroll,
    h('div', { class: 'dom-zoom' }, h('button', { class: 'btn small ghost', 'aria-label': 'Zoom in', onclick: () => setZoom(zoom * 1.35) }, '+'), h('button', { class: 'btn small ghost', 'aria-label': 'Zoom out', onclick: () => setZoom(zoom / 1.35) }, '−')));
  const setZoom = (z) => {
    const svg = scroll.querySelector('svg'), old = ui.zoom || 1;
    ui.zoom = Math.max(1, Math.min(3, z));
    const cxr = (scroll.scrollLeft + scroll.clientWidth / 2) / Math.max(1, scroll.scrollWidth), cyr = (scroll.scrollTop + scroll.clientHeight / 2) / Math.max(1, scroll.scrollHeight);
    svg.style.width = Math.round(ui.zoom * 100) + '%';
    if (ui.zoom !== old) requestAnimationFrame(() => { scroll.scrollLeft = cxr * scroll.scrollWidth - scroll.clientWidth / 2; scroll.scrollTop = cxr >= 0 ? cyr * scroll.scrollHeight - scroll.clientHeight / 2 : 0; });
  };
  // pinch the map to zoom it (two fingers); one finger scrolls it as usual
  const touch = new Map(); let pinch0 = null;
  scroll.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; touch.set(e.pointerId, [e.clientX, e.clientY]); if (touch.size === 2) { const [a, b] = [...touch.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: ui.zoom || 1 }; } });
  scroll.addEventListener('pointermove', (e) => { if (!touch.has(e.pointerId)) return; touch.set(e.pointerId, [e.clientX, e.clientY]); if (touch.size === 2 && pinch0) { const [a, b] = [...touch.values()]; setZoom(pinch0.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / Math.max(20, pinch0.d)); } });
  const lift = (e) => { touch.delete(e.pointerId); if (touch.size < 2) pinch0 = null; };
  scroll.addEventListener('pointerup', lift); scroll.addEventListener('pointercancel', lift);
  const pickHex = (e) => { if (pinch0) return; const g = e.target.closest('.hex'); if (!g || g.dataset.id == null) return; ui.mapScroll = [scroll.scrollLeft, scroll.scrollTop]; ui.sel = Number(g.dataset.id); ui.extra = 0; sfx('click'); dominionScreen(app, { keep: true }); };
  scroll.addEventListener('click', pickHex);
  scroll.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickHex(e); } });
  if (ui.mapScroll) { const [l, t] = ui.mapScroll; requestAnimationFrame(() => { scroll.scrollLeft = l; scroll.scrollTop = t; }); }
  else {   // open on the selected province (your capital at first), wherever it lies on a zoomed-in map
    const [fx, fy] = C(s.provs[ui.sel]?.id ?? 0);
    requestAnimationFrame(() => { scroll.scrollLeft = (MX + fx) / TW * scroll.scrollWidth - scroll.clientWidth / 2; scroll.scrollTop = (MT + fy) / TH * scroll.scrollHeight - scroll.clientHeight / 2; });
  }
  const overlays = h('div', { class: 'seg dom-overlay' }, [['political', 'Realms'], ['resources', 'Land & resources'], ['growth', 'Growth & unrest']].map(([id, name]) =>
    h('button', { 'aria-pressed': String(ov === id), onclick: () => { ui.overlay = id; dominionScreen(app, { keep: true }); } }, name)));
  const legend = h('div', { class: 'dom-legend muted' }, h('span', {}, h('i', { style: { background: YOU } }), 'You'),
    ...s.factions.map((f) => h('span', { class: f.alive ? '' : 'gone' }, h('i', { style: { background: rivalColor(s, f.id) } }), D.met(s, f.id) ? `${lordIcon(f.id)} ${lordName(f.id)}${f.alive ? ` · ${STANCE[f.stance].label.toLowerCase()}` : ' · broken'}` : '❔ unknown')),
    h('span', {}, '◆ strength · ⚔% odds · 🛤 roads · ⛺ barbarians'));
  const log = h('div', { class: 'plaque dom-log' }, h('h3', {}, 'Chronicle'), s.log.slice(0, 8).map((l) => h('div', { class: 'dl ' + l.kind }, h('small', {}, `T${l.turn}`), ' ', l.text)),
    h('button', { class: 'btn small ghost', onclick: () => { ui.tab = 'nations'; dominionScreen(app); } }, 'Full chronicle ›'));
  const q = s.provs[ui.sel];
  return h('div', {}, advisorCard(ctx), h('div', { class: 'dom-grid' }, h('div', {}, overlays, map, quickBar(ctx, q), legend), provincePanel(ctx, q)), log);
}

// The advisor: a few things worth doing now, each a tap away.
function advisorCard(ctx) {
  const { app, s, ui } = ctx;
  const tips = D.advice(s).filter((t) => !t.urgent);   // the urgent ones already stand in the banners above
  if (!tips.length) return null;
  return h('div', { class: 'plaque dom-advisor' }, h('b', { class: 'da-title' }, '🦉 Your advisor'),
    h('div', { class: 'da-list' }, tips.slice(0, 3).map((t) => h('button', { class: 'da-tip' + (t.urgent ? ' urgent' : ''), onclick: () => { ui.tab = t.tab; if (t.prov != null) ui.sel = t.prov; ui.mapScroll = null; dominionScreen(app); if (t.prov != null) requestAnimationFrame(() => document.querySelector('.dom-quick')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); } }, h('span', { 'aria-hidden': 'true' }, t.icon), ' ', t.text))));
}

// Under the map: the selected province and its main moves, so a phone never has to scroll for them.
function quickBar(ctx, q) {
  const { app, s, ui, act } = ctx;
  if (!q || !q.seen || s.over) return null;
  const mine = q.owner === 'you', kids = [h('b', { class: 'dq-name' }, `${q.capital ? (q.capital === 'you' ? '🏰 ' : lordIcon(q.capital) + ' ') : ''}${q.name}`), h('small', { class: 'muted' }, mine ? `●${q.dev} · unrest ${q.unrest}` : `${ownerName(q)} · ◆${provPower(s, q)}`)];
  if (!mine) {
    const why = canAttack(s, q.id);
    if (!why) kids.push(h('button', { class: 'btn small gold', onclick: () => launch(app, s, q.id, 'attack') }, '⚔ Fight'),
      h('button', { class: 'btn small', onclick: () => { const r = autoResolve(s, q.id, ui.extra); ui.extra = 0; battleFx(s, r, q.name); act(r); } }, `🎲 ${pct(autoOdds(s, q.id, ui.extra))}`));
    if (!q.owner && !D.canSettle(s, q.id)) kids.push(h('button', { class: 'btn small', onclick: () => act(D.settle(s, q.id), `🏡 Settlers raise a hall in ${q.name}.`, 'claim') }, `🏡 ${D.settleCost(s, q)}`));
    if (why && D.canSettle(s, q.id)) kids.push(h('small', { class: 'dom-why' }, why));
  } else {
    if (q.dev < 5) kids.push(h('button', { class: 'btn small', disabled: s.orders < 1 || s.gold < D.developCost(s, q), onclick: () => act(D.develop(s, q.id), null, 'upgrade') }, `📈 ${D.developCost(s, q)}`));
    kids.push(h('button', { class: 'btn small ghost', onclick: () => document.querySelector('.dom-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 'Details ↓'));
  }
  return h('div', { class: 'plaque dom-quick' }, kids);
}

// Why the odds are what they are, line by line.
function oddsList(s, id, extra, kind) {
  const O = D.oddsParts(s, id, extra, kind);
  return h('details', { class: 'dom-odds' }, h('summary', {}, `Why ${pct(O.odds)}?`),
    h('div', { class: 'dom-facts' }, O.parts.map(([k, v]) => h('div', {}, h('span', {}, k), h('b', { class: v < 0 ? 'neg' : '' }, `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`))),
      O.raw !== O.odds ? h('div', {}, h('span', {}, 'Never better than 88%, never worse than 5%'), h('b', {}, pct(O.odds))) : null));
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
    q.camp ? ['Barbarians', `⛺ A war camp: it raids your land beside it. Take it for ${D.CAMP.loot} gold of plunder and glory.`] : null,
    mine && q.capital !== 'you' ? ['Road', D.linked(s).has(q.id) ? `🛤 Linked to your capital (+${D.ROAD.gold} gold)` : `⛔ Cut off from your capital (+${D.ROAD.cutoff} unrest a turn)`] : null,
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
      f && f.stance !== 'war' && f.alive ? h('button', { class: 'btn small red', onclick: async () => { if (await confirmBox(`Declare war on ${lordName(f.id)}?${f.stance === 'alliance' || f.treaty > s.turn ? ' You would break your oath, and every nation will remember.' : ''}`, 'Declare war', true)) act(D.declareWar(s, f.id), null, 'horn'); } }, `⚔ Declare war on ${lordName(f.id)}`) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn gold', disabled: !!why, onclick: () => launch(app, s, q.id, 'attack') }, '⚔ Fight the battle'),
        h('button', { class: 'btn', disabled: !!why || s.levy < attackCost(s, q) + ui.extra, onclick: () => { const r = autoResolve(s, q.id, ui.extra); ui.extra = 0; battleFx(s, r, q.name); act(r); } }, `🎲 Auto-resolve · ${pct(autoOdds(s, q.id, ui.extra))}`),
        why ? null : levyStepper(s, ui, rerender, attackCost(s, q))),
      why ? null : oddsList(s, q.id, ui.extra, 'attack'),
      !q.owner ? h('div', { class: 'row' }, h('button', { class: 'btn small', disabled: !!settleWhy, title: settleWhy || '', onclick: () => act(D.settle(s, q.id), null, 'claim') }, `🏡 Settle it · ${D.settleCost(s, q)} 🪙`), settleWhy ? h('small', { class: 'muted' }, settleWhy) : h('small', { class: 'muted' }, 'No battle: an order and gold.')) : null,
      h('div', { class: 'row' }, h('button', { class: 'btn small ghost', disabled: s.orders < 1 && !has(s, 'cartography'), onclick: () => act(D.scout(s, q.id)) }, `🔭 Scout around${has(s, 'cartography') ? ' (free)' : ''}`))));
  } else {
    // focus and garrison: free, and changed any time
    kids.push(h('h4', {}, 'Focus · free to change'), h('div', { class: 'seg dom-focus' },
      h('button', { 'aria-pressed': String(!q.focus), onclick: () => act(D.setFocus(s, q.id, null), null, 'click') }, '— None'),
      Object.entries(D.FOCUS).map(([id, F]) => h('button', { 'aria-pressed': String(q.focus === id), title: F.desc, onclick: () => act(D.setFocus(s, q.id, id), null, 'click') }, `${F.icon} ${F.name}`))),
      h('small', { class: 'muted' }, q.focus ? D.FOCUS[q.focus].desc : 'Pick what this province works for.'));
    kids.push(h('h4', {}, `Garrison · ${q.garrison || 0}/${D.GARRISON_MAX}`), h('div', { class: 'row' },
      h('button', { class: 'btn small ghost', disabled: !q.garrison, 'aria-label': 'Fewer guards', onclick: () => act(D.station(s, q.id, -1), null, 'click') }, '−'),
      h('span', { class: 'dom-gar' }, '🛡'.repeat(q.garrison || 0) || 'none'),
      h('button', { class: 'btn small ghost', disabled: (q.garrison || 0) >= D.GARRISON_MAX || s.levy < 1, 'aria-label': 'More guards', onclick: () => act(D.station(s, q.id, 1), null, 'click') }, '+'),
      h('small', { class: 'muted' }, 'Levies on guard: harder to attack, +4% odds and +4% castle health each when defending; 3 or more beat off barbarian raids.')));
    if (q.buildings.length < D.slotsOf(q)) {
      const opts = Object.entries(BUILDINGS).filter(([b, B]) => !D.hasB(q, b) && (!B.lands || B.lands.includes(q.terrain)) && (!B.needs || has(s, B.needs) || (b === 'harbor' && s.nation === 'river')));
      const later = Object.entries(BUILDINGS).filter(([b, B]) => B.needs && !has(s, B.needs) && !(b === 'harbor' && s.nation === 'river')).map(([, B]) => `${B.icon} ${B.name} (${TECHS[B.needs].name})`);
      kids.push(h('h4', {}, `Build · ${q.buildings.length}/${D.slotsOf(q)} slots (an order)`), h('div', { class: 'dom-builds' }, opts.map(([b, B]) => {
        const why = D.canBuild(s, q.id, b);
        return h('button', { class: 'opt', disabled: !!why, title: why || '', onclick: () => act(D.build(s, q.id, b), null, 'build') }, h('span', { class: 'box' }, B.icon),
          h('span', {}, h('b', {}, `${B.name} · ${D.buildCost(s, b)} 🪙`), h('small', {}, B.desc)), h('span', {}));
      })), later.length ? h('small', { class: 'muted' }, `Research unlocks more: ${later.join(', ')}.`) : null);
    } else kids.push(h('p', { class: 'muted' }, `Every slot is built. Develop ${q.name} to open another (at development 2 and 4).`));
    kids.push(h('div', { class: 'row' },
      q.dev < 5 ? h('button', { class: 'btn small', disabled: s.orders < 1 || s.gold < D.developCost(s, q), onclick: () => act(D.develop(s, q.id), null, 'upgrade') }, `📈 Develop · ${D.developCost(s, q)} 🪙`) : null,
      h('button', { class: 'btn small', disabled: s.orders < 1, onclick: () => act(D.muster(s), null, 'muster') }, `📯 Muster (+${D.musterSize(s)} levies)`),
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
  const G = s.general, GT = G && D.GENERAL_TRAITS[G.trait];
  const marshal = G ? h('div', { class: 'plaque dom-card dom-marshal' }, h('h3', {}, '🎖 Your Marshal'),
    h('div', { class: 'row' }, h('span', { class: 'dm-face', 'aria-hidden': 'true' }, ['🛡', '⚔', '🎖', '🏅', '👑'][G.rank - 1]), h('div', {}, h('b', {}, G.name), h('div', { class: 'muted' }, `${D.RANK_NAMES[G.rank - 1]} ${'★'.repeat(G.rank)}${'☆'.repeat(D.GENERAL.ranks - G.rank)} · ${G.wins || 0} victories`))),
    h('p', {}, `${GT.icon} ${GT.name}: ${GT.desc}`),
    G.rank < D.GENERAL.ranks ? [h('div', { class: 'dom-bar' }, h('i', { style: { width: `${Math.round(G.xp / D.rankNeed(G.rank) * 100)}%` } })), h('small', { class: 'muted' }, `${G.xp}/${D.rankNeed(G.rank)} to ${D.RANK_NAMES[G.rank]}: battles teach (a fought one most).`)] : h('small', { class: 'muted' }, 'The highest rank in the land.'),
    h('small', { class: 'muted' }, `Each rank above the first: +${Math.round(D.GENERAL.perRank * 100)}% auto-resolve odds, +${D.GENERAL.gold} starting gold and +${Math.round(D.GENERAL.dmg * 100)}% tower damage in battle.`)) : null;
  const glory = h('div', { class: 'plaque dom-card' }, h('h3', {}, D.goldenAge(s) ? `✨ A Golden Age · ${s.golden - s.turn + 1} turn${s.golden - s.turn ? 's' : ''} left` : `✨ Glory · ${s.glory}/${D.GLORY.max}`),
    D.goldenAge(s) ? h('p', {}, 'Gold and lore +25%, unrest falls 3 faster, and every province grows faster.') : h('div', { class: 'dom-bar gold' }, h('i', { style: { width: `${s.glory}%` } })),
    h('small', { class: 'muted' }, `Glory comes from victories (+${D.GLORY.won}), held provinces (+${D.GLORY.held}), stormed capitals (+${D.GLORY.razed}), Wonders (+${D.GLORY.wonder}), decrees (+${D.GLORY.quest}), scattered barbarians (+${D.GLORY.camp}) and great techs. At ${D.GLORY.max}, a Golden Age of ${D.GLORY.turns} turns begins.`));
  return h('div', { class: 'dom-cards' }, treasury, glory, marshal, tax, nation, policies, market, resources, table);
}

// ---------- research ----------
// The tree as four ages side by side (stacked on a phone). Every card shows how close your lore is to it.
function researchTab({ s, act }) {
  const inc = income(s).lore;
  const tiers = [1, 2, 3, 4].map((tier) => h('div', { class: 'dom-tier' }, h('h4', {}, ['', '① First age', '② Second age', '③ Third age', '④ The crown of the age'][tier]),
    TECH_ORDER.filter((t) => TECHS[t].tier === tier).map((t) => {
      const T = TECHS[t], why = D.canResearch(s, t), known = has(s, t), cost = D.techCost(s, t);
      const locked = !known && (T.needs.some((n) => !has(s, n)) || (T.needsT3 && s.techs.filter((x) => TECHS[x].tier === 3).length < T.needsT3));
      const frac = known ? 1 : Math.min(1, s.lore / cost), turns = !known && !locked && s.lore < cost && inc > 0 ? Math.ceil((cost - s.lore) / inc) : 0;
      const rivals = D.alive(s).filter((f) => f.techs.includes(t) && D.met(s, f.id));
      return h('div', { class: 'dom-tech' + (known ? ' done' : locked ? ' locked' : why ? '' : ' ready') + (t === 'ascendancy' ? ' star' : '') },
        h('div', { class: 'row' }, h('b', {}, `${T.icon} ${T.name}`), h('span', { class: 'spacer' }), known ? h('span', { class: 'chip' }, '✓') : h('small', {}, `${cost} 📜`)),
        h('small', {}, T.desc),
        locked ? h('small', { class: 'muted' }, `🔒 Needs ${[...T.needs.filter((n) => !has(s, n)).map((n) => TECHS[n].name), T.needsT3 ? `${T.needsT3} third-age techs` : null].filter(Boolean).join(', ')}`) : null,
        known ? null : h('div', { class: 'dom-bar lore' }, h('i', { style: { width: `${Math.round(frac * 100)}%` } })),
        rivals.length ? h('small', { class: 'muted' }, `Known to ${rivals.map((f) => lordIcon(f.id)).join(' ')}`) : null,
        known || locked ? null : why ? h('small', { class: 'muted' }, turns ? `≈ ${turns} turn${turns === 1 ? '' : 's'} of lore` : why) : h('button', { class: 'btn small gold', onclick: () => act(D.research(s, t), `${T.icon} ${T.name} mastered.`, 'upgrade') }, 'Learn'));
    })));
  const race = D.alive(s).filter((f) => D.met(s, f.id)).map((f) => h('span', { class: 'chip' }, `${lordIcon(f.id)} ${f.techs.length} techs${f.techs.includes('crown') ? ' · the Crown!' : ''}`));
  return h('div', {}, h('p', { class: 'muted' }, `📜 ${s.lore} lore, +${inc} a turn. Learning takes no order and grows dearer as your realm grows. Ascendancy wins the Science victory. Third- and fourth-age techs bring ✨ glory.`),
    race.length ? h('div', { class: 'row dom-race' }, h('small', { class: 'muted' }, 'The race:'), race) : null, h('div', { class: 'dom-tree' }, tiers));
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
      actions.push(h('button', { class: 'btn small gold', disabled: !!why, onclick: () => { const r = D.offerPeace(s, f.id); if (r.accepted) splash('🕊', `Peace with ${lordName(f.id)}`, '', 'won'); act(r, r.accepted === false ? `${lordName(f.id)} refuses.` : null, r.accepted ? 'rally' : 'error'); } }, `🕊 Offer peace · ${pct(D.peaceOdds(s, f))}`));
      actions.push(h('button', { class: 'btn small', disabled: !!why || s.gold < 100, onclick: () => act(D.offerPeace(s, f.id, 100)) }, `🕊 Peace + 100 🪙 · ${pct(D.peaceOdds(s, f, 100))}`));
    } else {
      if (!f.trade) actions.push(h('button', { class: 'btn small gold', disabled: !!why, onclick: () => act(D.proposeTrade(s, f.id)) }, `🤝 Propose trade · ${pct(D.tradeOdds(s, f))}`));
      else actions.push(h('button', { class: 'btn small ghost', onclick: () => act(D.cancelTrade(s, f.id)) }, 'End trade'));
      if (f.stance === 'peace') actions.push(h('button', { class: 'btn small', disabled: !!why || D.allyOdds(s, f) <= 0, title: D.allyOdds(s, f) <= 0 ? 'They need to be friendlier (35+).' : '', onclick: () => act(D.proposeAlliance(s, f.id)) }, `🛡 Propose alliance · ${pct(D.allyOdds(s, f))}`));
      actions.push(h('button', { class: 'btn small red', onclick: async () => { if (await confirmBox(`Declare war on ${lordName(f.id)}?${f.stance === 'alliance' || f.treaty > s.turn ? ' You would break your oath, and every nation will remember.' : ''}`, 'Declare war', true)) act(D.declareWar(s, f.id), null, 'horn'); } }, '⚔ Declare war'));
    }
    actions.push(h('button', { class: 'btn small ghost', disabled: !!why || s.gold < D.GIFT, onclick: () => act(D.sendGift(s, f.id)) }, `🎁 Gift ${D.GIFT} 🪙`));
    const wars = s.rivalWars.filter((w) => w.includes(f.id)).map((w) => lordName(w[0] === f.id ? w[1] : w[0]));
    return h('div', { class: 'plaque dom-rival', style: { borderLeftColor: rivalColor(s, f.id) } },
      h('div', { class: 'row' }, h('span', { class: 'dom-face', 'aria-hidden': 'true' }, lordIcon(f.id), h('i', {}, mood(rel))), h('h3', {}, lordName(f.id)), h('span', { class: 'spacer' }), h('span', { class: 'chip stance ' + STANCE[f.stance].cls }, STANCE[f.stance].label)),
      h('p', { class: 'quote' }, quoteOf(s, f)),
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
  return h('div', {}, h('h3', {}, 'The ways to win'), vic, historyChart(s),
    h('h3', {}, 'The nations'), h('div', { class: 'plaque dom-table-wrap' }, h('table', { class: 'dom-table' }, h('thead', {}, h('tr', {}, ['#', 'Nation', 'Score', 'Land', 'Dev', 'Techs', 'Wonders', 'Might'].map((t) => h('th', {}, t)))), h('tbody', {}, rows))),
    h('div', { class: 'plaque dom-log' }, h('h3', {}, 'Chronicle'), s.log.map((l) => h('div', { class: 'dl ' + l.kind }, h('small', {}, `T${l.turn}`), ' ', l.text))));
}

// Score over the turns, one line a nation (rivals you have not met stay hidden).
function historyChart(s) {
  const H = (s.history || []).filter((r) => r && r.sc);
  if (H.length < 2) return null;
  const who = ['you', ...s.factions.filter((f) => D.met(s, f.id)).map((f) => f.id)];
  const W = 320, Hh = 150, P = 26, T0 = H[0].t, T1 = H[H.length - 1].t || T0 + 1;
  let max = 10; for (const r of H) for (const k of who) max = Math.max(max, r.sc[k] || 0);
  const x = (t) => P + (W - P - 8) * (t - T0) / Math.max(1, T1 - T0), y = (v) => Hh - 18 - (Hh - 30) * v / max;
  const line = (k) => { const pts = H.filter((r) => r.sc[k] != null).map((r) => `${x(r.t).toFixed(1)},${y(r.sc[k]).toFixed(1)}`); return pts.length > 1 ? `<polyline points="${pts.join(' ')}" fill="none" stroke="${k === 'you' ? YOU : rivalColor(s, k)}" stroke-width="${k === 'you' ? 3 : 2}" stroke-linejoin="round" stroke-linecap="round"/>` : ''; };
  const grid = [0, 0.5, 1].map((f) => `<line x1="${P}" x2="${W - 8}" y1="${y(max * f).toFixed(1)}" y2="${y(max * f).toFixed(1)}" stroke="rgba(255,255,255,.12)"/><text x="${P - 4}" y="${(y(max * f) + 3).toFixed(1)}" text-anchor="end">${Math.round(max * f)}</text>`).join('');
  const svg = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Score over the turns">${grid}<text x="${P}" y="${Hh - 4}">T${T0}</text><text x="${W - 8}" y="${Hh - 4}" text-anchor="end">T${T1}</text>${who.map(line).join('')}</svg>`;
  return h('div', { class: 'plaque dom-chart' }, h('h3', {}, '📈 The race over the turns'), h('div', { html: svg }),
    h('div', { class: 'dom-legend muted' }, who.map((k) => h('span', {}, h('i', { style: { background: k === 'you' ? YOU : rivalColor(s, k) } }), k === 'you' ? 'You' : `${lordIcon(k)} ${lordName(k)}`))));
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
  const glory0 = s.golden;
  const r = D.endTurn(s);
  if (r.error) { sfx('error'); toast(r.error); return; }
  save();
  if (app.domUi) { app.domUi.extra = 0; app.domUi.mapScroll = null; }
  dominionScreen(app);
  sfx(r.threat || r.wars.length ? 'horn' : 'tick', 'tap');
  const season = seasonOf(s.turn), I = r.income;
  const row = (icon, text, cls = '') => h('div', { class: 'tr-row ' + cls }, h('span', { class: 'tr-i', 'aria-hidden': 'true' }, icon), h('span', {}, text));
  const rows = [];
  if (r.forced) rows.push(row(r.forced.victory ? '🛡' : '🔥', r.forced.victory ? `${r.forced.name} held without you.` : `${r.forced.name} fell while you were away.`, r.forced.victory ? 'good' : 'bad'));
  for (const w of r.wars) rows.push(row('⚔', `${lordName(w)} declared war on you!`, 'bad'));
  if (r.threat) rows.push(row('🔥', `${lordName(r.threat.faction)} marches on ${s.provs[r.threat.prov].name}!`, 'bad'));
  for (const n of r.revolts) rows.push(row('🔥', `${n} revolted!`, 'bad'));
  for (const n of r.raids || []) rows.push(row('⛺', `Barbarians raided ${n}.`, 'bad'));
  if (r.grew.length) rows.push(row('📈', `${r.grew.join(', ')} grew.`, 'good'));
  if (r.quest?.done) rows.push(row('📯', `Decree fulfilled: ${r.quest.text}.`, 'good'));
  if (r.quest?.lapsed) rows.push(row('📯', `The decree lapsed: ${r.quest.text}.`, 'bad'));
  if (r.newQuest) rows.push(row('📯', `A new decree: ${D.questProgress(s)?.text} by turn ${r.newQuest.deadline}.`));
  if (r.dilemma?.text) rows.push(row(r.dilemma.icon || '❓', `${r.dilemma.title ? r.dilemma.title + ': ' : ''}${r.dilemma.text}`));
  if (r.newDilemma) rows.push(row(D.dilemmaById(r.newDilemma)?.icon || '❓', `A choice awaits: ${D.dilemmaById(r.newDilemma)?.title}.`));
  for (const e of r.events) rows.push(row('📰', e));
  if (r.disbanded) rows.push(row('🏠', `${r.disbanded} levies went home (your land feeds ${D.levyCap(s)}).`));
  if (s.envoys.length) rows.push(row('📜', `${s.envoys.length} envoy${s.envoys.length > 1 ? 's' : ''} await your answer.`));
  if (s.golden !== glory0 && D.goldenAge(s)) rows.unshift(row('✨', 'A Golden Age dawns!', 'good'));
  const chip = (icon, v) => h('span', { class: 'tr-chip' + (v < 0 ? ' neg' : '') }, icon, ' ', `${v >= 0 ? '+' : ''}${v}`);
  let m;
  m = modal(h('div', { class: 'dom-report ' + season.id }, h('div', { class: 'tr-head' }, h('span', { class: 'tr-season', 'aria-hidden': 'true' }, season.icon), h('div', {}, h('h2', {}, `Turn ${s.turn}${s.turnLimit ? ` of ${s.turnLimit}` : ''}`), h('small', { class: 'muted' }, `${season.name}: ${season.desc}`))),
    I ? h('div', { class: 'tr-chips' }, chip('🪙', I.net), chip('⚔', I.levy), chip('📜', I.lore)) : null,
    rows.length ? h('div', { class: 'tr-rows' }, rows) : h('p', { class: 'muted' }, 'A quiet turn across the land.'),
    s.over ? null : h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn gold', onclick: () => m.close() }, 'To the map'))), { wide: false });
  if (s.over) { m.close(); sfx(s.over.won ? 'achievement' : 'gameover', 'record'); splash(s.over.won ? VICTORIES[s.over.how].icon : '💀', s.over.won ? `${VICTORIES[s.over.how].name} victory!` : 'The war is lost', `Score ${fmt(s.over.score)}`, s.over.won ? 'golden' : 'lost'); }
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
      h('li', {}, h('b', {}, 'The living realm. '), 'Your Marshal rises in rank with every battle. Win glory to start a Golden Age. Give each province a focus, station levies as a garrison, and keep your land joined to the capital by road (cut-off land grows restless). Barbarians camp on free land and raid your border until someone takes their province. The crown sends decrees to meet, and dilemmas to decide. The 🦉 advisor points at what is worth doing.'),
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
