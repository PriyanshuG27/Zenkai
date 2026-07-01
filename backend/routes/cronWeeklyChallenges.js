const express = require('express');
const router = express.Router();
const { processSquadWeeklyChallenges } = require('../lib/weeklyChallengeScheduler');

router.post('/', async (req, res) => {
  // Simple auth to prevent random pings (optional: use a secure secret header in production)
  // For now, we just rely on Cloud Scheduler calling it or a generic endpoint
  
  try {
    // Only run during early morning on Sunday (e.g. between 00:00 and 02:00 local server time)
    // Or you can let Cloud Scheduler handle the schedule and remove this check
    // But since the original logic had this check, let's keep it just in case
    const now = new Date();
    const isSunday = now.getDay() === 0; // 0 is Sunday
    const hours = now.getHours();
    const shouldRun = isSunday && hours >= 0 && hours < 2;

    if (shouldRun || req.query.force === 'true') {
      console.log('[cronWeeklyChallenges] Sunday morning detected (or forced). Initiating process...');
      await processSquadWeeklyChallenges();
      return res.status(200).json({ status: 'ok', ran: true });
    } else {
      return res.status(200).json({ status: 'ok', ran: false, reason: 'Not scheduled time' });
    }
  } catch (err) {
    console.error('[cronWeeklyChallenges] Error:', err);
    return res.status(500).json({ error: 'Failed to process challenges' });
  }
});

module.exports = router;
