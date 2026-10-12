import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEEP, KEEP_BRANCHES, ABILITIES, MILESTONES } from '../src/data/balance.js';
import { defaultProfile, runBonus, buyKeep, keepLocked, keepAffordable, recordRun, unlockedAbilities, unlockedWeapons } from '../src/meta/profile.js';
import { COSMETICS } from '../src/meta/achievements.js';
import { TOWER_SKINS, CASTLE_SKINS, TRAILS } from '../src/game/render.js';
import { KILL_FX } from '../src/game/fx.js';
import { Game } from '../src/game/engine.js';

// render.js touches the DOM only inside classes, so importing it under node is fine.
const norm = (b) => JSON.stringify(b, (k, v) => (v instanceof Set ? [...v].sort() : v));

test('keep nodes are well formed and every branch has content', () => {
  const ids = new Set();
  for (const k of KEEP) {
    assert.ok(!ids.has(k.id), 'duplicate id ' + k.id); ids.add(k.id);
    assert.ok(KEEP_BRANCHES[k.branch], 'unknown branch for ' + k.id);
    assert.ok(k.cost.length >= 1 && k.cost.every((c, i) => c > 0 && (i === 0 || c >= k.cost[i - 1])), 'costs ascend for ' + k.id);
    if (k.req) assert.ok(KEEP.some((o) => o.id === k.req), 'req exists for ' + k.id);
  }
  for (const b of Object.keys(KEEP_BRANCHES)) assert.ok(KEEP.filter((k) => k.branch === b).length >= 10, b + ' has plenty to buy');
  assert.ok(KEEP.length >= 100, 'a ton to spend renown on');
});

test('every gameplay upgrade changes the run bonuses; cosmetics change what you own', () => {
  const base = norm(runBonus(defaultProfile()));
  for (const k of KEEP) {
    const p = defaultProfile();
    if (k.req) p.keep[k.req] = 1;
    p.keep[k.id] = 1;
    if (k.cosmetic || k.title) { p.renown = k.cost[0]; p.keep[k.id] = 0; assert.ok(buyKeep(p, k.id)); assert.ok(k.cosmetic ? p.owned.includes(k.cosmetic) : p.titles.includes(k.title)); continue; }
    if (k.weapon) { assert.ok(unlockedWeapons(p).includes(k.weapon)); continue; }
    const withReq = defaultProfile(); if (k.req) withReq.keep[k.req] = 1;
    assert.notEqual(norm(runBonus(p)), norm(runBonus(withReq)), `${k.id} has no effect in runBonus`);
    assert.ok(norm(runBonus(withReq)) !== undefined && base !== undefined);
  }
});

test('upgrades with prerequisites stay locked until the prerequisite is owned', () => {
  const p = defaultProfile(); p.renown = 5000;
  assert.ok(keepLocked(p, KEEP.find((k) => k.id === 'phoenix')));
  assert.equal(buyKeep(p, 'phoenix'), false);
  assert.ok(buyKeep(p, 'secondwind'));
  assert.ok(buyKeep(p, 'phoenix'));
  assert.equal(runBonus(p).secondWindHeal, 0.7);
  assert.ok(keepAffordable(p) > 5);
});

test('every cosmetic in the wardrobe can be drawn', () => {
  for (const [key, names] of Object.entries(COSMETICS)) for (const id of Object.keys(names)) {
    if (key === 'castle') assert.ok(CASTLE_SKINS[id], 'castle ' + id);
    if (key === 'trail') assert.ok(id in TRAILS, 'trail ' + id);
    if (key === 'skin') assert.ok(TOWER_SKINS[id], 'skin ' + id);
    if (key === 'kill') assert.ok(KILL_FX[id], 'kill fx ' + id);
  }
  for (const k of KEEP.filter((x) => x.cosmetic)) { const [cat, id] = k.cosmetic.split(':'); assert.ok(COSMETICS[cat][id], k.cosmetic + ' is listed'); }
});

test('first-run-of-the-day bonus and wave milestones pay once', () => {
  const p = defaultProfile();
  const run = { map: 'meadow', mode: 'normal', modifiers: [], ascension: 0, wave: 22, start: 1, wavesCleared: 21, score: 9000, kills: 400, heroKills: 80, headshots: 10, bossKills: 2, shots: 100, hits: 60, duration: 600, maxCombo: 10, killsByType: {}, dmgByTower: {}, specs: [] };
  const day = new Date('2026-10-10T12:00:00Z');
  const a = recordRun(p, { ...run }, { now: day });
  assert.ok(a.parts.some((x) => x.label.startsWith("Today's first")), 'daily bonus');
  assert.deepEqual(a.milestones.map((m) => m.wave), [5, 10, 15, 20]);
  assert.equal(a.renown, a.parts.reduce((s, x) => s + x.v, 0));
  const b = recordRun(p, { ...run }, { now: day });
  assert.ok(!b.parts.some((x) => x.label.startsWith("Today's first")), 'only the first run of the day');
  assert.equal(b.milestones.length, 0, 'milestones are one-time');
  const c = recordRun(p, { ...run }, { now: new Date('2026-10-11T12:00:00Z') });
  assert.ok(c.parts.some((x) => x.label.startsWith("Today's first")), 'new day, new bonus');
  assert.ok(MILESTONES.length >= 10);
});

test('a head-start run ranks by the discounted wave', () => {
  const p = defaultProfile();
  const run = { map: 'meadow', mode: 'normal', modifiers: [], ascension: 0, wave: 50, start: 40, wavesCleared: 10, score: 80000, kills: 800, heroKills: 80, headshots: 10, bossKills: 1, shots: 100, hits: 60, duration: 600, maxCombo: 10, killsByType: {}, dmgByTower: {}, specs: [] };
  const r = recordRun(p, run);
  assert.ok(p.best.wave.meadow < 50 && p.best.wave.meadow >= 30);
  assert.ok(!r.records.includes('score'), 'no score record from a skipped start');
});

test('new castle abilities are gated by the Keep and work', () => {
  const g0 = new Game({ seed: 'ab' });
  assert.deepEqual(Object.keys(g0.abilities).sort(), ['oil', 'volley']);
  const p = defaultProfile(); p.keep.unlock_nova = 1; p.keep.unlock_horn = 1; p.keep.horndur = 2;
  assert.deepEqual([...unlockedAbilities(p)].sort(), ['horn', 'nova', 'oil', 'volley']);
  const g = new Game({ seed: 'ab', bonus: runBonus(p) });
  assert.ok(g.abilities.nova && g.abilities.horn);
  const t = g.freePlots()[0]; g.build('archer', t.x, t.y);
  g.startWave();
  for (let i = 0; i < 60 * 4; i++) g.update(1 / 60);
  const rate0 = g.towers[0].stats.rate;
  assert.ok(g.useAbility('horn'));
  assert.ok(g.hornT > ABILITIES.horn.duration);
  assert.equal(g.useAbility('horn'), false, 'on cooldown');
  assert.ok(g.useAbility('nova'));
  assert.ok(g.enemies.some((e) => e.slowT > 0) || g.enemies.length === 0);
  assert.ok(rate0 > 0);
});

test('keep effects reach the engine: wall, mending, training, start plots', () => {
  const p = defaultProfile();
  Object.assign(p.keep, { wallplating: 3, mending: 2, plots: 2, train_archer: 5, bulwark: 4, startboon: 1 });
  const bonus = runBonus(p);
  const g = new Game({ seed: 'ke', bonus }), plain = new Game({ seed: 'ke' });
  assert.ok(g.wall.maxHp > plain.wall.maxHp * 1.3);
  assert.equal(g.claimed.size, plain.claimed.size + 2);
  assert.ok(g.boonOffer, 'Veteran\'s Blessing offers a boon at the start');
  const t = g.freePlots()[0], u = plain.freePlots()[0];
  g.build('archer', t.x, t.y); plain.build('archer', u.x, u.y);
  assert.ok(g.towers[0].stats.dmg > plain.towers[0].stats.dmg * 1.2, 'archer training');
  g.wall.hp = 10; g.chooseBoon(g.boonOffer[0]);
  g.startWave(); g.enemies = []; g.spawnQueue = [];
  g.completeWave();
  assert.ok(g.wall.hp > 10 + g.wall.maxHp * 0.09, 'wall mends after a wave');
});

test('head starts cannot buy free milestones, unlocks or achievements', () => {
  const p = defaultProfile();
  const dead = { map: 'meadow', mode: 'normal', modifiers: [], ascension: 0, wave: 60, start: 60, wavesCleared: 0, score: 100, kills: 3, heroKills: 0, headshots: 0, bossKills: 0, shots: 0, hits: 0, duration: 30, maxCombo: 0, killsByType: {}, dmgByTower: {}, specs: [], peakGold: 40000, goldSpent: 30000 };
  const r = recordRun(p, dead);
  assert.equal(r.milestones.length, 0);
  assert.ok((p.best.wave.meadow || 0) <= 1);
  assert.equal(p.ascUnlocked.meadow, undefined);
  assert.ok(!p.achievements.hoard && !p.achievements.spender && !p.achievements.pacifist);
  const played = recordRun(p, { ...dead, wave: 72, wavesCleared: 12, score: 50000, kills: 500, duration: 900 });
  assert.deepEqual(played.milestones.map((m) => m.wave), [40], 'only waves beyond the head start credit pay out');
});
