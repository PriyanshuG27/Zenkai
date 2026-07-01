const express = require('express');
const router = express.Router();
const { adminDb } = require('../lib/firebaseAdmin');
const authGuard = require('../middleware/authGuard');

router.post('/', authGuard, async (req, res) => {
  const uid = req.user.uid;
  const { targetUid, squadCode } = req.body;

  if (!targetUid || !squadCode) {
    return res.status(400).json({ error: 'Missing targetUid or squadCode' });
  }

  if (uid === targetUid) {
    return res.status(400).json({ error: 'Cannot rescue your own streak this way.' });
  }

  try {
    const rescuerRef = adminDb.doc(`users/${uid}`);
    const targetRef = adminDb.doc(`users/${targetUid}`);
    const squadRef = adminDb.doc(`shared_squads/${squadCode}`);
    
    const result = await adminDb.runTransaction(async (t) => {
      const rescuerSnap = await t.get(rescuerRef);
      if (!rescuerSnap.exists) {
        throw new Error('Rescuer profile not found');
      }
      
      const targetSnap = await t.get(targetRef);
      if (!targetSnap.exists) {
        throw new Error('Target profile not found');
      }

      const squadSnap = await t.get(squadRef);
      if (!squadSnap.exists) {
        throw new Error('Squad not found');
      }
      
      const squadData = squadSnap.data();
      if (!squadData.memberUids || !squadData.memberUids.includes(uid) || !squadData.memberUids.includes(targetUid)) {
        throw new Error('Both users must be in the specified squad');
      }

      const rescuerData = rescuerSnap.data();
      const currentXP = rescuerData.xp || 0;
      
      if (currentXP < 50) {
        throw new Error('Insufficient XP. You need at least 50 XP to rescue a teammate.');
      }

      const targetData = targetSnap.data();
      const targetPowerUps = targetData.powerUps || {};
      const nextTargetPowerUps = { ...targetPowerUps };
      nextTargetPowerUps.streakShield = (nextTargetPowerUps.streakShield || 0) + 1;

      // Deduct XP from rescuer
      t.update(rescuerRef, {
        xp: currentXP - 50
      });

      // Grant shield to target
      t.update(targetRef, {
        powerUps: nextTargetPowerUps,
        lastRescuedBySquad: squadCode
      });

      return {
        success: true,
        rescuerXP: currentXP - 50,
        targetPowerUps: nextTargetPowerUps
      };
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[rescueStreak] Error:', err);
    if (err.message.includes('Insufficient XP')) return res.status(400).json({ error: err.message });
    return res.status(500).json({ error: 'Failed to process streak rescue.' });
  }
});

module.exports = router;
