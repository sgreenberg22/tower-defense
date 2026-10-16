import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { BOONS } from '../src/data/balance.js';

const take = (g, id) => { g.boonOffer = [id]; return g.chooseBoon(id); };

test('Highlander is gone; Witchcraft strengthens Mage Hex and Venom poison', () => {
  assert.ok(!BOONS.some((b) => b.id === 'highlander'));
  const g = new Game({ seed: 'wc', mapId: 'meadow', startWave: 20 });
  g.gold = 1e6;
  const mage = g.build('mage', g.freePlots()[0].x, g.freePlots()[0].y) && g.towers.find((t) => t.type === 'mage');
  const venom = g.build('venom', g.freePlots()[0].x, g.freePlots()[0].y) && g.towers.find((t) => t.type === 'venom');
  const [hex0, time0, pp0] = [mage.stats.hex, mage.stats.hexTime, venom.stats.poisonPct];
  assert.ok(take(g, 'witchcraft'));
  assert.ok(mage.stats.hex > hex0 && mage.stats.hexTime === time0 + 1);
  assert.ok(venom.stats.poisonPct > pp0 * 1.3);
});

test('old saves swap Highlander for Witchcraft and drop unknown boons', () => {
  const g = new Game({ seed: 'old', mapId: 'meadow' });
  const save = JSON.parse(JSON.stringify(g.serialize()));
  save.boons = { highlander: 2, archer_dmg: 1, gone_boon: 3 };
  save.boonOffer = ['highlander', 'gone_boon', 'steady'];
  const r = new Game({ seed: 'old', mapId: 'meadow', save });
  assert.deepEqual(r.boons, { witchcraft: 2, archer_dmg: 1 });
  assert.deepEqual(r.boonOffer, ['witchcraft', 'steady']);
});

test('Endurance and Last Stand never offer gold-only boons', () => {
  for (const mode of ['endurance', 'laststand']) {
    const g = new Game({ seed: 'free-' + mode, mapId: 'meadow', mode });
    const seen = new Set();
    for (let i = 0; i < 40; i++) { g.stats.boonsTaken = i; g.offerBoons(true); g.boonOffer.forEach((id) => seen.add(id)); }
    for (const id of ['interest', 'bloodlust', 'bounty', 'thrifty', 'taxman', 'golden', 'warfund', 'critgold']) assert.ok(!seen.has(id), `${mode} offered ${id}`);
    assert.ok(seen.size > 8);
  }
});

test('Field Funds scales with the wave, and Frostbite needs a Frost Spire', () => {
  const g = new Game({ seed: 'wf', mapId: 'meadow', startWave: 30 });
  const before = g.gold; take(g, 'warfund');
  assert.ok(g.gold - before >= 150 + 12 * 30 - 1);
  const k = new Game({ seed: 'fb', mapId: 'meadow', bonus: { unlockedTowers: new Set(['archer']) } });
  const seen = new Set();
  for (let i = 0; i < 30; i++) { k.stats.boonsTaken = i; k.offerBoons(true); k.boonOffer.forEach((id) => seen.add(id)); }
  assert.ok(!seen.has('frostbite') && !seen.has('deepfreeze'));
});
