// v1.69.0 · The Season Road, Sudden Death, Boonstorm and the empty-boon-offer fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game/engine.js';
import { validateRun } from '../src/game/rules.js';
import { LOCAL_MODES, SUDDEN, BOONSTORM } from '../src/game/modes.js';
import { ACHIEVEMENTS } from '../src/meta/achievements.js';
import { defaultProfile, recordRun } from '../src/meta/profile.js';
import { SEASON, SEASON_NAMES, seasonInfo, seasonStanding, tierCost, roadTotal, tierReward, runXp, ensureSeason, progressSeason, seasonClaimable, claimSeason, seasonLine } from '../src/meta/season.js';
import { installOffer, isIos } from '../src/ui/install.js';
import { EXTRA } from '../src/ui/local.js';
import { FX } from '../src/game/fx.js';

globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const NOV = new Date('2026-11-10T18:00:00Z'), NOV2 = new Date('2026-11-11T18:00:00Z'), DEC = new Date('2026-12-05T18:00:00Z');
const run = (o = {}) => ({ wavesCleared: 10, bossKills: 1, kills: 200, ...o });

// ---------- Season Road ----------
test('a season is the Realm month, with a name of its own', () => {
  const s = seasonInfo(NOV);
  assert.equal(s.key, 'm:2026-11'); assert.equal(s.name, 'Duskhold'); assert.equal(s.title, 'Duskhold 2026');
  assert.ok(s.daysLeft >= 19 && s.daysLeft <= 21);
  assert.equal(SEASON_NAMES.length, 12); assert.equal(new Set(SEASON_NAMES.map((x) => x.name)).size, 12);
  assert.equal(seasonInfo(DEC).name, 'Longnight');
});
test('standing: tiers cost a little more each time, then Laurels', () => {
  assert.equal(tierCost(1), SEASON.tierBase); assert.equal(tierCost(2), SEASON.tierBase + SEASON.tierStep);
  assert.deepEqual(seasonStanding(0), { tier: 0, into: 0, need: 200, frac: 0, laurels: 0, done: false });
  assert.equal(seasonStanding(199).tier, 0); assert.equal(seasonStanding(200).tier, 1); assert.equal(seasonStanding(200 + 219).tier, 1); assert.equal(seasonStanding(420).tier, 2);
  const total = roadTotal();
  assert.equal(total, 14700);
  assert.equal(seasonStanding(total - 1).tier, SEASON.tiers - 1);
  const end = seasonStanding(total); assert.equal(end.tier, SEASON.tiers); assert.ok(end.done); assert.equal(end.laurels, 0);
  const far = seasonStanding(total + SEASON.laurelXp * 2 + 5); assert.equal(far.laurels, 2); assert.equal(far.into, 5);
  assert.equal(seasonStanding(-50).tier, 0); assert.equal(seasonStanding(undefined).tier, 0);
});
test('a daily player finishes the road inside a month', () => {
  // one twenty-wave run a day, two bosses, 300 foes
  const perDay = runXp(run({ wavesCleared: 20, bossKills: 2, kills: 300 }), { firstToday: true }).xp;
  assert.ok(perDay * 30 >= roadTotal(), `one run a day earns ${perDay * 30} of ${roadTotal()}`);
  assert.ok(perDay * 12 < roadTotal(), 'but not in under two weeks');
});
test('run XP is itemised, capped on kills and never pays an empty run', () => {
  const a = runXp(run());
  assert.equal(a.xp, 100 + 40 + 40); assert.deepEqual(a.parts.map((x) => x.label), ['Waves held', 'Bosses felled', 'Foes defeated']);
  assert.equal(runXp(run({ kills: 99999 })).parts.find((x) => x.label === 'Foes defeated').v, SEASON.xp.killCap);
  assert.equal(runXp({ wavesCleared: 0, kills: 0 }, { firstToday: true }).xp, 0, 'quitting at once earns nothing, not even the daily bonus');
  assert.equal(runXp({ wavesCleared: 0, kills: 3 }).xp, SEASON.minRun);
  assert.equal(runXp({ taken: 2, victory: true }).xp, 2 * SEASON.xp.stronghold + SEASON.xp.victory);
  assert.equal(runXp(run(), { firstToday: true, records: 2 }).xp, 180 + SEASON.xp.record + SEASON.xp.daily);
});
test('progress: the daily bonus is paid once a day', () => {
  const p = defaultProfile();
  const a = progressSeason(p, run(), { now: NOV });
  assert.equal(a.xp, 180 + SEASON.xp.daily); assert.equal(a.before.tier, 0); assert.equal(a.after.tier, 1); assert.equal(a.tiersUp, 1); assert.equal(a.claimable, 1);
  const b = progressSeason(p, run(), { now: NOV });
  assert.equal(b.xp, 180);
  const c = progressSeason(p, run(), { now: NOV2 });
  assert.equal(c.xp, 180 + SEASON.xp.daily);
  assert.equal(p.season.xp, 180 * 3 + 2 * SEASON.xp.daily); assert.equal(p.stats.seasonXp, p.season.xp); assert.equal(p.stats.seasonBest, seasonStanding(p.season.xp).tier);
  assert.equal(progressSeason(p, { wavesCleared: 0, kills: 0 }, { now: NOV2 }), null);
});
test('rewards: collected once, titles on the big tiers, a Laurel at the end', () => {
  const p = defaultProfile(); ensureSeason(p, NOV);
  p.season.xp = roadTotal() + SEASON.laurelXp;   // the whole road and one Laurel beyond
  const c = seasonClaimable(p, NOV);
  assert.equal(c.tiers.length, 30); assert.equal(c.laurels, 1); assert.equal(c.count, 31);
  const r0 = p.renown, got = claimSeason(p, NOV);
  assert.equal(got.renown, c.renown); assert.equal(p.renown, r0 + c.renown); assert.equal(got.tiers, 30);
  assert.deepEqual(got.titles, ['Duskhold Wayfarer', 'Duskhold Vanguard', 'Champion of Duskhold']);
  for (const t of got.titles) assert.ok(p.titles.includes(t));
  assert.equal(p.season.laurels, 2, 'one for finishing, one beyond');
  const again = claimSeason(p, NOV);
  assert.equal(again.renown, 0); assert.equal(p.renown, r0 + c.renown); assert.equal(seasonClaimable(p, NOV).count, 0);
  assert.equal(tierReward(30, 'm:2026-12').title, 'Champion of Longnight');
  for (let t = 1; t <= 30; t++) assert.ok(tierReward(t).renown > 0);
});
test('when the month turns, uncollected rewards are paid and the season is filed', () => {
  const p = defaultProfile(); ensureSeason(p, NOV);
  p.season.xp = 2000; p.season.daily = '2026-11-10';
  const due = seasonClaimable(p, NOV).renown, r0 = p.renown;
  assert.ok(due > 0);
  const { S, rolled } = ensureSeason(p, DEC);
  assert.equal(rolled.name, 'Duskhold 2026'); assert.equal(rolled.tier, seasonStanding(2000).tier); assert.equal(rolled.renown, due);
  assert.equal(p.renown, r0 + due);
  assert.deepEqual({ key: S.key, xp: S.xp, claimed: S.claimed }, { key: 'm:2026-12', xp: 0, claimed: 0 });
  assert.deepEqual(S.past, [{ key: 'm:2026-11', tier: rolled.tier, xp: 2000, laurels: 0 }]);
  assert.equal(ensureSeason(p, DEC).rolled, null, 'only once');
  // an untouched season leaves no trace
  const q = defaultProfile(); ensureSeason(q, NOV); assert.equal(ensureSeason(q, DEC).rolled, null); assert.equal(q.season.past.length, 0);
});
test('finishing the road counts once per season, and the home line reads right', () => {
  const p = defaultProfile(); ensureSeason(p, NOV); p.season.xp = roadTotal() - 50; p.season.daily = '2026-11-10';
  progressSeason(p, run(), { now: NOV }); progressSeason(p, run(), { now: NOV });
  assert.equal(p.season.done, 1);
  const L = seasonLine(p, NOV);
  assert.match(L.text, /Road complete/); assert.equal(L.claimable, 30);
  assert.equal(seasonLine(defaultProfile(), NOV).text, 'Tier 0 of 30');
  assert.ok(ACHIEVEMENTS.find((a) => a.id === 'season30').check(p)); assert.ok(!ACHIEVEMENTS.find((a) => a.id === 'season3x').check(p));
});
test('recordRun walks the road for every kind of run', () => {
  const p = defaultProfile();
  const g = new Game({ seed: 'sr', mapId: 'meadow', mode: 'boonstorm' });
  g.stats.wavesCleared = 6; g.stats.kills = 80; g.wave = 7;
  const res = recordRun(p, g.summary(), { now: NOV });
  assert.ok(res.season.xp >= 60 + 16 + SEASON.xp.daily); assert.equal(p.season.key, 'm:2026-11'); assert.equal(p.local.boonstorm.runs, 1);
});

// ---------- Sudden Death ----------
test('Sudden Death: no wall, one hit point, a richer purse, and no Second Wind from the Keep', () => {
  const base = new Game({ seed: 'sd', mapId: 'meadow' });
  const g = new Game({ seed: 'sd', mapId: 'meadow', mode: 'sudden', bonus: { secondWind: true } });
  assert.deepEqual(g.castle, { hp: 1, maxHp: 1 }); assert.equal(g.wall.hp, 0);
  assert.equal(g.gold, base.gold + SUDDEN.startGold); assert.equal(g.secondWind, false); assert.equal(g.canRepair(), false);
  assert.ok(LOCAL_MODES.includes('sudden') && EXTRA.sudden && EXTRA.boonstorm && LOCAL_MODES.includes('boonstorm'));
});
test('Sudden Death: the first foe through the gate ends the run', () => {
  const g = new Game({ seed: 'sd', mapId: 'meadow', mode: 'sudden' });
  g.startWave(); let n = 0; while (!g.over && n++ < 40000) g.update();
  assert.ok(g.over); assert.equal(g.stats.leaks, 1); assert.equal(g.wave, 1);
  assert.equal(validateRun({ ...g.summary(), duration: 30 }), null);
});
test('Sudden Death: Aegis turns a breach, and a Second Wind boon buys one life', () => {
  const g = new Game({ seed: 'sd2', mapId: 'meadow', mode: 'sudden' });
  g.startWave(); let n = 0; while (!g.enemies.length && n++ < 2000) g.update();
  g.aegisT = 5; g.leak(g.enemies[0]);
  assert.equal(g.over, false); assert.equal(g.castle.hp, 1);
  g.aegisT = 0; g.secondWind = true; g.leak(g.enemies.find((e) => !e.dead) || g.enemies[0]);
  assert.equal(g.over, false); assert.ok(g.castle.hp > 0 && g.castle.hp <= 1);
  g.leak(g.enemies.find((e) => !e.dead) || g.enemies[0]);
  assert.ok(g.over);
});
test('Sudden Death pays half as much again for a cleared wave and never offers a wall boon', () => {
  const a = new Game({ seed: 'sd3', mapId: 'meadow' }), b = new Game({ seed: 'sd3', mapId: 'meadow', mode: 'sudden' });
  const ga = a.gold, gb = b.gold; a.completeWave(); b.completeWave();
  assert.ok(Math.abs((b.gold - gb) - (a.gold - ga) * SUDDEN.purse) <= 1);
  for (let i = 0; i < 12; i++) { b.offerBoons(true); for (const id of b.boonOffer) assert.ok(!['masonry', 'fieldrepair', 'thickskin'].includes(id)); b.rerolls = 9; }
});

// ---------- Boonstorm ----------
test('Boonstorm: a boon after every wave, two after a boss, against a tougher horde', () => {
  const g = new Game({ seed: 'bs', mapId: 'meadow', mode: 'boonstorm' }), n = new Game({ seed: 'bs', mapId: 'meadow' });
  assert.ok(Math.abs(g.nextPlan.hp / n.nextPlan.hp - BOONSTORM.hpScale) < 1e-9);
  for (let w = 1; w <= 4; w++) { g.completeWave(); assert.ok(g.boonOffer, `offer after wave ${w}`); g.chooseBoon(g.boonOffer[0]); assert.equal(g.boonOffer, null); }
  n.completeWave(); assert.equal(n.boonOffer, null, 'a normal run still waits for wave 3');
  g.wave = 10; g.completeWave(); g.chooseBoon(g.boonOffer[0]);
  assert.ok(g.boonOffer, 'a second pick after the boss'); g.chooseBoon(g.boonOffer[0]); assert.equal(g.boonOffer, null);
  assert.equal(g.stats.boonsTaken, 6);
});
test('an empty boon pool pays gold instead of an offer that would block the next wave', () => {
  for (const mode of ['normal', 'boonstorm']) {
    const g = new Game({ seed: 'dry', mapId: 'meadow', mode });
    g.boonPool = () => [];
    let dry = null; g.on('boonDry', (d) => { dry = d; });
    const g0 = g.gold; g.wave = 3; g.completeWave();
    assert.ok(dry && dry.gold > 0, mode); assert.equal(g.boonOffer, null); assert.ok(g.gold > g0);
    assert.equal(g.startWave(), true, 'the next wave can be called');
  }
});
test('the new modes save and resume as themselves', () => {
  for (const mode of ['sudden', 'boonstorm']) {
    const g = new Game({ seed: 'sv', mapId: 'meadow', mode });
    const s = JSON.parse(JSON.stringify(g.serialize()));
    const r = new Game({ seed: s.seed, mapId: s.mapId, mode: s.mode, save: s });
    assert.equal(r.mode, mode); assert.equal(r.castle.maxHp, g.castle.maxHp); assert.equal(r.gold, g.gold);
  }
});
test('every new achievement has a unique id and the new modes have theirs', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['season5', 'season15', 'season30', 'season3x', 'season12x', 'sudden10', 'sudden25', 'storm15', 'storm30']) assert.ok(ids.includes(id), id);
  const p = defaultProfile(); p.local = { sudden: { runs: 1, best: 10 }, boonstorm: { runs: 1, best: 30 } };
  assert.ok(ACHIEVEMENTS.find((a) => a.id === 'sudden10').check(p)); assert.ok(!ACHIEVEMENTS.find((a) => a.id === 'sudden25').check(p)); assert.ok(ACHIEVEMENTS.find((a) => a.id === 'storm30').check(p));
});

// ---------- mobile ----------
test('the install offer waits for two runs, and never shows once installed or declined', () => {
  const p = defaultProfile();
  assert.equal(installOffer(p, { standalone: false, ios: false, prompt: true }), null);
  p.stats.runs = 2;
  assert.equal(installOffer(p, { standalone: false, ios: false, prompt: true }), 'prompt');
  assert.equal(installOffer(p, { standalone: false, ios: true, prompt: false }), 'ios');
  assert.equal(installOffer(p, { standalone: false, ios: false, prompt: false }), null);
  assert.equal(installOffer(p, { standalone: true, ios: true, prompt: true }), null);
  assert.equal(installOffer({ ...p, installDismissed: 1 }, { standalone: false, ios: true, prompt: true }), null);
  assert.ok(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)); assert.ok(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)); assert.ok(!isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)); assert.ok(!isIos('Mozilla/5.0 (Linux; Android 14)', 5));
});
test('source contracts: wake lock only in battle, Back steps out, Escape closes one dialog', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8'), dom = readFileSync(new URL('../src/ui/dom.js', import.meta.url), 'utf8');
  assert.match(main, /setAwake\(v === 'game'\)/); assert.match(main, /addEventListener\('popstate', \(\) => this\.onBack\(\)\)/); assert.match(main, /addEventListener\('pointerdown', \(\) => this\.armBack\(\), true\)/);
  assert.match(dom, /root\.lastElementChild !== back\) return/);
});
test('floating numbers that land on one spot stack upward instead of piling up', () => {
  const fx = new FX();
  for (let i = 0; i < 4; i++) fx.text(5, 5, '2,033!', { size: 0.4 });
  const ys = fx.texts.map((t) => t.y);
  assert.equal(new Set(ys).size, 4, 'four numbers, four lines');
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i - 1] - ys[i] >= 0.4, 'each a full line above the last');
  fx.text(9, 5, '12');   // far enough along the road: untouched
  assert.equal(fx.texts[4].y, 5);
  for (let i = 0; i < 6; i++) fx.text(5, 5, '2,033!', { size: 0.4 });
  assert.ok(fx.texts.filter((t) => t.x === 5).length <= 6, 'a full spot gives way instead of growing');
});
