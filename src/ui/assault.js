// Assault and the Daily Raid on screen: the set-up page, the battle (HUD, deploy cards, field orders, input) and the
// renderer that draws the horde's war camp and your siege engines. The classic 2D renderer draws everything else.
import { h, fmt, clockText, toast, modal, bar, kbd } from './dom.js';
import { Renderer, drawIcon } from '../game/render.js';
import { FX, KILL_FX } from '../game/fx.js';
import { audio } from '../game/audio.js';
import { INK, TAU, roundRect } from '../game/draw-util.js';
import { MAPS } from '../game/maps.js';
import { TOWERS, GAME, BOONS } from '../data/balance.js';
import { AssaultGame, AUNITS, AUNIT_ORDER, ORDERS, ORDER_IDS, ASSAULT, RAID, RAID_MAX, BLITZ, BLITZ_MAX, CONQUEST, raidSetup, blitzSetup, conquestSetup, conquestTarget, assaultPerks, cleanOrders, isAssaultMode } from '../game/assault.js';
import { realmDay, randomSeed, seasonKey } from '../core/rng.js';
import { checkpointRun, saveProfile } from '../meta/profile.js';
import { ENEMIES } from '../data/balance.js';
import { fillText } from '../meta/quests.js';
import { buzz } from './haptics.js';
import { mapThumb } from './screens.js';
import { Renderer3D, loadThree } from '../game/render3d.js';
import { WarriorControls, wireWarrior } from './warrior.js';
import { WARLORD } from '../game/assault.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
// The command layer's quick selections (chips above the cards) and its three standing orders.
const GROUPS = [
  { id: 'all', icon: '⬚', name: 'All', test: () => true },
  { id: 'foot', icon: '🛡', name: 'Foot', test: (u) => !u.engine && ['footman', 'knight', 'sapper', 'drummer', 'surgeon'].includes(u.id) },
  { id: 'bows', icon: '🏹', name: 'Bows', test: (u) => u.id === 'archer' },
  { id: 'horse', icon: '🐎', name: 'Horse', test: (u) => u.id === 'cavalry' },
  { id: 'siege', icon: '🪵', name: 'Siege', test: (u) => !!u.engine },
];
const STANDING = [
  { id: 'advance', icon: '▶', name: 'March', key: 'G', blurb: 'Back to the road and on to the camp' },
  { id: 'hold', icon: '✋', name: 'Hold', key: 'H', blurb: 'Stop where you stand and fight what comes' },
  { id: 'retreat', icon: '↩', name: 'Back', key: 'B', blurb: 'Fall back to guard the keep against raiders' },
];
const ORDER_KEYS = ['Q', 'W', 'E'];

export const ASSAULT_INFO = {
  assault: {
    icon: '🚩', name: 'Assault', short: 'Storm camp after camp',
    blurb: 'The war turned around. March out of your keep with troops and siege engines, smash the emplacements along the road and break the horde’s war camp. Then do it again on new ground, against stronger walls. Raiders come down the road at your keep the whole time.',
    rules: ['Supply trickles in every second; razing an emplacement pays more. Spend it on troops and siege engines: they march out and fight on their own.', 'Rams and Siege Towers break the gate, Mantlets shield the column, Bombards and Catapults out-shoot emplacements, Sappers blow them up. Tap an emplacement to have your army focus it.', 'The gate pours boiling oil on whatever hammers it: send help with your rams. Take the camp to move on; your keep falls if too many raiders get through.', 'Every stronghold you take, in any attack mode, adds to your War Record and opens new units and orders.'],
  },
  conquest: {
    icon: '🗺', name: 'Frontier Conquest', short: 'Take the Realm’s next province',
    blurb: 'Lead the Realm’s army against the province it wants next. Three war camps hold the land, defended by its native foe and the emplacements its people favor. Break all three to liberate it.',
    rules: [`Kills here count ${CONQUEST.rallyMult}× toward today’s Daily Rally, like a March: a won Rally moves the border one province on.`, 'Strongholds and emplacements still count for the Weekly Muster and the Monthly Campaign, and a full conquest is announced in the Realm’s chronicle.', 'The land shapes the fight: its battlefield, its weather, its foe and its kind of defences.'],
  },
  raid: {
    icon: '⚡', name: 'Daily Raid', short: 'One camp, against the clock',
    blurb: 'One fortified war camp, the same for every player today. Break it as fast as you can, before the five minutes run out or your keep falls.',
    rules: [`${RAID.limit / 60} minutes on the clock and a heavier purse to start. Every unit your War Record has opened is in the column.`, `Score: 1,000 for taking the camp, 5 for every second left and up to 500 for your keep (best possible ${fmt(RAID_MAX)}). Fall short and you still score for the damage done.`, 'A fresh camp every day. Retry as often as you like; your best counts, and a daily board ranks it.'],
  },
  warlord: {
    icon: '🏴', name: 'Warlord', short: 'Command your army, hold the land',
    blurb: 'The attack as a real-time strategy game. Select your soldiers and send them anywhere on the field: seize supply posts for income, hold the crossings, pick off emplacements, fall back to guard the keep. The horde sends warbands off the road to take the posts back.',
    rules: ['Select: tap a soldier for its squad, drag a box round a group, or use the chips above the cards. Then tap the field to move there, or an emplacement, a foe or the gate to attack it. March, Hold and Fall back work on the selection (or everyone).', `${WARLORD.posts} supply posts on every field: stand on one with no foe there to take it. Each post you hold pays ${WARLORD.income} supply a second; each post the horde holds sends extra raiders down the road.`, `Warbands leave the road to retake your posts and stand guard on them. Your army can be ${WARLORD.maxUnits} strong.`, 'Break the camp to march on to the next, on new ground. Everything counts for the Realm and your War Record.'],
  },
  warassault: {
    icon: '⚔', name: 'Warrior: Storm the camps', short: 'On foot with the column',
    blurb: 'March with the column as a warrior on foot, in 3D. Your captain sends the troops and engines and uses the field orders; you cut down raiders and defenders, smash emplacements and help break the gate.',
    rules: ['More of the horde turns out against a warrior on the field.', 'Fall and you rise again at your keep a few seconds later; the run ends if the keep falls.', 'Strongholds count for your War Record like any attack.'],
  },
  blitz: {
    icon: '⏱', name: 'Blitz', short: 'Three camps, one clock',
    blurb: 'Three war camps back to back, the same three for everyone all week, and the clock never stops. Survivors carry on to the next camp, so a clean win is a fast win.',
    rules: ['The camps start a little stronger than an Assault’s first and grow with each one.', `Score: 5,000 for taking all three, plus 10 for every second under ten minutes (best possible ${fmt(BLITZ_MAX)}). Short of that, camps and razes score.`, 'A new set of three every week.'],
  },
};

// Your War Record: strongholds taken over all your attack runs. It opens the column.
export const careerOf = (p) => p.warRecord?.taken || 0;
const heldOf = (app) => app.realm?.map?.held ?? app.profile.realmMap?.held ?? 0;

export function assaultBestLine(p, id) {
  if (id === 'raid') {
    const d = p.raid?.days?.[realmDay()];
    return d ? `Today: ${fmt(d.score)}${d.win ? ' · taken' : ''}` : 'Not tried today';
  }
  if (id === 'blitz') { const b = p.blitz?.[seasonKey()]; return b ? (b.win ? `This week: ${clockText(b.clock)}` : `This week: ${fmt(b.score)} pts`) : 'Not tried this week'; }
  if (id === 'conquest') { const n = Object.values(p.conquests || {}).filter((c) => c.won).length; return n ? `${n} province${n === 1 ? '' : 's'} stormed` : 'New · march for the Realm'; }
  if (id === 'warlord') { const W = p.local?.warlord; return W?.runs ? `Best: ${W.best} stronghold${W.best === 1 ? '' : 's'} · ${fmt(W.posts || 0)} posts taken` : 'New · real-time command'; }
  const R = p.local?.assault;
  return R?.runs ? `Best: ${R.best} stronghold${R.best === 1 ? '' : 's'} · War Record ${careerOf(p)}` : 'New · go on the attack';
}

// ---------- set-up page ----------
export function assaultScreen(app, id = 'assault') {
  const p = app.profile, screen = document.getElementById('screen'), M = ASSAULT_INFO[id];
  const career = careerOf(p), held = heldOf(app);
  const pick = (p.modePicks ||= {}).attack ||= {};
  const st = { orders: cleanOrders(pick.orders, career) };
  const R = id === 'raid' ? raidSetup(realmDay()) : null;
  const B = id === 'blitz' ? blitzSetup(seasonKey()) : null;
  const C = id === 'conquest' ? conquestSetup(conquestTarget(held)) : null;
  const perks = assaultPerks(held);
  const render = () => {
    const keepY = screen.scrollTop;
    const roster = AUNIT_ORDER.map((uid) => {
      const U = AUNITS[uid], open = U.unlock <= career;
      return h('div', { class: 'as-unit' + (open ? '' : ' locked'), title: U.blurb },
        unitIcon(uid, 40), h('div', {}, h('b', {}, `${U.name}${open ? ` · ${U.cost}` : ''}`), h('small', { class: 'muted' }, open ? U.blurb : `🔒 Opens at War Record ${U.unlock} (you: ${career})`)));
    });
    const orders = ORDER_IDS.map((oid) => {
      const O = ORDERS[oid], open = O.unlock <= career, on = st.orders.includes(oid);
      return h('button', { class: 'opt', 'aria-pressed': String(on), disabled: !open || (!on && st.orders.length >= ASSAULT.orderSlots),
        onclick: () => { st.orders = on ? st.orders.filter((x) => x !== oid) : [...st.orders, oid]; pick.orders = st.orders; saveProfile(p); render(); } },
      h('span', { class: 'box' }, on ? '✓' : ''), h('span', {}, h('b', {}, `${O.icon} ${O.name}`), h('small', {}, open ? `${O.blurb} Recharges in ${O.cd}s.` : `🔒 Opens at War Record ${O.unlock}`)), h('span', {}));
    });
    const target = C ? h('div', { class: 'plaque siege-card' }, h('div', { class: 'siege-map' }, mapThumb(C.maps[0], 'conquest', 300), h('b', {}, `${C.name} · ${C.land}`)),
      h('ul', { class: 'mode-rules' }, h('li', {}, `Defended by ${ENEMIES[C.foe]?.name || C.foe} warbands and the emplacements of the ${C.land}. Camps: ${C.maps.map((m) => MAPS[m].name).join(', ')}.`),
        ...M.rules.map((r) => h('li', {}, r)), p.conquests?.[C.province]?.won ? h('li', {}, '✔ You have stormed this province before. Storm it again: the Rally still counts.') : null)) : null;
    const camp = R ? h('div', { class: 'plaque siege-card' }, h('div', { class: 'siege-map' }, mapThumb(R.map, R.seed, 300), h('b', {}, `${MAPS[R.map].name} · ${R.day}`)), h('ul', { class: 'mode-rules' }, M.rules.map((r) => h('li', {}, r))))
      : B ? h('div', { class: 'plaque siege-card' }, h('div', { class: 'siege-map' }, mapThumb(B.maps[0], B.seed, 300), h('b', {}, `This week: ${B.maps.map((m) => MAPS[m].name).join(' → ')}`)), h('ul', { class: 'mode-rules' }, M.rules.map((r) => h('li', {}, r)))) : null;
    const start = () => {
      const base = { career, held, orders: [...st.orders] };
      app.startRun(R ? { ...base, mode: 'raid', seed: R.seed, mapId: R.map } : B ? { ...base, mode: 'blitz', seed: B.seed, mapId: B.maps[0] } : C ? { ...base, mode: 'conquest', seed: `conquest-${C.province}-${randomSeed()}`, province: C.province, mapId: C.maps[0] } : { ...base, mode: id === 'warlord' ? 'warlord' : 'assault', seed: randomSeed(), mapId: 'auto' });
    };
    screen.replaceChildren(h('div', { class: 'screen-inner setup-screen settled' },
      h('div', { class: 'screen-head' }, h('button', { class: 'btn small ghost', onclick: () => app.showHome(), 'aria-label': 'Back' }, '← Back'), h('h2', {}, `${M.icon} ${M.name}`)),
      h('p', { class: 'muted' }, M.blurb),
      target || camp || h('ul', { class: 'mode-rules' }, M.rules.map((r) => h('li', {}, r))),
      h('div', { class: 'row', style: { margin: '.6rem 0', gap: '.5rem', flexWrap: 'wrap' } }, h('span', { class: 'chip' }, assaultBestLine(p, id)), h('span', { class: 'chip' }, `🎖 War Record ${career}`), h('span', { class: 'chip good' }, 'Feeds the Realm')),
      perks.list.length ? h('div', { class: 'plaque as-perks' }, h('b', {}, `🗺 Gifts from the Realm’s ${Math.max(0, (held || 3) - 1)} provinces`), h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '.35rem', marginTop: '.3rem' } }, perks.list.map((x) => h('span', { class: 'chip', title: `${x.count} province${x.count === 1 ? '' : 's'} of the ${x.land}` }, `${x.land}: ${x.text}`))), h('small', { class: 'muted' }, 'Every province the Realm holds lends its land’s strength to the march.')) : null,
      h('h3', {}, 'Your column'), h('div', { class: 'as-roster' }, roster),
      h('h3', {}, `Field orders · ${st.orders.length}/${ASSAULT.orderSlots}`), h('div', { class: 'opt-list' }, orders),
      h('div', { class: 'setup-foot' }, h('span', { class: 'spacer' }), h('button', { class: 'btn gold big', disabled: !st.orders.length, onclick: start }, id === 'raid' ? (p.raid?.days?.[realmDay()] ? 'Raid again' : 'Start the raid') : id === 'conquest' ? `March on ${C.name}` : id === 'blitz' ? 'Start the clock' : id === 'warlord' ? 'Take command' : 'March out'))));
    screen.scrollTop = keepY;
  };
  render();
  screen.scrollTop = 0;
}

// ---------- art ----------
const iconCache = {};
export function unitIcon(id, size = 38) {
  const key = id + size;
  if (!iconCache[key]) {
    const cv = document.createElement('canvas');
    const U = AUNITS[id];
    if (U.engine) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = size * dpr; cv.height = size * dpr;
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const tall = id === 'tower';
      ctx.translate(size * 0.5, size * (tall ? 0.92 : 0.72));
      drawEngine(ctx, size * (tall ? 0.78 : 1.05), id, { face: 1, t: 1, swing: 0, ph: 0 });
    } else {
      drawIcon(cv, 'troop', U.look, { size });
      if (id === 'drummer') { const ctx = cv.getContext('2d'); const dpr = cv.width / size; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawDrum(ctx, size * 0.62, size * 0.66, size * 0.5); }
    }
    iconCache[key] = cv.toDataURL();
  }
  return h('img', { class: 'gar-ico', src: iconCache[key], width: size, height: size, alt: '' });
}

// A war drum on a strap, drawn over a figure (x,y = the drum's middle, ts = the figure's tile size).
function drawDrum(ctx, x, y, ts, beat = 0) {
  ctx.save(); ctx.translate(x, y);
  ctx.lineWidth = Math.max(1, ts * 0.04); ctx.strokeStyle = INK;
  ctx.fillStyle = '#a8323a'; ctx.beginPath(); ctx.ellipse(0, 0, ts * 0.2, ts * 0.15, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#efe6d0'; ctx.beginPath(); ctx.ellipse(0, -ts * 0.06, ts * 0.2, ts * 0.07, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#f2b33d'; ctx.lineWidth = ts * 0.025; ctx.beginPath(); ctx.moveTo(-ts * 0.16, 0.02 * ts); ctx.lineTo(-ts * 0.05, ts * 0.12); ctx.lineTo(ts * 0.06, 0.02 * ts); ctx.lineTo(ts * 0.16, ts * 0.11); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.04;
  const lift = Math.sin(beat * Math.PI) * ts * 0.12;
  ctx.beginPath(); ctx.moveTo(ts * 0.05, -ts * 0.08 - lift); ctx.lineTo(ts * 0.22, -ts * 0.28 - lift); ctx.stroke();
  ctx.restore();
}

// Siege engines, drawn in their own space with (0,0) on the ground under the middle. face 1 = rolling right.
function drawEngine(ctx, ts, id, st) {
  ctx.save();
  ctx.scale(st.face || 1, 1);
  ctx.lineWidth = Math.max(1.2, ts * 0.03); ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  const wood = '#8a6a44', dark = '#5a4634', iron = '#4a4f5c';
  const roll = (st.ph || 0) * 0.8;
  const wheel = (x, r) => {
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x, -r, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#c9a77a'; ctx.lineWidth = ts * 0.018;
    for (let i = 0; i < 3; i++) { const a = roll + (i * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.8, -r + Math.sin(a) * r * 0.8); ctx.lineTo(x - Math.cos(a) * r * 0.8, -r - Math.sin(a) * r * 0.8); ctx.stroke(); }
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, ts * 0.03);
  };
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0, ts * 0.02, ts * 0.36, ts * 0.08, 0, 0, TAU); ctx.fill();
  if (id === 'ram') {
    // a roofed shed on four wheels with an iron-capped log swinging inside
    const sw = Math.sin((st.swing || 0) * Math.PI) * ts * 0.12;
    ctx.fillStyle = '#6b5032'; roundRect(ctx, -ts * 0.08 + sw, -ts * 0.24, ts * 0.5, ts * 0.1, ts * 0.04); ctx.fill(); ctx.stroke();
    ctx.fillStyle = iron; roundRect(ctx, ts * 0.34 + sw, -ts * 0.26, ts * 0.1, ts * 0.14, ts * 0.03); ctx.fill(); ctx.stroke();
    ctx.fillStyle = wood; roundRect(ctx, -ts * 0.34, -ts * 0.3, ts * 0.62, ts * 0.18, ts * 0.04); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a8323a'; ctx.beginPath(); ctx.moveTo(-ts * 0.4, -ts * 0.3); ctx.lineTo(-ts * 0.05, -ts * 0.56); ctx.lineTo(ts * 0.34, -ts * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(30,36,51,0.4)'; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-ts * 0.4 + i * ts * 0.18, -ts * 0.3); ctx.lineTo(-ts * 0.05 + (i - 2) * ts * 0.05, -ts * 0.52); ctx.stroke(); }
    ctx.strokeStyle = INK;
    wheel(-ts * 0.24, ts * 0.075); wheel(ts * 0.16, ts * 0.075);
  } else if (id === 'bombard') {
    const kick = (st.swing || 0) * ts * 0.06;
    ctx.fillStyle = dark; roundRect(ctx, -ts * 0.3, -ts * 0.16, ts * 0.46, ts * 0.08, ts * 0.03); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(-ts * 0.02 - kick, -ts * 0.2); ctx.rotate(-0.32);
    ctx.fillStyle = '#3b3d45'; roundRect(ctx, -ts * 0.16, -ts * 0.08, ts * 0.5, ts * 0.16, ts * 0.06); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c9a24a'; ctx.fillRect(ts * 0.02, -ts * 0.085, ts * 0.04, ts * 0.17); ctx.fillRect(ts * 0.22, -ts * 0.085, ts * 0.04, ts * 0.17);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ts * 0.34, 0, ts * 0.05, 0, TAU); ctx.fill();
    ctx.restore();
    if ((st.swing || 0) > 0.6) { ctx.fillStyle = `rgba(255,200,90,${st.swing})`; ctx.beginPath(); ctx.arc(ts * 0.36, -ts * 0.34, ts * 0.09 * st.swing, 0, TAU); ctx.fill(); }
    wheel(-ts * 0.04, ts * 0.12);
  } else if (id === 'mantlet') {
    // a tall plank shield on two wheels, propped from behind
    ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-ts * 0.2, -ts * 0.05); ctx.lineTo(ts * 0.02, -ts * 0.5); ctx.lineTo(ts * 0.06, -ts * 0.48); ctx.lineTo(-ts * 0.14, -ts * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = wood; roundRect(ctx, ts * 0.04, -ts * 0.72, ts * 0.14, ts * 0.7, ts * 0.04); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(30,36,51,0.45)'; for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(ts * 0.04, -ts * 0.72 + i * ts * 0.14); ctx.lineTo(ts * 0.18, -ts * 0.72 + i * ts * 0.14); ctx.stroke(); }
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#a8323a'; ctx.beginPath(); ctx.moveTo(ts * 0.11, -ts * 0.55); ctx.lineTo(ts * 0.17, -ts * 0.45); ctx.lineTo(ts * 0.11, -ts * 0.35); ctx.lineTo(ts * 0.05, -ts * 0.45); ctx.closePath(); ctx.fill();
    for (const ax of [-0.02, 0.24]) { ctx.fillStyle = '#b8bcc6'; ctx.beginPath(); ctx.moveTo(ax * ts, -ts * 0.74); ctx.lineTo(ax * ts + ts * 0.03, -ts * 0.82); ctx.lineTo(ax * ts + ts * 0.06, -ts * 0.74); ctx.fill(); }
    wheel(-ts * 0.18, ts * 0.07); wheel(ts * 0.12, ts * 0.07);
  } else if (id === 'tower') {
    // a tall timber tower with hide panels, a drawbridge on top and a crew peeking out
    const W = ts * 0.32, H = ts * 1.25;
    ctx.fillStyle = '#6b5032'; roundRect(ctx, -W, -H, W * 2, H - ts * 0.1, ts * 0.04); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9a7a52'; for (let i = 0; i < 3; i++) { roundRect(ctx, -W + ts * 0.04, -H + ts * 0.08 + i * ts * 0.38, W * 2 - ts * 0.08, ts * 0.3, ts * 0.03); ctx.fill(); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(30,36,51,0.4)'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-W + ts * 0.04, -H + ts * 0.08 + i * ts * 0.38); ctx.lineTo(W - ts * 0.04, -H + ts * 0.38 + i * ts * 0.38); ctx.stroke(); }
    ctx.strokeStyle = INK;
    const drop = Math.min(1, st.docked ? 1 : 0) * 1.2;
    ctx.save(); ctx.translate(W, -H + ts * 0.05); ctx.rotate(-Math.PI / 2 + drop);
    ctx.fillStyle = wood; roundRect(ctx, 0, -ts * 0.05, ts * 0.42, ts * 0.1, ts * 0.03); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = '#f1c9a0'; for (const hx of [-0.14, 0.06]) { ctx.beginPath(); ctx.arc(hx * ts, -H - ts * 0.04, ts * 0.06, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#9aa1b0'; for (const hx of [-0.14, 0.06]) { ctx.beginPath(); ctx.arc(hx * ts, -H - ts * 0.07, ts * 0.06, Math.PI, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-W * 0.7, -H); ctx.lineTo(-W * 0.7, -H - ts * 0.35); ctx.stroke();
    ctx.fillStyle = '#3d7bd9'; ctx.beginPath(); ctx.moveTo(-W * 0.7, -H - ts * 0.35); ctx.lineTo(-W * 0.7 + ts * 0.22, -H - ts * 0.29); ctx.lineTo(-W * 0.7, -H - ts * 0.23); ctx.closePath(); ctx.fill(); ctx.stroke();
    wheel(-ts * 0.22, ts * 0.09); wheel(ts * 0.18, ts * 0.09);
  } else if (id === 'catapult') {
    ctx.fillStyle = wood; roundRect(ctx, -ts * 0.34, -ts * 0.2, ts * 0.62, ts * 0.09, ts * 0.03); ctx.fill(); ctx.stroke();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-ts * 0.12, -ts * 0.2); ctx.lineTo(-ts * 0.04, -ts * 0.42); ctx.lineTo(ts * 0.04, -ts * 0.42); ctx.lineTo(ts * 0.12, -ts * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    const arm = -2.3 + Math.sin(Math.min(1, st.swing || 0) * Math.PI * 0.5) * 1.6;
    ctx.save(); ctx.translate(0, -ts * 0.4); ctx.rotate(arm + Math.PI);
    ctx.fillStyle = '#9a6a3c'; roundRect(ctx, -ts * 0.04, -ts * 0.025, ts * 0.46, ts * 0.05, ts * 0.02); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7b6a4f'; ctx.beginPath(); ctx.arc(ts * 0.44, 0, ts * 0.06, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
    wheel(-ts * 0.24, ts * 0.075); wheel(ts * 0.18, ts * 0.075);
  }
  ctx.restore();
}

// The classic renderer with the horde's camp at the far end of the road and siege engines in the column.
class AssaultRenderer extends Renderer {
  drawPlots(game) {
    const ctx = this.ctx, ts = this.ts;
    // the road you are sending troops down glows faintly (only when there is more than one)
    if (game.lanes && game.lanes.length > 1 && game.lane >= 0) {
      const L = game.lanes[game.lane].pts;
      ctx.save(); ctx.strokeStyle = 'rgba(255,214,102,0.28)'; ctx.lineWidth = ts * 0.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(L[0].x * ts, L[0].y * ts); for (const p of L) ctx.lineTo(p.x * ts, p.y * ts); ctx.stroke(); ctx.restore();
    }
    for (const m of game.engines || []) if (!m.dead && m.def.cover) {
      ctx.fillStyle = 'rgba(160,200,255,0.10)'; ctx.strokeStyle = 'rgba(160,200,255,0.35)'; ctx.lineWidth = ts * 0.025;
      ctx.beginPath(); ctx.arc(m.x * ts, m.y * ts, m.def.cover * ts, 0, TAU); ctx.fill(); ctx.stroke();
    }
    // Warlord: the supply posts, their banners and how far each capture has gone
    for (const P of game.posts || []) this.drawPost(P);
    // the command layer: rings under the units you have selected, a box while you drag one, and where your last orders went
    if (this.sel && this.sel.size) {
      ctx.save(); ctx.strokeStyle = 'rgba(120,230,140,0.95)'; ctx.lineWidth = ts * 0.045;
      for (const u of this.sel) if (!u.dead) { ctx.beginPath(); ctx.ellipse(u.x * ts, (u.y + 0.1) * ts, ts * (u.engine ? 0.34 : 0.22), ts * (u.engine ? 0.15 : 0.1), 0, 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
    if (this.box) {
      const b = this.box, x = Math.min(b.x0, b.x1) * ts, y = Math.min(b.y0, b.y1) * ts, w = Math.abs(b.x1 - b.x0) * ts, hh = Math.abs(b.y1 - b.y0) * ts;
      ctx.save(); ctx.fillStyle = 'rgba(120,230,140,0.12)'; ctx.strokeStyle = 'rgba(120,230,140,0.9)'; ctx.lineWidth = Math.max(1.5, ts * 0.03); ctx.setLineDash([ts * 0.12, ts * 0.08]);
      ctx.fillRect(x, y, w, hh); ctx.strokeRect(x, y, w, hh); ctx.restore();
    }
    for (const m of this.marks || []) {
      const k = Math.max(0, m.t / m.max), x = m.x * ts, y = m.y * ts;
      ctx.save(); ctx.globalAlpha = k;
      ctx.strokeStyle = m.kind === 'attack' ? '#ff6a4a' : m.kind === 'retreat' ? '#9fd8ff' : '#7fe08a'; ctx.lineWidth = ts * 0.05;
      ctx.beginPath(); ctx.ellipse(x, y, ts * 0.32 * (1.4 - k * 0.4), ts * 0.16 * (1.4 - k * 0.4), 0, 0, TAU); ctx.stroke();
      if (m.kind !== 'attack') { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - ts * 0.5); ctx.stroke(); ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(x, y - ts * 0.5); ctx.lineTo(x + ts * 0.24, y - ts * 0.42); ctx.lineTo(x, y - ts * 0.34); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      m.t -= this.dt;
    }
    if (this.marks) this.marks = this.marks.filter((m) => m.t > 0);
    const f = game.focus;
    if (f && !f.ruined) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
      ctx.strokeStyle = `rgba(255,90,60,${0.6 + 0.4 * pulse})`; ctx.lineWidth = ts * 0.06; ctx.setLineDash([ts * 0.14, ts * 0.08]);
      ctx.beginPath(); ctx.ellipse(f.cx * ts, (f.cy + 0.15) * ts, ts * 0.55, ts * 0.28, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    this.drawAim();
  }

  // A supply post: a stone ring with a banner in the colours of whoever holds it, and the capture going round the ring.
  drawPost(P) {
    const ctx = this.ctx, ts = this.ts, x = P.x * ts, y = P.y * ts;
    const col = P.owner === 'you' ? '#3d7bd9' : P.owner === 'horde' ? '#b8233a' : '#9a9384';
    ctx.save(); ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(x, y + ts * 0.12, ts * 0.5, ts * 0.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8f8676'; ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.035; ctx.beginPath(); ctx.ellipse(x, y, ts * 0.42, ts * 0.21, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b5ab96'; ctx.beginPath(); ctx.ellipse(x, y - ts * 0.02, ts * 0.28, ts * 0.13, 0, 0, TAU); ctx.fill();
    // crates of supply
    ctx.fillStyle = '#9a6a3c'; roundRect(ctx, x + ts * 0.12, y - ts * 0.2, ts * 0.18, ts * 0.16, ts * 0.02); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b07a46'; roundRect(ctx, x + ts * 0.2, y - ts * 0.34, ts * 0.14, ts * 0.13, ts * 0.02); ctx.fill(); ctx.stroke();
    // the banner
    const wv = Math.sin(this.time * 4 + P.id) * ts * 0.04;
    ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.04; ctx.beginPath(); ctx.moveTo(x - ts * 0.08, y); ctx.lineTo(x - ts * 0.08, y - ts * 0.95); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - ts * 0.08, y - ts * 0.95); ctx.lineTo(x + ts * 0.32, y - ts * 0.86 + wv); ctx.lineTo(x - ts * 0.08, y - ts * 0.72); ctx.closePath(); ctx.fill(); ctx.stroke();
    // capture progress round the ring: blue towards you, red towards the horde
    if (Math.abs(P.prog) < 0.999 || P.contested) {
      ctx.strokeStyle = P.prog >= 0 ? '#5aa0f0' : '#e04a4a'; ctx.lineWidth = ts * 0.07;
      ctx.beginPath(); ctx.ellipse(x, y, ts * 0.48, ts * 0.24, 0, -Math.PI / 2, -Math.PI / 2 + TAU * Math.abs(P.prog), P.prog < 0); ctx.stroke();
    }
    if (P.contested && Math.floor(this.time * 4) % 2) { ctx.fillStyle = '#ffd666'; ctx.font = `800 ${Math.max(9, ts * 0.22)}px "Baloo 2", system-ui`; ctx.textAlign = 'center'; ctx.fillText('⚔', x, y - ts * 1.05); }
    ctx.restore();
  }

  // The war camp: a spiked palisade with a gatehouse at every road's start, red banners and the camp's health.
  drawPortals(game) {
    const ctx = this.ctx, ts = this.ts, F = game.fortress, T = this.time;
    if (!F) return;
    const dmg = 1 - F.hp / F.maxHp, fallen = F.hp <= 0;
    for (const [gi, gt] of game.gates.entries()) {
      // push the gatehouse a little inside the board so it is never cut off at the edge
      const m = game.map, inX = gt.x < 1 ? 0.25 : gt.x > m.cols - 1 ? -0.25 : 0, inY = gt.y < 1 ? 0.25 : gt.y > m.rows - 1 ? -0.25 : 0;
      const x = (gt.x + inX) * ts, y = (gt.y + inY) * ts, s = ts;
      ctx.save(); ctx.translate(x, y);
      if (F.flash > 0) ctx.translate((Math.random() - 0.5) * ts * 0.05, 0);
      ctx.lineWidth = ts * 0.04; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, s * 0.3, s * 0.85, s * 0.22, 0, 0, TAU); ctx.fill();
      // stakes
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        const sx = i * s * 0.2, top = fallen && (i + gi) % 2 ? -s * 0.2 : -s * (0.62 + 0.06 * ((i + 3) % 2));
        ctx.fillStyle = fallen ? '#4a3a2a' : '#6b4a2a'; ctx.beginPath(); ctx.moveTo(sx - s * 0.08, s * 0.22); ctx.lineTo(sx - s * 0.08, top + s * 0.08); ctx.lineTo(sx, top); ctx.lineTo(sx + s * 0.08, top + s * 0.08); ctx.lineTo(sx + s * 0.08, s * 0.22); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // gatehouse
      ctx.fillStyle = fallen ? '#3a3030' : '#5a3a2a'; roundRect(ctx, -s * 0.24, -s * 0.85, s * 0.48, s * 1.07, s * 0.05); ctx.fill(); ctx.stroke();
      ctx.fillStyle = fallen ? '#222' : '#2a1a14'; ctx.beginPath(); ctx.moveTo(-s * 0.13, s * 0.22); ctx.lineTo(-s * 0.13, -s * 0.2); ctx.quadraticCurveTo(0, -s * 0.36, s * 0.13, -s * 0.2); ctx.lineTo(s * 0.13, s * 0.22); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (!fallen) {
        ctx.fillStyle = '#4a4f5c'; for (let k = -1; k <= 1; k++) ctx.fillRect(k * s * 0.07 - s * 0.012, -s * 0.24, s * 0.024, s * 0.44);
        // skull-and-horns crest and the banner
        ctx.fillStyle = '#efe6d0'; ctx.beginPath(); ctx.arc(0, -s * 0.6, s * 0.08, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-s * 0.03, -s * 0.61, s * 0.018, 0, TAU); ctx.arc(s * 0.03, -s * 0.61, s * 0.018, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#efe6d0'; ctx.lineWidth = ts * 0.035; ctx.beginPath(); ctx.arc(-s * 0.12, -s * 0.66, s * 0.07, 0.2, 1.8); ctx.arc(s * 0.12, -s * 0.66, s * 0.07, 1.3, 2.9); ctx.stroke();
        ctx.strokeStyle = INK; ctx.lineWidth = ts * 0.04;
        const wv = Math.sin(T * 4 + gi) * s * 0.04;
        ctx.beginPath(); ctx.moveTo(s * 0.2, -s * 0.85); ctx.lineTo(s * 0.2, -s * 1.25); ctx.stroke();
        ctx.fillStyle = '#b8233a'; ctx.beginPath(); ctx.moveTo(s * 0.2, -s * 1.25); ctx.lineTo(s * 0.5, -s * 1.18 + wv); ctx.lineTo(s * 0.2, -s * 1.08); ctx.closePath(); ctx.fill(); ctx.stroke();
        // torches
        for (const tx of [-0.3, 0.3]) { const fl = 0.6 + 0.4 * Math.sin(T * 11 + tx * 9); ctx.fillStyle = `rgba(255,${150 + 60 * fl},60,${0.8})`; ctx.beginPath(); ctx.arc(tx * s, -s * 0.72, s * 0.06 * (0.8 + 0.3 * fl), 0, TAU); ctx.fill(); }
      }
      ctx.restore();
      if (this.fx && dmg > 0.35 && Math.random() < 0.06 * dmg) this.fx.burst(gt.x + (Math.random() - 0.5), gt.y - 0.5, 1, { color: ['#555', '#777', '#999'], speed: 0.25, life: 1.2, gravity: -0.9, size: 0.12 });
      if (this.fx && fallen && Math.random() < 0.2) this.fx.burst(gt.x + (Math.random() - 0.5) * 0.8, gt.y - 0.3, 1, { color: ['#ffb347', '#e0532f', '#555'], speed: 0.4, life: 0.8, gravity: -1.5, size: 0.1 });
    }
    // one health bar for the whole camp, over its main gate
    if (!fallen) {
      const g = game.gates[0], m = game.map, inX = g.x < 1 ? 0.25 : g.x > m.cols - 1 ? -0.25 : 0, inY = g.y < 1 ? 0.35 : 0;
      ctx.save(); ctx.translate((g.x + inX) * ts, (g.y + inY) * ts);
      this.bar(-ts * 0.6, -ts * 1.45, ts * 1.2, F.hp / F.maxHp, '#d9473b');
      ctx.restore();
    }
  }

  drawTroop(u) {
    if (!u.engine) {
      super.drawTroop(u);
      if (u.id === 'drummer') { const st = this.anim.get(u); const ts = this.ts; this.ctx.save(); this.ctx.translate(u.x * this.ts, u.y * this.ts); this.ctx.scale(st?.face || 1, 1); drawDrum(this.ctx, ts * 0.1, -ts * 0.12, ts * 0.55, (this.time * 3) % 1); this.ctx.restore(); }
      return;
    }
    const ctx = this.ctx, ts = this.ts;
    let st = this.anim.get(u);
    if (!st) { st = { ph: 0, lx: u.x, ly: u.y, face: -1, t: 0 }; this.anim.set(u, st); }
    if (this.dt > 0) { const dx = u.x - st.lx, moved = Math.hypot(dx, u.y - st.ly); st.lx = u.x; st.ly = u.y; st.ph += moved * 6; if (Math.abs(dx) > 0.0005) st.face = dx < 0 ? -1 : 1; }
    st.swing = u.swing || 0; st.docked = !!u.docked;
    ctx.save(); ctx.translate(u.x * ts, (u.y + 0.15) * ts);
    if (u.flash > 0) ctx.globalAlpha = 0.85;
    drawEngine(ctx, ts, u.id, st);
    ctx.restore();
    ctx.save(); ctx.translate(u.x * ts, u.y * ts);
    const hf = u.hp / u.maxHp;
    if (hf < 0.999) this.bar(-ts * 0.22, -ts * 0.62, ts * 0.44, hf, hf > 0.5 ? '#7fb24a' : hf > 0.25 ? '#f2b33d' : '#d9473b');
    ctx.restore();
  }
}

// ---------- the battle ----------
export class AssaultSession {
  constructor(app, opts) {
    this.app = app; this.p = app.profile; this.opts = opts;
    this.view = document.getElementById('game-view');
    this.canvas = document.getElementById('board');
    this.wrap = document.getElementById('board-wrap');
    this.speed = 1; this.paused = false; this.aiming = null; this.acc = 0; this.cache = {}; this.alive = true;
  }

  start() {
    document.getElementById('screen').replaceChildren();
    this.view.hidden = false;
    document.body.classList.add('assault-mode');
    const r = this.wrap.getBoundingClientRect();
    const portrait = r.height > r.width * 1.05;
    this.game = new AssaultGame({ ...this.opts, portrait, bonus: this.app.runBonus() });
    this.renderer = new AssaultRenderer(this.canvas);
    const s = this.p.settings;
    this.renderer.cosmetics = { castle: this.p.equip.castle, trail: 'none', towerSkin: 'obsidian', hero: this.p.equip.hero };
    this.renderer.colorblind = s.colorblind; this.renderer.quality = s.quality; this.renderer.reduced = !!s.reducedMotion;
    this.renderer.noWeatherFx = true;
    this.fx = new FX(); this.fx.setQuality(s.quality); this.fx.reduced = s.reducedMotion; this.fx.shakeOn = s.shake;
    this.killFx = KILL_FX[this.p.equip.kill] || KILL_FX.poof;
    this.sel = new Set(); this.renderer.sel = this.sel; this.renderer.marks = [];
    this.buildHud(); this.buildDock(); this.buildOverlay(); this.wire(); this.bindInput();
    if (this.game.champ) { this.warCtl = new WarriorControls(this); document.body.classList.add('warrior-mode'); wireWarrior(this); this.setup3d(); }
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.wrap); this.resize();
    audio.init(); audio.startMusic(this.game.biome.id);
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const M = ASSAULT_INFO[this.game.mode];
    this.banner(this.game.raid ? 'Daily Raid' : this.game.conq ? `March on ${this.game.conq.name}` : this.game.blitz ? 'Blitz' : 'Stronghold 1', this.game.conq ? `${this.game.conq.land} · break ${this.game.camps} war camps` : `${MAPS[this.game.mapId].name} · break the war camp`, '', 2400);
    const intro = this.game.champ ? `${this.game.champ.cls.icon} ${this.game.champ.cls.name}: drag on the left to move, hold ⚔ to attack, drag the right side to turn. Your captain sends the troops; cut down raiders, smash emplacements and help break the gate.`
      : this.game.warlordMode ? 'Send troops with the cards, then command them: tap a soldier (or drag a box) to select, then tap the field to move, or tap an emplacement, foe or gate to attack. Take the supply posts (flags) for income.'
      : 'Tap a card to send troops down the road. Rams and Siege Towers break the gate (mind the boiling oil); tap an emplacement to focus it. New: tap your soldiers or drag a box to command them.';
    setTimeout(() => this.alive && toast(h('div', {}, h('b', {}, `${M.icon} ${M.name}`), h('div', { class: 'muted' }, intro)), { ms: 7500, key: 'assaultintro', icon: M.icon }), 900);
    this.onVis = () => { if (document.hidden && !this.paused) this.pause(); };
    document.addEventListener('visibilitychange', this.onVis);
  }

  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
    window.removeEventListener('keydown', this.onKey);
    this.inputAc?.abort();
    document.body.classList.remove('assault-mode', 'warrior-mode');
    this.warCtl?.destroy(); this.warCtl = null;
    if (this.renderer instanceof Renderer3D) { try { this.renderer.destroy(); } catch { /* ignore */ } document.getElementById('board3d').hidden = true; this.wrap.classList.remove('is3d'); document.body.classList.remove('on3d'); }
    document.getElementById('toolrow').replaceChildren(); document.getElementById('toolrow').hidden = true;
    this.view.hidden = true;
    document.getElementById('panel').hidden = true;
    document.getElementById('board-overlay').replaceChildren();
    document.getElementById('wave-banner').replaceChildren();
    document.getElementById('dock').replaceChildren();
    document.getElementById('hud').replaceChildren();
  }

  resize() {
    const r = this.wrap.getBoundingClientRect();
    this.renderer.maxStretch = window.matchMedia('(orientation: portrait) and (max-width: 700px)').matches ? 1.12 : 1;
    this.renderer.resize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1), this.game);
  }

  // Warrior on the attack fights in the 3D world, over the shoulder. Without WebGL it plays on in the classic view.
  async setup3d() {
    try { await loadThree(); } catch { toast('3D view could not load: you fight from above.'); return; }
    if (!this.alive) return;
    const old = document.getElementById('board3d'), gl = document.createElement('canvas');
    gl.id = 'board3d'; gl.setAttribute('aria-hidden', 'true'); old.replaceWith(gl);
    let r3;
    try { r3 = new Renderer3D(this.canvas, gl, 1); } catch { gl.hidden = true; toast('3D needs WebGL, which this device does not offer: you fight from above.'); return; }
    const cur = this.renderer;
    for (const k of ['cosmetics', 'colorblind', 'noWeatherFx', 'quality', 'reduced', 'anim', 'loot', 'corpses', 'trails', 'sel', 'marks']) r3[k] = cur[k];
    r3.noWeatherFx = true;
    r3.onLost = () => this.drop3d();
    r3.setChase(true);
    this.renderer = r3; this.wrap.classList.add('is3d'); document.body.classList.add('on3d'); gl.hidden = false;
    this.resize();
  }
  drop3d() {
    if (!this.alive || !(this.renderer instanceof Renderer3D)) return;   // (destroying the view at the end of a run loses its context on purpose)
    const cur = this.renderer, r2 = new AssaultRenderer(this.canvas);
    for (const k of ['cosmetics', 'colorblind', 'noWeatherFx', 'quality', 'reduced', 'sel', 'marks']) r2[k] = cur[k];
    try { cur.destroy(); } catch { /* ignore */ }
    document.getElementById('board3d').hidden = true; this.wrap.classList.remove('is3d'); document.body.classList.remove('on3d');
    this.renderer = r2; this.resize();
    toast('The 3D view ran out of graphics memory: you fight on from above.', { ms: 5000 });
  }

  frame(t) {
    if (!this.alive) return;
    try { this.tick(t); this.errN = 0; } catch (err) { const m = String(err?.message); if (this.lastErr !== m) { this.lastErr = m; console.error(err); } if (++this.errN > 20 && this.renderer instanceof Renderer3D) { this.errN = 0; this.drop3d(); } }
    this.raf = requestAnimationFrame((tt) => this.frame(tt));
  }

  tick(t) {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    const g = this.game;
    if (!this.paused && !g.over) {
      this.acc += dt * this.speed;
      let n = 0;
      while (this.acc >= GAME.step && n < 12) { g.update(GAME.step); this.acc -= GAME.step; n++; }
      if (n >= 12) this.acc = 0;
    }
    this.fx.update(dt);
    this.warCtl?.tick(dt);
    for (const u of this.sel) if (u.dead) this.sel.delete(u);
    this.renderer.selected = g.focus && !g.focus.ruined ? g.focus : null;
    this.renderer.draw(g, this.fx, dt, { placing: null });
    this.updateHud();
  }

  banner(title, sub = '', cls = '', ms = 1600) {
    const root = document.getElementById('wave-banner');
    const el = h('div', { class: 'pennant ' + cls }, h('div', { class: 't' }, title), sub ? h('div', { class: 's' }, sub) : null);
    root.replaceChildren(el);
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 420); }, ms);
  }

  set(key, val, fn) { if (this.cache[key] !== val) { this.cache[key] = val; fn(val); } }

  // ---------- HUD ----------
  buildHud() {
    const e = this.el = {};
    e.stage = h('b'); e.where = h('span');
    e.fortBar = bar(1, 'red'); e.keepBar = bar(1, 'moss');
    e.supply = h('span'); e.score = h('span'); e.clock = h('span');
    e.speed = h('span', {}, '1×');
    document.getElementById('hud').replaceChildren(
      h('button', { class: 'btn small ghost', 'aria-label': 'Pause menu', title: 'Pause (P)', onclick: () => this.pause() }, '❚❚', kbd('P')),
      h('div', { class: 'hud-wave' }, e.stage, e.where),
      h('div', { class: 'hud-bars' }, h('span', {}, 'Camp'), e.fortBar, h('span', {}, 'Keep'), e.keepBar),
      e.supplyBox = h('div', { class: 'hud-stat gold', title: 'Supply: spend it on troops and siege engines' }, '⚑ ', e.supply),
      h('div', { class: 'hud-stat clock', title: this.game.raid ? 'Time left' : 'Time' }, h('span', { class: 'lbl' }, this.game.raid ? 'LEFT' : 'TIME'), e.clock),
      h('div', { class: 'hud-stat', title: 'Score' }, h('span', { class: 'lbl' }, 'SCORE'), e.score),
      h('div', { class: 'hud-right' }, this.app.muteButton('ghost'), h('button', { class: 'btn small', title: 'Game speed (F)', onclick: () => this.cycleSpeed() }, e.speed, kbd('F'))),
    );
  }

  buildDock() {
    const e = this.el, g = this.game;
    e.cards = {};
    const barEl = h('div', { class: 'tower-bar as-cards', role: 'toolbar', 'aria-label': 'Send troops' });
    let k = 0;
    const next = AUNIT_ORDER.find((id) => !g.unitKnown(id));
    for (const id of AUNIT_ORDER) {
      if (!g.unitKnown(id)) continue;
      const U = AUNITS[id];
      const b = h('button', { class: 'tbtn as-card', 'aria-label': `${U.name}, ${U.cost} supply. ${U.blurb}`, title: `${U.name} — ${U.blurb}`, onclick: () => this.send(id) },
        h('span', { class: 'k' }, KEYS[k] || ''), unitIcon(id, 40), h('span', { class: 'c' }, String(g.unitCost(id))), h('i', { class: 'cd' }));
      b.dataset.key = KEYS[k] || '';
      e.cards[id] = b; barEl.append(b); k++;
    }
    if (next) barEl.append(h('div', { class: 'tbtn as-card as-next locked', title: `${AUNITS[next].name} joins the column at War Record ${AUNITS[next].unlock}: take more strongholds in any attack mode.` }, unitIcon(next, 40), h('span', { class: 'c' }, `🔒 ${AUNITS[next].unlock}`)));
    e.lanes = h('div', { class: 'as-lanes', hidden: true });
    // the command layer: pick a group, then March, Hold or Fall back (or tap the field)
    e.groups = {}; e.orders2 = {};
    e.selInfo = h('span', { class: 'as-sel-info muted' });
    e.cmd = h('div', { class: 'as-cmd', role: 'toolbar', 'aria-label': 'Command your army' },
      ...GROUPS.map((G) => (e.groups[G.id] = h('button', { class: 'as-chip', type: 'button', title: `Select ${G.name.toLowerCase()} on the field`, 'aria-pressed': 'false', onclick: () => this.selectGroup(G.id) }, h('span', { 'aria-hidden': 'true' }, G.icon), h('small', {}, G.name), h('i', { class: 'n' }, '0')))),
      h('span', { class: 'as-sep', 'aria-hidden': 'true' }),
      ...STANDING.map((O) => (e.orders2[O.id] = h('button', { class: 'as-order', type: 'button', title: `${O.name} (${O.key}): ${O.blurb}`, onclick: () => this.standing(O.id) }, h('span', { 'aria-hidden': 'true' }, O.icon), h('small', {}, O.name)))),
      e.selInfo);
    document.getElementById('dock').replaceChildren(e.cmd, barEl, e.lanes);
    this.renderLanes();
  }

  // ---------- the command layer ----------
  army() { return this.game.units.concat(this.game.engines).filter((u) => !u.dead); }
  selectGroup(id) {
    const G = GROUPS.find((x) => x.id === id), list = this.army().filter(G.test);
    const same = list.length && list.length === this.sel.size && list.every((u) => this.sel.has(u));
    this.sel.clear();
    if (!same) for (const u of list) this.sel.add(u);
    this.selGroup = same ? null : id;
    if (!same && !list.length) toast(`No ${G.name.toLowerCase()} on the field yet`, { key: 'sel', ms: 1000 });
    if (this.sel.size) audio.play('mark'); this.cache.sel = null;
  }
  // March, Hold or Fall back for whoever is selected (everyone when nobody is).
  standing(kind) {
    const g = this.game, who = this.sel.size ? [...this.sel] : this.army();
    if (!who.length) { audio.play('error'); toast('Send some troops first', { key: 'cmd', ms: 1000 }); return; }
    const n = g.command(who, kind);
    if (!n) { audio.play('error'); return; }
    audio.play(kind === 'retreat' ? 'whistle' : kind === 'hold' ? 'thud' : 'horn');
    buzz('tap');
    const label = { advance: 'March', hold: 'Hold', retreat: 'Fall back' }[kind];
    toast(`${label}: ${n} ${n === 1 ? 'unit' : 'units'}`, { key: 'cmd', ms: 900 });
    if (kind === 'retreat') { const p = g.keepGuardPoint(); this.mark(p.x, p.y, 'retreat'); }
  }
  mark(x, y, kind) { (this.renderer.marks ||= []).push({ x, y, kind, t: 0.9, max: 0.9 }); }
  // A tap on the field with soldiers selected: attack what is there, or move there.
  commandAt(w) {
    const g = this.game, who = [...this.sel];
    let target = null, bd = 0.85;
    for (const t of g.towers) { if (t.ruined) continue; const d = Math.hypot(t.cx - w.x, t.cy - 0.3 - w.y); if (d < bd) { bd = d; target = t; } }
    if (!target) { let be = 0.7; for (const e of g.enemies) { if (e.dead || e.delay > 0) continue; const d = Math.hypot(e.x - w.x, e.y - 0.2 - w.y); if (d < be) { be = d; target = e; } } }
    if (!target && g.fortress.hp > 0 && g.gates.some((gt) => Math.hypot(gt.x - w.x, gt.y - 0.4 - w.y) < 1.1)) target = g.fortress;
    const n = target ? g.command(who, 'attack', { target }) : g.command(who, 'move', { x: w.x, y: w.y });
    if (!n) { audio.play('error'); toast(target ? 'Those soldiers cannot attack that' : 'Rams and siege towers keep to the road', { key: 'cmd', ms: 1200 }); return; }
    audio.play(target ? 'mark' : 'click'); buzz('tap');
    if (target) { const x = target.cx ?? (target === g.fortress ? g.gates[0].x : target.x), y = target.cy ?? (target === g.fortress ? g.gates[0].y : target.y); this.mark(x, y, 'attack'); }
    else this.mark(w.x, w.y, 'move');
  }
  // A tap on one of your own soldiers: its squad (the same kind close by). A second tap on the same kind: all of that kind.
  pickOwn(w, touch) {
    let best = null, bd = touch ? 0.6 : 0.4;
    for (const u of this.army()) { const d = Math.hypot(u.x - w.x, u.y - 0.15 - w.y); if (d < bd) { bd = d; best = u; } }
    if (!best) return false;
    const now = performance.now(), again = this.lastPick && this.lastPick.id === best.id && now - this.lastPick.t < 420;
    this.lastPick = { id: best.id, t: now };
    this.sel.clear();
    for (const u of this.army()) if (u.id === best.id && (again || Math.hypot(u.x - best.x, u.y - best.y) <= 1.6)) this.sel.add(u);
    this.selGroup = null; this.cache.sel = null;
    audio.play('mark'); buzz('tap');
    return true;
  }

  renderLanes() {
    const g = this.game, e = this.el;
    e.lanes.hidden = g.lanes.length < 2;
    if (e.lanes.hidden) return;
    const opts = [[-1, 'Both roads'], ...g.lanes.map((_, i) => [i, `Road ${i + 1}`])];
    e.lanes.replaceChildren(h('span', { class: 'muted' }, 'Send to'), ...opts.map(([i, label]) => h('button', { class: 'btn small' + (g.lane === i ? ' gold' : ' ghost'), 'aria-pressed': String(g.lane === i), onclick: () => { g.lane = i; this.renderLanes(); } }, label)));
  }

  buildOverlay() {
    const e = this.el;
    e.orders = {};
    const ob = h('div', { class: 'abil-bar', role: 'toolbar', 'aria-label': 'Field orders' }, this.game.loadout.map((id, i) => {
      const O = ORDERS[id];
      const b = h('button', { class: 'abil', title: `${O.name} (${ORDER_KEYS[i]}) — ${O.blurb}`, 'aria-label': `${O.name}. ${O.blurb}`, onclick: (ev) => { ev.stopPropagation(); this.triggerOrder(id); } },
        h('span', { class: 'ic' }, O.icon), h('span', { class: 'nm' }, O.name), h('span', { class: 'key' }, ORDER_KEYS[i]), h('i', { class: 'cd' }), h('i', { class: 'on' }));
      e.orders[id] = b; return b;
    }));
    const ov = document.getElementById('board-overlay');
    const row = document.getElementById('toolrow');
    const mq = window.matchMedia('(orientation: portrait) and (max-width: 700px)');
    if (mq.matches) { row.hidden = false; row.replaceChildren(ob); ov.replaceChildren(); } else { row.hidden = true; row.replaceChildren(); ov.replaceChildren(ob); }
  }

  updateHud() {
    const g = this.game, e = this.el;
    this.set('stage', g.stage + '|' + g.taken, () => { e.stage.textContent = g.raid ? 'Daily Raid' : g.conq || g.blitz ? `Camp ${g.taken + 1}/${g.camps}` : `Stronghold ${g.stage}`; e.where.textContent = g.conq ? g.conq.name : g.blitz ? `Blitz · ${MAPS[g.mapId]?.name || ''}` : MAPS[g.mapId]?.name || ''; });
    const F = g.fortress;
    this.set('fort', Math.ceil(F.hp) + '/' + Math.round(F.maxHp), () => { e.fortBar.firstChild.style.width = (100 * F.hp / F.maxHp) + '%'; e.fortBar.title = `War camp ${fmt(Math.ceil(F.hp))} / ${fmt(Math.round(F.maxHp))}`; });
    this.set('keep', Math.ceil(g.castle.hp), () => { e.keepBar.firstChild.style.width = (100 * g.castle.hp / g.castle.maxHp) + '%'; e.keepBar.title = `Your keep ${Math.ceil(g.castle.hp)} / ${Math.round(g.castle.maxHp)}`; });
    this.set('supply', Math.floor(g.gold), (v) => { e.supply.textContent = fmt(v); });
    this.set('clock', Math.floor(g.raid ? Math.max(0, RAID.limit - g.clock) : g.clock), (v) => { e.clock.textContent = clockText(v); });
    this.set('score', g.score, (v) => { e.score.textContent = fmt(v); });
    this.set('speed', this.speed, (v) => { e.speed.textContent = v + '×'; });
    for (const [id, b] of Object.entries(e.cards)) {
      const open = g.unitOpen(id), cd = Math.max(0, g.cards[id]), frac = cd / AUNITS[id].cd;
      const st = `${open ? 1 : 0}|${g.gold >= g.unitCost(id) ? 1 : 0}|${Math.round(frac * 20)}|${g.alive() >= g.maxUnits ? 1 : 0}`;
      this.set('card_' + id, st, () => {
        b.classList.toggle('locked', !open);
        b.classList.toggle('poor', open && g.gold < g.unitCost(id));
        b.querySelector('.cd').style.height = (frac * 100) + '%';
        b.querySelector('.c').textContent = String(g.unitCost(id));
        b.disabled = !open;
      });
    }
    for (const [id, b] of Object.entries(e.orders)) {
      const o = g.orders[id], frac = o.cd > 0 ? o.cd / (o.max || ORDERS[id].cd) : 0;
      const act = id === 'horn' && g.hornT > 0 ? g.hornT / ORDERS.horn.time : 0;
      this.set('ord_' + id, Math.round(frac * 40) + '|' + (this.aiming === id) + '|' + Math.round(act * 20), () => {
        b.classList.toggle('ready', frac === 0); b.classList.toggle('aiming', this.aiming === id); b.classList.toggle('active', act > 0);
        b.querySelector('.cd').style.height = (frac * 100) + '%'; b.querySelector('.on').style.width = (act * 100) + '%';
      });
    }
    this.set('lanes', g.lanes.length + '|' + g.lane + '|' + g.stage, () => this.renderLanes());
    if (e.cmd) {
      const army = this.army(), counts = GROUPS.map((G) => army.filter(G.test).length);
      this.set('groups', counts.join('|') + '|' + this.selGroup, () => GROUPS.forEach((G, i) => { const b = e.groups[G.id]; b.querySelector('.n').textContent = counts[i]; b.disabled = !counts[i]; b.setAttribute('aria-pressed', String(this.selGroup === G.id)); }));
      this.set('sel', this.sel.size, (n) => { e.selInfo.textContent = n ? `${n} selected · tap the field` : ''; if (n && (this._selShown = (this._selShown || 0) + 1) <= 6 && window.innerWidth < 520) toast(`${n} selected · tap the field to move, or tap a target to attack`, { key: 'sel', ms: 1500 }); e.cmd.classList.toggle('has-sel', n > 0); for (const O of STANDING) e.orders2[O.id].title = `${O.name} (${O.key}): ${O.blurb}${n ? ` · ${n} selected` : ' · everyone'}`; });
    }
  }

  // ---------- actions ----------
  send(id) {
    const g = this.game;
    if (g.over || this.paused) return;
    const why = !g.unitOpen(id) ? `Opens at War Record ${AUNITS[id].unlock}` : g.alive() >= g.maxUnits ? 'Your army is at full strength on the field' : g.cards[id] > 0 ? 'Still mustering…' : g.gold < g.unitCost(id) ? 'Not enough supply' : null;
    if (why) { audio.play('error'); toast(why, { key: 'nosend', ms: 1200 }); return; }
    g.deploy(id);
  }

  triggerOrder(id) {
    const g = this.game;
    if (g.over) return;
    if (!g.orderReady(id)) { audio.play('error'); return; }
    if (!ORDERS[id].aim) { g.useOrder(id); return; }
    this.aiming = this.aiming === id ? null : id;
    this.renderer.aim = null;
    if (this.aiming) toast(`${ORDERS[id].icon} Tap the battlefield to use ${ORDERS[id].name}`, { key: 'aim', ms: 1600 });
  }

  cycleSpeed() { this.speed = this.speed >= 3 ? 1 : this.speed + 1; }

  pause() {
    if (this.game.over) return;
    this.paused = true; audio.setPaused(true);
    const resume = () => { this.paused = false; audio.setPaused(false); this.last = performance.now(); };
    const m = modal([
      h('h2', {}, '❚❚ Paused'),
      h('p', { class: 'muted' }, this.game.raid ? 'The raid waits for you.' : `Stronghold ${this.game.stage} · ${this.game.taken} taken so far. Assaults are not saved: ending now records what you have done.`),
      h('div', { class: 'row', style: { gap: '.5rem', flexWrap: 'wrap' } },
        h('button', { class: 'btn gold', onclick: () => m.close() }, 'Resume'),
        h('button', { class: 'btn', onclick: () => this.app.openSettings(true) }, 'Settings'),
        h('button', { class: 'btn red', onclick: () => { m.close(); this.game.gameOver(); } }, this.game.raid ? 'Give up the raid' : 'End the assault')),
    ], { onClose: resume });
  }

  // Spoils of conquest: a Warrior boon after a stronghold falls (and for a captain slain); the field waits while you choose.
  showSpoils() {
    const g = this.game;
    if (!g.boonOffer || this.boonModal) return;
    this.paused = true; audio.setPaused(true);
    const pick = (id) => { g.chooseBoon(id); this.boonModal?.close(); };
    const cards = g.boonOffer.map((id, i) => {
      const b = BOONS.find((x) => x.id === id), have = g.boon(id);
      return h('button', { class: 'boon ' + b.rarity, style: { animationDelay: i * 0.07 + 's' }, onclick: () => pick(id) },
        h('span', { class: 'r' }, b.rarity.toUpperCase() + ' · ⚔ WARRIOR'), h('span', { class: 'n' }, b.name), h('span', { class: 'd' }, b.desc), have ? h('span', { class: 'stk' }, `You have ${have}/${b.stack}`) : null);
    });
    this.boonModal = modal([h('h2', {}, 'Spoils of conquest'), h('p', { class: 'muted' }, 'Choose a boon for your warrior. It lasts for the rest of this assault.'), h('div', { class: 'boons' }, cards)],
      { wide: true, dismiss: false, onClose: () => { this.boonModal = null; this.paused = false; audio.setPaused(false); this.last = performance.now(); setTimeout(() => this.alive && g.boonOffer && this.showSpoils(), 200); } });
  }

  checkpoint() {
    try {
      const g = this.game;
      g.stats.credited = g.stats.credited || {};
      const r = checkpointRun(this.p, g.summary(), g.stats.credited);
      for (const q of r.quests) toast(`${q.overtime ? '🚩 Overtime' : '📜 Order'} complete: ${fillText(q)} · +${q.reward} Renown`, { key: 'order' + q.id, ms: 3500 });
    } catch (err) { console.error(err); }
  }

  // ---------- engine events ----------
  wire() {
    const g = this.game, fx = this.fx;
    g.on('deploy', ({ unit }) => { audio.play(unit.id === 'cavalry' ? 'gallop' : unit.engine ? 'build' : 'muster'); fx.burst(unit.x, unit.y, 5, { color: ['#e8e1c9', '#a99a7c'], speed: 1, life: 0.35, gravity: 1, size: 0.06 }); });
    g.on('shoot', ({ tower, unit, kind }) => {
      if (kind === 'arrow' || kind === 'flak') audio.play(unit ? 'twang' : 'arrow');
      else if (kind === 'ball' || kind === 'boulder') { audio.play('cannon'); const o = tower ? { x: tower.cx, y: tower.cy - 0.35 } : { x: unit.x, y: unit.y - 0.3 }; fx.burst(o.x, o.y, 4, { color: ['#d9d9d9', '#aaa'], speed: 1, life: 0.4, gravity: -1, size: 0.08 }); }
      else if (kind === 'orb') audio.play('orb'); else if (kind === 'bolt') audio.play('bolt');
    });
    g.on('impact', ({ x, y, kind, splash, fire }) => {
      audio.play('boom');
      fx.flash(x, y, splash || 0.6, fire ? 'rgba(255,140,40,0.6)' : '#ffe2a8');
      fx.burst(x, y, fire ? 16 : 10, { color: fire ? ['#ffb347', '#e0532f', '#3a2a1a'] : ['#ffb347', '#ffdf8a', '#8a8a8a'], speed: 3, life: 0.5, size: 0.09, gravity: 3 });
      if (kind === 'boulder') fx.shake(0.1, 0.18);
    });
    g.on('zap', ({ points, color }) => { fx.zap(points, color); audio.play('zap'); });
    g.on('pulse', ({ x, y, r }) => { fx.ring(x, y, r, '#bfefff', 0.5, 0.1); audio.play('frost'); });
    g.on('kill', ({ enemy, rout }) => {
      this.renderer.addCorpse(enemy);
      this.killFx(fx, enemy.x, enemy.y - 0.2, enemy.color);
      if (!rout) { audio.play('kill'); if (Math.random() < 0.35) fx.text(enemy.x, enemy.y - 0.5, '+' + ASSAULT.supply.perSlain, { color: '#f2b33d', size: 0.22, life: 0.7 }); }
    });
    g.on('unitDown', ({ unit }) => {
      fx.burst(unit.x, unit.y - 0.2, unit.engine ? 18 : 10, { color: unit.engine ? ['#8a6a44', '#5a4634', '#c9a77a'] : ['#c9a27a', '#8a8a8a', '#d9473b'], speed: 2, life: 0.6, gravity: 3, size: 0.08 });
      audio.play(unit.engine ? 'boom' : 'fall');
      if (unit.engine) fx.text(unit.x, unit.y - 0.7, `${AUNITS[unit.id].name} destroyed`, { color: '#ffb3a8', size: 0.26, life: 1.2 });
    });
    g.on('towerHit', ({ tower }) => { if (Math.random() < 0.3) fx.burst(tower.cx, tower.cy - 0.4, 2, { color: ['#8a8a8a', '#bbb'], speed: 1.2, life: 0.35, gravity: 3, size: 0.06 }); });
    g.on('razed', ({ tower, gold }) => {
      fx.burst(tower.cx, tower.cy, 20, { color: ['#888', '#aaa', '#6b5a4a', '#ffb347'], speed: 2.6, life: 0.8, size: 0.1, gravity: 3 }); fx.shake(0.18, 0.3);
      fx.text(tower.cx, tower.cy - 0.8, `${TOWERS[tower.type]?.name || 'Emplacement'} razed! +${gold}`, { color: '#ffd666', size: 0.3, bold: true, life: 1.4 });
      audio.play('boom'); audio.play('coin'); buzz('build');
    });
    g.on('fortressHit', ({ src }) => { if (src?.engine && Math.random() < 0.5) { fx.shake(0.06, 0.12); audio.play('thud'); } });
    g.on('keepHit', ({ enemy, dmg }) => {
      audio.play('leak'); fx.shake(0.15, 0.3); buzz('leak', 350);
      const c = g.map.castle; fx.text(c.x, c.y - 1.1, `${enemy.def.name} raided your keep −${Math.round(dmg)}`, { color: '#ff8a7a', size: 0.28, bold: true, life: 1.3 });
      this.el.keepBar.classList.remove('hud-flash'); void this.el.keepBar.offsetWidth; this.el.keepBar.classList.add('hud-flash');
    });
    g.on('sally', () => { if (g.stageT > 20) audio.play('horn'); });
    g.on('heal', ({ to }) => { if (Math.random() < 0.5) fx.text(to.x, to.y - 0.6, '+', { color: '#9be9a0', size: 0.32, life: 0.6 }); audio.play('heal'); });
    g.on('charge', ({ enemy }) => { fx.text(enemy.x, enemy.y - 0.8, 'CHARGE!', { color: '#ffd666', size: 0.26, bold: true }); audio.play('clangHit'); });
    g.on('strike', ({ unit }) => { if (Math.random() < 0.25) audio.play(unit.armor >= 20 ? 'clangHit' : 'thud'); });
    g.on('heroShot', ({ x, y }) => { const c = g.map.castle; this.renderer.onHeroShot(x, y, c.x, c.y - 0.66); audio.play('bow'); });
    g.on('focus', ({ tower }) => { if (tower) { audio.play('mark'); fx.text(tower.cx, tower.cy - 0.95, '🎯 Focus fire', { color: '#ffb3a8', size: 0.26, life: 1 }); } });
    g.on('order', ({ id, x, y, r, gold }) => {
      buzz('art');
      if (id === 'horn') { audio.play('horn'); this.banner('War Horn!', 'Your army surges forward', 'clear', 1400); for (const u of g.garrison.units) fx.ring(u.x, u.y, 0.4, 'rgba(255,214,102,0.9)', 0.5, 0.05); }
      else if (id === 'smoke') { audio.play('volley'); for (let i = 0; i < 30; i++) { const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r; fx.burst(x + Math.cos(a) * d, y + Math.sin(a) * d, 1, { color: ['#d8d4cc', '#b8b2a6', '#9a958c'], speed: 0.3, life: 2.4, gravity: -0.3, size: 0.22 }); } }
      else if (id === 'firepots') audio.play('volley');
      else if (id === 'requisition') { audio.play('coin'); const c = g.map.castle; fx.text(c.x, c.y - 1.2, `📦 +${fmt(gold)} supply`, { color: '#f2b33d', size: 0.34, bold: true, life: 1.4 }); }
      else if (id === 'reinforce') { audio.play('muster'); if (x != null) { fx.ring(x, y, 0.9, 'rgba(255,214,102,0.9)', 0.6, 0.08); fx.text(x, y - 0.9, 'Reinforcements!', { color: '#ffd666', size: 0.3, bold: true }); } }
    });
    g.on('fortressTaken', ({ stage, taken }) => {
      audio.play('achievement'); buzz('record'); fx.shake(0.5, 0.8);
      const c = g.fortress; for (let i = 0; i < 4; i++) setTimeout(() => this.alive && fx.burst(c.x + (Math.random() - 0.5) * 2, c.y - 1 - Math.random(), 26, { color: ['#f2b33d', '#ffffff', '#d9473b'], speed: 4.5, life: 1.3, size: 0.09, gravity: 3, shape: 'star' }), i * 240);
      if (taken < g.camps) this.banner('The camp has fallen!', g.conq ? `${taken} of ${g.camps} camps of ${g.conq.name} broken` : g.blitz ? `${taken} of ${g.camps} · ${clockText(g.clock)} on the clock` : `Stronghold ${stage} taken · ${taken} so far`, 'record', 2600);
      this.checkpoint();
      setTimeout(() => this.app.syncRealm(g), 300);
    });
    g.on('boonOffer', () => setTimeout(() => this.alive && this.showSpoils(), 700));
    g.on('realmTick', () => { const now = performance.now(); if (now - (this._sync || 0) > 45000) { this._sync = now; this.checkpoint(); setTimeout(() => this.app.syncRealm(g), 300); } });
    g.on('stageStart', ({ stage, map, first }) => {
      if (first) return;
      this.aiming = null; this.renderer.aim = null; this.cache = {};
      for (const k of ['parts', 'texts', 'rings', 'zaps', 'flashes']) this.fx[k] = [];   // last camp's sparks and labels stay behind
      this.renderer.corpses = [];
      this.resize();
      audio.startMusic(g.biome.id);
      this.banner(`Stronghold ${stage}`, `${MAPS[map].name} · stronger walls`, 'clear', 2600);
    });
    g.on('breach', ({ x, y }) => { audio.play('boom'); audio.play('muster'); fx.shake(0.35, 0.5); fx.burst(x, y - 0.6, 26, { color: ['#8a6a44', '#c9a77a', '#888'], speed: 3, life: 0.8, gravity: 3, size: 0.1 }); fx.text(x, y - 1.4, 'Breach! Over the wall!', { color: '#ffd666', size: 0.34, bold: true, life: 1.6 }); buzz('boss'); });
    g.on('oil', ({ x, y, r }) => { audio.play('oil'); fx.flash(x, y, r + 0.3, 'rgba(255,170,60,0.45)', 0.25); for (let i = 0; i < 14; i++) fx.burst(x + (Math.random() - 0.5) * r * 2, y - 0.6, 1, { color: ['#3a2a1a', '#e0632f', '#ffb347'], speed: 1, life: 0.7, gravity: 6, size: 0.09 }); if (performance.now() - (this._oilT || 0) > 6000) { this._oilT = performance.now(); fx.text(x, y - 1.2, 'Boiling oil!', { color: '#ffb36b', size: 0.28, bold: true }); } });
    g.on('stageGrant', ({ gold }) => toast(`Your survivors march home: +${fmt(gold)} supply for the next march.`, { key: 'grant', ms: 3500 }));
    g.on('gameOver', (summary) => {
      if (summary.victory) { audio.play('achievement'); this.banner(g.conq ? `${g.conq.name} is liberated!` : g.blitz ? 'Blitz complete!' : 'Raid complete!', g.conq ? 'Its war camps are broken. The Realm will hear of it.' : `${g.blitz ? 'Three camps' : 'Camp'} taken in ${clockText(summary.clock)} · ${fmt(summary.score)} points`, 'clear', 2600); }
      else { audio.play('gameover'); buzz('gameOver'); this.banner(summary.why === 'time' ? 'Out of time' : summary.why === 'quit' ? 'The army withdraws' : 'Your keep has fallen', g.raid || g.blitz ? `${fmt(summary.score)} points` : `${summary.taken} stronghold${summary.taken === 1 ? '' : 's'} taken · ${fmt(summary.razed)} emplacements razed`, 'boss', 2600); }
      this.fx.shake(0.4, 0.6);
      setTimeout(() => { this.destroy(); this.app.finishRun(summary); }, 2300);
    });
  }

  // ---------- input ----------
  bindInput() {
    const cv = this.canvas, g = () => this.game;
    const ac = this.inputAc = new AbortController(), opt = { signal: ac.signal };
    const world = (e) => { const r = cv.getBoundingClientRect(); return this.renderer.toWorld(e.clientX - r.left, e.clientY - r.top); };
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); this.aiming = null; this.renderer.aim = null; }, opt);
    // the command layer: a drag on the field draws a selection box round your soldiers
    cv.addEventListener('pointerdown', (e) => {
      if (e.button || g().champ || this.aiming) return;
      cv.setPointerCapture?.(e.pointerId);
      this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, w: world(e), box: false };
    }, opt);
    cv.addEventListener('pointermove', (e) => {
      const w = world(e);
      this.renderer.hover = null;
      if (this.aiming) this.renderer.aim = { x: w.x, y: w.y, r: ORDERS[this.aiming].r };
      const pr = this.press;
      if (pr && pr.id === e.pointerId) {
        if (!pr.box && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 16) pr.box = true;
        if (pr.box) this.renderer.box = { x0: pr.w.x, y0: pr.w.y, x1: w.x, y1: w.y };
      }
    }, opt);
    cv.addEventListener('pointercancel', () => { this.press = null; this.renderer.box = null; }, opt);
    cv.addEventListener('pointerup', (e) => {
      if (e.button) return;
      const w = world(e), G = g(), pr = this.press;
      this.press = null;
      audio.init();
      if (pr && pr.box) {
        const b = this.renderer.box; this.renderer.box = null;
        if (!b || G.over) return;
        const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
        this.sel.clear(); this.selGroup = null; this.cache.sel = null;
        for (const u of this.army()) if (u.x >= x0 - 0.15 && u.x <= x1 + 0.15 && u.y >= y0 - 0.25 && u.y <= y1 + 0.15) this.sel.add(u);
        if (this.sel.size) { audio.play('mark'); buzz('tap'); }
        return;
      }
      if (G.over || this.paused) return;
      if (this.aiming) {
        if (G.useOrder(this.aiming, w.x, w.y)) { this.aiming = null; this.renderer.aim = null; }
        return;
      }
      if (!G.champ) {
        if (this.pickOwn(w, e.pointerType !== 'mouse')) return;
        if (this.sel.size) { this.commandAt(w); return; }
      }
      // an emplacement near the tap: focus it (tap again to clear)
      let best = null, bd = e.pointerType === 'mouse' ? 0.6 : 0.85;
      for (const t of G.towers) { if (t.ruined) continue; const d = Math.hypot(t.cx - w.x, t.cy - 0.3 - w.y); if (d < bd) { bd = d; best = t; } }
      if (best) { G.setFocus(best); return; }
      if (G.focus) { G.setFocus(null); return; }
      // a tap on a road picks that road for the next troops
      if (G.lanes.length > 1) {
        let li = -1, ld = 0.8;
        G.lanes.forEach((L, i) => { for (let k = 0; k < L.pts.length - 1; k++) { const a = L.pts[k], b = L.pts[k + 1], len = Math.hypot(b.x - a.x, b.y - a.y) || 1; const u = Math.max(0, Math.min(1, ((w.x - a.x) * (b.x - a.x) + (w.y - a.y) * (b.y - a.y)) / (len * len))); const d = Math.hypot(a.x + (b.x - a.x) * u - w.x, a.y + (b.y - a.y) * u - w.y); if (d < ld) { ld = d; li = i; } } });
        if (li >= 0) { G.lane = li; this.renderLanes(); toast(`Sending troops down road ${li + 1}`, { key: 'lane', ms: 1000 }); }
      }
    }, opt);
    this.onKey = (e) => {
      if (!this.alive || document.querySelector('.modal-back')) return;
      const G = this.game, k = e.key.toUpperCase();
      if (k === 'P' || e.key === 'Escape') { if (this.aiming && e.key === 'Escape') { this.aiming = null; this.renderer.aim = null; return; } if (e.key === 'Escape' && this.sel.size) { this.sel.clear(); this.selGroup = null; this.cache.sel = null; return; } this.pause(); return; }
      if (!G.champ) {
        if (k === 'A') { this.selectGroup('all'); return; }
        const so = STANDING.find((o) => o.key === k);
        if (so) { this.standing(so.id); return; }
      }
      if (k === 'F') { this.cycleSpeed(); return; }
      if (k === 'L' && G.lanes.length > 1) { G.lane = G.lane + 1 >= G.lanes.length ? -1 : G.lane + 1; this.renderLanes(); return; }
      const oi = ORDER_KEYS.indexOf(k);
      if (oi >= 0 && G.loadout[oi]) { this.triggerOrder(G.loadout[oi]); return; }
      const card = Object.entries(this.el.cards).find(([, b]) => b.dataset.key === e.key);
      if (card) this.send(card[0]);
    };
    window.addEventListener('keydown', this.onKey);
  }
}

export { isAssaultMode };
