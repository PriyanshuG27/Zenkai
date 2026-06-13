'use strict';

const { randomInt } = require('crypto');
const authGuard = require('../middleware/authGuard');
const { adminDb } = require('../lib/firebaseAdmin');

const CHEST_CONFIGS = {
  common: {
    cost: 1,
    rates: [0.70, 0.25, 0.05], // common, rare, legendary
  },
  rare: {
    cost: 3,
    rates: [0.15, 0.65, 0.20],
  },
  legendary: {
    cost: 5,
    rates: [0.00, 0.25, 0.75],
  }
};

const REWARDS = {
  common: [
    { type: 'xp', value: 150, name: '+150 XP', description: 'Awarded directly to your total XP.' },
    { type: 'xp', value: 200, name: '+200 XP', description: 'Awarded directly to your total XP.' },
    { type: 'consumable', key: 'challengeSkip', value: 1, name: '1 Quest Skip ⏭️', description: 'Allows skipping a day of any challenge.' },
    { type: 'consumable', key: 'streakShield', value: 1, name: '1 Streak Shield 🛡️', description: 'Protects your daily consistency streak.' }
  ],
  rare: [
    { type: 'xp', value: 450, name: '+450 XP', description: 'Awarded directly to your total XP.' },
    { type: 'consumable', key: 'challengeSkip', value: 3, name: '3 Quest Skips ⏭️', description: 'Allows skipping multiple challenge check-ins.' },
    { type: 'consumable', key: 'xpBooster', value: 1, name: '1 2x XP Booster ⚡', description: 'Activate for double XP for 24 hours.' },
    { type: 'title', key: 'pr_demon', name: 'PR Demon Title (15d)', days: 15, description: 'Unlocks the PR Demon title for 15 days.' },
    { type: 'title', key: 'titan_hunter', name: 'Titan Hunter Title (15d)', days: 15, description: 'Unlocks the Titan Hunter title for 15 days.' }
  ],
  legendary: [
    { type: 'xp', value: 1200, name: '+1200 XP', description: 'Awarded directly to your total XP.' },
    { type: 'xp', value: 2000, name: '+2000 XP', description: 'Awarded directly to your total XP.' },
    { type: 'aura', key: 'crimson', name: 'Crimson Aura (30d)', days: 30, description: 'Unlocks the crimson glowing avatar aura for 30 days.' },
    { type: 'aura', key: 'golden', name: 'Golden Aura (30d)', days: 30, description: 'Unlocks the golden glowing avatar aura for 30 days.' },
    { type: 'aura', key: 'shadow', name: 'Shadow Aura (30d)', days: 30, description: 'Unlocks the shadow purple glowing avatar aura for 30 days.' },
    { type: 'title', key: 'pr_demon', name: 'PR Demon Title (30d)', days: 30, description: 'Unlocks the PR Demon title for 30 days.' },
    { type: 'title', key: 'titan_hunter', name: 'Titan Hunter Title (30d)', days: 30, description: 'Unlocks the Titan Hunter title for 30 days.' }
  ]
};

module.exports = [
  authGuard,
  async (req, res) => {
    const uid = req.user.uid;
    const { chestType } = req.body;

    const config = CHEST_CONFIGS[chestType];
    if (!config) {
      return res.status(400).json({ error: 'Invalid chest type. Must be common, rare, or legendary.' });
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

      if (currentKeys < config.cost) {
        return res.status(400).json({ 
          error: `Insufficient Boss Keys. Opening a ${chestType} chest costs ${config.cost} keys, you have ${currentKeys}.` 
        });
      }

      // Roll rarity tier using a cryptographically secure RNG.
      // Math.random() is predictable given V8's PRNG seed; crypto.randomInt
      // prevents timing-based manipulation of loot outcomes.
      const PRECISION = 10000;
      const rand = randomInt(0, PRECISION) / PRECISION; // [0, 1) with uniform distribution
      let tier = 'common';
      const [pCommon, pRare] = config.rates;

      if (rand < pCommon) {
        tier = 'common';
      } else if (rand < pCommon + pRare) {
        tier = 'rare';
      } else {
        tier = 'legendary';
      }

      // Pick a random reward from the rolled tier using secure RNG
      const tierRewards = REWARDS[tier];
      const rolledReward = tierRewards[randomInt(0, tierRewards.length)];

      // Apply rewards to user profile
      const nextPowerUps = { ...currentPowerUps };
      nextPowerUps.bossFightKey = currentKeys - config.cost; // deduct cost

      let nextXp = userData.xp || 0;
      let nextLevel = userData.level || 1;
      let nextBadges = [...(userData.badges || [])];

      if (rolledReward.type === 'xp') {
        nextXp += rolledReward.value;
        // Simple level-up algorithm: level = floor(sqrt(xp / 100)) + 1
        const calculatedLevel = Math.floor(Math.sqrt(nextXp / 100)) + 1;
        if (calculatedLevel > nextLevel) {
          nextLevel = calculatedLevel;
        }
      } else if (rolledReward.type === 'consumable') {
        nextPowerUps[rolledReward.key] = (nextPowerUps[rolledReward.key] || 0) + rolledReward.value;
      } else if (rolledReward.type === 'title' || rolledReward.type === 'aura') {
        const dbKey = rolledReward.type === 'title' 
          ? `unlocked_title_${rolledReward.key}_until` 
          : `unlocked_aura_${rolledReward.key}_until`;

        const currentUntil = nextPowerUps[dbKey];
        let baseTime = Date.now();
        if (currentUntil) {
          const currentUntilMs = typeof currentUntil.toDate === 'function' 
            ? currentUntil.toDate().getTime() 
            : new Date(currentUntil).getTime();
          if (currentUntilMs > Date.now()) {
            baseTime = currentUntilMs;
          }
        }
        const untilDate = new Date(baseTime + rolledReward.days * 24 * 60 * 60 * 1000);
        nextPowerUps[dbKey] = untilDate.toISOString();
      }

      // Save changes
      const updateData = {
        powerUps: nextPowerUps,
        xp: nextXp,
        level: nextLevel,
        updatedAt: new Date()
      };

      await userRef.set(updateData, { merge: true });

      return res.status(200).json({ 
        success: true, 
        chestType,
        tier,
        reward: rolledReward,
        nextKeys: nextPowerUps.bossFightKey,
        nextXp,
        nextLevel
      });

    } catch (err) {
      console.error('[openTreasureChest] Error:', err);
      return res.status(500).json({ error: 'Failed to open chest. Please try again.' });
    }
  }
];
