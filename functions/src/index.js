/**
 * index.js — FitDesi Cloud Functions entry point
 *
 * Exports:
 *   generatePlan        — primary callable (Gen 2, Node 20)
 *   generateWeeklyPlan  — alias for frontend hook compatibility (usePlan.js)
 *
 * Security contract (enforced in this order):
 *   1. GEMINI_API_KEY must be present at startup — fail fast if missing.
 *   2. request.auth must be present — throws 'unauthenticated'.
 *   3. uid is taken ONLY from request.auth.uid — request.data.uid is never used.
 *   4. validateUID(uid) — rejects empty or oversized UIDs.
 *   5. validatePlanRequest(request.data) — rejects extra fields, validates weekId.
 *   6. checkRateLimit(db, uid) — enforces 5 calls/hour per user via Firestore tx.
 *   7. All internal errors are logged server-side; only generic HttpsError reaches client.
 */

'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp }      = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const { validateUID, validatePlanRequest, validatePlan } = require('./validators');
const { checkRateLimit } = require('./rateLimiter');

// ─────────────────────────────────────────────
// Startup: fail fast if API key is missing
// ─────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error(
    '[FitDesi Functions] GEMINI_API_KEY is not set. ' +
    'Add it to functions/.env or via Firebase Secret Manager.'
  );
}

// ─────────────────────────────────────────────
// Firebase Admin initialisation
// ─────────────────────────────────────────────

initializeApp();
const db = getFirestore();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Returns the ISO week string (YYYY-WNN) for a given Date.
 * Matches the algorithm used in src/hooks/useProgress.js.
 *
 * @param {Date} [date]
 * @returns {string}  e.g. "2026-W23"
 */
function getISOWeek(date = new Date()) {
  const tempDate = new Date(date.valueOf());
  tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7));
  const yearStart = new Date(tempDate.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
  return `${tempDate.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Builds the Gemini Flash prompt from user context and recent session data.
 * Session data is truncated to prevent excessively long prompts.
 *
 * @param {object} params
 * @param {string}   params.userType
 * @param {string[]} params.equipmentList
 * @param {string[]} params.medicalFlags
 * @param {object[]} params.sessions     — last ≤14 sessions
 * @returns {string}
 */
function buildPlanPrompt({ userType, equipmentList, medicalFlags, sessions }) {
  // Truncate each session to keep prompt size manageable
  const sessionsSummary = sessions.slice(0, 14).map((s) => ({
    date:        s.date,
    exercises:   (s.exercises || []).map((ex) => ({
      name:   ex.exerciseKey || ex.name,
      sets:   (ex.sets || []).filter((set) => set.done).length,
      maxKg:  Math.max(0, ...(ex.sets || []).filter((set) => set.done).map((set) => set.weight || 0)),
    })).filter((ex) => ex.sets > 0),
    mood:        s.moodTag      || null,
    stomachFlag: s.stomachFlag  || false,
    totalVolume: s.totalVolume  || 0,
  }));

  const hasFatigueFlag = sessionsSummary.some((s) => s.stomachFlag || s.mood === 'rough');
  const isComeback     = (userType || '').toLowerCase() === 'comeback';

  return `You are a fitness coach generating a structured weekly workout plan for an Indian gym user.

USER PROFILE:
- Type: ${userType || 'Regular'}
- Equipment available: ${equipmentList.length ? equipmentList.join(', ') : 'Bodyweight only'}
- Medical restrictions: ${medicalFlags.length ? medicalFlags.join(', ') : 'None'}

RECENT TRAINING DATA (last ${sessionsSummary.length} sessions):
${JSON.stringify(sessionsSummary, null, 2)}
(includes: date, exercises, sets, weights, mood tags, stomach flags)

INSTRUCTIONS:
1. Generate a 6-day weekly plan. Day 7 is rest (empty exercises array).
2. NEVER include exercises that stress medically restricted areas.
3. Only use exercises achievable with the listed equipment.
4. Base weights on the user's recent logged weights — target 2.5–5% progression.
${hasFatigueFlag ? '5. Fatigue/stomach flags detected — reduce overall volume by 15%.\n' : ''}${isComeback ? '5. Comeback user — start at 70% of recent logged weights.\n' : ''}
Respond ONLY with valid JSON matching this schema exactly:
{
  "days": [
    {
      "day": 1,
      "focus": "Push",
      "exercises": [
        {
          "name": "Barbell Bench Press",
          "sets": 4,
          "reps": "8-10",
          "targetWeight": 60
        }
      ]
    }
  ]
}

No explanation. No markdown. No code fences. Pure JSON only.`;
}

/**
 * Safely parse JSON from Gemini response, stripping any markdown code fences
 * that might appear despite the prompt instruction.
 *
 * @param {string} text
 * @returns {object}
 * @throws {Error} with message 'plan_parse_failed' on bad JSON.
 */
function parseGeminiJSON(text) {
  // Strip ```json ... ``` or ``` ... ``` wrappers if present
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('plan_parse_failed');
  }
}

// ─────────────────────────────────────────────
// generatePlan — the secured callable function
// ─────────────────────────────────────────────

const generatePlan = onCall(async (request) => {
  // ① Authentication — always the first check
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  // ② uid comes exclusively from Firebase-verified auth context
  const uid = request.auth.uid;

  try {
    // ③ Validate uid from auth context
    validateUID(uid);

    // ④ Validate the request body (no extra fields, no uid in body)
    validatePlanRequest(request.data);

    // ⑤ Rate limit check — throws 'resource-exhausted' if over limit
    await checkRateLimit(db, uid);

    // ⑥ Fetch user profile
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'User profile not found.');
    }
    const { equipmentList = [], medicalFlags = [], userType = 'Regular' } = userSnap.data();

    // ⑦ Fetch last 14 sessions (descending date)
    const sessionsSnap = await db
      .collection(`users/${uid}/sessions`)
      .orderBy('date', 'desc')
      .limit(14)
      .get();

    // For each session, also fetch its exercises subcollection
    const sessions = await Promise.all(
      sessionsSnap.docs.map(async (sessionDoc) => {
        const sessionData = sessionDoc.data();
        const exercisesSnap = await db
          .collection(`users/${uid}/sessions/${sessionDoc.id}/exercises`)
          .get();
        return {
          ...sessionData,
          exercises: exercisesSnap.docs.map((ex) => ex.data()),
        };
      })
    );

    // ⑧ Build Gemini prompt
    const prompt = buildPlanPrompt({ userType, equipmentList, medicalFlags, sessions });

    // ⑨ Call Gemini Flash
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const geminiResult = await model.generateContent(prompt);
    const rawText = geminiResult.response.text();

    // ⑩ Parse + validate Gemini response
    const plan = parseGeminiJSON(rawText);
    validatePlan(plan);

    // ⑪ Determine weekId — use client-supplied weekId if valid, else compute server-side
    const weekId =
      request.data && typeof request.data.weekId === 'string' && /^\d{4}-W\d{2}$/.test(request.data.weekId)
        ? request.data.weekId
        : getISOWeek();

    // ⑫ Write plan to Firestore
    await db.doc(`users/${uid}/weeklyPlans/${weekId}`).set({
      weekId,
      generatedAt: FieldValue.serverTimestamp(),
      source:      'gemini',
      plan,
    });

    return { success: true, weekId };

  } catch (error) {
    // Log the real error server-side only
    console.error('[generatePlan] error:', error.message);

    // Re-throw known HttpsErrors unchanged (auth, rate-limit, validation, etc.)
    if (error instanceof HttpsError) throw error;

    // Gemini parse failure — tell client to retry, but don't leak details
    if (error.message === 'plan_parse_failed') {
      throw new HttpsError('internal', 'An error occurred');
    }

    // All other internal errors — never leak stack traces to the client
    throw new HttpsError('internal', 'An error occurred');
  }
});

// ─────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────

// Export under both names for frontend compatibility:
//   - 'generatePlan'       — matches the docs/TRD spec
//   - 'generateWeeklyPlan' — matches httpsCallable('generateWeeklyPlan') in usePlan.js
exports.generatePlan       = generatePlan;
exports.generateWeeklyPlan = generatePlan;
