// "How to play" on the home page: a short animated tour that runs on the real engine, with step chips you can jump between.
// A little finger builds towers, calls the wave, shoots, upgrades, casts a Castle Art and fells a boss. It needs no sound and costs nothing.
import { h } from './dom.js';
import { Renderer } from '../game/render.js';
import { FX } from '../game/fx.js';
import { currentTheme } from '../meta/events.js';
import { wireBattle } from './attract.js';
import { createDemo, STEPS, LENGTH, stepAt } from './howto-script.js';

let inst = null;

// The card is built once and re-used when the home screen re-renders, so the tour keeps playing through online refreshes.
export function howToCard(app, { onFullGuide, onPractice, onClose } = {}) {
  if (inst && inst.alive()) { inst.app = app; inst.onFullGuide = onFullGuide; inst.onPractice = onPractice; inst.onClose = onClose; inst.syncClose(); inst.retheme(); inst.refreshLabels(); return inst.el; }
  inst?.stop();
  inst = build(app, { onFullGuide, onPractice, onClose });
  return inst.el;
}
export function stopHowTo() { inst?.stop(); inst = null; }

function build(app, hooks) {
  const profile = app.profile;
  const reduced = !!profile.settings.reducedMotion;
  const canvas = h('canvas', { 'aria-label': 'An animated tour of how to play', role: 'img' });
  const title = h('b', { class: 'ht-title' }), text = h('span', { class: 'ht-text' }), icon = h('span', { class: 'ht-icon', 'aria-hidden': 'true' });
  const caption = h('div', { class: 'howto-caption', 'aria-live': 'off' }, icon, h('div', {}, title, text));
  const chips = STEPS.map((s, i) => h('button', { class: 'ht-chip', title: s.title, 'aria-label': `Step ${i + 1}: ${s.title}`, onclick: () => { goStep(i); } }, h('span', { class: 'n' }, String(i + 1)), h('span', { class: 'l' }, s.title)));
  const playBtn = h('button', { class: 'btn small ghost ht-play', 'aria-label': 'Pause the tour', onclick: () => togglePause() }, '⏸');
  const practice = h('button', { class: 'btn small gold', onclick: () => inst?.onPractice?.() }, '');
  const guide = h('button', { class: 'btn small ghost', onclick: () => inst?.onFullGuide?.() }, 'Full guide');
  const closeBtn = h('button', { class: 'btn small ghost', 'aria-label': 'Hide the tour', title: 'Hide the tour', onclick: () => inst?.onClose?.() }, '✕');
  const el = h('div', { class: 'plaque howto-card' },
    h('div', { class: 'row howto-head' }, h('b', {}, '❔ How to play'), h('small', { class: 'muted' }, 'A 50-second tour'), h('span', { class: 'spacer' }), playBtn, closeBtn),
    h('div', { class: 'howto-stage' }, canvas),
    caption,
    h('div', { class: 'howto-steps', role: 'tablist' }, chips),
    h('div', { class: 'row howto-actions' }, practice, guide));

  let demo = null, r = null, fx = null, step = -1, paused = reduced, alive = true, raf = 0, last = performance.now(), lostT = 0, lastPw = 0;

  function begin(at = 0) {
    fx = new FX(); fx.setQuality('low'); fx.reduced = reduced; fx.shakeOn = false;
    demo = createDemo({ fx, weapon: profile.weapon });
    r = new Renderer(canvas);
    r.cosmetics = { castle: profile.equip.castle, trail: profile.equip.trail, towerSkin: profile.equip.skin, hero: profile.equip.hero };
    r.quality = profile.settings.quality; r.reduced = reduced; r.colorblind = !!profile.settings.colorblind;
    r.theme = currentTheme(profile);
    wireBattle(demo.g, r, fx, profile, { silent: true });
    resize();
    if (at > 0) demo.seek(at);
    step = -1;
    showStep(stepAt(demo.time()));
  }

  function showStep(i) {
    if (i === step) return;
    step = i;
    const s = STEPS[i];
    icon.textContent = s.icon; title.textContent = `${i + 1}. ${s.title}`; text.textContent = s.text;
    chips.forEach((c, k) => { c.classList.toggle('on', k === i); c.classList.toggle('done', k < i); c.setAttribute('aria-selected', String(k === i)); });
    caption.classList.remove('pop'); void caption.offsetWidth; caption.classList.add('pop');
  }

  function goStep(i) {
    begin(STEPS[i].at + 0.05);
    if (reduced) { demo.seek(i + 1 < STEPS.length ? STEPS[i + 1].at - 0.4 : LENGTH - 3); showStep(i); draw(0); }
  }

  function togglePause() {
    paused = !paused;
    playBtn.textContent = paused ? '▶' : '⏸';
    playBtn.setAttribute('aria-label', paused ? 'Play the tour' : 'Pause the tour');
  }

  function resize() {
    const pw = canvas.parentElement?.clientWidth || 420;
    lastPw = pw;
    const pad = 0.9, w = Math.min(pw, 560), hgt = Math.round(w * 10 / (16 + pad));
    r.padRight = pad;
    r.resize(w, hgt, Math.min(2, window.devicePixelRatio || 1), demo.g);
  }

  // The finger, the "Start wave" button, the art bar and the step badge, drawn over the battlefield.
  function overlay() {
    const ctx = r.ctx, ts = r.ts, ptr = demo.ptr, g = demo.g;
    ctx.save(); ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    const X = (x) => r.ox + x * ts, Y = (y) => r.oy + y * ts;
    // Selected tower ring.
    if (ptr.sel && !ptr.sel.dead) {
      ctx.strokeStyle = '#ffd666'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -r.time * 20;
      ctx.beginPath(); ctx.ellipse(X(ptr.sel.cx), Y(ptr.sel.cy + 0.28), ts * 0.55, ts * 0.3, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    // Start-wave button (step 2).
    if (ptr.startBtn != null) {
      const w = ts * 3.2, hh = ts * 0.78, x = X(g.map.cols / 2) - w / 2, y = Y(0.35);
      const pulse = ptr.startBtn ? 1 + Math.sin(r.time * 9) * 0.04 : 1;
      ctx.save(); ctx.translate(x + w / 2, y + hh / 2); ctx.scale(pulse, pulse);
      pill(ctx, -w / 2, -hh / 2, w, hh, '#f2b33d', '#1a1410');
      ctx.fillStyle = '#1a1410'; ctx.font = `800 ${Math.round(ts * 0.42)}px "Baloo 2", system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('▶ Start wave', 0, 1); ctx.restore();
    }
    // Castle-art bar (step 5).
    if (ptr.bar) {
      const sz = ts * 1.05, x = X(0.6), y = Y(g.map.rows) - sz - ts * 0.15;
      pill(ctx, x, y, sz, sz, ptr.bar.hot ? '#ffd666' : '#2a211b', '#1a1410');
      ctx.font = `${Math.round(sz * 0.55)}px system-ui, "Segoe UI Emoji"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      ctx.fillText(ptr.bar.icon, x + sz / 2, y + sz / 2 + 1);
      ctx.font = `700 ${Math.round(ts * 0.3)}px "Baloo 2", system-ui`; ctx.fillStyle = '#f7eedb';
      ctx.fillText(ptr.bar.name, x + sz / 2, y - ts * 0.2);
    }
    // Hint label.
    if (ptr.label) {
      ctx.font = `700 ${Math.round(ts * 0.36)}px "Baloo 2", system-ui`; const tw = ctx.measureText(ptr.label).width + ts * 0.7;
      pill(ctx, X(g.map.cols / 2) - tw / 2, Y(g.map.rows) - ts * 0.9, tw, ts * 0.62, 'rgba(26,20,16,.88)', '#6b5442');
      ctx.fillStyle = '#f7eedb'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ptr.label, X(g.map.cols / 2), Y(g.map.rows) - ts * 0.9 + ts * 0.32);
    }
    // The finger.
    if (ptr.visible) {
      const px = X(ptr.x), py = Y(ptr.y);
      if (ptr.ripple > 0) {
        ctx.strokeStyle = `rgba(255,255,255,${ptr.ripple * 0.9})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(px, py, ts * (0.15 + (1 - ptr.ripple) * 0.7), 0, Math.PI * 2); ctx.stroke();
      }
      const s = ts * 0.032, down = ptr.ripple > 0.6 ? 0.9 : 1;
      ctx.save(); ctx.translate(px, py); ctx.scale(s * down, s * down);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 22); ctx.lineTo(5.5, 17); ctx.lineTo(9.5, 26); ctx.lineTo(13.5, 24.3); ctx.lineTo(9.6, 15.6); ctx.lineTo(16.5, 15.6); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }

  function pill(ctx, x, y, w, hh, fill, stroke) {
    const rad = Math.min(hh / 2, 14);
    ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + hh, rad); ctx.arcTo(x + w, y + hh, x, y + hh, rad); ctx.arcTo(x, y + hh, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke();
  }

  function draw(dt) {
    r.draw(demo.g, fx, dt, { placing: null });
    overlay();
  }

  function frame(t) {
    if (!alive) return;
    if (!canvas.isConnected) { if ((lostT += 1) > 3) { stop(); return; } raf = requestAnimationFrame(frame); return; }
    lostT = 0;
    const dt = Math.min(0.1, (t - last) / 1000); last = t;
    if (!document.hidden) {
      const pw = canvas.parentElement?.clientWidth || 0;
      if (pw && Math.abs(pw - lastPw) > 1) resize();
      if (!paused) {
        const wrapped = demo.step(dt);
        fx.update(dt);
        if (wrapped) { begin(0); }
        else showStep(stepAt(demo.time()));
      }
      draw(paused ? 0 : dt);
    }
    raf = requestAnimationFrame(frame);
  }
  function stop() { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); }
  const onResize = () => { if (r && canvas.isConnected) { resize(); } };
  window.addEventListener('resize', onResize);

  begin(0);
  if (reduced) { goStep(0); }
  const api = {
    el, app, onFullGuide: hooks.onFullGuide, onPractice: hooks.onPractice, onClose: hooks.onClose,
    syncClose() { closeBtn.hidden = !api.onClose; },
    alive: () => alive, stop,
    retheme() { if (r) r.theme = currentTheme(profile); },
    refreshLabels() { practice.textContent = app.profile.tutorialDone ? 'Practice run' : 'Play the tutorial'; },
  };
  api.refreshLabels(); api.syncClose();
  raf = requestAnimationFrame(frame);
  return api;
}
