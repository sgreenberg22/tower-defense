// v1.14.2 · Bug-fix and balance pass: each test pins one fixed behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import * as eco from '../src/game/economy.js';
import { TOWERS, TOWER_ORDER } from '../src/data/balance.js';
import { readFileSync } from 'node:fs';

function arena(wave = 30) {
  const g = new Game({ seed: 'fixes', mapId: 'meadow', startWave: wave });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  for (const p of g.map.plots) g.claimed.add(p.k);
  g.startWave(); g.spawnQueue = []; g.enemies = [];
  return g;
}
// Build a tower at tier 5 with the given spec (gold is topped up as needed).
function specTower(g, type, spec, plot = 0) {
  g.gold = 1e9;
  const p = g.map.plots[plot];
  const t = g.build(type, p.x, p.y);
  while (t.tier < 4) g.upgrade(t);
  g.chooseSpec(t, spec);
  return t;
}

test('armored-foe bonuses work on every kind of shot, not just ballista bolts', () => {
  const g = arena();
  const foe = () => { const e = g.spawnEnemy('golem', 0); e.armor = 50; e.shield = 0; e.hp = e.maxHp = 1e9; return e; };
  // Homing arrow (Gatling Armor Piercer, ×1.6 vs armored).
  const a = foe(), b = foe();
  g.stepProjectile({ kind: 'arrow', src: null, dmg: 100, type: 'physical', x: a.x, y: a.y, target: a, lx: a.x, ly: a.y, speed: 10, splash: 0, chain: 0, s: {}, armoredMult: 1.6 }, 1);
  g.stepProjectile({ kind: 'arrow', src: null, dmg: 100, type: 'physical', x: b.x, y: b.y, target: b, lx: b.x, ly: b.y, speed: 10, splash: 0, chain: 0, s: {} }, 1);
  assert.ok(Math.abs((1e9 - a.hp) / (1e9 - b.hp) - 1.6) < 1e-6, 'homing shots apply armoredMult');
  // Splash (Cannon Siege Shells mastery).
  g.enemies = [];
  const c = foe(); c.x = 3; c.y = 3;
  g.explode({ splash: 0.5, dmg: 100, type: 'physical', src: null, kind: 'ball', armoredMult: 2 }, c.x, c.y);
  const d = foe(); d.x = 3; d.y = 3; c.dead = true;
  g.explode({ splash: 0.5, dmg: 100, type: 'physical', src: null, kind: 'ball' }, d.x, d.y);
  assert.ok(Math.abs((1e9 - c.hp) / (1e9 - d.hp) - 2) < 1e-6, 'splash applies armoredMult');
});

test('Arcane Lance ignores magic resist on its single-target hits', () => {
  const g = arena();
  const t = specTower(g, 'mage', 'lance');
  assert.equal(t.stats.chain, 0);
  const e = g.spawnEnemy('warlock', 0); e.mr = 50; e.shield = 0; e.hp = e.maxHp = 1e9;
  g.towerFire(t, t.stats, e);
  const p = g.projectiles.at(-1);
  p.x = e.x; p.y = e.y; p.crit = false;
  g.stepProjectile(p, 1);
  assert.ok(Math.abs(1e9 - e.hp - p.dmg) < 1e-3, `full damage through 50 MR (took ${1e9 - e.hp}, shot ${p.dmg})`);
});

test('Sharpshooter suggests "strongest" but obeys the targeting you pick', () => {
  const g = arena();
  const t = specTower(g, 'archer', 'sharpshooter');
  assert.equal(t.targetMode, 'strong');
  g.setTargeting(t, 'first');
  const near = g.spawnEnemy('grunt', 0), tough = g.spawnEnemy('golem', 0);
  for (const e of [near, tough]) { e.x = t.cx + 0.3; e.y = t.cy; }
  near.dist = 50; tough.dist = 1; near.total = tough.total = 100;
  assert.equal(g.pickTarget(t, t.stats), near, 'first means the leader, whatever its HP');
});

test('a partial wall patch spends your gold on as much wall as it buys', () => {
  const g = new Game({ seed: 'patch', mapId: 'meadow' });
  g.wall.hp = 0; g.gold = 40;
  const rate = eco.wallRepairCost(1000, g.wave, 0) / 1000;
  assert.ok(rate < 1, 'early wall repairs cost under 1 gold per HP');
  assert.ok(g.repairWall());
  assert.ok(g.wall.hp >= Math.floor(40 / rate) - 1, `patched ${g.wall.hp} HP for 40 gold`);
  assert.ok(g.gold >= 0 && g.gold < 2, 'and used (almost) all of it');
});

test('the early-call gold the HUD shows is what you get', () => {
  const g = new Game({ seed: 'early', mapId: 'meadow', bonus: { earlyCall: 0.3 }, modifiers: ['goldrush'] });
  g.buildTimer = 20;
  const shown = Math.round(g.earlyCallValue() * g.goldMult());
  const before = g.gold;
  g.startWave();
  assert.equal(g.gold - before, shown);
});

test('every tower has a hotkey', () => {
  const src = readFileSync(new URL('../src/ui/play.js', import.meta.url), 'utf8');
  const line = src.split('\n').find((l) => l.startsWith('const HOTKEYS = '));
  const keys = new Function('return ' + line.slice('const HOTKEYS = '.length, line.lastIndexOf('];') + 1))();
  assert.ok(keys.length >= TOWER_ORDER.length, `${keys.length} keys for ${TOWER_ORDER.length} towers`);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.ok(!['q', 'e', 'z', 'x', 'c', 'v', 'p', 'h', 'f', 'u', 's', 'r', 'w', 'g', 'd', 'a', 'm', ' '].includes(k.toLowerCase()));
});

test('late towers earn their price: buffed numbers hold', () => {
  assert.ok(TOWERS.archer.specs.sharpshooter.dmgMult >= 2);
  assert.ok(TOWERS.venom.poison >= 14 && TOWERS.venom.rate >= 1.2);
  assert.ok(TOWERS.gatling.dmg >= 6.5);
  assert.ok(TOWERS.obelisk.specs.sunlance.rampMult >= 2);
});

test('v1.15.1 mute switch: N is bound and listed, and the audio engine silences itself when muted', async () => {
  const fs = await import('node:fs');
  const play = fs.readFileSync(new URL('../src/ui/play.js', import.meta.url), 'utf8');
  assert.match(play, /case 'n': this\.app\.toggleMute\(\)/);
  assert.match(play, /K\('N', 'Mute or unmute/);
  const { audio } = await import('../src/game/audio.js');
  audio.set({ muted: true });
  assert.equal(audio.muted, true);
  assert.equal(audio.play('click'), undefined);
  audio.set({ muted: false });
});
