import { useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { clearPRCache } from './usePRDetection';
import { clearStrengthCache } from './useProgress';

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
      const { auth } = await import('../lib/firebase');
      const { signInWithEmailAndPassword } = await import('firebase/auth');
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
      const { auth, db } = await import('../lib/firebase');
      const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
      const { doc, getDoc, setDoc, serverTimestamp } = await import('firebase/firestore');

      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const firebaseUser = cred.user;

      // Create Firestore doc if this is the first Google sign-in
      const userRef = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        const { writeBatch } = await import('firebase/firestore');
        const cleanName = (firebaseUser.displayName || 'Zenkai').replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase();
        const padName = cleanName.padEnd(4, 'X');
        const randomDigits = Math.floor(100 + Math.random() * 900);
        const code = `ZK-${padName}${randomDigits}`;

        const batch = writeBatch(db);

        batch.set(userRef, {
          uid:              firebaseUser.uid,
          name:             firebaseUser.displayName || '',
          squadCode:        code,
          userType:         null,
          onboardingComplete: false,
          xp:               0,
          level:            1,
          levelName:        'Rookie',
          streak:           0,
          streakLastDate:   null,
          powerUps: {
            streakShield:   0,
            xpBooster:      0,
            challengeSkip:  0,
            planRefresh:    0,
          },
          badges:           [],
          createdAt:        serverTimestamp(),
        });

        batch.set(doc(db, 'users', firebaseUser.uid, 'private', 'profile'), {
          email:            firebaseUser.email || '',
          emailVerified:    firebaseUser.emailVerified || false,
          equipmentList:    [],
          medicalFlags:     [],
          createdAt:        serverTimestamp(),
        });

        // Write to public squad_codes collection
        const codeRef = doc(db, 'squad_codes', code);
        batch.set(codeRef, {
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || 'Anonymous Bro',
          xp: 0,
          level: 1,
          streak: 0,
          volume: 0,
          squadCode: code,
          updatedAt: new Date()
        });

        await batch.commit();
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
      const { auth, db } = await import('../lib/firebase');
      const { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } = await import('firebase/auth');
      const { doc, writeBatch, serverTimestamp } = await import('firebase/firestore');

      // 1. Create Firebase Auth account
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      newUser = cred.user;

      // 2. Set display name
      await updateProfile(newUser, { displayName: name });

      // 3. Send email verification
      await sendEmailVerification(newUser);

      const cleanName = name.replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase();
      const padName = cleanName.padEnd(4, 'X');
      const randomDigits = Math.floor(100 + Math.random() * 900);
      const code = `ZK-${padName}${randomDigits}`;

      const batch = writeBatch(db);

      // 4. Write initial Firestore profile document (public)
      batch.set(doc(db, 'users', newUser.uid), {
        uid:                newUser.uid,
        name,
        squadCode:          code,
        // Auth
        userType:           null,
        onboardingComplete: false,
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

      // 5. Write private profile document
      batch.set(doc(db, 'users', newUser.uid, 'private', 'profile'), {
        email,
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
        createdAt:          serverTimestamp(),
      });

      // Write to public squad_codes collection
      const codeRef = doc(db, 'squad_codes', code);
      batch.set(codeRef, {
        uid: newUser.uid,
        name,
        xp: 0,
        level: 1,
        streak: 0,
        volume: 0,
        squadCode: code,
        updatedAt: new Date()
      });

      await batch.commit();

      // onAuthStateChanged handles setUser + setLoading
    } catch (err) {
      // If Firestore write failed AFTER auth account was created,
      // delete the orphaned Auth account (no zombie accounts)
      if (newUser && err?.code !== 'auth/email-already-in-use') {
        try {
          const { deleteUser } = await import('firebase/auth');
          await deleteUser(newUser);
        } catch { /* best-effort cleanup */ }
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
      const { auth } = await import('../lib/firebase');
      const { signOut } = await import('firebase/auth');
      await signOut(auth);
      // Clear per-user caches so a different user logging in doesn't see stale data
      clearPRCache();
      clearStrengthCache();
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
