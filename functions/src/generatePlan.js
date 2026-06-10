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
    await checkRateLimit(adminDb, uid, request.data?.usePowerUp === true);

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

    const exerciseNamesMap = {};
    const painSet = new Set();
    const easySet = new Set();
    const brokenSet = new Set();

    const sessions = await Promise.all(
      sessionsSnap.docs.map(async (sessionDoc) => {
        const sessionData = sessionDoc.data();
        
        // Accumulate debrief flags
        if (sessionData.debrief) {
          if (Array.isArray(sessionData.debrief.pain)) {
            sessionData.debrief.pain.forEach(k => painSet.add(k));
          }
          if (Array.isArray(sessionData.debrief.easy)) {
            sessionData.debrief.easy.forEach(k => easySet.add(k));
          }
          if (Array.isArray(sessionData.debrief.brokenEquipment)) {
            sessionData.debrief.brokenEquipment.forEach(k => brokenSet.add(k));
          }
        }

        const exercisesSnap = await adminDb
          .collection(`users/${uid}/sessions/${sessionDoc.id}/exercises`)
          .get();
        return {
          date: sessionData.date,
          safeMode: Boolean(sessionData.safeMode || sessionData.deload), // safeMode deload tag
          exercises: exercisesSnap.docs.map((ex) => {
            const exData = ex.data();
            const exKey = exData.exerciseKey || ex.id;
            if (exKey && exData.name) {
              exerciseNamesMap[exKey] = exData.name;
            }
            return {
              name: exData.name || exData.exerciseKey,
              sets: (exData.sets || []).filter(s => s.done).map(s => ({
                weight: s.weight || 0,
                reps: s.reps || 0
              }))
            };
          }).filter(ex => ex.sets.length > 0)
        };
      })
    );

    const painList = Array.from(painSet).map(k => exerciseNamesMap[k] ? `${exerciseNamesMap[k]} (${k})` : k);
    const easyList = Array.from(easySet).map(k => exerciseNamesMap[k] ? `${exerciseNamesMap[k]} (${k})` : k);
    const brokenList = Array.from(brokenSet).map(k => exerciseNamesMap[k] ? `${exerciseNamesMap[k]} (${k})` : k);

    // Fetch previous week's plan (most recent generated plan)
    const weeklyPlansSnap = await adminDb
      .collection(`users/${uid}/weeklyPlans`)
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();
    const previousPlan = !weeklyPlansSnap.empty ? weeklyPlansSnap.docs[0].data() : null;

    let sessionsSummaryString = JSON.stringify(sessions);
    if (sessionsSummaryString.length > 4000) {
      sessionsSummaryString = sessionsSummaryString.substring(0, 4000) + '... (truncated)';
    }

    let prompt;
    if (previousPlan && previousPlan.plan) {
      prompt = `You are an elite fitness coach and Strength Coach. You MUST take the user's PREVIOUS WEEK'S WORKOUT PLAN and output the EXACT SAME PLAN, but make surgical modifications only to the flagged exercises based on the user's recent feedback.

PREVIOUS WEEK'S PLAN:
${JSON.stringify(previousPlan.plan)}

USER FEEDBACK / DEBRIEF FLAGS FROM THE LAST 14 DAYS:
- Joint Pain/Discomfort (Substitute these exercises with joint-friendly, biomechanically similar movements): [${painList.join(', ')}]
- Too Easy (Apply a precise 2.5% to 5.0% progressive overload weight increase, rounded to the nearest 2.5kg, or increase target reps): [${easyList.join(', ')}]
- Broken Equipment (Substitute these exercises with equivalent free-weight or alternative machine exercises using available equipment): [${brokenList.join(', ')}]

USER PROFILE & CONSTRAINTS: 
- Experience Level: ${userType}
- Primary Goal: ${goal}
- Diet Type: ${dietType}
- Target Frequency: ${workoutFrequency}
- Max Session Duration: ${sessionDuration}
- Available Equipment: [${equipmentList.length > 0 ? equipmentList.join(', ') : 'Bodyweight only'}]
- Medical Restrictions: [${medicalFlags.length > 0 ? medicalFlags.join(', ') : 'None'}]

${request.data?.personalRequirements ? `USER'S PERSONAL REQUIREMENTS FOR THIS WEEK:\n"${request.data.personalRequirements}"\nYou MUST incorporate these requirements into the plan.\n` : ''}

STRICT RULES FOR MODIFICATION:
1. Copy the PREVIOUS WEEK'S PLAN exactly (same days, same focus, same exercises, same sets/reps/weights), EXCEPT for exercises flagged in the feedback/debrief list or affected by user's personal requirements.
2. For any exercise in the Joint Pain list: Replace it with a joint-friendly, biomechanically similar alternative that targets the same muscle group. Do NOT prescribe the original exercise.
3. For any exercise in the Too Easy list: Increase the targetWeight by 2.5% to 5.0% (rounded to the nearest 2.5 kg, e.g. from 60 kg to 62.5 kg). If it's a bodyweight exercise, increase the target reps instead.
4. For any exercise in the Broken Equipment list: Replace it with a free-weight or alternative machine exercise that targets the same muscles and is compatible with the Available Equipment.
5. Ensure all prescribed exercises comply with the Available Equipment list and Medical Restrictions.
6. Absolutely do not change any other exercises or focuses. Keep the structure identical.

OUTPUT FORMAT:
Respond ONLY with valid, minified JSON. Absolutely NO markdown, NO text outside the JSON, NO explanation.
JSON Schema: { "days": [{ "day": number (1-7), "focus": string (e.g. "Push", "Rest"), "exercises": [{ "name": string, "sets": number, "reps": string (e.g. "8-10"), "targetWeight": number (0 for bodyweight) }] }] }`;
    } else {
      prompt = `You are an elite fitness coach generating a highly customized weekly workout plan.
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
6. If the RECENT SESSION LOGS are empty (or this is a fresh plan), prescribe a high-quality, well-structured starter routine. For each active workout day, prescribe exactly 4 to 6 exercises: starting with primary compound lifts (e.g. Squat, Bench Press, or Push-Ups/Pull-Ups for bodyweight) followed by accessory and isolation movements. Use conservative starter weights matching the experience level, age, and gender.
7. If RECENT SESSION LOGS exist:
   - Identify the maximum weight and reps completed for each exercise.
   - Calculate their Estimated 1RM using the Epley formula: 1RM = Weight * (1 + Reps / 30).
   - Prescribe a targetWeight for the new plan's sets that equals 70-80% of that estimated 1RM for the target rep range.
   - Apply a precise 2.5% to 5.0% progressive overload weight increase on top of their recent maximum weight lifted for identical exercises.
   - Round all targetWeight values to the nearest 2.5 kg increment (e.g. 60 kg, 62.5 kg, 65 kg; 0 for bodyweight).
8. If the user experience level is 'Comeback', ignore progression and dial target weights back to 70-80% of their recent logs to ease them in safely.
9. CRITICAL AI CONTAMINATION FILTER: Ignore any session in RECENT SESSION LOGS where "safeMode": true is present. Treat flagged sessions as sick/recovery days. Do NOT use their weights/reps to calculate overload targets. Instead, progressive overload must be computed relative to the most recent healthy (unflagged) session for each exercise.
10. The "days" array MUST contain exactly 7 day objects (Day 1 to Day 7 in order). Non-workout/rest days must be explicitly included with "focus": "Rest" and "exercises": [].

${request.data?.personalRequirements ? `USER'S PERSONAL REQUIREMENTS FOR THIS WEEK:\n"${request.data.personalRequirements}"\nYou MUST incorporate these requirements into the plan.\n` : ''}
OUTPUT FORMAT:
Respond ONLY with valid, minified JSON. Absolutely NO markdown, NO text outside the JSON, NO explanation.
JSON Schema: { "days": [{ "day": number (1-7), "focus": string (e.g. "Push", "Rest"), "exercises": [{ "name": string, "sets": number, "reps": string (e.g. "8-10"), "targetWeight": number (0 for bodyweight) }] }] }`;
    }

    let rawText = '';
    let successModel = '';
    const errors = [];

    // Model 1: Gemini 1.5 Flash (Primary)
    if (GEMINI_API_KEY) {
      try {
        console.log('[generatePlan] Attempting Model 1: Gemini Flash...');
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
          }, 30000); // 30 second timeout for Gemini Flash
        });

        const geminiPromise = model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        }, {
          signal: abortController.signal
        });

        const geminiResult = await Promise.race([geminiPromise, timeoutPromise]);
        rawText = geminiResult.response.text();
        successModel = 'gemini';
        console.log('[generatePlan] Gemini successfully generated plan.');
      } catch (err) {
        console.error('[generatePlan] Gemini Flash failed:', err.message);
        errors.push({ model: 'gemini-flash-latest', error: err.message });
      }
    } else {
      errors.push({ model: 'gemini-flash-latest', error: 'GEMINI_API_KEY missing' });
    }

    // Model 2: Groq Llama 3.3 70B (Fallback)
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!rawText && GROQ_API_KEY) {
      try {
        console.log('[generatePlan] Attempting Model 2: Groq Llama 3.3 70B...');
        const abortController = new AbortController();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            abortController.abort();
            reject(new Error('deadline-exceeded'));
          }, 25000); // 25 second timeout for Groq
        });

        const groqPromise = (async () => {
          const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${GROQ_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.2
            }),
            signal: abortController.signal
          });

          if (response.ok) {
            const resData = await response.json();
            return resData.choices?.[0]?.message?.content || '';
          } else {
            const errText = await response.text();
            throw new Error(`Groq API returned status ${response.status}: ${errText}`);
          }
        })();

        rawText = await Promise.race([groqPromise, timeoutPromise]);
        successModel = 'groq';
        console.log('[generatePlan] Groq successfully generated plan.');
      } catch (err) {
        console.error('[generatePlan] Groq Llama 3.3 70B failed:', err.message);
        errors.push({ model: 'llama-3.3-70b-versatile', error: err.message });
      }
    } else if (!rawText) {
      errors.push({ model: 'llama-3.3-70b-versatile', error: 'GROQ_API_KEY missing' });
    }

    if (!rawText) {
      const isTimeout = errors.some(e => e.error === 'deadline-exceeded');
      if (isTimeout) {
        throw new HttpsError('deadline-exceeded', 'Plan generation timed out. Please try again.');
      }
      throw new HttpsError('internal', `Plan generation failed. All models failed: ${JSON.stringify(errors)}`);
    }

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
