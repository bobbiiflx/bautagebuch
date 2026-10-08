// Service Worker: hält die App-Dateien offline bereit. Daten laufen nie über den Cache
// (die liegen im lokalen Speicher bzw. in OneDrive).
const CACHE = 'bautagebuch-v66';
const LOGOS = 'bautagebuch-logos'; // Markt-Logos (Bilder fremder Server), bleiben über App-Updates erhalten
const isLogo = (u) => (u.hostname === 'www.google.com' && u.pathname.startsWith('/s2/favicons')) || u.hostname.endsWith('.gstatic.com') || u.hostname.endsWith('schulte-baustoffe.de');
const SHELL = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'js/main.js', 'js/ui.js', 'js/store.js', 'js/auth.js', 'js/onedrive.js', 'js/session.js', 'js/phases.js', 'js/icons.js',
  'js/charts.js', 'js/theme.js', 'js/weather.js', 'js/finance.js', 'js/ink.js', 'js/splash.js', 'js/backup.js', 'js/docrules.js', 'js/pdf.js', 'js/pdfimg.js', 'js/shops.js', 'js/haus.js', 'js/haus-view.js', 'js/anim.js', 'js/actors.js', 'js/mini3d.js', 'js/config.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png', 'icons/icon-maskable-512.png', 'icons/favicon-32.png', 'icons/cart.webp', 'icons/box.webp'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== LOGOS).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Netzwerk zuerst (damit Updates der App sofort ankommen), bei Offline aus dem Cache.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'GET' && url.origin !== location.origin && req.destination === 'image' && isLogo(url)) {
    e.respondWith(caches.open(LOGOS).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { c.put(req, res.clone()); return res; }))));
    return;
  }
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
