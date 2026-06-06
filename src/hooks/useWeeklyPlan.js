/**
 * useWeeklyPlan.js
 *
 * Fetches the current week's AI plan and triggers Gemini plan generation.
 * Modifies the global Zustand store (usePlanStore) rather than holding local state.
 */

import { useEffect, useCallback } from 'react';
import { doc, getDoc }            from 'firebase/firestore';
import { httpsCallable }          from 'firebase/functions';
import { db, functions }          from '../lib/firebase';
import { useAuthStore }           from '../stores/useAuthStore';
import { usePlanStore }           from '../stores/usePlanStore';
import { useUIStore }             from '../stores/useUIStore';

const ERROR_MAP = {
  'functions/resource-exhausted': 'Plan already generated for this week.',
  'functions/deadline-exceeded':  'Plan generation timed out. Please try again.',
  'functions/unavailable':        'AI service is temporarily unavailable.',
  'functions/internal':           'Plan generation failed. Please try again.',
};

export function useWeeklyPlan() {
  const { user } = useAuthStore();
  const { weekId, currentPlan, setPlan, setPlanLoading, setPlanError } = usePlanStore();
  const { addToast } = useUIStore();

  const getCurrentPlan = useCallback(async () => {
    if (!user) return;
    setPlanLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', user.uid, 'weeklyPlans', weekId));
      if (snap.exists()) {
        setPlan(snap.data());
      } else {
        setPlan(null);
      }
    } catch (err) {
      setPlanError('Failed to load plan.');
    } finally {
      setPlanLoading(false);
    }
  }, [user?.uid, weekId, setPlan, setPlanLoading, setPlanError]);

  // Fetch existing plan on mount if not already loaded for this week
  useEffect(() => {
    if (user && !currentPlan) {
      getCurrentPlan();
    }
  }, [user?.uid, currentPlan, getCurrentPlan]);

  const generatePlan = useCallback(async () => {
    if (!user) return;
    setPlanLoading(true);
    setPlanError(null);

    try {
      const fn = httpsCallable(functions, 'generatePlan');
      const res = await fn({ weekId });
      
      // Upon successful generation, fetch the newly generated plan from Firestore.
      if (res.data?.success) {
        await getCurrentPlan();
        addToast('New weekly plan generated! 🏋️', 'success');
      }
    } catch (err) {
      const msg = ERROR_MAP[err.code] ?? 'Plan generation failed. Please try again.';
      setPlanError(msg);
      addToast(msg, 'error');
    } finally {
      setPlanLoading(false);
    }
  }, [user?.uid, weekId, getCurrentPlan, setPlanLoading, setPlanError, addToast]);

  return { generatePlan, getCurrentPlan };
}
