// v1.60.2 · Accessibility pass: menus can be zoomed, modals are named and trap focus, ARIA and label-in-name fixes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lockZoom } from '../src/ui/nozoom.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ---------- Zoom ----------
test('the viewport meta no longer blocks pinch-zoom (WCAG 1.4.4)', () => {
  const meta = /<meta name="viewport" content="([^"]*)"/.exec(read('index.html'))[1];
  assert.ok(!/user-scalable\s*=\s*(no|0)/.test(meta), meta);
  assert.ok(!/maximum-scale/.test(meta), meta);
  assert.match(meta, /width=device-width/);
});

test('page zoom is locked only while a run is on screen', () => {
  const css = read('css/style.css');
  assert.match(css, /html, body, \* \{ touch-action: manipulation; \}/, 'menus: pinch allowed, double-tap zoom off');
  assert.match(css, /body\[data-where="game"\], body\[data-where="game"\] \* \{ touch-action: pan-x pan-y; \}/, 'runs: locked');
  assert.match(read('src/main.js'), /document\.body\.dataset\.where = v/, 'App.where is mirrored onto <body>');
});

test('lockZoom cancels pinch gestures during a run and leaves them alone in the menus', () => {
  const handlers = {};
  globalThis.document = { addEventListener: (t, fn) => { (handlers[t] ||= []).push(fn); } };
  let playing = false;
  lockZoom(() => playing);
  const ev = (extra = {}) => { const e = { cancelable: true, prevented: false, preventDefault() { this.prevented = true; }, ...extra }; return e; };
  const fire = (type, e) => handlers[type].forEach((fn) => fn(e));

  // Menus: nothing is cancelled, so the browser can zoom.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) { const e = ev(); fire(type, e); assert.equal(e.prevented, false, type + ' in a menu'); }
  const pinchMenu = ev({ touches: [{}, {}] }); fire('touchmove', pinchMenu); assert.equal(pinchMenu.prevented, false, 'two fingers in a menu');

  // Runs: pinch is cancelled, a lone drag is not.
  playing = true;
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) { const e = ev(); fire(type, e); assert.equal(e.prevented, true, type + ' in a run'); }
  const pinchRun = ev({ touches: [{}, {}] }); fire('touchmove', pinchRun); assert.equal(pinchRun.prevented, true, 'two fingers in a run');
  const drag = ev({ touches: [{}] }); fire('touchmove', drag); assert.equal(drag.prevented, false, 'one finger is a drag, never cancelled');
  const nonCancelable = ev({ touches: [{}, {}], cancelable: false }); fire('touchmove', nonCancelable); assert.equal(nonCancelable.prevented, false, 'an uncancelable event is left alone');
  delete globalThis.document;
});

// ---------- Modals ----------
import { trapTarget, FOCUSABLE } from '../src/ui/focus.js';

test('trapTarget wraps Tab and Shift+Tab inside a dialog and leaves the middle alone', () => {
  const [a, b, c] = ['a', 'b', 'c'];
  const list = [a, b, c];
  assert.equal(trapTarget(list, c, false), a, 'Tab off the last control wraps to the first');
  assert.equal(trapTarget(list, a, true), c, 'Shift+Tab off the first control wraps to the last');
  assert.equal(trapTarget(list, a, false), null, 'Tab from the first lets the browser move on');
  assert.equal(trapTarget(list, b, true), null, 'Shift+Tab from the middle lets the browser move back');
  assert.equal(trapTarget(list, 'outside', false), a, 'focus outside the dialog comes back to the first control');
  assert.equal(trapTarget(list, 'outside', true), c, 'Shift+Tab from outside comes back to the last control');
  assert.equal(trapTarget([], a, false), null, 'an empty dialog has nothing to wrap to');
  assert.equal(trapTarget([a], a, false), a, 'a single control wraps to itself');
  assert.equal(trapTarget([a], a, true), a);
  assert.match(FOCUSABLE, /button:not\(\[disabled\]\)/);
});

test('modal() names its dialog, traps Tab and returns focus to the opener', () => {
  const src = read('src/ui/dom.js');
  assert.match(src, /aria-labelledby/, 'named from a heading');
  assert.match(src, /box\.querySelector\('h1, h2, h3'\) \|\| box\.querySelector\('p'\)/, 'heading first, then a paragraph');
  assert.match(src, /setAttribute\('aria-label', 'Dialog'\)/, 'plain fallback so a dialog is never unnamed');
  assert.match(src, /e\.key === 'Tab' && root\.lastElementChild === back/, 'only the topmost dialog traps Tab');
  assert.match(src, /opener\.focus\(\{ preventScroll: true \}\);\n\s+onClose && onClose\(\)/, 'focus returns before onClose runs');
});

// ---------- ARIA and label-in-name (WCAG 4.1.2, 2.5.3) ----------
test('the how-to tour chips are real tabs inside their tablist', () => {
  const src = read('src/ui/howto.js');
  assert.match(src, /class: 'ht-chip', role: 'tab'/, 'aria-selected is only valid on a tab');
  assert.match(src, /class: 'howto-steps', role: 'tablist'/);
});

test('the ammo gauge has a role and says how much is left', () => {
  const src = read('src/ui/play.js');
  assert.match(src, /class: 'ammo', role: 'img'/, 'aria-label needs a role');
  assert.match(src, /`Ammo: \$\{g\.weapon\.ammo\} of \$\{W\.ammo\}`/);
});

test('HUD controls name every word you can see on them', () => {
  const play = read('src/ui/play.js');
  assert.match(play, /'Hero: first-person view from the castle wall'/, 'the Hero button says Hero');
  assert.match(play, /'Wall: your place on the castle wall, in first person'/, 'the Commander wall button says Wall');
  assert.match(play, /`\$\{TOWERS\[id\]\.name\} \(\$\{b\.querySelector\('\.k'\)\?\.textContent \|\| ''\}\), \$\{c\.textContent\}`/, 'tower bar: name, hotkey, cost or unlock wave');
  assert.match(play, /'aria-label': `\$\{A\.name\} \(\$\{key\}\)\. \$\{A\.desc\}`/, 'castle arts carry their key');
  assert.ok(play.includes("' \u00d7' + it.count"), 'foe chips carry the count shown on them');
  assert.match(read('src/ui/commander.js'), /`\$\{D\.name\} \(\$\{CMD_KEYS\[i\]\}\), \$\{D\.cost\} command points\. \$\{D\.blurb\}`/);
});

test('the home screen names its buttons from what they show', () => {
  const home = read('src/ui/home.js');
  assert.ok(!/'data-mode': m\.id, 'aria-label'/.test(home), 'mode tiles take their name from the words on them');
  assert.match(home, /art\.setAttribute\('aria-hidden', 'true'\)/, 'the thumbnail is decorative');
  assert.match(home, /'aria-label': `\$\{play\.label\} \$\{play\.sub\}`/, 'Play button: no colon, matches the visible words');
});
