# Zenkai — Security Document

**Version:** 1.1  
**Scope:** Full-stack — React client, Render Node.js Express Backend, Firestore, Firebase Auth, Vercel  

---

## 1. Threat Model

What we are protecting against, in priority order:

| Threat | Impact | Vector |
|---|---|---|
| Gemini/Groq API key exposed in client | Financial (wallet drain) | Key in VITE_ env var or bundled JS |
| User A reads User B's workout data | Privacy breach | Missing/weak Firestore security rules |
| Denial of wallet via generatePlan / verifyGymImage | Financial | Unauthenticated or looping AI calls |
| XSS via stored user input | Account takeover | Unsanitised user inputs stored to Firestore |
| Auth bypass on Backend APIs | Unauthorised AI / database actions | Missing or bypassed JWT token verification in Express |
| Unauthenticated Firestore reads | Data exposure | Missing auth check in security rules |
| Replay attacks on session writes | Data corruption | Duplicate session docs |

---

## 2. API Key Security — Non-Negotiable Rules

### Gemini & Groq API Keys
```
CORRECT:  process.env.GEMINI_API_KEY  →  Express backend environment variables (Render Dashboard)
WRONG:    VITE_GEMINI_API_KEY         →  Bundled into client JS, visible to anyone
```

**Enforcement:**
- Store via Render environment variables.
- In Express backend: `const key = process.env.GEMINI_API_KEY`.
- Never log any key: `console.log(key)` is a security incident.
- Verify before every deploy: `grep -r "GEMINI" src/` — must return zero results.

### Firebase Client Config
Firebase client keys (e.g. `apiKey`, `authDomain`) are not secrets. They identify your project, not grant admin access. Authentication and Firestore security rules are the actual access gate.

---

## 3. Firestore Security Rules — Test Matrix

Every rule must be tested with the Firebase Emulator before deploy.

### users/{uid} collection
- Authenticated user can read/write their own document.
- Users cannot read or write another user's document.

### users/{uid}/sessions subcollection
- User can read/write sessions in their own subcollection.
- Users cannot access another user's sessions.

### shared_squads/{squadCode} collection
- Members of the squad can read and update progress inside the squad.
- Non-members are denied read/write access.

---

## 4. Backend Express API Security

All backend API endpoints are secured by the `authGuard` middleware:

```javascript
// backend/middleware/authGuard.js
const { admin } = require('../lib/firebaseAdmin');

async function authGuard(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthenticated.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken; // Bind authenticated user context
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}
```

### 4.1 Endpoint Input Validation & Rate Limiting
- **Context Injection**: Use `req.user.uid` resolved from the token. Never trust UIDs passed in request bodies.
- **Transaction-Backed Rate Limiting**: Limit checks (e.g., 5 free plan updates, 5 gym image checks) are processed within a database transaction on the user's document, preventing race conditions.

---

## 5. Input Sanitisation Matrix

Every string written to Firestore from user input must be sanitised on write.

| Field | Source | Max length | Sanitisation |
|---|---|---|---|
| `users.name` | Signup form | 50 chars | Strip HTML, trim whitespace |
| `sessions.moodTag` | Enum selector | — | Enum validation: `['locked_in','average','low_energy']` |
| `exercises.name` | Quick-log text | 80 chars | Strip HTML, alphanumeric only |

---

## 6. Pre-Deploy Security Audit Checklist

Run before every production deploy:

### API Keys + Secrets
- [ ] `grep -r "GEMINI" src/` returns zero results.
- [ ] `grep -r "GROQ" src/` returns zero results.
- [ ] `grep -r "AIza" src/` returns zero results.
- [ ] `.env` files are not tracked by Git (`git status`).

### Express Backend APIs
- [ ] `authGuard` middleware applied to all endpoints.
- [ ] Rate limits transactions implemented and verified.
- [ ] CORS allowed origins locked to production Vercel domain.

---

## 7. Incident Response

### Rotating API Keys
1. Generate a new key in Google AI Studio or Groq Console.
2. Update the environment variables in the Render web service dashboard.
3. Restart Render Web Service to pick up variables.
4. Revoke old keys in respective consoles.

### User Revocation
1. Revoke user refresh tokens: `admin.auth().revokeRefreshTokens(uid)`.
2. Immediately updates token validity on next authentication check.
