// sw.js — Spawn Harvest PWA Service Worker v15.0
const CACHE = 'spawn-harvest-v15.0';
const APP_HTML = '/VendoMonitor/harvest_v2.html';
const APP_SHELL = [
  '/VendoMonitor/harvest_v2.html',
  '/VendoMonitor/manifest.json',
];

// ── INSTALL: cache app shell ──────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL).catch(()=>{}))
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

// ── MESSAGE: allow page to trigger immediate activation ───────────
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Helper: serve the app HTML from cache, ignoring query strings ──
async function serveAppHtml(request) {
  const cache = await caches.open(CACHE);
  // Try exact, then ignore query string, then the canonical app HTML
  let hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  hit = await cache.match(APP_HTML, { ignoreSearch: true });
  if (hit) return hit;
  // Last resort: try network
  try { return await fetch(request); }
  catch (e) { return new Response('Offline — please reconnect once to install the app.', {status:503, headers:{'Content-Type':'text/html'}}); }
}

// ── FETCH ─────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Navigation requests (opening/reopening the app) — cache-first for reliability offline
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

  // App assets — network first, cache fallback (ignoreSearch so query-string busts still resolve)
  e.respondWith(
    fetch(req).then(response => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(req, clone)).catch(()=>{});
      }
      return response;
    }).catch(() =>
      caches.match(req, { ignoreSearch: true }).then(hit =>
        hit || caches.match(APP_HTML, { ignoreSearch: true })
      )
    )
  );
});
