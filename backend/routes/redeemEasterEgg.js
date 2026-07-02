'use strict';

const express = require('express');
const router = express.Router();
const { adminDb, admin } = require('../lib/firebaseAdmin');
const FieldValue = admin.firestore.FieldValue;
const authGuard = require('../middleware/authGuard');

router.post('/', authGuard, async (req, res) => {
  const uid = req.user.uid;

  try {
    const userRef = adminDb.doc(`users/${uid}`);

    // Deterministic document ID = the idempotency lock.
    // t.get() inside the transaction checks if it already exists (atomic).
    // If two requests race, one will get ALREADY_REDEEMED and lose.
    const eggLogRef = adminDb.doc(`users/${uid}/xpLog/easter_egg_sunday_v1`);

    const result = await adminDb.runTransaction(async (t) => {
      const [userSnap, eggSnap] = await Promise.all([
        t.get(userRef),
        t.get(eggLogRef),
      ]);

      if (!userSnap.exists) {
        throw new Error('User profile not found');
      }

      // Idempotency check is now INSIDE the transaction — fully atomic.
      if (eggSnap.exists) {
        throw new Error('ALREADY_REDEEMED');
      }

      const userData = userSnap.data();
      const currentXP = userData.xp || 0;
      const nextXp = currentXP + 25;

      t.update(userRef, { xp: nextXp });

      // Sync XP to squad leaderboard if user is in a squad
      if (userData.squadCode) {
        const codeRef = adminDb.doc(`squad_codes/${userData.squadCode}`);
        t.set(codeRef, { xp: nextXp, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }

      // Write the log entry with a fixed ID — this is both the audit log AND the lock.
      t.set(eggLogRef, {
        amount: 25,
        reason: 'Sunday Newspaper Secret Synergy Code',
        timestamp: FieldValue.serverTimestamp(),
      });

      return { success: true, nextXp };
    });

    return res.status(200).json(result);

  } catch (err) {
    console.error('[redeemEasterEgg] Error:', err);
    if (err.message === 'ALREADY_REDEEMED') {
      return res.status(400).json({ error: 'Already redeemed this secret code.' });
    }
    if (err.message === 'User profile not found') {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to redeem easter egg. Please try again.' });
  }
});

module.exports = router;
