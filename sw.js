// Service Worker: hält die App-Dateien offline bereit. Daten laufen nie über den Cache
// (die liegen im lokalen Speicher bzw. in OneDrive).
const CACHE = 'bautagebuch-v5';
const SHELL = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'js/main.js', 'js/ui.js', 'js/store.js', 'js/auth.js', 'js/onedrive.js', 'js/session.js', 'js/phases.js', 'js/haus.js', 'js/haus-view.js', 'js/anim.js', 'js/actors.js', 'js/mini3d.js', 'js/config.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Netzwerk zuerst (damit Updates der App sofort ankommen), bei Offline aus dem Cache.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // Rückleitung der Anmeldung (?code=...) nie aus dem Cache bedienen
  if (url.searchParams.has('code') || url.searchParams.has('error')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
  );
});
