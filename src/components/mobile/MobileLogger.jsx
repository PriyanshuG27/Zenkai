import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Zap, Minus, BatteryLow, Plus, Trash2 } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/useAuthStore';
import { useWorkoutStore, isBodyweightExercise, getEstimated1RM } from '../../stores/useWorkoutStore';
import { useWorkoutLogger } from '../../hooks/useWorkoutLogger';
import { useWorkoutTimer } from '../../hooks/useWorkoutTimer';
import { useToast } from '../../hooks/useToast';
import { SetRow } from '../shared/SetRow';
import { ExerciseSearch } from '../shared/ExerciseSearch';
import { MobileSessionComplete } from './MobileSessionComplete';

export const MobileLogger = () => {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const { user, profile } = useAuthStore();
  const { toast } = useToast();
  
  const {
    activeSession,
    exercises,
    startSession,
    addExercise,
    updateSet,
    markSetDone,
    addSet,
    removeSet,
    removeExercise,
  } = useWorkoutStore();

  const {
    finishSession,
    resetSession,
  } = useWorkoutLogger();
  const { formattedTime } = useWorkoutTimer();

  // Local state for setup
  const [selectedMood, setSelectedMood] = useState('average');
  const [stomachFlag, setStomachFlag] = useState(false);

  // Bottom sheet + session-complete state
  const [isEndSheetOpen, setIsEndSheetOpen] = useState(false);
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [localError, setLocalError]       = useState(null);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [finishError, setFinishError]       = useState(null);
  const [retryCount, setRetryCount]         = useState(0);

  // PR Mapping fetched from Firestore for highlighting PRs in SetRows
  const [prsMap, setPrsMap] = useState({});

  const isActive = !!activeSession;

  // Fetch lifetime Personal Records on mount to display badges next to sets
  useEffect(() => {
    if (!user) return;
    const fetchPRs = async () => {
      try {
        const prsRef = collection(db, 'users', user.uid, 'prs');
        const prsSnap = await getDocs(prsRef);
        const mapping = {};
        prsSnap.docs.forEach((docSnap) => {
          mapping[docSnap.id] = docSnap.data();
        });
        setPrsMap(mapping);
      } catch (err) {
        console.error('[MobileLogger] Error fetching PRs:', err);
      }
    };
    fetchPRs();
  }, [user, isActive]);

  // Compute live stats for the end confirmation sheet
  const totalSetsCount = useMemo(() => {
    return exercises.reduce(
      (sum, ex) => sum + ex.sets.filter((s) => s.completed || s.done).length,
      0
    );
  }, [exercises]);

  const totalVolume = useMemo(() => {
    return exercises.reduce(
      (sum, ex) =>
        sum +
        ex.sets
          .filter((s) => s.completed || s.done)
          .reduce(
            (sSum, s) =>
              sSum + (parseFloat(s.weight) || 0) * (parseInt(s.reps, 10) || 0),
            0
          ),
      0
    );
  }, [exercises]);

  // Check if a specific set beats the user's PR database record
  const checkIfSetIsPR = (exerciseId, setRow) => {
    const isCompleted = setRow.completed || setRow.done;
    if (!isCompleted) return false;

    // 1. Get the current exercise from active state
    const exercise = exercises.find((ex) => ex.exerciseId === exerciseId);
    if (!exercise) return false;

    const exerciseKey = exercise.exerciseKey ?? exercise.exerciseId;
    const isBW = isBodyweightExercise(exerciseKey, exerciseId);
    const weight = setRow.weight === 'BW' ? 0 : (parseFloat(setRow.weight) || 0);
    const reps = parseInt(setRow.reps, 10) || 0;
    if (reps <= 0) return false;

    // Bodyweight exercises are allowed with weight 0/BW
    if (!isBW && weight <= 0) return false;

    const userBodyweight = parseFloat(profile?.weightKg) || 75;
    const current1RM = getEstimated1RM(weight, reps, isBW, userBodyweight);

    const completedSets = exercise.sets.filter((s) => s.completed || s.done);
    if (completedSets.length === 0) return false;

    let maxSession1RM = 0;
    completedSets.forEach((s) => {
      const sWeight = s.weight === 'BW' ? 0 : (parseFloat(s.weight) || 0);
      const sReps = parseInt(s.reps, 10) || 0;
      const s1RM = getEstimated1RM(sWeight, sReps, isBW, userBodyweight);
      if (s1RM > maxSession1RM) {
        maxSession1RM = s1RM;
      }
    });

    // Only the best set in the current session can be marked as a PR
    if (current1RM < maxSession1RM) return false;

    // 2. Compare against the existing database record (fetched in prsMap)
    const cleanKey = exerciseKey ? exerciseKey.split('_')[0] : '';
    const existingPR = prsMap[cleanKey] || prsMap[exerciseKey] || prsMap[exerciseId];
    if (!existingPR) return true; // first time performing beats no PR

    const existing1RM = getEstimated1RM(
      existingPR.weight === 'BW' ? 0 : (parseFloat(existingPR.weight) || 0),
      parseInt(existingPR.reps, 10) || 0,
      isBW,
      userBodyweight
    );

    return current1RM > existing1RM;
  };

  // ─── Actions ───────────────────────────────────────────────────────────────

  const handleUpdateSet = useCallback((exerciseId, setIndex, field, val) => {
    updateSet(exerciseId, setIndex, field, val);
  }, [updateSet]);

  const handleMarkSetDone = useCallback((exerciseId, setIndex) => {
    markSetDone(exerciseId, setIndex);
  }, [markSetDone]);

  const handleRemoveSet = useCallback((exerciseIndex, setIndex) => {
    removeSet(exerciseIndex, setIndex);
  }, [removeSet]);

  const handleAddExercise = useCallback((exercise) => {
    addExercise(exercise);
  }, [addExercise]);

  const handleStartSession = () => {
    startSession(selectedMood, stomachFlag);
  };

  const handleEndTap = () => {
    if (exercises.length === 0) {
      toast('Add at least one exercise', 'error');
      return;
    }
    setLocalError(null);
    setIsEndSheetOpen(true);
  };

  const handleFinishSession = useCallback(async () => {
    if (!user?.uid) return;
    setIsSubmitting(true);
    setLocalError(null);
    setFinishError(null);
    try {
      const summary = await finishSession(user.uid);
      setIsEndSheetOpen(false);
      setSessionSummary(summary);
    } catch (err) {
      const newRetry = retryCount + 1;
      setRetryCount(newRetry);
      setFinishError(err.message ?? 'Failed to save session.');
      setLocalError(
        newRetry >= 3
          ? 'Session saved locally — will sync when connection returns.'
          : 'Could not save. Tap "Finish Session" to retry.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [user, finishSession, retryCount]);

  const handleDiscard = useCallback(() => {
    resetSession();
    setIsEndSheetOpen(false);
    navigate('/home');
  }, [resetSession, navigate]);

  // Framer Motion Animation Variants respecting prefers-reduced-motion
  const sheetVariants = {
    hidden: shouldReduceMotion ? { opacity: 0 } : { y: '100%' },
    visible: shouldReduceMotion
      ? { opacity: 1 }
      : { y: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } },
  };

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  if (sessionSummary) {
    return (
      <MobileSessionComplete
        summary={sessionSummary}
        error={finishError}
        retryCount={retryCount}
        onRetry={handleFinishSession}
      />
    );
  }

  return (
    <div className="relative w-full h-[100dvh] bg-[var(--bg-oled)] text-[var(--text-primary)] flex flex-col overflow-hidden">
      
      {/* ── SECTION 1: SESSION SETUP SHEET (shown when !isActive) ──────────────── */}
      <AnimatePresence>
        {!isActive && (
          <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black/80">
            {/* Visual Aurora mesh blob gradient in background */}
            <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-[var(--primary)]/10 blur-[80px] pointer-events-none select-none" />
            <div className="absolute top-[40%] left-1/3 w-64 h-64 rounded-full bg-[var(--secondary)]/10 blur-[90px] pointer-events-none select-none" />

            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none pb-[35dvh]">
              <h2 className="font-display text-4xl font-extrabold uppercase text-white tracking-widest drop-shadow-[0_0_12px_var(--primary-glow)]">
                Ready to train?
              </h2>
              <p className="text-[var(--text-secondary)] font-body text-sm mt-2 max-w-xs">
                Log your workout sets, track progress, and level up your stats.
              </p>
            </div>

            {/* Bottom Setup Sheet */}
            <motion.div
              variants={sheetVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="relative w-full bg-[var(--bg-surface)] border-t border-[var(--border-bright)] rounded-t-3xl p-6 z-50 shrink-0"
              style={{
                boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.5)',
                paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
              }}
            >
              {/* Sheet Drag Handle Visual Indicator */}
              <div className="w-12 h-1 bg-[var(--border-bright)] rounded-full mx-auto mb-6" />

              <h3 className="font-display font-bold text-2xl uppercase tracking-wide text-[var(--text-primary)] mb-4">
                How are you feeling?
              </h3>

              {/* Mood Selector Grid */}
              <div className="grid grid-cols-3 gap-2.5 mb-6">
                {[
                  { tag: 'locked_in', label: 'Locked In', Icon: Zap },
                  { tag: 'average', label: 'Average', Icon: Minus },
                  { tag: 'low_energy', label: 'Low Energy', Icon: BatteryLow },
                ].map(({ tag, label, Icon }) => {
                  const isSelected = selectedMood === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setSelectedMood(tag)}
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all cursor-pointer select-none ${
                        isSelected
                          ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary-glow)] shadow-[4px_4px_0px_rgba(255,92,0,0.15)]'
                          : 'border-[var(--border)] text-[var(--text-secondary)] bg-[var(--bg-input)] hover:border-[var(--border-bright)]'
                      }`}
                      style={{ minHeight: '88px', minWidth: '44px' }}
                    >
                      <Icon size={22} className="mb-2" />
                      <span className="font-body text-xs font-semibold tracking-wider">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Stomach Flag Toggle */}
              <div className="mb-6">
                <label className="flex items-center gap-3 cursor-pointer min-h-[44px] py-1 select-none">
                  <input
                    type="checkbox"
                    checked={stomachFlag}
                    onChange={(e) => setStomachFlag(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className={`w-11 h-6 rounded-full p-1 transition-colors duration-200 border border-[var(--border-bright)] ${
                      stomachFlag ? 'bg-[var(--primary)]' : 'bg-[var(--bg-input)]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                        stomachFlag ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                  <span className="font-body text-sm font-medium text-[var(--text-primary)]">
                    Body feeling off?
                  </span>
                </label>
              </div>

              {/* Let's Go Primary CTA */}
              <button
                type="button"
                onClick={handleStartSession}
                className="w-full h-12 bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-white font-body font-bold text-sm tracking-widest uppercase rounded-xl flex items-center justify-center transition-colors cursor-pointer select-none shadow-[0_4px_12px_var(--primary-glow)]"
                style={{ minHeight: '44px' }}
              >
                Let's Go →
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── SECTION 2: ACTIVE LOGGER (shown when isActive) ───────────────────── */}
      {isActive && (
        <>
          {/* HEADER (fixed, 56px) */}
          <header className="flex items-center justify-between h-14 border-b border-[var(--border)] bg-[var(--bg-base)] px-4 shrink-0 z-10 select-none">
            <button
              type="button"
              onClick={() => setIsEndSheetOpen(true)}
              aria-label="Cancel or abort workout session"
              className="w-11 h-11 flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer focus:outline-none"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <X size={20} />
            </button>

            {/* Session Timer */}
            <div className="font-mono text-xl font-bold tracking-widest text-[var(--text-primary)]">
              {formattedTime}
            </div>

            {/* END Text Button */}
            <button
              type="button"
              onClick={handleEndTap}
              className="h-11 flex items-center justify-center font-body text-sm font-extrabold text-[var(--primary)] px-4 hover:bg-[var(--primary-glow)] rounded-lg transition-colors cursor-pointer focus:outline-none"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              END
            </button>
          </header>

          {/* MAIN SCROLL AREA */}
          <main className="flex-1 overflow-y-auto px-4 py-4 pb-36">
            {exercises.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[40vh] text-center p-6 border border-dashed border-[var(--border)] rounded-2xl select-none">
                <span className="text-[var(--text-secondary)] font-body text-sm">
                  No exercises added yet.
                </span>
                <span className="text-[var(--text-muted)] font-body text-xs mt-1">
                  Use the search bar below to add an exercise and start logging.
                </span>
              </div>
            ) : (
              exercises.map((ex, exIndex) => (
                <div
                  key={ex.exerciseId}
                  className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-4 mb-4"
                >
                  {/* Exercise Header */}
                  <div className="flex items-start justify-between mb-4 select-none">
                    <div className="flex-1 min-w-0 pr-2">
                      <h4 className="font-body font-bold text-base text-[var(--text-primary)] leading-tight">
                        {ex.name}
                      </h4>
                      <span className="inline-block mt-1 font-body text-[10px] font-bold text-[var(--text-secondary)] bg-[var(--bg-elevated)] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        {ex.muscleGroup}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeExercise(ex.exerciseId)}
                      aria-label={`Remove exercise ${ex.name}`}
                      className="w-11 h-11 flex items-center justify-center text-[var(--text-secondary)] hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors cursor-pointer focus:outline-none"
                      style={{ minWidth: '44px', minHeight: '44px' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Column Headers */}
                  {ex.sets.length > 0 && (
                    <div className="flex items-center justify-between w-full px-1 mb-1 text-[10px] font-bold text-[var(--text-secondary)]/50 uppercase tracking-widest select-none">
                      <div className="w-6 text-left">Set</div>
                      <div className="w-[96px] text-center">Weight</div>
                      <div className="w-[88px] text-center">Reps</div>
                      <div className="w-[104px] flex items-center justify-between pl-2">
                        <span className="w-8 text-left">Done</span>
                        <span className="w-10 text-center">PR</span>
                        <span className="w-6 text-right"></span>
                      </div>
                    </div>
                  )}

                  {/* List of SetRows */}
                  <div className="flex flex-col mb-4">
                    {ex.sets.map((s, setIndex) => (
                      <SetRow
                        key={setIndex}
                        exerciseId={ex.exerciseId}
                        setIndex={setIndex}
                        set={s}
                        exerciseIndex={exIndex}
                        isBodyweight={isBodyweightExercise(ex.exerciseKey, ex.exerciseId)}
                        onUpdate={handleUpdateSet}
                        onDone={handleMarkSetDone}
                        isPR={checkIfSetIsPR(ex.exerciseId, s)}
                        onDelete={ex.sets.length > 1 ? handleRemoveSet : null}
                      />
                    ))}
                  </div>

                  {/* Add Set Row */}
                  <button
                    type="button"
                    onClick={() => addSet(exIndex)}
                    className="w-full flex items-center justify-center gap-2 border border-dashed border-[var(--border)] hover:border-[var(--primary)]/50 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer focus:outline-none"
                    style={{ height: '44px', minHeight: '44px' }}
                  >
                    <Plus size={16} />
                    <span className="font-body text-xs font-semibold uppercase tracking-wider">
                      Add Set
                    </span>
                  </button>
                </div>
              ))
            )}
          </main>

          {/* STICKY EXERCISE SEARCH */}
          <div
            className="fixed bottom-0 left-0 right-0 z-30 bg-[var(--bg-surface)] border-t border-[var(--border)] px-4 py-3 shrink-0"
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
          >
            <ExerciseSearch
              label="Add Exercise"
              dropUp={true}
              onSelect={handleAddExercise}
            />
          </div>

          {/* ── SECTION 3: END SESSION CONFIRMATION SHEET ────────────────────── */}
          <AnimatePresence>
            {isEndSheetOpen && (
              <div className="absolute inset-0 z-50 flex flex-col justify-end">
                {/* Backdrop Overlay */}
                <motion.div
                  variants={backdropVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  onClick={() => !isSubmitting && setIsEndSheetOpen(false)}
                  className="absolute inset-0 bg-black/70 cursor-pointer"
                />

                {/* Bottom Sheet */}
                <motion.div
                  variants={sheetVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  className="relative w-full bg-[var(--bg-surface)] border-t border-[var(--border-bright)] rounded-t-3xl p-6 z-10 shrink-0"
                  style={{
                    boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.5)',
                    paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
                  }}
                >
                  <div className="w-12 h-1 bg-[var(--border-bright)] rounded-full mx-auto mb-6" />

                  <h3 className="font-display font-bold text-2xl uppercase tracking-wide text-[var(--text-primary)] mb-6 text-center">
                    End Session?
                  </h3>

                  {/* Live Stats Grid */}
                  <div className="grid grid-cols-2 gap-3 mb-6 select-none">
                    <div className="bg-[var(--bg-input)] p-3.5 rounded-xl border border-[var(--border)]">
                      <span className="block font-body text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">
                        Exercises
                      </span>
                      <span className="font-mono text-xl font-bold text-[var(--text-primary)]">
                        {exercises.length}
                      </span>
                    </div>
                    <div className="bg-[var(--bg-input)] p-3.5 rounded-xl border border-[var(--border)]">
                      <span className="block font-body text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">
                        Sets Done
                      </span>
                      <span className="font-mono text-xl font-bold text-[var(--text-primary)]">
                        {totalSetsCount}
                      </span>
                    </div>
                    <div className="bg-[var(--bg-input)] p-3.5 rounded-xl border border-[var(--border)] col-span-1">
                      <span className="block font-body text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">
                        Volume
                      </span>
                      <span className="font-mono text-xl font-bold text-[var(--text-primary)]">
                        {totalVolume} <span className="text-xs text-[var(--text-secondary)]">kg</span>
                      </span>
                    </div>
                    <div className="bg-[var(--bg-input)] p-3.5 rounded-xl border border-[var(--border)] col-span-1">
                      <span className="block font-body text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">
                        Duration
                      </span>
                      <span className="font-mono text-xl font-bold text-[var(--text-primary)]">
                        {formattedTime}
                      </span>
                    </div>
                  </div>

                  {/* Inline Error Announcement */}
                  {localError && (
                    <div className="text-red-500 font-body text-xs font-semibold text-center mb-4 leading-relaxed bg-red-500/10 p-2.5 rounded-xl border border-red-500/20">
                      {localError}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleFinishSession}
                      className="w-full h-12 bg-[var(--primary)] disabled:bg-[var(--primary)]/50 hover:bg-[var(--primary)]/90 text-white font-body font-bold text-sm tracking-widest uppercase rounded-xl flex items-center justify-center transition-colors cursor-pointer select-none shadow-[0_4px_12px_var(--primary-glow)] disabled:cursor-not-allowed"
                      style={{ minHeight: '44px' }}
                    >
                      {isSubmitting ? (
                        <div className="flex items-center gap-2">
                          <svg
                            className="animate-spin h-4 w-4 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          <span>Finishing...</span>
                        </div>
                      ) : (
                        <span>Finish Session</span>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setIsEndSheetOpen(false)}
                      className="w-full h-12 font-body font-bold text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] uppercase tracking-wider transition-colors cursor-pointer select-none flex items-center justify-center focus:outline-none"
                      style={{ minHeight: '44px' }}
                    >
                      Keep Going
                    </button>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleDiscard}
                      className="w-full h-10 font-body font-bold text-xs text-red-500 hover:text-red-400 uppercase tracking-wider transition-colors cursor-pointer select-none flex items-center justify-center focus:outline-none"
                      style={{ minHeight: '44px' }}
                    >
                      Discard Session
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
};
