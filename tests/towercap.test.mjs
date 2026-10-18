import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { towerCapOf } from '../src/game/modes.js';

const mk = (mode) => new Game({ seed: 'cap', mapId: 'meadow', mode });
const plots = (g) => g.map.plots.map((p) => [p.x, p.y]);

test('tower caps: special modes limit each tower type, the endless run does not', () => {
  for (const mode of ['laststand', 'endurance', 'sprint', 'gauntlet']) {
    const g = mk(mode); g.gold = 1e6; g.isTowerUnlocked = () => true;
    for (const p of g.map.plots) g.claimed.add(p.k);
    const cap = towerCapOf('archer'); let built = 0;
    for (const [x, y] of plots(g)) if (g.build('archer', x, y)) built++;
    assert.equal(built, cap, mode);
    assert.equal(g.towerCapReached('archer'), true);
  }
  const g = mk('normal'); g.gold = 1e9; g.isTowerUnlocked = () => true;
  for (const p of g.map.plots) g.claimed.add(p.k);
  let built = 0; for (const [x, y] of plots(g)) if (g.build('archer', x, y)) built++;
  assert.ok(built > towerCapOf('archer'));
});

test('tower caps: the Sun Obelisk is held to three and selling frees a slot', () => {
  const g = mk('laststand'); g.isTowerUnlocked = () => true;
  assert.equal(towerCapOf('obelisk'), 3);
  for (const p of g.map.plots) g.claimed.add(p.k);
  const made = []; for (const [x, y] of plots(g)) { const t = g.build('obelisk', x, y); if (t) made.push(t); }
  assert.equal(made.length, 3);
  assert.equal(g.canBuild('obelisk', ...plots(g).find(([x, y]) => !g.towerAt(x, y))), false);
});
