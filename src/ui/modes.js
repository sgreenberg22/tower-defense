// The Game Modes screen: Gauntlet, Last Stand and Sprint. Each card says what is different, shows your best and starts the run.
import { h, clockText } from './dom.js';
import { MAPS } from '../game/maps.js';
import { WEAPONS, ABILITIES, ART_KEYS, ART_SLOTS } from '../data/balance.js';
import { saveProfile, unlockedAbilities, unlockedWeapons, keepLevel, loadoutFor, isMapUnlocked } from '../meta/profile.js';
import { MODES, MODE_IDS, GAUNTLET, SPRINT, weeklySetup, modeMapPool, modeSeedFor, SPRINT_LEVELS, SPRINT_LEVEL_IDS, cleanSprintLevel } from '../game/modes.js';
import { seasonKey, randomSeed } from '../core/rng.js';
import { mapThumb } from './screens.js';
import { loadRun } from '../meta/profile.js';

// Every mode keeps its own weapon and castle-art choice, so what you pick for Infinite does not follow you in. The first
// time in a mode it starts from your Infinite choice; after that it remembers what you last took into that mode.
export const endureSlots = (p) => Math.min(ART_SLOTS.max, ART_SLOTS.base + keepLevel(p, 'artslot'));
export function modeChoice(p, id) {
  const e = (id === 'endurance' ? p.endure : p.modePicks?.[id]) || {};
  const ownW = unlockedWeapons(p), ownA = unlockedAbilities(p);
  const weapon = ownW.includes(e.weapon) ? e.weapon : ownW.includes(p.weapon) ? p.weapon : 'longbow';
  const slots = endureSlots(p);
  const fallback = id === 'endurance' ? [...ownA] : loadoutFor(p);   // Endurance fills the board for free, so it starts with every art
  const loadout = (Array.isArray(e.loadout) ? e.loadout : fallback).filter((a) => ownA.has(a)).slice(0, slots);
  return { weapon, loadout };
}
export const endureChoice = (p) => modeChoice(p, 'endurance');

// What a mode run starts with. Gauntlet is a fresh seed every time; the others share this week's map and seed.
export function modeSetup(app, id, pick = null) {
  const p = app.profile;
  const c = pick || modeChoice(p, id);
  if (id === 'gauntlet') return { mode: 'gauntlet', mapId: GAUNTLET.maps[0], seed: randomSeed(), weapon: c.weapon, loadout: c.loadout, modifiers: [], ascension: 0 };
  const key = seasonKey(), ws = weeklySetup(id, key);
  const map = pick?.map && modeMapPool(id, key).includes(pick.map) ? pick.map : ws.map;
  const setup = { mode: id, mapId: map, seed: modeSeedFor(id, key, map), weapon: c.weapon, loadout: c.loadout, modifiers: [], ascension: 0 };
  if (id === 'sprint') setup.level = cleanSprintLevel(pick?.level ?? p.modePicks?.sprint?.level);
  return setup;
}

const PREP = {
  gauntlet: { go: 'Begin the Gauntlet', intro: 'A new map after every boss, with a grant of gold each time. Your weapon and castle arts come with you, so choose the ones that suit a long, fast fight.' },
  laststand: { go: 'Make a stand', intro: 'Every tower is free and fully mastered, so your weapon and castle arts are the one thing you shape for yourself. Pick what will hold the gate longest.' },
  endurance: { go: 'Hold the line', intro: 'Every tower, plot and troop you have unlocked in the Keep is free and fully mastered, and your weapon comes fully trained. Choose from the weapons and castle arts you have unlocked, place everything, and press Begin. After that the foes never stop coming, and they keep getting stronger.' },
  sprint: { go: 'Start the Sprint', intro: 'Fifteen waves against the clock. Fast arts and a hard-hitting weapon save seconds, so choose with the clock in mind.' },
};

// Shown before every Gauntlet, Last Stand, Endurance and Sprint: pick the weapon and castle arts for this run.
export function prepScreen(app, id) {
  const p = app.profile, M = MODES[id], P = PREP[id];
  const screen = document.getElementById('screen');
  const key = seasonKey(), weekly = id === 'gauntlet' ? null : weeklySetup(id, key);
  const pool = weekly ? [weekly.map, ...modeMapPool(id, key).filter((m) => m !== weekly.map)] : [];   // this week's map leads the list
  // The weapon is remembered per mode, but the castle arts start empty every time: you choose them fresh before each run.
  const st = { weapon: modeChoice(p, id).weapon, loadout: [], map: weekly ? weekly.map : null, level: cleanSprintLevel(p.modePicks?.sprint?.level) };
  const save = () => { if (id === 'endurance') p.endure = { weapon: st.weapon }; else (p.modePicks ||= {})[id] = { weapon: st.weapon, ...(id === 'sprint' ? { level: st.level } : {}) }; saveProfile(p); };
  const noRepairs = id === 'laststand' || id === 'endurance';   // no mending in these modes, so the Mend art has no place in the loadout
  const render = () => {
    const keepY = screen.scrollTop, keepX = [...screen.querySelectorAll('.map-cards, .diff-cards')].map((el) => el.scrollLeft);
    const ownW = unlockedWeapons(p), ownA = unlockedAbilities(p), slots = endureSlots(p);
    const weapons = Object.entries(WEAPONS).filter(([wid]) => ownW.includes(wid)).map(([wid, w]) =>
      h('button', { class: 'opt', 'aria-pressed': String(st.weapon === wid), onclick: () => { st.weapon = wid; save(); render(); } },
        h('span', { class: 'box' }, st.weapon === wid ? '✓' : ''), h('span', {}, h('b', {}, w.name), h('small', {}, w.desc)), h('span', {})));
    const arts = Object.entries(ABILITIES).filter(([aid]) => ownA.has(aid)).map(([aid, A]) => {
      if (noRepairs && aid === 'mend') {
        return h('button', { class: 'opt locked-more', disabled: true, 'aria-disabled': 'true', title: 'Repairs are off in this mode' },
          h('span', { class: 'box' }, '✕'), h('span', {}, h('b', { style: { textDecoration: 'line-through' } }, `${A.icon} ${A.name}`), h('small', {}, 'Not available: nothing can be repaired in this mode.')), h('span', {}));
      }
      const on = st.loadout.includes(aid);
      return h('button', { class: 'opt', 'aria-pressed': String(on), disabled: !on && st.loadout.length >= slots, title: A.desc,
        onclick: () => { st.loadout = on ? st.loadout.filter((x) => x !== aid) : [...st.loadout, aid]; render(); } },
      h('span', { class: 'box' }, on ? '✓' : ''), h('span', {}, h('b', {}, `${A.icon} ${A.name}`), h('small', {}, `${A.desc} Recharge ${A.cd}s.`)), h('span', {}, on ? ART_KEYS[st.loadout.indexOf(aid)] : ''));
    });
    const strip = h('div', { class: 'slot-strip' }, Array.from({ length: slots }, (_, i) => {
      const A = st.loadout[i] && ABILITIES[st.loadout[i]];
      return h('div', { class: 'slot' + (A ? ' full' : '') }, A ? A.icon : '+', h('small', {}, A ? `${ART_KEYS[i]} · ${A.name}` : 'Empty'));
    }));
    // Every map the mode can use is listed, locked ones too (greyed, with what unlocks them). This week's map always plays.
    const maps = pool.map((mid) => {
      const m = MAPS[mid], isWeek = mid === weekly.map, open = isWeek || isMapUnlocked(p, mid);
      return h('button', { class: 'plaque map-card' + (st.map === mid ? ' sel' : '') + (open ? '' : ' locked'), disabled: !open, 'aria-pressed': String(st.map === mid), onclick: () => { st.map = mid; render(); } },
        mapThumb(mid, weekly.seed, 300), h('b', {}, m.name),
        h('span', { class: 'muted' }, open ? m.desc : '🔒 ' + (m.unlock?.label || 'Locked')),
        h('span', { class: 'best' }, isWeek ? '⭐ This week’s map · ranked' : open ? 'Practice · not ranked' : ''));
    });
    const levels = id === 'sprint' ? SPRINT_LEVEL_IDS.map((lid) => {
      const L = SPRINT_LEVELS[lid], rec = p.best?.modes?.sprint?.lv?.[lid];
      return h('button', { class: 'plaque diff-card' + (st.level === lid ? ' sel' : ''), 'aria-pressed': String(st.level === lid), onclick: () => { st.level = lid; save(); render(); } },
        h('b', {}, `${L.icon} ${L.name}`), h('span', { class: 'muted' }, L.blurb),
        h('span', { class: 'best' }, rec?.clock ? `Best ${clockText(rec.clock)}` : 'Not cleared'));
    }) : null;
    const ranked = !weekly || st.map === weekly.map;
    const mapName = MAPS[st.map || GAUNTLET.maps[0]].name;
    const kids = [
      h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => app.showModes(), 'aria-label': 'Back' }, '← Back'), h('h2', {}, `${M.icon} ${M.name}`)),
      h('p', { class: 'muted' }, `${id === 'gauntlet' ? 'You start on ' + mapName + '. ' : ''}${P.intro}`),
      levels ? h('h3', {}, 'Level') : null,
      levels ? h('p', { class: 'muted' }, 'Each level has its own leaderboard. Foes get tougher and denser, and the gold and breaks get shorter, as you climb. The clock starts when you call the first wave, so setting up is free.') : null,
      levels ? h('div', { class: 'diff-cards' }, levels) : null,
      weekly ? h('h3', { style: levels ? { marginTop: '1.2rem' } : {} }, 'Battlefield') : null,
      weekly ? h('p', { class: 'muted' }, 'Only runs on this week’s map count for the board. Other maps are practice: they still count for achievements and the Realm.') : null,
      weekly ? h('div', { class: 'map-cards' }, maps) : null,
      h('h3', { style: { marginTop: '1.2rem' } }, 'Your weapon'), h('div', { class: 'opt-list' }, weapons),
      (id === 'laststand' || id === 'endurance') ? h('p', { class: 'muted' }, 'In this mode the weapon comes fully trained: every Armory upgrade at its top level, with all four Mastery perks.') : null,
      h('h3', { style: { marginTop: '1.2rem' } }, `Castle arts · ${st.loadout.length}/${slots} slots`),
      h('p', { class: 'muted' }, 'Choose your arts for every run: nothing is picked for you.' + (noRepairs ? ' Every art you take is at full power. Field Repairs is crossed out because nothing can be repaired here.' : '') + ' Unlock more weapons, arts and slots in the Keep.'),
      strip, h('div', { class: 'loadout' }, arts),
      h('div', { class: 'setup-foot' }, ranked || !weekly ? h('span', { class: 'spacer' }) : h('small', { class: 'muted' }, 'Practice run: not on the board'), h('span', { class: 'spacer' }),
        h('button', { class: 'btn gold big', disabled: !st.loadout.length, onclick: () => { save(); app.startRun(modeSetup(app, id, { weapon: st.weapon, loadout: [...st.loadout], map: st.map })); } }, st.loadout.length ? P.go : 'Choose at least one art')),
    ].filter(Boolean);
    screen.replaceChildren(h('div', { class: 'screen-inner setup-screen settled' }, kids));
    screen.querySelectorAll('.map-cards, .diff-cards').forEach((el, i) => { el.scrollLeft = keepX[i] || 0; });
    screen.scrollTop = keepY;
  };
  render();
  screen.scrollTop = 0;
}
export const endureScreen = (app) => prepScreen(app, 'endurance');

export function bestLine(p, id) {
  const m = p.best?.modes?.[id];
  if (!m || !m.runs) return 'Not played yet';
  if (id === 'gauntlet') return `Best: wave ${m.wave || 0} · stage ${m.stage || 1} · ${m.runs} run${m.runs === 1 ? '' : 's'}`;
  if (id === 'laststand' || id === 'endurance') return `Longest ${id === 'endurance' ? 'hold' : 'stand'}: ${clockText(m.clock || 0)} · wave ${m.wave || 0} · ${m.runs} run${m.runs === 1 ? '' : 's'}`;
  const top = ['legend', 'veteran', 'standard', 'recruit'].find((l) => m.lv?.[l]?.clock);
  return top ? `Best: ${SPRINT_LEVELS[top].name} ${clockText(m.lv[top].clock)} · ${m.wins} win${m.wins === 1 ? '' : 's'} in ${m.runs}` : m.clock ? `Fastest clear: ${clockText(m.clock)} · ${m.wins} win${m.wins === 1 ? '' : 's'} in ${m.runs}` : `No clear yet · best wave ${m.wave || 0} of ${SPRINT.waves}`;
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
        h('button', { class: saved ? 'btn' : 'btn gold', onclick: () => prepScreen(app, id) }, saved ? 'Start over' : id === 'laststand' ? 'Make a stand' : id === 'endurance' ? 'Hold the line' : id === 'sprint' ? 'Start sprint' : 'Enter the gauntlet')));
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
