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
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { callZenkaiAPI } from '../lib/apiClient';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';
import { useXPStore } from '../stores/useXPStore';

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
// Prevent Re-ignition quest duplication: set true before the write, cleared when user logs in again.
// Without this, writing inside onSnapshot creates a feedback loop:
//   write → new snapshot fires → hasReignition check may fail before data propagates → write again.
let reignitionScheduled = false;

export function useChallenges() {
  const { user, profile } = useAuthStore();
  const { setXP } = useXPStore();
  const { addToast } = useUIStore();

  const [challenges, setChallenges] = useState([]);
  const [userProgress, setUserProgress] = useState({});
  const [avgWorkoutHour, setAvgWorkoutHour] = useState(18); // Default to 6 PM
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deletedChallengeIds, setDeletedChallengeIds] = useState(new Set());
  // personalTemplates fetched once on mount, not on every challenge snapshot
  const [personalTemplates, setPersonalTemplates] = useState([]);
  // Last session date fetched once, used by snapshot to decide re-ignition quest
  const [lastSessionDate, setLastSessionDate] = useState(null);
  const [sessionDataLoaded, setSessionDataLoaded] = useState(false);

  // Helper to compute progress percentage for component consumption
  const getProgressPercent = useCallback((challengeOrId, uid) => {
    let challenge = challengeOrId;
    if (typeof challengeOrId === 'string') {
      challenge = challenges.find((c) => c.id === challengeOrId);
    }
    return calculateProgressPct(challenge, uid);
  }, [challenges]);

  // Load challenges from Firestore
  // loadChallenges is now a no-op because real-time listener (onSnapshot) handles queries automatically
  const loadChallenges = useCallback(async (uid) => {
    // no-op
  }, []);

  // ─── ONE-TIME: fetch last 5 sessions for avg hour + re-ignition check ────────
  // Uses a 24-hour localStorage cache so this only costs 1 read per day per user.
  useEffect(() => {
    if (!user?.uid || sessionDataLoaded) return;
    const CACHE_KEY = `zenkai_session_hour_${user.uid}`;
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { avgHour, lastDate, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) {
          setAvgWorkoutHour(avgHour ?? 18);
          setLastSessionDate(lastDate ? new Date(lastDate) : null);
          setSessionDataLoaded(true);
          return;
        }
      } catch (_) { /* stale/corrupt cache — refetch */ }
    }
    const fetchSessionMeta = async () => {
      try {
        const sessionsRef = collection(db, 'users', user.uid, 'sessions');
        const sessQuery = query(sessionsRef, orderBy('date', 'desc'), limit(5));
        const sessSnap = await getDocs(sessQuery);
        let calculatedAvgHour = 18;
        let latestDate = null;
        if (!sessSnap.empty) {
          const latestData = sessSnap.docs[0].data();
          latestDate = latestData.date?.toDate ? latestData.date.toDate() : new Date(latestData.date || Date.now());
          const hours = sessSnap.docs.map(d => {
            const sData = d.data();
            const date = sData.date?.toDate ? sData.date.toDate() : new Date(sData.date || Date.now());
            return date.getHours();
          });
          calculatedAvgHour = Math.round(hours.reduce((a, b) => a + b, 0) / hours.length);
        }
        setAvgWorkoutHour(calculatedAvgHour);
        setLastSessionDate(latestDate);
        setSessionDataLoaded(true);
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          avgHour: calculatedAvgHour,
          lastDate: latestDate ? latestDate.toISOString() : null,
          ts: Date.now(),
        }));
      } catch (err) {
        console.warn('[useChallenges] Could not fetch session meta:', err);
        setSessionDataLoaded(true);
      }
    };
    fetchSessionMeta();
  }, [user?.uid, sessionDataLoaded]);

  // ─── ONE-TIME: fetch personalTemplates on mount (not inside snapshot) ────────
  useEffect(() => {
    if (!user?.uid) return;
    const fetchTemplates = async () => {
      try {
        const personalTemplatesCol = collection(db, 'users', user.uid, 'personalTemplates');
        const personalTemplatesSnap = await getDocs(personalTemplatesCol);
        const loaded = [];
        const dupRefs = [];
        personalTemplatesSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const muscle = (data.goal?.muscleGroup || 'Core').toLowerCase();
          const isDup = loaded.some(t => (t.goal?.muscleGroup || 'Core').toLowerCase() === muscle);
          if (!isDup) {
            loaded.push({ id: docSnap.id, ...data, durationDays: data.durationDays || 28 });
          } else {
            dupRefs.push(doc(db, 'users', user.uid, 'personalTemplates', docSnap.id));
          }
        });
        // Clean up duplicates in the background
        dupRefs.forEach(ref => deleteDoc(ref).catch(() => {}));

        // If empty and no active weak_point, trigger Cloud Function
        const hasWeakPoint = challenges.some(c => c.type === 'weak_point' && c.status === 'active');
        if (loaded.length === 0 && !hasWeakPoint && !isGeneratingChallenges) {
          isGeneratingChallenges = true;
          try {
            const res = await callZenkaiAPI('generateChallenge');
            if (res.data && Array.isArray(res.data)) {
              res.data.forEach(tpl => {
                const muscle = (tpl.goal?.muscleGroup || 'Core').toLowerCase();
                const isDup = loaded.some(t => (t.goal?.muscleGroup || 'Core').toLowerCase() === muscle);
                if (!isDup) loaded.push({ id: tpl.id, ...tpl, durationDays: tpl.durationDays || 28 });
              });
            }
          } catch (fnErr) {
            console.error('[useChallenges] Failed to generate challenge via Express API:', fnErr);
          } finally {
            isGeneratingChallenges = false;
          }
        }
        setPersonalTemplates(loaded);
      } catch (err) {
        console.warn('[useChallenges] Could not load personalTemplates:', err);
      }
    };
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // Clear any incorrect 'weak_point' type cooldown (e.g. from removing duplicate flash quests)
  useEffect(() => {
    if (!user?.uid || !profile) return;
    if (profile.cooldowns && profile.cooldowns.weak_point) {
      const userRef = doc(db, 'users', user.uid);
      const updatedCooldowns = { ...profile.cooldowns };
      delete updatedCooldowns.weak_point;

      setDoc(userRef, { cooldowns: updatedCooldowns }, { merge: true })
        .then(() => {
          useAuthStore.getState().setProfile({
            ...profile,
            cooldowns: updatedCooldowns,
          });
        })
        .catch((err) => {
          console.error('[useChallenges] Failed to clear invalid weak_point cooldown:', err);
        });
    }
  }, [user?.uid, profile]);

  // Real-time challenges listener — pure snapshot processing, zero extra reads
  useEffect(() => {
    if (!user?.uid) {
      setChallenges([]);
      setUserProgress({});
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(
      collection(db, 'challenges'),
      where('participants', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, async (snap) => {
      try {
        const userChallenges = [];
        const progressMap = {};

        const docs = snap?.docs || [];
        for (const docSnap of docs) {
          const id = docSnap.id;
          const data = docSnap.data();

          // Skip optimistically deleted or abandoned challenges
          if (deletedChallengeIds.has(id) || data.status === 'abandoned') {
            continue;
          }

          const start = data.startDate?.toDate ? data.startDate.toDate() : new Date(data.startDate || Date.now());
          let durationDays = data.durationDays;
          if (!durationDays) {
            if (data.type === 'comeback') durationDays = 84;
            else if (data.type === 'streak') durationDays = 56;
            else if (data.type === 'weak_point') durationDays = 28;
            else durationDays = 28;
          }
          const end = data.endDate?.toDate ? data.endDate.toDate() : new Date(start.getTime() + durationDays * 24 * 60 * 60 * 1000);
          const diffMs = end.getTime() - Date.now();
          const weeksRemaining = Math.max(0, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));

          const progressPercent = calculateProgressPct({ ...data, id }, user.uid);

          let currentMission = '';
          const userProg = data.progress?.[user.uid] || {};
          if (data.type === 'comeback') {
            currentMission = `Week ${userProg.currentWeek || 1}: Complete 3 workouts (Total: ${userProg.completedSessions || 0}/36)`;
          } else if (data.type === 'streak') {
            const currentWeek = userProg.currentWeek || 1;
            const weekCount = userProg.weeklyCount?.[currentWeek - 1] || 0;
            // Fix: use actual workoutsPerWeek from goal, not hardcoded 3
            const targetPerWeek = data.goal?.workoutsPerWeek || 3;
            currentMission = `Week ${currentWeek}: Log ${targetPerWeek} workouts (This week: ${weekCount}/${targetPerWeek})`;
          } else if (data.type === 'weak_point') {
            const targetSets = data.goal?.targetSets || 15;
            const completed = userProg.completedSets || 0;
            currentMission = `Complete ${targetSets} sets of ${data.goal?.muscleGroup || 'Core'} (Progress: ${completed}/${targetSets})`;
          }

          const mappedChallenge = {
            id,
            ...data,
            subtype: data.subtype || 'campaign',
            name: data.name || (data.type === 'comeback'
              ? 'Comeback Challenge'
              : data.type === 'streak'
              ? 'Streak Challenge'
              : 'Weak Point Challenge'),
            description: data.description || (data.type === 'comeback'
              ? 'Train 3x/week for 12 weeks to build your base'
              : data.type === 'streak'
              ? 'Train 3x/week for 8 weeks consecutively'
              : 'Target specific weak points'),
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
        }

        // Re-ignition quest check — uses lastSessionDate from the separate mount-only effect
        // (zero extra reads here on each snapshot fire)
        if (lastSessionDate && !reignitionScheduled) {
          const diffMs = Date.now() - lastSessionDate.getTime();
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          if (diffDays > 4) {
            const hasReignition = userChallenges.some(
              c => c.type === 'weak_point' && c.subtype === 'quest' && c.name === 'Re-ignition' && c.status === 'active'
            );
            if (!hasReignition) {
              // Set flag BEFORE the write to prevent duplication if snapshot fires again
              // before Firestore propagates the new doc back to us.
              reignitionScheduled = true;
              try {
                const newQuestRef = doc(collection(db, 'challenges'));
                const questDoc = {
                  type: 'weak_point',
                  subtype: 'quest',
                  name: 'Re-ignition',
                  description: 'Log 1 workout within 48 hours to get back on track! 🔥',
                  creatorUid: user.uid,
                  participants: [user.uid],
                  startDate: serverTimestamp(),
                  endDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
                  status: 'active',
                  durationDays: 2,
                  goal: { targetSets: 1, muscleGroup: 'any' },
                  rewardXP: 100,
                  progress: {
                    [user.uid]: { completedSets: 0, badgeEarned: false }
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
              } catch (reignErr) {
                // If write fails, clear flag so it can retry on next snapshot
                reignitionScheduled = false;
                console.error('[useChallenges] Failed to create Re-ignition quest:', reignErr);
              }
            } else {
              // Quest already exists — suppress future checks this session
              reignitionScheduled = true;
            }
          }
        }

        // Build template list using already-fetched personalTemplates state
        // (no getDocs call here — templates are loaded separately on mount)
        const joinedTypes = userChallenges.map((c) => c.type);
        const activeSubtypes = userChallenges
          .filter((c) => c.status === 'active')
          .map((c) => c.subtype || 'campaign');

        // Only show personalTemplates (all are weak_point/campaign subtype) if the user
        // doesn't already have an active campaign running. This prevents the UI from showing
        // unjoinable challenges that the backend would reject with 400.
        const filteredPersonalTemplates = personalTemplates.filter(
          (t) => !activeSubtypes.includes(t.subtype || 'campaign')
        );
        const templates = [...filteredPersonalTemplates];

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
    }, (err) => {
      console.error('onSnapshot error in useChallenges:', err);
      setError('Failed to load challenges.');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid, profile?.userType, deletedChallengeIds, lastSessionDate, personalTemplates]);


  // startChallenge(uid, type)
  const startChallenge = useCallback(async (uid, type) => {
    if (!uid || !type) throw new Error('UID and Type are required.');
    if (type !== 'comeback' && type !== 'streak' && type !== 'weak_point') {
      throw new Error('Invalid challenge type.');
    }

    try {
      const res = await callZenkaiAPI('startChallenge', { type });
      await loadChallenges(uid);
      return res?.challengeId;
    } catch (err) {
      console.error('[useChallenges] Error starting challenge:', err);
      throw err;
    }
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
      let durationDays = data.durationDays;
      if (!durationDays) {
        if (data.type === 'comeback') durationDays = 84;
        else if (data.type === 'streak') durationDays = 56;
        else if (data.type === 'weak_point') durationDays = 28;
        else durationDays = 28;
      }
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
        name: data.name || (data.type === 'comeback'
          ? 'Comeback Challenge'
          : data.type === 'streak'
          ? 'Streak Challenge'
          : 'Weak Point Challenge'),
        description: data.description || (data.type === 'comeback'
          ? 'Train 3x/week for 12 weeks to build your base'
          : data.type === 'streak'
          ? 'Train 3x/week for 8 weeks consecutively'
          : 'Target specific weak points'),
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

    try {
      const res = await callZenkaiAPI('updateChallengeProgress', { 
        challengeId, 
        sessionDate: sessionDate instanceof Date ? sessionDate.toISOString() : sessionDate
      });
      
      const { shouldAwardXP, xpAmount } = res;
      if (shouldAwardXP && xpAmount) {
        addToast(`Challenge complete! +${xpAmount} XP earned`, 'success');
      }

      await loadChallenges(uid);
    } catch (err) {
      console.error('[useChallenges] Error updating progress:', err);
      throw err;
    }
  }, [loadChallenges, addToast]);

  // joinChallenge(challengeId)
  const joinChallenge = useCallback(async (challengeId) => {
    if (!user?.uid) return;

    try {
      const res = await callZenkaiAPI('joinChallenge', { challengeId });
      
      setPersonalTemplates(prev => prev.filter(t => t.id !== challengeId));
      
      await loadChallenges(user.uid);
      addToast('Challenge joined successfully! 🔥', 'success');
      return res?.challengeId;
    } catch (err) {
      console.error('[useChallenges] Error joining challenge:', err);
      addToast(err.message || 'Failed to join challenge.', 'error');
    }
  }, [user?.uid, loadChallenges, addToast]);

  // createWager(uid, amount)
  const createWager = useCallback(async (uid, amount) => {
    if (!uid || !amount) throw new Error('UID and Amount are required.');

    try {
      const res = await callZenkaiAPI('createWager', { amount });
      
      // Update local profile XP optimistically
      const currentProfile = useAuthStore.getState().profile;
      if (currentProfile && res?.nextXp !== undefined) {
        useAuthStore.getState().setProfile({
          ...currentProfile,
          xp: res.nextXp
        });
      }

      addToast(`Wager placed successfully! Log 3 sessions to claim your reward! 🔥`, 'success');
      await loadChallenges(uid);
      return res?.challengeId;
    } catch (err) {
      console.error('[useChallenges] Error creating wager:', err);
      addToast(err.message || 'Failed to place wager.', 'error');
      throw err;
    }
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
      let challengeData = null;
      if (challengeSnap && typeof challengeSnap.exists === 'function' && challengeSnap.exists()) {
        challengeData = challengeSnap.data();
        challengeType = challengeData?.type;
      }

      // 3. Mark challenge as abandoned — client delete is blocked by security rules,
      //    so we update status directly instead of attempting deleteDoc first.
      try {
        await setDoc(challengeRef, { status: 'abandoned' }, { merge: true });
      } catch (updateErr) {
        console.error('[useChallenges] Failed to update challenge status:', updateErr);
        throw new Error('Failed to update challenge status: ' + (updateErr.message || updateErr));
      }

      // 4. Recreate personal template if this challenge came from a template
      if (challengeData && challengeData.templateId) {
        const templateId = challengeData.templateId;
        const personalTemplateRef = doc(db, 'users', user.uid, 'personalTemplates', templateId);
        const newTemplate = {
          type: challengeData.type,
          subtype: challengeData.subtype || 'campaign',
          name: challengeData.name || null,
          description: challengeData.description || null,
          durationDays: challengeData.durationDays || 28,
          goal: challengeData.goal || null,
          rewardXP: challengeData.rewardXP || null
        };
        try {
          await setDoc(personalTemplateRef, newTemplate);
          
          // Re-populate in local state so it appears in the Available list instantly
          setPersonalTemplates((prev) => {
            const hasIt = prev.some((t) => t.id === templateId);
            if (!hasIt) {
              return [...prev, { id: templateId, ...newTemplate }];
            }
            return prev;
          });
        } catch (recreateErr) {
          console.error('[useChallenges] Failed to recreate personal template:', recreateErr);
        }
      }

      // 5. Write cooldown if we resolved a challenge type and it was a campaign
      const isCampaign = !challengeData?.subtype || challengeData.subtype === 'campaign';
      if (challengeType && isCampaign) {
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

        const cooldownKey = challengeData?.templateId || challengeType;

        try {
          await setDoc(userRef, {
            cooldowns: {
              ...currentCooldowns,
              [cooldownKey]: cooldownTime,
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
              [cooldownKey]: cooldownTime,
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

  // useChallengeSkip(challengeId)
  const useChallengeSkip = useCallback(async (challengeId) => {
    if (!user?.uid || !challengeId) return;

    try {
      const res = await callZenkaiAPI('useChallengeSkip', { challengeId });

      const { challengeCompleted, xpAmount, newXP, newCumulativeXP, remainingSkips } = res;

      // Sync local XP store if the challenge was completed and XP was awarded server-side
      if (challengeCompleted && xpAmount > 0) {
        setXP(newXP, newCumulativeXP, useAuthStore.getState().profile?.streak ?? 0);
        addToast(`Challenge complete! +${xpAmount} XP earned 🎉`, 'success');
      }

      // Update local profile state (power-ups)
      const currentProfile = useAuthStore.getState().profile;
      if (currentProfile) {
        useAuthStore.getState().setProfile({
          ...currentProfile,
          powerUps: {
            ...(currentProfile.powerUps || {}),
            challengeSkip: remainingSkips
          }
        });
      }

      if (!challengeCompleted) {
        addToast('Challenge Skip consumed! Progress updated! ⏭️', 'success');
      }
      await loadChallenges(user.uid);
    } catch (err) {
      console.error('[useChallenges] Error using challenge skip:', err);
      addToast(err.message || 'Failed to use Challenge Skip.', 'error');
      throw err;
    }
  }, [user?.uid, addToast, loadChallenges, setXP]);

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
    useChallengeSkip,
  };
}
