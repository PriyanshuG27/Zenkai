'use strict';

const authGuard = require('../middleware/authGuard');
const { admin, adminDb } = require('../lib/firebaseAdmin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { validateUID, validatePlanRequest, validatePlan, HttpsError } = require('../lib/validators');
const { checkRateLimit } = require('../middleware/rateLimiter');
const { WORKOUT_PLAN } = require('../lib/models');
const exercisesDatabase = require('../data/exercises.json');

const FieldValue = admin.firestore.FieldValue;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function mapAvailableEquipment(equipmentList) {
  const mapped = new Set();
  equipmentList.forEach((item) => {
    if (!item) return;
    const normalized = item.trim();
    if (normalized === 'Barbell') mapped.add('barbell');
    else if (normalized === 'Dumbbells') mapped.add('dumbbells');
    else if (normalized === 'Cable Machine') mapped.add('cables');
    else if (normalized === 'Pull-up Bar') mapped.add('pullup_bar');
    else if (normalized === 'Leg Press') {
      mapped.add('leg_press');
      mapped.add('calf_raise');
    }
    else if (normalized === 'Leg Extension') mapped.add('leg_extension');
    else if (normalized === 'Leg Curl') mapped.add('leg_curl');
    else if (normalized === 'Ab Wheel') mapped.add('ab_roller');
    else if (['Flat Bench', 'Incline Bench', 'Decline Bench', 'Preacher Curl Bench'].includes(normalized)) {
      mapped.add('bench');
    }
    mapped.add(normalized.toLowerCase());
  });
  if (mapped.has('dumbbells') || mapped.has('barbell')) {
    mapped.add('calf_raise');
  }
  return Array.from(mapped);
}

function mapMedicalFlags(medicalFlags) {
  const mapped = new Set();
  medicalFlags.forEach((flag) => {
    if (!flag) return;
    const normalized = flag.trim();
    if (normalized === 'Shoulder Impingement' || normalized === 'Rotator Cuff Issue') {
      mapped.add('shoulder_impingement');
    } else if (normalized === 'Lower Back Issues' || normalized === 'Herniated Disc' || normalized === 'Hernia') {
      mapped.add('lower_back');
    } else if (normalized === 'Bad Knees') {
      mapped.add('bad_knees');
    } else if (normalized === 'Post-Surgery') {
      mapped.add('post_surgery');
    }
    mapped.add(normalized.toLowerCase().replace('-', '_').replace(' ', '_'));
  });
  return Array.from(mapped);
}

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

module.exports = [authGuard, async (req, res) => {
  const uid = req.user.uid;
  
  try {
    validateUID(uid);
    validatePlanRequest(req.body);

    await checkRateLimit(adminDb, uid, req.body?.usePowerUp === true);

    const userDoc = await adminDb.doc(`users/${uid}`).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User profile not found' });
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

    const mappedEquipment = new Set(mapAvailableEquipment(equipmentList));
    const mappedMedical = new Set(mapMedicalFlags(medicalFlags));

    const allowedExercises = exercisesDatabase.filter((ex) => {
      const required = ex.equipmentRequired || [];
      if (required.length > 0 && !required.every((item) => mappedEquipment.has(item))) {
        return false;
      }
      const restricted = ex.medicallyRestricted || [];
      if (restricted.length > 0 && restricted.some((flag) => mappedMedical.has(flag))) {
        return false;
      }
      return true;
    });

    const allowedExercisesSummary = allowedExercises.map(ex => ({
      name: ex.name,
      muscleGroup: ex.muscleGroup
    }));

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

CRITICAL EXERCISE COUNT CONSTRAINT:
Every active (non-rest) workout day in the generated plan MUST contain exactly 4 to 6 exercises. If a copied workout day from the previous plan has fewer than 4 exercises, you MUST select and append appropriate exercises from the ALLOWED EXERCISES list targeting the same or complementary muscle groups to reach exactly 4 to 6 exercises. Never output fewer than 4 exercises or more than 6 exercises for any active workout day. This count limit is absolute and strict.

PREVIOUS WEEK'S PLAN:
${JSON.stringify(previousPlan.plan)}

ALLOWED EXERCISES:
You MUST select all exercise names strictly from this list. Use their exact names (e.g. "Dumbbell Bench Press"). Do NOT invent new exercises and do NOT use snake_case keys (like "dumbbell_bench_press"):
${JSON.stringify(allowedExercisesSummary)}

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

${req.body?.personalRequirements ? `USER'S PERSONAL REQUIREMENTS FOR THIS WEEK:\n"${req.body.personalRequirements}"\nYou MUST incorporate these requirements into the plan.\n` : ''}

STRICT RULES FOR MODIFICATION:
1. Copy the PREVIOUS WEEK'S PLAN exactly (same days, same focus, same exercises, same sets/reps/weights), EXCEPT for exercises flagged in the feedback/debrief list or affected by user's personal requirements.
2. If any exercise in the PREVIOUS WEEK'S PLAN has a snake_case name (e.g. 'cable_chest_fly'), you MUST translate it to its corresponding clean name from the ALLOWED EXERCISES list (e.g. 'Cable Chest Fly') before outputting it. Never output snake_case names.
3. For any exercise in the Joint Pain list: Replace it with a joint-friendly, biomechanically similar alternative from the ALLOWED EXERCISES list that targets the same muscle group. For example, replace heavy barbell lifts with dumbbell, cable, or machine alternatives. Do NOT prescribe the original exercise.
4. For any exercise in the Too Easy list: Increase the targetWeight by 2.5% to 5.0% (rounded to the nearest 2.5 kg, e.g. from 60 kg to 62.5 kg). If it's a bodyweight exercise, increase the target reps instead.
5. For any exercise in the Broken Equipment list: Replace it with a free-weight or alternative machine exercise from the ALLOWED EXERCISES list that targets the same muscles and is compatible with the Available Equipment.
6. Ensure all prescribed exercises comply with the Available Equipment list and Medical Restrictions.
7. Ensure every active (non-rest) workout day contains exactly 4 to 6 exercises. If a copied workout day from the previous plan has fewer than 4 exercises, you MUST supplement it with additional movements from the ALLOWED EXERCISES list to reach exactly 4 to 6 exercises.
8. Ensure exercises follow a logical progression flow: start with the heaviest compound lift of the day, followed by secondary compound movements, then accessory movements, and finish with isolation or core movements. NEVER place isolation movements before compounds.
9. Ensure NO exercise is duplicated on the same day.
10. The "days" array MUST contain exactly 7 day objects (Day 1 to Day 7 in order).

OUTPUT FORMAT:
Respond ONLY with valid, minified JSON. Absolutely NO markdown, NO text outside the JSON, NO explanation.
JSON Schema: { "days": [{ "day": number (1-7), "focus": string (e.g. "Push", "Rest"), "exercises": [{ "name": string, "sets": number, "reps": string (e.g. "8-10"), "targetWeight": number (0 for bodyweight) }] }] }
IMPORTANT: You MUST return exactly 7 day objects in the "days" array, one for each day from 1 to 7 in sequential order. Do NOT omit rest days; they must have "focus": "Rest" and "exercises": []`;
    } else {
      prompt = `You are an elite fitness coach generating a highly customized weekly workout plan.

CRITICAL EXERCISE COUNT CONSTRAINT:
Every active (non-rest) workout day in the generated plan MUST contain exactly 4 to 6 exercises. If a workout day has fewer than 4 exercises in your recent logs, you MUST select and append appropriate exercises from the ALLOWED EXERCISES list targeting the same or complementary muscle groups to reach exactly 4 to 6 exercises. Never output fewer than 4 exercises or more than 6 exercises for any active workout day. This count limit is absolute and strict.

ALLOWED EXERCISES:
You MUST select all exercise names strictly from this list. Use their exact names (e.g. "Dumbbell Bench Press"). Do NOT invent new exercises and do NOT use snake_case keys (like "dumbbell_bench_press"):
${JSON.stringify(allowedExercisesSummary)}

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
4. Adapt the rep-ranges and sets strictly based on the Primary Goal:
   - Strength/Power: 3-5 sets of 3-6 reps, prioritizing heavy compound movements.
   - Muscle Gain (Hypertrophy): 3-4 sets of 8-12 reps.
   - Fat Loss / Conditioning: 3 sets of 12-15 reps with higher tempo.
5. Ensure workouts fit within the Max Session Duration.
6. Every active (non-rest) workout day in the plan MUST contain exactly 4 to 6 exercises. If the RECENT SESSION LOGS are empty (or this is a fresh plan), prescribe a high-quality, well-structured starter routine using exercises from the ALLOWED EXERCISES list. Each active workout day must have exactly 4 to 6 exercises: starting with primary compound lifts (e.g. Squat, Bench Press, or Push-Ups/Pull-Ups for bodyweight) followed by accessory and isolation movements. Use conservative starter weights matching the experience level, age, and gender.
7. If RECENT SESSION LOGS exist:
   - Identify the maximum weight and reps completed for each exercise.
   - Calculate their Estimated 1RM using the Epley formula: 1RM = Weight * (1 + Reps / 30).
   - Prescribe a targetWeight for the new plan's sets that equals 70-80% of that estimated 1RM for the target rep range.
   - Apply a precise 2.5% to 5.0% progressive overload weight increase on top of their recent maximum weight lifted for identical exercises.
   - Round all targetWeight values to the nearest 2.5 kg increment (e.g. 60 kg, 62.5 kg, 65 kg; 0 for bodyweight).
   - To satisfy the 4 to 6 exercises requirement per active day, if the recent logs for a specific workout day have fewer than 4 exercises, you MUST supplement them by adding relevant accessory or isolation exercises from the ALLOWED EXERCISES list.
8. Ensure exercises follow a logical progression flow: start with the heaviest compound lift of the day, followed by secondary compound movements, then accessory movements, and finish with isolation or core movements. NEVER place isolation movements before compounds.
9. Ensure NO exercise is duplicated on the same day.
10. If the user experience level is 'Comeback', ignore progression and dial target weights back to 70-80% of their recent logs to ease them in safely.
11. CRITICAL AI CONTAMINATION FILTER: Ignore any session in RECENT SESSION LOGS where "safeMode": true is present. Treat flagged sessions as sick/recovery days. Do NOT use their weights/reps to calculate overload targets. Instead, progressive overload must be computed relative to the most recent healthy (unflagged) session for each exercise.
12. The "days" array MUST contain exactly 7 day objects (Day 1 to Day 7 in order). Non-workout/rest days must be explicitly included with "focus": "Rest" and "exercises": [].

${req.body?.personalRequirements ? `USER'S PERSONAL REQUIREMENTS FOR THIS WEEK:\n"${req.body.personalRequirements}"\nYou MUST incorporate these requirements into the plan.\n` : ''}
OUTPUT FORMAT:
Respond ONLY with valid, minified JSON. Absolutely NO markdown, NO text outside the JSON, NO explanation.
JSON Schema: { "days": [{ "day": number (1-7), "focus": string (e.g. "Push", "Rest"), "exercises": [{ "name": string, "sets": number, "reps": string (e.g. "8-10"), "targetWeight": number (0 for bodyweight) }] }] }
IMPORTANT: You MUST return exactly 7 day objects in the "days" array, one for each day from 1 to 7 in sequential order. Do NOT omit rest days; they must have "focus": "Rest" and "exercises": []`;
    }

    let rawText = '';
    let successModel = '';
    const errors = [];

    // Model 1: Groq (Primary)
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (GROQ_API_KEY) {
      try {
        console.log(`[generatePlan] Attempting Model 1: Groq (${WORKOUT_PLAN.PRIMARY})...`);
        const abortController = new AbortController();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            abortController.abort();
            reject(new Error('deadline-exceeded'));
          }, 50000); // 50 second timeout for Groq
        });

        const groqPromise = (async () => {
          const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${GROQ_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: WORKOUT_PLAN.PRIMARY,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.2,
              response_format: { type: 'json_object' }
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
        console.log(`[generatePlan] Groq (${WORKOUT_PLAN.PRIMARY}) successfully generated plan.`);
      } catch (err) {
        console.error(`[generatePlan] Groq (${WORKOUT_PLAN.PRIMARY}) failed:`, err.message);
        errors.push({ model: WORKOUT_PLAN.PRIMARY, error: err.message });
      }
    } else {
      errors.push({ model: WORKOUT_PLAN.PRIMARY, error: 'GROQ_API_KEY missing' });
    }

    // Model 2: Gemini (Fallback)
    if (!rawText && GEMINI_API_KEY) {
      try {
        console.log(`[generatePlan] Attempting Model 2: Gemini (${WORKOUT_PLAN.FALLBACK})...`);
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: WORKOUT_PLAN.FALLBACK,
          generationConfig: {
            temperature: 0.2,
          },
        });

        const abortController = new AbortController();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            abortController.abort();
            reject(new Error('deadline-exceeded'));
          }, 90000); // 90 second timeout for Gemini
        });

        const geminiPromise = model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        }, {
          signal: abortController.signal
        });

        const geminiResult = await Promise.race([geminiPromise, timeoutPromise]);
        rawText = geminiResult.response.text();
        successModel = 'gemini';
        console.log(`[generatePlan] Gemini (${WORKOUT_PLAN.FALLBACK}) successfully generated plan.`);
      } catch (err) {
        console.error(`[generatePlan] Gemini (${WORKOUT_PLAN.FALLBACK}) failed:`, err.message);
        errors.push({ model: WORKOUT_PLAN.FALLBACK, error: err.message });
      }
    } else if (!rawText) {
      errors.push({ model: WORKOUT_PLAN.FALLBACK, error: 'GEMINI_API_KEY missing' });
    }

    if (!rawText) {
      const { rollbackRateLimit } = require('../middleware/rateLimiter');
      await rollbackRateLimit(adminDb, uid, req.body?.usePowerUp === true).catch(() => {});

      const isTimeout = errors.some(e => e.error === 'deadline-exceeded');
      if (isTimeout) {
        return res.status(504).json({ error: 'Plan generation timed out. Please try again.' });
      }
      return res.status(500).json({ error: `Plan generation failed. All models failed: ${JSON.stringify(errors)}` });
    }

    const plan = parseGeminiJSON(rawText);

    // Normalize exercise names to clean, official title case display names from exercisesDatabase
    const exerciseCatalog = {};
    exercisesDatabase.forEach(ex => {
      exerciseCatalog[ex.key.toLowerCase()] = ex.name;
      exerciseCatalog[ex.name.toLowerCase()] = ex.name;
      const cleanKey = ex.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      exerciseCatalog[cleanKey] = ex.name;
    });

    if (plan && Array.isArray(plan.days)) {
      plan.days.forEach(day => {
        if (day.exercises && Array.isArray(day.exercises)) {
          day.exercises.forEach(ex => {
            if (ex && typeof ex.name === 'string') {
              const lowerName = ex.name.toLowerCase().trim();
              const cleanKey = lowerName.replace(/[^a-z0-9]+/g, '_');
              if (exerciseCatalog[cleanKey]) {
                ex.name = exerciseCatalog[cleanKey];
              } else if (exerciseCatalog[lowerName]) {
                ex.name = exerciseCatalog[lowerName];
              }
            }
          });
        }
      });
    }

    validatePlan(plan);

    const weekId =
      req.body && typeof req.body.weekId === 'string' && /^\d{4}-W\d{2}$/.test(req.body.weekId)
        ? req.body.weekId
        : getISOWeek();

    await adminDb.doc(`users/${uid}/weeklyPlans/${weekId}`).set({
      weekId,
      generatedAt: FieldValue.serverTimestamp(),
      source: successModel,
      plan,
    });

    return res.status(200).json({ success: true, weekId });

  } catch (error) {
    console.error('[generatePlan] error:', error.message);
    const status = error.status || 500;
    
    const { rollbackRateLimit } = require('../middleware/rateLimiter');
    await rollbackRateLimit(adminDb, uid, req.body?.usePowerUp === true).catch(() => {});

    if (error.message === 'plan_parse_failed') {
      return res.status(status).json({ error: 'Plan generation failed. Please try again.' });
    }
    return res.status(status).json({ error: error.message || 'Plan generation failed. Please try again.' });
  }
}];
