const CACHE = 'spawn-mobile-v1';
const SHELL = ['spawn-mobile.html', 'spawn-mobile.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Never cache Supabase / gateway calls — always live
  if (url.includes('supabase.co') || url.includes('/functions/v1/')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Shell + other assets: network first, fall back to cache offline
  e.respondWith(
    fetch(e.request).then(r => {
      if (e.request.method === 'GET' && r.ok) {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return r;
    }).catch(() => caches.match(e.request))
  );
});
