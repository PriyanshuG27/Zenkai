import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Trophy, Zap, Dumbbell, Play, RefreshCw, CalendarDays, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { usePlanStore } from '../../stores/usePlanStore';
import { useXPStore } from '../../stores/useXPStore';
import { useWeeklyPlan } from '../../hooks/useWeeklyPlan';
import { useChallenges } from '../../hooks/useChallenges';
import { WeeklyPlanView } from './WeeklyPlanView';
import { collection, query, orderBy, limit, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useUIStore } from '../../stores/useUIStore';

export const MobileHome = () => {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { generatePlan } = useWeeklyPlan();
  const { addToast, isStandalone, openModal } = useUIStore();
  const { planLoading, currentPlan, planDays, weekId } = usePlanStore();
  const { totalXP, level, levelName, xpToNextLevel, streak, setXP } = useXPStore();
  const { challenges, userProgress } = useChallenges();

  const [lastSession, setLastSession] = useState(null);
  const [lastSessionLoading, setLastSessionLoading] = useState(true);
  
  // Power Ups Inventory Modal toggle
  const [showInventory, setShowInventory] = useState(false);

  // Sync XP store with user profile on change
  useEffect(() => {
    if (profile) {
      setXP(profile.xp ?? 0, profile.streak ?? 0);
    }
  }, [profile, setXP]);

  // Fetch last session log
  useEffect(() => {
    if (!profile?.uid) return;
    async function fetchLastSession() {
      try {
        const q = query(
          collection(db, 'users', profile.uid, 'sessions'),
          orderBy('date', 'desc'),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          setLastSession({ id: snap.docs[0].id, ...snap.docs[0].data() });
        } else {
          setLastSession(null);
        }
      } catch (err) {
        console.error('Error fetching last session:', err);
      } finally {
        setLastSessionLoading(false);
      }
    }
    fetchLastSession();
  }, [profile?.uid]);


  // Calculate XP percentage inside current level
  const getXPPercentage = () => {
    if (level < 6) {
      // Rookie: 200 XP per level (thresholds: L1=0, L2=200, L3=400, etc.)
      const levelStart = (level - 1) * 200;
      const levelXP = totalXP - levelStart;
      return Math.min(100, Math.max(0, (levelXP / 200) * 100));
    } else if (level < 16) {
      // Challenger: 600 XP per level (1000 to 7000)
      const levelStart = 1000 + (level - 6) * 600;
      const levelXP = totalXP - levelStart;
      return Math.min(100, Math.max(0, (levelXP / 600) * 100));
    } else if (level < 31) {
      // Athlete: 1533 XP per level (7000 to 30000)
      const levelStart = 7000 + (level - 16) * 1533.3;
      const levelXP = totalXP - levelStart;
      return Math.min(100, Math.max(0, (levelXP / 1533.3) * 100));
    } else {
      // Elite: 1000 XP per level
      const levelXP = (totalXP - 30000) % 1000;
      return Math.min(100, Math.max(0, (levelXP / 1000) * 100));
    }
  };

  const xpPercentage = getXPPercentage();

  // Find active joined challenge
  const activeChallenge = challenges.find(
    (c) => userProgress[c.id] && !userProgress[c.id].completed
  );

  // If no active challenge, find one available to join
  const availableChallenge = challenges.find((c) => !userProgress[c.id]);

  const firstName = profile?.name ? profile.name.split(' ')[0] : 'TRAINER';

  // Total Power-Ups count
  const powerUpsCount = profile?.powerUps
    ? (profile.powerUps.streakShield || 0) +
      (profile.powerUps.xpBooster || 0) +
      (profile.powerUps.challengeSkip || 0) +
      (profile.powerUps.planRefresh || 0)
    : 0;

  const handleUsePowerUp = async (powerUpKey) => {
    if (!profile?.uid || !profile?.powerUps) return;
    const currentCount = profile.powerUps[powerUpKey] || 0;
    if (currentCount <= 0) return;

    try {
      const userRef = doc(db, 'users', profile.uid);
      await updateDoc(userRef, {
        [`powerUps.${powerUpKey}`]: currentCount - 1
      });
      addToast(`⚡ XP Booster activated! Double XP for the next 2 hours!`, 'success');
      setShowInventory(false);
    } catch (err) {
      console.error('Error using power up:', err);
      addToast('Failed to activate power-up. Try again.', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 min-h-[100dvh] bg-[var(--bg-base)] text-[var(--text-primary)] pb-28">
      {/* ─── TACTILE HEADER (HUD) ────────────────────────────────────────────── */}
      <div className="flex justify-between items-center border-b-2 border-[var(--border)] pb-4 mt-2">
        <div className="flex flex-col">
          <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-widest leading-none">
            Welcome back,
          </span>
          <h1 className="font-display text-3xl font-extrabold tracking-tight uppercase leading-none mt-1">
            {firstName}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Power-ups Backpack Trigger */}
          <motion.div
            onClick={() => setShowInventory(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border-2 border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--text-primary)] cursor-pointer select-none shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-95 transition-all"
          >
            <span>🎒</span>
            <span className="font-mono text-xs font-bold text-[var(--text-primary)]">{powerUpsCount}</span>
          </motion.div>

          {/* Streak Badge with subtle breathing scale effect */}
          <motion.div
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md border-2 ${
              streak > 0
                ? 'border-[var(--primary)] bg-[#ff5c000c] text-[var(--primary)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]'
            }`}
            animate={streak === 0 ? {} : { scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
          >
            <Flame size={16} fill={streak > 0 ? 'var(--primary)' : 'none'} />
            <span className="font-mono text-sm font-bold">{streak}</span>
          </motion.div>

          {/* Level badge */}
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-md border-2 border-[var(--accent-xp)] bg-[#b5ff2d0c] text-[var(--accent-xp)] font-display font-extrabold text-sm uppercase tracking-wide">
            Lvl {level}
          </div>
        </div>
      </div>

      {/* ─── PWA INSTALL CARD ────────────────────────────────────────────────── */}
      {!isStandalone && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-2 border-[var(--primary)] bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-3 relative overflow-hidden"
        >
          <div className="absolute top-2.5 right-2.5 px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider text-[var(--primary)] border border-[var(--primary)] bg-[#ff5c000e] rounded">
            PWA
          </div>
          <div className="flex gap-3">
            <span className="text-2xl shrink-0">📱</span>
            <div className="flex flex-col">
              <span className="font-display font-extrabold text-sm uppercase tracking-wide">
                FitDesi Native Experience
              </span>
              <p className="text-[10px] text-[var(--text-secondary)] font-sans leading-relaxed mt-0.5">
                Run FitDesi in fullscreen from your home screen with faster load times and offline support.
              </p>
            </div>
          </div>
          <button
            onClick={() => openModal('pwaInstall')}
            className="w-full py-2.5 bg-black text-[var(--accent-xp)] font-display font-extrabold tracking-widest text-xs uppercase rounded border border-black shadow-[3px_3px_0px_var(--accent-xp)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <span>INSTALL ON DEVICE</span>
            <ArrowRight size={12} />
          </button>
        </motion.div>
      )}

      {/* ─── XP PROGRESS BAR ────────────────────────────────────────────────── */}
      <div className="border-2 border-[var(--border-bright)] bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)]">
        <div className="flex justify-between items-end mb-2">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
              XP Rank
            </span>
            <span className="text-sm font-sans font-bold text-[var(--secondary)]">
              {levelName}
            </span>
          </div>
          <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
            {totalXP} <span className="text-[var(--text-secondary)]">/ {totalXP + xpToNextLevel} XP</span>
          </span>
        </div>

        {/* Bar track */}
        <div className="w-full h-3 bg-[var(--bg-elevated)] rounded-full overflow-hidden border border-[var(--border)] relative">
          <motion.div
            className="h-full bg-gradient-to-r from-[var(--secondary)] to-[var(--accent-xp)]"
            initial={{ width: 0 }}
            animate={{ width: `${xpPercentage}%` }}
            transition={{ type: 'spring', stiffness: 50, damping: 15 }}
          />
        </div>

        {xpToNextLevel > 0 ? (
          <p className="text-[10px] text-[var(--text-secondary)] font-sans mt-2">
            🔥 Just <span className="font-mono font-bold text-[var(--accent-xp)]">{xpToNextLevel} XP</span> to reach Level {level + 1}!
          </p>
        ) : (
          <p className="text-[10px] text-[var(--accent-xp)] font-sans mt-2 font-bold uppercase tracking-wider">
            🏆 MAX LEVEL ACHIEVED
          </p>
        )}
      </div>

      {/* ─── TODAY'S MISSION OR PLAN GENERATION ──────────────────────────────── */}
      <div>
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <CalendarDays size={18} className="text-[var(--primary)]" />
          <span>Weekly Schedule</span>
        </h2>

        {currentPlan ? (
          <WeeklyPlanView planDays={planDays} weekId={weekId} />
        ) : (
          <motion.div
            className="border-2 border-[var(--primary)] bg-[var(--surface)] p-5 rounded-lg shadow-[5px_5px_0px_rgba(255,92,0,0.15)] flex flex-col gap-4"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="flex flex-col gap-1.5">
              <h3 className="font-display text-lg font-bold text-[var(--primary)] uppercase tracking-wide">
                Build Your Weekly AI Plan
              </h3>
              <p className="text-xs text-[var(--text-secondary)] font-sans leading-relaxed">
                Generate a custom 7-day training schedule optimized for your experience level ({profile?.userType || 'Beginner'}), goals ({profile?.goal || 'General Fitness'}), and available equipment.
              </p>
            </div>

            <motion.button
              onClick={generatePlan}
              disabled={planLoading}
              className="w-full py-3 bg-[var(--primary)] text-black font-display font-extrabold tracking-widest text-sm uppercase rounded border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
              whileTap={{ scale: 0.97 }}
            >
              {planLoading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Synthesizing Plan...</span>
                </>
              ) : (
                <>
                  <Zap size={14} fill="currentColor" />
                  <span>Generate AI Plan</span>
                </>
              )}
            </motion.button>
          </motion.div>
        )}
      </div>

      {/* ─── ACTIVE CHALLENGE CARD ───────────────────────────────────────────── */}
      <div>
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Trophy size={18} className="text-[var(--accent-xp)]" />
          <span>Active Challenge</span>
        </h2>

        {activeChallenge ? (
          <div className="border-2 border-[var(--border-bright)] bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] relative overflow-hidden">
            <span className="absolute top-2 right-2 px-2 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider text-[var(--accent-xp)] border border-[var(--accent-xp)] bg-[#b5ff2d0e] rounded">
              Active
            </span>
            <h3 className="font-display text-lg font-bold text-[var(--text-primary)] uppercase tracking-wide">
              {activeChallenge.name}
            </h3>
            <p className="text-[11px] text-[var(--text-secondary)] font-sans mt-0.5 leading-snug">
              {activeChallenge.description}
            </p>

            <div className="mt-4">
              <div className="flex justify-between items-center text-[10px] font-mono mb-1.5 text-[var(--text-secondary)]">
                <span>Progress</span>
                <span className="text-[var(--text-primary)] font-bold">
                  Day {userProgress[activeChallenge.id]?.currentDay || 1} / {activeChallenge.durationDays}
                </span>
              </div>
              <div className="w-full h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden border border-[var(--border)]">
                <div
                  className="h-full bg-[var(--accent-xp)]"
                  style={{
                    width: `${
                      (((userProgress[activeChallenge.id]?.currentDay || 1) - 1) /
                        activeChallenge.durationDays) *
                      100
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        ) : availableChallenge ? (
          <div className="border-2 border-[var(--border)] bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-3">
            <div>
              <h3 className="font-display text-base font-bold text-[var(--text-primary)] uppercase tracking-wide leading-none">
                {availableChallenge.name}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] font-sans mt-1 leading-snug truncate">
                {availableChallenge.description}
              </p>
            </div>
            <button
              onClick={() => navigate('/challenges')}
              className="py-1.5 px-3 border border-[var(--accent-xp)] bg-[#b5ff2d06] hover:bg-[#b5ff2d10] text-[var(--accent-xp)] text-xs font-mono font-bold rounded uppercase tracking-wider self-start flex items-center gap-1 transition-all"
            >
              <span>Accept Challenge</span>
              <ArrowRight size={12} />
            </button>
          </div>
        ) : (
          <div className="border border-dashed border-[var(--border-bright)] bg-[var(--surface)] p-4 rounded-lg text-center text-xs font-sans text-[var(--text-secondary)]">
            You've completed all available challenges! Check back later. 🏆
          </div>
        )}
      </div>

      {/* ─── LAST SESSION TELEMETRY ──────────────────────────────────────────── */}
      <div>
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Dumbbell size={18} className="text-[var(--secondary)]" />
          <span>Last Session</span>
        </h2>

        {lastSessionLoading ? (
          <div className="w-full h-24 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse" />
        ) : lastSession ? (
          <div className="border-2 border-[var(--border-bright)] bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-2">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-display text-base font-bold text-[var(--text-primary)] uppercase tracking-wide leading-none">
                  {lastSession.planDayId === 'custom' || !lastSession.planDayId ? 'Custom Session' : `Day ${lastSession.planDayId} Session`}
                </h3>
                <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                  {lastSession.date?.toDate
                    ? new Date(lastSession.date.toDate()).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : lastSession.dateString || 'Recent workout'}
                </span>
              </div>
              <span className="font-mono text-xs font-bold text-[var(--accent-xp)] bg-[#b5ff2d0f] border border-[var(--accent-xp)] px-2 py-0.5 rounded">
                +{lastSession.xpEarned || lastSession.xpAwarded || 50} XP
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-2 border-t border-[var(--border)] pt-3">
              <div className="flex flex-col">
                <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                  Total Volume
                </span>
                <span className="font-mono text-base font-bold text-[var(--text-primary)] mt-0.5">
                  {lastSession.totalVolume ? `${lastSession.totalVolume.toLocaleString()} kg` : '0 kg'}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                  Duration
                </span>
                <span className="font-mono text-base font-bold text-[var(--text-primary)] mt-0.5">
                  {lastSession.durationMinutes
                    ? `${lastSession.durationMinutes} min`
                    : lastSession.durationSecs
                    ? `${Math.floor(lastSession.durationSecs / 60)} min`
                    : '0 min'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-[var(--border-bright)] bg-[var(--surface)] p-5 rounded-lg text-center flex flex-col items-center gap-2">
            <Dumbbell className="text-[var(--text-muted)] w-8 h-8 stroke-[1.5]" />
            <p className="text-xs font-sans text-[var(--text-secondary)]">
              No sessions logged yet. Let's get moving!
            </p>
            <button
              onClick={() => navigate('/workout')}
              className="py-1 px-3 mt-1 bg-[var(--primary)] text-black font-display font-extrabold text-[10px] tracking-wider uppercase rounded border border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all"
            >
              Start First Workout
            </button>
          </div>
        )}
      </div>

      {/* ─── POWER-UPS INVENTORY MODAL (BOTTOM SHEET) ────────────────────────── */}
      <AnimatePresence>
        {showInventory && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-xs p-4">
            <div className="absolute inset-0" onClick={() => setShowInventory(false)} />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="w-full max-w-[350px] bg-[var(--bg-elevated)] border-2 border-black rounded-lg p-5 shadow-[5px_5px_0px_rgba(0,0,0,1)] z-10 flex flex-col gap-4 relative"
            >
              {/* Close button */}
              <button
                onClick={() => setShowInventory(false)}
                className="absolute top-3 right-3 text-[10px] font-mono border border-[var(--border)] bg-[var(--surface)] hover:text-white px-2.5 py-0.5 rounded text-[var(--text-secondary)]"
              >
                CLOSE
              </button>

              <div className="border-b border-[var(--border)] pb-2.5 mt-1">
                <h3 className="font-display text-xl font-extrabold text-[var(--primary)] uppercase tracking-wider">
                  🎒 Power-ups Inventory
                </h3>
                <p className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5">
                  Gamified rewards loaded in real-time from Firestore.
                </p>
              </div>

              {/* Power Up List */}
              <div className="flex flex-col gap-3.5 max-h-[300px] overflow-y-auto pr-1">
                {/* Streak Shield */}
                <div className="flex justify-between items-start gap-3 border border-[var(--border)] p-2.5 rounded bg-[var(--surface)]">
                  <div className="text-xl">🛡️</div>
                  <div className="flex-1 flex flex-col">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs font-bold text-white font-sans">Streak Shield</span>
                      <span className="font-mono text-xs text-[var(--secondary)] font-bold">×{profile?.powerUps?.streakShield || 0}</span>
                    </div>
                    <span className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5 leading-snug">
                      Prevents your workout streak from breaking if you miss a day. Activates automatically.
                    </span>
                  </div>
                </div>

                {/* XP Booster */}
                <div className="flex justify-between items-start gap-3 border border-[var(--border)] p-2.5 rounded bg-[var(--surface)]">
                  <div className="text-xl">⚡</div>
                  <div className="flex-1 flex flex-col">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs font-bold text-white font-sans">XP Booster</span>
                      <span className="font-mono text-xs text-[var(--secondary)] font-bold">×{profile?.powerUps?.xpBooster || 0}</span>
                    </div>
                    <span className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5 leading-snug">
                      Doubles all XP earned from workouts for the next 2 hours.
                    </span>
                    {(profile?.powerUps?.xpBooster || 0) > 0 && (
                      <button
                        onClick={() => handleUsePowerUp('xpBooster')}
                        className="mt-2 py-1 px-3 bg-[var(--primary)] text-black font-display font-extrabold text-[10px] tracking-wider uppercase rounded border border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none self-start transition-all"
                      >
                        Activate Booster
                      </button>
                    )}
                  </div>
                </div>

                {/* Challenge Skip */}
                <div className="flex justify-between items-start gap-3 border border-[var(--border)] p-2.5 rounded bg-[var(--surface)]">
                  <div className="text-xl">⏭️</div>
                  <div className="flex-1 flex flex-col">
                    <div className="flex justify-between items-baseline text-white">
                      <span className="text-xs font-bold font-sans">Challenge Skip</span>
                      <span className="font-mono text-xs text-[var(--secondary)] font-bold">×{profile?.powerUps?.challengeSkip || 0}</span>
                    </div>
                    <span className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5 leading-snug">
                      Instantly skips a challenge day (for backup recovery).
                    </span>
                  </div>
                </div>

                {/* Plan Refresh */}
                <div className="flex justify-between items-start gap-3 border border-[var(--border)] p-2.5 rounded bg-[var(--surface)]">
                  <div className="text-xl">🔄</div>
                  <div className="flex-1 flex flex-col">
                    <div className="flex justify-between items-baseline text-white">
                      <span className="text-xs font-bold font-sans">Plan Refresh</span>
                      <span className="font-mono text-xs text-[var(--secondary)] font-bold">×{profile?.powerUps?.planRefresh || 0}</span>
                    </div>
                    <span className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5 leading-snug">
                      Allows you to regenerate your weekly plan early.
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
