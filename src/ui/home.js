// The home screen: a living diorama up top, every game mode one tap away, a compact "today" list, and the Realm as one tidy strip.
import { h, fmt, bar, modal } from './dom.js';
import { MAPS } from '../game/maps.js';
import { MODIFIERS, VERSION, DIFFICULTY } from '../data/balance.js';
import { scoreMultiplier } from '../game/economy.js';
import { dailySetup } from '../game/rules.js';
import { utcDateKey, randomSeed, seasonKey } from '../core/rng.js';
import { ACHIEVEMENTS } from '../meta/achievements.js';
import { saveProfile, loadRun, keepAffordable, isMapUnlocked } from '../meta/profile.js';
import { ensureQuests, fillText } from '../meta/quests.js';
import { ensureOvertime, OVERTIME } from '../meta/campaign.js';
import { showWorks } from './works.js';
import { adaptiveStart } from '../meta/adaptive.js';
import { activeEvent, nextEvent, nextReward, eventState, blessingFor, rankFor, rewardGap, activeMapEvents, vanguardNeed } from '../meta/events.js';
import { startDiorama } from './attract.js';
import { BOSS_ICON } from './together.js';
import { mapThumb } from './mapview.js';
import { frontier, MAX_PROVINCES, TERRAINS } from '../game/realmmap.js';
import { rewardLabel, howToPlay, challengeCard, mapThumb as battleThumb } from './screens.js';
import { MODES, MODE_IDS, GAUNTLET, weeklySetup } from '../game/modes.js';
import { modeSetup, endureScreen, bestLine } from './modes.js';
import { howToCard } from './howto.js';
import { prestigeStatus, prestigeLevel, roman } from '../meta/prestige.js';
import { codexProgress } from '../meta/medals.js';
import { THEME_CATALOG, EVENT_RENOWN_BONUS } from '../data/events.js';
import { currentTheme } from '../meta/events.js';

const screen = () => document.getElementById('screen');
const WHATS_NEW = '1.20';
let visits = 0, diorama = null;

export function homeScreen(app) {
  const p = app.profile;
  const saved = loadRun();
  // The page reads top to bottom: the battlefield, the way back into a paused run, every way to play, then the day's news and the Keep.
  const kids = [
    heroSection(app),
    app.pendingChallenge ? challengeCard(app) : null,
    continueBar(app, saved),
    modeShowcase(app, saved),
    h('div', { class: 'home-cols' },
      h('div', { class: 'home-col' }, todayCard(app), guideSection(app)),
      h('div', { class: 'home-col' }, realmStrip(app), tiles(app))),
    h('div', { class: 'home-foot muted' }, h('span', {}, `v${VERSION} · ${app.api.online ? 'Online' : app.api.online === false ? 'Offline mode' : 'Connecting…'}`), app.muteButton('ghost')),
  ];
  const s = screen();
  s.replaceChildren(h('div', { class: 'home v2' }, h('div', { class: 'home-wrap' }, kids)));
  s.scrollTop = 0;
  // The home screen re-renders when online data arrives; keep the same little battle running through it.
  const slot = s.querySelector('.diorama canvas');
  if (diorama && diorama.alive() && slot) { slot.replaceWith(diorama.canvas); diorama.retheme?.(); }
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
const CREST = `<svg viewBox="0 0 72 80" width="64" height="72" aria-hidden="true" focusable="false">
  <g stroke="#1a1410" stroke-linejoin="round" stroke-linecap="round">
    <path d="M6 8 L66 62" stroke-width="9"/><path d="M66 8 L6 62" stroke-width="9"/>
    <path d="M6 8 L66 62" stroke="#dfe6f2" stroke-width="5"/><path d="M66 8 L6 62" stroke="#dfe6f2" stroke-width="5"/>
    <path d="M13 50 L22 41 M59 50 L50 41" stroke-width="9"/><path d="M13 50 L22 41 M59 50 L50 41" stroke="#f2b33d" stroke-width="5"/>
    <path d="M12 14 H60 V42 C60 60 48 70 36 76 C24 70 12 60 12 42 Z" fill="#a8323a" stroke-width="3.5"/>
    <path d="M17 19 H55 V42 C55 56 46 64 36 69 C26 64 17 56 17 42 Z" fill="none" stroke="#f2b33d" stroke-width="2"/>
    <path d="M24 56 V34 H28 V30 H32 V34 H40 V30 H44 V34 H48 V56 Z" fill="#f2b33d" stroke-width="2.4"/>
    <path d="M22 38 V26 L26 22 L30 26 V38 Z M42 38 V26 L46 22 L50 26 V38 Z" fill="#f2b33d" stroke-width="2.4"/>
    <path d="M32 56 V46 a4 4 0 0 1 8 0 V56 Z" fill="#1a1410" stroke-width="1.5"/>
    <path d="M24 12 L26 3 L31 8 L36 1 L41 8 L46 3 L48 12 Z" fill="#f2b33d" stroke-width="2.4"/>
  </g></svg>`;

function heroSection(app) {
  const p = app.profile;
  const r = rankFor(p.stats.renownEarned || 0);
  return h('div', { class: 'home-hero' },
    h('div', { class: 'diorama' },
      h('div', { class: 'dio-frame' }, h('canvas', { 'aria-label': 'A living battlefield. Tap the invaders to shoot them.' }),
        h('div', { class: 'hero-banner left', 'aria-hidden': 'true' }, h('span', {}, '⚜')), h('div', { class: 'hero-banner right', 'aria-hidden': 'true' }, h('span', {}, '⚜'))),
      h('div', { class: 'dio-chips' }, h('span', { class: 'chip dio-map' }, ''), h('span', { class: 'chip dio-tip' }, '🎯 Tap the invaders'), h('span', { class: 'chip dio-count', hidden: true }, ''))),
    h('div', { class: 'home-title' },
      h('div', { class: 'home-crest', html: CREST }),
      h('h1', {}, 'Bastion Siege'),
      h('div', { class: 'orn', 'aria-hidden': 'true' }, h('i'), h('span', {}, '⚜'), h('i')),
      h('div', { class: 'sub' }, p.title ? `${p.name}, ${p.title}` : `Hold the line, ${p.name}.`),
      h('div', { class: 'rank-chip', title: r.next ? `${fmt(Math.max(0, r.next.at - (p.stats.renownEarned || 0)))} Renown to ${r.next.name}` : 'Highest rank' },
        prestigeLevel(p) ? h('span', { class: 'dyn-badge', title: `Dynasty ${roman(prestigeLevel(p))}` }, '👑 ' + roman(prestigeLevel(p))) : null,
        h('b', {}, r.name), bar(r.progress, 'gold'))));
}

// ---------- last run's setup, for Quick run ----------
function lastSetupLabel(p) {
  const L = p.lastRun;
  if (!L || !MAPS[L.mapId] || !isMapUnlocked(p, L.mapId)) return null;
  const d = L.adaptive ? { name: '🎯 Adaptive ' + adaptiveStart(p, L.mapId).start } : DIFFICULTY.find((x) => x.wave === (L.startWave || 1));
  return `${MAPS[L.mapId].name} · ${d ? d.name : 'Recruit'}${L.modifiers?.length ? ' · ' + L.modifiers.length + ' mod' + (L.modifiers.length > 1 ? 's' : '') : ''}`;
}

// Every run the player has paused (the classic run and each mode save separately), as one-tap ways back in.
function continueBar(app, saved) {
  const items = [];
  // The main slot also holds Daily, March and Challenge runs, so name what is actually paused.
  const MAIN_LABEL = { daily: 'Daily', march: 'March', challenge: 'Challenge' };
  if (saved && !saved.tutorial) items.push({ save: saved, label: MAIN_LABEL[saved.mode] || 'Infinite' });
  for (const id of MODE_IDS) { const sv = loadRun(id); if (sv) items.push({ save: sv, label: MODES[id].name }); }
  if (!items.length) return null;
  return h('div', { class: 'continue-bar' }, items.map(({ save, label }) =>
    h('button', { class: 'btn blue big wide', onclick: () => app.resumeRun(save) }, h('span', {}, 'Continue'), h('small', { class: 'btn-sub' }, `${label} · wave ${save.wave} · ${MAPS[save.mapId]?.name || 'map'}`))));
}

// ---------- every way to play, up front ----------
const HOOKS = {
  infinite: 'Waves without end on any map. Pick the difficulty, modifiers and Ascension.',
  daily: 'One shared map and twist for every player, new each day.',
  gauntlet: 'Fell a boss, hop to a fresh map. Quick fights and a heap of gold.',
  endurance: 'Everything free and maxed. The foes never stop. How long can you hold?',
  laststand: 'Full-power towers, no rebuilding. Survive the weekly map for as long as you can.',
  sprint: 'Fifteen waves against the clock. Call waves early to shave seconds.',
};

function modeShowcase(app, saved) {
  const p = app.profile;
  const daily = dailySetup();
  const todays = p.daily[utcDateKey()];
  const quick = lastSetupLabel(p);
  const classic = saved && !saved.tutorial ? saved : null;
  const lastMap = p.lastRun && MAPS[p.lastRun.mapId] && isMapUnlocked(p, p.lastRun.mapId) ? p.lastRun.mapId : 'meadow';
  const ws = (id) => weeklySetup(id, seasonKey());
  const entries = [
    { id: 'infinite', icon: '♾', name: 'Infinite', short: 'The classic endless run', map: lastMap, seed: 'preview', chip: `Your map · ${MAPS[lastMap].name}`,
      best: classic ? `In progress · wave ${classic.wave}` : `Best wave ${Math.max(0, ...Object.values(p.best?.wave || {}))}`, resume: !!classic,
      go: () => (classic ? app.resumeRun(classic) : app.showSetup()), cta: classic ? '▶ Continue' : 'Play' },
    { id: 'daily', icon: '📅', name: 'Daily challenge', short: `${daily.modifiers.map((m) => MODIFIERS[m].name).join(' + ')} · ×${scoreMultiplier(daily.modifiers).toFixed(2)}`, map: daily.map, seed: daily.seed, chip: `Today · ${MAPS[daily.map].name}`,
      best: todays ? `Best wave ${todays.wave}` : 'Not played today', go: () => app.startRun({ mapId: daily.map, seed: daily.seed, modifiers: daily.modifiers, mode: 'daily', ascension: 0, weapon: p.weapon }), cta: todays ? 'Play again' : 'Play' },
    ...MODE_IDS.map((id) => {
      const M = MODES[id], w = id === 'gauntlet' ? null : ws(id), sv = loadRun(id), map = w ? w.map : GAUNTLET.maps[0];
      return { id, icon: M.icon, name: M.name, short: M.short, map, seed: w ? w.seed : 'preview', chip: w ? `This week · ${MAPS[map].name}` : `Starts on ${MAPS[map].name}`,
        best: bestLine(p, id), resume: !!sv,
        go: () => (sv ? app.resumeRun(sv) : id === 'endurance' ? endureScreen(app) : app.startRun(modeSetup(app, id))), cta: sv ? '▶ Continue' : 'Play' };
    }),
  ];
  const cards = entries.map((m) => {
    const art = battleThumb(m.map, m.seed, 280);
    art.classList.add('mt-thumb');
    return h('button', { class: 'mode-tile' + (m.resume ? ' resume' : ''), 'data-mode': m.id, 'aria-label': `${m.name}. ${HOOKS[m.id]}`, onclick: m.go },
      h('span', { class: 'mt-art' }, art, h('span', { class: 'mt-ico', 'aria-hidden': 'true' }, m.icon), h('span', { class: 'mt-chip' }, m.chip)),
      h('span', { class: 'mt-body' },
        h('span', { class: 'mt-name' }, m.name), h('small', { class: 'mt-short' }, m.short),
        h('span', { class: 'mt-hook' }, HOOKS[m.id]),
        h('span', { class: 'mt-foot' }, h('span', { class: 'mt-best' }, m.best), h('span', { class: 'mt-go' }, m.cta))));
  });
  return h('section', { class: 'mode-showcase', 'aria-label': 'Ways to play' },
    h('div', { class: 'ms-head' }, h('h2', {}, 'Choose your battle'), h('button', { class: 'btn small ghost', onclick: () => app.showModes() }, 'Rules & boards ›')),
    h('div', { class: 'mode-rail' }, cards),
    quick ? h('button', { class: 'btn quick quick-wide', title: 'Same map, difficulty and modifiers as last time', onclick: () => {
      const L = p.lastRun;
      app.startRun({ mapId: L.mapId, seed: randomSeed(), modifiers: L.modifiers || [], ascension: L.ascension || 0, weapon: p.weapon, mode: L.mapId === 'frontier' ? 'frontier' : 'normal', startWave: L.adaptive ? adaptiveStart(p, L.mapId).start : L.startWave || 1, adaptive: !!L.adaptive });
    } }, h('b', {}, '⚡ Quick run'), h('small', {}, quick)) : null);
}

// One slot for help or news, never both: newcomers get the animated tour, veterans get the news until they dismiss it,
// and everyone else gets a single quiet line that opens the tour.
function guideSection(app) {
  const p = app.profile;
  const runs = p.stats.runs || 0;
  const open = app.howtoOpen ?? (runs < 2);
  if (!open && runs >= 3 && p.seenNews !== WHATS_NEW) return whatsNew(app);
  return howtoSection(app);
}

// ---------- how to play: an animated tour (open for newcomers, tucked away for veterans) ----------
function howtoSection(app) {
  const p = app.profile;
  const open = app.howtoOpen ?? ((p.stats.runs || 0) < 2);
  if (!open) {
    return h('button', { class: 'plaque howto-closed', onclick: () => { app.howtoOpen = true; app.showHome(); } },
      h('span', { class: 'ico' }, '▶'), h('span', {}, h('b', {}, 'Watch how to play'), h('small', { class: 'muted' }, 'A one-minute animated tour')));
  }
  return howToCard(app, {
    onFullGuide: () => howToPlay(app),
    onPractice: () => app.startRun({ mapId: 'meadow', seed: randomSeed(), modifiers: [], ascension: 0, weapon: p.weapon, mode: 'normal' }),
    onClose: (p.stats.runs || 0) >= 1 ? () => { app.howtoOpen = false; app.showHome(); } : null,
  });
}

// ---------- what's new (dismissible) ----------
function whatsNew(app) {
  const p = app.profile;
  if (p.seenNews === WHATS_NEW) return null;
  const box = h('div', { class: 'plaque whats-new' },
    h('div', { class: 'row' }, h('span', { class: 'new-badge' }, 'NEW'), h('b', {}, '🎮 Pick your battle'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn small ghost', 'aria-label': 'Dismiss', onclick: () => { p.seenNews = WHATS_NEW; saveProfile(p); box.remove(); } }, '✕')),
    h('div', { class: 'muted' }, 'Every game mode now sits right under the battlefield. On phones, a tap during a wave always shoots (hold a tower to open its menu), and a new bar tracks how much of the wave is left.'),
    h('div', { class: 'row gf-actions' },
      h('button', { class: 'btn small gold', onclick: () => { p.seenNews = WHATS_NEW; saveProfile(p); app.showModes(); } }, 'Rules & boards'),
      h('button', { class: 'btn small', onclick: () => showNews(app) }, 'See what\'s new')));
  return box;
}

export function showNews(app) {
  const m = modal([
    h('h2', { style: { marginTop: 0 } }, 'What\'s new · v1.20'),
    h('h3', {}, '🎮 Pick your battle'),
    h('ul', { class: 'news-list' },
      h('li', {}, 'The home screen now shows every way to play as a card: Infinite, the Daily challenge, Gauntlet, Endurance, Last Stand and Sprint. Tap a card to start (or continue) it. On a phone, swipe sideways.'),
      h('li', {}, 'A paused run shows up at the top as a Continue button. The rest of the page is tidier: today\'s orders and events sit together, and the tour and the news no longer fight for room.')),
    h('h3', {}, '📱 Phones'),
    h('ul', { class: 'news-list' },
      h('li', {}, 'During a wave a quick tap always shoots the nearest foe and never opens a menu, so a finger near a tower no longer pops up its panel. To open a tower\'s menu in a wave, hold your finger on it. Between waves, tap as before.'),
      h('li', {}, 'Weather notices (sandstorm, blizzard, meteors, shadows) now sit in the top bar instead of over the battlefield, and the warning tells you what the weather does.'),
      h('li', {}, 'New wave progress bar along the bottom of the top bar: how much of the current wave is already beaten (red on boss waves).')),
    h('h2', {}, 'Adaptive play and sound · v1.16'),
    h('h3', {}, '🎯 Adaptive play'),
    h('ul', { class: 'news-list' },
      h('li', {}, 'New run → Difficulty → Adaptive starts you on the wave that should feel tense for you, tuned from your recent runs. Every manual difficulty still works.'),
      h('li', {}, 'Runs that begin at your Adaptive wave or higher are Vanguard runs. A new daily order and the last two rewards of each seasonal event ask for them, so easy waves are no longer the way to grind those.')),
    h('h3', {}, '🔇 Sound'),
    h('ul', { class: 'news-list' },
      h('li', {}, 'Sound now starts off for new players. The 🔊/🔇 button on the home screen and in battle (or N) turns music and effects on or off.'),
      h('li', {}, 'New: a short animated tour of how the Realm map works, in the Realm tab and the Full guide.')),
    h('h2', {}, 'The Map of Aldermere · v1.15'),
    h('h3', {}, '🗺 The Map of Aldermere'),
    h('ul', { class: 'news-list' },
      h('li', {}, 'The Realm is now a painted map of forty provinces. Every task the Realm wins pushes the border out: the Daily Rally takes a province, a won Weekly Muster two (three at Legend), a won Monthly Campaign four (six at Legend).'),
      h('li', {}, 'Miss a task and the horde takes land back: a lost Rally costs a province, a week under 50% two, a month under 50% four. The heartland never falls.'),
      h('li', {}, 'Every province held blesses every run: tower crews, troops, gold or walls, each land its own. Lose it and the gift goes with it.'),
      h('li', {}, 'March on the contested province yourself: its battlefield, its weather and its native foe in every wave, and every kill counts double for the Daily Rally.')),
    h('h2', {}, 'The Garrison · v1.13'),
    h('h3', {}, '⚔ The Garrison'),
    h('ul', { class: 'news-list' },
      h('li', {}, 'Open the Garrison (G) to train troops with gold and time. Elite troops also cost Valor, earned from kills and cleared waves.'),
      h('li', {}, 'Deploy (D) sends them out to hunt, or hold the keep on Guard. Auto marches them each wave and pulls the hurt ones back to heal.'),
      h('li', {}, 'Footmen, pikemen and knights hold foes in place. Bowmen, crossbowmen and griffon riders can hit flyers. Clerics heal. Cavalry ride down the backline.'),
      h('li', {}, 'Troops rank up to Veteran, Elite and Legend. The Muster gauge fills as you fight and gives a free recruit.'),
      h('li', {}, 'A new Garrison branch in the Keep, seven new boons, and new foes: Skirmishers, Ogres, Gargoyles and Dread Knights.')),
    h('h2', {}, 'World Stats · v1.11'),
    h('h3', {}, '🌍 World Stats'),
    h('ul', { class: 'news-list' },
      h('li', {}, 'A new page counts every finished run across the Realm: which towers land the kills and deal the damage, what gets built, which specializations, weapons, Castle Arts and boons people choose, what they slay and where.'),
      h('li', {}, 'Switch between all time and this week. Your own build mix shows beside the Realm\'s on the Towers tab.')),
    h('h3', {}, '🕑 Calmer controls'),
    h('ul', { class: 'news-list' },
      h('li', {}, 'Rapid taps and two-finger pinches no longer zoom the page on phones.'),
      h('li', {}, 'The countdown between waves now runs in real seconds, whatever the game speed. Waves still fight at 2×–4×.')),
    h('h2', {}, 'The Royal Court · v1.10'),
    h('h3', {}, '👑 Dynasties (prestige)'),
    h('ul', { class: 'news-list' },
      h('li', {}, 'Earn enough Renown and you may ascend: the Keep\'s stat upgrades reset, but your line grows stronger for good.'),
      h('li', {}, 'Every Dynasty adds permanent Renown, damage, castle HP and starting gold, and lets you choose one of three Legacy perks.'),
      h('li', {}, 'Royal rewards for each Dynasty: titles, castles, trails, defeat effects, tower finishes, a hero outfit and exclusive themes.'),
      h('li', {}, 'Unlocks, wardrobe, titles, rank and loadout are never lost.')),
    h('h3', {}, '🎖 Six new ranks'),
    h('ul', { class: 'news-list' },
      h('li', {}, 'Lord Protector, Archduke, Prince Regent, High King, Emperor and Eternal Sovereign, each with a Renown gift.')),
    h('h3', {}, '📚 The Codex'),
    h('ul', { class: 'news-list' },
      h('li', {}, 'An encyclopedia of every emplacement, foe, boss, weapon, castle art, boon, threat, land and rule, with the real numbers.'),
      h('li', {}, 'Bronze, silver and gold medals for every foe, boss and tower. Each pays Renown once; completing the Codex earns titles and +Renown.')),
    h('h3', {}, '🎨 Themes and artwork'),
    h('ul', { class: 'news-list' },
      h('li', {}, 'Seventeen realm themes you can wear all year, from Dawnstone to the Eternal Dynasty. Unlock them by rank, waves, streaks, events and prestige.'),
      h('li', {}, 'A medieval makeover: cobbled roads, stone curbs, braziers and war banners, a taller castle with a courtyard, and a heraldic home screen.'),
      h('li', {}, 'A new animated tour on the home page shows how to play, step by step.')),
    h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
      h('button', { class: 'btn ghost', onclick: () => { m.close(); app.showWorld(); } }, 'World Stats'),
      h('button', { class: 'btn ghost', onclick: () => { m.close(); app.showCodex(); } }, 'Open the Codex'),
      h('button', { class: 'btn ghost', onclick: () => { m.close(); app.showPrestige(); } }, 'The Dynasty'),
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
  // Past the daily orders: the Overtime ladder, and Supply for Realm Works.
  const ot = ensureOvertime(p);
  if (ot.open) {
    const c = ot.cur;
    rows.push(h('button', { class: 'today-row', title: 'Overtime Orders pay Supply for Realm Works', onclick: () => showWorks(app) },
      h('span', { class: 'ti' }, '🚩'),
      h('span', { class: 'tt' }, h('b', {}, c ? `Overtime ${ot.tier + 1}/${OVERTIME.maxPerDay}` : 'Overtime done for today'), h('small', {}, c ? `${fillText(c)} · ${Math.min(c.prog, c.goal).toLocaleString('en-US')}/${c.goal.toLocaleString('en-US')} · +${c.supply} 📦` : `Back tomorrow · 📦 ${p.supply || 0} Supply to spend`)),
      h('span', { class: 'tv' }, c ? bar(Math.min(1, c.prog / c.goal), 'gold') : '✔', h('span', { class: 'chev' }, '›'))));
  } else if (done > 0 || p.supply || Object.keys(p.works || {}).length) {
    rows.push(h('button', { class: 'today-row', onclick: () => showWorks(app) }, h('span', { class: 'ti' }, '🚩'), h('span', { class: 'tt' }, h('b', {}, 'Realm Works'), h('small', {}, `Finish every order for Overtime · 📦 ${p.supply || 0} Supply`)), h('span', { class: 'tv' }, h('span', { class: 'chev' }, '›'))));
  }
  const ev = activeEvent();
  if (ev) {
    const st = eventState(p, ev), nr = nextReward(p, ev), gap = rewardGap(p, ev);
    const prev = st.claimed ? ev.rewards[st.claimed - 1].at : 0;
    const need = !gap ? '' : gap.waves > 0 ? `${gap.waves} more waves${gap.vanguard ? ` (${gap.vanguard} in Vanguard runs)` : ''} for ${rewardLabel(nr)}` : `${gap.vanguard} more waves in Vanguard runs (Adaptive wave or higher) for ${rewardLabel(nr)}`;
    rows.push(h('button', { class: 'today-row', title: 'What is this event?', onclick: () => showEventInfo(app, ev) }, h('span', { class: 'ti' }, ev.icon),
      h('span', { class: 'tt' }, h('b', {}, `${ev.name} · ${ev.daysLeft}d left`), h('small', {}, nr ? need : 'Every reward earned · +25% Renown')),
      h('span', { class: 'tv' }, nr ? bar(gap.waves === 0 && gap.vanguard ? 0.98 : Math.min(1, (st.waves - prev) / (nr.at - prev)), 'gold') : '✔', h('span', { class: 'chev' }, '›'))));
  } else {
    const nx = nextEvent();
    if (nx) rows.push(h('button', { class: 'today-row', title: 'What is this event?', onclick: () => showEventInfo(app, nx) }, h('span', { class: 'ti' }, nx.icon), h('span', { class: 'tt' }, h('b', {}, `Next event: ${nx.name}`), h('small', {}, `Starts in ${nx.daysUntil} day${nx.daysUntil === 1 ? '' : 's'}`)), h('span', { class: 'tv' }, h('span', { class: 'chev' }, '›'))));
  }
  for (const me of activeMapEvents()) rows.push(h('button', { class: 'today-row', title: 'What is this event?', onclick: () => showMapEventInfo(app, me) }, h('span', { class: 'ti' }, me.icon), h('span', { class: 'tt' }, h('b', {}, me.name), h('small', {}, me.text)), h('span', { class: 'tv' }, h('span', { class: 'chev' }, '›'))));
  const b = blessingFor();
  rows.push(h('div', { class: 'today-row static' }, h('span', { class: 'ti' }, b.icon), h('span', { class: 'tt' }, h('b', {}, b.name), h('small', {}, `Today only: ${b.text}`))));
  return h('div', { class: 'plaque today-card' }, h('div', { class: 'card-label' }, 'Today'), rows);
}

// ---------- what an event is, in plain words ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateText = (ev) => `${MONTHS[ev.from[0] - 1]} ${ev.from[1]} to ${MONTHS[ev.to[0] - 1]} ${ev.to[1]}`;

export function showEventInfo(app, ev) {
  const p = app.profile, live = activeEvent()?.id === ev.id;
  const st = live ? eventState(p, activeEvent()) : null;
  const vg = (i) => (live ? vanguardNeed(activeEvent(), i) : vanguardNeed(ev, i));
  const rows = ev.rewards.map((r, i) => {
    const got = live && st.claimed > i;
    const need = vg(i);
    return h('li', { class: 'ev-reward' + (got ? ' got' : '') },
      h('b', {}, got ? '✔ ' : '', `${r.at} waves`), h('span', {}, rewardLabel(r)),
      need ? h('small', { class: 'muted' }, `also needs ${need} waves in Vanguard runs`) : null);
  });
  modal([
    h('h2', { style: { marginTop: 0 } }, `${ev.icon} ${ev.name}`),
    h('p', { class: 'muted' }, `${dateText(ev)} · ${live ? `${ev.daysLeft} day${ev.daysLeft === 1 ? '' : 's'} left` : 'not running right now'}`),
    h('p', {}, ev.blurb),
    h('h3', {}, 'How it works'),
    h('ul', { class: 'news-list' },
      h('li', {}, live ? 'Every wave you hold in any run counts while the event is on. Just play.' : 'Once it starts, every wave you hold in any run counts. Just play.'),
      h('li', {}, `Every run earns +${Math.round(EVENT_RENOWN_BONUS * 100)}% Renown while it lasts, and the game takes on the event's look (you can change the look under Realm theme in Settings).`),
      h('li', {}, 'Rewards are cosmetics and a title you keep forever. If you already own one, you get bonus Renown instead.'),
      h('li', {}, 'The last two rewards also ask for a share of your waves in Vanguard runs: runs that begin at your Adaptive wave or higher. Easy waves alone will not unlock them.')),
    h('h3', {}, 'Rewards'),
    live ? h('p', { class: 'muted' }, `You have held ${st.waves} wave${st.waves === 1 ? '' : 's'} in this event${st.vg ? `, ${st.vg} of them in Vanguard runs` : ''}.`) : null,
    h('ul', { class: 'ev-rewards' }, rows),
    h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn gold', onclick: (e) => e.currentTarget.closest('.modal-back').remove() }, 'Got it')),
  ], { wide: true });
}

export function showMapEventInfo(app, me) {
  modal([
    h('h2', { style: { marginTop: 0 } }, `${me.icon} ${me.name}`),
    h('p', { class: 'muted' }, `A Map of Aldermere event · ${me.from.slice(5)} to ${me.to.slice(5)}`),
    h('p', {}, me.text),
    h('ul', { class: 'news-list' },
      h('li', {}, `While the Realm holds this province, every run earns +${Math.round(me.renownHeld * 100)}% Renown, for every player.`),
      h('li', {}, `March on it (open the Realm tab, pick the province when it is the contested one) for +${Math.round(me.renownMarch * 100)}% Renown instead.`),
      h('li', {}, 'Nothing is required. It is a reason to push the border out and hold it.')),
    h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
      h('button', { class: 'btn', onclick: (e) => { e.currentTarget.closest('.modal-back').remove(); app.showSocial('realm'); } }, 'Open the map'),
      h('button', { class: 'btn gold', onclick: (e) => e.currentTarget.closest('.modal-back').remove() }, 'Got it')),
  ], { wide: true });
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
  const held = r?.map?.held ?? app.profile.realmMap?.held;
  const nx = held ? frontier(held).next : null;
  const mapRow = held ? h('div', { class: 'rmap-row' }, mapThumb(held, 132),
    h('div', {}, h('b', {}, `🗺 ${held} / ${MAX_PROVINCES} provinces held`),
      h('small', {}, nx ? `Next to take: ${nx.name} (${TERRAINS[nx.terrain].name}). Win today's Rally, or march on it yourself.` : 'The Realm is whole. Keep winning to build Bulwark.'))) : null;
  return h('button', { class: 'plaque realm-strip', onclick: go },
    h('div', { class: 'row' }, h('b', {}, '🏰 The Realm'), f ? h('span', { class: 'muted online' }, h('span', { class: 'online-dot' }), ` ${fmt(f.online)} online`) : null, h('span', { class: 'spacer' }),
      r?.claimable ? h('span', { class: 'badge' }, `✦ ${fmt(r.claimable)} to claim`) : h('span', { class: 'chev' }, '›')),
    mapRow,
    h('div', { class: 'rpills' }, pills),
    foeLine || app.rival ? h('small', { class: 'muted' }, [foeLine, app.rival ? `⚔ Rival: ${app.rival.name} (wave ${app.rival.value})` : null].filter(Boolean).join('  ·  ')) : null);
}

// ---------- everything else ----------
function tiles(app) {
  const p = app.profile;
  const inbox = app.inboxCount || 0, online = app.api.online;
  const achCount = Object.keys(p.achievements).length;
  const ready = keepAffordable(p);
  const ps = prestigeStatus(p), cp = codexProgress(p);
  const th = currentTheme(p);
  const themeName = th ? (THEME_CATALOG.find((t) => t.id === th.id)?.name || 'Seasonal') : 'Oak & Gold';
  const tile = (icon, title, sub, onclick, badge, cls = '') => h('button', { class: 'btn tile ' + cls, onclick },
    h('span', { class: 't-ico', 'aria-hidden': 'true' }, icon), h('span', { class: 't-title' }, title, badge ? h('span', { class: 'badge' }, badge) : null), h('span', { class: 't-sub' }, sub));
  const dynSub = ps.ok ? 'Ready to ascend!' : ps.level ? `Dynasty ${roman(ps.level)} · ${Math.floor(ps.frac * 100)}%` : `${Math.floor(ps.frac * 100)}% to your first`;
  const phone = window.matchMedia('(max-width: 700px)').matches;
  const more = app.moreOpen ?? !phone;     // phones start with the essentials; everything else is one tap away
  const main = [
    tile('🏰', 'The Keep', `✦ ${fmt(p.renown)} Renown`, () => app.showKeep(), ready ? String(ready) : null),
    tile('⚔', 'Allies', online === false ? 'Offline' : 'Friends, clans, boards', () => app.showSocial('boards'), (inbox + (app.requestCount || 0)) ? String(inbox + (app.requestCount || 0)) : null),
    tile('🏆', 'Achievements', `${achCount} / ${ACHIEVEMENTS.length}`, () => app.showAchievements()),
    tile('⚙', 'Settings', 'Sound, controls', () => app.openSettings(false))];
  const rest = [
    tile('👑', 'The Dynasty', dynSub, () => app.showPrestige(), ps.ok ? '!' : null, ps.ok ? 'ready' : ''),
    tile('📚', 'The Codex', `${cp.earned} / ${cp.total} medals`, () => app.showCodex()),
    tile('🎨', 'Themes', themeName, () => app.showAchievements('theme')),
    tile('🧝', 'Wardrobe', 'Castles, outfits, trails', () => app.showAchievements('ward')),
    tile('📖', 'Chronicle', `Best wave ${Math.max(0, ...Object.values(p.best.wave))}`, () => app.showStats()),
    tile('🌍', 'World Stats', online === false ? 'Offline: needs a connection' : 'What the whole Realm builds and slays', () => app.showWorld(), null, 'wide'),
    tile('❔', 'Full guide', 'Every rule', () => howToPlay(app), null, 'small'),
    tile('🗺', "What's new", 'Pick your battle', () => showNews(app), null, 'small')];
  const dot = (ps.ok || ready) && !more ? h('span', { class: 'badge' }, '!') : null;
  return h('div', {},
    h('div', { class: 'tile-grid' }, main),
    h('button', { class: 'btn small ghost more-btn', 'aria-expanded': String(more), onclick: () => { app.moreOpen = !more; app.showHome(); } }, more ? 'Show less ▴' : 'More: Dynasty, Codex, Wardrobe… ▾', dot),
    more ? h('div', { class: 'tile-grid' }, rest) : null);
}
