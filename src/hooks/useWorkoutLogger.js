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
  increment,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useWorkoutStore } from '../stores/useWorkoutStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useXPStore } from '../stores/useXPStore';
import { useUIStore } from '../stores/useUIStore';
import { evaluateStreak, deriveLevelFromXP } from '../lib/xpHelpers';
import { getBWEffectiveFraction } from '../utils/bwEffectiveLoad';
import { useChallenges } from './useChallenges';
import { clearStrengthCache } from './useProgress';
import { determineWorkoutName } from '../lib/firestoreUtils';

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

function getAbsoluteCap(exerciseKey) {
  const key = (exerciseKey || '').toLowerCase();
  if (key.includes('bench_press') || key.includes('benchpress')) return 150;
  if (key.includes('squat')) return 200;
  if (key.includes('deadlift')) return 220;
  if (key.includes('overhead_press') || key.includes('shoulder_press') || key.includes('ohp')) return 90;
  if (key.includes('curl')) return 70;
  if (key.includes('leg_press') || key.includes('legpress')) return 400;
  if (key.includes('dumbbell')) return 60;
  return 120;
}

function getGameCalculatedWeight(weight, exerciseKey, totalSessions, existingPR) {
  if (weight === 'BW') return 'BW';
  const w = parseFloat(weight) || 0;
  if (totalSessions < 5) {
    const cap = getAbsoluteCap(exerciseKey);
    return Math.min(w, cap);
  } else if (existingPR && existingPR.weight !== 'BW') {
    const prevW = parseFloat(existingPR.weight) || 0;
    if (prevW > 0) {
      return Math.min(w, prevW * 1.3);
    }
  }
  return w;
}

const formatExerciseName = (name, key) => {
  if (name && name.trim() !== '') return name;
  if (!key) return 'Unknown Exercise';
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getWorkoutSummaryName = (exerciseDocs) => {
  if (!exerciseDocs || exerciseDocs.length === 0) return 'Custom Workout';

  // Get muscle groups
  const muscleGroups = exerciseDocs
    .map(ex => {
      const mg = (ex.muscleGroup || '').toLowerCase().trim();
      // Map sub-groups to main groups
      if (['quads', 'hamstrings', 'glutes', 'calves', 'legs', 'quad', 'hamstring', 'glute', 'calf'].includes(mg)) return 'legs';
      if (['chest'].includes(mg)) return 'chest';
      if (['back'].includes(mg)) return 'back';
      if (['shoulders', 'shoulder', 'delts'].includes(mg)) return 'shoulders';
      if (['biceps', 'triceps', 'forearms', 'bicep', 'tricep', 'arms'].includes(mg)) return 'arms';
      if (['core', 'abs', 'obliques'].includes(mg)) return 'core';
      return mg;
    })
    .filter(mg => mg !== '');

  const uniqueGroups = [...new Set(muscleGroups)];

  if (uniqueGroups.length === 0) return 'Workout Session';

  // Check for Push/Pull/Legs patterns
  const hasChest = uniqueGroups.includes('chest');
  const hasShoulders = uniqueGroups.includes('shoulders');
  const hasArms = uniqueGroups.includes('arms');
  const hasBack = uniqueGroups.includes('back');
  const hasLegs = uniqueGroups.includes('legs');

  // Push: Chest, Shoulders, Arms (or any combination of them if no Back/Legs)
  const isPush = (hasChest || hasShoulders || hasArms) && !hasBack && !hasLegs;
  // Pull: Back, Arms (or combination if no Chest/Legs)
  const isPull = (hasBack || hasArms) && !hasChest && !hasLegs && !hasShoulders;
  const isLegsOnly = hasLegs && !hasChest && !hasBack && !hasShoulders && !hasArms;

  if (isPush) {
    const pushCount = [hasChest, hasShoulders, hasArms].filter(Boolean).length;
    if (pushCount >= 2) return 'Push Workout';
  }

  if (isPull) {
    const pullCount = [hasBack, hasArms].filter(Boolean).length;
    if (pullCount >= 2) return 'Pull Workout';
  }

  if (isLegsOnly) return 'Legs Workout';

  // Full Body check
  if (uniqueGroups.length >= 3 && hasLegs && (hasChest || hasShoulders || hasBack)) {
    return 'Full Body Workout';
  }

  // Capitalize muscle group names for display
  const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

  if (uniqueGroups.length === 1) {
    return `${capitalize(uniqueGroups[0])} Workout`;
  }

  if (uniqueGroups.length === 2) {
    return `${capitalize(uniqueGroups[0])} & ${capitalize(uniqueGroups[1])} Workout`;
  }

  return `${capitalize(uniqueGroups[0])} & ${capitalize(uniqueGroups[1])} Workout`;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkoutLogger() {
  const { updateProgress, getActiveChallenges } = useChallenges();
  // Cache built payload across retries (avoids re-calculating on retry)
  const pendingBatchRef = useRef(null);
  const retryCountRef   = useRef(0);
  // Track whether optimistic XP has already been awarded for the current session.
  // Prevents double-award when finishSession() is called again after a network failure.
  const xpAwardedRef    = useRef(false);

  // ── _buildBatchPayload ──────────────────────────────────────────────────────
  const _buildBatchPayload = useCallback(async (uid, debrief) => {
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

    // Skip the squad getDocs if user has no squad — saves 1 Firestore read per session save.
    // Use profile from useAuthStore (already synced via App.jsx onSnapshot).
    const profileSquadCode = useAuthStore.getState().profile?.squadCode;

    const [userSnap, prsSnap, weeklySessionsSnap, squadsSnap] = await Promise.all([
      getDoc(userRef),
      getDocs(prsColRef),
      getDocs(weeklySessionsQuery),
      profileSquadCode ? getDocs(squadsQuery) : Promise.resolve({ docs: [] }),
    ]);

    if (!userSnap.exists()) {
      throw new Error('[useWorkoutLogger] User profile not found in Firestore.');
    }

    const userData       = userSnap.data();
    const userBodyweight = parseFloat(userData.weightKg) || 70;
    const totalSessions  = userData.totalSessions || 0;
    const isQuickLog     = !!session.isQuickLog;

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
          // BW volume: use research-backed effective fraction of bodyweight per exercise
          const gameWeight = getGameCalculatedWeight(s.weight, ex.exerciseKey ?? ex.exerciseId, totalSessions, existingPRsMap[ex.exerciseKey ?? ex.exerciseId]);
          const w = gameWeight === 'BW'
            ? userBodyweight * getBWEffectiveFraction(ex.exerciseKey ?? ex.exerciseId ?? '')
            : (parseFloat(gameWeight) || 0);
          totalVolume += w * (parseInt(s.reps, 10) || 0);
        }
      });
    });

    totalVolume = Math.round(totalVolume);

    if (totalSets === 0) {
      throw new Error(
        '[useWorkoutLogger] Cannot save — no sets marked as done. ' +
        'Tap the circle button on at least one set before finishing.'
      );
    }

    const startedAt       = session.startedAt ? new Date(session.startedAt) : new Date();
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 1000));
    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
    const sessionId       = crypto.randomUUID();
    const nowLocal = new Date();
    const dateString = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;

    // Silent guards for Active Sessions
    let sessionQuality = 'clean';
    let isFlagged = false;
    if (!isQuickLog) {
      const secondsPerSet = totalSets > 0 ? durationSeconds / totalSets : 0;
      if (secondsPerSet < 25) {
        sessionQuality = 'velocity_flagged';
        isFlagged = true;
      } else if (durationMinutes < 15) {
        sessionQuality = 'duration_flagged';
        isFlagged = true;
      }
    }
    const shouldDowngrade = isQuickLog || isFlagged;

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
        name:        formatExerciseName(ex.name, exerciseKey),
        exerciseKey,
        muscleGroup: ex.muscleGroup ?? '',
        sets: doneSets.map((s) => ({
          reps:   parseInt(s.reps, 10)  || 0,
          weight: s.weight === 'BW' ? 'BW' : (parseFloat(s.weight) || 0),
          done:   true,
        })),
        volume: Math.round(doneSets.reduce(
          (sum, s) => {
            const gameWeight = getGameCalculatedWeight(s.weight, exerciseKey, totalSessions, existingPRsMap[exerciseKey]);
            const w = gameWeight === 'BW'
              ? userBodyweight * getBWEffectiveFraction(exerciseKey)
              : (parseFloat(gameWeight) || 0);
            return sum + w * (parseInt(s.reps, 10) || 0);
          },
          0
        )),
      });

      // Find best set in this session by Epley 1RM
      const isBW = isBodyweightEx(exerciseKey);
      let best1RM    = -Infinity;
      let bestWeight = 0;
      let bestReps   = 0;

      doneSets.forEach((s) => {
        const gameWeight = getGameCalculatedWeight(s.weight, exerciseKey, totalSessions, existingPRsMap[exerciseKey]);
        const e1rm = get1RM(gameWeight, s.reps, isBW, userBodyweight);
        if (e1rm > best1RM) {
          best1RM    = e1rm;
          bestWeight = s.weight === 'BW' ? 'BW' : (parseFloat(gameWeight) || 0);
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
          name:       formatExerciseName(ex.name, exerciseKey),
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
    if (isBossFight && !shouldDowngrade) {
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
    
    let xpEarned = 0;
    if (shouldDowngrade) {
      xpEarned = 20;
    } else {
      xpEarned = Math.round((BASE_SESSION_XP + newPRs.length * currentPR_XP + bossBonusXP + adrenalineBonus + gritBonus) * overdriveMultiplier * boosterMultiplier);
    }
    const newXP      = currentXP + xpEarned;
    const prevDerived = deriveLevelFromXP(currentXP);
    const newDerived  = deriveLevelFromXP(newXP);
    const levelUp     = newDerived.level > prevDerived.level;

    // ── h-1. Compute bestLift for recap (stored on session doc, avoids subcollection reads in useWeeklyRecap)
    let bestLiftObj = null;
    let maxW = 0;
    let maxBWReps = 0;
    exercisesSnapshot.forEach((ex) => {
      const isBW = isBodyweightEx(ex.exerciseKey ?? ex.exerciseId ?? '');
      (ex.sets || []).filter(s => s.done || s.completed).forEach((s) => {
        const gameWeight = getGameCalculatedWeight(s.weight, ex.exerciseKey ?? ex.exerciseId, totalSessions, existingPRsMap[ex.exerciseKey ?? ex.exerciseId]);
        const w = gameWeight === 'BW' ? 0 : (parseFloat(gameWeight) || 0);
        const r = parseInt(s.reps, 10) || 0;
        if (!isBW && w > maxW) { maxW = w; bestLiftObj = { name: ex.name, weight: w, isBW: false }; }
        if (isBW && r > maxBWReps) { maxBWReps = r; bestLiftObj = { name: ex.name, weight: 'BW', reps: r, isBW: true }; }
      });
    });

    // ── h. Session document fields ─────────────────────────────────────────────
    const sessionDoc = {
      planDayId:       session.planDayId      ?? 'custom',
      name:            (session.planDayId === 'custom' || !session.planDayId)
                         ? determineWorkoutName(exercisesSnapshot)
                         : (session.planDayId && String(session.planDayId).startsWith('boss_fight_')
                            ? (session.name || 'Titan Raid')
                            : `Day ${session.planDayId} Session`),
      prsList:         newPRs.map(pr => ({ name: pr.name, weight: pr.weight, reps: pr.reps })),
      exercisesList:   exercisesSnapshot.filter(ex => ex.sets.some(s => s.done || s.completed)).map(ex => ({
        name: ex.name,
        key: ex.exerciseKey || ex.exerciseId,
        muscleGroup: ex.muscleGroup || '',
        setsCount: ex.sets.filter(s => s.done || s.completed).length
      })),
      exercises:       exerciseDocs,
      date:            serverTimestamp(),
      dateString,
      moodTag:         session.moodTag        ?? 'average',
      stomachFlag:     Boolean(session.stomachFlag),
      safeMode:        Boolean(session.stomachFlag), // deload tag
      totalVolume,
      totalSets,
      durationMinutes,
      xpEarned,
      xpBreakdown: shouldDowngrade ? {
        baseXP: 20,
        prCount: 0,
        prXP: 0,
        adrenalineBonus: 0,
        gritBonus: 0,
        bossBonusXP: 0,
        overdriveMultiplier: 1,
        boosterMultiplier: 1,
      } : {
        baseXP: BASE_SESSION_XP,
        prCount: newPRs.length,
        prXP: currentPR_XP,
        adrenalineBonus,
        gritBonus,
        bossBonusXP,
        overdriveMultiplier,
        boosterMultiplier,
      },
      prCount:         shouldDowngrade ? 0 : newPRs.length,
      isOverdrive,
      isXPBoosterActive: isBoosterActive,
      bestLift: bestLiftObj, // recap summary — avoids exercises subcollection reads in useWeeklyRecap
      debrief: {
        pain: debrief?.pain || [],
        easy: debrief?.easy || [],
        brokenEquipment: debrief?.brokenEquipment || [],
      },
      sessionQuality: isQuickLog ? 'quick_log' : sessionQuality,
      isQuickLog,
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
    if (!shouldDowngrade) {
      squadsSnap.docs.forEach((squadDoc) => {
        const squadData = squadDoc.data();
        const activeChall = squadData.activeChallenge;
        
        if (activeChall && activeChall.status === 'active' && Date.now() <= activeChall.endDate) {
          // Double Lock: check if already completed to prevent duplicate rewards
          if (activeChall.status === 'completed' || (activeChall.currentHP !== undefined && activeChall.currentHP <= 0)) {
            return;
          }

          if (activeChall.isTitanRaid) {
            // 1. Titan Raid Damage Calculation
            let sessionDamage = 0;
            exerciseDocs.forEach((ex) => {
              let exGroup = (ex.muscleGroup || '').toUpperCase();
              if (exGroup === 'QUADS' || exGroup === 'HAMSTRINGS' || exGroup === 'GLUTES' || exGroup === 'CALVES') {
                exGroup = 'LEGS';
              }
              const weakness = (activeChall.weakness || '').toUpperCase();
              const isWeakness = exGroup === weakness;
              
              let exVol = 0;
              ex.sets?.forEach((s) => {
                const gameWeight = getGameCalculatedWeight(s.weight, ex.exerciseKey, totalSessions, existingPRsMap[ex.exerciseKey]);
                const w = gameWeight === 'BW' ? 0 : (parseFloat(gameWeight) || 0);
                exVol += w * (parseInt(s.reps, 10) || 0);
              });
              
              sessionDamage += exVol * (isWeakness ? 1.5 : 1.0);
            });
            
            if (sessionDamage > 0) {
              const currentHP = activeChall.currentHP !== undefined ? activeChall.currentHP : activeChall.totalHP;
              const updates = {
                "activeChallenge.currentHP": increment(-sessionDamage),
                [`activeChallenge.progress.${uid}`]: increment(sessionDamage)
              };
              
              if (currentHP - sessionDamage <= 0) {
                updates["activeChallenge.status"] = "completed";
                updates["activeChallenge.currentHP"] = 0; // clamp at 0
                updates["activeChallenge.completedAt"] = Date.now();
              }
              
              squadChallengeUpdates.push({
                squadCode: squadDoc.id,
                updates
              });
            }
          } else {
            // 2. Standard sets-based challenge
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
              const currentSets = activeChall.totalCompletedSets || 0;
              const updates = {
                "activeChallenge.totalCompletedSets": increment(matchingSets),
                [`activeChallenge.progress.${uid}`]: increment(matchingSets)
              };
              
              if (currentSets + matchingSets >= activeChall.targetSets) {
                updates["activeChallenge.status"] = "completed";
                updates["activeChallenge.completedAt"] = Date.now();
              }
              
              squadChallengeUpdates.push({
                squadCode: squadDoc.id,
                updates
              });
            }
          }
        }
      });
    }

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
      isQuickLog,
      totalVolume,
      teamSquadCodes: squadsSnap.docs.map(d => d.id),
      summary: {
        sessionId,
        totalVolume,
        totalSets,
        durationMinutes,
        exerciseCount: exerciseDocs.length,
        prCount:       shouldDowngrade ? 0 : newPRs.length,
        prNames:       shouldDowngrade ? [] : newPRs.map((p) => `${p.name} (${p.weight === 'BW' ? 'BW' : p.weight + ' kg'} x ${p.reps})`),
        prs:           shouldDowngrade ? [] : newPRs,
        xpEarned,
        xpBreakdown: shouldDowngrade ? {
          baseXP: 20,
          prCount: 0,
          prXP: 0,
          adrenalineBonus: 0,
          gritBonus: 0,
          bossBonusXP: 0,
          overdriveMultiplier: 1,
          boosterMultiplier: 1,
        } : {
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
      squadCode, userName, weeklyVolume, squadChallengeUpdates,
      isQuickLog, totalVolume, teamSquadCodes
    } = payload;

    const batch = writeBatch(db);

    // Op 1 — Session document (including embedded exercises)
    const sessionRef = doc(db, 'users', uid, 'sessions', sessionId);
    batch.set(sessionRef, sessionDoc);

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
      totalSessions:      increment(1),
      latestLiftsMap:     latestLiftsMap || {}, // flat cache map update
      latestRestTimesMap: latestRestTimesMap || {}, // flat cache map update
    };
    if (powerUps) {
      userUpdates.powerUps = powerUps;
    }
    batch.update(userRef, userUpdates);

    // Op 6 — Update public squad_codes if user has a personal squadCode (starts with ZK- or FIT-)
    if (squadCode && (squadCode.startsWith('ZK-') || squadCode.startsWith('FIT-') || squadCode.startsWith('SQ-'))) {
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

    // Op 7 — Update squad challenges atomically via increments to avoid race conditions
    if (squadChallengeUpdates && squadChallengeUpdates.length > 0) {
      squadChallengeUpdates.forEach((upd) => {
        const squadRef = doc(db, 'shared_squads', upd.squadCode);
        batch.update(squadRef, upd.updates);
      });
    }

    // Op 8 — Squad activity feed write
    if (teamSquadCodes && teamSquadCodes.length > 0) {
      let workoutNameName = 'Workout Session';
      if (isQuickLog) {
        workoutNameName = 'Retroactive Log';
      } else if (sessionDoc.planDayId && String(sessionDoc.planDayId).startsWith('boss_fight_')) {
        workoutNameName = `Boss Fight: ${sessionDoc.name || 'Titan Finale'}`;
      } else {
        workoutNameName = getWorkoutSummaryName(exerciseDocs);
      }

      teamSquadCodes.forEach((tCode) => {
        const activityRef = doc(db, 'shared_squads', tCode, 'activity_feed', sessionId);
        batch.set(activityRef, {
          uid,
          name: userName,
          workoutName: workoutNameName,
          isQuickLog: !!isQuickLog,
          exercisesCount: exerciseDocs.length,
          totalSets: sessionDoc.totalSets,
          totalVolume: totalVolume || 0,
          prNames: newPRs.map((p) => `${p.name} (${p.weight === 'BW' ? 'BW' : p.weight + ' kg'} x ${p.reps})`),
          cardTheme: newPRs.length >= 2 ? 'pr_smash' : (totalVolume > 10000 ? 'titan_slayer' : 'standard'),
          highFives: [],
          kudos: [],
          createdAt: serverTimestamp(),
          durationMinutes: sessionDoc.durationMinutes || 0,
          moodTag: sessionDoc.moodTag || 'average',
          exercises: exerciseDocs.map((ex) => ({
            name: ex.name,
            muscleGroup: ex.muscleGroup || '',
            sets: ex.sets.map((s) => ({
              weight: s.weight,
              reps: s.reps
            }))
          }))
        });
      });
    }

    await batch.commit();
  }, []);

  // ── finishSession ───────────────────────────────────────────────────────────
  const finishSession = useCallback(async (uid, debrief) => {
    try {
      // Build payload once; reuse on retry
      let payload = pendingBatchRef.current;
      if (!payload) {
        payload = await _buildBatchPayload(uid, debrief);
        pendingBatchRef.current = payload;
      }

      // Optimistic XP update — animates immediately before network round-trip.
      // Guard: only award once per session attempt. On retry (pendingBatchRef is set
      // but xpAwardedRef is true), the XP was already awarded and rolled back on fail,
      // so we re-award it here exactly once before the next commit attempt.
      if (!xpAwardedRef.current) {
        useXPStore.getState().awardXP(payload.xpEarned);
        xpAwardedRef.current = true;
      }

      // Atomic Firestore write
      await _commitBatch(payload);

      // SUCCESS — clear cache, reset session, return summary
      pendingBatchRef.current = null;
      retryCountRef.current   = 0;
      xpAwardedRef.current    = false; // reset for next session
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
      console.error('[useWorkoutLogger] error code:', err?.code ?? 'n/a');

      // Roll back the optimistic XP we speculatively added
      if (pendingBatchRef.current && xpAwardedRef.current) {
        useXPStore.getState().rollbackXP(pendingBatchRef.current.xpEarned);
        xpAwardedRef.current = false; // allow re-award on next retry attempt
      }

      retryCountRef.current += 1;

      // Re-throw so MobileLogger can show the retry button
      const errorCode = err?.code ? ` [${err.code}]` : '';
      throw new Error(
        err?.message?.startsWith('[useWorkoutLogger]')
          ? err.message
          : `[useWorkoutLogger] Could not save session.${errorCode} (${err?.message ?? 'network error'})`
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
