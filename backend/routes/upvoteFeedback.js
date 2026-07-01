const express = require('express');
const router = express.Router();
const { adminDb } = require('../lib/firebaseAdmin');
const authGuard = require('../middleware/authGuard');

router.post('/', authGuard, async (req, res) => {
  const uid = req.user.uid;
  const { feedbackId, voteType } = req.body;

  if (!feedbackId || !voteType) {
    return res.status(400).json({ error: 'Missing feedbackId or voteType' });
  }

  if (voteType !== 'up' && voteType !== 'down') {
    return res.status(400).json({ error: 'Invalid voteType. Must be up or down.' });
  }

  try {
    const feedbackRef = adminDb.doc(`feedback/${feedbackId}`);
    
    // Use a transaction to ensure that we don't accidentally exceed boundaries
    // and to safely determine if the user has already voted
    const result = await adminDb.runTransaction(async (t) => {
      const docSnap = await t.get(feedbackRef);
      if (!docSnap.exists) {
        throw new Error('Feedback not found');
      }

      const data = docSnap.data();
      const upvotes = data.upvotes || [];
      const downvotes = data.downvotes || [];

      const hasUpvoted = upvotes.includes(uid);
      const hasDownvoted = downvotes.includes(uid);

      let newUpvotes = [...upvotes];
      let newDownvotes = [...downvotes];

      if (voteType === 'up') {
        if (hasUpvoted) {
          newUpvotes = newUpvotes.filter(id => id !== uid);
        } else {
          newUpvotes.push(uid);
          newDownvotes = newDownvotes.filter(id => id !== uid);
        }
      } else if (voteType === 'down') {
        if (hasDownvoted) {
          newDownvotes = newDownvotes.filter(id => id !== uid);
        } else {
          newDownvotes.push(uid);
          newUpvotes = newUpvotes.filter(id => id !== uid);
        }
      }

      t.update(feedbackRef, {
        upvotes: newUpvotes,
        downvotes: newDownvotes
      });

      return {
        success: true,
        upvotes: newUpvotes,
        downvotes: newDownvotes
      };
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[upvoteFeedback] Error:', err);
    if (err.message === 'Feedback not found') {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to process vote' });
  }
});

module.exports = router;
