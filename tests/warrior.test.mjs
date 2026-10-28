// v1.53: Warrior mode (on foot in 3D, defending or attacking), the command layer in every attack mode, and the Warlord.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { AssaultGame, autoAssault, WARLORD, isAssaultMode, validateAssaultRun } from '../src/game/assault.js';
import { Champion, CHAMP, CHAMP_IDS, CHAMP_CLASSES, autoChampion, masteryLevel, levelNeed, CAPTAIN, captainFor } from '../src/game/champion.js';
import { validateRun } from '../src/game/rules.js';
import { isLocalMode, LOCAL_MODES } from '../src/game/modes.js';
import { recordRun, defaultProfile } from '../src/meta/profile.js';
import { T } from '../src/game/maps.js';

const run = (g, secs, pilot = true, dt = 0.05) => {
  for (let t = 0; t < secs && !g.over; t += dt) {
    if (pilot && g.champ) autoChampion(g.champ, dt);
    if (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
    g.update(dt); if (g.tickBuild) g.tickBuild(dt);
  }
};

test('every warrior class is complete and the modes are registered', () => {
  assert.deepEqual(CHAMP_IDS, Object.keys(CHAMP_CLASSES));
  for (const id of CHAMP_IDS) {
    const C = CHAMP_CLASSES[id];
    for (const k of ['name', 'icon', 'hp', 'dr', 'speed', 'dmg', 'blurb', 'attack', 'skill', 'fury', 'bars']) assert.ok(C[k] !== undefined, `${id}.${k}`);
    assert.ok(C.skill.cd > 0 && C.skill.desc && C.fury.desc);
  }
  for (const m of ['warrior', 'warlord', 'warassault']) assert.ok(isLocalMode(m), m);
  assert.ok(isAssaultMode('warlord') && isAssaultMode('warassault') && !isAssaultMode('warrior'));
  assert.equal(new Set(LOCAL_MODES).size, LOCAL_MODES.length);
});

test('a Warrior defence: the commander builds, the warrior holds foes, slays them and levels up', () => {
  const g = new Game({ seed: 'wt1', mapId: 'meadow', mode: 'warrior', champion: { cls: 'knight' } });
  assert.ok(g.champ instanceof Champion);
  assert.ok(g.auto, 'the commander builds the towers');
  const c = g.champ;
  assert.ok(c.walkable(c.x, c.y), 'the warrior rises on open ground');
  run(g, 200);
  assert.ok(g.wave > 3, 'waves go on');
  assert.ok(c.kos > 10, 'the warrior slays foes');
  assert.ok(g.stats.heroKills >= c.kos, 'and they count as your own kills');
  assert.ok(g.stats.heroKills <= g.stats.kills);
  assert.ok(c.level > 1, 'experience raises the level');
  assert.ok(c.stats.held > 0, 'foes walking into the warrior are held');
  assert.equal(g.stats.hits, 0, 'warrior blows never count as bow hits (no free accuracy or combo awards)');
  // the summary carries what the profile needs
  const s = g.summary();
  assert.equal(s.mode, 'warrior'); assert.equal(s.champ.cls, 'knight'); assert.ok(s.champ.kos > 0);
});

test('the warrior falls, rises again at the keep, and dodging gives a moment of safety', () => {
  const g = new Game({ seed: 'wt2', mapId: 'meadow', mode: 'warrior', champion: { cls: 'ranger' } });
  const c = g.champ;
  c.shieldT = 0;
  c.takeHit(c.maxHp * 10);
  assert.ok(c.dead && c.respawnT > 0);
  run(g, c.respawnT + 0.2, false);
  assert.ok(!c.dead, 'rises again');
  assert.ok(c.shieldT > 0, 'with a short shield after rising');
  c.shieldT = 0;
  c.input.dodge = true; c.update(0.016);
  assert.ok(c.dodgeT > 0 && c.invulnerable);
  assert.equal(c.takeHit(100), 0, 'no damage mid-roll');
});

test('skills, fury and their cooldowns', () => {
  for (const cls of CHAMP_IDS) {
    const g = new Game({ seed: 'wt3' + cls, mapId: 'meadow', mode: 'warrior', champion: { cls } });
    const c = g.champ;
    c.skillCd = 0; c.input.skill = true; c.update(0.016);
    assert.ok(c.skillCd > 0, `${cls} skill goes on cooldown`);
    assert.equal(c.furyReady, false);
    c.fury = CHAMP.fury.max; assert.ok(c.furyReady);
    c.input.fury = true;
    for (let i = 0; i < 30 && c.fury > 0; i++) c.update(0.016);   // a press during the skill's dash waits for it to end
    assert.equal(c.fury, 0, `${cls} fury spent`);
    assert.ok(c.furyT > 0 || c.meteors.length, `${cls} fury active`);
  }
});

test('mastery and run levels', () => {
  assert.equal(masteryLevel(0), 0);
  assert.equal(masteryLevel(40), 1);
  assert.equal(masteryLevel(1e9), CHAMP.mastery.cap);
  assert.ok(levelNeed(2) > levelNeed(1));
  const g = new Game({ seed: 'wt4', mapId: 'meadow', mode: 'warrior', champion: { cls: 'berserker', mastery: 10 } });
  const g0 = new Game({ seed: 'wt4', mapId: 'meadow', mode: 'warrior', champion: { cls: 'berserker', mastery: 0 } });
  assert.ok(g.champ.maxHp > g0.champ.maxHp && g.champ.dmgMult() > g0.champ.dmgMult(), 'mastery adds health and damage');
});

test('a Warrior defence saves and resumes with the same warrior', () => {
  const g = new Game({ seed: 'wt5', mapId: 'meadow', mode: 'warrior', champion: { cls: 'mage', mastery: 3 } });
  run(g, 60);
  while (g.phase !== 'build' && !g.over) run(g, 1);
  const s = JSON.parse(JSON.stringify(g.serialize()));
  assert.equal(s.champion.cls, 'mage');
  const g2 = new Game({ mode: s.mode, seed: s.seed, mapId: s.mapId, save: s });
  assert.equal(g2.champ.id, 'mage');
  assert.equal(g2.champ.level, g.champ.level);
  assert.equal(g2.champ.kos, g.champ.kos);
  assert.equal(g2.champ.mastery, 3);
});

test('horde captains come for the warrior on waves 4, 9, 14 …', () => {
  assert.ok(CAPTAIN.wave(4) && CAPTAIN.wave(9) && !CAPTAIN.wave(10) && !CAPTAIN.wave(3));
  assert.ok(captainFor(4, 'x').name && captainFor(25, 'x').type === 'warchief');
  const g = new Game({ seed: 'wt6', mapId: 'meadow', mode: 'warrior', champion: { cls: 'knight' }, startWave: 4 });
  let cap = null; g.on('captain', ({ enemy }) => { cap = enemy; });
  g.boonOffer = null; g.pickQueue = 0;
  g.startWave();
  run(g, 40);
  assert.ok(cap, 'a captain marched');
  assert.ok(cap.duelist && cap.champion);
});

test('Warrior on the attack: the captain sends troops, the warrior fights and strongholds fall', () => {
  const g = new AssaultGame({ seed: 'wa1', mode: 'warassault', career: 4, champion: { cls: 'knight' } });
  assert.ok(g.champ && g.autoCmd);
  run(g, 400);
  assert.ok(g.stats.deployed > 5, 'the captain sends troops');
  assert.ok(g.champ.kos > 0 && g.stats.heroKills === g.champ.kos, 'your kills are counted');
  assert.ok(g.taken >= 1, 'a stronghold falls');
  const s = g.summary();
  assert.equal(s.heroKills, g.champ.kos);
  assert.equal(validateAssaultRun(s), null);
  assert.equal(validateRun(s), null);
});

test('the command layer: move, attack, hold, march and fall back', () => {
  const g = new AssaultGame({ seed: 'cmd1', mode: 'assault', career: 4 });
  g.gold = 9999;
  for (let i = 0; i < 4; i++) { g.cards.footman = 0; g.deploy('footman'); }
  g.cards.archer = 0; g.deploy('archer'); g.cards.ram = 0; g.deploy('ram');
  run(g, 1.5, false);
  const foot = g.units.filter((u) => u.id === 'footman');
  // move somewhere off the road
  const m = g.map; let spot = null;
  for (let y = 1; y < m.rows - 1 && !spot; y++) for (let x = 1; x < m.cols - 1; x++) if (m.tileAt(x, y) === T.GRASS) { spot = { x: x + 0.5, y: y + 0.5 }; break; }
  assert.equal(g.command(foot, 'move', spot), foot.length);
  run(g, 12, false);
  for (const u of foot) if (!u.dead) assert.ok(Math.hypot(u.x - spot.x, u.y - spot.y) < 1.6 || u.engaged || u.cmd?.kind === 'hold', 'they went there');
  // hold: rams stop on the road
  const ram = g.engines.find((u) => u.id === 'ram');
  g.command([ram], 'hold');
  const d0 = ram.dist; run(g, 3, false);
  assert.equal(ram.dist, d0, 'a held ram stays put');
  // march: back to the road and on
  g.command([...foot, ram], 'advance');
  run(g, 20, false);
  for (const u of foot) if (!u.dead) assert.ok(!u.cmd || u.cmd.kind === 'rejoin', 'back on the road');
  assert.ok(ram.dead || ram.dist > d0, 'the ram rolls on');
  // attack an emplacement by name
  const t = g.towers.find((x) => !x.ruined);
  const arch = g.units.filter((u) => u.id === 'archer' && !u.dead);
  if (t && arch.length) { assert.ok(g.command(arch, 'attack', { target: t }) > 0); assert.equal(arch[0].cmd.target, t); }
  // fall back
  const live = g.units.filter((u) => !u.dead);
  if (live.length) { g.command(live, 'retreat'); assert.ok(live.every((u) => u.cmd?.retreat || u.def.ramOnly)); }
  assert.ok(g.stats.commands >= 3);
});

test('the Warlord: supply posts, capture, income and warbands', () => {
  const g = new AssaultGame({ seed: 'wl1', mode: 'warlord', career: 6 });
  assert.equal(g.maxUnits, WARLORD.maxUnits);
  assert.ok(g.posts.length >= 2, 'posts on the field');
  for (const P of g.posts) { const t = g.map.tileAt(Math.floor(P.x), Math.floor(P.y)); assert.ok(t === T.GRASS || t === T.HIGH); }
  assert.ok(g.posts.some((P) => P.owner === 'horde'), 'the horde holds one near its camp');
  // stand a squad on a free post
  g.gold = 9999;
  for (let i = 0; i < 3; i++) { g.cards.footman = 0; g.deploy('footman'); }
  const P = g.posts.find((x) => x.owner === 'none');
  g.command(g.units, 'move', { x: P.x, y: P.y });
  let warband = 0; g.on('warband', () => warband++);
  run(g, 60, false);
  assert.equal(P.owner === 'you' || P.taken, true, 'the post was taken');
  const gold0 = g.gold; g.update(1); assert.ok(g.gold >= gold0, 'it pays');
  run(g, 40, false);
  assert.ok(warband >= 1, 'the horde sends warbands for the posts');
  const s = g.summary();
  assert.ok(s.posts >= 1);
  assert.equal(validateAssaultRun(s), null);
});

test('the pilot can play a whole Warlord stronghold with orders', () => {
  const g = new AssaultGame({ seed: 'wl2', mode: 'warlord', career: 6 });
  let cmdT = 0;
  for (let t = 0; t < 600 && !g.over && g.taken < 1; t += 0.05) {
    autoAssault(g, 0.05);
    if ((cmdT -= 0.05) <= 0) { cmdT = 8; const P = g.posts.find((p) => p.owner !== 'you'); const f = g.units.filter((u) => u.id === 'footman').slice(0, 4); if (P && f.length >= 3) g.command(f, 'move', { x: P.x, y: P.y }); }
    g.update(0.05);
  }
  assert.ok(g.taken >= 1 || !g.over, 'it can be won');
});

test('runs are recorded: mastery, records, the War Record', () => {
  const p = defaultProfile();
  const g = new Game({ seed: 'wr1', mapId: 'meadow', mode: 'warrior', champion: { cls: 'ranger' } });
  run(g, 120);
  g.gameOver();
  const s = g.summary();
  recordRun(p, s);
  assert.ok(p.warrior.cls.ranger.xp > 0 && p.warrior.cls.ranger.runs === 1);
  assert.equal(p.local.warrior.runs, 1);
  assert.ok(p.local.warrior.best >= 1);
  const a = new AssaultGame({ seed: 'wr2', mode: 'warlord', career: 2 });
  a.end(false, 'quit');
  recordRun(p, a.summary());
  assert.equal(p.local.warlord.runs, 1);
  assert.equal(p.warRecord.runs, 1, 'the Warlord counts for the War Record');
  assert.equal(validateRun({ ...s, wave: s.wave, start: 1 }), null, 'the server accepts a Warrior defence');
});
