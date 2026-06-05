import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { AuthSpinner } from './ProtectedRoute';

// ─── OnboardingGuard ──────────────────────────────────────────────────────────
// Must be placed INSIDE ProtectedRoute (user is guaranteed non-null here).
//
// Logic:
//  - Reads /users/{uid} from Firestore on mount to get onboardingComplete flag
//  - onboardingComplete === false + not on /onboarding/* → redirect /onboarding/type
//  - onboardingComplete === true  + on /onboarding/*    → redirect /home
//  - Otherwise: render children
export const OnboardingGuard = ({ children }) => {
  const { uid } = useAuthStore();
  const location = useLocation();

  const [checking, setChecking]               = useState(true);
  const [onboardingComplete, setComplete]     = useState(null); // null = unknown

  const onOnboardingPath = location.pathname.startsWith('/onboarding');

  useEffect(() => {
    if (!uid) return;

    let cancelled = false;

    const check = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (cancelled) return;

        if (snap.exists()) {
          setComplete(snap.data().onboardingComplete === true);
        } else {
          // No Firestore doc yet — treat as incomplete
          setComplete(false);
        }
      } catch (err) {
        // Firestore read failed — fail open (let user through) to avoid
        // trapping them in an infinite redirect loop
        console.error('[OnboardingGuard] Firestore read failed:', err);
        if (!cancelled) setComplete(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, [uid]);

  // Show spinner while the Firestore read is in flight
  if (checking) {
    return <AuthSpinner label="Loading Profile..." />;
  }

  // Onboarding incomplete → force to onboarding (unless already there)
  if (onboardingComplete === false && !onOnboardingPath) {
    return <Navigate to="/onboarding/type" replace />;
  }

  // Onboarding complete → don't let them re-enter onboarding flow
  if (onboardingComplete === true && onOnboardingPath) {
    return <Navigate to="/home" replace />;
  }

  return children;
};
