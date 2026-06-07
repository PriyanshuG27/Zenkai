const CACHE_NAME = 'fitdesi-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/icons.svg',
  '/neon_divider.svg',
  '/fitdesi_banner_v5.svg',
  '/gemini_badge_v3.svg',
];

// Install Event - cache core static resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - optimized production caching & local dev bypass
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;

  // 1. Dev Mode Caching Bypass
  // Checks if the Service Worker script itself was registered with '?dev=true'
  const isDevMode = new URL(self.location.href).searchParams.get('dev') === 'true';
  if (isDevMode) {
    // If the developer wants to test the service worker caching locally, they can append ?test-pwa=true
    if (!url.searchParams.has('test-pwa')) {
      return;
    }
  }

  // 2. Skip browser extensions and third-party database API calls (Firestore, Firebase auth, functions)
  if (
    url.host.includes('googleapis') ||
    url.host.includes('firebase') ||
    url.pathname.includes('/__/')
  ) {
    return;
  }

  // 3. Navigation requests (index.html / pages) -> Network-First
  // Always try to load the latest HTML from the network first. Fallback to cache if offline.
  // This prevents caching outdated index.html pointing to obsolete hashed asset bundles.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // 4. Static Assets (JS, CSS, Images, Fonts) -> Stale-While-Revalidate
  // Fast local load, background refresh for the next visit.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          /* Ignore background fetch failures (e.g. offline) */
        });
      
      return cachedResponse || fetchPromise;
    })
  );
});
