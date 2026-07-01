/**
 * useWorkoutStore.js
 * Active workout session state — ephemeral, lives only during a session.
 *
 * Shape:
 *   activeSession  — { planDayId, startedAt, exercises: [...] } | null
 *   exercises      — array of { exerciseId, name, sets: [{ reps, weight, completed }] }
 *   elapsedSeconds — timer tick count (driven by useWorkoutTimer hook)
 *   sessionLoading — true while Firestore write is in flight
 *   sessionError   — error string | null
 *
 * Actions:
 *   startSession(planDay)      — initialise session from a plan day
 *   addExercise(exercise)      — append a new exercise with one blank set (used by ExerciseSearch)
 *   logSet(exIdx, setIdx, data)— update reps/weight/completed for a set
 *   addSet(exIdx)              — append a blank set to an exercise
 *   removeSet(exIdx, setIdx)   — remove a specific set
 *   tick()                     — increment elapsedSeconds by 1
 *   setSessionLoading(bool)
 *   setSessionError(msg)
 *   clearSession()             — reset after save or cancel
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './authStore';

const BODYWEIGHT_EXERCISES = [
  'push_ups',
  'incline_push_ups',
  'decline_push_ups',
  'pull_ups',
  'chin_ups',
  'dips',
  'plank',
  'hanging_leg_raise',
  'russian_twists',
  'ab_wheel_rollouts',
  'bodyweight_squat',
  'lunges',
  'burpees',
  'mountain_climbers',
  'jumping_jacks',
];

export const isBodyweightExercise = (exerciseKey, exerciseId) => {
  const cleanKey = (exerciseKey || '').toLowerCase();
  const cleanId  = (exerciseId  || '').toLowerCase();
  return BODYWEIGHT_EXERCISES.some((key) =>
    cleanKey === key ||
    cleanKey.startsWith(key) ||
    cleanId  === key ||
    cleanId.startsWith(key + '_')
  );
};

/**
 * Generates a UUID that works in both secure (HTTPS) and non-secure (HTTP)
 * contexts. crypto.randomUUID() is only available on HTTPS — this fallback
 * uses crypto.getRandomValues (available everywhere) or Math.random as a
 * last resort for local dev over HTTP.
 */
export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // crypto.getRandomValues fallback (available on HTTP too)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, (c) =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }
  // Math.random last resort (dev only, not cryptographically secure)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
};

export const getEstimated1RM = (weight, reps, isBW, bodyWeight = 75) => {
  const parsedWeight = parseFloat(weight) || 0;
  const parsedReps = parseInt(reps, 10) || 0;
  const effectiveWeight = isBW ? (bodyWeight + parsedWeight) : parsedWeight;
  return effectiveWeight * (1 + parsedReps / 30);
};

export const useWorkoutStore = create(
  persist(
    (set) => ({
      activeSession:  null,
      exercises:      [],
      elapsedSeconds: 0,
      sessionLoading: false,
      sessionError:   null,
      isOverdrive:    false,

      setOverdrive: (val) => set({ isOverdrive: val }),

      startSession: (planDayOrMood, stomachFlag = false, isQuickLog = false) => {
        const profile = useAuthStore.getState().profile;
        const restTimes = profile?.latestRestTimesMap || {};

        if (typeof planDayOrMood === 'object' && planDayOrMood !== null) {
          const planDayId = planDayOrMood.id ?? planDayOrMood.day ?? 'custom';
          set((state) => ({
            activeSession: {
              sessionId: generateUUID(),
              planDayId,
              startedAt: Date.now(),
              exercises: planDayOrMood.exercises,
              moodTag: 'average',
              stomachFlag: false,
              isOverdrive: state.isOverdrive,
              isQuickLog: !!(planDayOrMood.isQuickLog || isQuickLog),
            },
            exercises: planDayOrMood.exercises.map((ex) => {
              const exId = ex.id ?? ex.exerciseKey ?? ex.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
              const exKey = ex.key || exId;
              const isBW = isBodyweightExercise(exKey, exId);
              
              // If sets count is specified, pre-populate that many sets with target details.
              const setsCount = typeof ex.sets === 'number' ? ex.sets : 3;
              const defaultWeight = isBW ? 'BW' : (ex.targetWeight !== undefined ? String(ex.targetWeight) : '');
              
              // For reps: if it's a range like "8-10", we can pre-fill it.
              const defaultReps = ex.reps ? String(ex.reps) : '';

              const sets = Array.from({ length: setsCount }).map(() => ({
                reps: defaultReps,
                weight: defaultWeight,
                completed: false,
                done: false
              }));

              return {
                exerciseId: exId,
                exerciseKey: exKey,
                name:       ex.name,
                muscleGroup: ex.muscleGroup,
                sets,
                restTimer:  restTimes[exKey] || 90,
              };
            }),
            elapsedSeconds: 0,
            sessionError:   null,
          }));
        } else {
          const mood = typeof planDayOrMood === 'string' ? planDayOrMood : 'average';
          set((state) => ({
            activeSession: {
              sessionId: generateUUID(),
              planDayId: 'custom',
              startedAt: Date.now(),
              exercises: [],
              moodTag: mood,
              stomachFlag: Boolean(stomachFlag),
              isOverdrive: state.isOverdrive,
              isQuickLog: !!isQuickLog,
            },
            exercises: [],
            elapsedSeconds: 0,
            sessionError:   null,
          }));
        }
      },

      // Append a free-choice exercise picked via ExerciseSearch or NLP parser.
      // A timestamp suffix on the ID means logging the same exercise twice is supported.
      addExercise: (exercise) =>
        set((state) => {
          const profile = useAuthStore.getState().profile;
          const restTimes = profile?.latestRestTimesMap || {};
          const exKey = exercise.key || exercise.exerciseKey;
          const isBW = isBodyweightExercise(exKey, exKey);
          const defaultSets = exercise.sets ?? [{ reps: '', weight: isBW ? 'BW' : '', completed: false, done: false }];
          return {
            exercises: [
              ...state.exercises,
              {
                exerciseId:  `${exKey}_${Date.now()}`,
                exerciseKey: exKey,
                name:        exercise.name,
                muscleGroup: exercise.muscleGroup,
                sets:        defaultSets,
                restTimer:   restTimes[exKey] || 90,
              },
            ],
          };
        }),

      logSet: (exIdx, setIdx, data) =>
        set((state) => {
          const exercises = state.exercises.map((ex, i) => {
            if (i !== exIdx) return ex;
            const sets = ex.sets.map((s, j) => (j === setIdx ? { ...s, ...data } : s));
            return { ...ex, sets };
          });
          return { exercises };
        }),

      updateSet: (exerciseId, setIndex, field, value) =>
        set((state) => {
          const exercises = state.exercises.map((ex) => {
            if (ex.exerciseId !== exerciseId) return ex;
            const sets = ex.sets.map((s, j) => {
              if (j !== setIndex) return s;
              return { ...s, [field]: value, completed: false, done: false };
            });
            return { ...ex, sets };
          });
          return { exercises };
        }),

      markSetDone: (exerciseId, setIndex) => {
        let success = true;
        set((state) => {
          const exercises = state.exercises.map((ex) => {
            if (ex.exerciseId !== exerciseId) return ex;
            const isBW = isBodyweightExercise(ex.exerciseKey, ex.exerciseId);
            const sets = ex.sets.map((s, j) => {
              if (j !== setIndex) return s;
              if (s.done || s.completed) {
                return { ...s, completed: false, done: false };
              }
              const isSetBW = s.weight === 'BW';
              const weight = isSetBW ? 0 : (parseFloat(s.weight) || 0);
              const reps = parseInt(s.reps, 10) || 0;
              const isWeightValid = isBW ? (isSetBW || weight >= 0) : (weight > 0);
              if (!isWeightValid || reps <= 0) {
                success = false;
                return s;
              }
              return { ...s, completed: true, done: true };
            });
            return { ...ex, sets };
          });
          return { exercises };
        });
        return success;
      },

      addSet: (exIdx) =>
        set((state) => {
          const exercises = state.exercises.map((ex, i) => {
            if (i !== exIdx) return ex;
            const isBW = isBodyweightExercise(ex.exerciseKey, ex.exerciseId);
            return {
              ...ex,
              sets: [...ex.sets, { reps: '', weight: isBW ? 'BW' : '', completed: false, done: false }]
            };
          });
          return { exercises };
        }),

      removeSet: (exIdx, setIdx) =>
        set((state) => {
          const exercises = state.exercises.map((ex, i) => {
            if (i !== exIdx) return ex;
            const sets = ex.sets.filter((_, j) => j !== setIdx);
            return { ...ex, sets };
          });
          return { exercises };
        }),

      tick: () => set((state) => {
        if (!state.activeSession || !state.activeSession.startedAt) {
          return { elapsedSeconds: state.elapsedSeconds + 1 };
        }
        return { elapsedSeconds: Math.floor((Date.now() - state.activeSession.startedAt) / 1000) };
      }),

      setSessionLoading: (sessionLoading) => set({ sessionLoading }),
      setSessionError:   (sessionError)   => set({ sessionError }),

      clearSession: () =>
        set({ activeSession: null, exercises: [], elapsedSeconds: 0, sessionLoading: false, sessionError: null, isOverdrive: false }),

      // resetSession is an alias for clearSession (kept for backward compat with existing callers)
      resetSession: () =>
        set({ activeSession: null, exercises: [], elapsedSeconds: 0, sessionLoading: false, sessionError: null, isOverdrive: false }),

      removeExercise: (exerciseId) =>
        set((state) => ({
          exercises: state.exercises.filter((ex) => ex.exerciseId !== exerciseId)
        })),

      updateExerciseRestTimer: (exerciseId, seconds) =>
        set((state) => {
          const exercises = state.exercises.map((ex) => {
            if (ex.exerciseId !== exerciseId) return ex;
            return { ...ex, restTimer: seconds };
          });
          return { exercises };
        }),
    }),
    {
      name: 'zenkai-workout-session',
      partialize: (state) => ({
        activeSession:  state.activeSession,
        exercises:      state.exercises,
        elapsedSeconds: state.elapsedSeconds,
        isOverdrive:    state.isOverdrive,
      }),
    }
  )
);
