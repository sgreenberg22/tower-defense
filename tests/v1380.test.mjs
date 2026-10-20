// v1.37.8: Hero Mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { ACHIEVEMENTS } from '../src/meta/achievements.js';
import { defaultProfile, recordRun } from '../src/meta/profile.js';

test('a Hero Mode run is flagged in the save and summary, and recorded on the profile', () => {
  const g = new Game({ seed: 'hero', mapId: 'meadow', mode: 'normal', modifiers: ['lonehero'], hero: true });
  assert.equal(g.hero, true);
  assert.equal(g.serialize().hero, true);
  const sum = g.summary();
  assert.equal(sum.hero, true);
  const p = defaultProfile();
  recordRun(p, { ...sum, wave: 16, heroKills: 40, headshots: 7 });
  assert.equal(p.hero.runs, 1); assert.equal(p.hero.wave, 16); assert.equal(p.hero.headshots, 7);
  const by = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
  assert.ok(by.hero1.check(p)); assert.ok(by.hero_w15.check(p)); assert.ok(!by.hero_w30.check(p));
});

test('ordinary runs are not Hero runs', () => {
  assert.equal(new Game({ seed: 'x', mapId: 'meadow', mode: 'normal' }).hero, false);
});
