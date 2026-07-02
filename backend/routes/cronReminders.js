const express = require('express');
const router = express.Router();
const { processGymReminders } = require('../lib/reminderScheduler');

// Validates that the request comes from our authorized scheduler,
// not from a random unauthenticated actor on the internet.
function verifyCronSecret(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cronReminders] CRON_SECRET environment variable is not set. Rejecting all cron requests.');
    return res.status(500).json({ error: 'Cron secret not configured on server.' });
  }
  if (req.headers['x-cron-secret'] !== secret) {
    console.warn('[cronReminders] Unauthorized cron trigger attempt from IP:', req.ip);
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
}

router.post('/', verifyCronSecret, async (req, res) => {
  try {
    console.log('[cronReminders] Processing gym reminders...');
    await processGymReminders();
    return res.status(200).json({ status: 'ok', ran: true });
  } catch (err) {
    console.error('[cronReminders] Error:', err);
    return res.status(500).json({ error: 'Failed to process reminders' });
  }
});

module.exports = router;
