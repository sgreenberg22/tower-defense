// The Realm UI: home card, campaign screen (weekly + monthly goals, blessings, roll of citizens), run-summary gain.
import { decreesCard, wondersCard } from './living.js';
import { pickLoadout } from './loadout.js';
import { plural } from '../core/plural.js';
import { mapEventFor } from '../meta/events.js';
import { showRealmTour } from './realm-tour.js';
import { h, fmt, toast, bar, modal } from './dom.js';
import { audio } from '../game/audio.js';
import { REALM, ENEMIES, WEATHER, BIOMES } from '../data/balance.js';
import { saveProfile, isMapUnlocked } from '../meta/profile.js';
import { PROVINCES, TERRAINS, TERRITORY, MAX_PROVINCES, frontier, deltaFor, marchSetup, clampHeld, dominions, grandeur, standingFor, STANDING, SCOUT } from '../game/realmmap.js';
import { MAPS } from '../game/maps.js';
import { drawIcon } from '../game/render.js';
import { randomSeed } from '../core/rng.js';
import { mapWidget } from './mapview.js';
import { worksCard } from './works.js';
import { deedsPanel, frontCard } from './together.js';
import { nameLink } from './profile.js';

const ICONS = ['🔥', '🪵', '🏰', '🏆', '👑'];
// Small early progress shows a decimal so a single wave visibly moves the bar.
const pctText = (f) => { const v = Math.min(f, 9.99) * 100; return (v < 10 && v > 0 ? (Math.floor(v * 10) / 10).toFixed(1) : Math.floor(v)) + '%'; };

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

// Why the goal is what it is. Goals are set when a period opens, from the period before.
function basisText(v) {
  const b = v.basis, last = v.kind === 'week' ? 'last week' : 'last month', next = v.kind === 'week' ? 'next week' : 'next month';
  const lead = b.by === 'floor' ? 'Starting goal: the Realm was quiet ' + last + '.'
    : `Goal set from ${last}: ${fmt(b.active || 0)} citizen${b.active === 1 ? '' : 's'} defeated ${fmt(b.kills || 0)} enemies.`;
  return `${lead} The more citizens fight and the more they do, the bigger ${next}'s goal.`;
}

function campaign(app, v, rerender) {
  const cfg = REALM[v.kind];
  const done = v.reached >= 4;
  return h('div', { class: 'plaque realm-card' + (done ? ' won' : '') },
    h('div', { class: 'row' }, h('h3', { style: { margin: 0 } }, cfg.label), h('span', { class: 'spacer' }), h('span', { class: 'chip' }, timeLeft(v.endsAt)), h('b', { class: 'rpct' }, pctText(v.fraction))),
    h('div', { class: 'muted', style: { fontSize: '.85rem', margin: '.2rem 0 .5rem' } }, `${v.citizens} citizen${v.citizens === 1 ? '' : 's'} fighting · every enemy and every wave counts`),
    v.basis ? h('div', { class: 'muted basis', style: { fontSize: '.8rem', margin: '-.3rem 0 .5rem' } }, basisText(v)) : null,
    meter('Enemies defeated', v.kills, v.goal.kills, 'blue'),
    meter('Waves held', v.waves, v.goal.waves, 'moss'),
    track(v),
    h('div', { class: 'rtiers' }, v.tiers.map((t, i) => h('div', { class: 'rtier' + (t.reached ? ' hit' : '') + (t.claimed ? ' claimed' : '') },
      h('span', { class: 'ic' }, ICONS[i]), h('span', {}, h('b', {}, t.name), h('small', {}, `${Math.round(t.at * 100)}% · ${t.perk}`)),
      h('span', { class: 'rw' }, t.claimed ? '✓' : `✦ ${t.renown}`)))),
    h('div', { class: 'rshare' }, (v.mine.kills || v.mine.waves) ? h('span', {}, 'Your share: ', h('b', {}, `${fmt(v.mine.kills)} enemies · ${fmt(v.mine.waves)} waves`), ` (${(v.mine.share * 100).toFixed(1)}% of the Realm)`)
      : h('span', { class: 'muted' }, 'You have not fought this campaign yet. Clear a wave to join in.'),
      !v.eligible && v.mine.kills ? h('div', { class: 'muted' }, `Defeat ${fmt(v.minKills - v.mine.kills)} more to share in the spoils.`) : null),
    claimButton(app, v, rerender));
}

// ---------- the Map of Aldermere ----------
const KIND_ICON = { day: '📣', week: '⚔', month: '🛡', admin: '🪶' };
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const provinces = (n) => `province${Math.abs(n) === 1 ? '' : 's'}`;
function periodLabel(l) {
  if (l.kind === 'day') return new Date(l.period + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' Rally';
  if (l.kind === 'admin') return 'Royal decree:';
  if (l.kind === 'week') return 'Week ' + l.period.split('-W')[1] + ' Muster';
  return new Date(l.period.slice(2) + '-15T12:00:00Z').toLocaleDateString(undefined, { month: 'long' }) + ' Campaign';
}
function weatherName(biomeId) {
  const hz = BIOMES.find((b) => b.id === biomeId)?.hazard;
  return hz ? WEATHER.text[hz][0] : 'Fair skies';
}

export function startMarch(app, id) {
  const m = marchSetup(id);
  if (!m) return;
  const mapId = isMapUnlocked(app.profile, m.mapId) ? m.mapId : 'meadow';
  const foe = ENEMIES[m.foe];
  const box = modal([
    h('h2', { style: { fontFamily: 'var(--display)', margin: '0 0 .3rem' } }, `March on ${m.name}`),
    h('p', { class: 'muted', style: { margin: '0 0 .6rem' } }, TERRAINS[m.terrain].blurb),
    h('ul', { class: 'march-list' },
      h('li', {}, h('b', {}, 'Battlefield: '), MAPS[mapId].name + (mapId !== m.mapId ? ` (${MAPS[m.mapId].name} once you unlock it)` : '')),
      h('li', {}, h('b', {}, 'The land: '), `${TERRAINS[m.terrain].name}, with ${weatherName(m.biome).toLowerCase()} from wave ${TERRITORY.marchWeather}`),
      h('li', {}, h('b', {}, 'Native foe: '), `${plural(foe.name)} march in every wave, long before they would elsewhere. ${foe.desc}`),
      h('li', {}, h('b', {}, 'The prize: '), `every enemy you defeat counts ${TERRITORY.marchRally}× toward today's Daily Rally. Win the Rally and ${m.name} joins the Realm at midnight Central.`)),
    h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '.6rem' } },
      h('button', { class: 'btn ghost', onclick: () => box.close() }, 'Not yet'),
      h('button', { class: 'btn gold', onclick: () => { box.close(); pickLoadout(app, { key: 'march', title: `March on ${m.name}`, intro: 'Choose your weapon and castle arts for this march.', go: '⚔ March!', onGo: (c) => app.startRun({ mapId, seed: randomSeed(), modifiers: [], ascension: 0, weapon: c.weapon, loadout: c.loadout, squad: c.squad, mode: 'march', march: m.province }) }); } }, '⚔ Choose & march')),
  ], { wide: false });
}

function provinceCard(app, p, held, online) {
  const f = frontier(held), T = TERRAINS[p.terrain], foe = ENEMIES[p.foe];
  const isHeld = p.idx < held, contested = f.next && f.next.idx === p.idx, atRisk = f.border && f.border.idx === p.idx;
  const status = p.capital ? ['The Crown', 'held'] : isHeld ? (atRisk ? ['Held · at risk', 'risk'] : ['Held', 'held']) : contested ? ['Contested', 'contested'] : ['Horde land', 'horde'];
  const icon = (kind, id, def) => { const c = h('canvas'); drawIcon(c, kind, id, { def, size: 34 }); return c; };
  const rows = [
    h('div', { class: 'pv-row' }, h('span', { class: 'pv-ic' }, '🎁'), h('div', {}, h('b', {}, p.perkText), h('small', {}, isHeld ? 'Blesses every run while the Realm holds it.' : 'Yours in every run once the Realm takes it.'))),
  ];
  if (p.unit) rows.push(h('div', { class: 'pv-row' }, icon(p.unit.kind, p.unit.id), h('div', {}, h('b', {}, `Trains ${p.unit.kind === 'tower' ? 'the ' + p.unit.name : plural(p.unit.name)}`), h('small', {}, p.unit.kind === 'tower' ? `${T.name} crews serve your ${plural(p.unit.name)}.` : `${T.name} recruits fill your Garrison.`))));
  rows.push(h('div', { class: 'pv-row' }, icon('enemy', p.foe, foe), h('div', {}, h('b', {}, `Native foe: ${foe.name}`), h('small', {}, foe.desc))));
  rows.push(h('div', { class: 'pv-row' }, h('span', { class: 'pv-ic' }, '🗺'), h('div', {}, h('b', {}, MAPS[T.battlefield].name), h('small', {}, `${T.name} · ${weatherName(T.biome)}`))));
  const dom = dominions(held).find((d) => d.id === p.terrain);
  if (dom) rows.push(h('div', { class: 'pv-row' }, h('span', { class: 'pv-ic' }, '🏛'), h('div', {}, h('b', {}, `${dom.name} · ${dom.have}/${dom.total} held`),
    h('small', {}, dom.tiers.map((t) => `${t.earned ? '✓' : '○'} ${t.text} (${t.need} provinces)`).join(' · ')))));
  const mev = mapEventFor(p.id);
  if (mev) rows.unshift(h('div', { class: 'pv-row' }, h('span', { class: 'pv-ic' }, mev.icon), h('div', {}, h('b', {}, `${mev.name} · until ${mev.to.slice(5)}`), h('small', {}, `${mev.text} March on it for +${Math.round(mev.renownMarch * 100)}% Renown instead.`))));
  let action = null;
  if (contested) action = h('div', { class: 'pv-act' },
    h('button', { class: 'btn gold wide', onclick: () => startMarch(app, p.id) }, `⚔ March on ${p.name}`),
    h('small', { class: 'muted' }, `Kills in a March count ${TERRITORY.marchRally}× toward today's Daily Rally.${online ? '' : ' Go online so they count.'}`));
  else if (!isHeld) action = h('small', { class: 'muted pv-act' }, `The border must reach it first. Next to take: ${f.next?.name}.`);
  else if (atRisk) action = h('small', { class: 'muted pv-act' }, '⚠ The first province to fall if the Realm misses a task.');
  return h('div', { class: 'plaque pv-card' },
    h('div', { class: 'row', style: { gap: '.5rem', alignItems: 'baseline' } }, h('h3', { class: 'pv-name' }, p.name), h('span', { class: 'spacer' }), h('span', { class: 'chip pv-' + status[1] }, status[0])),
    h('div', { class: 'muted', style: { fontSize: '.85rem', margin: '-.1rem 0 .5rem' } }, p.capital ? 'The capital. It never falls.' : `${T.name} · ${T.blurb}`),
    rows, action);
}

function stakesCard(app, r) {
  const m = r.map, f = frontier(m.held);
  const nextName = f.next ? f.next.name : 'Bulwark';
  const loseName = f.border ? f.border.name : 'nothing (the heartland holds)';
  const rows = [];
  const line = (icon, title, frac, cls, now, rule, left) => rows.push(h('div', { class: 'stake' },
    h('div', { class: 'row', style: { gap: '.4rem' } }, h('span', {}, icon), h('b', {}, title), h('span', { class: 'spacer' }), left ? h('small', { class: 'muted' }, left) : null),
    bar(Math.min(1, frac), cls), h('div', { class: 'stake-now' }, now), h('small', { class: 'muted' }, rule)));
  const ra = m.rally, rf = ra.kills / Math.max(1, ra.goal);
  line('📣', 'Daily Rally', rf, ra.done ? 'gold' : 'blue',
    ra.done ? h('span', { class: 'up' }, `Won! ${nextName} joins the Realm at midnight Central (+1).`) : h('span', {}, `${Math.floor(rf * 100)}% · win it to take ${nextName}; miss it and ${loseName} falls.`),
    `Won +${TERRITORY.day.win} · missed ${TERRITORY.day.miss}. ${fmt(ra.kills)} / ${fmt(ra.goal)} enemies.`, timeLeft(ra.endsAt));
  for (const [kind, v, cls] of [['week', r.week, 'blue'], ['month', r.month, 'moss']]) {
    const d = deltaFor(kind, v.fraction), R = TERRITORY[kind];
    line(kind === 'week' ? '⚔' : '🛡', REALM[kind].label, v.fraction / 1.5, cls,
      h('span', { class: d > 0 ? 'up' : d < 0 ? 'down' : '' }, `${pctText(v.fraction)} · if it ended now: ${d ? signed(d) + ' ' + provinces(d) : 'the border holds'}`),
      `Legend ${signed(R.legend)} · Victory ${signed(R.victory)} · 50–99% holds · under 50% ${R.fail}`, timeLeft(v.endsAt));
  }
  return h('div', { class: 'plaque stakes' },
    h('h3', { style: { margin: '0 0 .4rem' } }, 'How the border moves'),
    h('p', { class: 'muted', style: { margin: '0 0 .6rem', fontSize: '.85rem' } }, 'Each task the Realm wins pushes the border out; each one it misses lets the horde take land back. The heartland around the capital never falls.'),
    rows,
    m.held >= MAX_PROVINCES ? h('div', { class: 'stake-now up' }, `The Realm is whole! Further victories build Bulwark (${m.bulwark}/${TERRITORY.bulwarkMax}), which absorbs future losses.`)
      : m.bulwark ? h('div', { class: 'stake-now' }, `🛡 Bulwark ${m.bulwark}: the next ${m.bulwark} loss${m.bulwark === 1 ? '' : 'es'} cost no land.`) : null);
}

// What the Realm's size and its lands give every citizen, and who is scouting the border.
function dominionCard(held) {
  const f = frontier(held), st = standingFor(held), nextSt = STANDING.find((x) => x.at > held), scout = f.next ? ENEMIES[f.next.foe] : null;
  const gr = grandeur(held), doms = dominions(held);
  const row = (name, sub, frac, tiers) => h('div', { class: 'dom-row' },
    h('div', { class: 'row', style: { gap: '.4rem' } }, h('b', {}, name), h('span', { class: 'spacer' }), h('small', { class: 'muted' }, sub)),
    frac != null ? bar(Math.min(1, frac), 'gold') : null,
    h('div', { class: 'dom-tiers' }, tiers.map((t) => h('span', { class: 'chip dom-tier' + (t.earned ? ' earned' : '') }, (t.earned ? '✓ ' : '○ ') + t.text + (t.need ? ` · ${t.need}` : '')))));
  return h('div', { class: 'plaque dominions' },
    h('h3', { style: { margin: '0 0 .2rem' } }, 'Dominions & Grandeur'),
    h('div', { class: 'muted', style: { fontSize: '.85rem', margin: '0 0 .6rem' } },
      `Standing: ${st.name}${nextSt ? ` · ${nextSt.name} at ${nextSt.at} provinces` : ''}. Hold enough of one land and its people join your cause; the bigger the Realm, the more every citizen gets. Lose the ground and the gift goes with it.`),
    h('div', { class: 'dom-grid' }, doms.map((d) => row(d.name, `${d.have}/${d.total} ${d.land}`, d.have / d.total, d.tiers))),
    h('h4', { style: { margin: '.7rem 0 .3rem' } }, 'Realm Grandeur'),
    h('div', { class: 'dom-grid' }, gr.map((g) => row(g.name, `${Math.min(held, g.at)}/${g.at} provinces`, held / g.at, [g]))),
    scout ? h('div', { class: 'stake-now', style: { marginTop: '.7rem' } }, `🔭 Scouts: from ${f.next.name} (${TERRAINS[f.next.terrain].name}), ${plural(scout.name)} test your walls in ordinary runs from wave ${SCOUT.from}. Take the province and the scouting stops.`)
      : h('div', { class: 'stake-now up', style: { marginTop: '.7rem' } }, '🔭 No land left to scout from. The Realm is whole.'));
}

function mapLog(m) {
  if (!m.log?.length) return h('div', { class: 'plaque' }, h('h3', { style: { margin: 0 } }, 'Chronicle of the border'), h('p', { class: 'muted' }, 'No changes yet. The border moves when today\'s Rally, this week\'s Muster or this month\'s Campaign closes.'));
  return h('div', { class: 'plaque' }, h('h3', { style: { margin: '0 0 .4rem' } }, 'Chronicle of the border'),
    h('div', { class: 'list' }, m.log.map((l) => h('div', { class: 'maplog' },
      h('span', {}, KIND_ICON[l.kind]), h('span', {}, h('b', {}, periodLabel(l)), ' ', l.outcome),
      h('span', { class: 'spacer' }), h('b', { class: l.delta > 0 ? 'up' : l.delta < 0 ? 'down' : 'muted' }, l.delta ? signed(l.delta) : '±0'), h('small', { class: 'muted' }, ` → ${l.held}`)))));
}

export function mapSection(app, r) {
  const p = app.profile;
  const online = !!r?.map;
  const held = clampHeld(online ? r.map.held : p.realmMap?.held || TERRITORY.start);
  const seen = p.realmMap?.seen;
  const flash = { gained: [], lost: [] };
  if (seen != null && seen !== held) for (let i = Math.min(seen, held); i < Math.max(seen, held); i++) (held > seen ? flash.gained : flash.lost).push(i);
  if (online) { p.realmMap = { ...(p.realmMap || {}), held, seen: held }; saveProfile(p); }
  const f = frontier(held);
  if (online && !p.seenRealmTour) setTimeout(() => { if (!p.seenRealmTour && !document.querySelector('.modal-back')) showRealmTour(app); }, 700);   // once, on the first visit
  const sel = { p: f.next || PROVINCES[0] };
  const cardBox = h('div', {});
  const widget = mapWidget({ held, selected: sel.p.idx, flash, onSelect: (pv) => { sel.p = pv; cardBox.replaceChildren(provinceCard(app, pv, held, online)); } });
  cardBox.append(provinceCard(app, sel.p, held, online));
  const wrap = h('div', { class: 'realm-map-wrap' }, widget.el);
  // On a narrow screen the map scrolls sideways; start with the contested province in view.
  requestAnimationFrame(() => requestAnimationFrame(() => { if (wrap.scrollWidth > wrap.clientWidth && f.next) wrap.scrollLeft = (f.next.x / 1000) * wrap.scrollWidth - wrap.clientWidth / 2; }));
  const changed = flash.gained.length ? `Since you last looked, the Realm took ${flash.gained.map((i) => PROVINCES[i].name).join(', ')}.` : flash.lost.length ? `Since you last looked, the horde took ${flash.lost.map((i) => PROVINCES[i].name).join(', ')}.` : null;
  return h('div', { class: 'map-section' },
    h('div', { class: 'plaque trim map-plaque' },
      h('div', { class: 'row', style: { gap: '.5rem', marginBottom: '.4rem' } },
        h('h3', { style: { margin: 0, fontFamily: 'var(--display)', fontSize: '1.6rem', color: 'var(--gold)' } }, 'The Map of Aldermere'), h('span', { class: 'spacer' }),
        h('button', { class: 'btn small ghost', title: 'A short animation of how the map works', onclick: () => showRealmTour(app) }, '▶ How it works'), h('span', { class: 'chip', title: 'Your standing grows with the Realm' }, `🏰 ${held} / ${MAX_PROVINCES} provinces · ${standingFor(held).name}`), online && r.map.bulwark ? h('span', { class: 'chip' }, `🛡 Bulwark ${r.map.bulwark}`) : null),
      h('div', { class: 'muted', style: { fontSize: '.85rem', marginBottom: '.5rem' } }, online
        ? 'Every task the Realm completes pushes the border out, and every province held blesses every run. Tap a province to see what it gives and what lives there.'
        : 'Last known borders. Go online to see the Realm as it stands today.'),
      changed ? h('div', { class: 'map-news ' + (flash.gained.length ? 'up' : 'down') }, changed) : null,
      wrap,
      h('div', { class: 'map-legend' }, h('span', {}, h('i', { class: 'lg held' }), 'Held'), h('span', {}, h('i', { class: 'lg contested' }), 'Contested: next to take'), h('span', {}, h('i', { class: 'lg horde' }), 'Horde land'), h('span', {}, h('i', { class: 'lg front' }), 'Front line'))),
    h('div', { class: 'grid two map-cards' }, cardBox, online ? stakesCard(app, r) : h('div', { class: 'plaque' }, h('p', { class: 'muted' }, 'Online, this shows today\'s Rally and this week\'s and month\'s goals, and what each will do to the border.'))),
    dominionCard(held),
    online ? mapLog(r.map) : null);
}

// A line for the run summary: what this run did for the border.
export function frontierLine(app, rally, summary) {
  const m = app.realm?.map;
  if (!rally || !m) return null;
  const f = frontier(m.held);
  const pctNow = Math.floor((rally.kills / Math.max(1, rally.goal)) * 100);
  const march = summary?.march ? PROVINCES.find((p) => p.id === summary.march) : null;
  const text = rally.done
    ? `🗺 Today's Rally is won: ${f.next ? f.next.name + ' joins the Realm at midnight Central' : 'the Realm grows stronger'}.`
    : `🗺 Daily Rally ${pctNow}%: win it today to take ${f.next ? f.next.name : 'Bulwark'}${f.border ? `, or ${f.border.name} falls` : ''}.`;
  return h('div', { class: 'plaque trim rgain' }, h('div', {}, text), march ? h('small', { class: 'muted' }, `Your March on ${march.name} counted ${TERRITORY.marchRally}× toward the Rally.`) : null,
    h('button', { class: 'btn small', onclick: () => app.showSocial('realm') }, 'Open the map'));
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
      w.mine.kills || w.mine.waves ? `You: ${fmt(w.mine.kills)} enemies · ${fmt(w.mine.waves)} waves this week. ` : 'Every enemy and every wave you clear counts toward the goal. ',
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
    } catch (e) { fail(e); body.prepend(mapSection(app, null), decreesCard(app, null), wondersCard(app, null), worksCard(app)); }
  }
  function draw(r, board) {
    const seg = (key, opts) => h('div', { class: 'seg' }, opts.map(([v, l]) => h('button', { 'aria-pressed': String(st[key] === v), onclick: async () => { st[key] = v; const b = await app.api.realmBoard(st.period, st.sort); draw(app.realm, b); } }, l)));
    const rows = board.rows.map((row, i) => {
      const top = Math.max(1, board.rows[0]?.[board.sort] || 1);
      return h('div', { class: 'lrow rrow' + (row.id === p.online?.id ? ' me' : '') },
        h('span', { class: 'rank' + (i < 3 ? ' top' : '') }, i < 3 ? ['🥇', '🥈', '🥉'][i] : row.rank),
        h('span', { class: 'who' },
          nameLink(app, row.id, row.name), row.title || row.clan ? h('small', {}, [row.title, row.clan ? `[${row.clan}]` : ''].filter(Boolean).join(' ')) : null,
          h('small', {}, `${fmt(row.kills)} enemies · ${fmt(row.waves)} waves · ${fmt(row.hero)} by hand`),
          bar(row[board.sort] / top, 'gold')),
        h('span', { class: 'val' }, (row.share * 100 < 10 ? (row.share * 100).toFixed(1) : Math.round(row.share * 100)) + '%'));
    });
    const prev = [r.prev.week, r.prev.month].filter((v) => v.claimable > 0);
    body.replaceChildren(...[
      mapSection(app, r),
      decreesCard(app, r),
      wondersCard(app, r, () => draw(app.realm, board)),
      worksCard(app),
      app.front ? frontCard(app) : null,
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
        h('p', { class: 'muted', style: { fontSize: '.85rem' } }, 'Blessings last until the campaign ends. A new week and a new month bring new goals, set from how many citizens answered the last call and how much they did, so the goals grow with the Realm.')),
      deedsPanel(app),
      h('div', { class: 'plaque', style: { marginTop: '.8rem' } },
        h('div', { class: 'row', style: { marginBottom: '.5rem' } }, h('h3', { style: { margin: 0 } }, 'Roll of citizens'), h('span', { class: 'spacer' }), seg('period', [['week', 'Week'], ['month', 'Month'], ['all', 'All time']])),
        h('div', { style: { marginBottom: '.5rem' } }, seg('sort', [['kills', 'Enemies'], ['waves', 'Waves'], ['hero', 'By hand']])),
        board.me ? h('div', { class: 'rme' }, `You: #${board.me.rank} · ${fmt(board.me.kills)} enemies · ${fmt(board.me.waves)} waves · ${(board.me.share * 100).toFixed(1)}% of all the Realm has done`) : h('div', { class: 'muted', style: { marginBottom: '.5rem' } }, 'You are not on the roll yet. Finish a run online.'),
        rows.length ? h('div', { class: 'list' }, rows) : h('div', { class: 'empty' }, 'No citizens yet. Be the first to answer the call.'),
        h('p', { class: 'muted', style: { fontSize: '.8rem', marginTop: '.6rem' } }, `Share = your enemies defeated as a part of the whole Realm's total. Contributions are capped per citizen each campaign so the nation stays a team effort.`))].filter(Boolean));
  }
  load();
}
