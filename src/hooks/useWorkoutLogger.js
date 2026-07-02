import { useCallback, useRef } from 'react';
import { useWorkoutStore } from '../stores/useWorkoutStore';
import { useXPStore } from '../stores/useXPStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useChallenges } from './useChallenges';
import { clearStrengthCache } from './useProgress';
import { useUIStore } from '../stores/useUIStore';
import { doc, collection, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useWorkoutLogger() {
  const { updateProgress, getActiveChallenges } = useChallenges();
  const retryCountRef   = useRef(0);
  const xpAwardedRef    = useRef(false);

  const finishSession = useCallback(async (uid, debrief, onProgress, setIsWorking) => {
    try {
      if (setIsWorking) setIsWorking(true);
      if (onProgress) onProgress('Compiling session data...');

      const { activeSession: session, exercises, elapsedSeconds } = useWorkoutStore.getState();
      const profile = useAuthStore.getState().profile;
      
      if (!uid || !session) {
        throw new Error('[useWorkoutLogger] Valid UID and active session are required.');
      }

      const payload = {
        session: {
          ...session,
          sessionId: session.sessionId || Date.now().toString() + Math.random().toString(36).substring(2, 9),
          durationMinutes: Math.max(1, Math.round((elapsedSeconds || 0) / 60))
        },
        exercises,
        debrief,
        isQuickLog: session.isQuickLog || false,
        userName: profile?.name || 'Athlete',
        teamSquadCodes: profile?.squadCode ? [profile.squadCode] : []
      };

      if (onProgress) onProgress('Securing workout to the blockchain...');
      
      const token = await useAuthStore.getState().user.getIdToken();
      const apiUrl = import.meta.env.VITE_API_BASE_URL || (
        import.meta.env.DEV ? 'http://localhost:10000' : ''
      );
      const res = await fetch(`${apiUrl}/api/logWorkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      
      const result = await res.json();

      // Optimistic XP update — animates immediately
      if (!xpAwardedRef.current) {
        useXPStore.getState().awardXP(result.xpEarned);
        xpAwardedRef.current = true;
      }

      // SUCCESS — clear cache, reset session, return summary
      retryCountRef.current   = 0;
      xpAwardedRef.current    = false; 
      clearStrengthCache();
      useWorkoutStore.getState().resetSession();

      // Roll chance for Flash Quest (increases to 20% if Recovery Protocol is unlocked)
      const flashChance = profile?.skills?.recoveryProtocol ? 0.2 : 0.1;
      if (Math.random() < flashChance) {
        try {
          const newQuestRef = doc(collection(db, 'challenges'));
          const questDoc = {
            type: 'weak_point',
            subtype: 'quest',
            name: 'Flash Quest: Stretch Out',
            description: 'Perform a 5-minute stretch in your next session to stay limber.',
            creatorUid: uid,
            participants: [uid],
            startDate: serverTimestamp(),
            endDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
            status: 'active',
            durationDays: 2,
            goal: { targetSets: 1, muscleGroup: 'Stretching' },
            rewardXP: 50,
            progress: {
              [uid]: { completedSets: 0, badgeEarned: false }
            }
          };
          await setDoc(newQuestRef, questDoc);
          useUIStore.getState().addToast('⚡ Flash Quest Unlocked: Stretch Out! (+50 XP)', 'info');
        } catch (fqErr) {
          console.error('[useWorkoutLogger] Failed to inject Flash Quest:', fqErr);
        }
      }

      // Trigger challenge progress updates
      try {
        const activeChalls = await getActiveChallenges(uid);
        for (const ch of activeChalls) {
          await updateProgress(uid, ch.id, new Date(), payload.session.sessionId);
        }
      } catch (chErr) {
        console.error('[useWorkoutLogger] Failed to update challenge progress:', chErr);
      }

      return {
        totalVolume: result.totalVolume || 0,
        totalSets: result.totalSets || 0,
        durationMinutes: result.durationMinutes || 0,
        exerciseCount: result.exerciseCount || 0,
        xpEarned: result.xpEarned || 0,
        prCount: result.prCount || 0,
        prNames: result.prNames || [],
        levelUp: result.levelUp || false,
        newLevel: result.newLevel || 1,
        newLevelName: result.newLevelName || 'Rookie',
        xpBreakdown: result.xpBreakdown || null,
        lootDrops: [] // loot drops logic was handled by the backend, could pass them here
      };

    } catch (err) {
      console.error('[useWorkoutLogger] finishSession failed:', err);

      retryCountRef.current += 1;

      throw new Error(
        err?.message?.startsWith('[useWorkoutLogger]')
          ? err.message
          : `[useWorkoutLogger] Could not save session. (${err?.message ?? 'network error'})`
      );
    } finally {
      if (setIsWorking) setIsWorking(false);
    }
  }, [getActiveChallenges, updateProgress]);

  return {
    isActive:   !!useWorkoutStore.getState().activeSession,
    exercises:  useWorkoutStore.getState().exercises,
    retryCount: retryCountRef.current,
    finishSession,
    resetSession: () => useWorkoutStore.getState().resetSession(),
  };
}
