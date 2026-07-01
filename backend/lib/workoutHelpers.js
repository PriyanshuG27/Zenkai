'use strict';

const LEVEL_THRESHOLDS = [
  { level: 1,  name: 'Rookie',     xpRequired: 0      },
  { level: 6,  name: 'Challenger', xpRequired: 1000   },
  { level: 16, name: 'Athlete',    xpRequired: 7000   },
  { level: 31, name: 'Elite',      xpRequired: 30000  },
];

function deriveLevelFromXP(xp) {
  const raw = Math.max(0, xp);

  let tierIdx = 0;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (raw >= LEVEL_THRESHOLDS[i].xpRequired) {
      tierIdx = i;
      break;
    }
  }

  const current = LEVEL_THRESHOLDS[tierIdx];
  const next = LEVEL_THRESHOLDS[tierIdx + 1] ?? null;

  if (!next) {
    const eliteXPPerLevel = 2000;
    const xpIntoElite = raw - current.xpRequired;
    const levelsIntoElite = Math.floor(xpIntoElite / eliteXPPerLevel);
    const level = current.level + levelsIntoElite;
    const xpToNextLevel = eliteXPPerLevel - (xpIntoElite % eliteXPPerLevel);
    return { level, levelName: current.name, xpToNextLevel };
  }

  const tierXPSpan = next.xpRequired - current.xpRequired;
  const levelCount = next.level - current.level;
  const xpPerLevel = Math.floor(tierXPSpan / levelCount);
  const xpIntoTier = raw - current.xpRequired;
  const levelsIntoTier = Math.min(Math.floor(xpIntoTier / xpPerLevel), levelCount - 1);
  const level = current.level + levelsIntoTier;
  const xpEarnedThisSubLevel = xpIntoTier - levelsIntoTier * xpPerLevel;
  const xpToNextLevel = xpPerLevel - xpEarnedThisSubLevel;

  return { level, levelName: current.name, xpToNextLevel };
}

function evaluateStreak(lastDate, currentStreak) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!lastDate) {
    return { newStreak: 1, streakBonuses: [] };
  }

  const prev = new Date(lastDate);
  prev.setHours(0, 0, 0, 0);

  const diffDays = Math.round((today - prev) / (1000 * 60 * 60 * 24));

  let newStreak;
  if (diffDays === 0) {
    newStreak = currentStreak;
  } else if (diffDays === 1) {
    newStreak = currentStreak + 1;
  } else {
    newStreak = 1;
  }

  const streakBonuses = [];
  if (newStreak >= 30 && currentStreak < 30) {
    streakBonuses.push('streak_30');
  } else if (newStreak >= 7 && currentStreak < 7) {
    streakBonuses.push('streak_7');
  } else if (newStreak >= 3 && currentStreak < 3) {
    streakBonuses.push('streak_3');
  }

  return { newStreak, streakBonuses };
}

const BW_FRACTION_BY_KEY = {
  push_ups:             0.64,
  wide_grip_push_ups:   0.69,
  incline_push_ups:     0.53,
  decline_push_ups:     0.74,
  diamond_push_ups:     0.64,
  archer_push_ups:      0.64,
  handstand_push_ups:   1.00,
  plyometric_push_ups:  0.64,
  clapping_push_ups:    0.64,
  deficit_push_ups:     0.64,
  weighted_push_ups:    0.64,
  chest_dips:           0.75,
  weighted_chest_dips:  0.75,
  tricep_dips:          0.75,
  weighted_tricep_dips: 0.75,
  pull_ups:                    1.00,
  chin_ups:                    1.00,
  neutral_grip_pull_ups:       1.00,
  wide_grip_pull_ups:          1.00,
  close_grip_pull_ups:         1.00,
  behind_the_neck_pull_ups:    1.00,
  weighted_pull_ups:           1.00,
  weighted_chin_ups:           1.00,
  inverted_row:                0.70,
  australian_pull_ups:         0.70,
  archer_pull_ups:             1.00,
  bodyweight_squat:     0.85,
  jump_squat:           0.85,
  pistol_squat:         0.85,
  lunge:                0.85,
  walking_lunges:       0.85,
  reverse_lunge:        0.85,
  lateral_lunge:        0.85,
  step_up:              0.85,
  box_jump:             0.85,
  glute_bridge:         0.50,
  single_leg_glute_bridge: 0.50,
  nordic_hamstring_curl: 0.65,
  wall_sit:             0.70,
  plank:                   0.69,
  side_plank:              0.69,
  hanging_leg_raise:       0.20,
  hanging_knee_raise:      0.15,
  dragon_flag:             0.80,
  ab_wheel_rollout:        0.60,
  mountain_climbers:       0.60,
  burpees:                 0.65,
  tuck_crunch:             0.15,
  bicycle_crunch:          0.15,
  sit_ups:                 0.20,
  muscle_up:            1.00,
  front_lever:          1.00,
  back_lever:           1.00,
  human_flag:           1.00,
  l_sit:                1.00,
};

const BW_FRACTION_BY_PATTERN = [
  { test: (k) => k.includes('pull_up') || k.includes('chin_up'),   fraction: 1.00 },
  { test: (k) => k.includes('push_up'),                            fraction: 0.64 },
  { test: (k) => k.includes('dip'),                                fraction: 0.75 },
  { test: (k) => k.includes('plank'),                              fraction: 0.69 },
  { test: (k) => k.includes('squat') || k.includes('lunge'),       fraction: 0.85 },
  { test: (k) => k.includes('bridge') || k.includes('thrust'),     fraction: 0.50 },
  { test: (k) => k.includes('hanging') || k.includes('leg_raise'), fraction: 0.20 },
  { test: (k) => k.includes('burpee'),                             fraction: 0.65 },
  { test: (k) => k.includes('climb'),                              fraction: 0.60 },
];

function getBWEffectiveFraction(exerciseKey) {
  const key = (exerciseKey || '').toLowerCase();
  if (BW_FRACTION_BY_KEY[key] !== undefined) return BW_FRACTION_BY_KEY[key];
  for (const { test, fraction } of BW_FRACTION_BY_PATTERN) {
    if (test(key)) return fraction;
  }
  return 0.70;
}

function determineWorkoutName(exercises) {
  if (!exercises || exercises.length === 0) return 'Custom Session';
  const completedExs = exercises.filter(ex => ex.sets && ex.sets.some(s => s.done || s.completed));
  if (completedExs.length === 0) return 'Custom Session';

  const hitGroups = new Set();
  completedExs.forEach(ex => {
    let group = (ex.muscleGroup || '').toLowerCase().trim();
    const name = (ex.name || '').toLowerCase();
    const key = (ex.exerciseKey || ex.exerciseId || '').toLowerCase();

    if (!group) {
      if (name.includes('chest') || name.includes('bench press') || name.includes('pushup') || name.includes('flye')) group = 'chest';
      else if (name.includes('back') || name.includes('row') || name.includes('pull') || name.includes('chin') || name.includes('lat ')) group = 'back';
      else if (name.includes('shoulder') || name.includes('press') || name.includes('raise') || name.includes('delt') || name.includes('lateral')) group = 'shoulders';
      else if (name.includes('leg') || name.includes('squat') || name.includes('calf') || name.includes('lung') || name.includes('deadlift') || name.includes('press')) group = 'legs';
      else if (name.includes('curl') || name.includes('bicep') || name.includes('tricep') || name.includes('arm') || name.includes('dip')) group = 'arms';
      else if (name.includes('abs') || name.includes('core') || name.includes('crunch') || name.includes('plank')) group = 'core';
    }

    if (group === 'arms') {
      if (name.includes('bicep') || key.includes('bicep') || name.includes('curl') || key.includes('curl') || name.includes('chin') || key.includes('chin')) hitGroups.add('Biceps');
      else if (name.includes('tricep') || key.includes('tricep') || name.includes('extension') || key.includes('extension') || name.includes('dip') || key.includes('dip') || name.includes('kickback') || key.includes('kickback') || name.includes('pressdown') || key.includes('pressdown')) hitGroups.add('Triceps');
      else hitGroups.add('Arms');
    } else if (group === 'chest') hitGroups.add('Chest');
    else if (group === 'back') hitGroups.add('Back');
    else if (group === 'shoulders') hitGroups.add('Shoulders');
    else if (group === 'legs') hitGroups.add('Legs');
    else if (group === 'core') hitGroups.add('Core');
    else if (group === 'stretching') hitGroups.add('Stretching');
  });

  const groupsArr = Array.from(hitGroups);
  if (groupsArr.length === 0) return 'Custom Session';

  const hasPush = groupsArr.some(g => ['Chest', 'Shoulders', 'Triceps'].includes(g));
  const hasPull = groupsArr.some(g => ['Back', 'Biceps'].includes(g));
  const hasLegs = groupsArr.includes('Legs');
  const hasCore = groupsArr.includes('Core');

  const pushCount = ['Chest', 'Shoulders', 'Triceps'].filter(g => groupsArr.includes(g)).length;
  const pullCount = ['Back', 'Biceps'].filter(g => groupsArr.includes(g)).length;

  if (pushCount === 3 && !hasPull && !hasLegs) return 'Push Workout';
  if (pullCount === 2 && !hasPush && !hasLegs) return 'Pull Workout';
  if (hasLegs && !hasPush && !hasPull) return 'Legs Workout';
  if (hasCore && groupsArr.length === 1) return 'Core Workout';

  if (groupsArr.length === 2) {
    const sorted = groupsArr.sort();
    return `${sorted[0]} & ${sorted[1]} Workout`;
  }
  if (groupsArr.length === 1) return `${groupsArr[0]} Workout`;
  if (hasPush && hasPull && hasLegs) return 'Full Body Workout';
  if (hasPush && hasPull && !hasLegs) return 'Upper Body Workout';

  const displayGroups = groupsArr.slice(0, 3).sort();
  return `${displayGroups.join(' & ')} Workout`;
}

module.exports = {
  deriveLevelFromXP,
  evaluateStreak,
  getBWEffectiveFraction,
  determineWorkoutName
};
