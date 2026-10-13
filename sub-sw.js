// sub-sw.js — Spawn Collect service worker
// Registered from subscriber.html with scope '/VendoMonitor/subscriber', which is
// more specific than Harvest's '/VendoMonitor/' scope, so Collect gets its own worker
// and Harvest's workers never answer for Collect (and this one never answers for Harvest).
//
// What it does:
//   * Saves the Collect page, manifest and icons on the phone so the app OPENS with no signal.
//   * Page: network first (fresh version when online), but gives up after 4 s on weak signal
//     and opens the saved copy instead.
//   * Never touches Supabase / gateway / login calls — the app's own queue handles those.
//   * Never reloads the page. A new version waits until the collector taps "Update".

const VERSION  = 'v4.7';
const CACHE    = 'spawn-collect-' + VERSION;
const APP_HTML = '/VendoMonitor/subscriber.html';
const SHELL = [
  APP_HTML,
  '/VendoMonitor/sub-manifest.json',
  '/VendoMonitor/icon-192.png',
  '/VendoMonitor/icon-512.png',
  '/VendoMonitor/collect-mark.png',
];
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', e => {
  // Each file cached on its own: one missing icon must not leave the app uncached.
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' }))
        .catch(err => console.warn('[sub-sw] precache miss', u, err && err.message))))
    )
  );
  // Do NOT skipWaiting here: the page decides when to switch (collector taps Update).
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k.startsWith('spawn-collect-') && k !== CACHE)   // only our own old caches
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isShell(url) {
  return SHELL.some(p => url.pathname === p);
}

async function fromCache(req) {
  const c = await caches.open(CACHE);
  return (await c.match(req, { ignoreSearch: true })) || (await c.match(APP_HTML, { ignoreSearch: true }));
}

async function navigate(req) {
  const c = await caches.open(CACHE);
  try {
    const net = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), NAV_TIMEOUT_MS)),
    ]);
    if (net && net.ok) { c.put(APP_HTML, net.clone()).catch(() => {}); return net; }
    return (await fromCache(req)) || net;
  } catch (e) {
    const hit = await fromCache(req);
    if (hit) return hit;
    return new Response(
      '<meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;padding:24px">' +
      '<h3>Spawn Collect</h3><p>No signal, and the app has not been saved on this phone yet.</p>' +
      '<p>Open it once while connected, then it will work offline.</p></body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                    // writes always go to the network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     // Supabase, gateway, fonts: not ours

  if (req.mode === 'navigate') {
    if (!url.pathname.startsWith('/VendoMonitor/subscriber')) return;   // never answer for other apps
    e.respondWith(navigate(req));
    return;
  }

  if (isShell(url)) {
    // Icons/manifest: saved copy first, refresh in the background.
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()).catch(() => {}); return r; }).catch(() => null);
      return hit || (await net) || new Response('', { status: 504 });
    })());
  }
});
