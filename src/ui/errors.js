// v1.66 · A calm last-resort screen. A stray error must never leave a blank page: progress lives in localStorage and is safe.
import { VERSION } from '../data/balance.js';

const recent = [];
export function noteEvent(text) { recent.push(`${new Date().toISOString().slice(11, 19)} ${String(text).slice(0, 120)}`); if (recent.length > 20) recent.shift(); }

export function debugInfo(extra = {}) {
  const app = typeof window !== 'undefined' ? window.bastion : null;
  const g = app?.session?.game;
  return JSON.stringify({
    version: VERSION, where: app?.where || null, mode: g?.mode || null, seed: g?.seed || null, wave: g?.wave ?? null, map: g?.mapId || null,
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : '', recent, ...extra,
  }, null, 1);
}

let shown = false;
export function showCrash(err) {
  noteEvent('error: ' + (err?.message || err));
  if (shown || typeof document === 'undefined') return;
  shown = true;
  const info = debugInfo({ error: String(err?.stack || err?.message || err).slice(0, 600) });
  const el = document.createElement('div');
  el.className = 'crash'; el.setAttribute('role', 'alert');
  el.innerHTML = '<div class="crash-card"><h2>Something went wrong</h2><p>Your progress is safe: it is saved on this device.</p><div class="row"><button class="btn gold" data-a="reload">Reload the game</button><button class="btn" data-a="copy">Copy debug info</button><button class="btn ghost" data-a="close">Keep going</button></div></div>';
  el.addEventListener('click', async (e) => {
    const a = e.target?.dataset?.a;
    if (a === 'reload') location.reload();
    else if (a === 'copy') { try { await navigator.clipboard.writeText(info); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Could not copy'; } }
    else if (a === 'close') { el.remove(); shown = false; }
  });
  document.body.append(el);
}

// Only errors that come from the game's own code, not from extensions or cross-origin scripts.
export function installErrorBoundary() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => { if (e.filename && !e.filename.startsWith(location.origin)) return; if (!e.error && !e.message) return; showCrash(e.error || e.message); });
  window.addEventListener('unhandledrejection', (e) => { const r = e.reason; if (r && /Failed to fetch|NetworkError|AbortError|Load failed/i.test(String(r.message || r))) return; showCrash(r); });
}
