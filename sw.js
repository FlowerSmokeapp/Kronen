// Budgie service worker – gør appen offline-klar.
// Ret versionsnummeret, når filerne ændres, så telefoner henter den nye version.
const CACHE = 'budgie-v9';
const FILES = ['./', './index.html', './app.html', './css/app.css', './js/config.js', './js/firebase-config.js', './js/icons.js', './js/calc.js', './js/store.js', './js/auth.js', './js/bank.js', './js/csvimport.js', './js/app.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))); self.clients.claim(); });
// Netværk først (så man altid får nyeste version), cache som reserve offline
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Firebase-biblioteket caches også, så appen kan starte offline
  const firebaseLib = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (e.request.method !== 'GET' || (url.origin !== location.origin && !firebaseLib)) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
