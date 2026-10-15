// The Game Modes screen: Gauntlet, Last Stand and Sprint. Each card says what is different, shows your best and starts the run.
import { h, fmt, clockText } from './dom.js';
import { MAPS } from '../game/maps.js';
import { WEAPONS, ABILITIES, ART_KEYS, ART_SLOTS } from '../data/balance.js';
import { saveProfile, unlockedAbilities, unlockedWeapons, keepLevel } from '../meta/profile.js';
import { MODES, MODE_IDS, GAUNTLET, LASTSTAND, SPRINT, weeklySetup } from '../game/modes.js';
import { seasonKey, randomSeed } from '../core/rng.js';
import { mapThumb } from './screens.js';
import { loadRun } from '../meta/profile.js';

// What a mode run starts with. Gauntlet is a fresh seed every time; Last Stand and Sprint share this week's map and seed.
export function modeSetup(app, id) {
  const p = app.profile;
  if (id === 'gauntlet') return { mode: 'gauntlet', mapId: GAUNTLET.maps[0], seed: randomSeed(), weapon: p.weapon, modifiers: [], ascension: 0 };
  const ws = weeklySetup(id, seasonKey());
  if (id === 'endurance') { const e = endureChoice(p); return { mode: id, mapId: ws.map, seed: ws.seed, weapon: e.weapon, loadout: e.loadout, modifiers: [], ascension: 0 }; }
  return { mode: id, mapId: ws.map, seed: ws.seed, weapon: p.weapon, modifiers: [], ascension: 0 };
}

// Endurance fills in the towers, plots and training, but only from what your Keep has unlocked: your weapons and castle
// arts, up to your art slots. What you take in is remembered between runs.
export const endureSlots = (p) => Math.min(ART_SLOTS.max, ART_SLOTS.base + keepLevel(p, 'artslot'));
export function endureChoice(p) {
  const e = p.endure || {};
  const ownW = unlockedWeapons(p), ownA = unlockedAbilities(p);
  const weapon = ownW.includes(e.weapon) ? e.weapon : ownW.includes(p.weapon) ? p.weapon : 'longbow';
  const slots = endureSlots(p);
  const loadout = (Array.isArray(e.loadout) ? e.loadout : [...ownA]).filter((id) => ownA.has(id)).slice(0, slots);
  return { weapon, loadout };
}

export function endureScreen(app) {
  const p = app.profile;
  const screen = document.getElementById('screen');
  const st = endureChoice(p);
  const save = () => { p.endure = { weapon: st.weapon, loadout: [...st.loadout] }; saveProfile(p); };
  const render = () => {
    const ownW = unlockedWeapons(p), ownA = unlockedAbilities(p), slots = endureSlots(p);
    const weapons = Object.entries(WEAPONS).filter(([id]) => ownW.includes(id)).map(([id, w]) =>
      h('button', { class: 'opt', 'aria-pressed': String(st.weapon === id), onclick: () => { st.weapon = id; save(); render(); } },
        h('span', { class: 'box' }, st.weapon === id ? '✓' : ''), h('span', {}, h('b', {}, w.name), h('small', {}, w.desc)), h('span', {})));
    const arts = Object.entries(ABILITIES).filter(([id]) => ownA.has(id)).map(([id, A]) => {
      const on = st.loadout.includes(id);
      return h('button', { class: 'opt', 'aria-pressed': String(on), disabled: !on && st.loadout.length >= slots, title: A.desc,
        onclick: () => { st.loadout = on ? st.loadout.filter((x) => x !== id) : [...st.loadout, id]; save(); render(); } },
      h('span', { class: 'box' }, on ? '✓' : ''), h('span', {}, h('b', {}, `${A.icon} ${A.name}`), h('small', {}, `${A.desc} Recharge ${A.cd}s.`)), h('span', {}, on ? ART_KEYS[st.loadout.indexOf(id)] : ''));
    });
    const strip = h('div', { class: 'slot-strip' }, Array.from({ length: slots }, (_, i) => {
      const A = st.loadout[i] && ABILITIES[st.loadout[i]];
      return h('div', { class: 'slot' + (A ? ' full' : '') }, A ? A.icon : '+', h('small', {}, A ? `${ART_KEYS[i]} · ${A.name}` : 'Empty'));
    }));
    const ws = weeklySetup('endurance', seasonKey());
    screen.replaceChildren(h('div', { class: 'screen-inner' },
      h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => app.showModes(), 'aria-label': 'Back' }, '← Back'), h('h2', {}, '🛡 Endurance')),
      h('p', { class: 'muted' }, `This week's map is ${MAPS[ws.map].name}. Every tower, plot and troop you have unlocked in the Keep is free and fully mastered, and your weapon comes fully trained. Choose from the weapons and castle arts you have unlocked, place everything, and press Begin. After that the foes never stop coming, and they keep getting stronger.`),
      h('h3', {}, 'Your weapon'), h('div', { class: 'opt-list' }, weapons),
      h('h3', { style: { marginTop: '1.2rem' } }, `Castle arts · ${st.loadout.length}/${slots} slots`),
      h('p', { class: 'muted' }, 'Each art answers to its slot key (or tap its button) and recharges between uses. Unlock more weapons, arts and slots in the Keep.'),
      strip, h('div', { class: 'loadout' }, arts),
      h('div', { class: 'setup-foot' }, h('span', { class: 'spacer' }),
        h('button', { class: 'btn gold big', disabled: !st.loadout.length, onclick: () => { save(); app.startRun(modeSetup(app, 'endurance')); } }, 'Hold the line'))));
    screen.scrollTop = 0;
  };
  render();
}

export function bestLine(p, id) {
  const m = p.best?.modes?.[id];
  if (!m || !m.runs) return 'Not played yet';
  if (id === 'gauntlet') return `Best: wave ${m.wave || 0} · stage ${m.stage || 1} · ${m.runs} run${m.runs === 1 ? '' : 's'}`;
  if (id === 'laststand' || id === 'endurance') return `Longest ${id === 'endurance' ? 'hold' : 'stand'}: ${clockText(m.clock || 0)} · wave ${m.wave || 0} · ${m.runs} run${m.runs === 1 ? '' : 's'}`;
  return m.clock ? `Fastest clear: ${clockText(m.clock)} · ${m.wins} win${m.wins === 1 ? '' : 's'} in ${m.runs}` : `No clear yet · best wave ${m.wave || 0} of ${SPRINT.waves}`;
}

export function modesScreen(app) {
  const p = app.profile;
  const screen = document.getElementById('screen');
  const weekly = (id) => (id === 'gauntlet' ? null : weeklySetup(id, seasonKey()));
  const cards = MODE_IDS.map((id) => {
    const M = MODES[id], ws = weekly(id);
    const mapId = ws ? ws.map : GAUNTLET.maps[0];
    const saved = loadRun(id);
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
        saved ? h('button', { class: 'btn blue', onclick: () => app.resumeRun(saved) }, id === 'gauntlet' ? `Continue · wave ${saved.wave}` : id === 'laststand' || id === 'endurance' ? (saved.started ? `Continue · ${clockText(saved.clock || 0)}` : 'Continue setup') : `Continue · wave ${saved.wave}`) : null,
        h('button', { class: saved ? 'btn' : 'btn gold', onclick: () => (id === 'endurance' ? endureScreen(app) : app.startRun(modeSetup(app, id))) }, saved ? 'Start over' : id === 'laststand' ? 'Make a stand' : id === 'endurance' ? 'Hold the line' : id === 'sprint' ? 'Start sprint' : 'Enter the gauntlet')));
  });
  // The classic run is the Infinite mode: it has its own setup screen, so this card just leads there.
  const classic = loadRun();
  const infinite = h('div', { class: 'plaque mode-card', 'data-mode': 'infinite' },
    h('div', { class: 'mode-top' },
      h('span', { class: 'mode-ico', 'aria-hidden': 'true' }, '♾'),
      h('div', {}, h('h3', { style: { margin: 0 } }, 'Infinite'), h('small', { class: 'muted' }, 'The classic endless run'))),
    h('div', { class: 'mode-body' }, h('div', { class: 'mode-text' },
      h('p', { style: { margin: '0 0 .4rem' } }, 'Waves without end on any map, with your choice of difficulty, modifiers and Ascension. Pause it any time and come back; the other modes save separately.'),
      h('ul', { class: 'mode-rules' }, h('li', {}, 'Ranked by highest wave, top score and Ascension.')))),
    h('div', { class: 'row mode-foot' },
      h('span', { class: 'chip' }, classic && !classic.tutorial ? `In progress · wave ${classic.wave}` : `Best wave: ${Math.max(0, ...Object.values(p.best?.wave || {}))}`),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn small', onclick: () => { app.pendingBoard = 'wave'; app.showSocial('boards'); } }, '🏅 Board'),
      classic && !classic.tutorial ? h('button', { class: 'btn blue', onclick: () => app.resumeRun(classic) }, 'Continue') : null,
      h('button', { class: classic && !classic.tutorial ? 'btn' : 'btn gold', onclick: () => app.showSetup() }, 'New run')));
  screen.replaceChildren(h('div', { class: 'screen-inner modes-screen' },
    h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => app.showHome(), 'aria-label': 'Back' }, '← Back'), h('h2', {}, 'Game modes')),
    h('p', { class: 'muted' }, 'Other ways to fight. Every kill, wave and order in these modes counts toward the Realm and your Renown, just like a normal run. They save separately, so your classic run stays paused while you try one.'),
    h('div', { class: 'modes-grid' }, infinite, cards),
    h('p', { class: 'muted' }, `Last Stand and Sprint use one map and one set of foes for everybody each week, so the boards are a fair contest. Gauntlet is ranked by the furthest wave you reach. Few ever pass wave ${100}.`)));
  screen.scrollTop = 0;
}
