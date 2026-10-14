// Co-op presentation: the common enemy, the Daily Rally, the Realm's deeds, team bonuses, and the Chronicle (stats).
import { h, fmt, fmtTime, toast, bar } from './dom.js';
import { REALM, RALLY, ASCENSION, KEEP, ABILITIES, TOWERS } from '../data/balance.js';
import { keepLevel, unlockedAbilities, unlockedTowers } from '../meta/profile.js';
import { activeEvent, blessingFor, rankFor, rankLadder } from '../meta/events.js';
import { EVENT_RENOWN_BONUS, RANKS } from '../data/events.js';
import { RANK_REWARDS } from '../data/prestige.js';
import { prestigeStatus, roman } from '../meta/prestige.js';
import { codexProgress } from '../meta/medals.js';
import { insights, bestWave } from '../meta/insights.js';
import { openProfile } from './profile.js';

export const BOSS_ICON = { 'The Iron Colossus': '🗿', 'Queen of Ash': '🌋', 'The Hollow King': '💀', 'Stormwyrm': '🐉', 'Mother of Rats': '🐀' };
const DEED_ICON = { best: '📈', milestone: '🏆', siege: '🗡', realm: '🏰', rally: '📣', map: '🗺' };
const hoursLeft = (ms) => { const hrs = Math.max(0, Math.ceil((ms - Date.now()) / 3600000)); return hrs >= 48 ? `${Math.ceil(hrs / 24)} days left` : `${hrs}h left`; };
const ago = (t) => { const m = Math.max(0, Math.floor((Date.now() - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`; };
const pctOf = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);

export function tagline() { return h('div', { class: 'coop-tag' }, 'One Realm. One enemy. Hold the line together.'); }

// ---------- the common enemy, on the home screen ----------
export function frontCard(app) {
  const f = app.front;
  const go = () => app.showSocial('realm');
  if (!f) {
    const off = app.api.online === false;
    return h('button', { class: 'plaque front-card', onclick: go },
      h('div', { class: 'row' }, h('b', {}, '⚔ The Realm stands together'), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, off ? 'Offline' : 'Connecting…')),
      h('div', { class: 'muted' }, off ? 'Play online to fight side by side with other citizens against a common enemy.' : 'Gathering word from the front…'));
  }
  const s = f.siege, r = f.rally;
  const left = s.hp / s.maxHp;
  const share = s.maxHp - s.hp > 0 ? pctOf(s.yourDamage, s.maxHp - s.hp) : 0;
  return h('button', { class: 'plaque front-card' + (s.defeated ? ' felled' : ''), onclick: go },
    h('div', { class: 'front-head' },
      h('span', { class: 'boss-ico', 'aria-hidden': 'true' }, s.defeated ? '🏆' : BOSS_ICON[s.name] || '👹'),
      h('div', { class: 'front-title' },
        h('span', { class: 'muted' }, s.defeated ? 'Defeated by the whole Realm' : 'The common enemy'),
        h('b', {}, s.name)),
      h('span', { class: 'chip' }, s.defeated ? 'Next foe soon' : hoursLeft(s.endsAt))),
    s.defeated ? null : bar(left, 'red'),
    h('div', { class: 'front-line' },
      s.defeated ? `Every defender shares the spoils. ${fmt(s.defenders)} citizens fought.`
        : `${Math.ceil(left * 100)}% of its strength left · ${fmt(s.defenders)} defender${s.defenders === 1 ? '' : 's'} · you dealt ${fmt(s.yourDamage)}${share ? ` (${share}% of the damage so far)` : ''}`),
    r ? h('div', { class: 'rally-row' }, h('span', {}, '📣 Daily Rally'), bar(Math.min(1, r.kills / r.goal), r.done ? 'gold' : 'blue'),
      h('b', {}, r.done ? 'Won!' : `${pctOf(r.kills, r.goal)}%`)) : null,
    r ? h('div', { class: 'muted front-sub' }, r.done
      ? (r.mine.rewarded ? 'You earned today\'s spoils. Keep fighting to protect your rank.' : `The Realm won today. Defeat ${Math.max(0, r.minKills - r.mine.kills)} more enemies to share the spoils.`)
      : `${fmt(Math.max(0, r.goal - r.kills))} enemies to go. ${r.mine.kills >= r.minKills ? 'You are in for the spoils.' : `Defeat ${r.minKills - r.mine.kills} more to share ✦ ${r.renown} Renown.`}`) : null,
    h('div', { class: 'front-foot' },
      h('span', { class: 'online-dot' }), h('span', {}, `${fmt(f.online)} citizen${f.online === 1 ? '' : 's'} online now`)),
    f.feed?.length ? h('div', { class: 'ticker' }, f.feed.slice(0, 2).map((d) => h('div', {}, `${DEED_ICON[d.kind] || '•'} ${d.text}`))) : null);
}

// ---------- team bonuses: who is helping you this run ----------
export function teamBonuses(app) {
  const chips = [];
  const r = app.realm;
  if (r?.blessing?.text?.length) for (const t of r.blessing.text) chips.push([t.kind === 'week' ? '⚔' : '🛡', t.text, `Realm blessing (${t.kind === 'week' ? 'weekly' : 'monthly'})`]);
  const b = blessingFor();
  chips.push([b.icon, b.text, b.name]);
  const ev = activeEvent();
  if (ev) chips.push([ev.icon, `+${Math.round(EVENT_RENOWN_BONUS * 100)}% Renown`, ev.name]);
  if (app.clan) chips.push(['🛡', `Clan ${app.clan.tag}`, 'Your clan perks apply']);
  return h('div', { class: 'plaque trim team-bonus' },
    h('b', {}, 'Your allies are with you'),
    h('div', { class: 'row', style: { marginTop: '.3rem', gap: '.35rem' } }, chips.map(([i, t, title]) => h('span', { class: 'chip', title }, `${i} ${t}`))),
    r ? null : h('div', { class: 'muted', style: { fontSize: '.8rem' } }, 'Go online to unlock Realm blessings earned by every citizen.'));
}

// ---------- end of run: what this run did for everyone ----------
export function togetherSummary(app, r) {
  if (!r?.accepted) return null;
  const kids = [];
  const ra = r.rally;
  if (ra) kids.push(h('div', { class: 'rgain-row' }, h('span', {}, '📣 Daily Rally'), bar(Math.min(1, ra.kills / ra.goal), ra.done ? 'gold' : 'blue'),
    h('b', {}, ra.done ? 'Won!' : `${pctOf(ra.kills, ra.goal)}%`)));
  if (ra) kids.push(h('div', { class: 'muted' }, ra.done
    ? (ra.mine.rewarded ? `The Realm won today's Rally together. Your spoils (✦ ${ra.renown}) are in your Inbox.` : `The Realm won today's Rally. Defeat ${Math.max(0, ra.minKills - ra.mine.kills)} more enemies to share the spoils.`)
    : `${fmt(Math.max(0, ra.goal - ra.kills))} enemies to go with ${fmt(ra.fighters)} citizen${ra.fighters === 1 ? '' : 's'} fighting. You added ${fmt(ra.mine.kills)} today.`));
  if (r.siege?.damage) kids.push(h('div', {}, `🗡 You hit the common enemy for ${fmt(r.siege.damage)}.`));
  const tips = insights({ profile: app.profile, realm: app.realm, front: app.front ? { ...app.front, rally: ra || app.front.rally } : null, you: null }, 3);
  return h('div', { class: 'plaque trim together' },
    h('h3', {}, 'Stronger together'), ...kids,
    tips.length ? h('div', { class: 'nextup' }, h('b', {}, 'Within reach'), tips.map((t) => h('div', {}, `${t.icon} ${t.text}`))) : null);
}

// ---------- deeds ----------
export function feedList(app, items, { onCheered } = {}) {
  if (!items.length) return h('div', { class: 'empty' }, 'No deeds yet. Be the first to make the Realm proud.');
  return h('div', { class: 'feed' }, items.map((d) => {
    const cheerable = d.kind !== 'realm' && d.kind !== 'rally' && d.kind !== 'map' && !d.mine;
    const btn = cheerable ? h('button', { class: 'btn small cheer' + (d.cheered ? ' on' : ''), disabled: d.cheered, 'aria-label': 'Cheer this deed', onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { const r = await app.api.cheer(d.id); b.classList.add('on'); b.textContent = `👏 ${r.cheers}`; onCheered && onCheered(); } catch (err) { toast(err.message); b.disabled = false; }
    } }, `👏 ${d.cheers || ''}`.trim()) : (d.cheers ? h('span', { class: 'chip' }, `👏 ${d.cheers}`) : null);
    return h('div', { class: 'deed' + (d.mine ? ' mine' : '') },
      h('span', { class: 'deed-ico' }, DEED_ICON[d.kind] || '•'),
      h('span', Object.assign({ class: 'deed-text' }, d.pid && d.kind !== 'realm' && d.kind !== 'rally' && d.kind !== 'map' ? { role: 'button', tabindex: '0', title: 'View profile', style: { cursor: 'pointer' }, onclick: () => openProfile(app, d.pid) } : {}), d.text, h('small', {}, ago(d.at))),
      btn);
  }));
}

export function deedsPanel(app) {
  const box = h('div', { class: 'plaque' }, h('h3', {}, 'Deeds of the Realm'), h('div', { class: 'empty' }, 'Reading the chronicle…'));
  const load = async () => {
    try { const r = await app.api.feed(); box.replaceChildren(h('h3', {}, 'Deeds of the Realm'), h('p', { class: 'muted', style: { margin: '0 0 .5rem' } }, 'Cheer a fellow citizen. It costs nothing and makes their day.'), feedList(app, r.items)); }
    catch (e) { box.replaceChildren(h('h3', {}, 'Deeds of the Realm'), h('div', { class: 'empty' }, 'Go online to read the Realm\'s deeds.')); }
  };
  load();
  return box;
}

// ---------- the Chronicle: your numbers, then everyone's ----------
const kpi = (v, l) => h('div', { class: 'kpi' }, h('b', {}, v), h('span', {}, l));

export function insightsCard(app, server) {
  const list = insights({ profile: app.profile, realm: app.realm, front: app.front, you: server?.you });
  return h('div', { class: 'plaque trim insights' }, h('h3', {}, 'Within reach'),
    list.length ? list.map((i) => h('div', { class: 'insight' }, h('span', { class: 'ins-ico' }, i.icon), h('span', {}, i.text)))
      : h('div', { class: 'muted' }, 'Play a few runs and your next goals will show up here.'));
}

export function youExtras(app, server) {
  const p = app.profile, s = p.stats, y = server?.you;
  const rk = rankFor(s.renownEarned || 0);
  const streak = p.streak || {};
  return [
    h('div', { class: 'plaque' },
      h('div', { class: 'row' }, h('h3', { style: { margin: 0 } }, `Rank: ${rk.name}`), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, rk.next ? `${fmt(Math.max(0, rk.next.at - (s.renownEarned || 0)))} Renown to ${rk.next.name}` : 'Highest rank')),
      bar(rk.progress, 'gold')),
    rankLadderCard(s.renownEarned || 0),
    h('div', { class: 'kpis' },
      kpi(`${streak.n || 0} 🔥`, 'Day streak'), kpi(streak.best || 0, 'Best streak'), kpi(fmt(s.wavesCleared || 0), 'Waves held'),
      kpi(s.runs ? fmt(Math.round((s.kills || 0) / s.runs)) : '—', 'Avg enemies / run'), kpi(s.runs ? fmt(Math.round((s.renownEarned || 0) / s.runs)) : '—', 'Avg Renown / run'),
      kpi(p.achievements ? Object.keys(p.achievements).length : 0, 'Achievements')),
    ceilingsCard(p),
    y ? h('div', { class: 'plaque' }, h('h3', {}, 'Your part in the Realm'),
      h('div', { class: 'kpis' },
        kpi(y.weekRank ? `#${y.weekRank}` : '—', `This week (of ${fmt(y.weekCitizens)})`), kpi(fmt(y.weekKills), 'Enemies this week'),
        kpi((y.allShare * 100 < 10 ? (y.allShare * 100).toFixed(1) : Math.round(y.allShare * 100)) + '%', 'Of all the Realm has done'),
        kpi(fmt(y.siegeDamage), 'Damage to common enemies'), kpi(fmt(y.rallies), 'Rallies you helped win'), kpi(fmt(y.cheers), 'Cheers received'))) : null,
  ];
}

// The whole Commander ladder: every rank, what it takes, and where you stand.
export function rankLadderCard(lifetime) {
  const icon = { done: '✓', current: '🎖', locked: '🔒' };
  return h('div', { class: 'plaque ladder' }, h('h3', {}, 'Rank ladder'),
    h('div', { class: 'muted', style: { marginBottom: '.5rem' } }, 'Earn Renown from every run to climb. Each rank grants a title on your player card.'),
    h('div', { class: 'list' }, rankLadder(lifetime).map((r) =>
      h('div', { class: 'lrow ' + r.state + (r.state === 'current' ? ' me' : '') },
        h('span', { class: 'rank' }, icon[r.state]),
        h('span', { class: 'who' }, r.name, h('small', {}, (r.state === 'done' ? 'Title earned' : r.state === 'current' ? 'You are here' : `${fmt(r.remaining)} Renown to go`) + (RANK_REWARDS[r.name] ? ` · gift ✦ ${fmt(RANK_REWARDS[r.name].renown)}` : ''))),
        h('span', { class: 'val' }, r.at ? `${fmt(r.at)}` : 'Start')))));
}

// "How far can I go?": which things have a ceiling, and which are endless.
export function ceilingsCard(p) {
  const s = p.stats, rk = rankFor(s.renownEarned || 0);
  const best = bestWave(p) || 0, ps = prestigeStatus(p), cp = codexProgress(p);
  const owned = KEEP.reduce((a, k) => a + keepLevel(p, k.id), 0), total = KEEP.reduce((a, k) => a + k.cost.length, 0);
  const row = (label, val, note, frac) => h('div', { class: 'ceil-row' }, h('div', { class: 'row' }, h('b', {}, label), h('span', { class: 'spacer' }), h('span', {}, val)), note ? h('small', { class: 'muted' }, note) : null, frac != null ? bar(Math.min(1, frac), 'gold') : null);
  return h('div', { class: 'plaque' }, h('h3', {}, 'How far can you go?'),
    row('Waves', `Best: ${best || '—'} · endless`, 'There is no last wave. Enemies keep growing, so the Highest Wave leaderboard is the true test. It resets weekly, with an all-time board too.'),
    row('Ascension', `${p.maxAscCleared || 0} of ${ASCENSION.max} cleared`, `Each level makes foes ${Math.round(ASCENSION.hp * 100)}% tougher and your score count more. The Ascended board ranks the highest level and wave together.`, (p.maxAscCleared || 0) / ASCENSION.max),
    row('Commander rank', `${rk.name} · ${RANKS.findIndex((r) => r.name === rk.name) + 1} of ${RANKS.length}`, rk.next ? `${fmt(Math.max(0, rk.next.at - (s.renownEarned || 0)))} Renown to ${rk.next.name}.` : `${rk.name}, the highest rank.`, RANKS.findIndex((r) => r.name === rk.name) / (RANKS.length - 1)),
    row('Dynasty', ps.level ? `Dynasty ${roman(ps.level)}` : 'Not yet founded', `Prestige is endless: each Dynasty adds permanent power, a Legacy perk and royal rewards. ${ps.ok ? 'You are ready to ascend!' : `${fmt(ps.need - ps.have)} Renown to the next.`}`, ps.frac),
    row('Codex', `${cp.earned} of ${cp.total} medals`, 'Medals for every foe, boss and emplacement. Quarter, half, three quarters and full Codex each earn a title and +1% Renown.', cp.frac),
    row('Mastery', `Best tower: ★${s.maxMastery || 0}`, 'Mastery stars are endless. Each tower earns special perks at ★3, ★6, ★10 and ★15.'),
    row('The Keep', `${fmt(owned)} of ${fmt(total)} upgrades`, 'Everything in the Keep can be bought eventually.', owned / total),
    row('Collection', `${unlockedAbilities(p).size} of ${Object.keys(ABILITIES).length} castle arts · ${unlockedTowers(p).size} of ${Object.keys(TOWERS).length} emplacements`, null, (unlockedAbilities(p).size + unlockedTowers(p).size) / (Object.keys(ABILITIES).length + Object.keys(TOWERS).length)));
}

export function realmStatsPanel(app, server) {
  const r = server?.realm;
  if (!r) return h('div', { class: 'plaque' }, h('div', { class: 'empty' }, app.api.online === false ? 'Go online to see what the whole Realm has achieved.' : 'Counting the Realm…'));
  const f = app.front;
  return h('div', {},
    h('div', { class: 'plaque trim realm-total' },
      h('div', { class: 'muted' }, 'Together, the citizens of Aldermere have defeated'),
      h('div', { class: 'huge' }, fmt(r.kills)), h('div', { class: 'muted' }, `enemies and held ${fmt(r.waves)} waves, ${fmt(r.hero)} of those kills by hand.`)),
    h('div', { class: 'kpis' },
      kpi(fmt(r.citizens), 'Citizens'), kpi(fmt(r.online), 'Online now'), kpi(fmt(r.activeDay), 'Active today'),
      kpi(fmt(r.runs), 'Runs fought'), kpi(fmt(r.runsToday), 'Runs today'), kpi(r.hours >= 100 ? fmt(Math.round(r.hours)) + 'h' : r.hours + 'h', 'Time defending'),
      kpi(fmt(r.siegesWon), 'Common enemies felled'), kpi(fmt(r.rallyWins), 'Daily Rallies won'), kpi(r.deepest ? `${r.deepest.wave}` : '—', r.deepest ? `Deepest wave (${r.deepest.name})` : 'Deepest wave')),
    f ? h('div', { class: 'plaque' }, h('h3', {}, 'Today'),
      h('div', { class: 'rmini-row' }, h('span', {}, 'Daily Rally'), bar(Math.min(1, f.rally.kills / f.rally.goal), f.rally.done ? 'gold' : 'blue'), h('b', {}, f.rally.done ? 'Won' : pctOf(f.rally.kills, f.rally.goal) + '%')),
      app.realm ? h('div', { class: 'rmini-row' }, h('span', {}, 'Weekly Muster'), bar(Math.min(1, app.realm.week.fraction), 'blue'), h('b', {}, pctOf(app.realm.week.fraction, 1) + '%')) : null,
      app.realm ? h('div', { class: 'rmini-row' }, h('span', {}, 'Monthly Campaign'), bar(Math.min(1, app.realm.month.fraction), 'moss'), h('b', {}, pctOf(app.realm.month.fraction, 1) + '%')) : null) : null);
}

export { fmtTime, bestWave };
