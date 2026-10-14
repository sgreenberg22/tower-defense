// "How the Realm works": a short animated tour over the real map. Opens once on a player's first visit to the Realm and from a button any time.
import { h, modal, bar, fmt } from './dom.js';
import { mapWidget } from './mapview.js';
import { SCENES, CITIZENS, RALLY_GOAL, crowdAt, rowsAt, giftAt } from './realm-tour-script.js';
import { ENEMIES } from '../data/balance.js';
import { TERRITORY, MAX_PROVINCES, PROVINCES } from '../game/realmmap.js';
import { saveProfile } from '../meta/profile.js';

const ROW_NAME = { day: '📅 Daily Rally', week: '🗓 Weekly Muster', month: '🌙 Monthly Campaign' };

export function showRealmTour(app, { onClose } = {}) {
  const p = app.profile;
  const reduced = !!p.settings.reducedMotion;
  let idx = 0, t = 0, playing = !reduced, raf = 0, last = 0, lastHeld = SCENES[0].held(0), alive = true;

  const widget = mapWidget({ held: lastHeld, selected: -1 });
  const mapBox = h('div', { class: 'tour-map' }, widget.el);
  const panel = h('div', { class: 'tour-panel' });
  const title = h('h2', { class: 'tour-title' });
  const text = h('p', { class: 'tour-text' });
  const dots = SCENES.map((s, i) => h('button', { class: 'tour-dot', 'aria-label': `Step ${i + 1}: ${s.title}`, title: s.title, onclick: () => go(i) }));
  const playBtn = h('button', { class: 'btn small ghost', 'aria-label': 'Pause', onclick: () => { playing = !playing; paintPlay(); } });
  const prev = h('button', { class: 'btn small ghost', onclick: () => go(idx - 1) }, '‹ Back');
  const next = h('button', { class: 'btn small gold', onclick: () => (idx === SCENES.length - 1 ? close() : go(idx + 1)) });
  const m = modal([
    h('div', { class: 'row', style: { gap: '.5rem' } }, h('b', { class: 'tour-kicker' }, '🗺 How the Realm works'), h('span', { class: 'spacer' }), playBtn),
    title, mapBox, panel, text,
    h('div', { class: 'row tour-nav' }, prev, h('div', { class: 'tour-dots', role: 'tablist' }, dots), next),
  ], { wide: true, onClose: () => { alive = false; cancelAnimationFrame(raf); widget.destroy(); p.seenRealmTour = true; saveProfile(p); onClose?.(); } });
  const close = () => m.close();

  const paintPlay = () => { playBtn.textContent = playing ? '⏸' : '▶'; playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play'); };
  const go = (i) => { idx = Math.max(0, Math.min(SCENES.length - 1, i)); t = reduced ? SCENES[idx].len : 0; build(); };

  // Scene DOM is rebuilt on entry and then only its numbers and classes change.
  let refs = {};
  function build() {
    const s = SCENES[idx];
    title.textContent = s.title; text.textContent = s.text;
    dots.forEach((d, i) => { d.classList.toggle('on', i === idx); d.setAttribute('aria-selected', String(i === idx)); });
    prev.disabled = idx === 0; next.textContent = idx === SCENES.length - 1 ? 'Got it' : 'Next ›';
    refs = {};
    mapBox.classList.toggle('dim', s.id === 'together');
    if (s.id === 'together') {
      refs.counts = CITIZENS.map(() => h('b', {}));
      refs.chips = CITIZENS.map((c, i) => h('div', { class: 'tour-citizen' + (i === 0 ? ' me' : '') }, h('span', { class: 'ico' }, c.icon), h('small', {}, c.name), refs.counts[i]));
      refs.goal = h('b', {}); refs.fill = bar(0, 'gold');
      panel.replaceChildren(h('div', { class: 'tour-crowd' }, refs.chips), h('div', { class: 'tour-goal' }, h('div', { class: 'row' }, h('span', {}, '📅 Daily Rally'), h('span', { class: 'spacer' }), refs.goal), refs.fill));
    } else if (s.steps) {
      refs.rows = ['day', 'week', 'month'].map((r) => { const v = h('b', {}), tag = h('span', { class: 'tour-tag' }); const fill = bar(0, r === 'day' ? 'blue' : r === 'week' ? 'blue' : 'moss'); return { r, v, tag, fill, el: h('div', { class: 'tour-row' }, h('div', { class: 'row' }, h('span', {}, ROW_NAME[r]), h('span', { class: 'spacer' }), tag, v), fill) }; });
      refs.count = h('b', { class: 'tour-count' });
      panel.replaceChildren(h('div', { class: 'tour-rows' }, refs.rows.map((x) => x.el)), h('div', { class: 'tour-held' }, '🏰 Provinces held ', refs.count, ` / ${MAX_PROVINCES}`));
    } else if (s.id === 'gifts') {
      refs.card = h('div', { class: 'tour-card' });
      panel.replaceChildren(refs.card);
    } else if (s.id === 'march') {
      const f = PROVINCES[TERRITORY.start];
      const foe = ENEMIES[f.foe]?.name || f.foe;
      refs.march = h('div', { class: 'tour-march' },
        h('div', {}, h('b', {}, `March on ${f.name}`), h('small', { class: 'muted' }, `${foe} horde · ${f.terrain} weather`)),
        h('div', { class: 'tour-x2' }, '×2'), h('small', {}, 'kills count toward the Daily Rally'));
      panel.replaceChildren(refs.march);
    } else {
      const items = ['Play any run: every enemy you defeat adds to the shared goals.', 'Play the Daily or a March for a little extra.', 'Hold more provinces and every run gets stronger, for everyone.', 'Starting on a higher wave or on an easy start changes nothing here. Only waves you really hold count.'];
      refs.items = items.map((x) => h('li', {}, x));
      panel.replaceChildren(h('ul', { class: 'tour-list' }, refs.items));
    }
    lastHeld = s.held(0); widget.setHeld(lastHeld);
    mapBox.dataset.scene = s.id;
    update();
  }

  function update() {
    const s = SCENES[idx];
    const held = s.held(t);
    if (held !== lastHeld) { widget.pulse(lastHeld, held); widget.setHeld(held); lastHeld = held; }
    if (s.id === 'together') {
      const c = crowdAt(t);
      c.kills.forEach((k, i) => { refs.counts[i].textContent = fmt(k); refs.chips[i].classList.toggle('pop', k > 0 && Math.floor(t * 3) % (i + 2) === 0); });
      refs.goal.textContent = `${fmt(c.total)} / ${fmt(RALLY_GOAL)}`;
      refs.fill.firstChild && (refs.fill.firstChild.style.width = Math.round(c.frac * 100) + '%');
    } else if (s.steps) {
      rowsAt(s, t).forEach((r, i) => {
        const x = refs.rows[i];
        x.fill.firstChild && (x.fill.firstChild.style.width = Math.round(r.frac * 100) + '%');
        x.v.textContent = r.done ? (r.ok ? '✔ ' : '✖ ') + r.short : '';
        x.tag.textContent = r.done ? r.tag : ''; x.tag.className = 'tour-tag ' + (r.done ? (r.ok ? 'up' : 'down') : '');
      });
      refs.count.textContent = String(held);
    } else if (s.id === 'gifts') {
      const g = giftAt(t), pv = g.province;
      if (refs.shown !== g.i) {
        refs.shown = g.i; widget.select(pv.idx);
        const foe = ENEMIES[pv.foe]?.name || pv.foe;
        refs.card.replaceChildren(h('b', { class: 'tour-pname' }, pv.name), h('small', { class: 'muted' }, `${pv.terrain} · horde of ${foe}s`), h('div', { class: 'tour-gift' }, '🎁 ' + pv.perkText), pv.unit ? h('small', {}, `Focus: ${pv.unit.name}`) : null);
        refs.card.classList.remove('swap'); void refs.card.offsetWidth; refs.card.classList.add('swap');
      }
    } else if (s.id === 'march') {
      if (refs.shown !== 1) { refs.shown = 1; widget.select(PROVINCES[TERRITORY.start].idx); }
      refs.march.classList.toggle('go', t > 2);
    } else {
      refs.items.forEach((li, i) => li.classList.toggle('on', t > 0.5 + i * 1.4 || reduced));
    }
  }

  function tick(now) {
    if (!alive) return;
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (playing) {
      t += dt;
      if (t >= SCENES[idx].len) { if (idx < SCENES.length - 1) { go(idx + 1); } else { t = SCENES[idx].len; playing = false; paintPlay(); } }
      else update();
    }
    raf = requestAnimationFrame(tick);
  }
  paintPlay(); build();
  if (reduced) { t = SCENES[0].len; update(); }   // reduced motion: each scene shows finished; step with the buttons
  raf = requestAnimationFrame(tick);
  return m;
}
