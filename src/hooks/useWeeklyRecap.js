import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/useAuthStore';
import { useXPStore } from '../stores/useXPStore';

// Helper to calculate ISO week in YYYY-WNN format
function getISOWeek(date) {
  const tempDate = new Date(date.valueOf());
  // ISO week starts on Monday. Set to nearest Thursday: current date + 4 - current day number
  tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7));
  const yearStart = new Date(tempDate.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
  return `${tempDate.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function useWeeklyRecap() {
  const { uid } = useAuthStore();
  const { streak } = useXPStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recap, setRecap] = useState(null);

  const today = new Date();
  const weekId = getISOWeek(today);
  const isRecapDay = today.getDay() === 0;

  const [hasSeen, setHasSeen] = useState(() => {
    return localStorage.getItem(`recap_seen_${weekId}`) === 'true';
  });

  const loadRecapData = useCallback(async () => {
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() - 7);
      cutoff.setHours(0, 0, 0, 0);

      // Query sessions in the last 7 days
      const sessionsRef = collection(db, 'users', uid, 'sessions');
      const q = query(
        sessionsRef,
        where('date', '>=', cutoff),
        orderBy('date', 'desc'),
        limit(7)
      );
      const sessSnap = await getDocs(q);

      let totalVolume = 0;
      let xpEarned = 0;
      let maxWeight = 0;
      let bestLiftName = '';
      let maxBWReps = 0;
      let bestBWName = '';
      const sessionsCount = sessSnap.size;

      // Iterate through sessions to sum volume/XP and find the best lift
      for (const docSnap of sessSnap.docs) {
        const sessionData = docSnap.data();
        totalVolume += sessionData.totalVolume || 0;
        xpEarned += sessionData.xpEarned || 0;

        const exercisesRef = collection(db, 'users', uid, 'sessions', docSnap.id, 'exercises');
        const exSnap = await getDocs(exercisesRef);

        exSnap.docs.forEach((exDoc) => {
          const exData = exDoc.data();
          (exData.sets || []).forEach((set) => {
            if (set.done || set.completed) {
              const isBW = set.weight === 'BW';
              const weightVal = isBW ? 0 : (parseFloat(set.weight) || 0);
              const repsVal = parseInt(set.reps, 10) || 0;

              if (weightVal > maxWeight) {
                maxWeight = weightVal;
                bestLiftName = exData.name || '';
              } else if (isBW && repsVal > maxBWReps) {
                maxBWReps = repsVal;
                bestBWName = exData.name || '';
              }
            }
          });
        });
      }

      let bestLiftObj = null;
      if (bestLiftName && maxWeight > 0) {
        bestLiftObj = { name: bestLiftName, weight: maxWeight, isBW: false };
      } else if (bestBWName && maxBWReps > 0) {
        bestLiftObj = { name: bestBWName, weight: 'BW', reps: maxBWReps, isBW: true };
      }

      // Query PRs broken in the last 7 days
      const prsRef = collection(db, 'users', uid, 'prs');
      const prQuery = query(
        prsRef,
        where('date', '>=', cutoff)
      );
      const prSnap = await getDocs(prQuery);
      const prsBrokenCount = prSnap.size;

      // Motivational caption logic
      let motivationalLine = "No workouts logged. Let's make next week count! ⚡";
      if (sessionsCount === 1) {
        motivationalLine = "1 session logged. A small step is still progress! 🚀";
      } else if (sessionsCount === 2) {
        motivationalLine = "2 sessions logged. Nice work, keep building momentum! 🔥";
      } else if (sessionsCount === 3) {
        motivationalLine = "3 sessions logged. Consistent and strong! 🎯";
      } else if (sessionsCount >= 4) {
        motivationalLine = `${sessionsCount} sessions logged. Absolute machine! 🏆`;
      }

      setRecap({
        sessionsCount,
        totalVolume,
        prsBrokenCount,
        xpEarned,
        streak,
        bestLift: bestLiftObj,
        motivationalLine,
      });
    } catch (err) {
      console.error('[useWeeklyRecap] Error loading recap data:', err);
      setError(err.message || 'Failed to load weekly recap data.');
    } finally {
      setLoading(false);
    }
  }, [uid, streak]);

  useEffect(() => {
    loadRecapData();
  }, [loadRecapData]);

  const markAsSeen = useCallback(() => {
    localStorage.setItem(`recap_seen_${weekId}`, 'true');
    setHasSeen(true);
  }, [weekId]);

  return {
    loading,
    error,
    recap,
    isRecapDay,
    weekId,
    hasSeen,
    markAsSeen,
    refresh: loadRecapData,
  };
}
