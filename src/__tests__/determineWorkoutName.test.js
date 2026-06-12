import { describe, it, expect } from 'vitest';
import { determineWorkoutName } from '../lib/firestoreUtils';

describe('determineWorkoutName', () => {
  it('returns Custom Session for empty or undefined exercises', () => {
    expect(determineWorkoutName([])).toBe('Custom Session');
    expect(determineWorkoutName(null)).toBe('Custom Session');
  });

  it('returns Custom Session if no sets are completed', () => {
    const exercises = [
      {
        name: 'Bench Press',
        muscleGroup: 'chest',
        sets: [{ reps: 10, weight: 60, completed: false, done: false }]
      }
    ];
    expect(determineWorkoutName(exercises)).toBe('Custom Session');
  });

  it('identifies Chest Workout for single chest exercise', () => {
    const exercises = [
      {
        name: 'Bench Press',
        muscleGroup: 'chest',
        sets: [{ reps: 10, weight: 60, completed: true, done: true }]
      }
    ];
    expect(determineWorkoutName(exercises)).toBe('Chest Workout');
  });

  it('identifies Push Workout when Chest, Shoulders, and Triceps are hit', () => {
    const exercises = [
      {
        name: 'Bench Press',
        muscleGroup: 'chest',
        sets: [{ reps: 10, weight: 60, completed: true }]
      },
      {
        name: 'Overhead Press',
        muscleGroup: 'shoulders',
        sets: [{ reps: 8, weight: 40, completed: true }]
      },
      {
        name: 'Tricep Pushdowns',
        muscleGroup: 'arms',
        sets: [{ reps: 12, weight: 20, completed: true }]
      }
    ];
    expect(determineWorkoutName(exercises)).toBe('Push Workout');
  });

  it('identifies Chest & Triceps Workout for Chest + Triceps', () => {
    const exercises = [
      {
        name: 'Bench Press',
        muscleGroup: 'chest',
        sets: [{ reps: 10, weight: 60, completed: true }]
      },
      {
        name: 'Tricep Pushdowns',
        muscleGroup: 'arms',
        sets: [{ reps: 12, weight: 20, completed: true }]
      }
    ];
    expect(determineWorkoutName(exercises)).toBe('Chest & Triceps Workout');
  });

  it('identifies Pull Workout for Back + Biceps', () => {
    const exercises = [
      {
        name: 'Pull-Ups',
        muscleGroup: 'back',
        sets: [{ reps: 8, weight: 'BW', completed: true }]
      },
      {
        name: 'Bicep Curls',
        muscleGroup: 'arms',
        sets: [{ reps: 12, weight: 15, completed: true }]
      }
    ];
    expect(determineWorkoutName(exercises)).toBe('Pull Workout');
  });

  it('identifies Legs Workout', () => {
    const exercises = [
      {
        name: 'Squat',
        muscleGroup: 'legs',
        sets: [{ reps: 5, weight: 100, completed: true }]
      }
    ];
    expect(determineWorkoutName(exercises)).toBe('Legs Workout');
  });

  it('identifies Full Body Workout for Push + Pull + Legs', () => {
    const exercises = [
      {
        name: 'Bench Press',
        muscleGroup: 'chest',
        sets: [{ reps: 10, weight: 60, completed: true }]
      },
      {
        name: 'Pull-Ups',
        muscleGroup: 'back',
        sets: [{ reps: 8, weight: 'BW', completed: true }]
      },
      {
        name: 'Squat',
        muscleGroup: 'legs',
        sets: [{ reps: 5, weight: 100, completed: true }]
      }
    ];
    expect(determineWorkoutName(exercises)).toBe('Full Body Workout');
  });
});
