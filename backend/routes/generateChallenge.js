'use strict';

const authGuard = require('../middleware/authGuard');
const { adminDb } = require('../lib/firebaseAdmin');
const { validateUID } = require('../lib/validators');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const { PERSONAL_CHALLENGE } = require('../lib/models');

module.exports = [authGuard, async (req, res) => {
  const uid = req.user.uid;

  try {
    validateUID(uid);

    // 1. Fetch user profile to read goal and userType (split across public and private documents)
    const [userSnap, privateSnap] = await Promise.all([
      adminDb.doc(`users/${uid}`).get(),
      adminDb.doc(`users/${uid}/private/profile`).get()
    ]);
    const publicData = userSnap.exists ? userSnap.data() : {};
    const privateData = privateSnap.exists ? privateSnap.data() : {};
    const mergedUserData = { ...publicData, ...privateData };
    const userGoal = mergedUserData.goal || 'General Fitness';
    const userType = mergedUserData.userType || 'Beginner';

    // 2. Fetch user's last 15 sessions
    const sessionsSnap = await adminDb
      .collection(`users/${uid}/sessions`)
      .orderBy('date', 'desc')
      .limit(15)
      .get();

    // 3. Tally sets per muscle group
    const muscleGroups = ['Chest', 'Back', 'Legs', 'Core', 'Shoulders', 'Arms'];
    const tallies = {};
    muscleGroups.forEach(g => { tallies[g.toLowerCase()] = 0; });

    for (const sessionDoc of sessionsSnap.docs) {
      const exercisesSnap = await adminDb
        .collection(`users/${uid}/sessions/${sessionDoc.id}/exercises`)
        .get();

      exercisesSnap.docs.forEach(exDoc => {
        const exData = exDoc.data();
        let group = (exData.muscleGroup || '').toLowerCase();
        
        // Map common variations to base muscle groups
        if (group === 'legs' || group === 'quads' || group === 'hamstrings' || group === 'calves' || group === 'glutes') {
          group = 'legs';
        } else if (group === 'chest' || group === 'pecs') {
          group = 'chest';
        } else if (group === 'back' || group === 'lats' || group === 'traps') {
          group = 'back';
        } else if (group === 'core' || group === 'abs' || group === 'abdominal') {
          group = 'core';
        } else if (group === 'shoulders' || group === 'delts') {
          group = 'shoulders';
        } else if (group === 'arms' || group === 'biceps' || group === 'triceps' || group === 'forearms') {
          group = 'arms';
        }

        if (tallies[group] !== undefined) {
          const doneSets = (exData.sets || []).filter(s => s.done || s.completed);
          tallies[group] += doneSets.length;
        }
      });
    }

    // 4. Find lagging muscle group (Weak Point) - lowest tally
    let weakPoint = 'Core';
    let minSets = Infinity;
    muscleGroups.forEach(g => {
      const groupKey = g.toLowerCase();
      const count = tallies[groupKey];
      if (count < minSets) {
        minSets = count;
        weakPoint = g;
      }
    });

    // 5. Find favorite muscle group - highest tally
    let favMuscle = 'Chest';
    let maxSets = -1;
    muscleGroups.forEach(g => {
      const groupKey = g.toLowerCase();
      const count = tallies[groupKey];
      if (count > maxSets && g.toLowerCase() !== weakPoint.toLowerCase()) {
        maxSets = count;
        favMuscle = g;
      }
    });

    // Set target volume based on user goal
    let weakPointSets = 12;
    let favMuscleSets = 16;
    if (userGoal === 'Strength' || userGoal === 'Muscle Gain') {
      weakPointSets = 18;
      favMuscleSets = 24;
    }

    const durationDays = 28;

    // Fallbacks
    let wpTitle = `${weakPoint} Crucible`;
    let wpDesc = `Complete ${weakPointSets} sets of ${weakPoint} to strengthen your foundation and support your ${userGoal} goal.`;

    let favTitle = `${favMuscle} Champion`;
    let favDesc = `Log ${favMuscleSets} sets of ${favMuscle} to dominate your favorite lifts.`;

    // 6. Groq / Gemini Copywriter Call
    let copywriteJSON = null;
    const prompt = `You are an elite fitness gamification designer. Generate two personalized challenges for a user with the goal '${userGoal}' and level '${userType}':
1. A Weak Point Challenge for their lagging muscle group: ${weakPoint}. Target: Complete ${weakPointSets} sets of ${weakPoint} over ${durationDays} days.
2. A Favorite Muscle Group Challenge for their favorite muscle group: ${favMuscle}. Target: Complete ${favMuscleSets} sets of ${favMuscle} over ${durationDays} days.

Generate a JSON object containing a 'weak_point' challenge and a 'favorite' challenge. Each must have a catchy 'title' (max 4 words, e.g. 'Leg Day Legend', 'The Core Crucible') and a 'description' (max 15 words).
Return ONLY valid JSON.
JSON format:
{
  "weak_point": {
    "title": "...",
    "description": "..."
  },
  "favorite": {
    "title": "...",
    "description": "..."
  }
}`;

    // Model 1: Groq (Primary — using Llama 3.1 8B)
    if (GROQ_API_KEY) {
      try {
        console.log(`[generateChallenge] Attempting Model 1: Groq (${PERSONAL_CHALLENGE.PRIMARY})...`);
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: PERSONAL_CHALLENGE.PRIMARY,
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
          console.log(`[generateChallenge] Groq (${PERSONAL_CHALLENGE.PRIMARY}) succeeded.`);
        } else {
          const errText = await response.text();
          console.warn(`[generateChallenge] Groq API returned status ${response.status}: ${errText}`);
        }
      } catch (groqErr) {
        console.error(`[generateChallenge] Groq (${PERSONAL_CHALLENGE.PRIMARY}) failed, trying fallback:`, groqErr.message);
      }
    }

    // Model 2: Gemini (Fallback — using Gemini 3.1 Flash Lite)
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!copywriteJSON && GEMINI_API_KEY) {
      try {
        console.log(`[generateChallenge] Attempting Model 2: Gemini (${PERSONAL_CHALLENGE.FALLBACK}) fallback...`);
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: PERSONAL_CHALLENGE.FALLBACK,
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
        console.log(`[generateChallenge] Gemini (${PERSONAL_CHALLENGE.FALLBACK}) fallback succeeded.`);
      } catch (geminiErr) {
        console.error(`[generateChallenge] Gemini (${PERSONAL_CHALLENGE.FALLBACK}) fallback failed:`, geminiErr.message);
      }
    }

    if (copywriteJSON) {
      if (copywriteJSON.weak_point && copywriteJSON.weak_point.title && copywriteJSON.weak_point.description) {
        wpTitle = copywriteJSON.weak_point.title.trim();
        wpDesc = copywriteJSON.weak_point.description.trim();
      }
      if (copywriteJSON.favorite && copywriteJSON.favorite.title && copywriteJSON.favorite.description) {
        favTitle = copywriteJSON.favorite.title.trim();
        favDesc = copywriteJSON.favorite.description.trim();
      }
    } else {
      console.log('[generateChallenge] Both APIs failed. Using local copywriter templates.');
    }

    const templatesCol = adminDb.collection(`users/${uid}/personalTemplates`);
    
    // Write weak point template
    const wpRef = templatesCol.doc();
    const wpTemplate = {
      type: 'weak_point',
      subtype: 'campaign',
      name: wpTitle,
      description: wpDesc,
      durationDays,
      goal: {
        targetSets: weakPointSets,
        muscleGroup: weakPoint
      }
    };
    await wpRef.set(wpTemplate);

    // Write favorite template
    const favRef = templatesCol.doc();
    const favTemplate = {
      type: 'weak_point',
      subtype: 'campaign',
      name: favTitle,
      description: favDesc,
      durationDays,
      goal: {
        targetSets: favMuscleSets,
        muscleGroup: favMuscle
      }
    };
    await favRef.set(favTemplate);

    const result = [
      { id: wpRef.id, ...wpTemplate },
      { id: favRef.id, ...favTemplate }
    ];

    return res.status(200).json(result);

  } catch (error) {
    console.error('[generateChallenge] error:', error.message);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Challenge generation failed. Please try again.' });
  }
}];
