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
import { getFirestore }           from 'firebase/firestore';
import { getAuth }                from 'firebase/auth';
import { getFunctions }           from 'firebase/functions';
import { firebaseConfig }         from './firebaseConfig'; // runs validation

// Prevent double-initialisation in hot-reload environments (Vite HMR)
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const db        = getFirestore(app);
export const auth      = getAuth(app);
export const functions = getFunctions(app, 'us-central1'); // match your deployment region
export { app };
