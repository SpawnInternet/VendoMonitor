// sw-keys.js — RETIRED root-scope Spawn Keys worker (tombstone).
//
// Spawn Keys now lives at /VendoMonitor/keys/ with its own worker registered
// at the isolated scope /VendoMonitor/keys/. This file used to be registered
// at the SHARED /VendoMonitor/ scope and is still alive on keepers' phones,
// where it breaks the installed app:
//
//   * APP_HTML pointed at /VendoMonitor/spawn-keys.html, which is now just a
//     redirect stub — so an offline launch was served the stub, the stub wiped
//     the keys caches and redirected, and the app died on a blank screen.
//   * The navigation guard was indexOf('spawn-keys'), and the new path
//     /VendoMonitor/keys/spawn-keys.html CONTAINS that string, so this worker
//     claimed pages that were never its own.
//
// This version does nothing but remove itself. It must not serve, cache, or
// evict anything: harvest v3/v4, office, spawn-mobile and the dashboard all
// share this origin and the Cache Storage API is per-ORIGIN, not per-app.
const LEGACY_CACHE = 'spawn-keys-v23';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Delete ONLY this retired worker's own cache. Never a wildcard sweep:
    // an earlier revision of this file ran caches.delete() across everything
    // that wasn't its own cache and wiped harvest v3's offline shell out from
    // under a working collector.
    try { await caches.delete(LEGACY_CACHE); } catch (_) {}
    try { await self.registration.unregister(); } catch (_) {}
  })());
});

// No fetch handler at all. Every request goes straight to the network or to
// whichever worker legitimately owns that scope.
