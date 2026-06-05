/**
 * useChallenges.js
 * Loads and manages challenge participation state.
 *
 * Responsibilities:
 * - Fetches /challenges collection (active challenges)
 * - Fetches /users/{uid}/challengeProgress subcollection
 * - joinChallenge(challengeId): writes to /users/{uid}/challengeProgress,
 *   calls awardXP Cloud Function (+10 XP)
 * - Returns { challenges, userProgress, loading, error, joinChallenge }
 *
 * challenges shape: [{ id, name, description, durationDays, xpReward, type }]
 * userProgress shape: { [challengeId]: { joinedAt, currentDay, completed } }
 */

import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable }  from 'firebase/functions';
import { db, functions }  from '../lib/firebase';
import { useAuthStore }   from '../stores/useAuthStore';
import { useXPStore }     from '../stores/useXPStore';
import { useUIStore }     from '../stores/useUIStore';

const XP_CHALLENGE_JOIN = 10;

export function useChallenges() {
  const { user } = useAuthStore();
  const { awardXP } = useXPStore();
  const { addToast } = useUIStore();

  const [challenges,    setChallenges]    = useState([]);
  const [userProgress,  setUserProgress]  = useState({});
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);

  useEffect(() => {
    if (!user) return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [chalSnap, progSnap] = await Promise.all([
          getDocs(collection(db, 'challenges')),
          getDocs(collection(db, 'users', user.uid, 'challengeProgress')),
        ]);
        setChallenges(chalSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        const progress = {};
        progSnap.docs.forEach((d) => { progress[d.id] = d.data(); });
        setUserProgress(progress);
      } catch (err) {
        setError('Failed to load challenges.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user?.uid]);

  const joinChallenge = useCallback(async (challengeId) => {
    if (!user || userProgress[challengeId]) return;
    try {
      await setDoc(doc(db, 'users', user.uid, 'challengeProgress', challengeId), {
        joinedAt:   serverTimestamp(),
        currentDay: 1,
        completed:  false,
      });
      setUserProgress((prev) => ({ ...prev, [challengeId]: { joinedAt: new Date(), currentDay: 1, completed: false } }));

      const fn = httpsCallable(functions, 'awardChallengeJoin');
      await fn({ uid: user.uid, challengeId });

      awardXP(XP_CHALLENGE_JOIN);
      addToast(`+${XP_CHALLENGE_JOIN} XP — Challenge joined! 🔥`, 'xp');
    } catch (err) {
      addToast('Failed to join challenge. Try again.', 'error');
    }
  }, [user?.uid, userProgress]);

  return { challenges, userProgress, loading, error, joinChallenge };
}
