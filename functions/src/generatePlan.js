'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const { validateUID, validatePlanRequest, validatePlan } = require('./validators');
const { checkRateLimit } = require('./rateLimiter');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function getISOWeek(date = new Date()) {
  const tempDate = new Date(date.valueOf());
  tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7));
  const yearStart = new Date(tempDate.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
  return `${tempDate.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function parseGeminiJSON(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('plan_parse_failed');
  }
}

exports.generatePlan = onCall({ region: 'asia-south2', timeoutSeconds: 60 }, async (request) => {
  if (!GEMINI_API_KEY) {
    throw new HttpsError('internal', 'Server configuration error');
  }

  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Login required');
  }

  try {
    validateUID(uid);
    validatePlanRequest(request.data);

    const adminDb = getFirestore();
    await checkRateLimit(adminDb, uid);

    const userDoc = await adminDb.doc(`users/${uid}`).get();
    if (!userDoc.exists) {
      throw new HttpsError('not-found', 'User profile not found');
    }
    const { 
      equipmentList = [], 
      medicalFlags = [], 
      userType = 'Beginner',
      goal = 'General Fitness',
      workoutFrequency = '3-4 days/week',
      sessionDuration = '45-60 mins',
      dietType = 'Vegetarian'
    } = userDoc.data();

    const sessionsSnap = await adminDb
      .collection(`users/${uid}/sessions`)
      .orderBy('date', 'desc')
      .limit(14)
      .get();

    const sessions = await Promise.all(
      sessionsSnap.docs.map(async (sessionDoc) => {
        const sessionData = sessionDoc.data();
        const exercisesSnap = await adminDb
          .collection(`users/${uid}/sessions/${sessionDoc.id}/exercises`)
          .get();
        return {
          date: sessionData.date,
          exercises: exercisesSnap.docs.map((ex) => {
            const exData = ex.data();
            return {
              name: exData.exerciseKey || exData.name,
              sets: (exData.sets || []).filter(s => s.done).map(s => ({
                weight: s.weight || 0,
                reps: s.reps || 0
              }))
            };
          }).filter(ex => ex.sets.length > 0)
        };
      })
    );

    let sessionsSummaryString = JSON.stringify(sessions);
    if (sessionsSummaryString.length > 4000) {
      sessionsSummaryString = sessionsSummaryString.substring(0, 4000) + '... (truncated)';
    }

    const prompt = `You are an elite fitness coach generating a highly customized weekly workout plan.
USER PROFILE: 
- Experience Level: ${userType}
- Primary Goal: ${goal}
- Diet Type: ${dietType}
- Target Frequency: ${workoutFrequency}
- Max Session Duration: ${sessionDuration}
- Available Equipment: [${equipmentList.length > 0 ? equipmentList.join(', ') : 'Bodyweight only'}]
- Medical Restrictions: [${medicalFlags.length > 0 ? medicalFlags.join(', ') : 'None'}]

RECENT SESSION LOGS (last ${sessionsSnap.size} workouts):
${sessionsSummaryString}

STRICT RULES:
1. ONLY schedule workouts according to the Target Frequency (e.g., if 3-4 days/week, schedule exactly 3 or 4 days, rest the others).
2. NEVER prescribe exercises requiring equipment not in the Available Equipment list.
3. NEVER prescribe exercises that violate the Medical Restrictions.
4. Adapt the rep-ranges and sets based on the Primary Goal (e.g., Muscle Gain = 8-12 reps, Strength = 3-6 reps, Fat Loss = higher pace/reps).
5. Ensure workouts fit within the Max Session Duration.
6. If the RECENT SESSION LOGS are empty, prescribe conservative starter weights matching experience level, age, and gender.
7. If RECENT SESSION LOGS exist:
   - Identify the maximum weight and reps completed for each exercise.
   - Calculate their Estimated 1RM using the Epley formula: 1RM = Weight * (1 + Reps / 30).
   - Prescribe a targetWeight for the new plan's sets that equals 70-80% of that estimated 1RM for the target rep range.
   - Apply a precise 2.5% to 5.0% progressive overload weight increase on top of their recent maximum weight lifted for identical exercises.
   - Round all targetWeight values to the nearest 2.5 kg increment (e.g. 60 kg, 62.5 kg, 65 kg; 0 for bodyweight).
8. If the user experience level is 'Comeback', ignore progression and dial target weights back to 70-80% of their recent logs to ease them in safely.

OUTPUT FORMAT:
Respond ONLY with valid, minified JSON. Absolutely NO markdown, NO text outside the JSON, NO explanation.
JSON Schema: { "days": [{ "day": number (1-7), "focus": string (e.g. "Push", "Rest"), "exercises": [{ "name": string, "sets": number, "reps": string (e.g. "8-10"), "targetWeight": number (0 for bodyweight) }] }] }`;

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      generationConfig: {
        temperature: 0.2,
      },
    });

    const abortController = new AbortController();
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        abortController.abort();
        reject(new Error('deadline-exceeded'));
      }, 45000);
    });

    const geminiPromise = model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    }, {
      signal: abortController.signal
    });

    let geminiResult;
    try {
      geminiResult = await Promise.race([geminiPromise, timeoutPromise]);
    } catch (err) {
      if (err.message === 'deadline-exceeded' || err.name === 'AbortError') {
        throw new HttpsError('deadline-exceeded', 'Plan generation timed out. Please try again.');
      }
      throw err;
    }

    const rawText = geminiResult.response.text();
    const plan = parseGeminiJSON(rawText);
    validatePlan(plan);

    const weekId =
      request.data && typeof request.data.weekId === 'string' && /^\d{4}-W\d{2}$/.test(request.data.weekId)
        ? request.data.weekId
        : getISOWeek();

    await adminDb.doc(`users/${uid}/weeklyPlans/${weekId}`).set({
      weekId,
      generatedAt: FieldValue.serverTimestamp(),
      source: 'gemini',
      plan,
    });

    return { success: true, weekId };

  } catch (error) {
    console.error('[generatePlan] error:', error.message);
    if (error instanceof HttpsError) throw error;
    
    if (error.message === 'plan_parse_failed') {
      throw new HttpsError('internal', 'Plan generation failed. Please try again.');
    }
    throw new HttpsError('internal', 'Plan generation failed. Please try again.');
  }
});
