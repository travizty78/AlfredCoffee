/* Service worker: caches the app shell so it opens with no connection. Bump VERSION on each release. */
const VERSION = 'af-v23';
const SHELL = ['./', './index.html', './css/app.css', './js/vendor/qrcode.js', './js/vendor/supabase.js', './js/config.js', './js/schema.js', './js/db.js', './js/sync.js', './js/app.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
  './img/locations/ak.jpg', './img/locations/ad.jpg', './img/locations/bam.jpg', './img/locations/bh.jpg', './img/locations/bw.jpg', './img/locations/bur.jpg', './img/locations/can.jpg', './img/locations/cw.jpg', './img/locations/enc.jpg', './img/locations/hp.jpg', './img/locations/kt.jpg', './img/locations/lax.jpg', './img/locations/ma.jpg', './img/locations/mdr.jpg', './img/locations/mp.jpg', './img/locations/pv.jpg', './img/locations/pa.jpg', './img/locations/pr.jpg', './img/locations/ro.jpg', './img/locations/saw.jpg', './img/locations/sl.jpg', './img/locations/tv.jpg', './img/locations/vp.jpg', './img/locations/ww.jpg', './img/locations/hq.jpg', './img/locations/wh.jpg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network-first for app files (so updates show up when online), cache fallback when offline.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
