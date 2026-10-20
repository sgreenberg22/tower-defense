// v1.37.2: the trap cap shown in the build bar, long-road achievements, and the Blessings list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { PLOTS } from '../src/data/balance.js';
import { ACHIEVEMENTS } from '../src/meta/achievements.js';
import { blessingRows } from '../src/ui/blessings.js';
import { defaultProfile } from '../src/meta/profile.js';

test('the Fire Trap cap never reads higher than the traps that can be placed', () => {
  for (const mode of ['normal', 'laststand', 'endurance', 'sprint', 'gauntlet']) {
    const g = new Game({ seed: 'trapcap', mapId: 'meadow', mode });
    assert.equal(g.towerCap('firetrap'), PLOTS.trapCap, mode);
    assert.ok(g.towerCap('archer') >= 4, mode);
  }
});

test('high-wave achievements exist and unlock at their waves', () => {
  const by = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
  const p = defaultProfile(); p.best.wave.meadow = 499;
  for (const [id, wave] of [['wave200', 200], ['wave300', 300], ['wave400', 400], ['wave500', 500], ['wave750', 750], ['wave1000', 1000]]) {
    assert.ok(by[id], id);
    p.best.wave.meadow = wave - 1; assert.equal(!!by[id].check(p, null), false, id + ' too early');
    p.best.wave.meadow = wave; assert.equal(!!by[id].check(p, null), true, id);
  }
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
});

test('Daily Supplies achievements follow the chests opened', () => {
  const by = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
  const p = defaultProfile();
  assert.equal(!!by.supply1.check(p), false);
  p.supplyOpened = 7; assert.equal(!!by.supply7.check(p), true); assert.equal(!!by.supply30.check(p), false);
});

test('blessingRows names every bonus in plain words and is empty without any', () => {
  assert.deepEqual(blessingRows({ castleHpMult: 1, startGold: 0, towerDiscount: 0 }), []);
  const rows = blessingRows({ castleHpMult: 1.15, startGold: 60, towerDiscount: 0.06, secondWind: true });
  const text = rows.map((r) => r.text).join('|');
  assert.match(text, /Keep \+15% HP/); assert.match(text, /\+60 starting gold/); assert.match(text, /Towers 6% cheaper/); assert.match(text, /Second Wind/);
});

test('nothing fixed lives inside the scrolling screen, and entrance motion never starts invisible (iPhone Safari blank patches)', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../css/polish.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /#screen[^{]*::before\s*\{[^}]*position:\s*fixed/);
  assert.doesNotMatch(css, /@keyframes rise(Sm)? \{[^}]*opacity/);
  const amb = readFileSync(new URL('../src/ui/ambient.js', import.meta.url), 'utf8');
  assert.match(amb, /pointer: coarse/);   // the canvas is not rebuilt as Safari's address bar moves
});

test('game-mode achievements read each mode\'s own record', () => {
  const by = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
  const p = defaultProfile();
  assert.equal(!!by.mode_all.check(p), false);
  p.best.modes = { gauntlet: { runs: 3, wave: 101, stage: 8 }, laststand: { runs: 1, clock: 3700, wave: 55 }, endurance: { runs: 1, clock: 650, wave: 61 }, sprint: { runs: 2, wins: 1, clock: 350, wave: 15 } };
  for (const id of ['mode_all', 'gauntlet1', 'gauntlet_s8', 'gauntlet100', 'stand60', 'stand_w50', 'endure10', 'endure_w60', 'sprint7', 'sprint6']) assert.equal(!!by[id].check(p), true, id);
  for (const id of ['endure60', 'sprint_wins10', 'gauntlet_runs25']) assert.equal(!!by[id].check(p), false, id);
});

test('mode setup uses the picks made on the prep screen, not the Infinite loadout', async () => {
  const { modeSetup } = await import('../src/ui/modes.js');
  const p = defaultProfile(); p.loadout = ['volley'];
  const r = modeSetup({ profile: p }, 'sprint', { weapon: 'longbow', loadout: ['oil'] });
  assert.deepEqual(r.loadout, ['oil']);
});

test('free modes hand out a fully maxed weapon and castle arts', async () => {
  const { Game } = await import('../src/game/engine.js');
  const { ARMORY, ABILITIES } = await import('../src/data/balance.js');
  for (const mode of ['laststand', 'endurance']) {
    const g = new Game({ seed: 'max', mapId: 'meadow', mode, weapon: 'longbow', loadout: ['volley'] });
    assert.equal(g.weapon.lv.reload, ARMORY.reload.cap, mode); assert.equal(g.weapon.lv.ammo, ARMORY.ammo.cap, mode); assert.equal(g.weapon.lv.crit, ARMORY.crit.cap, mode);
    assert.ok(g.weapon.lv.dmg >= 10, mode);
    assert.ok(g.weaponStats().extra > 0 || g.weaponStats().pierce > 0 || g.weaponStats().dmg > 0, 'mastery perks apply');
    assert.equal(g.abilityLv('volley'), 3); assert.ok(Object.keys(ABILITIES).every((id) => g.abilityLv(id) === 3));
  }
  const n = new Game({ seed: 'max', mapId: 'meadow', mode: 'sprint' });
  assert.equal(n.weapon.lv.ammo, 0, 'Sprint still earns its upgrades');
});

test('a mode run on a map you picked has its own seed; the weekly map keeps the ranked one', async () => {
  const { modeSeedFor, weeklySetup, modeMapPool } = await import('../src/game/modes.js');
  const w = weeklySetup('sprint', '2026-W43');
  assert.equal(modeSeedFor('sprint', '2026-W43', w.map), w.seed);
  const other = modeMapPool('sprint', '2026-W43').find((m) => m !== w.map);
  assert.notEqual(modeSeedFor('sprint', '2026-W43', other), w.seed);
});
