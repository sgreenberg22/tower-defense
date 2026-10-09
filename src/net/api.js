// Client for /api/*. Every call fails soft: online features vanish gracefully when the backend is missing.
import { saveProfile } from '../meta/profile.js';

const BASE = '/api';

export class Api {
  constructor(profile) {
    this.p = profile;
    this.online = null;   // null = unknown, true/false after health check
    this.reason = '';
  }

  get account() { return this.p.online; }

  async req(path, { method = 'GET', body, auth = true, timeout = 7000 } = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const headers = { 'content-type': 'application/json' };
      if (auth && this.p.online?.token) headers.authorization = 'Bearer ' + this.p.online.token;
      const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
      let data = null;
      try { data = await res.json(); } catch { data = null; }
      if (!res.ok) {
        const err = new Error(data?.error || `Request failed (${res.status})`);
        err.status = res.status; throw err;
      }
      return data;
    } finally { clearTimeout(timer); }
  }

  async health() {
    if (this.online !== null) return this.online;
    try {
      const r = await this.req('/health', { auth: false, timeout: 4000 });
      this.online = !!r?.ok && !!r.db;
      this.reason = r?.ok && !r.db ? 'The server is up but no database is connected yet.' : '';
    } catch {
      this.online = false;
      this.reason = 'Online features need the game server. Your progress is saved on this device.';
    }
    return this.online;
  }

  async ensureAccount() {
    if (!(await this.health())) return null;
    if (this.p.online?.token) return this.p.online;
    const r = await this.req('/register', { method: 'POST', body: { name: this.p.name }, auth: false });
    this.p.online = { id: r.id, token: r.token, recovery: r.recovery, friendCode: r.friendCode };
    if (r.name) this.p.name = r.name;
    saveProfile(this.p);
    return this.p.online;
  }

  async call(path, opts) {
    await this.ensureAccount();
    if (!this.online) throw new Error(this.reason || 'Offline');
    return this.req(path, opts);
  }

  recover(code) { return this.req('/recover', { method: 'POST', body: { recovery: code.trim() }, auth: false }); }
  rename(name) { return this.call('/rename', { method: 'POST', body: { name } }); }
  me() { return this.call('/me'); }
  submitRun(run) { return this.call('/runs', { method: 'POST', body: run }); }
  leaderboard(board, scope, period) { return this.call(`/leaderboard?board=${board}&scope=${scope}&period=${period}`); }
  friends() { return this.call('/friends'); }
  addFriend(code) { return this.call('/friends/add', { method: 'POST', body: { code } }); }
  removeFriend(id) { return this.call('/friends/remove', { method: 'POST', body: { id } }); }
  gift(to, kind, tower) { return this.call('/gifts', { method: 'POST', body: { to, kind, tower } }); }
  inbox() { return this.call('/inbox'); }
  claim(id) { return this.call('/inbox/claim', { method: 'POST', body: { id } }); }
  clan() { return this.call('/clan'); }
  clanSearch(q) { return this.call('/clan/search?q=' + encodeURIComponent(q)); }
  clanCreate(name, tag) { return this.call('/clan/create', { method: 'POST', body: { name, tag } }); }
  clanJoin(code) { return this.call('/clan/join', { method: 'POST', body: { code } }); }
  clanLeave() { return this.call('/clan/leave', { method: 'POST', body: {} }); }
  clanDonate(amount) { return this.call('/clan/donate', { method: 'POST', body: { amount } }); }
  siege() { return this.call('/siege'); }
  report(id) { return this.call('/report', { method: 'POST', body: { id } }); }
  block(id) { return this.call('/block', { method: 'POST', body: { id } }); }
  seasonClaim() { return this.call('/season/claim'); }
  realm() { return this.call('/realm'); }
  realmClaim(period) { return this.call('/realm/claim', { method: 'POST', body: { period } }); }
  realmBoard(period, sort) { return this.call(`/realm/board?period=${period}&sort=${sort}`); }
}

// Friend challenges travel as URL fragments so they work even without a server.
export function encodeChallenge(c) {
  const s = JSON.stringify(c);
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeChallenge(str) {
  try {
    const b = str.replace(/-/g, '+').replace(/_/g, '/');
    const c = JSON.parse(decodeURIComponent(escape(atob(b))));
    if (!c || typeof c.seed !== 'string' || typeof c.map !== 'string') return null;
    return { seed: c.seed.slice(0, 40), map: c.map, modifiers: Array.isArray(c.modifiers) ? c.modifiers.slice(0, 4) : [], ascension: c.ascension | 0, score: c.score | 0, wave: c.wave | 0, name: String(c.name || 'A friend').slice(0, 24), weapon: c.weapon };
  } catch { return null; }
}
