# FitDesi — Environment Configuration

**Version:** 1.0  
**Date:** June 2026  

---

## 1. Complete Variable Registry

| Variable | Location | Who reads it | Required | What breaks if missing |
|---|---|---|---|---|
| `VITE_FIREBASE_API_KEY` | Client `.env` | Firebase client SDK | YES | App fails to initialise — white screen |
| `VITE_FIREBASE_AUTH_DOMAIN` | Client `.env` | Firebase Auth | YES | Login/signup fails |
| `VITE_FIREBASE_PROJECT_ID` | Client `.env` | Firestore client SDK | YES | All Firestore reads/writes fail |
| `VITE_FIREBASE_STORAGE_BUCKET` | Client `.env` | Firebase Storage (post-MVP) | NO | Storage uploads fail (not MVP) |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Client `.env` | Firebase Cloud Messaging | NO | Push notifications fail (post-MVP) |
| `VITE_FIREBASE_APP_ID` | Client `.env` | Firebase SDK init | YES | App fails to initialise |
| `GEMINI_API_KEY` | Cloud Functions only | `generatePlan` function | YES | Plan generation fails with 500 error |

---

## 2. Local Development Setup

### Step 1 — Create `.env` in project root
```bash
# .env (never commit this file)
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=fitdesi-xyz.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=fitdesi-xyz
VITE_FIREBASE_STORAGE_BUCKET=fitdesi-xyz.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

Get these values from: Firebase Console → Project Settings → Your apps → Web app → SDK setup and configuration.

### Step 2 — Set Gemini key in Cloud Functions
```bash
# Never put this in a file. Set via CLI only.
firebase functions:config:set gemini.key="YOUR_GEMINI_API_KEY"

# Verify it's set:
firebase functions:config:get
# Expected output: { "gemini": { "key": "AIza..." } }
```

To use in Cloud Function code:
```javascript
// functions/src/generatePlan.js
const GEMINI_KEY = process.env.GEMINI_API_KEY;
// Firebase Functions v2 (Gen 2): use process.env directly
// The key is available because firebase functions:config:set sets it
// OR: use Firebase Secret Manager for production (recommended)
```

### Step 3 — `.env` for local Functions testing
```bash
# functions/.env (only used with emulator, never deployed)
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```

### Step 4 — `.gitignore` verification
```
.env
.env.local
.env.*.local
functions/.env
functions/serviceAccountKey.json
functions/.runtimeconfig.json
```

Check: `git status` after creating `.env` — if it appears, `.gitignore` is wrong.

---

## 3. Vercel Environment Setup

Set in Vercel Dashboard → Project → Settings → Environment Variables.

| Variable | Environment | Value source |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Production + Preview | Firebase Console |
| `VITE_FIREBASE_AUTH_DOMAIN` | Production + Preview | Firebase Console |
| `VITE_FIREBASE_PROJECT_ID` | Production + Preview | Firebase Console |
| `VITE_FIREBASE_STORAGE_BUCKET` | Production + Preview | Firebase Console |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Production + Preview | Firebase Console |
| `VITE_FIREBASE_APP_ID` | Production + Preview | Firebase Console |

**Do not set `GEMINI_API_KEY` in Vercel** — it only goes in Firebase Functions config.

After setting, trigger a new Vercel deploy for variables to take effect.

---

## 4. Firebase Project Setup Checklist

```bash
# 1. Login
firebase login

# 2. Init in project root (select: Functions, Firestore, Emulators)
firebase init

# 3. Enable services in Firebase Console manually:
#    Authentication → Sign-in method → Enable: Email/Password + Google
#    Firestore → Create database → Production mode
#    Functions → Requires Blaze (pay-as-you-go) plan

# 4. Set Gemini key
firebase functions:config:set gemini.key="YOUR_KEY"

# 5. Deploy Firestore rules
firebase deploy --only firestore:rules

# 6. Deploy functions (first deploy)
firebase deploy --only functions

# 7. Deploy Firestore indexes
firebase deploy --only firestore:indexes
```

---

## 5. Secret Manager (Recommended for Production)

Firebase Secret Manager is more secure than `functions:config:set` for the Gemini key.

```bash
# Create secret
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-

# Grant Cloud Functions access
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:YOUR_PROJECT@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

```javascript
// functions/src/generatePlan.js (Secret Manager approach)
import { defineSecret } from 'firebase-functions/params';
const geminiKey = defineSecret('GEMINI_API_KEY');

export const generatePlan = onCall({ secrets: [geminiKey] }, async (request) => {
  const key = geminiKey.value();
  // use key
});
```

This is the production-grade approach. `functions:config:set` works fine for portfolio.

---

## 6. Environment Validation on Startup

Catch missing variables at startup, not at runtime.

```javascript
// src/lib/validateEnv.js
const REQUIRED_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
];

export const validateEnv = () => {
  const missing = REQUIRED_VARS.filter(v => !import.meta.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.join('\n')}\n\nCheck your .env file.`
    );
  }
};

// Call in main.jsx before rendering
validateEnv();
```

---

## 7. Key Rotation Procedure

### Rotating Gemini API Key
1. Generate new key in Google AI Studio
2. `firebase functions:config:set gemini.key="NEW_KEY"`
3. `firebase deploy --only functions`
4. Verify: trigger a plan generation manually
5. Revoke old key in Google AI Studio

### Rotating Firebase Config (if project is compromised)
Firebase client config keys are NOT secrets (see SECURITY.md Section 2). Rotation is only needed if you're migrating to a new Firebase project.
1. Create new Firebase project
2. Update all `VITE_FIREBASE_*` vars in Vercel dashboard
3. Migrate Firestore data (export → import)
4. Update `firebase.json` project ID
5. Redeploy

---

## 8. Emulator Config

```json
// firebase.json (emulators section)
{
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "functions": { "port": 5001 },
    "ui": { "enabled": true, "port": 4000 }
  }
}
```

```javascript
// src/lib/firebase.js — connect to emulators in dev
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectFunctionsEmulator(functions, 'localhost', 5001);
}
```

Add `VITE_USE_EMULATOR=true` to `.env.local` (not `.env`) for emulator development.
