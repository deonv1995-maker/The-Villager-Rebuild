const SHELL_VERSION = '0.3.2-install8';
const VILLAGER_CACHE_PREFIXES = ['villager-rebuild-pwa-', 'villager-rebuild-'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => VILLAGER_CACHE_PREFIXES.some(prefix => key.startsWith(prefix)))
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

  // Match the archived Villager service-worker behavior: do not replay a
  // cached app shell, manifest, icon, or game module. Always request the exact
  // same-origin URL and bypass HTTP cache so a deployed shell change reaches
  // Android Chrome immediately instead of being trapped behind an old shell.
  event.respondWith(fetch(request, { cache: 'no-store' }));
});
