// The Realm UI: home card, campaign screen (weekly + monthly goals, blessings, roll of citizens), run-summary gain.
import { h, fmt, toast, bar } from './dom.js';
import { audio } from '../game/audio.js';
import { REALM } from '../data/balance.js';
import { saveProfile } from '../meta/profile.js';

const ICONS = ['🔥', '🪵', '🏰', '🏆', '👑'];
const pctText = (f) => Math.floor(Math.min(f, 9.99) * 100) + '%';

export function timeLeft(endsAt) {
  const ms = Math.max(0, endsAt - Date.now());
  const d = Math.floor(ms / 86400000), hrs = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return d ? `${d}d ${hrs}h left` : hrs ? `${hrs}h ${m}m left` : `${m}m left`;
}

// Milestone track: 0%..150% of the goal, with tier markers.
export function track(view) {
  const max = REALM.tiers[REALM.tiers.length - 1];
  const fill = Math.min(1, view.fraction / max);
  return h('div', { class: 'rtrack', role: 'img', 'aria-label': `${pctText(view.fraction)} of the goal` },
    h('div', { class: 'rbar' }, h('i', { style: { width: fill * 100 + '%' } })),
    REALM.tiers.map((at, i) => h('span', {
      class: 'rmark' + (i < view.reached ? ' hit' : ''), title: `${REALM.tierNames[i]} · ${Math.round(at * 100)}%`,
      style: { left: (at / max) * 100 + '%' },
    }, ICONS[i])));
}

function meter(label, value, goal, cls) {
  return h('div', { class: 'rmeter' },
    h('div', { class: 'row', style: { gap: '.4rem' } }, h('b', {}, label), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, `${fmt(value)} / ${fmt(goal)}`)),
    bar(Math.min(1, value / Math.max(1, goal)), cls));
}

export function claimButton(app, view, after) {
  if (!view.claimable) return null;
  return h('button', { class: 'btn gold wide pulse', onclick: async (e) => {
    e.currentTarget.disabled = true;
    try {
      const r = await app.api.realmClaim(view.key);
      if (r.renown) { app.profile.renown += r.renown; audio.play('achievement'); toast(`The Realm rewards you: ✦ ${r.renown} Renown`, { kind: 'ach', icon: '👑', ms: 3600 }); }
      if (r.title && !app.profile.titles.includes(r.title)) { app.profile.titles.push(r.title); toast(`New title: ${r.title}`, { kind: 'ach', icon: '🏅', ms: 4500 }); }
      saveProfile(app.profile);
      await app.refreshRealm();
      after && after();
    } catch (err) { toast(err.message); e.currentTarget.disabled = false; }
  } }, `Claim spoils · ✦ ${view.claimable}`);
}

function campaign(app, v, rerender) {
  const cfg = REALM[v.kind];
  const done = v.reached >= 4;
  return h('div', { class: 'plaque realm-card' + (done ? ' won' : '') },
    h('div', { class: 'row' }, h('h3', { style: { margin: 0 } }, cfg.label), h('span', { class: 'spacer' }), h('span', { class: 'chip' }, timeLeft(v.endsAt)), h('b', { class: 'rpct' }, pctText(v.fraction))),
    h('div', { class: 'muted', style: { fontSize: '.85rem', margin: '.2rem 0 .5rem' } }, `${v.citizens} citizen${v.citizens === 1 ? '' : 's'} fighting · every enemy and every wave counts`),
    meter('Enemies defeated', v.kills, v.goal.kills, 'blue'),
    meter('Waves held', v.waves, v.goal.waves, 'moss'),
    track(v),
    h('div', { class: 'rtiers' }, v.tiers.map((t, i) => h('div', { class: 'rtier' + (t.reached ? ' hit' : '') + (t.claimed ? ' claimed' : '') },
      h('span', { class: 'ic' }, ICONS[i]), h('span', {}, h('b', {}, t.name), h('small', {}, `${Math.round(t.at * 100)}% · ${t.perk}`)),
      h('span', { class: 'rw' }, t.claimed ? '✓' : `✦ ${t.renown}`)))),
    h('div', { class: 'rshare' }, v.mine.kills ? h('span', {}, 'Your share: ', h('b', {}, `${fmt(v.mine.kills)} enemies · ${fmt(v.mine.waves)} waves`), ` (${(v.mine.share * 100).toFixed(1)}% of the Realm)`)
      : h('span', { class: 'muted' }, 'You have not fought this campaign yet. Finish a run to join in.'),
      !v.eligible && v.mine.kills ? h('div', { class: 'muted' }, `Defeat ${fmt(v.minKills - v.mine.kills)} more to share in the spoils.`) : null),
    claimButton(app, v, rerender));
}

// ---------- home card ----------
export function realmHomeCard(app) {
  const r = app.realm;
  const go = () => app.showSocial('realm');
  if (!r) {
    const off = app.api.online === false;
    return h('button', { class: 'plaque realm-mini', onclick: go },
      h('div', { class: 'row' }, h('b', {}, REALM.name), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, off ? 'Offline' : 'Connecting…')),
      h('div', { class: 'muted', style: { fontSize: '.85rem' } }, off ? 'Play online to fight for the Realm: shared weekly and monthly goals, and your name on the roll.' : 'Gathering word from the front…'));
  }
  const w = r.week, m = r.month;
  const perks = r.blessing.text;
  return h('button', { class: 'plaque realm-mini trim', onclick: go },
    h('div', { class: 'row' }, h('b', {}, REALM.name), h('span', { class: 'spacer' }), r.claimable ? h('span', { class: 'badge' }, '✦ spoils') : h('span', { class: 'chip' }, timeLeft(w.endsAt))),
    h('div', { class: 'rmini-row' }, h('span', {}, 'Weekly Muster'), bar(Math.min(1, w.fraction), w.reached >= 4 ? 'gold' : 'blue'), h('b', {}, pctText(w.fraction))),
    h('div', { class: 'rmini-row' }, h('span', {}, 'Monthly Campaign'), bar(Math.min(1, m.fraction), m.reached >= 4 ? 'gold' : 'moss'), h('b', {}, pctText(m.fraction))),
    h('div', { class: 'muted', style: { fontSize: '.85rem', marginTop: '.3rem' } },
      w.mine.kills ? `You: ${fmt(w.mine.kills)} enemies this week (${(w.mine.share * 100).toFixed(1)}%). ` : 'Every enemy you defeat counts toward the goal. ',
      perks.length ? `Blessings: ${perks.map((p) => p.text).join(', ')}.` : 'Reach 25% to light the first Watchfire blessing for everyone.'));
}

// ---------- run summary ----------
export function realmGain(app, rr) {
  if (!rr) return null;
  const a = rr.added;
  const lines = [];
  const camp = (label, c, kind) => {
    const up = c.reached > c.reachedBefore;
    const cfg = REALM[kind];
    lines.push(h('div', { class: 'rgain-row' },
      h('span', {}, label), bar(Math.min(1, c.fraction), kind === 'week' ? 'blue' : 'moss'),
      h('b', {}, `${pctText(c.before)} → ${pctText(c.fraction)}`)));
    if (up) {
      const i = c.reached - 1;
      lines.push(h('div', { class: 'rgain-tier' }, `${ICONS[i]} ${REALM.tierNames[i]} reached! Everyone gains: ${cfg.perkText[i]}. Claim your spoils in The Realm.`));
    }
  };
  camp('This week', rr.week, 'week');
  camp('This month', rr.month, 'month');
  return h('div', { class: 'plaque trim rgain' },
    h('h3', {}, `You gave the Realm +${fmt(a.kills)} enemies and +${fmt(a.waves)} waves`),
    a.capped ? h('div', { class: 'muted' }, 'You hit your personal cap for this campaign, so only part of this run counted. The Realm thanks you!') : null,
    lines,
    h('button', { class: 'btn small', onclick: () => app.showSocial('realm') }, 'Open the Realm'));
}

// ---------- the Realm tab ----------
export function realmTab(app, body, fail) {
  const st = app.realmBoard || (app.realmBoard = { period: 'week', sort: 'kills' });
  const p = app.profile;
  async function load() {
    body.replaceChildren(h('div', { class: 'empty' }, 'Loading the Realm…'));
    try {
      await app.refreshRealm();
      const r = app.realm;
      const board = await app.api.realmBoard(st.period, st.sort);
      draw(r, board);
    } catch (e) { fail(e); }
  }
  function draw(r, board) {
    const seg = (key, opts) => h('div', { class: 'seg' }, opts.map(([v, l]) => h('button', { 'aria-pressed': String(st[key] === v), onclick: async () => { st[key] = v; const b = await app.api.realmBoard(st.period, st.sort); draw(app.realm, b); } }, l)));
    const rows = board.rows.map((row, i) => {
      const top = Math.max(1, board.rows[0]?.[board.sort] || 1);
      return h('div', { class: 'lrow rrow' + (row.id === p.online?.id ? ' me' : '') },
        h('span', { class: 'rank' + (i < 3 ? ' top' : '') }, i < 3 ? ['🥇', '🥈', '🥉'][i] : row.rank),
        h('span', { class: 'who' },
          h('b', {}, row.name), row.title || row.clan ? h('small', {}, [row.title, row.clan ? `[${row.clan}]` : ''].filter(Boolean).join(' ')) : null,
          h('small', {}, `${fmt(row.kills)} enemies · ${fmt(row.waves)} waves · ${fmt(row.hero)} by hand`),
          bar(row[board.sort] / top, 'gold')),
        h('span', { class: 'val' }, (row.share * 100 < 10 ? (row.share * 100).toFixed(1) : Math.round(row.share * 100)) + '%'));
    });
    const prev = [r.prev.week, r.prev.month].filter((v) => v.claimable > 0);
    body.replaceChildren(...[
      h('div', { class: 'plaque trim realm-head' },
        h('div', {}, h('h3', { style: { fontFamily: 'var(--display)', fontSize: '1.7rem', margin: 0, color: 'var(--gold)' } }, r.name),
          h('div', { class: 'muted' }, 'One nation. Every citizen fights for the same goals, and the whole Realm is blessed when they are met.')),
        r.top.length ? h('div', { class: 'muted', style: { fontSize: '.85rem' } }, 'Leading the muster: ', r.top.map((t, i) => `${['🥇', '🥈', '🥉'][i]} ${t.name} (${fmt(t.kills)})`).join('  ')) : null),
      prev.length ? h('div', { class: 'grid', style: { margin: '.8rem 0' } }, prev.map((v) => h('div', { class: 'plaque trim' }, h('b', {}, `Spoils from the last ${v.kind === 'week' ? 'Weekly Muster' : 'Monthly Campaign'} (${Math.round(v.fraction * 100)}%)`), claimButton(app, v, load)))) : null,
      h('div', { class: 'grid two', style: { margin: '.8rem 0' } }, campaign(app, r.week, load), campaign(app, r.month, load)),
      h('div', { class: 'plaque', style: { marginBottom: '.8rem' } },
        h('h3', {}, 'Blessings on every citizen'),
        r.blessing.text.length ? h('div', { class: 'row' }, r.blessing.text.map((t) => h('span', { class: 'chip', title: `${t.kind === 'week' ? 'Weekly' : 'Monthly'} · ${t.name}` }, `${t.kind === 'week' ? '⚔' : '🛡'} ${t.text}`)))
          : h('p', { class: 'muted' }, 'None yet. Each milestone the Realm reaches gives every citizen a bonus in every run, starting the moment it is hit.'),
        h('p', { class: 'muted', style: { fontSize: '.85rem' } }, 'Blessings last until the campaign ends. A new week and a new month bring new goals, set from how many citizens answered the last call.')),
      h('div', { class: 'plaque' },
        h('div', { class: 'row', style: { marginBottom: '.5rem' } }, h('h3', { style: { margin: 0 } }, 'Roll of citizens'), h('span', { class: 'spacer' }), seg('period', [['week', 'Week'], ['month', 'Month'], ['all', 'All time']])),
        h('div', { style: { marginBottom: '.5rem' } }, seg('sort', [['kills', 'Enemies'], ['waves', 'Waves'], ['hero', 'By hand']])),
        board.me ? h('div', { class: 'rme' }, `You: #${board.me.rank} · ${fmt(board.me.kills)} enemies · ${fmt(board.me.waves)} waves · ${(board.me.share * 100).toFixed(1)}% of all the Realm has done`) : h('div', { class: 'muted', style: { marginBottom: '.5rem' } }, 'You are not on the roll yet. Finish a run online.'),
        rows.length ? h('div', { class: 'list' }, rows) : h('div', { class: 'empty' }, 'No citizens yet. Be the first to answer the call.'),
        h('p', { class: 'muted', style: { fontSize: '.8rem', marginTop: '.6rem' } }, `Share = your enemies defeated as a part of the whole Realm's total. Contributions are capped per citizen each campaign so the nation stays a team effort.`))].filter(Boolean));
  }
  load();
}
