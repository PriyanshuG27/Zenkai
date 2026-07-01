const express = require('express');
const router = express.Router();
const { adminDb } = require('../lib/firebaseAdmin');
const authGuard = require('../middleware/authGuard');

router.post('/', authGuard, async (req, res) => {
  const uid = req.user.uid;
  const { challengeId, sessionDate } = req.body;

  if (!challengeId || !sessionDate) {
    return res.status(400).json({ error: 'Missing challengeId or sessionDate' });
  }

  try {
    let loggedMuscleGroups = [];
    let isSameDaySession = false;

    // Fetch latest sessions
    const sessionsRef = adminDb.collection(`users/${uid}/sessions`);
    const sessSnap = await sessionsRef.orderBy('date', 'desc').limit(2).get();
    const docs = sessSnap.docs || [];
    
    if (docs.length > 0) {
      const latestSessDoc = docs[0];
      const latestSessData = latestSessDoc.data();
      
      if (latestSessData.exercises && Array.isArray(latestSessData.exercises) && latestSessData.exercises.length > 0) {
        loggedMuscleGroups = latestSessData.exercises.map(exData => {
          const doneSets = (exData.sets || []).filter(s => s.done || s.completed);
          return {
            muscleGroup: (exData.muscleGroup || '').toLowerCase(),
            count: doneSets.length
          };
        });
      } else {
        const exercisesRef = adminDb.collection(`users/${uid}/sessions/${latestSessDoc.id}/exercises`);
        const exSnap = await exercisesRef.get();
        loggedMuscleGroups = exSnap.docs.map(exDoc => {
          const exData = exDoc.data();
          const doneSets = (exData.sets || []).filter(s => s.done || s.completed);
          return {
            muscleGroup: (exData.muscleGroup || '').toLowerCase(),
            count: doneSets.length
          };
        });
      }

      if (docs.length >= 2) {
        const date0 = docs[0].data().date;
        const date1 = docs[1].data().date;
        if (date0 && date1) {
          const d0 = date0.toDate ? date0.toDate() : new Date(date0);
          const d1 = date1.toDate ? date1.toDate() : new Date(date1);
          if (!isNaN(d0.getTime()) && !isNaN(d1.getTime())) {
            isSameDaySession = d0.getFullYear() === d1.getFullYear() &&
                               d0.getMonth() === d1.getMonth() &&
                               d0.getDate() === d1.getDate();
          }
        }
      }
    }

    const challengeRef = adminDb.doc(`challenges/${challengeId}`);
    
    const result = await adminDb.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(challengeRef);
      if (!docSnap.exists) {
        throw new Error('Challenge document does not exist');
      }

      const userRef = adminDb.doc(`users/${uid}`);
      const userSnap = await transaction.get(userRef);

      const data = docSnap.data();
      if (data.status !== 'active') {
        throw new Error('Challenge is not active');
      }

      const start = data.startDate?.toDate ? data.startDate.toDate() : new Date(data.startDate);
      const session = new Date(sessionDate);
      const diffTime = session.getTime() - start.getTime();
      const diffDays = Math.floor(diffTime / (24 * 60 * 60 * 1000));
      const durationWeeks = data.goal?.durationWeeks || (data.type === 'comeback' ? 12 : 8);
      const currentWeek = Math.min(durationWeeks, Math.max(1, Math.floor(diffDays / 7) + 1));

      const userProg = { ...(data.progress?.[uid] || {}) };

      if (data.type === 'comeback') {
        if (!isSameDaySession) {
          userProg.completedSessions = (userProg.completedSessions || 0) + 1;
        }
        userProg.currentWeek = currentWeek;
      } else if (data.type === 'streak') {
        if (!isSameDaySession) {
          const weeklyCount = [...(userProg.weeklyCount || [0, 0, 0, 0, 0, 0, 0, 0])];
          weeklyCount[currentWeek - 1] = (weeklyCount[currentWeek - 1] || 0) + 1;
          userProg.weeklyCount = weeklyCount;
        }
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
        isComplete = userProg.weeklyCount.every((count) => count >= (data.goal?.workoutsPerWeek || 3));
      } else if (data.type === 'weak_point') {
        const targetSets = data.goal?.targetSets || 15;
        isComplete = (userProg.completedSets || 0) >= targetSets;
      }

      const updates = {
        [`progress.${uid}`]: userProg,
      };

      let shouldAwardXP = false;
      let xpAmount = 500;

      if (isComplete) {
        updates.status = 'completed';
        userProg.badgeEarned = true;
        
        if (!data.progress?.[uid]?.badgeEarned) {
          shouldAwardXP = true;
          xpAmount = data.rewardXP || 500;

          const userData = userSnap.exists ? userSnap.data() : {};
          const powerUps = userData.powerUps || {};
          let streakShield = powerUps.streakShield || 0;
          let xpBooster = powerUps.xpBooster || 0;
          let challengeSkip = powerUps.challengeSkip || 0;
          let planRefresh = powerUps.planRefresh || 0;

          if (data.subtype !== 'wager') {
            if (data.type === 'weak_point' || data.type === 'comeback') {
              streakShield += 1;
              challengeSkip += 1;
            }
            if (data.type === 'streak' || data.type === 'comeback') {
              xpBooster += 1;
              planRefresh += 1;
            }
          }

          const userUpdates = {
            powerUps: {
              ...powerUps,
              streakShield,
              xpBooster,
              challengeSkip,
              planRefresh,
            },
            xp: (userData.xp || 0) + xpAmount,
            cumulativeXP: (userData.cumulativeXP || 0) + xpAmount
          };
          if (data.type === 'comeback') {
            userUpdates.userType = 'Regular';
          }
          transaction.update(userRef, userUpdates);
          
          // Log XP
          const xpLogRef = adminDb.collection(`users/${uid}/xpLog`).doc();
          transaction.set(xpLogRef, {
            source: 'challenge_complete',
            amount: xpAmount,
            timestamp: new Date(),
            challengeId
          });
        }
      }

      transaction.update(challengeRef, updates);
      
      return { success: true, isComplete, shouldAwardXP, xpAmount };
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('[updateChallengeProgress] Error:', error);
    return res.status(500).json({ error: 'Failed to update progress' });
  }
});

module.exports = router;
