/**
 * firebaseConfig.js
 * Validates all required Firebase env vars at module load time.
 * Import this before firebase.js to get early, clear error messages.
 */

const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
];

const isTest = import.meta.env.MODE === 'test' || !!import.meta.env.VITEST;

if (!isTest) {
  required.forEach((key) => {
    if (!import.meta.env[key]) {
      throw new Error(
        `[Zenkai] Missing required environment variable: ${key}\n` +
          `Copy .env.example to .env and fill in your Firebase credentials.`
      );
    }
  });
}

/**
 * Validated Firebase client config.
 * All keys are VITE_ prefixed — they are intentionally public (Firebase SDK).
 * Never put secrets (API private keys, service accounts) here.
 */
export const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY || 'dummy-api-key',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'dummy-auth-domain',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID || 'dummy-project-id',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'dummy-storage-bucket',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'dummy-sender-id',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID || 'dummy-app-id',
};
