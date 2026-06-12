import { useCallback } from 'react';
import { 
  doc, 
  getDoc, 
  getDocs, 
  collection, 
  writeBatch, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/useAuthStore';
import { useWorkoutStore, isBodyweightExercise, getEstimated1RM } from '../stores/useWorkoutStore';
import { useUIStore } from '../stores/useUIStore';
import { useXPEngine } from './useXPEngine';
import { evaluateStreak } from '../lib/xpHelpers';

export function useWorkout() {
  const { user } = useAuthStore();
  const { 
    activeSession, 
    exercises, 
    elapsedSeconds, 
    setSessionLoading, 
    setSessionError, 
    clearSession 
  } = useWorkoutStore();

  const { awardXP } = useXPEngine();
  const { addToast } = useUIStore();

  const saveSession = useCallback(async () => {
    if (!user || !activeSession) return;
    setSessionLoading(true);
    setSessionError(null);

    try {
      // 1. Fetch current user profile document
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        throw new Error('User profile data not found.');
      }
      const userData = userSnap.data();
      const currentXP = userData.xp || 0;
      const currentStreak = userData.streak || 0;
      const streakLastDate = userData.streakLastDate;

      // 2. Fetch existing Personal Records (PRs)
      const prsRef = collection(db, 'users', user.uid, 'prs');
      const prsSnap = await getDocs(prsRef);
      const currentPRsMap = {};
      prsSnap.docs.forEach((docSnap) => {
        currentPRsMap[docSnap.id] = docSnap.data();
      });

      // 3. Evaluate new PRs from active session completed sets
      const newPRList = [];
      const completedExercises = [];

      exercises.forEach((ex) => {
        const completedSets = ex.sets.filter((s) => s.completed || s.done);

        if (completedSets.length === 0) return;

        const mappedSets = completedSets.map((s) => ({
          weight: s.weight === 'BW' ? 0 : (parseFloat(s.weight) || 0),
          reps: parseInt(s.reps, 10) || 0,
        }));

        completedExercises.push({
          exerciseId: ex.exerciseId,
          name: ex.name,
          sets: mappedSets,
        });

        const isBW = isBodyweightExercise(ex.exerciseKey, ex.exerciseId);
        const userBodyweight = userData.weightKg || 75;

        // Find the best set using Epley 1RM
        let bestSet = completedSets[0];
        let bestSetWeight = bestSet.weight === 'BW' ? 0 : (parseFloat(bestSet.weight) || 0);
        let bestSetReps = parseInt(bestSet.reps, 10) || 0;
        let bestSet1RM = getEstimated1RM(bestSetWeight, bestSetReps, isBW, userBodyweight);

        completedSets.forEach((s) => {
          const sWeight = s.weight === 'BW' ? 0 : (parseFloat(s.weight) || 0);
          const sReps = parseInt(s.reps, 10) || 0;
          const s1RM = getEstimated1RM(sWeight, sReps, isBW, userBodyweight);
          if (s1RM > bestSet1RM) {
            bestSet = s;
            bestSetWeight = sWeight;
            bestSetReps = sReps;
            bestSet1RM = s1RM;
          }
        });

        const existingPR = currentPRsMap[ex.exerciseId];
        const existing1RM = existingPR
          ? getEstimated1RM(
              existingPR.weight === 'BW' ? 0 : (parseFloat(existingPR.weight) || 0),
              parseInt(existingPR.reps, 10) || 0,
              isBW,
              userBodyweight
            )
          : 0;

        const isNewPR = bestSet1RM > existing1RM;

        if (isNewPR) {
          newPRList.push({
            exerciseId: ex.exerciseId,
            name: ex.name,
            weight: bestSetWeight,
            reps: bestSetReps,
          });
        }
      });

      // 4. Calculate Streak via XP engine utility
      let lastDate = null;
      if (streakLastDate) {
        lastDate = typeof streakLastDate.toDate === 'function'
          ? streakLastDate.toDate()
          : new Date(streakLastDate);
      }
      const { newStreak, streakBonuses } = evaluateStreak(lastDate, currentStreak);

      // 5. Calculate XP (base + per-PR)
      const baseXP = 55; // session_logged award
      const prXP = newPRList.length * 25;   // pr_hit award per PR
      const xpToAdd = baseXP + prXP;

      // 6. Bundle mutations into an atomic batch write
      const batch = writeBatch(db);
      const sessionId = `${Date.now()}`;

      // Write session document
      const sessionRef = doc(db, 'users', user.uid, 'sessions', sessionId);
      const totalVolume = completedExercises.reduce(
        (sum, ex) => sum + ex.sets.reduce((sSum, s) => sSum + s.weight * s.reps, 0),
        0
      );

      batch.set(sessionRef, {
        planDayId:      activeSession.planDayId,
        startedAt:      new Date(activeSession.startedAt),
        completedAt:    serverTimestamp(),
        durationSecs:   elapsedSeconds,
        exercises:      completedExercises,
        totalVolume,
        xpAwarded:      xpToAdd,
        prsEstablished: newPRList.map((pr) => pr.exerciseId),
      });

      // PR records are written below

      // Write PR records
      newPRList.forEach((pr) => {
        const prRef = doc(db, 'users', user.uid, 'prs', pr.exerciseId);
        batch.set(prRef, {
          exerciseId: pr.exerciseId,
          name:       pr.name,
          weight:     pr.weight,
          reps:       pr.reps,
          date:       serverTimestamp(),
        });
      });

      // Update streak on the user profile (XP written separately via engine)
      batch.update(userRef, {
        streak:         newStreak,
        streakLastDate: serverTimestamp(),
      });

      // Commit session + PR + streak atomically
      await batch.commit();

      // 7. Award XP via engine (handles level derivation + xpLog + local store sync)
      const sessionXPResult = await awardXP(user.uid, 'session_logged', xpToAdd);

      // Award streak bonuses if applicable
      for (const bonusSource of streakBonuses) {
        await awardXP(user.uid, bonusSource);
      }

      // Notification toasts
      if (newPRList.length > 0) {
        addToast(`🔥 ${newPRList.length} New Personal Record${newPRList.length > 1 ? 's' : ''}!`, 'success');
      }
      if (sessionXPResult?.levelUp) {
        addToast(`🎉 Level Up! You're now Level ${sessionXPResult.newLevel} — ${sessionXPResult.newLevelName}!`, 'success');
      }
      addToast(`+${xpToAdd} XP — Session logged! 💪`, 'xp');

      // Clear the persisted active session state
      clearSession();
    } catch (err) {
      setSessionError(err.message ?? 'Failed to save session');
      addToast('Failed to save session. Try again.', 'error');
    } finally {
      setSessionLoading(false);
    }
  }, [user, activeSession, exercises, elapsedSeconds, awardXP, addToast, setSessionLoading, setSessionError, clearSession]);

  const cancelSession = useCallback(() => {
    clearSession();
    addToast('Session cancelled.', 'info');
  }, [clearSession, addToast]);

  return { saveSession, cancelSession };
}
