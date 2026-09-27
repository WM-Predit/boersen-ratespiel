const CACHE_NAME = 'boersenspiel-v10';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './fonts/outfit-variable.woff2',
  './impressum.html',
  './datenschutz.html',
];

// Beim Installieren am Browser-Cache vorbei laden (cache: 'reload'): GitHub Pages erlaubt 10 Minuten HTTP-Caching, und
// ohne 'reload' konnte so eine ALTE script.js/index.html in den neuen Cache geraten und dort bis zum nächsten Update
// bleiben (so geschehen mit der schon entfernten Broker-Werbung).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Dateien, die sich praktisch nie ändern: direkt aus dem Cache (schnell, spart Datenvolumen).
const CACHE_FIRST = /\/(fonts|icons)\/|\.(png|jpg|woff2)$/;

function putInCache(request, response) {
  // Nur erfolgreiche Antworten cachen — eine gespeicherte 404 käme sonst immer wieder statt der echten Datei.
  if (response.ok) {
    const clone = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }
  if (CACHE_FIRST.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((res) => putInCache(event.request, res)))
    );
    return;
  }
  // Alles andere (Seiten, script.js, style.css, news.json, termine.json …): network-first. Online gibt es so immer
  // sofort die aktuelle Version — früher (cache-first) sahen Wiederkehrer nach einem Update erst beim zweiten Aufruf
  // die neue Version. Offline greift die zuletzt geladene Version. 'no-cache' fragt beim Server nach (meist nur ein
  // kurzes 304), statt eine bis zu 10 Minuten alte Kopie aus dem Browser-Cache zu nehmen.
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((res) => putInCache(event.request, res))
      .catch(() => caches.match(event.request).then((cached) => {
        if (cached) return cached;
        // Offline und nicht im Cache: Seitenaufrufe (z. B. mit #challenge oder ?test) bekommen die App-Shell.
        return event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error();
      }))
  );
});
