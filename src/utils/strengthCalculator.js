/**
 * strengthCalculator.js
 * 
 * Computes user muscle strength scores on a scale of 0 - 100 based on universal strength standards.
 * Supports dumbbell weight doubling correction and exercise-level averaging.
 */

import exerciseBank from '../data/exercises.json';

// Universal strength standards for key compound lifts (male ratio multipliers)
const DEFAULT_STANDARDS = {
  bench: [0.50, 0.75, 1.00, 1.30, 1.60],       // Chest
  squat: [0.60, 0.90, 1.25, 1.65, 2.10],       // Quads, Glutes
  deadlift: [0.70, 1.05, 1.45, 1.95, 2.40],    // Lower Back, Hamstrings
  ohp: [0.35, 0.50, 0.65, 0.85, 1.10],         // Front Delts, Triceps
  pullup: [0.10, 0.25, 0.45, 0.70, 0.95],      // Lats, Biceps (mass above BW)
  generic: [0.25, 0.40, 0.60, 0.85, 1.10]
};

// Map 14 individual muscles to their 6 general group categories
export const MUSCLE_TO_CATEGORY = {
  chest: 'chest',
  shoulders: 'shoulders',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'arms',
  abs: 'core',
  obliques: 'core',
  quads: 'legs',
  hamstrings: 'legs',
  calves: 'legs',
  glutes: 'legs',
  traps: 'back',
  lats: 'back',
  lower_back: 'back'
};

/**
 * Maps an exercise to one of the 14 individual muscles.
 */
export function getIndividualMuscle(exerciseKey, muscleGroup) {
  const name = (exerciseKey || '').toLowerCase();
  const group = (muscleGroup || '').toLowerCase();

  if (group === 'chest') return 'chest';
  if (group === 'shoulders' || name.includes('delt') || name.includes('shoulder') || name.includes('ohp') || name.includes('military') || name.includes('lateral')) {
    return 'shoulders';
  }
  if (group === 'core' || group === 'abs') {
    if (name.includes('oblique') || name.includes('twist') || name.includes('side_bend') || name.includes('side bend')) {
      return 'obliques';
    }
    return 'abs';
  }
  if (group === 'back') {
    if (name.includes('shrug') || name.includes('trap')) return 'traps';
    if (name.includes('deadlift') || name.includes('lower_back') || name.includes('lower back') || name.includes('extension') || name.includes('morning')) {
      return 'lower_back';
    }
    return 'lats';
  }
  if (group === 'arms') {
    if (name.includes('tricep') || name.includes('pushdown') || name.includes('kickback') || name.includes('skull') || name.includes('ext') || name.includes('dip')) {
      return 'triceps';
    }
    if (name.includes('forearm') || name.includes('wrist') || name.includes('grip') || name.includes('reverse_curl') || name.includes('reverse curl')) {
      return 'forearms';
    }
    return 'biceps';
  }
  if (group === 'legs') {
    if (name.includes('calf') || name.includes('calves') || name.includes('raise')) return 'calves';
    if (name.includes('deadlift') || name.includes('hamstring') || name.includes('leg_curl') || name.includes('leg curl')) {
      return 'hamstrings';
    }
    if (name.includes('glute') || name.includes('hip_thrust') || name.includes('hip thrust') || name.includes('kickback')) {
      return 'glutes';
    }
    return 'quads';
  }
  return null; // Unknown muscle group — caller handles null; don't silently inflate chest scores
}

/**
 * Estimates 1-Rep Max using Epley formula.
 */
export function estimate1RM(weight, reps) {
  if (weight === 'BW' || !weight) return 0;
  const w = parseFloat(weight) || 0;
  const r = parseInt(reps, 10) || 0;
  if (r <= 1) return w;
  return w * (1 + r / 30);
}

/**
 * Gets standards multipliers adjusted for demographic.
 */
export function getMultipliersForExercise(exerciseKey, gender = 'male') {
  const genderKey = (gender || 'male').toLowerCase();
  let key = 'generic';
  
  const nameLower = (exerciseKey || '').toLowerCase();
  
  if (nameLower.includes('bench_press') || nameLower.includes('chest_press')) {
    key = 'bench';
  } else if (nameLower.includes('squat')) {
    key = 'squat';
  } else if (nameLower.includes('deadlift')) {
    key = 'deadlift';
  } else if (nameLower.includes('overhead_press') || nameLower.includes('shoulder_press') || nameLower.includes('ohp')) {
    key = 'ohp';
  } else if (nameLower.includes('pull_up') || nameLower.includes('chin_up') || nameLower.includes('lat_pulldown')) {
    key = 'pullup';
  }

  let selected = [...(DEFAULT_STANDARDS[key] || DEFAULT_STANDARDS.generic)];

  // Female standards adjustment
  if (genderKey === 'female') {
    const upperFactor = 0.65;
    const lowerFactor = 0.80;
    if (key === 'bench' || key === 'ohp' || key === 'pullup' || key === 'generic') {
      selected = selected.map(s => s * upperFactor);
    } else if (key === 'squat' || key === 'deadlift') {
      selected = selected.map(s => s * lowerFactor);
    }
  }

  // Halve standards for isolation exercises (curls, raises, extensions, kickbacks).
  // These exercises are single-joint and lift far less weight than compounds,
  // so they need their own scale relative to bodyweight.
  // Fix: previously only halved for NON-dumbbell — which was backwards.
  // Both 'barbell curl' and 'dumbbell curl' should be scaled the same way.
  const isIsolation = (
    nameLower.includes('curl') ||
    nameLower.includes('raise') ||
    nameLower.includes('extension') ||
    nameLower.includes('kickback') ||
    nameLower.includes('cable') ||
    nameLower.includes('fly')
  );
  // Don't double-apply to compound movements that happen to contain these words
  const isCompound = (
    nameLower.includes('bench_press') ||
    nameLower.includes('chest_press') ||
    nameLower.includes('squat') ||
    nameLower.includes('deadlift') ||
    nameLower.includes('overhead_press') ||
    nameLower.includes('shoulder_press')
  );
  if (isIsolation && !isCompound) {
    selected = selected.map(s => s * 0.5);
  }

  return {
    beginner: selected[0],
    novice: selected[1],
    intermediate: selected[2],
    advanced: selected[3],
    elite: selected[4]
  };
}

/**
 * Linearly interpolates strength ratio to a 0-100 score.
 */
export function calculateStrengthScore(ratio, multipliers) {
  if (ratio <= 0) return 0;

  const { beginner, novice, intermediate, advanced, elite } = multipliers;

  if (ratio < beginner) {
    return Math.round((ratio / beginner) * 20);
  } else if (ratio < novice) {
    return Math.round(20 + ((ratio - beginner) / (novice - beginner)) * 20);
  } else if (ratio < intermediate) {
    return Math.round(40 + ((ratio - novice) / (intermediate - novice)) * 20);
  } else if (ratio < advanced) {
    return Math.round(60 + ((ratio - intermediate) / (advanced - intermediate)) * 15);
  } else if (ratio < elite) {
    return Math.round(75 + ((ratio - advanced) / (elite - advanced)) * 15);
  } else {
    const capRatio = elite * 1.3;
    const diff = ratio - elite;
    const range = capRatio - elite;
    return Math.round(90 + Math.min(10, (diff / range) * 10));
  }
}

/**
 * Compiles 0-100 scores for all 14 detailed muscle groups based on user PRs.
 */
export function calculateDetailedMuscleStrength(prs = [], profile = {}) {
  const bw = parseFloat(profile.weightKg) || parseFloat(profile.weight) || 75; // Default bodyweight
  const gender = (profile.gender || 'male').toLowerCase();

  // Create mappings of exercise keys to muscle groups
  const exerciseToMuscleMap = {};
  exerciseBank.forEach((ex) => {
    exerciseToMuscleMap[ex.key] = ex.muscleGroup;
  });

  // Group PRs by unique exerciseKey to prevent duplicate calculations
  const uniquePrMap = {};
  prs.forEach((pr) => {
    if (!uniquePrMap[pr.exerciseKey]) {
      uniquePrMap[pr.exerciseKey] = pr;
    }
  });

  // Initialize scores lists
  const scoresByGeneralGroup = {
    chest: [],
    back: [],
    shoulders: [],
    arms: [],
    legs: [],
    core: []
  };

  const scoresByIndividualGroup = {};
  Object.keys(MUSCLE_TO_CATEGORY).forEach((m) => {
    scoresByIndividualGroup[m] = [];
  });

  Object.values(uniquePrMap).forEach((pr) => {
    const exKey = pr.exerciseKey;
    const exInfo = exerciseBank.find(e => e.key === exKey);

    const isDumbbell = exInfo?.equipmentRequired?.includes('dumbbells') || 
                       exKey.includes('dumbbell') || 
                       exKey.includes('db');
    const isCable = exInfo?.equipmentRequired?.includes('cable') ||
                    exKey.includes('cable');

    const rawWeight = parseFloat(pr.weight) || 0;
    const trueWeight = (isDumbbell || isCable) ? rawWeight * 2 : rawWeight;

    const est1RM = estimate1RM(pr.weight === 'BW' ? 'BW' : trueWeight, pr.reps);
    if (est1RM <= 0 && pr.weight !== 'BW') return;

    const ratio = pr.weight === 'BW' ? 0.65 : est1RM / bw;
    
    const multipliers = getMultipliersForExercise(exKey, gender);
    const score = calculateStrengthScore(ratio, multipliers);

    const genGroup = exerciseToMuscleMap[exKey] || exInfo?.muscleGroup || 'other';
    if (scoresByGeneralGroup[genGroup] !== undefined) {
      scoresByGeneralGroup[genGroup].push(score);
    }

    const indivGroup = getIndividualMuscle(exKey, genGroup);
    if (indivGroup && scoresByIndividualGroup[indivGroup] !== undefined) {
      scoresByIndividualGroup[indivGroup].push(score);
    }
  });

  // Calculate average score for each general group (fallback values if empty)
  const generalAverages = {};
  Object.keys(scoresByGeneralGroup).forEach((group) => {
    const list = scoresByGeneralGroup[group];
    if (list.length > 0) {
      generalAverages[group] = Math.round(list.reduce((a, b) => a + b, 0) / list.length);
    } else {
      const baselines = { chest: 28, back: 32, shoulders: 30, arms: 26, legs: 34, core: 35 };
      generalAverages[group] = baselines[group] || 30;
    }
  });

  // Compute final scores for all 14 individual muscles
  const individualAverages = {};
  Object.keys(MUSCLE_TO_CATEGORY).forEach((indiv) => {
    const list = scoresByIndividualGroup[indiv];
    if (list.length > 0) {
      individualAverages[indiv] = Math.round(list.reduce((a, b) => a + b, 0) / list.length);
    } else {
      const parentCategory = MUSCLE_TO_CATEGORY[indiv];
      const parentAvg = generalAverages[parentCategory];
      const offsets = {
        traps: 2,
        lower_back: -2,
        lats: 1,
        biceps: 0,
        triceps: -1,
        forearms: -2,
        quads: 2,
        hamstrings: -2,
        glutes: 1,
        calves: -1,
        abs: 0,
        obliques: -1,
        chest: 0,
        shoulders: 0
      };
      const offset = offsets[indiv] || 0;
      individualAverages[indiv] = Math.max(10, Math.min(100, parentAvg + offset));
    }
  });

  // Map individual scores to 19 SVG path keys
  const finalScores = {
    chest_left: individualAverages.chest,
    chest_right: individualAverages.chest,
    front_delts_left: individualAverages.shoulders,
    front_delts_right: individualAverages.shoulders,
    biceps_left: individualAverages.biceps,
    biceps_right: individualAverages.biceps,
    forearm_left: individualAverages.forearms,
    forearm_right: individualAverages.forearms,
    abs: individualAverages.abs,
    obliques_left: individualAverages.obliques,
    obliques_right: individualAverages.obliques,
    quads_left: individualAverages.quads,
    quads_right: individualAverages.quads,
    calves_left_front: individualAverages.calves,
    calves_right_front: individualAverages.calves,
    tibialis_left: individualAverages.calves,
    tibialis_right: individualAverages.calves,
    traps: individualAverages.traps,
    lats_left: individualAverages.lats,
    lats_right: individualAverages.lats,
    rear_delts_left: individualAverages.shoulders,
    rear_delts_right: individualAverages.shoulders,
    triceps_left: individualAverages.triceps,
    triceps_right: individualAverages.triceps,
    lower_back: individualAverages.lower_back,
    glutes_left: individualAverages.glutes,
    glutes_right: individualAverages.glutes,
    hamstrings_left: individualAverages.hamstrings,
    hamstrings_right: individualAverages.hamstrings,
    calves_left_back: individualAverages.calves,
    calves_right_back: individualAverages.calves
  };

  return {
    general: generalAverages,     // 6 main groups for Radar Chart in Grouped view
    detailed: finalScores,         // 19 paths for Mannequin coloring
    individual: individualAverages // 14 individual muscles
  };
}

/**
 * Returns tier details based on 0-100 score.
 */
export function getStrengthTier(score) {
  if (score >= 90) return { label: 'LEGENDARY', color: '#FFD700', bg: '#FFD7001A', border: '#FFD700' };
  if (score >= 75) return { label: 'EPIC',      color: '#B44FE8', bg: '#B44FE81A', border: '#B44FE8' };
  if (score >= 60) return { label: 'ADVANCED',  color: '#4F8EF7', bg: '#4F8EF71A', border: '#4F8EF7' };
  if (score >= 40) return { label: 'INTERMEDIATE', color: '#22C55E', bg: '#22C55E1A', border: '#22C55E' };
  return                   { label: 'BEGINNER',       color: '#888888', bg: '#8888881A', border: '#888888' };
}
