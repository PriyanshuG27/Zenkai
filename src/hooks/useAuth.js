import { useCallback }                                         from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  updateProfile,
  sendEmailVerification,
  signOut,
  deleteUser,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db }                     from '../lib/firebase';
import { useAuthStore }                 from '../stores/authStore';

// ─── Error code → human-readable message ─────────────────────────────────────
const ERROR_MESSAGES = {
  // Auth errors
  'auth/user-not-found':           'No account with this email.',
  'auth/wrong-password':           'Incorrect password.',
  'auth/invalid-credential':       'Incorrect email or password.',
  'auth/email-already-in-use':     'This email is already registered.',
  'auth/too-many-requests':        'Too many attempts. Try again in a few minutes.',
  'auth/network-request-failed':   'Network error. Check your connection.',
  'auth/popup-closed-by-user':     'Google sign-in was cancelled.',
  'auth/cancelled-popup-request':  'Google sign-in was cancelled.',
  // Firestore errors (write fails)
  'permission-denied':             'Database permission denied. Contact support.',
  'unavailable':                   'Service temporarily unavailable. Try again.',
  'not-found':                     'Account data not found. Please sign up again.',
};

function mapError(err) {
  // Firebase error codes can be scoped (e.g. "firestore/permission-denied")
  // or unscoped ("permission-denied") — check both
  const code = err?.code ?? '';
  const unscoped = code.includes('/') ? code.split('/').pop() : code;
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES[unscoped] ?? 'Something went wrong. Try again.';
}

// ─── useAuth ─────────────────────────────────────────────────────────────────
export function useAuth() {
  const { user, uid, loading, error, setUser, setLoading, setError, clearError } =
    useAuthStore();

  // ── login ────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    clearError();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged (in App.jsx) will call setUser automatically
    } catch (err) {
      setError(mapError(err));
      throw err; // let the UI layer re-catch for password-clear logic
    }
  }, [clearError, setError]);

  // ── loginWithGoogle ──────────────────────────────────────────────────────
  const loginWithGoogle = useCallback(async () => {
    clearError();
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const firebaseUser = cred.user;

      // Create Firestore doc if this is the first Google sign-in
      const userRef = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          uid:              firebaseUser.uid,
          name:             firebaseUser.displayName || '',
          email:            firebaseUser.email || '',
          userType:         null,
          onboardingComplete: false,
          xp:               0,
          level:            1,
          levelName:        'Rookie',
          streak:           0,
          streakLastDate:   null,
          equipmentList:    [],
          medicalFlags:     [],
          powerUps: {
            streakShield:   0,
            xpBooster:      0,
            challengeSkip:  0,
            planRefresh:    0,
          },
          badges:           [],
          createdAt:        serverTimestamp(),
        });
      }
      // onAuthStateChanged handles the rest
    } catch (err) {
      const msg = mapError(err);
      setError(msg);
      const enriched = new Error(msg);
      enriched.mapped = true;
      throw enriched;
    }
  }, [clearError, setError]);

  // ── signup ───────────────────────────────────────────────────────────────
  const signup = useCallback(async (name, email, password) => {
    clearError();
    let newUser = null;
    try {
      // 1. Create Firebase Auth account
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      newUser = cred.user;

      // 2. Set display name
      await updateProfile(newUser, { displayName: name });

      // 3. Send email verification
      await sendEmailVerification(newUser);

      // 4. Write initial Firestore profile document
      await setDoc(doc(db, 'users', newUser.uid), {
        uid:                newUser.uid,
        name,
        email,
        // Auth
        userType:           null,
        onboardingComplete: false,
        emailVerified:      false,
        // Body
        age:                null,
        gender:             null,
        heightCm:           null,
        weightKg:           null,
        // Goal & schedule
        goal:               null,
        workoutFrequency:   null,
        sessionDuration:    null,
        // Lifestyle
        dietType:           null,
        currentSupplements: [],
        // Gym
        equipmentList:      [],
        // Health
        medicalFlags:       [],
        // Gamification
        xp:                 0,
        level:              1,
        levelName:          'Rookie',
        streak:             0,
        streakLastDate:     null,
        powerUps: {
          streakShield:   0,
          xpBooster:      0,
          challengeSkip:  0,
          planRefresh:    0,
        },
        badges:             [],
        createdAt:          serverTimestamp(),
      });

      // onAuthStateChanged handles setUser + setLoading
    } catch (err) {
      // If Firestore write failed AFTER auth account was created,
      // delete the orphaned Auth account (no zombie accounts)
      if (newUser && err?.code !== 'auth/email-already-in-use') {
        try { await deleteUser(newUser); } catch { /* best-effort cleanup */ }
      }
      const msg = mapError(err);
      setError(msg);
      // Throw enriched error so UI catch block reads .message, not stale authError
      const enriched = new Error(msg);
      enriched.mapped = true;
      throw enriched;
    }
  }, [clearError, setError]);

  // ── logout ───────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    clearError();
    try {
      await signOut(auth);
      setUser(null);           // immediate local reset
      setLoading(false);
    } catch (err) {
      setError(mapError(err));
      throw err;
    }
  }, [clearError, setUser, setLoading, setError]);

  return {
    user,
    uid,
    loading,
    error,
    login,
    loginWithGoogle,
    signup,
    logout,
    clearError,
  };
}
