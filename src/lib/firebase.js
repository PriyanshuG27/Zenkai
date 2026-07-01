/**
 * firebase.js
 * Initialises Firebase services and exports them as named singletons.
 *
 * SECURITY CONTRACT:
 * - Config values come ONLY from import.meta.env.VITE_FIREBASE_*
 * - firebaseConfig.js validates all keys at module load time
 * - GEMINI_API_KEY lives ONLY in Cloud Functions (process.env), never here
 * - This file is safe to ship in the client bundle (all keys are public by Firebase design)
 */

import { initializeApp, getApps } from 'firebase/app';
import { 
  initializeFirestore, 
  connectFirestoreEmulator, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { firebaseConfig } from './firebaseConfig';

const resolvedConfig = { ...firebaseConfig };
// Connect to local emulators ONLY if explicitly requested via environment variable or under browser automation (E2E tests)
const useEmulator = import.meta.env.VITE_FIREBASE_EMULATOR === 'true' || (typeof navigator !== 'undefined' && navigator.webdriver);

if (useEmulator) {
  if (import.meta.env.VITE_FIREBASE_PROJECT_ID) {
    resolvedConfig.projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  }
}

const app = getApps().length ? getApps()[0] : initializeApp(resolvedConfig);

// Initialize Firestore with the modern persistence cache settings (multi-tab IndexedDB cache)
export const db = initializeFirestore(app, {
  cache: typeof window !== 'undefined'
    ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    : undefined
});

export const auth = getAuth(app);

if (useEmulator) {
  try {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099');
    
    // Force localStorage persistence so Playwright E2E storageState works
    setPersistence(auth, browserLocalPersistence)
      .catch((err) => console.error('Failed to set localStorage persistence:', err));
  } catch (e) {
    console.error('Firebase emulators already connected or failed:', e);
  }
}

export { app };

