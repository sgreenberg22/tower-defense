import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, STEPS, LENGTH, stepAt } from '../src/ui/howto-script.js';

const stubFx = () => { const log = []; return { log, text: (x, y, t) => log.push(t), burst() {}, ring() {}, update() {} }; };
const run = (until = LENGTH) => {
  const fx = stubFx(), d = createDemo({ fx });
  const seen = { boss: false, shots: 0 };
  d.g.on('kill', ({ enemy }) => { if (enemy.boss) seen.boss = true; });
  d.g.on('heroShot', () => seen.shots++);
  while (d.time() < until) d.step(1 / 60);
  return { d, fx, seen };
};

test('the demo walks through every step of playing, on the real engine', () => {
  const { d, fx, seen } = run();
  const g = d.g;
  assert.equal(g.towers.length, 4, 'builds four towers');
  const archer = g.towers.find((t) => t.type === 'archer');
  assert.equal(archer.tier, 5); assert.ok(archer.spec, 'upgrades to tier 5 and picks a specialization');
  assert.ok(g.stats.abilities >= 1, 'casts a castle art');
  assert.ok(seen.shots >= 5, 'shoots by hand');
  assert.ok(g.garrison.units.length >= 4 && g.stats.troopKills > 0, 'trains troops and they fight');
  assert.ok(seen.boss, 'fells the boss before the loop');
  assert.equal(g.stats.leaks, 0);
  assert.ok(fx.log.includes('Tier 2') && fx.log.some((t) => /Renown/.test(t)));
});

test('the demo is deterministic, and seeking lands on the same moment as playing', () => {
  const a = run(30).d, fx = stubFx(), b = createDemo({ fx });
  b.seek(30);
  assert.deepEqual(a.g.towers.map((t) => [t.type, t.tier]), b.g.towers.map((t) => [t.type, t.tier]));
  assert.equal(a.g.enemies.length, b.g.enemies.length);
});

test('steps are in order and inside the loop', () => {
  assert.ok(STEPS.every((s, i) => i === 0 || s.at > STEPS[i - 1].at));
  assert.ok(STEPS.at(-1).at < LENGTH - 5);
  assert.equal(stepAt(0), 0); assert.equal(stepAt(LENGTH), STEPS.length - 1);
  assert.equal(stepAt(STEPS[2].at + 0.1), 2);
});
