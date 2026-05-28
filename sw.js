// sw.js — Spawn Harvest PWA Service Worker v9.0
const CACHE = 'spawn-harvest-v9.0';
const APP_SHELL = [
  '/VendoMonitor/harvest.html',
  '/VendoMonitor/manifest.json',
];

// ── INSTALL: cache app shell ──────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL))
  );
});

// ── ACTIVATE: delete old caches ───────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Supabase API & Storage — network only, no caching
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(fetch(e.request).catch(() =>
      new Response(JSON.stringify({error:'offline'}), {
        status: 503,
        headers: {'Content-Type':'application/json'}
      })
    ));
    return;
  }

  // Google Maps, external links — network only
  if (!url.hostname.includes('spawninternet.github.io') &&
      !url.hostname.includes('localhost') &&
      !url.pathname.includes('VendoMonitor')) {
    e.respondWith(fetch(e.request).catch(() => new Response('Offline', {status:503})));
    return;
  }

  // App shell — network first, fallback to cache
  e.respondWith(
    fetch(e.request).then(response => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
      }
      return response;
    }).catch(() =>
      caches.match(e.request)
    )
  );
});
