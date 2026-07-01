const express = require('express');
const router = express.Router();
const { adminDb } = require('../lib/firebaseAdmin');
const authGuard = require('../middleware/authGuard');

router.post('/', authGuard, async (req, res) => {
  const uid = req.user.uid;
  const { feedbackId } = req.body;

  if (!feedbackId) {
    return res.status(400).json({ error: 'Missing feedbackId' });
  }

  try {
    const feedbackRef = adminDb.doc(`feedback/${feedbackId}`);
    const snap = await feedbackRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Feedback not found' });
    }
    const data = snap.data();
    // Only allow creator to delete their own feedback
    if (data.uid && data.uid !== uid) {
      return res.status(403).json({ error: 'You can only delete your own feedback' });
    }
    await feedbackRef.delete();
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[deleteFeedback] Error:', err);
    return res.status(500).json({ error: 'Failed to delete feedback' });
  }
});

module.exports = router;
