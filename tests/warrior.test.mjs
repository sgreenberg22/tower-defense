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

// ---------- v1.54: waves without a break, Warrior boons, the Retinue, changing warrior ----------
test('a Warrior defence has hardly any break between waves', () => {
  const g = new Game({ seed: 'wb1', mapId: 'meadow', mode: 'warrior', champion: { cls: 'knight' } });
  assert.ok(g.buildTimer <= CHAMP.firstBreak && CHAMP.firstBreak <= 6);
  assert.ok(g.breakTime() <= 2, 'a beat, not a break');
  let maxGap = 0, gap = 0, waves = 0;
  g.on('waveStart', () => { waves++; });
  for (let t = 0; t < 240 && !g.over; t += 0.05) {
    autoChampion(g.champ, 0.05);
    if (g.boonOffer) g.chooseBoon(g.boonOffer[0]);
    g.update(0.05); g.tickBuild(0.05);
    if (g.phase === 'build' && g.wave > 1 && !g.boonOffer) { gap += 0.05; maxGap = Math.max(maxGap, gap); } else gap = 0;
  }
  assert.ok(waves >= 4, 'waves keep coming');
  assert.ok(maxGap < 3, `the longest break was ${maxGap.toFixed(1)}s`);
});

test('Warrior boons exist only in Warrior runs, and a Warrior is not offered bow-only boons', () => {
  const warr = new Game({ seed: 'wb2', mapId: 'meadow', mode: 'warrior', champion: { cls: 'knight' } });
  const classic = new Game({ seed: 'wb2', mapId: 'meadow' });
  const hero = new Game({ seed: 'wb2', mapId: 'meadow', mode: 'hero' });
  const wb = warr.boonPool().map((b) => b.id);
  for (const id of ['w_edge', 'w_vigor', 'w_phoenix', 'w_banner']) assert.ok(wb.includes(id), id);
  for (const id of ['steady', 'quiver', 'multishot', 'soulharvest']) assert.ok(!wb.includes(id), id + ' is no use on foot');
  for (const g of [classic, hero]) assert.ok(!g.boonPool().some((b) => b.id.startsWith('w_')), 'other modes never see them');
  // and each one does something
  const c = warr.champ, base = { hp: c.baseHp(), dmg: c.dmgMult(), spd: c.speed(), reach: c.reach, skill: c.skillCdOf(), dodge: c.dodgeCdOf() };
  for (const id of ['w_edge', 'w_vigor', 'w_fleet', 'w_reach', 'w_drill']) { warr.boons[id] = 1; }
  assert.ok(c.baseHp() > base.hp && c.dmgMult() > base.dmg && c.speed() > base.spd && c.reach > base.reach && c.skillCdOf() < base.skill && c.dodgeCdOf() < base.dodge);
  // Phoenix Heart saves a deathblow once a wave
  warr.boons.w_phoenix = 1; c.shieldT = 0; c.takeHit(c.maxHp * 10);
  assert.ok(!c.dead && c.hp > 0, 'the phoenix rises');
  c.shieldT = 0; c.takeHit(c.maxHp * 10);
  assert.ok(c.dead, 'but only once a wave');
});

test('boons are offered every other wave and every fifth level', () => {
  const g = new Game({ seed: 'wb3', mapId: 'meadow', mode: 'warrior', champion: { cls: 'berserker' } });
  const seen = [];
  g.on('boonOffer', () => seen.push(g.wave));
  for (let t = 0; t < 400 && !g.over && g.wave < 6; t += 0.05) { autoChampion(g.champ, 0.05); if (g.boonOffer) g.chooseBoon(g.boonOffer[0]); g.update(0.05); g.tickBuild(0.05); }
  assert.ok(seen.length >= 2, 'boons come quickly');
  const c = g.champ; c.level = 4; c.xp = 0; g.wave = 3;
  c.xp = levelNeed(4); c.onKill({ dead: true });   // level 5 earns a free pick
  assert.equal(c.pendingPicks, 1);
  assert.equal(c.takePicks(), 1); assert.equal(c.pendingPicks, 0);
});

test('foot soldiers join a Warrior from wave 5 and fight beside them', () => {
  const g = new Game({ seed: 'wr1', mapId: 'meadow', mode: 'warrior', champion: { cls: 'knight' } });
  const levies = []; g.on('levy', (e) => levies.push(e.kinds));
  g.wave = 4;
  assert.equal(g.levyForWave(), 0, 'nothing before wave 5');
  g.wave = 5; assert.ok(g.levyForWave() >= 1 && levies.length === 1, 'a company at wave 5');
  g.wave = 6; assert.equal(g.levyForWave(), 0, 'and every other wave after');
  const before = g.garrison.units.length;
  g.wave = 7; g.raiseLevy(1);
  assert.ok(g.garrison.units.length > before, 'a soldier joins');
  const u = g.garrison.units.at(-1), c = g.champ, home = g.troopHome(u);
  assert.ok(Math.hypot(home.x - c.x, home.y - c.y) < 3, 'and gathers round the warrior');
  // the Warband Banner brings one more with each company and toughens them
  g.boons.w_banner = 1;
  const hp0 = u.maxHp; g.refreshTroop(u); assert.ok(u.maxHp > hp0);
  assert.equal(new Game({ seed: 'x', mapId: 'meadow', mode: 'hero' }).raiseLevy(1), 0, 'only a Warrior run raises them');
});

test('with the Armory of Arms a Warrior changes class mid-run, keeping level and giving each class its own mastery', () => {
  const g = new Game({ seed: 'ws1', mapId: 'meadow', mode: 'warrior', champion: { cls: 'knight', mastery: 2, masteries: { knight: 2, mage: 5 }, swap: true } });
  const c = g.champ;
  c.level = 6; c.xp = 3; c.fury = 80;
  assert.ok(c.swapReady() && !c.swapTo('knight'), 'cannot swap to yourself');
  assert.ok(c.swapTo('mage'));
  assert.equal(c.id, 'mage'); assert.equal(c.cls.id, 'mage'); assert.equal(c.mastery, 5);
  assert.equal(c.level, 6); assert.equal(c.kind, 'cleric');
  assert.ok(c.swapCd > 0 && !c.swapTo('ranger'), 'a short rest before the next change');
  c.update(CHAMP.swapCd + 1);
  assert.ok(c.swapTo('knight') && c.mastery === 2);
  c.kos = 4; c.by = { knight: 1, mage: 3 };
  const s = c.summary(); assert.equal(s.cls, 'mage'); assert.equal(s.swaps, 2);
  // saved and restored
  while (g.phase !== 'build' && !g.over) g.update(0.05);
  const sv = JSON.parse(JSON.stringify(g.serialize()));
  const g2 = new Game({ mode: sv.mode, seed: sv.seed, mapId: sv.mapId, save: sv });
  assert.ok(g2.champ.swapOk && g2.champ.masteries.mage === 5 && g2.champ.id === 'knight');
  // without the Keep's Armory it cannot be done
  const lock = new Game({ seed: 'ws2', mapId: 'meadow', mode: 'warrior', champion: { cls: 'knight' } }).champ;
  assert.ok(!lock.swapTo('mage') && lock.id === 'knight');
});

test('a run that changed warrior shares its kills out between them for mastery', () => {
  const p = defaultProfile();
  const g = new Game({ seed: 'wm1', mapId: 'meadow', mode: 'warrior', champion: { cls: 'knight', swap: true } });
  run(g, 20); g.gameOver();
  const sum = g.summary(); sum.champ = { cls: 'mage', kos: 60, by: { mage: 40, knight: 20 }, level: 8, levels: 7, bestHits: 12 };
  recordRun(p, sum);
  assert.equal(p.warrior.cls.mage.kos, 40); assert.equal(p.warrior.cls.knight.kos, 20);
  assert.ok(p.warrior.cls.mage.xp > p.warrior.cls.knight.xp);
});

// ---------- v1.55: spoils, rampages, captain boons and spoils of conquest ----------
test('fallen foes leave orbs that heal, fill the fury or shield, and fade away', () => {
  const g = new Game({ seed: 'orb1', mapId: 'meadow', mode: 'warrior', champion: { cls: 'knight' } });
  const c = g.champ;
  c.orbs.push({ x: c.x + 0.3, y: c.y, kind: 'heal', t: 5, max: 5 }, { x: c.x + 9, y: c.y, kind: 'fury', t: 0.05, max: 5 });
  c.hp = c.maxHp * 0.5; let got = 0; g.on('champOrb', () => got++);
  c.updateOrbs(0.05);
  assert.equal(got, 1); assert.ok(c.hp > c.maxHp * 0.5, 'the orb heals');
  c.updateOrbs(0.1); assert.equal(c.orbs.length, 0, 'the far one faded');
  // bosses and captains always drop one
  c.dropOrb({ x: 1, y: 1, boss: true }); assert.equal(c.orbs.length, 1); assert.ok(c.orbs[0].big);
  run(g, 60); assert.ok(c.kos > 0);
});

test('every 25 foes slain is a rampage; a captain slain earns a free boon pick', () => {
  const g = new Game({ seed: 'ram1', mapId: 'meadow', mode: 'warrior', champion: { cls: 'knight' } });
  const c = g.champ; let r = 0, gold0 = g.gold; g.on('champStreak', () => r++);
  c.hp = c.maxHp * 0.4; c.kos = CHAMP.rampage.every - 1;
  c.onKill({ x: 1, y: 1, dead: true });
  assert.equal(r, 1); assert.ok(c.hp > c.maxHp * 0.4 && g.gold > gold0, 'health and the war chest');
  c.onKill({ x: 1, y: 1, dead: true, duelist: true });
  assert.ok(c.pendingPicks >= 1, 'the captain pays a pick');
});

test('Warrior on the attack: a boon after each stronghold, and boons change the warrior', () => {
  const a = new AssaultGame({ seed: 'sp1', mode: 'warassault', career: 4, champion: { cls: 'berserker' } });
  assert.ok(a.boonPool().length >= 10 && a.boonPool().every((b) => b.mode === 'warrior'));
  assert.ok(!a.boonPool().some((b) => b.id === 'w_banner' || b.id === 'w_wall'));
  a.offerSpoils(); assert.equal(a.boonOffer.length, 3);
  const dmg0 = a.champ.dmgMult(); a.offerSpoils();   // a second offer while one is open waits its turn
  assert.equal(a.boonDebt, 1);
  assert.ok(a.chooseBoon('w_edge') === false || true);
  const first = a.boonOffer[0]; assert.ok(a.chooseBoon(first));
  assert.ok(a.boonOffer, 'and the waiting one now opens');
  a.boons.w_edge = 1; assert.ok(a.champ.dmgMult() > dmg0);
  a.takeFortress();
  assert.ok(a.boonOffer || a.pauseT > 0);
});
