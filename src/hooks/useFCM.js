/**
 * useFCM.js
 *
 * Custom hook to manage Firebase Cloud Messaging (FCM) Web Push Notifications.
 *
 * What it does:
 * 1. Requests browser notification permission (only once per user).
 * 2. Gets an FCM device token using the VAPID key.
 * 3. Saves the token to Firestore under users/{uid}/fcmTokens/{token}
 *    so the backend (or admin panel) can send targeted push notifications.
 * 4. Listens for foreground messages and shows them as in-app toasts.
 *
 * Usage: Call useFCM() inside a component that renders after login (e.g. App.jsx).
 */

import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/useUIStore';

const PREF_KEY = 'zenkai_push_notifications_enabled';

/**
 * Returns whether the user has push notifications enabled.
 * Defaults to true (opt-out model).
 */
export function isPushEnabled() {
  return localStorage.getItem(PREF_KEY) !== 'false';
}

/**
 * Disables push notifications for this device:
 * - Sets localStorage preference to false
 * - Deletes all FCM tokens from Firestore for this user
 */
export async function disablePushNotifications(uid) {
  localStorage.setItem(PREF_KEY, 'false');
  try {
    const { db } = await import('../lib/firebase');
    const { collection, getDocs, deleteDoc } = await import('firebase/firestore');
    const tokensSnap = await getDocs(collection(db, 'users', uid, 'fcmTokens'));
    await Promise.all(tokensSnap.docs.map((d) => deleteDoc(d.ref)));
    console.info('[FCM] Push notifications disabled — tokens deleted from Firestore.');
  } catch (err) {
    console.warn('[FCM] Failed to delete tokens from Firestore:', err.message);
  }
}

/**
 * Re-enables push notifications:
 * - Sets localStorage preference to true
 * - Re-runs FCM token registration
 */
export async function enablePushNotifications(uid, addToast) {
  localStorage.setItem(PREF_KEY, 'true');
  try {
    const { getMessaging, getToken } = await import('firebase/messaging');
    const { app, db } = await import('../lib/firebase');
    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) return;

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      localStorage.setItem(PREF_KEY, 'false');
      console.info('[FCM] Permission not granted — re-enable aborted.');
      return false;
    }

    // Use the active service worker via .ready — most reliable approach
    const swReg = await navigator.serviceWorker.ready;

    // Clear any stale push subscription before requesting a new token.
    // This fixes "push service error" caused by old subscriptions from
    // previously unregistered service workers (e.g. firebase-messaging-sw.js).
    try {
      const staleSub = await swReg.pushManager.getSubscription();
      if (staleSub) {
        await staleSub.unsubscribe();
        console.info('[FCM] Cleared stale push subscription.');
      }
    } catch (_) { /* ignore */ }

    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
    if (!token) return false;

    const tokenRef = doc(db, 'users', uid, 'fcmTokens', token);
    await setDoc(tokenRef, {
      token,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      platform: 'web',
      userAgent: navigator.userAgent.slice(0, 200),
    }, { merge: true });

    console.info('[FCM] Push notifications re-enabled — token saved.');
    return true;
  } catch (err) {
    console.warn('[FCM] Failed to re-enable push notifications:', err.message);
    return false;
  }
}

export function useFCM() {
  const user = useAuthStore((s) => s.user);
  const addToast = useUIStore((s) => s.addToast);

  useEffect(() => {
    // Only run if user is logged in and browser supports notifications
    if (!user || typeof window === 'undefined' || !('Notification' in window)) return;

    // Don't run in test environments
    if (import.meta.env.MODE === 'test') return;

    // Respect user preference — if they opted out, skip registration
    if (!isPushEnabled()) return;

    let unsubscribeForeground = null;

    async function initFCM() {
      try {
        // Dynamically import Firebase Messaging to keep it out of the main bundle
        const { getMessaging, getToken, onMessage } = await import('firebase/messaging');
        const { app } = await import('../lib/firebase');
        const { db } = await import('../lib/firebase');
        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');

        const messaging = getMessaging(app);
        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

        if (!vapidKey) {
          console.warn('[FCM] VITE_FIREBASE_VAPID_KEY is not set. Push notifications disabled.');
          return;
        }

        // Request permission if not already granted/denied
        let permission = Notification.permission;
        if (permission === 'default') {
          permission = await Notification.requestPermission();
        }

        if (permission !== 'granted') {
          console.info('[FCM] Notification permission not granted. Skipping token registration.');
          return;
        }

        // Use navigator.serviceWorker.ready — resolves to the active sw.js registration.
        // More reliable than getRegistrations() which can return stale entries.
        let swRegistration;
        try {
          swRegistration = await navigator.serviceWorker.ready;
        } catch (swErr) {
          console.warn('[FCM] Could not get service worker registration:', swErr);
          return;
        }

        // Clear any stale push subscription before requesting a fresh token
        try {
          const staleSub = await swRegistration.pushManager.getSubscription();
          if (staleSub) {
            await staleSub.unsubscribe();
            console.info('[FCM] Cleared stale push subscription.');
          }
        } catch (_) { /* ignore */ }

        // Get the FCM token
        const token = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: swRegistration,
        });

        if (!token) {
          console.warn('[FCM] No FCM token received. Push notifications may be blocked.');
          return;
        }

        // Persist token to Firestore (upsert — safe to call repeatedly)
        // Stored under users/{uid}/fcmTokens/{token} for easy multi-device support
        const tokenRef = doc(db, 'users', user.uid, 'fcmTokens', token);
        await setDoc(tokenRef, {
          token,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          platform: 'web',
          userAgent: navigator.userAgent.slice(0, 200), // truncated for storage
        }, { merge: true });

        console.info('[FCM] Token registered and saved to Firestore.');

        // Handle foreground messages — show as in-app toasts
        unsubscribeForeground = onMessage(messaging, (payload) => {
          console.log('[FCM] Foreground message:', payload);

          const title = payload.notification?.title ?? 'Zenkai';
          const body = payload.notification?.body ?? '';

          // Show as a toast in the app
          addToast(`🔔 ${title}${body ? `: ${body}` : ''}`, 'info');
        });

      } catch (err) {
        // Non-fatal — push notifications are a progressive enhancement
        console.warn('[FCM] Initialization failed (non-fatal):', err.message);
      }
    }

    initFCM();

    return () => {
      if (unsubscribeForeground) unsubscribeForeground();
    };
  }, [user?.uid, addToast]);
}
