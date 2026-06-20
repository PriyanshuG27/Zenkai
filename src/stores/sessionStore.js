/**
 * sessionStore.js
 *
 * Zustand store — ephemeral workout session state.
 * Intentionally NOT persisted to localStorage: if the app crashes mid-session
 * the user starts fresh (Firestore is only written on finishSession success).
 *
 * Shape:
 *   isActive          boolean         — true while a session is in progress
 *   startTime         Date | null     — Date object set when session starts
 *   moodTag           string | null   — 'locked_in' | 'average' | 'low_energy'
 *   stomachFlag       boolean         — true if user flagged stomach issues
 *   exercises         Exercise[]      — ordered exercise list
 *   currentExerciseId string | null   — ID of the exercise currently in focus
 *
 * Exercise shape:
 *   { id, name, exerciseKey, muscleGroup, sets: [{ reps, weight, done }] }
 *
 * All actions are synchronous. Firestore writes are handled in useWorkoutLogger.
 */

import { create } from 'zustand';
import { generateUUID } from './useWorkoutStore';

const VALID_MOOD_TAGS = ['locked_in', 'average', 'low_energy'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map an exercise array, patching only the exercise matching exerciseId. */
const mapExercise = (exercises, exerciseId, patchFn) =>
  exercises.map((ex) => (ex.id === exerciseId ? patchFn(ex) : ex));

/** Map the sets of a specific exercise, patching only the set at setIndex. */
const mapSet = (ex, setIndex, patchFn) => ({
  ...ex,
  sets: ex.sets.map((s, i) => (i === setIndex ? patchFn(s) : s)),
});

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSessionStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────────
  isActive:          false,
  startTime:         null,
  moodTag:           null,
  stomachFlag:       false,
  exercises:         [],
  currentExerciseId: null,

  // ── Actions ────────────────────────────────────────────────────────────────

  /**
   * startSession(moodTag, stomachFlag)
   * Throws if a session is already active — prevents two concurrent sessions.
   */
  startSession: (moodTag, stomachFlag = false) => {
    if (get().isActive) {
      throw new Error(
        '[sessionStore] startSession: A session is already active. ' +
        'Call resetSession() before starting a new one.'
      );
    }

    const resolvedMood = VALID_MOOD_TAGS.includes(moodTag) ? moodTag : 'average';

    set({
      isActive:          true,
      startTime:         new Date(),
      moodTag:           resolvedMood,
      stomachFlag:       Boolean(stomachFlag),
      exercises:         [],
      currentExerciseId: null,
    });
  },

  /**
   * addExercise(name, exerciseKey, muscleGroup)
   * Creates a new exercise with one blank set { reps: 0, weight: 0, done: false }.
   * Uses generateUUID() for the exercise ID (works on HTTP + HTTPS).
   */
  addExercise: (name, exerciseKey, muscleGroup) => {
    const id = generateUUID();

    set((state) => ({
      exercises: [
        ...state.exercises,
        {
          id,
          name:        String(name).trim(),
          exerciseKey: String(exerciseKey).trim(),
          muscleGroup: String(muscleGroup).trim(),
          sets:        [{ reps: 0, weight: 0, done: false }],
        },
      ],
      // Auto-focus the newly added exercise
      currentExerciseId: id,
    }));
  },

  /**
   * addSet(exerciseId)
   * Appends a blank set { reps: 0, weight: 0, done: false } to the exercise.
   */
  addSet: (exerciseId) => {
    set((state) => ({
      exercises: mapExercise(state.exercises, exerciseId, (ex) => ({
        ...ex,
        sets: [...ex.sets, { reps: 0, weight: 0, done: false }],
      })),
    }));
  },

  /**
   * updateSet(exerciseId, setIndex, field, value)
   * field: 'reps' | 'weight'
   *
   * Production rules:
   *   - weight: parseFloat(value), must be >= 0. Invalid → 0.
   *   - reps:   parseInt(value, 10), must be >= 0 and integer. Invalid → 0.
   *   - Any update marks the set as not-done (user is still editing).
   */
  updateSet: (exerciseId, setIndex, field, value) => {
    let parsed;

    if (field === 'weight') {
      parsed = parseFloat(value);
      if (isNaN(parsed) || !isFinite(parsed) || parsed < 0) parsed = 0;
    } else if (field === 'reps') {
      parsed = parseInt(value, 10);
      if (isNaN(parsed) || !isFinite(parsed) || parsed < 0) parsed = 0;
    } else {
      // Unknown field — silently ignore
      return;
    }

    set((state) => ({
      exercises: mapExercise(state.exercises, exerciseId, (ex) =>
        mapSet(ex, setIndex, (s) => ({ ...s, [field]: parsed, done: false }))
      ),
    }));
  },

  /**
   * markSetDone(exerciseId, setIndex)
   * Returns false (and does NOT mutate state) if weight === 0 or reps === 0.
   * Returns true on success.
   */
  markSetDone: (exerciseId, setIndex) => {
    const exercises = get().exercises;
    const ex = exercises.find((e) => e.id === exerciseId);
    if (!ex) return false;

    const s = ex.sets[setIndex];
    if (!s) return false;

    // Guard: both weight and reps must be > 0
    if (s.weight <= 0 || s.reps <= 0) return false;

    set((state) => ({
      exercises: mapExercise(state.exercises, exerciseId, (exercise) =>
        mapSet(exercise, setIndex, (set_) => ({ ...set_, done: true }))
      ),
    }));

    return true;
  },

  /**
   * removeSet(exerciseId, setIndex)
   * Removes the set at setIndex. Will not remove the last set of an exercise —
   * exercises must always have at least one set row.
   */
  removeSet: (exerciseId, setIndex) => {
    set((state) => ({
      exercises: mapExercise(state.exercises, exerciseId, (ex) => {
        if (ex.sets.length <= 1) return ex; // preserve last set
        return { ...ex, sets: ex.sets.filter((_, i) => i !== setIndex) };
      }),
    }));
  },

  /**
   * removeExercise(exerciseId)
   * Removes the exercise and clears currentExerciseId if it was the removed one.
   */
  removeExercise: (exerciseId) => {
    set((state) => {
      const exercises = state.exercises.filter((ex) => ex.id !== exerciseId);
      const currentExerciseId =
        state.currentExerciseId === exerciseId
          ? (exercises[0]?.id ?? null)
          : state.currentExerciseId;

      return { exercises, currentExerciseId };
    });
  },

  /**
   * setCurrentExercise(id)
   * Sets the focused exercise (used by the logger UI to scroll/highlight).
   */
  setCurrentExercise: (id) => {
    set({ currentExerciseId: id });
  },

  /**
   * resetSession()
   * Clears all session state back to defaults.
   * Must only be called AFTER a successful Firestore write in useWorkoutLogger.
   */
  resetSession: () => {
    set({
      isActive:          false,
      startTime:         null,
      moodTag:           null,
      stomachFlag:       false,
      exercises:         [],
      currentExerciseId: null,
    });
  },
}));
