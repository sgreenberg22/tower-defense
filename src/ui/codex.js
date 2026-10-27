// The Codex: an encyclopedia of every emplacement, foe, boss, weapon, castle art, boon, threat, land and rule.
// Foes, bosses and emplacements carry bronze / silver / gold medals that pay Renown the first time they are earned.
import { h, fmt, bar } from './dom.js';
import { drawIcon } from '../game/render.js';
import { ENEMIES, BOSSES } from '../data/balance.js';
import { CODEX_TABS, codexEntries } from '../meta/codex.js';
import { MEDAL_TIERS, subjectFor, tiersFor, codexProgress, medalBonus, CODEX_TITLES } from '../meta/medals.js';
import { mapThumb } from './screens.js';
import { collectionBar } from './hubs.js';

const screen = () => document.getElementById('screen');
const RARITY_ICON = { common: '⚪', rare: '🔵', epic: '🟣' };

function pictureFor(e) {
  if (e.kind === 'tower') { const c = h('canvas', { class: 'cx-pic' }); drawIcon(c, 'tower', e.id, { size: 64 }); return c; }
  if (e.kind === 'troop') { const c = h('canvas', { class: 'cx-pic' }); drawIcon(c, 'troop', e.id, { size: 64 }); return c; }
  if (e.kind === 'foe') { const c = h('canvas', { class: 'cx-pic' }); drawIcon(c, 'enemy', e.id, { def: ENEMIES[e.id], size: 64 }); return c; }
  if (e.kind === 'boss') { const c = h('canvas', { class: 'cx-pic' }); drawIcon(c, 'enemy', 'boss:' + e.id, { def: BOSSES.find((b) => b.id === e.id), size: 72 }); return c; }
  if (e.kind === 'land') { const c = mapThumb(e.id, 'preview', 120); c.className = 'cx-pic land'; return c; }
  const glyph = e.icon || { weapon: '🏹', boon: RARITY_ICON[e.rarity] || '📜', modifier: '🎲', rule: '📖' }[e.kind] || '📖';
  return h('div', { class: 'cx-pic glyph ' + (e.rarity || '') }, glyph);
}

// Medal pips for one subject, with the next goal in the tooltip.
function medalPips(p, key) {
  const s = subjectFor(key);
  if (!s) return null;
  const have = tiersFor(p, s), v = s.stat(p);
  const next = s.goals[have];
  return h('span', { class: 'medals', title: next ? `${fmt(v)} ${s.verb}. Next medal at ${fmt(next)}.` : `${fmt(v)} ${s.verb}. All medals earned.` },
    MEDAL_TIERS.map((m, i) => h('i', { class: 'pip ' + m.id + (i < have ? ' on' : ''), 'aria-hidden': 'true' })),
    h('span', { class: 'sr' }, `${have} of ${MEDAL_TIERS.length} medals`));
}

function statLine(p, e) {
  if (e.kind === 'foe' || e.kind === 'boss') { const n = p.stats.killsByType?.[e.killKey] || 0; return n ? `${fmt(n)} defeated` : 'Not yet met'; }
  if (e.kind === 'tower') { const n = p.stats.builtByTower?.[e.id] || 0; return n ? `${fmt(n)} built` : 'Never built'; }
  return null;
}

function entryCard(p, e, open, onToggle) {
  const key = e.kind === 'foe' ? 'foe:' + e.id : e.kind === 'boss' ? 'boss:' + e.id : e.kind === 'tower' ? 'tower:' + e.id : null;
  const stat = statLine(p, e);
  const facts = e.facts || [];
  const quick = facts.slice(0, 3);
  const details = [];
  if (open) {
    if (facts.length > 3) details.push(h('dl', { class: 'cx-facts' }, facts.slice(3).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
    if (e.traits?.length) details.push(h('ul', { class: 'cx-list' }, e.traits.map((t) => h('li', {}, t))));
    if (e.specs?.length) details.push(h('div', { class: 'cx-sub' }, h('b', {}, 'Tier 5 specializations'), h('ul', { class: 'cx-list' }, e.specs.map((s) => h('li', {}, h('b', {}, s.name + ': '), s.desc)))));
    if (e.perks?.length) details.push(h('div', { class: 'cx-sub' }, h('b', {}, 'Mastery perks'), h('ul', { class: 'cx-list' }, e.perks.map((s) => h('li', {}, h('b', {}, `★${s.stars} ${s.name}: `), s.desc)))));
    if (e.extras?.length) details.push(h('ul', { class: 'cx-list' }, e.extras.map((t) => h('li', {}, t))));
    if (e.tip) details.push(h('p', { class: 'cx-tip' }, '💡 ' + e.tip));
  }
  return h('article', { class: 'cx-card ' + e.kind + (open ? ' open' : '') + (stat === 'Not yet met' ? ' unmet' : '') },
    h('button', { class: 'cx-head', 'aria-expanded': String(open), onclick: onToggle },
      pictureFor(e),
      h('span', { class: 'cx-title' },
        h('b', {}, e.name),
        h('span', { class: 'cx-meta' }, key ? medalPips(p, key) : null, stat ? h('small', { class: 'muted' }, stat) : null),
        h('small', { class: 'cx-blurb' }, e.blurb)),
      h('span', { class: 'chev' }, '▾')),
    h('dl', { class: 'cx-facts quick' }, quick.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    details);
}

export function codexScreen(app, tab = app.codexTab || 'towers') {
  const p = app.profile;
  if (!CODEX_TABS.some((t) => t.id === tab)) tab = 'towers';   // an unknown or retired tab id (an old link, a stale state) falls back
  app.codexTab = tab;
  let query = app.codexQuery || '';
  const openSet = app.codexOpen || (app.codexOpen = new Set());
  const wrap = h('div', { class: 'screen-inner codex' });
  const list = h('div', { class: 'cx-list-wrap' });
  const prog = codexProgress(p);

  const progress = h('div', { class: 'plaque cx-progress' },
    h('div', { class: 'row' }, h('b', {}, '📚 Codex medals'), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, `${prog.earned} / ${prog.total}`)),
    bar(prog.frac, 'gold'),
    h('small', { class: 'muted' }, prog.next
      ? `${prog.needForNext} more medal${prog.needForNext === 1 ? '' : 's'} to earn the title ${prog.next.name}. Each title adds +1% Renown${medalBonus(p) ? ` (you have +${Math.round(medalBonus(p) * 100)}%)` : ''}.`
      : `Grand Archivist: the whole Codex is yours. +${Math.round(medalBonus(p) * 100)}% Renown on every run.`),
    h('div', { class: 'cx-titles' }, CODEX_TITLES.map((t) => h('span', { class: 'chip' + (prog.titles.includes(t) ? ' got' : ''), title: `${Math.round(t.frac * 100)}% of the Codex` }, (prog.titles.includes(t) ? '✓ ' : '🔒 ') + t.name))));

  const search = h('input', { type: 'search', class: 'cx-search', placeholder: 'Search the Codex (try "flying", "poison", "boss")', value: query, 'aria-label': 'Search the Codex',
    oninput: (e) => { query = e.target.value.trim().toLowerCase(); app.codexQuery = query; renderList(); } });

  const tabs = h('div', { class: 'tabs cx-tabs', role: 'tablist' });
  const renderTabs = () => tabs.replaceChildren(...CODEX_TABS.map((t) => h('button', { class: 'btn small', role: 'tab', 'aria-selected': String(tab === t.id && !query), onclick: () => { tab = t.id; app.codexTab = tab; query = ''; app.codexQuery = ''; search.value = ''; renderTabs(); renderList(); } }, `${t.icon} ${t.label}`)));

  const renderList = () => {
    const tabsToShow = query ? CODEX_TABS : [CODEX_TABS.find((t) => t.id === tab)];
    const kids = [];
    let count = 0;
    for (const t of tabsToShow) {
      const entries = codexEntries(t.id).filter((e) => !query || e.search.includes(query) || e.name.toLowerCase().includes(query));
      if (!entries.length) continue;
      count += entries.length;
      if (query) kids.push(h('h3', { class: 'cx-section' }, `${t.icon} ${t.label}`));
      kids.push(h('div', { class: 'cx-grid' }, entries.map((e) => {
        const id = t.id + ':' + e.id;
        return entryCard(p, e, openSet.has(id), () => { if (openSet.has(id)) openSet.delete(id); else openSet.add(id); const y = screen().scrollTop; renderList(); screen().scrollTop = y; });
      })));
    }
    if (!count) kids.push(h('p', { class: 'muted', style: { textAlign: 'center', padding: '1.5rem 0' } }, `Nothing in the Codex matches "${query}".`));
    list.replaceChildren(...kids);
  };

  renderTabs(); renderList();
  wrap.append(
    h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => app.showHome(), 'aria-label': 'Back' }, '← Back'), h('h2', {}, 'Collection')),
    collectionBar(app, 'codex'), progress, search, tabs, list);
  const s = screen(); s.replaceChildren(wrap); s.scrollTop = 0;
}
