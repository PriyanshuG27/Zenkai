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
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { firebaseConfig } from './firebaseConfig';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, 'asia-south2');

// Connect to local emulators if running on localhost
if (window.location.hostname === 'localhost') {
  try {
    // connectFirestoreEmulator(db, 'localhost', 8080); // Disabled due to Java 21 missing
    // connectAuthEmulator(auth, 'http://localhost:9099'); // Disabled
    connectFunctionsEmulator(functions, 'localhost', 5001);
  } catch (e) {
    console.error('Firebase emulators already connected or failed:', e);
  }
}

export { app };
