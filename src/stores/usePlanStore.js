/**
 * usePlanStore.js
 * Weekly AI-generated workout plan state.
 *
 * Shape:
 *   currentPlan   — Firestore /users/{uid}/weeklyPlans/{weekId} document | null
 *   planDays      — array of { id, label, exercises, muscleGroups, estimatedMins }
 *   planLoading   — true while fetching or generating
 *   planError     — error string | null
 *   generatedAt   — ISO timestamp of last generation
 *   weekId        — YYYY-WNN string for current week
 *
 * Actions:
 *   setPlan(planDoc)       — hydrate after Firestore fetch
 *   setPlanLoading(bool)
 *   setPlanError(msg)
 *   clearPlan()
 */

import { create } from 'zustand';

function currentWeekId() {
  const now  = new Date();
  const year = now.getFullYear();
  // ISO week number
  const startOfYear = new Date(year, 0, 1);
  const week = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// ── SWR plan cache helpers ─────────────────────────────────────────────────
// Persist the plan in localStorage so returning users see the weekly schedule
// instantly on mount — before the Firestore getDoc resolves.
const PLAN_CACHE_PREFIX = 'zenkai_plan_cache_';

export function writePlanCache(uid, weekId, planDoc) {
  try {
    if (uid && weekId && planDoc) {
      localStorage.setItem(
        `${PLAN_CACHE_PREFIX}${uid}_${weekId}`,
        JSON.stringify(planDoc)
      );
    }
  } catch {
    // Ignore storage quota errors silently
  }
}

export function readPlanCache(uid, weekId) {
  try {
    const raw = localStorage.getItem(`${PLAN_CACHE_PREFIX}${uid}_${weekId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPlanCache(uid, weekId) {
  try {
    if (uid && weekId) {
      localStorage.removeItem(`${PLAN_CACHE_PREFIX}${uid}_${weekId}`);
    } else if (uid) {
      // Clear all weeks for this user
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(`${PLAN_CACHE_PREFIX}${uid}_`)) {
          localStorage.removeItem(key);
        }
      }
    }
  } catch {
    // ignore
  }
}

const _weekId = currentWeekId();

export const usePlanStore = create((set) => ({
  currentPlan:  null,
  planDays:     [],
  planLoading:  false,
  planError:    null,
  generatedAt:  null,
  weekId:       _weekId,
  hasFetched:   false,
  isNewUser:    false,

  setPlan: (planDoc, isNewUser) =>
    set((state) => ({
      currentPlan: planDoc,
      planDays:    planDoc?.plan?.days ?? planDoc?.days ?? [],
      generatedAt: planDoc?.generatedAt ?? null,
      planError:   null,
      hasFetched:  true,
      isNewUser:   isNewUser !== undefined ? isNewUser : state.isNewUser,
    })),

  setPlanLoading: (planLoading) => set({ planLoading }),
  setPlanError:   (planError)   => set({ planError, hasFetched: true }),

  clearPlan: () =>
    set({ currentPlan: null, planDays: [], planLoading: false, planError: null, generatedAt: null, hasFetched: false, isNewUser: false }),
}));
