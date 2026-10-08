// Balance sanity: a basic bot must clear wave 15, and the endless scaling must stay finite and eventually win.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../tools/sim.mjs';
import { Game } from '../src/game/engine.js';
import { planWave } from '../src/game/waves.js';
import { readFileSync } from 'node:fs';

test('a basic strategy reaches wave 15 on every map', () => {
  // Crossroads unlocks at wave 25, so players arrive there with some Keep upgrades (keep level 1).
  for (const [mapId, keepLevel] of [['meadow', 0], ['twin', 0], ['frontier', 0], ['cross', 1]]) {
    for (const seed of ['b1', 'b2', 'w3']) {
      const g = simulate({ seed, mapId, keepLevel, hero: false, maxWave: 16 });
      assert.ok(g.wave >= 15, `${mapId}/${seed} died on wave ${g.wave}`);
    }
  }
});

test('the siege eventually wins: maxed bot does not run forever', () => {
  const g = simulate({ seed: 'cap', keepLevel: 2, hero: true, maxWave: 250 });
  assert.ok(g.over, 'run should end before wave 250');
  assert.ok(g.wave >= 40, `maxed bot should go deep (got ${g.wave})`);
});

test('wave 200 plans are sane', () => {
  const p = planWave(200, 'deep');
  assert.ok(p.total <= 111 && Number.isFinite(p.hp) && p.hp > 1000);
});

test('engine is deterministic for a seed and an action script', () => {
  const play = () => {
    const g = new Game({ seed: 'det', mapId: 'meadow' });
    g.build('archer', 2, 4); g.build('cannon', 6, 4);
    for (let w = 0; w < 5; w++) { g.startWave(); let n = 0; while (g.phase === 'wave' && n++ < 60 * 300) g.update(1 / 60); if (g.boonOffer) g.chooseBoon(g.boonOffer[0]); }
    return [g.wave, g.score, g.gold, g.stats.kills, Math.round(g.castle.hp)];
  };
  assert.deepEqual(play(), play());
});

test('save/load round-trips a run', () => {
  const g = new Game({ seed: 'save', mapId: 'twin' });
  g.build('archer', 2, 3); g.startWave();
  let n = 0; while (g.phase === 'wave' && n++ < 60 * 300) g.update(1 / 60);
  const s = JSON.parse(JSON.stringify(g.serialize()));
  const h = new Game({ seed: s.seed, mapId: s.mapId, save: s });
  assert.equal(h.wave, g.wave); assert.equal(h.gold, g.gold); assert.equal(h.towers.length, g.towers.length);
  assert.equal(h.towers[0].type, 'archer');
});

test('API schema matches migrations/0001_init.sql', () => {
  const norm = (sql) => sql.replace(/--.*$/gm, '').split(';')
    .map((x) => x.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s*,\s*/g, ', ').trim()).filter(Boolean).sort();
  const fn = readFileSync(new URL('../functions/api/[[path]].js', import.meta.url), 'utf8');
  const inFn = fn.slice(fn.indexOf('const SCHEMA = `') + 16, fn.indexOf('`;', fn.indexOf('const SCHEMA')));
  const mig = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
  assert.deepEqual(norm(inFn), norm(mig));
});
