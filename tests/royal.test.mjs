// The Royal Court (v1.10): themes, prestige, extended ranks, codex medals and the codex itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, THEME_CATALOG, RANKS } from '../src/data/events.js';
import { PRESTIGE, LEGACY, PRESTIGE_REWARDS, RANK_REWARDS } from '../src/data/prestige.js';
import { currentTheme, themeUnlocked, themeUnlockText, rankFor, rankLadder } from '../src/meta/events.js';
import { defaultProfile, runBonus, recordRun, loadoutFor } from '../src/meta/profile.js';
import { prestigeStatus, canPrestige, legacyOffer, ascend, prestigeBonus, keepResets, resetPreview, roman, dynastyEarned } from '../src/meta/prestige.js';
import { medalSubjects, medalTotal, tiersFor, checkMedals, codexProgress, medalBonus, MEDAL_TIERS } from '../src/meta/medals.js';
import { CODEX_TABS, codexEntries } from '../src/meta/codex.js';
import { COSMETICS, cosmeticSource, ACHIEVEMENTS } from '../src/meta/achievements.js';
import { KEEP, TOWERS, ENEMIES, BOSSES, WEAPONS, ABILITIES, BOONS, THREATS, MODIFIERS } from '../src/data/balance.js';
import { MAPS } from '../src/game/maps.js';

const d = (s) => new Date(s + 'T12:00:00Z');
const fresh = () => { const p = defaultProfile(); p.created = 1700000000000; return p; };

// ---------- themes ----------
test('every catalog theme exists, and only the default has no id', () => {
  assert.equal(THEME_CATALOG.filter((t) => t.id === null).length, 1);
  for (const t of THEME_CATALOG) {
    assert.ok(t.name && t.blurb && t.unlock, t.name);
    if (t.id === null) continue;
    const th = THEMES[t.id];
    assert.ok(th, t.id);
    for (const k of ['--night', '--enamel', '--enamel-2', '--enamel-3', '--line', '--gold', '--gold-deep']) assert.match(th.css[k] || '', /^#[0-9a-f]{6}$/i, `${t.id} ${k}`);
    assert.ok(th.tint && th.fall && th.theme, t.id);
    assert.ok(themeUnlockText(t.unlock), t.id);
  }
  for (const id of Object.keys(THEMES)) assert.ok(THEME_CATALOG.some((t) => t.id === id), 'uncatalogued theme ' + id);
});

test('realm themes repaint the meadow; seasonal ones do not need to', () => {
  for (const t of THEME_CATALOG) {
    if (!t.id || t.seasonal) continue;
    const g = THEMES[t.id].ground;
    assert.ok(g, t.id);
    for (const k of ['grass', 'grass2', 'path', 'path2', 'accent', 'sky']) assert.match(g[k], /^#[0-9a-f]{6}$/i, `${t.id} ground ${k}`);
  }
});

test('a chosen theme needs its unlock; auto and off keep working', () => {
  const p = fresh(), summer = d('2026-09-01');
  assert.equal(currentTheme(p, summer), null);                       // auto, no event
  assert.ok(currentTheme(p, d('2026-10-12')));                        // auto, Haunted Siege
  p.settings.theme = 'dawnstone';
  assert.equal(currentTheme(p, summer).id, 'dawnstone');
  assert.equal(currentTheme(p, d('2026-10-12')).id, 'dawnstone');     // a chosen theme wins over the event
  p.settings.theme = 'moonlit';
  assert.equal(currentTheme(p, summer), null, 'locked theme is ignored');
  p.best.wave.meadow = 25;
  assert.equal(currentTheme(p, summer).id, 'moonlit');
  p.settings.theme = 'off';
  assert.equal(currentTheme(p, d('2026-10-12')), null);
});

test('theme unlock rules: rank, streak, prestige, events', () => {
  const p = fresh(), now = d('2026-09-01');
  assert.equal(themeUnlocked(p, 'ironclad', now), false);
  p.stats.renownEarned = 6500;
  assert.equal(themeUnlocked(p, 'ironclad', now), true);
  assert.equal(themeUnlocked(p, 'stormwatch', now), false);
  p.streak = { n: 7, best: 7 };
  assert.equal(themeUnlocked(p, 'stormwatch', now), true);
  assert.equal(themeUnlocked(p, 'royalcourt', now), false);
  p.prestige.level = 1;
  assert.equal(themeUnlocked(p, 'royalcourt', now), true);
  assert.equal(themeUnlocked(p, 'halloween', now), false);
  assert.equal(themeUnlocked(p, 'halloween', d('2026-10-20')), true);   // event is on now
  p.events = { 'halloween-2025': { waves: 3, claimed: 0 } };            // hm: keyed by event id, not theme id
  assert.equal(themeUnlocked(p, 'halloween', now), false);
  p.events = { 'haunt-2025': { waves: 3, claimed: 0 } };
  assert.equal(themeUnlocked(p, 'halloween', now), true);               // played it once
  assert.equal(themeUnlocked(p, 'no-such-theme', now), false);
});

// ---------- ranks ----------
test('ranks run past Grand Marshal and every new rank pays a gift', () => {
  const gm = RANKS.findIndex((r) => r.name === 'Grand Marshal');
  assert.ok(RANKS.length > gm + 1);
  for (let i = 1; i < RANKS.length; i++) assert.ok(RANKS[i].at > RANKS[i - 1].at, RANKS[i].name);
  for (const r of RANKS.slice(gm + 1)) assert.ok(RANK_REWARDS[r.name]?.renown > 0, r.name);
  assert.equal(rankFor(3500000).name, 'Eternal Sovereign');
  assert.equal(rankLadder(1e9).at(-1).state, 'current');
});

test('a new rank pays its Renown gift once, after the run that reached it', () => {
  const p = fresh();
  p.stats.renownEarned = 599000; p.rankIndex = RANKS.findIndex((r) => r.name === 'Grand Marshal');
  const run = { map: 'meadow', wave: 30, start: 1, score: 150000, wavesCleared: 29, kills: 100, heroKills: 10, bossKills: 0, shots: 0, hits: 0, headshots: 0, towersBuilt: 3, goldEarned: 100, heroDmg: 0, duration: 300, maxCombo: 1, killsByType: {}, dmgByTower: {}, builtByTower: {}, specs: [], modifiers: [], ascension: 0, mode: 'normal' };
  const before = p.renown;
  const r = recordRun(p, run, { now: d('2026-09-01') });
  assert.equal(r.ranks.at(-1).name, 'Lord Protector');
  assert.equal(r.rankBonus, RANK_REWARDS['Lord Protector'].renown);
  const orders = r.quests.reduce((a, q) => a + q.reward, 0);          // daily orders are credited straight onto the purse
  assert.equal(p.renown, before + r.renown + r.rankBonus + r.medalRenown + orders);
  assert.ok(p.titles.includes('Lord Protector'));
  const again = recordRun(p, { ...run, score: 1 }, { now: d('2026-09-01') });
  assert.equal(again.rankBonus, 0);
});

// ---------- prestige ----------
test('prestige needs a full dynasty of Renown, and the bar rises each time', () => {
  const p = fresh();
  assert.equal(canPrestige(p), false);
  assert.equal(prestigeStatus(p).need, 90000);
  assert.ok(PRESTIGE.need(1) > PRESTIGE.need(0) && PRESTIGE.need(5) > PRESTIGE.need(4));
  p.stats.renownEarned = 89999;
  assert.equal(canPrestige(p), false);
  p.stats.renownEarned = 90000;
  assert.equal(canPrestige(p), true);
  assert.equal(ascend(p, 'not-offered'), null, 'only offered perks can be taken');
  assert.equal(p.prestige.level, 0);
});

test('legacy offers are three distinct perks, stable between calls', () => {
  const p = fresh();
  const a = legacyOffer(p), b = legacyOffer(p);
  assert.deepEqual(a, b);
  assert.equal(a.length, PRESTIGE.choices);
  assert.equal(new Set(a).size, a.length);
  for (const id of a) assert.ok(LEGACY[id], id);
  p.prestige.level = 1;
  assert.notDeepEqual(legacyOffer(p), a);   // a different offer next time (seeded by level)
});

test('ascending resets stat upgrades, keeps unlocks and the wardrobe, and pays out', () => {
  const p = fresh();
  p.stats.renownEarned = 120000; p.renown = 5000;
  Object.assign(p.keep, { fortify: 3, marksman: 2, train_archer: 1, unlock_nova: 1, unlock_mint: 1, cos_castle_azure: 1, title_squire: 1, artslot: 2 });
  p.owned.push('castle:azure');
  const pre = resetPreview(p);
  assert.equal(pre.levels, 3 + 2 + 1);
  const perk = legacyOffer(p)[0];
  const out = ascend(p, perk, d('2026-09-01'));
  assert.ok(out);
  assert.equal(out.level, 1);
  assert.equal(p.prestige.level, 1);
  assert.equal(p.prestige.legacy[perk], 1);
  assert.equal(p.renown, PRESTIGE.endowment(1), 'unspent Renown is replaced by the endowment');
  for (const id of ['fortify', 'marksman', 'train_archer']) assert.equal(p.keep[id], undefined, id);
  for (const id of ['unlock_nova', 'unlock_mint', 'cos_castle_azure', 'title_squire', 'artslot']) assert.ok(p.keep[id], id);
  assert.ok(p.owned.includes('castle:azure') && p.owned.includes('castle:dynasty'));
  assert.ok(p.titles.includes('Heir of Aldermere'));
  assert.equal(p.stats.renownEarned, 120000, 'lifetime Renown (and so rank) is untouched');
  assert.equal(dynastyEarned(p), 0);
  assert.equal(canPrestige(p), false);
});

test('prestige power feeds the run bonus and nothing changes before the first ascension', () => {
  const p = fresh();
  const base = runBonus(p);
  assert.equal(base.towerDmg, 0); assert.equal(base.castleHpMult, 1); assert.equal(base.startGold, 0);
  p.prestige.level = 2; p.prestige.legacy = { treasury: 2, alchemists: 1, scholars: 1 };
  const b = runBonus(p);
  assert.ok(Math.abs(b.towerDmg - 0.04) < 1e-9);
  assert.ok(Math.abs(b.castleHpMult - 1.04) < 1e-9);
  assert.equal(b.startGold, 24 + 120);
  assert.equal(b.rerolls, 1);
  assert.ok(Math.abs(b.abilityCd.volley - 0.96) < 1e-9);
  assert.ok(prestigeBonus(p).renown > 0);
});

test('prestige power is capped so old dynasties still have a ceiling', () => {
  const p = fresh(); p.prestige.level = 500;
  const z = prestigeBonus(p);
  assert.equal(z.renown, PRESTIGE.perLevel.renown.cap);
  assert.equal(z.towerDmg, PRESTIGE.perLevel.towerDmg.cap);
  assert.equal(z.startGold, PRESTIGE.perLevel.gold.cap);
});

test('prestige renown bonus is paid on the next run', () => {
  const run = { map: 'meadow', wave: 20, start: 1, score: 30000, wavesCleared: 19, kills: 100, heroKills: 10, bossKills: 0, shots: 0, hits: 0, headshots: 0, towersBuilt: 3, goldEarned: 100, heroDmg: 0, duration: 300, maxCombo: 1, killsByType: {}, dmgByTower: {}, builtByTower: {}, specs: [], modifiers: [], ascension: 0, mode: 'normal' };
  const a = fresh(), b = fresh(); b.prestige.level = 4;
  const ra = recordRun(a, run, { now: d('2026-09-01') }), rb = recordRun(b, run, { now: d('2026-09-01') });
  assert.ok(rb.renown > ra.renown);
});

test('every legacy perk and prestige reward is well formed', () => {
  const runKeys = Object.keys(runBonus(fresh()));
  for (const [id, perk] of Object.entries(LEGACY)) {
    assert.ok(perk.name && perk.icon && perk.desc && perk.max > 0, id);
    for (const k of Object.keys(perk.fx)) assert.ok(k === 'cd' || runKeys.includes(k), `${id} touches unknown run bonus ${k}`);
  }
  PRESTIGE_REWARDS.forEach((r, i) => {
    assert.equal(r.level, i + 1);
    assert.ok(r.title);
    const [k, id] = r.cosmetic.split(':');
    assert.ok(COSMETICS[k][id], r.cosmetic);
    assert.equal(cosmeticSource(r.cosmetic), 'Prestige ' + r.level);
  });
  assert.equal(roman(4), 'IV'); assert.equal(roman(9), 'IX'); assert.equal(roman(0), '');
});

test('the Keep keeps what it should', () => {
  for (const n of KEEP) {
    if (n.id.startsWith('unlock_') || n.cosmetic || n.title) assert.equal(keepResets(n), false, n.id);
  }
  assert.ok(KEEP.filter(keepResets).length > 60);
});

// ---------- medals ----------
test('every foe, boss and tower can earn three medals with rising goals', () => {
  const subs = medalSubjects();
  assert.equal(subs.length, Object.keys(ENEMIES).length + BOSSES.length + Object.keys(TOWERS).length);
  assert.equal(medalTotal(), subs.length * 3);
  for (const s of subs) { assert.equal(s.goals.length, 3, s.key); assert.ok(s.goals[0] < s.goals[1] && s.goals[1] < s.goals[2], s.key); assert.ok(s.name, s.key); }
});

test('medals pay once, are kept, and earn codex titles', () => {
  const p = fresh();
  p.stats.killsByType = { grunt: 600, hydra: 1 }; p.stats.builtByTower = { archer: 12 };
  const first = checkMedals(p);
  assert.deepEqual(first.map((m) => m.key + ':' + m.medal.id).sort(), ['boss:hydra:bronze', 'foe:grunt:bronze', 'foe:grunt:silver', 'tower:archer:bronze']);
  assert.equal(first.reduce((a, m) => a + m.reward, 0), 15 + 45 + 15 + 15);
  assert.equal(checkMedals(p).length, 0);
  p.stats.killsByType.grunt = 5000;
  const more = checkMedals(p);
  assert.equal(more.length, 1); assert.equal(more[0].medal.id, 'gold');
  assert.equal(tiersFor(p, medalSubjects().find((s) => s.key === 'foe:grunt')), 3);
  assert.equal(medalBonus(p), 0, 'a handful of medals is not yet a title');
  // quarter of the codex → first title, +1% Renown
  for (const s of medalSubjects()) p.medals[s.key] = 1;       // 43 of 129 is a third
  checkMedals(p);
  assert.ok(codexProgress(p).frac >= 0.25);
  assert.ok(p.titles.includes('Chronicler'));
  assert.equal(medalBonus(p), 0.01);
  for (const s of medalSubjects()) p.medals[s.key] = MEDAL_TIERS.length;
  checkMedals(p);
  assert.equal(codexProgress(p).frac, 1);
  assert.ok(p.titles.includes('Grand Archivist'));
  assert.equal(medalBonus(p), 0.04);
});

test('a run pays out medals it earns', () => {
  const p = fresh();
  const run = { map: 'meadow', wave: 8, start: 1, score: 2000, wavesCleared: 7, kills: 60, heroKills: 10, bossKills: 0, shots: 0, hits: 0, headshots: 0, towersBuilt: 12, goldEarned: 100, heroDmg: 0, duration: 200, maxCombo: 1, killsByType: { grunt: 55 }, dmgByTower: {}, builtByTower: { archer: 12 }, specs: [], modifiers: [], ascension: 0, mode: 'normal' };
  const before = p.renown;
  const r = recordRun(p, run, { now: d('2026-09-01') });
  assert.deepEqual(r.medals.map((m) => m.key).sort(), ['foe:grunt', 'tower:archer']);
  assert.equal(p.renown, before + r.renown + r.medalRenown);
  assert.equal(recordRun(p, { ...run, killsByType: {}, builtByTower: {} }, { now: d('2026-09-01') }).medals.length, 0);
});

// ---------- the codex ----------
test('the codex covers everything in the game', () => {
  const ids = (tab) => codexEntries(tab).map((e) => e.id);
  assert.deepEqual(ids('towers').sort(), Object.keys(TOWERS).sort());
  assert.deepEqual(ids('foes').sort(), Object.keys(ENEMIES).sort());
  assert.deepEqual(ids('bosses').sort(), BOSSES.map((b) => b.id).sort());
  assert.deepEqual(ids('weapons').sort(), Object.keys(WEAPONS).sort());
  assert.deepEqual(ids('arts').sort(), Object.keys(ABILITIES).sort());
  assert.deepEqual(ids('boons').sort(), BOONS.map((b) => b.id).sort());
  assert.deepEqual(ids('threats').sort(), Object.keys(THREATS).sort());
  assert.deepEqual(ids('lands').sort(), Object.keys(MAPS).sort());
  for (const m of Object.keys(MODIFIERS)) assert.ok(ids('rules').includes(m), m);
});

test('codex entries are readable: name, text, facts, no undefined or NaN', () => {
  for (const tab of CODEX_TABS) {
    const list = codexEntries(tab.id);
    assert.ok(list.length > 0, tab.id);
    for (const e of list) {
      assert.ok(e.name && e.blurb, `${tab.id}/${e.id}`);
      assert.ok(e.search.includes(e.name.toLowerCase()), `${tab.id}/${e.id} search`);
      const text = JSON.stringify(e);
      assert.ok(!/undefined|NaN|\[object/.test(text), `${tab.id}/${e.id}: ${text.match(/.{0,30}(undefined|NaN|\[object).{0,30}/)?.[0]}`);
      for (const [k, v] of e.facts) assert.ok(k && v !== '', `${tab.id}/${e.id} fact ${k}`);
    }
  }
  const t = codexEntries('towers');
  for (const e of t) { assert.equal(e.specs.length, 2, e.id); assert.equal(e.perks.length, 4, e.id); }
});

test('new achievements are reachable and well formed', () => {
  const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
  assert.equal(ids.size, ACHIEVEMENTS.length);
  const p = fresh();
  p.prestige.level = 3; p.stats.kills = 1e6; p.stats.runs = 600; p.best.wave.meadow = 210; p.streak = { n: 1, best: 61 };
  const got = ACHIEVEMENTS.filter((a) => { try { return a.check(p, null); } catch { return false; } }).map((a) => a.id);
  for (const id of ['prestige1', 'prestige3', 'kills1m', 'runs500', 'wave200', 'streak60']) assert.ok(got.includes(id), id);
  assert.ok(!got.includes('prestige5'));
});

test('a saved loadout survives prestige', () => {
  const p = fresh(); p.stats.renownEarned = 90000;
  p.keep.unlock_nova = 1; p.loadout = ['nova', 'volley'];
  ascend(p, legacyOffer(p)[0]);
  assert.deepEqual(p.loadout, ['nova', 'volley']);
  assert.deepEqual(loadoutFor(p), ['nova', 'volley']);
});
