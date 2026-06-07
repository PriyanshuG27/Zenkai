'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { validateUID } = require('./validators');

const GROQ_API_KEY = process.env.GROQ_API_KEY;

exports.generateChallenge = onCall({ region: 'asia-south2', timeoutSeconds: 60 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Login required');
  }

  try {
    validateUID(uid);

    const adminDb = getFirestore();

    // 1. Fetch user profile to read goal and userType
    const userSnap = await adminDb.doc(`users/${uid}`).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const userGoal = userData.goal || 'General Fitness';
    const userType = userData.userType || 'Beginner';

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
      // Must be different from weakPoint, or if all are same default to Chest
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

    // 6. Groq Copywriter Call if API Key is available
    if (GROQ_API_KEY) {
      try {
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

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.7
          })
        });

        if (response.ok) {
          const resData = await response.json();
          const contentText = resData.choices?.[0]?.message?.content || '{}';
          const groqJSON = JSON.parse(contentText);
          
          if (groqJSON.weak_point && groqJSON.weak_point.title && groqJSON.weak_point.description) {
            wpTitle = groqJSON.weak_point.title.trim();
            wpDesc = groqJSON.weak_point.description.trim();
          }
          if (groqJSON.favorite && groqJSON.favorite.title && groqJSON.favorite.description) {
            favTitle = groqJSON.favorite.title.trim();
            favDesc = groqJSON.favorite.description.trim();
          }
        } else {
          console.warn('[generateChallenge] Groq API returned status:', response.status);
        }
      } catch (groqErr) {
        console.error('[generateChallenge] Groq API call failed, using fallback:', groqErr);
      }
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

    return [
      { id: wpRef.id, ...wpTemplate },
      { id: favRef.id, ...favTemplate }
    ];

  } catch (error) {
    console.error('[generateChallenge] error:', error.message);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Challenge generation failed. Please try again.');
  }
});
