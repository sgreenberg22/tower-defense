// v1.68.0 · Sea Siege: new fields, the opt-in Ram ship, new feats.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { ENEMIES } from '../src/data/balance.js';
import { NAVAL } from '../src/game/naval.js';
import { ACHIEVEMENTS } from '../src/meta/achievements.js';
import { readFileSync } from 'node:fs';

const mk = (o = {}) => { const g = new Game({ seed: 'sea-c', mapId: 'rivermouth', mode: 'seasiege', ...o }); while (g.boonOffer) g.chooseBoon(g.boonOffer[0]); return g; };
const fleet = (g, w) => { g.wave = w; g.spawnQueue = []; for (let i = 0; i < 6; i++) g.spawnQueue.push({ t: i, type: 'grunt' }); g.navalPlan(); return g.spawnQueue; };

test('both new fields load and keep Sea Siege on a sea map', () => {
  for (const id of ['rivermouth', 'skerry']) assert.equal(mk({ mapId: id }).mapId, id);
  assert.equal(new Game({ seed: 'x', mapId: 'skerry', mode: 'normal' }).mapId, 'meadow');
});
test('ram ships are opt-in: none by default, some from wave 10 with Rough seas', () => {
  assert.ok(ENEMIES.ramship.naval.ram.dmg > 0);
  assert.equal(fleet(mk(), 12).filter((s) => s.ship === 'ramship').length, 0);
  assert.equal(fleet(mk({ seaPlus: true }), NAVAL.ramFrom - 1).filter((s) => s.ship === 'ramship').length, 0);
  assert.equal(fleet(mk({ seaPlus: true }), NAVAL.ramFrom).filter((s) => s.ship === 'ramship').length, 1);
  assert.ok(fleet(mk({ seaPlus: true }), 40).filter((s) => s.ship === 'ramship').length <= 3);
});
test('a ram ship strikes the keep once on arrival', () => {
  const g = mk({ seaPlus: true }); g.startWave();
  const e = g.spawnShip({ ship: 'ramship', lane: g.map.lanes[0], cargo: [] });
  const w0 = g.wall.hp, c0 = g.castle.hp;
  g.shipArrive(e); g.shipArrive(e);
  assert.ok(g.wall.hp + g.castle.hp < w0 + c0);
  assert.equal(g.stats.shelled, 1, 'one strike only');
});
test('Rough seas survives a save', () => {
  const g = mk({ seaPlus: true });
  const s = JSON.parse(JSON.stringify(g.serialize()));
  assert.equal(new Game({ seed: 'sea-c', mapId: 'rivermouth', mode: 'seasiege', save: s }).seaPlus, true);
  assert.equal(new Game({ seed: 'sea-c', mapId: 'rivermouth', mode: 'seasiege', save: JSON.parse(JSON.stringify(mk().serialize())) }).seaPlus, false);
});
test('the new feats exist and read the profile', () => {
  const by = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
  const p = { local: { seasiege: { sunk: 500, drowned: 500, rivermouth: 15, skerry: 15 } } };
  for (const id of ['sea_sink500', 'sea_drown500', 'sea_river', 'sea_skerry']) assert.ok(by[id]?.check(p), id);
  assert.ok(!by.sea_river.check({ local: {} }));
});
test('the setup screen offers Rough seas for Sea Siege only', () => {
  const lo = readFileSync(new URL('../src/ui/local.js', import.meta.url), 'utf8');
  assert.match(lo, /Rough seas/); assert.match(lo, /seaPlus: id === 'seasiege' && st\.seaPlus/);
});
