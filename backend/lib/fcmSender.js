'use strict';

const { admin, adminDb } = require('./firebaseAdmin');

/**
 * Sends a push notification to one or more user IDs.
 * Automatically fetches their registered FCM tokens from Firestore and prunes stale tokens.
 *
 * @param {Object} params
 * @param {string[]} params.recipientUids - Array of target user UIDs.
 * @param {string} params.title - Notification title.
 * @param {string} params.body - Notification body content.
 * @param {Object} [params.data] - Additional key-value metadata to send with the push.
 */
async function sendPushNotification({ recipientUids, title, body, data }) {
  if (!recipientUids || !Array.isArray(recipientUids) || recipientUids.length === 0) {
    return;
  }

  try {
    const tokens = [];
    const tokenToUidMap = {};

    // 1. Fetch FCM tokens for each target recipient
    for (const uid of recipientUids) {
      const tokensSnap = await adminDb.collection(`users/${uid}/fcmTokens`).get();
      tokensSnap.forEach(doc => {
        const token = doc.data().token || doc.id;
        if (token) {
          tokens.push(token);
          tokenToUidMap[token] = uid;
        }
      });
    }

    if (tokens.length === 0) {
      console.log(`[fcmSender] No registered FCM tokens found for UIDs: ${recipientUids.join(', ')}`);
      return;
    }

    console.log(`[fcmSender] Sending push notification to ${tokens.length} tokens for UIDs: ${recipientUids.join(', ')}`);

    // 2. Chunk tokens into arrays of 500 (FCM sendEachForMulticast limit)
    const CHUNK_SIZE = 500;
    let successCount = 0;
    let failureCount = 0;
    const tokensToDelete = [];

    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      const chunkTokens = tokens.slice(i, i + CHUNK_SIZE);
      const message = {
        data: {
          title: title || '',
          body: body || '',
          url: (data && data.url) || '/squad',
          ...(data || {})
        },
        tokens: chunkTokens
      };

      // 3. Send multicast via Admin SDK
      const response = await admin.messaging().sendEachForMulticast(message);
      successCount += response.successCount;
      failureCount += response.failureCount;

      // Handle token cleanup for invalid/expired tokens in this chunk
      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const error = resp.error;
            const token = chunkTokens[idx];
            console.warn(`[fcmSender] Token failed: ${token.slice(0, 10)}... Error Code: ${error?.code}, Message: ${error?.message}`);
            
            if (
              error?.code === 'messaging/invalid-registration-token' ||
              error?.code === 'messaging/registration-token-not-registered'
            ) {
              tokensToDelete.push(token);
            }
          }
        });
      }
    }

    console.log(`[fcmSender] Sent successfully: ${successCount}, Failed: ${failureCount}`);

    // 4. Batch delete stale tokens
    if (tokensToDelete.length > 0) {
      console.log(`[fcmSender] Cleaning up ${tokensToDelete.length} stale FCM tokens...`);
      // Firestore batch has a 500 operation limit, so we chunk token deletions too
      for (let i = 0; i < tokensToDelete.length; i += 500) {
        const batchTokens = tokensToDelete.slice(i, i + 500);
        const batch = adminDb.batch();
        for (const token of batchTokens) {
          const uid = tokenToUidMap[token];
          if (uid) {
            const tokenDocRef = adminDb.doc(`users/${uid}/fcmTokens/${token}`);
            batch.delete(tokenDocRef);
          }
        }
        await batch.commit();
      }
      console.log('[fcmSender] Cleaned up stale tokens.');
    }
  } catch (error) {
    console.error('[fcmSender] Failed to send push notification:', error);
  }
}

module.exports = { sendPushNotification };
