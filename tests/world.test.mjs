// v1.11 · World stats, the real-time wave break.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { ABILITIES } from '../src/data/balance.js';
import { cleanUsage, foldUsage, emptyWorld, summarizeWorld, buildUsage, histBucket, histLabel, HIST_BUCKETS } from '../src/game/worldstats.js';
import { makeD1, call } from './helpers/d1.mjs';
import { onRequest } from '../functions/api/[[path]].js';

const ctx = (o = {}) => ({ map: 'meadow', mode: 'normal', ascension: 0, modifiers: [], weapon: 'longbow', wave: 12, kills: 260, heroKills: 40, wavesCleared: 11, duration: 600, ...o });
const usage = (o = {}) => ({ tb: { archer: 4, cannon: 2 }, tk: { archer: 150, cannon: 60 }, td: { archer: 90000, cannon: 40000 }, hd: 30000, fk: { grunt: 200, runner: 60 }, sp: ['archer:sharpshooter'], au: { volley: 3 }, bn: { archer_dmg: 2, steady: 1 }, bk: 0, ...o });

// ---------- the wave break ----------
test('the countdown between waves ticks with the simulation unless the play screen runs it on the clock', () => {
  const g = new Game({ seed: 'timer', mapId: 'meadow' });
  g.buildTimer = 10;
  for (let i = 0; i < 3; i++) g.update(1);
  assert.equal(Math.round(g.buildTimer), 7, 'headless: simulation time');
  g.wallClockBuild = true;
  for (let i = 0; i < 5; i++) g.update(1);
  assert.equal(Math.round(g.buildTimer), 7, 'speed-scaled simulation steps no longer move it');
  g.tickBuild(3);
  assert.equal(Math.round(g.buildTimer), 4, 'real seconds do');
  g.tickBuild(5);
  assert.equal(g.phase, 'wave', 'the wave starts when the break runs out');
  g.tickBuild(5); // harmless outside the build phase
  assert.equal(g.phase, 'wave');
});

test('the break waits for a pending boon and does not run without a timer', () => {
  const g = new Game({ seed: 'timer2', mapId: 'meadow' });
  g.wallClockBuild = true;
  g.tickBuild(100);
  assert.equal(g.phase, 'build', 'wave 1 has no timer');
  g.buildTimer = 5; g.boonOffer = ['archer_dmg'];
  g.tickBuild(100);
  assert.equal(g.buildTimer, 5, 'frozen while choosing a boon');
});

// ---------- the engine records who did the killing ----------
test('the engine counts kills per tower type and Castle Art uses, and puts them in the run summary', () => {
  const g = new Game({ seed: 'usage', mapId: 'meadow', bonus: { unlockedAbilities: new Set(Object.keys(ABILITIES)) } });
  g.gold = 1e6;
  for (const p of g.freePlots().slice(0, 3)) g.build('archer', p.x, p.y);
  g.startWave();
  const art = Object.keys(g.abilities)[0];
  assert.ok(g.useAbility(art, 5, 5), 'arts can be cast while a wave is on');
  let n = 0;
  while (g.phase === 'wave' && n++ < 20000) g.update(1 / 30);
  assert.ok(g.stats.kills > 0);
  assert.equal(g.stats.killsByTower.archer, g.stats.kills, 'every kill was an archer tower');
  const s = g.summary();
  assert.equal(s.artUses[art], 1);
  assert.equal(s.killsByTower.archer, g.stats.kills);
  const u = buildUsage(s);
  assert.equal(u.tb.archer, 3);
  assert.ok(Number.isInteger(u.td.archer));
});

// ---------- cleaning what the client sends ----------
test('cleanUsage keeps real ids and sane counts and drops everything else', () => {
  const u = cleanUsage(usage({ tb: { archer: 4, constructor: 9, __proto__: 5, nonsense: 3, cannon: -2, mage: 1e9 }, fk: { grunt: 100, wyrm: 4 }, sp: ['archer:sharpshooter', 'archer:nope', 'ghost:volley', 'archer:sharpshooter'], au: { volley: 2, zap: 4 }, bn: { steady: 99, fake: 1 } }), ctx());
  assert.deepEqual(Object.keys(u.tb).sort(), ['archer', 'mage']);
  assert.equal(u.tb.mage, 400, 'clamped');
  assert.deepEqual(u.fk, { grunt: 100 });
  assert.deepEqual(u.sp, ['archer:sharpshooter']);
  assert.deepEqual(u.au, { volley: 2 });
  assert.deepEqual(u.bn, { steady: 12 });
  assert.equal(u.m, 'meadow');
});

test('cleanUsage drops kill tallies that do not add up to the run, but keeps the run', () => {
  const u = cleanUsage(usage({ tk: { archer: 900 }, fk: { grunt: 5000 } }), ctx({ kills: 260, heroKills: 40 }));
  assert.deepEqual(u.tk, {}); assert.deepEqual(u.fk, {});
  assert.equal(u.k, 260); assert.ok(Object.keys(u.tb).length, 'builds still count');
  assert.equal(cleanUsage(null, ctx()).k, 260, 'no usage at all still gives a run record');
  assert.equal(cleanUsage({}, null), null);
  const odd = cleanUsage(usage(), ctx({ map: 'elsewhere', mode: 'x', weapon: 'club', ascension: 99, modifiers: ['fog', 'bad'] }));
  assert.equal(odd.m, 'other'); assert.equal(odd.md, 'normal'); assert.equal(odd.wp, 'longbow'); assert.equal(odd.as, 10); assert.deepEqual(odd.mo, ['fog']);
});

test('even a run that touches everything fits well inside the server\'s 8,000-character request limit', async () => {
  const { TOWERS, ENEMIES, BOSSES, BOONS } = await import('../src/data/balance.js');
  const all = (ids, v) => Object.fromEntries(ids.map((k) => [k, v]));
  const big = buildUsage({
    builtByTower: all(Object.keys(TOWERS), 12), killsByTower: all(Object.keys(TOWERS), 123456), dmgByTower: all(Object.keys(TOWERS), 987654321.5), heroDmg: 987654321,
    killsByType: all([...Object.keys(ENEMIES), ...BOSSES.map((b) => b.id)], 123456), specs: Object.keys(TOWERS).flatMap((t) => Object.keys(TOWERS[t].specs || {}).map((s) => `${t}:${s}`)),
    artUses: all(Object.keys(ABILITIES), 99), boons: all(BOONS.map((b) => b.id), 5), bossKills: 5,
  });
  const body = JSON.stringify({ v: '1.11.0', seed: 'x'.repeat(48), map: 'meadow', mode: 'normal', modifiers: ['fog', 'swarm'], ascension: 10, wave: 99, wavesCleared: 98, score: 9e9, kills: 9e5, heroKills: 9e4, duration: 99999, bossDmg: 9e9, weapon: 'longbow', title: 'x'.repeat(24), start: 1, realmSynced: { kills: 1, waves: 1, hero: 1 }, usage: big });
  assert.ok(body.length < 6000, `request is ${body.length} characters`);
});

// ---------- folding and reading ----------
test('folding runs gives the totals, shares and per-tower numbers the page shows', () => {
  const w = emptyWorld();
  foldUsage(w, cleanUsage(usage(), ctx()));
  foldUsage(w, cleanUsage(usage({ tb: { archer: 2 }, tk: { archer: 100 }, td: { archer: 50000 }, fk: { grunt: 140 }, sp: ['archer:volley'], bn: { steady: 1 }, au: {} }), ctx({ wave: 33, kills: 140, heroKills: 10, map: 'twin', weapon: 'crossbow', modifiers: ['fog'], ascension: 2 })));
  const S = summarizeWorld(JSON.parse(JSON.stringify(w)));
  assert.equal(S.totals.runs, 2);
  assert.equal(S.totals.kills, 400); assert.equal(S.totals.hero, 50);
  const archer = S.towers.find((t) => t.id === 'archer'), cannon = S.towers.find((t) => t.id === 'cannon');
  assert.equal(archer.kills, 250); assert.equal(archer.built, 6); assert.equal(archer.runs, 2); assert.equal(archer.pick, 1);
  assert.equal(cannon.runs, 1); assert.equal(cannon.pick, 0.5);
  assert.equal(S.towers[0].id, 'archer', 'sorted by kills');
  assert.equal(archer.killShare, 250 / 400);
  assert.equal(Math.round(archer.killsPerTower), 42);
  assert.deepEqual(S.specs.map((s) => [s.id, s.runs, s.share]), [['archer:sharpshooter', 1, 0.5], ['archer:volley', 1, 0.5]]);
  assert.equal(S.weapons.find((x) => x.id === 'longbow').avgWave, 12);
  assert.equal(S.weapons.find((x) => x.id === 'crossbow').share, 0.5);
  assert.equal(S.arts[0].id, 'volley'); assert.equal(S.arts[0].share, 0.5); assert.equal(S.arts[0].uses, 3);
  assert.equal(S.boons.find((b) => b.id === 'steady').runs, 2);
  assert.equal(S.boons.find((b) => b.id === 'archer_dmg').avgStacks, 2);
  assert.equal(S.foes[0].id, 'grunt'); assert.equal(S.foes[0].kills, 340); assert.equal(S.foes[1].kills, 60);
  assert.equal(S.maps.find((m) => m.id === 'twin').bestWave, 33);
  assert.equal(S.ascs.find((a) => a.level === 2).runs, 1);
  assert.equal(S.mods[0].id, 'fog'); assert.equal(S.mods[0].share, 0.5);
  assert.equal(S.modes.find((m) => m.id === 'normal').runs, 2);
  assert.equal(S.hist.find((x) => x.bucket === 10).runs, 1); assert.equal(S.hist.find((x) => x.bucket === 30).runs, 1);
  assert.equal(S.totals.avgWave, 22.5);
  assert.equal(summarizeWorld({}).totals.runs, 0, 'an empty world is fine');
});

test('wave buckets', () => {
  assert.equal(histBucket(0), 1); assert.equal(histBucket(4), 1); assert.equal(histBucket(5), 5); assert.equal(histBucket(29), 20); assert.equal(histBucket(999), 200);
  assert.equal(histLabel(5), '5–9'); assert.equal(histLabel(200), '200+'); assert.equal(HIST_BUCKETS.length, 12);
});

// ---------- the server ----------
const setup = async () => {
  const env = { DB: makeD1() };
  const reg = async (name, ip) => (await call(onRequest, env, 'POST', 'register', { body: { name }, ip })).data;
  const api = (m, path, who, body) => call(onRequest, env, m, path, { token: who.token, body });
  const body = (o = {}) => ({ seed: 's' + Math.random(), map: 'meadow', mode: 'normal', modifiers: [], ascension: 0, wave: 12, wavesCleared: 11, score: 4200, kills: 260, heroKills: 40, duration: 600, bossDmg: 0, weapon: 'longbow', usage: usage(), ...o });
  const reopen = () => env.DB.raw.prepare("UPDATE world_stats SET data = '0' WHERE period = '_' AND cat = 'lock'").run(); // as if the 5-minute throttle had passed
  const pending = () => env.DB.raw.prepare('SELECT COUNT(*) AS n FROM run_usage').get().n;
  return { env, reg, api, body, reopen, pending };
};

test('runs leave usage records and opening World Stats folds them, once', async () => {
  const { env, reg, api, body, pending } = await setup();
  const a = await reg('Alice Archer', '2.2.2.2'), b = await reg('Bob Bowman', '3.3.3.3');
  assert.ok((await api('POST', 'runs', a, body())).data.accepted);
  assert.ok((await api('POST', 'runs', b, body({ weapon: 'crossbow', usage: usage({ tb: { mage: 3, constructor: 5 } }) }))).data.accepted);
  assert.equal(pending(), 2);
  assert.ok(!JSON.stringify(env.DB.raw.prepare('SELECT data FROM run_usage').all()).includes('constructor'), 'unknown keys never reach storage');
  env.DB.raw.prepare("INSERT INTO run_usage (season, data) VALUES ('x', 'not json')").run();

  const w = (await api('GET', 'world', a)).data;
  assert.equal(w.period, 'all');
  const S = summarizeWorld(w.world);
  assert.equal(S.totals.runs, 2, 'both good records folded, the broken one skipped');
  assert.equal(S.weapons.length, 2);
  assert.equal(S.towers.find((t) => t.id === 'archer').kills, 300);
  assert.equal(S.towers.find((t) => t.id === 'mage').built, 3);
  assert.ok(w.people.citizens >= 2);
  assert.ok(w.updated > 0);
  assert.equal(pending(), 0, 'folded records are deleted');

  const again = summarizeWorld((await api('GET', 'world', b)).data.world);
  assert.equal(again.totals.runs, 2, 'reading again never double counts');
  assert.equal(again.totals.kills, 520);
  const wk = (await api('GET', 'world?period=week', a)).data;
  assert.equal(wk.period, 'week');
  assert.equal(summarizeWorld(wk.world).totals.runs, 2, 'this week holds the same two runs');
});

test('folding is throttled, then picks up whatever is waiting', async () => {
  const { env, reg, api, body, reopen, pending } = await setup();
  const a = await reg('Cara Cannon', '5.5.5.5');
  assert.ok((await api('POST', 'runs', a, body())).data.accepted);
  assert.equal(summarizeWorld((await api('GET', 'world', a)).data.world).totals.runs, 1);
  const add = () => env.DB.raw.prepare("INSERT INTO run_usage (season, data) VALUES ('2026-W41', ?)").run(JSON.stringify(cleanUsage(usage(), ctx())));
  add(); add();
  const early = (await api('GET', 'world', a)).data;
  assert.equal(summarizeWorld(early.world).totals.runs, 1, 'inside the window nothing is folded');
  assert.equal(pending(), 2, 'the new records wait');
  reopen();
  const late = (await api('GET', 'world', a)).data;
  assert.equal(summarizeWorld(late.world).totals.runs, 3);
  assert.equal(late.pending, 0);
  assert.equal(pending(), 0);
  // Each record is counted in the week it was played, not the week it was folded.
  assert.equal(summarizeWorld((await api('GET', 'world?period=week', a)).data.world).totals.runs, 1);
  const old = env.DB.raw.prepare("SELECT data FROM world_stats WHERE period = '2026-W41' AND cat = 'tot'").get();
  assert.equal(JSON.parse(old.data).runs, 2);
});

test('a run sent without usage, or with junk usage, still counts for the boards and never breaks the ledger', async () => {
  const { reg, api, body, pending } = await setup();
  const a = await reg('Dana Dagger', '6.6.6.6'), b = await reg('Eli Elm', '7.7.7.7');
  const r1 = (await api('POST', 'runs', a, body({ usage: undefined }))).data;
  assert.ok(r1.accepted && r1.ranks.wave >= 1);
  assert.equal(pending(), 1, 'a record of the totals is kept even with no detail');
  const r2 = (await api('POST', 'runs', b, body({ usage: 'lol', weapon: { x: 1 } }))).data;
  assert.ok(r2.accepted);
  const S = summarizeWorld((await api('GET', 'world', a)).data.world);
  assert.equal(S.totals.runs, 2); assert.equal(S.totals.kills, 520);
  assert.equal(S.towers.length, 0, 'no tower detail was sent, so none is counted');
});

test('rejected runs add nothing to the ledger', async () => {
  const { reg, api, body, pending } = await setup();
  const a = await reg('Finn Fletcher', '8.8.8.8');
  assert.equal((await api('POST', 'runs', a, body({ score: 99999999999 }))).data.accepted, false);
  assert.equal(pending(), 0);
});
