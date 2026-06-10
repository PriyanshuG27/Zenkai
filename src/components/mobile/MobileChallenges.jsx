import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Flame,
  Trophy,
  Zap,
  Dumbbell,
  CalendarDays,
  ArrowRight,
  Award,
  CheckCircle2,
  Camera,
  Shield,
  Lock,
  Unlock,
  Sparkles,
  Trash2,
  FastForward
} from 'lucide-react';
import { callZenkaiAPI } from '../../lib/apiClient';
import { SquadMatchmaker } from '../desktop/SquadMatchmaker';
import { useChallenges } from '../../hooks/useChallenges';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/useUIStore';
import { useWorkoutStore } from '../../stores/useWorkoutStore';
import { deriveLevelFromXP } from '../../lib/xpHelpers';
import { compressGymImage } from '../../utils/imageCompressor';

const getRemainingCooldownText = (until) => {
  const diffMs = until - Date.now();
  if (diffMs <= 0) return '';
  const hours = Math.ceil(diffMs / (1000 * 60 * 60));
  if (hours > 1) {
    return `Locked for ${hours}h remaining`;
  }
  const mins = Math.ceil(diffMs / (1000 * 60));
  return `Locked for ${mins}m remaining`;
};

const getRemainingTimeText = (challenge) => {
  if (!challenge.endDate) return `${challenge.weeksRemaining || 0} wks left`;
  const end = challenge.endDate.toDate ? challenge.endDate.toDate() : new Date(challenge.endDate);
  const diffMs = end.getTime() - Date.now();
  if (diffMs <= 0) return 'Expired';
  
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) {
    return `${diffHours}h left`;
  }
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    return `${diffDays}d left`;
  }
  return `${challenge.weeksRemaining || 0} wks left`;
};

export const MobileChallenges = () => {
  const navigate = useNavigate();
  const { challenges, loading, error, joinChallenge, createWager, avgWorkoutHour, leaveChallenge, useChallengeSkip } = useChallenges();
  const [joiningId, setJoiningId] = useState(null);
  const [challengeToDelete, setChallengeToDelete] = useState(null);
  const [activeTab, setActiveTab] = useState('quests'); // 'quests' or 'squads'

  const { setMobileTab, addToast } = useUIStore();
  const startSession = useWorkoutStore((state) => state.startSession);
  const setOverdrive = useWorkoutStore((state) => state.setOverdrive);

  const { user, profile } = useAuthStore();

  const handleLeave = (id) => {
    setChallengeToDelete(id);
  };

  const handleUseChallengeSkip = async (challengeId) => {
    try {
      await useChallengeSkip(challengeId);
    } catch (err) {
      console.error('[MobileChallenges] Failed to skip challenge progress:', err);
    }
  };

  const confirmDelete = async () => {
    if (!challengeToDelete) return;
    try {
      await leaveChallenge(challengeToDelete);
    } catch (err) {
      console.error('[MobileChallenges] Error leaving challenge:', err);
    } finally {
      setChallengeToDelete(null);
    }
  };

  // XP / Level calculations
  const xp = profile?.xp || 0;
  const { level, levelName } = deriveLevelFromXP(xp);

  // Skill points calculations
  const skills = profile?.skills || {};
  const spentPoints = (skills.ironWill ? 4 : 0) + (skills.adrenalineRush ? 4 : 0) + (skills.recoveryProtocol ? 4 : 0);
  const remainingPoints = Math.max(0, level - spentPoints);

  // Wager Selection State
  const [selectedWager, setSelectedWager] = useState(50);
  const [wagerLoading, setWagerLoading] = useState(false);

  // Overdrive Camera Verification State
  const [localVerified, setLocalVerified] = useState(false);
  const [overdriveRemainingMs, setOverdriveRemainingMs] = useState(0);
  const [cameraImage, setCameraImage] = useState(null);
  const [verifyingImage, setVerifyingImage] = useState(false);
  const [verificationAttempts, setVerificationAttempts] = useState(0);

  // Overdrive Timer logic to read from user profile (syncs with Firestore)
  useEffect(() => {
    const updateTimer = () => {
      if (!profile?.overdriveVerifiedAt) {
        setOverdriveRemainingMs(0);
        return;
      }
      
      const verifiedTime = profile.overdriveVerifiedAt.toDate
        ? profile.overdriveVerifiedAt.toDate().getTime()
        : new Date(profile.overdriveVerifiedAt).getTime();
        
      const elapsed = Date.now() - verifiedTime;
      const limit = 2.5 * 60 * 60 * 1000; // 2.5 hours
      setOverdriveRemainingMs(Math.max(0, limit - elapsed));
    };

    updateTimer();
    const intervalId = setInterval(updateTimer, 1000);
    return () => clearInterval(intervalId);
  }, [profile?.overdriveVerifiedAt]);

  const isOverdriveVerified = localVerified || overdriveRemainingMs > 0;

  // Reset localVerified when window expires
  useEffect(() => {
    if (overdriveRemainingMs <= 0) {
      setLocalVerified(false);
    }
  }, [overdriveRemainingMs]);

  const formatOverdriveCountdown = (ms) => {
    if (ms <= 0) return '';
    const totalSecs = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    
    return `${parts.join(' ')} remaining`;
  };

  // Overdrive Hour Calculation
  const currentHour = new Date().getHours();
  const isOverdriveWindow = Math.abs(currentHour - (avgWorkoutHour || 18)) <= 2;

  const activeChallenges = challenges.filter((c) => c.status === 'active');
  const availableChallenges = challenges.filter((c) => !c.status);
  const completedChallenges = challenges.filter((c) => c.status === 'completed');

  const activeCampaigns = activeChallenges.filter((c) => (c.subtype || 'campaign') === 'campaign');
  const activeQuests = activeChallenges.filter((c) => c.subtype === 'quest');
  const activeWager = activeChallenges.find((c) => c.subtype === 'wager');

  const handleJoin = async (id) => {
    setJoiningId(id);
    try {
      await joinChallenge(id);
    } catch (err) {
      console.error('[MobileChallenges] Error joining challenge:', err);
    } finally {
      setJoiningId(null);
    }
  };

  const handlePlaceWager = async () => {
    if (!user?.uid) return;
    if (xp < selectedWager) {
      addToast('Insufficient XP to place this wager.', 'error');
      return;
    }
    setWagerLoading(true);
    try {
      await createWager(user.uid, selectedWager);
      useAuthStore.getState().setProfile({
        ...profile,
        xp: xp - selectedWager
      });
    } catch (err) {
      console.error('[MobileChallenges] Wager error:', err);
      addToast(err.message || 'Failed to place wager.', 'error');
    } finally {
      setWagerLoading(false);
    }
  };

  const handleCameraChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVerifyingImage(true);
    addToast('Verifying image with Gemini AI... 🔍', 'info');
    try {
      // 1. Intercept file and compress locally on device
      // Drops a heavy phone photo down to ~150KB-200KB base64 string
      const cleanBase64Payload = await compressGymImage(file, 1024, 0.7);
      
      // Store compressed data URL format locally for preview
      const previewDataUrl = `data:image/jpeg;base64,${cleanBase64Payload}`;
      setCameraImage(previewDataUrl);

      // 2. Dispatch clean base64 payload to Render Express backend
      const res = await callZenkaiAPI('verifyGymImage', { image: cleanBase64Payload });
      
      if (res.data?.success && res.data?.verified) {
        setLocalVerified(true);
        setVerificationAttempts(0);
        addToast('Gym equipment verified! Overdrive Hour active. ⚡', 'success');
      } else {
        setLocalVerified(false);
        setCameraImage(null);
        const nextAttempts = verificationAttempts + 1;
        setVerificationAttempts(nextAttempts);
        if (nextAttempts >= 2) {
          addToast('Verification failed. Try taking a clear close-up of a gym item like a dumbbell or barbell! 🏋️‍♂️', 'error');
        } else {
          addToast('Verification failed: No gym/workout equipment detected. ❌', 'error');
        }
      }
    } catch (err) {
      console.error('[MobileChallenges] Gym verification error:', err);
      setLocalVerified(false);
      setCameraImage(null);
      // Display the actual rate-limit/server error message directly
      addToast(err.message || 'Failed to verify gym presence. Please try again.', 'error');
    } finally {
      setVerifyingImage(false);
    }
  };

  const handleStartOverdriveSession = () => {
    if (!isOverdriveVerified) {
      addToast('Please verify gym status first.', 'warning');
      return;
    }
    setOverdrive(true);
    startSession({
      id: `overdrive_session_${Date.now()}`,
      name: 'Overdrive Hour Workout 🔥',
      exercises: []
    });
    setMobileTab('workout');
    navigate('/workout');
    addToast('Overdrive active: 1.5x XP Multiplier enabled! ⚡', 'success');
  };

  const handleUnlockSkill = async (skillKey) => {
    if (!user?.uid || !profile) return;
    if (remainingPoints < 4) {
      addToast('No Skill Points available!', 'error');
      return;
    }
    if (skills[skillKey]) {
      addToast('Skill already unlocked!', 'info');
      return;
    }

    const newSkills = {
      ...skills,
      [skillKey]: true
    };

    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../../lib/firebase');
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { skills: newSkills });
      useAuthStore.getState().setProfile({
        ...profile,
        skills: newSkills
      });
      addToast('Perk unlocked successfully! 🌟', 'success');
    } catch (err) {
      console.error('[MobileChallenges] Skill unlock error:', err);
      addToast('Failed to unlock skill.', 'error');
    }
  };

  const handleStartBossFight = (challenge) => {
    const muscle = challenge.goal?.muscleGroup || 'Core';
    let exerciseName = 'Set to Failure';
    let exerciseKey = 'squat';
    if (muscle.toLowerCase() === 'chest') {
      exerciseName = 'Bench Press (AMRAP to Failure)';
      exerciseKey = 'bench_press';
    } else if (muscle.toLowerCase() === 'legs') {
      exerciseName = 'Squat (AMRAP to Failure)';
      exerciseKey = 'squat';
    } else if (muscle.toLowerCase() === 'back') {
      exerciseName = 'Pull-up / Row (AMRAP to Failure)';
      exerciseKey = 'pull_ups';
    } else {
      exerciseName = `${muscle} Exercise (AMRAP to Failure)`;
      exerciseKey = 'push_ups';
    }

    startSession({
      id: `boss_fight_${challenge.id}`,
      name: `Boss Fight: ${challenge.name}`,
      exercises: [
        {
          id: `${exerciseKey}_boss`,
          key: exerciseKey,
          name: exerciseName,
          sets: 1,
          reps: '10',
          targetWeight: 80,
        }
      ]
    });
    setMobileTab('workout');
    navigate('/workout');
  };

  return (
    <div className="flex flex-col gap-6 p-4 min-h-[100dvh] bg-[var(--bg-base)] text-[var(--text-primary)] pb-28">
      {/* ─── TITLE HEADER ────────────────────────────────────────────────── */}
      <div className="border-b-2 border-[var(--border)] pb-4 mt-2 flex justify-between items-end">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight uppercase leading-none font-barlow">
            Challenge Hub
          </h1>
          <p className="text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider mt-1">
            Build consistency & earn base XP
          </p>
        </div>
        <Dumbbell className="text-[var(--primary)] mr-1" size={28} />
      </div>

      {/* Loading & Error States */}
      {loading && challenges.length === 0 ? (
        <div className="flex flex-col gap-4">
          <div className="h-32 w-full bg-[var(--surface)] border-2 border-black rounded-lg animate-pulse" />
          <div className="h-32 w-full bg-[var(--surface)] border-2 border-black rounded-lg animate-pulse" />
        </div>
      ) : error ? (
        <div className="border-2 border-red-500 bg-red-950/20 p-4 rounded-lg text-center text-xs font-sans text-red-400">
          {error}
        </div>
      ) : (
        <>
          {/* ─── TAB SELECTOR ────────────────────────────────────────────────── */}
          <div className="flex border-2 border-black rounded-xl overflow-hidden shadow-[3px_3px_0px_black] z-10 shrink-0">
            <button
              onClick={() => setActiveTab('quests')}
              className={`flex-1 py-2.5 text-xs font-mono font-bold uppercase transition-all tracking-wider ${
                activeTab === 'quests'
                  ? 'bg-[var(--primary)] text-white font-black'
                  : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              Solo Quests & Perks
            </button>
            <button
              onClick={() => setActiveTab('squads')}
              className={`flex-1 py-2.5 text-xs font-mono font-bold uppercase transition-all tracking-wider ${
                activeTab === 'squads'
                  ? 'bg-[var(--primary)] text-white font-black'
                  : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              Fantasy Squads
            </button>
          </div>

          {activeTab === 'quests' ? (
            <div className="flex flex-col gap-6">
              {/* ─── OVERDRIVE & WAGER WIDGETS ──────────────────────────────────── */}
          <div className="flex flex-col gap-6">
            {/* Overdrive Hour Card */}
            <div className={`border-2 border-black rounded-lg p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)] relative overflow-hidden transition-all duration-300 ${
              isOverdriveWindow
                ? 'bg-gradient-to-br from-[#1b1c30] to-[#12131e] border-indigo-500 shadow-[4px_4px_0px_#6366f1]'
                : 'bg-[var(--surface)]'
            }`}>
              {isOverdriveWindow && (
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
              )}
              <div className="flex justify-between items-start relative z-10">
                <div>
                  <span className={`px-2 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider rounded border ${
                    isOverdriveWindow
                      ? 'text-indigo-400 border-indigo-500 bg-indigo-950/30'
                      : 'text-[var(--text-secondary)] border-[var(--border)] bg-[var(--bg-elevated)]'
                  }`}>
                    {isOverdriveWindow ? '⚡ WINDOW ACTIVE' : '🕒 OVERDRIVE WINDOW'}
                  </span>
                  <h3 className="font-display text-lg font-bold uppercase tracking-wide font-barlow mt-2 flex items-center gap-1.5 text-white">
                    Overdrive Hour
                  </h3>
                  <p className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5 leading-snug">
                    Log a workout during your peak hour ({avgWorkoutHour || 18}:00 ± 2h) with camera proof to gain 1.5x XP.
                  </p>
                </div>
                <Zap size={24} className={isOverdriveWindow ? 'text-indigo-400 animate-pulse' : 'text-[var(--text-muted)]'} />
              </div>

              <div className="mt-4 flex flex-col gap-3 relative z-10">
                {isOverdriveWindow ? (
                  <>
                    {!isOverdriveVerified ? (
                      <div>
                        {verifyingImage ? (
                          <div className="w-full py-2 border-2 border-black bg-indigo-950 text-indigo-400 font-display font-extrabold text-xs uppercase tracking-wider text-center flex justify-center items-center gap-2 cursor-not-allowed opacity-75">
                            <span className="h-3 w-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                            <span>Verifying Presence...</span>
                          </div>
                        ) : (
                          <>
                            <label
                              htmlFor="overdrive-camera"
                              className="w-full py-2 border-2 border-black bg-indigo-600 hover:bg-indigo-700 text-white font-display font-extrabold text-xs uppercase tracking-wider shadow-[3px_3px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-center flex justify-center items-center gap-2 cursor-pointer"
                            >
                              <Camera size={14} />
                              <span>Verify Gym Presence</span>
                            </label>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              id="overdrive-camera"
                              className="hidden"
                              onChange={handleCameraChange}
                            />
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-1 px-3 py-2 border-2 border-emerald-500 bg-emerald-950/20 text-emerald-400 rounded">
                          <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase">
                            <CheckCircle2 size={16} />
                            <span>GYM STATUS VERIFIED ✅</span>
                          </div>
                          <div className="text-[10px] font-mono text-emerald-300 uppercase tracking-wide">
                            Window Remaining: {formatOverdriveCountdown(overdriveRemainingMs)}
                          </div>
                        </div>
                        {cameraImage && (
                          <div className="w-full h-24 border-2 border-black rounded overflow-hidden shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                            <img src={cameraImage} alt="Gym proof" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <button
                          onClick={handleStartOverdriveSession}
                          className="w-full py-2.5 border-2 border-black bg-[var(--accent-xp)] text-black hover:bg-[#a3f020] font-display font-extrabold text-xs uppercase tracking-wider shadow-[3px_3px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-center flex justify-center items-center gap-1.5 cursor-pointer"
                        >
                          <Zap size={14} />
                          <span>Start Overdrive Workout (+1.5x)</span>
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-3 rounded text-center">
                    <p className="text-[10px] font-mono text-[var(--text-secondary)] uppercase">
                      WINDOW LOCKS AT {avgWorkoutHour || 18}:00 LOCAL TIME
                    </p>
                    <p className="text-[9px] text-[var(--text-muted)] font-sans mt-1">
                      Currently outside the ±2 hour window. Workouts logged now earn standard XP.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Flame Wager Card */}
            <div className="border-2 border-black bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-orange-500/5 rounded-full blur-xl pointer-events-none" />
              <div className="flex justify-between items-start relative z-10">
                <div>
                  <span className="px-2 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider text-orange-400 border border-orange-500/30 bg-orange-950/20 rounded">
                    🔥 DOUBLE OR NOTHING
                  </span>
                  <h3 className="font-display text-lg font-bold uppercase tracking-wide font-barlow mt-2 flex items-center gap-1 text-white">
                    Flame Wager
                  </h3>
                  <p className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5 leading-snug">
                    Bet XP on your consistency. Complete 3 workouts in 7 days to double your wager.
                  </p>
                </div>
                <Flame size={24} className="text-orange-500" />
              </div>

              {activeWager ? (
                <div className="mt-4 flex flex-col gap-3 relative z-10 border-2 border-orange-500/40 bg-orange-950/15 p-3.5 rounded-lg shadow-[2px_2px_0px_rgba(249,115,22,0.15)]">
                  <div className="flex justify-between items-center text-[10px] font-mono text-orange-400 font-extrabold uppercase tracking-wide">
                    <span>ACTIVE XP WAGER: {activeWager.wagerAmount || 50} XP</span>
                    <span className="bg-orange-500/10 border border-orange-500/30 px-1.5 py-0.5 rounded text-[8px]">
                      {getRemainingTimeText(activeWager)}
                    </span>
                  </div>
                  
                  {/* Progress details */}
                  <div className="mt-1 flex flex-col gap-2">
                    <div className="flex justify-between items-center text-[10px] font-mono text-[var(--text-secondary)]">
                      <span>WORKOUT PROGRESS</span>
                      <span className="text-white font-bold font-dm">
                        {(() => {
                          const prog = activeWager.progress?.[user?.uid] || {};
                          const sum = (prog.weeklyCount || []).reduce((acc, v) => acc + v, 0);
                          return `${sum}/3`;
                        })()} workouts
                      </span>
                    </div>
                    
                    {/* Neubrutalist Progress Bar */}
                    <div className="w-full h-3 bg-[var(--bg-elevated)] border-2 border-black rounded-full overflow-hidden shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                      <div
                        className="h-full bg-orange-500 transition-all duration-500 ease-out"
                        style={{
                          width: `${(() => {
                            const prog = activeWager.progress?.[user?.uid] || {};
                            const sum = (prog.weeklyCount || []).reduce((acc, v) => acc + v, 0);
                            return Math.min(100, Math.round((sum / 3) * 100));
                          })()}%`
                        }}
                      />
                    </div>
                  </div>

                  <p className="text-[9px] text-[var(--text-muted)] font-sans mt-0.5 leading-snug">
                    Complete your remaining workouts before expiration to claim a +{(activeWager.wagerAmount || 50) * 2} XP payout!
                  </p>
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-3 relative z-10">
                  <div className="flex gap-2">
                    {[50, 100, 200].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setSelectedWager(amount)}
                        className={`flex-1 py-1.5 border-2 border-black font-mono font-bold text-xs shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all ${
                          selectedWager === amount
                            ? 'bg-orange-500 text-white shadow-none translate-x-0.5 translate-y-0.5'
                            : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-orange-500/10'
                        }`}
                      >
                        {amount} XP
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handlePlaceWager}
                    disabled={wagerLoading || xp < selectedWager}
                    className="w-full py-2.5 border-2 border-black bg-orange-600 hover:bg-orange-700 text-white font-display font-extrabold text-xs uppercase tracking-wider shadow-[3px_3px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-center flex justify-center items-center gap-1 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                  >
                    {wagerLoading ? (
                      <span>Placing Wager...</span>
                    ) : xp < selectedWager ? (
                      <span>INSUFFICIENT XP BALANCE</span>
                    ) : (
                      <>
                        <span>Wager {selectedWager} XP</span>
                        <ArrowRight size={12} />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Fitness Skill Tree Section */}
            <div className="border-2 border-black bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-4">
              <div className="border-b border-[var(--border)] pb-3 flex justify-between items-center">
                <div>
                  <h2 className="font-display text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                    <Sparkles size={14} className="text-amber-400" />
                    <span>Fitness Skill Tree</span>
                  </h2>
                  <p className="text-[9px] font-mono text-[var(--text-secondary)] uppercase mt-0.5">
                    Level {level} {levelName} • {remainingPoints} Skill Points Available
                  </p>
                </div>
                <div className="px-2.5 py-1 border-2 border-black bg-amber-400 text-black font-mono font-bold text-[10px] rounded shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                  {remainingPoints} SP
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {[
                  {
                    key: 'ironWill',
                    name: 'Iron Will',
                    description: 'Prevents streak decay on missed days. (Active passive)',
                    icon: Shield,
                    color: 'border-emerald-500/40 text-emerald-400 bg-emerald-950/10'
                  },
                  {
                    key: 'adrenalineRush',
                    name: 'Adrenaline Rush',
                    description: 'Increase PR XP bonus from 10 to 12 XP. (Active passive)',
                    icon: Zap,
                    color: 'border-cyan-500/40 text-cyan-400 bg-cyan-950/10'
                  },
                  {
                    key: 'recoveryProtocol',
                    name: 'Recovery Protocol',
                    description: 'Increase Flash Quest spawn chance to 20%. (Active passive)',
                    icon: Flame,
                    color: 'border-amber-500/40 text-amber-400 bg-amber-950/10'
                  }
                ].map((node) => {
                  const Icon = node.icon;
                  const isUnlocked = !!skills[node.key];
                  const canUnlock = remainingPoints >= 4 && !isUnlocked;

                  return (
                    <div
                      key={node.key}
                      className={`border-2 border-black p-3 rounded-lg shadow-[2px_2px_0px_rgba(0,0,0,1)] flex items-start gap-3 transition-all ${
                        isUnlocked
                          ? 'bg-gradient-to-r from-[#172e24] to-[#111] border-emerald-500'
                          : 'bg-[var(--bg-elevated)]'
                      }`}
                    >
                      <div className={`p-2 border border-black rounded ${isUnlocked ? 'bg-emerald-500 text-black' : node.color}`}>
                        <Icon size={18} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <h4 className="font-display text-sm font-bold uppercase tracking-wide font-barlow text-white">
                            {node.name}
                          </h4>
                          {isUnlocked ? (
                            <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-emerald-400 px-1.5 py-0.5 border border-emerald-500/30 bg-emerald-950/30 rounded">
                              UNLOCKED
                            </span>
                          ) : (
                            <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)] px-1.5 py-0.5 border border-[var(--border)] bg-[var(--surface)] rounded">
                              4 SP COST
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-[var(--text-secondary)] font-sans mt-0.5 leading-snug">
                          {node.description}
                        </p>

                        {!isUnlocked && (
                          <button
                            disabled={!canUnlock}
                            onClick={() => handleUnlockSkill(node.key)}
                            className={`w-full mt-2.5 py-1.5 border-2 border-black font-display font-bold text-[10px] uppercase tracking-wider shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-center flex justify-center items-center gap-1 cursor-pointer disabled:opacity-45 disabled:pointer-events-none ${
                              canUnlock
                                ? 'bg-amber-400 text-black hover:bg-amber-500'
                                : 'bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)] shadow-none'
                            }`}
                          >
                            {canUnlock ? (
                              <>
                                <Unlock size={10} />
                                <span>Unlock Perk (-4 SP)</span>
                              </>
                            ) : (
                              <>
                                <Lock size={10} />
                                <span>LOCKED (REQUIRES 4 SP)</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ─── ACTIVE CHALLENGES ─────────────────────────────────────────── */}
          <div className="mt-4">
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-3 flex items-center gap-1.5">
              <Zap size={14} className="text-[var(--accent-xp)] animate-pulse" />
              <span>Active Challenges</span>
            </h2>

            {activeChallenges.length > 0 ? (
              <div className="flex flex-col gap-6">
                {/* Active Campaigns Slot */}
                {activeCampaigns.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <span className="text-[10px] font-mono text-[var(--text-secondary)] tracking-widest uppercase font-bold">
                      Campaign Slot
                    </span>
                    {activeCampaigns.map((challenge) => {
                      const isFinalStage = challenge.progressPct >= 80 || challenge.weeksRemaining === 1;
                      return (
                        <motion.div
                          key={challenge.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="border-2 border-[var(--border-bright)] bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] relative overflow-hidden"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-display text-lg font-bold text-[var(--text-primary)] uppercase tracking-wide font-barlow">
                                {challenge.name}
                              </h3>
                              <p className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5 leading-snug">
                                {challenge.description}
                              </p>
                            </div>
                            <span className="px-2 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider text-[var(--accent-xp)] border border-[var(--accent-xp)] bg-[#b5ff2d0e] rounded">
                              +{challenge.rewardXP || 500} XP Reward
                            </span>
                          </div>

                          {/* Progress details */}
                          <div className="mt-4 flex flex-col gap-2">
                            <div className="flex justify-between items-center text-[10px] font-mono text-[var(--text-secondary)]">
                              <span>MISSION PROGRESS</span>
                              <span className="text-[var(--text-primary)] font-bold font-dm">
                                {challenge.progressPct}%
                              </span>
                            </div>
                            
                            {/* Neubrutalist Progress Bar */}
                            <div className="w-full h-3 bg-[var(--bg-elevated)] border-2 border-black rounded-full overflow-hidden shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                              <div
                                className="h-full bg-[var(--accent-xp)] transition-all duration-500 ease-out"
                                style={{ width: `${challenge.progressPct}%` }}
                              />
                            </div>

                            <div className="flex justify-between items-center text-[10px] font-mono text-[var(--text-secondary)] mt-1">
                              <span className="text-[var(--secondary)] font-sans font-medium">
                                {challenge.currentMission}
                              </span>
                              <span className="flex items-center gap-1 text-[var(--text-muted)]">
                                <CalendarDays size={10} />
                                {getRemainingTimeText(challenge)}
                              </span>
                            </div>
                          </div>

                          {/* Challenge footer options */}
                          <div className="mt-3.5 flex justify-between items-center border-t border-[var(--border)] pt-2.5">
                            <div className="flex gap-3 items-center">
                              <span className="text-[8px] font-mono text-[var(--text-muted)] uppercase">
                                ID: {challenge.id.slice(0, 8)}
                              </span>
                              <button
                                onClick={() => handleUseChallengeSkip(challenge.id)}
                                disabled={(profile?.powerUps?.challengeSkip || 0) <= 0}
                                className="text-[9px] font-mono text-[var(--accent-xp)] hover:text-[var(--primary)] disabled:text-[var(--text-muted)] disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest font-bold flex items-center gap-0.5 cursor-pointer transition-colors"
                              >
                                <FastForward size={10} />
                                <span>Skip Day (Costs 1 ⏭️)</span>
                              </button>
                            </div>
                            <button
                              onClick={() => handleLeave(challenge.id)}
                              className="text-[9px] font-mono text-red-500 hover:text-red-400 uppercase tracking-widest font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Trash2 size={10} />
                              <span>Remove</span>
                            </button>
                          </div>

                          {/* Boss Fight section */}
                          {isFinalStage && (
                            <div className="mt-4 border-2 border-dashed border-[#ff4a4a] bg-[#ff4a4a]/10 p-3 rounded-lg flex flex-col gap-2 relative overflow-hidden animate-pulse">
                              <div className="flex justify-between items-center">
                                <div>
                                  <span className="text-[10px] font-mono font-bold text-[#ff4a4a] uppercase tracking-widest block">
                                    ⚡ BOSS FIGHT UNLOCKED
                                  </span>
                                  <h4 className="font-display text-sm font-bold text-white uppercase tracking-wide font-barlow mt-0.5">
                                    Boss: {challenge.name} Finale
                                  </h4>
                                </div>
                                <Flame size={16} className="text-[#ff4a4a] animate-bounce" />
                              </div>
                              <p className="text-[9px] text-[var(--text-secondary)] font-sans leading-snug">
                                Unlock the final AMRAP set to failure to conquer this challenge and claim a +200 XP premium bonus!
                              </p>
                              <button
                                onClick={() => handleStartBossFight(challenge)}
                                className="w-full mt-1 py-1.5 border border-black bg-[#ff4a4a] hover:bg-red-600 text-white font-display font-extrabold text-[10px] uppercase tracking-wider shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-center flex justify-center items-center gap-1 cursor-pointer"
                              >
                                <span>Start Boss Workout</span>
                                <ArrowRight size={10} />
                              </button>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Active Quests Slot */}
                {activeQuests.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <span className="text-[10px] font-mono text-[var(--text-secondary)] tracking-widest uppercase font-bold">
                      Quest Slot
                    </span>
                    {activeQuests.map((challenge) => {
                      const isFinalStage = challenge.progressPct >= 80 || challenge.weeksRemaining === 1;
                      return (
                        <motion.div
                          key={challenge.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="border-2 border-[var(--border-bright)] bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] relative overflow-hidden"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-display text-lg font-bold text-[var(--text-primary)] uppercase tracking-wide font-barlow">
                                {challenge.name}
                              </h3>
                              <p className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5 leading-snug">
                                {challenge.description}
                              </p>
                            </div>
                            <span className="px-2 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider text-[var(--accent-xp)] border border-[var(--accent-xp)] bg-[#b5ff2d0e] rounded">
                              +{challenge.rewardXP || 500} XP Reward
                            </span>
                          </div>

                          {/* Progress details */}
                          <div className="mt-4 flex flex-col gap-2">
                            <div className="flex justify-between items-center text-[10px] font-mono text-[var(--text-secondary)]">
                              <span>MISSION PROGRESS</span>
                              <span className="text-[var(--text-primary)] font-bold font-dm">
                                {challenge.progressPct}%
                              </span>
                            </div>
                            
                            {/* Neubrutalist Progress Bar */}
                            <div className="w-full h-3 bg-[var(--bg-elevated)] border-2 border-black rounded-full overflow-hidden shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                              <div
                                className="h-full bg-[var(--accent-xp)] transition-all duration-500 ease-out"
                                style={{ width: `${challenge.progressPct}%` }}
                              />
                            </div>

                            <div className="flex justify-between items-center text-[10px] font-mono text-[var(--text-secondary)] mt-1">
                              <span className="text-[var(--secondary)] font-sans font-medium">
                                {challenge.currentMission}
                              </span>
                              <span className="flex items-center gap-1 text-[var(--text-muted)]">
                                <CalendarDays size={10} />
                                {getRemainingTimeText(challenge)}
                              </span>
                            </div>
                          </div>

                          {/* Challenge footer options */}
                          <div className="mt-3.5 flex justify-between items-center border-t border-[var(--border)] pt-2.5">
                            <div className="flex gap-3 items-center">
                              <span className="text-[8px] font-mono text-[var(--text-muted)] uppercase">
                                ID: {challenge.id.slice(0, 8)}
                              </span>
                              <button
                                onClick={() => handleUseChallengeSkip(challenge.id)}
                                disabled={(profile?.powerUps?.challengeSkip || 0) <= 0}
                                className="text-[9px] font-mono text-[var(--accent-xp)] hover:text-[var(--primary)] disabled:text-[var(--text-muted)] disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest font-bold flex items-center gap-0.5 cursor-pointer transition-colors"
                              >
                                <FastForward size={10} />
                                <span>Skip Day (Costs 1 ⏭️)</span>
                              </button>
                            </div>
                            <button
                              onClick={() => handleLeave(challenge.id)}
                              className="text-[9px] font-mono text-red-500 hover:text-red-400 uppercase tracking-widest font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Trash2 size={10} />
                              <span>Remove</span>
                            </button>
                          </div>

                          {/* No Boss Fight for single-stage Quests */}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="border-2 border-dashed border-[var(--border)] bg-[var(--surface)] p-6 rounded-lg text-center flex flex-col items-center gap-2 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                <span className="text-xs font-sans text-[var(--text-secondary)] max-w-xs leading-relaxed">
                  No active challenges right now. Accept one below to start leveling up! 🔥
                </span>
              </div>
            )}
          </div>

          {/* ─── AVAILABLE TO JOIN ─────────────────────────────────────────── */}
          <div className="mt-4">
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-3 flex items-center gap-1.5">
              <Trophy size={14} className="text-[var(--primary)]" />
              <span>Available Challenges</span>
            </h2>

            {availableChallenges.length > 0 ? (
              <div className="flex flex-col gap-4">
                {availableChallenges.map((challenge) => {
                  const cooldownUntil = profile?.cooldowns?.[challenge.type];
                  const isLocked = cooldownUntil && cooldownUntil > Date.now();

                  return (
                    <motion.div
                      key={challenge.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`border-2 border-black bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-3 relative overflow-hidden ${isLocked ? 'opacity-85' : ''}`}
                    >
                      {/* Saffron side glow or gray if locked */}
                      <div className={`absolute top-0 bottom-0 left-0 w-1 ${isLocked ? 'bg-[var(--text-secondary)]' : 'bg-[var(--primary)]'}`} />
                      
                      <div className="pl-1">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-1.5">
                            <h3 className={`font-display text-base font-bold uppercase tracking-wide font-barlow ${isLocked ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>
                              {challenge.name}
                            </h3>
                            {isLocked && <Lock size={14} className="text-red-500 animate-pulse" />}
                          </div>
                          <span className={`px-2 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider border rounded ${isLocked ? 'text-[var(--text-secondary)] border-[var(--border)] bg-[var(--bg-elevated)]' : 'text-[var(--accent-xp)] border-[var(--accent-xp)] bg-[#b5ff2d0e]'}`}>
                            +500 XP Reward
                          </span>
                        </div>
                        <p className={`text-xs font-sans mt-1 leading-snug ${isLocked ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}`}>
                          {challenge.description}
                        </p>

                        {/* Specs Row */}
                        <div className="flex gap-4 mt-3 text-[10px] font-mono text-[var(--text-secondary)] border-t border-[var(--border)] pt-2.5">
                          <div className="flex items-center gap-1">
                            <CalendarDays size={12} className={isLocked ? 'text-[var(--text-muted)]' : 'text-[var(--secondary)]'} />
                            <span>Duration: {challenge.durationDays} days</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Flame size={12} className={isLocked ? 'text-[var(--text-muted)]' : 'text-[var(--primary)]'} />
                            <span>
                              {challenge.type === 'weak_point'
                                ? `Goal: ${challenge.goal?.targetSets || 15} sets of ${challenge.goal?.muscleGroup || 'Core'}`
                                : 'Goal: 3 workouts/week'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {isLocked ? (
                        <button
                          disabled
                          className="w-full mt-1 py-2.5 border-2 border-black bg-[var(--bg-elevated)] text-[var(--text-muted)] font-display font-extrabold text-xs uppercase tracking-wider shadow-[3px_3px_0px_rgba(0,0,0,1)] text-center flex justify-center items-center gap-1.5 cursor-not-allowed opacity-75"
                        >
                          <Lock size={12} />
                          <span>{getRemainingCooldownText(cooldownUntil)}</span>
                        </button>
                      ) : (
                        <motion.button
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleJoin(challenge.id)}
                          disabled={joiningId !== null}
                          className="w-full mt-1 py-2.5 border-2 border-black bg-[var(--primary)] hover:bg-[var(--accent-xp)] hover:text-black font-display font-extrabold text-xs uppercase tracking-wider shadow-[3px_3px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-center flex justify-center items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {joiningId === challenge.id ? (
                            <span>Accepting...</span>
                          ) : (
                            <>
                              <span>Accept Challenge</span>
                              <ArrowRight size={12} />
                            </>
                          )}
                        </motion.button>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="border-2 border-dashed border-[var(--border)] bg-[var(--surface)] p-6 rounded-lg text-center shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                <span className="text-xs font-sans text-[var(--text-secondary)]">
                  You have accepted all available challenges! 🏆
                </span>
              </div>
            )}
          </div>

          {/* ─── COMPLETED CHALLENGES ──────────────────────────────────────── */}
          {completedChallenges.length > 0 && (
            <div className="mt-4">
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-3 flex items-center gap-1.5">
                <Award size={14} className="text-[var(--accent-xp)]" />
                <span>Completed Badges</span>
              </h2>

              <div className="grid grid-cols-2 gap-3">
                {completedChallenges.map((challenge) => (
                  <motion.div
                    key={challenge.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="border-2 border-[var(--accent-xp)] bg-[#b5ff2d05] p-3 rounded-lg shadow-[2px_2px_0px_rgba(0,0,0,1)] flex flex-col items-center text-center gap-1.5"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#b5ff2d10] border border-[var(--accent-xp)] flex items-center justify-center text-[var(--accent-xp)]">
                      <Award size={20} />
                    </div>
                    <div className="flex flex-col min-w-0 w-full">
                      <span className="font-display text-xs font-bold uppercase tracking-wide truncate text-white font-barlow">
                        {challenge.type === 'comeback'
                          ? 'Comeback'
                          : challenge.type === 'streak'
                          ? (challenge.subtype === 'wager' ? 'Wager' : 'Streak')
                          : (challenge.subtype === 'quest' ? 'Quest' : 'Weak Point')}
                      </span>
                      <span className="text-[8px] font-mono text-[var(--accent-xp)] uppercase tracking-wider mt-0.5 flex items-center justify-center gap-0.5 font-dm">
                        <CheckCircle2 size={8} />
                        Claimed +{challenge.rewardXP || 500} XP
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
          </div>
        ) : (
          <SquadMatchmaker />
        )}
        {/* ─── CUSTOM CONFIRMATION DIALOG ──────────────────────────────────── */}
          {challengeToDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full max-w-sm border-4 border-black bg-[var(--surface)] p-6 rounded-lg shadow-[8px_8px_0px_rgba(0,0,0,1)] relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl pointer-events-none" />
                
                <span className="px-2 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider text-red-500 border border-red-500/30 bg-red-950/20 rounded">
                  ⚠️ CONQUEROR WARNING
                </span>
                
                <h3 className="font-display text-xl font-black uppercase tracking-wide font-barlow mt-3 text-white">
                  Abandon Challenge?
                </h3>
                
                <p className="text-xs text-[var(--text-secondary)] font-sans mt-2 leading-relaxed">
                  Are you sure you want to abandon this active challenge? All accumulated sets, streak progress, and pending rewards for this challenge will be permanently lost. This action cannot be undone.
                </p>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={confirmDelete}
                    className="flex-1 py-2 border-2 border-black bg-red-600 hover:bg-red-700 text-white font-display font-extrabold text-xs uppercase tracking-wider shadow-[3px_3px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-center cursor-pointer"
                  >
                    ABANDON
                  </button>
                  
                  <button
                    onClick={() => setChallengeToDelete(null)}
                    className="flex-1 py-2 border-2 border-black bg-[var(--bg-elevated)] hover:bg-[var(--surface)] text-[var(--text-primary)] font-display font-extrabold text-xs uppercase tracking-wider shadow-[3px_3px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-center cursor-pointer"
                  >
                    KEEP IT
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MobileChallenges;
