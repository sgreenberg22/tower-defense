import test from 'node:test';
import assert from 'node:assert/strict';
import { plural } from '../src/core/plural.js';
import { ENEMIES, TROOPS } from '../src/data/balance.js';

test('plural: foe and troop names read right in the Realm and codex', () => {
  assert.equal(plural('Harpy'), 'Harpies');
  assert.equal(plural('Cavalry'), 'Cavalry');
  assert.equal(plural('Gold Thief'), 'Gold Thieves');
  assert.equal(plural('Griffon Rider'), 'Griffon Riders');
  assert.equal(plural('Grunt'), 'Grunts');
  for (const d of [...Object.values(ENEMIES), ...Object.values(TROOPS)]) assert.ok(!/ys$/.test(plural(d.name)) || /(ay|ey|oy|uy)s$/.test(plural(d.name)), d.name);
});
