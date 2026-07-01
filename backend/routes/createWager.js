const express = require('express');
const router = express.Router();
const { adminDb, admin } = require('../lib/firebaseAdmin');
const FieldValue = admin.firestore.FieldValue;
const authGuard = require('../middleware/authGuard');

router.post('/', authGuard, async (req, res) => {
  const uid = req.user.uid;
  const { amount } = req.body;

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Valid wager amount is required.' });
  }

  try {
    const userRef = adminDb.doc(`users/${uid}`);
    const challengeRef = adminDb.collection('challenges').doc();
    const challengeId = challengeRef.id;

    const result = await adminDb.runTransaction(async (t) => {
      const userSnap = await t.get(userRef);
      if (!userSnap.exists) {
        throw new Error('User profile not found');
      }

      const userData = userSnap.data();
      const currentXP = userData.xp || 0;
      
      if (currentXP < amount) {
        throw new Error('Insufficient XP for wager');
      }

      // Deduct XP
      const nextXp = currentXP - amount;
      t.update(userRef, { xp: nextXp });

      // Sync with squad_codes
      if (userData.squadCode) {
        const codeRef = adminDb.doc(`squad_codes/${userData.squadCode}`);
        t.set(codeRef, { xp: nextXp, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }

      // Create the wager challenge document
      const wagerDoc = {
        type: 'streak',
        subtype: 'wager',
        name: `Flame Wager: ${amount} XP`,
        description: `Complete 3 workouts this week to claim double your XP back! 🔥`,
        creatorUid: uid,
        participants: [uid],
        startDate: FieldValue.serverTimestamp(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'active',
        durationDays: 7,
        goal: { workoutsPerWeek: 3, durationWeeks: 1 },
        wagerAmount: amount,
        rewardXP: amount * 2,
        progress: {
          [uid]: { currentWeek: 1, weeklyCount: [0], badgeEarned: false }
        }
      };

      t.set(challengeRef, wagerDoc);

      return {
        success: true,
        challengeId,
        nextXp
      };
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[createWager] Error:', err);
    if (err.message === 'Insufficient XP for wager') {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to create wager.' });
  }
});

module.exports = router;
