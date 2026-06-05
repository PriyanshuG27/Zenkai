/**
 * useProgress.js
 * Loads historical session data for charts and PR display.
 *
 * Responsibilities:
 * - Fetches /users/{uid}/sessions (last 90 days, ordered by completedAt desc)
 * - Derives weekly volume array for Recharts AreaChart
 * - Fetches /users/{uid}/prs collection for PR display
 * - Exposes loading + error state
 * - Returns { sessions, weeklyVolume, prs, loading, error }
 *
 * weeklyVolume shape: [{ week: 'W23', totalKg: 12400 }, ...]
 * prs shape:          [{ exerciseId, name, weight, reps, date }, ...]
 */

import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db }           from '../lib/firebase';
import { useAuthStore } from '../stores/useAuthStore';

function groupByWeek(sessions) {
  const map = {};
  for (const s of sessions) {
    const d    = s.completedAt?.toDate?.() ?? new Date(s.completedAt);
    const year = d.getFullYear();
    const week = Math.ceil(((d - new Date(year, 0, 1)) / 86400000 + new Date(year, 0, 1).getDay() + 1) / 7);
    const key  = `W${String(week).padStart(2, '0')}`;
    map[key] = (map[key] ?? 0) + (s.totalVolume ?? 0);
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, totalKg]) => ({ week, totalKg }));
}

export function useProgress() {
  const { user } = useAuthStore();
  const [sessions,     setSessions]     = useState([]);
  const [weeklyVolume, setWeeklyVolume] = useState([]);
  const [prs,          setPRs]          = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

  useEffect(() => {
    if (!user) return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Sessions (last 50 entries, Firestore can't do date-range without composite index easily)
        const sessSnap = await getDocs(
          query(collection(db, 'users', user.uid, 'sessions'), orderBy('completedAt', 'desc'), limit(50))
        );
        const sessionList = sessSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSessions(sessionList);
        setWeeklyVolume(groupByWeek(sessionList));

        // PRs
        const prSnap = await getDocs(collection(db, 'users', user.uid, 'prs'));
        setPRs(prSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        setError('Failed to load progress data.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user?.uid]);

  return { sessions, weeklyVolume, prs, loading, error };
}
