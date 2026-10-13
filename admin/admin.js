// The keeper's desk: the owner's admin panel. It talks to /api/admin/* with the admin key.
// Every element is built with textContent, never innerHTML: player, clan and feed text is written by strangers.

const app = document.getElementById('app');
const state = { key: '', tab: 'overview', reported: 0, keys: {} };

// ---------------- tiny DOM kit ----------------
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (Array.isArray(c)) c.forEach(add);
    else if (c === null || c === undefined || c === false) return;
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  if (value !== undefined) el.value = value;
  return el;
}
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const pct = (x) => Math.round(Math.max(0, Math.min(1, x || 0)) * 100);
const when = (ts) => (ts ? new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never');
function ago(ts) {
  if (!ts) return 'never';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 60) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / 86400 / 30)}mo ago`;
}
const clock = (secs) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
const chip = (text, kind = '') => h('span', { class: 'chip ' + kind }, text);
const statusChip = (hidden) => (hidden === 2 ? chip('Suspended', 'bad') : hidden === 1 ? chip('Hidden', 'warn') : null);
const put = (el, ...kids) => { for (const k of kids.flat()) if (k) el.append(k); };   // like append(), but skips null (append would print "null")
const empty = (text) => h('div', { class: 'empty' }, text);
const bar = (value, max, { hp = false, label, right } = {}) => h('div', {},
  (label || right) ? h('div', { class: 'barlabel' }, h('span', {}, label), h('span', {}, right)) : null,
  h('div', { class: 'bar' + (hp ? ' hp' : '') }, h('i', { 'data-w': pct(max ? value / max : 0) })));
function fillBars(root) { root.querySelectorAll('.bar > i[data-w]').forEach((i) => { i.style.width = i.dataset.w + '%'; }); }

const store = {
  get() { try { return sessionStorage.getItem('adm.key') || localStorage.getItem('adm.key') || ''; } catch { return ''; } },
  set(key, remember) { try { sessionStorage.setItem('adm.key', key); if (remember) localStorage.setItem('adm.key', key); else localStorage.removeItem('adm.key'); } catch { /* private window */ } },
  clear() { try { sessionStorage.removeItem('adm.key'); localStorage.removeItem('adm.key'); } catch { /* ignore */ } },
};

function toast(msg, bad = false) {
  const t = h('div', { class: 'toast' + (bad ? ' bad' : ''), role: bad ? 'alert' : 'status' }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), bad ? 6000 : 3000);
}

// ---------------- api ----------------
async function api(path, { method = 'GET', body, quiet = false, key = state.key } = {}) {
  const res = await fetch('/api/admin/' + path, {
    method, cache: 'no-store', headers: { 'content-type': 'application/json', 'x-admin-key': key }, body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    if (res.status === 401 && !quiet && state.key) { signOut('The admin key was not accepted any more.'); }
    throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { status: res.status });
  }
  return data;
}
const post = (path, body) => api(path, { method: 'POST', body });
// Runs an action, tells the owner how it went, and returns the result (or null when it failed).
async function attempt(fn, done = 'Done.') {
  try { const r = await fn(); if (done) toast(done); return r; } catch (e) { toast(e.message, true); return null; }
}

// ---------------- dialogs ----------------
// fields: { name, label, type: text|number|textarea|checkbox|choice, value, hint, options: [[value, label]], when: (vals) => bool, min, max, placeholder }
// word: the owner must type it before the button wakes up. Resolves to the values, or null if cancelled.
function ask({ title, text, fields = [], word, ok = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const vals = {}, wraps = [];
    const refresh = () => { wraps.forEach(([f, w]) => { w.hidden = f.when ? !f.when(vals) : false; }); sync(); };
    const build = (f) => {
      vals[f.name] = f.value ?? (f.type === 'checkbox' ? false : '');
      if (f.type === 'checkbox') {
        const i = h('input', { type: 'checkbox', checked: !!f.value, onchange: () => { vals[f.name] = i.checked; refresh(); } });
        return h('label', { class: 'check' }, i, h('span', {}, f.label, f.hint ? h('small', {}, f.hint) : null));
      }
      if (f.type === 'choice') {
        return h('div', { class: 'field' }, h('span', { class: 'muted' }, f.label), ...f.options.map(([v, l]) => {
          const i = h('input', { type: 'radio', name: 'f-' + f.name, checked: v === f.value, onchange: () => { vals[f.name] = v; refresh(); } });
          return h('label', { class: 'check' }, i, h('span', {}, l));
        }));
      }
      const common = { value: f.value ?? '', placeholder: f.placeholder, autocomplete: 'off' };
      let i;
      if (f.type === 'number') i = h('input', { ...common, type: 'number', inputmode: 'numeric', min: f.min, max: f.max, oninput: () => { vals[f.name] = i.value === '' ? undefined : Number(i.value); refresh(); } });
      else if (f.type === 'textarea') i = h('textarea', { ...common, maxlength: f.max, oninput: () => { vals[f.name] = i.value; refresh(); } });
      else i = h('input', { ...common, type: 'text', maxlength: f.max, oninput: () => { vals[f.name] = i.value; refresh(); } });
      return h('label', { class: 'field' }, h('span', {}, f.label), i, f.hint ? h('small', {}, f.hint) : null);
    };
    const typed = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': `Type ${word} to confirm`, oninput: () => sync() });
    const okBtn = h('button', { class: 'btn ' + (danger ? 'danger' : 'gold'), type: 'submit' }, ok);
    const sync = () => { okBtn.disabled = !!word && typed.value.trim() !== word; };
    const form = h('form', { class: 'dialog' + (danger ? ' danger' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onsubmit: (e) => { e.preventDefault(); if (!okBtn.disabled) finish(vals); } },
      h('h2', {}, title), text ? h('p', { class: 'muted' }, text) : null,
      ...fields.map((f) => { const w = h('div', {}, build(f)); wraps.push([f, w]); return w; }),
      word ? h('label', { class: 'field' }, h('span', {}, 'Type ', h('code', {}, word), ' to go ahead'), typed) : null,
      h('div', { class: 'actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => finish(null) }, 'Cancel'), okBtn));
    const veil = h('div', { class: 'veil', onmousedown: (e) => { if (e.target === veil && !danger) finish(null); } }, form);
    const onKey = (e) => { if (e.key === 'Escape') finish(null); };
    function finish(v) { document.removeEventListener('keydown', onKey); veil.remove(); resolve(v); }
    document.addEventListener('keydown', onKey);
    document.body.append(veil);
    refresh();
    (form.querySelector('input:not([type=radio]):not([type=checkbox]), textarea') || okBtn).focus();
  });
}
const sure = (title, text, ok = 'Yes, do it', danger = false) => ask({ title, text, ok, danger });

// ---------------- sign-in ----------------
async function showGate(message = '') {
  state.key = '';
  app.replaceChildren(h('p', { class: 'boot' }, 'Checking the gate…'));
  let enabled = true;
  try { enabled = (await api('status', { quiet: true, key: '' })).enabled; } catch { enabled = null; }
  const err = h('p', { class: 'err', role: 'alert' }, message);
  if (enabled === false) {
    app.replaceChildren(h('div', { class: 'gate' }, h('h1', {}, "Keeper's desk"), h('p', { class: 'muted' }, 'Bastion Siege administration'),
      h('div', { class: 'card setup' }, h('h3', {}, 'The desk is locked until you give it a key'),
        h('p', {}, 'Admin access is switched off because the server has no ', h('code', {}, 'ADMIN_KEY'), ' secret yet.'),
        h('ol', {}, h('li', {}, 'Make a long random key, e.g. ', h('code', {}, 'openssl rand -hex 24'), ' (16 characters or more).'),
          h('li', {}, 'Cloudflare → Workers & Pages → tower-defense → Settings → Variables and Secrets → Add → type ', h('b', {}, 'Secret'), ', name ', h('code', {}, 'ADMIN_KEY'), '.'),
          h('li', {}, 'Deploy (or save and redeploy), then reload this page and sign in with that key.')),
        h('p', { class: 'muted' }, 'Keep the key out of the repository and out of chat. Anyone holding it can do everything here.'),
        h('button', { class: 'btn', onclick: () => showGate() }, 'Check again'))));
    return;
  }
  const input = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Admin key', 'aria-label': 'Admin key', spellcheck: 'false' });
  const remember = h('input', { type: 'checkbox' });
  const go = h('button', { class: 'btn gold', type: 'submit' }, 'Enter');
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    const key = input.value.trim();
    if (!key) return;
    go.disabled = true; err.textContent = '';
    try {
      const o = await api('overview', { quiet: true, key });
      state.reported = o.players.reported; state.keys = o.keys;
      state.key = key; store.set(key, remember.checked);
      await api('login', { method: 'POST', body: {}, quiet: true }).catch(() => {});
      start();
    } catch (ex) { err.textContent = enabled === null ? 'Could not reach the server.' : ex.message; go.disabled = false; input.select(); }
  } },
  h('label', { class: 'field' }, h('span', {}, 'Admin key'), input),
  h('label', { class: 'check' }, remember, h('span', {}, 'Keep me signed in on this device', h('small', {}, 'Leave this off on shared computers.'))),
  err, go);
  app.replaceChildren(h('div', { class: 'gate' }, h('h1', {}, "Keeper's desk"), h('p', { class: 'muted' }, 'Bastion Siege administration. Owner only.'), form));
  input.focus();
}
function signOut(message = '') { store.clear(); main = null; showGate(message); }

// ---------------- shell ----------------
const TABS = [
  ['overview', 'Overview', overview], ['players', 'Players', players], ['objectives', 'Objectives', objectives], ['boards', 'Leaderboards', boards],
  ['stats', 'Stats', stats], ['clans', 'Clans', clans], ['messages', 'Messages', messages], ['upkeep', 'Upkeep', upkeep], ['audit', 'Audit log', audit],
];
let main, tabsEl, token = 0;

function start() {
  main = h('main');
  tabsEl = h('nav', { class: 'tabs', role: 'tablist' });
  app.replaceChildren(
    h('header', { class: 'top' }, h('h1', {}, "Keeper's desk"), h('a', { class: 'btn small', href: '../' }, 'Game'), h('button', { class: 'btn small', onclick: () => signOut() }, 'Sign out')),
    tabsEl, main);
  const fromHash = location.hash.slice(1);
  state.tab = TABS.some((t) => t[0] === fromHash) ? fromHash : 'overview';
  drawTabs(); render();
}
function drawTabs() {
  tabsEl.replaceChildren(...TABS.map(([id, label]) => h('button', { class: 'tab', role: 'tab', 'aria-selected': String(state.tab === id), onclick: () => setTab(id) },
    label, id === 'players' && state.reported ? h('span', { class: 'badge', title: 'Players with reports' }, state.reported) : null)));
}
function setTab(id) { state.tab = id; location.hash = id; drawTabs(); render(); window.scrollTo(0, 0); }
async function render() {
  const mine = ++token, view = TABS.find((t) => t[0] === state.tab)[2];
  main.replaceChildren(h('p', { class: 'boot' }, 'Loading…'));
  const box = h('div', { class: 'stack', role: 'tabpanel' });
  try { await view(box); } catch (e) {
    if (mine !== token) return;
    box.replaceChildren(h('div', { class: 'card' }, h('p', { class: 'err' }, e.message), h('button', { class: 'btn', onclick: render }, 'Try again')));
  }
  if (mine !== token) return;
  fillBars(box);
  main.replaceChildren(box);
}
window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (main && id !== state.tab && TABS.some((t) => t[0] === id)) { state.tab = id; drawTabs(); render(); } });

// ---------------- overview ----------------
async function overview(box) {
  const o = await api('overview');
  state.reported = o.players.reported; state.keys = o.keys; drawTabs();
  const tile = (n, label, { hot, go } = {}) => h(go ? 'button' : 'div', { class: 'tile' + (hot ? ' hot' : ''), onclick: go }, h('b', {}, fmt(n)), h('span', {}, label));
  const goPlayers = (filter) => () => { pv.filter = filter; pv.q = ''; pv.sel = null; pv.offset = 0; setTab('players'); };
  const period = (key, label) => {
    const p = o.periods.find((x) => x.period === key);
    return p ? h('div', { class: 'list' }, bar(p.kills, p.goalKills, { label: `${label} · kills`, right: `${fmt(p.kills)} / ${fmt(p.goalKills)}` }), bar(p.waves, p.goalWaves, { label: 'waves', right: `${fmt(p.waves)} / ${fmt(p.goalWaves)}` })) : h('p', { class: 'muted' }, `${label}: nobody has played yet.`);
  };
  put(box, 
    h('div', { class: 'grid' },
      tile(o.players.total, 'Players'), tile(o.players.activeDay, 'Seen in 24 hours'), tile(o.players.online, 'Online now'), tile(o.players.fresh, 'Joined in 48 hours'),
      tile(o.players.reported, 'Reported, awaiting review', { hot: o.players.reported > 0, go: goPlayers('reported') }),
      tile(o.players.hidden, 'Hidden from boards', { go: goPlayers('hidden') }), tile(o.players.banned, 'Suspended', { go: goPlayers('banned') }),
      tile(o.runs, 'Runs recorded'), tile(o.runsToday, 'Runs today (UTC)'), tile(o.clans, 'Clans'), tile(o.feed, 'Realm feed posts'), tile(o.pendingUsage, 'Run reports waiting for World Stats')),
    h('div', { class: 'card' }, h('header', {}, h('h3', {}, 'The Realm right now'), h('small', {}, `${o.keys.week.slice(2)} · ${o.keys.month.slice(2)}`)), period(o.keys.week, 'Weekly Muster'), period(o.keys.month, 'Monthly Campaign'),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => setTab('objectives') }, 'Objectives…'))),
    h('div', { class: 'card' }, h('header', {}, h('h3', {}, 'Latest changes'), h('button', { class: 'btn small', onclick: () => setTab('audit') }, 'Full log')),
      o.recent.length ? h('div', { class: 'list' }, o.recent.map(logRow)) : empty('Nothing has been changed from here yet.')));
}
const detailText = (d) => (d ? Object.entries(d).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') : '');
const logRow = (r) => h('div', { class: 'row' }, h('span', { class: 'who' }, h('b', {}, r.action), r.target ? h('span', { class: 'muted' }, ' ' + r.target) : null), h('span', { class: 'muted' }, ago(r.at)), detailText(r.detail) ? h('span', { class: 'meta' }, detailText(r.detail)) : null);

// ---------------- players ----------------
const pv = { q: '', filter: 'all', sort: 'seen', offset: 0, sel: null };
const FILTERS = [['all', 'Everyone'], ['reported', 'Reported'], ['hidden', 'Hidden'], ['banned', 'Suspended'], ['active', 'Seen today'], ['fresh', 'New (48h)'], ['idle', 'Away 30+ days'], ['noruns', 'Never finished a run']];
const SORTS = [['seen', 'Last seen'], ['created', 'Newest'], ['wave', 'Best wave'], ['reports', 'Most reports'], ['name', 'Name']];

async function players(box) {
  if (pv.sel) return playerDetail(box, pv.sel);
  const r = await api('players?' + new URLSearchParams({ q: pv.q, filter: pv.filter, sort: pv.sort, offset: pv.offset, limit: 30 }));
  const search = h('input', { type: 'search', placeholder: 'Name, friend code or id', value: pv.q, 'aria-label': 'Search players', onkeydown: (e) => { if (e.key === 'Enter') apply(); } });
  const filter = h('select', { 'aria-label': 'Filter', value: pv.filter, onchange: apply }, FILTERS.map(([v, l]) => h('option', { value: v }, l)));
  const sort = h('select', { 'aria-label': 'Sort', value: pv.sort, onchange: apply }, SORTS.map(([v, l]) => h('option', { value: v }, l)));
  function apply() { pv.q = search.value.trim(); pv.filter = filter.value; pv.sort = sort.value; pv.offset = 0; render(); }
  put(box, h('div', { class: 'toolbar' }, search, filter, sort, h('button', { class: 'btn gold', onclick: apply }, 'Search')),
    h('div', { class: 'muted' }, `${fmt(r.total)} player${r.total === 1 ? '' : 's'}`),
    r.rows.length ? h('div', { class: 'list' }, r.rows.map((p) => h('button', { class: 'row', onclick: () => { pv.sel = p.id; render(); } },
      h('span', { class: 'who' }, h('b', {}, p.name), ' ', p.clan ? chip(p.clan, 'info') : null, ' ', statusChip(p.hidden), p.reports ? chip(`${p.reports} report${p.reports === 1 ? '' : 's'}`, 'warn') : null),
      h('span', { class: 'val' }, p.bestWave ? `wave ${p.bestWave}` : '—'),
      h('span', { class: 'meta' }, `code ${p.code} · seen ${ago(p.lastSeen)} · joined ${ago(p.created)} · ${fmt(p.runs)} run${p.runs === 1 ? '' : 's'}`)))) : empty('No players match.'),
    h('div', { class: 'pager' },
      h('button', { class: 'btn small', disabled: pv.offset === 0, onclick: () => { pv.offset = Math.max(0, pv.offset - r.limit); render(); } }, '← Previous'),
      h('span', {}, r.total ? `${pv.offset + 1}–${Math.min(r.total, pv.offset + r.rows.length)}` : '0'),
      h('button', { class: 'btn small', disabled: pv.offset + r.limit >= r.total, onclick: () => { pv.offset += r.limit; render(); } }, 'Next →')));
}

async function playerDetail(box, id) {
  let r;
  try { r = await api('player?id=' + id); } catch (e) { pv.sel = null; throw e; }
  const p = r.player, back = () => { pv.sel = null; render(); };
  const act = async (fn, done) => { if (await attempt(fn, done) !== null) render(); };
  const actions = [
    ['Rename…', async () => {
      const v = await ask({ title: 'Rename player', text: 'Leave the name empty to give them a plain default like “Commander 1234”.', ok: 'Save', fields: [
        { name: 'name', label: 'Name (up to 20 characters)', value: p.name, max: 20 }, { name: 'clearTitle', type: 'checkbox', label: 'Also remove their board title', hint: p.title ? `Currently “${p.title}”.` : 'They have none right now.' }] });
      if (v) act(() => post('player/rename', { id: p.id, ...(v.name !== p.name ? { name: v.name } : {}), clearTitle: v.clearTitle }), 'Renamed.');
    }],
    ['Message or gift…', async () => {
      const v = await ask({ title: `Send to ${p.name}`, text: 'It lands in their inbox. Renown and a title are claimed there.', ok: 'Send', fields: [
        { name: 'title', label: 'Title', max: 60, placeholder: 'A word from the keeper' }, { name: 'body', label: 'Message', type: 'textarea', max: 300 },
        { name: 'renown', label: 'Gift of Renown (0 to 500)', type: 'number', min: 0, max: 500, value: 0 }, { name: 'playerTitle', label: 'Gift a title (optional)', max: 24, hint: 'Shown on the leaderboards when equipped.' }] });
      if (v) act(() => post('player/send', { id: p.id, title: v.title, body: v.body, renown: v.renown || 0, playerTitle: v.playerTitle }), 'Sent.');
    }],
    p.hidden === 0 ? ['Hide from boards', async () => { if (await sure('Hide this player?', 'They vanish from leaderboards, the feed and friend search, but can keep playing.')) act(() => post('player/status', { id: p.id, status: 'hidden' }), 'Hidden.'); }]
      : p.hidden === 1 ? ['Show again', async () => { if (await sure('Show this player again?', 'They return to leaderboards and the feed.')) act(() => post('player/status', { id: p.id, status: 'active' }), 'Visible again.'); }] : null,
    p.hidden === 2 ? ['Reinstate…', async () => {
      const v = await ask({ title: `Reinstate ${p.name}?`, text: 'Their account works again.', ok: 'Reinstate', fields: [{ name: 'clearReports', type: 'checkbox', label: 'Also dismiss their reports', value: true }] });
      if (v) act(() => post('player/status', { id: p.id, status: 'active', clearReports: v.clearReports }), 'Reinstated.');
    }] : ['Suspend…', async () => {
      if (await sure(`Suspend ${p.name}?`, 'Every request from their device is refused with “This account has been suspended” and they disappear from boards. Their data is kept, and you can reinstate them at any time.', 'Suspend', true)) act(() => post('player/status', { id: p.id, status: 'banned' }), 'Suspended.');
    }, 'danger'],
    p.reports ? ['Dismiss reports', async () => { if (await sure('Dismiss all reports?', `Clears ${p.reports} report${p.reports === 1 ? '' : 's'} and lifts an automatic hide.`)) act(() => post('player/clear-reports', { id: p.id }), 'Reports dismissed.'); }] : null,
    r.clan ? ['Remove from clan', async () => { if (await sure(`Remove ${p.name} from ${r.clan.name}?`, 'If they lead it, the longest-standing member takes over.')) act(() => post('player/clan-kick', { id: p.id }), 'Removed from the clan.'); }] : null,
    ['Lift rate limits', async () => { const c = await attempt(() => post('player/clear-limits', { id: p.id }), null); if (c) toast(`Lifted ${c.cleared} limit${c.cleared === 1 ? '' : 's'}.`); }],
  ].filter(Boolean);
  const danger = [
    ['Wipe board entries…', async () => { if (await sure('Wipe leaderboard entries?', `${p.name} loses every leaderboard entry and their stored best wave. Runs and Realm credit stay.`, 'Wipe entries', true)) act(() => post('player/wipe', { id: p.id, scope: 'boards', confirm: true }), 'Entries wiped.'); }],
    ['Wipe all progress…', async () => {
      const v = await ask({ title: `Wipe ${p.name}'s progress?`, text: 'Removes their runs, leaderboard entries, Realm, rally, siege and clan credit. The account, friends and inbox stay.', ok: 'Wipe progress', danger: true, word: 'WIPE',
        fields: [{ name: 'undo', type: 'checkbox', label: 'Take their share back out of the weekly, monthly, rally, siege and clan totals', value: true }] });
      if (v) act(() => post('player/wipe', { id: p.id, scope: 'progress', undo: v.undo, confirm: true }), 'Progress wiped.');
    }],
    ['Delete account…', async () => {
      const v = await ask({ title: `Delete ${p.name}?`, text: 'Removes the account and everything attached to it: runs, boards, friends, messages, feed posts and clan membership. They cannot get it back, and their recovery code stops working.', ok: 'Delete forever', danger: true, word: 'DELETE',
        fields: [{ name: 'undo', type: 'checkbox', label: 'Take their share back out of the weekly, monthly, rally, siege and clan totals', value: true }] });
      if (v) { if (await attempt(() => post('player/delete', { id: p.id, undo: v.undo, confirm: true }), 'Account deleted.') !== null) back(); }
    }],
  ];
  const btn = ([label, fn, kind]) => h('button', { class: 'btn' + (kind ? ' ' + kind : ''), onclick: fn }, label);
  const best = (b) => (b.board === 'ascend' ? `ascension ${Math.floor(b.value / 1000)}, wave ${b.value % 1000}` : fmt(b.value));
  put(box, 
    h('div', {}, h('button', { class: 'btn small', onclick: back }, '← All players')),
    h('div', { class: 'card' }, h('header', {}, h('h2', {}, p.name), h('span', {}, statusChip(p.hidden), ' ', r.clan ? chip(`${r.clan.tag} · ${r.clan.name}`, 'info') : null)),
      h('dl', { class: 'kv' }, h('dt', {}, 'Id'), h('dd', {}, h('code', {}, p.id)), h('dt', {}, 'Friend code'), h('dd', {}, h('code', {}, p.code)), h('dt', {}, 'Title'), h('dd', {}, p.title || '—'),
        h('dt', {}, 'Joined'), h('dd', {}, when(p.created)), h('dt', {}, 'Last seen'), h('dd', {}, `${when(p.lastSeen)} (${ago(p.lastSeen)})`), h('dt', {}, 'Reports against'), h('dd', {}, fmt(p.reports)), h('dt', {}, 'Blocked by'), h('dd', {}, `${fmt(r.stats.blockedBy)} player${r.stats.blockedBy === 1 ? '' : 's'}`))),
    h('div', { class: 'grid' },
      ...[[r.stats.runs, 'Runs'], [p.bestWave, 'Best wave'], [r.stats.kills, 'Kills'], [r.stats.hero, 'Hero kills'], [r.stats.hours, 'Hours played'], [r.stats.siegeDamage, 'Siege damage'], [r.stats.friends, 'Friends'], [r.stats.unread, 'Unread messages']]
        .map(([n, l]) => h('div', { class: 'tile' }, h('b', {}, fmt(n)), h('span', {}, l)))),
    h('div', { class: 'card' }, h('header', {}, h('h3', {}, 'Actions')), h('div', { class: 'actions' }, actions.map(btn))),
    h('div', { class: 'card danger' }, h('header', {}, h('h3', {}, 'Removal')), h('div', { class: 'actions' }, danger.map(([l, f]) => btn([l, f, 'danger'])))),
    r.reports.length ? h('div', { class: 'card' }, h('header', {}, h('h3', {}, 'Reported by')), h('div', { class: 'list' }, r.reports.map((x) => h('div', { class: 'row' }, h('span', { class: 'who' }, x.name || 'a deleted player'), h('span', { class: 'muted' }, ago(x.created)))))) : null,
    h('div', { class: 'card' }, h('header', {}, h('h3', {}, 'Recent runs')),
      r.runs.length ? h('div', { class: 'list' }, r.runs.map((x) => h('div', { class: 'row' }, h('span', { class: 'who' }, `${x.map} · ${x.mode}${x.ascension ? ` · asc ${x.ascension}` : ''}`), h('span', { class: 'val' }, `wave ${x.wave}`), h('span', { class: 'meta' }, `${fmt(x.score)} score · ${fmt(x.kills)} kills · ${clock(x.duration)} · ${ago(x.created)}`)))) : empty('No runs yet.')),
    h('div', { class: 'card' }, h('header', {}, h('h3', {}, 'Leaderboard entries')),
      r.bests.length ? h('div', { class: 'list' }, r.bests.map((b) => h('div', { class: 'row' }, h('span', { class: 'who' }, `${b.board} · ${b.period}`), h('span', { class: 'val' }, best(b))))) : empty('None.')),
    h('div', { class: 'card' }, h('header', {}, h('h3', {}, 'Realm credit')),
      r.realm.length ? h('div', { class: 'list' }, r.realm.map((x) => h('div', { class: 'row' }, h('span', { class: 'who' }, x.period === 'all' ? 'Lifetime' : x.period), h('span', { class: 'meta' }, `${fmt(x.kills)} kills · ${fmt(x.waves)} waves · ${fmt(x.hero)} hero · ${fmt(x.runs)} runs`)))) : empty('None.')),
    r.history.length ? h('div', { class: 'card' }, h('header', {}, h('h3', {}, 'Done to this player from here')), h('div', { class: 'list' }, r.history.map(logRow))) : null);
}

// ---------------- objectives ----------------
function goalChoice(current, suggested, label = 'Goals') {
  return [
    { name: 'goals', type: 'choice', label, value: 'keep', options: [['keep', `Keep the current goals (${current})`], ['recalc', `Recalculate from last period (${suggested})`], ['custom', 'Set them myself']] },
  ];
}
async function resetPeriod(c) {
  const v = await ask({
    title: `Reset ${c.label}`, text: `${c.key.slice(2)} · lifetime totals are never touched.`, ok: 'Reset', danger: true, word: 'RESET', fields: [
      { name: 'progress', type: 'checkbox', label: 'Clear progress', hint: 'The Realm total and everyone’s share go back to zero; the boards for this period empty.', value: true },
      { name: 'claims', type: 'checkbox', label: 'Let players claim this period’s spoils again', hint: 'Clears who has already claimed. Only do this if you want to pay out twice.' },
      ...goalChoice(`${fmt(c.goal.kills)} kills · ${fmt(c.goal.waves)} waves`, `${fmt(c.suggested.kills)} kills · ${fmt(c.suggested.waves)} waves`),
      { name: 'gk', type: 'number', label: 'Kill goal', value: c.goal.kills, min: 100, when: (v) => v.goals === 'custom' },
      { name: 'gw', type: 'number', label: 'Wave goal', value: c.goal.waves, min: 1, when: (v) => v.goals === 'custom' }] });
  if (!v) return false;
  const body = { period: c.key, progress: v.progress, claims: v.claims, confirm: true };
  if (v.goals === 'recalc') body.goals = 'recalc'; else if (v.goals === 'custom') body.goals = { kills: v.gk, waves: v.gw };
  if (!body.progress && !body.claims && !body.goals) { toast('Nothing was selected.', true); return false; }
  return (await attempt(() => post('realm/reset', body), `${c.label} reset.`)) !== null;
}
function periodCard(c, title) {
  const claimed = Object.entries(c.claims).filter(([t]) => Number(t) < 50);
  return h('div', { class: 'card' }, h('header', {}, h('h3', {}, title), h('small', {}, `${c.key.slice(2)} · ${new Date(c.starts).toLocaleDateString([], { month: 'short', day: 'numeric' })} to ${new Date(c.ends - 1).toLocaleDateString([], { month: 'short', day: 'numeric' })}`)),
    bar(c.kills, c.goal.kills, { label: 'Kills', right: `${fmt(c.kills)} / ${fmt(c.goal.kills)}` }),
    bar(c.waves, c.goal.waves, { label: 'Waves held', right: `${fmt(c.waves)} / ${fmt(c.goal.waves)}` }),
    h('dl', { class: 'kv' }, h('dt', {}, 'Tiers reached'), h('dd', {}, `${c.tiers} of ${c.tierCount}`), h('dt', {}, 'Citizens who took part'), h('dd', {}, `${fmt(c.people)} (${fmt(c.eligible)} qualify for spoils)`),
      h('dt', {}, 'Spoils claimed'), h('dd', {}, claimed.length ? claimed.map(([t, n]) => `tier ${Number(t) + 1}: ${fmt(n)}`).join(' · ') : 'none yet'), h('dt', {}, 'Goal if recalculated'), h('dd', {}, `${fmt(c.suggested.kills)} kills · ${fmt(c.suggested.waves)} waves`)),
    h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: async () => { if (await resetPeriod(c)) render(); } }, 'Reset…')));
}
async function objectives(box) {
  const o = await api('objectives');
  const rl = o.rally;
  const act = async (fn, done) => { if (await attempt(fn, done) !== null) render(); };
  const rallyReset = async () => {
    const v = await ask({ title: 'Reset the Daily Rally', text: rl.day, ok: 'Reset', danger: true, word: 'RESET', fields: [
      { name: 'progress', type: 'checkbox', label: 'Clear today’s progress and re-open the rally', value: true },
      { name: 'rewards', type: 'checkbox', label: 'Pay out again', hint: 'People who were already rewarded can be rewarded a second time.' },
      { name: 'goal', type: 'choice', label: 'Goal', value: 'keep', options: [['keep', `Keep it (${fmt(rl.goal)})`], ['recalc', 'Recalculate from yesterday'], ['custom', 'Set it myself']] },
      { name: 'n', type: 'number', label: 'Kills needed', value: rl.goal, min: 100, when: (x) => x.goal === 'custom' }] });
    if (!v) return;
    const body = { day: rl.day, progress: v.progress, rewards: v.rewards, confirm: true };
    if (v.goal === 'recalc') body.goal = 'recalc'; else if (v.goal === 'custom') body.goal = v.n;
    if (!body.progress && !body.rewards && body.goal === undefined) return toast('Nothing was selected.', true);
    act(() => post('rally/reset', body), 'Rally reset.');
  };
  const s = o.siege;
  const siegeNum = async (title, label, key, value, action, max) => {
    const v = await ask({ title, ok: 'Apply', fields: [{ name: 'n', type: 'number', label, value, min: 0, max }] });
    if (v && v.n !== undefined) act(() => post('siege/update', { action, [key]: v.n, confirm: true }), 'Siege updated.');
  };
  put(box, 
    periodCard(o.week, 'Weekly Muster'), periodCard(o.month, 'Monthly Campaign'),
    h('details', { class: 'card' }, h('summary', {}, 'Last week and last month'), h('div', { class: 'stack' }, periodCard(o.prev.week, 'Previous Weekly Muster'), periodCard(o.prev.month, 'Previous Monthly Campaign'))),
    h('div', { class: 'card' }, h('header', {}, h('h3', {}, 'Daily Rally'), h('small', {}, rl.day), rl.done ? chip('Won', 'good') : null),
      bar(rl.kills, rl.goal, { label: 'Kills', right: `${fmt(rl.kills)} / ${fmt(rl.goal)}` }),
      h('dl', { class: 'kv' }, h('dt', {}, 'Fighters'), h('dd', {}, fmt(rl.people)), h('dt', {}, 'Already rewarded'), h('dd', {}, fmt(rl.rewarded)), o.rallyPrev ? [h('dt', {}, 'Yesterday'), h('dd', {}, `${fmt(o.rallyPrev.kills)} / ${fmt(o.rallyPrev.goal)}`)] : null),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: rallyReset }, 'Reset…'))),
    h('div', { class: 'card' }, h('header', {}, h('h3', {}, 'World Siege'), h('small', {}, s.name), s.defeated ? chip('Defeated', 'good') : null),
      bar(s.hp, s.maxHp, { hp: true, label: 'Health', right: `${fmt(s.hp)} / ${fmt(s.maxHp)}` }),
      h('dl', { class: 'kv' }, h('dt', {}, 'Defenders'), h('dd', {}, fmt(s.fighters)), h('dt', {}, 'Ends'), h('dd', {}, when(s.ends)), h('dt', {}, 'Top strikers'), h('dd', {}, s.top.length ? s.top.map((t) => `${t.name || 'deleted'} (${fmt(t.damage)})`).join(', ') : 'nobody yet')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: async () => { if (await sure('Restore the boss to full health?', s.defeated ? 'It was defeated; if it falls again its chest is paid out again.' : 'Defenders keep their damage credit.')) act(() => post('siege/update', { action: 'restore', confirm: true }), 'Boss restored.'); } }, 'Restore health'),
        h('button', { class: 'btn', onclick: () => siegeNum('Set boss health', `Health (0 to ${fmt(s.maxHp)})`, 'hp', s.hp, 'sethp', s.maxHp) }, 'Set health…'),
        h('button', { class: 'btn', onclick: () => siegeNum('Set maximum health', 'Maximum health', 'maxHp', s.maxHp, 'setmax') }, 'Set maximum…'),
        h('button', { class: 'btn danger', onclick: async () => { const v = await ask({ title: 'Restart the siege?', text: 'Full health and every defender’s damage credit forgotten.', ok: 'Restart', danger: true, word: 'RESTART' }); if (v) act(() => post('siege/update', { action: 'clear', confirm: true }), 'Siege restarted.'); } }, 'Restart siege…'))),
    h('div', { class: 'card' }, h('header', {}, h('h3', {}, 'Clan weekly goals'), h('small', {}, o.clans.season)),
      h('dl', { class: 'kv' }, h('dt', {}, 'Clans with progress'), h('dd', {}, fmt(o.clans.active)), h('dt', {}, 'Total kills'), h('dd', {}, fmt(o.clans.progress)), h('dt', {}, 'Chests already opened'), h('dd', {}, fmt(o.clans.rewarded))),
      h('div', { class: 'actions' }, h('button', { class: 'btn danger', onclick: async () => {
        const v = await ask({ title: 'Reset every clan’s weekly progress', text: o.clans.season, ok: 'Reset', danger: true, word: 'RESET', fields: [{ name: 'rewards', type: 'checkbox', label: 'Re-open the chests', hint: 'Clans that already earned this week’s chest can earn it again.' }] });
        if (v) act(() => post('clans/reset-weekly', { rewards: v.rewards, confirm: true }), 'Clan progress reset.');
      } }, 'Reset all clans…'))));
}

// ---------------- leaderboards ----------------
const bv = { board: 'wave', period: '' };
const BOARD_NAMES = [['wave', 'Highest wave'], ['score', 'Score'], ['daily', 'Daily'], ['hero', 'Hero kills'], ['ascend', 'Ascension']];
async function boards(box) {
  const r = await api('boards?' + new URLSearchParams({ board: bv.board, period: bv.period }));
  bv.board = r.board; bv.period = r.period;
  const val = (v) => (r.board === 'ascend' ? `asc ${Math.floor(v / 1000)} · wave ${v % 1000}` : fmt(v));
  const board = h('select', { 'aria-label': 'Board', value: r.board, onchange: () => { bv.board = board.value; bv.period = ''; render(); } }, BOARD_NAMES.map(([v, l]) => h('option', { value: v }, l)));
  const periods = r.periods.some((p) => p.period === r.period) ? r.periods : [{ period: r.period, n: 0 }, ...r.periods];
  const period = h('select', { 'aria-label': 'Period', value: r.period, onchange: () => { bv.period = period.value; render(); } }, periods.map((p) => h('option', { value: p.period }, `${p.period === 'all' ? 'All time' : p.period} (${p.n})`)));
  const act = async (fn, done) => { if (await attempt(fn, done) !== null) render(); };
  put(box, 
    h('div', { class: 'toolbar' }, board, period),
    r.rows.length ? h('div', { class: 'list' }, r.rows.map((x) => h('div', { class: 'row' },
      h('span', { class: 'who' }, `${x.rank}. `, h('b', {}, x.name || 'deleted player'), ' ', statusChip(x.hidden)), h('span', { class: 'val' }, val(x.value)),
      h('span', { class: 'actions meta' }, h('button', { class: 'btn small', onclick: () => { pv.sel = x.id; setTab('players'); } }, 'Open player'),
        h('button', { class: 'btn small danger', onclick: async () => { if (await sure('Remove this entry?', `${x.name || 'This player'}’s ${r.board} entry for ${r.period} is deleted. The player is not touched.`, 'Remove', true)) act(() => post('board/remove', { id: x.id, board: r.board, period: r.period }), 'Entry removed.'); } }, 'Remove entry'))))) : empty('Nobody is on this board yet.'),
    h('div', { class: 'card danger' }, h('header', {}, h('h3', {}, 'Reset')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn danger', onclick: async () => { const v = await ask({ title: `Reset ${r.board} · ${r.period}?`, text: 'Every entry on this board for this period is deleted.', ok: 'Reset board', danger: true, word: 'RESET' }); if (v) act(() => post('board/reset', { board: r.board, period: r.period, confirm: true }), 'Board reset.'); } }, 'Reset this board…'),
        h('button', { class: 'btn danger', onclick: async () => { const v = await ask({ title: 'Reset every leaderboard?', text: 'All boards, all weeks, all-time. Players’ stored best wave goes to zero too.', ok: 'Reset everything', danger: true, word: 'RESET ALL' }); if (v) act(() => post('board/reset', { board: '*', period: '*', confirm: true }), 'All boards reset.'); } }, 'Reset every board…'))));
}

// ---------------- stats ----------------
async function stats(box) {
  if (!state.keys.season) { try { state.keys = (await api('overview')).keys; } catch { /* the week button is simply absent */ } }
  const go = async (cfg, body, done) => {
    const v = await ask(cfg);
    if (!v) return;
    const r = await attempt(() => post('stats/reset', { ...body(v), confirm: true }), null);
    if (r) toast(`${done} (${fmt(r.removed)} record${r.removed === 1 ? '' : 's'} removed).`);
  };
  const card = (title, text, ...buttons) => h('div', { class: 'card danger' }, h('header', {}, h('h3', {}, title)), h('p', { class: 'muted' }, text), h('div', { class: 'actions' }, buttons));
  const btn = (label, fn) => h('button', { class: 'btn danger', onclick: fn }, label);
  put(box, 
    h('p', { class: 'muted' }, 'These clear statistics, not accounts. Nothing here touches players, friends, clans or messages (except where it says so).'),
    card('World Stats', 'The tower, weapon, map and foe counters on the public World Stats page.',
      state.keys.season ? btn(`This week (${state.keys.season})`, () => go({ title: 'Reset this week’s World Stats?', ok: 'Reset', danger: true, word: 'RESET' }, () => ({ what: 'world', period: state.keys.season }), 'World Stats for this week reset')) : null,
      btn('All-time counters', () => go({ title: 'Reset the all-time World Stats?', text: 'Weekly figures stay.', ok: 'Reset', danger: true, word: 'RESET' }, () => ({ what: 'world', period: 'all' }), 'All-time World Stats reset')),
      btn('Everything', () => go({ title: 'Reset all World Stats?', text: 'All-time and every week, plus run reports waiting to be counted.', ok: 'Reset', danger: true, word: 'RESET' }, () => ({ what: 'world', period: '*' }), 'World Stats reset'))),
    card('Lifetime Realm totals', 'Everyone’s all-time kills, waves and hero kills: the Chronicle’s Realm numbers and the all-time Realm board. Weekly and monthly campaigns are separate (see Objectives).',
      btn('Reset lifetime totals…', () => go({ title: 'Reset lifetime Realm totals?', ok: 'Reset', danger: true, word: 'RESET' }, () => ({ what: 'lifetime' }), 'Lifetime totals reset'))),
    card('Run history', 'Finished runs (the “recent runs” on player cards, hours played and run counts).',
      btn('Delete old runs…', () => go({ title: 'Delete old runs', text: 'Leaderboards and Realm credit are not affected.', ok: 'Delete', danger: true, word: 'DELETE', fields: [{ name: 'days', type: 'number', label: 'Older than this many days (0 deletes all runs)', value: 90, min: 0, max: 3650 }] }, (v) => ({ what: 'runs', olderThanDays: v.days || 0 }), 'Old runs deleted'))),
    card('Fresh start', 'Clears every game statistic at once: leaderboards, runs, Realm campaigns and lifetime totals, rally, siege, clan weekly progress, the feed and World Stats. Accounts, clans, friends and inboxes stay. Meant for the day you launch for real.',
      btn('Fresh start…', () => go({ title: 'Wipe every statistic?', text: 'This cannot be undone.', ok: 'Wipe it all', danger: true, word: 'FRESH START' }, () => ({ what: 'fresh' }), 'Fresh start done'))));
}

// ---------------- clans ----------------
const cv = { q: '', sel: null };
async function clans(box) {
  if (cv.sel) return clanDetail(box, cv.sel);
  const r = await api('clans?' + new URLSearchParams({ q: cv.q }));
  const search = h('input', { type: 'search', placeholder: 'Clan name, tag or code', value: cv.q, 'aria-label': 'Search clans', onkeydown: (e) => { if (e.key === 'Enter') apply(); } });
  function apply() { cv.q = search.value.trim(); render(); }
  put(box, h('div', { class: 'toolbar' }, search, h('button', { class: 'btn gold', onclick: apply }, 'Search')),
    r.rows.length ? h('div', { class: 'list' }, r.rows.map((c) => h('button', { class: 'row', onclick: () => { cv.sel = c.id; render(); } },
      h('span', { class: 'who' }, h('b', {}, c.name), ' ', chip(c.tag, 'info')), h('span', { class: 'val' }, `${c.members} member${c.members === 1 ? '' : 's'}`),
      h('span', { class: 'meta' }, `code ${c.code} · leader ${c.leaderName || '—'} · ${fmt(c.xp)} XP · founded ${ago(c.created)}`)))) : empty('No clans match.'));
}
async function clanDetail(box, id) {
  let r;
  try { r = await api('clan?id=' + id); } catch (e) { cv.sel = null; throw e; }
  const c = r.clan, back = () => { cv.sel = null; render(); };
  const act = async (fn, done) => { if (await attempt(fn, done) !== null) render(); };
  put(box, 
    h('div', {}, h('button', { class: 'btn small', onclick: back }, '← All clans')),
    h('div', { class: 'card' }, h('header', {}, h('h2', {}, c.name), chip(c.tag, 'info')),
      h('dl', { class: 'kv' }, h('dt', {}, 'Id'), h('dd', {}, h('code', {}, c.id)), h('dt', {}, 'Join code'), h('dd', {}, h('code', {}, c.code)), h('dt', {}, 'XP'), h('dd', {}, fmt(c.xp)), h('dt', {}, 'Treasury'), h('dd', {}, `${fmt(c.treasury)} Renown`),
        h('dt', {}, 'Founded'), h('dd', {}, when(c.created)), h('dt', {}, `This week (${r.weekly.season})`), h('dd', {}, `${fmt(r.weekly.progress)} kills${r.weekly.rewarded ? ' · chest opened' : ''}`)),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: async () => {
          const v = await ask({ title: 'Edit clan', ok: 'Save', fields: [{ name: 'name', label: 'Name', value: c.name, max: 24 }, { name: 'tag', label: 'Tag (2 to 4 letters or numbers)', value: c.tag, max: 4 },
            { name: 'xp', type: 'number', label: 'XP', value: c.xp, min: 0 }, { name: 'treasury', type: 'number', label: 'Treasury (Renown)', value: c.treasury, min: 0 }] });
          if (!v) return;
          const body = { id: c.id };
          if (v.name !== c.name) body.name = v.name; if (v.tag !== c.tag) body.tag = v.tag; if (v.xp !== undefined && v.xp !== c.xp) body.xp = v.xp; if (v.treasury !== undefined && v.treasury !== c.treasury) body.treasury = v.treasury;
          if (Object.keys(body).length === 1) return toast('Nothing changed.');
          act(() => post('clan/update', body), 'Clan updated.');
        } }, 'Edit…'),
        h('button', { class: 'btn', onclick: async () => { if (await sure('Reset this week’s progress?', 'Sets the clan’s weekly kills to zero. The chest is not re-opened.')) act(() => post('clans/reset-weekly', { id: c.id, confirm: true }), 'Weekly progress reset.'); } }, 'Reset weekly progress'),
        h('button', { class: 'btn danger', onclick: async () => {
          const v = await ask({ title: `Disband ${c.name}?`, text: 'Members are told and released. The clan, its XP and its treasury are deleted.', ok: 'Disband', danger: true, word: 'DISBAND' });
          if (v && await attempt(() => post('clan/disband', { id: c.id, confirm: true }), 'Clan disbanded.') !== null) back();
        } }, 'Disband…'))),
    h('div', { class: 'card' }, h('header', {}, h('h3', {}, `Members (${r.members.length})`)),
      h('div', { class: 'list' }, r.members.map((m) => h('div', { class: 'row' }, h('span', { class: 'who' }, h('b', {}, m.name), ' ', m.leader ? chip('Leader', 'warn') : null), h('span', { class: 'val' }, `${fmt(m.weekKills)} this week`),
        h('span', { class: 'actions meta' }, h('span', { class: 'muted' }, `best wave ${m.bestWave} · seen ${ago(m.lastSeen)}`),
          h('button', { class: 'btn small', onclick: () => { pv.sel = m.id; setTab('players'); } }, 'Open'),
          m.leader ? null : h('button', { class: 'btn small', onclick: async () => { if (await sure(`Make ${m.name} the leader?`, '')) act(() => post('clan/update', { id: c.id, leader: m.id }), 'Leader changed.'); } }, 'Make leader'),
          h('button', { class: 'btn small danger', onclick: async () => { if (await sure(`Remove ${m.name} from the clan?`, '', 'Remove', true)) act(() => post('player/clan-kick', { id: m.id }), 'Removed.'); } }, 'Remove')))))));
}

// ---------------- messages and feed ----------------
async function messages(box) {
  const feed = await api('feed');
  const title = h('input', { type: 'text', maxlength: 60, placeholder: 'e.g. The harvest feast begins', 'aria-label': 'Title' });
  const text = h('textarea', { maxlength: 300, placeholder: 'Message (optional)', 'aria-label': 'Message' });
  const renown = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 500, value: 0, 'aria-label': 'Renown' });
  const audience = h('select', { 'aria-label': 'Audience', value: 'week' }, [['all', 'Everyone'], ['week', 'Seen in the last 7 days'], ['day', 'Seen in the last 24 hours']].map(([v, l]) => h('option', { value: v }, l)));
  const count = h('p', { class: 'muted' }, '');
  const payload = () => ({ title: title.value, body: text.value, renown: Number(renown.value) || 0, audience: audience.value });
  const preview = async () => { const r = await attempt(() => post('broadcast', { ...payload(), dryRun: true }), null); if (r) count.textContent = `${fmt(r.recipients)} player${r.recipients === 1 ? '' : 's'} would receive it.`; return r; };
  put(box, 
    h('div', { class: 'card' }, h('header', {}, h('h3', {}, 'Broadcast to players')), h('p', { class: 'muted' }, 'Lands in each player’s inbox. Suspended players are skipped. Renown (0 to 500) can be claimed from the inbox.'),
      h('label', { class: 'field' }, h('span', {}, 'Title'), title), h('label', { class: 'field' }, h('span', {}, 'Message'), text),
      h('div', { class: 'toolbar' }, h('label', { class: 'field' }, h('span', {}, 'Gift of Renown'), renown), h('label', { class: 'field' }, h('span', {}, 'Send to'), audience)), count,
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: preview }, 'Count recipients'),
        h('button', { class: 'btn gold', onclick: async () => {
          if (title.value.trim().length < 2) return toast('Give it a title first.', true);
          const r = await preview();
          if (!r) return;
          const v = await ask({ title: `Send to ${fmt(r.recipients)} player${r.recipients === 1 ? '' : 's'}?`, text: `“${title.value.trim()}”${Number(renown.value) > 0 ? ` with ${fmt(renown.value)} Renown each` : ''}. This cannot be recalled.`, ok: 'Send' });
          if (!v) return;
          const sent = await attempt(() => post('broadcast', { ...payload(), confirm: true }), null);
          if (sent) { toast(`Sent to ${fmt(sent.recipients)}.`); title.value = ''; text.value = ''; renown.value = 0; count.textContent = ''; }
        } }, 'Send…'))),
    h('div', { class: 'card' }, h('header', {}, h('h3', {}, 'Realm feed'), h('button', { class: 'btn small danger', onclick: async () => {
      const v = await ask({ title: 'Clear the whole feed?', text: 'Every deed and cheer is deleted.', ok: 'Clear feed', danger: true, word: 'CLEAR' });
      if (v && await attempt(() => post('feed/clear', { confirm: true }), 'Feed cleared.') !== null) render();
    } }, 'Clear all…')),
    feed.rows.length ? h('div', { class: 'list' }, feed.rows.map((f) => h('div', { class: 'row' }, h('span', { class: 'who' }, f.text), h('button', { class: 'btn small danger', onclick: async () => { if (await attempt(() => post('feed/delete', { id: f.id }), 'Post deleted.') !== null) render(); } }, 'Delete'),
      h('span', { class: 'meta' }, `${f.kind} · ${f.name || 'deleted player'} · ${f.cheers} cheer${f.cheers === 1 ? '' : 's'} · ${ago(f.created)}`)))) : empty('The feed is empty.')));
}

// ---------------- upkeep ----------------
async function upkeep(box) {
  const db = await api('db');
  const total = db.tables.reduce((a, t) => a + t.rows, 0);
  const result = h('div', { class: 'muted' });
  const days = h('input', { type: 'number', inputmode: 'numeric', min: 14, value: 90, 'aria-label': 'Days away' });
  const noRuns = h('input', { type: 'checkbox', checked: true });
  const out = h('div', { class: 'list' });
  const simple = async (body, text) => { const r = await attempt(() => post('maintenance', body), null); if (r) toast(`${text} (${fmt(r.removed)} removed).`); };
  put(box, 
    h('div', { class: 'card' }, h('header', {}, h('h3', {}, 'Quick clean-ups')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => simple({ task: 'rate' }, 'Expired rate-limit rows cleared') }, 'Clear expired rate limits'),
        h('button', { class: 'btn', onclick: async () => { const v = await ask({ title: 'Delete old claimed messages', ok: 'Delete', fields: [{ name: 'days', type: 'number', label: 'Older than (days)', value: 30, min: 7 }] }); if (v) simple({ task: 'inbox', days: v.days || 30 }, 'Old messages deleted'); } }, 'Clear old messages…'),
        h('button', { class: 'btn', onclick: () => simple({ task: 'unlock' }, 'Admin lockouts cleared') }, 'Clear admin lockouts'))),
    h('div', { class: 'card danger' }, h('header', {}, h('h3', {}, 'Inactive accounts')), h('p', { class: 'muted' }, 'Finds accounts nobody has opened for a while. Suspended accounts are never included.'),
      h('div', { class: 'toolbar' }, h('label', { class: 'field' }, h('span', {}, 'Away for at least (days)'), days), h('label', { class: 'check' }, noRuns, h('span', {}, 'Only accounts that never finished a run'))),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: async () => {
        const r = await attempt(() => post('maintenance', { task: 'inactive', days: Number(days.value) || 90, noRuns: noRuns.checked, dryRun: true }), null);
        if (!r) return;
        result.textContent = `${fmt(r.matched)} account${r.matched === 1 ? '' : 's'} match.`;
        out.replaceChildren(...r.sample.map((s) => h('div', { class: 'row' }, h('span', { class: 'who' }, s.name), h('span', { class: 'muted' }, `wave ${s.bestWave} · seen ${ago(s.lastSeen)}`))));
        if (r.matched) out.append(h('div', { class: 'actions' }, h('button', { class: 'btn danger', onclick: async () => {
          const v = await ask({ title: `Delete ${fmt(r.matched)} account${r.matched === 1 ? '' : 's'}?`, text: 'They are removed with everything attached, 25 at a time. This cannot be undone.', ok: 'Delete them', danger: true, word: 'DELETE' });
          if (!v) return;
          let gone = 0;
          for (;;) {
            const x = await attempt(() => post('maintenance', { task: 'inactive', days: Number(days.value) || 90, noRuns: noRuns.checked, confirm: true }), null);
            if (!x) break;
            gone += x.deleted; result.textContent = `Deleted ${fmt(gone)}…`;
            if (!x.deleted || !x.remaining) break;
          }
          toast(`Deleted ${fmt(gone)} account${gone === 1 ? '' : 's'}.`); out.replaceChildren(); render();
        } }, 'Delete these accounts…')));
      } }, 'Find them')), result, out),
    h('div', { class: 'card' }, h('header', {}, h('h3', {}, 'Database'), h('small', {}, `${fmt(total)} rows in all`)),
      h('div', { class: 'grid' }, db.tables.map((t) => h('div', { class: 'tile' }, h('b', {}, fmt(t.rows)), h('span', {}, t.table))))));
}

// ---------------- audit ----------------
async function audit(box) {
  const r = await api('audit?limit=100');
  put(box, h('p', { class: 'muted' }, `${fmt(r.total)} entr${r.total === 1 ? 'y' : 'ies'} kept (the newest 1,000). Sign-ins and every change are recorded here; reads are not.`),
    r.rows.length ? h('div', { class: 'list' }, r.rows.map((x) => h('div', { class: 'row' }, h('span', { class: 'who' }, h('b', {}, x.action), x.target ? h('span', { class: 'muted' }, ' ' + x.target) : null), h('span', { class: 'muted', title: when(x.at) }, ago(x.at)), detailText(x.detail) ? h('span', { class: 'meta' }, detailText(x.detail)) : null))) : empty('Nothing yet.'));
}

// ---------------- go ----------------
(async function boot() {
  const saved = store.get();
  if (!saved) return showGate();
  state.key = saved;
  try { const o = await api('overview', { quiet: true }); state.reported = o.players.reported; state.keys = o.keys; start(); } catch (e) { showGate(e.status === 401 ? 'Please sign in again.' : e.message); }
})();
