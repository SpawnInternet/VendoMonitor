// sw-keys.js — Spawn Keys (keeper PWA) Service Worker.
//
// ISOLATION RULES — read before changing:
//  1. This SW shares an origin (spawninternet.github.io) with harvest v3/v4,
//     spawn-mobile, office, and the dashboard. The Cache Storage API is
//     per-ORIGIN, not per-app. Any cache we delete belongs to all of them.
//     The previous version of this file ran:
//         ks.filter(k => k !== CACHE).map(k => caches.delete(k))
//     which deleted EVERY cache on the origin that wasn't ours — including
//     'spawn-harvest-v3-v12.0.0'. Ailyn is both keeper and collector, so
//     opening Spawn Keys would wipe her harvest app's offline cache.
//     We now only ever delete caches whose names start with 'spawn-keys'.
//  2. Our scope is /VendoMonitor/, which the harvest SWs also claim. Only one
//     SW controls a page and the last registration wins. So we must not answer
//     navigations that aren't ours — otherwise an offline harvest launch could
//     be served spawn-keys.html.
const CACHE = 'spawn-keys-v13';
const APP_HTML = '/VendoMonitor/spawn-keys.html';
const SHELL = [
  APP_HTML,
  '/VendoMonitor/keys-manifest.json',
  '/VendoMonitor/spawn-keys-192.png',
  '/VendoMonitor/spawn-keys-512.png',
  '/VendoMonitor/spawn-keys-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll is atomic: one 404 and nothing caches at all. Cache each asset
      // individually so a single missing icon can't leave the app with no shell.
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(
        ks.filter(k => k.startsWith('spawn-keys') && k !== CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Never touch Supabase — scans and approvals must always hit the network.
  if (url.hostname.indexOf('supabase.co') !== -1) return;

  // Navigations: only handle our own. Anything else belongs to another app.
  if (req.mode === 'navigate') {
    if (url.pathname.indexOf('spawn-keys') === -1) return;
    e.respondWith(
      fetch(req)
        .then(r => {
          if (r && r.ok) {
            const cp = r.clone();
            caches.open(CACHE).then(c => c.put(APP_HTML, cp)).catch(() => {});
          }
          return r;
        })
        .catch(() => caches.match(APP_HTML).then(r => r || Response.error()))
    );
    return;
  }

  // Same-origin static assets: network first, fall back to cache offline.
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(req)
      .then(r => {
        if (r && r.ok) {
          const cp = r.clone();
          caches.open(CACHE).then(c => c.put(req, cp)).catch(() => {});
        }
        return r;
      })
      .catch(() => caches.match(req))
  );
});
