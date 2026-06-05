/**
 * usePlan.js
 * Fetches the current week's AI plan and triggers Gemini plan generation.
 *
 * Responsibilities:
 * - On mount, checks Firestore /users/{uid}/weeklyPlans/{weekId} for existing plan
 * - If no plan found, exposes generatePlan() to call the Cloud Function
 * - generatePlan() calls the 'generateWeeklyPlan' Cloud Function (Gemini)
 * - Rate-limit contract: Cloud Function enforces 1 plan per user per week
 * - Hydrates usePlanStore on success
 *
 * Error contract:
 * - functions/resource-exhausted (429) → "Plan already generated for this week"
 * - functions/unavailable            → "AI service is temporarily unavailable"
 * - functions/internal               → "Plan generation failed. Try again later."
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
  'functions/unavailable':        'AI service is temporarily unavailable.',
  'functions/internal':           'Plan generation failed. Try again later.',
};

export function usePlan() {
  const { user } = useAuthStore();
  const { weekId, setPlan, setPlanLoading, setPlanError } = usePlanStore();
  const { addToast } = useUIStore();

  // Fetch existing plan on sign-in
  useEffect(() => {
    if (!user) return;

    async function fetchPlan() {
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
    }

    fetchPlan();
  }, [user?.uid, weekId]);

  // Generate plan via Cloud Function (Gemini)
  const generatePlan = useCallback(async () => {
    if (!user) return;
    setPlanLoading(true);
    setPlanError(null);

    try {
      const fn   = httpsCallable(functions, 'generateWeeklyPlan');
      const res  = await fn({ uid: user.uid, weekId });
      setPlan(res.data.plan);
      addToast('New weekly plan generated! 🏋️', 'success');
    } catch (err) {
      const msg = ERROR_MAP[err.code] ?? 'Plan generation failed. Try again later.';
      setPlanError(msg);
      addToast(msg, 'error');
    } finally {
      setPlanLoading(false);
    }
  }, [user?.uid, weekId]);

  return { generatePlan };
}
