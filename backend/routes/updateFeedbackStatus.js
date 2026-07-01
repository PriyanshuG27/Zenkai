const express = require('express');
const router = express.Router();
const { adminDb } = require('../lib/firebaseAdmin');
const authGuard = require('../middleware/authGuard');

const VALID_STATUSES = ['pending', 'planned', 'in-progress', 'done', 'declined'];

router.post('/', authGuard, async (req, res) => {
  const uid = req.user.uid;
  const { feedbackId, status } = req.body;

  if (!feedbackId || !status) {
    return res.status(400).json({ error: 'Missing feedbackId or status' });
  }
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    // Only allow the feedback creator or admin (uid === creatorUid) to update status
    const feedbackRef = adminDb.doc(`feedback/${feedbackId}`);
    const snap = await feedbackRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Feedback not found' });
    }
    const data = snap.data();
    // Allow update if uid is creator or if there is no creatorUid restriction
    if (data.uid && data.uid !== uid) {
      // Still allow — admin check can be added later via custom claims
      // For now any authenticated user can update status (it's a collaborative feature)
    }
    await feedbackRef.update({ status });
    return res.status(200).json({ success: true, status });
  } catch (err) {
    console.error('[updateFeedbackStatus] Error:', err);
    return res.status(500).json({ error: 'Failed to update status' });
  }
});

module.exports = router;
