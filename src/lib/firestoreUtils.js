import { doc, updateDoc, setDoc, addDoc, collection, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { isBodyweightExercise } from '../stores/useWorkoutStore';

// ─── Sanitisation Helpers ──────────────────────────────────────────────────────

export const sanitizeString = (str, maxLength = 200) => {
  if (typeof str !== 'string') return '';
  return str.trim().substring(0, maxLength);
};

const stripHTML = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>&"']/g, '');
};

const sanitizeNumber = (num, isInt = false) => {
  const parsed = isInt ? parseInt(num, 10) : parseFloat(num);
  if (isNaN(parsed) || !isFinite(parsed)) return 0;
  return parsed;
};

const sanitizeArray = (arr, maxLen = 50) => {
  if (!Array.isArray(arr)) return [];
  const unique = [...new Set(arr)];
  return unique.slice(0, maxLen).map(item => (typeof item === 'string' ? sanitizeString(item) : item));
};

// ─── Whitelisted Fields for User Profiles ─────────────────────────────────────
const PROFILE_WHITELIST = [
  'userType', 'equipmentList', 'medicalFlags', 'name', 'onboardingComplete',
  'streak', 'streakLastDate', 'xp', 'level', 'levelName', 'badges', 'powerUps',
  'age', 'gender', 'heightCm', 'weightKg', 'workoutFrequency', 'sessionDuration',
  'dietType', 'currentSupplements', 'lastPrehabDate',
  'totalSessions', 'aura', 'activeTitle'
];

// Mapped XP sources from backend schema
const ALLOWED_XP_SOURCES = [
  'session_logged', 'pr_hit', 'challenge_mission', 'challenge_complete',
  'streak_3', 'streak_7', 'streak_30',
  'body_measurement', 'onboarding_complete', 'level_up_bonus', 'social_invite'
];

// ─── Main Utility Functions ───────────────────────────────────────────────────

/**
 * 1. Updates the user's profile document with sanitised and whitelisted data.
 */
export const updateUserProfile = async (uid, data) => {
  if (!uid || typeof uid !== 'string' || uid.trim() === '') {
    throw new Error('Validation Error: A valid, non-empty UID must be provided.');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Validation Error: Data payload must be an object.');
  }

  const sanitisedData = {};

  PROFILE_WHITELIST.forEach(key => {
    if (data[key] !== undefined) {
      if (Array.isArray(data[key])) {
        // Equipment lists can be large, medical flags are restricted
        const maxLen = key === 'equipmentList' ? 50 : 20;
        sanitisedData[key] = sanitizeArray(data[key], maxLen);
      } else if (typeof data[key] === 'number') {
        sanitisedData[key] = sanitizeNumber(data[key], ['age', 'streak', 'xp', 'level', 'workoutFrequency'].includes(key));
      } else if (typeof data[key] === 'string') {
        sanitisedData[key] = sanitizeString(data[key]);
      } else if (typeof data[key] === 'boolean') {
        sanitisedData[key] = data[key];
      } else if (typeof data[key] === 'object' && data[key] !== null) {
        // Deep-sanitize map fields like powerUps to prevent value injection.
        // Numeric fields are clamped to [0, 10] (max 10 of any power-up — no infinite stacking).
        // Only allow string and number values — reject nested objects or arrays.
        const sanitizedMap = {};
        Object.entries(data[key]).forEach(([k, v]) => {
          const cleanKey = sanitizeString(k, 50);
          if (!cleanKey) return;
          if (typeof v === 'number' && isFinite(v)) {
            sanitizedMap[cleanKey] = Math.max(0, Math.min(10, Math.floor(v)));
          } else if (typeof v === 'string') {
            sanitizedMap[cleanKey] = sanitizeString(v, 100);
          } else if (typeof v === 'boolean') {
            sanitizedMap[cleanKey] = v;
          }
          // Silently drop nested objects, arrays, NaN, Infinity
        });
        sanitisedData[key] = sanitizedMap;
      }
    }
  });

  try {
    await updateDoc(doc(db, 'users', uid), sanitisedData);
  } catch (err) {
    console.error('[firestoreUtils] updateUserProfile failed:', err);
    throw new Error('Update Failed: Unable to update user profile. Check connection.');
  }
};

/**
 * 2. Writes session details and individual exercises atomically using a Firestore Batch.
 */
export const writeSession = async (uid, sessionData, exercises) => {
  if (!uid || typeof uid !== 'string' || uid.trim() === '') {
    throw new Error('Validation Error: A valid, non-empty UID must be provided.');
  }
  if (!sessionData || typeof sessionData !== 'object') {
    throw new Error('Validation Error: Session data must be provided.');
  }
  if (!Array.isArray(exercises) || exercises.length === 0) {
    throw new Error('Validation Error: Exercises array cannot be empty.');
  }

  // Sanitise Session Data
  const sessionId = sanitizeString(sessionData.sessionId);
  if (!sessionId) {
    throw new Error('Validation Error: A valid session ID is required.');
  }

  const totalVolume = sanitizeNumber(sessionData.totalVolume);
  const xpEarned = sanitizeNumber(sessionData.xpEarned, true);

  if (totalVolume < 0) {
    throw new Error('Validation Error: Total volume cannot be negative.');
  }
  if (xpEarned < 0) {
    throw new Error('Validation Error: XP earned cannot be negative.');
  }

  const sanitisedSession = {
    sessionId,
    date: sessionData.date || serverTimestamp(),
    dateString: sanitizeString(sessionData.dateString || ''),
    moodTag: sanitizeString(sessionData.moodTag || 'average'),
    stomachFlag: Boolean(sessionData.stomachFlag),
    totalVolume,
    totalSets: sanitizeNumber(sessionData.totalSets, true),
    durationMinutes: sanitizeNumber(sessionData.durationMinutes, true),
    xpEarned,
  };

  const batch = writeBatch(db);

  // Set the primary session document
  const sessionRef = doc(db, 'users', uid, 'sessions', sessionId);
  batch.set(sessionRef, sanitisedSession);

  // Sanitise and set each exercise sub-document
  exercises.forEach(ex => {
    const exerciseId = sanitizeString(ex.exerciseId);
    if (!exerciseId) {
      throw new Error('Validation Error: Each exercise must have a valid ID.');
    }

    const rawName = sanitizeString(ex.name || '');
    const cleanName = stripHTML(rawName);
    if (!cleanName) {
      throw new Error('Validation Error: Exercise name cannot be empty or contain invalid characters.');
    }

    if (!Array.isArray(ex.sets) || ex.sets.length === 0) {
      throw new Error(`Validation Error: Sets array for exercise "${cleanName}" cannot be empty.`);
    }

    const sanitisedSets = ex.sets.map((s, idx) => {
      const isBW = s.weight === 'BW' || s.isBW === true;
      const weight = isBW ? 'BW' : sanitizeNumber(s.weight);
      const reps = sanitizeNumber(s.reps, true);
      // Fix: bodyweight exercises (weight='BW') are valid with weight=0.
      // Previously sanitizeNumber('BW') returned 0, then the <= 0 check threw,
      // crashing writeSession for ALL calisthenics exercises.
      if (!isBW && typeof weight === 'number' && weight <= 0) {
        throw new Error(`Validation Error: Weight must be greater than 0 (Exercise: ${cleanName}, Set: ${idx + 1}).`);
      }
      if (reps <= 0) {
        throw new Error(`Validation Error: Reps must be greater than 0 (Exercise: ${cleanName}, Set: ${idx + 1}).`);
      }
      return {
        weight,
        reps,
        done: Boolean(s.done),
      };
    });

    const sanitisedExercise = {
      exerciseId,
      name: cleanName,
      exerciseKey: sanitizeString(ex.exerciseKey || ''),
      muscleGroup: sanitizeString(ex.muscleGroup || ''),
      sets: sanitisedSets,
      volume: sanitizeNumber(ex.volume),
    };

    const exerciseRef = doc(db, 'users', uid, 'sessions', sessionId, 'exercises', exerciseId);
    batch.set(exerciseRef, sanitisedExercise);
  });

  try {
    await batch.commit();
  } catch (err) {
    console.error('[firestoreUtils] writeSession batch failed:', err);
    throw new Error('Commit Failed: Unable to save session documents atomically.');
  }
};

/**
 * 3. Sets or updates a Personal Record (PR) subcollection entry.
 */
export const updatePR = async (uid, exerciseKey, prData) => {
  if (!uid || typeof uid !== 'string' || uid.trim() === '') {
    throw new Error('Validation Error: A valid, non-empty UID must be provided.');
  }
  
  const cleanKey = sanitizeString(exerciseKey || '');
  if (!cleanKey || !/^[a-z0-9_]+$/.test(cleanKey)) {
    throw new Error('Validation Error: Exercise key must only contain lowercase alphanumeric characters and underscores.');
  }

  if (!prData || typeof prData !== 'object') {
    throw new Error('Validation Error: PR data must be an object.');
  }

  const isBW = isBodyweightExercise(cleanKey, cleanKey);
  const weight = prData.weight === 'BW' ? 'BW' : sanitizeNumber(prData.weight);
  const reps = sanitizeNumber(prData.reps, true);

  if (!isBW && typeof weight === 'number' && weight <= 0) {
    throw new Error('Validation Error: PR weight must be greater than 0.');
  }
  if (reps <= 0) {
    throw new Error('Validation Error: PR reps must be greater than 0.');
  }

  const sanitisedPR = {
    exerciseKey: cleanKey,
    exerciseName: stripHTML(sanitizeString(prData.exerciseName || '')),
    weight,
    reps,
    date: prData.date || serverTimestamp(),
  };

  if (prData.previousWeight !== undefined) {
    sanitisedPR.previousWeight = prData.previousWeight === 'BW' ? 'BW' : sanitizeNumber(prData.previousWeight);
  }

  try {
    const prRef = doc(db, 'users', uid, 'prs', cleanKey);
    await setDoc(prRef, sanitisedPR, { merge: true });
  } catch (err) {
    console.error('[firestoreUtils] updatePR failed:', err);
    throw new Error('PR Write Failed: Unable to record personal record.');
  }
};

/**
 * 4. Logs XP adjustments to the users/{uid}/xpLog subcollection.
 */
export const addXPLog = async (uid, source, amount, meta = {}) => {
  if (!uid || typeof uid !== 'string' || uid.trim() === '') {
    throw new Error('Validation Error: A valid, non-empty UID must be provided.');
  }

  const cleanSource = sanitizeString(source);
  if (!ALLOWED_XP_SOURCES.includes(cleanSource)) {
    throw new Error(`Validation Error: Invalid XP source "${cleanSource}".`);
  }

  const cleanAmount = sanitizeNumber(amount, true);
  if (cleanAmount <= 0) {
    throw new Error('Validation Error: XP log amount must be a positive integer.');
  }

  const logEntry = {
    source: cleanSource,
    amount: cleanAmount,
    timestamp: serverTimestamp(),
  };

  if (meta.sessionId) {
    logEntry.sessionId = sanitizeString(meta.sessionId);
  }
  if (meta.challengeId) {
    logEntry.challengeId = sanitizeString(meta.challengeId);
  }

  try {
    const logCol = collection(db, 'users', uid, 'xpLog');
    await addDoc(logCol, logEntry);
  } catch (err) {
    console.error('[firestoreUtils] addXPLog failed:', err);
    throw new Error('XP Log Failed: Unable to write XP log entry.');
  }
};

export const abbreviateExerciseName = (name) => {
  if (typeof name !== 'string') return '';
  return name
    .replace(/Barbell/gi, 'BB')
    .replace(/Dumbbell/gi, 'DB');
};

export const determineWorkoutName = (exercises) => {
  if (!exercises || exercises.length === 0) return 'Custom Session';

  // Filter exercises with at least one completed/done set
  const completedExs = exercises.filter(ex => 
    ex.sets && ex.sets.some(s => s.done || s.completed)
  );

  if (completedExs.length === 0) return 'Custom Session';

  // Map each completed exercise to a normalized muscle group name
  const hitGroups = new Set();
  completedExs.forEach(ex => {
    let group = (ex.muscleGroup || '').toLowerCase().trim();
    const name = (ex.name || '').toLowerCase();
    const key = (ex.exerciseKey || ex.exerciseId || '').toLowerCase();

    if (!group) {
      // Try to infer from name or key
      if (name.includes('chest') || name.includes('bench press') || name.includes('pushup') || name.includes('flye')) {
        group = 'chest';
      } else if (name.includes('back') || name.includes('row') || name.includes('pull') || name.includes('chin') || name.includes('lat ')) {
        group = 'back';
      } else if (name.includes('shoulder') || name.includes('press') || name.includes('raise') || name.includes('delt') || name.includes('lateral')) {
        group = 'shoulders';
      } else if (name.includes('leg') || name.includes('squat') || name.includes('calf') || name.includes('lung') || name.includes('deadlift') || name.includes('press')) {
        group = 'legs';
      } else if (name.includes('curl') || name.includes('bicep') || name.includes('tricep') || name.includes('arm') || name.includes('dip')) {
        group = 'arms';
      } else if (name.includes('abs') || name.includes('core') || name.includes('crunch') || name.includes('plank')) {
        group = 'core';
      }
    }

    if (group === 'arms') {
      if (name.includes('bicep') || key.includes('bicep') || name.includes('curl') || key.includes('curl') || name.includes('chin') || key.includes('chin')) {
        hitGroups.add('Biceps');
      } else if (name.includes('tricep') || key.includes('tricep') || name.includes('extension') || key.includes('extension') || name.includes('dip') || key.includes('dip') || name.includes('kickback') || key.includes('kickback') || name.includes('pressdown') || key.includes('pressdown')) {
        hitGroups.add('Triceps');
      } else {
        hitGroups.add('Arms');
      }
    } else if (group === 'chest') {
      hitGroups.add('Chest');
    } else if (group === 'back') {
      hitGroups.add('Back');
    } else if (group === 'shoulders') {
      hitGroups.add('Shoulders');
    } else if (group === 'legs') {
      hitGroups.add('Legs');
    } else if (group === 'core') {
      hitGroups.add('Core');
    } else if (group === 'stretching') {
      hitGroups.add('Stretching');
    }
  });

  const groupsArr = Array.from(hitGroups);
  if (groupsArr.length === 0) return 'Custom Session';

  const hasPush = groupsArr.some(g => ['Chest', 'Shoulders', 'Triceps'].includes(g));
  const hasPull = groupsArr.some(g => ['Back', 'Biceps'].includes(g));
  const hasLegs = groupsArr.includes('Legs');
  const hasCore = groupsArr.includes('Core');

  const pushCount = ['Chest', 'Shoulders', 'Triceps'].filter(g => groupsArr.includes(g)).length;
  const pullCount = ['Back', 'Biceps'].filter(g => groupsArr.includes(g)).length;

  if (pushCount === 3 && !hasPull && !hasLegs) {
    return 'Push Workout';
  }
  if (pullCount === 2 && !hasPush && !hasLegs) {
    return 'Pull Workout';
  }
  if (hasLegs && !hasPush && !hasPull) {
    return 'Legs Workout';
  }
  if (hasCore && groupsArr.length === 1) {
    return 'Core Workout';
  }

  // Handle 2 groups
  if (groupsArr.length === 2) {
    const sorted = groupsArr.sort();
    return `${sorted[0]} & ${sorted[1]} Workout`;
  }

  // Handle 1 group
  if (groupsArr.length === 1) {
    return `${groupsArr[0]} Workout`;
  }

  // Handle upper/full body
  if (hasPush && hasPull && hasLegs) {
    return 'Full Body Workout';
  }
  if (hasPush && hasPull && !hasLegs) {
    return 'Upper Body Workout';
  }

  const displayGroups = groupsArr.slice(0, 3).sort();
  return `${displayGroups.join(' & ')} Workout`;
};
