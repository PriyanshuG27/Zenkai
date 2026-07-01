'use strict';

const { adminDb } = require('./firebaseAdmin');
const { sendPushNotification } = require('./fcmSender');

async function runProductionBroadcast() {
  const isEmulator = 
    process.env.VITE_FIREBASE_EMULATOR === 'true' || 
    process.env.FUNCTIONS_EMULATOR === 'true';

  // Do not run in local dev emulator to prevent spamming local/staging environments
  if (isEmulator) {
    console.log('[productionBroadcast] Skipping emulator run.');
    return;
  }

  try {
    const configRef = adminDb.doc('system_config/updates');
    const configSnap = await configRef.get();
    
    if (configSnap.exists && configSnap.data().broadcast_v1_1_1_sent === true) {
      console.log('[productionBroadcast] v1.1.1 update broadcast has already been sent.');
      return;
    }

    console.log('[productionBroadcast] Starting one-time production update broadcast...');

    let totalSent = 0;
    let hasMore = true;
    let lastVisible = null;
    const limit = 500;

    while (hasMore) {
      let query = adminDb.collection('users').orderBy('__name__').limit(limit);
      if (lastVisible) {
        query = query.startAfter(lastVisible);
      }

      const usersSnap = await query.get();
      if (usersSnap.empty) {
        hasMore = false;
        break;
      }

      const uids = [];
      usersSnap.forEach(doc => {
        if (doc.id) {
          uids.push(doc.id);
        }
      });

      if (uids.length > 0) {
        await sendPushNotification({
          recipientUids: uids,
          title: 'FitDesi Update: v1.1.1 is Live! 🚀',
          body: 'Dynamic leaderboard refresh timers, force sync, and database optimizations are now live. Tap to see What\'s New!',
          data: { url: '/profile' }
        });
        totalSent += uids.length;
        console.log(`[productionBroadcast] Broadcasted to ${totalSent} users so far...`);
      }

      lastVisible = usersSnap.docs[usersSnap.docs.length - 1];
    }

    if (totalSent === 0) {
      console.log('[productionBroadcast] No users found to notify.');
      return;
    }

    // Mark as sent in Firestore so it never runs again
    await configRef.set({ broadcast_v1_1_1_sent: true }, { merge: true });
    console.log(`[productionBroadcast] One-time v1.1.1 update broadcast sent to ${totalSent} users and flagged successfully.`);
  } catch (err) {
    console.error('[productionBroadcast] Failed to run update broadcast:', err);
  }
}

module.exports = { runProductionBroadcast };
