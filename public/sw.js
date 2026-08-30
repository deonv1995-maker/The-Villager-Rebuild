const SHELL_VERSION = '0.3.2-install5';
const CACHE_PREFIX = 'villager-rebuild-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}${SHELL_VERSION}`;
const SHELL_ASSETS = [
  './',
  './index.html',
  `./manifest.webmanifest?v=${SHELL_VERSION}`,
  `./icons/icon-192.png?v=${SHELL_VERSION}`,
  `./icons/icon-512.png?v=${SHELL_VERSION}`,
  `./icons/icon-maskable-512.png?v=${SHELL_VERSION}`
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
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

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          if (response?.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match('./index.html').then(cached => cached || Response.error()))
    );
    return;
  }

  const shellAsset =
    url.pathname.endsWith('/manifest.webmanifest') ||
    url.pathname.endsWith('/icons/icon-192.png') ||
    url.pathname.endsWith('/icons/icon-512.png') ||
    url.pathname.endsWith('/icons/icon-maskable-512.png');

  if (shellAsset) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(cached => cached || fetch(request))
    );
    return;
  }

  // Gameplay, terrain, Ranger, water and runtime assets stay network-fresh.
  event.respondWith(fetch(request, { cache: 'no-store' }));
});
