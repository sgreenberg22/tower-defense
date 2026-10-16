import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { GARRISON, VALOR, TROOPS } from '../src/data/balance.js';

test('Valor is scarce enough to matter and buys promotions', () => {
  assert.ok(VALOR.perPoint <= 0.005);
  const g = new Game({ seed: 'valor1', mapId: 'meadow', bonus: { unlockedTroops: new Set(['footman']), troopSlots: 6 } });
  g.gold = 1e6;
  assert.ok(g.trainTroop('footman'));
  for (let t = 0; t < TROOPS.footman.train / g.trainSpeed() + 1; t += 1 / 30) g.update(1 / 30);
  const u = g.garrison.units[0];
  assert.ok(u && u.rank === 0);
  const cost = g.commendCost(u);
  assert.equal(cost, GARRISON.commend[0]);
  g.garrison.valor = cost - 1;
  assert.equal(g.commendTroop(u), false, 'not enough Valor');
  g.garrison.valor = cost + 5;
  assert.equal(g.commendTroop(u), true);
  assert.equal(u.rank, 1);
  assert.equal(g.garrison.valor, 5);
  assert.ok(g.commendCost(u) > cost, 'the next rank costs more');
  g.garrison.valor = 1000; g.commendTroop(u); g.commendTroop(u);
  assert.equal(u.rank, GARRISON.commend.length);
  assert.equal(g.commendCost(u), 0, 'Legends cannot be promoted further');
});
