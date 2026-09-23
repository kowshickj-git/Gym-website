/**
 * Iron Core Fitness — offline shell.
 *
 * Deliberately conservative: it caches static build output and serves a cached
 * page when the network is unreachable. It never caches an authenticated HTML
 * response or an API call, because a member seeing a stale membership expiry
 * or a stale payment status would be worse than seeing nothing.
 */

const VERSION = 'v1';
const STATIC_CACHE = `ironcore-static-${VERSION}`;
const PAGE_CACHE = `ironcore-pages-${VERSION}`;
const OFFLINE_URL = '/offline';

const PRECACHE = [OFFLINE_URL, '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|avif|ico)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API traffic or auth callbacks.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // Immutable build output: cache first.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Navigations: network first, cached shell as the fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache public marketing pages; anything personalised stays live.
          if (response.ok && isPublicPath(url.pathname)) {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          return offline ?? new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        }),
    );
  }
});

function isPublicPath(pathname) {
  return ['/', '/plans', '/offers', '/about', '/contact', '/offline'].includes(pathname);
}
