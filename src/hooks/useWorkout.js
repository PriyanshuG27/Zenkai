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
import { useWorkoutStore } from '../stores/useWorkoutStore';
import { useXPStore } from '../stores/useXPStore';
import { useUIStore } from '../stores/useUIStore';

const LEVELS = [
  { level: 1, name: 'Rookie',     threshold: 0     },
  { level: 2, name: 'Challenger', threshold: 500   },
  { level: 3, name: 'Hustler',    threshold: 1500  },
  { level: 4, name: 'Warrior',    threshold: 3000  },
  { level: 5, name: 'Elite',      threshold: 5500  },
  { level: 6, name: 'Legend',     threshold: 10000 },
];

function deriveLevel(xp) {
  let current = LEVELS[0];
  for (const l of LEVELS) {
    if (xp >= l.threshold) current = l;
    else break;
  }
  return { level: current.level, levelName: current.name };
}

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
  
  const { setXP } = useXPStore();
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
        const completedSets = ex.sets
          .filter((s) => s.completed)
          .map((s) => ({
            weight: parseFloat(s.weight) || 0,
            reps: parseInt(s.reps, 10) || 0,
          }));

        if (completedSets.length === 0) return;

        completedExercises.push({
          exerciseId: ex.exerciseId,
          name: ex.name,
          sets: completedSets,
        });

        // Find the best set (highest weight, then highest reps)
        let bestSet = completedSets[0];
        completedSets.forEach((set) => {
          if (set.weight > bestSet.weight) {
            bestSet = set;
          } else if (set.weight === bestSet.weight && set.reps > bestSet.reps) {
            bestSet = set;
          }
        });

        const existingPR = currentPRsMap[ex.exerciseId];
        const isNewPR =
          !existingPR ||
          bestSet.weight > existingPR.weight ||
          (bestSet.weight === existingPR.weight && bestSet.reps > existingPR.reps);

        if (isNewPR) {
          newPRList.push({
            exerciseId: ex.exerciseId,
            name: ex.name,
            weight: bestSet.weight,
            reps: bestSet.reps,
          });
        }
      });

      // 4. Calculate Streak
      let newStreak = currentStreak;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let lastDate = null;
      if (streakLastDate) {
        lastDate = typeof streakLastDate.toDate === 'function' 
          ? streakLastDate.toDate() 
          : new Date(streakLastDate);
      }

      if (!lastDate) {
        newStreak = 1;
      } else {
        const prev = new Date(lastDate);
        prev.setHours(0, 0, 0, 0);
        
        const diffTime = today - prev;
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
          newStreak = currentStreak + 1;
        } else if (diffDays > 1) {
          newStreak = 1;
        }
      }

      // 5. Calculate XP and Level
      const baseXP = 55; // 50 complete + 5 for logging session
      const prXP = newPRList.length * 25;
      const xpToAdd = baseXP + prXP;
      const newXP = currentXP + xpToAdd;
      const { level: newLevel, levelName: newLevelName } = deriveLevel(newXP);

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

      // Write individual sub-documents for each executed exercise
      completedExercises.forEach((ex) => {
        const exRef = doc(db, 'users', user.uid, 'sessions', sessionId, 'exercises', ex.exerciseId);
        batch.set(exRef, {
          exerciseId: ex.exerciseId,
          name:       ex.name,
          sets:       ex.sets,
          timestamp:  serverTimestamp(),
        });
      });

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

      // Update root user profile
      batch.update(userRef, {
        xp:             newXP,
        level:          newLevel,
        levelName:      newLevelName,
        streak:         newStreak,
        streakLastDate: serverTimestamp(),
      });

      // Commit the entire batch atomically
      await batch.commit();

      // Sync local XP State
      setXP(newXP, newStreak);

      // Notification toasts
      if (newPRList.length > 0) {
        addToast(`🔥 ${newPRList.length} New Personal Record${newPRList.length > 1 ? 's' : ''}!`, 'success');
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
  }, [user, activeSession, exercises, elapsedSeconds, setXP, addToast, setSessionLoading, setSessionError, clearSession]);

  const cancelSession = useCallback(() => {
    clearSession();
    addToast('Session cancelled.', 'info');
  }, [clearSession, addToast]);

  return { saveSession, cancelSession };
}
