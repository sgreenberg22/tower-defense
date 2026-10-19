// v1.37 · Polish pass: locks in the fixes that were found in the audit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('the event info sheet has the Renown bonus it prints (it used to throw)', () => {
  const home = read('src/ui/home.js');
  assert.match(home, /EVENT_RENOWN_BONUS/);
  assert.match(home, /import \{ EVENT_RENOWN_BONUS \} from '\.\.\/data\/events\.js'/);
});

test('every keyboard shortcut in a run is bound once: G is the Garrison, B the Foes guide', () => {
  const play = read('src/ui/play.js');
  const body = play.slice(play.indexOf('this.onKey = (e) =>'), play.indexOf("window.addEventListener('keydown', this.onKey)"));
  const cases = [...body.matchAll(/case '([^']+)':/g)].map((m) => m[1]);
  assert.equal(new Set(cases).size, cases.length, 'duplicate case labels: ' + cases.filter((c, i) => cases.indexOf(c) !== i).join(', '));
  assert.match(body, /case 'g': this\.togglePanel\('garrison'\)/);
  assert.match(body, /case 'b': this\.foeGuide\(\)/);
  assert.match(play, /K\('B', 'Foe guide/);
});

test('the Daily orders list unfolds under its own row, not inside the folded block', () => {
  const home = read('src/ui/home.js');
  assert.match(home, /const keep = rows\.slice\(0, 2\);/);
  assert.match(home, /h\('div', \{ class: 'today-more', hidden: !app\.todayMore \}, rows\.slice\(2\), more\)/);
});

test('the polish layer loads after the base styles and honors Reduced motion', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('css/style.css') < html.indexOf('css/polish.css'));
  const css = read('css/polish.css');
  assert.match(css, /\[data-reduced-motion="true"\] \*/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
