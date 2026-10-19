// The Daily Supplies chest: a seven-day track, a chest that shakes, pops open and showers coins, and a Renown count-up.
import { h, fmt, modal } from './dom.js';
import { audio } from '../game/audio.js';
import { buzz } from './haptics.js';
import { saveProfile } from '../meta/profile.js';
import { SUPPLY_TRACK, supplyToday, supplyTomorrow, claimSupplies } from '../meta/supplies.js';

const CHEST_NAME = { wood: 'Supply Crate', iron: 'Iron Coffer', royal: 'Royal Chest' };
const CHEST_COL = {
  wood: { body: '#8a5a32', dark: '#5b3a20', band: '#c9a27a', lock: '#f2b33d' },
  iron: { body: '#56677d', dark: '#36424f', band: '#c8d3e0', lock: '#f2b33d' },
  royal: { body: '#6b3fa8', dark: '#432570', band: '#f2b33d', lock: '#fff1b8' },
};

// A chunky storybook chest in the game's outlined style. The lid is its own group so CSS can swing it open.
export function chestSvg(kind = 'wood', size = 120) {
  const c = CHEST_COL[kind] || CHEST_COL.wood;
  return `<svg class="chest-svg ${kind}" viewBox="0 0 120 110" width="${size}" height="${Math.round(size * 110 / 120)}" aria-hidden="true" focusable="false">
  <g stroke="#1a1410" stroke-width="4" stroke-linejoin="round">
    <ellipse cx="60" cy="102" rx="46" ry="6" fill="rgba(0,0,0,.35)" stroke="none"/>
    <g class="chest-glow"><circle cx="60" cy="52" r="34" fill="${c.lock}" opacity=".0" stroke="none"/></g>
    <path d="M14 52 H106 V96 Q106 100 102 100 H18 Q14 100 14 96 Z" fill="${c.body}"/>
    <path d="M14 66 H106" stroke="${c.dark}" stroke-width="3"/>
    <rect x="26" y="52" width="12" height="48" fill="${c.band}"/>
    <rect x="82" y="52" width="12" height="48" fill="${c.band}"/>
    <rect x="50" y="56" width="20" height="22" rx="4" fill="${c.lock}"/>
    <path d="M60 63 v8" stroke-width="3.5"/>
    <g class="chest-lid">
      <path d="M12 52 Q12 18 60 16 Q108 18 108 52 Z" fill="${c.body}"/>
      <path d="M26 50 Q26 24 32 20 M94 50 Q94 24 88 20" fill="none" stroke="${c.band}" stroke-width="10" stroke-linecap="round"/>
      <path d="M26 50 Q26 24 32 20 M94 50 Q94 24 88 20" fill="none" stroke-width="2" opacity=".35"/>
      <path d="M12 52 H108" stroke-width="5"/>
      ${kind === 'royal' ? '<path d="M44 16 L50 4 L56 12 L60 2 L64 12 L70 4 L76 16 Z" fill="#f2b33d"/>' : ''}
    </g>
  </g></svg>`;
}

const reduced = (p) => !!p.settings.reducedMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Counts a number up on screen, easing out, so a reward lands with a little weight.
export function countUp(el, to, ms = 900, prefix = '') {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = prefix + fmt(Math.round(to * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// A burst of coins and sparkles out of a point on the page (DOM, so it works over any screen).
export function coinBurst(host, n = 22) {
  const wrap = h('div', { class: 'coin-burst', 'aria-hidden': 'true' });
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25, d = 70 + Math.random() * 110;
    const el = h('i', { class: i % 4 === 0 ? 'spark' : 'coin' });
    el.style.setProperty('--dx', Math.cos(a) * d + 'px');
    el.style.setProperty('--dy', Math.sin(a) * d + 'px');
    el.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
    el.style.animationDelay = (Math.random() * 0.12) + 's';
    wrap.append(el);
  }
  host.append(wrap);
  setTimeout(() => wrap.remove(), 1600);
}

export function showSupplies(app, { onDone } = {}) {
  const p = app.profile;
  const s = supplyToday(p);
  const track = h('div', { class: 'sup-track', role: 'list', 'aria-label': 'Seven-day supply track' },
    SUPPLY_TRACK.map((slot) => {
      const state = slot.day < s.day ? 'past' : slot.day === s.day ? (s.ready ? 'today' : 'past') : 'future';
      return h('div', { class: `sup-day ${state} ${slot.chest}`, role: 'listitem', 'aria-label': `Day ${slot.day}: ${CHEST_NAME[slot.chest]}${state === 'past' ? ', opened' : ''}` },
        h('span', { class: 'sd-n' }, slot.day === 7 ? '★ 7' : `Day ${slot.day}`),
        h('span', { class: 'sd-ico', html: chestSvg(slot.chest, 34) }),
        h('span', { class: 'sd-v' }, state === 'past' ? '✔' : slot.extra ? `+${slot.extra}` : '✦'));
    }));
  const chest = h('button', { class: `sup-chest ${s.chest}`, 'aria-label': s.ready ? `Open the ${CHEST_NAME[s.chest]}` : 'Already opened today', html: chestSvg(s.chest, 150) });
  const amount = h('div', { class: 'sup-amount', hidden: true }, h('span', { class: 'sa-ico' }, '✦'), h('b', {}, '0'), h('span', { class: 'sa-lbl' }, 'Renown'));
  const lucky = h('div', { class: 'sup-lucky', hidden: true }, '🍀 Lucky chest! Streak bonus doubled');
  const tm = supplyTomorrow(p);
  const tomorrow = h('p', { class: 'muted sup-next' }, s.ready ? `Open one chest a day. Miss a day and the track starts again from Day 1.` : `Come back tomorrow for Day ${tm.day}: a ${CHEST_NAME[tm.chest]} with about ✦ ${tm.total} Renown.`);
  const hint = h('div', { class: 'sup-hint' }, s.ready ? 'Tap the chest to open it' : 'Opened today');
  const done = h('button', { class: 'btn gold big wide', hidden: s.ready, onclick: () => m.close() }, s.ready ? 'Collect' : 'Back');
  const stage = h('div', { class: 'sup-stage' + (s.ready ? ' ready' : ' opened') }, h('div', { class: 'sup-rays', 'aria-hidden': 'true' }), chest, amount);

  let opened = false;
  const open = () => {
    if (opened || !s.ready) return;
    opened = true;
    const r = claimSupplies(p);
    if (!r) return;
    saveProfile(p);
    hint.textContent = '';
    const fast = reduced(p);
    stage.classList.add('shaking');
    audio.play('claim');
    buzz('tap');
    setTimeout(() => {
      stage.classList.remove('shaking'); stage.classList.add('open');
      audio.play('achievement'); audio.play('coin');
      buzz('reward');
      if (!fast) coinBurst(stage, r.chest === 'royal' ? 34 : r.chest === 'iron' ? 26 : 20);
      amount.hidden = false;
      countUp(amount.querySelector('b'), r.renown, fast ? 1 : 900, '+');
      if (r.lucky) lucky.hidden = false;
      track.querySelector('.sup-day.today')?.classList.replace('today', 'past');
      const sv = track.querySelectorAll('.sup-day')[r.day - 1]?.querySelector('.sd-v'); if (sv) sv.textContent = '✔';
      tomorrow.textContent = `Come back tomorrow for Day ${tm.day}: a ${CHEST_NAME[tm.chest]} with about ✦ ${tm.total} Renown.`;
      done.hidden = false; done.focus({ preventScroll: true });
    }, fast ? 60 : 650);
  };
  chest.addEventListener('click', open);

  const m = modal([
    h('div', { class: 'sup-head' },
      h('h2', {}, 'Daily Supplies'),
      h('div', { class: 'muted' }, `Day ${s.day} of 7 · 🔥 ${s.streak}-day streak${s.week > 1 ? ` · week ${s.week}` : ''}`)),
    track, stage, hint, lucky, tomorrow, done,
  ], { onClose: () => onDone?.(opened) });   // closed unopened: the Today card keeps the chest waiting
  m.el.classList.add('supplies');
  return m;
}
