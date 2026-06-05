# FitDesi — Security Document

**Version:** 1.0  
**Date:** June 2026  
**Scope:** Full-stack — React client, Firestore, Firebase Auth, Cloud Functions, Vercel  

---

## 1. Threat Model

What we are actually protecting against, in priority order:

| Threat | Impact | Vector |
|---|---|---|
| Gemini API key exposed in client | Financial (wallet drain) | Key in VITE_ env var or bundled JS |
| User A reads User B's workout data | Privacy breach | Missing/weak Firestore security rules |
| Denial of wallet via generatePlan | Financial | Unauthenticated or looping Gemini calls |
| XSS via stored user input | Account takeover | Unsanitised exercise names or mood tags stored to Firestore |
| Auth bypass on Cloud Functions | Unauthorised AI calls | Missing auth check in callable function |
| Unauthenticated Firestore reads | Data exposure | Missing auth check in security rules |
| Replay attacks on session writes | Data corruption | Duplicate session docs |

Not in scope (MVP): DDoS, brute-force login (Firebase handles), server compromise.

---

## 2. API Key Security — Non-Negotiable Rules

### Gemini API Key
```
CORRECT:  process.env.GEMINI_API_KEY  →  Cloud Function only
WRONG:    VITE_GEMINI_API_KEY         →  Bundled into client JS, visible to anyone
```

**Enforcement:**
- Store via `firebase functions:config:set gemini.key="YOUR_KEY"` (never in a file)
- In Cloud Function: `const key = process.env.GEMINI_API_KEY`
- Never log the key: `console.log(key)` is a security incident
- Verify before every deploy: `grep -r "GEMINI" functions/src/` — must only appear in one place

### Firebase Client Config
```javascript
// This is safe — Firebase client config is NOT a secret.
// It identifies your project, not grants admin access.
// Firebase Auth + Firestore security rules are the actual access gate.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,  // OK in client
  ...
};
```

Firebase client `apiKey` is public by design. Security comes from security rules, not hiding the key.

### What NEVER goes in `.env` (client-side)
- Gemini API key
- Any third-party API key with a billing component
- Firebase Admin SDK credentials
- Anything you'd be embarrassed to see on GitHub

---

## 3. Firestore Security Rules — Test Matrix

Every rule must be tested with the Firebase Emulator before deploy. Test using `@firebase/rules-unit-testing`.

### users/{uid} collection

| Test case | Expected result |
|---|---|
| Authenticated user reads own doc | ✅ ALLOW |
| Authenticated user writes own doc | ✅ ALLOW |
| Authenticated user reads another user's doc | ❌ DENY |
| Authenticated user writes another user's doc | ❌ DENY |
| Unauthenticated read of any user doc | ❌ DENY |
| Unauthenticated write of any user doc | ❌ DENY |

### users/{uid}/sessions subcollection

| Test case | Expected result |
|---|---|
| User reads own sessions | ✅ ALLOW |
| User writes session to own subcollection | ✅ ALLOW |
| User reads another user's sessions | ❌ DENY |
| User writes to another user's sessions | ❌ DENY |

### users/{uid}/weeklyPlans subcollection

| Test case | Expected result |
|---|---|
| User reads own weeklyPlans | ✅ ALLOW |
| User writes directly to weeklyPlans | ❌ DENY (write: false — Cloud Function only via Admin SDK) |
| Admin SDK write (Cloud Function) | ✅ ALLOW (bypasses rules by design) |

### challenges collection

| Test case | Expected result |
|---|---|
| Participant reads challenge they're in | ✅ ALLOW |
| Non-participant reads a challenge | ❌ DENY |
| Participant updates their own progress | ✅ ALLOW |
| Participant updates another participant's progress | ❌ DENY (validate in update rule) |
| Anyone creates a challenge (authenticated) | ✅ ALLOW |
| Anyone deletes a challenge | ❌ DENY |

### Rules test file structure
```javascript
// tests/firestore.rules.test.js
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

describe('users collection', () => {
  it('denies reads from other users', async () => {
    const userA = testEnv.authenticatedContext('user-a');
    const userBDoc = userA.firestore().doc('users/user-b');
    await assertFails(getDoc(userBDoc));
  });
  
  it('allows owner to read own doc', async () => {
    const userA = testEnv.authenticatedContext('user-a');
    const userADoc = userA.firestore().doc('users/user-a');
    await assertSucceeds(getDoc(userADoc));
  });
  // ... all matrix cases above
});
```

---

## 4. Cloud Function Security

### generatePlan — Security Checklist

```javascript
exports.generatePlan = onCall(async (request) => {
  // ① Auth check — Firebase auto-rejects unauthenticated calls for onCall
  //    but verify explicitly anyway:
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login required');
  }
  const uid = request.auth.uid;

  // ② Rate limit — 3 calls per user per 24h
  const rateLimitDoc = await db.doc(`rateLimits/generatePlan_${uid}`).get();
  if (rateLimitDoc.exists) {
    const { count, resetAt } = rateLimitDoc.data();
    const now = Date.now();
    if (now < resetAt && count >= 3) {
      throw new HttpsError('resource-exhausted', 'Plan generation limit reached for today');
    }
  }

  // ③ Input validation — uid from auth context, not request body
  //    Never trust: request.data.uid — always use request.auth.uid

  // ④ Sanitise before passing to Gemini
  //    Truncate session data, remove any HTML/script tags

  // ⑤ Validate Gemini response before writing to Firestore
  //    If response is not valid JSON → return error, do not write

  // ⑥ Update rate limit counter
  await db.doc(`rateLimits/generatePlan_${uid}`).set({
    count: FieldValue.increment(1),
    resetAt: Date.now() + 86400000  // 24h from now
  }, { merge: true });
});
```

### Rate Limit Firestore Schema
```
rateLimits/generatePlan_{uid}
  - count: number   (calls in current window)
  - resetAt: number (unix ms timestamp of window reset)
```

Security rule for rateLimits:
```javascript
match /rateLimits/{docId} {
  allow read, write: if false;  // Cloud Function only (admin SDK)
}
```

---

## 5. Input Sanitisation Matrix

Every string written to Firestore from user input must be sanitised. Apply before every Firestore write.

| Field | Source | Max length | Sanitisation |
|---|---|---|---|
| `users.name` | Signup form | 50 chars | Strip HTML, trim whitespace |
| `sessions.moodTag` | Enum selector | — | Enum validation only: `['locked_in','average','low_energy']` |
| `exercises.name` | ExerciseSearch + custom (post-MVP) | 80 chars | Strip HTML, alphanumeric + spaces only |
| `challenges.goal` | User-defined (post-MVP) | 200 chars | Strip HTML, trim |
| All string fields | Any | — | Never eval(), never innerHTML |

### Sanitisation helper
```javascript
// src/lib/sanitise.js
export const sanitiseString = (str, maxLen = 200) => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')    // strip HTML tags
    .replace(/[<>"'&]/g, '')    // strip remaining dangerous chars
    .trim()
    .slice(0, maxLen);
};

export const validateEnum = (value, allowed) => {
  return allowed.includes(value) ? value : allowed[0];
};
```

---

## 6. Frontend Security

### Content Security Policy (vercel.json)
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com; img-src 'self' data:;"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    }
  ]
}
```

### React-specific rules
- Never use `dangerouslySetInnerHTML` — not needed anywhere in this app
- Never use `eval()` — not needed anywhere
- All user-input string values sanitised with `sanitiseString()` before state update
- No sensitive data in localStorage (Firebase Auth manages its own tokens securely)
- Zustand stores hold only runtime state — nothing persists to localStorage

---

## 7. Pre-Deploy Security Audit Checklist

Run this before every production deploy. Not optional.

### API Keys + Secrets
- [ ] `grep -r "GEMINI" src/` — must return zero results
- [ ] `grep -r "AIza" src/` — must return zero results (catches leaked Firebase admin keys)
- [ ] `.env` not committed: `git status` shows no `.env` file
- [ ] `.gitignore` includes: `.env`, `.env.local`, `functions/.env`, `functions/serviceAccountKey.json`
- [ ] Gemini key set via `firebase functions:config:set`, not hardcoded

### Firestore Security Rules
- [ ] All rules test matrix cases passing (Section 3)
- [ ] `weeklyPlans` write is `false` for client
- [ ] `rateLimits` collection is `write: false` for client
- [ ] No collection has `allow read, write: if true` anywhere

### Cloud Functions
- [ ] `request.auth` checked before any data operation
- [ ] Rate limiting implemented and tested
- [ ] Gemini response validated before Firestore write
- [ ] No console.log of sensitive data
- [ ] CORS config: only allow your Vercel domain in production

### Frontend
- [ ] `vercel.json` CSP headers in place
- [ ] No hardcoded hex API keys in any component
- [ ] `sanitiseString()` called on all user-provided strings before Firestore write
- [ ] Auth guard on all `/app/*` routes tested with logged-out user
- [ ] Onboarding guard tested: already-onboarded user sent to `/home`, not stuck in onboarding

### Vercel
- [ ] Environment variables set in Vercel dashboard (not `.env` in repo)
- [ ] Preview deployments: restrict to team only (Settings → Git → Ignored Build Step or branch protection)

---

## 8. Incident Response

If Gemini key leaks (most likely incident):
1. Immediately rotate in Google AI Studio → generate new key
2. `firebase functions:config:set gemini.key="NEW_KEY"`
3. `firebase deploy --only functions`
4. Check Google AI Studio usage dashboard for unexpected charges
5. If charges found — contact Google Cloud billing support

If Firebase Auth is compromised for a user:
1. Revoke user's refresh tokens via Firebase Admin SDK: `admin.auth().revokeRefreshTokens(uid)`
2. User is signed out of all devices immediately
