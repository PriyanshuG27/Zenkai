const express = require('express');
const router = express.Router();
const { adminDb, admin } = require('../lib/firebaseAdmin');
const FieldValue = admin.firestore.FieldValue;
const authGuard = require('../middleware/authGuard');

router.post('/', authGuard, async (req, res) => {
  const uid = req.user.uid;

  try {
    const userRef = adminDb.doc(`users/${uid}`);
    const xpLogRef = adminDb.collection(`users/${uid}/xpLog`);
    
    // Check if already redeemed
    const logSnap = await xpLogRef.where('reason', '==', 'Sunday Newspaper Secret Synergy Code').limit(1).get();
    if (!logSnap.empty) {
      return res.status(400).json({ error: 'Already redeemed this secret code.' });
    }

    const result = await adminDb.runTransaction(async (t) => {
      const userSnap = await t.get(userRef);
      if (!userSnap.exists) {
        throw new Error('User profile not found');
      }

      const userData = userSnap.data();
      const currentXP = userData.xp || 0;
      const nextXp = currentXP + 25;

      // Update XP
      t.update(userRef, { xp: nextXp });

      // Sync with squad_codes
      if (userData.squadCode) {
        const codeRef = adminDb.doc(`squad_codes/${userData.squadCode}`);
        t.set(codeRef, { xp: nextXp, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }

      // Create log
      const newLogRef = xpLogRef.doc();
      t.set(newLogRef, {
        amount: 25,
        reason: 'Sunday Newspaper Secret Synergy Code',
        timestamp: FieldValue.serverTimestamp()
      });

      return {
        success: true,
        nextXp
      };
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[redeemEasterEgg] Error:', err);
    return res.status(500).json({ error: 'Failed to redeem easter egg.' });
  }
});

module.exports = router;
