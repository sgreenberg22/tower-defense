// v1.38: Hero Mode (first person, the commander builds) and the Daily Siege puzzle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { GAME, TOWERS, TIER } from '../src/data/balance.js';
import { ACHIEVEMENTS } from '../src/meta/achievements.js';
import { defaultProfile, recordRun, runSlot } from '../src/meta/profile.js';
import { SIEGE, SIEGE_COST, SIEGE_MAX, siegeSetup, siegeScore, isLocalMode } from '../src/game/modes.js';
import { threatProfile, towerFit, autoCommand } from '../src/game/autobuild.js';
import { validateRun } from '../src/game/rules.js';

const by = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
const run = (g, secs) => { for (let t = 0; t < secs && !g.over; t += GAME.step) { if (g.boonOffer) g.chooseBoon(g.boonOffer[0]); g.update(GAME.step); } };

test('Hero Mode: the commander builds at once and keeps building a mix as the waves come', () => {
  const g = new Game({ seed: 'hero-t', mapId: 'meadow', mode: 'hero', weapon: 'longbow' });
  assert.equal(g.hero, true); assert.equal(g.auto, true);
  assert.ok(g.towers.length >= 1, 'built before the first wave');
  assert.ok(Number.isFinite(g.buildTimer), 'the first wave comes by itself');
  run(g, 900);
  const types = new Set(g.towers.map((t) => t.type));
  assert.ok(g.wave >= 8, 'held a while without any shooting: ' + g.wave);
  assert.ok(types.size >= 3, 'a mix of towers: ' + [...types]);
  assert.ok(g.towers.some((t) => t.tier >= 2), 'upgrades happen');
});

test('the commander reads the wave: flyers favour flak and archers, armor favours ballistas and mages', () => {
  const air = { air: 0.8, armor: 0, fast: 0, mr: 0, swarm: 0.2, boss: 0 }, arm = { air: 0, armor: 0.8, fast: 0, mr: 0, swarm: 0.2, boss: 0 };
  assert.ok(towerFit('flak', air) > towerFit('cannon', air));
  assert.ok(towerFit('ballista', arm) > towerFit('archer', arm));
  assert.ok(towerFit('mage', arm) > towerFit('flak', arm));
  const g = new Game({ seed: 'th', mapId: 'meadow', mode: 'hero' });
  const th = threatProfile(g);
  for (const k of ['air', 'armor', 'fast', 'mr', 'swarm']) assert.ok(th[k] >= 0 && th[k] <= 1, k);
});

test('Hero Mode keeps its own save slot and records, and never counts toward the classic wave record', () => {
  assert.equal(runSlot('hero'), 'hero'); assert.equal(runSlot('siege'), 'siege'); assert.ok(isLocalMode('hero'));
  const g = new Game({ seed: 'hero-r', mapId: 'meadow', mode: 'hero' });
  assert.equal(g.serialize().hero, true);
  const p = defaultProfile();
  recordRun(p, { ...g.summary(), wave: 21, heroKills: 40, headshots: 7 });
  assert.equal(p.hero.runs, 1); assert.equal(p.hero.wave, 21);
  assert.equal(p.best.wave.meadow || 0, 0);
  assert.ok(by.hero1.check(p) && by.hero_w15.check(p) && by.hero_cmd.check(p) && !by.hero_w30.check(p));
  const back = new Game({ seed: 'hero-r', mapId: 'meadow', mode: 'hero', save: g.serialize() });
  assert.equal(back.auto, true);
});

test('the Daily Siege: same setup for everyone, a roster, points, tier-3 towers and doubled hills', () => {
  const S = siegeSetup('2026-10-19');
  assert.deepEqual(S, siegeSetup('2026-10-19'));
  assert.equal(S.roster.length, SIEGE.roster); assert.ok(S.roster.includes('archer'));
  assert.equal(new Set(S.roster).size, S.roster.length);
  const g = new Game({ seed: S.seed, mapId: S.map, mode: 'siege' });
  assert.equal(g.points, SIEGE.points); assert.equal(g.wave, SIEGE.start); assert.equal(g.gold, 0);
  const off = Object.keys(TOWERS).find((id) => !S.roster.includes(id) && SIEGE_COST[id]);
  assert.equal(g.isTowerUnlocked(off), false);
  const hill = g.map.plots.find((p) => p.high), flat = g.map.plots.find((p) => !p.high);
  const a = g.build('archer', hill.x, hill.y), b = g.build('archer', flat.x, flat.y);
  assert.ok(a && b); assert.equal(a.tier, SIEGE.tier); assert.equal(g.points, SIEGE.points - 2);
  assert.ok(a.stats.range - b.stats.range > TIER.highGroundRange * 1.5, 'hills count double');
  assert.equal(g.canUpgrade(a), false);
  g.sell(b); assert.equal(g.points, SIEGE.points - 1, 'removing a tower refunds its points');
  g.startWave();
  assert.equal(g.locked(), true); assert.equal(g.build('archer', flat.x, flat.y), null);
  assert.equal(g.heroFire(1, 1), false); assert.equal(g.useAbility(g.loadout[0], 1, 1), false);
});

test('a siege runs its ten waves by itself and scores by the formula', () => {
  const S = siegeSetup('2026-10-23');
  const g = new Game({ seed: S.seed, mapId: S.map, mode: 'siege' });
  for (const p of [...g.map.plots].sort((x, y) => (y.high ? 1 : 0) - (x.high ? 1 : 0))) { if (g.points < 1) break; g.build('archer', p.x, p.y); }
  g.startWave();
  run(g, 3000);
  assert.equal(g.over, true);
  if (g.victory) assert.equal(g.stats.wavesCleared, SIEGE.waves);
  assert.ok(g.score >= g.stats.wavesCleared * 100 && g.score <= SIEGE_MAX);
  assert.equal(siegeScore({ wavesCleared: 10, castlePct: 1, wallPct: 1, left: 0, victory: true }), 1700);
  assert.equal(siegeScore({ wavesCleared: 4 }), 400);
  const p = defaultProfile(); const sum = g.summary();
  recordRun(p, sum);
  assert.equal(p.siege.days['2026-10-23'].score, sum.score);
  assert.equal(validateRun({ ...sum, start: 1, modifiers: [] }), null);
});

test('siege achievements', () => {
  const p = defaultProfile(); p.siege = { days: { '2026-10-19': { score: 2100, win: true } }, wins: 1, played: 1 };
  assert.ok(by.siege1.check(p) && by.siege_2k.check(p) && !by.siege7.check(p));
});

test('a foe held by soldiers it can never beat shoves free after a while', async () => {
  const { HOLD } = await import('../src/game/engine.js');
  const g = new Game({ seed: 'hold', mapId: 'meadow', mode: 'normal' });
  g.startWave(); for (let i = 0; i < 400 && !g.enemies.length; i++) g.update(GAME.step);
  const e = g.enemies[0], so = { dead: false, hp: 1e12, maxHp: 1e12, armor: 99.99, x: e.x, y: e.y };
  e.blocker = so;
  for (let t = 0; t < HOLD.max + 1; t += GAME.step) g.update(GAME.step);
  assert.notEqual(e.blocker, so, 'released');
  assert.ok(e.holdImmune > 0 || e.dead);
});

test('stuns cannot chain forever', async () => {
  const { HOLD } = await import('../src/game/engine.js');
  const g = new Game({ seed: 'stun', mapId: 'meadow', mode: 'normal' });
  g.startWave(); for (let i = 0; i < 400 && !g.enemies.length; i++) g.update(GAME.step);
  const e = g.enemies[0]; let free = 0;
  for (let t = 0; t < 12; t += GAME.step) { g.stun(e, 1); const was = e.stunT > 0; g.update(GAME.step); if (!was || e.stunT <= 0) free++; }
  assert.ok(free > 0, 'it gets moments to move');
  assert.ok(HOLD.stunChain >= 2);
});

test('Hero Mode adaptive start tunes itself on Hero runs only', async () => {
  const { adaptiveStart } = await import('../src/meta/adaptive.js');
  const p = defaultProfile();
  p.history = Array.from({ length: 6 }, () => ({ map: 'meadow', wave: 80, start: 1, mode: 'normal' }));
  assert.equal(adaptiveStart(p, 'meadow', 'hero').start, 1, 'classic runs do not set the Hero start');
  p.history.push(...Array.from({ length: 6 }, () => ({ map: 'meadow', wave: 50, start: 1, mode: 'hero' })));
  const a = adaptiveStart(p, 'meadow', 'hero');
  assert.ok(a.start >= 20 && a.start <= 40, String(a.start));
  const g = new Game({ seed: 'ha', mapId: 'meadow', mode: 'hero', startWave: a.start });
  assert.equal(g.start, a.start); assert.ok(g.towers.length >= 3, 'the commander builds with the head start');
  assert.equal(validateRun({ ...g.summary(), wave: a.start + 3, wavesCleared: 3, duration: 200, modifiers: [] }), null);
});
