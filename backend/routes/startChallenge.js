const express = require('express');
const router = express.Router();
const { admin, adminDb } = require('../lib/firebaseAdmin');
const FieldValue = admin.firestore.FieldValue;
const authGuard = require('../middleware/authGuard');

router.post('/', authGuard, async (req, res) => {
  const uid = req.user.uid;
  const { type } = req.body;

  if (!type) {
    return res.status(400).json({ error: 'Missing type' });
  }

  if (type !== 'comeback' && type !== 'streak' && type !== 'weak_point') {
    return res.status(400).json({ error: 'Invalid challenge type.' });
  }

  try {
    const activeChallsSnap = await adminDb.collection('challenges')
      .where('participants', 'array-contains', uid)
      .where('status', '==', 'active')
      .get();
      
    const activeChalls = activeChallsSnap.docs.map(doc => doc.data());

    const hasActiveSameType = activeChalls.some(c => c.type === type);
    if (hasActiveSameType) {
      return res.status(400).json({ error: 'You already have an active challenge of this type' });
    }
    
    const hasActiveCampaign = activeChalls.some(c => (c.subtype || 'campaign') === 'campaign');
    if (hasActiveCampaign) {
      return res.status(400).json({ error: 'You already have an active campaign running.' });
    }

    const docRef = adminDb.collection('challenges').doc();
    const challengeId = docRef.id;

    const challengeDoc = {
      type,
      subtype: 'campaign',
      creatorUid: uid,
      participants: [uid],
      startDate: FieldValue.serverTimestamp(),
      status: 'active',
    };

    if (type === 'comeback') {
      challengeDoc.endDate = new Date(Date.now() + 84 * 24 * 60 * 60 * 1000);
      challengeDoc.goal = { durationWeeks: 12, startCapacityPct: 40 };
      challengeDoc.durationDays = 84;
      challengeDoc.progress = {
        [uid]: { currentWeek: 1, completedSessions: 0, badgeEarned: false }
      };
    } else if (type === 'streak') {
      challengeDoc.endDate = new Date(Date.now() + 56 * 24 * 60 * 60 * 1000);
      challengeDoc.goal = { workoutsPerWeek: 3, durationWeeks: 8 };
      challengeDoc.durationDays = 56;
      challengeDoc.progress = {
        [uid]: { currentWeek: 1, weeklyCount: [0, 0, 0, 0, 0, 0, 0, 0], badgeEarned: false }
      };
    } else if (type === 'weak_point') {
      challengeDoc.endDate = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000);
      challengeDoc.goal = { targetSets: 15, muscleGroup: 'Core' };
      challengeDoc.durationDays = 28;
      challengeDoc.progress = {
        [uid]: { completedSets: 0, badgeEarned: false }
      };
    }

    await docRef.set(challengeDoc);

    return res.status(200).json({ success: true, challengeId });
  } catch (error) {
    console.error('[startChallenge] Error:', error);
    return res.status(500).json({ error: 'Failed to start challenge' });
  }
});

module.exports = router;
