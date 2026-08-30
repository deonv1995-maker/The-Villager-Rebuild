const SHELL_VERSION = '0.3.2-old-shell1';
const CACHE_PREFIX = 'villager-rebuild-';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith(CACHE_PREFIX))
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Match the archived Villager shell: never rewrite or replay an older game
  // module. Always request the exact file URL and bypass HTTP cache.
  event.respondWith(fetch(request, { cache: 'no-store' }));
});
