// Service worker: makes Logbook open with no internet.
//
// It only ever stores the app's own files (HTML, CSS, JS, icons).
// It never touches your workout data, which lives in IndexedDB.
//
// Strategy: answer from the saved copy straight away, and quietly fetch a fresh
// copy in the background. After you upload a new version to GitHub, the app
// picks it up by itself: open it once online, then close and reopen it.

const CACHE = 'logbook-shell-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/config.js',
  './js/logic.js',
  './js/exercises.js',
  './js/db.js',
  './js/store.js',
  './js/ui.js',
  './js/chart.js',
  './js/workout.js',
  './js/progress.js',
  './js/body.js',
  './js/settings.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

// Saves a copy marked "always re-check", so the browser never keeps using an old
// file on its own and every request comes back through this service worker.
async function save(cache, url, res) {
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'no-cache');
  const copy = new Response(await res.clone().blob(), { status: res.status, statusText: res.statusText, headers });
  await cache.put(url, copy);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(ASSETS.map(async (url) => {
      const res = await fetch(url, { cache: 'reload' });
      if (!res.ok) throw new Error(`Could not save ${url} for offline use`);
      await save(cache, new URL(url, self.registration.scope).href, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('logbook-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = (await cache.match(req, { ignoreSearch: true })) ||
      (req.mode === 'navigate' ? await cache.match('./index.html') : undefined);

    const refresh = fetch(req.url, { cache: 'no-cache' })
      .then(async (res) => {
        if (res && res.ok && res.type === 'basic') await save(cache, req.url.split('?')[0], res);
        return res;
      });

    if (cached) {
      event.waitUntil(refresh.catch(() => {})); // offline: keep using the saved copy
      return cached;
    }
    try {
      return await refresh;
    } catch (err) {
      return new Response('Logbook is offline and this file has not been saved yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  })());
});
