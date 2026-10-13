// Player cards: tap a name anywhere to see their stats, ask them to be your friend, send aid, salute, block or report.
import { h, fmt, toast, modal, confirmBox } from './dom.js';
import { MAPS } from '../game/maps.js';
import { GIFTS, GIFT_DAILY_CAP, SALUTES, MOTTOS, WEAPONS, TOWERS } from '../data/balance.js';
import { ACHIEVEMENTS, COSMETICS } from '../meta/achievements.js';
import { rankFor } from '../meta/events.js';
import { keepLevel, saveProfile } from '../meta/profile.js';
import { KEEP } from '../data/balance.js';

const ago = (t) => { const m = Math.max(0, Math.floor((Date.now() - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`; };
const monthYear = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
const cos = (k, id) => COSMETICS[k]?.[id] || null;

// What this player chooses to show on their card.
export function showcasePayload(p) {
  const asc = p.maxAscCleared || 0;
  return {
    rank: rankFor(p.stats?.renownEarned || 0).name, castle: p.equip?.castle, hero: p.equip?.hero, skin: p.equip?.skin, trail: p.equip?.trail, weapon: p.weapon,
    ach: Object.keys(p.achievements || {}).length, achTotal: ACHIEVEMENTS.length, mastery: p.stats?.maxMastery || 0,
    keep: KEEP.reduce((a, k) => a + keepLevel(p, k.id), 0), asc, titles: (p.titles || []).length, motto: p.social?.motto | 0,
  };
}
let lastSync = '';
export async function syncShowcase(app) {
  try {
    const d = showcasePayload(app.profile), key = JSON.stringify(d);
    if (key === lastSync || !app.api.online) return;
    await app.api.showcase(d); lastSync = key;
  } catch { /* the card simply stays as it was */ }
}

// A name that opens a card when tapped. `id` may be missing (then it is plain text).
export function nameLink(app, id, name, kids = null) {
  if (!id || id === app.profile.online?.id) return h('b', {}, kids || name);
  return h('b', { class: 'namelink', role: 'button', tabindex: '0', title: `View ${name}`, onclick: (e) => { e.stopPropagation(); openProfile(app, id, name); }, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProfile(app, id, name); } } }, kids || name);
}

const stat = (v, l) => h('div', { class: 'kpi' }, h('b', {}, v), h('span', {}, l));

export async function openProfile(app, id, name = '', { onChange } = {}) {
  const m = modal([h('h2', {}, name || 'Commander'), h('div', { class: 'empty' }, 'Reading their record…')], { wide: true });
  const body = m.el;
  let d;
  try { d = await app.api.player(id); } catch (e) { body.replaceChildren(h('h2', {}, name || 'Commander'), h('p', {}, e.message), h('button', { class: 'btn', onclick: () => m.close() }, 'Close')); return; }
  render(d);

  function render(d) {
    const s = d.stats, sc = d.showcase || {};
    const chips = [
      sc.rank ? `🎖 ${sc.rank}` : null, d.title ? `🏅 ${d.title}` : null, d.clan ? `🛡 [${d.clan.tag}] ${d.clan.name}` : null,
      sc.castle && cos('castle', sc.castle) ? `🏰 ${cos('castle', sc.castle)}` : null, sc.weapon && WEAPONS[sc.weapon] ? `🏹 ${WEAPONS[sc.weapon].name}` : null,
      sc.hero && cos('hero', sc.hero) && sc.hero !== 'classic' ? `🧝 ${cos('hero', sc.hero)}` : null, sc.skin && sc.skin !== 'classic' && cos('skin', sc.skin) ? `🎨 ${cos('skin', sc.skin)}` : null,
    ].filter(Boolean);
    const status = d.online ? h('span', { class: 'chip' }, '🟢 Online now') : d.lastSeen ? h('span', { class: 'chip' }, `Seen ${ago(d.lastSeen)}`) : null;
    const actions = [];
    if (d.self) actions.push(h('span', { class: 'muted' }, 'This is you. Others see this card.'));
    else {
      if (d.relation === 'friends') {
        actions.push(h('button', { class: 'btn gold', onclick: () => giftDialog(app, d, () => {}) }, '🎁 Send aid'));
        actions.push(h('button', { class: 'btn', onclick: () => saluteDialog(app, d) }, '👋 Salute'));
        actions.push(h('button', { class: 'btn ghost', onclick: async () => { if (await confirmBox(`Remove ${d.name} from your friends?`, 'Remove')) { await app.api.removeFriend(d.id); d.relation = 'none'; render(d); onChange && onChange(); } } }, 'Remove friend'));
      } else if (d.relation === 'incoming') {
        actions.push(h('button', { class: 'btn gold', onclick: async () => { try { await app.api.acceptFriend(d.id); toast(`You and ${d.name} are friends!`); d.relation = 'friends'; render(d); onChange && onChange(); } catch (e) { toast(e.message); } } }, 'Accept friend request'));
        actions.push(h('button', { class: 'btn ghost', onclick: async () => { await app.api.declineFriend(d.id); d.relation = 'none'; render(d); onChange && onChange(); } }, 'Decline'));
      } else if (d.relation === 'sent') {
        actions.push(h('button', { class: 'btn', disabled: true }, 'Request sent'));
        actions.push(h('button', { class: 'btn ghost', onclick: async () => { await app.api.declineFriend(d.id); d.relation = 'none'; render(d); onChange && onChange(); } }, 'Cancel request'));
      } else if (!d.blocked) {
        actions.push(h('button', { class: 'btn gold', onclick: async () => { try { const r = await app.api.addFriendById(d.id); d.relation = r.state === 'friends' ? 'friends' : 'sent'; toast(r.state === 'friends' ? `You and ${d.name} are friends!` : 'Friend request sent'); render(d); onChange && onChange(); } catch (e) { toast(e.message); } } }, '➕ Add friend'));
      }
      actions.push(h('button', { class: 'btn ghost small', onclick: async () => {
        if (d.blocked) { await app.api.unblock(d.id); d.blocked = false; toast('Unblocked'); render(d); return; }
        if (await confirmBox(`Block ${d.name}? They will vanish from your boards and friends.`, 'Block', true)) { await app.api.block(d.id); d.blocked = true; d.relation = 'none'; toast('Blocked'); render(d); onChange && onChange(); }
      } }, d.blocked ? 'Unblock' : 'Block'));
      actions.push(h('button', { class: 'btn ghost small', onclick: async () => { if (await confirmBox(`Report ${d.name} for an inappropriate name?`, 'Report', true)) { try { await app.api.report(d.id); toast('Thanks, reported.'); } catch (e) { toast(e.message); } } } }, 'Report'));
    }
    const recent = (d.recent || []).map((r) => h('div', { class: 'lrow' },
      h('span', { class: 'rank' }, r.asc ? `A${r.asc}` : '⚔'),
      h('span', { class: 'who' }, h('b', {}, `Wave ${r.wave}`), h('small', {}, `${MAPS[r.map]?.name || r.map || 'Unknown'} · ${fmt(r.score)} pts · ${ago(r.at)}`)),
      h('span', {})));
    body.replaceChildren(...[
      h('div', { class: 'row' }, h('h2', { style: { margin: 0 } }, d.name), h('span', { class: 'spacer' }), status),
      h('div', { class: 'muted' }, `${sc.motto != null && MOTTOS[sc.motto] ? `“${MOTTOS[sc.motto]}” · ` : ''}Citizen since ${monthYear(d.since)}${d.friendCount ? ` · ${d.friendCount} friend${d.friendCount === 1 ? '' : 's'}` : ''}${d.mutual ? ` · ${d.mutual} mutual` : ''}`),
      chips.length ? h('div', { class: 'row', style: { gap: '.35rem', margin: '.5rem 0' } }, chips.map((c) => h('span', { class: 'chip' }, c))) : null,
      h('div', { class: 'kpis' },
        stat(s.bestWave || '—', 'Best wave'), stat(s.seasonWave ? `${s.seasonWave}${s.weekRank ? ` (#${s.weekRank})` : ''}` : '—', 'This week'), stat(s.ascension ? `A${s.ascension}` : '—', 'Top ascension'),
        stat(fmt(s.bestScore), 'Best score'), stat(fmt(s.bestHero), 'Best hero kills'), stat(fmt(s.runs), 'Runs'),
        stat(fmt(s.kills), 'Enemies defeated'), stat(fmt(s.hero), 'By hand'), stat(s.hours >= 100 ? fmt(Math.round(s.hours)) + 'h' : s.hours + 'h', 'Time defending'),
        stat(s.avgWave || '—', 'Average wave'), stat(MAPS[s.favMap]?.name || '—', 'Favourite map'), stat(sc.ach != null ? `${sc.ach}/${sc.achTotal || ACHIEVEMENTS.length}` : '—', 'Achievements'),
        stat(fmt(s.realmKills), 'Realm kills (all time)'), stat(fmt(s.weekKills), 'Realm kills this week'), stat(fmt(s.siegeDamage), 'Common enemy damage'),
        stat(fmt(s.rallies), 'Rallies won'), stat(fmt(s.cheers), 'Cheers received'), stat(sc.mastery ? `★${sc.mastery}` : '—', 'Top mastery')),
      recent.length ? h('div', { class: 'section-label' }, 'Latest runs') : null,
      recent.length ? h('div', { class: 'list' }, recent) : null,
      h('div', { class: 'row', style: { gap: '.4rem', marginTop: '.8rem', flexWrap: 'wrap' } }, ...actions, h('span', { class: 'spacer' }), h('button', { class: 'btn small', onclick: () => m.close() }, 'Close'))].filter(Boolean));
  }
}

export function giftDialog(app, f, done) {
  const p = app.profile;
  let kind = 'tower', tower = 'archer', left = null;
  const m = modal([h('div', { class: 'empty' }, 'Checking your supplies…')]);
  app.api.friends().then((r) => { left = r.giftsLeft; render(); }).catch((e) => { toast(e.message); m.close(); });
  const render = () => m.el.replaceChildren(
    h('h2', {}, `Send aid to ${f.name}`),
    h('div', { class: 'opt-list' }, Object.entries(GIFTS).map(([id, g]) => h('button', { class: 'opt', 'aria-pressed': String(kind === id), onclick: () => { kind = id; render(); } }, h('span', { class: 'box' }, kind === id ? '✓' : ''), h('span', {}, h('b', {}, g.name), h('small', {}, g.desc)), h('span', {})))),
    kind === 'tower' ? h('div', { class: 'seg', style: { marginTop: '.6rem' } }, ['archer', 'cannon', 'mage'].map((t) => h('button', { 'aria-pressed': String(tower === t), onclick: () => { tower = t; render(); } }, TOWERS[t].name))) : null,
    h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '.8rem' } }, h('span', { class: 'muted' }, `${left} left today · one per friend per day`), h('button', { class: 'btn small ghost', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn gold', disabled: left <= 0, onclick: async () => {
      try { await app.api.gift(f.id, kind, tower); p.social.giftsSent = (p.social.giftsSent || 0) + 1; saveProfile(p); app.checkAch(); toast(`Sent ${GIFTS[kind].name} to ${f.name}`); m.close(); done && done(); } catch (e) { toast(e.message); }
    } }, 'Send')));
}

export function saluteDialog(app, f) {
  const m = modal([h('h2', {}, `Salute ${f.name}`), h('p', { class: 'muted' }, 'A friendly note lands in their inbox. Quick, free and always kind.'),
    h('div', { class: 'opt-list' }, SALUTES.map((t, i) => h('button', { class: 'opt', onclick: async () => { try { await app.api.salute(f.id, i); toast(`Saluted ${f.name}`); m.close(); } catch (e) { toast(e.message); } } }, h('span', {}, h('b', {}, t)), h('span', {}), h('span', {})))),
    h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '.6rem' } }, h('button', { class: 'btn small ghost', onclick: () => m.close() }, 'Cancel'))]);
}

// Pick the line shown on your own card.
export function mottoPicker(app, onPick) {
  const p = app.profile;
  const m = modal([h('h2', {}, 'Your motto'), h('div', { class: 'opt-list' }, MOTTOS.map((t, i) => h('button', { class: 'opt', 'aria-pressed': String((p.social.motto | 0) === i), onclick: () => { p.social.motto = i; saveProfile(p); syncShowcase(app); m.close(); onPick && onPick(); } }, h('span', {}, h('b', {}, t)), h('span', {}), h('span', {}))))]);
}
