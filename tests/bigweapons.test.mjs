import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { WEAPONS, KEEP } from '../src/data/balance.js';

test('every new heavy weapon has a Keep unlock and is slow but strong', () => {
  for (const id of ['mortar', 'thunderlance', 'meteorstaff', 'titanbolt']) {
    const w = WEAPONS[id];
    assert.ok(KEEP.find((k) => k.weapon === id && k.id === w.keep), id);
    assert.ok(w.dmg / w.reload > 0 && w.reload >= 3 && w.ammo <= 2, id);
    assert.ok(w.dmg >= WEAPONS.longbow.dmg * 4, id);
  }
});

test('the Titan Ballista strips a slice of a boss regardless of armor, more when fully charged', () => {
  const g = new Game({ seed: 'tb', mapId: 'meadow', weapon: 'titanbolt' });
  for (let i = 0; i < 20; i++) { g.update(0.1); if (g.boonOffer) g.chooseBoon(g.boonOffer[0]); else break; }
  g.startWave(); g.spawnQueue = [];
  const e = g.spawnEnemy('boss', 0, { boss: 'titan' });
  assert.ok(e && e.boss);
  e.armor = 80; e.mr = 80;
  const shot = (en, pct) => g.heroHit({ dmg: 0.0001, type: 'physical', main: true, hitSet: new Set([en]), pierce: 4, bossPct: pct, crit: false, headshot: false }, en);
  const full = e.maxHp;
  shot(e, WEAPONS.titanbolt.bossPct);
  assert.ok(Math.abs(e.hp - full * 0.4) < full * 0.02, 'took about 60% of max hp');
  e.hp = full; e.markT = 0;
  shot(e, WEAPONS.titanbolt.bossPct * 1.4);
  assert.ok(Math.abs(e.hp - full * 0.16) < full * 0.02, 'charged takes about 84%');
  const grunt = g.spawnEnemy('grunt', 0);
  const gh = grunt.hp;
  shot(grunt, 0.6);
  assert.ok(grunt.hp > gh * 0.99, 'ordinary foes only take the bolt itself');
});
