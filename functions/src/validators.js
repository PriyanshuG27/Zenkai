/**
 * validators.js
 *
 * Input validation helpers for Cloud Functions.
 * All validators throw HttpsError directly so callers only need:
 *   validateUID(uid);
 *   validatePlanRequest(data);
 *
 * Security guarantee:
 *   - Never trust uid from request.data — always pass request.auth.uid.
 *   - No extra fields are permitted in request.data to prevent injection.
 */

'use strict';

const { HttpsError } = require('firebase-functions/v2/https');

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const UID_MAX_LEN = 128;

// The only keys allowed in a generatePlan request body.
// UID is NOT accepted from the client body — auth context only.
const ALLOWED_PLAN_KEYS = new Set(['weekId']);

// Valid medical flag values stored in Firestore (normalised at onboarding)
const VALID_MEDICAL_FLAGS = new Set([
  'varicocele',
  'bad_knees',
  'lower_back',
  'shoulder_impingement',
  'post_surgery',
]);

// ─────────────────────────────────────────────
// validateUID
// ─────────────────────────────────────────────

/**
 * Validates a Firebase UID coming from request.auth.uid.
 *
 * @param {string} uid
 * @throws {HttpsError} 'invalid-argument' if uid is invalid.
 */
function validateUID(uid) {
  if (typeof uid !== 'string' || uid.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Invalid user identifier.');
  }
  if (uid.length > UID_MAX_LEN) {
    throw new HttpsError('invalid-argument', 'Invalid user identifier.');
  }
}

// ─────────────────────────────────────────────
// validatePlanRequest
// ─────────────────────────────────────────────

/**
 * Validates the request body sent to generatePlan.
 *
 * Rules:
 *   - No extra fields beyond ALLOWED_PLAN_KEYS are permitted.
 *   - If weekId is supplied it must be a non-empty string matching YYYY-WNN.
 *   - uid from request.data is explicitly forbidden (server always uses auth context).
 *
 * @param {object} data — request.data from the callable
 * @throws {HttpsError} 'invalid-argument' if validation fails.
 */
function validatePlanRequest(data) {
  if (data === null || data === undefined) return;
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'Invalid request payload.');
  }

  // Block any attempt to pass uid in the request body
  if ('uid' in data) {
    throw new HttpsError(
      'invalid-argument',
      'UID must not be supplied in the request body.'
    );
  }

  // Reject any unexpected keys
  const unknownKeys = Object.keys(data).filter((k) => !ALLOWED_PLAN_KEYS.has(k));
  if (unknownKeys.length > 0) {
    throw new HttpsError('invalid-argument', 'Invalid request payload.');
  }

  // Validate weekId format if supplied
  if ('weekId' in data) {
    const weekId = data.weekId;
    if (typeof weekId !== 'string' || !/^\d{4}-W\d{2}$/.test(weekId)) {
      throw new HttpsError('invalid-argument', 'Invalid weekId format.');
    }
  }
}

// ─────────────────────────────────────────────
// validatePlan (Gemini response validator)
// ─────────────────────────────────────────────

/**
 * Validates the JSON plan returned by Gemini Flash before writing to Firestore.
 *
 * Checks:
 *   1. Plan is an object with a `days` array containing exactly 7 entries.
 *   2. Each day has `day` (1-7) and `focus` (string).
 *   3. Day 7 is a rest day (exercises array is empty or absent).
 *   4. Each exercise has `name` (string), `sets` (number), `reps` (string/number),
 *      and `targetWeight` (number).
 *
 * @param {object} plan — parsed JSON from Gemini
 * @throws {Error} with message 'plan_parse_failed' if structure is invalid.
 */
function validatePlan(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.days)) {
    throw new Error('plan_parse_failed');
  }
  if (plan.days.length !== 7) {
    throw new Error('plan_parse_failed');
  }

  for (let i = 0; i < plan.days.length; i++) {
    const day = plan.days[i];
    if (typeof day.day !== 'number' || day.day !== i + 1) {
      throw new Error('plan_parse_failed');
    }
    if (typeof day.focus !== 'string' || day.focus.trim() === '') {
      throw new Error('plan_parse_failed');
    }

    // Day 7 should be rest — exercises array is optional / empty
    if (day.day === 7) continue;

    const exercises = day.exercises || [];
    for (const ex of exercises) {
      if (typeof ex.name !== 'string' || ex.name.trim() === '') {
        throw new Error('plan_parse_failed');
      }
      if (typeof ex.sets !== 'number' || ex.sets < 1) {
        throw new Error('plan_parse_failed');
      }
      if (ex.reps === undefined || ex.reps === null) {
        throw new Error('plan_parse_failed');
      }
      if (typeof ex.targetWeight !== 'number' || ex.targetWeight < 0) {
        throw new Error('plan_parse_failed');
      }
    }
  }
}

module.exports = { validateUID, validatePlanRequest, validatePlan };
