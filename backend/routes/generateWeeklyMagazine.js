'use strict';

const authGuard = require('../middleware/authGuard');
const { adminDb } = require('../lib/firebaseAdmin');
const { validateUID } = require('../lib/validators');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function getISOWeek(date) {
  const tempDate = new Date(date.valueOf());
  tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7));
  const yearStart = new Date(tempDate.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
  return `${tempDate.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

module.exports = [authGuard, async (req, res) => {
  const uid = req.user.uid;
  const isReprint = req.body.reprint === true;

  try {
    validateUID(uid);

    // 1. Fetch user profile
    const userSnap = await adminDb.doc(`users/${uid}`).get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    const userData = userSnap.data();
    const userName = userData.name || 'Anonymous Bro';
    const userGoal = userData.goal || 'General Fitness';
    const userStreak = userData.streak || 0;

    // Check if magazine for the current week already exists
    const weekId = getISOWeek(new Date());
    const magazineRef = adminDb.doc(`users/${uid}/weekly_magazines/${weekId}`);
    const magazineDoc = await magazineRef.get();
    let existingReprintCount = 0;

    if (magazineDoc.exists) {
      const existingData = magazineDoc.data();
      existingReprintCount = existingData.reprintCount || 0;
      if (!isReprint) {
        // If not a reprint, return the existing one directly!
        return res.status(200).json({ 
          success: true, 
          magazine: existingData.magazine, 
          telemetry: existingData.telemetry,
          reprintCount: existingReprintCount
        });
      } else {
        // If it is a reprint, check the limit
        if (existingReprintCount >= 1) {
          return res.status(400).json({ 
            error: "Maximum of 1 reprint allowed per weekly issue." 
          });
        }
      }
    } else {
      if (isReprint) {
        return res.status(400).json({ 
          error: "Cannot reprint a weekly issue that has not been generated yet." 
        });
      }
    }

    // 2. Fetch workouts from past 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const mobileSnap = await adminDb
      .collection(`users/${uid}/sessions`)
      .where('date', '>=', sevenDaysAgo)
      .get();

    const desktopSnap = await adminDb
      .collection(`users/${uid}/executed_sessions`)
      .where('date', '>=', sevenDaysAgo)
      .get();

    // 3. Compile and compress sessions telemetry
    const tallies = { chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0, core: 0 };
    let totalVolume = 0;
    let totalSets = 0;
    let totalRpe = 0;
    let totalMmc = 0;
    let setRatingCount = 0;
    const allCues = new Set();
    const prsList = [];

    // Mobile logs compilation
    for (const docSnap of mobileSnap.docs) {
      const s = docSnap.data();
      totalVolume += s.totalVolume || 0;
      totalSets += s.totalSets || 0;
      if (s.rpeScore) {
        totalRpe += s.rpeScore;
        totalMmc += s.mmcScore || 7;
        setRatingCount++;
      }

      // Fetch exercises for mobile
      const exSnap = await adminDb.collection(`users/${uid}/sessions/${docSnap.id}/exercises`).get();
      exSnap.docs.forEach(exDoc => {
        const ex = exDoc.data();
        let group = (ex.muscleGroup || '').toLowerCase();
        if (group === 'legs' || group === 'quads' || group === 'hamstrings' || group === 'calves' || group === 'glutes') {
          group = 'legs';
        } else if (group === 'chest' || group === 'pecs') {
          group = 'chest';
        } else if (group === 'back' || group === 'lats' || group === 'traps') {
          group = 'back';
        } else if (group === 'core' || group === 'abs') {
          group = 'core';
        } else if (group === 'shoulders' || group === 'delts') {
          group = 'shoulders';
        } else if (group === 'arms' || group === 'biceps' || group === 'triceps') {
          group = 'arms';
        }

        let exVol = 0;
        const doneSets = (ex.sets || []).filter(set => set.done || set.completed);
        doneSets.forEach(set => {
          const w = set.weight === 'BW' ? 0 : parseFloat(set.weight) || 0;
          exVol += w * (parseInt(set.reps) || 0);
        });

        if (tallies[group] !== undefined) {
          tallies[group] += exVol;
        }

        // Collect cues
        if (ex.verbalCues && Array.isArray(ex.verbalCues)) {
          ex.verbalCues.forEach(cue => allCues.add(cue));
        }
      });
    }

    // Desktop logs compilation
    desktopSnap.docs.forEach(docSnap => {
      const s = docSnap.data();
      totalVolume += s.totalVolume || 0;
      totalSets += s.totalSets || 0;
      if (s.rpeScore) {
        totalRpe += s.rpeScore;
        totalMmc += s.mmcScore || 7;
        setRatingCount++;
      }

      const exercises = s.exercises || [];
      exercises.forEach(ex => {
        let group = (ex.muscleGroup || '').toLowerCase();
        if (group === 'legs' || group === 'quads' || group === 'hamstrings' || group === 'calves' || group === 'glutes') {
          group = 'legs';
        } else if (group === 'chest' || group === 'pecs') {
          group = 'chest';
        } else if (group === 'back' || group === 'lats' || group === 'traps') {
          group = 'back';
        } else if (group === 'core' || group === 'abs') {
          group = 'core';
        } else if (group === 'shoulders' || group === 'delts') {
          group = 'shoulders';
        } else if (group === 'arms' || group === 'biceps' || group === 'triceps') {
          group = 'arms';
        }

        let exVol = 0;
        const doneSets = (ex.sets || []).filter(set => set.done || set.completed);
        doneSets.forEach(set => {
          const w = set.weight === 'BW' ? 0 : parseFloat(set.weight) || 0;
          exVol += w * (parseInt(set.reps) || 0);
        });

        if (tallies[group] !== undefined) {
          tallies[group] += exVol;
        }

        // Collect cues
        if (ex.verbalCues && Array.isArray(ex.verbalCues)) {
          ex.verbalCues.forEach(cue => allCues.add(cue));
        }
      });
    });

    // Fetch recent PRs
    const prsSnap = await adminDb
      .collection(`users/${uid}/prs`)
      .orderBy('date', 'desc')
      .limit(5)
      .get();
    prsSnap.docs.forEach(docSnap => {
      const d = docSnap.data();
      prsList.push(`${d.name} (${d.weight}kg x ${d.reps} reps)`);
    });

    const avgRpe = setRatingCount > 0 ? parseFloat((totalRpe / setRatingCount).toFixed(1)) : 7.0;
    const avgMmc = setRatingCount > 0 ? parseFloat((totalMmc / setRatingCount).toFixed(1)) : 7.0;

    // 4. Create highly compressed telemetry JSON
    const compressedTelemetry = {
      userName,
      goal: userGoal,
      streak: userStreak,
      weekly_total_volume_kg: totalVolume,
      weekly_total_sets: totalSets,
      average_rpe: avgRpe,
      average_mmc: avgMmc,
      volume_distribution_kg: tallies,
      recent_personal_records: prsList,
      desk_vault_cues: Array.from(allCues),
      workouts_logged_this_week: mobileSnap.size + desktopSnap.size
    };

    // 5. Prompt Groq / Gemini
    let copywriteJSON = null;
    const systemPrompt = `You are a world-class, ruthless, hyper-motivating fitness coach and sports journalist.
Your job is to write the weekly "Sunday morning sports magazine" report for a lifter based on their training telemetry.
Analyze their stats with brutal honesty: roast them if they skipped leg day (legs volume is 0 or low compared to chest/back), praise their consistency, evaluate their mental focus (MMC), and provide action items overlaying their custom cues.

Write in a highly engaging neubrutalist style (punchy headlines, bold calls, raw energy).

RESPONSE FORMAT: You must return ONLY a valid JSON object. Do not wrap in markdown code blocks.
JSON structure:
{
  "headline": "Headline (max 8 words, e.g., 'Priyanshu's War on the 100kg Bench')",
  "subheadline": "Catchy sub-headline outlining the weekly vibe",
  "editorial": "Personalized coaching letter. Act as a ruthless coach, roast them for any skipped muscle groups, celebrate streaks, and outline the core narrative of their weekly logs.",
  "sections": [
    {
      "title": "Title (e.g., 'Leg Day Compliance Audit')",
      "content": "Roast or praise based on volume distribution."
    },
    {
      "title": "Title (e.g., 'Mind-Muscle Cue Diagnostic')",
      "content": "Analyze their cues (like 'Elbows tucked') and MMC scores, giving action items."
    },
    {
      "title": "Title (e.g., 'Overload Capacity Audit')",
      "content": "Analyze intensity (RPE) and consistency streak."
    }
  ],
  "coachVerdict": "A final raw quote representing your overall verdict (1-2 sentences)",
  "futureFocus": "Target focus recommendations for the upcoming week"
}`;

    const prompt = `Here is the compressed weekly telemetry for the user:
${JSON.stringify(compressedTelemetry, null, 2)}`;

    // Model 1: Groq Llama 3.3 70B (Primary)
    if (GROQ_API_KEY) {
      try {
        console.log(`[generateWeeklyMagazine] Calling Groq Llama 3.3 for ${uid}...`);
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.8
          })
        });

        if (response.ok) {
          const resData = await response.json();
          const rawContent = resData.choices?.[0]?.message?.content || '{}';
          
          // Regex strip to remove markdown code blocks in case LLM hallucinated
          let cleanContent = rawContent.trim();
          if (cleanContent.startsWith('```')) {
            cleanContent = cleanContent.replace(/^```(?:json)?\n?|```$/g, '').trim();
          }

          copywriteJSON = JSON.parse(cleanContent);
          console.log('[generateWeeklyMagazine] Groq call succeeded.');
        } else {
          const errText = await response.text();
          console.warn(`[generateWeeklyMagazine] Groq API error status ${response.status}: ${errText}`);
        }
      } catch (groqErr) {
        console.error('[generateWeeklyMagazine] Groq call failed:', groqErr.message);
      }
    }

    // Model 2: Gemini 1.5 Flash (Fallback)
    if (!copywriteJSON && GEMINI_API_KEY) {
      try {
        console.log(`[generateWeeklyMagazine] Calling Gemini Flash fallback for ${uid}...`);
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: 'gemini-flash-latest',
          systemInstruction: systemPrompt,
          generationConfig: {
            temperature: 0.8,
            responseMimeType: 'application/json'
          },
        });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });
        const rawContent = result.response.text().trim();
        
        let cleanContent = rawContent;
        if (cleanContent.startsWith('```')) {
          cleanContent = cleanContent.replace(/^```(?:json)?\n?|```$/g, '').trim();
        }

        copywriteJSON = JSON.parse(cleanContent);
        console.log('[generateWeeklyMagazine] Gemini fallback succeeded.');
      } catch (geminiErr) {
        console.error('[generateWeeklyMagazine] Gemini fallback failed:', geminiErr.message);
      }
    }

    // Fallback magazine payload if both APIs fail
    if (!copywriteJSON) {
      copywriteJSON = {
        headline: `${userName}'s Path to Power: A Week in Review`,
        subheadline: "Solid consistency and steady telemetry under review.",
        editorial: `Coach's Memo: Hey ${userName}, both AI generators are currently overloaded, but the telemetry does not lie. You completed ${compressedTelemetry.workouts_logged_this_week} workouts this week with a total volume of ${totalVolume.toLocaleString()} kg. That's a solid foundation. Keep showing up!`,
        sections: [
          {
            title: "Leg Compliance Audit",
            content: tallies.legs > 0 
              ? `You logged ${tallies.legs.toLocaleString()} kg of lower body work. Excellent compliance.`
              : "Legs volume is showing flatline. Lower body execution is mandatory to prevent imbalances!"
          },
          {
            title: "Cues & MMC Diagnostic",
            content: `Your weekly average MMC was ${avgMmc}/10. Keep active trigger cues like "${allCues.size > 0 ? Array.from(allCues)[0] : 'squeeze the negative'}" locked in mind during heavy lifts.`
          }
        ],
        coachVerdict: "Consistency is king. Show up, load the bar, and execute with focus.",
        futureFocus: "Prioritize target hypertrophy brackets and maintain your active streak."
      };
    }

    // Save generated weekly magazine to Firestore
    const newReprintCount = isReprint ? (existingReprintCount + 1) : existingReprintCount;
    await magazineRef.set({
      magazine: copywriteJSON,
      telemetry: compressedTelemetry,
      reprintCount: newReprintCount,
      generatedAt: new Date()
    });

    return res.status(200).json({ 
      success: true, 
      magazine: copywriteJSON, 
      telemetry: compressedTelemetry,
      reprintCount: newReprintCount
    });

  } catch (error) {
    console.error('[generateWeeklyMagazine] error:', error.message);
    return res.status(500).json({ error: 'Failed to generate weekly sports magazine report. Please try again.' });
  }
}];
