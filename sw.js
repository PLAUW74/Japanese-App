// Makes the app work offline once it has been opened online.
// Bump DATA after rebuilding data/ so browsers fetch the new dictionary.
const SHELL = 'kotoba-shell-v3';
const DATA = 'kotoba-data-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== SHELL && name !== DATA) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

// The dictionary is large and rarely changes: serve it from the cache when it's there.
async function cacheFirst(request) {
  const cache = await caches.open(DATA);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

// App files: always take the latest when online, fall back to the last copy offline.
// `no-cache` makes the browser check with the server instead of reusing its own
// copy, which GitHub Pages lets it keep for 10 minutes; unchanged files come back
// as a quick "not modified".
async function networkFirst(request) {
  const cache = await caches.open(SHELL);
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
  event.respondWith(url.pathname.includes('/data/') ? cacheFirst(event.request) : networkFirst(event.request));
});
