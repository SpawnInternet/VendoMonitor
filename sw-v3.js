// sw-v3.js — Spawn Harvest v3 Service Worker (separate from v2's sw.js)
const CACHE = 'spawn-harvest-v3-v10.6';
const APP_HTML = '/VendoMonitor/harvest_v3.html';
const APP_SHELL = [
  '/VendoMonitor/harvest_v3.html',
  '/VendoMonitor/manifest-v3.json',
];

// ── INSTALL: cache app shell ──────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL).catch(()=>{}))
  );
});

// ── ACTIVATE: delete old v3 caches only (leave v2's alone) ─────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('spawn-harvest-v3') && k !== CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── MESSAGE: allow page to trigger immediate activation ───────────
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Helper: serve the app HTML from cache, ignoring query strings ──
async function serveAppHtml(request) {
  const cache = await caches.open(CACHE);
  let hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  hit = await cache.match(APP_HTML, { ignoreSearch: true });
  if (hit) return hit;
  try { return await fetch(request); }
  catch (e) { return new Response('Offline — please reconnect once to install the app.', {status:503, headers:{'Content-Type':'text/html'}}); }
}

// ── FETCH ─────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Navigation requests — network first (fresh HTML), cache fallback offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(APP_HTML, clone)).catch(()=>{});
        }
        return response;
      }).catch(() => serveAppHtml(req))
    );
    return;
  }

  // Supabase API & Storage — network only, no caching
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(fetch(req).catch(() =>
      new Response(JSON.stringify({error:'offline'}), {
        status: 503,
        headers: {'Content-Type':'application/json'}
      })
    ));
    return;
  }

  // External (non-app) — network only
  if (!url.hostname.includes('spawninternet.github.io') &&
      !url.hostname.includes('localhost') &&
      !url.pathname.includes('VendoMonitor')) {
    e.respondWith(fetch(req).catch(() => new Response('Offline', {status:503})));
    return;
  }

  // App assets — network first, cache fallback.
  const isVersioned = url.search.includes('v=');
  e.respondWith(
    fetch(req).then(response => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(req, clone)).catch(()=>{});
      }
      return response;
    }).catch(() =>
      caches.match(req, { ignoreSearch: !isVersioned }).then(hit =>
        hit || caches.match(APP_HTML, { ignoreSearch: true })
      )
    )
  );
});
