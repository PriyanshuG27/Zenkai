/**
 * functions.test.js
 *
 * Unit tests for backend security helpers:
 *   - validators.js  (validateUID, validatePlanRequest, validatePlan)
 *   - rateLimiter.js (checkRateLimit)
 *
 * These tests run in Node environment (no Firebase emulator needed) by mocking
 * Firestore.
 *
 * Run: npx vitest run src/__tests__/functions.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';


// ─────────────────────────────────────────────
// Import modules under test (after mocks)
// ─────────────────────────────────────────────

const { validateUID, validatePlanRequest, validatePlan, HttpsError } = await import(
  '../../backend/lib/validators.js'
);
const { checkRateLimit } = await import('../../backend/middleware/rateLimiter.js');

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
    expect(() => validateUID('')).toThrow();
    try { validateUID(''); } catch (e) {
      expect(e.code).toBe('invalid-argument');
    }
  });

  it('throws invalid-argument for whitespace-only string', () => {
    expect(() => validateUID('   ')).toThrow();
    try { validateUID('   '); } catch (e) {
      expect(e.code).toBe('invalid-argument');
    }
  });

  it('throws invalid-argument for UID longer than 128 characters', () => {
    const longUID = 'x'.repeat(129);
    expect(() => validateUID(longUID)).toThrow();
    try { validateUID(longUID); } catch (e) {
      expect(e.code).toBe('invalid-argument');
    }
  });

  it('throws invalid-argument for non-string types', () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      expect(() => validateUID(bad)).toThrow();
      try { validateUID(bad); } catch (e) {
        expect(e.code).toBe('invalid-argument');
      }
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
    expect(() => validatePlanRequest({ uid: 'hacker-attempt' })).toThrow();
    try { validatePlanRequest({ uid: 'hacker-attempt' }); } catch (e) {
      expect(e.code).toBe('invalid-argument');
    }
  });

  it('throws invalid-argument when uid is supplied alongside other fields', () => {
    expect(() => validatePlanRequest({ uid: 'x', weekId: '2026-W01' })).toThrow();
    try { validatePlanRequest({ uid: 'x', weekId: '2026-W01' }); } catch (e) {
      expect(e.code).toBe('invalid-argument');
    }
  });

  it('throws invalid-argument for unknown extra fields', () => {
    expect(() => validatePlanRequest({ extraField: 'evil' })).toThrow();
    try { validatePlanRequest({ extraField: 'evil' }); } catch (e) {
      expect(e.code).toBe('invalid-argument');
    }
  });

  it('throws invalid-argument for badly formatted weekId', () => {
    for (const bad of ['2026-23', 'W23', '2026/W23', '2026-W2', '', 123]) {
      expect(() => validatePlanRequest({ weekId: bad })).toThrow();
      try { validatePlanRequest({ weekId: bad }); } catch (e) {
        expect(e.code).toBe('invalid-argument');
      }
    }
  });

  it('throws invalid-argument when data is a non-object', () => {
    expect(() => validatePlanRequest('string')).toThrow();
    expect(() => validatePlanRequest([1, 2])).toThrow();
    try { validatePlanRequest('string'); } catch (e) {
      expect(e.code).toBe('invalid-argument');
    }
    try { validatePlanRequest([1, 2]); } catch (e) {
      expect(e.code).toBe('invalid-argument');
    }
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
  // Build a minimal Firestore mock for user document transaction tests
  function makeDb({ exists = true, planRefresh = 0, dailyRegenCount = 0, lastRegenDate = '' } = {}) {
    const snap = {
      exists,
      data: () => (exists ? {
        powerUps: { planRefresh },
        dailyRegenCount,
        lastRegenDate
      } : undefined),
    };
    const updated = { value: null };
    const tx = {
      get: vi.fn().mockResolvedValue(snap),
      update: vi.fn((ref, data) => { updated.value = data; }),
    };
    const db = {
      doc: vi.fn(() => 'mock-ref'),
      runTransaction: vi.fn(async (fn) => { await fn(tx); }),
      _updated: updated,
      _tx: tx,
    };
    return db;
  }

  it('throws not-found when user profile does not exist', async () => {
    const db = makeDb({ exists: false });
    await expect(checkRateLimit(db, 'uid-001')).rejects.toThrow();
    try {
      await checkRateLimit(db, 'uid-001');
    } catch (e) {
      expect(e.code).toBe('not-found');
    }
  });

  it('allows free regeneration (under 5 limit) and increments count', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const db = makeDb({ dailyRegenCount: 2, lastRegenDate: todayStr });
    await expect(checkRateLimit(db, 'uid-002', false)).resolves.not.toThrow();
    expect(db._updated.value.dailyRegenCount).toBe(3);
    expect(db._updated.value.lastRegenDate).toBe(todayStr);
  });

  it('resets daily count when date changes', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const db = makeDb({ dailyRegenCount: 5, lastRegenDate: '2026-06-01' });
    await expect(checkRateLimit(db, 'uid-003', false)).resolves.not.toThrow();
    expect(db._updated.value.dailyRegenCount).toBe(1);
    expect(db._updated.value.lastRegenDate).toBe(todayStr);
  });

  it('throws resource-exhausted when free daily limit of 5 is exceeded', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const db = makeDb({ dailyRegenCount: 5, lastRegenDate: todayStr });
    await expect(checkRateLimit(db, 'uid-004', false)).rejects.toThrow();
    try {
      await checkRateLimit(db, 'uid-004', false);
    } catch (e) {
      expect(e.code).toBe('resource-exhausted');
      expect(e.message).toMatch(/Daily free limit of 5 reached/);
    }
  });

  it('allows regeneration when using a power-up even if daily limit is exceeded', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const db = makeDb({ dailyRegenCount: 5, lastRegenDate: todayStr, planRefresh: 2 });
    await expect(checkRateLimit(db, 'uid-005', true)).resolves.not.toThrow();
    expect(db._updated.value['powerUps.planRefresh']).toBe(1);
  });

  it('throws resource-exhausted when using power-up but user has 0 planRefresh', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const db = makeDb({ dailyRegenCount: 5, lastRegenDate: todayStr, planRefresh: 0 });
    await expect(checkRateLimit(db, 'uid-006', true)).rejects.toThrow();
    try {
      await checkRateLimit(db, 'uid-006', true);
    } catch (e) {
      expect(e.code).toBe('resource-exhausted');
      expect(e.message).toMatch(/No Plan Refresh power-up available/);
    }
  });
});
