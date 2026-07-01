const express = require('express');
const router = express.Router();
const { processGymReminders } = require('../lib/reminderScheduler');

router.post('/', async (req, res) => {
  // Simple auth to prevent random pings (optional: use a secure secret header in production)
  // For now, we just rely on Cloud Scheduler calling it or a generic endpoint
  
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
