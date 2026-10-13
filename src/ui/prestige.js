// The Dynasty screen: prestige for players who have bought most of the Keep. Ascend for permanent power, a Legacy perk and royal rewards.
import { h, fmt, bar, modal, toast } from './dom.js';
import { audio } from '../game/audio.js';
import { PRESTIGE, LEGACY, PRESTIGE_REWARDS } from '../data/prestige.js';
import { prestigeStatus, prestigeBonus, prestigeLevel, resetPreview, legacyOffer, ascend, roman, rewardsFor } from '../meta/prestige.js';
import { COSMETICS } from '../meta/achievements.js';
import { saveProfile } from '../meta/profile.js';

const screen = () => document.getElementById('screen');
const cosName = (full) => { const [k, id] = full.split(':'); return COSMETICS[k]?.[id] || id; };
const pctStr = (x) => '+' + Math.round(x * 100) + '%';

// The permanent powers a Dynasty gives, as short lines.
export function powerLines(p) {
  const b = prestigeBonus(p);
  const lines = [];
  if (b.renown) lines.push(['⭐', `${pctStr(b.renown)} Renown from every run`]);
  if (b.towerDmg) lines.push(['🏰', `${pctStr(b.towerDmg)} tower damage`]);
  if (b.castleHpMult) lines.push(['🛡', `${pctStr(b.castleHpMult)} castle and wall HP`]);
  if (b.startGold) lines.push(['💰', `+${Math.round(b.startGold)} starting gold`]);
  return lines;
}

function legacyChip(id, n) {
  const L = LEGACY[id];
  return h('span', { class: 'legacy-chip', title: `${L.name}: ${L.desc}` }, h('span', {}, L.icon), h('b', {}, L.name), n > 1 ? h('small', {}, `×${n}`) : null);
}

export function prestigeScreen(app) {
  const p = app.profile;
  const st = prestigeStatus(p), lvl = st.level;
  const wrap = h('div', { class: 'screen-inner prestige' });
  const power = powerLines(p);
  const held = Object.entries(p.prestige?.legacy || {}).filter(([, n]) => n > 0);
  const next = rewardsFor(st.next);

  const hero = h('div', { class: 'plaque dynasty-hero' + (st.ok ? ' ready' : '') },
    h('div', { class: 'dyn-crest', 'aria-hidden': 'true' }, lvl ? '👑' : '🏰'),
    h('div', { class: 'dyn-text' },
      h('div', { class: 'muted' }, lvl ? `House of ${p.name}` : 'Your first dynasty'),
      h('h2', {}, lvl ? `Dynasty ${roman(lvl)}` : 'The First Dynasty'),
      h('div', { class: 'row' }, h('span', {}, `✦ ${fmt(st.have)} / ${fmt(st.need)} Renown earned in this Dynasty`)),
      bar(st.frac, st.ok ? 'gold' : 'blue'),
      h('small', { class: 'muted' }, st.ok ? 'Your line is ready to ascend.' : `${fmt(st.need - st.have)} more Renown, earned from runs, orders and medals, before you may ascend.`)));

  const powers = h('div', { class: 'plaque' }, h('h3', { style: { marginTop: 0 } }, 'Your line\'s power'),
    power.length ? h('ul', { class: 'cx-list' }, power.map(([i, t]) => h('li', {}, `${i} ${t}`))) : h('p', { class: 'muted' }, 'Ascend once to begin building permanent power.'),
    held.length ? h('div', { class: 'legacy-row' }, held.map(([id, n]) => legacyChip(id, n))) : null,
    h('small', { class: 'muted' }, 'Each Dynasty adds a little to every run. Legacy perks are chosen at every ascension.'));

  const ascendBox = h('div', { class: 'plaque ascend-box' },
    h('h3', { style: { marginTop: 0 } }, lvl ? `Ascend to Dynasty ${roman(st.next)}` : 'Found a Dynasty'),
    h('p', { class: 'muted' }, 'The Keep\'s stat upgrades start over, but your line grows stronger for good. Towers, weapons and castle arts you unlocked, your wardrobe, titles, rank, achievements and stats all stay.'),
    next ? h('div', { class: 'ascend-gifts' },
      next.cosmetic ? h('span', { class: 'chip' }, '🎁 ' + cosName(next.cosmetic)) : null,
      next.title ? h('span', { class: 'chip' }, '🏷 ' + next.title) : null,
      next.theme ? h('span', { class: 'chip' }, '🎨 ' + next.theme + ' theme') : null,
      h('span', { class: 'chip' }, `✦ ${fmt(PRESTIGE.endowment(st.next))} royal endowment`)) : h('div', { class: 'ascend-gifts' }, h('span', { class: 'chip' }, `✦ ${fmt(PRESTIGE.endowment(st.next))} royal endowment`)),
    h('button', { class: 'btn big wide ' + (st.ok ? 'gold' : ''), disabled: !st.ok, onclick: () => openAscend(app) }, st.ok ? `Ascend to Dynasty ${roman(st.next)}` : 'Not yet ready'));

  const ladder = h('div', { class: 'plaque' }, h('h3', { style: { marginTop: 0 } }, 'Royal rewards'),
    h('div', { class: 'reward-ladder' }, PRESTIGE_REWARDS.map((r) => {
      const state = r.level <= lvl ? 'done' : r.level === st.next ? 'next' : 'locked';
      return h('div', { class: 'rl ' + state },
        h('span', { class: 'rl-n' }, roman(r.level)),
        h('span', { class: 'rl-body' }, h('b', {}, r.title), h('small', {}, [r.cosmetic ? cosName(r.cosmetic) : null, r.theme ? r.theme + ' theme' : null].filter(Boolean).join(' · '))),
        h('span', { class: 'rl-s' }, state === 'done' ? '✓' : state === 'next' ? '▶' : '🔒'));
    })),
    h('small', { class: 'muted' }, 'Beyond Dynasty X, every ascension still adds power and a Legacy perk.'));

  const hist = (p.prestige?.history || []).slice().reverse();
  const history = hist.length ? h('div', { class: 'plaque' }, h('h3', { style: { marginTop: 0 } }, 'Chronicle of the line'),
    hist.slice(0, 8).map((x) => h('div', { class: 'row' }, h('span', {}, `Dynasty ${roman(x.level)}`), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, `${LEGACY[x.perk]?.icon || ''} ${LEGACY[x.perk]?.name || ''} · ${new Date(x.at).toLocaleDateString()}`)))) : null;

  wrap.append(
    h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => app.showHome(), 'aria-label': 'Back' }, '← Back'), h('h2', {}, 'The Dynasty')),
    hero, h('div', { class: 'grid two' }, ascendBox, powers), ladder, history);
  const s = screen(); s.replaceChildren(wrap); s.scrollTop = 0;
}

// Confirmation: what is lost, what is gained, and the choice of Legacy perk.
function openAscend(app) {
  const p = app.profile;
  const st = prestigeStatus(p);
  const loss = resetPreview(p);
  const offer = legacyOffer(p);
  const next = rewardsFor(st.next);
  let pick = null;
  const go = h('button', { class: 'btn gold big', disabled: true, onclick: () => confirm() }, 'Choose a Legacy perk');
  const cards = offer.map((id) => {
    const L = LEGACY[id], have = p.prestige?.legacy?.[id] || 0;
    const el = h('button', { class: 'legacy-card', 'aria-pressed': 'false', onclick: () => {
      pick = id; cards.forEach((c) => c.setAttribute('aria-pressed', String(c === el)));
      go.disabled = false; go.textContent = `Ascend with ${L.name}`;
    } }, h('span', { class: 'lg-ico' }, L.icon), h('b', {}, L.name), h('small', {}, L.desc), h('small', { class: 'muted' }, have ? `You hold ${have} of ${L.max}` : `Up to ${L.max} times`));
    return el;
  });
  const m = modal([
    h('h2', { style: { marginTop: 0 } }, `Ascend to Dynasty ${roman(st.next)}`),
    h('div', { class: 'grid two' },
      h('div', { class: 'plaque' }, h('h3', { style: { marginTop: 0 } }, 'You give up'),
        h('ul', { class: 'cx-list' },
          h('li', {}, `${loss.levels} Keep upgrade level${loss.levels === 1 ? '' : 's'} (worth ✦ ${fmt(loss.spent)} Renown)`),
          h('li', {}, loss.unspent ? `Your ✦ ${fmt(loss.unspent)} unspent Renown, replaced by the endowment` : 'Nothing else')),
        loss.unspent > PRESTIGE.endowment(st.next) ? h('p', { class: 'warn' }, '⚠ Spend your Renown in the Keep first: you have more than the endowment.') : null),
      h('div', { class: 'plaque' }, h('h3', { style: { marginTop: 0 } }, 'You receive'),
        h('ul', { class: 'cx-list' },
          h('li', {}, `✦ ${fmt(PRESTIGE.endowment(st.next))} Renown to rebuild with`),
          h('li', {}, `Permanent ${pctStr(PRESTIGE.perLevel.renown.per)} Renown, ${pctStr(PRESTIGE.perLevel.towerDmg.per)} tower damage, ${pctStr(PRESTIGE.perLevel.hp.per)} castle HP and +${PRESTIGE.perLevel.gold.per} starting gold`),
          next?.cosmetic ? h('li', {}, '🎁 ' + cosName(next.cosmetic)) : null,
          next?.title ? h('li', {}, '🏷 Title: ' + next.title) : null,
          next?.theme ? h('li', {}, '🎨 ' + next.theme + ' theme') : null,
          h('li', {}, 'One Legacy perk of your choice')))),
    h('h3', {}, 'Choose your Legacy'),
    h('div', { class: 'legacy-choices' }, cards),
    h('p', { class: 'muted' }, 'Your unlocks, wardrobe, titles, achievements, rank and loadout are never lost.'),
    h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Not yet'), go),
  ], { wide: true });

  function confirm() {
    if (!pick) return;
    const r = ascend(p, pick);
    if (!r) { toast('You are not ready to ascend yet.'); return; }
    saveProfile(p); app.applyTheme(); audio.play('achievement');
    m.close();
    let left = false;
    const leave = (fn) => () => { left = true; cel.close(); fn(); };
    const cel = modal([
      h('div', { class: 'ascended' },
        h('div', { class: 'dyn-crest big', 'aria-hidden': 'true' }, '👑'),
        h('h2', {}, `Dynasty ${roman(r.level)}`),
        h('p', {}, r.reward?.title ? `You are now ${r.reward.title}.` : 'A new age begins.'),
        h('ul', { class: 'cx-list' },
          h('li', {}, `${r.perk.icon} ${r.perk.name}: ${r.perk.desc}`),
          r.gained.cosmetic ? h('li', {}, '🎁 ' + cosName(r.gained.cosmetic)) : null,
          r.reward?.theme ? h('li', {}, '🎨 ' + r.reward.theme + ' theme unlocked') : null,
          h('li', {}, `✦ ${fmt(r.endowment)} Renown to rebuild the Keep`)),
        h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn gold', onclick: leave(() => app.showKeep()) }, 'Rebuild the Keep'), h('button', { class: 'btn ghost', onclick: leave(() => app.showPrestige()) }, 'See my line'))),
    ], { onClose: () => { if (!left) app.showPrestige(); } });
  }
}

export { prestigeLevel, roman };
