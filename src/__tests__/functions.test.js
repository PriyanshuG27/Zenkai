/**
 * functions.test.js
 *
 * Unit tests for Cloud Functions security helpers:
 *   - validators.js  (validateUID, validatePlanRequest, validatePlan)
 *   - rateLimiter.js (checkRateLimit)
 *
 * These tests run in Node environment (no Firebase emulator needed) by mocking
 * Firestore and firebase-functions/v2/https.
 *
 * Run: npx vitest run src/__tests__/functions.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────
// Mock firebase-functions/v2/https
// ─────────────────────────────────────────────

vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code    = code;
      this.message = message;
    }
  }
  return { HttpsError, onCall: vi.fn((fn) => fn) };
});

// ─────────────────────────────────────────────
// Import modules under test (after mocks)
// ─────────────────────────────────────────────

const { validateUID, validatePlanRequest, validatePlan } = await import(
  '../../functions/src/validators.js'
);
const { checkRateLimit } = await import('../../functions/src/rateLimiter.js');

// Grab the mocked HttpsError class for instanceof checks
const { HttpsError } = await import('firebase-functions/v2/https');

// ═════════════════════════════════════════════
// validateUID
// ═════════════════════════════════════════════

describe('validateUID', () => {
  it('accepts a normal Firebase UID', () => {
    expect(() => validateUID('abc123XYZ')).not.toThrow();
  });

  it('accepts a UID of exactly 128 characters', () => {
    expect(() => validateUID('a'.repeat(128))).not.toThrow();
  });

  it('throws invalid-argument for empty string', () => {
    expect(() => validateUID('')).toThrow(HttpsError);
    try { validateUID(''); } catch (e) {
      expect(e.code).toBe('invalid-argument');
    }
  });

  it('throws invalid-argument for whitespace-only string', () => {
    expect(() => validateUID('   ')).toThrow(HttpsError);
    try { validateUID('   '); } catch (e) {
      expect(e.code).toBe('invalid-argument');
    }
  });

  it('throws invalid-argument for UID longer than 128 characters', () => {
    const longUID = 'x'.repeat(129);
    expect(() => validateUID(longUID)).toThrow(HttpsError);
    try { validateUID(longUID); } catch (e) {
      expect(e.code).toBe('invalid-argument');
    }
  });

  it('throws invalid-argument for non-string types', () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      expect(() => validateUID(bad)).toThrow(HttpsError);
    }
  });
});

// ═════════════════════════════════════════════
// validatePlanRequest
// ═════════════════════════════════════════════

describe('validatePlanRequest', () => {
  it('accepts an empty data object', () => {
    expect(() => validatePlanRequest({})).not.toThrow();
  });

  it('accepts null / undefined data (no body)', () => {
    expect(() => validatePlanRequest(null)).not.toThrow();
    expect(() => validatePlanRequest(undefined)).not.toThrow();
  });

  it('accepts a valid weekId in the body', () => {
    expect(() => validatePlanRequest({ weekId: '2026-W23' })).not.toThrow();
  });

  it('throws invalid-argument when uid is supplied in request body', () => {
    expect(() => validatePlanRequest({ uid: 'hacker-attempt' })).toThrow(HttpsError);
    try { validatePlanRequest({ uid: 'hacker-attempt' }); } catch (e) {
      expect(e.code).toBe('invalid-argument');
    }
  });

  it('throws invalid-argument when uid is supplied alongside other fields', () => {
    expect(() => validatePlanRequest({ uid: 'x', weekId: '2026-W01' })).toThrow(HttpsError);
    try { validatePlanRequest({ uid: 'x', weekId: '2026-W01' }); } catch (e) {
      expect(e.code).toBe('invalid-argument');
    }
  });

  it('throws invalid-argument for unknown extra fields', () => {
    expect(() => validatePlanRequest({ extraField: 'evil' })).toThrow(HttpsError);
    try { validatePlanRequest({ extraField: 'evil' }); } catch (e) {
      expect(e.code).toBe('invalid-argument');
    }
  });

  it('throws invalid-argument for badly formatted weekId', () => {
    for (const bad of ['2026-23', 'W23', '2026/W23', '2026-W2', '', 123]) {
      expect(() => validatePlanRequest({ weekId: bad })).toThrow(HttpsError);
    }
  });

  it('throws invalid-argument when data is a non-object', () => {
    expect(() => validatePlanRequest('string')).toThrow(HttpsError);
    expect(() => validatePlanRequest([1, 2])).toThrow(HttpsError);
  });
});

// ═════════════════════════════════════════════
// validatePlan
// ═════════════════════════════════════════════

describe('validatePlan', () => {
  const validPlan = {
    days: Array.from({ length: 7 }, (_, i) => ({
      day:       i + 1,
      focus:     i < 6 ? 'Push' : 'Rest',
      exercises: i < 6
        ? [{ name: 'Bench Press', sets: 3, reps: '8-10', targetWeight: 60 }]
        : [],
    })),
  };

  it('accepts a valid 7-day plan', () => {
    expect(() => validatePlan(validPlan)).not.toThrow();
  });

  it('accepts day 7 with no exercises array (rest day)', () => {
    const plan = JSON.parse(JSON.stringify(validPlan));
    delete plan.days[6].exercises;
    expect(() => validatePlan(plan)).not.toThrow();
  });

  it('throws plan_parse_failed for null input', () => {
    expect(() => validatePlan(null)).toThrow('plan_parse_failed');
  });

  it('throws plan_parse_failed when days array is missing', () => {
    expect(() => validatePlan({})).toThrow('plan_parse_failed');
  });

  it('throws plan_parse_failed when days length is not 7', () => {
    const plan = { days: validPlan.days.slice(0, 6) };
    expect(() => validatePlan(plan)).toThrow('plan_parse_failed');
  });

  it('throws plan_parse_failed when a day number is wrong', () => {
    const plan = JSON.parse(JSON.stringify(validPlan));
    plan.days[2].day = 99;
    expect(() => validatePlan(plan)).toThrow('plan_parse_failed');
  });

  it('throws plan_parse_failed when focus is missing from a day', () => {
    const plan = JSON.parse(JSON.stringify(validPlan));
    delete plan.days[0].focus;
    expect(() => validatePlan(plan)).toThrow('plan_parse_failed');
  });

  it('throws plan_parse_failed when an exercise is missing targetWeight', () => {
    const plan = JSON.parse(JSON.stringify(validPlan));
    delete plan.days[0].exercises[0].targetWeight;
    expect(() => validatePlan(plan)).toThrow('plan_parse_failed');
  });

  it('throws plan_parse_failed when sets < 1', () => {
    const plan = JSON.parse(JSON.stringify(validPlan));
    plan.days[0].exercises[0].sets = 0;
    expect(() => validatePlan(plan)).toThrow('plan_parse_failed');
  });
});

// ═════════════════════════════════════════════
// checkRateLimit
// ═════════════════════════════════════════════

describe('checkRateLimit', () => {
  // Build a minimal Firestore mock for transaction tests
  function makeDb({ exists = false, count = 0, windowStart = Date.now() } = {}) {
    const snap = {
      exists,
      data: () => (exists ? { count, windowStart } : undefined),
    };
    const written = { value: null };
    const tx = {
      get:  vi.fn().mockResolvedValue(snap),
      set:  vi.fn((ref, data) => { written.value = data; }),
    };
    const db = {
      doc:            vi.fn(() => 'mock-ref'),
      runTransaction: vi.fn(async (fn) => { await fn(tx); }),
      _written:       written,
      _tx:            tx,
    };
    return db;
  }

  it('allows first call (no existing document)', async () => {
    const db = makeDb({ exists: false });
    await expect(checkRateLimit(db, 'uid-001')).resolves.not.toThrow();
    // Should have written count=1
    expect(db._written.value.count).toBe(1);
  });

  it('allows 5th call (count=4 in window)', async () => {
    const db = makeDb({ exists: true, count: 4, windowStart: Date.now() });
    await expect(checkRateLimit(db, 'uid-002')).resolves.not.toThrow();
    expect(db._written.value.count).toBe(5);
  });

  it('throws resource-exhausted on 6th call (count=5 in window)', async () => {
    const db = makeDb({ exists: true, count: 5, windowStart: Date.now() });
    await expect(checkRateLimit(db, 'uid-003')).rejects.toThrow(HttpsError);
    try {
      await checkRateLimit(db, 'uid-003');
    } catch (e) {
      expect(e.code).toBe('resource-exhausted');
      expect(e.message).toMatch(/Try again in an hour/);
    }
  });

  it('resets count when window has expired (windowStart older than 1 hour)', async () => {
    const oneHourAndOneMinuteAgo = Date.now() - (61 * 60 * 1000);
    const db = makeDb({ exists: true, count: 5, windowStart: oneHourAndOneMinuteAgo });

    // Should NOT throw even though count was 5, because window has expired
    await expect(checkRateLimit(db, 'uid-004')).resolves.not.toThrow();

    // After reset, count should be 1 (fresh start)
    expect(db._written.value.count).toBe(1);
  });

  it('does not reset count when window has not expired', async () => {
    const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
    const db = makeDb({ exists: true, count: 3, windowStart: thirtyMinutesAgo });
    await expect(checkRateLimit(db, 'uid-005')).resolves.not.toThrow();
    expect(db._written.value.count).toBe(4); // incremented, not reset
  });
});
