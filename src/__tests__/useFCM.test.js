// Import mocks first to ensure they run vi.mock before component files are loaded
import {
  mockAuth,
  mockDb,
  mockDoc,
  mockSetDoc,
  mockGetDocs,
  mockDeleteDoc,
} from '../__mocks__/firebase';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/useUIStore';
import {
  isPushEnabled,
  disablePushNotifications,
  enablePushNotifications,
  useFCM,
} from '../hooks/useFCM';

// Mock firebase/messaging
const mockGetMessaging = vi.fn(() => ({ _type: 'messaging' }));
const mockGetToken = vi.fn().mockResolvedValue('mock-fcm-token');
const mockOnMessage = vi.fn(() => vi.fn()); // returns unsubscribe function

vi.mock('firebase/messaging', () => ({
  getMessaging: mockGetMessaging,
  getToken: mockGetToken,
  onMessage: mockOnMessage,
}));

describe('useFCM and helper functions', () => {
  const originalNotification = window.Notification;
  const originalServiceWorker = navigator.serviceWorker;
  const originalMode = import.meta.env.MODE;

  let mockNotificationPermission = 'default';
  let mockRequestPermission = vi.fn(async () => {
    mockNotificationPermission = 'granted';
    return 'granted';
  });

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    import.meta.env.VITE_FIREBASE_VAPID_KEY = 'test-vapid-key';
    import.meta.env.MODE = 'development';

    mockNotificationPermission = 'default';
    mockRequestPermission = vi.fn(async () => {
      mockNotificationPermission = 'granted';
      return 'granted';
    });

    class MockNotification {}
    MockNotification.requestPermission = mockRequestPermission;
    Object.defineProperty(MockNotification, 'permission', {
      get() {
        return mockNotificationPermission;
      },
      set(value) {
        mockNotificationPermission = value;
      },
      configurable: true,
    });

    Object.defineProperty(window, 'Notification', {
      value: MockNotification,
      configurable: true,
      writable: true,
    });

    // Mock Service Worker
    const mockUnregister = vi.fn().mockResolvedValue(true);
    const mockGetSubscription = vi.fn().mockResolvedValue({
      unsubscribe: vi.fn().mockResolvedValue(true),
    });
    const mockReady = {
      pushManager: {
        getSubscription: mockGetSubscription,
      },
    };
    const mockGetRegistrations = vi.fn().mockResolvedValue([
      {
        active: { scriptURL: 'https://example.com/firebase-messaging-sw.js' },
        unregister: mockUnregister,
      },
      {
        active: null,
      },
      {
        active: { scriptURL: 'other-sw.js' },
        unregister: vi.fn(),
      }
    ]);

    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistrations: mockGetRegistrations,
        ready: Promise.resolve(mockReady),
      },
      configurable: true,
      writable: true,
    });

    useAuthStore.setState({ user: { uid: 'test-user-uid' } });
    useUIStore.setState({ addToast: vi.fn() });
  });

  afterEach(() => {
    import.meta.env.MODE = originalMode;
    if (originalNotification) {
      Object.defineProperty(window, 'Notification', {
        value: originalNotification,
        configurable: true,
        writable: true,
      });
    }
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: originalServiceWorker,
        configurable: true,
        writable: true,
      });
    }
  });

  describe('isPushEnabled', () => {
    it('returns true by default when localStorage is empty', () => {
      expect(isPushEnabled()).toBe(true);
    });

    it('returns false when localStorage has false preference', () => {
      localStorage.setItem('zenkai_push_notifications_enabled', 'false');
      expect(isPushEnabled()).toBe(false);
    });

    it('returns true when localStorage has true preference', () => {
      localStorage.setItem('zenkai_push_notifications_enabled', 'true');
      expect(isPushEnabled()).toBe(true);
    });
  });

  describe('disablePushNotifications', () => {
    it('disables notifications and deletes tokens from firestore', async () => {
      mockGetDocs.mockResolvedValueOnce({
        docs: [
          { ref: 'tokenRef1' },
          { ref: 'tokenRef2' },
        ]
      });

      await disablePushNotifications('test-user-uid');

      expect(localStorage.getItem('zenkai_push_notifications_enabled')).toBe('false');
      expect(mockGetDocs).toHaveBeenCalled();
      expect(mockDeleteDoc).toHaveBeenCalledTimes(2);
    });

    it('handles errors gracefully when database fails', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockGetDocs.mockRejectedValueOnce(new Error('Firestore Error'));

      await disablePushNotifications('test-user-uid');

      expect(localStorage.getItem('zenkai_push_notifications_enabled')).toBe('false');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[FCM] Failed to delete tokens from Firestore:',
        'Firestore Error'
      );
      consoleWarnSpy.mockRestore();
    });
  });

  describe('enablePushNotifications', () => {
    it('returns early if VAPID key is missing', async () => {
      delete import.meta.env.VITE_FIREBASE_VAPID_KEY;
      const res = await enablePushNotifications('test-user-uid');
      expect(res).toBeUndefined();
    });

    it('requests permission if default and returns false if permission denied', async () => {
      mockNotificationPermission = 'default';
      mockRequestPermission.mockResolvedValueOnce('denied');

      const res = await enablePushNotifications('test-user-uid');
      expect(res).toBe(false);
      expect(mockRequestPermission).toHaveBeenCalled();
      expect(localStorage.getItem('zenkai_push_notifications_enabled')).toBe('false');
    });

    it('registers token successfully if permission granted', async () => {
      mockNotificationPermission = 'granted';
      mockGetToken.mockResolvedValueOnce('fcm-token-123');

      const res = await enablePushNotifications('test-user-uid');

      expect(res).toBe(true);
      expect(mockSetDoc).toHaveBeenCalled();
      expect(localStorage.getItem('zenkai_push_notifications_enabled')).toBe('true');
    });

    it('returns false if getToken returns null/empty token', async () => {
      mockNotificationPermission = 'granted';
      mockGetToken.mockResolvedValueOnce(null);

      const res = await enablePushNotifications('test-user-uid');

      expect(res).toBe(false);
    });

    it('handles exceptions and returns false', async () => {
      mockNotificationPermission = 'granted';
      mockGetToken.mockRejectedValueOnce(new Error('Network error getting token'));

      const res = await enablePushNotifications('test-user-uid');

      expect(res).toBe(false);
    });
  });

  describe('useFCM Hook', () => {
    it('returns early if user is not authenticated', () => {
      useAuthStore.setState({ user: null });
      renderHook(() => useFCM());
      expect(mockGetToken).not.toHaveBeenCalled();
    });

    it('returns early if Notification is not defined in window', () => {
      Object.defineProperty(window, 'Notification', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      renderHook(() => useFCM());
      expect(mockGetToken).not.toHaveBeenCalled();
    });

    it('returns early if in test mode', () => {
      import.meta.env.MODE = 'test';
      renderHook(() => useFCM());
      expect(mockGetToken).not.toHaveBeenCalled();
    });

    it('returns early if notifications are disabled in user preference', () => {
      localStorage.setItem('zenkai_push_notifications_enabled', 'false');
      renderHook(() => useFCM());
      expect(mockGetToken).not.toHaveBeenCalled();
    });

    it('registers FCM successfully, registers foreground listener, and handles message', async () => {
      let messageCallback;
      mockOnMessage.mockImplementationOnce((messaging, callback) => {
        messageCallback = callback;
        return vi.fn(); // return unsubscribe
      });

      const addToastMock = vi.fn();
      useUIStore.setState({ addToast: addToastMock });

      const { unmount } = renderHook(() => useFCM());

      // Let async functions resolve
      await vi.waitFor(() => {
        expect(mockGetToken).toHaveBeenCalled();
        expect(mockSetDoc).toHaveBeenCalled();
      });

      // Simulate foreground message
      expect(messageCallback).toBeDefined();
      messageCallback({
        notification: {
          title: 'New Workout Plan',
          body: 'Your custom plan is generated!'
        }
      });

      expect(addToastMock).toHaveBeenCalledWith('🔔 New Workout Plan: Your custom plan is generated!', 'info');

      // Unmount hook and verify unsubscribe
      unmount();
    });

    it('handles errors gracefully in background execution', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockGetToken.mockRejectedValueOnce(new Error('FCM Hook error'));

      renderHook(() => useFCM());

      await vi.waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[FCM] Initialization failed (non-fatal):',
          'FCM Hook error'
        );
      });
      consoleWarnSpy.mockRestore();
    });
  });
});
