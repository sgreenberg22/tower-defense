// Realm themes: pick how the whole game looks (menus and battlefield). Locked themes show how to earn them.
import { h } from './dom.js';
import { THEME_CATALOG, THEMES } from '../data/events.js';
import { themeUnlocked, themeUnlockText, currentTheme } from '../meta/events.js';
import { saveProfile } from '../meta/profile.js';
import { mapThumb } from './screens.js';

// Preference stored in settings.theme: 'auto' follows the seasonal calendar, 'off' is the default oak-and-gold look.
export function themePref(p, id) { return id == null ? 'off' : id; }

export function themesPanel(app, rerender) {
  const p = app.profile;
  const pref = p.settings.theme || 'auto';
  const shown = currentTheme(p);
  const pick = (value) => { p.settings.theme = value; saveProfile(p); app.applyTheme(); rerender(); };

  const preview = (id) => {
    const t = id ? THEMES[id] : null;
    const cv = mapThumb('meadow', 'preview', 220, t ? { id, ...t } : null);
    cv.className = 'theme-preview';
    return cv;
  };
  const swatches = (id) => {
    const css = id ? THEMES[id].css : {};
    const col = (k, d) => css[k] || d;
    return h('div', { class: 'theme-sw' }, ['--enamel', '--enamel-3', '--line', '--gold'].map((k) => h('i', { style: { background: col(k, { '--enamel': '#2a211b', '--enamel-3': '#4d3c30', '--line': '#6b5442', '--gold': '#f2b33d' }[k]) } })));
  };

  const card = ({ id, name, blurb, unlock, seasonal }) => {
    const value = themePref(p, id);
    const open = id == null || themeUnlocked(p, id);
    const on = pref === value || (pref !== 'auto' && pref !== 'off' && pref === id);
    return h('button', { class: 'theme-card' + (seasonal ? ' seasonal' : ''), 'aria-pressed': String(on), disabled: !open, title: open ? name : `${name}: ${themeUnlockText(unlock)}`, onclick: () => pick(value) },
      preview(id), swatches(id),
      h('b', {}, (open ? '' : '🔒 ') + name),
      h('small', { class: 'muted' }, open ? blurb : themeUnlockText(unlock)),
      h('span', { class: 'theme-state' }, on ? '✓ Equipped' : open ? 'Tap to equip' : 'Locked'));
  };

  const regular = THEME_CATALOG.filter((t) => !t.seasonal);
  const seasonal = THEME_CATALOG.filter((t) => t.seasonal);
  const earned = THEME_CATALOG.filter((t) => t.id == null || themeUnlocked(p, t.id)).length;

  const auto = h('button', { class: 'theme-card auto', 'aria-pressed': String(pref === 'auto'), onclick: () => pick('auto') },
    h('div', { class: 'theme-auto-ico' }, '🗓'),
    h('b', {}, 'Follow the calendar'),
    h('small', { class: 'muted' }, 'Seasonal events dress the realm automatically. Otherwise the default look.'),
    h('span', { class: 'theme-state' }, pref === 'auto' ? '✓ Equipped' : 'Tap to equip'));

  return h('div', { class: 'themes' },
    h('div', { class: 'plaque' },
      h('div', { class: 'row' }, h('h3', { style: { margin: 0 } }, 'Realm themes'), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, `${earned} / ${THEME_CATALOG.length} unlocked`)),
      h('p', { class: 'muted', style: { margin: '.3rem 0 .6rem' } }, shown ? `Now showing: ${THEME_CATALOG.find((t) => t.id === shown.id)?.name || 'a seasonal look'}.` : 'Now showing the default oak-and-gold look.'),
      h('div', { class: 'theme-grid' }, auto, regular.map(card))),
    h('div', { class: 'plaque' },
      h('h3', { style: { marginTop: 0 } }, 'Seasonal looks'),
      h('p', { class: 'muted', style: { margin: '.3rem 0 .6rem' } }, 'Play a seasonal event once and its look is yours to wear all year.'),
      h('div', { class: 'theme-grid' }, seasonal.map(card))));
}
