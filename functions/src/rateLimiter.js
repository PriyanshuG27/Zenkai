/**
 * rateLimiter.js
 *
 * Firestore-backed rate limiter for the generatePlan Cloud Function.
 *
 * Schema: rateLimit/{uid}
 *   count       {number}  — calls made in the current window
 *   windowStart {number}  — unix ms timestamp when the current window started
 *
 * Rules:
 *   - Window duration: 1 hour (3_600_000 ms)
 *   - Limit: 5 plan generations per window per user
 *   - When windowStart is older than 1 hour, count resets to 0 and
 *     windowStart resets to Date.now() before the new call is counted.
 *
 * Security notes:
 *   - The rateLimit collection is only accessible via the Admin SDK (Cloud Function).
 *   - Firestore Security Rules block all client reads/writes on this collection.
 *   - We use a Firestore transaction to prevent race conditions under concurrent calls.
 */

'use strict';

const { HttpsError } = require('firebase-functions/v2/https');

const WINDOW_MS  = 60 * 60 * 1000; // 1 hour
const MAX_CALLS  = 3;               // calls per window

/**
 * Checks and increments the rate-limit counter for the given uid.
 *
 * Uses a Firestore transaction to atomically read → decide → write,
 * preventing concurrent calls from bypassing the limit.
 *
 * @param {FirebaseFirestore.Firestore} db  — Admin Firestore instance
 * @param {string}                      uid — validated Firebase UID
 * @returns {Promise<void>}
 * @throws {HttpsError} 'resource-exhausted' when the limit is reached.
 */
async function checkRateLimit(db, uid) {
  const ref = db.doc(`rateLimit/${uid}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now  = Date.now();

    let count       = 0;
    let windowStart = now;

    if (snap.exists) {
      const data = snap.data();
      count       = typeof data.count       === 'number' ? data.count       : 0;
      windowStart = typeof data.windowStart === 'number' ? data.windowStart : now;

      // Reset if the current window has expired
      if (now - windowStart > WINDOW_MS) {
        count       = 0;
        windowStart = now;
      }
    }

    // Check before incrementing
    if (count >= MAX_CALLS) {
      throw new HttpsError(
        'resource-exhausted',
        'Plan generation limit reached. Try again in an hour.'
      );
    }

    // Increment and persist
    tx.set(ref, { count: count + 1, windowStart }, { merge: false });
  });
}

module.exports = { checkRateLimit };
