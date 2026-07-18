// sw-v4.js — Spawn Harvest V4 TRIAL Service Worker.
// Strictly isolated from v3: own cache name, own manifest, own HTML.
// It must never read, write, or evict anything belonging to v3, because
// v3 is the app live in collectors' hands.
const CACHE = 'spawn-harvest-v4-trial-v7';
const APP_HTML = '/VendoMonitor/harvest_v4.html';
const APP_SHELL = [
  '/VendoMonitor/harvest_v4.html',
  '/VendoMonitor/manifest-v4.json',
  // Icons are shared static assets — read-only, safe to precache.
  '/VendoMonitor/icon-192.png',
  '/VendoMonitor/icon-512.png',
];

// ── INSTALL: cache app shell ──────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      // addAll() is atomic: one 404 rejects the whole batch and the app installs
      // with an EMPTY cache — offline launch then shows nothing. Cache each file
      // independently so a missing icon costs only that icon.
      Promise.all(APP_SHELL.map(url =>
        cache.add(url).catch(err => console.warn('[sw] precache miss:', url, err && err.message))
      ))
    )
  );
});

// ── ACTIVATE: delete ONLY our own stale v4-trial caches. ───────────
// This SW was copied from sw-v3.js, where this line read
// startsWith('spawn-harvest-v3') — correct there, catastrophic here:
// v4's CACHE is 'spawn-harvest-v4-...', so the `k !== CACHE` guard
// never protected v3, and opening v4 on a phone that has v3 installed
// would wipe v3's offline cache out from under a working collector.
// v4 must never touch anything that isn't v4's.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('spawn-harvest-v4') && k !== CACHE)
          .map(k => caches.delete(k))
      )
    )
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

  // Navigation requests — network first (fresh HTML), cache fallback offline.
  //
  // ISOLATION: sw-v3 and sw-v4 both claim scope /VendoMonitor/, and only one
  // SW can control a page — last registration wins. If v4 wins on a phone that
  // also has v3, an OFFLINE v3 navigation would land here and serveAppHtml()
  // would hand back harvest_v4.html — a v3 collector silently getting v4.
  // So: only handle navigations that are actually for v4. Everything else is
  // passed straight through to the network, untouched.
  if (req.mode === 'navigate') {
    const isV4Nav = url.pathname.includes('harvest_v4');
    if (!isV4Nav) return;   // not ours — let the browser/other SW deal with it
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
