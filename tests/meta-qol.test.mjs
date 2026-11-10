// v1.66.0 · meta, Codex, save files, error boundary, service worker, content integrity and determinism lint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as M from '../src/meta/metarecap.js';
import { QUEST_POOL, QUEST_POOL_NEW, QUEST_NEW_FROM, dailyQuests, progressQuests, ensureQuests } from '../src/meta/quests.js';
import { codexEntries, ruleEntries } from '../src/meta/codex.js';
import { ENEMIES, TOWERS, TOWER_ORDER, KEEP, BOONS, ABILITIES, BOSSES, VERSION } from '../src/data/balance.js';
import { ACHIEVEMENTS } from '../src/meta/achievements.js';
import * as D from '../src/game/dominion.js';
import { AUNITS, AUNIT_ORDER, ORDERS } from '../src/game/assault.js';
import { debugInfo, noteEvent } from '../src/ui/errors.js';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('a save keeps its checksum, warns when changed and still opens old exports', () => {
  const p = { v: 1, name: 'A', stats: { runs: 3 }, renown: 10 };
  const text = M.packSave(p);
  const ok = M.unpackSave(text);
  assert.ok(ok.had && ok.ok); assert.equal(ok.obj.chk, undefined); assert.equal(ok.obj.renown, 10);
  const tampered = JSON.parse(text); tampered.renown = 9999;
  const bad = M.unpackSave(JSON.stringify(tampered));
  assert.ok(bad.had && !bad.ok, 'a changed file is flagged, not refused');
  const old = M.unpackSave(JSON.stringify(p));
  assert.ok(!old.had && old.ok, 'a save from before v1.66 has no checksum and still imports');
  assert.throws(() => M.unpackSave('not json'));
  assert.match(M.saveFileName(new Date('2026-11-09T12:00:00Z')), /^bastion-siege-save-2026-11-09\.json$/);
});

test('the mode grid lists played modes only', () => {
  const g = M.modeGrid({ best: { modes: { sprint: { runs: 2, wave: 12, wins: 1 }, gauntlet: { runs: 0 }, endurance: { runs: 3, clock: 400, wave: 9 }, junk: { runs: 1 } } } });
  assert.deepEqual(g.map((r) => r.id), ['endurance', 'sprint']);
  assert.deepEqual(M.modeGrid({}), []);
});

test('counter lines come from armour and magic resist, and filters split ground, air and ships', () => {
  const air = Object.keys(ENEMIES).find((k) => ENEMIES[k].air), ground = Object.keys(ENEMIES).find((k) => !ENEMIES[k].air && !ENEMIES[k].naval);
  assert.equal(M.damageThrough('archer', { armor: 0 }), 1);
  assert.equal(M.damageThrough('archer', { armor: 40 }), 0.6);
  assert.equal(M.damageThrough('mage', { armor: 40, mr: 0 }), 1);
  assert.ok(M.counterTowers(ENEMIES[air]).every((c) => TOWERS[c.id].targets?.includes('a')));
  assert.match(M.counterLine(ENEMIES[ground]), /^Gets through best:/);
  const all = codexEntries('foes');
  assert.ok(M.filterFoes(all, 'air').length >= 1 && M.filterFoes(all, 'air').length < all.length);
  assert.equal(M.filterFoes(all, 'all').length, all.length);
  assert.ok(all.some((e) => e.extras?.some((x) => /Gets through best/.test(x))));
});

test('the glossary is in the Codex rules and searchable', () => {
  const names = ruleEntries().map((r) => r.name);
  for (const t of ['Armour', 'Magic resist', 'Splash', 'Pierce', 'Damage over time', 'Critical hit']) assert.ok(names.includes('Glossary: ' + t), t);
  assert.ok(codexEntries('rules').some((e) => e.search.includes('armour')));
});

test('the six new daily quests can be earned from a run summary and old quest lists still work', () => {
  const ids = ['built', 'kinds', 'spec', 'arts', 'norepair', 'gold'];
  for (const id of ids) assert.ok(QUEST_POOL_NEW.find((q) => q.id === id), id);
  const run = { towersBuilt: 30, builtByTower: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }, specs: [1, 2, 3], artUses: { x: 10, y: 10 }, repairs: 0, wavesCleared: 20, goldEarned: 20000, wave: 21, start: 1 };
  for (const id of ids) {
    const def = QUEST_POOL_NEW.find((q) => q.id === id);
    assert.ok(def.stat(run) >= Math.max(...def.goals), `${id} reaches its biggest goal`);
    assert.equal(def.stat({}), 0, `${id} needs a real run`);
  }
  assert.equal(dailyQuests('2026-11-09').length, 4);
  const draw = (day) => dailyQuests(day).map((q) => q.id);
  assert.ok(draw('2026-11-09').every((id) => id === 'vg' || QUEST_POOL.some((q) => q.id === id)), 'before the flag only the old types');
  const seen = new Set(); for (let d = 10; d < 70; d++) for (const id of draw(`2026-11-${d}`.replace(/-(\d)$/, '-0$1').slice(0, 10))) seen.add(id);
  assert.ok(QUEST_POOL_NEW.some((q) => seen.has(q.id)), 'after the flag the new ones turn up');
  assert.equal(QUEST_NEW_FROM, '2026-11-10');
  const p = { renown: 0, quests: null };
  ensureQuests(p, new Date('2026-11-09T12:00:00'));
  assert.doesNotThrow(() => progressQuests(p, run, new Date('2026-11-09T12:00:00')));
});

test('the error screen collects debug info without a DOM', () => {
  noteEvent('hello');
  const info = JSON.parse(debugInfo());
  assert.equal(info.version, VERSION); assert.ok(info.recent.some((r) => /hello/.test(r)));
  for (let i = 0; i < 40; i++) noteEvent('e' + i);
  assert.equal(JSON.parse(debugInfo()).recent.length, 20);
});

test('the service worker is versioned with the game and never caches the API or reloads on its own', () => {
  const sw = read('sw.js');
  assert.match(sw, new RegExp(`const VERSION = '${VERSION.replace(/\./g, '\\.')}'`), 'bump sw.js with VERSION so the cache is replaced');
  assert.match(sw, /pathname\.startsWith\('\/api\/'\)\) return/);
  assert.doesNotMatch(sw.replace(/\/\/.*$/gm, ''), /skipWaiting\(\)\)/, 'it does not skip waiting on install');
  assert.match(read('src/ui/update.js'), /if \(app\.session\) return setTimeout\(show/, 'never during a run');
  assert.match(read('src/main.js'), /installErrorBoundary\(\);/);
  assert.match(read('index.html'), /<main id="app">/);
});

// ---------- TX-12 · every id a table points at must exist ----------
test('content integrity: references between the balance tables resolve', () => {
  const missing = [];
  const need = (what, ok) => { if (!ok) missing.push(what); };
  for (const id of TOWER_ORDER) need(`TOWER_ORDER → TOWERS.${id}`, !!TOWERS[id]);
  for (const [id, t] of Object.entries(TOWERS)) if (t.keep) need(`TOWERS.${id}.keep → KEEP`, KEEP.some((k) => k.id === t.keep));
  const ids = (list, what) => { const seen = new Set(); for (const x of list) { need(`${what} duplicate id ${x.id}`, !seen.has(x.id)); seen.add(x.id); } };
  ids(BOONS, 'BOONS'); ids(BOSSES, 'BOSSES'); ids(ACHIEVEMENTS, 'ACHIEVEMENTS'); ids(KEEP, 'KEEP');
  for (const [id, e] of Object.entries(ENEMIES)) need(`ENEMIES.${id}.name`, !!e.name);
  for (const [id, a] of Object.entries(ABILITIES)) need(`ABILITIES.${id}.name`, !!a.name);
  for (const [id, t] of Object.entries(D.TECHS)) for (const n of [].concat(t.needs || [])) need(`TECHS.${id}.needs → ${n}`, !!D.TECHS[n]);
  for (const id of D.TECH_ORDER) need(`TECH_ORDER → ${id}`, !!D.TECHS[id]);
  for (const id of D.WONDER_ORDER) need(`WONDER_ORDER → ${id}`, !!D.WONDERS[id]);
  for (const id of AUNIT_ORDER) need(`AUNIT_ORDER → ${id}`, !!AUNITS[id]);
  for (const [id, o] of Object.entries(ORDERS)) need(`ORDERS.${id}.name`, !!o.name);
  for (const d of D.DILEMMAS) need(`DILEMMA ${d.id} choices`, Array.isArray(d.choices) ? d.choices.length >= 2 : true);
  assert.deepEqual(missing, [], 'broken references:\n' + missing.join('\n'));
});

// ---------- TX-14 · engine code never uses Math.random ----------
test('determinism lint: no Math.random in engine code', () => {
  const engine = ['engine', 'assault', 'dominion', 'waves', 'economy', 'naval', 'garrison', 'commander', 'champion', 'maps', 'living', 'realmmap', 'counters', 'modes', 'rules', 'realm', 'autobuild'];
  const offenders = engine.filter((f) => /Math\.random/.test(read(`src/game/${f}.js`).replace(/\/\/.*$/gm, '')));
  assert.deepEqual(offenders, [], 'use the game rng (this.rng / game.rng), not Math.random, in: ' + offenders.join(', '));
  assert.ok(readdirSync(new URL('../src/game', import.meta.url)).length > 20);
});

test('the screens use the new helpers', () => {
  const sc = read('src/ui/screens.js'), cx = read('src/ui/codex.js');
  assert.match(sc, /packSave\(p\)/); assert.match(sc, /Download save file/); assert.match(sc, /modeGrid\(p\)/); assert.match(sc, /OFFLINE_LOSSES/);
  assert.match(cx, /filterFoes/); assert.match(read('package.json'), /"check": "node tools\/check\.mjs"/);
});
