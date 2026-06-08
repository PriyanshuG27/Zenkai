/**
 * notificationHelper.js
 *
 * Client-side helper for native browser notifications using Web Notification API.
 */

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

  // Check if system notifications are muted in local storage
  const isMuted = localStorage.getItem('fitdesi_mute_squad_notifications') === 'true';
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
