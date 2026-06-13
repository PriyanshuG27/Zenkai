import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Trophy, Zap, Dumbbell, Play, RefreshCw, CalendarDays, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { usePlanStore } from '../../stores/usePlanStore';
import { useXPStore } from '../../stores/useXPStore';
import { useWeeklyPlan } from '../../hooks/useWeeklyPlan';
import { useChallenges } from '../../hooks/useChallenges';
import { WeeklyPlanView } from './WeeklyPlanView';
import { PlanGenerationLoader } from '../shared/PlanGenerationLoader';
import { collection, query, orderBy, limit, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useUIStore } from '../../stores/useUIStore';
import { useWeeklyRecap } from '../../hooks/useWeeklyRecap';
import { WeeklyRecapScreen } from '../shared/WeeklyRecapScreen';
import { getAvatarStyle } from '../../lib/xpHelpers';

const BoosterTimer = ({ until }) => {
  const [timeLeft, setTimeLeft] = useState(until - Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = until - Date.now();
      if (diff <= 0) {
        clearInterval(timer);
        setTimeLeft(0);
      } else {
        setTimeLeft(diff);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);

  if (timeLeft <= 0) return null;

  const hours = String(Math.floor(timeLeft / (1000 * 60 * 60))).padStart(2, '0');
  const mins = String(Math.floor((timeLeft / (1000 * 60)) % 60)).padStart(2, '0');
  const secs = String(Math.floor((timeLeft / 1000) % 60)).padStart(2, '0');

  return (
    <div className="flex items-center justify-between border-2 border-amber-500 bg-amber-950/15 p-3 rounded-lg shadow-[3px_3px_0px_rgba(245,158,11,0.15)] select-none">
      <div className="flex items-center gap-2">
        <span className="text-lg animate-pulse">⚡</span>
        <div className="flex flex-col">
          <span className="text-[10px] font-mono text-amber-400 font-extrabold uppercase tracking-wider leading-none">
            XP BOOSTER ACTIVE (2x XP)
          </span>
          <span className="text-[9px] text-[var(--text-secondary)] font-sans mt-1">
            Earn double XP for all logged exercises.
          </span>
        </div>
      </div>
      <div className="font-mono text-sm font-bold text-amber-400 bg-amber-950/30 border border-amber-500/20 px-2 py-0.5 rounded">
        {hours}h {mins}m {secs}s
      </div>
    </div>
  );
};

const WeeklyPlanSkeleton = () => {
  return (
    <div className="w-full flex flex-col gap-4 animate-pulse select-none">
      <div className="flex justify-between items-center px-1">
        <div className="w-24 h-4 bg-[var(--bg-elevated)] rounded border border-[var(--border)]" />
        <div className="w-28 h-3 bg-[var(--bg-elevated)] rounded border border-[var(--border)]" />
      </div>
      <div className="w-full flex gap-4 overflow-hidden px-1 py-2">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="flex-shrink-0 w-[85%] max-w-[310px] h-[260px] rounded-lg border-2 border-[var(--border-bright)] bg-[var(--surface)] p-5 shadow-[5px_5px_0px_rgba(0,0,0,0.15)] flex flex-col justify-between"
          >
            <div>
              <div className="flex justify-between items-start mb-3">
                <div className="flex flex-col gap-2">
                  <div className="w-32 h-6 bg-[var(--bg-elevated)] rounded" />
                  <div className="w-24 h-3 bg-[var(--bg-elevated)] rounded" />
                </div>
                <div className="w-9 h-9 bg-[var(--bg-elevated)] rounded border border-[var(--border)]" />
              </div>
              <div className="flex flex-col gap-2.5 my-4">
                <div className="w-full h-4 bg-[var(--bg-elevated)] rounded" />
                <div className="w-[90%] h-4 bg-[var(--bg-elevated)] rounded" />
                <div className="w-[80%] h-4 bg-[var(--bg-elevated)] rounded" />
              </div>
            </div>
            <div className="w-full h-10 bg-[var(--bg-elevated)] rounded-md border border-[var(--border)]" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const MobileHome = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, uid } = useAuthStore();
  const { generatePlan } = useWeeklyPlan();
  const { 
    addToast, 
    isStandalone, 
    openModal,
    pwaInstallable,
    pwaDeferredPrompt,
    clearPwaDeferredPrompt
  } = useUIStore();

  const handleInstallClick = async (e) => {
    e.stopPropagation();
    if (pwaInstallable && pwaDeferredPrompt) {
      try {
        pwaDeferredPrompt.prompt();
        const { outcome } = await pwaDeferredPrompt.userChoice;
        console.log(`[PWA] Install prompt outcome: ${outcome}`);
        clearPwaDeferredPrompt();
      } catch (err) {
        console.error('[PWA] Error triggering native prompt:', err);
        openModal('pwaInstall');
      }
    } else {
      openModal('pwaInstall');
    }
  };
  const { planLoading, currentPlan, planDays, weekId, planError, hasFetched, isNewUser } = usePlanStore();
  const { xp, totalXP, level, levelName, xpToNextLevel, streak, setXP } = useXPStore();
  const { challenges, userProgress } = useChallenges();
  const {
    recap,
    isRecapDay,
    weekId: recapWeekId,
    hasSeen,
    markAsSeen,
  } = useWeeklyRecap();
  const [showRecapScreen, setShowRecapScreen] = useState(false);

  const [lastSession, setLastSession] = useState(null);
  const [lastSessionLoading, setLastSessionLoading] = useState(true);
  
  // Power Ups Inventory Modal toggle
  const [showInventory, setShowInventory] = useState(false);

  // Sync XP store with user profile on change
  useEffect(() => {
    if (profile) {
      setXP(profile.xp ?? 0, profile.cumulativeXP ?? profile.xp ?? 0, profile.streak ?? 0);
    }
  }, [profile, setXP]);

  // Auto-generate plan in background if onboarding is complete but no plan exists yet
  const [hasAutoGenerated, setHasAutoGenerated] = useState(false);
  useEffect(() => {
    if (uid && profile?.onboardingComplete === true && currentPlan === null && !planLoading && !planError && hasFetched && isNewUser && !hasAutoGenerated) {
      setHasAutoGenerated(true);
      generatePlan();
    }
  }, [uid, profile?.onboardingComplete, currentPlan, planLoading, planError, hasFetched, isNewUser, hasAutoGenerated, generatePlan]);

  // Fetch last session log — cache-first via Firestore's IndexedDB persistence.
  // getDocs checks the local cache before going to the network, so this resolves
  // in milliseconds for returning users (vs. ~500ms+ with getDocsFromServer).
  // The cache is kept fresh by Firestore's background sync after each session log.
  useEffect(() => {
    if (!uid) return;
    async function fetchLastSession() {
      try {
        const q = query(
          collection(db, 'users', uid, 'sessions'),
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
  }, [uid, location.key]);


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

  // Find active joined challenge (campaign subtype only)
  const activeChallenge = challenges.find(
    (c) => (c.subtype || 'campaign') === 'campaign' && userProgress[c.id] && !userProgress[c.id].completed
  );

  // If no active challenge, find one available to join (campaign subtype only)
  const availableChallenge = challenges.find(
    (c) => (c.subtype || 'campaign') === 'campaign' && !userProgress[c.id]
  );

  const firstName = profile?.name ? profile.name.split(' ')[0] : 'TRAINER';

  // Total Power-Ups count
  const powerUpsCount = profile?.powerUps
    ? (profile.powerUps.streakShield || 0) +
      (profile.powerUps.xpBooster || 0) +
      (profile.powerUps.challengeSkip || 0) +
      (profile.powerUps.planRefresh || 0)
    : 0;

  const [isActivatingPowerUp, setIsActivatingPowerUp] = useState(false);

  const handleUsePowerUp = async (powerUpKey) => {
    if (!uid || !profile?.powerUps || isActivatingPowerUp) return;
    const currentCount = profile.powerUps[powerUpKey] || 0;
    if (currentCount <= 0) return;

    setIsActivatingPowerUp(true);
    try {
      const userRef = doc(db, 'users', uid);

      // Only write xpBoosterUntil when activating the XP Booster specifically.
      // Bug fix: previously ALL power-ups wrote xpBoosterUntil, silently activating
      // the XP Booster whenever a Streak Shield, Plan Refresh, or Challenge Skip was used.
      const extraFields = {};
      let toastMsg = '';
      if (powerUpKey === 'xpBooster') {
        const activeUntil = Date.now() + 2 * 60 * 60 * 1000;
        extraFields.xpBoosterUntil = activeUntil;
        toastMsg = '⚡ XP Booster activated! Double XP for the next 2 hours!';
      } else if (powerUpKey === 'streakShield') {
        toastMsg = '🛡️ Streak Shield activated! Your streak is protected for tonight.';
      } else if (powerUpKey === 'planRefresh') {
        toastMsg = '🔄 Plan Refresh activated! Your weekly plan will be regenerated.';
      } else if (powerUpKey === 'challengeSkip') {
        toastMsg = '⏭️ Challenge Skip activated! Today\'s challenge step is skipped.';
      } else {
        toastMsg = '✅ Power-up activated!';
      }

      await updateDoc(userRef, {
        [`powerUps.${powerUpKey}`]: currentCount - 1,
        ...extraFields,
      });

      useAuthStore.getState().setProfile({
        ...profile,
        powerUps: {
          ...profile.powerUps,
          [powerUpKey]: currentCount - 1
        },
        ...extraFields,
      });

      addToast(toastMsg, 'success');
      setShowInventory(false);
    } catch (err) {
      console.error('Error using power up:', err);
      addToast('Failed to activate power-up. Try again.', 'error');
    } finally {
      setIsActivatingPowerUp(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 min-h-[100dvh] bg-[var(--bg-base)] text-[var(--text-primary)] pb-28">
      {(() => {
        const boosterUntil = profile?.xpBoosterUntil
          ? (typeof profile.xpBoosterUntil.toDate === 'function' ? profile.xpBoosterUntil.toDate().getTime() : new Date(profile.xpBoosterUntil).getTime())
          : 0;
        const isBoosterActive = boosterUntil > Date.now();
        if (!isBoosterActive) return null;
        return <BoosterTimer until={boosterUntil} />;
      })()}
      {/* ─── TACTILE HEADER (HUD) ────────────────────────────────────────────── */}
      <div className="flex justify-between items-center border-b-2 border-[var(--border)] pb-4">
        <div className="flex items-center gap-3">
          {/* Small Zenkai Logo */}
          <div className="w-8 h-8 rounded bg-black border border-[var(--border)] flex items-center justify-center overflow-hidden shrink-0 select-none">
            <img src="/logos/zenkai_official_logo.png" alt="Zenkai Logo" className="w-full h-full object-contain p-0.5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-widest leading-none">
              Welcome back,
            </span>
            <h1 className="font-display text-2xl font-extrabold tracking-tight uppercase leading-none mt-1 font-barlow text-white">
              {firstName}
            </h1>
          </div>
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

          {/* Clickable profile avatar with Aura styling */}
          <div 
            onClick={() => navigate('/profile')}
            className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center cursor-pointer overflow-hidden transition-all duration-300 border-2 border-black hover:scale-105 active:scale-95 shrink-0"
            style={getAvatarStyle(profile?.aura, level, profile?.powerUps)}
          >
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="font-display font-extrabold text-[10px] text-white">
                {profile?.name?.slice(0, 2).toUpperCase() || 'ZK'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Weekly Recap Modal */}
      <WeeklyRecapScreen
        isOpen={showRecapScreen}
        onClose={() => setShowRecapScreen(false)}
        recap={recap}
        weekId={recapWeekId}
        markAsSeen={markAsSeen}
      />

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
          <div className="flex gap-3 items-center">
            {/* App Icon */}
            <div className="w-12 h-12 bg-black rounded-2xl border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_rgba(0,0,0,0.2)] shrink-0 select-none overflow-hidden">
              <img src="/logos/zenkai_official_logo.png" alt="Zenkai Logo" className="w-full h-full object-contain p-0.5" />
            </div>
            <div className="flex flex-col">
              <span className="font-display font-extrabold text-sm uppercase tracking-wide">
                Zenkai Native Experience
              </span>
              <p className="text-[10px] text-[var(--text-secondary)] font-sans leading-relaxed mt-0.5">
                Run Zenkai in fullscreen from your home screen with faster load times and offline support.
              </p>
            </div>
          </div>
          <button
            onClick={handleInstallClick}
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
            {xp} <span className="text-[var(--text-secondary)]">/ {totalXP + xpToNextLevel} XP</span>
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

        <div className="flex justify-between items-center mt-2">
          {xpToNextLevel > 0 ? (
            <p className="text-[10px] text-[var(--text-secondary)] font-sans">
              🔥 Just <span className="font-mono font-bold text-[var(--accent-xp)]">{xpToNextLevel} XP</span> to reach Level {level + 1}!
            </p>
          ) : (
            <p className="text-[10px] text-[var(--accent-xp)] font-sans font-bold uppercase tracking-wider">
              🏆 MAX LEVEL ACHIEVED
            </p>
          )}
          <p className="text-[10px] text-[var(--text-secondary)] font-sans flex items-center gap-1">
            🌟 Lifetime Best: <span className="font-mono font-bold text-[var(--text-primary)]">{totalXP} XP</span>
          </p>
        </div>
      </div>

      {/* ─── TODAY'S MISSION OR PLAN GENERATION ──────────────────────────────── */}
      <div>
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <CalendarDays size={18} className="text-[var(--primary)]" />
          <span>Weekly Schedule</span>
        </h2>

        {!hasFetched ? (
          <WeeklyPlanSkeleton />
        ) : currentPlan ? (
          <WeeklyPlanView planDays={planDays} weekId={weekId} />
        ) : planLoading ? (
          <PlanGenerationLoader />
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
              onClick={() => generatePlan()}
              disabled={planLoading}
              className="w-full py-3 bg-[var(--primary)] text-black font-display font-extrabold tracking-widest text-sm uppercase rounded border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
              whileTap={{ scale: 0.97 }}
            >
              <Zap size={14} fill="currentColor" />
              <span>Generate AI Plan</span>
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

      {/* ─── WEEKLY RECAP BANNER (Moved here to prevent CLS above-the-fold) ────── */}
      {isRecapDay && !hasSeen && recap && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-2 border-[var(--secondary)] bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] flex items-center justify-between cursor-pointer hover:border-[var(--text-primary)] transition-all animate-pulse"
          onClick={() => setShowRecapScreen(true)}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <div className="flex flex-col">
              <span className="font-display font-extrabold text-sm uppercase tracking-wide text-[var(--secondary)]">
                Your weekly recap is ready
              </span>
              <p className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5">
                See your stats, PRs, and download your shareable card!
              </p>
            </div>
          </div>
          <ArrowRight size={18} className="text-[var(--text-secondary)]" />
        </motion.div>
      )}

      {/* Redo Onboarding warning prompt banner (Moved here to prevent CLS above-the-fold) */}
      {profile?.onboardingSkipped === true && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-2 border-amber-500 bg-amber-950/10 p-4 rounded-lg shadow-[4px_4px_0px_rgba(245,158,11,0.25)] flex flex-col gap-3 text-left animate-pulse"
        >
          <div className="flex gap-3 items-start">
            <span className="text-2xl mt-0.5">⚠️</span>
            <div className="flex flex-col">
              <span className="font-display font-extrabold text-sm uppercase tracking-wide text-amber-500">
                Complete Your Onboarding Profile
              </span>
              <p className="text-[10px] text-neutral-300 font-sans leading-relaxed mt-1">
                You skipped onboarding. For accurate AI workout schedules, personalized goals, and the best training results, please finish setting up your profile.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/onboarding/type')}
            className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-black font-display font-extrabold tracking-widest text-xs uppercase rounded border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer font-bold"
          >
            <span>FINISH ONBOARDING PROFILE</span>
          </button>
        </motion.div>
      )}

      {/* ─── LAST SESSION TELEMETRY ──────────────────────────────────────────── */}
      <div>
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Dumbbell size={18} className="text-[var(--secondary)]" />
          <span>Last Session</span>
        </h2>

        {lastSessionLoading ? (
          <div className="w-full h-[125px] border-2 border-[var(--border)] bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,0.15)] flex flex-col justify-between animate-pulse select-none">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1.5">
                <div className="w-32 h-4 bg-[var(--bg-elevated)] rounded" />
                <div className="w-20 h-3 bg-[var(--bg-elevated)] rounded" />
              </div>
              <div className="w-16 h-5 bg-[var(--bg-elevated)] rounded border border-[var(--border)]" />
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
              <div className="flex flex-col gap-1.5">
                <div className="w-16 h-2 bg-[var(--bg-elevated)] rounded" />
                <div className="w-12 h-4 bg-[var(--bg-elevated)] rounded" />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="w-16 h-2 bg-[var(--bg-elevated)] rounded" />
                <div className="w-12 h-4 bg-[var(--bg-elevated)] rounded" />
              </div>
            </div>
          </div>
        ) : lastSession ? (
          <div className="border-2 border-[var(--border-bright)] bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-2">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-display text-base font-bold text-[var(--text-primary)] uppercase tracking-wide leading-none">
                  {lastSession.name || (lastSession.planDayId === 'custom' || !lastSession.planDayId ? 'Custom Session' : `Day ${lastSession.planDayId} Session`)}
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

            {lastSession.exercisesList && lastSession.exercisesList.length > 0 && (
              <div className="text-[10px] text-[var(--text-secondary)] font-sans border-t border-[var(--border)] pt-3 mt-1 text-left">
                <span className="font-bold text-white uppercase tracking-wider block font-mono text-[9px] mb-1">Movements:</span>
                <div className="flex flex-wrap gap-1.5 mt-0.5">
                  {lastSession.exercisesList.map((ex, idx) => (
                    <span key={idx} className="bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded text-white text-[9px] font-mono">
                      {ex.name} ({ex.setsCount}s)
                    </span>
                  ))}
                </div>
              </div>
            )}

            {lastSession.prsList && lastSession.prsList.length > 0 && (
              <div className="text-[10px] text-[#33FF66] font-sans border-t border-[var(--border)] pt-3 mt-1 text-left bg-emerald-950/10 p-2.5 rounded border border-emerald-500/20 flex flex-col gap-1.5">
                <span className="font-bold uppercase tracking-wider flex items-center gap-1 font-mono text-[9px] text-[#33FF66]">
                  <Trophy size={10} />
                  <span>Personal Records Smashed!</span>
                </span>
                <ul className="list-disc pl-3.5 text-[9px] font-mono flex flex-col gap-0.5 text-neutral-300">
                  {lastSession.prsList.map((pr, idx) => (
                    <li key={idx}>
                      {pr.name}: {pr.weight === 'BW' ? 'BW' : `${pr.weight} kg`} x {pr.reps}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
                    <div className="mt-1.5 pt-1.5 border-t border-[var(--border)]/30 flex flex-col gap-0.5">
                      <span className="text-[8px] font-mono uppercase tracking-wider text-[var(--secondary)] font-bold">How to Earn:</span>
                      <span className="text-[8px] font-sans text-[var(--text-muted)] leading-normal">
                        • Purchase in the Arena Store (Armory Shop) using XP.<br />
                        • Open chests in the Treasure Vault using Boss Keys.
                      </span>
                    </div>
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
                    <div className="mt-1.5 pt-1.5 border-t border-[var(--border)]/30 flex flex-col gap-0.5">
                      <span className="text-[8px] font-mono uppercase tracking-wider text-[var(--secondary)] font-bold">How to Earn:</span>
                      <span className="text-[8px] font-sans text-[var(--text-muted)] leading-normal">
                        • Purchase in the Arena Store (Armory Shop) using XP.<br />
                        • Open chests in the Treasure Vault using Boss Keys.
                      </span>
                    </div>
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
                    <div className="mt-1.5 pt-1.5 border-t border-[var(--border)]/30 flex flex-col gap-0.5">
                      <span className="text-[8px] font-mono uppercase tracking-wider text-[var(--secondary)] font-bold">How to Earn:</span>
                      <span className="text-[8px] font-sans text-[var(--text-muted)] leading-normal">
                        • Purchase in the Arena Store (Armory Shop) using XP.<br />
                        • Open chests in the Treasure Vault using Boss Keys.
                      </span>
                    </div>
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
                      Allows you to regenerate your weekly plan when you exceed the 5 free daily regenerations limit.
                    </span>
                    <div className="mt-1.5 pt-1.5 border-t border-[var(--border)]/30 flex flex-col gap-0.5">
                      <span className="text-[8px] font-mono uppercase tracking-wider text-[var(--secondary)] font-bold">How to Earn:</span>
                      <span className="text-[8px] font-sans text-[var(--text-muted)] leading-normal">
                        • 5 free regenerations reset daily.<br />
                        • Buy additional scrolls in the Arena Store using XP.<br />
                        • Open chests in the Treasure Vault using Boss Keys.
                      </span>
                    </div>
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
