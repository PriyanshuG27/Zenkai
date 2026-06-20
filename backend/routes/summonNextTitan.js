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
      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        return res.status(404).json({ error: 'User profile not found.' });
      }

      const userData = userSnap.data();
      const currentPowerUps = userData.powerUps || {};
      const currentKeys = currentPowerUps.bossFightKey || 0;

      // 1. Fetch the squad document
      const squadRef = adminDb.doc(`shared_squads/${squadCode}`);
      const squadSnap = await squadRef.get();
      if (!squadSnap.exists) {
        return res.status(404).json({ error: 'Squad not found' });
      }

      const squadData = squadSnap.data();
      const memberUids = squadData.memberUids || [];
      if (!memberUids.includes(uid)) {
        return res.status(403).json({ error: 'You are not a member of this squad' });
      }

      const activeChall = squadData.activeChallenge;
      if (!activeChall) {
        return res.status(400).json({ error: 'No active challenge found. Generate one first.' });
      }

      if (activeChall.status !== 'completed') {
        return res.status(400).json({ error: 'The active Titan Raid is still alive! Defeat it before summoning the next one.' });
      }

      // 2. Check Cooldown and calculate cost
      const completedAt = activeChall.completedAt || 0;
      const cooldownMs = 24 * 60 * 60 * 1000;
      const timeSinceCompletion = Date.now() - completedAt;
      const isCooldownActive = completedAt && timeSinceCompletion < cooldownMs;

      const cost = isCooldownActive ? 2 : 1;

      if (currentKeys < cost) {
        return res.status(400).json({ 
          error: `Insufficient Boss Keys. Summoning the next Titan requires ${cost} keys (cooldown: ${isCooldownActive ? 'Active' : 'Expired'}), you have ${currentKeys}.` 
        });
      }

      // 3. Deduct keys from user
      const nextPowerUps = { ...currentPowerUps };
      nextPowerUps.bossFightKey = currentKeys - cost;

      await userRef.set({
        powerUps: nextPowerUps,
        updatedAt: new Date()
      }, { merge: true });

      // 4. Generate new Titan Raid challenge
      const activeChallenge = await generateChallengeForSquad(squadCode);

      return res.status(200).json({ 
        success: true, 
        message: 'Titan successfully summoned!', 
        activeChallenge,
        nextKeys: nextPowerUps.bossFightKey
      });

    } catch (err) {
      console.error('[summonNextTitan] Error:', err);
      return res.status(500).json({ error: 'Failed to summon Titan. Please try again.' });
    }
  }
];
