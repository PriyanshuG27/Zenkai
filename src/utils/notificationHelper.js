/**
 * notificationHelper.js
 *
 * Client-side helper for native browser notifications using Web Notification API.
 */

import { callZenkaiAPI } from '../lib/apiClient';

export const requestNotificationPermission = async () => {
  if (typeof window === 'undefined') return;
  
  if ('Notification' in window) {
    if (Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (err) {
        console.warn('[NotificationHelper] Failed to request permission:', err);
      }
    }
  }
};

export const sendBrowserNotification = (title, body) => {
  if (typeof window === 'undefined') return;

  // Don't fire native OS notification if the user is already actively viewing the tab
  if (document.visibilityState === 'visible') return;

  // Check if system notifications are muted in local storage
  const isMuted = localStorage.getItem('zenkai_mute_squad_notifications') === 'true';
  if (isMuted) return;

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico'
      });
    } catch (err) {
      console.warn('[NotificationHelper] Failed to trigger notification:', err);
    }
  }
};

/**
 * Triggers a background push notification via the FCM backend.
 *
 * @param {Object} params
 * @param {string[]} [params.recipientUids] - Specific user UIDs to receive the push.
 * @param {string} [params.squadCode] - Squad code to broadcast to (all squad members except sender).
 * @param {string} params.title - Title of the notification.
 * @param {string} params.body - Body text of the notification.
 * @param {string} [params.url] - URL to open when clicking the notification (default: /squad).
 */
export const sendPushNotification = async ({ recipientUids, squadCode, title, body, url = '/squad' }) => {
  try {
    await callZenkaiAPI('sendNotification', {
      recipientUids,
      squadCode,
      title,
      body,
      data: { url }
    });
  } catch (err) {
    console.warn('[NotificationHelper] Failed to send push notification:', err.message);
  }
};

