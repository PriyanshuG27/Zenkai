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
 *   logSet(exIdx, setIdx, data)— update reps/weight/completed for a set
 *   addSet(exIdx)              — append a blank set to an exercise
 *   removeSet(exIdx, setIdx)   — remove a specific set
 *   tick()                     — increment elapsedSeconds by 1
 *   setSessionLoading(bool)
 *   setSessionError(msg)
 *   clearSession()             — reset after save or cancel
 */

import { create } from 'zustand';

export const useWorkoutStore = create((set) => ({
  activeSession:  null,
  exercises:      [],
  elapsedSeconds: 0,
  sessionLoading: false,
  sessionError:   null,

  startSession: (planDay) =>
    set({
      activeSession:  { planDayId: planDay.id, startedAt: Date.now(), exercises: planDay.exercises },
      exercises:      planDay.exercises.map((ex) => ({
        exerciseId: ex.id,
        name:       ex.name,
        sets:       [{ reps: '', weight: '', completed: false }],
      })),
      elapsedSeconds: 0,
      sessionError:   null,
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

  addSet: (exIdx) =>
    set((state) => {
      const exercises = state.exercises.map((ex, i) => {
        if (i !== exIdx) return ex;
        return { ...ex, sets: [...ex.sets, { reps: '', weight: '', completed: false }] };
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

  tick: () => set((state) => ({ elapsedSeconds: state.elapsedSeconds + 1 })),

  setSessionLoading: (sessionLoading) => set({ sessionLoading }),
  setSessionError:   (sessionError)   => set({ sessionError }),

  clearSession: () =>
    set({ activeSession: null, exercises: [], elapsedSeconds: 0, sessionLoading: false, sessionError: null }),
}));
