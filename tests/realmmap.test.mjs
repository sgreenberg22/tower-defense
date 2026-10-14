// v1.15 · The Map of Aldermere: territory that grows with won tasks and shrinks with missed ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, call } from './helpers/d1.mjs';
import { onRequest } from '../functions/api/[[path]].js';
import { PROVINCES, MAX_PROVINCES, TERRITORY, TERRAINS, applyDelta, deltaFor, frontier, mapPerks, marchSetup, heldProvinces } from '../src/game/realmmap.js';
import { utcDateKey, weekKey, prevPeriodKey } from '../src/core/rng.js';
import { ENEMIES, TOWERS, TROOPS } from '../src/data/balance.js';
import { MAPS } from '../src/game/maps.js';
import { runBonus, defaultProfile } from '../src/meta/profile.js';
import { planWave } from '../src/game/waves.js';
import { Game } from '../src/game/engine.js';

test('forty provinces with unique names, a capital first, and real foes, units and battlefields', () => {
  assert.equal(MAX_PROVINCES, 40);
  assert.ok(PROVINCES[0].capital);
  assert.equal(new Set(PROVINCES.map((p) => p.id)).size, 40);
  for (const p of PROVINCES) {
    assert.ok(ENEMIES[p.foe], p.name + ' foe');
    assert.ok(MAPS[TERRAINS[p.terrain].battlefield], p.name + ' battlefield');
    if (p.unit) assert.ok(p.unit.kind === 'tower' ? TOWERS[p.unit.id] : TROOPS[p.unit.id], p.name + ' unit');
    assert.ok(p.perkText && !p.perkText.includes('undefined'));
  }
  // Conquest goes ring by ring, so the Realm always grows outward from the capital.
  for (let i = 1; i < 40; i++) assert.ok(PROVINCES[i].ring >= PROVINCES[i - 1].ring);
});

test('the border moves: gains, losses, the floor and the bulwark', () => {
  assert.equal(deltaFor('day', true), 1);
  assert.equal(deltaFor('day', false), -1);
  assert.equal(deltaFor('week', 1.6), 3);
  assert.equal(deltaFor('week', 1.0), 2);
  assert.equal(deltaFor('week', 0.7), 0);
  assert.equal(deltaFor('week', 0.2), -2);
  assert.equal(deltaFor('month', 0), -4);
  assert.deepEqual(applyDelta({ held: 10, bulwark: 0 }, 2), { held: 12, bulwark: 0 });
  assert.deepEqual(applyDelta({ held: 4, bulwark: 0 }, -5), { held: TERRITORY.floor, bulwark: 0 });
  assert.deepEqual(applyDelta({ held: 39, bulwark: 0 }, 4), { held: 40, bulwark: 3 });
  assert.deepEqual(applyDelta({ held: 40, bulwark: 3 }, -4), { held: 39, bulwark: 0 });
  assert.deepEqual(applyDelta({ held: 40, bulwark: 6 }, 3), { held: 40, bulwark: 6 });
  const f = frontier(6);
  assert.equal(f.next, PROVINCES[6]);
  assert.equal(f.border, PROVINCES[5]);
  assert.equal(frontier(40).next, null);
});

test('held provinces bless every run, and losing one takes its gift away', () => {
  const p = defaultProfile();
  const some = mapPerks(12), more = mapPerks(13);
  const k13 = Object.keys(PROVINCES[12].perk)[0];
  assert.ok((more[k13] || 0) > (some[k13] || 0));
  const b = runBonus(p, null, mapPerks(40));
  const trainKeys = Object.keys(mapPerks(40)).filter((k) => k.startsWith('train_'));
  for (const k of trainKeys) assert.ok(b.towerTrain[k.slice(6)] > 0, k);
  assert.ok(b.troopTrain.cavalry > 0, 'troop gifts reach the garrison');
  assert.equal(heldProvinces(2).length, TERRITORY.floor);
});

test('troop gifts make that troop tougher in a run', () => {
  const plain = new Game({ seed: 'tt', mapId: 'meadow' });
  const gifted = new Game({ seed: 'tt', mapId: 'meadow', bonus: { troopTrain: { footman: 0.1 } } });
  const a = plain.addTroop('footman'), b = gifted.addTroop('footman');
  assert.ok(Math.abs(b.maxHp / a.maxHp - 1.1) < 1e-9 && Math.abs(b.dmg / a.dmg - 1.1) < 1e-9);
});

test('a March brings the province foe early, its land and its weather', () => {
  const fen = PROVINCES.find((p) => p.terrain === 'fen' && p.foe === 'troll');
  const m = marchSetup(fen.id);
  assert.equal(m.foe, 'troll');
  const g = new Game({ seed: 'm1', mapId: m.mapId, mode: 'march', march: fen.id });
  assert.equal(g.biome.id, 'shadow');
  let trolls = 0;
  for (let w = 8; w <= 18; w++) for (const gr of planWave(w, "m1", g.waveOpts()).groups) if (gr.type === 'troll') trolls += gr.count;
  assert.ok(trolls >= 3, `trolls show up long before wave 34 (got ${trolls})`);
  // Normal runs are untouched.
  const n = new Game({ seed: 'm1', mapId: 'meadow' });
  assert.equal(n.biome.id, 'meadow');
  for (let w = 8; w <= 12; w++) assert.ok(!planWave(w, "m1", n.waveOpts()).groups.some((gr) => gr.type === 'troll'));
  // Weather arrives from the march weather wave, not before.
  g.wave = TERRITORY.marchWeather - 1; g.startWave(); assert.equal(g.hazard.kind, null);
  const h = new Game({ seed: 'm2', mapId: m.mapId, mode: 'march', march: fen.id, startWave: TERRITORY.marchWeather });
  while (h.boonOffer) h.chooseBoon(h.boonOffer[0]);
  h.startWave(); assert.equal(h.hazard.kind, 'stealth');
  // It survives a save.
  const saved = new Game({ seed: 'm1', mapId: m.mapId, mode: 'march', save: g.serialize() });
  assert.equal(saved.march?.id, fen.id);
});

// ---------- server ----------
async function setup() {
  const env = { DB: makeD1() };
  const reg = async (name, ip) => (await call(onRequest, env, 'POST', 'register', { body: { name }, ip })).data;
  return { env, reg };
}
const dayAgo = (n) => utcDateKey(new Date(Date.parse(utcDateKey() + 'T00:00:00Z') - n * 86400000));

test('the Realm starts with its heartland and settles closed days exactly once', async () => {
  const { env, reg } = await setup();
  const a = await reg('Mapmaker Mo', '7.7.7.7');
  let r = (await call(onRequest, env, 'GET', 'realm', { token: a.token })).data;
  assert.equal(r.map.held, TERRITORY.start);
  assert.equal(r.map.next, PROVINCES[TERRITORY.start].id);
  const db = env.DB.raw;
  // Pretend the map was last settled four days ago: won, missed, won.
  db.exec(`UPDATE realm_map SET last_day = '${dayAgo(4)}'`);
  db.exec(`INSERT OR REPLACE INTO rally (day, goal, kills, done) VALUES ('${dayAgo(3)}', 1500, 1600, 1), ('${dayAgo(2)}', 1500, 300, 0), ('${dayAgo(1)}', 1500, 1500, 0)`);
  r = (await call(onRequest, env, 'GET', 'realm', { token: a.token })).data;
  assert.equal(r.map.held, TERRITORY.start + 1);
  assert.equal(r.map.log.length, 3);
  assert.deepEqual(r.map.log.map((l) => l.outcome).sort(), ['missed', 'won', 'won']);
  r = (await call(onRequest, env, 'GET', 'realm', { token: a.token })).data;
  assert.equal(r.map.held, TERRITORY.start + 1, 'settling is idempotent');
  assert.equal(r.map.log.length, 3);
  const feed = (await call(onRequest, env, 'GET', 'realm/feed', { token: a.token })).data;
  assert.ok(feed.items.some((d) => d.kind === 'map' && d.text.includes(PROVINCES[TERRITORY.start].name)));
});

test('a won week pushes the border out; an abandoned one pulls it back', async () => {
  const { env, reg } = await setup();
  const a = await reg('Warden Wil', '8.8.8.8');
  await call(onRequest, env, 'GET', 'realm', { token: a.token });
  const db = env.DB.raw;
  const last = prevPeriodKey(weekKey()), before = prevPeriodKey(last), older = prevPeriodKey(before);
  db.exec(`UPDATE realm_map SET last_week = '${older}', last_day = '${dayAgo(1)}'`);
  db.exec(`INSERT INTO realm_period (period, kind, goal_kills, goal_waves, kills, waves, starts, ends) VALUES ('${before}', 'week', 10000, 500, 12000, 600, 0, 1)`);
  // `last` has no row: nobody fought that week, so it counts as abandoned.
  const r = (await call(onRequest, env, 'GET', 'realm', { token: a.token })).data;
  assert.equal(r.map.held, TERRITORY.start + 2 - 2);
  assert.deepEqual(r.map.log.map((l) => l.outcome).sort(), ['Victory', 'failed']);
});

test('kills in a March count double toward the Daily Rally', async () => {
  const { env, reg } = await setup();
  const a = await reg('Marcher Max', '9.9.9.9');
  const body = { seed: 'abc', map: 'bog', mode: 'march', modifiers: [], ascension: 0, wave: 12, wavesCleared: 11, score: 9000, kills: 300, heroKills: 20, duration: 600 };
  const r = await call(onRequest, env, 'POST', 'runs', { token: a.token, body });
  assert.equal(r.data.accepted, true);
  assert.equal(r.data.rally.kills, 600);
  assert.equal(r.data.realm.added.kills, 300, 'the weekly and monthly goals count it once');
});

test('map events: a spotlit province pays Renown when held or marched on, only while it runs', async () => {
  const { MAP_EVENTS } = await import('../src/data/events.js');
  const { activeMapEvents, mapEventFor, mapEventBonus } = await import('../src/meta/events.js');
  for (const e of MAP_EVENTS) { assert.ok(PROVINCES.some((p) => p.id === e.province), e.id + ' names a real province'); assert.ok(e.from <= e.to); }
  const ev = MAP_EVENTS[0], pv = PROVINCES.find((p) => p.id === ev.province), mid = new Date(ev.from + 'T12:00:00Z');
  assert.equal(activeMapEvents(new Date('2026-10-19T23:00:00Z')).length, 0);
  assert.equal(mapEventFor(ev.province, mid)?.id, ev.id);
  assert.equal(mapEventBonus({}, pv.idx + 1, PROVINCES, mid), ev.renownHeld, 'held: every run');
  assert.equal(mapEventBonus({}, pv.idx, PROVINCES, mid), 0, 'not yet held: nothing');
  assert.equal(mapEventBonus({ march: ev.province }, pv.idx, PROVINCES, mid), ev.renownMarch, 'a March on it');
  assert.equal(mapEventBonus({ march: ev.province }, 40, PROVINCES, new Date('2026-11-03T00:00:00Z')), 0, 'over');
});
