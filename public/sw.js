'use strict';

const SHELL_CACHE = 'tshow-shell-v50';
const SHELL_FILES = [
  '/',
  '/index.html',
  '/legal.html',
  '/js/accounts.js?v=20260916-3',
  '/css/accounts.css?v=20260911-3',
  '/css/main.css?v=20260915-4',
  '/js/cloudflare-context.js?v=20260916-1',
  '/js/app.js?v=20260916-3',
  '/js/experience.js?v=20260915-3',
  '/js/media-history.mjs?v=20260915-6',
  '/js/watching-tools.mjs?v=20260915-6',
  '/manifest.webmanifest',
  '/assets/tshow-logo.png',
  '/assets/tshow-icon-192.png',
  '/assets/tshow-icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => Promise.all(SHELL_FILES.map(async (url) => {
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (!response.ok) throw new Error(`Could not cache ${url}`);
      await cache.put(url, response);
    })))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    const isAppRoute = url.pathname === '/' || url.pathname === '/index.html';
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isAppRoute && response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => isAppRoute ? caches.match('/index.html') : Response.error())
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && ['style', 'script', 'image'].includes(request.destination)) {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
