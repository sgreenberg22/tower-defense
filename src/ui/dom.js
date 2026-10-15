// Tiny DOM helpers: h() builder, toasts, modals, formatting.
import { audio } from '../game/audio.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      const ev = k.slice(2).toLowerCase();
      el.addEventListener(ev, ev === 'click' ? (e) => { audio.play('click'); v(e); } : v);
    } else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const kbd = (k) => h('span', { class: 'kbd', 'aria-hidden': 'true' }, k);

export const $ = (sel, root = document) => root.querySelector(sel);

export function fmt(n) {
  n = Math.round(n || 0);
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k';
  return n.toLocaleString();
}
export function fmtTime(sec) {
  sec = Math.round(sec || 0);
  const hrs = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return hrs ? `${hrs}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
}
// A stopwatch reading: 4:07, or 1:02:09 past the hour.
export function clockText(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const hrs = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return hrs ? `${hrs}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
export function pct(a, b) { return b ? Math.round((100 * a) / b) + '%' : '—'; }

// Toasts: small, de-duplicated, and kept at the bottom of the screen during a run so they never cover where foes enter.
// `key` merges repeats of the same message into one toast with a count.
export function toast(content, { kind = '', ms = 2600, icon = null, key = null } = {}) {
  const root = document.getElementById('toasts');
  const gv = document.getElementById('game-view');
  const inGame = !!gv && !gv.hidden;
  if (inGame) {
    if (!icon && ms <= 2600) ms = 2000;   // in a run, notices sit at the bottom (see CSS) and leave quickly
  }
  root.style.top = '';
  const dedupe = key || (typeof content === 'string' ? content : null);
  if (dedupe) {
    const old = [...root.children].find((c) => c.dataset.key === dedupe && !c.classList.contains('out'));
    if (old) {
      const n = (Number(old.dataset.n) || 1) + 1;
      old.dataset.n = n;
      old.querySelector('.cnt')?.remove();
      old.append(h('b', { class: 'cnt' }, `×${n}`));
      clearTimeout(old._t);
      old._t = setTimeout(() => { old.classList.add('out'); setTimeout(() => old.remove(), 320); }, ms);
      return;
    }
  }
  const el = h('div', { class: 'toast ' + kind }, icon ? h('span', { class: 'ic' }, icon) : null, h('div', {}, content));
  if (dedupe) el.dataset.key = dedupe;
  // Tap a toast to dismiss it (they sit over the battlefield, which matters on phones).
  el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); clearTimeout(el._t); el.classList.add('out'); setTimeout(() => el.remove(), 320); });
  root.append(el);
  const max = inGame ? 2 : 4;
  while (root.children.length > max) root.firstChild.remove();
  el._t = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
}

export function modal(content, { wide = false, dismiss = true, onClose } = {}) {
  const root = document.getElementById('modal-root');
  const box = h('div', { class: 'modal plaque trim' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' }, content);
  const back = h('div', { class: 'modal-back' }, box);
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape' && dismiss) { e.stopPropagation(); close(); } };
  if (dismiss) back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey);
  root.append(back);
  const f = box.querySelector('button, input, [tabindex]');
  if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
  return { close, el: box };
}

export function confirmBox(text, okLabel = 'Confirm', danger = false) {
  return new Promise((res) => {
    const m = modal([
      h('p', { style: { fontSize: '1.05rem', fontWeight: 600 } }, text),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
        h('button', { class: 'btn ghost', onclick: () => { res(false); m.close(); } }, 'Cancel'),
        h('button', { class: 'btn ' + (danger ? 'red' : 'gold'), onclick: () => { res(true); m.close(); } }, okLabel)),
    ], { onClose: () => res(false) });
  });
}

export function bar(frac, cls = '') {
  return h('div', { class: 'bar ' + cls }, h('i', { style: { width: Math.max(0, Math.min(100, frac * 100)) + '%' } }));
}
