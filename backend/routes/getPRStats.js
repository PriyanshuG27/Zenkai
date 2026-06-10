const authGuard = require('../middleware/authGuard');
const { admin, adminDb } = require('../lib/firebaseAdmin');
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const { PR_STATS } = require('../lib/models');
const FieldValue = admin.firestore.FieldValue;

// Load predefined exercise and strength standards databases for local lookup
let exercises = [];
let strengthStandards = {};
try {
  exercises = require('../data/exercises.json');
  strengthStandards = require('../data/strength_standards.json');
} catch (err) {
  console.error('[getPRStats] Failed to load local databases:', err.message);
}

/**
 * Searches the local database for an exercise match by name, key, or alias,
 * and returns the pre-computed multipliers for the requested gender.
 */
function getLocalMultipliers(exerciseName, genderKey) {
  if (!exercises.length || !Object.keys(strengthStandards).length) {
    return null;
  }

  const nameLower = exerciseName.toLowerCase().trim();
  const keyNormalized = exerciseName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const match = exercises.find((ex) => {
    if (ex.key === keyNormalized || ex.name.toLowerCase() === nameLower) {
      return true;
    }
    if (Array.isArray(ex.aliases)) {
      return ex.aliases.some((alias) => alias.toLowerCase() === nameLower);
    }
    return false;
  });

  if (match) {
    const entry = strengthStandards[match.key];
    if (entry) {
      return entry[genderKey] || entry['male'] || null;
    }
  }

  return null;
}

module.exports = [authGuard, async (req, res) => {
  const { exerciseName, gender } = req.body;

  if (!exerciseName) {
    return res.status(400).json({ error: 'Missing exerciseName parameter.' });
  }

  const genderKey = (gender || 'male').toLowerCase();
  const exerciseKey = exerciseName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const docId = `${exerciseKey}_${genderKey}`;

  try {
    // 0. Check local pre-computed standards database first (bypasses Firestore reads & AI)
    const localMultipliers = getLocalMultipliers(exerciseName, genderKey);
    if (localMultipliers) {
      console.log(`[getPRStats] Local pre-computed match found for: ${exerciseName} (${genderKey})`);
      return res.status(200).json({ data: localMultipliers });
    }

    // 1. Double check the Firestore cache to see if another request populated it in the meantime
    const docRef = adminDb.doc(`strengthStandards/${docId}`);
    const cacheSnap = await docRef.get();
    
    if (cacheSnap.exists) {
      const data = cacheSnap.data();
      const updatedAtDate = data.updatedAt?.toDate() || new Date(0);
      const ageInMs = Date.now() - updatedAtDate.getTime();
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
      if (ageInMs < thirtyDaysInMs) {
        return res.status(200).json({ data: data.multipliers });
      }
    }

    // 2. Query Groq AI statistical oracle to fetch the strength standard multipliers relative to bodyweight
    const prompt = `
      You are an elite sports science and powerlifting statistical engine.
      Analyze strength standards for the following movement and demographic based on global recreational strength standards (e.g., StrengthLevel, SymmetricStrength):

      Exercise: ${exerciseName}
      Gender: ${genderKey}

      Determine the 1-Rep Max (1RM) to bodyweight ratio multipliers for the 5 standard athletic tiers:
      1. BEGINNER (typically lifting after a few weeks/months of training)
      2. NOVICE (typically lifting after several months of training)
      3. INTERMEDIATE (typically lifting after 1-2 years of consistent training)
      4. ADVANCED (typically lifting after multiple years of consistent training)
      5. ELITE (top tier powerlifters/athletes, usually competitive)

      Provide the relative multipliers (e.g. if an intermediate male bench presses their bodyweight, the multiplier is 1.00. If an elite squatter lifts 2.1x bodyweight, the multiplier is 2.10).
      For isolation movements or dumbbells, adjust the multipliers down to realistic single-arm or single-dumbbell proportions.

      RESPONSE FORMAT:
      You must respond ONLY with a valid, raw JSON object. Do not include markdown formatting, backticks, or conversational text.
      Schema:
      {
        "beginner": 0.50,
        "novice": 0.75,
        "intermediate": 1.00,
        "advanced": 1.30,
        "elite": 1.60
      }
    `;

    let multipliers = null;

    // Model 1: Groq (Primary)
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (GROQ_API_KEY) {
      try {
        const completion = await groq.chat.completions.create({
          messages: [{ role: 'system', content: prompt }],
          model: PR_STATS.PRIMARY,
          temperature: 0.1,
          response_format: { type: 'json_object' }
        });
        console.log(`[getPRStats] Model 1: Groq (${PR_STATS.PRIMARY}) succeeded for: ${exerciseName}`);
        multipliers = JSON.parse(completion.choices[0].message.content);
      } catch (err) {
        console.warn(`[getPRStats] Model 1: Groq (${PR_STATS.PRIMARY}) failed, trying fallback:`, err.message);
      }
    }

    // Model 2: Gemini (Fallback)
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!multipliers && GEMINI_API_KEY) {
      try {
        console.log(`[getPRStats] Attempting Model 2: Gemini (${PR_STATS.FALLBACK}) fallback...`);
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: PR_STATS.FALLBACK,
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        let cleanText = text;
        if (cleanText.includes('```')) {
          cleanText = cleanText.replace(/```(?:json)?/g, '').trim();
        }
        multipliers = JSON.parse(cleanText);
        console.log(`[getPRStats] Model 2: Gemini (${PR_STATS.FALLBACK}) fallback succeeded.`);
      } catch (err) {
        console.error(`[getPRStats] Model 2: Gemini (${PR_STATS.FALLBACK}) fallback failed:`, err.message);
      }
    }

    // If both failed, use static fallback
    if (!multipliers) {
      console.warn('[getPRStats] Both APIs failed. Using static hardcoded fallback multipliers.');
      multipliers = {
        beginner: 0.25,
        novice: 0.40,
        intermediate: 0.60,
        advanced: 0.85,
        elite: 1.10
      };
    }

    // Safeguard for dumbbell/isolation/cable exercises: if the AI returned total weight multipliers (e.g. intermediate >= 0.6), divide them by 2
    const isDumbbell = exerciseKey.includes('dumbbell') || exerciseKey.includes('db') || exerciseName.toLowerCase().includes('dumbbell') || exerciseName.toLowerCase().includes('db');
    const isCable = exerciseKey.includes('cable') || exerciseName.toLowerCase().includes('cable');
    if ((isDumbbell || isCable) && multipliers.intermediate > 0.6) {
      multipliers.beginner = Number((multipliers.beginner / 2).toFixed(3));
      multipliers.novice = Number((multipliers.novice / 2).toFixed(3));
      multipliers.intermediate = Number((multipliers.intermediate / 2).toFixed(3));
      multipliers.advanced = Number((multipliers.advanced / 2).toFixed(3));
      multipliers.elite = Number((multipliers.elite / 2).toFixed(3));
    }

    // Save to Firestore cache
    await docRef.set({
      exerciseName,
      gender: genderKey,
      multipliers,
      updatedAt: FieldValue.serverTimestamp()
    });

    return res.status(200).json({ data: multipliers });

  } catch (error) {
    console.error('[getPRStats Error]', error);
    const fallbackMultipliers = {
      beginner: 0.25,
      novice: 0.40,
      intermediate: 0.60,
      advanced: 0.85,
      elite: 1.10
    };
    return res.status(200).json({ data: fallbackMultipliers });
  }
}];
