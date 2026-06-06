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
export const SetRow = ({
  exerciseId,
  setIndex,
  set,
  onUpdate,
  onDone,
  isPR = false,
  exerciseIndex = 0,
  isBodyweight = false,
  onDelete = null,
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

  // Sync local state when set prop changes (e.g., loaded from store or changed externally)
  useEffect(() => {
    setLocalWeight(set.weight ?? 0);
  }, [set.weight]);

  useEffect(() => {
    setLocalReps(set.reps ?? 0);
  }, [set.reps]);

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
    }
  };

  const handleWeightBlur = () => {
    const trimmed = typeof localWeight === 'string' ? localWeight.trim() : String(localWeight);
    if (isBodyweight && /^bw$/i.test(trimmed)) {
      setLocalWeight('BW');
      onUpdate('weight', 'BW');
      return;
    }
    let parsed = parseFloat(localWeight);
    if (isNaN(parsed) || parsed < 0) parsed = 0;
    // Avoid floating point precision issues by rounding to 2 decimal places
    parsed = parseFloat(parsed.toFixed(2));
    
    if (isBodyweight && parsed === 0) {
      setLocalWeight('BW');
      onUpdate('weight', 'BW');
    } else {
      setLocalWeight(parsed);
      onUpdate('weight', parsed);
    }
  };

  const handleRepsChange = (e) => {
    const val = e.target.value;
    // Allow empty string or integers only
    if (val === '' || /^\d*$/.test(val)) {
      setLocalReps(val);
    }
  };

  const handleRepsBlur = () => {
    let parsed = parseInt(localReps, 10);
    if (isNaN(parsed) || parsed < 0) parsed = 0;
    setLocalReps(parsed);
    onUpdate('reps', parsed);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  // ─── Button Actions ──────────────────────────────────────────────────────────

  const handleWeightDecrement = () => {
    if (localWeight === 'BW') return;
    const current = parseFloat(localWeight) || 0;
    if (current === 0) {
      if (isBodyweight) {
        setLocalWeight('BW');
        onUpdate('weight', 'BW');
      }
    } else {
      const nextVal = Math.max(0, current - 2.5);
      const rounded = parseFloat(nextVal.toFixed(2));
      if (isBodyweight && rounded === 0) {
        setLocalWeight('BW');
        onUpdate('weight', 'BW');
      } else {
        setLocalWeight(rounded);
        onUpdate('weight', rounded);
      }
    }
  };

  const handleWeightIncrement = () => {
    if (localWeight === 'BW') {
      setLocalWeight(0);
      onUpdate('weight', 0);
    } else {
      const current = parseFloat(localWeight) || 0;
      const nextVal = current + 2.5;
      const rounded = parseFloat(nextVal.toFixed(2));
      setLocalWeight(rounded);
      onUpdate('weight', rounded);
    }
  };

  const handleRepsDecrement = () => {
    const current = parseInt(localReps, 10) || 0;
    const nextVal = Math.max(0, current - 1);
    setLocalReps(nextVal);
    onUpdate('reps', nextVal);
  };

  const handleRepsIncrement = () => {
    const current = parseInt(localReps, 10) || 0;
    const nextVal = current + 1;
    setLocalReps(nextVal);
    onUpdate('reps', nextVal);
  };

  // ─── Verification ──────────────────────────────────────────────────────────

  const parsedWeight = parseFloat(localWeight) || 0;
  const parsedReps = parseInt(localReps, 10) || 0;
  // Done button only activates if (isBodyweight is true and weight is BW/0/weighted) or (weight > 0) AND reps > 0
  const isDoneActive = (isBodyweight ? (localWeight === 'BW' || parsedWeight >= 0) : (parsedWeight > 0)) && parsedReps > 0;

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

      {/* Column 2: Weight Control Capsule */}
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

      {/* Column 3: Reps Control Capsule */}
      <div
        className={`flex items-center justify-between bg-[var(--bg-input)] border rounded-lg px-1 py-0.5 w-[88px] shrink-0 transition-all duration-200 ${
          isRepsFocused
            ? 'border-[var(--secondary)] shadow-[0_0_8px_var(--secondary-glow)] bg-black/30'
            : 'border-[var(--border)] hover:border-[var(--border-bright)]'
        }`}
      >
        <motion.button
          type="button"
          onClick={handleRepsDecrement}
          onFocus={() => setIsRepsFocused(true)}
          onBlur={() => setIsRepsFocused(false)}
          aria-label="Decrease reps by 1"
          className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-secondary)] hover:text-white hover:bg-white/5 focus:outline-none transition-colors shrink-0"
          {...buttonTapProps}
        >
          <Minus size={11} strokeWidth={2.5} />
        </motion.button>

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
          aria-label={`Reps for set ${setIndex + 1}`}
          data-testid={`reps-${exerciseIndex}-${setIndex}`}
          className="font-mono text-sm text-[var(--text-primary)] text-center select-all placeholder:text-[var(--text-muted)] focus:outline-none shrink-0"
          style={{
            minWidth: '32px',
            width: '32px',
            border: 'none',
            background: 'transparent',
            outline: 'none',
            boxShadow: 'none',
            padding: 0,
          }}
        />

        <motion.button
          type="button"
          onClick={handleRepsIncrement}
          onFocus={() => setIsRepsFocused(true)}
          onBlur={() => setIsRepsFocused(false)}
          aria-label="Increase reps by 1"
          className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-secondary)] hover:text-white hover:bg-white/5 focus:outline-none transition-colors shrink-0"
          {...buttonTapProps}
        >
          <Plus size={11} strokeWidth={2.5} />
        </motion.button>
      </div>

      {/* Column 4: Done & PR & Delete */}
      <div className="w-[104px] shrink-0 flex items-center justify-between pl-2 select-none">
        {/* Done button slot */}
        <div className="w-8 flex justify-start">
          <motion.button
            type="button"
            onClick={onDone}
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
          {isPR ? (
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
              onClick={onDelete}
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
