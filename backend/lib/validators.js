/**
 * validators.js
 *
 * Input validation helpers for Express routes.
 * Reuses the validation logic from Cloud Functions.
 */

'use strict';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    const statusMap = {
      'invalid-argument': 400,
      'unauthenticated': 401,
      'permission-denied': 403,
      'not-found': 404,
      'resource-exhausted': 429,
      'internal': 500,
      'deadline-exceeded': 504
    };
    this.status = statusMap[code] || 500;
  }
}

const UID_MAX_LEN = 128;

// The only keys allowed in a generatePlan request body.
const ALLOWED_PLAN_KEYS = new Set(['weekId', 'personalRequirements', 'usePowerUp']);

/**
 * Validates a Firebase UID.
 */
function validateUID(uid) {
  if (typeof uid !== 'string' || uid.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Invalid user identifier.');
  }
  if (uid.length > UID_MAX_LEN) {
    throw new HttpsError('invalid-argument', 'Invalid user identifier.');
  }
}

/**
 * Validates the request body sent to generatePlan.
 */
function validatePlanRequest(data) {
  if (data === null || data === undefined) return;
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'Invalid request payload.');
  }

  if ('uid' in data) {
    throw new HttpsError(
      'invalid-argument',
      'UID must not be supplied in the request body.'
    );
  }

  const unknownKeys = Object.keys(data).filter((k) => !ALLOWED_PLAN_KEYS.has(k));
  if (unknownKeys.length > 0) {
    throw new HttpsError('invalid-argument', 'Invalid request payload.');
  }

  if ('weekId' in data) {
    const weekId = data.weekId;
    if (typeof weekId !== 'string' || !/^\d{4}-W\d{2}$/.test(weekId)) {
      throw new HttpsError('invalid-argument', 'Invalid weekId format.');
    }
  }
}

/**
 * Validates the JSON plan returned by Gemini/Groq.
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

    // Day 7 should be rest
    if (day.day === 7) continue;

    const exercises = day.exercises || [];
    if (day.focus !== 'Rest') {
      if (exercises.length < 4 || exercises.length > 6) {
        throw new Error('plan_parse_failed');
      }
    } else {
      if (exercises.length > 0) {
        throw new Error('plan_parse_failed');
      }
    }

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

module.exports = { HttpsError, validateUID, validatePlanRequest, validatePlan };
