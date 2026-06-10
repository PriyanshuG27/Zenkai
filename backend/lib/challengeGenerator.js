'use strict';

const { adminDb } = require('./firebaseAdmin');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const { SQUAD_CHALLENGE } = require('./models');

/**
 * Core function to generate a weekly synergy challenge (Titan Raid) for a squad and save it.
 * @param {string} squadCode 
 * @returns {Promise<object>} The generated challenge
 */
async function generateChallengeForSquad(squadCode) {
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

      // Clinical minimum baseline per user of 5,000kg to safeguard against inactivity
      if (avgWeeklyVolume < 5000) {
        avgWeeklyVolume = 5000;
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

  let copywriteJSON = null;

  // Model 1: Groq (Primary — using Llama 3.3 70B)
  if (GROQ_API_KEY) {
    try {
      console.log(`[challengeGenerator] Generating Titan Raid for ${squadCode} via Groq (${SQUAD_CHALLENGE.PRIMARY})...`);
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: SQUAD_CHALLENGE.PRIMARY,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.7
        })
      });

      if (response.ok) {
        const resData = await response.json();
        const contentText = resData.choices?.[0]?.message?.content || '{}';
        
        let cleanText = contentText.trim();
        if (cleanText.includes('```')) {
          cleanText = cleanText.replace(/```(?:json)?/g, '').trim();
        }
        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanText = jsonMatch[0];
        }

        copywriteJSON = JSON.parse(cleanText);
        console.log(`[challengeGenerator] Groq (${SQUAD_CHALLENGE.PRIMARY}) succeeded for ${squadCode}`);
      } else {
        const errText = await response.text();
        console.warn(`[challengeGenerator] Groq API returned status ${response.status}: ${errText}`);
      }
    } catch (groqErr) {
      console.error(`[challengeGenerator] Groq (${SQUAD_CHALLENGE.PRIMARY}) call failed, trying fallback:`, groqErr.message);
    }
  }

  // Model 2: Gemini (Fallback — using Gemini 3.1 Flash / gemini-flash-latest)
  if (!copywriteJSON && GEMINI_API_KEY) {
    try {
      console.log(`[challengeGenerator] Generating Titan Raid for ${squadCode} via Gemini (${SQUAD_CHALLENGE.FALLBACK})...`);
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: SQUAD_CHALLENGE.FALLBACK,
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json'
        },
      });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });
      const text = result.response.text().trim();
      
      let cleanText = text;
      if (cleanText.includes('```')) {
        cleanText = cleanText.replace(/```(?:json)?/g, '').trim();
      }
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanText = jsonMatch[0];
      }

      copywriteJSON = JSON.parse(cleanText);
      console.log(`[challengeGenerator] Gemini (${SQUAD_CHALLENGE.FALLBACK}) succeeded for ${squadCode}`);
    } catch (geminiErr) {
      console.error(`[challengeGenerator] Gemini (${SQUAD_CHALLENGE.FALLBACK}) fallback failed:`, geminiErr.message);
    }
  }

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

  // Save challenge and update win streak states on the squad document
  await squadRef.set({
    activeChallenge,
    winStreak,
    hasRegeneratedThisWeek: false,
    regenerationVotes: []
  }, { merge: true });

  return activeChallenge;
}

module.exports = {
  generateChallengeForSquad
};
