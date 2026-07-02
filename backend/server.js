require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// CORS: in dev allow any origin; in production lock to the deployed domain.
// VITE_ALLOWED_ORIGINS env var can be a comma-separated list, e.g.:
//   https://zenkai.app,https://www.zenkai.app
const isProd = process.env.NODE_ENV === 'production';
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

app.use(cors(isProd && allowedOrigins.length > 0
  ? {
      origin: allowedOrigins,
      credentials: true,
    }
  : { origin: true }  // dev: allow all
));

// Route-scoped JSON body size limits:
// - /api/verifyGymImage needs 10mb for Base64-encoded gym photos.
// - All other routes are capped at 100kb to prevent memory-exhaustion DoS.
app.use((req, res, next) => {
  const limit = req.path === '/api/verifyGymImage' ? '10mb' : '100kb';
  express.json({ limit })(req, res, next);
});

// Proactive Wake-Up / Health Verification Routes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'awake', timestamp: Date.now() });
});
app.get('/ping', (req, res) => {
  res.status(200).json({ status: 'awake', timestamp: Date.now() });
});


// Endpoint Routing Maps
app.post('/api/verifyGymImage', require('./routes/verifyGymImage'));
app.post('/api/generatePlan', require('./routes/generatePlan'));
app.post('/api/generateChallenge', require('./routes/generateChallenge'));
app.post('/api/generateSquadChallenge', require('./routes/generateSquadChallenge'));
app.post('/api/generateWeeklyMagazine', require('./routes/generateWeeklyMagazine'));
app.post('/api/sendNotification', require('./routes/sendNotification'));
app.post('/api/scheduleRestNotification', require('./routes/scheduleRestNotification'));
app.post('/api/cancelRestNotification', require('./routes/cancelRestNotification'));
app.post('/api/getPRStats', require('./routes/getPRStats'));
app.post('/api/openTreasureChest', require('./routes/openTreasureChest'));
app.post('/api/summonNextTitan', require('./routes/summonNextTitan'));

// Core Gamification Routers
app.use('/api/rescueStreak', require('./routes/rescueStreak'));
app.use('/api/createWager', require('./routes/createWager'));
app.use('/api/redeemEasterEgg', require('./routes/redeemEasterEgg'));
app.use('/api/logWorkout', require('./routes/logWorkout'));
app.use('/api/updateChallengeProgress', require('./routes/updateChallengeProgress'));
app.use('/api/startChallenge', require('./routes/startChallenge'));
app.use('/api/joinChallenge', require('./routes/joinChallenge'));
app.use('/api/purchaseStoreItem', require('./routes/purchaseStoreItem'));
app.use('/api/upvoteFeedback', require('./routes/upvoteFeedback'));
app.use('/api/updateFeedbackStatus', require('./routes/updateFeedbackStatus'));
app.use('/api/deleteFeedback', require('./routes/deleteFeedback'));
app.use('/api/useChallengeSkip', require('./routes/useChallengeSkip'));

// Cron Endpoints
app.use('/api/cron/reminders', require('./routes/cronReminders'));
app.use('/api/cron/weeklyChallenges', require('./routes/cronWeeklyChallenges'));

// Cron jobs are driven externally by Google Cloud Scheduler via:
//   POST /api/cron/reminders
//   POST /api/cron/weeklyChallenges
// The in-process setInterval schedulers have been removed to prevent
// duplicate execution when multiple server instances are running.


// One-time admin broadcast endpoint.
// Protected by ADMIN_SECRET env var. Remove after broadcast confirmed sent.
app.post('/api/admin/triggerBroadcast', async (req, res) => {
  if (!process.env.ADMIN_SECRET || req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  const { runProductionBroadcast } = require('./lib/productionBroadcast');
  runProductionBroadcast()
    .then(() => console.log('[admin] Broadcast completed.'))
    .catch(err => console.error('[admin] Broadcast failed:', err));
  return res.status(200).json({ message: 'Broadcast triggered in background.' });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Zenkai Engine operational on port ${PORT}`));



