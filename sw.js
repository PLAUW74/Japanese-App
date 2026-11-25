// Makes the app work offline once it has been opened online.
// Bump DATA after rebuilding the Japanese dictionary in data/ so browsers fetch it again.
// The Chinese files in data/zh/ need no bump: they are checked for changes on every load.
const SHELL = 'kotoba-shell-v3';
const DATA = 'kotoba-data-v1';
const ZH = 'kotoba-zh-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== SHELL && name !== DATA && name !== ZH) await caches.delete(name);
    }
    // Before data/zh/ had its own cache it was kept here, cache-first, and never looked at
    // again. Those copies are stale — the grammar links, an edited study plan — so drop them.
    const data = await caches.open(DATA);
    for (const request of await data.keys()) {
      if (new URL(request.url).pathname.includes('/data/zh/')) await data.delete(request);
    }
    await self.clients.claim();
  })());
});

// The Japanese dictionary is 26 MB and rarely changes: serve it from the cache when it's
// there, and fetch it again only when DATA is bumped.
async function cacheFirst(request) {
  const cache = await caches.open(DATA);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

// App files, and the Chinese data: always take the latest when online, fall back to the
// last copy offline. The Chinese files are small and do change — the study plan is meant
// to be edited by hand — so serving them cache-first would hide every change for good.
// `no-cache` makes the browser check with the server instead of reusing its own copy,
// which GitHub Pages lets it keep for 10 minutes; unchanged files come back as a quick
// "not modified".
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/data/zh/')) event.respondWith(networkFirst(event.request, ZH));
  else if (url.pathname.includes('/data/')) event.respondWith(cacheFirst(event.request));
  else event.respondWith(networkFirst(event.request, SHELL));
});
