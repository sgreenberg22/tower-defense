import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, call } from './helpers/d1.mjs';
import { onRequest } from '../functions/api/[[path]].js';
import { Game } from '../src/game/engine.js';
import { GAME } from '../src/data/balance.js';
import { seasonKey } from '../src/core/rng.js';
import { buildUsage } from '../src/game/worldstats.js';
import { validateRun } from '../src/game/rules.js';
import {
  WARLORDS, warlordFor, weeklyDecrees, decreeAmount, decreeGoal, decreePerks, WONDERS, wonderPerks, wonderStones, warfrontSetup,
  encounterFor, isEncounterWave, ENCOUNTERS, isChampionWave, championType, CHAMPION,
} from '../src/game/living.js';
import { planWave } from '../src/game/waves.js';
import { MAPS } from '../src/game/maps.js';

test('warlords: one a week, never the same two weeks running, everyone meets the same one', () => {
  const weeks = ['2026-W40', '2026-W41', '2026-W42', '2026-W43', '2026-W44', '2026-W45', '2026-W52', '2026-W53', '2027-W01'];
  for (let i = 1; i < weeks.length; i++) assert.notEqual(warlordFor(weeks[i]).id, warlordFor(weeks[i - 1]).id, weeks[i]);
  assert.equal(warlordFor('2026-W44').id, warlordFor('w:2026-W44').id);
  const seen = new Set(); for (let w = 1; w <= 16; w++) seen.add(warlordFor(`2026-W${String(w).padStart(2, '0')}`).id);
  assert.equal(seen.size, WARLORDS.length, 'every warlord takes a turn');
});

test('warlord: favoured foes march more often, the twist applies, champions arrive on schedule', () => {
  const wl = WARLORDS.find((w) => w.id === 'grukk');
  const count = (plan, ids) => plan.groups.filter((g) => ids.includes(g.type)).reduce((a, g) => a + g.count, 0);
  let plain = 0, favoured = 0;
  for (let w = 25; w < 35; w++) {
    plain += count(planWave(w, 'wl'), wl.favor);
    favoured += count(planWave(w, 'wl', { favor: wl.favor, favorBoost: 2.4 }), wl.favor);
  }
  assert.ok(favoured > plain * 1.4, `favoured foes are more common (${plain} → ${favoured})`);
  const g = new Game({ seed: 'wl', mapId: 'meadow', living: true, warlord: 'grukk' });
  assert.equal(g.warlord.id, 'grukk');
  const e = g.spawnEnemy('grunt', 0, { plan: g.nextPlan });
  const g0 = new Game({ seed: 'wl', mapId: 'meadow' });
  const e0 = g0.spawnEnemy('grunt', 0, { plan: g0.nextPlan });
  assert.equal(e.armor - e0.armor, 6, 'Grukk: +6 armor on every foe');
  assert.equal(g0.warlord, null, 'no warlord unless the app asks for one (tests and sims stay as they were)');
  assert.ok(isChampionWave(12) && isChampionWave(28) && !isChampionWave(13) && !isChampionWave(20) && !isChampionWave(30), 'every 8 waves from 12, never on a boss wave');
  const t = championType(20, 'x', wl);
  assert.ok(wl.favor.includes(t) || t === 'grunt' || t === 'shield', t);
});

test('champion: a named, much tougher foe in the middle of a champion wave, with a bounty', () => {
  const g = new Game({ seed: 'champ', mapId: 'meadow', living: true, warlord: 'vargul', startWave: 12 });
  while (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
  assert.equal(g.startWave(), true);
  const q = g.spawnQueue.find((s) => s.champion);
  assert.ok(q, 'a champion is queued');
  const e = g.spawnEnemy(q.type, q.spawn, { plan: g.plan, champion: true });
  const plain = g.spawnEnemy(q.type, q.spawn, { plan: g.plan });
  assert.ok(e.champion.startsWith('Vargul'));
  assert.ok(Math.abs(e.maxHp / plain.maxHp - CHAMPION.hp) < 0.01);
  const gold0 = g.gold; g.kill(e, null); g.kill(plain, null);
  assert.equal(g.stats.champions, 1);
  assert.ok(g.gold - gold0 > 0);
});

test('encounters: deterministic offers in the right breaks; each choice does what it says', () => {
  assert.ok(isEncounterWave(4) && isEncounterWave(11) && !isEncounterWave(5));
  const a = encounterFor(11, 'seedX'), b = encounterFor(11, 'seedX');
  assert.deepEqual(a, b);
  // Play through each encounter on a fresh game.
  for (const id of Object.keys(ENCOUNTERS)) {
    const g = new Game({ seed: 'enc-' + id, mapId: 'meadow', living: true, warlord: 'ghaz', startWave: 4 });
    g.gold = 5000;
    g.encounter = { id, wave: g.wave, cost: ENCOUNTERS[id].cost > 0 ? 100 : 0, gain: ENCOUNTERS[id].cost < 0 ? 100 : 0 };
    const wall0 = g.wall.maxHp, plots0 = g.claimed.size, troops0 = g.garrison.units.length, td0 = g.bonus.towerDmg || 0;
    assert.equal(g.resolveEncounter('a'), true, id);
    assert.equal(g.encounter, null, id);
    if (id === 'merchant') assert.ok(g.boonOffer?.length, 'the merchant sells a boon pick');
    if (id === 'refugees') assert.equal(g.garrison.units.length, troops0 + 2);
    if (id === 'mason') assert.ok(g.wall.maxHp > wall0);
    if (id === 'deserter') assert.equal(g.claimed.size, plots0 + 1);
    if (id === 'envoy') assert.ok(g.bonus.towerDmg > td0);
    if (id === 'bloodmoon') { assert.equal(g.edict.count, 1.35); assert.ok(g.nextPlan.total > planWave(4, g.seed, {}).total); }
    if (id === 'cache') assert.ok(g.nextPlan.hp > planWave(4, g.seed, {}).hp * 1.2);   // 25% tougher
    // encounter buffs survive save and resume
    if (id === 'envoy' || id === 'captain' || id === 'alchemist') {
      const s = g.serialize();
      const h = new Game({ seed: s.seed, mapId: 'meadow', save: s });
      assert.deepEqual(h.runBuffs, g.runBuffs, id);
      if (id === 'captain') assert.equal(h.troopSlotsMax(), g.troopSlotsMax());
    }
  }
  // Not enough gold: refused, offer still waiting. Starting the wave declines it.
  const g = new Game({ seed: 'poor', mapId: 'meadow', living: true, warlord: 'ghaz', startWave: 4 });
  g.gold = 5; g.encounter = { id: 'envoy', wave: 4, cost: 400, gain: 0 };
  assert.equal(g.resolveEncounter('a'), false);
  assert.ok(g.encounter);
  g.startWave();
  assert.equal(g.encounter, null);
});

test('encounters appear in a living run and the run still plays to the end', () => {
  const g = new Game({ seed: 'live1', mapId: 'meadow', living: true, warlord: 'rotmaw' });
  let offers = 0, champs = 0;
  g.on('encounter', () => offers++); g.on('championSpawn', () => champs++);
  let steps = 0;
  while (!g.over && g.wave < 30 && steps < 60 * 60 * 120) {
    if (g.phase === 'build') {
      if (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
      if (g.encounter) g.resolveEncounter('b');
      for (const p of g.freePlots()) if (g.gold >= g.buildCost('archer')) g.build('archer', p.x, p.y);
      for (const t of g.towers) if (g.canUpgrade(t)) g.upgrade(t);
      g.startWave();
    }
    g.update(GAME.step); steps++;
  }
  assert.ok(offers >= 2, `offers ${offers}`);
  assert.ok(g.wave < 20 || champs >= 1, `champions ${champs}`);
});

test('decrees: three a week, the warlord one always; amounts come from the usage record', () => {
  const list = weeklyDecrees('2026-W45', Object.fromEntries(Object.entries(MAPS).map(([k, m]) => [k, m.name])));
  assert.equal(list.length, 3);
  assert.equal(list[0].id, 'warlord');
  assert.equal(new Set(list.map((d) => d.id)).size, 3);
  const u = { fk: { wyvern: 10, harpy: 5, shield: 7 }, au: { volley: 3 }, bk: 2, ch: 1, wc: 30, hk: 40, m: 'meadow' };
  assert.equal(decreeAmount({ id: 'skies' }, u), 15);
  assert.equal(decreeAmount({ id: 'tyrants' }, u), 2);
  assert.equal(decreeAmount({ id: 'field', map: 'meadow' }, u), 30);
  assert.equal(decreeAmount({ id: 'field', map: 'twin' }, u), 0);
  assert.equal(decreeAmount({ id: 'warlord', favor: ['shield'] }, u), 7);
  assert.ok(decreeGoal({ per: 100 }, 0) >= 1200, 'a floor for a quiet Realm');
  assert.deepEqual(decreePerks([{ id: 'skies', done: true, reward: { airDmg: 0.06 } }, { id: 'iron', done: false, reward: { armoredDmg: 0.06 } }]), { airDmg: 0.06 });
});

test('wonders: stones per wave are capped, perks stack as they are built', () => {
  assert.equal(wonderStones(10), 30);
  assert.ok(wonderStones(10000) <= 600);
  assert.deepEqual(wonderPerks(0), {});
  assert.equal(wonderPerks(1).renownBonus, 0.05);
  assert.equal(wonderPerks(3).towerDmg, 0.03);
  assert.equal(wonderPerks(WONDERS.length).towerDmg, 0.07);
});

test('warfront: one setup a week for everyone, validated and ranked on its own board', async () => {
  const a = warfrontSetup('2026-W45'), b = warfrontSetup('2026-W45');
  assert.deepEqual(a, b);
  assert.equal(a.modifiers.length, 2);
  assert.equal(a.warlord.id, warlordFor('2026-W45').id);
  const g = new Game({ seed: a.seed, mapId: a.map, mode: 'warfront', modifiers: a.modifiers });
  assert.equal(g.warlord.id, a.warlord.id);
  assert.equal(g.fury, 2);
  assert.ok(isChampionWave(17, 2) && !isChampionWave(17, 1), 'a champion every 5 waves at full fury');
  assert.equal(g.towerCap('archer'), Infinity, 'no tower caps in the Warfront');
  assert.equal(validateRun({ mode: 'warfront', wave: 30, wavesCleared: 29, score: 1000, kills: 900, heroKills: 10, duration: 1200, clock: 1000, modifiers: a.modifiers, start: 1 }), null);
  assert.equal(validateRun({ mode: 'warfront', wave: 30, wavesCleared: 29, score: 1000, kills: 900, heroKills: 10, duration: 20, clock: 10, modifiers: a.modifiers, start: 1 }), 'too fast');
});

test('server: runs fill the decrees and lay stones; Renown can be given; the Warfront has a board', async () => {
  const env = { DB: makeD1() };
  const reg = async (name, ip) => (await call(onRequest, env, 'POST', 'register', { body: { name }, ip })).data;
  const a = await reg('Alice Archer', '2.2.2.2');
  const season = seasonKey();
  const decrees = weeklyDecrees(season);
  // A run that killed the warlord's favoured foes and some flyers
  const favour = decrees[0].favor.filter((id) => id !== 'golem').slice(0, 2);
  const fk = { [favour[0]]: 120, wyvern: 30, grunt: 50 };
  const summary = { builtByTower: { archer: 4 }, killsByTower: { archer: 200 }, dmgByTower: { archer: 9000 }, heroDmg: 10, killsByType: fk, specs: [], artUses: { volley: 4 }, boons: {}, bossKills: 1, champions: 1 };
  const body = { seed: 'liv-1', map: 'meadow', mode: 'normal', modifiers: [], ascension: 0, wave: 24, wavesCleared: 23, score: 20000, kills: 200, heroKills: 20, duration: 1100, usage: buildUsage(summary) };
  const r = await call(onRequest, env, 'POST', 'runs', { token: a.token, body });
  assert.equal(r.data.accepted, true, r.data.reason);
  const realm = (await call(onRequest, env, 'GET', 'realm', { token: a.token })).data;
  assert.equal(realm.decrees.list.length, 3);
  assert.equal(realm.decrees.list[0].progress, 120, 'the warlord decree counts the favoured foes');
  assert.equal(realm.decrees.list[0].mine, 120);
  assert.equal(realm.wonder.stones, wonderStones(23));
  assert.equal(realm.wonder.mine, wonderStones(23));
  // Give Renown: the first Wonder needs a few thousand stones
  const give = await call(onRequest, env, 'POST', 'realm/give', { token: a.token, body: { amount: WONDERS[0].cost } });
  assert.equal(give.data.ok, true);
  assert.equal(give.data.wonder.built, 1, 'the Great Beacon stands');
  const feed = (await call(onRequest, env, 'GET', 'realm/feed', { token: a.token })).data;
  assert.ok(feed.items.some((d) => d.kind === 'wonder'));
  assert.equal((await call(onRequest, env, 'POST', 'realm/give', { token: a.token, body: { amount: 0 } })).status, 400);
  // Fulfil a decree: the contributors are paid and next week's blessing is set
  env.DB.raw.exec(`UPDATE decree SET goal = 50 WHERE week = '${season}' AND id = 'warlord'`);
  env.DB.raw.exec('DELETE FROM rate');
  const r2 = await call(onRequest, env, 'POST', 'runs', { token: a.token, body: { ...body, seed: 'liv-2', duration: 1200 } });
  assert.equal(r2.data.accepted, true);
  const realm2 = (await call(onRequest, env, 'GET', 'realm', { token: a.token })).data;
  assert.equal(realm2.decrees.list[0].done, true);
  const inbox = (await call(onRequest, env, 'GET', 'inbox', { token: a.token })).data;
  assert.ok(inbox.items.some((m) => /Royal Decree/.test(m.title)));
  // Warfront run on the weekly seed ranks on its own board
  env.DB.raw.exec('DELETE FROM rate');
  const wf = warfrontSetup(season);
  const w = await call(onRequest, env, 'POST', 'runs', { token: a.token, body: { seed: wf.seed, map: wf.map, mode: 'warfront', modifiers: wf.modifiers, ascension: 0, wave: 31, wavesCleared: 30, score: 5000, kills: 800, heroKills: 30, duration: 1500, clock: 1400 } });
  assert.equal(w.data.accepted, true, w.data.reason);
  assert.ok(w.data.ranks.warfront >= 1);
  const lb = (await call(onRequest, env, 'GET', 'leaderboard?board=warfront&scope=global&period=week', { token: a.token })).data;
  assert.equal(lb.rows[0].value, 31);
});

test('a database from before v1.48 gets the decree and wonder tables on its next request', async () => {
  const { onRequest: fresh } = await import('../functions/api/[[path]].js?upgrade');   // own module copy, so its schema check runs again
  const db = makeD1();
  for (const t of ['decree', 'decree_contrib', 'wonder', 'wonder_contrib']) db.raw.exec('DROP TABLE ' + t);
  const env = { DB: db };
  const reg = await call(fresh, env, 'POST', 'register', { body: { name: 'Upgrader' }, ip: '9.9.9.9' });
  assert.equal(reg.status, 200);
  const realm = await call(fresh, env, 'GET', 'realm', { token: reg.data.token });
  assert.equal(realm.status, 200);
  assert.ok(realm.data.decrees && realm.data.wonder);
});
