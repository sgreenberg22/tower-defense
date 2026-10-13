import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, THEMES, DAY_BLESSINGS, RANKS } from '../src/data/events.js';
import { activeEvent, nextEvent, blessingFor, progressEvent, rankFor, checkRank, currentTheme } from '../src/meta/events.js';
import { defaultProfile } from '../src/meta/profile.js';
import { COSMETICS, ACHIEVEMENTS } from '../src/meta/achievements.js';
import { TOWER_SKINS, CASTLE_SKINS, TRAILS, HERO_OUTFITS } from '../src/game/render.js';
import { KILL_FX } from '../src/game/fx.js';

const d = (s) => new Date(s + 'T12:00:00Z');

test('events run in their windows, including across new year', () => {
  assert.equal(activeEvent(d('2026-10-12')).id, 'haunt');
  assert.equal(activeEvent(d('2026-12-25')).id, 'frostfair');
  assert.equal(activeEvent(d('2027-01-02')).id, 'frostfair');
  assert.equal(activeEvent(d('2027-01-02')).key, 'frostfair-2026');
  assert.equal(activeEvent(d('2026-09-01')), null);
  assert.ok(nextEvent(d('2026-09-01')).id);
});

test('event rewards exist and are paid once', () => {
  for (const ev of EVENTS) {
    assert.ok(THEMES[ev.theme], ev.id);
    for (const r of ev.rewards) if (r.cosmetic) { const [k, i] = r.cosmetic.split(':'); assert.ok(COSMETICS[k][i], r.cosmetic); }
  }
  const p = defaultProfile(), now = d('2026-10-12');
  const a = progressEvent(p, { wavesCleared: 30 }, now);
  assert.equal(a.gained.length, 1);
  assert.ok(p.owned.includes('castle:haunted'));
  const b = progressEvent(p, { wavesCleared: 1 }, now);
  assert.equal(b.gained.length, 0);
  assert.equal(progressEvent(p, { wavesCleared: 5 }, d('2026-09-01')), null);
});

test('blessings cover every weekday; ranks grant titles', () => {
  assert.equal(DAY_BLESSINGS.length, 7);
  assert.ok(blessingFor(d('2026-10-12')).name);
  assert.equal(rankFor(0).name, 'Recruit');
  assert.equal(rankFor(350).name, 'Recruit');
  assert.equal(rankFor(1500).name, 'Sergeant');
  const p = defaultProfile(); p.stats.renownEarned = 3200;
  const fresh = checkRank(p);
  assert.ok(fresh.length >= 3 && p.titles.includes('Lieutenant'));
  assert.equal(checkRank(p).length, 0);
});

test('theme respects setting; achievements are well formed', () => {
  const p = defaultProfile();
  assert.ok(currentTheme(p, d('2026-10-12')));
  p.settings.theme = 'off';
  assert.equal(currentTheme(p, d('2026-10-12')), null);
  const ids = new Set();
  for (const a of ACHIEVEMENTS) { assert.ok(!ids.has(a.id), a.id); ids.add(a.id); assert.ok(a.name && a.desc); }
});

test('every cosmetic has a render/fx entry', () => {
  const tabs = { castle: CASTLE_SKINS, skin: TOWER_SKINS, trail: TRAILS, kill: KILL_FX, hero: HERO_OUTFITS };
  for (const [kind, names] of Object.entries(COSMETICS)) for (const id of Object.keys(names)) assert.ok(tabs[kind][id] || (kind === 'trail' && id === 'none'), kind + ':' + id);
});
