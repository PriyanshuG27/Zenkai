'use strict';

const authGuard = require('../middleware/authGuard');
const { adminDb } = require('../lib/firebaseAdmin');
const { sendPushNotification } = require('../lib/fcmSender');

// Max lengths for notification content to prevent abuse
const TITLE_MAX_LEN = 100;
const BODY_MAX_LEN = 300;

module.exports = [
  authGuard,
  async (req, res) => {
    const senderUid = req.user.uid;
    const { squadCode, recipientUids, title, body, data } = req.body;

    // squadCode is always required — all notifications must be squad-scoped.
    // recipientUids (optional) allows targeting specific members within the squad
    // for directed notifications (kudos, streak rescue, squad invite).
    // Recipients are validated against squad membership — no cross-squad targeting.
    if (!squadCode) {
      return res.status(400).json({ error: 'squadCode is required.' });
    }

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required.' });
    }

    if (typeof title !== 'string' || title.length > TITLE_MAX_LEN) {
      return res.status(400).json({ error: `Title must be a string under ${TITLE_MAX_LEN} characters.` });
    }

    if (typeof body !== 'string' || body.length > BODY_MAX_LEN) {
      return res.status(400).json({ error: `Body must be a string under ${BODY_MAX_LEN} characters.` });
    }

    // Validate recipientUids type if provided
    if (recipientUids !== undefined && (!Array.isArray(recipientUids) || recipientUids.length > 50)) {
      return res.status(400).json({ error: 'recipientUids must be an array of at most 50 UIDs.' });
    }

    try {
      // Fetch squad and verify sender is a member
      const squadSnap = await adminDb.doc(`shared_squads/${squadCode}`).get();
      if (!squadSnap.exists) {
        return res.status(404).json({ error: 'Squad not found.' });
      }

      const squadData = squadSnap.data();
      const memberUids = squadData.memberUids || [];

      // Sender must be a member of this squad
      if (!memberUids.includes(senderUid)) {
        return res.status(403).json({ error: 'You are not a member of this squad.' });
      }

      let uids;
      if (recipientUids && recipientUids.length > 0) {
        // Filter recipientUids to only include verified squad members (excluding sender).
        // This prevents targeting any user outside this squad.
        uids = recipientUids.filter(uid => uid !== senderUid && memberUids.includes(uid));
      } else {
        // Default: broadcast to all other squad members
        uids = memberUids.filter(uid => uid !== senderUid);
      }

      if (uids.length === 0) {
        return res.status(200).json({ success: true, message: 'No eligible recipients.' });
      }

      // Build FCM data payload from a strict whitelist.
      // The frontend only ever sends { url: '/squad' | '/some-path' }.
      // We never spread the raw client object — that would allow injecting
      // arbitrary keys or overriding reserved FCM fields.
      const safeFcmData = { url: '/squad' };
      if (data && typeof data.url === 'string' && data.url.startsWith('/') && data.url.length <= 200) {
        safeFcmData.url = data.url;
      }

      // Send asynchronously (non-blocking)
      sendPushNotification({
        recipientUids: uids,
        title,
        body,
        data: safeFcmData
      }).catch(err => console.error('[sendNotification Route] FCM async error:', err));

      return res.status(200).json({ success: true, message: 'Push notifications queued.' });
    } catch (err) {
      console.error('[sendNotification Route] Error:', err);
      return res.status(500).json({ error: 'Failed to send notification.' });
    }
  }
];
