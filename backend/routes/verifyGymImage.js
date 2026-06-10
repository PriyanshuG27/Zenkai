'use strict';

const authGuard = require('../middleware/authGuard');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { VISION } = require('../lib/models');
const { checkGymCheckinRateLimit } = require('../middleware/rateLimiter');
const { adminDb } = require('../lib/firebaseAdmin');

module.exports = [authGuard, async (req, res) => {
  const uid = req.user.uid;
  const base64DataUrl = req.body.image;
  if (!base64DataUrl) {
    return res.status(400).json({ error: 'Image data is required' });
  }

  try {
    await checkGymCheckinRateLimit(adminDb, uid);
  } catch (rateErr) {
    console.warn(`[verifyGymImage] User ${uid} rate limited:`, rateErr.message);
    return res.status(rateErr.status || 429).json({ error: rateErr.message || 'Too many gym verification attempts. Please try again later.' });
  }

  try {
    // Parse mimeType and raw base64 data (handles both raw base64 and data URLs)
    let mimeType = 'image/jpeg';
    let base64Data = base64DataUrl;
    if (base64DataUrl.startsWith('data:')) {
      const matches = base64DataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-+.]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        base64Data = matches[2];
      } else {
        return res.status(400).json({ error: 'Invalid image data format. Must be base64 Data URL.' });
      }
    }

    const visionPrompt = "Analyze this image. Does it depict a gym, workout area, fitness center, or individual exercise equipment like dumbbells, barbells, weights, weight plates, treadmills, or other training gear? Answer with only 'yes' or 'no' in lowercase.";

    let verified = false;
    let modelUsed = '';
    const errors = [];

    // Model 1: Gemini (Primary)
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (GEMINI_API_KEY) {
      try {
        console.log(`[verifyGymImage] Attempting Model 1: Gemini (${VISION.PRIMARY})`);
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: VISION.PRIMARY,
          generationConfig: {
            temperature: 0.1,
          },
        });

        const result = await model.generateContent([
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          },
          visionPrompt
        ]);

        const responseText = result.response.text().trim().toLowerCase();
        console.log(`[verifyGymImage] Gemini (${VISION.PRIMARY}) response:`, responseText);
        if (responseText.includes('yes')) {
          verified = true;
        }
        modelUsed = VISION.PRIMARY;
        return res.status(200).json({ success: true, verified, modelUsed });
      } catch (err) {
        console.error(`[verifyGymImage] Gemini (${VISION.PRIMARY}) failed, falling back:`, err.message);
        errors.push({ model: VISION.PRIMARY, error: err.message });
      }
    } else {
      errors.push({ model: VISION.PRIMARY, error: 'GEMINI_API_KEY missing' });
    }

    // Model 2: Groq Vision (Fallback)
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (GROQ_API_KEY) {
      try {
        console.log(`[verifyGymImage] Attempting Model 2: Groq (${VISION.FALLBACK})`);
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: VISION.FALLBACK,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: visionPrompt
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mimeType};base64,${base64Data}`
                    }
                  }
                ]
              }
            ],
            temperature: 0.1
          })
        });

        if (response.ok) {
          const resData = await response.json();
          const contentText = resData.choices?.[0]?.message?.content?.trim()?.toLowerCase() || '';
          console.log(`[verifyGymImage] Groq Vision (${VISION.FALLBACK}) response:`, contentText);
          if (contentText.includes('yes')) {
            verified = true;
          }
          modelUsed = VISION.FALLBACK;
          return res.status(200).json({ success: true, verified, modelUsed });
        } else {
          const errText = await response.text();
          throw new Error(`Groq API returned status ${response.status}: ${errText}`);
        }
      } catch (err) {
        console.error(`[verifyGymImage] Groq Vision (${VISION.FALLBACK}) failed:`, err.message);
        errors.push({ model: VISION.FALLBACK, error: err.message });
      }
    } else {
      errors.push({ model: VISION.FALLBACK, error: 'GROQ_API_KEY missing' });
    }

    // If all models failed
    return res.status(500).json({ error: `Failed to analyze the image. All models failed: ${JSON.stringify(errors)}` });

  } catch (error) {
    console.error('[verifyGymImage] Error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to analyze the image.' });
  }
}];
