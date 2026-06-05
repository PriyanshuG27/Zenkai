/**
 * useOnboarding.js
 * Multi-step onboarding form state and Firestore save.
 *
 * Responsibilities:
 * - Tracks current step (0-indexed) and form data across all steps
 * - Steps: ['goal', 'experience', 'equipment', 'measurements', 'schedule']
 * - nextStep() / prevStep() navigation with bounds checking
 * - saveOnboarding(): writes /users/{uid} profile document on final step,
 *   awards +20 XP (profile_complete) via Cloud Function
 * - Returns { step, totalSteps, data, setField, nextStep, prevStep, saving, saveOnboarding }
 */

import { useState, useCallback } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable }    from 'firebase/functions';
import { db, functions }    from '../lib/firebase';
import { useAuthStore }     from '../stores/useAuthStore';
import { useXPStore }       from '../stores/useXPStore';
import { useUIStore }       from '../stores/useUIStore';
import { useNavigate }      from 'react-router-dom';

const STEPS = ['goal', 'experience', 'equipment', 'measurements', 'schedule'];
const XP_PROFILE_COMPLETE = 20;

export function useOnboarding() {
  const { user, setProfile } = useAuthStore();
  const { awardXP }          = useXPStore();
  const { addToast }         = useUIStore();
  const navigate             = useNavigate();

  const [step,   setStep]   = useState(0);
  const [saving, setSaving] = useState(false);
  const [data,   setData]   = useState({
    goal:        '',   // 'lose_fat' | 'build_muscle' | 'maintain' | 'comeback'
    experience:  '',   // 'beginner' | 'intermediate' | 'advanced'
    equipment:   [],   // ['dumbbells', 'barbell', 'cables', 'bench', 'pullup_bar', 'no_equipment']
    weight:      '',
    height:      '',
    age:         '',
    injuryNotes: '',
    daysPerWeek: 4,    // 2–6
    preferredTime: '', // 'morning' | 'evening' | 'flexible'
  });

  const setField = useCallback((field, value) => {
    setData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const nextStep = useCallback(() => {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, []);

  const prevStep = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const saveOnboarding = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      const profile = {
        ...data,
        uid:             user.uid,
        email:           user.email,
        onboardingDone:  true,
        totalXP:         0,
        streak:          0,
        createdAt:       serverTimestamp(),
        updatedAt:       serverTimestamp(),
      };
      await setDoc(doc(db, 'users', user.uid), profile);
      setProfile(profile);

      // Award profile_complete XP
      const fn = httpsCallable(functions, 'awardProfileComplete');
      await fn({ uid: user.uid });
      awardXP(XP_PROFILE_COMPLETE);

      addToast(`+${XP_PROFILE_COMPLETE} XP — Profile complete! Let's go! 🚀`, 'xp');
      navigate('/home');
    } catch (err) {
      addToast('Failed to save profile. Try again.', 'error');
    } finally {
      setSaving(false);
    }
  }, [user, data]);

  return {
    step,
    totalSteps: STEPS.length,
    stepName:   STEPS[step],
    data,
    setField,
    nextStep,
    prevStep,
    saving,
    saveOnboarding,
  };
}
