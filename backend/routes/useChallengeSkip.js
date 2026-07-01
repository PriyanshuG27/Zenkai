const express = require('express');
const router = express.Router();
const { adminDb } = require('../lib/firebaseAdmin');
const authGuard = require('../middleware/authGuard');
const { deriveLevelFromXP } = require('../lib/workoutHelpers');

router.post('/', authGuard, async (req, res) => {
  const uid = req.user.uid;
  const { challengeId } = req.body;

  if (!challengeId) {
    return res.status(400).json({ error: 'Missing challengeId' });
  }

  try {
    const userRef = adminDb.doc(`users/${uid}`);
    const challengeRef = adminDb.doc(`challenges/${challengeId}`);

    const result = await adminDb.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        throw new Error('User profile not found');
      }

      const userData = userSnap.data();
      const powerUps = userData.powerUps || {};
      const challengeSkipCount = powerUps.challengeSkip || 0;

      if (challengeSkipCount <= 0) {
        throw new Error('No Challenge Skips remaining');
      }

      const challSnap = await transaction.get(challengeRef);
      if (!challSnap.exists) {
        throw new Error('Challenge not found');
      }

      const data = challSnap.data();
      if (data.status !== 'active') {
        throw new Error('Challenge is not active');
      }

      const userProg = { ...(data.progress?.[uid] || {}) };

      // Calculate currentWeek
      const start = data.startDate?.toDate ? data.startDate.toDate() : new Date(data.startDate);
      const diffTime = Date.now() - start.getTime();
      const diffDays = Math.floor(diffTime / (24 * 60 * 60 * 1000));
      const durationWeeks = data.goal?.durationWeeks || (data.type === 'comeback' ? 12 : 8);
      const currentWeek = Math.min(durationWeeks, Math.max(1, Math.floor(diffDays / 7) + 1));

      if (data.type === 'comeback') {
        userProg.completedSessions = (userProg.completedSessions || 0) + 1;
        userProg.currentWeek = currentWeek;
      } else if (data.type === 'streak') {
        const weeklyCount = [...(userProg.weeklyCount || [0, 0, 0, 0, 0, 0, 0, 0])];
        weeklyCount[currentWeek - 1] = (weeklyCount[currentWeek - 1] || 0) + 1;
        userProg.weeklyCount = weeklyCount;
        userProg.currentWeek = currentWeek;
      } else if (data.type === 'weak_point') {
        userProg.completedSets = (userProg.completedSets || 0) + 3;
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

      const updates = { [`progress.${uid}`]: userProg };

      let xpAmount = 0;
      let newXP = userData.xp || 0;
      let newCumulativeXP = userData.cumulativeXP || newXP;
      let newLevel = userData.level || 1;
      let newLevelName = userData.levelName || 'Rookie';
      let challengeCompleted = false;

      if (isComplete && !data.progress?.[uid]?.badgeEarned) {
        // Challenge just completed — mark it, award XP server-side
        updates.status = 'completed';
        userProg.badgeEarned = true;
        xpAmount = data.rewardXP || 500;
        challengeCompleted = true;

        newXP += xpAmount;
        newCumulativeXP += xpAmount;
        const derived = deriveLevelFromXP(newCumulativeXP);
        newLevel = derived.level;
        newLevelName = derived.levelName;

        // Single update: XP + power-up deduction atomically
        transaction.update(userRef, {
          xp: newXP,
          cumulativeXP: newCumulativeXP,
          level: newLevel,
          levelName: newLevelName,
          powerUps: { ...powerUps, challengeSkip: challengeSkipCount - 1 }
        });
      } else {
        // No XP — just deduct the Challenge Skip
        transaction.update(userRef, {
          powerUps: { ...powerUps, challengeSkip: challengeSkipCount - 1 }
        });
      }

      // Update challenge progress
      transaction.update(challengeRef, updates);

      return {
        success: true,
        challengeCompleted,
        xpAmount,
        newXP,
        newCumulativeXP,
        newLevel,
        newLevelName,
        remainingSkips: challengeSkipCount - 1
      };
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[useChallengeSkip API] Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
