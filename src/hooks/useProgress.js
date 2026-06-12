import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Module-level cache for strength data — entries expire after 5 minutes
// so a newly logged PR shows on the next Progress tab open without a full clear.
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const strengthCache = new Map(); // key -> { data, expiresAt }

export function clearStrengthCache() {
  strengthCache.clear();
}

// Helper to format Date to YYYY-MM-DD
const formatDate = (dateObj) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Helper to calculate ISO week in YYYY-WNN format
function getISOWeek(date) {
  const tempDate = new Date(date.valueOf());
  // ISO week starts on Monday. Set to nearest Thursday: current date + 4 - current day number
  tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7));
  const yearStart = new Date(tempDate.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
  return `${tempDate.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * 1. useStrengthData(uid, exerciseKey, rangeDays = 30)
 * 
 * - Queries users/{uid}/sessions ordered by date DESC, limit 60.
 * - For each session, reads exercises subcollection.
 * - Filters exercises by exerciseKey and extracts max weight per session (heaviest set).
 * - Returns strength data sorted ascending by date (oldest first).
 */
export function useStrengthData(uid, exerciseKey, rangeDays = 30) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uid || !exerciseKey) {
      setLoading(false);
      return;
    }

    const cacheKey = `${uid}_${exerciseKey}_${rangeDays}`;
    const cached = strengthCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const signal = controller.signal;

    async function fetchStrength() {
      setLoading(true);
      setError(null);
      try {
        const sessionsRef = collection(db, 'users', uid, 'sessions');
        // Limit 20 is enough for a trend chart; was 60 which caused excess reads
        const q = query(sessionsRef, orderBy('date', 'desc'), limit(20));
        const sessSnap = await getDocs(q);

        if (signal.aborted) return;

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - rangeDays);
        const cutoffTime = cutoff.getTime();

        // Filter sessions within date range first to skip subcollection reads for old sessions
        const relevantDocs = sessSnap.docs.filter((docSnap) => {
          const sessionData = docSnap.data();
          const sessionDate = sessionData.date?.toDate?.() ?? new Date(sessionData.date);
          return sessionDate.getTime() >= cutoffTime;
        });

        if (signal.aborted) return;

        const exerciseResults = await Promise.all(
          relevantDocs.map(async (docSnap) => {
            const sessionData = docSnap.data();
            if (sessionData.exercises && Array.isArray(sessionData.exercises) && sessionData.exercises.length > 0) {
              return { docSnap, exercises: sessionData.exercises };
            }
            const exSnap = await getDocs(
              collection(db, 'users', uid, 'sessions', docSnap.id, 'exercises')
            );
            return { docSnap, exercises: exSnap.docs.map((d) => d.data()) };
          })
        );

        if (signal.aborted) return;

        const records = [];
        for (const { docSnap, exercises } of exerciseResults) {
          const sessionData = docSnap.data();
          const sessionDate = sessionData.date?.toDate?.() ?? new Date(sessionData.date);

          const targetExercise = exercises.find((ex) => ex.exerciseKey === exerciseKey);

          if (targetExercise && targetExercise.sets) {
            let maxWeight = 0;
            let maxReps = 0;

            for (const set of targetExercise.sets) {
              const isBW = set.weight === 'BW';
              const w = isBW ? 0 : (parseFloat(set.weight) || 0);
              const r = parseInt(set.reps, 10) || 0;

              if (w > maxWeight) {
                maxWeight = w;
                maxReps = r;
              } else if (w === maxWeight && r > maxReps) {
                maxReps = r;
              }
            }

            records.push({
              date: sessionData.dateString || formatDate(sessionDate),
              maxWeight,
              maxReps,
              timestamp: sessionDate.getTime(),
            });
          }
        }

        // Sort ascending by timestamp (oldest first) and strip temporary timestamp property
        const sortedData = records
          .sort((a, b) => a.timestamp - b.timestamp)
          .map(({ date, maxWeight, maxReps }) => ({ date, maxWeight, maxReps }));

        strengthCache.set(cacheKey, { data: sortedData, expiresAt: Date.now() + CACHE_TTL_MS });

        if (!signal.aborted) {
          setData(sortedData);
        }
      } catch (err) {
        if (!signal.aborted) {
          setError(err.message || 'Failed to fetch strength data.');
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchStrength();

    return () => {
      controller.abort();
    };
  }, [uid, exerciseKey, rangeDays]);

  return { data, loading, error };
}

/**
 * 2. useVolumeData(uid, rangeWeeks = 12)
 * 
 * - Queries last (rangeWeeks * 7) days of sessions.
 * - Groups sessions by ISO week.
 * - Sums totalVolume per week.
 * - Fills missing weeks with 0 volume for a continuous timeline.
 */
export function useVolumeData(uid, rangeWeeks = 12) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const signal = controller.signal;

    async function fetchVolume() {
      setLoading(true);
      setError(null);
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - (rangeWeeks * 7));
        cutoff.setHours(0, 0, 0, 0);

        const sessionsRef = collection(db, 'users', uid, 'sessions');
        const q = query(
          sessionsRef,
          where('date', '>=', cutoff),
          orderBy('date', 'desc'),
          limit(60)
        );

        const sessSnap = await getDocs(q);

        if (signal.aborted) return;

        // Pre-populate all weeks in the range to ensure weeks with no sessions appear as 0
        const weeksMap = {};
        const current = new Date(cutoff.getTime());
        const today = new Date();

        // FIX: Step by one day at a time and register the ISO week for each Monday.
        // Stepping by +7 days from an arbitrary cutoff date would skip ISO weeks if cutoff
        // isn't itself a Monday (which it usually isn't).
        while (current <= today) {
          if (current.getDay() === 1) { // Only register Mondays (ISO week starts)
            const wStr = getISOWeek(current);
            if (!weeksMap[wStr]) weeksMap[wStr] = 0;
          }
          current.setDate(current.getDate() + 1);
        }

        // Ensure current week is in the map
        const todayWStr = getISOWeek(today);
        weeksMap[todayWStr] = 0;

        // Accumulate volume
        sessSnap.docs.forEach((docSnap) => {
          const sessionData = docSnap.data();
          const sessionDate = sessionData.date?.toDate?.() ?? new Date(sessionData.date);
          const weekStr = getISOWeek(sessionDate);

          if (weeksMap[weekStr] !== undefined) {
            weeksMap[weekStr] += sessionData.totalVolume || 0;
          }
        });

        // Format and sort ascending
        const formattedData = Object.entries(weeksMap)
          .map(([week, totalVolume]) => ({ week, totalVolume }))
          .sort((a, b) => a.week.localeCompare(b.week));

        if (!signal.aborted) {
          setData(formattedData);
        }
      } catch (err) {
        if (!signal.aborted) {
          setError(err.message || 'Failed to fetch volume data.');
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchVolume();

    return () => {
      controller.abort();
    };
  }, [uid, rangeWeeks]);

  return { data, loading, error };
}

/**
 * 3. usePRList(uid)
 * 
 * - Single getDocs read on users/{uid}/prs (no real-time listeners).
 * - Returns PR list sorted by date DESC.
 * - Memoised and only refetches on explicit refresh action.
 */
export function usePRList(uid) {
  const [prs, setPrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const signal = controller.signal;

    async function fetchPRs() {
      setLoading(true);
      setError(null);
      try {
        const prsRef = collection(db, 'users', uid, 'prs');
        const querySnapshot = await getDocs(prsRef);

        if (signal.aborted) return;

        const prList = querySnapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            exerciseKey: docSnap.id,
            exerciseName: data.name || data.exerciseName || '',
            weight: data.weight,
            reps: data.reps,
            date: data.date,
          };
        });

        // Sort by date DESC
        const sortedPRs = prList.sort((a, b) => {
          const dateA = a.date?.toDate?.() ? a.date.toDate().getTime() : (a.date ? new Date(a.date).getTime() : 0);
          const dateB = b.date?.toDate?.() ? b.date.toDate().getTime() : (b.date ? new Date(b.date).getTime() : 0);
          return dateB - dateA;
        });

        if (!signal.aborted) {
          setPrs(sortedPRs);
        }
      } catch (err) {
        if (!signal.aborted) {
          setError(err.message || 'Failed to fetch PR list.');
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchPRs();

    return () => {
      controller.abort();
    };
  }, [uid, refreshTrigger]);

  return { prs, loading, error, refresh };
}
