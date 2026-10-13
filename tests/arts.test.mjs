import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { ABILITIES, TOWERS, TOWER_ORDER, KEEP, MASTERY_PERKS, PERK_STARS, ART_SLOTS, ART_KEYS, masteryMods } from '../src/data/balance.js';
import { defaultProfile, runBonus, loadoutFor, unlockedAbilities, buyKeep } from '../src/meta/profile.js';
import { unlockInfo } from '../src/meta/unlockinfo.js';

const ALL = new Set(Object.keys(ABILITIES));
const mk = (extra = {}, opts = {}) => {
  const g = new Game({ seed: 'arts', mapId: 'meadow', startWave: 30, bonus: { unlockedAbilities: ALL, ...extra }, ...opts });
  g.gold = 1e7;
  for (let i = 0; i < 20; i++) { g.update(0.1); if (g.boonOffer) g.chooseBoon(g.boonOffer[0]); else break; }
  return g;
};
const wave = (g) => { g.startWave(); assert.equal(g.phase, 'wave'); g.spawnQueue = []; return g; };
const foe = (g, type = 'grunt', seg = 3) => g.spawnEnemy(type, 0, { seg: 0 });
const place = (g, id, i = 0) => { const p = g.freePlots()[i]; return g.build(id, p.x, p.y); };

test('there are 15 castle arts and the loadout keeps only owned ones, in slot order, up to the slot count', () => {
  assert.equal(Object.keys(ABILITIES).length, 15);
  const g = mk({ artSlots: 4 }, { loadout: ['stasis', 'volley', 'nope', 'smite', 'oil', 'horn'] });
  assert.deepEqual(g.loadout, ['stasis', 'volley', 'smite', 'oil']);
  assert.deepEqual(Object.keys(g.abilities), g.loadout);
  assert.equal(g.abilityKey('smite'), ART_KEYS[2]);
  const g6 = mk({ artSlots: 6 }, { loadout: Object.keys(ABILITIES) });
  assert.equal(g6.loadout.length, 6);
  assert.ok(ART_SLOTS.max === 6);
});

test('profile: base slots, Arsenal adds slots, saved loadout is respected and trimmed to what you own', () => {
  const p = defaultProfile();
  assert.deepEqual(loadoutFor(p).sort(), ['oil', 'volley']);
  p.renown = 1e6;
  for (const id of ['unlock_smite', 'unlock_meteor', 'unlock_nova', 'unlock_horn']) assert.ok(buyKeep(p, id));
  assert.equal(runBonus(p).artSlots, 4);
  assert.equal(loadoutFor(p).length, 4);
  p.loadout = ['meteor', 'smite', 'aegis'];
  assert.deepEqual(loadoutFor(p), ['meteor', 'smite']);
  assert.ok(buyKeep(p, 'artslot'));
  assert.equal(runBonus(p).artSlots, 5);
  assert.ok(unlockedAbilities(p).has('smite'));
});

test('every unlockable art has an unlock node with a description and cd/power upgrades that change the run bonus', () => {
  for (const [id, A] of Object.entries(ABILITIES)) {
    assert.ok(A.name && A.icon && A.desc && A.cd > 0, id);
    if (!A.keep) continue;
    const node = KEEP.find((k) => k.id === A.keep);
    assert.ok(node, `${id} unlock node`);
    const info = unlockInfo(node);
    assert.ok(info && info.desc.length > 20 && info.facts.length >= 2, `${id} info`);
    if (A.buy) {
      assert.ok(KEEP.find((k) => k.id === id + 'cd' && k.req === A.keep));
      const pow = KEEP.find((k) => k.id === id + 'pow' && k.req === A.keep);
      assert.ok(pow && A.up && ['dmg', 'dur', 'amt', 'rad'].includes(A.up.stat));
      const p = defaultProfile(); p.keep[A.keep] = 1; p.keep[id + 'pow'] = 2; p.keep[id + 'cd'] = 2;
      assert.equal(runBonus(p).abilityLv[id], 2);
      assert.ok(runBonus(p).abilityCd[id] < 1);
    }
  }
  for (const n of KEEP.filter((k) => k.tower || k.weapon)) assert.ok(unlockInfo(n).desc, n.id);
});

test('every art can be used without error and recharges', () => {
  for (const id of Object.keys(ABILITIES)) {
    const g = wave(mk({ artSlots: 6 }, { loadout: [id] }));
    const e = foe(g); foe(g, 'wyvern');
    g.update(0.1);
    assert.ok(g.abilityReady(id), id + ' ready');
    assert.ok(g.useAbility(id, e.x, e.y), id + ' used');
    assert.ok(g.abilities[id].cd > 0);
    for (let i = 0; i < 40; i++) g.update(0.1);
    assert.ok(!g.over);
  }
});

test('Smite hits the toughest foes; Grapeshot hits a cone only; Meteor lands late', () => {
  const g = wave(mk({}, { loadout: ['smite', 'grapeshot', 'meteor'] }));
  const weak = foe(g), tough = foe(g, 'golem'), tough2 = foe(g, 'golem'), tough3 = foe(g, 'ram');
  const before = [weak, tough, tough2, tough3].map((e) => e.hp);
  g.useAbility('smite');
  assert.equal(weak.hp, before[0], 'weakest untouched');
  assert.ok(tough.hp < before[1] && tough2.hp < before[2] && tough3.hp < before[3]);
  const o = g.heroOrigin();
  const inCone = foe(g), behind = foe(g);
  inCone.x = o.x + 3; inCone.y = o.y; behind.x = o.x - 3; behind.y = o.y;
  const h0 = [inCone.hp, behind.hp];
  g.useAbility('grapeshot', o.x + 5, o.y);
  assert.ok(inCone.hp < h0[0] || inCone.dead, 'in cone');
  assert.equal(behind.hp, h0[1], 'behind untouched');
  const target = foe(g, 'golem'); const t0 = target.hp;
  g.useAbility('meteor', target.x, target.y);
  assert.equal(target.hp, t0, 'meteor has a delay');
  for (let i = 0; i < 20; i++) g.update(0.1);
  assert.ok(target.hp < t0 || target.dead, 'meteor lands');
});

test('Field Repairs heals the wall and towers and revives wrecked ones; Aegis blunts leaks; Tithe pays more', () => {
  const g = wave(mk({}, { loadout: ['mend', 'aegis', 'tithe'] }));
  const t = place(g, 'archer'); const w = place(g, 'cannon', 1);
  t.hp = 1; w.ruined = true; w.hp = 0; g.wall.hp = g.wall.maxHp * 0.3;
  g.useAbility('mend');
  assert.ok(g.wall.hp >= g.wall.maxHp * 0.49);
  assert.ok(t.hp > 1 && !w.ruined && w.hp > 0);
  const base = g.killGoldBonus();
  g.useAbility('tithe');
  assert.ok(g.killGoldBonus() > base);
  const a = foe(g), b = foe(g);
  g.wall.hp = g.wall.maxHp; const h0 = g.wall.hp; g.leak(a); const open = h0 - g.wall.hp;
  g.wall.hp = g.wall.maxHp; g.useAbility('aegis'); g.leak(b); const warded = h0 - g.wall.hp;
  assert.ok(warded < open * 0.35, `aegis ${warded} vs ${open}`);
});

test('Time Stop freezes foes, Hunter Focus never spends ammo, zones slow and poison', () => {
  const g = wave(mk({}, { loadout: ['stasis', 'focus', 'caltrops', 'plague'] }));
  const e = foe(g); g.update(0.5);
  g.useAbility('stasis');
  const x0 = e.x, y0 = e.y;
  for (let i = 0; i < 10; i++) g.update(0.1);
  assert.equal(e.x, x0); assert.equal(e.y, y0);
  for (let i = 0; i < 40; i++) g.update(0.1);
  assert.ok(e.x !== x0 || e.y !== y0, 'moves again after');
  g.useAbility('focus');
  const ammo = g.weapon.ammo;
  g.heroFire(e.x, e.y - e.size * 0.3, 0); g.heroFire(e.x, e.y - e.size * 0.3, 0);
  assert.equal(g.weapon.ammo, ammo);
  const p = foe(g, 'golem'); const hp = p.hp;
  g.useAbility('plague', p.x, p.y); g.useAbility('caltrops', p.x, p.y);
  assert.equal(g.zones.length, 2);
  for (let i = 0; i < 10; i++) g.update(0.1);
  assert.ok(p.hp < hp && p.slow > 0);
});

test('mastery perks: four per tower, ascending, and they change tower stats at the right star counts', () => {
  for (const id of TOWER_ORDER) assert.equal(MASTERY_PERKS[id]?.length, 4, id);
  assert.deepEqual(PERK_STARS, [3, 6, 10, 15]);
  assert.equal(masteryMods('archer', 2).rangeAdd, 0);
  assert.equal(masteryMods('archer', 3).rangeAdd, 0.3);
  assert.equal(masteryMods('archer', 20).multiAdd, 1);
  assert.equal(masteryMods('archer', 0).dmgMult, 1);
  const g = mk();
  const t = place(g, 'archer'); t.tier = 5;
  g.refreshTowers(); const r0 = t.stats.range, m0 = t.stats.multi;
  t.mastery = 3; g.refreshTowers(); assert.ok(t.stats.range > r0);
  t.mastery = 10; g.refreshTowers(); assert.equal(t.stats.multi, m0 + 1);
});

test('new emplacements: gatling spins up, venom stacks and ignores armor, void well drags foes back, sanctum heals', () => {
  for (const id of ['gatling', 'venom', 'trebuchet', 'voidwell', 'sanctum']) assert.ok(TOWERS[id] && TOWER_ORDER.includes(id) && TOWERS[id].keep && KEEP.some((k) => k.id === TOWERS[id].keep), id);
  const g = wave(mk());
  const gat = place(g, 'gatling', 0);
  const golem = foe(g, 'golem'); golem.hp = golem.maxHp = 1e9;
  const x = gat.cx, y = gat.cy; golem.x = x + 1.5; golem.y = y;
  const r0 = 1 / (gat.stats.rate);
  for (let i = 0; i < 80; i++) { golem.x = x + 1.5; golem.y = y; g.update(0.05); }
  assert.ok(gat.heat > 0.5, 'heat ' + gat.heat);
  const ven = place(g, 'venom', 1);
  const tank = foe(g, 'golem'); tank.hp = tank.maxHp = 1e9; tank.armor = 80;
  g.poison(tank, ven.stats, ven); g.poison(tank, ven.stats, ven); g.poison(tank, ven.stats, ven); g.poison(tank, ven.stats, ven);
  assert.equal(tank.poisonStacks, ven.stats.poisonCap);
  const h = tank.hp; g.update(1); assert.ok(h - tank.hp >= ven.stats.poison * ven.stats.poisonCap * 0.9, 'true damage through 80 armor');
  const runner = foe(g, 'grunt'); runner.seg = 3; runner.x = runner.path[3].x; runner.y = runner.path[3].y; runner.dist = 5;
  g.pull(runner, 1.5);
  assert.ok(runner.dist < 5 && runner.dist > 3, 'pulled back ' + runner.dist);
  const d1 = runner.dist; g.pull(runner, 1.5); const second = d1 - runner.dist;
  assert.ok(second < 1.5 * 0.7, 'repeat pulls weaken');
  runner.enraged = true; const d2 = runner.dist; g.pull(runner, 2); assert.equal(runner.dist, d2);
  const san = place(g, 'sanctum', 2);
  const nearest = g.freePlots().sort((a, b) => Math.hypot(a.x - san.x, a.y - san.y) - Math.hypot(b.x - san.x, b.y - san.y))[0];
  const ally = g.build('archer', nearest.x, nearest.y);
  g.refreshTowers(); ally.hp = 1;
  assert.ok(Math.hypot(ally.cx - san.cx, ally.cy - san.cy) <= san.stats.range, 'in reach');
  g.update(1); assert.ok(ally.hp > 1, 'sanctum heals');
  assert.ok(san.stats.heal > 0 && san.stats.range > 2);
});
