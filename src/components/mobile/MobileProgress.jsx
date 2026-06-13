import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, TrendingUp, BarChart2, Calendar, ArrowUpRight, ArrowDownRight, Dumbbell, RefreshCw, X, Share2, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { getAvatarStyle } from '../../lib/xpHelpers';
import { useStrengthData, useVolumeData, usePRList, clearStrengthCache } from '../../hooks/useProgress';
import { StrengthChart } from '../shared/StrengthChart';
import { VolumeChart } from '../shared/VolumeChart';
import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import exerciseBank from '../../data/exercises.json';
import { useUIStore } from '../../stores/useUIStore';
import { abbreviateExerciseName } from '../../lib/firestoreUtils';
import { calculateMuscleFatigue, getSecondaryMuscles } from '../../utils/fatigueCalculator';
import { generatePRCardImage, getMuscleGroupForExercise, fetchStrengthStandards } from '../shared/PRShareTemplate';
import { calculateDetailedMuscleStrength } from '../../utils/strengthCalculator';
import { MuscleMap, StrengthRadarChart, StrengthTiersLegend, MuscleDetailPanel } from '../shared/MuscleMap';


const TABS = ['Strength', 'Volume', 'PRs', 'Recovery'];

// Helper to format Date/Timestamp from Firestore
const formatPRDate = (dateVal) => {
  if (!dateVal) return 'Date unknown';
  let dateObj;
  if (dateVal.toDate && typeof dateVal.toDate === 'function') {
    dateObj = dateVal.toDate();
  } else {
    dateObj = new Date(dateVal);
  }
  if (isNaN(dateObj.getTime())) return 'Date unknown';
  return dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};



export const MobileProgress = () => {
  const navigate = useNavigate();
  const uid = useAuthStore((state) => state.uid);
  const profile = useAuthStore((state) => state.profile);
  const { prs, loading: prsLoading, refresh: refreshPRs } = usePRList(uid);
  const { addToast } = useUIStore();

  const [activeTab, setActiveTab] = useState('Strength');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [sessions, setSessions] = useState([]);
  const [loadingFatigue, setLoadingFatigue] = useState(true);
  const [fatigueData, setFatigueData] = useState({});
  const [selectedRecoveryMuscleKey, setSelectedRecoveryMuscleKey] = useState(null);

  const [mannequinView, setMannequinView] = useState('front');
  const [mannequinMode, setMannequinMode] = useState('fatigue');
  const [viewType, setViewType] = useState('grouped');

  const mannequinStrengthData = useMemo(() => {
    return calculateDetailedMuscleStrength(prs, profile);
  }, [prs, profile]);

  const handleRefresh = () => {
    clearStrengthCache();
    setRefreshTrigger((prev) => prev + 1);
    refreshPRs();
  };
  
  // Muscle group and exercise selection states
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('chest');
  const [selectedExercise, setSelectedExercise] = useState('barbell_bench_press');
  const [selectedExerciseName, setSelectedExerciseName] = useState('Barbell Bench Press');
  const [strengthRange, setStrengthRange] = useState(30); // 30 or 90 days
  
  // Selected PR state for celebration modal
  const [selectedPR, setSelectedPR] = useState(null);
  const [isSharing, setIsSharing] = useState(false);

  const { data: strengthData, loading: strengthLoading } = useStrengthData(uid, selectedExercise, strengthRange, refreshTrigger);
  const { data: volumeData, loading: volumeLoading } = useVolumeData(uid, 12);

  // Derive how many days of actual data the user has for this exercise.
  // strengthData is already in memory — zero extra Firestore reads.
  const oldestDataDaysAgo = useMemo(() => {
    if (!strengthData || strengthData.length === 0) return 0;
    const oldest = strengthData[0]?.date; // sorted ascending — first entry = oldest
    if (!oldest) return 0;
    return Math.floor((Date.now() - new Date(oldest).getTime()) / (1000 * 60 * 60 * 24));
  }, [strengthData]);

  // 90D view unlocked only once user has 30+ days of history for this specific exercise
  const can90D = oldestDataDaysAgo >= 30;

  // Muscle volume distribution state
  const [muscleDistribution, setMuscleDistribution] = useState({});
  const [muscleDistLoading, setMuscleDistLoading] = useState(true);

  // Compile list of unique exercises from PRs + fallback major compound lifts, mapping their muscleGroup
  const exerciseChips = useMemo(() => {
    const unique = [];
    const keys = new Set();
    
    // Create a map of exercise key/name to muscle group
    const exerciseToMuscleMap = {};
    exerciseBank.forEach((ex) => {
      exerciseToMuscleMap[ex.key] = ex.muscleGroup;
      exerciseToMuscleMap[ex.name.toLowerCase()] = ex.muscleGroup;
    });

    prs.forEach((pr) => {
      if (!keys.has(pr.exerciseKey)) {
        keys.add(pr.exerciseKey);
        const muscleGroup = exerciseToMuscleMap[pr.exerciseKey] || exerciseToMuscleMap[pr.exerciseName?.toLowerCase()] || 'other';
        unique.push({ 
          key: pr.exerciseKey, 
          name: pr.exerciseName, 
          muscleGroup 
        });
      }
    });

    const DEFAULT_CHIPS = [
      { key: 'barbell_bench_press', name: 'Bench Press', muscleGroup: 'chest' },
      { key: 'barbell_squat', name: 'Barbell Squat', muscleGroup: 'legs' },
      { key: 'barbell_deadlift', name: 'Barbell Deadlift', muscleGroup: 'back' },
      { key: 'overhead_press', name: 'Overhead Press', muscleGroup: 'shoulders' },
      { key: 'pull_ups', name: 'Pull Ups', muscleGroup: 'back' },
      { key: 'push_ups', name: 'Push Ups', muscleGroup: 'chest' },
      { key: 'dips', name: 'Dips', muscleGroup: 'arms' },
      { key: 'plank', name: 'Plank', muscleGroup: 'core' },
    ];

    DEFAULT_CHIPS.forEach((d) => {
      if (!keys.has(d.key)) {
        keys.add(d.key);
        unique.push(d);
      }
    });

    return unique;
  }, [prs]);

  // Filter chips by selected muscle group
  const filteredChips = useMemo(() => {
    return exerciseChips.filter((chip) => chip.muscleGroup === selectedMuscleGroup);
  }, [exerciseChips, selectedMuscleGroup]);

  // Sync selected exercise when filtered chips load
  useEffect(() => {
    if (filteredChips.length > 0) {
      const exists = filteredChips.some((c) => c.key === selectedExercise);
      if (!exists) {
        setSelectedExercise(filteredChips[0].key);
        setSelectedExerciseName(filteredChips[0].name || filteredChips[0].key.replace(/_/g, ' '));
      }
    }
  }, [filteredChips, selectedExercise]);

  // Query muscle volume distribution (last 7 days of sessions)
  useEffect(() => {
    if (!uid) return;
    async function fetchMuscleDistribution() {
      setMuscleDistLoading(true);
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        const q = query(
          collection(db, 'users', uid, 'sessions'),
          where('date', '>=', cutoff)
        );
        const snap = await getDocs(q);
        const distribution = {};
        
        // Map exercise keys/names to muscle groups
        const exerciseToMuscleMap = {};
        exerciseBank.forEach((ex) => {
          exerciseToMuscleMap[ex.key] = ex.muscleGroup;
          exerciseToMuscleMap[ex.name.toLowerCase()] = ex.muscleGroup;
        });

        let totalSets = 0;

        // Fetch exercises from the sub-collection for each matching session
        const fetchExercisesPromises = snap.docs.map(async (docSnap) => {
          const sessData = docSnap.data();
          if (sessData.exercises && Array.isArray(sessData.exercises) && sessData.exercises.length > 0) {
            return sessData.exercises;
          }
          const exercisesRef = collection(db, 'users', uid, 'sessions', docSnap.id, 'exercises');
          const exSnap = await getDocs(exercisesRef);
          return exSnap.docs.map(d => d.data());
        });

        const sessionsExercises = await Promise.all(fetchExercisesPromises);

        const getSecondaryGroups = (exKey, category) => {
          const secs = getSecondaryMuscles(exKey, category);
          return [...new Set(secs.map(s => s.category))];
        };

        sessionsExercises.forEach((exercises) => {
          exercises.forEach((ex) => {
            const key = ex.exerciseKey || ex.exerciseId || '';
            const keyBase = key.split('_').slice(0, -1).join('_');
            const muscleGroup = exerciseToMuscleMap[key] || exerciseToMuscleMap[keyBase] || exerciseToMuscleMap[ex.name?.toLowerCase()] || 'other';
            const completedSetsCount = ex.sets
              ? ex.sets.filter(s => s.done || s.completed).length
              : 0;
            
            if (completedSetsCount > 0) {
              // Primary muscle group gets full sets credit
              distribution[muscleGroup] = (distribution[muscleGroup] || 0) + completedSetsCount;
              totalSets += completedSetsCount;

              // Secondary muscle groups get 30% sets credit
              const secondaries = getSecondaryGroups(key || ex.name, muscleGroup);
              secondaries.forEach((secGroup) => {
                distribution[secGroup] = (distribution[secGroup] || 0) + completedSetsCount * 0.3;
                totalSets += completedSetsCount * 0.3;
              });
            }
          });
        });

        // Convert set counts to percentage trained.
        // Fix: use largest-remainder method so percentages always sum to exactly 100%.
        // Math.round() applied independently can give totals of 99% or 101%.
        const finalDist = {};
        if (totalSets > 0) {
          const entries = Object.entries(distribution);
          const exactValues = entries.map(([muscle, count]) => ({
            muscle,
            exact: (count / totalSets) * 100,
            floor: Math.floor((count / totalSets) * 100),
          }));
          const totalFloor = exactValues.reduce((s, e) => s + e.floor, 0);
          const remainder = 100 - totalFloor;
          // Distribute remaining points to entries with largest fractional parts
          const sorted = [...exactValues].sort((a, b) => (b.exact - b.floor) - (a.exact - a.floor));
          sorted.forEach((e, i) => { e.floor += i < remainder ? 1 : 0; });
          exactValues.forEach(e => { finalDist[e.muscle] = e.floor; });
        }
        
        // Sort by percentage descending
        const sortedDist = Object.fromEntries(
          Object.entries(finalDist).sort(([, a], [, b]) => b - a)
        );

        setMuscleDistribution(sortedDist);
      } catch (err) {
        console.error('Error fetching muscle distribution:', err);
      } finally {
        setMuscleDistLoading(false);
      }
    }
    fetchMuscleDistribution();
  }, [uid]); // Fix: removed 'prs' dependency — PRs have nothing to do with muscle distribution.
             // Previously this triggered an expensive N+1 Firestore refetch on every PR logged.


  // Fetch recent sessions on mount to compute fatigue.
  // Fix: skip refetch if sessions are already loaded this mount (e.g. switching tabs back to Recovery).
  // This reduces reads significantly for users who tab in and out of Recovery.
  useEffect(() => {
    if (!uid || activeTab !== 'Recovery') return;
    // Cache: if we already have session data, recompute from cache without a new Firestore read.
    if (sessions.length > 0) {
      const bwKg = parseFloat(profile?.weightKg) || 70;
      const fatigue = calculateMuscleFatigue(sessions, bwKg);
      setFatigueData(fatigue);
      return;
    }
    const fetchRecentSessions = async () => {
      setLoadingFatigue(true);
      try {
        const sessionsRef = collection(db, 'users', uid, 'sessions');
        const q = query(sessionsRef, orderBy('date', 'desc'), limit(10));
        const snap = await getDocs(q);
        
        const loadedSessions = [];
        for (const docSnap of snap.docs) {
          const sessData = docSnap.data();
          let exercises = [];
          if (sessData.exercises && Array.isArray(sessData.exercises) && sessData.exercises.length > 0) {
            exercises = sessData.exercises;
          } else {
            const exSnap = await getDocs(collection(db, 'users', uid, 'sessions', docSnap.id, 'exercises'));
            exercises = exSnap.docs.map(exDoc => exDoc.data());
          }
          loadedSessions.push({
            id: docSnap.id,
            ...sessData,
            exercises
          });
        }
        
        setSessions(loadedSessions);
        const bwKg = parseFloat(profile?.weightKg) || 70;
        const fatigue = calculateMuscleFatigue(loadedSessions, bwKg);
        setFatigueData(fatigue);
      } catch (err) {
        console.error('[MobileProgress] Error compiling fatigue data:', err);
      } finally {
        setLoadingFatigue(false);
      }
    };

    fetchRecentSessions();
  }, [uid, activeTab, refreshTrigger]);


  const getMuscleColor = (muscleKey) => {
    const fatigue = (viewType === 'individual' ? fatigueData.individual?.[muscleKey] : fatigueData.general?.[muscleKey]) || 0;
    if (fatigue > 100) return '#FF3366'; // Neon Red (>100% fatigue)
    if (fatigue >= 30) return '#FFE600'; // Neon Yellow (30-100% fatigue)
    return '#33FF66'; // Neon Green (<30% fatigue)
  };

  const getRecoveryHours = (fatigue) => {
    if (fatigue > 100) return '48 - 72 hours (High Fatigue)';
    if (fatigue >= 30) return '24 - 48 hours (Active Recovery)';
    return 'Fully Recovered (<12 hours)';
  };

  const getMuscleLabel = (key) => {
    const labels = {
      chest: 'Chest',
      back: 'Back',
      shoulders: 'Shoulders',
      arms: 'Arms',
      legs: 'Legs',
      core: 'Core & Abs'
    };
    return labels[key] || key;
  };

  const selectedRecoveryMuscle = selectedRecoveryMuscleKey ? {
    key: selectedRecoveryMuscleKey,
    fatigue: (viewType === 'individual' ? fatigueData.individual?.[selectedRecoveryMuscleKey] : fatigueData.general?.[selectedRecoveryMuscleKey]) || 0
  } : null;

  // Strength metrics computations
  const strengthMetrics = useMemo(() => {
    if (!strengthData || strengthData.length === 0) return null;

    const latest = strengthData[strengthData.length - 1];
    const oldest = strengthData[0];

    const latest1RM = Math.round(latest.maxWeight * (1 + latest.maxReps / 30));
    const oldest1RM = Math.round(oldest.maxWeight * (1 + oldest.maxReps / 30));

    const peakWeight = strengthData.reduce((max, d) => (d.maxWeight > max ? d.maxWeight : max), 0);

    const weightDelta = latest.maxWeight - oldest.maxWeight;
    const oneRMDelta = latest1RM - oldest1RM;
    const percentDelta = oldest.maxWeight > 0 ? Math.round((weightDelta / oldest.maxWeight) * 100) : 0;

    return {
      latest1RM,
      peakWeight,
      weightDelta,
      oneRMDelta,
      percentDelta,
      dataCount: strengthData.length,
    };
  }, [strengthData]);

  // Volume metrics computations
  const volumeMetrics = useMemo(() => {
    if (!volumeData || volumeData.length === 0) return null;

    const peakVolume = volumeData.reduce((max, d) => (d.totalVolume > max ? d.totalVolume : max), 0);
    const totalVolumeSum = volumeData.reduce((sum, d) => sum + d.totalVolume, 0);

    return {
      peakVolume,
      totalVolumeSum,
    };
  }, [volumeData]);

  const handleSharePR = async (pr) => {
    setIsSharing(true);
    addToast('Retrieving global rankings...', 'info');
    try {
      const est1RM = pr.weight === 'BW' ? 0 : Math.round(pr.weight * (1 + pr.reps / 30));
      const exName = pr.exerciseName || pr.name || pr.exerciseKey?.replace(/_/g, ' ') || 'Bench Press';

      // Compute statistics utilizing Firestore-cached strength standards
      const stats = await fetchStrengthStandards(
        exName,
        est1RM,
        profile?.weight || 80,
        profile?.gender || 'male'
      );

      const targetMuscle = getMuscleGroupForExercise(exName);

      const dataUrl = await generatePRCardImage({
        userName: profile?.name || 'Trainer',
        level: profile?.level || 1,
        exerciseName: exName,
        weight: pr.weight,
        reps: pr.reps,
        oneRepMax: est1RM,
        dateString: formatPRDate(pr.date),
        percentile: stats.percentile,
        tier: stats.tier,
        bwMultiplier: stats.bwMultiplier,
        targetMuscle
      });

      const weightText = pr.weight === 'BW' ? 'BW' : `${pr.weight} kg`;
      const text = `🏋️ New PR hit on Zenkai! ${exName}: ${weightText} for ${pr.reps} reps${pr.weight !== 'BW' ? ` (Estimated 1RM: ${est1RM} kg)` : ''}! Global Rank: ${stats.percentile} (${stats.tier} Tier) 🔥💪`;




      // Check if Web Share API with files is supported
      if (navigator.share && navigator.canShare) {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const file = new File([blob], `pr_${pr.exerciseKey || 'lift'}.png`, { type: 'image/png' });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Personal Record Broken!',
            text,
          });
          return;
        }
      }

      // Fallback: Trigger instant browser download
      const link = document.createElement('a');
      link.download = `pr_${pr.exerciseKey || 'lift'}.png`;
      link.href = dataUrl;
      link.click();
      
      // Also copy the text template to clipboard
      await navigator.clipboard.writeText(text);
      addToast('PR Card image downloaded & details copied to clipboard!', 'success');
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.toLowerCase().includes('cancel') || err.message?.toLowerCase().includes('abort')) {
        console.log('[MobileProgress] User cancelled share sheet.');
        return;
      }
      console.error('[MobileProgress] Sharing failed:', err);
      addToast('Could not generate share image.', 'error');
    } finally {
      setIsSharing(false);
    }
  };

  // Framer Motion staggered list variants for PRs
  const containerVariants = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 120,
        damping: 12,
      },
    },
  };

  return (
    <div className="flex flex-col gap-5 p-4 min-h-[100dvh] bg-[var(--bg-base)] text-[var(--text-primary)] pb-28">
      {/* ─── SCREEN TITLE ───────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center border-b-2 border-[var(--border)] pb-3">
        <div className="flex items-center gap-3">
          {/* Small Zenkai Logo - only visible on mobile (hidden on lg) */}
          <div className="lg:hidden w-8 h-8 rounded bg-black border border-[var(--border)] flex items-center justify-center overflow-hidden shrink-0 select-none">
            <img src="/logos/zenkai_official_logo.webp" alt="Zenkai Logo" className="w-full h-full object-contain p-0.5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight uppercase leading-none font-barlow text-white">
              Telemetry
            </h1>
            <p className="text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider mt-1">
              Strength & volume stats
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="p-2 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
          >
            <RefreshCw size={14} />
          </button>
          
          {/* Clickable profile avatar - only visible on mobile (hidden on lg) */}
          <div 
            onClick={() => navigate('/profile')}
            className="lg:hidden w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center cursor-pointer overflow-hidden transition-all duration-300 border-2 border-black hover:scale-105 active:scale-95 shrink-0"
            style={getAvatarStyle(profile?.aura, profile?.level || 1, profile?.powerUps)}
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

      {/* ─── SEGMENTED TAB SELECTOR (LIQUID SLIDER) ─────────────────────────── */}
      <div className="flex bg-[var(--bg-elevated)] p-1 rounded border border-[var(--border)] relative">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-display uppercase font-bold tracking-wider relative z-10 transition-colors duration-200 ${
              activeTab === tab ? 'text-black font-extrabold' : 'text-[var(--text-secondary)]'
            }`}
          >
            {activeTab === tab && (
              <motion.div
                layoutId="activeTabIndicator"
                className="absolute inset-0 bg-[var(--primary)] rounded -z-10"
                transition={{ type: 'spring', stiffness: 350, damping: 26 }}
              />
            )}
            {tab}
          </button>
        ))}
      </div>

      {/* ─── TAB CONTENT PANELS ─────────────────────────────────────────────── */}
      <div className="flex-1">
        <AnimatePresence mode="wait">
          {activeTab === 'Strength' && (
            <motion.div
              key="strength"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-4"
            >
              {/* Muscle Group Selection Row */}
              <div className="flex flex-col gap-1 px-1">
                <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                  Select Muscle Group
                </span>
                <div className="flex gap-2 overflow-x-auto scrollbar-none py-1">
                  {['chest', 'back', 'legs', 'shoulders', 'arms', 'core'].map((group) => {
                    const isSelected = selectedMuscleGroup === group;
                    return (
                      <button
                        key={group}
                        onClick={() => setSelectedMuscleGroup(group)}
                        className={`flex-shrink-0 px-3.5 py-1.5 rounded text-[10px] font-display uppercase font-bold border transition-all tracking-wider ${
                          isSelected
                            ? 'bg-[var(--primary)] text-black border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] font-extrabold'
                            : 'bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--text-secondary)] shadow-none'
                        }`}
                      >
                        {group}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Exercise Selector (Filtered by Muscle Group) */}
              <div className="flex flex-col gap-1 px-1 mt-1">
                <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                  Select Exercise
                </span>
                {filteredChips.length === 0 ? (
                  <div className="text-xs text-[var(--text-muted)] font-sans py-1.5 italic">
                    No exercises logged for {selectedMuscleGroup} yet
                  </div>
                ) : (
                  <div className="flex gap-2 overflow-x-auto scrollbar-none py-1">
                    {filteredChips.map((chip) => {
                      const isSelected = selectedExercise === chip.key;
                      return (
                        <button
                          key={chip.key}
                          onClick={() => {
                            setSelectedExercise(chip.key);
                            setSelectedExerciseName(chip.name || chip.key.replace(/_/g, ' '));
                          }}
                          className={`flex-shrink-0 px-3.5 py-1.5 rounded text-[10px] font-sans font-bold border-2 transition-all uppercase tracking-wide ${
                            isSelected
                              ? 'bg-[var(--secondary)] text-black border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]'
                              : 'bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border-bright)] hover:border-[var(--text-secondary)] shadow-none'
                          }`}
                        >
                          {abbreviateExerciseName(chip.name || chip.key.replace(/_/g, ' '))}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Time Range Selector */}
              <div className="flex justify-between items-center text-xs font-mono text-[var(--text-secondary)] px-1 mt-2">
                <span>Strength Curve</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStrengthRange(30)}
                    className={`px-2 py-0.5 rounded border ${
                      strengthRange === 30
                        ? 'border-[var(--secondary)] text-[var(--secondary)]'
                        : 'border-[var(--border)] bg-[var(--bg-elevated)]'
                    }`}
                  >
                    30D
                  </button>

                  {/* 90D — locked until user has 30+ days of session history for this exercise */}
                  <button
                    onClick={() => can90D && setStrengthRange(90)}
                    disabled={!can90D}
                    title={can90D ? '90 day view' : 'Log 30+ days of this exercise to unlock'}
                    className={`px-2 py-0.5 rounded border transition-opacity ${
                      !can90D
                        ? 'border-[var(--border)] text-[var(--text-secondary)] opacity-35 cursor-not-allowed'
                        : strengthRange === 90
                        ? 'border-[var(--secondary)] text-[var(--secondary)]'
                        : 'border-[var(--border)] bg-[var(--bg-elevated)]'
                    }`}
                  >
                    90D{!can90D && ' 🔒'}
                  </button>
                </div>
              </div>

              {/* Recharts Cyan Area Graph */}
              <StrengthChart
                data={strengthData}
                exerciseName={selectedExerciseName}
                loading={strengthLoading}
              />

              {/* Strength Stats Telemetry */}
              {strengthMetrics && !strengthLoading && (
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div className="border-2 border-[var(--border-bright)] bg-[var(--surface)] p-3 rounded shadow-[3px_3px_0px_rgba(0,0,0,1)] flex flex-col">
                    <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                      Peak weight
                    </span>
                    <span className="font-mono text-2xl font-extrabold text-[var(--text-primary)] mt-1">
                      {strengthMetrics.peakWeight} <span className="text-xs text-[var(--text-secondary)] font-sans">kg</span>
                    </span>
                  </div>

                  <div className="border-2 border-[var(--border-bright)] bg-[var(--surface)] p-3 rounded shadow-[3px_3px_0px_rgba(0,0,0,1)] flex flex-col">
                    <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                      Est. Max 1RM
                    </span>
                    <span className="font-mono text-2xl font-extrabold text-[var(--secondary)] mt-1">
                      {strengthMetrics.latest1RM} <span className="text-xs text-[var(--text-secondary)] font-sans">kg</span>
                    </span>
                  </div>

                  <div className="col-span-2 border-2 border-[var(--border-bright)] bg-[var(--surface)] p-3.5 rounded shadow-[3px_3px_0px_rgba(0,0,0,1)] flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                        Progression curve
                      </span>
                      <span className="text-xs font-sans font-bold text-[var(--text-primary)] mt-1">
                        {strengthMetrics.dataCount > 1
                          ? `Lifted ${strengthMetrics.weightDelta >= 0 ? '+' : ''}${strengthMetrics.weightDelta} kg since first log`
                          : 'Initial benchmark log established'}
                      </span>
                    </div>

                    {strengthMetrics.dataCount > 1 && (
                      <div className={`flex items-center gap-0.5 px-2 py-1 rounded font-mono text-xs font-bold border ${
                        strengthMetrics.weightDelta >= 0
                          ? 'border-[var(--success)] bg-[#22c55e0c] text-[var(--success)]'
                          : 'border-[var(--destructive)] bg-[#ef44440c] text-[var(--destructive)]'
                      }`}>
                        {strengthMetrics.weightDelta >= 0 ? (
                          <>
                            <ArrowUpRight size={14} />
                            <span>+{strengthMetrics.percentDelta}%</span>
                          </>
                        ) : (
                          <>
                            <ArrowDownRight size={14} />
                            <span>{strengthMetrics.percentDelta}%</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'Volume' && (
            <motion.div
              key="volume"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-4"
            >
              <div className="flex justify-between items-center text-xs font-mono text-[var(--text-secondary)] px-1">
                <span>Weekly Cumulative Load</span>
                <span>Last 12 Weeks</span>
              </div>

              {/* Recharts Orange Bar Graph */}
              <VolumeChart data={volumeData} loading={volumeLoading} />

              {/* Volume Stats Telemetry */}
              {volumeMetrics && !volumeLoading && (
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div className="border-2 border-[var(--border-bright)] bg-[var(--surface)] p-3 rounded shadow-[3px_3px_0px_rgba(0,0,0,1)] flex flex-col">
                    <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                      Peak Weekly Volume
                    </span>
                    <span className="font-mono text-2xl font-extrabold text-[var(--primary)] mt-1">
                      {volumeMetrics.peakVolume.toLocaleString()} <span className="text-xs text-[var(--text-secondary)] font-sans">kg</span>
                    </span>
                  </div>

                  <div className="border-2 border-[var(--border-bright)] bg-[var(--surface)] p-3 rounded shadow-[3px_3px_0px_rgba(0,0,0,1)] flex flex-col">
                    <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                      Total Volume Lifted
                    </span>
                    <span className="font-mono text-2xl font-extrabold text-[var(--text-primary)] mt-1">
                      {volumeMetrics.totalVolumeSum.toLocaleString()} <span className="text-xs text-[var(--text-secondary)] font-sans">kg</span>
                    </span>
                  </div>
                </div>
              )}

              {/* ─── IDEA B: TELEMETRIC MUSCLE VOLUME DISTRIBUTION ───────────────── */}
              <div className="border-2 border-[var(--border-bright)] bg-[var(--surface)] p-4 rounded shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-3">
                <div>
                  <h3 className="font-display text-base font-bold text-white uppercase tracking-wide leading-none">
                    Muscle Group Distribution
                  </h3>
                  <p className="text-[10px] text-[var(--text-secondary)] font-sans mt-1">
                    Trained split percentage based on completed sets in the last 7 days.
                  </p>
                </div>
                
                {muscleDistLoading ? (
                  <div className="w-full h-20 bg-[var(--bg-elevated)] animate-pulse rounded" />
                ) : Object.keys(muscleDistribution).length === 0 ? (
                  <div className="text-center py-4 border border-dashed border-[var(--border)] rounded text-[var(--text-muted)] text-xs font-sans">
                    No workouts logged in the last 7 days.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3.5 mt-1">
                    {Object.entries(muscleDistribution).map(([muscle, percent]) => (
                      <div key={muscle} className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-xs font-mono">
                          <span className="capitalize text-[var(--text-primary)] font-bold">{muscle}</span>
                          <span className="text-[var(--secondary)] font-bold">{percent}%</span>
                        </div>
                        <div className="w-full h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden border border-[var(--border)] relative">
                          <div 
                            className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] rounded-full"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'PRs' && (
            <motion.div
              key="prs"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-3"
            >
              <span className="text-xs font-mono text-[var(--text-secondary)] px-1">
                Personal Records ({prs.length})
              </span>

              {prsLoading ? (
                <div className="flex flex-col gap-3">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="w-full h-16 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : prs.length === 0 ? (
                <div className="w-full border-2 border-dashed border-[var(--border-bright)] bg-[var(--surface)] p-8 rounded-lg text-center flex flex-col items-center gap-3">
                  <Trophy className="w-10 h-10 text-[var(--text-muted)] stroke-[1.5]" />
                  <p className="text-sm font-bold text-[var(--text-primary)]">No Personal Records set yet</p>
                  <p className="text-xs text-[var(--text-secondary)] max-w-xs leading-relaxed">
                    Personal Records are earned by completing exercises at a higher weight or higher reps compared to previous logs. Get logging!
                  </p>
                </div>
              ) : (
                /* Staggered cascading PR list */
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="flex flex-col gap-3"
                >
                  {prs.map((pr) => (
                    <motion.div
                      key={pr.exerciseKey}
                      variants={itemVariants}
                      onClick={() => setSelectedPR(pr)}
                      className="border-2 border-[var(--border-bright)] bg-[var(--surface)] p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-[0.99] transition-all cursor-pointer flex justify-between items-center"
                    >
                      <div className="flex flex-col">
                        <h4 className="text-display text-base text-[var(--text-primary)] font-bold tracking-tight uppercase leading-none">
                          {abbreviateExerciseName(pr.exerciseName || pr.exerciseKey.replace(/_/g, ' '))}
                        </h4>
                        <span className="text-[10px] text-[var(--text-secondary)] font-mono mt-1">
                          Hit on {formatPRDate(pr.date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end">
                          <span className="font-mono text-lg font-extrabold text-[var(--accent-xp)]">
                            {pr.weight === 'BW' ? 'BW' : `${pr.weight} kg`}
                          </span>
                          <span className="text-[9px] text-[var(--text-secondary)] font-sans uppercase">
                            for {pr.reps} reps
                          </span>
                        </div>
                        <div className="p-2 rounded border border-[var(--accent-xp)] bg-[#b5ff2d0e] text-[var(--accent-xp)] flex items-center justify-center">
                          <Trophy size={16} fill="currentColor" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'Recovery' && (
            <motion.div
              key="recovery"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-5"
            >
              {/* Muscle Map Interactive Section */}
              <MuscleMap
                fatigueData={fatigueData}
                strengthData={mannequinStrengthData}
                activeMuscle={selectedRecoveryMuscleKey}
                onMuscleClick={(m) => setSelectedRecoveryMuscleKey(selectedRecoveryMuscleKey === m ? null : m)}
                mode={mannequinMode}
                setMode={setMannequinMode}
                view={mannequinView}
                setView={setMannequinView}
                viewType={viewType}
                setViewType={(vt) => {
                  setViewType(vt);
                  setSelectedRecoveryMuscleKey(null);
                }}
              />

              {/* Muscle Telemetry Details panel */}
              <MuscleDetailPanel
                muscleKey={selectedRecoveryMuscleKey}
                fatigueScore={
                  mannequinMode === 'fatigue'
                    ? (viewType === 'individual'
                        ? (fatigueData.individual?.[selectedRecoveryMuscleKey] || 0)
                        : (fatigueData.general?.[selectedRecoveryMuscleKey] || 0))
                    : 0
                }
                strengthScore={
                  viewType === 'individual'
                    ? (mannequinStrengthData.individual?.[selectedRecoveryMuscleKey] || 0)
                    : (mannequinStrengthData.general?.[selectedRecoveryMuscleKey] || 0)
                }
                mode={mannequinMode}
              />

              {/* Strength Mode Sub-Analytics */}
              {mannequinMode === 'strength' && (
                <div className="flex flex-col gap-4 mt-1">
                  <StrengthRadarChart 
                    strengthData={mannequinStrengthData}
                    viewType={viewType}
                    title="Universal Strength Split"
                  />
                  <StrengthTiersLegend />
                </div>
              )}

              {/* Fatigue Mode Sub-Analytics (ACWR Guide Card) */}
              {mannequinMode === 'fatigue' && (
                <div className="border border-[var(--border)] bg-[var(--surface)] p-4 rounded-xl shadow-[3px_3px_0px_black] flex flex-col gap-2">
                  <span className="text-[10px] font-mono text-[var(--secondary)] uppercase tracking-wider font-bold">
                    Telemetry Guide
                  </span>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
                    Your Fatigue Index is calculated using the Acute-to-Chronic Workload Ratio (ACWR) model. 
                    Target green regions for high-intensity training. Yellow regions indicate active recovery, while red regions warn of potential overload.
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── IDEA D: STAGGERED PR CELEBRATION SHARE MODAL ────────────────── */}
      <AnimatePresence>
        {selectedPR && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/85 backdrop-blur-xs p-4">
            <div className="absolute inset-0" onClick={() => setSelectedPR(null)} />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="w-full max-w-[350px] bg-[var(--bg-elevated)] border-2 border-black rounded-lg p-5 shadow-[6px_6px_0px_rgba(0,0,0,1)] z-10 flex flex-col gap-4 relative overflow-hidden"
            >
              {/* Confetti-like accent glow top center */}
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-24 rounded-full bg-gradient-to-b from-[#b5ff2d25] to-transparent filter blur-md -z-10" />

              {/* Close Button */}
              <button
                onClick={() => setSelectedPR(null)}
                className="absolute top-3.5 right-3.5 text-xs text-[var(--text-secondary)] hover:text-white transition-all"
              >
                <X size={18} />
              </button>

              <div className="flex flex-col items-center text-center gap-2 border-b border-[var(--border)] pb-4">
                <div className="p-3 bg-[#b5ff2d0f] border-2 border-[var(--accent-xp)] rounded-full text-[var(--accent-xp)] flex items-center justify-center animate-bounce">
                  <Trophy size={28} fill="currentColor" />
                </div>
                <h3 className="font-display text-2xl font-extrabold uppercase text-white tracking-wide mt-1">
                  Personal Record!
                </h3>
                <p className="text-xs text-[var(--text-secondary)] font-sans">
                  You conquered this milestone. Keep pushing!
                </p>
              </div>

              {/* Stats Card */}
              <div className="flex flex-col gap-3 bg-[var(--surface)] border-2 border-[var(--border-bright)] p-4 rounded shadow-[3px_3px_0px_rgba(0,0,0,1)]">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                    Exercise
                  </span>
                  <span className="font-display text-lg font-bold text-white uppercase text-center mt-1">
                    {abbreviateExerciseName(selectedPR.exerciseName || selectedPR.exerciseKey.replace(/_/g, ' '))}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-[var(--border)]">
                  <div className="flex flex-col items-center">
                    <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                      Best Weight
                    </span>
                    <span className="font-mono text-xl font-extrabold text-[var(--accent-xp)] mt-1">
                      {selectedPR.weight === 'BW' ? 'BW' : `${selectedPR.weight} kg`}
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                      Rep Count
                    </span>
                    <span className="font-mono text-xl font-extrabold text-white mt-1">
                      {selectedPR.reps} reps
                    </span>
                  </div>
                </div>

                {/* Epley 1RM */}
                {selectedPR.weight !== 'BW' && (
                  <div className="flex flex-col items-center mt-2 pt-3 border-t border-[var(--border)]">
                    <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                      Estimated 1-Rep Max
                    </span>
                    <span className="font-mono text-base font-bold text-[var(--secondary)] mt-1">
                      {Math.round(selectedPR.weight * (1 + selectedPR.reps / 30))} kg
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col text-center mt-1">
                <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                  Date Achieved
                </span>
                <span className="text-xs font-sans font-bold text-white mt-0.5">
                  {formatPRDate(selectedPR.date)}
                </span>
              </div>

              {/* Action Button */}
              <motion.button
                onClick={() => handleSharePR(selectedPR)}
                className="w-full mt-2 py-3 bg-[var(--primary)] text-black border-2 border-black rounded font-display font-extrabold text-sm uppercase tracking-wider shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 flex items-center justify-center gap-2"
                whileTap={{ scale: 0.96 }}
              >
                <Share2 size={14} />
                <span>Share PR Stats</span>
              </motion.button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default MobileProgress;
