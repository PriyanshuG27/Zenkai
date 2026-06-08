const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const isEmulator = 
  process.env.VITE_FIREBASE_EMULATOR === 'true' || 
  process.env.FUNCTIONS_EMULATOR === 'true';

if (isEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  
  if (!admin.apps.length) {
    admin.initializeApp({ 
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'fitdesi-74283' 
    });
  }
} else {
  // Production / Live Online Mode
  if (!admin.apps.length) {
    const parentKeyPath = path.join(__dirname, '../../serviceAccountKey.json');
    const localKeyPath = path.join(__dirname, '../serviceAccountKey.json');
    
    if (fs.existsSync(parentKeyPath)) {
      admin.initializeApp({
        credential: admin.credential.cert(parentKeyPath)
      });
      console.log('[firebaseAdmin] Initialized Live Database using parent serviceAccountKey.json');
    } else if (fs.existsSync(localKeyPath)) {
      admin.initializeApp({
        credential: admin.credential.cert(localKeyPath)
      });
      console.log('[firebaseAdmin] Initialized Live Database using local serviceAccountKey.json');
    } else {
      // Fallback for Render.com or Google Cloud Application Default Credentials (ADC)
      const privateKey = process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined;
      
      if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
          }),
        });
        console.log('[firebaseAdmin] Initialized Live Database using environment variables');
      } else {
        // Zero-config initialization (e.g. Google Cloud Run, Functions, App Engine)
        admin.initializeApp();
        console.log('[firebaseAdmin] Initialized Live Database using Application Default Credentials (ADC)');
      }
    }
  }
}

const adminDb = admin.firestore();
const adminAuth = admin.auth();

module.exports = { admin, adminDb, adminAuth };
