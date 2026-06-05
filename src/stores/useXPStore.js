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

const LEVELS = [
  { level: 1, name: 'Rookie',     threshold: 0     },
  { level: 2, name: 'Challenger', threshold: 500   },
  { level: 3, name: 'Hustler',    threshold: 1500  },
  { level: 4, name: 'Warrior',    threshold: 3000  },
  { level: 5, name: 'Elite',      threshold: 5500  },
  { level: 6, name: 'Legend',     threshold: 10000 },
];

function deriveLevel(xp) {
  let current = LEVELS[0];
  for (const l of LEVELS) {
    if (xp >= l.threshold) current = l;
    else break;
  }
  const nextIdx  = LEVELS.indexOf(current) + 1;
  const next     = LEVELS[nextIdx];
  const xpToNext = next ? next.threshold - xp : 0;
  return { level: current.level, levelName: current.name, xpToNextLevel: xpToNext };
}

export const useXPStore = create((set, get) => ({
  totalXP:       0,
  level:         1,
  levelName:     'Rookie',
  xpToNextLevel: 500,
  streak:        0,
  pendingXP:     0,
  leveledUp:     false,

  setXP: (total, streak = 0) => {
    const derived = deriveLevel(total);
    set({ totalXP: total, streak, ...derived });
  },

  awardXP: (amount) => {
    const prevLevel = get().level;
    const newTotal  = get().totalXP + amount;
    const derived   = deriveLevel(newTotal);
    set({
      totalXP:   newTotal,
      pendingXP: get().pendingXP + amount,
      leveledUp: derived.level > prevLevel,
      ...derived,
    });
  },

  clearPending: () => set({ pendingXP: 0, leveledUp: false }),
}));
