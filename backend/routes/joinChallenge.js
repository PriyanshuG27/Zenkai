const express = require('express');
const router = express.Router();
const { admin, adminDb } = require('../lib/firebaseAdmin');
const FieldValue = admin.firestore.FieldValue;
const authGuard = require('../middleware/authGuard');

// Built-in static challenge types that don't need a personalTemplate document.
// The frontend passes their type name as the challengeId (e.g. id: 'comeback').
const STATIC_CHALLENGE_TYPES = new Set(['comeback', 'streak']);

router.post('/', authGuard, async (req, res) => {
  const uid = req.user.uid;
  const { challengeId } = req.body;

  if (!challengeId) {
    return res.status(400).json({ error: 'Missing challengeId' });
  }

  try {
    // ─── Path A: Static built-in type (comeback / streak) ────────────────────
    // These are hardcoded templates displayed in the UI with id === type.
    // They have no personalTemplate Firestore document so we create the challenge directly.
    if (STATIC_CHALLENGE_TYPES.has(challengeId)) {
      const type = challengeId;

      const activeChallsSnap = await adminDb.collection('challenges')
        .where('participants', 'array-contains', uid)
        .where('status', '==', 'active')
        .get();

      const activeChalls = activeChallsSnap.docs.map(d => d.data());
      const hasActiveSameType = activeChalls.some(c => c.type === type);
      if (hasActiveSameType) {
        return res.status(400).json({ error: `You already have an active ${type} challenge running.` });
      }
      const hasActiveCampaign = activeChalls.some(c => (c.subtype || 'campaign') === 'campaign');
      if (hasActiveCampaign) {
        return res.status(400).json({ error: 'You already have an active campaign running.' });
      }

      const docRef = adminDb.collection('challenges').doc();
      const newChallengeId = docRef.id;

      const challengeDoc = {
        type,
        subtype: 'campaign',
        creatorUid: uid,
        participants: [uid],
        startDate: FieldValue.serverTimestamp(),
        status: 'active',
        rewardXP: 500,
      };

      if (type === 'comeback') {
        challengeDoc.name = 'Comeback Challenge';
        challengeDoc.description = 'Train 3x/week for 12 weeks to build your base';
        challengeDoc.endDate = new Date(Date.now() + 84 * 24 * 60 * 60 * 1000);
        challengeDoc.goal = { durationWeeks: 12, startCapacityPct: 40 };
        challengeDoc.durationDays = 84;
        challengeDoc.progress = {
          [uid]: { currentWeek: 1, completedSessions: 0, badgeEarned: false }
        };
      } else if (type === 'streak') {
        challengeDoc.name = 'Streak Challenge';
        challengeDoc.description = 'Train 3x/week for 8 weeks consecutively';
        challengeDoc.endDate = new Date(Date.now() + 56 * 24 * 60 * 60 * 1000);
        challengeDoc.goal = { workoutsPerWeek: 3, durationWeeks: 8 };
        challengeDoc.durationDays = 56;
        challengeDoc.progress = {
          [uid]: { currentWeek: 1, weeklyCount: [0, 0, 0, 0, 0, 0, 0, 0], badgeEarned: false }
        };
      }

      await docRef.set(challengeDoc);
      return res.status(200).json({ success: true, challengeId: newChallengeId });
    }

    // ─── Path B: Personal template (generated weak_point / campaign) ──────────
    const personalTemplateRef = adminDb.doc(`users/${uid}/personalTemplates/${challengeId}`);

    const result = await adminDb.runTransaction(async (t) => {
      const templateSnap = await t.get(personalTemplateRef);
      if (!templateSnap.exists) {
        throw new Error('Template not found or invalid challengeId');
      }

      const templateData = templateSnap.data();
      const type = templateData.type || 'weak_point';
      const subtype = templateData.subtype || 'campaign';

      const activeChallsSnap = await adminDb.collection('challenges')
        .where('participants', 'array-contains', uid)
        .where('status', '==', 'active')
        .get();

      const activeChalls = activeChallsSnap.docs.map(d => d.data());

      const hasActiveOfSubtype = activeChalls.some(
        c => (c.subtype || 'campaign') === subtype
      );
      if (hasActiveOfSubtype) {
        throw new Error(`You already have an active ${subtype} running.`);
      }

      const docRef = adminDb.collection('challenges').doc();
      const challengeIdNew = docRef.id;

      const challengeDoc = {
        type,
        subtype,
        name: templateData.name,
        description: templateData.description,
        templateId: challengeId,
        creatorUid: uid,
        participants: [uid],
        startDate: FieldValue.serverTimestamp(),
        status: 'active',
        durationDays: templateData.durationDays || 28,
        endDate: new Date(Date.now() + (templateData.durationDays || 28) * 24 * 60 * 60 * 1000),
        goal: templateData.goal,
        progress: {
          [uid]: { completedSets: 0, badgeEarned: false }
        }
      };

      if (templateData.rewardXP) {
        challengeDoc.rewardXP = templateData.rewardXP;
      }

      t.set(docRef, challengeDoc);
      t.delete(personalTemplateRef);

      return { success: true, challengeId: challengeIdNew };
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('[joinChallenge] Error:', error);
    return res.status(400).json({ error: error.message || 'Failed to join challenge' });
  }
});

module.exports = router;
