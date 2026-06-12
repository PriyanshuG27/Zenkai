'use strict';

const authGuard = require('../middleware/authGuard');
const { adminDb } = require('../lib/firebaseAdmin');
const { sendPushNotification } = require('../lib/fcmSender');

module.exports = [
  authGuard,
  async (req, res) => {
    const senderUid = req.user.uid;
    const { recipientUids, squadCode, title, body, data } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    try {
      let uids = [];

      // Add explicit UIDs if provided
      if (recipientUids && Array.isArray(recipientUids)) {
        uids = [...recipientUids];
      }

      // Add squad member UIDs (except the sender) if squadCode is provided
      if (squadCode) {
        const squadSnap = await adminDb.doc(`shared_squads/${squadCode}`).get();
        if (squadSnap.exists) {
          const squadData = squadSnap.data();
          const memberUids = squadData.memberUids || [];
          const filteredMembers = memberUids.filter(uid => uid !== senderUid);
          uids = [...new Set([...uids, ...filteredMembers])];
        }
      }

      if (uids.length === 0) {
        return res.status(200).json({ success: true, message: 'No recipients resolved.' });
      }

      // Send the push notification asynchronously (non-blocking)
      sendPushNotification({
        recipientUids: uids,
        title,
        body,
        data: {
          url: '/squad',
          ...(data || {})
        }
      }).catch(err => console.error('[sendNotification Route] FCM async error:', err));

      return res.status(200).json({ success: true, message: 'Push notifications queued.' });
    } catch (err) {
      console.error('[sendNotification Route] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }
];
