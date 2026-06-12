import React, { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Minus, Plus, Check, X } from 'lucide-react';

/**
 * SetRow Component
 * The atomic unit of workout logging.
 *
 * Props:
 *   exerciseId: string,
 *   setIndex: number,
 *   set: { reps: number | string, weight: number | string, done: boolean },
 *   onUpdate: (field: 'weight' | 'reps', value: number) => void,
 *   onDone: () => void,
 *   isPR?: boolean,
 *   exerciseIndex?: number,
 *   isBodyweight?: boolean,
 *   onDelete?: () => void
 */
const SetRowComponent = ({
  exerciseId,
  setIndex,
  set,
  onUpdate,
  onDone,
  isPR = false,
  exerciseIndex = 0,
  isBodyweight = false,
  isDurationBased = false,
  onDelete = null,
  previousSet = null,
  targetSet = null,
  previousPRWeight = 0,
}) => {
  const shouldReduceMotion = useReducedMotion();

  // Local state for inputs to allow smooth typing before blur/submit
  const [localWeight, setLocalWeight] = useState(set.weight ?? 0);
  const [localReps, setLocalReps] = useState(set.reps ?? 0);

  // Focus tracking for premium glowing capsule states
  const [isWeightFocused, setIsWeightFocused] = useState(false);
  const [isRepsFocused, setIsRepsFocused] = useState(false);

  // Pop animation state to trigger row scale animation when a set is completed
  const [prevDone, setPrevDone] = useState(set.done);
  const [triggerPop, setTriggerPop] = useState(false);
  const hasPreFilledValues = set.weight !== undefined && set.weight !== null && set.weight !== '' && 
                             set.reps !== undefined && set.reps !== null && set.reps !== '';
  const [isEditing, setIsEditing] = useState(hasPreFilledValues);

  // Sync local state when set prop changes (e.g., loaded from store or changed externally)
  useEffect(() => {
    setLocalWeight(set.weight ?? 0);
  }, [set.weight]);

  useEffect(() => {
    setLocalReps(set.reps ?? 0);
  }, [set.reps]);


  const parseReps = (repsVal) => {
    if (!repsVal) return 8;
    if (typeof repsVal === 'number') return repsVal;
    const str = String(repsVal).trim();
    const rangeMatch = str.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      return parseInt(rangeMatch[2], 10);
    }
    const parsed = parseInt(str, 10);
    return isNaN(parsed) ? 8 : parsed;
  };

  const handleMatchPrevious = () => {
    if (!previousSet) return;
    const w = previousSet.weight;
    const r = previousSet.reps;
    setLocalWeight(w);
    setLocalReps(r);
    onUpdate(exerciseId, setIndex, 'weight', w);
    onUpdate(exerciseId, setIndex, 'reps', r);
    setIsEditing(true);
  };

  const handleOverload = () => {
    if (!targetSet) return;
    const w = targetSet.targetWeight === 0 && isBodyweight ? 'BW' : (targetSet.targetWeight ?? 0);
    const r = parseReps(targetSet.reps);
    setLocalWeight(w);
    setLocalReps(r);
    onUpdate(exerciseId, setIndex, 'weight', w);
    onUpdate(exerciseId, setIndex, 'reps', r);
    setIsEditing(true);
  };

  // Only trigger the row pop animation on transition from false -> true
  useEffect(() => {
    if (set.done && !prevDone) {
      setTriggerPop(true);
    }
    setPrevDone(set.done);
  }, [set.done, prevDone]);

  // Spring animation properties for tapping buttons
  const buttonTapProps = shouldReduceMotion
    ? {}
    : {
        whileTap: { scale: 0.90 },
        transition: { type: 'spring', stiffness: 500, damping: 25 },
      };

  // ─── Input Handlers ──────────────────────────────────────────────────────────

  const handleWeightChange = (e) => {
    const val = e.target.value;
    // Allow empty string, numbers with up to one decimal place, or "BW" case-insensitively (only for bodyweight exercises)
    if (val === '' || /^\d*\.?\d*$/.test(val) || (isBodyweight && (/^bw$/i.test(val) || /^b$/i.test(val)))) {
      setLocalWeight(val);
      setIsEditing(true);
    }
  };

  const handleWeightBlur = () => {
    const trimmed = typeof localWeight === 'string' ? localWeight.trim() : String(localWeight);
    if (isBodyweight && /^bw$/i.test(trimmed)) {
      setLocalWeight('BW');
      onUpdate(exerciseId, setIndex, 'weight', 'BW');
      return;
    }
    let parsed = parseFloat(localWeight);
    if (isNaN(parsed) || parsed < 0) parsed = 0;
    // Avoid floating point precision issues by rounding to 2 decimal places
    parsed = parseFloat(parsed.toFixed(2));
    
    if (isBodyweight && parsed === 0) {
      setLocalWeight('BW');
      onUpdate(exerciseId, setIndex, 'weight', 'BW');
    } else {
      setLocalWeight(parsed);
      onUpdate(exerciseId, setIndex, 'weight', parsed);
    }
  };

  const handleRepsChange = (e) => {
    const val = e.target.value;
    // Allow empty string or integers only
    if (val === '' || /^\d*$/.test(val)) {
      setLocalReps(val);
      setIsEditing(true);
    }
  };

  const handleRepsBlur = () => {
    let parsed = parseInt(localReps, 10);
    if (isNaN(parsed) || parsed < 0) parsed = 0;
    setLocalReps(parsed);
    onUpdate(exerciseId, setIndex, 'reps', parsed);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  // Keep a ref to the latest set object to avoid stale closures in handleSaveUncommitted
  const latestSetRef = React.useRef(set);
  useEffect(() => {
    latestSetRef.current = set;
  }, [set]);

  // Keep a ref to the latest input values to avoid re-registering unload listeners on every keystroke
  const latestValuesRef = React.useRef({ localWeight, localReps });
  useEffect(() => {
    latestValuesRef.current = { localWeight, localReps };
  }, [localWeight, localReps]);

  useEffect(() => {
    const handleSaveUncommitted = () => {
      const currentSet = latestSetRef.current;
      const { localWeight: w, localReps: r } = latestValuesRef.current;
      
      // Normalize and compare weight
      let normW = w;
      const trimmedW = typeof w === 'string' ? w.trim() : String(w);
      if (isBodyweight && /^bw$/i.test(trimmedW)) {
        normW = 'BW';
      } else {
        let parsedW = parseFloat(w);
        if (isNaN(parsedW) || parsedW < 0) parsedW = 0;
        parsedW = parseFloat(parsedW.toFixed(2));
        if (isBodyweight && parsedW === 0) {
          normW = 'BW';
        } else {
          normW = parsedW;
        }
      }

      // Normalize and compare reps
      let parsedR = parseInt(r, 10);
      if (isNaN(parsedR) || parsedR < 0) parsedR = 0;

      // Only update if the values have actually changed
      if (normW !== currentSet.weight) {
        onUpdate(exerciseId, setIndex, 'weight', normW);
      }
      if (parsedR !== currentSet.reps) {
        onUpdate(exerciseId, setIndex, 'reps', parsedR);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleSaveUncommitted();
      }
    };

    window.addEventListener('beforeunload', handleSaveUncommitted);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleSaveUncommitted);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [exerciseId, setIndex, isBodyweight, onUpdate]);

  // ─── Button Actions ──────────────────────────────────────────────────────────

  const handleWeightDecrement = () => {
    setIsEditing(true);
    if (localWeight === 'BW') return;
    const current = parseFloat(localWeight) || 0;
    if (current === 0) {
      if (isBodyweight) {
        setLocalWeight('BW');
        onUpdate(exerciseId, setIndex, 'weight', 'BW');
      }
    } else {
      const nextVal = Math.max(0, current - 2.5);
      const rounded = parseFloat(nextVal.toFixed(2));
      if (isBodyweight && rounded === 0) {
        setLocalWeight('BW');
        onUpdate(exerciseId, setIndex, 'weight', 'BW');
      } else {
        setLocalWeight(rounded);
        onUpdate(exerciseId, setIndex, 'weight', rounded);
      }
    }
  };

  const handleWeightIncrement = () => {
    setIsEditing(true);
    if (localWeight === 'BW') {
      setLocalWeight(0);
      onUpdate(exerciseId, setIndex, 'weight', 0);
    } else {
      const current = parseFloat(localWeight) || 0;
      const nextVal = current + 2.5;
      const rounded = parseFloat(nextVal.toFixed(2));
      setLocalWeight(rounded);
      onUpdate(exerciseId, setIndex, 'weight', rounded);
    }
  };

  const handleRepsDecrement = () => {
    setIsEditing(true);
    const current = parseInt(localReps, 10) || 0;
    const nextVal = Math.max(0, current - 1);
    setLocalReps(nextVal);
    onUpdate(exerciseId, setIndex, 'reps', nextVal);
  };

  const handleRepsIncrement = () => {
    setIsEditing(true);
    const current = parseInt(localReps, 10) || 0;
    const nextVal = current + 1;
    setLocalReps(nextVal);
    onUpdate(exerciseId, setIndex, 'reps', nextVal);
  };

  // ─── Verification ──────────────────────────────────────────────────────────

  const parsedWeight = parseFloat(localWeight) || 0;
  const parsedReps = parseInt(localReps, 10) || 0;
  // Done button only activates if (isBodyweight is true and weight is BW/0/weighted) or (weight > 0) AND reps > 0
  // For duration-based exercises, only reps (minutes) must be > 0
  const isDoneActive = isDurationBased 
    ? (parsedReps > 0) 
    : ((isBodyweight ? (localWeight === 'BW' || parsedWeight >= 0) : (parsedWeight > 0)) && parsedReps > 0);

  return (
    <motion.div
      animate={triggerPop ? { scale: [1, 1.02, 1] } : { scale: 1 }}
      onAnimationComplete={() => setTriggerPop(false)}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.15, ease: 'easeOut' }}
      className="flex items-center justify-between w-full py-2 px-1 border-b border-[var(--border)]/20 last:border-none"
      style={{ minHeight: '44px' }}
    >
      {/* Column 1: Set Number */}
      <div className="font-mono text-xs text-[var(--text-secondary)] w-6 shrink-0 select-none text-left font-bold">
        {setIndex + 1}
      </div>

      {/* Quick Action Chips container replacing weight + reps capsules */}
      {!set.done && !isEditing && !isDurationBased && (previousSet || targetSet) ? (
        <div className="flex items-center gap-1.5 w-[184px] shrink-0 overflow-x-auto scrollbar-none pr-1 select-none">
          {previousSet && (
            <motion.button
              type="button"
              onClick={handleMatchPrevious}
              className="px-2 py-1 bg-yellow-300 text-black font-display font-extrabold text-[9px] tracking-tight uppercase border-2 border-black rounded shadow-[1.5px_1.5px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-95 transition-all flex items-center gap-0.5 shrink-0"
              {...buttonTapProps}
            >
              <span>Match:</span>
              <span className="font-mono font-black">{previousSet.weight === 'BW' ? 'BW' : previousSet.weight + 'k'}×{previousSet.reps}</span>
            </motion.button>
          )}

          {targetSet && (targetSet.targetWeight > 0 || isBodyweight) && (
            <motion.button
              type="button"
              onClick={handleOverload}
              className="px-2 py-1 bg-orange-400 text-black font-display font-extrabold text-[9px] tracking-tight uppercase border-2 border-black rounded shadow-[1.5px_1.5px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-95 transition-all flex items-center gap-0.5 shrink-0"
              {...buttonTapProps}
            >
              <span>Overload:</span>
              <span className="font-mono font-black">{targetSet.targetWeight === 0 ? 'BW' : targetSet.targetWeight + 'k'}×{parseReps(targetSet.reps)}</span>
            </motion.button>
          )}

          <button
            type="button"
            onClick={() => setIsEditing(true)}
            data-testid={`edit-set-${exerciseIndex}-${setIndex}`}
            className="px-2 py-1 bg-neutral-800 text-white font-display font-bold text-[9px] uppercase border border-neutral-700 rounded hover:bg-neutral-700 transition-all shrink-0 flex items-center justify-center"
            style={{ minWidth: '24px', height: '24px' }}
            title="Edit manual weight/reps"
          >
            ✏️
          </button>
        </div>
      ) : (
        <>
          {/* Column 2: Weight Control Capsule (hidden for duration-based) */}
          {!isDurationBased && (
            <div className="flex flex-col items-center gap-0.5">
              <div
                className={`flex items-center justify-between bg-[var(--bg-input)] border rounded-lg px-1 py-0.5 w-[96px] shrink-0 transition-all duration-200 ${
                  isWeightFocused
                    ? 'border-[var(--primary)] shadow-[0_0_8px_var(--primary-glow)] bg-black/30'
                    : 'border-[var(--border)] hover:border-[var(--border-bright)]'
                }`}
              >
                <motion.button
                  type="button"
                  onClick={handleWeightDecrement}
                  onFocus={() => setIsWeightFocused(true)}
                  onBlur={() => setIsWeightFocused(false)}
                  aria-label="Decrease weight by 2.5 kilograms"
                  className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-secondary)] hover:text-white hover:bg-white/5 focus:outline-none transition-colors shrink-0"
                  {...buttonTapProps}
                >
                  <Minus size={11} strokeWidth={2.5} />
                </motion.button>

                <input
                  type="text"
                  inputMode="decimal"
                  value={localWeight}
                  onChange={handleWeightChange}
                  onFocus={() => setIsWeightFocused(true)}
                  onBlur={() => {
                    handleWeightBlur();
                    setIsWeightFocused(false);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="0"
                  aria-label={`Weight for set ${setIndex + 1}`}
                  data-testid={`weight-${exerciseIndex}-${setIndex}`}
                  className="font-mono text-sm text-[var(--text-primary)] text-center select-all placeholder:text-[var(--text-muted)] focus:outline-none shrink-0"
                  style={{
                    minWidth: '36px',
                    width: '36px',
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    boxShadow: 'none',
                    padding: 0,
                  }}
                />

                <motion.button
                  type="button"
                  onClick={handleWeightIncrement}
                  onFocus={() => setIsWeightFocused(true)}
                  onBlur={() => setIsWeightFocused(false)}
                  aria-label="Increase weight by 2.5 kilograms"
                  className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-secondary)] hover:text-white hover:bg-white/5 focus:outline-none transition-colors shrink-0"
                  {...buttonTapProps}
                >
                  <Plus size={11} strokeWidth={2.5} />
                </motion.button>
              </div>
              {!isBodyweight && previousPRWeight > 0 && parseFloat(localWeight) > previousPRWeight * 1.4 && (
                <span className="text-[9px] font-mono text-amber-500 font-bold tracking-tight select-none">
                  ⚠️ Typo?
                </span>
              )}
            </div>
          )}

          {/* Column 3: Reps/Minutes Control Capsule */}
          <div
            className={`flex items-center justify-between bg-[var(--bg-input)] border rounded-lg px-1 py-0.5 shrink-0 transition-all duration-200 ${
              isRepsFocused
                ? 'border-[var(--secondary)] shadow-[0_0_8px_var(--secondary-glow)] bg-black/30'
                : 'border-[var(--border)] hover:border-[var(--border-bright)]'
            } ${isDurationBased ? 'w-[184px] px-2' : 'w-[88px]'}`}
          >
            <motion.button
              type="button"
              onClick={handleRepsDecrement}
              onFocus={() => setIsRepsFocused(true)}
              onBlur={() => setIsRepsFocused(false)}
              aria-label={isDurationBased ? "Decrease minutes by 1" : "Decrease reps by 1"}
              className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-secondary)] hover:text-white hover:bg-white/5 focus:outline-none transition-colors shrink-0"
              {...buttonTapProps}
            >
              <Minus size={11} strokeWidth={2.5} />
            </motion.button>

            <div className="flex items-center gap-1">
              <input
                type="text"
                inputMode="numeric"
                value={localReps}
                onChange={handleRepsChange}
                onFocus={() => setIsRepsFocused(true)}
                onBlur={() => {
                  handleRepsBlur();
                  setIsRepsFocused(false);
                }}
                onKeyDown={handleKeyDown}
                placeholder="0"
                aria-label={isDurationBased ? `Minutes for set ${setIndex + 1}` : `Reps for set ${setIndex + 1}`}
                data-testid={`reps-${exerciseIndex}-${setIndex}`}
                className="font-mono text-sm text-[var(--text-primary)] text-center select-all placeholder:text-[var(--text-muted)] focus:outline-none shrink-0"
                style={{
                  minWidth: isDurationBased ? '40px' : '32px',
                  width: isDurationBased ? '40px' : '32px',
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  boxShadow: 'none',
                  padding: 0,
                }}
              />
              {isDurationBased && (
                <span className="text-xs font-mono text-[var(--text-secondary)] select-none">mins</span>
              )}
            </div>

            <motion.button
              type="button"
              onClick={handleRepsIncrement}
              onFocus={() => setIsRepsFocused(true)}
              onBlur={() => setIsRepsFocused(false)}
              aria-label={isDurationBased ? "Increase minutes by 1" : "Increase reps by 1"}
              className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-secondary)] hover:text-white hover:bg-white/5 focus:outline-none transition-colors shrink-0"
              {...buttonTapProps}
            >
              <Plus size={11} strokeWidth={2.5} />
            </motion.button>
          </div>
        </>
      )}


      {/* Column 4: Done & PR & Delete */}
      <div className="w-[104px] shrink-0 flex items-center justify-between pl-2 select-none">
        {/* Done button slot */}
        <div className="w-8 flex justify-start">
          <motion.button
            type="button"
            onClick={() => {
              if (set.done) {
                setIsEditing(false);
              }
              onDone(exerciseId, setIndex);
            }}
            disabled={!isDoneActive}
            aria-label={`Mark set ${setIndex + 1} as completed`}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors focus:outline-none ${
              set.done
                ? 'bg-[var(--accent-xp)] border-none'
                : 'bg-transparent border border-[var(--border)]'
            } ${
              !isDoneActive
                ? 'opacity-30 cursor-not-allowed'
                : 'hover:border-[var(--primary)] cursor-pointer hover:bg-white/5'
            }`}
            style={{ minWidth: '28px', minHeight: '28px' }}
            data-testid={`set-done-${exerciseIndex}-${setIndex}`}
            {...buttonTapProps}
          >
            <motion.div
              initial={false}
              animate={{ scale: set.done ? 1 : 0 }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 500, damping: 22 }
              }
              className="flex items-center justify-center text-[#000]"
            >
              <Check size={14} strokeWidth={3.5} />
            </motion.div>
          </motion.button>
        </div>

        {/* PR Badge slot */}
        <div className="w-10 flex justify-center">
          {isPR && !isDurationBased ? (
            <span className="font-mono text-[9px] text-[var(--accent-xp)] border border-[var(--accent-xp)]/30 bg-[var(--accent-xp)]/10 shadow-[0_0_8px_var(--accent-xp-glow)] px-1.5 py-0.5 rounded font-extrabold select-none tracking-wider shrink-0 uppercase leading-none">
              PR
            </span>
          ) : (
            <div className="w-10 shrink-0" />
          )}
        </div>

        {/* Delete button slot */}
        <div className="w-6 flex justify-end">
          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(exerciseIndex, setIndex)}
              aria-label={`Remove set ${setIndex + 1}`}
              className="w-6 h-6 flex items-center justify-center text-[var(--text-secondary)] hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors cursor-pointer focus:outline-none shrink-0"
              style={{ minWidth: '24px', minHeight: '24px' }}
            >
              <X size={12} />
            </button>
          ) : (
            <div className="w-6 shrink-0" />
          )}
        </div>
      </div>
    </motion.div>
  );
};

export const SetRow = React.memo(SetRowComponent);
SetRow.displayName = 'SetRow';
