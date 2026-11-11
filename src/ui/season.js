// The Season Road screen, its row on the home screen and its block on the run summary.
import { h, fmt, bar, toast } from './dom.js';
import { audio } from '../game/audio.js';
import { buzz } from './haptics.js';
import { saveProfile } from '../meta/profile.js';
import { coinBurst } from './supplies.js';
import { SEASON, seasonInfo, seasonStanding, tierCost, tierReward, rewardText, ensureSeason, seasonClaimable, claimSeason, seasonLine, seasonNameOf } from '../meta/season.js';

const XP_ROWS = [
  ['🌊', 'Every wave you hold', `+${SEASON.xp.wave} XP`],
  ['👑', 'Every boss you fell', `+${SEASON.xp.boss} XP`],
  ['⚔', 'Foes defeated', `up to +${SEASON.xp.killCap} XP a run`],
  ['🏴', 'Every stronghold taken on the attack', `+${SEASON.xp.stronghold} XP`],
  ['🏆', 'A win, or a new personal record', `+${SEASON.xp.victory} / +${SEASON.xp.record} XP`],
  ['🌅', 'Your first run of the day', `+${SEASON.xp.daily} XP`],
];

// Tells the player, once, how the season that just ended went (its rewards were paid when the month turned).
export function announceRollover(rolled) {
  if (!rolled) return;
  const bits = [`You reached tier ${rolled.tier}`];
  if (rolled.renown) bits.push(`✦ ${fmt(rolled.renown)} Renown collected for you`);
  toast(h('div', {}, h('b', {}, `${rolled.name} has ended`), h('div', { class: 'muted' }, bits.join(' · ') + '. A new Season Road begins.')), { kind: 'ach', icon: '🛤', ms: 6000, key: 'season-roll' });
}

function collect(app, host) {
  const p = app.profile;
  const got = claimSeason(p);
  if (!got.renown && !got.titles.length) return null;
  saveProfile(p);
  audio.play('achievement'); buzz('reward');
  if (host && !p.settings.reducedMotion) coinBurst(host, 18);
  const bits = [`✦ ${fmt(got.renown)} Renown`];
  for (const t of got.titles) bits.push(`title “${t}”`);
  if (got.laurels) bits.push(`${got.laurels} Laurel${got.laurels === 1 ? '' : 's'}`);
  toast(h('div', {}, h('b', {}, 'Season rewards collected'), h('div', { class: 'muted' }, bits.join(' · '))), { kind: 'ach', icon: '🛤', ms: 4200, key: 'season-claim' });
  app.checkAch?.();
  return got;
}

// Tell a friend where you stand: the phone's own share sheet where there is one, the clipboard everywhere else.
async function shareSeason(app, info, st) {
  const text = st.done ? `I walked the whole ${info.title} Season Road in Bastion Siege (${st.laurels} Laurel${st.laurels === 1 ? '' : 's'} beyond it). Can you?`
    : `I am on tier ${st.tier} of ${SEASON.tiers} on the ${info.title} Season Road in Bastion Siege, with ${info.daysLeft} day${info.daysLeft === 1 ? '' : 's'} to go. Race you to the end?`;
  const url = location.origin + location.pathname;
  if (navigator.share) { try { await navigator.share({ title: 'Bastion Siege', text, url }); return; } catch { /* cancelled, or not allowed here: fall through to the clipboard */ } }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Copied. Paste it to a friend.'); } catch { toast('Could not copy on this browser.'); }
}

export function seasonScreen(app) {
  const p = app.profile, screen = document.getElementById('screen');
  const { S, rolled } = ensureSeason(p);
  if (rolled) { saveProfile(p); announceRollover(rolled); }
  const render = (keepScroll = false) => {
    const y = screen.scrollTop;
    const info = seasonInfo(), st = seasonStanding(S.xp), c = seasonClaimable(p);
    const head = h('div', { class: 'plaque trim season-head' },
      h('div', { class: 'season-crest', 'aria-hidden': 'true' }, info.icon),
      h('div', { class: 'season-title' }, h('small', { class: 'muted' }, 'Season Road'), h('h2', {}, info.title),
        h('div', { class: 'muted' }, `${info.daysLeft} day${info.daysLeft === 1 ? '' : 's'} left · every run in every mode counts`)),
      h('div', { class: 'season-tier' }, h('b', {}, st.done ? '★' : String(st.tier)), h('small', {}, st.done ? `${st.laurels} Laurel${st.laurels === 1 ? '' : 's'}` : `of ${SEASON.tiers}`)),
      h('div', { class: 'season-prog' }, bar(st.frac, 'gold'),
        h('div', { class: 'row muted' }, h('span', {}, st.done ? 'Next Laurel' : `Tier ${st.tier + 1}`), h('span', { class: 'spacer' }), h('span', {}, `${fmt(st.into)} / ${fmt(st.need)} XP`))),
      h('div', { class: 'row season-share' }, h('span', { class: 'muted' }, `🏵 ${fmt(S.laurels | 0)} Laurel${(S.laurels | 0) === 1 ? '' : 's'} all told`), h('span', { class: 'spacer' }),
        h('button', { class: 'btn small ghost', onclick: () => shareSeason(app, info, st) }, 'Share')),
      c.count ? h('button', { class: 'btn gold big wide season-collect', onclick: (e) => { collect(app, e.currentTarget.parentElement); render(true); } }, `Collect ${c.count} reward${c.count === 1 ? '' : 's'} · ✦ ${fmt(c.renown)}`) : null);

    const rows = [];
    for (let t = 1; t <= SEASON.tiers; t++) {
      const r = tierReward(t, S.key);
      const state = t <= (S.claimed | 0) ? 'got' : t <= st.tier ? 'ready' : t === st.tier + 1 ? 'next' : 'locked';
      rows.push(h('div', { class: `road-row ${state}${r.big ? ' big' : ''}`, role: 'listitem', 'data-tier': t, 'aria-label': `Tier ${t}: ${rewardText(r)}${state === 'got' ? ', collected' : state === 'ready' ? ', ready to collect' : ''}` },
        h('span', { class: 'road-node', 'aria-hidden': 'true' }, state === 'got' ? '✔' : String(t)),
        h('span', { class: 'road-what' }, h('b', {}, `✦ ${r.renown} Renown`), r.title ? h('small', {}, `Title: ${r.title}`) : null, r.laurel ? h('small', {}, '🏵 A Season Laurel, kept for good') : null),
        h('span', { class: 'road-state' }, state === 'got' ? 'Collected' : state === 'ready' ? h('button', { class: 'btn small gold', onclick: (e) => { collect(app, e.currentTarget.closest('.road-row')); render(true); } }, 'Collect') : state === 'next' ? `${fmt(st.need - st.into)} XP to go` : `${fmt(tierCost(t))} XP`)));
    }
    const laurelRow = h('div', { class: 'road-row laurel ' + (st.done ? 'next' : 'locked'), role: 'listitem' },
      h('span', { class: 'road-node', 'aria-hidden': 'true' }, '🏵'),
      h('span', { class: 'road-what' }, h('b', {}, 'Beyond the road: Laurels'), h('small', {}, `Every ${fmt(SEASON.laurelXp)} XP after tier ${SEASON.tiers} earns a Laurel and ✦ ${SEASON.laurelRenown} Renown, until the month turns.`)),
      h('span', { class: 'road-state' }, st.done ? `${st.laurels} earned` : ''));

    const past = (S.past || []).slice().reverse();
    screen.replaceChildren(h('div', { class: 'screen-inner season-screen' + (keepScroll ? ' settled' : '') },
      h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => app.showHome(), 'aria-label': 'Back' }, '← Back'), h('h2', {}, '🛤 Season Road')),
      head,
      h('div', { class: 'road', role: 'list', 'aria-label': 'Season Road tiers' }, rows, laurelRow),
      h('div', { class: 'plaque', style: { margin: '.8rem 0' } }, h('h3', { style: { marginTop: 0 } }, 'How to earn Season XP'),
        h('div', { class: 'season-xp' }, XP_ROWS.map(([ico, what, v]) => h('div', { class: 'row' }, h('span', { 'aria-hidden': 'true' }, ico), h('span', {}, what), h('span', { class: 'spacer' }), h('b', {}, v)))),
        h('p', { class: 'muted', style: { marginBottom: 0 } }, 'A new road opens on the first of every month. Rewards you have not collected when a season ends are paid to you automatically.')),
      h('div', { class: 'plaque', style: { margin: '.8rem 0' } }, h('h3', { style: { marginTop: 0 } }, `🏵 Your Laurels: ${fmt(S.laurels | 0)}`),
        h('p', { class: 'muted' }, `Roads walked to the end: ${S.done | 0}. Laurels are never spent and never reset.`),
        past.length ? h('div', { class: 'season-past' }, past.map((x) => h('div', { class: 'row' }, h('span', {}, seasonNameOf(x.key)), h('span', { class: 'spacer' }), h('span', { class: 'chip' }, x.tier >= SEASON.tiers ? `★ Complete${x.laurels ? ` +${x.laurels}` : ''}` : `Tier ${x.tier}`))))
          : h('div', { class: 'muted' }, 'Your past seasons will be listed here.'))));
    if (keepScroll) screen.scrollTop = y;
    else {
      screen.scrollTop = 0;
      // open on the tier being worked on, not the top of a long list
      const at = screen.querySelector('.road-row.ready') || screen.querySelector('.road-row.next');
      if (at && (st.tier > 3)) requestAnimationFrame(() => { screen.scrollTop = Math.max(0, at.offsetTop - screen.clientHeight * 0.45); });
    }
  };
  render();
}

// The home screen's row: where you stand, and a nudge when rewards are waiting.
export function seasonHomeRow(app) {
  const L = seasonLine(app.profile);
  return h('button', { class: 'today-row season-row' + (L.claimable ? ' ready' : ''), onclick: () => app.showSeason() },
    h('span', { class: 'ti' }, L.info.icon),
    h('span', { class: 'tt' }, h('b', {}, L.claimable ? `Season Road: ${L.claimable} reward${L.claimable === 1 ? '' : 's'} waiting!` : `Season Road · ${L.info.name}`),
      h('small', {}, `${L.text} · ${L.sub}`), h('span', { class: 'season-mini' }, bar(L.st.frac, 'gold'))),
    h('span', { class: 'tv' }, L.claimable ? h('span', { class: 'sup-open' }, 'Collect') : h('span', { class: 'chev' }, '›')));
}

// The run summary's block: what this run earned and how far it moved you.
export function seasonSummary(app, sres) {
  if (!sres || !sres.xp) return null;
  const info = seasonInfo(), a = sres.after, up = sres.tiersUp;
  return h('div', { class: 'plaque season-sum' + (up ? ' up' : ''), style: { margin: '.6rem 0' } },
    h('div', { class: 'row' }, h('b', {}, `🛤 Season Road · ${info.name}`), h('span', { class: 'spacer' }), h('b', { class: 'season-gain' }, `+${fmt(sres.xp)} XP`)),
    h('div', { class: 'muted', style: { margin: '.2rem 0 .35rem' } }, sres.parts.map((x) => `${x.label} +${fmt(x.v)}`).join(' · ')),
    bar(a.frac, 'gold'),
    h('div', { class: 'row', style: { marginTop: '.35rem' } },
      h('span', {}, up ? `Tier ${sres.before.tier} → ${a.tier}${a.done ? ' · road complete!' : ''}` : a.done ? `${a.laurels} Laurel${a.laurels === 1 ? '' : 's'} · ${fmt(a.need - a.into)} XP to the next` : `Tier ${a.tier} · ${fmt(a.need - a.into)} XP to tier ${a.tier + 1}`),
      h('span', { class: 'spacer' }),
      sres.claimable ? h('button', { class: 'btn small gold', onclick: () => app.showSeason() }, `Collect ${sres.claimable}`) : null));
}
