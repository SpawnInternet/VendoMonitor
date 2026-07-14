// sw-office.js — Spawn Count PWA Service Worker v1.2
// SAFETY: Supabase requests are NEVER cached. Money figures always come from the network.
const CACHE = 'spawn-count-v1.2';
const APP_HTML = '/VendoMonitor/office.html';
const APP_SHELL = [
  '/VendoMonitor/office.html',
  '/VendoMonitor/office-manifest.json',
  '/VendoMonitor/sc-icon-192.png',
  '/VendoMonitor/sc-icon-512.png',
];

// ── INSTALL ────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL).catch(() => {}))
  );
});

// ── ACTIVATE: drop old caches ──────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── MESSAGE ────────────────────────────────────────────────────────
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Helper: serve shell offline ────────────────────────────────────
async function serveAppHtml(request) {
  const cache = await caches.open(CACHE);
  let hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  hit = await cache.match(APP_HTML, { ignoreSearch: true });
  if (hit) return hit;
  try {
    return await fetch(request);
  } catch (err) {
    return new Response(
      'Offline — reconnect once to install Spawn Count.',
      { status: 503, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

// ── FETCH ──────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Never touch non-GET (POST/PATCH counts must always hit the network)
  if (req.method !== 'GET') return;

  // Supabase (API + Storage) — NETWORK ONLY, never cached.
  // Stale reconciliation numbers would be worse than an error.
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(
      fetch(req).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Navigation — network first, cached shell as fallback
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE).then(c => c.put(APP_HTML, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => serveAppHtml(req))
    );
    return;
  }

  // Anything outside our origin/scope — network only
  if (!url.hostname.includes('spawninternet.github.io') &&
      !url.hostname.includes('localhost') &&
      !url.pathname.includes('VendoMonitor')) {
    e.respondWith(fetch(req).catch(() => new Response('Offline', { status: 503 })));
    return;
  }

  // App assets — network first, cache fallback
  const isVersioned = url.search.includes('v=');
  e.respondWith(
    fetch(req)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: !isVersioned })
          .then(hit => hit || caches.match(APP_HTML, { ignoreSearch: true }))
      )
  );
});
