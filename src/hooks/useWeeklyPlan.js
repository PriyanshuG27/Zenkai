/**
 * useWeeklyPlan.js
 *
 * Fetches the current week's AI plan and triggers Gemini plan generation.
 * Modifies the global Zustand store (usePlanStore) rather than holding local state.
 *
 * SWR strategy: on mount, reads the cached plan from localStorage (if any) and
 * hydrates the store immediately — before the Firestore network call resolves.
 * This eliminates the "Weekly Schedule skeleton" flash (CLS) for returning users.
 */

import { useEffect, useCallback } from 'react';
import { doc, getDoc, collection, query, limit, getDocs } from 'firebase/firestore';
import { db }                     from '../lib/firebase';
import { callZenkaiAPI }         from '../lib/apiClient';
import { useAuthStore }           from '../stores/useAuthStore';
import { usePlanStore, writePlanCache, readPlanCache } from '../stores/usePlanStore';
import { useUIStore }             from '../stores/useUIStore';

// Maps error message substrings to user-friendly messages.
// callZenkaiAPI throws plain Error objects (not Firebase HttpsCallable errors),
// so we match on err.message content rather than err.code.
const ERROR_MESSAGES = [
  { match: 'resource-exhausted', msg: 'Plan already generated for this week.' },
  { match: 'deadline-exceeded',  msg: 'Plan generation timed out. Please try again.' },
  { match: 'unavailable',        msg: 'AI service is temporarily unavailable.' },
  { match: 'rate limit',         msg: 'Too many requests. Please wait a moment.' },
];

function getFriendlyError(err) {
  const msgLower = (err?.message || '').toLowerCase();
  for (const { match, msg } of ERROR_MESSAGES) {
    if (msgLower.includes(match)) return msg;
  }
  return err?.message || 'Plan generation failed. Please try again.';
}

export function useWeeklyPlan() {
  const { user } = useAuthStore();
  const { weekId, currentPlan, setPlan, setPlanLoading, setPlanError } = usePlanStore();
  const { addToast } = useUIStore();

  const getCurrentPlan = useCallback(async () => {
    if (!user) return;
    setPlanLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', user.uid, 'weeklyPlans', weekId));
      
      const plansQ = query(collection(db, 'users', user.uid, 'weeklyPlans'), limit(1));
      const plansSnap = await getDocs(plansQ);
      const isNewUser = plansSnap.empty;

      if (snap.exists()) {
        const planData = snap.data();
        setPlan(planData, isNewUser);
        // Write the fresh plan back to localStorage so next mount is instant
        writePlanCache(user.uid, weekId, planData);
      } else {
        setPlan(null, isNewUser);
      }
    } catch (err) {
      setPlanError('Failed to load plan.');
    } finally {
      setPlanLoading(false);
    }
  }, [user?.uid, weekId, setPlan, setPlanLoading, setPlanError]);

  // Fetch existing plan on mount if not already loaded for this week.
  // SWR: hydrate from localStorage first so the UI paints without a skeleton,
  // then re-fetch from Firestore to pick up any server-side changes.
  // Also re-fetch when weekId changes (week rollover in long-running PWA sessions).
  useEffect(() => {
    if (!user) return;
    // If we have no plan in the store yet, try to hydrate from the local cache first
    if (!currentPlan) {
      const cached = readPlanCache(user.uid, weekId);
      if (cached) {
        // Hydrate immediately — no spinner, no skeleton
        setPlan(cached, false);
      }
    }
    // Always re-validate from Firestore in the background
    getCurrentPlan();
  }, [user?.uid, weekId]); // eslint-disable-line react-hooks/exhaustive-deps

  const generatePlan = useCallback(async (personalRequirements = '', usePowerUp = false) => {
    if (!user) return;
    setPlanLoading(true);
    setPlanError(null);

    try {
      const payload = { weekId, usePowerUp };
      if (personalRequirements && typeof personalRequirements === 'string' && personalRequirements.trim() !== '') {
        payload.personalRequirements = personalRequirements;
      }
      const res = await callZenkaiAPI('generatePlan', payload, 150000);
      
      // Upon successful generation, fetch the newly generated plan from Firestore.
      if (res.data?.success) {
        await getCurrentPlan();
        addToast('New weekly plan generated! 🏋️', 'success');
      }
    } catch (err) {
      const msg = getFriendlyError(err);
      setPlanError(msg);
      addToast(msg, 'error');
    } finally {
      setPlanLoading(false);
    }
  }, [user?.uid, weekId, getCurrentPlan, setPlanLoading, setPlanError, addToast]);

  return { generatePlan, getCurrentPlan };
}
