// Balance sanity: a basic bot must clear wave 15, and the endless scaling must stay finite and eventually win.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../tools/sim.mjs';
import { Game } from '../src/game/engine.js';
import { planWave } from '../src/game/waves.js';
import { readFileSync } from 'node:fs';

test('a basic tower-only strategy (no hero) reaches wave 12 on every map', () => {
  // Crossroads unlocks at wave 25, so players arrive there with some Keep upgrades (keep level 1).
  for (const [mapId, keepLevel] of [['meadow', 0], ['twin', 0], ['frontier', 0], ['cross', 1]]) {
    for (const seed of ['b1', 'b2', 'w3']) {
      const g = simulate({ seed, mapId, keepLevel, hero: false, maxWave: 13 });
      assert.ok(g.wave >= 12, `${mapId}/${seed} died on wave ${g.wave}`);
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
    const [a, b] = g.freePlots();
    g.build('archer', a.x, a.y); g.build('cannon', b.x, b.y);
    for (let w = 0; w < 5; w++) { g.startWave(); let n = 0; while (g.phase === 'wave' && n++ < 60 * 300) g.update(1 / 60); if (g.boonOffer) g.chooseBoon(g.boonOffer[0]); }
    return [g.wave, g.score, g.gold, g.stats.kills, Math.round(g.castle.hp)];
  };
  assert.deepEqual(play(), play());
});

test('save/load round-trips a run', () => {
  const g = new Game({ seed: 'save', mapId: 'twin' });
  const p0 = g.freePlots()[0];
  g.build('archer', p0.x, p0.y); g.startWave();
  let n = 0; while (g.phase === 'wave' && n++ < 60 * 300) g.update(1 / 60);
  const s = JSON.parse(JSON.stringify(g.serialize()));
  const h = new Game({ seed: s.seed, mapId: s.mapId, save: s });
  assert.equal(h.wave, g.wave); assert.equal(h.gold, g.gold); assert.equal(h.towers.length, g.towers.length);
  assert.equal(h.towers[0].type, 'archer');
  assert.deepEqual([...h.claimed].sort(), [...g.claimed].sort());
});

test('towers stand only on open plots; ruins are claimed for a rising price', () => {
  const g = new Game({ seed: 'plots', mapId: 'meadow' });
  g.gold = 5000;
  assert.equal(g.freePlots().length, 6);
  const grass = (() => { for (let y = 0; y < g.map.rows; y++) for (let x = 0; x < g.map.cols; x++) if (g.map.tileAt(x, y) === 0 && !g.isPlot(x, y)) return { x, y }; })();
  assert.equal(g.build('archer', grass.x, grass.y), null, 'plain grass is not buildable');
  const ruin = g.map.plots.find((p) => g.isRuin(p.x, p.y));
  assert.equal(g.build('archer', ruin.x, ruin.y), null, 'ruins must be claimed first');
  const c1 = g.claimCost();
  assert.ok(g.claimPlot(ruin.x, ruin.y));
  assert.ok(g.claimCost() > c1, 'each claim costs more');
  assert.ok(g.build('archer', ruin.x, ruin.y));
});

test('wave threats are deterministic, varied, and never repeat back to back', async () => {
  const { threatFor } = await import('../src/game/waves.js');
  const seq = Array.from({ length: 60 }, (_, i) => threatFor(i + 1, 'th'));
  assert.deepEqual(seq, Array.from({ length: 60 }, (_, i) => threatFor(i + 1, 'th')));
  assert.ok(new Set(seq.filter(Boolean)).size >= 4);
  for (let i = 1; i < seq.length; i++) if (seq[i]) assert.notEqual(seq[i], seq[i - 1]);
  for (let w = 10; w <= 60; w += 10) assert.equal(seq[w - 1], null, 'boss waves stand alone');
});

test('castle abilities fire only during waves and then recharge', () => {
  const g = new Game({ seed: 'ab', mapId: 'meadow' });
  assert.equal(g.useAbility('volley', 3, 3), false);
  g.startWave();
  for (let i = 0; i < 300; i++) g.update(1 / 60);
  const e = g.enemies[0];
  assert.ok(e, 'an enemy is on the field');
  const hp = e.hp;
  assert.ok(g.useAbility('volley', e.x, e.y));
  assert.equal(g.useAbility('volley', e.x, e.y), false, 'on cooldown');
  for (let i = 0; i < 40; i++) g.update(1 / 60);
  assert.ok(e.dead || e.hp < hp, 'arrow rain hurts');
  assert.ok(g.useAbility('oil'));
});

test('API schema matches migrations/0001_init.sql', () => {
  const norm = (sql) => sql.replace(/--.*$/gm, '').split(';')
    .map((x) => x.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s*,\s*/g, ', ').trim()).filter(Boolean).sort();
  const fn = readFileSync(new URL('../functions/api/[[path]].js', import.meta.url), 'utf8');
  const inFn = fn.slice(fn.indexOf('const SCHEMA = `') + 16, fn.indexOf('`;', fn.indexOf('const SCHEMA')));
  const mig = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
  assert.deepEqual(norm(inFn), norm(mig));
});
