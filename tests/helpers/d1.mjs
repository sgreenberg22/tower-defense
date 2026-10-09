// Minimal in-memory D1 stand-in on top of node:sqlite, so the real API handler can be tested without wrangler.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'));   // the handler caches its own schema step per process
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    _run: () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    batch: async (list) => list.map((s) => s._run()),
  };
}

// Calls the handler like Cloudflare would. Returns parsed JSON and status.
export async function call(onRequest, env, method, path, { token, body, ip = '1.1.1.1' } = {}) {
  const url = new URL('https://t.test/api/' + path);
  const headers = { 'content-type': 'application/json', 'cf-connecting-ip': ip };
  if (token) headers.authorization = 'Bearer ' + token;
  const req = new Request(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const res = await onRequest({ request: req, env, params: { path: url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean) } });
  return { status: res.status, data: await res.json() };
}
