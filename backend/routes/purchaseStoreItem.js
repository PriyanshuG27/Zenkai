const express = require('express');
const router = express.Router();
const { adminDb } = require('../lib/firebaseAdmin');
const authGuard = require('../middleware/authGuard');

const shopItems = [
  { key: 'streakShield', name: 'Streak Shield', cost: 150, type: 'consumable' },
  { key: 'xpBooster', name: '2x XP Booster', cost: 300, type: 'consumable' },
  { key: 'challengeSkip', name: 'Quest Skip', cost: 100, type: 'consumable' },
  { key: 'pr_demon', name: 'PR Demon', type: 'title' },
  { key: 'titan_hunter', name: 'Titan Hunter', type: 'title' },
  { key: 'crimson', name: 'Crimson Aura', type: 'aura' },
  { key: 'golden', name: 'Golden Aura', type: 'aura' },
  { key: 'shadow', name: 'Shadow Aura', type: 'aura' }
];

const durationOptions = {
  pr_demon: { 10: 100, 15: 150, 30: 250 },
  titan_hunter: { 10: 100, 15: 150, 30: 250 },
  crimson: { 10: 150, 15: 220, 30: 400 },
  golden: { 10: 250, 15: 350, 30: 600 },
  shadow: { 10: 350, 15: 500, 30: 800 }
};

const isAuraActive = (auraKey, powerUps) => {
  if (!powerUps) return false;
  const until = powerUps[`unlocked_aura_${auraKey}_until`];
  if (!until) return false;
  const untilMs = typeof until.toDate === 'function' ? until.toDate().getTime() : new Date(until).getTime();
  return untilMs > Date.now();
};

const getUpgradeDiscount = (itemKey, durationDays, powerUps) => {
  if (itemKey === 'golden') {
    if (isAuraActive('crimson', powerUps)) {
      return durationOptions['crimson'][durationDays] || 0;
    }
  } else if (itemKey === 'shadow') {
    if (isAuraActive('golden', powerUps)) {
      return durationOptions['golden'][durationDays] || 0;
    } else if (isAuraActive('crimson', powerUps)) {
      return durationOptions['crimson'][durationDays] || 0;
    }
  }
  return 0;
};

router.post('/', authGuard, async (req, res) => {
  const uid = req.user.uid;
  const { itemKey, durationDays } = req.body;

  if (!itemKey) {
    return res.status(400).json({ error: 'Missing itemKey' });
  }

  const itemConfig = shopItems.find(i => i.key === itemKey);
  if (!itemConfig) {
    return res.status(400).json({ error: 'Invalid itemKey' });
  }

  try {
    const userRef = adminDb.doc(`users/${uid}`);
    
    const result = await adminDb.runTransaction(async (t) => {
      const userSnap = await t.get(userRef);
      if (!userSnap.exists) {
        throw new Error('User profile not found');
      }

      const userData = userSnap.data();
      const currentXP = userData.xp || 0;
      const powerUps = userData.powerUps || {};
      
      let baseCost = 0;
      let finalCost = 0;
      let discount = 0;
      let activeUpgradeKey = null;

      if (itemConfig.type === 'consumable') {
        finalCost = itemConfig.cost;
      } else {
        if (!durationDays || !durationOptions[itemKey] || !durationOptions[itemKey][durationDays]) {
           throw new Error('Invalid or missing durationDays for this item');
        }
        baseCost = durationOptions[itemKey][durationDays];
        discount = getUpgradeDiscount(itemKey, durationDays, powerUps);
        finalCost = baseCost - discount;

        if (itemKey === 'golden' && isAuraActive('crimson', powerUps)) {
          activeUpgradeKey = 'unlocked_aura_crimson_until';
        } else if (itemKey === 'shadow') {
          if (isAuraActive('golden', powerUps)) {
            activeUpgradeKey = 'unlocked_aura_golden_until';
          } else if (isAuraActive('crimson', powerUps)) {
            activeUpgradeKey = 'unlocked_aura_crimson_until';
          }
        }
      }

      if (currentXP < finalCost) {
        throw new Error(`Insufficient XP Balance. Cost: ${finalCost}, Available: ${currentXP}`);
      }

      const nextPowerUps = { ...powerUps };
      const updates = {};
      
      if (itemConfig.type === 'consumable') {
        nextPowerUps[itemKey] = (nextPowerUps[itemKey] || 0) + 1;
      } else {
        const type = itemConfig.type;
        const powerUpKey = `unlocked_${type}_${itemKey}_until`;
        
        const currentUntil = powerUps[powerUpKey];
        const currentMs = currentUntil 
          ? (typeof currentUntil.toDate === 'function' ? currentUntil.toDate().getTime() : new Date(currentUntil).getTime())
          : 0;
        
        let baseTime = currentMs > Date.now() ? currentMs : Date.now();
        if (activeUpgradeKey) {
          const upgradeUntil = powerUps[activeUpgradeKey];
          const upgradeMs = upgradeUntil
            ? (typeof upgradeUntil.toDate === 'function' ? upgradeUntil.toDate().getTime() : new Date(upgradeUntil).getTime())
            : 0;
          if (upgradeMs > Date.now()) {
            baseTime = upgradeMs;
          }
        }

        const newExpiration = new Date(baseTime + durationDays * 24 * 60 * 60 * 1000);
        nextPowerUps[powerUpKey] = newExpiration;
        
        if (activeUpgradeKey) {
          nextPowerUps[activeUpgradeKey] = new Date(0); // Deactivate lower-tier aura
        }

        if (type === 'aura') {
          updates.aura = itemKey;
        } else {
          updates.activeTitle = itemConfig.name;
        }
      }

      updates.xp = currentXP - finalCost;
      updates.powerUps = nextPowerUps;

      t.update(userRef, updates);

      // Sync with squad_codes if applicable
      const squadCode = userData.squadCode;
      if (squadCode) {
         const codeRef = adminDb.doc(`squad_codes/${squadCode}`);
         t.set(codeRef, updates, { merge: true });
      }

      return {
        success: true,
        finalCost,
        nextPowerUps,
        updates
      };
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[purchaseStoreItem] Error:', err);
    if (err.message.includes('Insufficient XP')) return res.status(400).json({ error: err.message });
    return res.status(500).json({ error: 'Failed to process purchase.' });
  }
});

module.exports = router;
