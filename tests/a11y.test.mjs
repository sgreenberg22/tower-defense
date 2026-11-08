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
