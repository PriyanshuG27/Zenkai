# FitDesi — Error Handling Document

**Version:** 1.0  
**Date:** June 2026  

---

## 1. Error Taxonomy

Every error in FitDesi falls into one of five buckets:

| Bucket | Source | Recovery |
|---|---|---|
| **AUTH** | Firebase Auth | Redirect to login or show inline message |
| **FIRESTORE** | Firestore read/write | Toast + retry or graceful degradation |
| **CLOUD_FUNCTION** | generatePlan callable | Show plan error state + retry button |
| **GEMINI** | AI plan generation | Fallback to last plan + retry |
| **NETWORK** | Client offline | Optimistic UI for writes, skeleton for reads |

---

## 2. Error Codes Per Module

Define these as constants. Never use raw strings for error types.

```javascript
// src/lib/errors.js
export const ERROR_CODES = {
  // Auth
  AUTH_INVALID_CREDENTIAL: 'auth/invalid-credential',
  AUTH_EMAIL_IN_USE:        'auth/email-already-in-use',
  AUTH_WEAK_PASSWORD:       'auth/weak-password',
  AUTH_USER_NOT_FOUND:      'auth/user-not-found',
  AUTH_TOKEN_EXPIRED:       'auth/id-token-expired',

  // Firestore
  FS_PERMISSION_DENIED:     'firestore/permission-denied',
  FS_UNAVAILABLE:           'firestore/unavailable',
  FS_NOT_FOUND:             'firestore/not-found',
  FS_WRITE_FAILED:          'firestore/write-failed',

  // Cloud Functions
  CF_UNAUTHENTICATED:       'functions/unauthenticated',
  CF_RATE_LIMITED:          'functions/resource-exhausted',
  CF_INTERNAL:              'functions/internal',
  CF_INVALID_ARGUMENT:      'functions/invalid-argument',

  // Gemini (returned from Cloud Function)
  GEMINI_PARSE_FAILED:      'gemini/parse-failed',
  GEMINI_API_DOWN:          'gemini/api-down',

  // App-specific
  SESSION_EMPTY:            'app/session-no-exercises',
  PLAN_STALE:               'app/plan-stale',
};
```

---

## 3. User-Facing Error Messages

Specific and actionable. Never "Something went wrong."

```javascript
// src/lib/errors.js
export const USER_MESSAGES = {
  [ERROR_CODES.AUTH_INVALID_CREDENTIAL]: 'Email or password is incorrect.',
  [ERROR_CODES.AUTH_EMAIL_IN_USE]:       'An account with this email already exists. Try logging in.',
  [ERROR_CODES.AUTH_WEAK_PASSWORD]:      'Password must be at least 8 characters.',
  [ERROR_CODES.AUTH_USER_NOT_FOUND]:     'No account found with this email.',
  [ERROR_CODES.AUTH_TOKEN_EXPIRED]:      'Your session expired. Logging you back in…',

  [ERROR_CODES.FS_PERMISSION_DENIED]:    'Access denied. Try logging out and back in.',
  [ERROR_CODES.FS_UNAVAILABLE]:          'FitDesi is having trouble connecting. Check your internet.',
  [ERROR_CODES.FS_WRITE_FAILED]:         "Couldn't save your session. Tap retry to try again.",

  [ERROR_CODES.CF_RATE_LIMITED]:         "You've generated 3 plans today. Come back tomorrow for a new one.",
  [ERROR_CODES.CF_UNAUTHENTICATED]:      'Please log in to generate a plan.',
  [ERROR_CODES.CF_INTERNAL]:             "Plan generation failed. Your last plan is still active.",

  [ERROR_CODES.GEMINI_PARSE_FAILED]:     "Couldn't build your plan this time. Try again in a moment.",
  [ERROR_CODES.GEMINI_API_DOWN]:         "AI plan generation is temporarily unavailable. Your last plan is still active.",

  [ERROR_CODES.SESSION_EMPTY]:           'Add at least one exercise before finishing your session.',
};

export const getErrorMessage = (code) =>
  USER_MESSAGES[code] ?? "Something didn't work. Please try again.";
```

---

## 4. Error Handling Per Hook

### useAuth
```javascript
const login = async (email, password) => {
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    // Firebase error codes map directly to our ERROR_CODES
    const msg = getErrorMessage(err.code);
    setError(msg);  // local state — shows inline under form field
  }
};
```

**Never:** Show raw Firebase error messages to users (they contain internal details).

### useWorkoutLogger — Session Write
```javascript
const finishSession = async () => {
  if (exercises.length === 0) {
    toast.error(getErrorMessage(ERROR_CODES.SESSION_EMPTY));
    return;
  }

  setIsSubmitting(true);
  try {
    const batch = writeBatch(db);
    // ... build batch
    await batch.commit();
    navigate('/workout/complete');
  } catch (err) {
    // Batch failed — show retry, do NOT navigate away
    setSubmitError(getErrorMessage(ERROR_CODES.FS_WRITE_FAILED));
    // Log for debugging (not in production)
    if (import.meta.env.DEV) console.error('[finishSession]', err);
  } finally {
    setIsSubmitting(false);
  }
};
```

**Critical:** On batch write failure, keep the user on the logger screen with their data intact. Never lose a logged workout silently.

### useWeeklyPlan — Gemini Plan Generation
```javascript
const generatePlan = async () => {
  setPlanLoading(true);
  setPlanError(null);

  try {
    const result = await callGeneratePlan();  // httpsCallable
    if (!result.data.success) throw new Error(result.data.error);
    await fetchPlan();  // refresh from Firestore
  } catch (err) {
    const code = err.code ?? GEMINI_API_DOWN;
    setPlanError(getErrorMessage(code));
    // Do NOT clear existing plan — show last plan + error banner
  } finally {
    setPlanLoading(false);
  }
};
```

**Recovery rule:** Gemini failure → last known plan stays visible. Error banner shows above it with retry button.

---

## 5. React Error Boundary

Catches unexpected JS errors that escape hook-level handling.

```javascript
// src/components/ErrorBoundary.jsx
import { Component } from 'react';

export class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to error tracking service (post-MVP: Sentry)
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text)' }}>
          <h2 style={{ fontFamily: 'Barlow Condensed', fontSize: '28px' }}>
            Something broke
          </h2>
          <p style={{ color: 'var(--text2)', marginBottom: '24px' }}>
            {import.meta.env.DEV ? this.state.error?.message : 'Restart the app to continue.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: 'var(--primary)', color: 'white', padding: '12px 24px', borderRadius: '8px', border: 'none' }}
          >
            Restart
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Usage in App.jsx
// <ErrorBoundary><AppShell /></ErrorBoundary>
```

---

## 6. Error UI Patterns

### Inline form error (Auth screens)
```jsx
{error && (
  <p role="alert" style={{ color: 'var(--destructive)', fontSize: '13px', marginTop: '6px' }}>
    {error}
  </p>
)}
```

### Toast (non-blocking, temporary)
Use for: write failures, streak saves, XP award failures.
```javascript
// Use a toast library or simple custom implementation
// Appears from bottom on mobile, top-right on desktop
// Auto-dismisses after 4s
// Has retry action for write failures
```

### Error banner (persistent until resolved)
Use for: plan generation failure, network offline.
```jsx
{planError && (
  <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
    <p style={{ color: '#EF4444', fontSize: '13px', margin: 0 }}>{planError}</p>
    <button onClick={generatePlan} style={{ color: 'var(--primary)', fontSize: '12px', marginTop: '8px' }}>
      Try again
    </button>
  </div>
)}
```

### Empty state (no data yet)
```jsx
{sessions.length === 0 && (
  <div style={{ textAlign: 'center', padding: '40px 20px' }}>
    <p style={{ color: 'var(--text2)', marginBottom: '16px' }}>Log your first workout to see progress</p>
    <button onClick={() => navigate('/workout')}>Start Workout</button>
  </div>
)}
```

---

## 7. Network Offline Handling

Firebase Firestore client SDK has built-in offline persistence for reads via cache. Writes queue automatically and sync on reconnect.

**What this means:**
- Reads: Firestore returns cached data offline. Charts, plan, and PRs still show.
- Writes: Session writes queue locally and commit when connection restores.
- Limitation: No offline support is MVP goal — don't fight the Firebase default.

**Offline banner:**
```javascript
// src/hooks/useNetworkStatus.js
export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);
  return isOnline;
};

// In AppShell — show banner if offline
{!isOnline && (
  <div style={{ background: '#F59E0B', color: '#000', textAlign: 'center', padding: '6px', fontSize: '12px', fontFamily: 'Outfit' }}>
    You're offline. Your workout will save when reconnected.
  </div>
)}
```

---

## 8. Auth Token Expiry

Firebase handles token refresh silently. If refresh fails (very rare, requires revoked token):

```javascript
// In useAuth — onAuthStateChanged fires with null when token is revoked
onAuthStateChanged(auth, (user) => {
  if (!user) {
    clearUser();
    navigate('/login');  // Silent redirect, no error shown
  }
});
```

No need to handle token expiry manually — Firebase SDK manages it.

---

## 9. Cloud Function Error Codes Reference

| Firebase code | Meaning | User message |
|---|---|---|
| `functions/unauthenticated` | No auth context | "Please log in" |
| `functions/resource-exhausted` | Rate limit hit | "3 plans today. Back tomorrow." |
| `functions/internal` | Unhandled server error | "Plan failed. Last plan active." |
| `functions/invalid-argument` | Bad input | "Something went wrong. Try again." |
| `functions/unavailable` | Firebase Functions down | "Service unavailable. Try later." |
