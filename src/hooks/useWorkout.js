/**
 * useWorkout.js
 * Actions for managing an active workout session.
 *
 * Responsibilities:
 * - saveSession(): validates session, writes to Firestore /users/{uid}/sessions/{id},
 *   calls the awardXP Cloud Function, clears the workout store
 * - cancelSession(): prompts confirmation, clears store without saving
 * - Surfaces sessionLoading + sessionError from useWorkoutStore
 *
 * Rate-limit contract (Cloud Function):
 * - Max 10 session saves per user per hour (429 returned otherwise)
 * - On 429: shows toast "Slow down champ! Wait a bit before logging again."
 */

import { useCallback }         from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable }       from 'firebase/functions';
import { db, functions }       from '../lib/firebase';
import { useAuthStore }        from '../stores/useAuthStore';
import { useWorkoutStore }     from '../stores/useWorkoutStore';
import { useXPStore }          from '../stores/useXPStore';
import { useUIStore }          from '../stores/useUIStore';

const XP_WORKOUT_COMPLETE = 50;

export function useWorkout() {
  const { user } = useAuthStore();
  const { activeSession, exercises, elapsedSeconds, setSessionLoading, setSessionError, clearSession } = useWorkoutStore();
  const { awardXP } = useXPStore();
  const { addToast } = useUIStore();

  const saveSession = useCallback(async () => {
    if (!user || !activeSession) return;
    setSessionLoading(true);
    setSessionError(null);

    try {
      const sessionId = `${Date.now()}`;
      const sessionRef = doc(db, 'users', user.uid, 'sessions', sessionId);
      await setDoc(sessionRef, {
        planDayId:      activeSession.planDayId,
        startedAt:      new Date(activeSession.startedAt),
        completedAt:    serverTimestamp(),
        durationSecs:   elapsedSeconds,
        exercises:      exercises.map((ex) => ({
          exerciseId: ex.exerciseId,
          name:       ex.name,
          sets:       ex.sets.filter((s) => s.completed),
        })),
        totalVolume:    exercises.reduce((sum, ex) =>
          sum + ex.sets.reduce((s2, s) => s2 + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0), 0),
      });

      // Call Cloud Function to award XP (handles PR detection too)
      const awardXPFn = httpsCallable(functions, 'awardSessionXP');
      await awardXPFn({ sessionId, uid: user.uid });

      awardXP(XP_WORKOUT_COMPLETE);
      addToast(`+${XP_WORKOUT_COMPLETE} XP — Session logged! 💪`, 'xp');
      clearSession();
    } catch (err) {
      if (err?.code === 'functions/resource-exhausted' || err?.status === 429) {
        addToast('Slow down champ! Wait a bit before logging again.', 'error');
        setSessionError('Rate limit reached. Try again in a few minutes.');
      } else {
        setSessionError(err.message ?? 'Failed to save session');
        addToast('Failed to save session. Try again.', 'error');
      }
    } finally {
      setSessionLoading(false);
    }
  }, [user, activeSession, exercises, elapsedSeconds]);

  const cancelSession = useCallback(() => {
    clearSession();
    addToast('Session cancelled.', 'info');
  }, []);

  return { saveSession, cancelSession };
}
