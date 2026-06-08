/**
 * useWorkoutLogger.js
 *
 * Session completion hook — owns the entire "finish workout" flow.
 *
 * IMPORTANT: Reads from useWorkoutStore (not sessionStore).
 * MobileLogger uses useWorkoutStore for all session state.
 *
 * ─── finishSession(uid) ────────────────────────────────────────────────────────
 *
 *  PRE-BATCH (deterministic, runs once):
 *    1. Validate uid + active session
 *    2. Snapshot exercises from useWorkoutStore
 *    3. Fetch user profile + existing PRs from Firestore
 *    4. Derive stats: totalVolume, totalSets, durationMinutes
 *    5. Evaluate PRs via Epley 1RM
 *    6. Evaluate streak via evaluateStreak()
 *    7. Calculate XP: base 50 + 10 per PR
 *
 *  OPTIMISTIC UPDATE (before awaiting Firestore):
 *    - xpStore.awardXP(amount) → local level/XP counters animate immediately
 *
 *  ATOMIC BATCH (single writeBatch, 5 operation groups):
 *    1. SET   users/{uid}/sessions/{sessionId}
 *    2. SET   users/{uid}/sessions/{sessionId}/exercises/{id}  (× N)
 *    3. SET   users/{uid}/prs/{exerciseKey}                    (× PRs only)
 *    4. SET   users/{uid}/xpLog/{newId}                       (via batch.set with auto-id)
 *    5. UPDATE users/{uid}                                     (xp, level, streak, streakLastDate)
 *
 *  ON SUCCESS: resetSession() + return summary
 *  ON FAILURE:
 *    - Roll back optimistic XP (xpStore.rollbackXP)
 *    - Increment retryCount
 *    - Session state is PRESERVED so the user can retry
 */

import { useCallback, useRef } from 'react';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  writeBatch,
  serverTimestamp,
  setDoc,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useWorkoutStore } from '../stores/useWorkoutStore';
import { useXPStore } from '../stores/useXPStore';
import { useUIStore } from '../stores/useUIStore';
import { evaluateStreak, deriveLevelFromXP } from '../lib/xpHelpers';
import { useChallenges } from './useChallenges';
import { clearStrengthCache } from './useProgress';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_SESSION_XP = 50;   // awarded for completing any session
const PR_XP           = 10;   // bonus per personal record broken

// ─── Epley 1RM helper (inline — no import needed) ─────────────────────────────
// effectiveWeight × (1 + reps / 30)
// For bodyweight exercises: effectiveWeight = bodyweightKg + addedWeight

const BODYWEIGHT_EXERCISE_KEYS = new Set([
  'push_ups', 'pull_ups', 'chin_ups', 'dips', 'tricep_dips',
  'bodyweight_squat', 'pistol_squat', 'inverted_row',
  'hanging_leg_raise', 'plank', 'burpees', 'mountain_climbers',
]);

function isBodyweightEx(exerciseKey) {
  return BODYWEIGHT_EXERCISE_KEYS.has(exerciseKey);
}

function epley1RM(effectiveWeight, reps) {
  if (reps <= 0) return 0;
  if (reps === 1) return effectiveWeight;
  return effectiveWeight * (1 + reps / 30);
}

function get1RM(weight, reps, isBW, bodyweightKg) {
  const w = weight === 'BW' ? 0 : (parseFloat(weight) || 0);
  const r = parseInt(reps, 10) || 0;
  const effective = isBW ? (bodyweightKg + w) : w;
  return epley1RM(effective, r);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkoutLogger() {
  const { updateProgress, getActiveChallenges } = useChallenges();
  // Cache built payload across retries (avoids re-calculating on retry)
  const pendingBatchRef = useRef(null);
  const retryCountRef   = useRef(0);

  // ── _buildBatchPayload ──────────────────────────────────────────────────────
  const _buildBatchPayload = useCallback(async (uid) => {
    // ── a. Snapshot current state directly from useWorkoutStore ──────────────
    const { activeSession: session, exercises: exercisesSnapshot } = useWorkoutStore.getState();

    // ── b. Validate ────────────────────────────────────────────────────────────
    if (!uid || typeof uid !== 'string' || uid.trim() === '') {
      throw new Error('[useWorkoutLogger] A valid UID is required.');
    }
    if (!session) {
      throw new Error('[useWorkoutLogger] No active session found.');
    }

    // ── c. Fetch user profile + PRs + weekly sessions + joined squads ────────
    const userRef   = doc(db, 'users', uid);
    const prsColRef = collection(db, 'users', uid, 'prs');

    const today = new Date();
    const currentDay = today.getDay();
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - daysToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const sessionsRef = collection(db, 'users', uid, 'sessions');
    const weeklySessionsQuery = query(sessionsRef, where('date', '>=', startOfWeek));

    const squadsColRef = collection(db, 'shared_squads');
    const squadsQuery = query(squadsColRef, where('memberUids', 'array-contains', uid));

    const [userSnap, prsSnap, weeklySessionsSnap, squadsSnap] = await Promise.all([
      getDoc(userRef),
      getDocs(prsColRef),
      getDocs(weeklySessionsQuery),
      getDocs(squadsQuery),
    ]);

    if (!userSnap.exists()) {
      throw new Error('[useWorkoutLogger] User profile not found in Firestore.');
    }

    const userData       = userSnap.data();
    const userBodyweight = parseFloat(userData.weightKg) || 70;

    const existingPRsMap = {};
    prsSnap.docs.forEach((d) => { existingPRsMap[d.id] = d.data(); });

    // ── d. Derive stats ────────────────────────────────────────────────────────
    let totalSets   = 0;
    let totalVolume = 0;

    exercisesSnapshot.forEach((ex) => {
      ex.sets.forEach((s) => {
        // Support both 'done' and 'completed' flags (legacy compat)
        if (s.done || s.completed) {
          totalSets += 1;
          const w = s.weight === 'BW' ? 0 : (parseFloat(s.weight) || 0);
          totalVolume += w * (parseInt(s.reps, 10) || 0);
        }
      });
    });

    if (totalSets === 0) {
      throw new Error(
        '[useWorkoutLogger] Cannot save — no sets marked as done. ' +
        'Tap the circle button on at least one set before finishing.'
      );
    }

    const startedAt       = session.startedAt ? new Date(session.startedAt) : new Date();
    const durationMinutes = Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 60000));
    const sessionId       = crypto.randomUUID();
    const nowLocal = new Date();
    const dateString = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;

    // ── e. Evaluate PRs ────────────────────────────────────────────────────────
    const newPRs     = [];
    const exerciseDocs = [];

    exercisesSnapshot.forEach((ex) => {
      // Support both 'done' and 'completed' flags
      const doneSets = ex.sets.filter((s) => s.done || s.completed);
      if (doneSets.length === 0) return;

      // exerciseId: useWorkoutStore uses 'exerciseId' as the key
      const exerciseId  = ex.exerciseId ?? ex.id ?? crypto.randomUUID();
      const exerciseKey = ex.exerciseKey ?? ex.exerciseId ?? exerciseId;

      // Build exercise sub-document
      exerciseDocs.push({
        exerciseId,
        name:        ex.name,
        exerciseKey,
        muscleGroup: ex.muscleGroup ?? '',
        sets: doneSets.map((s) => ({
          reps:   parseInt(s.reps, 10)  || 0,
          weight: s.weight === 'BW' ? 'BW' : (parseFloat(s.weight) || 0),
          done:   true,
        })),
        volume: doneSets.reduce(
          (sum, s) => sum + (s.weight === 'BW' ? 0 : (parseFloat(s.weight) || 0)) * (parseInt(s.reps, 10) || 0),
          0
        ),
      });

      // Find best set in this session by Epley 1RM
      const isBW = isBodyweightEx(exerciseKey);
      let best1RM    = -Infinity;
      let bestWeight = 0;
      let bestReps   = 0;

      doneSets.forEach((s) => {
        const e1rm = get1RM(s.weight, s.reps, isBW, userBodyweight);
        if (e1rm > best1RM) {
          best1RM    = e1rm;
          bestWeight = s.weight === 'BW' ? 'BW' : (parseFloat(s.weight) || 0);
          bestReps   = parseInt(s.reps, 10) || 0;
        }
      });

      // Compare to stored PR
      const stored     = existingPRsMap[exerciseKey];
      const stored1RM  = stored
        ? get1RM(stored.weight, stored.reps, isBW, userBodyweight)
        : 0;

      if (best1RM > stored1RM) {
        newPRs.push({
          exerciseKey,
          exerciseId,
          name:       ex.name,
          weight:     bestWeight,
          reps:       bestReps,
          best1RM,
        });
      }
    });

    // ── f. Evaluate streak ─────────────────────────────────────────────────────
    let lastDate = null;
    if (userData.streakLastDate) {
      lastDate = typeof userData.streakLastDate.toDate === 'function'
        ? userData.streakLastDate.toDate()
        : new Date(userData.streakLastDate);
    }
    const { newStreak } = evaluateStreak(lastDate, userData.streak ?? 0);

    // ── g. Calculate XP (deterministic — before any write) ────────────────────
    const isBossFight = session.planDayId && String(session.planDayId).startsWith('boss_fight_');
    const bossBonusXP = isBossFight ? 200 : 0;

    let powerUpsUpdate = null;
    let lootDrops = [];
    if (isBossFight) {
      const dropType = Math.random() < 0.5 ? 'streakShield' : 'xpBooster';
      const powerUps = userData.powerUps || {};
      const streakShield = powerUps.streakShield || 0;
      const xpBooster = powerUps.xpBooster || 0;
      powerUpsUpdate = {
        ...powerUps,
        streakShield: dropType === 'streakShield' ? streakShield + 1 : streakShield,
        xpBooster: dropType === 'xpBooster' ? xpBooster + 1 : xpBooster,
      };
      lootDrops.push(dropType === 'streakShield' ? 'Streak Shield' : 'XP Booster');
    }

    const currentPR_XP = userData.skills?.adrenalineRush ? 12 : PR_XP;
    const isOverdrive = session.isOverdrive || false;
    const overdriveMultiplier = isOverdrive ? 1.5 : 1.0;

    const boosterUntil = userData.xpBoosterUntil
      ? (typeof userData.xpBoosterUntil.toDate === 'function' ? userData.xpBoosterUntil.toDate().getTime() : new Date(userData.xpBoosterUntil).getTime())
      : 0;
    const isBoosterActive = boosterUntil > Date.now();
    const boosterMultiplier = isBoosterActive ? 2.0 : 1.0;

    const currentXP  = typeof userData.xp === 'number' ? userData.xp : 0;
    const isLockedIn = session.moodTag === 'locked_in';
    const adrenalineBonus = (isLockedIn && newPRs.length > 0) ? 15 : 0;
    const gritBonus = session.stomachFlag ? 20 : 0;
    
    const xpEarned   = Math.round((BASE_SESSION_XP + newPRs.length * currentPR_XP + bossBonusXP + adrenalineBonus + gritBonus) * overdriveMultiplier * boosterMultiplier);
    const newXP      = currentXP + xpEarned;
    const prevDerived = deriveLevelFromXP(currentXP);
    const newDerived  = deriveLevelFromXP(newXP);
    const levelUp     = newDerived.level > prevDerived.level;

    // ── h. Session document fields ─────────────────────────────────────────────
    const sessionDoc = {
      planDayId:       session.planDayId      ?? 'custom',
      date:            serverTimestamp(),
      dateString,
      moodTag:         session.moodTag        ?? 'average',
      stomachFlag:     Boolean(session.stomachFlag),
      safeMode:        Boolean(session.stomachFlag), // deload tag
      totalVolume,
      totalSets,
      durationMinutes,
      xpEarned,
      xpBreakdown: {
        baseXP: BASE_SESSION_XP,
        prCount: newPRs.length,
        prXP: currentPR_XP,
        adrenalineBonus,
        gritBonus,
        bossBonusXP,
        overdriveMultiplier,
        boosterMultiplier,
      },
      prCount:         newPRs.length,
      isOverdrive,
      isXPBoosterActive: isBoosterActive,
    };

    // Compile latest lifts dictionary for profile caching
    const activeLifts = {};
    exercisesSnapshot.forEach((ex) => {
      const exerciseKey = ex.exerciseKey ?? ex.exerciseId ?? ex.id;
      const completedSets = ex.sets.filter((s) => s.done || s.completed);
      if (completedSets.length > 0) {
        activeLifts[exerciseKey] = completedSets.map((s) => ({
          weight: s.weight === 'BW' ? 'BW' : (parseFloat(s.weight) || 0),
          reps: parseInt(s.reps, 10) || 0
        }));
      }
    });

    const latestLiftsMap = {
      ...(userData.latestLiftsMap || {}),
      ...activeLifts
    };

    const activeRestTimes = {};
    exercisesSnapshot.forEach((ex) => {
      const exerciseKey = ex.exerciseKey ?? ex.exerciseId;
      if (ex.restTimer !== undefined) {
        activeRestTimes[exerciseKey] = ex.restTimer;
      }
    });

    const latestRestTimesMap = {
      ...(userData.latestRestTimesMap || {}),
      ...activeRestTimes
    };

    let weeklyVolume = 0;
    weeklySessionsSnap.forEach((docSnap) => {
      weeklyVolume += docSnap.data().totalVolume || 0;
    });
    weeklyVolume += totalVolume;

    // ── Evaluate active squad synergy challenges ────────────────────────────
    const squadChallengeUpdates = [];
    squadsSnap.docs.forEach((squadDoc) => {
      const squadData = squadDoc.data();
      const activeChall = squadData.activeChallenge;
      
      if (activeChall && activeChall.status === 'active' && Date.now() <= activeChall.endDate) {
        let matchingSets = 0;
        exerciseDocs.forEach((ex) => {
          const exGroup = (ex.muscleGroup || '').toLowerCase();
          const challGroup = (activeChall.muscleGroup || '').toLowerCase();
          let mappedExGroup = exGroup;
          if (exGroup === 'legs' || exGroup === 'quads' || exGroup === 'hamstrings' || exGroup === 'calves' || exGroup === 'glutes') {
            mappedExGroup = 'legs';
          }
          if (mappedExGroup === challGroup) {
            matchingSets += ex.sets?.length || 0;
          }
        });
        
        if (matchingSets > 0) {
          const progressMap = { ...(activeChall.progress || {}) };
          progressMap[uid] = (progressMap[uid] || 0) + matchingSets;
          
          let totalCompletedSets = 0;
          Object.keys(progressMap).forEach((memberUid) => {
            totalCompletedSets += progressMap[memberUid] || 0;
          });
          
          let status = activeChall.status || 'active';
          if (totalCompletedSets >= activeChall.targetSets) {
            status = 'completed';
          }
          
          squadChallengeUpdates.push({
            squadCode: squadDoc.id,
            activeChallenge: {
              ...activeChall,
              progress: progressMap,
              totalCompletedSets,
              status
            }
          });
        }
      }
    });

    return {
      uid,
      userRef,
      sessionId,
      sessionDoc,
      exerciseDocs,
      newPRs,
      xpEarned,
      newXP,
      newDerived,
      newStreak,
      levelUp,
      powerUps: powerUpsUpdate,
      latestLiftsMap,
      latestRestTimesMap,
      skills: userData.skills || {},
      squadCode: userData.squadCode || null,
      userName: userData.name || 'Anonymous Bro',
      weeklyVolume,
      squadChallengeUpdates,
      summary: {
        sessionId,
        totalVolume,
        totalSets,
        durationMinutes,
        exerciseCount: exerciseDocs.length,
        prCount:       newPRs.length,
        prNames:       newPRs.map((p) => p.name),
        prs:           newPRs,
        xpEarned,
        xpBreakdown: {
          baseXP: BASE_SESSION_XP,
          prCount: newPRs.length,
          prXP: currentPR_XP,
          adrenalineBonus,
          gritBonus,
          bossBonusXP,
          overdriveMultiplier,
          boosterMultiplier,
        },
        levelUp,
        newLevel:     newDerived.level,
        newLevelName: newDerived.levelName,
        lootDrops,
      },
    };
  }, []);

  // ── _commitBatch ────────────────────────────────────────────────────────────
  const _commitBatch = useCallback(async (payload) => {
    const {
      uid, userRef, sessionId, sessionDoc, exerciseDocs,
      newPRs, xpEarned, newXP, newDerived, newStreak,
      powerUps, latestLiftsMap, latestRestTimesMap,
      squadCode, userName, weeklyVolume, squadChallengeUpdates
    } = payload;

    const batch = writeBatch(db);

    // Op 1 — Session document
    const sessionRef = doc(db, 'users', uid, 'sessions', sessionId);
    batch.set(sessionRef, sessionDoc);

    // Op 2 — Exercise sub-documents
    exerciseDocs.forEach((ex) => {
      const exRef = doc(db, 'users', uid, 'sessions', sessionId, 'exercises', ex.exerciseId);
      batch.set(exRef, ex);
    });

    // Op 3 — PR documents (only exercises with new PRs)
    newPRs.forEach((pr) => {
      const prRef = doc(db, 'users', uid, 'prs', pr.exerciseKey);
      batch.set(prRef, {
        exerciseKey: pr.exerciseKey,
        exerciseId:  pr.exerciseId,
        name:        pr.name,
        weight:      pr.weight,
        reps:        pr.reps,
        date:        serverTimestamp(),
      }, { merge: true });
    });

    // Op 4 — XP log entry (addDoc equivalent inside a batch)
    const xpLogRef = doc(collection(db, 'users', uid, 'xpLog'));
    batch.set(xpLogRef, {
      source:    'session_logged',
      amount:    xpEarned,
      sessionId,
      prCount:   newPRs.length,
      timestamp: serverTimestamp(),
    });

    // Op 5 — User profile update
    const userUpdates = {
      xp:                 newXP,
      level:              newDerived.level,
      levelName:          newDerived.levelName,
      streak:             newStreak,
      streakLastDate:     serverTimestamp(),
      latestLiftsMap:     latestLiftsMap || {}, // flat cache map update
      latestRestTimesMap: latestRestTimesMap || {}, // flat cache map update
    };
    if (powerUps) {
      userUpdates.powerUps = powerUps;
    }
    batch.update(userRef, userUpdates);

    // Op 6 — Update public squad_codes if user has a squadCode
    if (squadCode) {
      const codeRef = doc(db, 'squad_codes', squadCode);
      batch.set(codeRef, {
        uid,
        name: userName,
        xp: newXP,
        level: newDerived.level,
        streak: newStreak,
        volume: weeklyVolume,
        squadCode: squadCode,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // Op 7 — Update squad challenges if any matching sets were performed
    if (squadChallengeUpdates && squadChallengeUpdates.length > 0) {
      squadChallengeUpdates.forEach((upd) => {
        const squadRef = doc(db, 'shared_squads', upd.squadCode);
        batch.set(squadRef, { activeChallenge: upd.activeChallenge }, { merge: true });
      });
    }

    await batch.commit();
  }, []);

  // ── finishSession ───────────────────────────────────────────────────────────
  const finishSession = useCallback(async (uid) => {
    try {
      // Build payload once; reuse on retry
      let payload = pendingBatchRef.current;
      if (!payload) {
        payload = await _buildBatchPayload(uid);
        pendingBatchRef.current = payload;
      }

      // Optimistic XP update — animates immediately before network round-trip
      useXPStore.getState().awardXP(payload.xpEarned);

      // Atomic Firestore write
      await _commitBatch(payload);

      // SUCCESS — clear cache, reset session, return summary
      pendingBatchRef.current = null;
      retryCountRef.current   = 0;
      clearStrengthCache();
      useWorkoutStore.getState().resetSession();

      // Roll chance for Flash Quest (increases to 20% if Recovery Protocol is unlocked)
      const flashChance = payload.skills?.recoveryProtocol ? 0.2 : 0.1;
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
          await updateProgress(uid, ch.id, new Date());
        }
      } catch (chErr) {
        console.error('[useWorkoutLogger] Failed to update challenge progress:', chErr);
      }

      return payload.summary;

    } catch (err) {
      console.error('[useWorkoutLogger] finishSession failed:', err);

      // Roll back the optimistic XP we speculatively added
      if (pendingBatchRef.current) {
        useXPStore.getState().rollbackXP(pendingBatchRef.current.xpEarned);
      }

      retryCountRef.current += 1;

      // Re-throw so MobileLogger can show the retry button
      throw new Error(
        err?.message?.startsWith('[useWorkoutLogger]')
          ? err.message
          : `[useWorkoutLogger] Could not save session. (${err?.message ?? 'network error'})`
      );
    }
  }, [_buildBatchPayload, _commitBatch]);

  return {
    isActive:   !!useWorkoutStore.getState().activeSession,
    exercises:  useWorkoutStore.getState().exercises,
    retryCount: retryCountRef.current,
    finishSession,
    resetSession: () => useWorkoutStore.getState().resetSession(),
  };
}
