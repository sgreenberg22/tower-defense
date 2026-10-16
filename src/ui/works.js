// Realm Works: spend the Supply that Overtime Orders earn on conquest (Warbanner) and defence (Wardens).
import { h, toast, modal } from './dom.js';
import { audio } from '../game/audio.js';
import { saveProfile } from '../meta/profile.js';
import { WORKS, worksLevel, worksCost, buyWork, rallyMult } from '../meta/campaign.js';

const effect = (id, lv) => (id === 'banner' ? `Kills count ${Math.round((rallyMult(lv) - 1) * 100)}% more toward the Rally`
  : `+${Math.round(WORKS.wardens.hp * lv * 100)}% castle and wall health · ${Math.round(WORKS.wardens.dr * lv * 100)}% less castle damage`);

export function worksCard(app, onChange = () => {}) {
  const p = app.profile;
  const card = h('div', { class: 'plaque works-card' });
  const draw = () => {
    const rows = Object.values(WORKS).map((W) => {
      const lv = worksLevel(p, W.id), cost = worksCost(p, W.id), can = cost != null && (p.supply || 0) >= cost;
      return h('div', { class: 'works-row' },
        h('div', { class: 'works-main' },
          h('div', { class: 'row', style: { gap: '.4rem' } }, h('span', { class: 'works-ico' }, W.icon), h('b', {}, W.name), h('span', { class: 'muted lvl' }, `Lv ${lv}/${W.costs.length}`)),
          h('div', { class: 'muted', style: { fontSize: '.85rem' } }, W.blurb),
          h('div', { class: 'works-now' }, lv ? effect(W.id, lv) : 'Not started'),
          h('div', { class: 'pips' }, W.costs.map((_, i) => h('i', { class: i < lv ? 'on' : '' })))),
        cost == null ? h('span', { class: 'chip' }, 'Maxed')
          : h('button', { class: 'btn small gold', disabled: !can, title: can ? 'Spend Supply' : 'Not enough Supply yet', onclick: () => { if (buyWork(p, W.id)) { saveProfile(p); audio.play('upgrade'); toast(`${W.name} level ${worksLevel(p, W.id)}: ${effect(W.id, worksLevel(p, W.id))}`, { icon: W.icon, key: 'works' }); draw(); onChange(); } } }, `📦 ${cost}`));
    });
    card.replaceChildren(
      h('div', { class: 'row' }, h('h3', { style: { margin: 0 } }, 'Realm Works'), h('span', { class: 'spacer' }), h('span', { class: 'chip', title: 'Earned from Overtime Orders' }, `📦 ${p.supply || 0} Supply`)),
      h('p', { class: 'muted', style: { margin: '.2rem 0 .5rem' } }, 'Finish all of the day’s orders and the Quartermaster keeps issuing tougher Overtime Orders. Each one pays Supply, which you spend here: conquer more land, or hold what you have.'),
      ...rows);
  };
  draw();
  return card;
}

export function showWorks(app) {
  const m = modal([worksCard(app), h('div', { class: 'row', style: { marginTop: '.6rem' } }, h('span', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => m.close() }, 'Close'))]);
}
