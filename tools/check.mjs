// npm run check: a syntax check of every module, the balance-sanity pass, then the test suite.
import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { if (n === 'node_modules' || n === '.git' || n === 'vendor') continue; const p = join(d, n); statSync(p).isDirectory() ? walk(p) : /\.(m?js)$/.test(n) && files.push(p); } };
for (const d of ['src', 'functions', 'tools', 'server']) { try { walk(join(root, d)); } catch { /* optional folder */ } }
files.push(join(root, 'sw.js'), join(root, 'worker.js'));
let bad = 0;
for (const f of files) { const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' }); if (r.status) { bad++; console.error(`✗ ${f}\n${r.stderr}`); } }
console.log(`${files.length - bad}/${files.length} modules parse`);
if (bad) process.exit(1);
const t = spawnSync(process.execPath, ['--test', 'tests/balance.test.mjs', 'tests/content.test.mjs'], { cwd: root, stdio: 'inherit' });
if (t.status) process.exit(t.status);
const all = spawnSync(process.execPath, ['--test', ...readdirSync(join(root, 'tests')).filter((n) => n.endsWith('.test.mjs')).map((n) => 'tests/' + n)], { cwd: root, stdio: 'inherit' });
process.exit(all.status || 0);
