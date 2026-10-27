// The living world on screen: the week's warlord, the Royal Decrees and the Wonders of the Realm (rules in src/game/living.js).
import { h, fmt, toast, bar } from './dom.js';
import { saveProfile } from '../meta/profile.js';
import { audio } from '../game/audio.js';
import { WONDERS, WONDER, warlordFor, decreePerks } from '../game/living.js';
import { seasonKey } from '../core/rng.js';
import { warlordCard } from './modes.js';

const timeLeft = (endsAt) => { const ms = Math.max(0, endsAt - Date.now()), d = Math.floor(ms / 86400000), hrs = Math.floor((ms % 86400000) / 3600000); return d ? `${d}d ${hrs}h left` : `${hrs}h left`; };

// ---------- Royal Decrees ----------
export function decreesCard(app, r) {
  const D = r?.decrees;
  if (!D) {
    const wl = warlordFor(seasonKey());
    return h('div', { class: 'plaque trim decrees' }, h('h3', {}, '📜 Royal Decrees'),
      h('p', { class: 'muted' }, `Go online to answer this week's three Royal Decrees with the rest of the Realm, starting with breaking ${wl.name}'s host.`));
  }
  const rows = D.list.map((d) => h('div', { class: 'decree' + (d.done ? ' done' : '') },
    h('div', { class: 'row', style: { gap: '.4rem' } }, h('span', { class: 'dc-ico', 'aria-hidden': 'true' }, d.done ? '✅' : d.icon), h('b', {}, d.name), h('span', { class: 'spacer' }),
      h('span', { class: 'muted' }, d.done ? 'Fulfilled!' : `${fmt(d.progress)} / ${fmt(d.goal)}`)),
    bar(Math.min(1, d.progress / Math.max(1, d.goal)), d.done ? 'gold' : 'blue'),
    h('small', { class: 'muted' }, `${d.unit} · reward next week: ${d.rewardText}${d.mine ? ` · you gave ${fmt(d.mine)}` : ''}`)));
  const bless = D.blessing?.names?.length ? h('div', { class: 'row', style: { gap: '.35rem', marginTop: '.4rem' } }, h('b', {}, 'This week, thanks to last week:'), D.blessing.names.map((t) => h('span', { class: 'chip' }, t))) : null;
  return h('div', { class: 'plaque trim decrees' },
    h('div', { class: 'row' }, h('h3', { style: { margin: 0 } }, '📜 Royal Decrees'), h('span', { class: 'spacer' }), h('span', { class: 'chip' }, timeLeft(D.endsAt))),
    h('p', { class: 'muted', style: { margin: '.2rem 0 .5rem' } }, `Three tasks from the crown for the whole Realm, counted from everyone's runs. Each one fulfilled pays every contributor ✦ ${D.renown} and blesses every run next week.`),
    rows, bless);
}

// ---------- Wonders of the Realm ----------
export function wondersCard(app, r, rerender) {
  const W = r?.wonder;
  const built = W ? W.built : app.profile.wonders?.built || 0;
  const standing = WONDERS.slice(0, built);
  const next = WONDERS[built];
  const list = h('div', { class: 'wonder-list' }, WONDERS.map((w, i) => h('div', { class: 'wonder' + (i < built ? ' built' : i === built ? ' next' : ''), title: `${w.name}: ${w.text}` },
    h('span', { class: 'wd-ico', 'aria-hidden': 'true' }, i < built || i === built ? w.icon : '🔒'), h('small', {}, i < built ? w.name : i === built ? 'Rising' : '???'))));
  const kids = [
    h('div', { class: 'row' }, h('h3', { style: { margin: 0 } }, '🏛 Wonders of the Realm'), h('span', { class: 'spacer' }), h('span', { class: 'chip' }, `${built} of ${WONDERS.length} stand`)),
    h('p', { class: 'muted', style: { margin: '.2rem 0 .5rem' } }, `The Realm raises them together. Every wave anyone holds lays ${WONDER.perWave} stones, and you can give Renown (a stone each). Each Wonder that stands blesses every run, for good.`),
    list,
  ];
  if (next && W) {
    kids.push(h('div', { class: 'rmeter', style: { marginTop: '.5rem' } },
      h('div', { class: 'row', style: { gap: '.4rem' } }, h('b', {}, `${next.icon} ${next.name}`), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, `${fmt(W.stones)} / ${fmt(next.cost)} stones`)),
      bar(Math.min(1, W.stones / next.cost), 'gold'),
      h('small', { class: 'muted' }, `When it stands: ${next.text} on every run. You have laid ${fmt(W.mine)} stones${W.given ? ` (✦ ${fmt(W.given)} given)` : ''}.`)));
    const p = app.profile;
    const give = (n) => async (e) => {
      const amt = Math.min(n, Math.floor(p.renown), WONDER.giveMax);
      if (amt < 1) { toast('You have no Renown to give right now.'); return; }
      e.currentTarget.disabled = true;
      try {
        const res = await app.api.realmGive(amt);
        p.renown -= amt; p.stats.wonderGiven = (p.stats.wonderGiven || 0) + amt;
        if (res.wonder) { r.wonder = res.wonder; p.wonders = { built: res.wonder.built, at: Date.now() }; }
        saveProfile(p); audio.play('coin');
        toast(res.wonder && res.wonder.built > built ? `${next.icon} ${next.name} stands! Every run now gains ${next.text}.` : `You gave ✦ ${fmt(amt)} to ${next.name}.`, { kind: 'ach', icon: '🏛', ms: 4000 });
        rerender && rerender();
      } catch (err) { toast(err.message); e.currentTarget.disabled = false; }
    };
    kids.push(h('div', { class: 'row', style: { gap: '.4rem', marginTop: '.5rem' } }, h('span', { class: 'muted' }, `Give Renown (you have ✦ ${fmt(Math.floor(p.renown))}):`),
      [100, 1000, 5000].map((n) => h('button', { class: 'btn small gold', disabled: p.renown < 1, onclick: give(n) }, `✦ ${fmt(n)}`))));
    if (W.top?.length) kids.push(h('div', { class: 'muted', style: { fontSize: '.85rem', marginTop: '.4rem' } }, 'Master builders: ', W.top.map((t, i) => `${['🥇', '🥈', '🥉', '4.', '5.'][i]} ${t.name} (${fmt(t.stones)})`).join('  ')));
  } else if (!W) kids.push(h('p', { class: 'muted' }, 'Go online to see the Wonder the Realm is raising now.'));
  if (standing.length) kids.push(h('div', { class: 'row', style: { gap: '.35rem', marginTop: '.4rem' } }, h('b', {}, 'Blessing every run:'), standing.map((w) => h('span', { class: 'chip', title: w.name }, `${w.icon} ${w.text}`))));
  return h('div', { class: 'plaque trim wonders' }, kids);
}

// ---------- the week's warlord ----------
export function warlordPlaque() { return warlordCard(warlordFor(seasonKey()), 1); }

// Perks the shared works give every run (cached on the device so they also apply offline).
export function sharedWorksPerks(p) {
  const perks = {};
  const add = (o) => { for (const [k, v] of Object.entries(o || {})) perks[k] = (perks[k] || 0) + v; };
  if (p.decreeBlessing && p.decreeBlessing.week === seasonKey()) add(p.decreeBlessing.perks);
  if (p.wonders?.built) for (const w of WONDERS.slice(0, p.wonders.built)) add(w.perk);
  return perks;
}
export { decreePerks };
