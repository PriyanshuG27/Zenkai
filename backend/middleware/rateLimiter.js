/**
 * rateLimiter.js
 *
 * Firestore-backed rate limiter for the generatePlan operation.
 * Tracks free daily plan regenerations directly on the user's document.
 */

'use strict';

const { HttpsError } = require('../lib/validators');

/**
 * Checks the daily rate limit and/or consumes a Plan Refresh power-up.
 */
async function checkRateLimit(db, uid, usePowerUp = false) {
  const userRef = db.doc(`users/${uid}`);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'User profile not found');
    }

    const userData = userSnap.data();
    const powerUps = userData.powerUps || {};
    const planRefreshCount = powerUps.planRefresh || 0;

    const todayStr = new Date().toISOString().split('T')[0];
    let dailyRegenCount = userData.dailyRegenCount || 0;
    let lastRegenDate = userData.lastRegenDate || '';
    
    // Hourly sliding window rate limit (Max 2 per hour)
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    let recentRegens = userData.recentRegenTimes || [];
    recentRegens = recentRegens.filter(t => t > oneHourAgo);

    if (recentRegens.length >= 2) {
      throw new HttpsError('resource-exhausted', 'Hourly limit of 2 plan generations reached. Please try again later.');
    }

    recentRegens.push(now);

    // Reset daily count if the date has changed
    if (lastRegenDate !== todayStr) {
      dailyRegenCount = 0;
      lastRegenDate = todayStr;
    }

    if (usePowerUp) {
      if (planRefreshCount <= 0) {
        throw new HttpsError('resource-exhausted', 'No Plan Refresh power-up available.');
      }
      
      // Consume a Plan Refresh power-up
      tx.update(userRef, {
        'powerUps.planRefresh': planRefreshCount - 1,
        recentRegenTimes: recentRegens
      });
    } else {
      if (dailyRegenCount >= 5) {
        throw new HttpsError('resource-exhausted', 'Daily free limit of 5 reached. Must use a Plan Refresh power-up.');
      }
      
      // Consume a free daily regeneration
      tx.update(userRef, {
        dailyRegenCount: dailyRegenCount + 1,
        lastRegenDate: todayStr,
        recentRegenTimes: recentRegens
      });
    }
  });
}

/**
 * Checks the rate limit for gym image verification.
 * Restricts users to max 2 attempts per 5 minutes and 5 attempts per 24 hours.
 */
async function checkGymCheckinRateLimit(db, uid) {
  const userRef = db.doc(`users/${uid}`);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'User profile not found');
    }

    const userData = userSnap.data();
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    let recentGymVerifications = userData.recentGymVerifyTimes || [];
    
    // Filter to only keep the last 24 hours of attempts
    recentGymVerifications = recentGymVerifications.filter(t => t > oneDayAgo);

    // Limit 1: Max 2 attempts in 5 minutes
    const recent5MinAttempts = recentGymVerifications.filter(t => t > fiveMinutesAgo);
    if (recent5MinAttempts.length >= 2) {
      throw new HttpsError('resource-exhausted', 'Too many verification attempts. Please wait 5 minutes before trying again.');
    }

    // Limit 2: Max 5 attempts in 24 hours
    if (recentGymVerifications.length >= 5) {
      throw new HttpsError('resource-exhausted', 'Daily gym verification limit of 5 attempts reached. Please try again tomorrow.');
    }

    recentGymVerifications.push(now);

    tx.update(userRef, {
      recentGymVerifyTimes: recentGymVerifications
    });
  });
}

module.exports = { checkRateLimit, checkGymCheckinRateLimit };
