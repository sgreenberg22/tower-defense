// Menu screens. Each function renders into #screen.
import { h, fmt, fmtTime, pct, toast, modal, confirmBox, bar } from './dom.js';
import { audio } from '../game/audio.js';
import { Renderer, drawIcon, CASTLE_SKINS } from '../game/render.js';
import { buildMap, MAPS, MAP_ORDER } from '../game/maps.js';
import { TOWERS, TOWER_ORDER, ENEMIES, BOSSES, WEAPONS, MODIFIERS, ASCENSION, KEEP, KEEP_BRANCHES, GIFTS, CLAN_LEVELS, VERSION, DIFFICULTY, HEADSTART, ABILITIES, ART_KEYS, ART_SLOTS } from '../data/balance.js';
import { scoreMultiplier } from '../game/economy.js';
import { dailySetup, headStartPackage } from '../game/rules.js';
import { utcDateKey, randomSeed } from '../core/rng.js';
import { ACHIEVEMENTS, COSMETICS, cosmeticSource } from '../meta/achievements.js';
import { saveProfile, loadRun, keepLevel, keepNextCost, keepLocked, keepAffordable, buyKeep, unlockedWeapons, unlockedAbilities, loadoutFor, isMapUnlocked, ascensionMax, defaultProfile, clanPerkLevel } from '../meta/profile.js';
import { encodeChallenge } from '../net/api.js';
import { realmHomeCard, realmTab } from './realm.js';
import { frontCard, tagline, teamBonuses, insightsCard, youExtras, realmStatsPanel, deedsPanel } from './together.js';
import { unlockInfo } from '../meta/unlockinfo.js';
import { ensureQuests, fillText } from '../meta/quests.js';
import { activeEvent, nextEvent, nextReward, eventState, blessingFor, rankFor } from '../meta/events.js';

const screen = () => document.getElementById('screen');
function mount(...kids) { const s = screen(); s.replaceChildren(...kids); s.scrollTop = 0; }
function head(app, title, extra = null) {
  return h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => app.showHome(), 'aria-label': 'Back' }, '← Back'), h('h2', {}, title), extra);
}

// ---------- map thumbnails ----------
const thumbCache = new Map();
export function mapThumb(mapId, seed = 'preview', w = 320) {
  const key = mapId + seed + w;
  const cv = h('canvas', { width: w, height: Math.round(w * 10 / 16) });
  const draw = () => {
    const map = buildMap(mapId, seed, false);
    const r = new Renderer(cv);
    r.dpr = 1; r.w = w; r.h = Math.round(w * 10 / 16); r.ts = w / 16; r.ox = 0; r.oy = 0;
    const fake = { map, wave: 1, seed, castle: { hp: 1, maxHp: 1 }, wall: { hp: 1, maxHp: 1 }, weapon: {} };
    r.buildBg(fake);
    const ctx = cv.getContext('2d');
    ctx.drawImage(r.bg, 0, 0, w, r.h);
    r.ctx = ctx; r.drawCastle(fake);
  };
  if (thumbCache.has(key)) { const src = thumbCache.get(key); cv.getContext('2d').drawImage(src, 0, 0); }
  else { draw(); const copy = document.createElement('canvas'); copy.width = cv.width; copy.height = cv.height; copy.getContext('2d').drawImage(cv, 0, 0); thumbCache.set(key, copy); }
  return cv;
}

// ---------- HOME ----------
const cosName = (key) => { const [c, id] = key.split(':'); return COSMETICS[c]?.[id] || id; };
export const rewardLabel = (r) => [r.cosmetic ? cosName(r.cosmetic) : null, r.title ? `Title: ${r.title}` : null, r.renown ? `✦ ${r.renown}` : null].filter(Boolean).join(' + ');

// Seasonal event card: progress to the next reward. Falls back to a countdown to the next event.
function eventCard(app) {
  const p = app.profile, ev = activeEvent();
  if (!ev) {
    const nx = nextEvent();
    return nx ? h('div', { class: 'plaque event-card idle' }, h('div', { class: 'row' }, h('span', { class: 'ev-ico' }, nx.icon), h('div', {}, h('b', {}, `Next: ${nx.name}`), h('div', { class: 'muted' }, `Starts in ${nx.daysUntil} day${nx.daysUntil === 1 ? '' : 's'}. New castles, trails and titles to earn.`)))) : null;
  }
  const st = eventState(p, ev), nr = nextReward(p, ev);
  const prev = st.claimed ? ev.rewards[st.claimed - 1].at : 0;
  return h('div', { class: 'plaque event-card' },
    h('div', { class: 'row' }, h('span', { class: 'ev-ico' }, ev.icon), h('div', {}, h('b', {}, ev.name), h('div', { class: 'muted' }, ev.blurb)), h('span', { class: 'spacer' }), h('span', { class: 'chip' }, `${ev.daysLeft}d left`)),
    nr ? h('div', {}, bar(Math.min(1, (st.waves - prev) / (nr.at - prev)), 'gold'),
      h('div', { class: 'muted', style: { fontSize: '.85rem', marginTop: '.25rem' } }, `Hold ${nr.at - st.waves} more wave${nr.at - st.waves === 1 ? '' : 's'} for ${rewardLabel(nr)}. Event runs also pay +25% Renown.`))
      : h('div', { class: 'muted' }, 'Every reward earned. Event runs still pay +25% Renown.'),
    h('div', { class: 'ev-rewards' }, ev.rewards.map((r, i) => h('span', { class: 'chip' + (i < st.claimed ? ' got' : '') }, (i < st.claimed ? '✔ ' : `${r.at}: `) + (r.cosmetic ? cosName(r.cosmetic) : r.title)))));
}

function blessingCard() {
  const b = blessingFor();
  return h('div', { class: 'plaque blessing' }, h('span', { class: 'ev-ico' }, b.icon), h('div', {}, h('b', {}, b.name), h('div', { class: 'muted' }, `Today only: ${b.text}.`)));
}

function rankRow(p) {
  const r = rankFor(p.stats.renownEarned || 0);
  return h('div', { class: 'rank-row' }, h('b', {}, `Rank: ${r.name}`), bar(r.progress, 'gold'), h('span', { class: 'muted' }, r.next ? `${fmt(Math.max(0, r.next.at - (p.stats.renownEarned || 0)))} Renown to ${r.next.name}` : 'Highest rank reached'));
}

export function homeScreen(app) {
  const p = app.profile;
  const saved = loadRun();
  const daily = dailySetup();
  const todays = p.daily[utcDateKey()];
  const achCount = Object.keys(p.achievements).length;
  const online = app.api.online;
  const inbox = app.inboxCount || 0;

  const continueBtn = saved && !saved.tutorial ? h('button', { class: 'btn blue big wide', onclick: () => app.resumeRun(saved) }, `Continue · wave ${saved.wave} on ${MAPS[saved.mapId]?.name || 'map'}`) : null;
  const dailyCard = h('div', { class: 'plaque daily' },
    h('div', { class: 'row' }, h('h3', { style: { margin: 0 } }, 'Daily Challenge'), h('span', { class: 'spacer' }), h('span', { class: 'chip' }, MAPS[daily.map].name)),
    h('div', { class: 'muted' }, daily.modifiers.map((m) => MODIFIERS[m].name).join(' + '), ` · ×${scoreMultiplier(daily.modifiers).toFixed(2)} score`),
    todays ? h('div', {}, `Your best today: wave ${todays.wave} · ${fmt(todays.score)}`) : h('div', { class: 'muted' }, 'Same seed for everyone today. One leaderboard.'),
    h('button', { class: 'btn gold', onclick: () => app.startRun({ mapId: daily.map, seed: daily.seed, modifiers: daily.modifiers, mode: 'daily', ascension: 0, weapon: p.weapon }) }, todays ? 'Play again' : 'Play today\'s challenge'),
  );
  const siege = app.siege;
  const siegeCard = siege ? h('div', { class: 'plaque siege-mini' },
    h('div', { class: 'row' }, h('b', {}, `World Siege · ${siege.name}`), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, siege.defeated ? 'Defeated!' : `${Math.max(0, Math.ceil((siege.endsAt - Date.now()) / 3600000))}h left`)),
    bar(siege.hp / siege.maxHp, ''),
    h('div', { class: 'muted', style: { fontSize: '.85rem', marginTop: '.3rem' } }, `${fmt(siege.hp)} HP left · your damage ${fmt(siege.yourDamage || 0)}. Every run chips at it.`)) : null;
  const rival = app.rival ? h('div', { class: 'plaque rival' }, '⚔ Your rival this week: ', h('b', {}, app.rival.name), ` reached wave ${app.rival.value}. Beat it to take their spot.`) : null;

  const tile = (title, sub, onclick, badge) => h('button', { class: 'btn tile', onclick }, h('span', { class: 't-title' }, title, badge ? ' ' : '', badge ? h('span', { class: 'badge' }, badge) : null), h('span', { class: 't-sub' }, sub));

  mount(h('div', { class: 'home' }, h('div', { class: 'home-wrap' },
    h('div', { class: 'logo' }, castleArt(), h('h1', {}, 'Bastion Siege'), h('div', { class: 'sub' }, p.title ? `${p.name}, ${p.title}` : `Hold the line, ${p.name}.`), tagline(), rankRow(p)),
    app.pendingChallenge ? challengeCard(app) : null,
    h('div', { class: 'home-main' },
      h('div', { class: 'play-card' },
        continueBtn,
        h('button', { class: 'btn gold big wide', onclick: () => app.showSetup() }, 'New run'),
        frontCard(app), eventCard(app), blessingCard(), realmHomeCard(app), questCard(p), dailyCard, rival),
      h('div', { class: 'tile-grid' },
        tile('The Keep', `${fmt(p.renown)} Renown · ${keepAffordable(p) ? keepAffordable(p) + ' upgrades ready to buy' : 'upgrades await'}`, () => app.showKeep()),
        tile('Allies', online === false ? 'Offline' : 'Friends, clans, boards', () => app.showSocial('boards'), inbox ? String(inbox) : null),
        tile('Achievements', `${achCount} / ${ACHIEVEMENTS.length}`, () => app.showAchievements()),
        tile('Chronicle', `Best wave ${Math.max(0, ...Object.values(p.best.wave))} · your stats and the Realm's`, () => app.showStats()),
        tile('Settings', 'Sound, controls, account', () => app.openSettings(false)),
        tile('How to play', 'Towers, aiming, boons', () => howToPlay()),
      ),
    ),
    h('div', { class: 'muted', style: { textAlign: 'center', fontSize: '.8rem' } }, `v${VERSION} · ${online ? 'Online' : online === false ? 'Offline mode' : 'Connecting…'}`),
  )));
}

function challengeCard(app) {
  const c = app.pendingChallenge;
  return h('div', { class: 'plaque trim' },
    h('h3', {}, `${c.name} challenges you!`),
    h('p', {}, `Beat ${fmt(c.score)} points (wave ${c.wave}) on ${MAPS[c.map]?.name || c.map}${c.modifiers.length ? ' with ' + c.modifiers.map((m) => MODIFIERS[m]?.name).join(', ') : ''}. Same map, same waves.`),
    h('div', { class: 'row' },
      h('button', { class: 'btn gold', onclick: () => app.startRun({ mapId: c.map, seed: c.seed, modifiers: c.modifiers, ascension: Math.min(c.ascension, ascensionMax(app.profile, c.map)), mode: 'challenge', challenge: c, weapon: app.profile.weapon }) }, 'Accept challenge'),
      h('button', { class: 'btn ghost', onclick: () => { app.pendingChallenge = null; app.showHome(); } }, 'Dismiss')));
}

function castleArt() {
  const cv = h('canvas', { width: 120, height: 90, 'aria-hidden': 'true' });
  const r = new Renderer(cv);
  r.dpr = 1; r.ts = 48; r.time = 0.5;
  r.ctx.translate(60 - 48 * 1, 70 - 48 * 1);
  r.drawCastle({ map: { castle: { x: 1, y: 1 } }, castle: { hp: 1, maxHp: 1 }, wall: { hp: 1, maxHp: 1 }, weapon: {} });
  return cv;
}

export function howToPlay() {
  modal([
    h('h2', {}, 'How to play'),
    h('p', {}, h('b', {}, 'Build. '), 'Pick a tower from the bar and place it on a stone plot (traps go on the road, three at most). Plots are limited: tap rubble to claim more. Tap a tower to upgrade it. At tier 4 choose one of two specializations; after that, buy Mastery stars forever.'),
    h('p', {}, h('b', {}, 'Read the threat. '), 'The next-wave banner names the threat coming (Horde, Rush, Shield Wall, Air Raid…) and how to counter it.'),
    h('p', {}, h('b', {}, 'Supports. '), 'Barracks soldiers hold enemies in place, and held enemies take extra damage from every tower. Select a barracks and tap the road to move its rally flag. War Banners boost nearby towers and your own weapon, and a second banner adds half as much again. Towers built on a flagged plot fire faster, and flagged barracks and banners get extra soldiers and a wider aura.'),
    h('p', {}, h('b', {}, 'Together. '), 'Every citizen of the Realm fights the same enemy. Each enemy you defeat fills the shared goals: the Daily Rally, the Weekly Muster, the Monthly Campaign and the World Siege boss. When the Realm wins, everyone who helped is rewarded. Cheer other citizens\' deeds, send friends aid, and join a clan.'),
    h('p', {}, h('b', {}, 'Castle Arts. '), 'You carry four Castle Arts into each run, chosen on the New run screen (the Keep\'s Arsenal upgrades add two more). There are fifteen to unlock in The Keep: Arrow Rain, Boiling Oil, Frost Nova, War Horn, Grapeshot, Field Repairs, Spike Field, Smite, Royal Tithe, Plague Flask, Meteor, Aegis, Thunderstorm, Hunter\'s Focus and Time Stop. Each slot has its own key (Q E Z X C V). Tap an art to see what it does, then aim it at the field.'),
    h('p', {}, h('b', {}, 'Late game. '), 'Five late emplacements unlock in The Keep: the Gatling Nest (spins up), Venom Spire (armor-ignoring poison), Void Well (drags foes backwards), Sanctum (mends your towers and wall) and the Trebuchet (huge range and damage). Every tower also earns Mastery perks at 3, 6, 10 and 15 stars, so the deeper you go, the more each tower can do.'),
    h('p', {}, h('b', {}, 'Shoot. '), 'Tap or click enemies to fire your own weapon. Headshots deal double damage. Hold to charge a piercing power shot. Each hit grows your combo; a miss breaks it. Your own kills pay extra gold and double points.'),
    h('p', {}, h('b', {}, 'Defend. '), 'Enemies that reach the end hit your wall, then the keep. Flyers skip the road and the wall. Archers and Sappers attack your towers. Bosses arrive every 10 waves, and the land changes every 25.'),
    h('p', {}, h('b', {}, 'Difficulty. '), 'Pick a higher starting wave on the New run screen to skip the easy waves. You get a head start of gold, open plots and free boons.'),
    h('p', {}, h('b', {}, 'Between waves. '), 'Repair in the War Room, upgrade your weapon, and start early for bonus gold. Every 3 waves you pick a boon.'),
    h('p', {}, h('b', {}, 'Grow. '), 'Runs earn Renown (score, waves held, bosses, a first-run-of-the-day boost and milestones). Spend it in The Keep on permanent upgrades, new towers, weapons, castle abilities and cosmetics.'),
    h('p', { class: 'muted' }, 'Keyboard: 1–9 towers · Space start wave · U upgrade · S sell · R repair · W war room · F speed · P pause'),
  ], { wide: true });
}

// ---------- SETUP ----------
export function setupScreen(app, pre = {}) {
  const p = app.profile;
  const st = { map: pre.mapId || (isMapUnlocked(p, app.lastMap) ? app.lastMap : 'meadow'), mods: new Set(pre.modifiers || []), asc: 0, weapon: unlockedWeapons(p).includes(p.weapon) ? p.weapon : 'longbow', loadout: loadoutFor(p), reinf: [], diff: DIFFICULTY.some((d) => d.id === p.lastDiff) ? p.lastDiff : 'recruit' };
  const bestAny = Math.max(0, ...Object.values(p.best.wave || {}));
  const recommended = [...DIFFICULTY].reverse().find((d) => d.wave <= Math.max(1, bestAny * 0.7))?.id || 'recruit';
  const wrap = h('div', { class: 'screen-inner' });
  const render = () => {
    const maxAsc = ascensionMax(p, st.map);
    st.asc = Math.min(st.asc, maxAsc);
    const mult = scoreMultiplier([...st.mods], st.asc);
    const cards = MAP_ORDER.map((id) => {
      const m = MAPS[id];
      const unlocked = isMapUnlocked(p, id);
      return h('button', { class: 'plaque map-card' + (st.map === id ? ' sel' : '') + (unlocked ? '' : ' locked'), disabled: !unlocked, 'aria-pressed': String(st.map === id), onclick: () => { st.map = id; render(); } },
        mapThumb(id, id === 'frontier' ? 'frontier-preview' : 'preview', 300),
        h('b', {}, m.name), h('span', { class: 'muted' }, unlocked ? m.desc : '🔒 ' + m.unlock.label),
        h('span', { class: 'best' }, unlocked ? `Best wave ${p.best.wave[id] || 0}` : ''));
    });
    const weapons = Object.entries(WEAPONS).map(([id, w]) => {
      const ok = unlockedWeapons(p).includes(id);
      return h('button', { class: 'opt', 'aria-pressed': String(st.weapon === id), disabled: !ok, onclick: () => { if (ok) { st.weapon = id; p.weapon = id; saveProfile(p); render(); } } },
        h('span', { class: 'box' }, st.weapon === id ? '✓' : ''), h('span', {}, h('b', {}, w.name), h('small', {}, ok ? w.desc : 'Unlock in The Keep')), h('span', {}, ok ? '' : '🔒'));
    });
    const slots = ART_SLOTS.base + keepLevel(p, 'artslot');
    const known = unlockedAbilities(p);
    const arts = Object.entries(ABILITIES).map(([id, A]) => {
      const ok = known.has(id), on = st.loadout.includes(id);
      const sub = !ok ? `Unlock in The Keep · ✦ ${fmt(A.buy || KEEP.find((k) => k.id === A.keep)?.cost[0] || 0)}` : `${A.desc} Recharge ${A.cd}s.`;
      return h('button', { class: 'opt', 'aria-pressed': String(on), disabled: !ok || (!on && st.loadout.length >= slots), title: A.desc,
        onclick: () => { if (!ok) return; st.loadout = on ? st.loadout.filter((x) => x !== id) : [...st.loadout, id].slice(0, slots); p.loadout = [...st.loadout]; saveProfile(p); render(); } },
      h('span', { class: 'box' }, on ? '✓' : ''), h('span', {}, h('b', {}, `${A.icon} ${A.name}`), h('small', {}, sub)), h('span', {}, ok ? (on ? ART_KEYS[st.loadout.indexOf(id)] : '') : '🔒'));
    });
    const slotStrip = h('div', { class: 'slot-strip' }, Array.from({ length: ART_SLOTS.max }, (_, i) => {
      const id = st.loadout[i], A = id && ABILITIES[id];
      if (i >= slots) return h('div', { class: 'slot', title: 'Buy Arsenal in The Keep for more slots' }, '🔒', h('small', {}, 'Keep'));
      return h('div', { class: 'slot' + (A ? ' full' : '') }, A ? A.icon : '+', h('small', {}, A ? `${ART_KEYS[i]} · ${A.name}` : 'Empty'));
    }));
    const mods = Object.entries(MODIFIERS).map(([id, m]) => h('button', { class: 'opt', 'aria-pressed': String(st.mods.has(id)), onclick: () => { st.mods.has(id) ? st.mods.delete(id) : st.mods.add(id); render(); } },
      h('span', { class: 'box' }, st.mods.has(id) ? '✓' : ''), h('span', {}, h('b', {}, m.name), h('small', {}, m.desc)), h('span', { class: m.score >= 0 ? 'gold-text' : 'muted' }, (m.score >= 0 ? '+' : '') + Math.round(m.score * 100) + '%')));
    const reinf = p.reinforcements || [];
    const reinfList = reinf.length ? h('div', {},
      h('h3', {}, 'Reinforcements from allies'),
      h('p', { class: 'muted' }, 'Bring up to 3 into this run.'),
      h('div', { class: 'opt-list' }, reinf.map((r, i) => h('button', { class: 'opt', 'aria-pressed': String(st.reinf.includes(i)), onclick: () => { st.reinf.includes(i) ? st.reinf = st.reinf.filter((x) => x !== i) : st.reinf.length < 3 && st.reinf.push(i); render(); } },
        h('span', { class: 'box' }, st.reinf.includes(i) ? '✓' : ''), h('span', {}, h('b', {}, GIFTS[r.kind].name + (r.kind === 'tower' ? ` (${TOWERS[r.tower]?.name || 'Archer'})` : '')), h('small', {}, `From ${r.from}`)), h('span', {}))))) : null;
    const dsel = DIFFICULTY.find((d) => d.id === st.diff);
    const diffCards = DIFFICULTY.map((d) => {
      const pack = headStartPackage(d.wave);
      const tags = [];
      if (d.id === recommended && d.wave > 1) tags.push(h('span', { class: 'chip good' }, 'Suggested'));
      if (d.id === 'recruit' && recommended === 'recruit') tags.push(h('span', { class: 'chip good' }, 'Suggested'));
      if (d.wave > bestAny * 1.3 && d.wave > 1) tags.push(h('span', { class: 'chip warn' }, 'Beyond your best'));
      return h('button', { class: 'plaque diff-card' + (st.diff === d.id ? ' sel' : ''), 'aria-pressed': String(st.diff === d.id), onclick: () => { st.diff = d.id; p.lastDiff = d.id; saveProfile(p); render(); } },
        h('b', {}, d.name), h('span', { class: 'diff-wave' }, d.wave === 1 ? 'Wave 1' : 'Wave ' + d.wave), h('small', { class: 'muted' }, d.desc), ...tags);
    });
    const pk = headStartPackage(dsel.wave);
    const diffNote = dsel.wave > 1
      ? `Head start: about ${fmt(pk.gold)} gold, ${pk.plots} extra open plots and ${pk.boons} free boon pick${pk.boons === 1 ? '' : 's'}. Waves 1–${dsel.wave - 1} are skipped; they count ${Math.round(HEADSTART.rankCredit * 100)}% towards your ranked wave. Score, hero and daily boards need a wave 1 start.`
      : 'The full climb from wave 1. Best for learning the game and for the score, hero and daily leaderboards.';
    wrap.replaceChildren(
      head(app, 'New run'),
      teamBonuses(app),
      h('h3', {}, 'Battlefield'), h('div', { class: 'map-cards' }, cards),
      h('h3', { style: { marginTop: '1.2rem' } }, 'Difficulty'), h('p', { class: 'muted' }, 'Where does your siege begin? Higher starts skip the easy waves and hand you a head start.'),
      h('div', { class: 'diff-cards' }, diffCards), h('p', { class: 'muted diff-note' }, diffNote),
      h('h3', { style: { marginTop: '1.2rem' } }, 'Your weapon'), h('div', { class: 'opt-list' }, weapons),
      h('h3', { style: { marginTop: '1.2rem' } }, `Castle arts · ${st.loadout.length}/${slots} slots`),
      h('p', { class: 'muted' }, 'Pick the abilities you take into battle. Each answers to its slot key (or tap its button) and recharges between uses. You can only use them during waves.'),
      slotStrip, h('div', { class: 'loadout' }, arts),
      h('h3', { style: { marginTop: '1.2rem' } }, 'Modifiers'), h('p', { class: 'muted' }, 'Optional twists. Harder ones raise your score.'), h('div', { class: 'opt-list' }, mods),
      h('div', { class: 'row', style: { marginTop: '1rem' } },
        h('h3', { style: { margin: 0 } }, 'Ascension'),
        h('div', { class: 'stepper' }, h('button', { class: 'btn small', disabled: st.asc <= 0, onclick: () => { st.asc--; render(); } }, '−'), h('output', {}, st.asc), h('button', { class: 'btn small', disabled: st.asc >= maxAsc, onclick: () => { st.asc++; render(); } }, '+')),
        h('span', { class: 'muted' }, maxAsc ? `Enemies +${Math.round(st.asc * ASCENSION.hp * 100)}% HP. Reach wave ${ASCENSION.unlockWave(st.asc)} to unlock the next level.` : `Reach wave ${ASCENSION.unlockWave(0)} on this map to unlock Ascension.`)),
      reinfList,
      h('div', { class: 'setup-foot' },
        h('span', { class: 'chip' }, `Score ×${mult.toFixed(2)}`),
        dsel.wave > 1 ? h('span', { class: 'chip' }, `Starts wave ${dsel.wave}`) : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn gold big', onclick: () => {
          app.lastMap = st.map;
          const chosen = st.reinf.map((i) => reinf[i]);
          p.reinforcements = reinf.filter((_, i) => !st.reinf.includes(i)); saveProfile(p);
          app.startRun({ mapId: st.map, seed: randomSeed(), modifiers: [...st.mods], ascension: st.asc, weapon: st.weapon, loadout: [...st.loadout], mode: st.map === 'frontier' ? 'frontier' : 'normal', reinforcements: chosen, startWave: dsel.wave });
        } }, 'Start run')),
    );
  };
  render();
  mount(wrap);
}

// ---------- SUMMARY ----------
export function summaryScreen(app, run, result) {
  const p = app.profile;
  const top = Object.entries(run.dmgByTower).sort((a, b) => b[1] - a[1]);
  const highlights = [];
  if (top[0]) highlights.push(`Your ${TOWERS[top[0][0]].name} towers dealt ${pct(top[0][1], run.dmgTotal)} of all damage.`);
  if (run.heroDmg) highlights.push(`You personally dealt ${pct(run.heroDmg, run.dmgTotal)} of the damage, with ${run.heroKills} kills.`);
  if (run.shots) highlights.push(`Accuracy ${pct(run.hits, run.shots)} · ${run.headshots} headshots · best combo ${run.maxCombo}.`);
  if (run.bossKills) highlights.push(`Bosses felled: ${run.bossKills}.`);
  if (run.flawless) highlights.push(`${run.flawless} flawless waves (best streak ${run.maxFlawlessStreak}).`);
  if (run.mintGold) highlights.push(`Mints paid out ${fmt(run.mintGold)} gold.`);
  const recs = result.records.map((r) => (r === 'wave' ? `New best wave on ${MAPS[run.map].name}!` : `New high score on ${MAPS[run.map].name}!`));
  let challengeLine = null;
  if (run.challenge) {
    const won = run.score > run.challenge.score;
    challengeLine = h('div', { class: 'plaque trim', style: { margin: '.6rem 0' } }, won ? `🏆 You beat ${run.challenge.name}'s ${fmt(run.challenge.score)}!` : `${run.challenge.name}'s ${fmt(run.challenge.score)} still stands. ${fmt(run.challenge.score - run.score)} to go.`);
  }
  const onlineBox = h('div', { class: 'online-box muted' }, app.api.online ? 'Submitting to the leaderboards…' : '');
  const chLink = () => location.origin + location.pathname + '#c=' + encodeChallenge({ seed: run.seed, map: run.map, modifiers: run.modifiers, ascension: run.ascension, score: run.score, wave: run.wave, name: p.name, weapon: run.weapon });
  mount(h('div', { class: 'screen-inner' },
    h('div', { class: 'summary-head' }, h('div', { class: 'muted' }, `${MAPS[run.map].name}${run.mode === 'daily' ? ' · Daily' : ''}${run.ascension ? ' · Ascension ' + run.ascension : ''}${run.start > 1 ? ' · Started on wave ' + run.start : ''}`),
      h('div', { class: 'big' }, `Wave ${run.wave}`), h('div', { style: { fontSize: '1.3rem', fontWeight: 800 } }, `${fmt(run.score)} points`),
      recs.length ? h('div', { class: 'records' }, recs.join(' ')) : null),
    challengeLine,
    h('div', { class: 'kpis' },
      kpi(fmt(run.kills), 'Enemies defeated'), kpi(fmt(run.heroKills), 'Your kills'), kpi(run.shots ? pct(run.hits, run.shots) : '—', 'Accuracy'),
      kpi(run.maxCombo, 'Best combo'), kpi('+' + fmt(result.renown), 'Renown earned'), kpi(fmtTime(run.duration), 'Time')),
    h('div', { class: 'highlights' }, highlights.map((t) => h('div', {}, t))),
    (result.parts || []).length ? h('div', { class: 'plaque renown-card', style: { margin: '.6rem 0' } }, h('h3', {}, `✦ ${fmt(result.renown)} Renown earned`),
      result.parts.map((r) => h('div', { class: 'row' }, h('span', {}, r.label), h('span', { class: 'spacer' }), h('b', { class: 'gold-text' }, '+' + fmt(r.v)))),
      h('p', { class: 'muted', style: { margin: '.4rem 0 0' } }, `You now hold ${fmt(p.renown)} Renown. Spend it in The Keep.`)) : null,
    (result.quests || []).length ? h('div', { class: 'plaque trim', style: { margin: '.6rem 0' } }, h('h3', {}, 'Orders complete'), (result.quests).map((q) => h('div', {}, `✔ ${fillText(q)} · +${q.reward} Renown`))) : null,
    result.event ? h('div', { class: 'plaque event-card', style: { margin: '.6rem 0' } }, h('b', {}, `${result.event.event.icon} ${result.event.event.name}: +${result.event.added} waves (${result.event.waves} total)`),
      result.event.gained.map((g) => h('div', {}, `🎁 Reward: ${rewardLabel(g)}${g.duplicate ? ' (you already owned it, so +20 bonus Renown)' : ''}`))) : null,
    (result.ranks || []).length ? h('div', { class: 'plaque trim', style: { margin: '.6rem 0' } }, result.ranks.map((r) => h('div', {}, `🎖 Promoted to ${r.name}! The title is yours.`))) : null,
    result.newAchievements.length ? h('div', { class: 'plaque', style: { margin: '.6rem 0' } }, h('h3', {}, 'Achievements unlocked'), h('div', { class: 'row' }, result.newAchievements.map((a) => h('span', { class: 'chip' }, '🏆 ' + a.name)))) : null,
    onlineBox,
    h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '1rem' } },
      h('button', { class: 'btn gold big', onclick: () => app.startRun({ mapId: run.map, seed: run.mode === 'daily' || run.mode === 'challenge' ? run.seed : randomSeed(), modifiers: run.modifiers, ascension: run.ascension, weapon: run.weapon, mode: run.mode, challenge: run.challenge, startWave: run.start || 1 }) }, 'Play again'),
      h('button', { class: 'btn blue', onclick: () => shareRun(run, p) }, 'Share'),
      h('button', { class: 'btn', onclick: async () => { const link = chLink(); await copyText(link); p.social.challengesSent = (p.social.challengesSent || 0) + 1; saveProfile(p); toast('Challenge link copied. Send it to a friend!'); } }, 'Challenge a friend'),
      h('button', { class: 'btn ghost', onclick: () => app.showHome() }, 'Home'),
    ),
  ));
  return onlineBox;
}
function questCard(p) {
  const q = ensureQuests(p);
  const row = (it, tag) => h('div', { class: 'qrow' + (it.done ? ' done' : '') },
    h('div', { class: 'row' }, h('span', {}, (it.done ? '✔ ' : '') + (tag ? tag + ' · ' : '') + fillText(it)), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, `+${it.reward}`)),
    bar(Math.min(1, it.prog / it.goal), ''));
  const st = p.streak && p.streak.n ? `🔥 ${p.streak.n}-day streak` : '';
  return h('div', { class: 'plaque quest-card' }, h('div', { class: 'row' }, h('b', {}, 'Daily orders'), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, st)),
    ...q.list.map((it) => row(it)), row(q.week, 'Weekly'));
}
function kpi(v, l) { return h('div', { class: 'kpi' }, h('b', {}, v), h('span', {}, l)); }

export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch { const ta = h('textarea', {}, t); document.body.append(ta); ta.select(); try { document.execCommand('copy'); } catch { /* ignore */ } ta.remove(); return false; }
}

async function shareRun(run, p) {
  const cv = document.createElement('canvas');
  cv.width = 1200; cv.height = 630;
  const c = cv.getContext('2d');
  const grd = c.createLinearGradient(0, 0, 0, 630); grd.addColorStop(0, '#2b3473'); grd.addColorStop(1, '#141938');
  c.fillStyle = grd; c.fillRect(0, 0, 1200, 630);
  const thumb = mapThumb(run.map, run.map === 'frontier' ? run.seed : 'preview', 560);
  c.save(); c.translate(600, 70); c.rotate(0.03); c.fillStyle = '#1e2433'; c.fillRect(-6, -6, 572, 362); c.drawImage(thumb, 0, 0); c.restore();
  c.fillStyle = '#f2b33d'; c.font = '800 84px "Grenze Gotisch", Georgia, serif'; c.fillText('Bastion Siege', 60, 130);
  c.fillStyle = '#eef1ff'; c.font = '800 64px "Baloo 2", system-ui'; c.fillText(`Wave ${run.wave}`, 60, 250);
  c.font = '700 44px "Baloo 2", system-ui'; c.fillText(`${run.score.toLocaleString()} points`, 60, 315);
  c.fillStyle = '#a9b0d6'; c.font = '600 32px "Baloo 2", system-ui';
  const lines = [`${MAPS[run.map].name}${run.mode === 'daily' ? ' · Daily Challenge' : ''}`, `${run.kills.toLocaleString()} enemies · ${run.heroKills} by hand · best combo ${run.maxCombo}`, run.modifiers.length ? 'Modifiers: ' + run.modifiers.map((m) => MODIFIERS[m].name).join(', ') : '', `Commander ${p.name}`];
  lines.filter(Boolean).forEach((l, i) => c.fillText(l, 60, 400 + i * 48));
  const text = `I held the keep to wave ${run.wave} with ${run.score.toLocaleString()} points in Bastion Siege. Can you beat it?`;
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  const file = blob ? new File([blob], 'bastion-siege.png', { type: 'image/png' }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text, title: 'Bastion Siege' }); return; } catch { /* cancelled */ }
  }
  const url = blob ? URL.createObjectURL(blob) : null;
  modal([h('h2', {}, 'Share your run'), url ? h('img', { src: url, alt: 'Run summary card', style: { width: '100%', borderRadius: '10px', border: '2px solid #1e2433' } }) : null,
    h('div', { class: 'row', style: { marginTop: '.7rem' } },
      url ? h('a', { class: 'btn gold', href: url, download: 'bastion-siege.png' }, 'Download image') : null,
      h('button', { class: 'btn', onclick: async () => { await copyText(text + ' ' + location.origin); toast('Copied'); } }, 'Copy text'))], { wide: true });
}

// What-it-does confirmation before spending Renown on an unlock.
function unlockModal(p, node, cost, onBuy) {
  const info = unlockInfo(node);
  let icon;
  if (info.tower) { icon = h('canvas'); drawIcon(icon, 'tower', info.tower, { size: 56 }); } else icon = h('div', { class: 'big-ic' }, info.icon);
  const m = modal(h('div', { class: 'info-modal' },
    h('div', { class: 'row' }, icon, h('div', {}, h('h2', { style: { margin: 0 } }, info.name), h('span', { class: 'muted' }, info.kind))),
    h('p', { style: { fontSize: '1.05rem', fontWeight: 600 } }, info.desc),
    h('div', { class: 'facts' }, info.facts.map(([k, v]) => h('div', {}, h('span', { class: 'muted' }, k), h('b', {}, v)))),
    h('p', { class: 'muted' }, info.how),
    ...info.extras.map((t) => h('p', { class: 'muted', style: { fontSize: '.88rem' } }, t)),
    h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '.8rem' } },
      h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Not yet'),
      h('button', { class: 'btn gold', disabled: p.renown < cost, onclick: () => { m.close(); onBuy(); } }, `Unlock · ✦ ${fmt(cost)}`))));
}

// ---------- KEEP ----------
export function keepScreen(app, tab = null) {
  const p = app.profile;
  const wrap = h('div', { class: 'screen-inner' });
  tab = tab || app.keepTab || 'towers';
  const render = () => {
    app.keepTab = tab;
    const tabs = h('div', { class: 'tabs keep-tabs', role: 'tablist' }, Object.entries(KEEP_BRANCHES).map(([bid, bname]) => {
      const n = keepAffordable(p, bid);
      return h('button', { class: 'btn small', role: 'tab', 'aria-selected': String(tab === bid), onclick: () => { tab = bid; render(); } }, bname, n ? h('span', { class: 'badge' }, String(n)) : null);
    }));
    const nodes = KEEP.filter((k) => k.branch === tab);
    const groups = [];
    for (const n of nodes) {
      let g = groups.find((x) => x.name === n.group);
      if (!g) groups.push(g = { name: n.group, nodes: [] });
      g.nodes.push(n);
    }
    const nodeEl = (node) => {
      const lv = keepLevel(p, node.id);
      const cost = keepNextCost(p, node);
      const lock = keepLocked(p, node);
      const info = unlockInfo(node);
      let icon = null;
      if (node.tower) { icon = h('canvas'); drawIcon(icon, 'tower', node.tower, { size: 34 }); }
      else if (node.ability) icon = h('span', { class: 'kicon' }, ABILITIES[node.ability].icon);
      else if (node.cosmetic) icon = h('span', { class: 'kicon' }, { castle: '🏰', trail: '🏹', kill: '✨', skin: '🧱' }[node.cosmetic.split(':')[0]]);
      else if (node.title) icon = h('span', { class: 'kicon' }, '🎖');
      else if (node.train) { icon = h('canvas'); drawIcon(icon, 'tower', node.train, { size: 34 }); }
      const multi = node.cost.length > 1;
      const action = cost == null ? h('span', { class: 'chip' }, lv && !multi ? 'Owned' : 'Maxed')
        : lock ? h('span', { class: 'chip warn' }, '🔒 ' + lock.name)
          : h('button', { class: 'btn small gold', disabled: p.renown < cost, onclick: () => { if (info) unlockModal(p, node, cost, () => { if (buyKeep(p, node.id)) { audio.play('upgrade'); render(); toast(`${info.name} unlocked`, { icon: '🔓', key: 'unlock' }); } }); else if (buyKeep(p, node.id)) { audio.play('upgrade'); render(); } } }, `✦ ${fmt(cost)}`);
      return h('div', { class: 'keep-node' + (lock ? ' locked' : '') + (cost != null && !lock && p.renown >= cost ? ' can' : '') },
        h('div', {}, h('div', { class: 'row', style: { gap: '.4rem' } }, icon, h('b', {}, node.name), multi ? h('span', { class: 'muted lvl' }, `Lv ${lv}/${node.cost.length}`) : null),
          h('div', { class: 'muted', style: { fontSize: '.88rem' } }, info ? info.desc : node.desc),
          multi ? h('div', { class: 'pips' }, node.cost.map((_, i) => h('i', { class: i < lv ? 'on' : '' }))) : null),
        action);
    };
    const body = groups.map((g) => h('div', { class: 'plaque keep-branch' }, h('h3', {}, g.name), g.nodes.map(nodeEl)));
    const owned = KEEP.reduce((a, k) => a + keepLevel(p, k.id), 0), total = KEEP.reduce((a, k) => a + k.cost.length, 0);
    wrap.replaceChildren(head(app, 'The Keep', h('span', { class: 'renown' }, `✦ ${fmt(p.renown)} Renown`)),
      h('p', { class: 'muted' }, `Permanent upgrades for every run. Earn Renown from score, waves held, bosses, daily orders and first-time milestones. ${owned}/${total} upgrades owned.`),
      tabs,
      h('div', { class: 'keep-grid' }, body));
  };
  render();
  mount(wrap);
}

// ---------- ACHIEVEMENTS / WARDROBE ----------
export function achievementsScreen(app, tab = 'ach') {
  const p = app.profile;
  const wrap = h('div', { class: 'screen-inner' });
  const render = () => {
    const tabs = h('div', { class: 'tabs', role: 'tablist' },
      [['ach', 'Achievements'], ['ward', 'Wardrobe'], ['beast', 'Bestiary']].map(([id, l]) => h('button', { class: 'btn small', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; render(); } }, l)));
    let body;
    if (tab === 'ach') {
      body = h('div', { class: 'ach-grid' }, ACHIEVEMENTS.map((a) => {
        const got = !!p.achievements[a.id];
        const rw = a.reward ? [a.reward.title ? `Title: ${a.reward.title}` : '', a.reward.cosmetic ? cosmeticName(a.reward.cosmetic) : ''].filter(Boolean).join(' · ') : '';
        return h('div', { class: 'ach' + (got ? ' got' : '') }, h('div', { class: 'ic' }, got ? '🏆' : '·'), h('div', {}, h('b', {}, a.name), h('small', {}, a.desc), rw ? h('span', { class: 'rw' }, rw) : null));
      }));
    } else if (tab === 'ward') {
      const cat = (key, label) => h('div', { class: 'plaque' }, h('h3', {}, label), h('div', { class: 'cos-grid' }, Object.entries(COSMETICS[key]).map(([id, name]) => {
        const full = key + ':' + id;
        const owned = p.owned.includes(full);
        const eq = p.equip[key] === id;
        return h('button', { class: 'opt', 'aria-pressed': String(eq), disabled: !owned, onclick: () => { p.equip[key] = id; saveProfile(p); render(); } },
          h('span', { class: 'box' }, eq ? '✓' : ''), h('span', {}, h('b', {}, name), h('small', {}, owned ? (eq ? 'Equipped' : 'Owned') : `From: ${cosmeticSource(full) || 'Achievement'}`)), h('span', {}, owned ? '' : '🔒'));
      })));
      const titles = h('div', { class: 'plaque' }, h('h3', {}, 'Title'), p.titles.length ? h('div', { class: 'cos-grid' },
        [null, ...p.titles].map((t) => h('button', { class: 'opt', 'aria-pressed': String(p.title === t), onclick: () => { p.title = t; saveProfile(p); render(); } }, h('span', { class: 'box' }, p.title === t ? '✓' : ''), h('span', {}, h('b', {}, t || 'No title')), h('span', {})))) : h('p', { class: 'muted' }, 'Earn titles from achievements and weekly seasons.'));
      body = h('div', { class: 'grid two' }, cat('castle', 'Castle'), cat('trail', 'Arrow trail'), cat('kill', 'Defeat effect'), cat('skin', 'Tower finish'), titles);
    } else {
      const all = [...Object.entries(ENEMIES).filter(([id]) => id !== 'spider').map(([id, d]) => ({ id, d, key: id })), { id: 'spider', d: ENEMIES.spider, key: 'spider' }, ...BOSSES.map((b) => ({ id: 'boss:' + b.id, d: b, key: b.id }))];
      body = h('div', { class: 'cos-grid' }, all.map(({ id, d, key }) => {
        const kills = p.stats.killsByType[key] || 0;
        const cv = h('canvas');
        drawIcon(cv, 'enemy', id, { def: d, size: 72, silhouette: !kills });
        return h('div', { class: 'plaque beast' }, cv, h('b', {}, kills ? d.name : '???'), h('small', { class: 'muted' }, kills ? `${fmt(kills)} defeated` : (d.unlock && d.unlock < 999 ? `Appears around wave ${d.unlock}` : 'Not yet met')),
          kills ? h('small', { class: 'muted' }, `HP ${d.hp} · Speed ${d.speed}${d.armor ? ' · Armor ' + d.armor : ''}${d.mr ? ' · MR ' + d.mr : ''}${d.air ? ' · Flying' : ''}`) : null);
      }));
    }
    wrap.replaceChildren(head(app, 'Achievements'), tabs, body);
  };
  render();
  mount(wrap);
}
function cosmeticName(full) { const [k, id] = full.split(':'); return COSMETICS[k]?.[id] || full; }

// ---------- STATS ----------
export function statsScreen(app, tab = app.chronicleTab || 'you') {
  app.chronicleTab = tab;
  const p = app.profile, s = p.stats;
  const cache = app.chronicle;
  if ((!cache || Date.now() - cache.at > 60000) && app.api.online !== false && p.online) {
    app.api.stats().then((server) => { app.chronicle = { server, at: Date.now() }; if (app.where === 'stats') statsScreen(app, app.chronicleTab); })
      .catch(() => { app.chronicle = { server: null, at: Date.now() }; });
  }
  const server = cache?.server || null;
  const tabs = h('div', { class: 'tabs', role: 'tablist' },
    [['you', 'You'], ['realm', 'The Realm'], ['deeds', 'Deeds']].map(([id, l]) => h('button', { class: 'btn small', role: 'tab', 'aria-selected': String(tab === id), onclick: () => statsScreen(app, id) }, l)));
  const wrap = h('div', { class: 'screen-inner' }, head(app, 'Chronicle'), tabs);
  if (tab === 'realm') { wrap.append(realmStatsPanel(app, server)); mount(wrap); return; }
  if (tab === 'deeds') { wrap.append(deedsPanel(app)); mount(wrap); return; }
  const fav = Object.entries(s.builtByTower).sort((a, b) => b[1] - a[1])[0];
  const dmgTotal = Object.values(s.dmgByTower).reduce((a, b) => a + b, 0) + (s.heroDmg || 0);
  const killsTotal = Object.values(s.killsByType).reduce((a, b) => a + b, 0) || 1;
  const chart = h('canvas', { 'aria-label': 'Waves reached in recent runs' });
  wrap.append(
    insightsCard(app, server), ...youExtras(app, server),
    h('div', { class: 'kpis' },
      kpi(fmt(s.runs), 'Runs'), kpi(Math.max(0, ...Object.values(p.best.wave)), 'Best wave'), kpi(fmt(Math.max(0, ...Object.values(p.best.score))), 'Best score'),
      kpi(fmt(s.kills), 'Enemies defeated'), kpi(fmt(s.heroKills), 'Your kills'), kpi(s.shots ? pct(s.hits, s.shots) : '—', 'Accuracy'),
      kpi(fmt(s.headshots), 'Headshots'), kpi(s.maxCombo, 'Best combo'), kpi(fmt(s.bossKills), 'Bosses'), kpi(fmtTime(s.playTime), 'Time defending'),
      kpi(fav ? TOWERS[fav[0]].name : '—', 'Favorite tower'), kpi(fmt(s.renownEarned), 'Renown earned')),
    h('div', { class: 'grid two' },
      h('div', { class: 'plaque chart-box' }, h('h3', {}, 'Recent runs'), p.history.length ? chart : h('div', { class: 'empty' }, 'Play a run to start your history.')),
      h('div', { class: 'plaque' }, h('h3', {}, 'Best by map'), MAP_ORDER.map((m) => h('div', { class: 'hbar' }, h('span', {}, MAPS[m].name), bar((p.best.wave[m] || 0) / Math.max(1, ...Object.values(p.best.wave)), 'gold'), h('b', {}, p.best.wave[m] || 0)))),
      h('div', { class: 'plaque' }, h('h3', {}, 'Damage by source'), dmgTotal ? [...Object.entries(s.dmgByTower), ['hero', s.heroDmg]].sort((a, b) => b[1] - a[1]).map(([k, v]) => h('div', { class: 'hbar' }, h('span', {}, k === 'hero' ? 'You' : TOWERS[k].name), bar(v / dmgTotal, k === 'hero' ? 'gold' : 'blue'), h('b', {}, pct(v, dmgTotal)))) : h('div', { class: 'empty' }, 'No data yet.')),
      h('div', { class: 'plaque' }, h('h3', {}, 'Kills by enemy'), Object.entries(s.killsByType).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => h('div', { class: 'hbar' }, h('span', {}, ENEMIES[k]?.name || BOSSES.find((b) => b.id === k)?.name || k), bar(v / killsTotal, 'moss'), h('b', {}, fmt(v))))),
    ),
  );
  mount(wrap);
  if (p.history.length) requestAnimationFrame(() => drawHistory(chart, p.history));
}

function drawHistory(cv, hist) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth || 400, hgt = 180;
  cv.width = w * dpr; cv.height = hgt * dpr;
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  const data = hist.slice(-30);
  const max = Math.max(5, ...data.map((d) => d.wave));
  const pad = { l: 30, r: 10, t: 10, b: 22 };
  const X = (i) => pad.l + (i / Math.max(1, data.length - 1)) * (w - pad.l - pad.r);
  const Y = (v) => hgt - pad.b - (v / max) * (hgt - pad.t - pad.b);
  c.strokeStyle = '#3e4885'; c.lineWidth = 1; c.fillStyle = '#a9b0d6'; c.font = '600 11px "Baloo 2", system-ui';
  for (let g = 0; g <= 4; g++) { const v = Math.round((max * g) / 4); c.beginPath(); c.moveTo(pad.l, Y(v)); c.lineTo(w - pad.r, Y(v)); c.stroke(); c.fillText(v, 4, Y(v) + 4); }
  c.fillText('Wave reached, last ' + data.length + ' runs', pad.l, hgt - 5);
  c.strokeStyle = '#f2b33d'; c.lineWidth = 3; c.lineJoin = 'round';
  c.beginPath(); data.forEach((d, i) => (i ? c.lineTo(X(i), Y(d.wave)) : c.moveTo(X(i), Y(d.wave)))); c.stroke();
  data.forEach((d, i) => { c.fillStyle = d.mode === 'daily' ? '#5aa7ff' : '#f2b33d'; c.beginPath(); c.arc(X(i), Y(d.wave), 4, 0, Math.PI * 2); c.fill(); });
}

// ---------- SETTINGS ----------
export function settingsModal(app, inGame) {
  const p = app.profile, s = p.settings;
  const slider = (label, key) => h('label', { class: 'field' }, `${label}`, h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s[key], oninput: (e) => { s[key] = Number(e.target.value); app.applySettings(); } }));
  const toggle = (label, key, desc) => h('button', { class: 'opt', 'aria-pressed': String(!!s[key]), onclick: (e) => { s[key] = !s[key]; app.applySettings(); e.currentTarget.setAttribute('aria-pressed', String(s[key])); e.currentTarget.querySelector('.box').textContent = s[key] ? '✓' : ''; } },
    h('span', { class: 'box' }, s[key] ? '✓' : ''), h('span', {}, h('b', {}, label), desc ? h('small', {}, desc) : null), h('span', {}));
  const seg = (label, key, opts) => h('div', { class: 'field' }, h('b', {}, label), h('div', { class: 'seg' }, opts.map(([v, l]) => h('button', { 'aria-pressed': String(s[key] === v), onclick: (e) => { s[key] = v; app.applySettings(); [...e.currentTarget.parentElement.children].forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, l))));
  const nameInput = h('input', { type: 'text', value: p.name, maxlength: 20, 'aria-label': 'Display name' });
  const recoverInput = h('input', { type: 'text', placeholder: 'Recovery code', 'aria-label': 'Recovery code' });
  const m = modal([
    h('h2', {}, 'Settings'),
    h('div', { class: 'grid two' },
      h('div', {}, h('h3', {}, 'Sound'), slider('Master volume', 'master'), slider('Effects', 'sfx'), slider('Music', 'music'), toggle('Mute everything', 'muted')),
      h('div', {}, h('h3', {}, 'Display'),
        seg('Graphics', 'quality', [['low', 'Light'], ['high', 'Full']]),
        seg('Damage numbers', 'dmgNumbers', [['off', 'Off'], ['hero', 'Yours + crits'], ['all', 'All']]),
        h('label', { class: 'field' }, 'Interface size', h('input', { type: 'range', min: 0.85, max: 1.3, step: 0.05, value: s.uiScale, oninput: (e) => { s.uiScale = Number(e.target.value); app.applySettings(); } })),
        seg('Seasonal theme', 'theme', [['auto', 'Auto'], ['off', 'Off']]),
        toggle('Screen shake', 'shake'), toggle('Reduced motion', 'reducedMotion', 'Fewer particles and animations'), toggle('Colorblind palette', 'colorblind', 'Blue/orange health and status colors'),
        toggle('Keep building after placing', 'stickyBuild', 'Mouse only. Hold Shift for one-off.')),
    ),
    h('h3', { style: { marginTop: '1rem' } }, 'Account'),
    h('div', { class: 'row' }, nameInput, h('button', { class: 'btn small', onclick: async () => {
      const n = nameInput.value.trim().slice(0, 20); if (!n) return;
      p.name = n; p.nameSet = true; saveProfile(p);
      if (p.online) { try { const r = await app.api.rename(n); if (r?.name) { p.name = r.name; nameInput.value = r.name; saveProfile(p); } toast('Name updated'); } catch (e) { toast(e.message); } } else toast('Name updated');
    } }, 'Save name')),
    p.online ? h('p', { class: 'muted' }, 'Recovery code (keep it secret, use it to restore your account on another device): ', h('span', { class: 'code' }, p.online.recovery || '—')) : h('p', { class: 'muted' }, 'You get an online account automatically the first time you finish a run while online.'),
    h('div', { class: 'row' }, recoverInput, h('button', { class: 'btn small', onclick: async () => {
      try {
        const r = await app.api.recover(recoverInput.value);
        p.online = { id: r.id, token: r.token, recovery: recoverInput.value.trim(), friendCode: r.friendCode }; p.name = r.name; saveProfile(p);
        toast('Account restored on this device.');
      } catch (e) { toast(e.message || 'That code did not match an account.'); }
    } }, 'Restore account')),
    h('h3', { style: { marginTop: '1rem' } }, 'Save data'),
    h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: async () => { await copyText(JSON.stringify(p)); toast('Save copied to clipboard'); } }, 'Export save'),
      h('button', { class: 'btn small', onclick: () => importSave(app) }, 'Import save'),
      h('button', { class: 'btn small red', onclick: async () => { if (await confirmBox('Erase all local progress? Your online account is not deleted.', 'Erase', true)) { localStorage.clear(); location.reload(); } } }, 'Reset progress')),
    h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '1rem' } }, h('button', { class: 'btn gold', onclick: () => m.close() }, 'Done')),
  ], { wide: true, onClose: () => { saveProfile(p); if (inGame && app.session) { app.session.paused = false; app.session.last = performance.now(); } } });
  if (inGame && app.session) app.session.paused = true;
}

function importSave(app) {
  const ta = h('textarea', { placeholder: 'Paste your exported save here' });
  const m = modal([h('h2', {}, 'Import save'), ta, h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '.6rem' } }, h('button', { class: 'btn gold', onclick: () => {
    try {
      const obj = JSON.parse(ta.value);
      if (!obj || obj.v !== 1 || !obj.stats) throw new Error('bad');
      const merged = { ...defaultProfile(), ...obj };
      localStorage.setItem('bastion.profile.v1', JSON.stringify(merged));
      location.reload();
    } catch { toast('That does not look like a Bastion Siege save.'); }
  } }, 'Import'))]);
}

// ---------- SOCIAL ----------
export function socialScreen(app, tab = 'realm') {
  const p = app.profile;
  const wrap = h('div', { class: 'screen-inner' });
  const body = h('div');
  const tabsDef = [['realm', 'The Realm'], ['boards', 'Leaderboards'], ['friends', 'Friends'], ['clan', 'Clan'], ['siege', 'World Siege'], ['inbox', 'Inbox']];
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const renderTabs = () => tabs.replaceChildren(...tabsDef.map(([id, l]) => h('button', { class: 'btn small', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; renderTabs(); load(); } }, l, id === 'inbox' && app.inboxCount ? h('span', { class: 'badge' }, app.inboxCount) : null)));
  renderTabs();
  wrap.append(head(app, 'The Realm & allies'), tabs, body);
  mount(wrap);

  const offline = () => body.replaceChildren(h('div', { class: 'plaque' },
    h('h3', {}, 'You are playing offline'),
    h('p', {}, app.api.reason || 'Online features need the game server.'),
    h('p', { class: 'muted' }, 'Friend challenges still work offline: finish a run and press "Challenge a friend" to copy a link with the same map and waves.'),
    h('button', { class: 'btn', onclick: () => { app.api.online = null; load(); } }, 'Try again')));
  const busy = () => body.replaceChildren(h('div', { class: 'empty' }, 'Loading…'));
  const fail = (e) => body.replaceChildren(h('div', { class: 'plaque' }, h('p', {}, e.message || 'Something went wrong.'), h('button', { class: 'btn', onclick: load }, 'Retry')));

  async function load() {
    busy();
    if (!(await app.api.health())) return offline();
    try {
      await app.api.ensureAccount();
      if (tab === 'realm') realmTab(app, body, fail);
      else if (tab === 'boards') await boards();
      else if (tab === 'friends') await friends();
      else if (tab === 'clan') await clan();
      else if (tab === 'siege') await siege();
      else await inbox();
    } catch (e) { fail(e); }
  }

  const st = { board: 'wave', scope: 'global', period: 'week' };
  async function boards() {
    const r = await app.api.leaderboard(st.board, st.scope, st.period);
    const seg = (key, opts) => h('div', { class: 'seg' }, opts.map(([v, l]) => h('button', { 'aria-pressed': String(st[key] === v), onclick: () => { st[key] = v; boards().catch(fail); } }, l)));
    const val = (v) => (st.board === 'wave' ? `Wave ${fmt(v)}` : st.board === 'ascend' ? `A${Math.floor(v / 1000)} · Wave ${v % 1000}` : st.board === 'hero' ? `${fmt(v)} kills` : `${fmt(v)} pts`);
    const rows = (r.rows || []).map((row, i) => h('div', { class: 'lrow' + (row.id === p.online?.id ? ' me' : '') },
      h('span', { class: 'rank' + (i < 3 ? ' top' : '') }, i < 3 ? ['🥇', '🥈', '🥉'][i] : row.rank || i + 1),
      h('span', { class: 'who' }, h('b', {}, row.name), row.title || row.clan ? h('small', {}, [row.title, row.clan ? `[${row.clan}]` : ''].filter(Boolean).join(' ')) : null),
      h('span', { class: 'val' }, val(row.value))));
    body.replaceChildren(
      h('div', { class: 'grid', style: { marginBottom: '.7rem' } },
        seg('board', [['wave', 'Highest wave'], ['ascend', 'Ascended'], ['score', 'Top score'], ['daily', 'Today\'s daily'], ['hero', 'Hero kills']]),
        h('div', { class: 'row' }, seg('scope', [['global', 'Everyone'], ['friends', 'Friends'], ['clan', 'Clan']]), st.board !== 'daily' ? seg('period', [['week', 'This week'], ['all', 'All time']]) : null)),
      r.me ? h('div', { class: 'plaque', style: { marginBottom: '.6rem' } }, `Your rank: #${r.me.rank} · ${val(r.me.value)}`, r.rival ? ` · Next up: ${r.rival.name} (${val(r.rival.value)})` : '') : null,
      rows.length ? h('div', { class: 'list' }, rows) : h('div', { class: 'empty' }, 'No entries yet. Finish a run to get on the board!'),
      st.period === 'week' ? h('p', { class: 'muted' }, 'Weekly seasons reset Monday (UTC). The top 10 earn a season title.') : null);
  }

  async function friends() {
    const r = await app.api.friends();
    p.social.friends = r.friends.length; saveProfile(p);
    app.checkAch();
    const code = h('input', { type: 'text', placeholder: 'Friend code', maxlength: 8, 'aria-label': 'Friend code' });
    const list = r.friends.map((f) => h('div', { class: 'lrow' },
      h('span', { class: 'rank' }, f.online ? '🟢' : '⚪'),
      h('span', { class: 'who' }, h('b', {}, f.name), h('small', {}, `Best wave ${f.bestWave || 0}${f.clan ? ` · [${f.clan}]` : ''}${f.online ? ' · online now' : ''}`)),
      h('span', { class: 'row', style: { gap: '.3rem' } },
        h('button', { class: 'btn small gold', disabled: r.giftsLeft <= 0, onclick: () => giftDialog(f, r.giftsLeft) }, 'Send aid'),
        h('button', { class: 'btn small ghost', title: 'Remove friend', onclick: async () => { if (await confirmBox(`Remove ${f.name} from your friends?`, 'Remove')) { await app.api.removeFriend(f.id); friends(); } } }, '✕'))));
    body.replaceChildren(
      h('div', { class: 'plaque', style: { marginBottom: '.7rem' } },
        h('div', { class: 'row' }, h('span', {}, 'Your friend code'), h('span', { class: 'code' }, p.online?.friendCode || '—'), h('button', { class: 'btn small', onclick: async () => { await copyText(p.online.friendCode); toast('Friend code copied'); } }, 'Copy')),
        h('div', { class: 'row', style: { marginTop: '.5rem' } }, code, h('button', { class: 'btn small gold', onclick: async () => { try { await app.api.addFriend(code.value.trim().toUpperCase()); toast('Friend added!'); friends(); } catch (e) { toast(e.message); } } }, 'Add friend')),
        h('p', { class: 'muted' }, `Send up to ${r.giftsLeft} more gifts today. Gifts and Allied Towers show up in your friend's next run.`)),
      list.length ? h('div', { class: 'list' }, list) : h('div', { class: 'empty' }, 'No friends yet. Share your code to team up.'));
  }

  function giftDialog(f, left) {
    let kind = 'tower', tower = 'archer';
    const render = () => m.el.replaceChildren(
      h('h2', {}, `Send aid to ${f.name}`),
      h('div', { class: 'opt-list' }, Object.entries(GIFTS).map(([id, g]) => h('button', { class: 'opt', 'aria-pressed': String(kind === id), onclick: () => { kind = id; render(); } }, h('span', { class: 'box' }, kind === id ? '✓' : ''), h('span', {}, h('b', {}, g.name), h('small', {}, g.desc)), h('span', {})))),
      kind === 'tower' ? h('div', { class: 'seg', style: { marginTop: '.6rem' } }, ['archer', 'cannon', 'mage'].map((t) => h('button', { 'aria-pressed': String(tower === t), onclick: () => { tower = t; render(); } }, TOWERS[t].name))) : null,
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '.8rem' } }, h('span', { class: 'muted' }, `${left} left today`), h('button', { class: 'btn gold', onclick: async () => {
        try { await app.api.gift(f.id, kind, tower); p.social.giftsSent = (p.social.giftsSent || 0) + 1; saveProfile(p); app.checkAch(); toast(`Sent ${GIFTS[kind].name} to ${f.name}`); m.close(); friends(); } catch (e) { toast(e.message); }
      } }, 'Send')));
    const m = modal([]); render();
  }

  async function clan() {
    const r = await app.api.clan();
    app.clan = r.clan || null;
    p.social.clan = r.clan ? r.clan.tag : null; saveProfile(p); app.checkAch();
    if (!r.clan) {
      const name = h('input', { type: 'text', placeholder: 'Clan name', maxlength: 24 });
      const tag = h('input', { type: 'text', placeholder: 'Tag (2–4)', maxlength: 4, style: { width: '8rem' } });
      const joinCode = h('input', { type: 'text', placeholder: 'Clan code', maxlength: 8 });
      const q = h('input', { type: 'search', placeholder: 'Search clans' });
      const results = h('div', { class: 'list' });
      const search = async () => { const s = await app.api.clanSearch(q.value.trim()); results.replaceChildren(...(s.clans.length ? s.clans.map((c) => h('div', { class: 'lrow' }, h('span', { class: 'rank' }, `L${c.level}`), h('span', { class: 'who' }, h('b', {}, `[${c.tag}] ${c.name}`), h('small', {}, `${c.members}/30 members`)), h('button', { class: 'btn small gold', onclick: async () => { try { await app.api.clanJoin(c.code); toast('Welcome to the clan!'); clan(); } catch (e) { toast(e.message); } } }, 'Join'))) : [h('div', { class: 'empty' }, 'No clans found.')])); };
      body.replaceChildren(h('div', { class: 'grid two' },
        h('div', { class: 'plaque' }, h('h3', {}, 'Found a clan'), h('p', { class: 'muted' }, 'Pool Renown into a shared treasury, unlock perks for everyone, and chase weekly goals together.'),
          h('div', { class: 'grid' }, name, tag, h('button', { class: 'btn gold', onclick: async () => { try { await app.api.clanCreate(name.value.trim(), tag.value.trim().toUpperCase()); toast('Clan founded!'); clan(); } catch (e) { toast(e.message); } } }, 'Found clan'))),
        h('div', { class: 'plaque' }, h('h3', {}, 'Join a clan'),
          h('div', { class: 'row' }, joinCode, h('button', { class: 'btn small gold', onclick: async () => { try { await app.api.clanJoin(joinCode.value.trim().toUpperCase()); toast('Welcome to the clan!'); clan(); } catch (e) { toast(e.message); } } }, 'Join by code')),
          h('div', { class: 'row', style: { marginTop: '.5rem' } }, q, h('button', { class: 'btn small', onclick: () => search().catch(fail) }, 'Search')), results)));
      search().catch(() => {});
      return;
    }
    const c = r.clan;
    const lv = clanPerkLevel(c);
    const next = CLAN_LEVELS[lv + 1];
    const donate = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'Renown', style: { width: '8rem' } });
    body.replaceChildren(h('div', { class: 'grid two' },
      h('div', { class: 'plaque' },
        h('h3', {}, `[${c.tag}] ${c.name}`),
        h('div', { class: 'muted' }, `Level ${lv} · ${c.members.length}/30 members · Code `, h('span', { class: 'code', style: { fontSize: '1rem' } }, c.code)),
        h('div', { style: { margin: '.6rem 0' } }, bar(next ? (c.xp - CLAN_LEVELS[lv].xp) / (next.xp - CLAN_LEVELS[lv].xp) : 1, 'gold'), h('small', { class: 'muted' }, next ? `${fmt(c.xp)} / ${fmt(next.xp)} XP to level ${lv + 1}: ${next.perk}` : 'Max level')),
        h('div', { class: 'section-label' }, 'Perks'),
        h('div', { class: 'list' }, CLAN_LEVELS.slice(1).map((l, i) => h('div', { class: i + 1 <= lv ? '' : 'muted' }, `${i + 1 <= lv ? '✓' : '·'} L${i + 1}: ${l.perk}`))),
        h('div', { class: 'section-label' }, `Treasury: ✦ ${fmt(c.treasury)}`),
        h('div', { class: 'row' }, donate, h('button', { class: 'btn small gold', onclick: async () => {
          const n = Math.floor(Number(donate.value)); if (!n || n <= 0) return;
          if (n > p.renown) { toast('You do not have that much Renown.'); return; }
          try { await app.api.clanDonate(n); p.renown -= n; saveProfile(p); toast(`Donated ✦ ${n}`); clan(); } catch (e) { toast(e.message); }
        } }, 'Donate Renown')),
        h('p', { class: 'muted' }, 'Donations and every member\'s kills grow clan XP.'),
        h('button', { class: 'btn small ghost', onclick: async () => { if (await confirmBox('Leave your clan?', 'Leave', true)) { await app.api.clanLeave(); app.clan = null; clan(); } } }, 'Leave clan')),
      h('div', { class: 'plaque' },
        h('h3', {}, 'Weekly goal'),
        h('p', {}, `Defeat ${fmt(c.weekly.goal)} enemies together this week.`),
        bar(Math.min(1, c.weekly.progress / c.weekly.goal), 'moss'),
        h('small', { class: 'muted' }, `${fmt(c.weekly.progress)} / ${fmt(c.weekly.goal)} · everyone who contributes gets a reward chest.`),
        h('div', { class: 'section-label' }, 'Members'),
        h('div', { class: 'list' }, c.members.map((mbr) => h('div', { class: 'lrow' }, h('span', { class: 'rank' }, mbr.role === 'leader' ? '👑' : '⚔'), h('span', { class: 'who' }, h('b', {}, mbr.name), h('small', {}, `Best wave ${mbr.bestWave || 0} · ${fmt(mbr.weekKills || 0)} kills this week`)), h('span', {})))))));
  }

  async function siege() {
    const s = await app.api.siege();
    app.siege = s;
    body.replaceChildren(h('div', { class: 'plaque' },
      h('h3', {}, `World Siege: ${s.name}`),
      h('p', {}, 'Every commander fights the same colossal foe. Your runs\' kills and boss damage are hurled at it. If it falls before time runs out, every contributor gets a reward chest.'),
      bar(s.hp / s.maxHp, ''),
      h('div', { class: 'row', style: { marginTop: '.4rem' } }, h('span', {}, `${fmt(s.hp)} / ${fmt(s.maxHp)} HP`), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, s.defeated ? 'Defeated! Chests sent.' : `Ends in ${Math.max(0, Math.ceil((s.endsAt - Date.now()) / 3600000))} hours`)),
      h('p', {}, `Your damage: ${fmt(s.yourDamage || 0)}`),
      h('div', { class: 'section-label' }, 'Top contributors'),
      s.top?.length ? h('div', { class: 'list' }, s.top.map((t, i) => h('div', { class: 'lrow' }, h('span', { class: 'rank' + (i < 3 ? ' top' : '') }, i + 1), h('span', { class: 'who' }, h('b', {}, t.name)), h('span', { class: 'val' }, fmt(t.damage))))) : h('div', { class: 'empty' }, 'Be the first to strike.')));
  }

  async function inbox() {
    const r = await app.api.inbox();
    app.inboxCount = r.items.filter((i) => !i.claimed).length; renderTabs();
    const items = r.items.map((it) => h('div', { class: 'lrow' },
      h('span', { class: 'rank' }, it.kind === 'tower' ? '🏰' : it.kind === 'gold' ? '⛁' : it.kind === 'repair' ? '🔨' : it.kind === 'renown' ? '✦' : '🎁'),
      h('span', { class: 'who' }, h('b', {}, it.title), h('small', {}, it.body)),
      it.claimed ? h('span', { class: 'muted' }, 'Claimed') : h('button', { class: 'btn small gold', onclick: async () => {
        try {
          const c = await app.api.claim(it.id);
          if (c.reinforcement) { p.reinforcements = [...(p.reinforcements || []), c.reinforcement].slice(-12); }
          if (c.renown) p.renown += c.renown;
          if (c.title && !p.titles.includes(c.title)) p.titles.push(c.title);
          saveProfile(p); toast('Claimed!'); inbox();
        } catch (e) { toast(e.message); }
      } }, 'Claim')));
    body.replaceChildren(items.length ? h('div', { class: 'list' }, items) : h('div', { class: 'empty' }, 'Nothing here yet. Gifts, clan chests and siege rewards arrive here.'),
      h('p', { class: 'muted' }, 'Claimed gifts become Reinforcements you can bring into your next run from the New run screen.'));
  }

  load();
}
