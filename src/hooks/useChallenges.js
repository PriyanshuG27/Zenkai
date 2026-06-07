/**
 * useChallenges.js
 * Loads and manages challenge participation state.
 * Implements transaction-based progress tracking and duplicate checks.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  getDocs,
  getDoc,
  deleteDoc,
  doc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';
import { useXPEngine } from './useXPEngine';

// Helper to compute progress percentage defined outside the hook to avoid circular dependency
function calculateProgressPct(challenge, uid) {
  if (!challenge || !challenge.progress || !challenge.progress[uid]) return 0;
  const progress = challenge.progress[uid];
  if (challenge.type === 'comeback') {
    const totalTarget = 3 * (challenge.goal?.durationWeeks || 12);
    const completed = progress.completedSessions || 0;
    return Math.min(100, Math.round((completed / totalTarget) * 100));
  } else if (challenge.type === 'streak') {
    const workoutsPerWeek = challenge.goal?.workoutsPerWeek || 3;
    const durationWeeks = challenge.goal?.durationWeeks || 8;
    const totalTarget = workoutsPerWeek * durationWeeks;
    const sum = (progress.weeklyCount || []).reduce((acc, v) => acc + v, 0);
    return Math.min(100, Math.round((sum / totalTarget) * 100));
  } else if (challenge.type === 'weak_point') {
    const targetSets = challenge.goal?.targetSets || 15;
    const completed = progress.completedSets || 0;
    return Math.min(100, Math.round((completed / targetSets) * 100));
  }
  return 0;
}

// Module-level variable to prevent parallel calls to the generator Cloud Function
let isGeneratingChallenges = false;

export function useChallenges() {
  const { user, profile } = useAuthStore();
  const { awardXP } = useXPEngine();
  const { addToast } = useUIStore();

  const [challenges, setChallenges] = useState([]);
  const [userProgress, setUserProgress] = useState({});
  const [avgWorkoutHour, setAvgWorkoutHour] = useState(18); // Default to 6 PM
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deletedChallengeIds, setDeletedChallengeIds] = useState(new Set());

  // Helper to compute progress percentage for component consumption
  const getProgressPercent = useCallback((challengeOrId, uid) => {
    let challenge = challengeOrId;
    if (typeof challengeOrId === 'string') {
      challenge = challenges.find((c) => c.id === challengeOrId);
    }
    return calculateProgressPct(challenge, uid);
  }, [challenges]);

  // Load challenges from Firestore
  const loadChallenges = useCallback(async (uid) => {
    if (!uid) return;
    setLoading(true);
    setError(null);
    try {
      const q = query(
        collection(db, 'challenges'),
        where('participants', 'array-contains', uid)
      );
      const snap = await getDocs(q);
      const userChallenges = [];
      const progressMap = {};

      snap.docs.forEach((docSnap) => {
        const id = docSnap.id;
        const data = docSnap.data();

        // Skip optimistically deleted or abandoned challenges
        if (deletedChallengeIds.has(id) || data.status === 'abandoned') {
          return;
        }

        const start = data.startDate?.toDate ? data.startDate.toDate() : new Date(data.startDate || Date.now());
        let durationDays = 56;
        if (data.type === 'comeback') durationDays = 84;
        if (data.type === 'weak_point') durationDays = data.durationDays || 28;
        const end = data.endDate?.toDate ? data.endDate.toDate() : new Date(start.getTime() + durationDays * 24 * 60 * 60 * 1000);
        const diffMs = end.getTime() - Date.now();
        const weeksRemaining = Math.max(0, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));

        const progressPercent = calculateProgressPct({ ...data, id }, uid);

        let currentMission = '';
        const userProg = data.progress?.[uid] || {};
        if (data.type === 'comeback') {
          currentMission = `Week ${userProg.currentWeek || 1}: Complete 3 workouts (Total: ${userProg.completedSessions || 0}/36)`;
        } else if (data.type === 'streak') {
          const currentWeek = userProg.currentWeek || 1;
          const weekCount = userProg.weeklyCount?.[currentWeek - 1] || 0;
          currentMission = `Week ${currentWeek}: Log 3 workouts (Week count: ${weekCount}/3)`;
        } else if (data.type === 'weak_point') {
          const targetSets = data.goal?.targetSets || 15;
          const completed = userProg.completedSets || 0;
          currentMission = `Complete ${targetSets} sets of ${data.goal?.muscleGroup || 'Core'} (Progress: ${completed}/${targetSets})`;
        }

        const mappedChallenge = {
          id,
          ...data,
          subtype: data.subtype || 'campaign',
          name: data.type === 'comeback'
            ? 'Comeback Challenge'
            : data.type === 'streak'
            ? 'Streak Challenge'
            : (data.name || 'Weak Point Challenge'),
          description: data.type === 'comeback'
            ? 'Train 3x/week for 12 weeks to build your base'
            : data.type === 'streak'
            ? 'Train 3x/week for 8 weeks consecutively'
            : (data.description || 'Target specific weak points'),
          durationDays,
          weeksRemaining,
          progressPct: progressPercent,
          currentMission,
        };

        userChallenges.push(mappedChallenge);

        const diffDays = Math.floor((Date.now() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
        const currentDay = Math.min(durationDays, Math.max(1, diffDays));
        progressMap[id] = {
          joinedAt: start,
          currentDay,
          completed: data.status === 'completed',
          currentWeek: userProg.currentWeek || 1,
        };
      });

      // Check last session date and compute average hour from last 5 sessions
      const sessionsRef = collection(db, 'users', uid, 'sessions');
      const sessQuery = query(sessionsRef, orderBy('date', 'desc'), limit(5));
      const sessSnap = await getDocs(sessQuery);
      let lastSessionDate = null;
      let calculatedAvgHour = 18;

      if (!sessSnap.empty) {
        const latestDoc = sessSnap.docs[0];
        const latestData = latestDoc.data();
        lastSessionDate = latestData.date?.toDate ? latestData.date.toDate() : new Date(latestData.date || Date.now());

        const hours = sessSnap.docs.map(d => {
          const sData = d.data();
          const date = sData.date?.toDate ? sData.date.toDate() : new Date(sData.date || Date.now());
          return date.getHours();
        });
        calculatedAvgHour = Math.round(hours.reduce((a, b) => a + b, 0) / hours.length);
      }
      setAvgWorkoutHour(calculatedAvgHour);

      if (lastSessionDate) {
        const diffMs = Date.now() - lastSessionDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays > 4) {
          const hasReignition = userChallenges.some(
            c => c.type === 'weak_point' && c.subtype === 'quest' && c.name === 'Re-ignition' && c.status === 'active'
          );
          if (!hasReignition) {
            const newQuestRef = doc(collection(db, 'challenges'));
            const questDoc = {
              type: 'weak_point',
              subtype: 'quest',
              name: 'Re-ignition',
              description: 'Log 1 workout within 48 hours to get back on track! 🔥',
              creatorUid: uid,
              participants: [uid],
              startDate: serverTimestamp(),
              endDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
              status: 'active',
              goal: { targetSets: 1, muscleGroup: 'any' },
              rewardXP: 100,
              progress: {
                [uid]: { completedSets: 0, badgeEarned: false }
              }
            };
            await setDoc(newQuestRef, questDoc);

            userChallenges.push({
              id: newQuestRef.id,
              ...questDoc,
              subtype: 'quest',
              durationDays: 2,
              weeksRemaining: 1,
              progressPct: 0,
              currentMission: 'Complete 1 set of any workout (Progress: 0/1)',
            });
          }
        }
      }

      // Load personalized templates from Firestore subcollection users/{uid}/personalTemplates
      const personalTemplatesCol = collection(db, 'users', uid, 'personalTemplates');
      const personalTemplatesSnap = await getDocs(personalTemplatesCol);
      const personalTemplates = [];

      personalTemplatesSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const muscle = (data.goal?.muscleGroup || 'Core').toLowerCase();
        const isDup = personalTemplates.some(t => (t.goal?.muscleGroup || 'Core').toLowerCase() === muscle);
        if (!isDup) {
          personalTemplates.push({
            id: docSnap.id,
            ...data,
            durationDays: data.durationDays || 28,
          });
        } else {
          // Asynchronously clean up the duplicate document from Firestore
          const dupRef = doc(db, 'users', uid, 'personalTemplates', docSnap.id);
          deleteDoc(dupRef).catch(err => console.error('[useChallenges] Failed to clean duplicate template:', err));
        }
      });

      // If personalTemplates is empty AND user doesn't already have an active weak_point challenge,
      // call the Cloud Function to generate new challenge templates!
      const hasWeakPoint = userChallenges.some(c => c.type === 'weak_point' && c.status === 'active');
      if (personalTemplates.length === 0 && !hasWeakPoint && !isGeneratingChallenges) {
        isGeneratingChallenges = true;
        try {
          const { httpsCallable } = await import('firebase/functions');
          const { functions } = await import('../lib/firebase');
          const generateChallengeFn = httpsCallable(functions, 'generateChallenge');
          const res = await generateChallengeFn();
          if (res.data && Array.isArray(res.data)) {
            res.data.forEach(tpl => {
              const muscle = (tpl.goal?.muscleGroup || 'Core').toLowerCase();
              const isDup = personalTemplates.some(t => (t.goal?.muscleGroup || 'Core').toLowerCase() === muscle);
              if (!isDup) {
                personalTemplates.push({
                  id: tpl.id,
                  ...tpl,
                  durationDays: tpl.durationDays || 28,
                });
              }
            });
          }
        } catch (fnErr) {
          console.error('[useChallenges] Failed to generate challenge via Cloud Function:', fnErr);
        } finally {
          isGeneratingChallenges = false;
        }
      }

      const templates = [...personalTemplates];
      const joinedTypes = userChallenges.map((c) => c.type);
      if (!joinedTypes.includes('comeback') && profile?.userType === 'Comeback') {
        templates.push({
          id: 'comeback',
          type: 'comeback',
          name: 'Comeback Challenge',
          description: 'Train 3x/week for 12 weeks to build your base',
          durationDays: 84,
        });
      }
      if (!joinedTypes.includes('streak')) {
        templates.push({
          id: 'streak',
          type: 'streak',
          name: 'Streak Challenge',
          description: 'Train 3x/week for 8 weeks consecutively',
          durationDays: 56,
        });
      }

      setChallenges([...userChallenges, ...templates]);
      setUserProgress(progressMap);
    } catch (err) {
      console.error('Error loading challenges:', err);
      setError('Failed to load challenges.');
    } finally {
      setLoading(false);
    }
  }, [profile?.userType, deletedChallengeIds]);

  useEffect(() => {
    if (user?.uid) {
      loadChallenges(user.uid);
    } else {
      setChallenges([]);
      setUserProgress({});
    }
  }, [user?.uid, profile?.userType, loadChallenges]);

  // startChallenge(uid, type)
  const startChallenge = useCallback(async (uid, type) => {
    if (!uid || !type) throw new Error('UID and Type are required.');
    if (type !== 'comeback' && type !== 'streak' && type !== 'weak_point') {
      throw new Error('Invalid challenge type.');
    }

    const activeChalls = await getActiveChallenges(uid);
    const hasActiveSameType = activeChalls.some(c => c.type === type);
    if (hasActiveSameType) {
      throw new Error('You already have an active challenge of this type');
    }
    const hasActiveCampaign = activeChalls.some(c => (c.subtype || 'campaign') === 'campaign');
    if (hasActiveCampaign) {
      throw new Error('You already have an active campaign running.');
    }

    const docRef = doc(collection(db, 'challenges'));
    const challengeId = docRef.id;

    const challengeDoc = {
      type,
      subtype: 'campaign',
      creatorUid: uid,
      participants: [uid],
      startDate: serverTimestamp(),
      status: 'active',
    };

    if (type === 'comeback') {
      challengeDoc.endDate = new Date(Date.now() + 84 * 24 * 60 * 60 * 1000);
      challengeDoc.goal = { durationWeeks: 12, startCapacityPct: 40 };
      challengeDoc.progress = {
        [uid]: { currentWeek: 1, completedSessions: 0, badgeEarned: false }
      };
    } else if (type === 'streak') {
      challengeDoc.endDate = new Date(Date.now() + 56 * 24 * 60 * 60 * 1000);
      challengeDoc.goal = { workoutsPerWeek: 3, durationWeeks: 8 };
      challengeDoc.progress = {
        [uid]: { currentWeek: 1, weeklyCount: [0, 0, 0, 0, 0, 0, 0, 0], badgeEarned: false }
      };
    } else if (type === 'weak_point') {
      challengeDoc.endDate = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000);
      challengeDoc.goal = { targetSets: 15, muscleGroup: 'Core' };
      challengeDoc.progress = {
        [uid]: { completedSets: 0, badgeEarned: false }
      };
    }

    await setDoc(docRef, challengeDoc);
    await loadChallenges(uid);

    return challengeId;
  }, [loadChallenges]);

  // getActiveChallenges(uid)
  const getActiveChallenges = useCallback(async (userUid) => {
    if (!userUid) return [];
    const q = query(
      collection(db, 'challenges'),
      where('participants', 'array-contains', userUid),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;

      const start = data.startDate?.toDate ? data.startDate.toDate() : new Date(data.startDate || Date.now());
      let durationDays = 56;
      if (data.type === 'comeback') durationDays = 84;
      if (data.type === 'weak_point') durationDays = data.durationDays || 28;
      const end = data.endDate?.toDate ? data.endDate.toDate() : new Date(start.getTime() + durationDays * 24 * 60 * 60 * 1000);
      const diffMs = end.getTime() - Date.now();
      const weeksRemaining = Math.max(0, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));

      let progressPct = 0;
      const progress = data.progress?.[userUid];
      if (progress) {
        if (data.type === 'comeback') {
          const totalTarget = 3 * (data.goal?.durationWeeks || 12);
          const completed = progress.completedSessions || 0;
          progressPct = Math.min(100, Math.round((completed / totalTarget) * 100));
        } else if (data.type === 'streak') {
          const workoutsPerWeek = data.goal?.workoutsPerWeek || 3;
          const durationWeeks = data.goal?.durationWeeks || 8;
          const totalTarget = workoutsPerWeek * durationWeeks;
          const sum = (progress.weeklyCount || []).reduce((acc, v) => acc + v, 0);
          progressPct = Math.min(100, Math.round((sum / totalTarget) * 100));
        } else if (data.type === 'weak_point') {
          const targetSets = data.goal?.targetSets || 15;
          const completed = progress.completedSets || 0;
          progressPct = Math.min(100, Math.round((completed / targetSets) * 100));
        }
      }

      let currentMission = '';
      const userProg = data.progress?.[userUid] || {};
      if (data.type === 'comeback') {
        currentMission = `Week ${userProg.currentWeek || 1}: Complete 3 workouts (Total: ${userProg.completedSessions || 0}/36)`;
      } else if (data.type === 'streak') {
        const currentWeek = userProg.currentWeek || 1;
        const weekCount = userProg.weeklyCount?.[currentWeek - 1] || 0;
        currentMission = `Week ${currentWeek}: Log 3 workouts (Week count: ${weekCount}/3)`;
      } else if (data.type === 'weak_point') {
        const targetSets = data.goal?.targetSets || 15;
        const completed = userProg.completedSets || 0;
        currentMission = `Complete ${targetSets} sets of ${data.goal?.muscleGroup || 'Core'} (Progress: ${completed}/${targetSets})`;
      }

      return {
        id,
        ...data,
        subtype: data.subtype || 'campaign',
        name: data.type === 'comeback'
          ? 'Comeback Challenge'
          : data.type === 'streak'
          ? 'Streak Challenge'
          : (data.name || 'Weak Point Challenge'),
        description: data.type === 'comeback'
          ? 'Train 3x/week for 12 weeks to build your base'
          : data.type === 'streak'
          ? 'Train 3x/week for 8 weeks consecutively'
          : (data.description || 'Target specific weak points'),
        durationDays,
        weeksRemaining,
        progressPct,
        currentMission,
      };
    });
  }, []);

  // updateProgress(uid, challengeId, sessionDate)
  const updateProgress = useCallback(async (uid, challengeId, sessionDate) => {
    if (!uid || !challengeId || !sessionDate) {
      throw new Error('Missing required arguments for progress update');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(challengeId)) {
      throw new Error('Invalid challenge ID format');
    }

    let loggedMuscleGroups = [];
    try {
      const sessionsRef = collection(db, 'users', uid, 'sessions');
      const sessQuery = query(sessionsRef, orderBy('date', 'desc'), limit(1));
      const sessSnap = await getDocs(sessQuery);
      if (!sessSnap.empty) {
        const latestSessDoc = sessSnap.docs[0];
        const exercisesRef = collection(db, 'users', uid, 'sessions', latestSessDoc.id, 'exercises');
        const exSnap = await getDocs(exercisesRef);
        loggedMuscleGroups = exSnap.docs.map(exDoc => {
          const exData = exDoc.data();
          const doneSets = (exData.sets || []).filter(s => s.done || s.completed);
          return {
            muscleGroup: (exData.muscleGroup || '').toLowerCase(),
            count: doneSets.length
          };
        });
      }
    } catch (queryErr) {
      console.error('[useChallenges] Error fetching latest session for progress update:', queryErr);
    }

    const challengeRef = doc(db, 'challenges', challengeId);
    let shouldAwardXP = false;
    let xpAmount = 500;

    await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(challengeRef);
      if (!docSnap.exists()) {
        throw new Error('Challenge document does not exist');
      }

      const userRef = doc(db, 'users', uid);
      const userSnap = await transaction.get(userRef);

      const data = docSnap.data();
      if (data.status !== 'active') {
        throw new Error('Challenge is not active');
      }

      const start = data.startDate?.toDate ? data.startDate.toDate() : new Date(data.startDate);
      const session = sessionDate instanceof Date ? sessionDate : new Date(sessionDate);
      const diffTime = session.getTime() - start.getTime();
      const diffDays = Math.floor(diffTime / (24 * 60 * 60 * 1000));
      const durationWeeks = data.goal?.durationWeeks || (data.type === 'comeback' ? 12 : 8);
      const currentWeek = Math.min(durationWeeks, Math.max(1, Math.floor(diffDays / 7) + 1));

      const userProg = { ...(data.progress?.[uid] || {}) };

      if (data.type === 'comeback') {
        userProg.completedSessions = (userProg.completedSessions || 0) + 1;
        userProg.currentWeek = currentWeek;
      } else if (data.type === 'streak') {
        const weeklyCount = [...(userProg.weeklyCount || [0, 0, 0, 0, 0, 0, 0, 0])];
        weeklyCount[currentWeek - 1] = (weeklyCount[currentWeek - 1] || 0) + 1;
        userProg.weeklyCount = weeklyCount;
        userProg.currentWeek = currentWeek;
      } else if (data.type === 'weak_point') {
        const targetGroup = (data.goal?.muscleGroup || '').toLowerCase();
        let completedSetsCount = 0;
        loggedMuscleGroups.forEach(item => {
          let group = item.muscleGroup;
          if (group === 'legs' || group === 'quads' || group === 'hamstrings' || group === 'calves' || group === 'glutes') {
            group = 'legs';
          } else if (group === 'chest' || group === 'pecs') {
            group = 'chest';
          } else if (group === 'back' || group === 'lats' || group === 'traps') {
            group = 'back';
          } else if (group === 'core' || group === 'abs' || group === 'abdominal') {
            group = 'core';
          } else if (group === 'shoulders' || group === 'delts') {
            group = 'shoulders';
          } else if (group === 'arms' || group === 'biceps' || group === 'triceps' || group === 'forearms') {
            group = 'arms';
          }

          if (targetGroup === 'any' || targetGroup === '' || group === targetGroup) {
            completedSetsCount += item.count;
          }
        });
        userProg.completedSets = (userProg.completedSets || 0) + completedSetsCount;
      }

      let isComplete = false;
      if (data.type === 'comeback') {
        isComplete = userProg.completedSessions >= 3 * durationWeeks;
      } else if (data.type === 'streak') {
        isComplete = userProg.weeklyCount.every((count) => count >= 3);
      } else if (data.type === 'weak_point') {
        const targetSets = data.goal?.targetSets || 15;
        isComplete = (userProg.completedSets || 0) >= targetSets;
      }

      const updates = {
        [`progress.${uid}`]: userProg,
      };

      if (isComplete) {
        updates.status = 'completed';
        userProg.badgeEarned = true;
        if (!data.progress?.[uid]?.badgeEarned) {
          shouldAwardXP = true;
          xpAmount = data.rewardXP || 500;

          // Award power-up rewards in profile (skip for wagers)
          const userData = userSnap.exists() ? userSnap.data() : {};
          const powerUps = userData.powerUps || {};
          let streakShield = powerUps.streakShield || 0;
          let xpBooster = powerUps.xpBooster || 0;

          if (data.subtype !== 'wager') {
            if (data.type === 'weak_point' || data.type === 'comeback') {
              streakShield += 1;
            }
            if (data.type === 'streak' || data.type === 'comeback') {
              xpBooster += 1;
            }
          }

          const userUpdates = {
            powerUps: {
              ...powerUps,
              streakShield,
              xpBooster,
            }
          };
          if (data.type === 'comeback') {
            userUpdates.userType = 'Regular';
          }
          transaction.update(userRef, userUpdates);
        }
      }

      transaction.update(challengeRef, updates);
    });

    if (shouldAwardXP) {
      await awardXP(uid, 'challenge_complete', xpAmount, { challengeId });
    }

    await loadChallenges(uid);
  }, [awardXP, loadChallenges]);

  // joinChallenge(challengeId)
  const joinChallenge = useCallback(async (challengeId) => {
    if (!user?.uid) return;

    try {
      const personalTemplateRef = doc(db, 'users', user.uid, 'personalTemplates', challengeId);
      const templateSnap = await getDoc(personalTemplateRef);
      if (templateSnap.exists()) {
        const templateData = templateSnap.data();
        const type = templateData.type || 'weak_point';
        const subtype = templateData.subtype || 'campaign';

        const activeChalls = await getActiveChallenges(user.uid);
        const hasActiveOfSubtype = activeChalls.some(
          c => (c.subtype || 'campaign') === subtype
        );
        if (hasActiveOfSubtype) {
          throw new Error(`You already have an active ${subtype} running.`);
        }
        
        const docRef = doc(collection(db, 'challenges'));
        const challengeIdNew = docRef.id;

        const challengeDoc = {
          type,
          subtype,
          name: templateData.name,
          description: templateData.description,
          creatorUid: user.uid,
          participants: [user.uid],
          startDate: serverTimestamp(),
          status: 'active',
          endDate: new Date(Date.now() + (templateData.durationDays || 28) * 24 * 60 * 60 * 1000),
          goal: templateData.goal,
          progress: {
            [user.uid]: { completedSets: 0, badgeEarned: false }
          }
        };
        if (templateData.rewardXP) {
          challengeDoc.rewardXP = templateData.rewardXP;
        }

        await setDoc(docRef, challengeDoc);
        await deleteDoc(personalTemplateRef);

        await loadChallenges(user.uid);
        addToast('Challenge accepted! Let\'s get after it! 🔥', 'success');
        return challengeIdNew;
      }
    } catch (err) {
      console.error('[useChallenges] Error joining personalized challenge:', err);
      addToast(err.message || 'Failed to join challenge.', 'error');
      return;
    }

    const type = challengeId === 'comeback' || challengeId === 'comeback_template' ? 'comeback' : 'streak';
    try {
      const activeChalls = await getActiveChallenges(user.uid);
      const hasActiveCampaign = activeChalls.some(c => (c.subtype || 'campaign') === 'campaign');
      if (hasActiveCampaign) {
        throw new Error('You already have an active campaign running.');
      }
      await startChallenge(user.uid, type);
      addToast('Challenge joined successfully! 🔥', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to join challenge.', 'error');
    }
  }, [user?.uid, startChallenge, loadChallenges, getActiveChallenges, addToast]);

  // createWager(uid, amount)
  const createWager = useCallback(async (uid, amount) => {
    if (!uid || !amount) throw new Error('UID and Amount are required.');

    const userRef = doc(db, 'users', uid);
    const challengeRef = doc(collection(db, 'challenges'));
    const challengeId = challengeRef.id;

    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        throw new Error('User profile not found');
      }

      const userData = userSnap.data();
      const currentXP = userData.xp || 0;
      if (currentXP < amount) {
        throw new Error('Insufficient XP for wager');
      }

      // Deduct XP immediately
      transaction.update(userRef, {
        xp: currentXP - amount
      });

      // Create the wager challenge document
      const wagerDoc = {
        type: 'streak',
        subtype: 'wager',
        name: `Flame Wager: ${amount} XP`,
        description: `Complete 3 workouts this week to claim double your XP back! 🔥`,
        creatorUid: uid,
        participants: [uid],
        startDate: serverTimestamp(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'active',
        goal: { workoutsPerWeek: 3, durationWeeks: 1 },
        wagerAmount: amount,
        rewardXP: amount * 2,
        progress: {
          [uid]: { currentWeek: 1, weeklyCount: [0], badgeEarned: false }
        }
      };

      transaction.set(challengeRef, wagerDoc);
    });

    addToast(`Wager placed successfully! Log 3 sessions to claim your reward! 🔥`, 'success');
    await loadChallenges(uid);
    return challengeId;
  }, [addToast, loadChallenges]);

  // leaveChallenge(challengeId)
  const leaveChallenge = useCallback(async (challengeId) => {
    if (!user?.uid || !challengeId) return;
    try {
      // 1. Add to deleted IDs and optimistically remove from local challenges list
      setDeletedChallengeIds((prev) => {
        const next = new Set(prev);
        next.add(challengeId);
        return next;
      });
      setChallenges((prev) => prev.filter((c) => c.id !== challengeId));

      const challengeRef = doc(db, 'challenges', challengeId);
      
      // 2. Fetch challenge document to find its type for the cooldown
      let challengeSnap;
      try {
        challengeSnap = await getDoc(challengeRef);
      } catch (e) {
        console.error('[useChallenges] getDoc(challengeRef) failed:', e);
        throw new Error('Failed to read challenge document: ' + (e.message || e));
      }

      let challengeType = null;
      if (challengeSnap && typeof challengeSnap.exists === 'function' && challengeSnap.exists()) {
        challengeType = challengeSnap.data()?.type;
      }

      // 3. Mark challenge as abandoned — client delete is blocked by security rules,
      //    so we update status directly instead of attempting deleteDoc first.
      try {
        await setDoc(challengeRef, { status: 'abandoned' }, { merge: true });
      } catch (updateErr) {
        console.error('[useChallenges] Failed to update challenge status:', updateErr);
        throw new Error('Failed to update challenge status: ' + (updateErr.message || updateErr));
      }

      // 4. Write cooldown if we resolved a challenge type
      if (challengeType) {
        const cooldownTime = Date.now() + 24 * 60 * 60 * 1000;
        const userRef = doc(db, 'users', user.uid);
        
        let userSnap;
        try {
          userSnap = await getDoc(userRef);
        } catch (e) {
          console.error('[useChallenges] getDoc(userRef) failed:', e);
          throw new Error('Failed to read user profile: ' + (e.message || e));
        }

        const userData = userSnap && typeof userSnap.exists === 'function' && userSnap.exists() ? userSnap.data() : {};
        const currentCooldowns = userData.cooldowns || {};

        try {
          await setDoc(userRef, {
            cooldowns: {
              ...currentCooldowns,
              [challengeType]: cooldownTime,
            },
          }, { merge: true });
        } catch (e) {
          console.error('[useChallenges] setDoc(userRef) failed:', e);
          throw new Error('Failed to update user profile cooldowns: ' + (e.message || e));
        }

        // Update local auth store profile state
        const currentProfile = useAuthStore.getState().profile;
        if (currentProfile) {
          useAuthStore.getState().setProfile({
            ...currentProfile,
            cooldowns: {
              ...(currentProfile.cooldowns || {}),
              [challengeType]: cooldownTime,
            },
          });
        }
      }

      await loadChallenges(user.uid);
      addToast('Challenge removed! 🗑️', 'info');
    } catch (err) {
      console.error('[useChallenges] Error leaving challenge:', err);
      addToast(`Failed to remove challenge: ${err.message || err}`, 'error');
      // Remove from deleted IDs and re-load on failure to revert optimistic state change
      setDeletedChallengeIds((prev) => {
        const next = new Set(prev);
        next.delete(challengeId);
        return next;
      });
      await loadChallenges(user.uid);
    }
  }, [user?.uid, loadChallenges, addToast]);

  return {
    challenges: challenges.filter((c) => !deletedChallengeIds.has(c.id)),
    userProgress,
    avgWorkoutHour,
    loading,
    error,
    startChallenge,
    getActiveChallenges,
    updateProgress,
    getProgressPercent,
    joinChallenge,
    createWager,
    leaveChallenge,
  };
}
