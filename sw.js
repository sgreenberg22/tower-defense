// Bastion Siege service worker (v1.66): caches the static shell so the game opens with no network. The cache name carries
// the game version, so a deploy that bumps VERSION (and this file with it) replaces the whole cache. API calls are never cached.
const VERSION = '1.68.0';
const CACHE = `bastion-shell-${VERSION}`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'index.html', 'css/style.css', 'css/polish.css', 'src/main.js', 'icons/manifest.webmanifest'])).catch(() => {}));
  // No skipWaiting here: the page decides when to switch, so a run is never reloaded under the player.
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('bastion-shell-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  // Network first, falling back to the cache: a deploy is seen at once, and offline still works.
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); } return res; }).catch(() => caches.match(r).then((m) => m || caches.match('index.html'))));
});
