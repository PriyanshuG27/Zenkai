// firebase-messaging-sw.js
// FCM Service Worker — handles background push messages from Firebase Cloud Messaging.
// This file MUST live at the root of the public directory (served at /firebase-messaging-sw.js).
// It is separate from sw.js (PWA cache worker) to keep concerns separated.

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Firebase config is inlined here because service workers cannot access import.meta.env.
// These are PUBLIC keys (safe to expose — Firebase security is enforced via Firestore rules).
firebase.initializeApp({
  apiKey: "AIzaSyAR3fj_g6G_nxtfKHl1CVera44SGGqv8Nc",
  authDomain: "fitdesi-74283.firebaseapp.com",
  projectId: "fitdesi-74283",
  storageBucket: "fitdesi-74283.firebasestorage.app",
  messagingSenderId: "878645616985",
  appId: "1:878645616985:web:f4bb46ad2f332e1917ec48",
});

const messaging = firebase.messaging();

// Handle background messages (app is closed or in a different tab)
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM SW] Background message received:', payload);

  const { title, body, icon } = payload.notification ?? {};

  self.registration.showNotification(title ?? 'Zenkai', {
    body: body ?? 'You have a new notification.',
    icon: icon ?? 'https://zenkaifit.vercel.app/logos/zenkai_official_logo.png',
    badge: 'https://zenkaifit.vercel.app/logos/zenkai_official_logo.png',
    data: payload.data ?? {},
    // Actions shown on the notification (Android/desktop only)
    actions: [
      { action: 'open', title: '📱 Open App' },
    ],
  });
});

// Handle notification click — open the app or focus existing tab
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url ?? '/home';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If an app tab is already open, focus it and navigate
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
