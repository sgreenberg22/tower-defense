import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COLLECTION } from '../src/ui/hubs.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('the Collection groups achievements, wardrobe, themes, bestiary, codex and chronicle', () => {
  assert.deepEqual(COLLECTION.map(([id]) => id), ['ach', 'ward', 'theme', 'beast', 'codex', 'stats']);
  for (const f of ['src/ui/screens.js', 'src/ui/codex.js']) assert.match(read(f), /collectionBar\(app/);
});

test('the home page has four doors and no hidden "More" drawer; the rest hangs off a hub', () => {
  const home = read('src/ui/home.js');
  assert.doesNotMatch(home, /moreOpen|Show less/);
  assert.match(home, /app\.showHelp\(\)/);
  assert.match(read('src/ui/screens.js'), /dynastyLink\(app\)/);                  // Dynasty lives in the Keep
  assert.match(read('src/ui/screens.js'), /\['world', 'World Stats'\]/);          // World Stats lives with the Realm
});

test('newcomers get a quieter page', () => {
  const home = read('src/ui/home.js');
  assert.match(home, /isNewcomer = \(p\) => \(p\.stats\.runs \|\| 0\) < 3/);
});
