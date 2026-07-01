import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
  FastForward,
  Key
} from 'lucide-react';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { callZenkaiAPI } from '../../lib/apiClient';
import { SquadMatchmaker } from '../desktop/SquadMatchmaker';
import { useChallenges } from '../../hooks/useChallenges';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/useUIStore';
import { useWorkoutStore } from '../../stores/useWorkoutStore';
import { deriveLevelFromXP, getAvatarStyle, isAuraActive, isTitleActive } from '../../lib/xpHelpers';
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

const shopItems = [
  { key: 'streakShield', name: 'Streak Shield', cost: 150, description: 'Protects streak from breaking.', type: 'consumable', icon: Shield },
  { key: 'xpBooster', name: '2x XP Booster', cost: 300, description: 'Doubles all XP earned for 24h.', type: 'consumable', icon: Zap },
  { key: 'challengeSkip', name: 'Quest Skip', cost: 100, description: 'Skip a single check-in mission.', type: 'consumable', icon: FastForward },
  { key: 'pr_demon', name: 'PR Demon', cost: 200, description: 'The ultimate flex for heavy lifters. Show off your status next to your username.', type: 'title', icon: Trophy },
  { key: 'titan_hunter', name: 'Titan Hunter', cost: 200, description: 'Show off your consistency. Let everyone know you hunt down gym giants.', type: 'title', icon: Award },
  { key: 'crimson', name: 'Crimson Aura', cost: 400, description: 'Flex the prestigious red glow early. Show off your status regardless of your level.', type: 'aura', color: '#ef4444' },
  { key: 'golden', name: 'Golden Aura', cost: 600, description: 'The ultimate wealth flex. Skip the Level 21 grind and shine in pure gold.', type: 'aura', color: '#eab308' },
  { key: 'shadow', name: 'Shadow Aura', cost: 800, description: 'Completely exclusive purple glow. The ultimate show-off; cannot be unlocked by leveling.', type: 'aura', color: '#a855f7' }
];

const durationOptions = {
  pr_demon: { 10: 100, 15: 150, 30: 250 },
  titan_hunter: { 10: 100, 15: 150, 30: 250 },
  crimson: { 10: 150, 15: 220, 30: 400 },
  golden: { 10: 250, 15: 350, 30: 600 },
  shadow: { 10: 350, 15: 500, 30: 800 }
};

const getDaysLeft = (until) => {
  if (!until) return '';
  const untilMs = typeof until.toDate === 'function' ? until.toDate().getTime() : new Date(until).getTime();
  const diffMs = untilMs - Date.now();
  if (diffMs <= 0) return '';
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return `${days}d left`;
};

const getUpgradeDiscount = (itemKey, durationDays, powerUps) => {
  if (itemKey === 'golden') {
    if (isAuraActive('crimson', powerUps)) {
      return durationOptions['crimson'][durationDays] || 0;
    }
  } else if (itemKey === 'shadow') {
    if (isAuraActive('golden', powerUps)) {
      return durationOptions['golden'][durationDays] || 0;
    } else if (isAuraActive('crimson', powerUps)) {
      return durationOptions['crimson'][durationDays] || 0;
    }
  }
  return 0;
};

export const MobileChallenges = () => {
  const navigate = useNavigate();
  const { challenges, loading, error, joinChallenge, createWager, avgWorkoutHour, leaveChallenge, useChallengeSkip } = useChallenges();
  const [joiningId, setJoiningId] = useState(null);
  const [challengeToDelete, setChallengeToDelete] = useState(null);
  const [activeTab, setActiveTab] = useState('challenges');
  const [storeSubTab, setStoreSubTab] = useState('perks');
  const [selectedShopItem, setSelectedShopItem] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(10);

  // Treasure Vault / Titan Summoning states
  const [openingChest, setOpeningChest] = useState(false);
  const [openedReward, setOpenedReward] = useState(null);
  const [openedTier, setOpenedTier] = useState(null);
  const [chestOpeningType, setChestOpeningType] = useState(null);
  const [activeSquad, setActiveSquad] = useState(null);
  const [loadingSquad, setLoadingSquad] = useState(false);
  const [cooldownTimeLeft, setCooldownTimeLeft] = useState(0);
  const [summoningTitan, setSummoningTitan] = useState(false);

  const { setMobileTab, addToast } = useUIStore();
  const startSession = useWorkoutStore((state) => state.startSession);
  const setOverdrive = useWorkoutStore((state) => state.setOverdrive);

  const { user, profile } = useAuthStore();

  const handlePurchaseItem = async (item, durationDays = null) => {
    if (!user?.uid || !profile) return;
    
    const isConsumable = item.type === 'consumable';
    let cost = item.cost;
    let discount = 0;
    
    if (!isConsumable) {
      if (!durationDays) {
        setSelectedShopItem(item);
        setSelectedDuration(10); // default to 10 days
        return;
      }
      const rates = durationOptions[item.key];
      cost = rates[durationDays];
      if (item.type === 'aura') {
        discount = getUpgradeDiscount(item.key, durationDays, profile.powerUps);
      }
    }
    
    const finalCost = cost - discount;
    
    if (xp < finalCost) {
      addToast('Insufficient XP Balance!', 'error');
      return;
    }

    try {
      const res = await callZenkaiAPI('purchaseStoreItem', {
        itemKey: item.key,
        durationDays,
        finalCost
      });
      const { nextPowerUps, updates, finalCost: backendCost } = res.data;

      const updatedProfile = {
        ...profile,
        xp: xp - backendCost,
        powerUps: nextPowerUps,
        ...(updates.aura ? { aura: updates.aura } : {}),
        ...(updates.activeTitle ? { activeTitle: updates.activeTitle } : {})
      };

      useAuthStore.getState().setProfile(updatedProfile);

      if (isConsumable) {
        addToast(`Purchased ${item.name}! 🚀`, 'success');
      } else {
        addToast(`Successfully acquired ${item.name}! ✨`, 'success');
      }
      
      setSelectedShopItem(null);
    } catch (err) {
      console.error('[MobileChallenges] Store purchase error:', err);
      addToast(err.message, 'error');
    }
  };

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
  const cumulativeXP = profile?.cumulativeXP ?? xp;
  const { level, levelName } = deriveLevelFromXP(cumulativeXP);

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

  // Listen to joined squads in real-time on mobile
  useEffect(() => {
    if (!user?.uid) return;
    setLoadingSquad(true);
    const q = query(
      collection(db, 'shared_squads'),
      where('memberUids', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setActiveSquad(snap.docs[0].data());
      } else {
        setActiveSquad(null);
      }
      setLoadingSquad(false);
    }, (err) => {
      console.error('[MobileChallenges] Squad query failed:', err);
      setLoadingSquad(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Cooldown countdown timer effect
  useEffect(() => {
    const challenge = activeSquad?.activeChallenge;
    if (!challenge || challenge.status !== 'completed' || !challenge.completedAt) {
      setCooldownTimeLeft(0);
      return;
    }

    const updateTimer = () => {
      const completedAtMs = typeof challenge.completedAt.toDate === 'function'
        ? challenge.completedAt.toDate().getTime()
        : new Date(challenge.completedAt).getTime();
      
      const elapsed = Date.now() - completedAtMs;
      const cooldownMs = 24 * 60 * 60 * 1000;
      const remaining = Math.max(0, cooldownMs - elapsed);
      setCooldownTimeLeft(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeSquad?.activeChallenge]);

  const formatCooldownTime = (ms) => {
    if (ms <= 0) return '';
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSummonNextTitan = async () => {
    if (!activeSquad || !user?.uid) return;
    const currentKeys = profile?.powerUps?.bossFightKey || 0;
    const cost = cooldownTimeLeft > 0 ? 2 : 1;

    if (currentKeys < cost) {
      addToast(`Insufficient Boss Keys. You need ${cost} keys, you have ${currentKeys}.`, 'error');
      return;
    }

    if (!window.confirm(`Spend ${cost} Boss Key${cost > 1 ? 's' : ''} to summon the next Titan Raid?`)) {
      return;
    }

    setSummoningTitan(true);
    try {
      const res = await callZenkaiAPI('summonNextTitan', { squadCode: activeSquad.squadCode });
      if (res.data && res.data.success) {
        // Update local profile keys
        const currentProfile = useAuthStore.getState().profile || {};
        useAuthStore.getState().setProfile({
          ...currentProfile,
          powerUps: {
            ...currentProfile.powerUps,
            bossFightKey: res.data.nextKeys
          }
        });
        
        addToast("Titan successfully summoned! ⚔️", 'success');
      }
    } catch (err) {
      console.error('[summonNextTitan] Error:', err);
      addToast(err.message || "Failed to summon next Titan.", 'error');
    } finally {
      setSummoningTitan(false);
    }
  };

  const handleOpenChest = async (chestType) => {
    if (!user?.uid || openingChest) return;
    
    const cost = chestType === 'common' ? 1 : chestType === 'rare' ? 3 : 5;
    const currentKeys = profile?.powerUps?.bossFightKey || 0;

    if (currentKeys < cost) {
      addToast(`Insufficient Boss Keys. Costs ${cost} keys, you have ${currentKeys}.`, 'error');
      return;
    }

    setOpeningChest(true);
    setChestOpeningType(chestType);
    setOpenedReward(null);
    setOpenedTier(null);

    try {
      const startTime = Date.now();
      const res = await callZenkaiAPI('openTreasureChest', { chestType });
      const elapsed = Date.now() - startTime;
      const minDuration = 1800; // 1.8 seconds for premium opening feel
      if (elapsed < minDuration) {
        await new Promise(resolve => setTimeout(resolve, minDuration - elapsed));
      }

      if (res.data && res.data.success) {
        const { reward, tier, nextKeys, nextXp, nextLevel } = res.data;
        
        // Update local profile immediately
        const currentProfile = useAuthStore.getState().profile || {};
        const nextPowerUps = { ...currentProfile.powerUps };
        nextPowerUps.bossFightKey = nextKeys;

        if (reward.type === 'consumable') {
          nextPowerUps[reward.key] = (nextPowerUps[reward.key] || 0) + reward.value;
        } else if (reward.type === 'title' || reward.type === 'aura') {
          const dbKey = reward.type === 'title' 
            ? `unlocked_title_${reward.key}_until` 
            : `unlocked_aura_${reward.key}_until`;
          
          const currentUntil = nextPowerUps[dbKey];
          let baseTime = Date.now();
          if (currentUntil) {
            const currentUntilMs = new Date(currentUntil).getTime();
            if (currentUntilMs > Date.now()) {
              baseTime = currentUntilMs;
            }
          }
          const untilDate = new Date(baseTime + reward.days * 24 * 60 * 60 * 1000);
          nextPowerUps[dbKey] = untilDate.toISOString();
        }

        // Apply changes to store
        useAuthStore.getState().setProfile({
          ...currentProfile,
          xp: nextXp,
          level: nextLevel,
          powerUps: nextPowerUps
        });

        // Sync with squad_codes as well (if present)
        if (profile.squadCode) {
          const { doc, setDoc } = await import('firebase/firestore');
          const codeRef = doc(db, 'squad_codes', profile.squadCode);
          await setDoc(codeRef, {
            xp: nextXp,
            level: nextLevel,
            powerUps: nextPowerUps,
            updatedAt: new Date()
          }, { merge: true }).catch(err => console.warn('[MobileChallenges] Sync keys error:', err));
        }

        setOpenedReward(reward);
        setOpenedTier(tier);
      }
    } catch (err) {
      console.error('[openTreasureChest] Error:', err);
      addToast(err.message || 'Failed to open treasure chest.', 'error');
    } finally {
      setOpeningChest(false);
    }
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
      <div className="border-b-2 border-[var(--border)] pb-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          {/* Small Zenkai Logo */}
          <div className="w-8 h-8 rounded bg-black border border-[var(--border)] flex items-center justify-center overflow-hidden shrink-0 select-none">
            <img src="/logos/zenkai_official_logo.webp" alt="Zenkai Logo" className="w-full h-full object-contain p-0.5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight uppercase leading-none font-barlow text-white">
              Challenge Hub
            </h1>
            <p className="text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider mt-1">
              Build consistency & earn base XP
            </p>
          </div>
        </div>

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
              onClick={() => setActiveTab('challenges')}
              className={`flex-1 py-2.5 text-xs font-mono font-bold uppercase transition-all tracking-wider ${
                activeTab === 'challenges'
                  ? 'bg-[var(--primary)] text-white font-black'
                  : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              Challenges
            </button>
            <button
              onClick={() => setActiveTab('store')}
              className={`flex-1 py-2.5 text-xs font-mono font-bold uppercase transition-all tracking-wider ${
                activeTab === 'store'
                  ? 'bg-[var(--primary)] text-white font-black'
                  : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              Store & Tree
            </button>
          </div>

          {activeTab === 'challenges' ? (
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
              </div>

              {/* Active Challenges */}
              <div className="mt-2">
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

              {/* Available Challenges */}
              <div className="mt-4">
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-3 flex items-center gap-1.5">
                  <Trophy size={14} className="text-[var(--primary)]" />
                  <span>Available Challenges</span>
                </h2>

                {availableChallenges.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {availableChallenges.map((challenge) => {
                      const cooldownUntil = profile?.cooldowns?.[challenge.id] || profile?.cooldowns?.[challenge.type];
                      const isLocked = cooldownUntil && cooldownUntil > Date.now();

                      return (
                        <motion.div
                          key={challenge.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`border-2 border-black bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-3 relative overflow-hidden ${isLocked ? 'opacity-85' : ''}`}
                        >
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
                ) : activeCampaigns.length > 0 ? (
                  <div className="border-2 border-dashed border-[var(--border)] bg-[var(--surface)] p-6 rounded-lg text-center flex flex-col items-center gap-2 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                    <CheckCircle2 size={20} className="text-[var(--accent-xp)]" />
                    <span className="text-xs font-display font-bold uppercase tracking-wider text-[var(--text-primary)]">
                      Campaign Slot Full
                    </span>
                    <span className="text-[10px] font-sans text-[var(--text-secondary)] max-w-xs leading-relaxed">
                      You already have an active campaign running. Complete or abandon it to unlock new challenges! 🏆
                    </span>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-[var(--border)] bg-[var(--surface)] p-6 rounded-lg text-center shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                    <span className="text-xs font-sans text-[var(--text-secondary)]">
                      You have accepted all available challenges! 🏆
                    </span>
                  </div>
                )}
              </div>

              {/* Completed Badges */}
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
            <div className="flex flex-col gap-4">
              {/* Store Sub-tabs */}
              <div className="flex bg-[var(--bg-elevated)] p-1 rounded-lg border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] shrink-0">
                <button
                  onClick={() => setStoreSubTab('perks')}
                  className={`flex-1 py-1.5 font-display text-[10px] font-extrabold uppercase tracking-widest rounded transition-all ${
                    storeSubTab === 'perks'
                      ? 'bg-amber-400 text-black shadow-[1.5px_1.5px_0px_black] border-2 border-black'
                      : 'text-[var(--text-secondary)] hover:text-white border-2 border-transparent'
                  }`}
                >
                  Perks Tree
                </button>
                <button
                  onClick={() => setStoreSubTab('shop')}
                  className={`flex-1 py-1.5 font-display text-[10px] font-extrabold uppercase tracking-widest rounded transition-all ${
                    storeSubTab === 'shop'
                      ? 'bg-amber-400 text-black shadow-[1.5px_1.5px_0px_black] border-2 border-black'
                      : 'text-[var(--text-secondary)] hover:text-white border-2 border-transparent'
                  }`}
                >
                  Armory Shop
                </button>
                <button
                  onClick={() => setStoreSubTab('vault')}
                  className={`flex-1 py-1.5 font-display text-[10px] font-extrabold uppercase tracking-widest rounded transition-all ${
                    storeSubTab === 'vault'
                      ? 'bg-amber-400 text-black shadow-[1.5px_1.5px_0px_black] border-2 border-black'
                      : 'text-[var(--text-secondary)] hover:text-white border-2 border-transparent'
                  }`}
                >
                  Vault
                </button>
              </div>

              {storeSubTab === 'perks' && (
                /* Fitness Skill Tree Section */
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
                          className={`border-2 p-3 rounded-lg flex items-start gap-3 transition-all ${
                            isUnlocked
                              ? 'bg-gradient-to-r from-[#172e24] to-[#111] border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.25),2px_2px_0px_rgba(0,0,0,1)]'
                              : 'bg-[var(--bg-elevated)] border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]'
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
                                <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)] px-1.5 py-0.5 border border-[var(--border)] bg-[var(--surface)] rounded flex items-center gap-1">
                                  <Lock size={8} />
                                  <span>4 SP COST</span>
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

                  {/* Future Expansions / Coming Soon Banners */}
                  <div className="border-t border-dashed border-[var(--border)] pt-4 mt-2">
                    <div className="text-[9px] font-mono text-neutral-500 uppercase font-bold tracking-wider mb-2.5 text-left flex items-center gap-1.5">
                      <span>🔒 Locked Future Expansions</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {/* Chained Coming Soon Card */}
                      <div className="border-2 border-black bg-neutral-950/20 p-4 rounded-lg flex flex-col gap-2 relative overflow-hidden shadow-[2px_2px_0px_rgba(0,0,0,1)] select-none min-h-[90px] justify-center text-center items-center">
                        {/* Chains graphic background */}
                        <div className="absolute inset-0 opacity-15 flex items-center justify-center pointer-events-none text-2xl font-black">
                          🔗 🔗 🔗 🔗 🔗 🔗 🔗
                        </div>
                        
                        <div className="absolute top-2 right-[-24px] bg-amber-500 border border-black text-black text-[7px] font-mono font-bold uppercase py-0.5 px-6 rotate-45 tracking-widest shadow-sm">
                          Locked
                        </div>

                        <div className="p-2 border-2 border-black rounded-full bg-neutral-900 text-amber-500 shadow-[1.5px_1.5px_0px_black] z-10">
                          <Lock size={16} />
                        </div>
                        
                        <div className="z-10 mt-1">
                          <h4 className="font-display text-xs font-black uppercase tracking-widest font-barlow text-white">
                            Expansion Slot Soon
                          </h4>
                          <p className="text-[8px] text-neutral-400 font-sans mt-0.5 max-w-[220px] mx-auto leading-normal">
                            Advanced skill tree nodes are under construction. New pathways will unlock next season!
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {storeSubTab === 'shop' && (
                /* Armory & XP Shop Section */
                <div className="border-2 border-black bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-4">
                  <div className="border-b border-[var(--border)] pb-3 flex justify-between items-center">
                    <div>
                      <h2 className="font-display text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5 font-barlow">
                        <Sparkles size={14} className="text-amber-400" />
                        <span>Zenkai Armory & XP Shop</span>
                      </h2>
                      <p className="text-[9px] font-mono text-[var(--text-secondary)] uppercase mt-0.5">
                        Spend your XP to unlock consumables, titles, and glowing auras
                      </p>
                    </div>
                    <div className="px-2.5 py-1 border-2 border-black bg-amber-400 text-black font-mono font-bold text-[10px] rounded shadow-[2px_2px_0px_rgba(0,0,0,1)] font-barlow">
                      {xp} XP
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {shopItems.map((item) => {
                      const isConsumable = item.type === 'consumable';
                      const isTitle = item.type === 'title';
                      const isAura = item.type === 'aura';

                      let count = 0;
                      let isUnlocked = false;
                      let isEquipped = false;

                      if (isConsumable) {
                        count = profile?.powerUps?.[item.key] || 0;
                      } else if (isTitle) {
                        isUnlocked = isTitleActive(item.key, profile?.powerUps);
                        isEquipped = isUnlocked && profile?.activeTitle === item.name;
                      } else if (isAura) {
                        isUnlocked = isAuraActive(item.key, profile?.powerUps);
                        isEquipped = isUnlocked && profile?.aura === item.key;
                      }

                      const Icon = item.icon;

                      return (
                        <div
                          key={item.key}
                          className="border-2 border-black bg-[var(--bg-elevated)] p-3 rounded-lg shadow-[2px_2px_0px_rgba(0,0,0,1)] flex flex-col justify-between gap-3 transition-all"
                        >
                          <div className="flex flex-col gap-2">
                            {/* Top visual row */}
                            <div className="flex justify-between items-start">
                              {isAura ? (
                                <div
                                  className="w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0"
                                  style={{
                                    borderColor: item.color,
                                    boxShadow: `0 0 8px ${item.color}`,
                                    background: `${item.color}15`
                                  }}
                                >
                                  <span className="text-[10px]">✨</span>
                                </div>
                              ) : (
                                <div className={`p-1.5 border border-black rounded shrink-0 ${isConsumable ? 'bg-neutral-800 text-[var(--primary)]' : 'bg-neutral-800 text-[var(--secondary)]'}`}>
                                  <Icon size={14} />
                                </div>
                              )}

                              {/* Status Badge */}
                              {isConsumable ? (
                                <span className="text-[8px] font-mono text-amber-400 font-bold bg-neutral-900 border border-neutral-800 px-1 py-0.5 rounded">
                                  {count} OWNED
                                </span>
                              ) : isUnlocked ? (
                                <span className="text-[7px] font-mono text-emerald-400 border border-emerald-500/30 bg-emerald-950/30 px-1 py-0.5 rounded font-bold uppercase">
                                  {isEquipped ? 'EQUIPPED' : 'RENTED'} ({getDaysLeft(profile?.powerUps?.[`unlocked_${item.type}_${item.key}_until`])})
                                </span>
                              ) : null}
                            </div>

                            {/* Text Details */}
                            <div className="min-w-0">
                              <h4 className="font-display text-xs font-extrabold uppercase tracking-wide font-barlow text-white leading-tight">
                                {isTitle ? `[${item.name}]` : item.name}
                              </h4>
                              <p className="text-[9px] text-[var(--text-secondary)] font-sans mt-1 leading-snug">
                                {item.description}
                              </p>
                            </div>
                          </div>

                          {/* Button Row */}
                          <div>
                            {isConsumable ? (
                              <button
                                onClick={() => handlePurchaseItem(item)}
                                disabled={xp < item.cost}
                                className="w-full py-1.5 border-2 border-black bg-amber-400 hover:bg-amber-500 text-black font-display font-extrabold text-[9px] uppercase tracking-wide shadow-[1.5px_1.5px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-45 disabled:pointer-events-none transition-all cursor-pointer font-barlow"
                              >
                                Buy {item.cost} XP
                              </button>
                            ) : isUnlocked ? (
                              <div className="flex flex-col gap-1 w-full">
                                {!isEquipped && (
                                  <button
                                    onClick={async () => {
                                      try {
                                        const { doc, updateDoc } = await import('firebase/firestore');
                                        const { db } = await import('../../lib/firebase');
                                        const userRef = doc(db, 'users', user.uid);
                                        const updateField = isTitle ? { activeTitle: item.name } : { aura: item.key };
                                        await updateDoc(userRef, updateField);
                                        useAuthStore.getState().setProfile({ ...profile, ...updateField });
                                        addToast(`Equipped ${isTitle ? 'title' : 'aura'}: ${item.name}!`, 'success');

                                        if (profile.squadCode) {
                                          const codeRef = doc(db, 'squad_codes', profile.squadCode);
                                          await updateDoc(codeRef, updateField).catch(err => console.warn(err));
                                        }
                                      } catch (e) {
                                        addToast(`Failed to equip ${isTitle ? 'title' : 'aura'}`, 'error');
                                      }
                                    }}
                                    className="w-full py-1.5 border border-black bg-neutral-800 text-white font-display font-extrabold text-[9px] uppercase tracking-wide shadow-[1.5px_1.5px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer font-barlow"
                                  >
                                    Equip
                                  </button>
                                )}
                                <button
                                  onClick={() => handlePurchaseItem(item)}
                                  className="w-full py-1.5 border-2 border-black bg-amber-400 hover:bg-amber-500 text-black font-display font-extrabold text-[9px] uppercase tracking-wide shadow-[1.5px_1.5px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer font-barlow"
                                >
                                  Extend
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handlePurchaseItem(item)}
                                className="w-full py-1.5 border-2 border-black bg-amber-400 hover:bg-amber-500 text-black font-display font-extrabold text-[9px] uppercase tracking-wide shadow-[1.5px_1.5px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer font-barlow"
                              >
                                Unlock
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {storeSubTab === 'vault' && (
                <div className="flex flex-col gap-4 text-left font-mono text-xs">
                  {/* Treasure Vault Intro Card */}
                  <div className="border-2 border-black bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-3">
                    <div className="flex justify-between items-center border-b border-[var(--border)] pb-2.5">
                      <div className="flex flex-col text-left">
                        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5 font-barlow">
                          <Key size={14} className="text-amber-400 animate-pulse" />
                          <span>Treasure Vault</span>
                        </h2>
                        <p className="text-[9px] font-mono text-[var(--text-secondary)] uppercase mt-0.5">
                          Spend Boss Keys on Loot Boxes
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="px-2.5 py-1 border-2 border-black bg-amber-400 text-black font-mono font-bold text-[10px] rounded shadow-[2px_2px_0px_rgba(0,0,0,1)] font-barlow flex items-center gap-1 shrink-0">
                          <Key size={12} />
                          <span>{profile?.powerUps?.bossFightKey || 0} keys</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      Earn Boss Keys by conquering weekly squad Titan Raids. Spend them here to open treasure boxes with random premium loot!
                    </p>
                  </div>

                  {/* Three Chests Rendering */}
                  <div className="flex flex-col gap-5">
                    {/* Common Chest */}
                    <div className="border-2 border-black bg-amber-950/10 p-5 rounded-2xl shadow-[4px_4px_0px_black] flex flex-col justify-between gap-4 border-amber-900 text-left">
                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-mono text-amber-500 font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                            Common Chest
                          </span>
                        </div>
                        <div className="w-36 h-36 mx-auto bg-amber-950/20 border-2 border-black rounded-xl flex items-center justify-center relative select-none shadow-[2px_2px_0px_black]">
                          <img src="/common_chest.webp" alt="Common Chest" loading="lazy" className="h-32 w-32 object-contain hover:scale-[1.1] transition-transform duration-300" />
                        </div>
                        <h5 className="font-display font-black text-lg text-white uppercase tracking-wide font-barlow">
                          Bronze Vault Box
                        </h5>
                        <p className="text-[11px] text-neutral-400 font-sans leading-snug">
                          A solid entry-level vault chest containing basic consumables and small chunks of XP.
                        </p>
                        
                        {/* Rarity rates */}
                        <div className="bg-black/30 border border-neutral-900 rounded-lg p-3 flex flex-col gap-1 text-[10px] font-mono">
                          <span className="text-neutral-500 uppercase font-bold text-[9px]">Loot Drop Rates:</span>
                          <div className="flex justify-between text-neutral-300">
                            <span>Common Reward:</span>
                            <span className="font-bold text-white">70%</span>
                          </div>
                          <div className="flex justify-between text-blue-400">
                            <span>Rare Reward:</span>
                            <span className="font-bold">25%</span>
                          </div>
                          <div className="flex justify-between text-purple-400">
                            <span>Legendary Reward:</span>
                            <span className="font-bold">5%</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleOpenChest('common')}
                        disabled={openingChest || (profile?.powerUps?.bossFightKey || 0) < 1}
                        className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-black font-display font-black text-xs uppercase py-3 border-2 border-black rounded-xl shadow-[3px_3px_0px_black] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer text-center font-barlow"
                      >
                        Open (1 Boss Key 🔑)
                      </button>
                    </div>

                    {/* Rare Chest */}
                    <div className="border-2 border-black bg-blue-950/10 p-5 rounded-2xl shadow-[4px_4px_0px_black] flex flex-col justify-between gap-4 border-blue-900 text-left">
                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-mono text-blue-400 font-bold uppercase tracking-wider bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
                            Rare Chest
                          </span>
                        </div>
                        <div className="w-36 h-36 mx-auto bg-blue-950/20 border-2 border-black rounded-xl flex items-center justify-center relative select-none shadow-[2px_2px_0px_black]">
                          <img src="/rare_chest.webp" alt="Rare Chest" loading="lazy" className="h-32 w-32 object-contain hover:scale-[1.1] transition-transform duration-300" />
                        </div>
                        <h5 className="font-display font-black text-lg text-white uppercase tracking-wide font-barlow">
                          Iron Vault Chest
                        </h5>
                        <p className="text-[11px] text-neutral-400 font-sans leading-snug">
                          A fortified chest with a significantly higher chance at rare title rewards, multiple skips, and high XP tiers.
                        </p>
                        
                        {/* Rarity rates */}
                        <div className="bg-black/30 border border-neutral-900 rounded-lg p-3 flex flex-col gap-1 text-[10px] font-mono">
                          <span className="text-neutral-500 uppercase font-bold text-[9px]">Loot Drop Rates:</span>
                          <div className="flex justify-between text-neutral-300">
                            <span>Common Reward:</span>
                            <span className="font-bold text-white">15%</span>
                          </div>
                          <div className="flex justify-between text-blue-400">
                            <span>Rare Reward:</span>
                            <span className="font-bold">65%</span>
                          </div>
                          <div className="flex justify-between text-purple-400">
                            <span>Legendary Reward:</span>
                            <span className="font-bold">20%</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleOpenChest('rare')}
                        disabled={openingChest || (profile?.powerUps?.bossFightKey || 0) < 3}
                        className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-black font-display font-black text-xs uppercase py-3 border-2 border-black rounded-xl shadow-[3px_3px_0px_black] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer text-center font-barlow"
                      >
                        Open (3 Boss Keys 🔑)
                      </button>
                    </div>

                    {/* Legendary Chest */}
                    <div className="border-2 border-black bg-purple-950/10 p-5 rounded-2xl shadow-[4px_4px_0px_black] flex flex-col justify-between gap-4 border-purple-900 text-left">
                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-mono text-purple-400 font-bold uppercase tracking-wider bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">
                            Legendary Chest
                          </span>
                        </div>
                        <div className="w-36 h-36 mx-auto bg-purple-950/20 border-2 border-black rounded-xl flex items-center justify-center relative select-none shadow-[2px_2px_0px_black]">
                          <img src="/legendary_chest.webp" alt="Legendary Chest" loading="lazy" className="h-32 w-32 object-contain hover:scale-[1.1] transition-transform duration-300" />
                        </div>
                        <h5 className="font-display font-black text-lg text-white uppercase tracking-wide font-barlow">
                          Obsidian Vault Relic
                        </h5>
                        <p className="text-[11px] text-neutral-400 font-sans leading-snug">
                          The ultimate vault treasure. Guarantees 75% Legendary drops including glowing avatar auras and major XP boosts.
                        </p>
                        
                        {/* Rarity rates */}
                        <div className="bg-black/30 border border-neutral-900 rounded-lg p-3 flex flex-col gap-1 text-[10px] font-mono">
                          <span className="text-neutral-500 uppercase font-bold text-[9px]">Loot Drop Rates:</span>
                          <div className="flex justify-between text-neutral-350">
                            <span>Common Reward:</span>
                            <span className="font-bold text-white">0%</span>
                          </div>
                          <div className="flex justify-between text-blue-400">
                            <span>Rare Reward:</span>
                            <span className="font-bold">25%</span>
                          </div>
                          <div className="flex justify-between text-purple-400">
                            <span>Legendary Reward:</span>
                            <span className="font-bold">75%</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleOpenChest('legendary')}
                        disabled={openingChest || (profile?.powerUps?.bossFightKey || 0) < 5}
                        className="w-full bg-purple-500 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-display font-black text-xs uppercase py-3 border-2 border-black rounded-xl shadow-[3px_3px_0px_black] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer text-center font-barlow"
                      >
                        Open (5 Boss Keys 🔑)
                      </button>
                    </div>
                  </div>

                  {/* Cooldown and Portal summoning Section */}
                  {activeSquad ? (
                    <div className="border-2 border-black bg-neutral-950 p-4 rounded-lg shadow-[3px_3px_0px_rgba(0,0,0,1)] mt-2 flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col text-left">
                          <span className="text-[9px] font-mono text-purple-400 font-bold uppercase tracking-wider">🌌 Titan Summon Portal</span>
                          <h4 className="font-display text-xs font-bold uppercase text-white font-barlow mt-0.5">
                            {cooldownTimeLeft > 0 ? (
                              <>Cooldown: <span className="text-red-500">{formatCooldownTime(cooldownTimeLeft)}</span></>
                            ) : (
                              <span className="text-green-500">Portal Ready!</span>
                            )}
                          </h4>
                        </div>
                        <span className="text-[9px] font-mono text-[var(--text-secondary)] bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 rounded uppercase font-bold">
                          Squad: {activeSquad.squadName}
                        </span>
                      </div>
                      
                      <p className="text-[10px] text-neutral-400 font-sans leading-relaxed">
                        {cooldownTimeLeft > 0 
                          ? `The weekly Titan has been slayed! Bypassing the 24-hour summon cooldown costs 2 Boss Keys. You currently have ${profile?.powerUps?.bossFightKey || 0} keys.`
                          : "The summon portal is fully charged. Summon the next Titan Raid immediately for 1 Boss Key!"}
                      </p>

                      {activeSquad.activeChallenge?.status === 'completed' ? (
                        <button
                          onClick={handleSummonNextTitan}
                          disabled={summoningTitan}
                          className={`w-full py-2 border-2 border-black font-display font-extrabold text-xs uppercase tracking-wider shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-center cursor-pointer font-barlow ${
                            cooldownTimeLeft > 0
                              ? 'bg-purple-600 hover:bg-purple-700 text-white'
                              : 'bg-green-500 hover:bg-green-600 text-black'
                          }`}
                        >
                          {summoningTitan ? "Summoning..." : `Summon Next Titan (${cooldownTimeLeft > 0 ? 2 : 1} Keys)`}
                        </button>
                      ) : (
                        <div className="border border-dashed border-neutral-850 p-2.5 rounded text-center">
                          <span className="text-[9px] font-mono text-red-500 font-bold uppercase">⚔️ Titan Raid In Progress</span>
                          <p className="text-[9px] text-neutral-500 font-sans mt-0.5 leading-snug">
                            Defeat your active weekly Raid Boss, "{activeSquad.activeChallenge?.title}", before summoning another one!
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-neutral-800 p-4 rounded-lg bg-neutral-950/20 text-center flex flex-col items-center gap-1.5">
                      <Lock size={18} className="text-neutral-600" />
                      <span className="text-[10px] font-mono text-neutral-500 uppercase font-bold">Summon Portal Locked</span>
                      <p className="text-[9px] text-neutral-600 font-sans max-w-xs leading-relaxed">
                        You are not a member of any accountability squad. Go join/create a squad in the squads tab to participate in Titan Raids.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Treasure Chest Opening Modal */}
          <AnimatePresence>
            {(openingChest || openedReward) && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[150] p-4 backdrop-blur-md">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[8px_8px_0px_black] w-full max-w-sm text-center flex flex-col items-center gap-5 relative font-mono text-xs border-amber-500"
                >
                  {openingChest ? (
                    /* Opening Animation State */
                    <div className="py-8 flex flex-col items-center gap-4">
                      <motion.div
                        animate={{
                          rotate: [0, -8, 8, -8, 8, -4, 4, 0],
                          scaleX: [1, 1.15, 0.85, 1.1, 0.95, 1],
                          scaleY: [1, 0.85, 1.15, 0.9, 1.05, 1],
                          y: [0, -15, 0, -5, 0]
                        }}
                        transition={{
                          repeat: Infinity,
                          duration: 0.8,
                          ease: "easeInOut"
                        }}
                        className="w-32 h-32 select-none flex items-center justify-center relative"
                      >
                        {/* Ambient glow background */}
                        <div className={`absolute inset-2 rounded-full blur-2xl opacity-75 -z-10 ${
                          chestOpeningType === 'legendary' 
                            ? 'bg-purple-500/50 shadow-[0_0_40px_rgba(168,85,247,0.8)]' 
                            : chestOpeningType === 'rare' 
                            ? 'bg-blue-500/50 shadow-[0_0_40px_rgba(59,130,246,0.8)]' 
                            : 'bg-amber-500/50 shadow-[0_0_40px_rgba(245,158,11,0.8)]'
                        }`} />

                        <img 
                          src={
                            chestOpeningType === 'common' ? '/common_chest.webp' : 
                            chestOpeningType === 'rare' ? '/rare_chest.webp' : 
                            '/legendary_chest.webp'
                          } 
                          alt="Opening Chest" 
                          loading="lazy"
                          className="w-28 h-28 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.4)] relative z-10" 
                        />

                        {/* Sparkles / particle bursts during cracking */}
                        <div className="absolute inset-0 pointer-events-none -z-10">
                          <motion.span 
                            animate={{ y: [-10, -40], x: [-5, -25], scale: [0, 1, 0], opacity: [0, 1, 0] }}
                            transition={{ repeat: Infinity, duration: 1.2, delay: 0.1 }}
                            className="absolute text-yellow-300 text-lg top-4 left-4"
                          >✨</motion.span>
                          <motion.span 
                            animate={{ y: [-15, -45], x: [5, 25], scale: [0, 1.2, 0], opacity: [0, 1, 0] }}
                            transition={{ repeat: Infinity, duration: 1.0, delay: 0.3 }}
                            className="absolute text-amber-300 text-base top-6 right-4"
                          >✨</motion.span>
                          <motion.span 
                            animate={{ y: [10, -20], x: [-15, -35], scale: [0, 0.8, 0], opacity: [0, 1, 0] }}
                            transition={{ repeat: Infinity, duration: 1.5, delay: 0.5 }}
                            className="absolute text-white text-sm bottom-8 left-2"
                          >✨</motion.span>
                          <motion.span 
                            animate={{ y: [12, -25], x: [15, 35], scale: [0, 1.1, 0], opacity: [0, 1, 0] }}
                            transition={{ repeat: Infinity, duration: 1.3, delay: 0.2 }}
                            className="absolute text-yellow-400 text-sm bottom-6 right-2"
                          >✨</motion.span>
                        </div>
                      </motion.div>
                      <h4 className="font-display font-black text-lg text-white uppercase tracking-wider animate-pulse mt-2 font-barlow">
                        Cracking the Vault...
                      </h4>
                      <p className="text-[10px] text-neutral-400 font-sans px-4">
                        Consulting the oracle ledger for rolled drops. Stand by...
                      </p>
                      <div className="h-2 w-48 bg-neutral-900 border border-neutral-800 rounded-full overflow-hidden p-[1px] mt-1">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: "100%" }}
                          transition={{ duration: 1.8, ease: "easeInOut" }}
                          className="h-full bg-amber-400 rounded-full"
                        />
                      </div>
                    </div>
                  ) : (
                    /* Reward Revealed State */
                    <div className="flex flex-col items-center gap-4 w-full">
                      <span className="text-[10px] text-[var(--accent-xp)] font-extrabold uppercase tracking-widest bg-[var(--accent-xp)]/10 border border-[var(--accent-xp)]/25 px-3 py-1 rounded">
                        Loot Rolled successfully! 🎉
                      </span>

                      {/* Sparkles / Aura Glow for reward item */}
                      <div 
                        className={`w-24 h-24 rounded-full border-4 border-black flex items-center justify-center text-4xl shadow-[4px_4px_0px_black] mt-2 select-none ${
                          openedTier === 'legendary' 
                            ? 'bg-purple-950/40 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.4)] animate-pulse'
                            : openedTier === 'rare'
                            ? 'bg-blue-950/40 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                            : 'bg-amber-950/40 border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                        }`}
                      >
                        {openedReward.type === 'xp' ? '⚡' : 
                         openedReward.type === 'consumable' ? '⏭️' : 
                         openedReward.type === 'title' ? '👑' : '✨'}
                      </div>

                      <div className="flex flex-col gap-1 mt-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${
                          openedTier === 'legendary' ? 'text-purple-400' :
                          openedTier === 'rare' ? 'text-blue-400' : 'text-amber-500'
                        }`}>
                          {openedTier} Reward
                        </span>
                        <h4 className="font-display font-black text-xl text-white uppercase tracking-tight leading-none mt-1 font-barlow">
                          {openedReward.name}
                        </h4>
                        <p className="text-xs text-neutral-300 font-sans mt-2.5 px-4 leading-relaxed">
                          {openedReward.description}
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          setOpenedReward(null);
                          setOpeningChest(false);
                          setChestOpeningType(null);
                        }}
                        className="w-full mt-4 bg-[var(--accent-xp)] hover:bg-[#a3f020] text-black font-display font-black text-sm uppercase py-3 border-2 border-black rounded-xl shadow-[3px_3px_0px_black] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer font-barlow"
                      >
                        Sweet! Claim Loot
                      </button>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* ─── DURATION / RENTAL SELECTOR MODAL ──────────────────────────────── */}
          {selectedShopItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full max-w-sm border-4 border-black bg-[var(--surface)] p-6 rounded-lg shadow-[8px_8px_0px_rgba(0,0,0,1)] relative overflow-hidden"
              >
                {/* Glow highlight based on aura or title color */}
                <div 
                  className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl pointer-events-none opacity-20"
                  style={{
                    backgroundColor: selectedShopItem.color || '#eab308'
                  }}
                />
                
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider text-amber-400 border border-amber-500/30 bg-amber-950/20 rounded">
                    🛒 SHOP RENTAL
                  </span>
                </div>
                
                <h3 className="font-display text-xl font-black uppercase tracking-wide font-barlow text-white">
                  Rent {selectedShopItem.type === 'title' ? `[${selectedShopItem.name}]` : selectedShopItem.name}
                </h3>
                
                <p className="text-xs text-[var(--text-secondary)] font-sans mt-1 leading-relaxed">
                  Choose your rental period. Purchasing an active rental will extend your current expiration date.
                </p>

                {/* Duration Options */}
                <div className="flex flex-col gap-2 mt-4">
                  {[10, 15, 30].map((days) => {
                    const price = durationOptions[selectedShopItem.key]?.[days] || 0;
                    const discount = selectedShopItem.type === 'aura' ? getUpgradeDiscount(selectedShopItem.key, days, profile?.powerUps) : 0;
                    const finalPrice = price - discount;
                    const isSelected = selectedDuration === days;
                    return (
                      <button
                        key={days}
                        onClick={() => setSelectedDuration(days)}
                        className={`flex justify-between items-center px-4 py-3 border-2 border-black rounded font-mono text-xs shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all ${
                          isSelected
                            ? 'bg-amber-400 text-black shadow-none translate-x-0.5 translate-y-0.5 font-bold'
                            : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-neutral-800'
                        }`}
                      >
                        <span className="uppercase tracking-wider">{days} Days Rental</span>
                        <div className="flex items-center gap-1.5 font-bold">
                          {discount > 0 && <span className="text-[10px] line-through text-red-500">{price} XP</span>}
                          <span>{finalPrice} XP</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Transaction Details */}
                <div className="mt-4 p-3 bg-[var(--bg-elevated)] border-2 border-black rounded flex flex-col gap-1.5 font-mono text-[10px] uppercase text-[var(--text-secondary)]">
                  {(() => {
                    const baseCost = durationOptions[selectedShopItem.key]?.[selectedDuration] || 0;
                    const discount = selectedShopItem.type === 'aura' ? getUpgradeDiscount(selectedShopItem.key, selectedDuration, profile?.powerUps) : 0;
                    const finalCost = baseCost - discount;
                    const remainingBalance = xp - finalCost;
                    return (
                      <>
                        <div className="flex justify-between">
                          <span>Current Balance:</span>
                          <span className="text-white font-bold">{xp} XP</span>
                        </div>
                        {discount > 0 && (
                          <div className="flex justify-between text-emerald-400 font-bold font-mono text-[10px]">
                            <span>Upgrade Discount:</span>
                            <span>+{discount} XP</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>Rental Cost:</span>
                          <span className="text-amber-400 font-bold">-{finalCost} XP</span>
                        </div>
                        <div className="border-t border-[var(--border)] my-1" />
                        <div className="flex justify-between text-xs">
                          <span className="text-white">Remaining Balance:</span>
                          <span className={`font-bold ${remainingBalance >= 0 ? 'text-emerald-400' : 'text-red-500'}`}>
                            {remainingBalance} XP
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-6">
                  {(() => {
                    const baseCost = durationOptions[selectedShopItem.key]?.[selectedDuration] || 0;
                    const discount = selectedShopItem.type === 'aura' ? getUpgradeDiscount(selectedShopItem.key, selectedDuration, profile?.powerUps) : 0;
                    const finalCost = baseCost - discount;
                    return (
                      <button
                        onClick={() => handlePurchaseItem(selectedShopItem, selectedDuration)}
                        disabled={xp < finalCost}
                        className="flex-1 py-2.5 border-2 border-black bg-amber-400 hover:bg-amber-500 disabled:opacity-40 disabled:pointer-events-none text-black font-display font-extrabold text-xs uppercase tracking-wider shadow-[3px_3px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-center cursor-pointer font-barlow"
                      >
                        CONFIRM RENTAL
                      </button>
                    );
                  })()}
                  
                  <button
                    onClick={() => setSelectedShopItem(null)}
                    className="flex-1 py-2.5 border-2 border-black bg-[var(--bg-elevated)] hover:bg-[var(--surface)] text-[var(--text-primary)] font-display font-extrabold text-xs uppercase tracking-wider shadow-[3px_3px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-center cursor-pointer font-barlow"
                  >
                    CANCEL
                  </button>
                </div>
              </motion.div>
            </div>
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
