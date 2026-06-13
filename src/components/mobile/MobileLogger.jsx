import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Zap, Minus, BatteryLow, Plus, Trash2, Volume2, VolumeX } from 'lucide-react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/useAuthStore';
import { useWorkoutStore, isBodyweightExercise, getEstimated1RM } from '../../stores/useWorkoutStore';
import { useWorkoutLogger } from '../../hooks/useWorkoutLogger';
import { useWorkoutTimer } from '../../hooks/useWorkoutTimer';
import { useToast } from '../../hooks/useToast';
import { SetRow } from '../shared/SetRow';
import { ExerciseSearch } from '../shared/ExerciseSearch';
import { MobileSessionComplete } from './MobileSessionComplete';
import { parseWorkoutText } from '../../utils/nlpParser';
import { playRestTimerBeep } from '../../utils/audioBeep';
import { NeubrutalistCalendar } from '../shared/NeubrutalistCalendar';
import { callZenkaiAPI } from '../../lib/apiClient';
import { isPushEnabled } from '../../hooks/useFCM';

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
    updateExerciseRestTimer,
    isOverdrive,
  } = useWorkoutStore();

  const {
    finishSession,
    resetSession,
  } = useWorkoutLogger();
  const { formattedTime } = useWorkoutTimer();

  // Local state for setup
  const [selectedMood, setSelectedMood] = useState('average');
  const [stomachFlag, setStomachFlag] = useState(false);

  // Debrief flags state for AI Coach loop
  const [debriefPain, setDebriefPain] = useState([]);
  const [debriefEasy, setDebriefEasy] = useState([]);
  const [debriefBroken, setDebriefBroken] = useState([]);

  const toggleDebriefFlag = useCallback((type, exerciseKey) => {
    if (type === 'pain') {
      setDebriefPain((prev) =>
        prev.includes(exerciseKey) ? prev.filter((k) => k !== exerciseKey) : [...prev, exerciseKey]
      );
    } else if (type === 'easy') {
      setDebriefEasy((prev) =>
        prev.includes(exerciseKey) ? prev.filter((k) => k !== exerciseKey) : [...prev, exerciseKey]
      );
    } else if (type === 'broken') {
      setDebriefBroken((prev) =>
        prev.includes(exerciseKey) ? prev.filter((k) => k !== exerciseKey) : [...prev, exerciseKey]
      );
    }
  }, []);

  // Natural Language Dictation parser state
  const [nlpInput, setNlpInput] = useState('');
  const [parsedNLPResult, setParsedNLPResult] = useState(null);

  // Rest Timer state
  const [restTimeRemaining, setRestTimeRemaining] = useState(null);
  const [restTimerEndTimestamp, setRestTimerEndTimestamp] = useState(null);
  const [isTimerMuted, setIsTimerMuted] = useState(() => localStorage.getItem('zenkai_mute_rest_sound') === 'true');

  // Bottom sheet + session-complete state
  const [isEndSheetOpen, setIsEndSheetOpen] = useState(false);
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [localError, setLocalError]       = useState(null);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [finishError, setFinishError]       = useState(null);
  const [retryCount, setRetryCount]         = useState(0);

  // PR Mapping fetched from Firestore for highlighting PRs in SetRows
  const [prsMap, setPrsMap] = useState({});

  const completedExercises = useMemo(() => {
    return exercises.filter((ex) => ex.sets?.some((s) => s.done || s.completed));
  }, [exercises]);

  const isActive = !!activeSession;

  // Past sessions for repeating workouts calendar
  const [pastSessions, setPastSessions] = useState([]);
  const [loadingPastSessions, setLoadingPastSessions] = useState(true);

  // Fetch past session METADATA only on mount — exercises are lazy-loaded by the calendar
  // on cell click to avoid 60 serial subcollection reads on every page load.
  useEffect(() => {
    if (!user || isActive) return;
    const fetchPastSessions = async () => {
      setLoadingPastSessions(true);
      try {
        const sessionsRef = collection(db, 'users', user.uid, 'sessions');
        // Retrieve last 60 session headers (metadata only — no exercises subcollection)
        const q = query(sessionsRef, orderBy('date', 'desc'), limit(60));
        const snap = await getDocs(q);
        const temp = snap.docs.map((docSnap) => {
          const sessData = docSnap.data();
          const rawDate = sessData.date;
          let resolvedDate = new Date();
          if (rawDate) {
            if (rawDate.toDate) resolvedDate = rawDate.toDate();
            else if (rawDate.seconds) resolvedDate = new Date(rawDate.seconds * 1000);
            else resolvedDate = new Date(rawDate);
          }
          return {
            id: docSnap.id,
            ...sessData,
            date: resolvedDate,
            // exercises is intentionally omitted here — fetched lazily on calendar tap
            exercises: sessData.exercises ?? [], // inline exercises if stored (desktop format)
            source: sessData.source ?? 'mobile',
          };
        });
        setPastSessions(temp);
      } catch (err) {
        console.error('[MobileLogger] Error fetching past sessions:', err);
      } finally {
        setLoadingPastSessions(false);
      }
    };
    fetchPastSessions();
  }, [user, isActive]);

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

  const updateActivePresence = useCallback(async (status) => {
    if (!user?.uid) return;
    
    try {
      const { collection, query, where, getDocs, doc, setDoc, deleteDoc, serverTimestamp } = await import('firebase/firestore');
      const q = query(
        collection(db, 'shared_squads'),
        where('memberUids', 'array-contains', user.uid)
      );
      const snap = await getDocs(q);
      if (snap.empty) return;

      const promises = snap.docs.map(sdoc => {
        const squadCode = sdoc.id;
        const presenceRef = doc(db, 'shared_squads', squadCode, 'presence', user.uid);
        if (status === 'active') {
          return setDoc(presenceRef, {
            status: 'active',
            name: profile?.name || 'Anonymous Bro',
            updatedAt: serverTimestamp()
          });
        } else {
          return deleteDoc(presenceRef);
        }
      });
      await Promise.all(promises);
    } catch (err) {
      console.error('[MobileLogger] Failed to update presence:', err);
    }
  }, [user?.uid, profile?.name]);

  useEffect(() => {
    if (isActive && activeSession && !activeSession.isQuickLog) {
      updateActivePresence('active');
    }
    return () => {
      if (user?.uid) {
        updateActivePresence('inactive');
      }
    };
  }, [isActive, activeSession?.isQuickLog, updateActivePresence, user?.uid]);

  // ─── Screen Wake Lock API ──────────────────────────────────────────────────
  const wakeLockRef = React.useRef(null);

  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator && isActive) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('[WakeLock] Screen Wake Lock acquired.');
      } catch (err) {
        console.warn('[WakeLock] Failed to acquire screen wake lock:', err.message);
      }
    }
  }, [isActive]);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('[WakeLock] Screen Wake Lock released.');
      } catch (err) {
        console.warn('[WakeLock] Failed to release screen wake lock:', err.message);
      }
    }
  }, []);

  // Request wake lock on session start/stop
  useEffect(() => {
    if (isActive) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
    return () => {
      releaseWakeLock();
    };
  }, [isActive, requestWakeLock, releaseWakeLock]);

  // Re-acquire lock if user returns to app (visibilitychange or window focus)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isActive) {
        console.log('[WakeLock] Tab visibility returned. Re-acquiring screen lock...');
        await requestWakeLock();
      }
    };

    const handleFocus = async () => {
      if (isActive) {
        console.log('[WakeLock] Window focused. Re-acquiring screen lock...');
        await requestWakeLock();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isActive, requestWakeLock]);

  // Request notification permissions for rest timer alerts on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch((err) =>
        console.error('Error requesting notification permission:', err)
      );
    }
  }, []);

  // ─── Rest Timer Background Countdown ───────────────────────────────────────
  useEffect(() => {
    if (!restTimerEndTimestamp) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((restTimerEndTimestamp - Date.now()) / 1000));
      setRestTimeRemaining(remaining);

      if (remaining <= 0) {
        setRestTimerEndTimestamp(null);
        setRestTimeRemaining(null);
        if (localStorage.getItem('zenkai_mute_rest_sound') !== 'true') {
          playRestTimerBeep();
        }

        // 1. Vibrate device (vibrate, pause, vibrate)
        if (navigator.vibrate) {
          navigator.vibrate([300, 100, 300]);
        }

        // 2. Trigger Push Notification
        if ('Notification' in window && Notification.permission === 'granted') {
          // If we are in the foreground, show the local notification.
          // If we are in the background, only show it if FCM is NOT enabled.
          const shouldShowLocal = document.visibilityState === 'visible' || !isPushEnabled();
          if (shouldShowLocal) {
            const title = 'Zenkai Rest Timer';
            const options = {
              body: 'Rest over! Time for your next set. 💪',
              icon: '/logos/zenkai_app_icon.webp',
              tag: 'zenkai-rest-timer',
              requireInteraction: true,
              vibrate: [300, 100, 300]
            };

            try {
              // Standard window Notification constructor (Desktop)
              new Notification(title, options);
            } catch (err) {
              // Mobile PWA fallback (Safari iOS/Chrome Android)
              if (navigator.serviceWorker) {
                navigator.serviceWorker.ready.then((reg) => {
                  reg.showNotification(title, options);
                }).catch((swErr) => {
                  console.error('Service worker notification failed:', swErr);
                });
              } else {
                console.error('Standard notification failed and no service worker found:', err);
              }
            }
          }
        }

        toast('🔔 Rest over! Time for your next set.', 'success');
      }
    }, 500);

    return () => clearInterval(interval);
  }, [restTimerEndTimestamp, toast]);

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
    const ex = exercises.find((e) => e.exerciseId === exerciseId);
    const setRow = ex?.sets[setIndex];
    const wasAlreadyDone = setRow?.done || setRow?.completed;

    const success = markSetDone(exerciseId, setIndex);
    if (success && !wasAlreadyDone) {
      if (profile?.disableRestTimer) {
        return;
      }
      // Find the exercise and read its custom restTimer (default to 90)
      const duration = ex?.restTimer ?? 90;
      setRestTimerEndTimestamp(Date.now() + duration * 1000);
      setRestTimeRemaining(duration);
      toast(`Rest timer started: ${duration}s ⏳`, 'info');

      // Schedule background push notification on the backend
      if (isPushEnabled()) {
        callZenkaiAPI('scheduleRestNotification', { seconds: duration }).catch(err => {
          console.warn('[RestTimer] Failed to schedule background rest notification:', err);
        });
      }
    }
  }, [markSetDone, exercises, toast, profile?.disableRestTimer]);

  const handleRemoveSet = useCallback((exerciseIndex, setIndex) => {
    removeSet(exerciseIndex, setIndex);
  }, [removeSet]);

  const handleAddExercise = useCallback((exercise) => {
    addExercise(exercise);
  }, [addExercise]);

  const handleConfirmNLPAdd = useCallback(() => {
    if (!parsedNLPResult) return;
    addExercise({
      key: parsedNLPResult.exerciseKey,
      name: parsedNLPResult.name,
      muscleGroup: parsedNLPResult.muscleGroup,
      sets: parsedNLPResult.sets,
    });
    setNlpInput('');
    setParsedNLPResult(null);
    toast(`Added ${parsedNLPResult.name}!`, 'info');
  }, [parsedNLPResult, addExercise, toast]);

  // Ref to hold the debounce timer for the NLP parser.
  // setNlpInput is called instantly so the text field always feels responsive.
  // parseWorkoutText (which scans ~400 exercises in exercises.json) is
  // deferred by 150ms — only fires when the user pauses typing.
  const nlpDebounceRef = useRef(null);

  const handleNLPChange = (e) => {
    const val = e.target.value;
    // Update the visible input instantly — zero lag on the keyboard
    setNlpInput(val);

    // Clear previous debounce timer
    if (nlpDebounceRef.current) clearTimeout(nlpDebounceRef.current);

    if (!val.trim()) {
      setParsedNLPResult(null);
      return;
    }

    // Defer the heavy exercise-bank scan until typing pauses
    nlpDebounceRef.current = setTimeout(() => {
      const result = parseWorkoutText(val);
      setParsedNLPResult(result);
    }, 150);
  };

  const handleRepeatWorkout = async (pastSess) => {
    try {
      // 1. Fetch the full exercises subcollection of this past session
      let exercisesList = [];
      if (pastSess.exercises && Array.isArray(pastSess.exercises) && pastSess.exercises.length > 0) {
        exercisesList = pastSess.exercises;
      } else {
        const exSnap = await getDocs(collection(db, 'users', user.uid, 'sessions', pastSess.id, 'exercises'));
        exercisesList = exSnap.docs.map(exDoc => exDoc.data());
      }
      
      // 2. Start session
      startSession(pastSess.moodTag || 'average', pastSess.stomachFlag || false);
      
      // 3. Populate exercises
      exercisesList.forEach(ex => {
        const cleanSets = (ex.sets || []).map(s => ({
          reps: s.reps ? String(s.reps) : '',
          weight: s.weight === 'BW' ? 'BW' : (s.weight !== undefined ? String(s.weight) : ''),
          completed: false,
          done: false
        }));
        
        addExercise({
          key: ex.exerciseKey,
          name: ex.name,
          muscleGroup: ex.muscleGroup,
          sets: cleanSets
        });
      });
      
      toast(`Loaded workout from ${pastSess.dateString || 'past session'}!`, 'success');
    } catch (err) {
      console.error('[MobileLogger] Failed to repeat workout:', err);
      toast('Failed to load past session exercises.', 'error');
    }
  };

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
      const debrief = {
        pain: debriefPain,
        easy: debriefEasy,
        brokenEquipment: debriefBroken,
      };
      const summary = await finishSession(user.uid, debrief);
      setIsEndSheetOpen(false);
      setSessionSummary(summary);
      setDebriefPain([]);
      setDebriefEasy([]);
      setDebriefBroken([]);
    } catch (err) {
      const cleanMsg = err.message ? err.message.replace(/\[useWorkoutLogger\]\s*/g, '') : 'Failed to save session.';
      setFinishError(cleanMsg);
      
      const isValidationError = cleanMsg.toLowerCase().includes('cannot save') || 
                                cleanMsg.toLowerCase().includes('no active session') || 
                                cleanMsg.toLowerCase().includes('valid uid');
      
      if (isValidationError) {
        setLocalError(cleanMsg);
      } else {
        const newRetry = retryCount + 1;
        setRetryCount(newRetry);
        setLocalError(
          newRetry >= 3
            ? 'Session saved locally — will sync when connection returns.'
            : `Could not save. Tap "Finish Session" to retry. (${cleanMsg})`
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [user, finishSession, retryCount, debriefPain, debriefEasy, debriefBroken]);

  const handleDiscard = useCallback(() => {
    resetSession();
    setDebriefPain([]);
    setDebriefEasy([]);
    setDebriefBroken([]);
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
          <div className="absolute inset-0 z-40 flex flex-col bg-[var(--bg-oled)] overflow-y-auto px-4 py-6 pb-20 select-none">
            {/* Visual Aurora mesh blob gradient in background */}
            <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-[var(--primary)]/10 blur-[80px] pointer-events-none select-none" />
            <div className="absolute top-[40%] left-1/3 w-64 h-64 rounded-full bg-[var(--secondary)]/10 blur-[90px] pointer-events-none select-none" />

            <div className="text-center mb-5 shrink-0">
              <h2 className="font-display text-3xl font-extrabold uppercase text-white tracking-widest drop-shadow-[0_0_12px_var(--primary-glow)]">
                Ready to train?
              </h2>
              <p className="text-[var(--text-secondary)] font-body text-xs mt-1">
                Log your sets, repeat a past workout, or start custom.
              </p>
            </div>

            {/* Calendar Section */}
            <div className="mb-5 z-10 shrink-0">
              {loadingPastSessions ? (
                <div className="border-2 border-black border-dashed bg-[var(--surface)] py-12 text-center font-mono text-xs text-[var(--text-secondary)] uppercase animate-pulse rounded-2xl">
                  ⚙️ Syncing workout calendar...
                </div>
              ) : (
                <NeubrutalistCalendar
                  sessions={pastSessions}
                  onSelectSession={handleRepeatWorkout}
                  isMobile={true}
                />
              )}
            </div>

            {/* Custom Session Setup Card */}
            <div className="relative bg-[var(--bg-surface)] border-2 border-black rounded-2xl p-5 z-10 shadow-[4px_4px_0px_black] flex flex-col gap-4 mb-8 shrink-0">
              <h3 className="font-display font-bold text-base uppercase tracking-wide text-white">
                Start Custom Session
              </h3>

              {/* Mood Selector Grid */}
              <div className="grid grid-cols-3 gap-2">
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
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all cursor-pointer select-none ${
                        isSelected
                          ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary-glow)] shadow-[2px_2px_0px_rgba(255,92,0,0.15)]'
                          : 'border-[var(--border)] text-[var(--text-secondary)] bg-[var(--bg-input)] hover:border-[var(--border-bright)]'
                      }`}
                      style={{ minHeight: '76px' }}
                    >
                      <Icon size={18} className="mb-1" />
                      <span className="font-body text-[10px] font-semibold tracking-wider">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Stomach Flag Toggle */}
              <label className="flex items-center gap-3 cursor-pointer min-h-[40px] py-1 select-none">
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
                <span className="font-body text-xs font-medium text-[var(--text-primary)]">
                  Body feeling off? (Enable safe mode deload)
                </span>
              </label>

              {/* Start Buttons */}
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={handleStartSession}
                  className="w-full h-11 bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-white font-body font-bold text-xs tracking-widest uppercase rounded-xl flex items-center justify-center transition-colors cursor-pointer select-none shadow-[0_4px_12px_var(--primary-glow)]"
                >
                  Start Session →
                </button>
                <button
                  type="button"
                  onClick={() => startSession(selectedMood, stomachFlag, true)}
                  className="w-full h-11 bg-[var(--surface)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] border-2 border-black font-body font-bold text-xs tracking-widest uppercase rounded-xl flex items-center justify-center transition-all cursor-pointer select-none shadow-[3px_3px_0px_black] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  Quick Log Past Workout 🕒
                </button>
              </div>
            </div>

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

            {/* Session Timer or Quick Log Badge */}
            {activeSession?.isQuickLog ? (
              <div className="px-3 py-1 border border-amber-500/50 bg-amber-950/20 text-amber-400 font-mono text-xs font-bold uppercase tracking-wider rounded">
                Quick Log
              </div>
            ) : (
              <div className="font-mono text-xl font-bold tracking-widest text-[var(--text-primary)]">
                {formattedTime}
              </div>
            )}

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
            {activeSession?.isQuickLog && (
              <div className="mb-4 flex items-center justify-center gap-2 px-3.5 py-3 border-2 border-amber-500 bg-amber-950/20 text-amber-400 text-xs font-mono font-bold uppercase rounded-xl select-none shadow-[2px_2px_0px_black]">
                <span>🕒 QUICK LOG MODE (RETROACTIVE)</span>
              </div>
            )}
            {/* ─── OFFLINE NATURAL LANGUAGE DICTATION LOGGER ─── */}
            <div className="mb-6 bg-[var(--bg-surface)] border-2 border-black p-4 rounded-2xl shadow-[4px_4px_0px_rgba(0,0,0,1)] select-none">
              <span className="block font-display text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                🎤 Dictate or Type a Set
              </span>
              <div className="relative flex items-center bg-[var(--bg-input)] border border-[var(--border)] rounded-xl px-3 py-1.5 hover:border-[var(--border-bright)] transition-colors focus-within:border-[var(--primary)] focus-within:shadow-[0_0_8px_var(--primary-glow)]">
                <input
                  type="text"
                  value={nlpInput}
                  onChange={handleNLPChange}
                  placeholder="e.g., Bench Press 60kg 3x10 (dictate via keyboard mic)"
                  className="w-full bg-transparent text-sm text-[var(--text-primary)] focus:outline-none placeholder:text-[var(--text-muted)] pr-6 font-body"
                />
                {nlpInput && (
                  <button
                    type="button"
                    onClick={() => { setNlpInput(''); setParsedNLPResult(null); }}
                    className="absolute right-3 text-[var(--text-secondary)] hover:text-white"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Live Preview / Match Confirmation Box */}
              <AnimatePresence>
                {parsedNLPResult && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    className="overflow-hidden mt-3 bg-yellow-400 text-black border-2 border-black p-3.5 rounded-xl shadow-[3px_3px_0px_rgba(0,0,0,1)] flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display font-extrabold text-xs uppercase tracking-wider">
                        ⚡ Quick Match Detected!
                      </span>
                      <button
                        type="button"
                        onClick={() => setParsedNLPResult(null)}
                        className="text-black/60 hover:text-black font-extrabold text-xs uppercase"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="font-body text-xs font-semibold">
                      Add <span className="font-extrabold">{parsedNLPResult.name}</span>: {parsedNLPResult.sets.length} sets of {parsedNLPResult.sets[0].reps} reps @ {parsedNLPResult.sets[0].weight === 'BW' ? 'Bodyweight' : `${parsedNLPResult.sets[0].weight}kg`}?
                    </div>
                    <button
                      type="button"
                      onClick={handleConfirmNLPAdd}
                      className="w-full py-2 bg-black text-white hover:bg-neutral-900 border-2 border-black font-body font-bold text-xs uppercase rounded-lg shadow-[2px_2px_0px_rgba(255,255,255,0.2)] transition-transform active:translate-y-0.5"
                    >
                      Add to Session
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {isOverdrive && (
              <div className="mb-4 flex items-center justify-center gap-2 px-3 py-2 border-2 border-indigo-500 bg-indigo-950/40 text-indigo-400 text-xs font-mono font-bold uppercase rounded-xl select-none animate-pulse shadow-[0_0_12px_rgba(99,102,241,0.2)]">
                <Zap size={14} className="fill-indigo-400" />
                <span>Overdrive Hour Active (+1.5x XP)</span>
              </div>
            )}
            {(() => {
              const boosterUntil = profile?.xpBoosterUntil
                ? (typeof profile.xpBoosterUntil.toDate === 'function' ? profile.xpBoosterUntil.toDate().getTime() : new Date(profile.xpBoosterUntil).getTime())
                : 0;
              const isBoosterActive = boosterUntil > Date.now();
              if (!isBoosterActive) return null;
              return (
                <div className="mb-4 flex items-center justify-center gap-2 px-3 py-2 border-2 border-amber-500 bg-amber-950/40 text-amber-400 text-xs font-mono font-bold uppercase rounded-xl select-none shadow-[0_0_12px_rgba(245,158,11,0.2)] animate-pulse">
                  <Zap size={14} className="fill-amber-400 text-amber-400" />
                  <span>XP Booster Active (2x XP)</span>
                </div>
              );
            })()}
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
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="inline-block font-body text-[10px] font-bold text-[var(--text-secondary)] bg-[var(--bg-elevated)] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                          {ex.muscleGroup}
                        </span>
                        
                        {/* Neubrutalist Custom Rest Timer Control per Exercise */}
                        <div className="flex items-center gap-1.5 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-0.5 text-[10px] font-mono font-bold select-none shrink-0 shadow-[1px_1px_0px_black]">
                          <span className="text-[var(--text-secondary)]">⏱️ Rest:</span>
                          <button
                            type="button"
                            onClick={() => updateExerciseRestTimer(ex.exerciseId, Math.max(15, (ex.restTimer ?? 90) - 15))}
                            className="w-4 h-4 flex items-center justify-center bg-black/35 rounded border border-neutral-700 hover:bg-neutral-800 text-white font-mono active:scale-95 cursor-pointer"
                          >
                            -
                          </button>
                          <span className="text-white min-w-[28px] text-center">{(ex.restTimer ?? 90)}s</span>
                          <button
                            type="button"
                            onClick={() => updateExerciseRestTimer(ex.exerciseId, Math.min(300, (ex.restTimer ?? 90) + 15))}
                            className="w-4 h-4 flex items-center justify-center bg-black/35 rounded border border-neutral-700 hover:bg-neutral-800 text-white font-mono active:scale-95 cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
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
                      {ex.muscleGroup?.toLowerCase() === 'stretching' ? (
                        <div className="w-[184px] text-center">Minutes</div>
                      ) : (
                        <>
                          <div className="w-[96px] text-center">Weight</div>
                          <div className="w-[88px] text-center">Reps</div>
                        </>
                      )}
                      <div className="w-[104px] flex items-center justify-between pl-2">
                        <span className="w-8 text-left">Done</span>
                        <span className="w-10 text-center">PR</span>
                        <span className="w-6 text-right"></span>
                      </div>
                    </div>
                  )}

                  {/* List of SetRows */}
                  <div className="flex flex-col mb-4">
                    {ex.sets.map((s, setIndex) => {
                      const prevSets = profile?.latestLiftsMap?.[ex.exerciseKey] || profile?.latestLiftsMap?.[ex.exerciseId] || null;
                      const prevSet = prevSets?.[setIndex] || null;

                      const targetEx = activeSession?.exercises?.find(
                        (e) => (e.key ?? e.exerciseKey) === ex.exerciseKey || e.name === ex.name
                      );
                      const targetSet = targetEx ? { targetWeight: targetEx.targetWeight, reps: targetEx.reps } : null;

                      const existingPR = prsMap[ex.exerciseKey] || prsMap[ex.exerciseId] || null;
                      const previousPRWeight = existingPR && existingPR.weight !== 'BW' ? parseFloat(existingPR.weight) || 0 : 0;

                      return (
                        <SetRow
                          key={setIndex}
                          exerciseId={ex.exerciseId}
                          setIndex={setIndex}
                          set={s}
                          previousSet={prevSet}
                          targetSet={targetSet}
                          exerciseIndex={exIndex}
                          isBodyweight={isBodyweightExercise(ex.exerciseKey, ex.exerciseId)}
                          isDurationBased={ex.muscleGroup?.toLowerCase() === 'stretching'}
                          onUpdate={handleUpdateSet}
                          onDone={handleMarkSetDone}
                          isPR={checkIfSetIsPR(ex.exerciseId, s)}
                          onDelete={ex.sets.length > 1 ? handleRemoveSet : null}
                          previousPRWeight={previousPRWeight}
                        />
                      );
                    })}
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

          {/* REST TIMER FLOATING CARD */}
          <AnimatePresence>
            {restTimeRemaining !== null && restTimeRemaining > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -50, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -50, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="fixed top-16 left-4 right-4 z-40 bg-yellow-300 text-black border-2 border-black px-4 py-3 rounded-xl shadow-[3px_3px_0px_black] flex items-center justify-between font-mono font-bold select-none"
              >
                <div className="flex items-center gap-2.5">
                  <span className="animate-spin text-sm">⏳</span>
                  <span className="text-xs uppercase tracking-wider font-body font-extrabold text-black/70">REST TIMER:</span>
                  <span className="text-lg tracking-widest bg-black text-white px-2.5 py-0.5 rounded border-2 border-black shadow-[1px_1px_0px_black] font-mono font-black">{restTimeRemaining}s</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isTimerMuted;
                      setIsTimerMuted(next);
                      localStorage.setItem('zenkai_mute_rest_sound', next ? 'true' : 'false');
                    }}
                    className="p-1.5 bg-black text-white hover:bg-neutral-900 border-2 border-black rounded-lg shadow-[1.5px_1.5px_0px_black] transition-transform active:translate-y-0.5 cursor-pointer flex items-center justify-center shrink-0"
                    title={isTimerMuted ? 'Unmute timer sound' : 'Mute timer sound'}
                  >
                    {isTimerMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRestTimerEndTimestamp(null);
                      setRestTimeRemaining(null);
                      if (isPushEnabled()) {
                        callZenkaiAPI('cancelRestNotification').catch(err => {
                          console.warn('[RestTimer] Failed to cancel background rest notification:', err);
                        });
                      }
                    }}
                    className="bg-black text-white hover:bg-neutral-900 border-2 border-black font-body font-extrabold text-xs uppercase px-3 py-1 rounded-lg shadow-[2px_2px_0px_black] transition-transform active:translate-y-0.5 shrink-0"
                  >
                    Skip
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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

                  {/* AI Coach Debrief Section */}
                  {completedExercises.length > 0 && (
                    <div className="bg-[var(--bg-input)] border border-[var(--border)] rounded-2xl p-4 mb-6 max-h-60 overflow-y-auto custom-scrollbar">
                      <h4 className="font-display font-bold text-xs uppercase tracking-wider text-[var(--primary)] mb-3 flex items-center gap-1.5">
                        <span>🧠</span> AI Coach Debrief
                      </h4>
                      <p className="font-body text-[11px] text-[var(--text-secondary)] mb-4 leading-relaxed">
                        Flag exercises to customize next week's AI workout plan.
                      </p>

                      {/* Joint Pain */}
                      <div className="mb-4">
                        <span className="block font-body text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-wider mb-2">
                          💥 Joint Pain / Discomfort?
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {completedExercises.map((ex) => {
                            const key = ex.exerciseKey || ex.exerciseId || ex.id;
                            const isSelected = debriefPain.includes(key);
                            return (
                              <button
                                key={`pain-${key}`}
                                data-testid={`debrief-pain-${key}`}
                                type="button"
                                onClick={() => toggleDebriefFlag('pain', key)}
                                className={`px-3 py-1.5 rounded-lg border text-xs font-body transition-colors cursor-pointer select-none ${
                                  isSelected
                                    ? 'bg-red-500/20 border-red-500 text-red-400 font-bold'
                                    : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-bright)]'
                                }`}
                              >
                                {ex.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Too Easy */}
                      <div className="mb-4">
                        <span className="block font-body text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-wider mb-2">
                          ⚡ Too Easy? (Progression Suggested)
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {completedExercises.map((ex) => {
                            const key = ex.exerciseKey || ex.exerciseId || ex.id;
                            const isSelected = debriefEasy.includes(key);
                            return (
                              <button
                                key={`easy-${key}`}
                                data-testid={`debrief-easy-${key}`}
                                type="button"
                                onClick={() => toggleDebriefFlag('easy', key)}
                                className={`px-3 py-1.5 rounded-lg border text-xs font-body transition-colors cursor-pointer select-none ${
                                  isSelected
                                    ? 'bg-green-500/20 border-green-500 text-green-400 font-bold'
                                    : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-bright)]'
                                }`}
                              >
                                {ex.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Broken Equipment */}
                      <div>
                        <span className="block font-body text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-wider mb-2">
                          🛠️ Equipment Broken / Unavailable?
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {completedExercises.map((ex) => {
                            const key = ex.exerciseKey || ex.exerciseId || ex.id;
                            const isSelected = debriefBroken.includes(key);
                            return (
                              <button
                                key={`broken-${key}`}
                                data-testid={`debrief-broken-${key}`}
                                type="button"
                                onClick={() => toggleDebriefFlag('broken', key)}
                                className={`px-3 py-1.5 rounded-lg border text-xs font-body transition-colors cursor-pointer select-none ${
                                  isSelected
                                    ? 'bg-amber-500/20 border-amber-500 text-amber-400 font-bold'
                                    : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-bright)]'
                                }`}
                              >
                                {ex.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

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
