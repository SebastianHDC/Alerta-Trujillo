/* Service worker de Alerta Trujillo.
 * - App shell: caché con actualización en segundo plano.
 * - API pública (GET /api/alerts, /api/catalog, /api/contacts, /api/guides): red primero, caché si no hay conexión.
 * - Nunca guarda respuestas privadas (sesión, perfil, evidencias, portal) ni mosaicos del mapa. */
const VERSION = 'alerta-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
const PUBLIC_API = [/^\/api\/alerts(\?|$)/, /^\/api\/catalog$/, /^\/api\/contacts$/, /^\/api\/guides$/];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (!PUBLIC_API.some((pattern) => pattern.test(url.pathname + url.search))) return;
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) { const copy = response.clone(); caches.open(VERSION).then((cache) => cache.put(request, copy)); }
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || Response.json({ detail: 'Sin conexión.' }, { status: 503 }))));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => {
    const network = fetch(request).then((response) => {
      if (response.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))) {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => cached);
    return cached || network;
  }));
});
