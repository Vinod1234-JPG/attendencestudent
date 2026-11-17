// MIT Mysore Student Attendance Tracker - Service Worker v5
// v5: stop serving stale app code. Only content-hashed files are cached now, so a new
// deployment (or a code change in dev) is always picked up. Old v4 caches are purged on activate.
const CACHE_NAME = 'mrf-attendance-shell-v5';

// Production Next.js files carry a 16-hex-character content hash in their name (e.g. page-be3c00d33fefc190.js,
// a3610d61eea90c65.css). Those never change, so they are safe to cache. Anything else, such as dev files like
// page.js, must always come from the network.
const HASHED_ASSET = /\/_next\/static\/.*[-/][0-9a-f]{16}\.(js|css)$/;
const PRECACHE_URLS = [
  '/',
  '/kiosk',
  '/kiosk/ready',
  '/offline',
  '/manifest.json',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        // Use allSettled so individual missing assets never crash service worker install
        await Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn('[SW] Precache item failed:', url, err);
            })
          )
        );
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      // Purge all old caches (v1, v2, v3, etc.)
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          console.log('[SW] Purging old cache:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // STRICTLY BYPASS:
  // 1. All Admin routes (/admin/*)
  // 2. All API routes (/api/*)
  // 3. All Auth routes (/auth/*)
  // 4. Supabase cloud endpoints
  // 5. Next.js App Router RSC data payloads (_rsc, RSC header, Next-Router headers)
  // 6. Any non-GET request
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/auth') ||
    url.hostname.includes('supabase.co') ||
    url.searchParams.has('_rsc') ||
    request.headers.get('RSC') === '1' ||
    request.headers.get('Next-Router-State-Tree') ||
    request.headers.get('Next-Router-Prefetch')
  ) {
    return; // Pass through to network with 0 overhead and 0 caching
  }

  // Handle KIOSK offline navigation
  if (request.mode === 'navigate') {
    if (url.pathname.startsWith('/kiosk') || url.pathname === '/' || url.pathname === '/offline') {
      event.respondWith(
        fetch(request).catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          return caches.match('/offline') || caches.match('/kiosk');
        })
      );
    }
    return;
  }

  // Only cache immutable assets: content-hashed _next/static files, favicon, manifest.
  // Non-hashed _next/static files fall through to the network on purpose (see HASHED_ASSET).
  if (
    HASHED_ASSET.test(url.pathname) ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        });
      })
    );
  }
});
