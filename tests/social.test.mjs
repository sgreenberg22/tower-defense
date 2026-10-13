// v1.9 · Friend requests, player cards, salutes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, call } from './helpers/d1.mjs';
import { onRequest } from '../functions/api/[[path]].js';

const runBody = (o = {}) => ({ seed: 'abc', map: 'meadow', mode: 'normal', modifiers: [], ascension: 0, wave: 20, wavesCleared: 19, score: 20000, kills: 500, heroKills: 120, duration: 900, ...o });

test('friend requests need accepting; mutual requests auto-accept; cards show stats', async () => {
  const env = { DB: makeD1() };
  const reg = async (name, ip) => (await call(onRequest, env, 'POST', 'register', { body: { name }, ip })).data;
  const api = (m, path, who, body) => call(onRequest, env, m, path, { token: who.token, body }).then((r) => ({ ...r, ...r.data }));
  const a = await reg('Alice Archer', '2.2.2.2'), b = await reg('Bob Bowman', '3.3.3.3'), c = await reg('Cara Cannon', '4.4.4.4');

  // A asks B by code: nothing is mutual yet.
  let r = await api('POST', 'friends/add', a, { code: b.friendCode });
  assert.equal(r.state, 'sent');
  assert.equal((await api('GET', 'friends', a)).friends.length, 0);
  let bf = await api('GET', 'friends', b);
  assert.equal(bf.requests.length, 1);
  assert.equal(bf.requests[0].id, a.id);
  assert.equal((await api('GET', 'me', b)).requests, 1);
  // Gifts need real friendship.
  r = await api('POST', 'gifts', a, { to: b.id, kind: 'gold' });
  assert.ok(r.error, 'cannot gift before accepting');
  // B accepts.
  await api('POST', 'friends/accept', b, { id: a.id });
  assert.equal((await api('GET', 'friends', a)).friends[0].id, b.id);
  assert.equal((await api('GET', 'friends', b)).requests.length, 0);
  r = await api('POST', 'gifts', a, { to: b.id, kind: 'reroll' });
  assert.ok(r.ok, 'new gift kind works');
  // Salutes: friends only, preset text, rate-limited per friend.
  assert.ok((await api('POST', 'salute', a, { to: c.id, msg: 0 })).error, 'not friends');
  assert.ok((await api('POST', 'salute', a, { to: b.id, msg: 0 })).ok);
  assert.ok((await api('POST', 'salute', a, { to: b.id, msg: 1 })).error, 'one per hour per friend');
  assert.ok((await api('GET', 'inbox', b)).items.some((i) => i.kind === 'note' && i.title.includes('Well fought')));

  // Crossing requests become a friendship.
  await api('POST', 'friends/add', c, { id: a.id });
  r = await api('POST', 'friends/add', a, { id: c.id });
  assert.equal(r.state, 'friends');
  // Declining removes it.
  const d = await reg('Dan Defender', '5.5.5.5');
  await api('POST', 'friends/add', d, { id: b.id });
  await api('POST', 'friends/decline', b, { id: d.id });
  assert.equal((await api('GET', 'friends', b)).requests.length, 0);

  // Player cards.
  await api('POST', 'runs', a, runBody());
  await api('POST', 'showcase', a, { rank: 'Squire', castle: 'royal', ach: 4, achTotal: 60, motto: 2, weapon: 'longbow' });
  const card = await api('GET', `player?id=${a.id}`, b);
  assert.equal(card.name, 'Alice Archer');
  assert.equal(card.relation, 'friends');
  assert.equal(card.stats.runs, 1);
  assert.equal(card.stats.kills, 500);
  assert.equal(card.stats.favMap, 'meadow');
  assert.equal(card.recent.length, 1);
  assert.equal(card.showcase.rank, 'Squire');
  assert.equal(card.mutual, 0, 'no friends in common yet');
  await api('POST', 'friends/add', c, { id: b.id }); await api('POST', 'friends/add', b, { id: c.id });
  assert.equal((await api('GET', `player?id=${a.id}`, b)).mutual, 1, 'Cara is a friend of both');
  assert.equal((await api('GET', `player?id=${d.id}`, a)).relation, 'none');
  assert.ok((await api('GET', 'player?id=nobody', a)).error);

  // Blocking clears requests and hides the ability to ask again.
  await api('POST', 'friends/add', d, { id: a.id });
  await api('POST', 'block', a, { id: d.id });
  assert.equal((await api('GET', 'friends', a)).requests.length, 0);
  assert.equal((await api('GET', 'blocks', a)).blocked.length, 1);
  await api('POST', 'unblock', a, { id: d.id });
  assert.equal((await api('GET', 'blocks', a)).blocked.length, 0);
});
