// The home screen: a living diorama up top, one clear way to play, a compact "today" list, and the Realm as one tidy strip.
import { h, fmt, bar, modal } from './dom.js';
import { MAPS } from '../game/maps.js';
import { MODIFIERS, VERSION, DIFFICULTY, ENEMIES, BOSSES } from '../data/balance.js';
import { scoreMultiplier } from '../game/economy.js';
import { dailySetup } from '../game/rules.js';
import { utcDateKey, randomSeed } from '../core/rng.js';
import { ACHIEVEMENTS, NEW_FOES } from '../meta/achievements.js';
import { saveProfile, loadRun, keepAffordable, isMapUnlocked } from '../meta/profile.js';
import { ensureQuests, fillText } from '../meta/quests.js';
import { activeEvent, nextEvent, nextReward, eventState, blessingFor, rankFor } from '../meta/events.js';
import { drawIcon } from '../game/render.js';
import { startDiorama } from './attract.js';
import { BOSS_ICON } from './together.js';
import { rewardLabel, howToPlay, challengeCard } from './screens.js';

const screen = () => document.getElementById('screen');
const pctOf = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);
const WHATS_NEW = '1.8';
let visits = 0, diorama = null;

export function homeScreen(app) {
  const p = app.profile;
  const saved = loadRun();
  const kids = [
    heroSection(app),
    app.pendingChallenge ? challengeCard(app) : null,
    h('div', { class: 'home-cols' },
      h('div', { class: 'home-col' }, playSection(app, saved), whatsNew(app), todayCard(app)),
      h('div', { class: 'home-col' }, realmStrip(app), tiles(app))),
    h('div', { class: 'home-foot muted' }, `v${VERSION} · ${app.api.online ? 'Online' : app.api.online === false ? 'Offline mode' : 'Connecting…'}`),
  ];
  const s = screen();
  s.replaceChildren(h('div', { class: 'home v2' }, h('div', { class: 'home-wrap' }, kids)));
  s.scrollTop = 0;
  // The home screen re-renders when online data arrives; keep the same little battle running through it.
  const slot = s.querySelector('.diorama canvas');
  if (diorama && diorama.alive() && slot) slot.replaceWith(diorama.canvas);
  else if (slot) {
    diorama?.stop();
    diorama = startDiorama(slot, p, { visit: visits++, onKill: (n) => { const c = document.querySelector('.dio-count'); if (c) { c.textContent = `${n} felled by your hand`; c.hidden = false; } } });
    diorama.canvas = slot;
    diorama.mapId = Object.keys(MAPS).find((k) => MAPS[k] === diorama.map);
  }
  const tag = s.querySelector('.dio-map');
  if (tag && diorama) tag.textContent = diorama.map.name + (isMapUnlocked(p, diorama.mapId) ? '' : ' · locked');
  if (diorama?.kills && diorama.kills() > 0) { const c = s.querySelector('.dio-count'); c.textContent = `${diorama.kills()} felled by your hand`; c.hidden = false; }
}

// ---------- the diorama and the title ----------
function heroSection(app) {
  const p = app.profile;
  const r = rankFor(p.stats.renownEarned || 0);
  return h('div', { class: 'home-hero' },
    h('div', { class: 'diorama' }, h('canvas', { 'aria-label': 'A living battlefield. Tap the invaders to shoot them.' }),
      h('div', { class: 'dio-chips' }, h('span', { class: 'chip dio-map' }, ''), h('span', { class: 'chip dio-tip' }, '🎯 Tap the invaders'), h('span', { class: 'chip dio-count', hidden: true }, ''))),
    h('div', { class: 'home-title' },
      h('h1', {}, 'Bastion Siege'),
      h('div', { class: 'sub' }, p.title ? `${p.name}, ${p.title}` : `Hold the line, ${p.name}.`),
      h('div', { class: 'rank-chip', title: r.next ? `${fmt(Math.max(0, r.next.at - (p.stats.renownEarned || 0)))} Renown to ${r.next.name}` : 'Highest rank' },
        h('b', {}, r.name), bar(r.progress, 'gold'))));
}

// ---------- one clear way to play ----------
function lastSetupLabel(p) {
  const L = p.lastRun;
  if (!L || !MAPS[L.mapId] || !isMapUnlocked(p, L.mapId)) return null;
  const d = DIFFICULTY.find((x) => x.wave === (L.startWave || 1));
  return `${MAPS[L.mapId].name} · ${d ? d.name : 'Recruit'}${L.modifiers?.length ? ' · ' + L.modifiers.length + ' mod' + (L.modifiers.length > 1 ? 's' : '') : ''}`;
}

function playSection(app, saved) {
  const p = app.profile;
  const daily = dailySetup();
  const todays = p.daily[utcDateKey()];
  const quick = lastSetupLabel(p);
  const continueBtn = saved && !saved.tutorial
    ? h('button', { class: 'btn blue big wide', onclick: () => app.resumeRun(saved) }, h('span', {}, 'Continue'), h('small', { class: 'btn-sub' }, `Wave ${saved.wave} · ${MAPS[saved.mapId]?.name || 'map'}`))
    : null;
  return h('div', { class: 'play-card' },
    continueBtn,
    h('button', { class: 'btn gold big wide', onclick: () => app.showSetup() }, 'New run'),
    h('div', { class: 'quick-row' },
      quick ? h('button', { class: 'btn quick', title: 'Same map, difficulty and modifiers as last time', onclick: () => {
        const L = p.lastRun;
        app.startRun({ mapId: L.mapId, seed: randomSeed(), modifiers: L.modifiers || [], ascension: L.ascension || 0, weapon: p.weapon, mode: L.mapId === 'frontier' ? 'frontier' : 'normal', startWave: L.startWave || 1 });
      } }, h('b', {}, '⚡ Quick run'), h('small', {}, quick)) : null,
      h('button', { class: 'btn quick daily-btn', onclick: () => app.startRun({ mapId: daily.map, seed: daily.seed, modifiers: daily.modifiers, mode: 'daily', ascension: 0, weapon: p.weapon }) },
        h('b', {}, todays ? `📅 Daily · best wave ${todays.wave}` : '📅 Daily challenge'),
        h('small', {}, `${MAPS[daily.map].name} · ${daily.modifiers.map((m) => MODIFIERS[m].name).join(' + ')} · ×${scoreMultiplier(daily.modifiers).toFixed(2)}`))));
}

// ---------- what's new (dismissible) ----------
function whatsNew(app) {
  const p = app.profile;
  if (p.seenNews === WHATS_NEW) return null;
  const box = h('div', { class: 'plaque whats-new' },
    h('div', { class: 'row' }, h('b', {}, '🗺 New: The Wild Marches'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn small ghost', 'aria-label': 'Dismiss', onclick: () => { p.seenNews = WHATS_NEW; saveProfile(p); box.remove(); } }, '✕')),
    h('div', { class: 'muted' }, 'Six new foes, the Bog Hydra, three new battlefields, a Repeater, hero outfits and more.'),
    h('button', { class: 'btn small gold', onclick: () => showNews(app) }, 'See what\'s new'));
  return box;
}

export function showNews(app) {
  const foe = (id) => {
    const boss = BOSSES.find((b) => b.id === id), def = boss || ENEMIES[id];
    const cv = h('canvas'); drawIcon(cv, 'enemy', boss ? 'boss:' + id : id, { def, size: 44 });
    return h('div', { class: 'news-foe' }, cv, h('div', {}, h('b', {}, def.name, h('small', { class: 'muted' }, boss ? ' · boss, wave 50' : ` · from wave ${def.unlock}`)), h('div', { class: 'muted' }, boss ? boss.desc : def.desc)));
  };
  const m = modal([
    h('h2', { style: { marginTop: 0 } }, 'The Wild Marches · v1.8'),
    h('h3', {}, 'New foes'), h('div', { class: 'news-foes' }, [...NEW_FOES, 'hydra'].map(foe)),
    h('h3', {}, 'New battlefields'),
    h('ul', { class: 'news-list' },
      h('li', {}, h('b', {}, "Serpent's Coil"), ' (wave 20): the road spirals around the keep; flyers cut straight across.'),
      h('li', {}, h('b', {}, 'Bogwater Ford'), ' (wave 30): two roads through deep mud that slows every walker.'),
      h('li', {}, h('b', {}, "Dragon's Spine"), ' (wave 40): three roads and a ridge of high ground that watches two at once.')),
    h('h3', {}, 'And'),
    h('ul', { class: 'news-list' },
      h('li', {}, 'Three new wave threats: Wild Hunt, Underground and Phantom March.'),
      h('li', {}, 'The Repeater: a twelve-bolt drum for combo hunters (The Keep, Hero).'),
      h('li', {}, 'Hero outfits: dress your archer on the battlements. New castles, trails, tower finishes and defeat effects.'),
      h('li', {}, 'Two new boons (Thief-Taker, Kindling) and twelve new achievements.'),
      h('li', {}, 'Quality of life: auto-start waves, 4× speed, buy-max mastery, upgrade previews, safer selling, auto-repair, enemy info on tap, and Quick run.')),
    h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
      h('button', { class: 'btn ghost', onclick: () => { m.close(); app.showAchievements('ward'); } }, 'Wardrobe'),
      h('button', { class: 'btn gold', onclick: () => { app.profile.seenNews = WHATS_NEW; saveProfile(app.profile); m.close(); app.showHome(); } }, 'To battle!')),
  ], { wide: true });
}

// ---------- today: orders, event, blessing in one compact list ----------
function todayCard(app) {
  const p = app.profile;
  const q = ensureQuests(p);
  const done = q.list.filter((x) => x.done).length;
  const rows = [];
  const orders = h('div', { class: 'today-orders', hidden: !app.ordersOpen },
    [...q.list.map((it) => [it, null]), [q.week, 'Weekly']].map(([it, tag]) => h('div', { class: 'qrow' + (it.done ? ' done' : '') },
      h('div', { class: 'row' }, h('span', {}, (it.done ? '✔ ' : '') + (tag ? tag + ' · ' : '') + fillText(it)), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, `+${it.reward}`)),
      bar(Math.min(1, it.prog / it.goal), ''))));
  const streak = p.streak?.n ? ` · 🔥 ${p.streak.n}-day streak` : '';
  rows.push(h('button', { class: 'today-row', 'aria-expanded': String(!!app.ordersOpen), onclick: (e) => { app.ordersOpen = !app.ordersOpen; orders.hidden = !app.ordersOpen; e.currentTarget.setAttribute('aria-expanded', String(app.ordersOpen)); } },
    h('span', { class: 'ti' }, '📜'), h('span', { class: 'tt' }, h('b', {}, 'Daily orders'), h('small', {}, `${done} of ${q.list.length} done${streak}`)),
    h('span', { class: 'tv' }, h('span', { class: 'pips' }, q.list.map((x) => h('i', { class: x.done ? 'on' : '' }))), h('span', { class: 'chev' }, '▾'))));
  rows.push(orders);
  const ev = activeEvent();
  if (ev) {
    const st = eventState(p, ev), nr = nextReward(p, ev);
    const prev = st.claimed ? ev.rewards[st.claimed - 1].at : 0;
    rows.push(h('div', { class: 'today-row static' }, h('span', { class: 'ti' }, ev.icon),
      h('span', { class: 'tt' }, h('b', {}, `${ev.name} · ${ev.daysLeft}d left`), h('small', {}, nr ? `${nr.at - st.waves} more waves for ${rewardLabel(nr)}` : 'Every reward earned · +25% Renown')),
      h('span', { class: 'tv' }, nr ? bar(Math.min(1, (st.waves - prev) / (nr.at - prev)), 'gold') : '✔')));
  } else {
    const nx = nextEvent();
    if (nx) rows.push(h('div', { class: 'today-row static' }, h('span', { class: 'ti' }, nx.icon), h('span', { class: 'tt' }, h('b', {}, `Next event: ${nx.name}`), h('small', {}, `Starts in ${nx.daysUntil} day${nx.daysUntil === 1 ? '' : 's'}`))));
  }
  const b = blessingFor();
  rows.push(h('div', { class: 'today-row static' }, h('span', { class: 'ti' }, b.icon), h('span', { class: 'tt' }, h('b', {}, b.name), h('small', {}, `Today only: ${b.text}`))));
  return h('div', { class: 'plaque today-card' }, h('div', { class: 'card-label' }, 'Today'), rows);
}

// ---------- the Realm, as one strip (the full picture lives in Allies → The Realm) ----------
function realmStrip(app) {
  const r = app.realm, f = app.front;
  const go = () => app.showSocial('realm');
  if (!r && !f) {
    const off = app.api.online === false;
    return h('button', { class: 'plaque realm-strip quiet', onclick: go },
      h('div', { class: 'row' }, h('b', {}, '🏰 The Realm'), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, off ? 'Offline' : 'Connecting…')),
      h('small', { class: 'muted' }, off ? 'Play online to share goals and blessings with every citizen.' : 'Gathering word from the front…'));
  }
  const pill = (label, frac, cls, won) => h('div', { class: 'rpill' }, h('span', {}, label), h('b', {}, won ? 'Won' : Math.floor(frac * 100) + '%'), bar(Math.min(1, frac), cls));
  const pills = [];
  if (f?.rally) pills.push(pill('Rally', f.rally.kills / f.rally.goal, f.rally.done ? 'gold' : 'blue', f.rally.done));
  if (r) { pills.push(pill('Week', r.week.fraction, r.week.reached >= 4 ? 'gold' : 'blue')); pills.push(pill('Month', r.month.fraction, r.month.reached >= 4 ? 'gold' : 'moss')); }
  const s = f?.siege;
  const foeLine = s ? `${s.defeated ? '🏆' : BOSS_ICON[s.name] || '👹'} ${s.defeated ? s.name + ' has fallen' : `${s.name}: ${Math.ceil((s.hp / s.maxHp) * 100)}% left`}` : null;
  return h('button', { class: 'plaque realm-strip', onclick: go },
    h('div', { class: 'row' }, h('b', {}, '🏰 The Realm'), f ? h('span', { class: 'muted online' }, h('span', { class: 'online-dot' }), ` ${fmt(f.online)} online`) : null, h('span', { class: 'spacer' }),
      r?.claimable ? h('span', { class: 'badge' }, `✦ ${fmt(r.claimable)} to claim`) : h('span', { class: 'chev' }, '›')),
    h('div', { class: 'rpills' }, pills),
    foeLine || app.rival ? h('small', { class: 'muted' }, [foeLine, app.rival ? `⚔ Rival: ${app.rival.name} (wave ${app.rival.value})` : null].filter(Boolean).join('  ·  ')) : null);
}

// ---------- everything else ----------
function tiles(app) {
  const p = app.profile;
  const inbox = app.inboxCount || 0, online = app.api.online;
  const achCount = Object.keys(p.achievements).length;
  const ready = keepAffordable(p);
  const tile = (icon, title, sub, onclick, badge, cls = '') => h('button', { class: 'btn tile ' + cls, onclick },
    h('span', { class: 't-ico', 'aria-hidden': 'true' }, icon), h('span', { class: 't-title' }, title, badge ? h('span', { class: 'badge' }, badge) : null), h('span', { class: 't-sub' }, sub));
  return h('div', { class: 'tile-grid' },
    tile('🏰', 'The Keep', `✦ ${fmt(p.renown)} Renown`, () => app.showKeep(), ready ? String(ready) : null),
    tile('🧝', 'Wardrobe', 'Castles, outfits, trails', () => app.showAchievements('ward')),
    tile('⚔', 'Allies', online === false ? 'Offline' : 'Friends, clans, boards', () => app.showSocial('boards'), (inbox + (app.requestCount || 0)) ? String(inbox + (app.requestCount || 0)) : null),
    tile('📖', 'Chronicle', `Best wave ${Math.max(0, ...Object.values(p.best.wave))}`, () => app.showStats()),
    tile('🏆', 'Achievements', `${achCount} / ${ACHIEVEMENTS.length}`, () => app.showAchievements()),
    tile('⚙', 'Settings', 'Sound, controls', () => app.openSettings(false), null, 'small'),
    tile('❔', 'How to play', 'Towers, aiming, boons', () => howToPlay(), null, 'small'),
    tile('🗺', "What's new", 'The Wild Marches', () => showNews(app), null, 'small'));
}

