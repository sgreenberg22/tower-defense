// A short "choose your weapon and castle arts" step for the runs that start from a single button: Marches, the Daily
// Challenge, shared challenges, Quick run and Trials. Each remembers its own choice (p.modePicks[key]); the first time it
// starts from your Infinite setup, so one tap on "Go" is enough.
import { h, modal } from './dom.js';
import { WEAPONS, ABILITIES, ART_KEYS, ART_SLOTS, TROOPS, TROOP_ORDER, GARRISON } from '../data/balance.js';
import { saveProfile, unlockedAbilities, unlockedWeapons, unlockedTroops } from '../meta/profile.js';
import { modeChoice, endureSlots } from './modes.js';

export function pickLoadout(app, { key, title, intro, go = 'Begin', onGo }) {
  const p = app.profile;
  const ownW = unlockedWeapons(p), ownA = unlockedAbilities(p), slots = endureSlots(p);
  const st = modeChoice(p, key);
  const ownT = unlockedTroops(p), SQ = GARRISON.startSquad;
  const eligible = TROOP_ORDER.filter((id) => ownT.has(id) && TROOPS[id].valor <= SQ.maxValor);
  st.squad = (Array.isArray(p.modePicks?.[key]?.squad) ? p.modePicks[key].squad : []).filter((k) => eligible.includes(k));
  const used = () => st.squad.reduce((a, k) => a + TROOPS[k].slots, 0);
  const body = h('div', {});
  let box;
  const save = () => { (p.modePicks ||= {})[key] = { ...(p.modePicks[key] || {}), weapon: st.weapon, loadout: [...st.loadout], squad: [...st.squad] }; saveProfile(p); };
  const render = () => {
    const weapons = Object.entries(WEAPONS).filter(([id]) => ownW.includes(id)).map(([id, w]) =>
      h('button', { class: 'opt', 'aria-pressed': String(st.weapon === id), onclick: () => { st.weapon = id; save(); render(); } },
        h('span', { class: 'box' }, st.weapon === id ? '✓' : ''), h('span', {}, h('b', {}, w.name), h('small', {}, w.desc)), h('span', {})));
    const arts = Object.entries(ABILITIES).filter(([id]) => ownA.has(id)).map(([id, A]) => {
      const on = st.loadout.includes(id);
      return h('button', { class: 'opt', 'aria-pressed': String(on), disabled: !on && st.loadout.length >= slots, title: A.desc,
        onclick: () => { st.loadout = on ? st.loadout.filter((x) => x !== id) : [...st.loadout, id].slice(0, slots); save(); render(); } },
      h('span', { class: 'box' }, on ? '✓' : ''), h('span', {}, h('b', {}, `${A.icon} ${A.name}`), h('small', {}, `${A.desc} Recharge ${A.cd}s.`)), h('span', {}, on ? ART_KEYS[st.loadout.indexOf(id)] : ''));
    });
    const squad = eligible.map((id) => {
      const D = TROOPS[id], n = st.squad.filter((k) => k === id).length;
      return h('div', { class: 'opt', style: { alignItems: 'center' } },
        h('span', { class: 'box' }, n ? String(n) : ''), h('span', {}, h('b', {}, `${D.icon} ${D.name}`), h('small', {}, `${D.role}${D.slots > 1 ? ` · ${D.slots} slots` : ''}`)),
        h('span', { class: 'row', style: { gap: '.3rem' } },
          h('button', { class: 'btn small ghost', disabled: !n, 'aria-label': `Fewer ${D.name}`, onclick: () => { st.squad.splice(st.squad.lastIndexOf(id), 1); save(); render(); } }, '−'),
          h('button', { class: 'btn small gold', disabled: used() + D.slots > SQ.slots, 'aria-label': `More ${D.name}`, onclick: () => { st.squad.push(id); save(); render(); } }, '+')));
    });
    body.replaceChildren(
      h('h2', { style: { fontFamily: 'var(--display)', margin: '0 0 .3rem' } }, title),
      intro ? h('p', { class: 'muted', style: { margin: '0 0 .4rem' } }, intro) : null,
      h('h3', { style: { marginTop: '.8rem' } }, 'Your weapon'), h('div', { class: 'opt-list' }, weapons),
      eligible.length ? h('h3', { style: { marginTop: '.8rem' } }, `Starting soldiers · ${used()}/${SQ.slots} slots`) : null,
      eligible.length ? h('p', { class: 'muted', style: { margin: '0 0 .3rem' } }, 'A free squad waiting at the gate when the run begins. Elite troops that need Valor have to be trained in the run.') : null,
      eligible.length ? h('div', { class: 'opt-list' }, squad) : null,
      h('h3', { style: { marginTop: '.8rem' } }, `Castle arts · ${st.loadout.length}/${slots} slots`), h('div', { class: 'loadout' }, arts),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '.8rem' } },
        h('button', { class: 'btn ghost', onclick: () => box.close() }, 'Not yet'),
        h('button', { class: 'btn gold', onclick: () => { save(); box.close(); onGo({ weapon: st.weapon, loadout: [...st.loadout], squad: [...st.squad] }); } }, go)));
  };
  render();
  box = modal([body], { wide: true });
}

// Quartermaster: swap the weapon and castle arts of a run in progress (between waves).
export function swapKitBox(app, g, done) {
  const ownW = unlockedWeapons(app.profile), slots = Math.max(1, Math.min(ART_SLOTS.max, g.bonus.artSlots || ART_SLOTS.base));
  const st = { weapon: g.weapon.id, loadout: [...g.loadout] };
  const body = h('div', {});
  let box;
  const render = () => {
    const weapons = Object.entries(WEAPONS).filter(([id]) => ownW.includes(id)).map(([id, w]) =>
      h('button', { class: 'opt', 'aria-pressed': String(st.weapon === id), onclick: () => { st.weapon = id; render(); } },
        h('span', { class: 'box' }, st.weapon === id ? '✓' : ''), h('span', {}, h('b', {}, w.name), h('small', {}, w.desc)), h('span', {})));
    const arts = Object.entries(ABILITIES).filter(([id]) => g.abilityKnown(id)).map(([id, A]) => {
      const on = st.loadout.includes(id), isNew = on && !g.loadout.includes(id);
      return h('button', { class: 'opt', 'aria-pressed': String(on), disabled: !on && st.loadout.length >= slots, title: A.desc,
        onclick: () => { st.loadout = on ? st.loadout.filter((x) => x !== id) : [...st.loadout, id]; render(); } },
      h('span', { class: 'box' }, on ? '✓' : ''), h('span', {}, h('b', {}, `${A.icon} ${A.name}`), h('small', {}, `${A.desc} Recharge ${A.cd}s.${isNew ? ' Starts recharging.' : ''}`)), h('span', {}, on ? ART_KEYS[st.loadout.indexOf(id)] : ''));
    });
    body.replaceChildren(
      h('h2', { style: { fontFamily: 'var(--display)', margin: '0 0 .3rem' } }, 'Quartermaster'),
      h('p', { class: 'muted', style: { margin: '0 0 .4rem' } }, 'Rearm for the next wave. Your Armory levels stay, and arts you bring in must recharge before use.'),
      h('h3', { style: { marginTop: '.8rem' } }, 'Your weapon'), h('div', { class: 'opt-list' }, weapons),
      h('h3', { style: { marginTop: '.8rem' } }, `Castle arts · ${st.loadout.length}/${slots} slots`), h('div', { class: 'loadout' }, arts),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '.8rem' } },
        h('button', { class: 'btn ghost', onclick: () => box.close() }, 'Cancel'),
        h('button', { class: 'btn gold', disabled: !st.loadout.length, onclick: () => { if (g.swapKit(st)) { box.close(); done(); } } }, 'Rearm')));
  };
  render();
  box = modal([body], { wide: true });
}
