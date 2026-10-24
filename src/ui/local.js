// Hero Mode and the Daily Siege: the set-up screens for the two modes played from the castle and in 3D.
import { h, fmt } from './dom.js';
import { MAPS, MAP_ORDER } from '../game/maps.js';
import { WEAPONS, ABILITIES, ART_KEYS, TOWERS, DIFFICULTY } from '../data/balance.js';
import { adaptiveStart } from '../meta/adaptive.js';
import { headStartPackage } from '../game/rules.js';
import { saveProfile, unlockedAbilities, unlockedWeapons, isMapUnlocked, loadRun } from '../meta/profile.js';
import { HERO, SIEGE, SIEGE_COST, SIEGE_MAX, siegeSetup, TRIALS } from '../game/modes.js';
import { realmDay, randomSeed } from '../core/rng.js';
import { mapThumb } from './screens.js';
import { endureSlots } from './modes.js';

const back = (app) => h('button', { class: 'btn small ghost', onclick: () => app.showHome(), 'aria-label': 'Back' }, '← Back');

// ---------- Hero Mode ----------
export function heroBestLine(p) {
  const H = p.hero;
  return H?.runs ? `Best wave ${H.wave} · ${fmt(H.kills)} hero kills` : 'New · first person in 3D';
}

export function heroScreen(app) {
  const p = app.profile, screen = document.getElementById('screen');
  const saved = loadRun('hero');
  const pick = p.modePicks?.hero || {};
  const maps = MAP_ORDER.filter((id) => MAPS[id] && !MAPS[id].hidden && id !== 'frontier');
  const st = { map: maps.includes(pick.map) && isMapUnlocked(p, pick.map) ? pick.map : 'meadow', weapon: unlockedWeapons(p).includes(pick.weapon) ? pick.weapon : unlockedWeapons(p).includes(p.weapon) ? p.weapon : 'longbow', loadout: [], diff: pick.diff || 'adaptive' };
  const save = () => { (p.modePicks ||= {}).hero = { map: st.map, weapon: st.weapon, diff: st.diff }; saveProfile(p); };
  const render = () => {
    const keepY = screen.scrollTop, keepX = screen.querySelector('.map-cards')?.scrollLeft || 0, keepD = screen.querySelector('.diff-cards')?.scrollLeft || 0;
    const ownW = unlockedWeapons(p), ownA = unlockedAbilities(p), slots = endureSlots(p);
    const mapCards = maps.map((mid) => {
      const m = MAPS[mid], open = isMapUnlocked(p, mid);
      return h('button', { class: 'plaque map-card' + (st.map === mid ? ' sel' : '') + (open ? '' : ' locked'), disabled: !open, 'aria-pressed': String(st.map === mid), onclick: () => { st.map = mid; save(); render(); } },
        mapThumb(mid, 'preview', 300), h('b', {}, m.name), h('span', { class: 'muted' }, open ? m.desc : '🔒 ' + (m.unlock?.label || 'Locked')));
    });
    const weapons = Object.entries(WEAPONS).filter(([wid]) => ownW.includes(wid)).map(([wid, w]) =>
      h('button', { class: 'opt', 'aria-pressed': String(st.weapon === wid), onclick: () => { st.weapon = wid; save(); render(); } },
        h('span', { class: 'box' }, st.weapon === wid ? '✓' : ''), h('span', {}, h('b', {}, w.name), h('small', {}, w.desc)), h('span', {})));
    const arts = Object.entries(ABILITIES).filter(([aid]) => ownA.has(aid)).map(([aid, A]) => {
      const on = st.loadout.includes(aid);
      return h('button', { class: 'opt', 'aria-pressed': String(on), disabled: !on && st.loadout.length >= slots,
        onclick: () => { st.loadout = on ? st.loadout.filter((x) => x !== aid) : [...st.loadout, aid]; render(); } },
      h('span', { class: 'box' }, on ? '✓' : ''), h('span', {}, h('b', {}, `${A.icon} ${A.name}`), h('small', {}, `${A.desc} Recharge ${A.cd}s.`)), h('span', {}, on ? ART_KEYS[st.loadout.indexOf(aid)] : ''));
    });
    // Where the siege begins: Adaptive tunes itself to your recent Hero runs; the fixed starts are the same as a classic run's.
    const ad = adaptiveStart(p, st.map, 'hero');
    const startOf = (id) => (id === 'adaptive' ? ad.start : (DIFFICULTY.find((d) => d.id === id) || DIFFICULTY[0]).wave);
    const diffCards = [{ id: 'adaptive', name: '🎯 Adaptive', wave: ad.start, desc: ad.why }, ...DIFFICULTY].map((d) =>
      h('button', { class: 'plaque diff-card' + (st.diff === d.id ? ' sel' : ''), 'aria-pressed': String(st.diff === d.id), onclick: () => { st.diff = d.id; save(); render(); } },
        h('b', {}, d.name), h('span', { class: 'diff-wave' }, d.wave === 1 ? 'Wave 1' : 'Wave ' + d.wave), h('small', { class: 'muted' }, d.desc)));
    const sw = startOf(st.diff), pk = headStartPackage(sw);
    const diffNote = sw > 1 ? `Starts on wave ${sw}. Your commander gets the head start (about ${fmt(pk.gold)} gold and ${pk.plots} extra plots) and builds with it at once; head-start waves count at a discount toward your Hero best.` : 'The full climb from wave 1.';
    const go = () => { save(); app.startRun({ mode: 'hero', mapId: st.map, seed: randomSeed(), weapon: st.weapon, loadout: [...st.loadout], modifiers: [], ascension: 0, startWave: sw, adaptive: st.diff === 'adaptive' && sw > 1 }); };
    screen.replaceChildren(h('div', { class: 'screen-inner setup-screen settled' },
      h('div', { class: 'screen-head' }, back(app), h('h2', {}, '🏹 Hero Mode')),
      h('p', { class: 'muted' }, 'You stand on the castle wall in first person. Your commander reads every coming wave and builds, upgrades and repairs the towers for you: flak when the sky fills, ballistas and mages against armor, frost and barracks against runners, heavy guns for bosses. You fight alongside them with your own weapon.'),
      h('ul', { class: 'mode-rules' },
        h('li', {}, 'Drag to look around (Auto-look follows the closest threat when you let go). Hold the 🎯 button to fire at the locked foe, or tap a foe. Aimed castle arts land where you are aiming.'),
        h('li', {}, `Your weapon hits ${Math.round((HERO.weaponMult - 1) * 100)}% harder than in a classic run, and towers ${Math.round((1 - HERO.towerMult) * 100)}% softer, so your aim matters. The commander also spends part of the treasury on your weapon.`),
        h('li', {}, `Waves come by themselves, ${HERO.buildTime} seconds apart. Your Keep upgrades apply. Hero Mode keeps its own records and achievements.`)),
      saved ? h('div', { class: 'plaque trim' }, `A Hero Mode run is saved at wave ${saved.wave}. `, h('button', { class: 'btn small gold', onclick: () => app.resumeRun(saved) }, '▶ Continue')) : null,
      h('h3', {}, 'Battlefield'), h('div', { class: 'map-cards' }, mapCards),
      h('h3', { style: { marginTop: '1.2rem' } }, 'Difficulty'), h('div', { class: 'diff-cards' }, diffCards), h('p', { class: 'muted diff-note' }, diffNote),
      h('h3', { style: { marginTop: '1.2rem' } }, 'Your weapon'), h('div', { class: 'opt-list' }, weapons),
      h('h3', { style: { marginTop: '1.2rem' } }, `Castle arts · ${st.loadout.length}/${slots} slots`),
      h('p', { class: 'muted' }, 'Choose the arts you will use from the wall.'),
      h('div', { class: 'loadout' }, arts),
      h('div', { class: 'setup-foot' }, h('small', { class: 'muted' }, 'Needs 3D (WebGL). Without it the run plays in the classic view.'), h('span', { class: 'spacer' }),
        h('button', { class: 'btn gold big', disabled: !st.loadout.length, onclick: go }, st.loadout.length ? 'To the wall' : 'Choose at least one art'))));
    const rail = screen.querySelector('.map-cards'); if (rail) rail.scrollLeft = keepX;
    const drail = screen.querySelector('.diff-cards'); if (drail) drail.scrollLeft = keepD;
    screen.scrollTop = keepY;
  };
  render();
  screen.scrollTop = 0;
}

// ---------- The Daily Siege ----------
export const siegeToday = () => siegeSetup(realmDay());
export function siegeBestLine(p) {
  const d = p.siege?.days?.[realmDay()];
  return d ? `Today: ${fmt(d.score)} pts${d.win ? ' · held' : ''}` : 'Not tried today · optional';
}
// Days in a row (ending today or yesterday) with a held siege.
export function siegeStreak(p, today = realmDay()) {
  const days = p.siege?.days || {};
  let n = 0;
  const d = new Date(today + 'T12:00:00Z');
  if (!days[today]?.win) d.setUTCDate(d.getUTCDate() - 1);
  for (;;) { const k = d.toISOString().slice(0, 10); if (!days[k]?.win) break; n++; d.setUTCDate(d.getUTCDate() - 1); }
  return n;
}

export function siegeScreen(app) {
  const p = app.profile, screen = document.getElementById('screen');
  const S = siegeToday(), today = p.siege?.days?.[S.day], saved = loadRun('siege');
  const board = h('div', { class: 'list siege-board' }, h('div', { class: 'empty' }, 'Loading today’s board…'));
  const roster = S.roster.map((id) => h('div', { class: 'siege-unit' }, h('b', {}, TOWERS[id].name), h('span', { class: 'chip' }, `${SIEGE_COST[id]} pt${SIEGE_COST[id] === 1 ? '' : 's'}`), h('small', { class: 'muted' }, TOWERS[id].desc)));
  const thumb = mapThumb(S.map, S.seed, 360);
  screen.replaceChildren(h('div', { class: 'screen-inner setup-screen settled' },
    h('div', { class: 'screen-head' }, back(app), h('h2', {}, '🏰 Daily Siege')),
    h('p', { class: 'muted' }, 'A small puzzle for each day, the same for everyone, and entirely optional. It does not touch your other runs.'),
    h('div', { class: 'plaque siege-card' },
      h('div', { class: 'siege-map' }, thumb, h('b', {}, `${MAPS[S.map].name} · ${S.day}`)),
      h('ul', { class: 'mode-rules' },
        h('li', {}, `Spend ${SIEGE.points} supply points on towers from today’s roster. Every tower stands at tier ${SIEGE.tier}; nothing can be upgraded, and there is no gold.`),
        h('li', {}, `Height is the puzzle: towers on hills get ${SIEGE.hillMult}× the usual high-ground bonus to range and damage. The 3D view shows the hills best.`),
        h('li', {}, `Press Start and watch: ${SIEGE.waves} waves roll in one after another, with a boss in the second. No weapon, no castle arts.`),
        h('li', {}, `Score: 100 per wave held. Hold all ${SIEGE.waves} and add up to 500 for the keep, 200 for the wall and 40 for each point you did not spend (best possible ${fmt(SIEGE_MAX)}). Retry as often as you like; your best counts.`))),
    h('h3', {}, 'Today’s roster'), h('div', { class: 'siege-roster' }, roster),
    h('div', { class: 'row', style: { margin: '.8rem 0', gap: '.5rem', flexWrap: 'wrap' } },
      h('span', { class: 'chip' }, today ? `Your best today: ${fmt(today.score)}` : 'Not tried today'),
      siegeStreak(p) ? h('span', { class: 'chip good' }, `🔥 ${siegeStreak(p)}-day streak`) : null,
      p.siege?.wins ? h('span', { class: 'chip' }, `${p.siege.wins} siege${p.siege.wins === 1 ? '' : 's'} held`) : null),
    h('h3', {}, 'Today’s board'), board,
    h('div', { class: 'setup-foot' },
      saved ? h('button', { class: 'btn', onclick: () => app.resumeRun(saved) }, '▶ Continue') : null, h('span', { class: 'spacer' }),
      h('button', { class: 'btn gold big', onclick: () => app.startRun({ mode: 'siege', mapId: S.map, seed: S.seed, modifiers: [], ascension: 0, weapon: p.weapon }) }, today ? 'Try again' : 'Plan the siege'))));
  screen.scrollTop = 0;
  (async () => {
    try {
      if (!(await app.api.health())) throw new Error('offline');
      await app.api.ensureAccount();
      const r = await app.api.leaderboard('siege', 'global', 'week');
      const rows = (r.rows || []).slice(0, 10).map((row, i) => h('div', { class: 'lrow' + (row.id === p.online?.id ? ' me' : '') },
        h('span', { class: 'rank' + (i < 3 ? ' top' : '') }, i < 3 ? ['🥇', '🥈', '🥉'][i] : row.rank || i + 1),
        h('span', { class: 'who' }, row.name), h('span', { class: 'val' }, `${fmt(row.value)} pts`)));
      board.replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, 'No one has held today’s siege yet. Be the first!')]), r.me ? h('div', { class: 'muted' }, `You: #${r.me.rank} · ${fmt(r.me.value)} pts`) : '');
    } catch { board.replaceChildren(h('div', { class: 'empty' }, 'The board needs the game server. Your best is kept on this device.')); }
  })();
}

// ---------- More modes: Boss Rush, Draft, Night Siege, Duo Siege and the Siege Trials ----------
export const EXTRA = {
  bossrush: { icon: '👑', name: 'Boss Rush', short: 'One boss after another', blurb: 'Every fight is a boss (the Warlord, the Titan, the Dragon and on) with a thin escort. Short breaks, a boon after every boss and a heavy purse. How many can you fell? A weekly board ranks bosses felled.', rules: ['Fights come as waves 10, 20, 30…: a boss and a few followers each time.', '14 seconds between fights, a boon after each one, and two and a half times the usual wave gold.', 'Your score is the number of bosses you fell.'] },
  draft: { icon: '🂠', name: 'Draft', short: 'Pick a tower card each wave', blurb: 'Towers come only from cards. Before every wave you draft one of three tower cards; each card builds one tower of that kind, free. Gold goes on upgrades, plots, repairs and troops instead.', rules: ['You start with two cards in hand and draft one more before each wave.', 'A card builds its tower free: the build bar shows how many of each you hold.', 'Offers lean towards what you have least of, so every run plays differently.'] },
  night: { icon: '🌙', name: 'Night Siege', short: 'Towers see only what is lit', blurb: 'Night falls on the field. Towers can only shoot what is lit: the castle, every tower’s torch, and much further around glowing towers (Mage, Tesla, Frost, Obelisk, Sanctum, Void Well and fire traps). Burning foes, foes you have marked with your bow and bosses show themselves. Score ×1.4.', rules: ['Light sets what towers can see: plan glowing towers along the road.', 'Your own shots mark foes, so every tower can see them for a moment.', 'Fire lights foes up: Fire Traps and burning weapons are worth more at night.'] },
  duo: { icon: '🤝', name: 'Duo Siege', short: 'Two players, one device', blurb: 'For two people and one phone or tablet. One of you is the builder between waves; when a wave starts the view jumps to the castle wall for the hero, then back for the builder after it. The game tells you when to pass the device.', rules: ['Between waves (30 seconds): the builder builds, upgrades and trains.', 'During each wave: the hero fights from the wall in first person.', 'A normal economy and your Keep upgrades; Duo keeps its own records.'] },
};

export function extraBestLine(p, id) {
  if (id === 'trials') { const s = Object.values(p.trials || {}); return s.length ? `${s.filter((x) => x >= 1).length}/${TRIALS.length} held · ${s.reduce((a, b) => a + b, 0)}★` : 'New · ten puzzles'; }
  const R = p.local?.[id];
  if (!R?.runs) return 'Not played yet';
  return id === 'bossrush' ? `Best: ${R.best} boss${R.best === 1 ? '' : 'es'} felled` : `Best wave ${R.best}`;
}

export function moreModesScreen(app) {
  const p = app.profile, screen = document.getElementById('screen');
  const card = (id, M, go) => h('div', { class: 'plaque mode-card', 'data-mode': id },
    h('div', { class: 'mode-top' }, h('span', { class: 'mode-ico', 'aria-hidden': 'true' }, M.icon), h('div', {}, h('h3', { style: { margin: 0 } }, M.name), h('small', { class: 'muted' }, M.short))),
    h('p', { class: 'muted', style: { margin: '.4rem 0' } }, M.blurb),
    h('div', { class: 'row' }, h('span', { class: 'chip' }, extraBestLine(p, id)), h('span', { class: 'spacer' }),
      loadRun(id) ? h('button', { class: 'btn small', onclick: () => app.resumeRun(loadRun(id)) }, '▶ Continue') : null,
      h('button', { class: 'btn gold', onclick: go }, 'Play')));
  screen.replaceChildren(h('div', { class: 'screen-inner' },
    h('div', { class: 'screen-head' }, back(app), h('h2', {}, '🎲 More modes')),
    h('p', { class: 'muted' }, 'Five more ways to play. They keep their own records and achievements, feed the Realm like any run, and never touch your classic bests.'),
    ...Object.entries(EXTRA).map(([id, M]) => card(id, M, () => extraSetup(app, id))),
    card('trials', { icon: '🧩', name: 'Siege Trials', short: 'Ten hand-made puzzles', blurb: 'A ladder of puzzles on the Daily Siege rules: a few supply points, a set roster and a set map, then you watch. Earn up to three stars on each; holding a trial opens the next.' }, () => trialsScreen(app))));
  screen.scrollTop = 0;
}

// Set-up for Boss Rush, Draft, Night Siege and Duo: battlefield, weapon and castle arts.
export function extraSetup(app, id) {
  const p = app.profile, screen = document.getElementById('screen'), M = EXTRA[id];
  const pick = p.modePicks?.[id] || {};
  const maps = MAP_ORDER.filter((m) => MAPS[m] && !MAPS[m].hidden && m !== 'frontier');
  const st = { map: maps.includes(pick.map) && isMapUnlocked(p, pick.map) ? pick.map : 'meadow', weapon: unlockedWeapons(p).includes(pick.weapon) ? pick.weapon : unlockedWeapons(p).includes(p.weapon) ? p.weapon : 'longbow', loadout: [] };
  const save = () => { (p.modePicks ||= {})[id] = { map: st.map, weapon: st.weapon }; saveProfile(p); };
  const render = () => {
    const keepY = screen.scrollTop, keepX = screen.querySelector('.map-cards')?.scrollLeft || 0;
    const ownW = unlockedWeapons(p), ownA = unlockedAbilities(p), slots = endureSlots(p);
    const mapCards = maps.map((mid) => {
      const m = MAPS[mid], open = isMapUnlocked(p, mid);
      return h('button', { class: 'plaque map-card' + (st.map === mid ? ' sel' : '') + (open ? '' : ' locked'), disabled: !open, 'aria-pressed': String(st.map === mid), onclick: () => { st.map = mid; save(); render(); } },
        mapThumb(mid, 'preview', 300), h('b', {}, m.name), h('span', { class: 'muted' }, open ? m.desc : '🔒 ' + (m.unlock?.label || 'Locked')));
    });
    const weapons = Object.entries(WEAPONS).filter(([wid]) => ownW.includes(wid)).map(([wid, w]) =>
      h('button', { class: 'opt', 'aria-pressed': String(st.weapon === wid), onclick: () => { st.weapon = wid; save(); render(); } },
        h('span', { class: 'box' }, st.weapon === wid ? '✓' : ''), h('span', {}, h('b', {}, w.name), h('small', {}, w.desc)), h('span', {})));
    const arts = Object.entries(ABILITIES).filter(([aid]) => ownA.has(aid)).map(([aid, A]) => {
      const on = st.loadout.includes(aid);
      return h('button', { class: 'opt', 'aria-pressed': String(on), disabled: !on && st.loadout.length >= slots,
        onclick: () => { st.loadout = on ? st.loadout.filter((x) => x !== aid) : [...st.loadout, aid]; render(); } },
      h('span', { class: 'box' }, on ? '✓' : ''), h('span', {}, h('b', {}, `${A.icon} ${A.name}`), h('small', {}, `${A.desc} Recharge ${A.cd}s.`)), h('span', {}, on ? ART_KEYS[st.loadout.indexOf(aid)] : ''));
    });
    const go = () => { save(); app.startRun({ mode: id, mapId: st.map, seed: randomSeed(), weapon: st.weapon, loadout: [...st.loadout], modifiers: [], ascension: 0 }); };
    screen.replaceChildren(h('div', { class: 'screen-inner setup-screen settled' },
      h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => moreModesScreen(app), 'aria-label': 'Back' }, '← Back'), h('h2', {}, `${M.icon} ${M.name}`)),
      h('p', { class: 'muted' }, M.blurb), h('ul', { class: 'mode-rules' }, M.rules.map((r) => h('li', {}, r))),
      h('h3', {}, 'Battlefield'), h('div', { class: 'map-cards' }, mapCards),
      h('h3', { style: { marginTop: '1.2rem' } }, 'Your weapon'), h('div', { class: 'opt-list' }, weapons),
      h('h3', { style: { marginTop: '1.2rem' } }, `Castle arts · ${st.loadout.length}/${slots} slots`), h('div', { class: 'loadout' }, arts),
      h('div', { class: 'setup-foot' }, h('span', { class: 'spacer' }),
        h('button', { class: 'btn gold big', disabled: !st.loadout.length, onclick: go }, st.loadout.length ? `Start ${M.name}` : 'Choose at least one art'))));
    const rail = screen.querySelector('.map-cards'); if (rail) rail.scrollLeft = keepX;
    screen.scrollTop = keepY;
  };
  render();
  screen.scrollTop = 0;
}

// The Siege Trials ladder.
export function trialsScreen(app) {
  const p = app.profile, screen = document.getElementById('screen'), got = p.trials || {};
  const rows = TRIALS.map((t, i) => {
    const stars = got[t.id] || 0, open = i === 0 || (got[TRIALS[i - 1].id] || 0) >= 1;
    return h('div', { class: 'plaque trial-row' + (open ? '' : ' locked') },
      h('div', { class: 'trial-num' }, String(i + 1)),
      h('div', { class: 'trial-body' }, h('b', {}, t.name), h('small', { class: 'muted' }, `${MAPS[t.map]?.name || t.map} · ${t.points} points · waves ${t.start}–${t.start + t.waves - 1}`),
        h('small', {}, t.roster.map((r) => `${TOWERS[r].name} (${SIEGE_COST[r]})`).join(' · ')), h('small', { class: 'muted' }, '💡 ' + t.tip)),
      h('div', { class: 'trial-side' }, h('span', { class: 'stars', 'aria-label': `${stars} of 3 stars` }, '★'.repeat(stars) + '☆'.repeat(3 - stars)),
        h('button', { class: 'btn small gold', disabled: !open, onclick: () => app.startRun({ mode: 'trials', trial: t.id, mapId: t.map, seed: 'trial-' + t.id, modifiers: [], ascension: 0, weapon: p.weapon }) }, open ? (stars ? 'Replay' : 'Play') : '🔒')));
  });
  screen.replaceChildren(h('div', { class: 'screen-inner' },
    h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => moreModesScreen(app), 'aria-label': 'Back' }, '← Back'), h('h2', {}, '🧩 Siege Trials')),
    h('p', { class: 'muted' }, `The Daily Siege rules on hand-made boards: spend the supply points, press Start and watch. ★ hold every wave · ★★ keep at least 60% of the keep · ★★★ keep 90% and half the wall. Holding a trial opens the next.`),
    ...rows));
  screen.scrollTop = 0;
}
