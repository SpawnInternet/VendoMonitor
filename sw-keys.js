const CACHE = 'spawn-keys-v1';
const SHELL = ['spawn-keys.html', 'keys-manifest.json', 'spawn-globe.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.indexOf('supabase.co') !== -1) return;
  e.respondWith(
    fetch(req).then(r => {
      if (r && r.ok && url.origin === location.origin) {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(req, cp));
      }
      return r;
    }).catch(() => caches.match(req))
  );
});
