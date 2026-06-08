'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { validateUID } = require('./validators');

const GROQ_API_KEY = process.env.GROQ_API_KEY;

exports.generateSquadChallenge = onCall({ region: 'asia-south2', timeoutSeconds: 60 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Login required');
  }

  const squadCode = request.data?.squadCode;
  if (!squadCode) {
    throw new HttpsError('invalid-argument', 'Squad Code is required');
  }

  try {
    validateUID(uid);

    const adminDb = getFirestore();

    // 1. Fetch the squad document
    const squadRef = adminDb.doc(`shared_squads/${squadCode}`);
    const squadSnap = await squadRef.get();
    if (!squadSnap.exists) {
      throw new HttpsError('not-found', 'Squad not found');
    }

    const squadData = squadSnap.data();
    const memberUids = squadData.memberUids || [];
    if (!memberUids.includes(uid)) {
      throw new HttpsError('permission-denied', 'You are not a member of this squad');
    }

    // 2. Fetch all members profiles in parallel to aggregate stats/goals
    const memberSnaps = await Promise.all(
      memberUids.map(mUid => adminDb.doc(`users/${mUid}`).get())
    );

    const goals = [];
    const userTypes = [];
    memberSnaps.forEach(snap => {
      if (snap.exists) {
        const data = snap.data();
        if (data.goal) goals.push(data.goal);
        if (data.userType) userTypes.push(data.userType);
      }
    });

    const primaryGoal = goals.length > 0 ? goals[0] : 'General Fitness';
    const primaryLevel = userTypes.length > 0 ? userTypes[0] : 'Beginner';

    // Randomly select a muscle group for the squad synergy challenge
    const muscleGroups = ['Chest', 'Back', 'Legs', 'Core', 'Shoulders', 'Arms'];
    const selectedMuscle = muscleGroups[Math.floor(Math.random() * muscleGroups.length)];

    // Target sets: roughly 20-30 sets per member in the squad
    const memberCount = memberUids.length;
    const targetSets = Math.max(30, memberCount * 20);

    const durationDays = 14; // 2 weeks for squad challenges
    const rewardType = Math.random() < 0.5 ? 'bossFightKey' : 'squadBadge';
    const rewardName = rewardType === 'bossFightKey' ? 'Boss Fight Key' : 'Synergy Champion Trophy';

    // Fallback values
    let challengeTitle = `${selectedMuscle} Alliance`;
    let challengeDesc = `Work collectively as a squad to complete ${targetSets} working sets of ${selectedMuscle} within 14 days.`;

    // 3. Prompt Groq / Gemini for catchy copy
    let copywriteJSON = null;
    const prompt = `You are an elite fitness gamification designer. Generate a collaborative fitness challenge for a squad of ${memberCount} gym buddies whose primary training goal is '${primaryGoal}':
Challenge: Work collectively to complete ${targetSets} working sets of ${selectedMuscle} over ${durationDays} days.
Reward: A '${rewardName}' premium reward.

Generate a JSON object containing a 'squad_challenge' with a catchy 'title' (max 4 words, e.g. 'Leg Day Syndicate', 'Chest Day Alliance', 'Core Brotherhood') and a 'description' (max 15 words explaining the target).
Return ONLY valid JSON.
JSON format:
{
  "squad_challenge": {
    "title": "...",
    "description": "..."
  }
}`;

    // Model 1: Groq Llama 3.3 70B (Primary)
    if (GROQ_API_KEY) {
      try {
        console.log('[generateSquadChallenge] Attempting Model 1: Groq Llama 3.3 70B...');
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.7
          })
        });

        if (response.ok) {
          const resData = await response.json();
          const contentText = resData.choices?.[0]?.message?.content || '{}';
          copywriteJSON = JSON.parse(contentText);
          console.log('[generateSquadChallenge] Groq Llama 3.3 70B succeeded.');
        } else {
          const errText = await response.text();
          console.warn(`[generateSquadChallenge] Groq API returned status ${response.status}: ${errText}`);
        }
      } catch (groqErr) {
        console.error('[generateSquadChallenge] Groq API call failed, trying fallback:', groqErr.message);
      }
    }

    // Model 2: Gemini 1.5 Flash (Fallback)
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!copywriteJSON && GEMINI_API_KEY) {
      try {
        console.log('[generateSquadChallenge] Attempting Model 2: Gemini Flash...');
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: 'gemini-flash-latest',
          generationConfig: {
            temperature: 0.7,
            responseMimeType: 'application/json'
          },
        });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });
        const text = result.response.text().trim();
        copywriteJSON = JSON.parse(text);
        console.log('[generateSquadChallenge] Gemini Flash succeeded.');
      } catch (geminiErr) {
        console.error('[generateSquadChallenge] Gemini Flash fallback failed:', geminiErr.message);
      }
    }

    if (copywriteJSON && copywriteJSON.squad_challenge && copywriteJSON.squad_challenge.title && copywriteJSON.squad_challenge.description) {
      challengeTitle = copywriteJSON.squad_challenge.title.trim();
      challengeDesc = copywriteJSON.squad_challenge.description.trim();
    } else {
      console.log('[generateSquadChallenge] Both APIs failed or returned bad format. Using default copy.');
    }

    // 4. Initialize initial progress map
    const progressMap = {};
    memberUids.forEach(mUid => {
      progressMap[mUid] = 0;
    });

    const activeChallenge = {
      title: challengeTitle,
      description: challengeDesc,
      muscleGroup: selectedMuscle,
      targetSets,
      progress: progressMap,
      totalCompletedSets: 0,
      rewardType,
      rewardName,
      startDate: Date.now(),
      endDate: Date.now() + durationDays * 24 * 60 * 60 * 1000,
      status: 'active',
      claimedBy: {}
    };

    // 5. Save the challenge under activeChallenge field in the squad document
    await squadRef.set({ activeChallenge }, { merge: true });

    return { success: true, activeChallenge };

  } catch (error) {
    console.error('[generateSquadChallenge] error:', error.message);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Squad challenge generation failed. Please try again.');
  }
});
