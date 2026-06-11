import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Dumbbell, Calendar, Coffee, Play, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useWorkoutStore } from '../../stores/useWorkoutStore';
import { useAuthStore } from '../../stores/authStore';
import { useXPEngine } from '../../hooks/useXPEngine';
import { useUIStore } from '../../stores/useUIStore';
import { useWeeklyPlan } from '../../hooks/useWeeklyPlan';
import { usePlanStore } from '../../stores/usePlanStore';
import { PlanGenerationLoader } from '../shared/PlanGenerationLoader';

export const WeeklyPlanView = ({ planDays = [], weekId = '' }) => {
  const navigate = useNavigate();
  const startSession = useWorkoutStore((state) => state.startSession);
  const { profile, uid } = useAuthStore();
  const { awardXP } = useXPEngine();
  const { addToast } = useUIStore();
  const containerRef = useRef(null);

  const [requirements, setRequirements] = useState('');
  const { generatePlan } = useWeeklyPlan();
  const planLoading = usePlanStore((state) => state.planLoading);

  // Get current day index: Monday = 1, Tuesday = 2, ..., Sunday = 7
  const jsDay = new Date().getDay();
  const todayIndex = jsDay === 0 ? 7 : jsDay;

  // Stretches checklist state
  const [checkedStretches, setCheckedStretches] = useState({});
  const [claiming, setClaiming] = useState(false);
  
  // Daily check key to prevent duplicate claims
  const todayKey = `recovery_claimed_${new Date().toISOString().split('T')[0]}`;
  const [recoveryClaimed, setRecoveryClaimed] = useState(() => {
    return localStorage.getItem(todayKey) === 'true';
  });

  const handleStartWorkout = (dayObj) => {
    startSession(dayObj);
    navigate('/workout');
  };

  const toggleStretch = (dayNum, stretchIndex) => {
    const key = `${dayNum}_${stretchIndex}`;
    setCheckedStretches((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const getRemainingFreeRegens = () => {
    if (!profile) return 5;
    const lastDate = profile.lastRegenDate || '';
    const todayStr = new Date().toISOString().split('T')[0];
    if (lastDate !== todayStr) {
      return 5;
    }
    return Math.max(0, 5 - (profile.dailyRegenCount || 0));
  };

  const freeRegensLeft = getRemainingFreeRegens();

  const handleRegenerate = async () => {
    if (!uid) return;
    const freeRegensLeftVal = getRemainingFreeRegens();
    const planRefreshCount = profile?.powerUps?.planRefresh || 0;

    if (freeRegensLeftVal <= 0 && planRefreshCount <= 0) {
      addToast('Requires 1 Plan Refresh power-up to regenerate.', 'error');
      return;
    }

    try {
      const usePowerUp = freeRegensLeftVal <= 0;
      if (usePowerUp) {
        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, {
          'powerUps.planRefresh': planRefreshCount - 1
        });
        
        // Update local profile state
        useAuthStore.setState({
          profile: {
            ...profile,
            powerUps: {
              ...(profile.powerUps || {}),
              planRefresh: planRefreshCount - 1
            }
          }
        });
      }

      await generatePlan(requirements, usePowerUp);
    } catch (err) {
      console.error('Failed to regenerate plan:', err);
      addToast('Failed to regenerate plan.', 'error');
    }
  };

  const handleClaimRecoveryXP = async (dayNum) => {
    if (!uid || recoveryClaimed) return;
    setClaiming(true);
    try {
      // Award 10 XP for active recovery stretching
      const result = await awardXP(uid, 'active_recovery', 10, {
        sessionId: `recovery_${Date.now()}`
      });
      if (result) {
        localStorage.setItem(todayKey, 'true');
        setRecoveryClaimed(true);
        addToast('Active Recovery Complete! +10 XP awarded 🧘', 'success');
      }
    } catch (err) {
      console.error('Failed to claim active recovery XP:', err);
      addToast('Failed to claim XP. Try again.', 'error');
    } finally {
      setClaiming(false);
    }
  };

  if (!planDays || planDays.length === 0) {
    return (
      <div className="w-full border border-dashed border-[var(--border-bright)] rounded-lg p-6 text-center bg-[var(--surface)] text-[var(--text-secondary)] font-sans">
        <p className="text-sm">No workout plan loaded for this week.</p>
      </div>
    );
  }

  // Days of the week helper names
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Stretches list for recovery
  const RECOVERY_STRETCHES = [
    { name: "Child's Pose Hold", detail: "30s hold × 3 sets" },
    { name: "Cat-Cow Spine Flexes", detail: "15 slow flexes" },
    { name: "Cossack Squats", detail: "8 reps per side" }
  ];

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Title / Week badge */}
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-1.5 text-xs text-[var(--secondary)] font-mono uppercase tracking-wider">
          <Calendar size={14} />
          <span>Week {weekId.split('-W')[1] || weekId}</span>
        </div>
        <span className="text-[10px] text-[var(--text-muted)] font-mono">
          Swipe to view days
        </span>
      </div>

      {/* Snap Scroll Carousel Container */}
      <div
        ref={containerRef}
        className="w-full flex gap-4 overflow-x-auto scrollbar-none snap-x snap-mandatory px-1 py-2"
        style={{
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {planDays.map((dayObj) => {
          const isToday = dayObj.day === todayIndex;
          const isRest = !dayObj.exercises || dayObj.exercises.length === 0 || dayObj.focus?.toLowerCase() === 'rest';

          // Count completed stretches for today's rest card
          const stretchesCompleted = RECOVERY_STRETCHES.every((_, idx) => 
            checkedStretches[`${dayObj.day}_${idx}`]
          );

          return (
            <motion.div
              key={dayObj.day}
              className={`snap-center flex-shrink-0 w-[85%] max-w-[310px] rounded-lg border-2 p-5 bg-[var(--surface)] relative flex flex-col justify-between ${
                isToday 
                  ? 'border-[var(--primary)] shadow-[5px_5px_0px_rgba(255,92,0,1)]' 
                  : 'border-[var(--border-bright)] shadow-[5px_5px_0px_rgba(0,0,0,1)]'
              }`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: dayObj.day * 0.04 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Today tag */}
              {isToday && (
                <span className="absolute -top-3 left-4 bg-[var(--primary)] text-black font-display font-bold text-[10px] tracking-widest px-2.5 py-0.5 rounded border border-black uppercase z-20">
                  Today's Mission
                </span>
              )}

              <div>
                {/* Card Header */}
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-display text-2xl text-[var(--text-primary)] font-bold tracking-tight uppercase leading-none">
                      {dayObj.focus}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] font-sans mt-0.5">
                      Day {dayObj.day} • {DAY_NAMES[dayObj.day - 1]}
                    </p>
                  </div>
                  <div className={`p-2 rounded border ${isToday ? 'bg-[#ff5c0015] border-[var(--primary)] text-[var(--primary)]' : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-secondary)]'}`}>
                    {isRest ? <Coffee size={18} /> : <Dumbbell size={18} />}
                  </div>
                </div>

                {/* Card Content */}
                {isRest ? (
                  <div className="flex flex-col gap-3 my-2">
                    <p className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wider">
                      Active Recovery checklist
                    </p>
                    
                    {/* Stretches Checklist */}
                    <div className="flex flex-col gap-2 bg-[var(--bg-elevated)] p-3 rounded border border-[var(--border)]">
                      {RECOVERY_STRETCHES.map((stretch, idx) => {
                        const isDone = checkedStretches[`${dayObj.day}_${idx}`];
                        return (
                          <div 
                            key={idx}
                            onClick={() => toggleStretch(dayObj.day, idx)}
                            className="flex items-center gap-2.5 py-1 cursor-pointer select-none"
                          >
                            {isDone ? (
                              <CheckCircle2 size={16} className="text-[var(--accent-xp)] flex-shrink-0" />
                            ) : (
                              <Circle size={16} className="text-[var(--text-muted)] flex-shrink-0" />
                            )}
                            <div className="flex flex-col">
                              <span className={`text-xs font-sans font-medium transition-all ${isDone ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>
                                {stretch.name}
                              </span>
                              <span className="text-[9px] font-mono text-[var(--text-secondary)]">
                                {stretch.detail}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5 my-3">
                    <p className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wider">
                      Target exercises ({dayObj.exercises.length})
                    </p>
                    <div className="flex flex-col gap-2 pr-1">
                      {dayObj.exercises.map((ex, index) => (
                        <div
                          key={index}
                          className="flex justify-between items-center py-1.5 border-b border-[var(--border)] last:border-b-0"
                        >
                          <div className="flex flex-col">
                            <span className="text-xs font-sans font-medium text-[var(--text-primary)] truncate max-w-[170px]">
                              {ex.name}
                            </span>
                            <span className="text-[10px] text-[var(--text-secondary)] font-sans">
                              Target: {ex.targetWeight > 0 ? `${ex.targetWeight} kg` : 'Bodyweight'}
                            </span>
                          </div>
                          <span className="text-xs font-mono text-[var(--secondary)] bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded border border-[var(--border)]">
                            {ex.sets}×{ex.reps}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Button */}
              {!isRest ? (
                <motion.button
                  onClick={() => handleStartWorkout(dayObj)}
                  className={`w-full mt-4 py-2.5 px-4 rounded font-display font-extrabold text-sm tracking-wider uppercase flex items-center justify-center gap-1.5 border-2 transition-all ${
                    isToday
                      ? 'bg-[var(--primary)] text-black border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5'
                      : 'bg-transparent text-[var(--text-primary)] border-[var(--border-bright)] hover:bg-[var(--bg-elevated)]'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                >
                  <Play size={14} fill={isToday ? 'black' : 'currentColor'} />
                  <span>Start Workout</span>
                </motion.button>
              ) : (
                /* Recovery Claim Button */
                <motion.button
                  disabled={!stretchesCompleted || recoveryClaimed || claiming}
                  onClick={() => handleClaimRecoveryXP(dayObj.day)}
                  className={`w-full mt-4 py-2 px-4 rounded font-display font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 border-2 transition-all ${
                    recoveryClaimed
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border)] cursor-not-allowed shadow-none'
                      : stretchesCompleted
                        ? 'bg-[var(--accent-xp)] text-black border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5'
                        : 'bg-transparent text-[var(--text-secondary)] border-[var(--border-bright)] opacity-50 cursor-not-allowed'
                  }`}
                  whileHover={stretchesCompleted && !recoveryClaimed ? { scale: 1.02 } : {}}
                  whileTap={stretchesCompleted && !recoveryClaimed ? { scale: 0.96 } : {}}
                >
                  {recoveryClaimed ? (
                    <span>Recovery Completed ✓</span>
                  ) : claiming ? (
                    <span>Claiming...</span>
                  ) : (
                    <>
                      <Sparkles size={12} fill="currentColor" />
                      <span>Claim Recovery XP (+10 XP)</span>
                    </>
                  )}
                </motion.button>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Pagination indicators */}
      <div className="flex justify-center gap-1.5 mt-1">
        {planDays.map((dayObj) => (
          <div
            key={dayObj.day}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              dayObj.day === todayIndex
                ? 'w-4 bg-[var(--primary)]'
                : 'w-1.5 bg-[var(--border-bright)]'
            }`}
          />
        ))}
      </div>

      {/* Custom Regeneration Box */}
      {planLoading ? (
        <div className="mt-4">
          <PlanGenerationLoader />
        </div>
      ) : (
        <div className="mt-4 border-2 border-[var(--border-bright)] bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <h3 className="font-display text-sm font-bold text-[var(--text-primary)] uppercase tracking-wide mb-2 flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--primary)]" />
            <span>Want a different plan?</span>
          </h3>
          <textarea
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder="e.g. Include more core exercises, I only have 30 mins today, make it entirely bodyweight..."
            className="w-full bg-[var(--bg-base)] text-[var(--text-primary)] text-xs font-sans p-3 rounded border border-[var(--border)] focus:outline-none focus:border-[var(--primary)] resize-none h-20 mb-3"
          />
          <motion.button
            onClick={handleRegenerate}
            disabled={planLoading || (freeRegensLeft <= 0 && (profile?.powerUps?.planRefresh || 0) <= 0)}
            className="w-full py-2.5 bg-black text-[var(--accent-xp)] font-display font-extrabold tracking-widest text-xs uppercase rounded border border-black shadow-[3px_3px_0px_var(--accent-xp)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5"
            whileTap={{ scale: 0.97 }}
          >
            {freeRegensLeft > 0 ? (
              <span>Regenerate ({freeRegensLeft} Free Left)</span>
            ) : (
              <span>Regenerate (Costs 1 Plan Refresh)</span>
            )}
          </motion.button>
          {freeRegensLeft <= 0 && (!profile?.powerUps?.planRefresh || profile.powerUps.planRefresh <= 0) && (
            <p className="text-[10px] text-red-500 font-mono text-center mt-2 uppercase tracking-wide">
              ⚠️ Requires 1 Plan Refresh Power-up (You have ×0)
            </p>
          )}
        </div>
      )}
    </div>
  );
};
