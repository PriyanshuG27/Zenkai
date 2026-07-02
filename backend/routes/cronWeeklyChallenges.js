const express = require('express');
const router = express.Router();
const { processSquadWeeklyChallenges } = require('../lib/weeklyChallengeScheduler');

function verifyCronSecret(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cronWeeklyChallenges] CRON_SECRET environment variable is not set.');
    return res.status(500).json({ error: 'Cron secret not configured on server.' });
  }
  if (req.headers['x-cron-secret'] !== secret) {
    console.warn('[cronWeeklyChallenges] Unauthorized cron trigger attempt from IP:', req.ip);
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
}

router.post('/', verifyCronSecret, async (req, res) => {
  try {
    const now = new Date();
    const isSunday = now.getDay() === 0;
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
