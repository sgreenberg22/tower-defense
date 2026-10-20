import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { TOWERS, TIER, GAME, ABILITIES } from '../src/data/balance.js';
import { isBossWave } from '../src/game/waves.js';
import {
  GAUNTLET, LASTSTAND, SPRINT, MODE_IDS, isNewMode, gauntletStage, gauntletStart, gauntletMap, gauntletFights, lastStandWaves,
  weeklySetup, ENDURANCE, sprintBoardValue, sprintSecondsFrom, sprintMinSeconds, validateModeRun, towerCapOf,
} from '../src/game/modes.js';
import { validateRun } from '../src/game/rules.js';
import { seasonKey } from '../src/core/rng.js';
import { recordRun, defaultProfile, modeRecord, saveRun, loadRun, clearRun, runSlot } from '../src/meta/profile.js';
import { makeD1, call } from './helpers/d1.mjs';
import { onRequest } from '../functions/api/[[path]].js';
import { botBuild, MIX, bonusFor } from '../tools/sim.mjs';

// ---------- pure rules ----------
test('modes: the stage, its first wave and its map follow from the wave counter', () => {
  assert.deepEqual(MODE_IDS, ['gauntlet', 'endurance', 'laststand', 'sprint']);
  assert.ok(isNewMode('sprint') && !isNewMode('normal') && !isNewMode('march'));
  assert.equal(gauntletStage(2), 1); assert.equal(gauntletStage(10), 1); assert.equal(gauntletStage(12), 2); assert.equal(gauntletStage(22), 3);
  assert.equal(gauntletStart(1), 2); assert.equal(gauntletStart(3), 22);
  assert.equal(gauntletMap(1), 'meadow'); assert.equal(gauntletMap(GAUNTLET.maps.length + 1), 'meadow');
  assert.equal(gauntletFights(2), 0); assert.equal(gauntletFights(12), 5);
  // Every stage ends on a boss wave, because bosses fall on multiples of ten and the counter is always even.
  for (let s = 1; s < 8; s++) assert.ok(isBossWave(gauntletStart(s + 1) - GAUNTLET.step), `stage ${s} ends on a boss`);
});

test('modes: weekly setups are stable, shared and differ week to week', () => {
  const a = weeklySetup('laststand', '2026-W42'), b = weeklySetup('laststand', '2026-W42');
  assert.deepEqual(a, b);
  assert.notEqual(weeklySetup('laststand', '2026-W42').seed, weeklySetup('sprint', '2026-W42').seed);
  const maps = new Set(); for (let w = 1; w <= 40; w++) maps.add(weeklySetup('sprint', '2026-W' + String(w).padStart(2, '0')).map);
  assert.ok(maps.size >= 4, 'the weekly map rotates');
  assert.equal(sprintSecondsFrom(sprintBoardValue(412)), 412);
  assert.ok(sprintBoardValue(300) > sprintBoardValue(400), 'a faster clear ranks higher');
  assert.equal(lastStandWaves(250), 2);
});

test('modes: plausibility checks accept honest runs and refuse impossible ones', () => {
  const g = { mode: 'gauntlet', wave: 34, wavesCleared: 16, score: 1000, kills: 800, heroKills: 100, duration: 1200, clock: 1100, start: 1, modifiers: [], ascension: 0 };
  assert.equal(validateRun(g), null);
  assert.equal(validateRun({ ...g, wave: 35 }), 'bad wave', 'Gauntlet waves are even');
  assert.equal(validateRun({ ...g, wavesCleared: 40 }), 'bad waves cleared');
  assert.equal(validateRun({ ...g, duration: 40, clock: 30 }), 'too fast');
  assert.equal(validateRun({ ...g, clock: 5000 }), 'clock longer than the run');
  assert.equal(validateRun({ ...g, start: 20 }), 'bad start wave');
  const ls = { mode: 'laststand', wave: 80, wavesCleared: 20, score: 1000, kills: 2100, heroKills: 10, duration: 1500, clock: 1450, start: 1, modifiers: [], ascension: 0 };
  assert.equal(validateRun(ls), null);
  assert.equal(validateRun({ ...ls, wave: 300 }), 'too fast', 'cannot climb 245 waves in 24 minutes');
  assert.equal(validateRun({ ...ls, wavesCleared: 60 }), 'bad waves cleared');
  assert.equal(validateRun({ ...ls, kills: 90000 }), 'too many kills');
  const sp = { mode: 'sprint', wave: 16, wavesCleared: 15, score: 1000, kills: 400, heroKills: 10, duration: 420, clock: 400, victory: true, start: 1, modifiers: [], ascension: 0 };
  assert.equal(validateRun(sp), null);
  assert.equal(validateRun({ ...sp, clock: 40, duration: 60 }), 'too fast', 'fifteen waves cannot be cleared in 40 seconds');
  assert.ok(sprintMinSeconds() > 100);
  assert.equal(validateModeRun({ mode: 'normal' }), null);
});

// ---------- the engine ----------
function play(g, until, { steps = 60 * 60 * 120, mix = MIX } = {}) {
  g.useTroops = true;
  const idx = { v: 0 };
  let n = 0;
  while (!g.over && !until(g) && n++ < steps) {
    if (g.phase === 'build') { botBuild(g, idx, mix); g.startWave(); }
    g.update(GAME.step);
  }
  return g;
}

test('Gauntlet: the counter climbs by two, a boss ends the stage, and the next map starts richer', () => {
  const g = new Game({ seed: 'gt1', mapId: 'meadow', mode: 'gauntlet', bonus: bonusFor(2) });
  assert.equal(g.wave, 2); assert.equal(g.stage, 1); assert.equal(g.start, 1);
  const stages = [];
  g.on('stageStart', (e) => stages.push({ ...e, towers: g.towers.length, gold: g.gold, wave: g.wave }));
  const before = [];
  g.on('waveClear', ({ wave }) => before.push(wave));
  play(g, (x) => x.stage >= 2);
  assert.equal(g.stage, 2, 'cleared the first boss');
  assert.deepEqual(before.slice(0, 5), [2, 4, 6, 8, 10]);
  assert.equal(g.wave, 12);
  assert.equal(g.stats.wavesCleared, 5, 'five fights fought');
  assert.equal(stages.length, 1);
  assert.equal(stages[0].map, 'twin'); assert.equal(g.mapId, 'twin'); assert.equal(g.map.paths.length, 2);
  assert.equal(stages[0].towers, 0, 'the towers stay behind');
  assert.ok(stages[0].grant > 300, 'a grant of gold arrives with the new map');
  assert.ok(g.gold >= stages[0].grant);
  assert.ok(g.claimed.size > 6, 'more ground is open than a fresh map gives');
  assert.ok(g.isTowerUnlocked('catapult') && g.isTowerUnlocked('artillery'), 'the stage opens towers a few waves ahead');
  assert.equal(g.buildTimer, GAUNTLET.stageBuild);
  assert.ok(g.castle.hp > 0 && g.wall.hp === g.wall.maxHp);
  assert.ok(g.pickQueue >= 1 || g.boonOffer, 'free boon picks come with the new stage');
});

test('Gauntlet: a save made on stage two resumes on stage two\'s map and wave', () => {
  const g = new Game({ seed: 'gt2', mapId: 'meadow', mode: 'gauntlet', bonus: bonusFor(2) });
  play(g, (x) => x.stage >= 2);
  g.boonOffer = null;
  const save = JSON.parse(JSON.stringify(g.serialize()));
  const r = new Game({ seed: save.seed, mapId: save.mapId, mode: save.mode, bonus: bonusFor(2), save });
  assert.equal(r.stage, 2); assert.equal(r.mapId, 'twin'); assert.equal(r.wave, g.wave);
  assert.equal(r.map.paths.length, g.map.paths.length);
  assert.equal(r.start, 1);
  assert.equal(r.summary().stage, 2);
});

test('Last Stand: free towers at full level and mastery, then the doors close', () => {
  const setup = weeklySetup('laststand', '2026-W42');
  const g = new Game({ seed: setup.seed, mapId: setup.map, mode: 'laststand', bonus: { towerDmg: 5, startGold: 9999, castleHpMult: 3, unlockedTowers: new Set(['archer', 'cannon']) } });
  assert.equal(g.wave, LASTSTAND.startWave);
  assert.equal(g.gold, 0); assert.equal(g.bonus.towerDmg, 0, 'no Keep, Realm or clan bonuses');
  assert.equal(g.castle.maxHp, GAME.castleHp, 'a level field');
  assert.equal(g.claimed.size, g.map.plots.length, 'every plot is open');
  assert.ok(g.isTowerUnlocked('archer') && !g.isTowerUnlocked('trebuchet') && !g.isTowerUnlocked('voidwell'), 'only the towers the Keep has unlocked are available');
  assert.equal(g.buildCost('cannon'), 0);
  const plots = [...g.map.plots];
  const t = g.build('cannon', plots[0].x, plots[0].y);
  assert.ok(t); assert.equal(t.tier, TIER.max); assert.equal(t.mastery, LASTSTAND.mastery); assert.ok(t.spec);
  assert.equal(g.gold, 0, 'building cost nothing');
  const other = Object.keys(TOWERS.cannon.specs).find((s) => s !== t.spec);
  assert.ok(g.setSpec(t, other)); assert.equal(t.spec, other);
  // A free garrison, raised on the spot.
  assert.ok(g.trainTroop('knight')); assert.equal(g.garrison.units.length, 1); assert.equal(g.gold, 0);
  assert.equal(g.troopSlotsMax(), LASTSTAND.slots);
  for (const p of plots.slice(1)) g.build('archer', p.x, p.y);
  assert.equal(g.towers.length, 1 + towerCapOf('archer'), 'each tower type is capped in the stand');
  // The stand begins.
  assert.ok(g.startWave());
  assert.ok(g.locked());
  assert.equal(g.build('archer', plots[0].x, plots[0].y), null, 'nothing more can be built');
  assert.equal(g.sell(t), false); assert.equal(g.canUpgrade(t), false); assert.equal(g.setSpec(t, t.spec), false);
  assert.equal(g.trainBlock('footman'), 'locked'); assert.equal(g.canRepair(), false);
  assert.equal(g.abilityKnown('mend'), false, 'the Mend art is off');
  assert.equal(g.buyArmory('dmg'), false);
});

test('Last Stand: waves roll on by themselves, the clock runs, and every hundred foes count as a wave', () => {
  const keep = LASTSTAND.startWave;
  LASTSTAND.startWave = 20;           // a gentler opening, so a handful of towers lasts a few waves
  const g = new Game({ seed: 'ls1', mapId: 'meadow', mode: 'laststand' });
  LASTSTAND.startWave = keep;
  const plots = [...g.map.plots];
  ['cannon', 'mage', 'archer', 'ballista', 'frost', 'tesla', 'gatling', 'flak'].forEach((id, i) => g.build(id, plots[i].x, plots[i].y));
  g.startWave();
  let waves = 0; g.on('waveStart', () => waves++);
  let n = 0;
  while (!g.over && waves < 3 && n++ < 60 * 60 * 20) g.update(GAME.step);
  assert.ok(waves >= 3, 'the next waves started without anyone pressing anything');
  assert.ok(g.clock > 20 && g.clock <= g.stats.time + 1e-6);
  assert.equal(g.stats.wavesCleared, lastStandWaves(g.stats.kills));
  assert.equal(g.boonOffer, null, 'no boons in the stand');
  assert.equal(g.mod.norepair, true);
  g.stats.kills = 345; g.update(GAME.step);
  assert.equal(g.stats.wavesCleared, 3);
  const s = g.summary();
  assert.equal(s.mode, 'laststand'); assert.equal(s.start, 1); assert.ok(s.clock > 0);
});

test('Last Stand: a stand that falls reports its time and still earns Realm waves', () => {
  const g = new Game({ seed: 'ls2', mapId: 'meadow', mode: 'laststand' });
  g.build('archer', g.map.plots[0].x, g.map.plots[0].y);     // one tower cannot hold wave 55
  g.startWave();
  let n = 0;
  while (!g.over && n++ < 60 * 60 * 30) g.update(GAME.step);
  assert.ok(g.over);
  const s = g.summary();
  assert.ok(s.clock > 5 && s.clock <= s.duration + 1);
  assert.equal(s.victory, false);
  assert.equal(validateModeRun({ ...s, start: 1 }), null);
});

test('Sprint: fifteen waves end the run with a victory and a stopped clock', () => {
  const g = new Game({ seed: 'sp1', mapId: 'meadow', mode: 'sprint', bonus: bonusFor(2) });
  assert.ok(g.gold >= GAME.startGold + SPRINT.startGold);
  play(g, () => false);
  assert.ok(g.over); assert.equal(g.victory, true);
  const s = g.summary();
  assert.equal(s.wavesCleared, SPRINT.waves); assert.equal(s.victory, true);
  assert.ok(s.clock >= sprintMinSeconds(), `clock ${s.clock} vs floor ${sprintMinSeconds()}`);
  assert.equal(validateRun({ ...s, start: 1 }), null);
  const tick = g.clock; g.update(GAME.step); assert.equal(g.clock, tick, 'the clock has stopped');
  assert.equal(g.breakTime(), SPRINT.buildTime);
});

test('classic modes are untouched by the new rules', () => {
  const g = new Game({ seed: 'n1', mapId: 'meadow', mode: 'normal' });
  assert.equal(g.special, false); assert.equal(g.wave, 1); assert.equal(g.stage, 1); assert.equal(g.unlockLevel(), g.wave);
  assert.equal(g.freeSetup(), false); assert.equal(g.locked(), false); assert.equal(g.breakTime(), GAME.buildTime);
});

// ---------- profile ----------
test('profile: the new modes keep their own records and stay out of the main game\'s', () => {
  const p = defaultProfile();
  const run = (o) => ({ seed: 's', map: 'meadow', mode: 'gauntlet', modifiers: [], ascension: 0, wave: 40, start: 1, wavesCleared: 19, stage: 4, score: 5000, kills: 900, heroKills: 100, shots: 0, hits: 0, headshots: 0, duration: 900, clock: 880, maxCombo: 3, bossKills: 3, killsByType: {}, dmgByTower: {}, specs: [], towersBuilt: 5, goldEarned: 100, ...o });
  const r1 = recordRun(p, run());
  assert.deepEqual(r1.records, ['gauntlet']);
  assert.equal(p.best.modes.gauntlet.wave, 40);
  assert.equal(p.best.wave.meadow, undefined, 'the wave record belongs to the main game');
  assert.equal(r1.milestones.length, 0, 'no first-time wave milestones from a Gauntlet wave counter');
  const r2 = recordRun(p, run({ wave: 30 }));
  assert.deepEqual(r2.records, []);
  assert.equal(p.best.modes.gauntlet.runs, 2);
  recordRun(p, run({ mode: 'laststand', wave: 70, clock: 1500, duration: 1520 }));
  assert.equal(p.best.modes.laststand.clock, 1500);
  recordRun(p, run({ mode: 'sprint', wave: 16, wavesCleared: 15, victory: true, clock: 410 }));
  const fast = recordRun(p, run({ mode: 'sprint', wave: 16, wavesCleared: 15, victory: true, clock: 380 }));
  assert.deepEqual(fast.records, ['sprint']);
  assert.equal(p.best.modes.sprint.clock, 380);
  assert.equal(p.best.modes.sprint.wins, 2);
  const slow = modeRecord(p, run({ mode: 'sprint', wave: 9, victory: false }));
  assert.equal(slow, null); assert.equal(p.best.modes.sprint.clock, 380, 'a loss never replaces a clear');
});

// ---------- server ----------
const body = (o) => ({ seed: ['laststand', 'endurance', 'sprint'].includes(o.mode) ? weeklySetup(o.mode, seasonKey()).seed : 'abc', map: 'meadow', modifiers: [], ascension: 0, start: 1, heroKills: 10, ...o });
async function setup() {
  const env = { DB: makeD1() };
  const reg = async (name, ip) => (await call(onRequest, env, 'POST', 'register', { body: { name }, ip })).data;
  return { env, reg };
}

test('server: each mode ranks on a board of its own and feeds the Realm', async () => {
  const { env, reg } = await setup();
  const a = await reg('Mode Maud', '4.4.4.4');
  const post = async (o) => { env.DB.raw.exec('DELETE FROM rate'); return call(onRequest, env, 'POST', 'runs', { token: a.token, body: body(o) }); };
  let r = await post({ mode: 'gauntlet', wave: 40, wavesCleared: 19, score: 5000, kills: 900, duration: 1100, clock: 1000 });
  assert.equal(r.data.accepted, true, r.data.reason);
  assert.equal(r.data.ranks.gauntlet, 1); assert.equal(r.data.ranks.wave, undefined, 'the wave board is not touched');
  assert.equal(r.data.realm.added.kills, 900); assert.equal(r.data.realm.added.waves, 19);
  r = await post({ mode: 'laststand', wave: 70, wavesCleared: 20, score: 8000, kills: 2050, duration: 1500, clock: 1480 });
  assert.equal(r.data.accepted, true, r.data.reason);
  assert.equal(r.data.ranks.laststand, 1);
  assert.equal(r.data.realm.added.waves, 20, 'every 100 foes counts as a wave for the Realm');
  r = await post({ mode: 'sprint', wave: 16, wavesCleared: 15, score: 3000, kills: 420, duration: 500, clock: 470, victory: true });
  assert.equal(r.data.accepted, true, r.data.reason);
  assert.equal(r.data.ranks.sprint, 1);
  r = await post({ mode: 'sprint', wave: 9, wavesCleared: 8, score: 1000, kills: 200, duration: 300, clock: 280, victory: false });
  assert.equal(r.data.accepted, true, 'a failed sprint is accepted for the Realm');
  assert.equal(r.data.ranks.sprint, undefined, 'only a clear takes a place on the Sprint board');

  const lb = async (board) => (await call(onRequest, env, 'GET', `leaderboard?board=${board}&scope=global&period=all`, { token: a.token })).data;
  assert.equal((await lb('gauntlet')).rows[0].value, 40);
  assert.equal((await lb('laststand')).rows[0].value, 1480);
  assert.equal((await lb('sprint')).rows[0].value, sprintBoardValue(470), 'the faster the clear the bigger the stored value');
  assert.equal((await lb('wave')).rows.length, 0);
  const realm = (await call(onRequest, env, 'GET', 'realm', { token: a.token })).data;
  assert.equal(realm.week.kills, 900 + 2050 + 420 + 200);
  // Impossible runs are refused.
  r = await post({ mode: 'laststand', wave: 400, wavesCleared: 20, score: 8000, kills: 2050, duration: 1500, clock: 1480 });
  assert.equal(r.data.accepted, false);
  r = await post({ mode: 'sprint', wave: 16, wavesCleared: 15, score: 3000, kills: 420, duration: 90, clock: 60, victory: true });
  assert.equal(r.data.accepted, false);
});

// ---------- saved runs ----------
test('modes: each game mode saves in its own slot and leaves a paused classic run alone', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  try {
    assert.equal(runSlot('normal'), 'main'); assert.equal(runSlot('daily'), 'main'); assert.equal(runSlot('sprint'), 'sprint');
    saveRun({ mode: 'normal', wave: 31 });
    saveRun({ mode: 'gauntlet', wave: 14 });
    saveRun({ mode: 'sprint', wave: 6 });
    assert.equal(loadRun().wave, 31);
    assert.equal(loadRun('gauntlet').wave, 14);
    assert.equal(loadRun('sprint').wave, 6);
    assert.equal(loadRun('laststand'), null);
    clearRun('gauntlet');
    assert.equal(loadRun('gauntlet'), null);
    assert.equal(loadRun().wave, 31, 'clearing a mode run keeps the classic run');
    clearRun();
    assert.equal(loadRun('sprint').wave, 6, 'clearing the classic run keeps the mode run');
  } finally { delete globalThis.localStorage; }
});

// ---------- Endurance ----------
const ENDURE_MIX = ['cannon', 'archer', 'mage', 'frost', 'ballista', 'tesla', 'gatling', 'catapult', 'venom', 'flak', 'artillery', 'sanctum', 'obelisk', 'trebuchet', 'voidwell', 'firetrap'];
function fillField(g, n = 99) {
  const plots = [...g.map.plots].sort((a, b) => (g.map.coverage.get(b.k) || 0) - (g.map.coverage.get(a.k) || 0));
  let i = 0, built = 0;
  for (const p of plots) { const id = ENDURE_MIX[i++ % ENDURE_MIX.length]; if (TOWERS[id].trap) continue; if (built < n && g.build(id, p.x, p.y)) built++; }
  for (let k = 0; k < 200 && g.trainTroop(['knight', 'footman', 'bowman', 'cleric'][k % 4]); k++) { /* fills the garrison */ }
  return built;
}

test('Endurance: everything is free and unlocked, with no Keep bonuses and no gold needed', () => {
  const g = new Game({ seed: 'en1', mapId: 'meadow', mode: 'endurance', bonus: bonusFor(3), weapon: 'mortar' });
  assert.equal(g.special, true); assert.equal(g.free, true); assert.equal(g.start, 1); assert.equal(g.wave, 1);
  assert.equal(g.buildTimer, Infinity, 'setup before the first wave is untimed');
  assert.equal(g.bonus.killGold, 0, 'the Keep adds nothing: only placement and loadout matter');
  assert.equal(g.gold, 0);
  assert.equal(g.claimed.size, g.map.plots.length, 'every plot is open');
  assert.equal(g.unlockLevel(), Infinity); assert.equal(g.isTowerUnlocked('trebuchet'), true);
  assert.equal(g.buildCost('archer'), 0); assert.equal(g.freeSetup(), true);
  const n = fillField(g); assert.ok(n >= 12, `built ${n}`);
  assert.ok(g.towers.every((t) => t.tier === TIER.max && t.mastery === LASTSTAND.mastery), 'full level and mastery');
  assert.ok(g.garrison.units.length > 0 && g.gold === 0, 'troops are free too');
  assert.equal(g.weapon.id, 'mortar'); assert.deepEqual(g.weapon.lv, ENDURANCE.weaponLv);
  assert.equal(g.canUpgrade(g.towers[0]), false); assert.equal(g.buyArmory('dmg'), false);
  assert.equal(g.earlyCallValue(), 0);
  g.update(5); assert.equal(g.clock, 0, 'the clock waits for the first wave');
  assert.equal(g.abilityKnown('nova'), false, 'a castle art you have not unlocked stays closed');
  const o = new Game({ seed: 'en1', mapId: 'meadow', mode: 'endurance', bonus: { unlockedAbilities: new Set(['nova']), unlockedTowers: new Set(['archer']), artSlots: 5 }, loadout: ['nova', 'storm'] });
  assert.equal(o.abilityKnown('nova'), true); assert.deepEqual(o.loadout, ['nova']);
  assert.equal(o.isTowerUnlocked('archer'), true); assert.equal(o.isTowerUnlocked('cannon'), false);
});

test('Endurance: the doors close when the stream begins, and it never stops', () => {
  const g = new Game({ seed: 'en1b', mapId: 'meadow', mode: 'endurance' });
  fillField(g, 6);
  const free = g.freePlots()[0];
  g.startWave();
  assert.equal(g.locked(), true); assert.equal(g.freeSetup(), false);
  assert.equal(g.build('archer', free.x, free.y), null, 'nothing can be built once it begins');
  assert.equal(g.sell(g.towers[0]), false);
  // The level climbs with the clock whether or not the foes are dead, and no wave ever "completes".
  let completed = 0; g.on('waveClear', () => completed++);
  const levels = [];
  for (let i = 0; i < 60 * 130 && !g.over; i++) { g.update(GAME.step); if (i % (60 * 12) === 0) levels.push(g.wave); }
  assert.ok(g.wave >= 10, `level ${g.wave} after ${Math.round(g.clock)}s`);
  assert.equal(completed, 0, 'no waves clear in Endurance');
  assert.equal(g.phase, 'wave', 'there is never a break');
  assert.ok(levels.every((v, i) => i === 0 || v >= levels[i - 1]));
  assert.equal(g.wave, 1 + Math.floor(g.clock / ENDURANCE.beat), 'strength follows the clock');
});

test('Endurance: a boss, or 150 kills, brings a free repair', () => {
  const g = new Game({ seed: 'en2', mapId: 'meadow', mode: 'endurance' });
  fillField(g, 8);
  const hurt = () => { for (const t of g.towers) t.hp = t.maxHp * 0.3; g.wall.hp = g.wall.maxHp * 0.2; g.castle.hp = g.castle.maxHp * 0.5; for (const u of g.garrison.units) u.hp = u.maxHp * 0.4; };
  hurt(); g.stats.kills = 10;
  assert.equal(g.enduranceRepair(false), false, 'too few kills and no boss: no repair');
  assert.ok(g.towers.every((t) => t.hp < t.maxHp));
  g.stats.kills = ENDURANCE.repairKills;
  const hp = g.castle.hp;
  assert.equal(g.enduranceRepair(false), true);
  assert.ok(g.towers.every((t) => t.hp === t.maxHp)); assert.equal(g.wall.hp, g.wall.maxHp);
  assert.ok(g.garrison.units.every((u) => u.hp === u.maxHp), 'the garrison is mended too');
  assert.ok(g.castle.hp > hp && g.castle.hp < g.castle.maxHp, 'the keep gets a share back, not all');
  hurt();
  assert.equal(g.enduranceRepair(false), false, 'the kill count starts again after a repair');
  assert.equal(g.enduranceRepair(true), true, 'a boss always brings one');
  assert.equal(g.stats.freeRepairAt, g.stats.kills + ENDURANCE.repairKills);
  const g2 = new Game({ seed: 'en2', mapId: 'meadow', mode: 'endurance', save: g.serialize() });
  assert.equal(g2.stats.freeRepairAt, g.stats.freeRepairAt);
});

test('Endurance: play runs to a fall, a boss restores everything, and the run validates', () => {
  const g = new Game({ seed: 'en3', mapId: 'meadow', mode: 'endurance' }); g.useTroops = true;
  fillField(g);
  const repairs = []; g.on('freeRepair', (e) => repairs.push(e));
  g.startWave();
  let n = 0;
  while (!g.over && n++ < 60 * 60 * 150) g.update(GAME.step);
  assert.ok(g.over); assert.notEqual(g.victory, true);
  const s = g.summary();
  assert.ok(s.clock > 120 && s.wave > 20, `fell at level ${s.wave} after ${Math.round(s.clock)}s`);
  assert.equal(s.wavesCleared, lastStandWaves(s.kills), 'every hundred kills counts as a wave for the Realm');
  assert.equal(validateRun({ ...s, start: 1 }), null);
  assert.ok(repairs.length >= 3, 'repairs keep coming');
  assert.ok(repairs.some((r) => r.boss), 'a boss kill brought one');
});

test('Endurance: plausibility and the server board', async () => {
  assert.equal(validateModeRun({ mode: 'endurance', wave: 70, wavesCleared: 40, kills: 4000, duration: 900, clock: 880 }), null);
  assert.equal(validateModeRun({ mode: 'endurance', wave: 60, wavesCleared: 3, kills: 400, duration: 60, clock: 50 }) !== null, true, 'levels cannot outrun the clock');
  assert.equal(validateModeRun({ mode: 'endurance', wave: 12, wavesCleared: 11, kills: 90000, duration: 900, clock: 880 }) !== null, true);
  assert.equal(validateModeRun({ mode: 'endurance', wave: 70, wavesCleared: 60, kills: 4000, duration: 900, clock: 880 }) !== null, true, 'waves cleared follow the kill count');
  const { env, reg } = await setup();
  const a = await reg('Endure Ed', '5.5.5.5');
  env.DB.raw.exec('DELETE FROM rate');
  const r = await call(onRequest, env, 'POST', 'runs', { token: a.token, body: body({ mode: 'endurance', wave: 80, wavesCleared: 70, score: 6000, kills: 7000, duration: 1000, clock: 960 }) });
  assert.equal(r.data.accepted, true, r.data.reason);
  assert.equal(r.data.ranks.endurance, 1); assert.equal(r.data.ranks.wave, undefined);
  assert.equal(r.data.realm.added.waves, 70);
  const lb = (await call(onRequest, env, 'GET', 'leaderboard?board=endurance&scope=global&period=all', { token: a.token })).data;
  assert.equal(lb.rows[0].value, 960);
});
