// A short "choose your weapon and castle arts" step for the runs that start from a single button: Marches, the Daily
// Challenge, shared challenges, Quick run and Trials. Each remembers its own choice (p.modePicks[key]); the first time it
// starts from your Infinite setup, so one tap on "Go" is enough.
import { h, modal } from './dom.js';
import { WEAPONS, ABILITIES, ART_KEYS, ART_SLOTS } from '../data/balance.js';
import { saveProfile, unlockedAbilities, unlockedWeapons } from '../meta/profile.js';
import { modeChoice, endureSlots } from './modes.js';

export function pickLoadout(app, { key, title, intro, go = 'Begin', onGo }) {
  const p = app.profile;
  const ownW = unlockedWeapons(p), ownA = unlockedAbilities(p), slots = endureSlots(p);
  const st = modeChoice(p, key);
  const body = h('div', {});
  let box;
  const save = () => { (p.modePicks ||= {})[key] = { ...(p.modePicks[key] || {}), weapon: st.weapon, loadout: [...st.loadout] }; saveProfile(p); };
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
    body.replaceChildren(
      h('h2', { style: { fontFamily: 'var(--display)', margin: '0 0 .3rem' } }, title),
      intro ? h('p', { class: 'muted', style: { margin: '0 0 .4rem' } }, intro) : null,
      h('h3', { style: { marginTop: '.8rem' } }, 'Your weapon'), h('div', { class: 'opt-list' }, weapons),
      h('h3', { style: { marginTop: '.8rem' } }, `Castle arts · ${st.loadout.length}/${slots} slots`), h('div', { class: 'loadout' }, arts),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '.8rem' } },
        h('button', { class: 'btn ghost', onclick: () => box.close() }, 'Not yet'),
        h('button', { class: 'btn gold', onclick: () => { save(); box.close(); onGo({ weapon: st.weapon, loadout: [...st.loadout] }); } }, go)));
  };
  render();
  box = modal([body], { wide: true });
}
