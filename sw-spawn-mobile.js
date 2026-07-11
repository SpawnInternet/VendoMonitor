const CACHE = 'spawn-mobile-v2';
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

// ---- Web Push ----
self.addEventListener('push', event => {
  let data = { title: 'Spawn Internet', body: 'New update', url: '/VendoMonitor/spawn-mobile.html' };
  try { if (event.data) data = Object.assign(data, event.data.json()); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'spawn-mobile-192.png',
      badge: 'spawn-mobile-192.png',
      data: { url: data.url },
      vibrate: [80, 40, 80]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/VendoMonitor/spawn-mobile.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if (c.url.includes('spawn-mobile') && 'focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
