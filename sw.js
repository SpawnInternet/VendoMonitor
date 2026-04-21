// Service Worker — Network First, no caching of HTML
const CACHE_VERSION = 'spawn-harvest-v6';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Delete ALL old caches
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Always go to network — no caching at all
  // This ensures collectors always get the latest harvest.html
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).catch(() => {
      // Only fall back to cache if completely offline
      return caches.match(e.request);
    })
  );
});
