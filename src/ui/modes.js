// The Game Modes screen: Gauntlet, Last Stand and Sprint. Each card says what is different, shows your best and starts the run.
import { h, fmt, clockText } from './dom.js';
import { MAPS } from '../game/maps.js';
import { MODES, MODE_IDS, GAUNTLET, LASTSTAND, SPRINT, weeklySetup } from '../game/modes.js';
import { seasonKey, randomSeed } from '../core/rng.js';
import { mapThumb } from './screens.js';

// What a mode run starts with. Gauntlet is a fresh seed every time; Last Stand and Sprint share this week's map and seed.
export function modeSetup(app, id) {
  const p = app.profile;
  if (id === 'gauntlet') return { mode: 'gauntlet', mapId: GAUNTLET.maps[0], seed: randomSeed(), weapon: p.weapon, modifiers: [], ascension: 0 };
  const ws = weeklySetup(id, seasonKey());
  return { mode: id, mapId: ws.map, seed: ws.seed, weapon: p.weapon, modifiers: [], ascension: 0 };
}

export function bestLine(p, id) {
  const m = p.best?.modes?.[id];
  if (!m || !m.runs) return 'Not played yet';
  if (id === 'gauntlet') return `Best: wave ${m.wave || 0} · stage ${m.stage || 1} · ${m.runs} run${m.runs === 1 ? '' : 's'}`;
  if (id === 'laststand') return `Longest stand: ${clockText(m.clock || 0)} · wave ${m.wave || 0} · ${m.runs} run${m.runs === 1 ? '' : 's'}`;
  return m.clock ? `Fastest clear: ${clockText(m.clock)} · ${m.wins} win${m.wins === 1 ? '' : 's'} in ${m.runs}` : `No clear yet · best wave ${m.wave || 0} of ${SPRINT.waves}`;
}

export function modesScreen(app) {
  const p = app.profile;
  const screen = document.getElementById('screen');
  const weekly = (id) => (id === 'gauntlet' ? null : weeklySetup(id, seasonKey()));
  const cards = MODE_IDS.map((id) => {
    const M = MODES[id], ws = weekly(id);
    const mapId = ws ? ws.map : GAUNTLET.maps[0];
    const thumb = mapThumb(mapId, ws ? ws.seed : 'preview', 300);
    thumb.classList.add('mode-thumb');
    return h('div', { class: 'plaque mode-card', 'data-mode': id },
      h('div', { class: 'mode-top' },
        h('span', { class: 'mode-ico', 'aria-hidden': 'true' }, M.icon),
        h('div', {}, h('h3', { style: { margin: 0 } }, M.name), h('small', { class: 'muted' }, M.short))),
      h('div', { class: 'mode-body' },
        h('div', { class: 'mode-thumb-wrap' }, thumb, h('small', { class: 'muted' }, ws ? `This week: ${MAPS[mapId].name}` : `Starts on ${MAPS[mapId].name}, then ${GAUNTLET.maps.slice(1, 4).map((m) => MAPS[m].name).join(', ')}…`)),
        h('div', { class: 'mode-text' },
          h('p', { style: { margin: '0 0 .4rem' } }, M.blurb),
          h('ul', { class: 'mode-rules' }, M.rules.map((r) => h('li', {}, r))))),
      h('div', { class: 'row mode-foot' },
        h('span', { class: 'chip' }, bestLine(p, id)),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn small', onclick: () => { app.pendingBoard = M.board; app.showSocial('boards'); } }, '🏅 Board'),
        h('button', { class: 'btn gold', onclick: () => app.startRun(modeSetup(app, id)) }, id === 'laststand' ? 'Make a stand' : id === 'sprint' ? 'Start sprint' : 'Enter the gauntlet')));
  });
  screen.replaceChildren(h('div', { class: 'screen-inner modes-screen' },
    h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => app.showHome(), 'aria-label': 'Back' }, '← Back'), h('h2', {}, 'Game modes')),
    h('p', { class: 'muted' }, 'Other ways to fight. Every kill, wave and order in these modes counts toward the Realm and your Renown, just like a normal run.'),
    h('div', { class: 'modes-grid' }, cards),
    h('p', { class: 'muted' }, `Last Stand and Sprint use one map and one set of foes for everybody each week, so the boards are a fair contest. Gauntlet is ranked by the furthest wave you reach. Few ever pass wave ${100}.`)));
  screen.scrollTop = 0;
}
