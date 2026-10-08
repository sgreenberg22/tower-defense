// End-to-end API smoke test. Requires `npm run dev` (wrangler pages dev with a local D1) on :8788.
// Run: node tests/api.smoke.mjs
const BASE = process.env.API || 'http://localhost:8788/api';
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fails++; };
async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const run = (over = {}) => ({ seed: 's' + Math.random(), map: 'meadow', mode: 'normal', modifiers: [], ascension: 0, wave: 12, wavesCleared: 11, score: 4200, kills: 260, heroKills: 40, duration: 600, bossDmg: 5000, ...over });

console.log('health'); const h = await call('/health'); ok(h.data?.ok && h.data.db, 'server + db up');
console.log('register');
const A = (await call('/register', { method: 'POST', body: { name: 'Sir Testalot' } })).data;
const B = (await call('/register', { method: 'POST', body: { name: 'fuck face' } })).data;
ok(A?.token?.length === 64 && A.friendCode?.length === 6, 'A registered');
ok(B?.name && !/fuck/i.test(B.name), `profane name replaced (${B?.name})`);
console.log('auth');
ok((await call('/me')).status === 401, 'me without token is 401');
const meA = await call('/me', { token: A.token }); ok(meA.status === 200 && meA.data.siege?.maxHp > 0, 'me works, siege exists');
console.log('rename'); const rn = await call('/rename', { method: 'POST', token: A.token, body: { name: 'Lady Arrowsmith' } }); ok(rn.data?.name === 'Lady Arrowsmith', 'rename');
console.log('runs');
const bad = await call('/runs', { method: 'POST', token: A.token, body: run({ score: 99999999999 }) }); ok(bad.data?.accepted === false, `absurd score rejected (${bad.data?.reason})`);
const fast = await call('/runs', { method: 'POST', token: B.token, body: run({ duration: 3 }) }); ok(fast.data?.accepted === false, `too-fast run rejected (${fast.data?.reason})`);
await new Promise((r) => setTimeout(r, 21000));
const good = await call('/runs', { method: 'POST', token: A.token, body: run() }); ok(good.data?.accepted && good.data.ranks.wave >= 1, `valid run accepted, rank ${good.data?.ranks?.wave}, siege dmg ${good.data?.siege?.damage}`);
const goodB = await call('/runs', { method: 'POST', token: B.token, body: run({ wave: 20, wavesCleared: 19, score: 9000, kills: 600, duration: 900 }) }); ok(goodB.data?.accepted, 'B run accepted');
const spam = await call('/runs', { method: 'POST', token: A.token, body: run() }); ok(spam.status === 429, 'run rate limit');
console.log('leaderboard');
const lb = await call('/leaderboard?board=wave&scope=global&period=week', { token: A.token });
ok(lb.data?.rows?.length >= 2 && lb.data.rows[0].value >= lb.data.rows[1].value, 'global weekly wave board sorted');
ok(lb.data?.me?.rank >= 1 && lb.data.rival?.value === 20, `my rank ${lb.data?.me?.rank}, rival ${lb.data?.rival?.name}`);
console.log('friends');
const add = await call('/friends/add', { method: 'POST', token: A.token, body: { code: B.friendCode } }); ok(add.data?.ok, 'A adds B');
const self = await call('/friends/add', { method: 'POST', token: A.token, body: { code: A.friendCode } }); ok(self.status === 400, 'cannot add self');
const fl = await call('/friends', { token: A.token }); ok(fl.data?.friends?.[0]?.id === B.id && fl.data.friends[0].online, 'friend listed + online');
const lbf = await call('/leaderboard?board=wave&scope=friends&period=week', { token: A.token }); ok(lbf.data?.rows?.length === 2, 'friends board has 2');
console.log('gifts');
const g1 = await call('/gifts', { method: 'POST', token: A.token, body: { to: B.id, kind: 'tower', tower: 'cannon' } }); ok(g1.data?.ok, 'gift sent');
const g2 = await call('/gifts', { method: 'POST', token: A.token, body: { to: B.id, kind: 'gold' } }); ok(g2.status === 429, 'one gift per friend per day');
const inbox = await call('/inbox', { token: B.token }); const gift = inbox.data?.items?.find((i) => i.kind === 'tower'); ok(!!gift, 'gift in B inbox');
const cl = await call('/inbox/claim', { method: 'POST', token: B.token, body: { id: gift?.id } }); ok(cl.data?.reinforcement?.tower === 'cannon' && cl.data.reinforcement.from === 'Lady Arrowsmith', 'claim returns reinforcement');
const cl2 = await call('/inbox/claim', { method: 'POST', token: B.token, body: { id: gift?.id } }); ok(cl2.status === 400, 'double claim blocked');
console.log('clans');
const clanName = 'Order ' + Math.random().toString(36).slice(2, 7);
const cc = await call('/clan/create', { method: 'POST', token: A.token, body: { name: clanName, tag: 'okp' } }); ok(cc.data?.code?.length === 6, 'clan created');
const cj = await call('/clan/join', { method: 'POST', token: B.token, body: { code: cc.data?.code } }); ok(cj.data?.ok, 'B joins');
const cd = await call('/clan/donate', { method: 'POST', token: B.token, body: { amount: 600 } }); ok(cd.data?.ok, 'donate');
const cg = await call('/clan', { token: A.token }); ok(cg.data?.clan?.members?.length === 2 && cg.data.clan.level >= 1 && cg.data.clan.tag === 'OKP', `clan level ${cg.data?.clan?.level}, goal ${cg.data?.clan?.weekly?.goal}`);
const cs = await call('/clan/search?q=' + encodeURIComponent(clanName), { token: B.token }); ok(cs.data?.clans?.[0]?.members === 2, 'search finds clan');
const lbc = await call('/leaderboard?board=wave&scope=clan&period=week', { token: B.token }); ok(lbc.data?.rows?.length === 2, 'clan board');
console.log('siege');
const sg = await call('/siege', { token: A.token }); ok(sg.data?.hp < sg.data?.maxHp && sg.data.top.length >= 2, `siege damaged (${sg.data?.maxHp - sg.data?.hp})`);
console.log('safety');
const rp = await call('/report', { method: 'POST', token: A.token, body: { id: B.id } }); ok(rp.data?.ok, 'report');
const bl = await call('/block', { method: 'POST', token: A.token, body: { id: B.id } }); ok(bl.data?.ok, 'block');
const lb2 = await call('/leaderboard?board=wave&scope=friends&period=week', { token: A.token }); ok(lb2.data?.rows?.every((r) => r.id !== B.id), 'blocked player hidden + unfriended');
console.log('recovery');
const rc = await call('/recover', { method: 'POST', body: { recovery: A.recovery } }); ok(rc.data?.id === A.id && rc.data.token !== A.token, 'recovery rotates token');
ok((await call('/me', { token: A.token })).status === 401, 'old token revoked');
ok((await call('/me', { token: rc.data.token })).status === 200, 'new token works');
const season = await call('/season/claim', { token: rc.data.token }); ok(season.status === 200, 'season claim responds');
const leave = await call('/clan/leave', { method: 'POST', token: rc.data.token }); ok(leave.data?.ok, 'leader leaves, leadership passes');
console.log(fails ? `\n${fails} FAILED` : '\nall API checks passed');
process.exit(fails ? 1 : 0);
