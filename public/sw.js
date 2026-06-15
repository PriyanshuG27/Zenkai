/* global importScripts, firebase, clients */
// ─── Firebase Cloud Messaging (FCM) — Background Push Notifications ──────────
// Firebase scripts must be imported at the top of the service worker.
// This merges FCM handling into the single PWA service worker to avoid
// scope conflicts between sw.js and firebase-messaging-sw.js.
const urlParams = new URL(self.location.href).searchParams;
const enableFCM = urlParams.get('fcm') === 'true';

if (enableFCM) {
  try {
    importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

    firebase.initializeApp({
      apiKey: 'AIzaSyAR3fj_g6G_nxtfKHl1CVera44SGGqv8Nc',
      authDomain: 'fitdesi-74283.firebaseapp.com',
      projectId: 'fitdesi-74283',
      storageBucket: 'fitdesi-74283.firebasestorage.app',
      messagingSenderId: '878645616985',
      appId: '1:878645616985:web:f4bb46ad2f332e1917ec48',
    });

    const messaging = firebase.messaging();

    // Handle background messages (app closed or in a different tab)
    messaging.onBackgroundMessage((payload) => {
      const title = payload.notification?.title ?? payload.data?.title ?? 'Zenkai';
      const body = payload.notification?.body ?? payload.data?.body ?? 'You have a new notification.';
      const icon = payload.notification?.icon ?? payload.data?.icon;
      
      self.registration.showNotification(title, {
        body: body,
        icon: icon ?? 'https://zenkaifit.vercel.app/logos/zenkai_official_logo.png',
        badge: 'https://zenkaifit.vercel.app/logos/zenkai_official_logo.png',
        data: payload.data ?? {},
        actions: [{ action: 'open', title: '📱 Open App' }],
        vibrate: [300, 100, 300]
      });
    });
  } catch (e) {
    console.warn('[SW] FCM init failed (non-fatal):', e.message);
  }
}

// Handle notification click — open or focus app tab
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? '/home';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ─── PWA Cache ────────────────────────────────────────────────────────────────
const CACHE_NAME = 'zenkai-cache-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/icons.svg',
  '/neon_divider.svg',
  '/zenkai_banner_v5.svg',
  '/gemini_badge_v3.svg',
  '/logos/zenkai_official_logo.png',
  '/logos/zenkai_official_logo.webp',
  '/logos/zenkai_app_icon.webp',
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
        });

      if (cachedResponse) {
        // Run fetch in background to update cache, ignoring background errors
        fetchPromise.catch(() => {});
        return cachedResponse;
      }
      
      // No cache: return the fetch promise directly so errors propagate properly to the browser
      return fetchPromise;
    })
  );
});
