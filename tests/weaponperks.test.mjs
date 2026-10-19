import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, KEEP, WEAPON_PERK_NODES } from '../src/data/balance.js';
import { runBonus, defaultProfile, keepLevel } from '../src/meta/profile.js';
import { Game } from '../src/game/engine.js';

test('every weapon has four Mastery unlocks, chained in order', () => {
  for (const id of Object.keys(WEAPONS)) {
    const nodes = WEAPON_PERK_NODES.filter((n) => n.weaponPerk === id);
    assert.equal(nodes.length, 4, id);
    nodes.forEach((n, i) => { assert.ok(KEEP.includes(n)); if (i) assert.equal(n.req, nodes[i - 1].id); });
    if (WEAPONS[id].keep) assert.equal(nodes[0].req, WEAPONS[id].keep);
  }
});

test('Mastery perks feed the weapon stats and the extra arrows', () => {
  const p = defaultProfile();
  p.keep.wp_longbow_1 = 1; p.keep.wp_longbow_2 = 1; p.keep.wp_longbow_3 = 1; p.keep.wp_longbow_4 = 1;
  const b = runBonus(p);
  assert.equal(b.weaponPerks.longbow.extra, 2);
  const base = new Game({ seed: 'wp', weapon: 'longbow' });
  const up = new Game({ seed: 'wp', weapon: 'longbow', bonus: b });
  const A = base.weaponStats(), B = up.weaponStats();
  assert.ok(B.dmg > A.dmg * 1.2);
  assert.equal(B.pierce, A.pierce + 2);
  assert.ok(B.splash > 0 && A.splash === 0);
  up.startWave?.();
});

test('three arrows leave the bow with Triple Shot', () => {
  const p = defaultProfile(); p.keep.wp_longbow_2 = 1;
  const g = new Game({ seed: 'wp2', weapon: 'longbow', bonus: runBonus(p) });
  g.phase = 'wave';
  const e = { x: 3, y: 3, size: 0.4, hp: 99, maxHp: 99, vx: 0, vy: 0, dead: false, burrowT: 0 };
  g.enemies.push(e);
  g.pickEnemy = () => ({ enemy: e, headshot: false });
  const before = g.projectiles.length;
  assert.ok(g.heroFire(3, 3));
  assert.equal(g.projectiles.length - before, 3);
});
