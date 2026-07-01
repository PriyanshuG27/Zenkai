'use strict';

const authGuard = require('../middleware/authGuard');
const { adminDb } = require('../lib/firebaseAdmin');
const { generateChallengeForSquad } = require('../lib/challengeGenerator');

module.exports = [
  authGuard,
  async (req, res) => {
    const uid = req.user.uid;
    const { squadCode } = req.body;

    if (!squadCode) {
      return res.status(400).json({ error: 'Squad Code is required.' });
    }

    try {
      const userRef = adminDb.doc(`users/${uid}`);
      const squadRef = adminDb.doc(`shared_squads/${squadCode}`);
      
      const result = await adminDb.runTransaction(async (t) => {
        const userSnap = await t.get(userRef);
        if (!userSnap.exists) {
          throw new Error('User profile not found.');
        }

        const squadSnap = await t.get(squadRef);
        if (!squadSnap.exists) {
          throw new Error('Squad not found');
        }

        const userData = userSnap.data();
        const currentPowerUps = userData.powerUps || {};
        const currentKeys = currentPowerUps.bossFightKey || 0;

        const squadData = squadSnap.data();
        if (squadData.isSummoning) {
          throw new Error('A Titan is currently being summoned! Please wait a moment.');
        }

        const memberUids = squadData.memberUids || [];
        if (!memberUids.includes(uid)) {
          throw new Error('You are not a member of this squad');
        }

        const activeChall = squadData.activeChallenge;
        if (!activeChall) {
          throw new Error('No active challenge found. Generate one first.');
        }

        if (activeChall.status !== 'completed') {
          throw new Error('The active Titan Raid is still alive! Defeat it before summoning the next one.');
        }

        const completedAt = activeChall.completedAt || 0;
        const cooldownMs = 24 * 60 * 60 * 1000;
        const timeSinceCompletion = Date.now() - completedAt;
        const isCooldownActive = completedAt && timeSinceCompletion < cooldownMs;

        const cost = isCooldownActive ? 2 : 1;

        if (currentKeys < cost) {
          throw new Error(`Insufficient Boss Keys. Summoning the next Titan requires ${cost} keys (cooldown: ${isCooldownActive ? 'Active' : 'Expired'}), you have ${currentKeys}.`);
        }

        const nextPowerUps = { ...currentPowerUps };
        nextPowerUps.bossFightKey = currentKeys - cost;

        t.set(userRef, {
          powerUps: nextPowerUps,
          updatedAt: new Date()
        }, { merge: true });

        t.set(squadRef, {
          isSummoning: true
        }, { merge: true });

        return { nextKeys: nextPowerUps.bossFightKey, cost };
      });

      // 4. Generate new Titan Raid challenge
      let activeChallenge;
      try {
        activeChallenge = await generateChallengeForSquad(squadCode);
      } finally {
        await adminDb.doc(`shared_squads/${squadCode}`).set({ isSummoning: false }, { merge: true });
      }

      return res.status(200).json({ 
        success: true, 
        message: 'Titan successfully summoned!', 
        activeChallenge,
        nextKeys: result.nextKeys
      });

    } catch (err) {
      console.error('[summonNextTitan] Error:', err);
      // If we failed inside the transaction, the key was never deducted. 
      // If we failed in generateChallengeForSquad, the key WAS deducted but they got no titan.
      // A refund logic could go here, but for now we just return the error.
      if (err.message === 'User profile not found.' || err.message === 'Squad not found') return res.status(404).json({ error: err.message });
      if (err.message.includes('Insufficient Boss Keys') || err.message.includes('summoned! Please wait') || err.message.includes('not a member') || err.message.includes('active Titan Raid is still alive')) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Failed to summon Titan. Please try again.' });
    }
  }
];
