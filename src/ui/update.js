// v1.66 · Registers the service worker and shows a calm "new version" note. Never reloads by itself, and never mid-run.
import { toast, h } from './dom.js';

export function registerShell(app) {
  if (!('serviceWorker' in navigator) || !/^https:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const ready = (w) => { if (w && navigator.serviceWorker.controller) offer(app, w); };
    ready(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed') ready(w); }); });
  }).catch(() => {});
}
function offer(app, w) {
  const show = () => {
    if (app.session) return setTimeout(show, 30000);   // wait until the run is over
    const go = () => { w.postMessage('skipWaiting'); navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true }); };
    toast(h('div', { class: 'row' }, h('span', {}, 'A new version is ready.'), h('button', { class: 'btn small gold', onclick: go }, 'Reload')), { key: 'update', ms: 12000 });
  };
  show();
}
