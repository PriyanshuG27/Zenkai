require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Set permissive CORS layer to receive requests from web and mobile viewports
app.use(cors({ origin: true }));

// Expand parsing capacity to safely handle baseline Base64 compressed image strings
app.use(express.json({ limit: '10mb' }));

// Proactive Wake-Up / Health Verification Route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'awake', timestamp: Date.now() });
});

// Endpoint Routing Maps
app.post('/api/verifyGymImage', require('./routes/verifyGymImage'));
app.post('/api/generatePlan', require('./routes/generatePlan'));
app.post('/api/generateChallenge', require('./routes/generateChallenge'));
app.post('/api/getPRStats', require('./routes/getPRStats'));
app.post('/api/generateSquadChallenge', require('./routes/generateSquadChallenge'));

// Initialize automated weekly challenge background scheduler
const { initWeeklyChallengeScheduler } = require('./lib/weeklyChallengeScheduler');
initWeeklyChallengeScheduler();

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`FitDesi Engine operational on port ${PORT}`));



