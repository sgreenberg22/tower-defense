// "Add to Home Screen": the game is a full offline web app, and a player who installs it gets a full-screen game with
// its own icon. Android browsers hand the page an install prompt (beforeinstallprompt) to show when it suits; iOS Safari
// has no prompt, so there the row explains the two taps. Nothing shows once installed, or after the player declines.
import { h, modal, toast } from './dom.js';
import { saveProfile } from '../meta/profile.js';

let deferred = null;
let onChange = null;

export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || navigator.standalone === true);
export const isIos = (ua = typeof navigator !== 'undefined' ? navigator.userAgent : '', touch = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0) =>
  /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1);   // iPadOS reports itself as a Mac

export function watchInstall(app) {
  if (typeof window === 'undefined') return;
  onChange = () => { if (app.where === 'home' && !document.querySelector('.modal-back')) app.showHome(); };
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; onChange?.(); });
  window.addEventListener('appinstalled', () => {
    deferred = null; app.profile.installed = true; saveProfile(app.profile);
    toast('Bastion Siege is on your home screen.', { kind: 'ach', icon: '📲', ms: 4000 }); onChange?.();
  });
}

// Whether to offer it now: only to someone who has played a little, has not said no, and is not already in the installed app.
export function installOffer(p, { standalone = isStandalone(), ios = isIos(), prompt = !!deferred } = {}) {
  if (standalone || p.installed || p.installDismissed) return null;
  if ((p.stats?.runs || 0) < 2) return null;
  if (prompt) return 'prompt';
  return ios ? 'ios' : null;
}

async function install(app) {
  const p = app.profile;
  if (deferred) {
    const ev = deferred; deferred = null;
    try { ev.prompt(); const r = await ev.userChoice; if (r?.outcome !== 'accepted') { p.installDismissed = Date.now(); saveProfile(p); } } catch { /* the browser withdrew the prompt */ }
    onChange?.();
    return;
  }
  const m = modal([
    h('h2', { style: { marginTop: 0 } }, '📲 Add to Home Screen'),
    h('p', {}, 'Play full screen, with its own icon, even with no signal:'),
    h('ol', { class: 'install-steps' },
      h('li', {}, 'Tap the ', h('b', {}, 'Share'), ' button in Safari’s toolbar (the square with an arrow).'),
      h('li', {}, 'Scroll down and tap ', h('b', {}, 'Add to Home Screen'), '.'),
      h('li', {}, 'Open Bastion Siege from the new icon. Your progress comes with you.')),
    h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '.5rem' } },
      h('button', { class: 'btn ghost', onclick: () => { p.installDismissed = Date.now(); saveProfile(p); m.close(); onChange?.(); } }, 'Don’t show again'),
      h('button', { class: 'btn gold', onclick: () => m.close() }, 'Got it')),
  ]);
}

// The home screen's row, or null when there is nothing to offer.
export function installRow(app) {
  const kind = installOffer(app.profile);
  if (!kind) return null;
  const dismiss = h('button', { class: 'btn small ghost install-no', 'aria-label': 'Do not show this again', title: 'Do not show this again', onclick: (e) => { e.stopPropagation(); app.profile.installDismissed = Date.now(); saveProfile(app.profile); onChange?.(); } }, '✕');
  return h('div', { class: 'today-row install-row' },
    h('span', { class: 'ti' }, '📲'),
    h('button', { class: 'tt install-go', onclick: () => install(app) }, h('b', {}, 'Add to your home screen'), h('small', {}, 'Full screen, its own icon, plays offline')),
    h('span', { class: 'tv' }, dismiss));
}
