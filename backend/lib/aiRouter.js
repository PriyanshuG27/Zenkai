'use strict';

/**
 * Centralized AI Router — Three-Tier Fallback Orchestrator
 * =========================================================
 * Provides a single `executeAICall(taskKey, prompt, systemPrompt, options)` function
 * that automatically manages a three-tier model fallback chain:
 *
 *   Tier 1 → Groq PRIMARY   (fastest, best quality)
 *   Tier 2 → Groq FALLBACK  (smaller/cheaper Groq model, same API)
 *   Tier 3 → Gemini          (separate provider, last resort)
 *
 * Each route only needs ONE call:
 *   const result = await executeAICall('WEEKLY_MAGAZINE', prompt, systemPrompt, { jsonMode: true });
 *
 * Three-tier is useful when:
 *  - The primary model is rate-limited or over capacity (Groq 429/503)
 *  - We want automatic provider-level redundancy (Groq down → Gemini)
 *  - We want consistent logging and JSON cleanup in one place
 *
 * For VISION tasks the router delegates Tier 1 to Gemini (multimodal primary)
 * and Tier 2 to Groq Vision (multimodal fallback). Pass `imageData` in options.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const MODELS = require('./models');

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Strip markdown code fences and extract the first JSON object from a string.
 * Returns the raw cleaned string (caller parses if jsonMode).
 */
function cleanJsonString(raw) {
  let text = (raw || '').trim();
  // Remove ```json ... ``` or ``` ... ``` wrappers
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\n?|\n?```$/g, '').trim();
  }
  // Extract first complete JSON object / array
  const objMatch = text.match(/\{[\s\S]*\}/);
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (objMatch && arrMatch) {
    return objMatch.index < arrMatch.index ? objMatch[0] : arrMatch[0];
  }
  return (objMatch || arrMatch || [text])[0];
}

/**
 * Fire a single Groq chat completion.
 * Returns the raw response text string.
 * Throws on non-2xx status or network error.
 */
async function callGroq({ model, messages, temperature = 0.7, jsonMode = false, timeoutMs = 50000 }) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = {
      model,
      messages,
      temperature,
    };
    if (jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fire a single Groq Vision chat completion (multimodal).
 * imageData: { mimeType: string, base64: string }
 */
async function callGroqVision({ model, textPrompt, imageData, temperature = 0.1, timeoutMs = 50000 }) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: textPrompt },
              {
                type: 'image_url',
                image_url: { url: `data:${imageData.mimeType};base64,${imageData.base64}` },
              },
            ],
          },
        ],
        temperature,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq Vision ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fire a single Gemini text generation request.
 */
async function callGemini({ model, prompt, systemPrompt, temperature = 0.7, jsonMode = false, timeoutMs = 90000 }) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  const config = { temperature };
  if (jsonMode) config.responseMimeType = 'application/json';

  const modelConfig = { model, generationConfig: config };
  if (systemPrompt) modelConfig.systemInstruction = systemPrompt;

  const geminiModel = genAI.getGenerativeModel(modelConfig);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await geminiModel.generateContent(
      { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
      { signal: controller.signal }
    );
    return result.response.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fire a single Gemini Vision request (multimodal).
 * imageData: { mimeType: string, base64: string }
 */
async function callGeminiVision({ model, textPrompt, imageData, temperature = 0.1, timeoutMs = 60000 }) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const geminiModel = genAI.getGenerativeModel({
    model,
    generationConfig: { temperature },
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await geminiModel.generateContent(
      [
        { inlineData: { data: imageData.base64, mimeType: imageData.mimeType } },
        textPrompt,
      ],
      { signal: controller.signal }
    );
    return result.response.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Groq Circuit Breaker ────────────────────────────────────────────────────
//
// Tracks consecutive Groq failures (429s, timeouts, or network errors) across
// ALL text requests in this process. After FAILURE_THRESHOLD consecutive
// failures, the circuit "trips" and all text requests skip Groq Tier 1 & Tier 2
// entirely, going straight to Gemini Tier 3 for RESET_MS milliseconds.
// On auto-reset the circuit goes half-open: the next request will retry Groq.
// A successful Groq response at any point resets the failure counter.

const CB_FAILURE_THRESHOLD = 3;        // consecutive Groq failures before tripping
const CB_RESET_MS = 10 * 60 * 1000;   // 10 minutes before auto-reset

const _groqCB = {
  failures: 0,      // consecutive failure count
  trippedAt: null,  // Date.now() when last tripped, or null
};

/** Returns true when the circuit is open (Groq should be skipped). */
function _cbIsOpen() {
  if (_groqCB.trippedAt === null) return false;
  if (Date.now() - _groqCB.trippedAt >= CB_RESET_MS) {
    // Auto-reset: allow one test request through (half-open)
    console.log('[aiRouter][CircuitBreaker] Reset after cooldown — retrying Groq.');
    _groqCB.trippedAt = null;
    _groqCB.failures = 0;
    return false;
  }
  return true;
}

/** Call after a successful Groq response to reset the failure counter. */
function _cbRecordSuccess() {
  if (_groqCB.failures > 0) {
    console.log('[aiRouter][CircuitBreaker] Groq succeeded — resetting failure count.');
  }
  _groqCB.failures = 0;
  _groqCB.trippedAt = null;
}

/**
 * Call after a Groq failure (any tier). Increments the counter and trips the
 * circuit once the threshold is reached.
 * @param {string} reason - Short description for logging.
 */
function _cbRecordFailure(reason) {
  _groqCB.failures += 1;
  console.warn(`[aiRouter][CircuitBreaker] Groq failure #${_groqCB.failures}: ${reason}`);
  if (_groqCB.failures >= CB_FAILURE_THRESHOLD && _groqCB.trippedAt === null) {
    _groqCB.trippedAt = Date.now();
    console.error(
      `[aiRouter][CircuitBreaker] ⚡ CIRCUIT TRIPPED after ${CB_FAILURE_THRESHOLD} failures. ` +
      `Bypassing Groq for ${CB_RESET_MS / 60000} minutes.`
    );
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Execute an AI call using the three-tier fallback chain for the given taskKey.
 *
 * @param {string} taskKey        - Key in models.js (e.g. 'WEEKLY_MAGAZINE', 'VISION', 'PR_STATS')
 * @param {string} prompt         - The user/main prompt
 * @param {string} [systemPrompt] - Optional system prompt (Groq system message / Gemini systemInstruction)
 * @param {object} [options]
 * @param {boolean} [options.jsonMode=false]   - Request JSON output from the model
 * @param {number}  [options.temperature=0.7]  - Sampling temperature
 * @param {number}  [options.groqTimeoutMs]    - Override Groq timeout (default 50 000 ms)
 * @param {number}  [options.geminiTimeoutMs]  - Override Gemini timeout (default 90 000 ms)
 * @param {object}  [options.imageData]        - For VISION tasks: { mimeType, base64 }
 *
 * @returns {Promise<string|object>}
 *   - If jsonMode=true:  returns a parsed JS object
 *   - If jsonMode=false: returns the raw response string
 *   Returns null if ALL tiers fail (caller handles graceful fallback).
 */
async function executeAICall(taskKey, prompt, systemPrompt = '', options = {}) {
  const modelConfig = MODELS[taskKey];
  if (!modelConfig) {
    throw new Error(`[aiRouter] Unknown taskKey: "${taskKey}". Check lib/models.js.`);
  }

  const {
    jsonMode = false,
    temperature = 0.7,
    groqTimeoutMs = 50000,
    geminiTimeoutMs = 90000,
    imageData = null,  // { mimeType, base64 } for vision tasks
  } = options;

  const isVision = Boolean(imageData);
  const errors = [];
  let rawText = null;
  let tierUsed = null;

  // ── VISION PATH ──────────────────────────────────────────────────────────
  if (isVision) {
    // Tier 1: Gemini Vision (PRIMARY for vision)
    if (modelConfig.PRIMARY) {
      try {
        console.log(`[aiRouter] VISION Tier 1: Gemini (${modelConfig.PRIMARY})`);
        rawText = await callGeminiVision({
          model: modelConfig.PRIMARY,
          textPrompt: prompt,
          imageData,
          temperature,
          timeoutMs: geminiTimeoutMs,
        });
        tierUsed = `Gemini ${modelConfig.PRIMARY}`;
      } catch (err) {
        console.warn(`[aiRouter] VISION Tier 1 Gemini failed: ${err.message}`);
        errors.push({ tier: 1, model: modelConfig.PRIMARY, error: err.message });
      }
    }

    // Tier 2: Groq Vision (FALLBACK for vision)
    if (!rawText && modelConfig.FALLBACK) {
      try {
        console.log(`[aiRouter] VISION Tier 2: Groq Vision (${modelConfig.FALLBACK})`);
        rawText = await callGroqVision({
          model: modelConfig.FALLBACK,
          textPrompt: prompt,
          imageData,
          temperature,
          timeoutMs: groqTimeoutMs,
        });
        tierUsed = `Groq ${modelConfig.FALLBACK}`;
      } catch (err) {
        console.warn(`[aiRouter] VISION Tier 2 Groq failed: ${err.message}`);
        errors.push({ tier: 2, model: modelConfig.FALLBACK, error: err.message });
      }
    }

    if (!rawText) {
      console.error(`[aiRouter][${taskKey}] ALL VISION tiers failed:`, errors);
      return null;
    }

    console.log(`[aiRouter][${taskKey}] VISION succeeded via ${tierUsed}`);
    return rawText;
  }

  // ── TEXT PATH ────────────────────────────────────────────────────────────

  // Build Groq messages array
  const buildMessages = () => {
    if (systemPrompt) {
      return [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];
    }
    return [{ role: 'user', content: prompt }];
  };

  // ── Circuit Breaker check ─────────────────────────────────────────────────
  const circuitOpen = _cbIsOpen();
  if (circuitOpen) {
    console.warn(`[aiRouter][${taskKey}] ⚡ Circuit open — skipping Groq Tier 1 & Tier 2, going straight to Gemini.`);
  }

  // Tier 1: Groq PRIMARY (skipped when circuit is open)
  if (!circuitOpen && modelConfig.PRIMARY) {
    try {
      console.log(`[aiRouter][${taskKey}] Tier 1: Groq (${modelConfig.PRIMARY})`);
      rawText = await callGroq({
        model: modelConfig.PRIMARY,
        messages: buildMessages(),
        temperature,
        jsonMode,
        timeoutMs: groqTimeoutMs,
      });
      tierUsed = `Groq ${modelConfig.PRIMARY}`;
      _cbRecordSuccess();
    } catch (err) {
      console.warn(`[aiRouter][${taskKey}] Tier 1 Groq Primary failed: ${err.message}`);
      errors.push({ tier: 1, model: modelConfig.PRIMARY, error: err.message });
      _cbRecordFailure(err.message);
    }
  }

  // Tier 2: Groq FALLBACK — only if it is actually a Groq-hosted model.
  // If FALLBACK_GROQ is defined, use it.
  // If only FALLBACK is defined, use it ONLY when it is NOT a Gemini model name
  // (Gemini model names always start with 'gemini'). A Gemini model name in FALLBACK
  // means "go straight to Gemini as Tier 3" — trying it via the Groq API would just
  // waste a call and always fail with a 404.
  const isGeminiModel = (name) => typeof name === 'string' && name.startsWith('gemini');

  const tier2Model = modelConfig.FALLBACK_GROQ ||
    (!isGeminiModel(modelConfig.FALLBACK) ? modelConfig.FALLBACK : null);

  if (!rawText && !circuitOpen && tier2Model && tier2Model !== modelConfig.PRIMARY) {
    try {
      console.log(`[aiRouter][${taskKey}] Tier 2: Groq Fallback (${tier2Model})`);
      rawText = await callGroq({
        model: tier2Model,
        messages: buildMessages(),
        temperature,
        jsonMode,
        timeoutMs: groqTimeoutMs,
      });
      tierUsed = `Groq ${tier2Model}`;
      _cbRecordSuccess();
    } catch (err) {
      console.warn(`[aiRouter][${taskKey}] Tier 2 Groq Fallback failed: ${err.message}`);
      errors.push({ tier: 2, model: tier2Model, error: err.message });
      _cbRecordFailure(err.message);
    }
  }

  // Tier 3: Gemini — resolves from FALLBACK_GEMINI, or from FALLBACK if it IS a Gemini model.
  const tier3Model = modelConfig.FALLBACK_GEMINI ||
    (isGeminiModel(modelConfig.FALLBACK) ? modelConfig.FALLBACK : null);

  if (!rawText && tier3Model) {
    try {
      console.log(`[aiRouter][${taskKey}] Tier 3: Gemini (${tier3Model})`);
      rawText = await callGemini({
        model: tier3Model,
        prompt,
        systemPrompt,
        temperature,
        jsonMode,
        timeoutMs: geminiTimeoutMs,
      });
      tierUsed = `Gemini ${tier3Model}`;
    } catch (err) {
      console.warn(`[aiRouter][${taskKey}] Tier 3 Gemini failed: ${err.message}`);
      errors.push({ tier: 3, model: tier3Model, error: err.message });
    }
  }

  if (!rawText) {
    console.error(`[aiRouter][${taskKey}] ALL tiers failed:`, errors);
    return null;
  }

  console.log(`[aiRouter][${taskKey}] succeeded via ${tierUsed}`);

  if (jsonMode) {
    const cleaned = cleanJsonString(rawText);
    return JSON.parse(cleaned);
  }

  return rawText;
}

module.exports = { executeAICall };
