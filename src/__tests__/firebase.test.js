import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Declare mocks for firebase dependencies
const mockInitializeApp = vi.fn().mockReturnValue({ _type: 'firebase-app' });
const mockGetApps = vi.fn().mockReturnValue([]);
const mockInitializeFirestore = vi.fn().mockReturnValue({ _type: 'firestore-db' });
const mockConnectFirestoreEmulator = vi.fn();
const mockPersistentLocalCache = vi.fn().mockReturnValue({ _type: 'local-cache' });
const mockPersistentMultipleTabManager = vi.fn().mockReturnValue({ _type: 'tab-manager' });
const mockGetAuth = vi.fn().mockReturnValue({ _type: 'auth-instance' });
const mockConnectAuthEmulator = vi.fn();
const mockSetPersistence = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase/app', () => ({
  initializeApp: mockInitializeApp,
  getApps: mockGetApps,
}));

vi.mock('firebase/firestore', () => ({
  initializeFirestore: mockInitializeFirestore,
  connectFirestoreEmulator: mockConnectFirestoreEmulator,
  persistentLocalCache: mockPersistentLocalCache,
  persistentMultipleTabManager: mockPersistentMultipleTabManager,
}));

vi.mock('firebase/auth', () => ({
  getAuth: mockGetAuth,
  connectAuthEmulator: mockConnectAuthEmulator,
  setPersistence: mockSetPersistence,
  browserLocalPersistence: { _type: 'local-persistence' },
}));

describe('firebase initialization module', () => {
  const originalEnvEmulator = import.meta.env.VITE_FIREBASE_EMULATOR;
  const originalProjId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const originalWebdriver = navigator.webdriver;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    import.meta.env.VITE_FIREBASE_EMULATOR = originalEnvEmulator;
    import.meta.env.VITE_FIREBASE_PROJECT_ID = originalProjId;
    Object.defineProperty(navigator, 'webdriver', {
      value: originalWebdriver,
      configurable: true,
    });
  });

  it('initializes Firebase app, auth, and firestore without emulator by default', async () => {
    import.meta.env.VITE_FIREBASE_EMULATOR = 'false';
    Object.defineProperty(navigator, 'webdriver', {
      value: false,
      configurable: true,
    });
    mockGetApps.mockReturnValue([]);

    const { db, auth, app } = await import('../lib/firebase');

    expect(mockInitializeApp).toHaveBeenCalled();
    expect(mockInitializeFirestore).toHaveBeenCalled();
    expect(mockGetAuth).toHaveBeenCalled();
    expect(mockConnectFirestoreEmulator).not.toHaveBeenCalled();
    expect(mockConnectAuthEmulator).not.toHaveBeenCalled();

    expect(db).toEqual({ _type: 'firestore-db' });
    expect(auth).toEqual({ _type: 'auth-instance' });
    expect(app).toEqual({ _type: 'firebase-app' });
  });

  it('reuses existing Firebase app if already initialized', async () => {
    mockGetApps.mockReturnValue([{ _type: 'existing-app' }]);

    const { app } = await import('../lib/firebase');

    expect(mockInitializeApp).not.toHaveBeenCalled();
    expect(app).toEqual({ _type: 'existing-app' });
  });

  it('connects to emulators when VITE_FIREBASE_EMULATOR is true', async () => {
    import.meta.env.VITE_FIREBASE_EMULATOR = 'true';
    mockGetApps.mockReturnValue([]);

    const { db, auth } = await import('../lib/firebase');

    expect(mockConnectFirestoreEmulator).toHaveBeenCalledWith(db, '127.0.0.1', 8080);
    expect(mockConnectAuthEmulator).toHaveBeenCalledWith(auth, 'http://127.0.0.1:9099');
    expect(mockSetPersistence).toHaveBeenCalledWith(auth, { _type: 'local-persistence' });
  });

  it('sets projectId to zenkai-test under webdriver automation', async () => {
    import.meta.env.VITE_FIREBASE_EMULATOR = 'true';
    import.meta.env.VITE_FIREBASE_PROJECT_ID = ''; // Clear project ID to test fallback
    Object.defineProperty(navigator, 'webdriver', {
      value: true,
      configurable: true,
    });
    mockGetApps.mockReturnValue([]);

    await import('../lib/firebase');

    const configArg = mockInitializeApp.mock.calls[0][0];
    expect(configArg.projectId).toBe('zenkai-test');
  });

  it('uses VITE_FIREBASE_PROJECT_ID under webdriver automation if provided', async () => {
    import.meta.env.VITE_FIREBASE_EMULATOR = 'true';
    import.meta.env.VITE_FIREBASE_PROJECT_ID = 'custom-project-id';
    Object.defineProperty(navigator, 'webdriver', {
      value: true,
      configurable: true,
    });
    mockGetApps.mockReturnValue([]);

    await import('../lib/firebase');

    const configArg = mockInitializeApp.mock.calls[0][0];
    expect(configArg.projectId).toBe('custom-project-id');
  });

  it('configures modern local cache settings when running in a browser environment', async () => {
    mockGetApps.mockReturnValue([]);
    
    await import('../lib/firebase');

    expect(mockInitializeFirestore).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        cache: { _type: 'local-cache' }
      })
    );
    expect(mockPersistentLocalCache).toHaveBeenCalled();
    expect(mockPersistentMultipleTabManager).toHaveBeenCalled();
  });
});
