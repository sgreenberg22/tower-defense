// Full-stack local server without wrangler: static files + the real API handler on an in-memory SQLite "D1".
// Usage: node tools/devserver.mjs [port=8790]     (SQLite is Node's built-in experimental module; no installs needed)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeD1 } from '../tests/helpers/d1.mjs';
import { onRequest } from '../functions/api/[[path]].js';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.argv[2]) || 8790;
const env = { DB: makeD1() };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const BLOCK = /^\/(node_modules|tests|tools|docs|functions|migrations|\.git)\b/;

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: { ...req.headers, 'cf-connecting-ip': req.socket.remoteAddress }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const r = await onRequest({ request, env, params: { path: url.pathname.slice(5).split('/').filter(Boolean) } });
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
    }
    let p = normalize(decodeURIComponent(url.pathname)); if (p.endsWith('/')) p += 'index.html';
    if (BLOCK.test(p)) { res.writeHead(404); res.end('not found'); return; }
    const data = await readFile(join(root, p));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, () => console.log(`Bastion Siege dev server on http://localhost:${port}`));
