/**
 * useXPStore.js
 * Gamification state: XP total, level, streak, and pending animations.
 *
 * XP EVENT TABLE (matches Firestore Cloud Function awards):
 *   workout_complete    → +50 XP
 *   pr_set              → +25 XP per PR
 *   challenge_join      → +10 XP
 *   challenge_complete  → +100 XP
 *   streak_7            → +75 XP  (7-day streak bonus)
 *   streak_30           → +200 XP (30-day streak bonus)
 *   profile_complete    → +20 XP  (one-time)
 *   plan_generated      → +5 XP
 *
 * Levels (cumulative XP thresholds):
 *   1 Rookie      0
 *   2 Challenger  500
 *   3 Hustler     1500
 *   4 Warrior     3000
 *   5 Elite       5500
 *   6 Legend      10000
 *
 * Shape:
 *   totalXP        — number (loaded from Firestore /users/{uid})
 *   level          — 1–6 derived from totalXP
 *   levelName      — string label
 *   xpToNextLevel  — XP needed to reach next level
 *   streak         — current consecutive workout days
 *   pendingXP      — XP earned this session (drives level-up animation)
 *   leveledUp      — bool flag to trigger level-up modal
 *
 * Actions:
 *   setXP(total, streak) — hydrate from Firestore on sign-in
 *   awardXP(amount)      — add XP locally (Firestore write handled by Cloud Function)
 *   clearPending()       — dismiss level-up animation
 */

import { create } from 'zustand';
import { deriveLevelFromXP } from '../lib/xpHelpers';
import { readProfileCache } from './authStore';

// ─── Initial state — hydrate from cache immediately ───────────────────────────
const cachedProfile = readProfileCache();
const initialXP = cachedProfile?.xp ?? 0;
const initialTotalXP = cachedProfile?.cumulativeXP ?? cachedProfile?.xp ?? 0;
const initialStreak = cachedProfile?.streak ?? 0;
const derived = deriveLevelFromXP(initialTotalXP);

export const useXPStore = create((set, get) => ({
  xp:            initialXP, // Current spendable XP currency
  totalXP:       initialTotalXP, // Cumulative lifetime XP used for levels
  level:         derived.level,
  levelName:     derived.levelName,
  xpToNextLevel: derived.xpToNextLevel,
  streak:        initialStreak,
  pendingXP:     0,
  leveledUp:     false,

  setXP: (...args) => {
    const spendableXP = args[0] ?? 0;
    const cumulativeXP = args[1] ?? null;
    const streak = args[2] ?? 0;

    let actualSpendable;
    let actualCumulative;
    let actualStreak;

    if (args.length === 2) {
      // Legacy: setXP(total, streak)
      actualSpendable = spendableXP;
      actualCumulative = spendableXP;
      actualStreak = cumulativeXP; // second argument is streak
    } else if (args.length === 1) {
      actualSpendable = spendableXP;
      actualCumulative = spendableXP;
      actualStreak = 0;
    } else {
      // New: setXP(spendableXP, cumulativeXP, streak)
      actualSpendable = spendableXP;
      actualCumulative = cumulativeXP !== null ? cumulativeXP : spendableXP;
      actualStreak = streak;
    }

    const derived = deriveLevelFromXP(Math.max(0, actualCumulative ?? 0));
    const safeStreak = Math.max(0, parseInt(actualStreak, 10) || 0);
    set({
      xp: Math.max(0, actualSpendable ?? 0),
      totalXP: Math.max(0, actualCumulative ?? 0),
      streak: safeStreak,
      ...derived
    });
  },

  awardXP: (amount) => {
    const prevLevel = get().level;
    const newSpendable = get().xp + amount;
    const newCumulative = get().totalXP + amount;
    const derived   = deriveLevelFromXP(newCumulative);
    set({
      xp:        newSpendable,
      totalXP:   newCumulative,
      pendingXP: get().pendingXP + amount,
      leveledUp: derived.level > prevLevel,
      ...derived,
    });
  },

  clearPending: () => set({ pendingXP: 0, leveledUp: false }),

  /**
   * rollbackXP(amount)
   * Reverses a speculative awardXP call when the Firestore batch fails.
   * Subtracts amount from both xp and totalXP and re-derives the level.
   */
  rollbackXP: (amount) => {
    const newSpendable = Math.max(0, get().xp - amount);
    const newCumulative  = Math.max(0, get().totalXP - amount);
    const derived   = deriveLevelFromXP(newCumulative);
    set({
      xp:        newSpendable,
      totalXP:   newCumulative,
      pendingXP: Math.max(0, get().pendingXP - amount),
      leveledUp: false,
      ...derived,
    });
  },
}));
