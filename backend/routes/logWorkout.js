const express = require('express');
const router = express.Router();
const { adminDb } = require('../lib/firebaseAdmin');
const authGuard = require('../middleware/authGuard');
const { deriveLevelFromXP, evaluateStreak, getBWEffectiveFraction, determineWorkoutName } = require('../lib/workoutHelpers');

const BASE_SESSION_XP = 150;
const PR_BONUS_XP = 50;

router.post('/', authGuard, async (req, res) => {
  const uid = req.user.uid;
  const { session, exercises, debrief, isQuickLog, teamSquadCodes, userName } = req.body;

  if (!session || !session.sessionId || !exercises || !Array.isArray(exercises)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  if (exercises.length > 30) {
    return res.status(400).json({ error: 'A session cannot contain more than 30 exercises.' });
  }
  for (const ex of exercises) {
    if (ex.sets && Array.isArray(ex.sets) && ex.sets.length > 20) {
      return res.status(400).json({ error: 'An exercise cannot have more than 20 sets.' });
    }
  }

  try {
    const userRef = adminDb.doc(`users/${uid}`);
    
    // Use a transaction to securely calculate XP, check PRs, and update Titan HP atomically.
    const result = await adminDb.runTransaction(async (t) => {
      const userSnap = await t.get(userRef);
      if (!userSnap.exists) throw new Error('User profile not found');
      
      const userData = userSnap.data();
      const squadCode = userData.squadCode;
      
      let squadRef = null;
      let squadSnap = null;
      if (squadCode) {
        squadRef = adminDb.doc(`shared_squads/${squadCode}`);
        squadSnap = await t.get(squadRef);
      }

      // 1. Process Exercises & PRs
      let totalVolume = 0;
      let prCount = 0;
      const newPRs = [];
      const exerciseDocs = [];
      let totalSets = 0;
      let bestLiftObj = null;
      let maxW = 0;
      let maxBWReps = 0;
      const latestLiftsMap = userData.latestLiftsMap || {};
      const latestRestTimesMap = userData.latestRestTimesMap || {};

      // Fetch specific PR docs for the exercises in this session
      const prRefs = [];
      const uniqueExKeys = [...new Set(exercises.map(ex => ex.exerciseKey).filter(Boolean))];
      uniqueExKeys.forEach(key => {
        prRefs.push(adminDb.doc(`users/${uid}/prs/${key}`));
      });
      
      let existingPRs = {};
      if (prRefs.length > 0) {
        const prSnaps = await t.getAll(...prRefs);
        prSnaps.forEach(snap => {
          if (snap.exists) existingPRs[snap.id] = snap.data();
        });
      }

      // Prepare Titan Damage
      let sessionDamage = 0;
      let activeChall = null;
      if (squadSnap && squadSnap.exists) {
        const sd = squadSnap.data();
        if (sd.activeChallenge && sd.activeChallenge.status === 'active') {
          activeChall = sd.activeChallenge;
        }
      }

      // Iterate over raw client sets
      exercises.forEach(ex => {
        let exVolume = 0;
        let bestSetWeight = 0;
        let bestSetReps = 0;
        let isBodyweight = false;
        
        ex.sets.forEach(set => {
          if (!set.done && !set.completed) return;
          totalSets++;
          
          let weight = 0;
          if (set.weight === 'BW' || set.isBW) {
             weight = (userData.weightKg || 75) * getBWEffectiveFraction(ex.exerciseKey);
             isBodyweight = true;
          } else {
             weight = parseFloat(set.weight) || 0;
          }
          const reps = parseInt(set.reps) || 0;
          
          exVolume += (weight * reps);
          
          // Epley formula for best set 1RM
          
          if (isBodyweight) {
             if (reps > maxBWReps) {
                maxBWReps = reps;
                if (maxW === 0) bestLiftObj = { name: ex.name, weight: 'BW', reps, isBW: true };
             }
          } else {
             if (weight > maxW) {
                maxW = weight;
                bestLiftObj = { name: ex.name, weight, isBW: false, reps };
             } else if (weight === maxW && maxW > 0) {
                if (bestLiftObj && reps > bestLiftObj.reps) {
                   bestLiftObj = { name: ex.name, weight, isBW: false, reps };
                }
             }
          }

          const est1RM = weight * (1 + reps / 30);
          if (est1RM > (bestSetWeight * (1 + bestSetReps/30))) {
             bestSetWeight = weight;
             bestSetReps = reps;
          }
        });
        
        if (ex.restTimer) {
           latestRestTimesMap[ex.exerciseKey] = parseInt(ex.restTimer, 10);
        }
        
        totalVolume += exVolume;
        
        // Damage to Titan
        if (activeChall && !isQuickLog) {
           let multiplier = 1.0;
           // weakness multiplier
           if (activeChall.weakness && activeChall.weakness.toLowerCase() === (ex.muscleGroup || '').toLowerCase()) {
              multiplier = 1.5;
           }
           // aura multiplier
           const aura = userData.aura;
           if (aura === 'crimson') multiplier *= 1.1;
           else if (aura === 'golden') multiplier *= 1.25;
           else if (aura === 'shadow') multiplier *= 1.5;

           sessionDamage += (exVolume * multiplier);
        }
        
        // Check against existing PRs
        const exKey = ex.exerciseKey;
        if (exKey && bestSetWeight > 0) {
           const prevPR = existingPRs[exKey];
           const prev1RM = prevPR ? (prevPR.weight === 'BW' ? (userData.weightKg || 75) * getBWEffectiveFraction(exKey) : prevPR.weight) * (1 + prevPR.reps/30) : 0;
           const new1RM = bestSetWeight * (1 + bestSetReps/30);
           
           if (!prevPR || new1RM > prev1RM) {
              prCount++;
              newPRs.push({
                 key: exKey,
                 ref: adminDb.doc(`users/${uid}/prs/${exKey}`),
                 data: {
                    exerciseKey: exKey,
                    exerciseName: ex.name,
                    weight: isBodyweight ? 'BW' : bestSetWeight,
                    reps: bestSetReps,
                    previousWeight: prevPR ? prevPR.weight : null,
                    date: new Date()
                 }
              });
              // Update local cache to prevent double-counting if same exercise occurs twice in one session
              existingPRs[exKey] = { weight: isBodyweight ? 'BW' : bestSetWeight, reps: bestSetReps }; 
           }
           
           latestLiftsMap[exKey] = isBodyweight ? 'BW' : bestSetWeight;
           latestLiftsMap[`${exKey}_reps`] = bestSetReps;
        }
        
        exerciseDocs.push({
           ref: adminDb.doc(`users/${uid}/sessions/${session.sessionId}/exercises/${ex.exerciseId || exKey}`),
           data: { ...ex, volume: exVolume }
        });
      });

      // 2. XP & Streak Evaluation

      const secondsPerSet = totalSets > 0 ? (session.durationMinutes || 45) * 60 / totalSets : 0;
      let sessionQuality = 'clean';
      let isFlagged = false;
      if (!isQuickLog) {
         if (secondsPerSet < 25) { sessionQuality = 'velocity_flagged'; isFlagged = true; }
         else if ((session.durationMinutes || 45) < 15) { sessionQuality = 'duration_flagged'; isFlagged = true; }
      }
      const shouldDowngrade = isQuickLog || isFlagged;

      const currentPR_XP = userData.skills?.adrenalineRush ? 12 : 10;
      // Verify overdrive from the user's Firestore record — NOT from the client flag.
      // overdriveVerifiedAt is written by /api/verifyGymImage on successful gym verification.
      const OVERDRIVE_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
      const rawOverdriveTs = userData.overdriveVerifiedAt;
      const overdriveVerifiedAt = rawOverdriveTs
        ? (rawOverdriveTs.toDate ? rawOverdriveTs.toDate() : new Date(rawOverdriveTs))
        : null;
      const isOverdrive = !!(overdriveVerifiedAt && (Date.now() - overdriveVerifiedAt.getTime() < OVERDRIVE_WINDOW_MS));
      const overdriveMultiplier = isOverdrive ? 1.5 : 1.0;

      const boosterUntil = userData.xpBoosterUntil
        ? (typeof userData.xpBoosterUntil.toDate === 'function' ? userData.xpBoosterUntil.toDate().getTime() : new Date(userData.xpBoosterUntil).getTime())
        : 0;
      const isBoosterActive = boosterUntil > Date.now();
      const boosterMultiplier = isBoosterActive ? 2.0 : 1.0;

      const moodTag = debrief?.vibe || 'average';
      const isLockedIn = moodTag === 'locked_in';
      const adrenalineBonus = (isLockedIn && prCount > 0) ? 15 : 0;
      const gritBonus = session.stomachFlag ? 20 : 0;
      
      const isBossFight = session.planDayId && String(session.planDayId).startsWith('boss_fight_');
      const bossBonusXP = isBossFight ? 200 : 0;

      let xpEarned = 0;
      let xpBreakdown = null;

      if (shouldDowngrade) {
        xpEarned = 20;
        xpBreakdown = {
          baseXP: 20,
          prCount: 0,
          prXP: 0,
          adrenalineBonus: 0,
          gritBonus: 0,
          bossBonusXP: 0,
          overdriveMultiplier: 1,
          boosterMultiplier: 1,
        };
      } else {
        xpEarned = Math.round((BASE_SESSION_XP + prCount * currentPR_XP + bossBonusXP + adrenalineBonus + gritBonus) * overdriveMultiplier * boosterMultiplier);
        xpBreakdown = {
          baseXP: BASE_SESSION_XP,
          prCount,
          prXP: prCount * currentPR_XP,
          adrenalineBonus,
          gritBonus,
          bossBonusXP,
          overdriveMultiplier,
          boosterMultiplier,
        };
      }

      // Restore Active Challenge bonus (not subject to multiplier, but let's just add it)
      // Actually, wait, did old logic have it? Let's just add it to xpEarned.
      // Titan bonus: only apply to full sessions, not quick-logs or flagged sessions.
      // Also track it in xpBreakdown so the XP audit trail is accurate.
      if (activeChall && activeChall.title && !shouldDowngrade) {
        xpEarned += 200;
        if (xpBreakdown) xpBreakdown.titanBonus = 200;
      } 

      const prevStreak = userData.streak || 0;
      const prevLastDate = userData.streakLastDate ? (userData.streakLastDate.toDate ? userData.streakLastDate.toDate() : new Date(userData.streakLastDate)) : null;
      
      const { newStreak, streakBonuses } = evaluateStreak(prevLastDate, prevStreak);
      
      let streakBonusXP = 0;
      if (streakBonuses.includes('streak_3')) streakBonusXP += 100;
      if (streakBonuses.includes('streak_7')) streakBonusXP += 300;
      if (streakBonuses.includes('streak_30')) streakBonusXP += 1000;
      
      xpEarned += streakBonusXP;

      let nextXP = (userData.xp || 0) + xpEarned;
      let nextCumXP = (userData.cumulativeXP || 0) + xpEarned;
      let { level: nextLevel, levelName: nextLevelName } = deriveLevelFromXP(nextXP);
      
      const isLevelUp = nextLevel > (userData.level || 1);
      if (isLevelUp) {
        xpEarned += 500;
        nextXP += 500;
        nextCumXP += 500;
        const recalc = deriveLevelFromXP(nextXP);
        nextLevel = recalc.level;
        nextLevelName = recalc.levelName;
      }

      // 3. Write Operations (Atomic Batch inside Transaction)
      
      // Session Doc
      
      const nowLocal = new Date();
      const dateString = nowLocal.getFullYear() + '-' + String(nowLocal.getMonth() + 1).padStart(2, '0') + '-' + String(nowLocal.getDate()).padStart(2, '0');
      
      const dynamicName = determineWorkoutName(exercises);
      
      t.create(adminDb.doc(`users/${uid}/sessions/${session.sessionId}`), {
        sessionId: session.sessionId,
        name: session.name || dynamicName,
        date: new Date(),
        dateString,
        moodTag,
        stomachFlag: !!session.stomachFlag,
        safeMode: !!session.stomachFlag,
        totalVolume,
        totalSets,
        durationMinutes: session.durationMinutes || 45,
        xpEarned,
        isQuickLog: !!isQuickLog,
        sessionQuality: isQuickLog ? 'quick_log' : sessionQuality,
        prCount,
        bestLift: bestLiftObj,
        isOverdrive: !!session.isOverdrive,
        planDayId: session.planDayId || 'custom',
        prsList: newPRs.map(pr => ({ name: pr.data.exerciseName, weight: pr.data.weight, reps: pr.data.reps })),
        exercisesList: exerciseDocs.map(ex => ({ name: ex.data.name, key: ex.data.exerciseKey, muscleGroup: ex.data.muscleGroup, setsCount: ex.data.sets ? ex.data.sets.length : 0 })),
        exercises: exerciseDocs.map(ed => ed.data)
      });


      // Exercises
      exerciseDocs.forEach(ed => t.set(ed.ref, ed.data));

      // PRs
      newPRs.forEach(pr => t.set(pr.ref, pr.data, { merge: true }));

      // XP Log
      t.set(adminDb.collection(`users/${uid}/xpLog`).doc(), {
        source: 'session_logged',
        amount: xpEarned,
        timestamp: new Date(),
        sessionId: session.sessionId
      });
      if (isLevelUp) {
        t.set(adminDb.collection(`users/${uid}/xpLog`).doc(), {
          source: 'level_up_bonus',
          amount: 500,
          timestamp: new Date(),
          sessionId: session.sessionId
        });
      }

            // User Doc
      t.set(userRef, {
        xp: nextXP,
        cumulativeXP: nextCumXP,
        level: nextLevel,
        levelName: nextLevelName,
        streak: newStreak,
        streakLastDate: new Date(),
        lastPrehabDate: isQuickLog ? userData.lastPrehabDate : new Date(),
        totalSessions: (userData.totalSessions || 0) + 1,
        latestLiftsMap,
        latestRestTimesMap
      }, { merge: true });

      // Squad Code public sync
      if (squadCode && (squadCode.startsWith('ZK-') || squadCode.startsWith('FIT-') || squadCode.startsWith('SQ-'))) {
        const codeRef = adminDb.doc(`squad_codes/${squadCode}`);
        t.set(codeRef, {
          uid,
          name: userName || 'Athlete',
          xp: nextXP,
          level: nextLevel,
          streak: newStreak,
          volume: (userData.weeklyVolume || 0) + totalVolume,
          squadCode: squadCode,
          strengthScore: userData.strengthScore || 30,
          updatedAt: new Date()
        }, { merge: true });
      }

      // Squad Doc Update (Titan Raid Damage)
      if (activeChall && sessionDamage > 0) {
         const currentHP = activeChall.currentHP || activeChall.totalHP;
         const newHP = Math.max(0, currentHP - Math.round(sessionDamage));
         const progressMap = activeChall.progress || {};
         progressMap[uid] = (progressMap[uid] || 0) + Math.round(sessionDamage);
         
         activeChall.currentHP = newHP;
         activeChall.damageDealt = (activeChall.damageDealt || 0) + Math.round(sessionDamage);
         activeChall.progress = progressMap;
         
         if (newHP <= 0 && activeChall.status !== 'completed') {
            activeChall.status = 'completed';
            activeChall.completedAt = Date.now();
            
            // Distribute rewards to all participating members immediately?
            // The existing `App.jsx` listens to `status === completed` and triggers the loot popup. 
            // The client calls `claimTitanReward`. We leave that logic intact.
         }
         
         t.set(squadRef, { activeChallenge: activeChall }, { merge: true });
      }

      // Activity Feed updates
      if (teamSquadCodes && Array.isArray(teamSquadCodes)) {
        teamSquadCodes.forEach(tCode => {
          t.set(adminDb.doc(`shared_squads/${tCode}/activity_feed/${session.sessionId}`), {
            uid,
            name: userName || 'Squad Member',
            workoutName: session.name || dynamicName,
            isQuickLog: !!isQuickLog,
            exercisesCount: exerciseDocs.length,
            totalSets,
            durationMinutes: session.durationMinutes || 45,
            volume: totalVolume,
            xpEarned,
            prCount,
            moodTag,
            timestamp: new Date()
          });
        });
      }

      return {
        success: true,
        xpEarned,
        newStreak,
        prCount,
        prNames: newPRs.map(pr => `${pr.data.exerciseName} (${pr.data.weight === 'BW' ? 'BW' : pr.data.weight + ' kg'} x ${pr.data.reps})`),
        levelUp: isLevelUp,
        newLevel: nextLevel,
        newLevelName: nextLevelName,
        totalVolume,
        totalSets,
        durationMinutes: session.durationMinutes || 45,
        exerciseCount: exerciseDocs.length,
        xpBreakdown
      };
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[logWorkout] Error:', err);

    if (err.message === 'User profile not found') {
      return res.status(404).json({ error: err.message });
    }

    // F-05: Session already exists — client is retrying after a dropped network response.
    // The session was already saved successfully. Return success to unblock the client.
    if (err.code === 6 || (err.message && err.message.includes('ALREADY_EXISTS'))) {
      console.log(`[logWorkout] Idempotent replay — session ${session?.sessionId} already logged for uid ${uid}.`);
      return res.status(200).json({ success: true, alreadyLogged: true, xpEarned: 0 });
    }

    // F-02: Never send stack traces or raw error messages to clients.
    return res.status(500).json({ error: 'Failed to log workout. Please try again.' });
  }
});

module.exports = router;
