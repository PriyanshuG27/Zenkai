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

// Expand parsing capacity to safely handle baseline Base64 compressed image strings
app.use(express.json({ limit: '10mb' }));

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
app.post('/api/getPRStats', require('./routes/getPRStats'));
app.post('/api/generateSquadChallenge', require('./routes/generateSquadChallenge'));
app.post('/api/generateWeeklyMagazine', require('./routes/generateWeeklyMagazine'));
app.post('/api/sendNotification', require('./routes/sendNotification'));
app.post('/api/scheduleRestNotification', require('./routes/scheduleRestNotification'));
app.post('/api/cancelRestNotification', require('./routes/cancelRestNotification'));
app.post('/api/openTreasureChest', require('./routes/openTreasureChest'));
app.post('/api/summonNextTitan', require('./routes/summonNextTitan'));

// Initialize automated weekly challenge background scheduler
const { initWeeklyChallengeScheduler } = require('./lib/weeklyChallengeScheduler');
initWeeklyChallengeScheduler();

// Initialize automated 1-hour gym time reminder background scheduler
const { initReminderScheduler } = require('./lib/reminderScheduler');
initReminderScheduler();

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Zenkai Engine operational on port ${PORT}`));



