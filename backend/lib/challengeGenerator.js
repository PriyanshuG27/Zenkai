'use strict';

const { adminDb } = require('./firebaseAdmin');
const { SQUAD_CHALLENGE } = require('./models');
const { executeAICall } = require('./aiRouter');

/**
 * Core function to generate a weekly synergy challenge (Titan Raid) for a squad and save it.
 * @param {string} squadCode 
 * @returns {Promise<object>} The generated challenge
 */
async function generateChallengeForSquad(squadCode, isRegen = false) {
  const squadRef = adminDb.doc(`shared_squads/${squadCode}`);
  const squadSnap = await squadRef.get();
  if (!squadSnap.exists) {
    throw new Error(`Squad ${squadCode} not found`);
  }

  const squadData = squadSnap.data();
  const memberUids = squadData.memberUids || [];
  const memberCount = Math.max(1, memberUids.length);

  // 1. Calculate win streak and progressive overload multiplier
  let winStreak = squadData.winStreak || 0;
  const prevChall = squadData.activeChallenge;
  if (prevChall) {
    if (prevChall.status === 'completed') {
      winStreak += 1;
    } else {
      winStreak = 0; // reset streak on failure
    }
  }

  const alpha = Math.min(1.25, 1.05 + winStreak * 0.05);

  // 2. Fetch past 21-day volume history for all members in parallel
  const twentyOneDaysAgo = new Date();
  twentyOneDaysAgo.setDate(twentyOneDaysAgo.getDate() - 21);
  twentyOneDaysAgo.setHours(0, 0, 0, 0);

  let sumOfAvgWeeklyVolumes = 0;

  await Promise.all(
    memberUids.map(async (mUid) => {
      // Query mobile sessions
      const mobileSnap = await adminDb
        .collection(`users/${mUid}/sessions`)
        .where('date', '>=', twentyOneDaysAgo)
        .get();

      // Query desktop sessions
      const desktopSnap = await adminDb
        .collection(`users/${mUid}/executed_sessions`)
        .where('date', '>=', twentyOneDaysAgo)
        .get();

      let memberTotalVolume = 0;
      mobileSnap.docs.forEach(d => memberTotalVolume += d.data().totalVolume || 0);
      desktopSnap.docs.forEach(d => memberTotalVolume += d.data().totalVolume || 0);

      // Average weekly volume (past 21 days = 3 weeks)
      let avgWeeklyVolume = memberTotalVolume / 3;

      // Clinical minimum baseline per user of 12,000kg to safeguard against inactivity and ensure a tough challenge
      if (avgWeeklyVolume < 12000) {
        avgWeeklyVolume = 12000;
      }

      sumOfAvgWeeklyVolumes += avgWeeklyVolume;
    })
  );

  // 3. Compute target Titan HP
  const calculatedTitanHP = Math.round(sumOfAvgWeeklyVolumes * alpha);

  // 4. Randomly select weakness muscle group
  const weaknesses = ['CHEST', 'BACK', 'LEGS', 'SHOULDERS', 'ARMS'];
  const weakness = weaknesses[Math.floor(Math.random() * weaknesses.length)];

  // Default values in case AI call fails
  let titanName = "The Iron Sentinel";
  let lore = "An ancient mechanical titan fueled by the kinetic energy of heavy compounds. Only collective squad volume can shut down its power core.";
  let rewards = ["1.2x XP Multiplier", "Sattu Synthesizer Badge"];

  const prompt = `
  You are an elite fitness AI generating a weekly PvE "Titan Raid" for a ${memberCount}-person lifting squad.
  The squad must collectively lift ${calculatedTitanHP} kg of volume this week to defeat the Titan.

  Assign ${weakness} as the Titan's "Weakness". Volume lifted targeting this muscle group will deal 1.5x damage.

  RESPONSE FORMAT: Strictly return valid JSON. Do not wrap in markdown code blocks.
  {
    "titanName": "String (e.g., The Iron Sentinel)",
    "lore": "String (2 sentences of aggressive, sci-fi/fantasy fitness lore)",
    "totalHP": Number (exact value: ${calculatedTitanHP}),
    "weakness": "String (must be exactly: ${weakness})",
    "rewards": ["String", "String"]
  }
`;

  // Three-tier AI call: Groq Primary → Groq Fallback → Gemini
  const copywriteJSON = await executeAICall('SQUAD_CHALLENGE', prompt, '', {
    jsonMode: true,
    temperature: 0.7
  });

  if (copywriteJSON) {
    if (copywriteJSON.titanName) titanName = copywriteJSON.titanName.trim();
    if (copywriteJSON.lore) lore = copywriteJSON.lore.trim();
    if (copywriteJSON.rewards) rewards = copywriteJSON.rewards;
  }

  // Initialize progress map
  const progressMap = {};
  memberUids.forEach(mUid => {
    progressMap[mUid] = 0;
  });

  const activeChallenge = {
    title: titanName,
    description: lore,
    muscleGroup: weakness, // maps directly to weakness
    isTitanRaid: true,
    weakness: weakness,
    totalHP: calculatedTitanHP,
    currentHP: calculatedTitanHP,
    damageDealt: 0,
    progress: progressMap,
    rewardType: 'bossFightKey',
    rewardName: rewards.join(', '),
    startDate: Date.now(),
    endDate: Date.now() + 7 * 24 * 60 * 60 * 1000, // Weekly
    status: 'active',
    claimedBy: {}
  };

  const updatePayload = {
    activeChallenge,
    winStreak,
    regenerationVotes: [],
    hasRegeneratedThisWeek: isRegen
  };

  if (isRegen) {
    updatePayload.lastRegenTimestamp = Date.now();
  }

  // Save challenge and update win streak states on the squad document
  await squadRef.set(updatePayload, { merge: true });

  return activeChallenge;
}

module.exports = {
  generateChallengeForSquad
};
