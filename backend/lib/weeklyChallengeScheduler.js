'use strict';

const { adminDb } = require('./firebaseAdmin');
const { generateChallengeForSquad } = require('./challengeGenerator');

/**
 * Returns a unique string identifier for the current week.
 * E.g., based on dividing epoch time by 7 days.
 */
function getWeekKey(date) {
  return Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000)).toString();
}

/**
 * Checks all active squads, generating new weekly synergy challenges for them
 * sequentially with a small delay to avoid Groq/Gemini API rate limiting.
 */
async function processSquadWeeklyChallenges() {
  const now = new Date();
  const weekKey = getWeekKey(now);

  console.log(`[weeklyChallengeScheduler] Running automated challenge checks for week ${weekKey}...`);

  // Use a system config document in Firestore to prevent double runs
  const configRef = adminDb.doc('system/squad_challenge_scheduler');
  
  try {
    const configSnap = await configRef.get();
    if (configSnap.exists && configSnap.data().lastRunWeek === weekKey) {
      console.log('[weeklyChallengeScheduler] Automated challenges already generated for this week.');
      return;
    }

    // Fetch all squads in the system
    const squadsCol = adminDb.collection('shared_squads');
    const squadsSnap = await squadsCol.get();
    
    if (squadsSnap.empty) {
      console.log('[weeklyChallengeScheduler] No squads found to update.');
      return;
    }

    const squadsList = squadsSnap.docs;
    console.log(`[weeklyChallengeScheduler] Found ${squadsList.length} squads to process.`);

    // Process squads sequentially with a delay ("slowly")
    for (let i = 0; i < squadsList.length; i++) {
      const docSnap = squadsList[i];
      const squadCode = docSnap.id;
      const squadData = docSnap.data();

      // Check if challenge is already generated for this week
      const chall = squadData.activeChallenge;
      if (chall && chall.status === 'active' && chall.startDate) {
        const challWeekKey = getWeekKey(new Date(chall.startDate));
        if (challWeekKey === weekKey) {
          console.log(`[weeklyChallengeScheduler] Squad ${squadCode} already has a challenge active for this week.`);
          continue;
        }
      }

      console.log(`[weeklyChallengeScheduler] Generating challenge for ${squadCode}...`);
      try {
        await generateChallengeForSquad(squadCode);
        // Delay 3 seconds between requests to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (err) {
        console.error(`[weeklyChallengeScheduler] Failed to generate challenge for ${squadCode}:`, err.message);
      }
    }

    // Update config to mark this week as completed
    await configRef.set({ lastRunWeek: weekKey, lastRunDate: now.toISOString() }, { merge: true });
    console.log('[weeklyChallengeScheduler] Completed weekly challenge generation.');

  } catch (error) {
    console.error('[weeklyChallengeScheduler] Error running scheduler task:', error.message);
  }
}

/**
 * Registers an hourly interval to check if it's Sunday and run the challenge updates.
 */
function initWeeklyChallengeScheduler() {
  // Check every hour
  const CHECK_INTERVAL = 60 * 60 * 1000;
  
  setInterval(async () => {
    const now = new Date();
    const isSunday = now.getDay() === 0; // 0 is Sunday
    
    // Only run during early morning (e.g. between 00:00 and 02:00 local server time)
    const hours = now.getHours();
    const shouldRun = isSunday && hours >= 0 && hours < 2;

    if (shouldRun) {
      console.log('[weeklyChallengeScheduler] Sunday morning detected. Initiating process...');
      await processSquadWeeklyChallenges();
    }
  }, CHECK_INTERVAL);

  console.log('[weeklyChallengeScheduler] Background weekly cron scheduler initialized (hourly checks).');
}

module.exports = {
  processSquadWeeklyChallenges,
  initWeeklyChallengeScheduler
};
