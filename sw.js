/* BIBLIOTECA VIRTUAL DE LA I.E.S. SAN JOSÉ DE PUNO
   Service Worker: Cache First para assets inmutables y Network First para
   documentos y /api/eventos.
*/
'use strict';

const CACHE_NAME = 'biblioteca-virtual-v2';
const RUTA_BASE = './';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './script.js',
  './config.js',
  './js/api.js',
  './js/biblioteca-ui.js',
  './js/clasificador.js',
  './js/pdf-texto.js',
  './js/tareas-ui.js',
  './vendor/pdfjs/pdf.min.js',
  './vendor/pdfjs/pdf.worker.min.js',
  './icons/icon.svg',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(STATIC_ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres
          .filter((nombre) => nombre.startsWith('biblioteca-virtual-') && nombre !== CACHE_NAME)
          .map((nombre) => caches.delete(nombre))
      ))
      .then(() => self.clients.claim())
  );
});

function esAssetEstatico(url) {
  return /\.(?:css|js|svg|png|jpe?g|webp|gif|woff2?|ico)$/i.test(url.pathname);
}

function cacheFirst(request) {
  return caches.match(request, { ignoreSearch: true }).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (!response || !response.ok || response.type !== 'basic') return response;
      const copia = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
      return response;
    });
  });
}

function networkFirst(request, fallback) {
  return fetch(request).then((response) => {
    if (response && response.ok && response.type === 'basic') {
      const copia = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
    }
    return response;
  }).catch(() => caches.match(fallback || request, { ignoreSearch: true }));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // El canal de eventos es de tiempo real: nunca se guarda en caché.
  if (url.pathname.endsWith('/api/eventos')) {
    event.respondWith(fetch(request));
    return;
  }

  // Los documentos siempre intentan venir de la red.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  if (esAssetEstatico(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // El resto de respuestas se obtiene de la red, con copia local como respaldo.
  event.respondWith(networkFirst(request));
});
