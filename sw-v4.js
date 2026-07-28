// sw-v4.js — RETIRED root-level Harvest V4 worker (tombstone).
//
// V4 now lives at /VendoMonitor/v4/ with its own worker at the directory scope
// /VendoMonitor/v4/. This file was registered at '/VendoMonitor/harvest_v4',
// a bare path prefix rather than a directory, which an installed WebAPK could
// not launch against. It exists now only to remove itself.
//
// No fetch handler: harvest v3, office, spawn-mobile, keys and the dashboard
// all share this origin, and Cache Storage is per-ORIGIN, not per-app.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    try {
      const ks = await caches.keys();
      // Only v4's own pre-move caches. Never a wildcard sweep.
      await Promise.all(
        ks.filter(k => k.startsWith('spawn-harvest-v4') && k.indexOf('folder') === -1)
          .map(k => caches.delete(k))
      );
    } catch (_) {}
    try { await self.registration.unregister(); } catch (_) {}
  })());
});
