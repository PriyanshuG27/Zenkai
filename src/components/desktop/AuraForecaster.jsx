import React, { useState, useEffect, useMemo } from 'react';
import { Activity, Sparkles, Sliders, Play, Info, AlertTriangle, TrendingUp, HelpCircle, Flame, Zap, Dumbbell, Award, Calendar, Timer, BookOpen, Skull, ShieldCheck, RefreshCw, BarChart2 } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { usePRList } from '../../hooks/useProgress';

export const AuraForecaster = () => {
  const { uid, profile } = useAuthStore();
  const { prs } = usePRList(uid);
  
  const [realSessions, setRealSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [useDemoData, setUseDemoData] = useState(false);
  const [showRuleBook, setShowRuleBook] = useState(false);

  // Selected exercise keys for the three simulation slots
  const [slot1Key, setSlot1Key] = useState('');
  const [slot2Key, setSlot2Key] = useState('');
  const [slot3Key, setSlot3Key] = useState('');

  // Target weights for breakthrough probability simulator
  const [benchTarget, setBenchTarget] = useState(0);
  const [squatTarget, setSquatTarget] = useState(0);
  const [deadliftTarget, setDeadliftTarget] = useState(0);

  // Compile unique exercises from user's personal records catalog
  const uniquePRsList = useMemo(() => {
    const list = [];
    if (prs && Array.isArray(prs)) {
      const seen = new Set();
      prs.forEach(p => {
        if (p.exerciseKey && !seen.has(p.exerciseKey)) {
          seen.add(p.exerciseKey);
          list.push({ key: p.exerciseKey, name: p.exerciseName || p.exerciseKey });
        }
      });
    }

    // Ensure baseline standard lifts exist as fallbacks
    const defaults = [
      { key: 'bench', name: 'Bench Press' },
      { key: 'squat', name: 'Squats' },
      { key: 'deadlift', name: 'Deadlift' }
    ];
    defaults.forEach(d => {
      if (!list.some(item => item.key === d.key)) {
        list.push(d);
      }
    });
    return list;
  }, [prs]);

  // Automatically select the user's best matching lifts beforehand
  useEffect(() => {
    if (!prs || prs.length === 0) {
      setSlot1Key('bench');
      setSlot2Key('squat');
      setSlot3Key('deadlift');
      return;
    }

    const findBestMatch = (keywords) => {
      const matches = prs.filter(p => {
        const keyLower = (p.exerciseKey || '').toLowerCase();
        const nameLower = (p.exerciseName || '').toLowerCase();
        return keywords.some(keyword => keyLower.includes(keyword) || nameLower.includes(keyword));
      });
      if (matches.length === 0) return null;
      matches.sort((a, b) => {
        const wA = parseFloat(a.weight) || 0;
        const wB = parseFloat(b.weight) || 0;
        return wB - wA;
      });
      return matches[0].exerciseKey;
    };

    const keys = prs.map(p => p.exerciseKey);

    const slot1Match = findBestMatch(['bench', 'chest']);
    const slot2Match = findBestMatch(['squat', 'leg', 'quad', 'hamstring', 'calf', 'lunge']);
    const slot3Match = findBestMatch(['deadlift', 'back', 'row', 'pull', 'lat']);

    setSlot1Key(slot1Match || keys[0] || 'bench');
    setSlot2Key(slot2Match || keys[1] || keys[0] || 'squat');
    setSlot3Key(slot3Match || keys[2] || keys[0] || 'deadlift');
  }, [prs]);

  // Helper to extract personal record weight for a specific exercise key
  const getPRWeightByKey = (exerciseKey, defaultVal) => {
    if (!prs || !Array.isArray(prs) || !exerciseKey) return defaultVal;
    const match = prs.find(p => p.exerciseKey === exerciseKey);
    if (!match) return defaultVal;
    const w = parseFloat(match.weight);
    return isNaN(w) ? defaultVal : w;
  };

  const slot1Best = useMemo(() => getPRWeightByKey(slot1Key, 60), [prs, slot1Key]);
  const slot2Best = useMemo(() => getPRWeightByKey(slot2Key, 80), [prs, slot2Key]);
  const slot3Best = useMemo(() => getPRWeightByKey(slot3Key, 100), [prs, slot3Key]);

  // Sync targets to next milestone (PR + increment) once the selected lift is changed
  useEffect(() => {
    if (slot1Best) setBenchTarget(slot1Best + 2.5);
  }, [slot1Best]);

  useEffect(() => {
    if (slot2Best) setSquatTarget(slot2Best + 5);
  }, [slot2Best]);

  useEffect(() => {
    if (slot3Best) setDeadliftTarget(slot3Best + 5);
  }, [slot3Best]);
  
  // Fetch user sessions
  useEffect(() => {
    if (!uid) return;
    setLoading(true);

    const fetchSessions = async () => {
      try {
        const mobileSnap = await getDocs(query(collection(db, 'users', uid, 'sessions'), orderBy('date', 'desc'), limit(50)));
        const desktopSnap = await getDocs(query(collection(db, 'users', uid, 'executed_sessions'), orderBy('date', 'desc'), limit(50)));

        const mobileList = [];
        for (const docSnap of mobileSnap.docs) {
          const s = docSnap.data();
          const exSnap = await getDocs(collection(db, 'users', uid, 'sessions', docSnap.id, 'exercises'));
          const exercises = exSnap.docs.map(exDoc => exDoc.data());
          mobileList.push({
            id: docSnap.id,
            source: 'mobile',
            ...s,
            date: s.date?.toDate ? s.date.toDate() : s.date ? new Date(s.date) : new Date(),
            exercises
          });
        }

        const desktopList = desktopSnap.docs.map(docSnap => {
          const s = docSnap.data();
          return {
            id: docSnap.id,
            source: 'desktop',
            ...s,
            date: s.date?.toDate ? s.date.toDate() : s.date ? new Date(s.date) : new Date()
          };
        });

        const merged = [...mobileList, ...desktopList].sort((a, b) => b.date - a.date);
        setRealSessions(merged);
      } catch (err) {
        console.error('[AuraForecaster] Failed to load sessions:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, [uid]);

  // Generate 15 simulated workout logs for demo simulation mode
  const demoSessions = useMemo(() => {
    const today = new Date();
    const list = [];
    const moods = ['low_energy', 'average', 'locked_in'];

    for (let i = 0; i < 20; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      
      const moodTag = moods[i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2];
      
      let rpe = 6;
      let mmc = 5;
      let duration = 45;
      let volume = 2000;
      let maxWeight = 60;

      if (moodTag === 'locked_in') {
        rpe = 8 + (i % 3 === 0 ? 1 : 0); // 8-9
        mmc = 8 + (i % 2 === 0 ? 1 : 2); // 9-10
        duration = 55 + (i % 5) * 3;
        volume = 4500 + (i % 7) * 200;
        maxWeight = 110 + (i % 5) * 5;
      } else if (moodTag === 'average') {
        rpe = 7;
        mmc = 6 + (i % 2);
        duration = 50 + (i % 4) * 4;
        volume = 3200 + (i % 6) * 150;
        maxWeight = 85 + (i % 4) * 5;
      } else {
        rpe = 5 + (i % 2);
        mmc = 4 + (i % 3);
        duration = 40 + (i % 3) * 5;
        volume = 1800 + (i % 5) * 100;
        maxWeight = 60 + (i % 3) * 5;
      }

      // Tuesday peak
      const day = date.getDay();
      if (day === 2) {
        volume += 500;
        maxWeight += 10;
      }

      list.push({
        id: `demo-session-${i}`,
        date,
        moodTag,
        rpeScore: rpe,
        mmcScore: mmc,
        durationMinutes: duration,
        totalVolume: volume,
        totalSets: Math.round(duration / 3.5),
        maxWeight,
        prCount: i % 4 === 0 ? 1 : 0,
        exercises: [
          { name: 'Demo Bench Press', exerciseKey: 'bench', muscleGroup: 'Chest', sets: [{ weight: maxWeight, reps: 5 }] }
        ]
      });
    }
    return list;
  }, []);

  const activeSessions = useMemo(() => {
    return useDemoData ? demoSessions : realSessions;
  }, [useDemoData, demoSessions, realSessions]);

  // Dynamic Aura & Beast Mode Logic
  const auraReport = useMemo(() => {
    if (activeSessions.length === 0) {
      return {
        score: 1000,
        tier: 'Gym Novice',
        tierProgress: 0,
        feed: [{ text: 'Base Entry Point established', change: 1000, type: 'credit' }],
        daysInactive: 0,
        decayPenalty: 0
      };
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSessions = activeSessions.filter(s => new Date(s.date) >= thirtyDaysAgo);
    
    let baseScore = 1000;
    const feed = [{ text: 'Base Entry Point', change: 1000, type: 'credit' }];
    
    let legVolume = 0;
    let upperVolume = 0;
    let distractedCount = 0;
    let shortCount = 0;

    recentSessions.forEach((s) => {
      // 1. Session completion
      baseScore += 100;
      feed.push({ 
        text: `Completed session (${new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})`, 
        change: 100, 
        type: 'credit' 
      });

      // 2. High intensity
      if (s.rpeScore >= 8) {
        baseScore += 150;
        feed.push({ text: `High Intensity Overload (RPE: ${s.rpeScore}/10)`, change: 150, type: 'credit' });
      }

      // 3. Mind-Muscle Connection
      if (s.mmcScore >= 8) {
        baseScore += 150;
        feed.push({ text: `Mind-Muscle Mindset (MMC: ${s.mmcScore}/10)`, change: 150, type: 'credit' });
      }

      // 4. PR bonus
      if (s.prCount > 0) {
        const prs = s.prCount || 1;
        baseScore += (300 * prs);
        feed.push({ text: `Broke Personal Records (PR count: ${prs})`, change: 300 * prs, type: 'credit' });
      }

      // 5. Short session penalty
      if (s.durationMinutes && s.durationMinutes < 35) {
        shortCount++;
        baseScore -= 100;
        feed.push({ text: `Sub-optimal session duration (< 35 mins)`, change: -100, type: 'debit' });
      }

      // 6. Distracted lifting penalty
      if (s.mmcScore && s.mmcScore < 5) {
        distractedCount++;
        baseScore -= 150;
        feed.push({ text: `Distracted lifting alert (MMC: ${s.mmcScore}/10)`, change: -150, type: 'debit' });
      }

      // leg check
      const exercises = s.exercises || [];
      exercises.forEach((ex) => {
        const muscle = (ex.muscleGroup || '').toLowerCase();
        let vol = 0;
        (ex.sets || []).forEach(set => {
          const w = set.weight === 'BW' ? 0 : parseFloat(set.weight) || 0;
          vol += w * (parseInt(set.reps) || 0);
        });
        if (muscle === 'legs' || muscle === 'quads' || muscle === 'hamstrings' || muscle === 'glutes' || muscle === 'calves') {
          legVolume += vol;
        } else {
          upperVolume += vol;
        }
      });
    });

    // 7. Leg Day Evader Check
    if (upperVolume > 0 && legVolume === 0) {
      baseScore -= 500;
      feed.push({ text: 'Leg Day Evader Penalty (No lower body volume)', change: -500, type: 'debit' });
    }

    // 8. Streak bonus
    const lastSession = activeSessions[0];
    const streak = lastSession?.streak ?? 0;
    if (streak > 0) {
      const streakBonus = Math.min(3000, streak * 150);
      baseScore += streakBonus;
      feed.push({ text: `${streak}-Day Logging Streak Reward`, change: streakBonus, type: 'credit' });
    }

    // 9. Upkeep Decay Check
    const lastDate = new Date(lastSession.date);
    const daysInactive = (Date.now() - lastDate.getTime()) / (24 * 60 * 60 * 1000);
    
    let decayMultiplier = 1;
    let decayPenalty = 0;
    if (daysInactive > 3) {
      const decayDays = Math.floor(daysInactive - 3);
      decayMultiplier = Math.pow(0.95, decayDays);
      decayPenalty = Math.round(baseScore * (1 - decayMultiplier));
      baseScore = Math.round(baseScore * decayMultiplier);
      feed.push({ text: `Upkeep decay (${decayDays} days past 72h limit)`, change: -decayPenalty, type: 'debit' });
    }

    // Cap at 10,000 and 0
    const finalScore = Math.max(0, Math.min(10000, baseScore));

    // Determine Tier
    let tier = 'Gym Novice';
    let progress = 0;
    if (finalScore >= 8000) {
      tier = 'GigaChad Ascended';
      progress = Math.round(((finalScore - 8000) / 2000) * 100);
    } else if (finalScore >= 5000) {
      tier = 'Hypertrophy Warlord';
      progress = Math.round(((finalScore - 5000) / 3000) * 100);
    } else if (finalScore >= 3000) {
      tier = 'Mass Monster';
      progress = Math.round(((finalScore - 3000) / 2000) * 100);
    } else if (finalScore >= 1500) {
      tier = 'Iron Disciple';
      progress = Math.round(((finalScore - 1500) / 1500) * 100);
    } else {
      tier = 'Gym Novice';
      progress = Math.round((finalScore / 1500) * 100);
    }

    return {
      score: finalScore,
      tier,
      tierProgress: Math.min(100, progress),
      feed: feed.reverse(),
      daysInactive: parseFloat(daysInactive.toFixed(1)),
      decayPenalty
    };
  }, [activeSessions]);

  // Beast Mode Forecast
  const forecast = useMemo(() => {
    const lastSess = activeSessions[0];
    const daysInactive = auraReport.daysInactive || 0;
    const avgMmc = activeSessions.length > 0
      ? activeSessions.reduce((acc, s) => acc + (s.mmcScore || 7), 0) / activeSessions.length
      : 7.0;
    const avgRpe = activeSessions.length > 0
      ? activeSessions.reduce((acc, s) => acc + (s.rpeScore || 7), 0) / activeSessions.length
      : 7.0;
    const streak = lastSess?.streak ?? 0;

    let vibe = '💪 SOLID GAINZ VIBE';
    let volBoost = 5;

    if (daysInactive > 3) {
      vibe = '🔋 RECOVERY MODE CHARGED';
      volBoost = 15;
    } else if (streak >= 4) {
      vibe = '⚡ UNSTOPPABLE BEAST MODE';
      volBoost = 20;
    } else if (avgRpe >= 8) {
      vibe = '🔥 HEAVY-DUTY OVERLOAD';
      volBoost = 12;
    }

    // Dynamic PR Breakthrough Probability Formulas using target weights
    const benchDiff = benchTarget - slot1Best;
    let bProb = 90 - (benchDiff * 4) + (avgMmc * 1.5) + (streak * 1.5) - (daysInactive * 2);
    const prProbBench = Math.max(1, Math.min(99, Math.round(bProb)));

    const squatDiff = squatTarget - slot2Best;
    let sProb = 90 - (squatDiff * 2.5) + (avgMmc * 1.5) + (streak * 1.5) - (daysInactive * 2);
    const prProbSquat = Math.max(1, Math.min(99, Math.round(sProb)));

    const deadliftDiff = deadliftTarget - slot3Best;
    let dProb = 92 - (deadliftDiff * 2.0) + (avgMmc * 1.5) + (streak * 1.5) - (daysInactive * 2);
    const prProbDead = Math.max(1, Math.min(99, Math.round(dProb)));

    return {
      vibe,
      volBoost,
      targetMmc: parseFloat(Math.min(9.8, avgMmc + 0.5).toFixed(1)),
      prProbBench,
      prProbSquat,
      prProbDead
    };
  }, [activeSessions, auraReport, benchTarget, squatTarget, deadliftTarget, slot1Best, slot2Best, slot3Best]);

  // Exaggerated Gainz
  const gainzStats = useMemo(() => {
    const totalVolume = activeSessions.reduce((acc, s) => acc + (s.totalVolume || 0), 0);
    const maxWeight = Math.max(...activeSessions.map(s => s.maxWeight || 0), 40);

    const elephants = parseFloat((totalVolume / 6000).toFixed(2));
    const swifts = parseFloat((totalVolume / 940).toFixed(1));
    const catLaunch = Math.round(maxWeight * 2.8);
    const teslaKm = parseFloat((totalVolume * 0.005).toFixed(1));
    const scoops = Math.round(totalVolume / 0.03);

    return {
      totalVolume,
      maxWeight,
      elephants,
      swifts,
      catLaunch,
      teslaKm,
      scoops
    };
  }, [activeSessions]);

  // Archetype & Attributes Radar Chart
  const archetype = useMemo(() => {
    if (activeSessions.length === 0) {
      return {
        name: 'The Iron Novice',
        desc: 'Ready to build their legacy in the halls of iron.',
        buffs: ['+10% Motivation', '+5% Recovery'],
        attributes: [
          { subject: 'Volume', A: 50 },
          { subject: 'Intensity', A: 50 },
          { subject: 'MMC Focus', A: 50 },
          { subject: 'Consistency', A: 50 },
          { subject: 'Sleep Hygiene', A: 50 }
        ]
      };
    }

    let totalSets = 0;
    let totalRpe = 0;
    let totalMmc = 0;
    activeSessions.forEach(s => {
      totalSets += s.totalSets || 12;
      totalRpe += s.rpeScore || 7;
      totalMmc += s.mmcScore || 7;
    });

    const avgSets = totalSets / activeSessions.length;
    const avgRpe = totalRpe / activeSessions.length;
    const avgMmc = totalMmc / activeSessions.length;
    const streak = activeSessions[0]?.streak ?? 0;
    const workoutsPerWeek = activeSessions.length / 4;

    // Attributes normalized to 0-100
    const attrVolume = Math.min(100, Math.round((avgSets / 25) * 100));
    const attrIntensity = Math.min(100, Math.round((avgRpe / 10) * 100));
    const attrMMC = Math.min(100, Math.round((avgMmc / 10) * 100));
    const attrConsistency = Math.min(100, Math.round((workoutsPerWeek / 5) * 100));
    const attrUpkeep = Math.max(10, Math.min(100, 100 - Math.round(auraReport.daysInactive * 12)));

    const attributes = [
      { subject: 'Volume (Sets)', A: attrVolume },
      { subject: 'Intensity (RPE)', A: attrIntensity },
      { subject: 'MMC Focus', A: attrMMC },
      { subject: 'Consistency', A: attrConsistency },
      { subject: 'Upkeep (Activity)', A: attrUpkeep }
    ];

    let name = 'Muscle Aesthetician';
    let desc = 'You sculpt your physique like a Michelangelo statue. Balance, proportion, and high-quality hypertrophy splits.';
    let buffs = ['+15% Muscle Symmetry', '+10% Shoulder Width Boost'];

    if (avgRpe >= 8 && avgSets < 12) {
      name = 'Heavy-Duty Stimulator';
      desc = 'Inspired by Mike Mentzer. You believe in high-intensity, low-volume, and absolute failure. Rest days are your sanctuary.';
      buffs = ['+20% Muscle Density', '-15% Workout Duration', '+30% Recovery Focus'];
    } else if (avgSets >= 18) {
      name = 'Volume Gladiator';
      desc = 'Inspired by Arnold. You chase the pump until the skin feels tight. High sets, short rests, and mind-numbing volume define your sessions.';
      buffs = ['+25% Skin Splitting Pump', '+15% Gym Mirror Stare', '-10% Rest Time Patience'];
    } else if (avgMmc >= 8) {
      name = 'Mind-Muscle Monk';
      desc = 'You don\'t just lift weights; you become the muscle. You control the negative, squeeze the apex, and visualize the fibers growing.';
      buffs = ['+30% Hypertrophy Efficiency', '+20% Joint Longevity', '+15% Mental Focus'];
    } else if (avgSets < 10 && avgRpe < 8) {
      name = 'PR Hunter';
      desc = 'You care about the numbers on the bar. Low reps, heavy weights, long rests. You lift to move the Earth.';
      buffs = ['+25% Absolute Strength', '+20% Chalk Usage', '+30% Rest Time Comfort'];
    }

    return {
      name,
      desc,
      buffs,
      attributes
    };
  }, [activeSessions, auraReport]);

  return (
    <div className="w-full max-w-[1440px] mx-auto px-2 py-4 flex flex-col gap-8 bg-[var(--bg-oled)] text-[var(--text-primary)] min-h-[90vh] font-sans">
      
      {/* Header */}
      <div className="border-b-4 border-black pb-5 mt-2 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="font-display text-4xl font-black tracking-tight uppercase leading-none text-white flex items-center gap-3">
            <Flame className="text-[var(--primary)] animate-pulse" size={32} />
            <span>⚡ {profile?.name ? `${profile.name.toUpperCase()}'S` : 'MY'} AURA & BEAST MODE FORECASTER</span>
          </h1>
          <p className="text-xs font-mono text-[var(--text-secondary)] uppercase tracking-wider mt-2.5 flex items-center gap-2">
            <span>Dynamic Performance Matrix</span>
            <span className="text-neutral-700">|</span>
            <span className="text-[var(--accent-xp)] font-bold">Rolling 30-Day Upkeep, PR Probabilities, & Exaggerated Gainz</span>
          </p>
        </div>

        {/* Demo simulator */}
        <div className="flex items-center gap-3 border-2 border-black bg-[var(--surface)] p-2.5 rounded-xl shadow-[3px_3px_0px_black]">
          <span className="text-xs font-mono text-white uppercase font-bold">Demo Simulator</span>
          <button
            onClick={() => setUseDemoData(!useDemoData)}
            className={`font-mono text-[10px] font-black px-3 py-1 rounded border-2 border-black shadow-[1.5px_1.5px_0px_black] uppercase transition-all cursor-pointer ${
              useDemoData ? 'bg-[var(--accent-xp)] text-black' : 'bg-black text-white hover:bg-neutral-900'
            }`}
          >
            {useDemoData ? 'ON (Simulated)' : 'OFF (Real)'}
          </button>
        </div>
      </div>

      {loading && !useDemoData ? (
        <div className="py-24 text-center font-mono text-sm text-neutral-500 uppercase animate-pulse flex flex-col items-center gap-2">
          <RefreshCw className="animate-spin text-[var(--primary)]" size={24} />
          <span>Syncing Gym Telemetry Logs...</span>
        </div>
      ) : activeSessions.length === 0 ? (
        <div className="border-4 border-dashed border-[#222] bg-[var(--surface)] py-20 text-center rounded-2xl flex flex-col items-center justify-center gap-4">
          <span className="text-sm font-mono text-neutral-500 uppercase">
            No logged workouts detected to compute Gym Aura.
          </span>
          <button
            onClick={() => setUseDemoData(true)}
            className="flex items-center gap-2 bg-[var(--primary)] hover:brightness-110 text-black font-display font-black text-xs uppercase px-5 py-2.5 rounded-lg border-2 border-black shadow-[3px_3px_0px_black] transition-all cursor-pointer"
          >
            <Play size={14} />
            <span>Simulate Demo Data</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: Aura Meter & Statements Ledger (col-span-5) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* Gym Aura Score Card */}
            <div className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[4px_4px_0px_black] text-left flex flex-col gap-4 relative overflow-hidden">
              <div className="flex justify-between items-center border-b border-neutral-900 pb-2">
                <span className="text-xs font-display font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Award className="text-[var(--accent-xp)]" size={16} />
                  <span>{profile?.name ? `${profile.name.toUpperCase()}'S` : 'MY'} GYM AURA TELEMETRY</span>
                </span>
                <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded bg-neutral-900 border border-neutral-800 text-neutral-400">
                  Upkeep Lock
                </span>
              </div>

              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-5xl font-display font-black tracking-tight text-[var(--accent-xp)]">
                  {auraReport.score.toLocaleString()}
                </span>
                <span className="text-xs font-mono text-neutral-500 uppercase font-black">Aura Points</span>
              </div>

              {/* Progress bar to next tier */}
              <div className="flex flex-col gap-1.5 mt-1">
                <div className="flex justify-between text-[10px] font-mono text-neutral-400">
                  <span className="font-black text-white uppercase">{auraReport.tier}</span>
                  <span>{auraReport.tierProgress}% to Ascended</span>
                </div>
                <div className="h-4 w-full bg-neutral-950 border-2 border-black rounded-lg p-[2px]">
                  <div 
                    className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent-xp)] rounded transition-all duration-1000"
                    style={{ width: `${auraReport.tierProgress}%` }}
                  />
                </div>
              </div>

              {/* Inactivity Warning */}
              {auraReport.daysInactive > 3 && (
                <div className="border border-red-500/20 bg-red-950/10 p-3 rounded-lg flex items-start gap-2.5 text-left text-xs text-red-400 font-sans">
                  <Skull className="shrink-0 text-red-500" size={16} />
                  <div>
                    <p className="font-bold uppercase font-mono text-[10px]">AURA DECAY ALERT</p>
                    <p className="mt-0.5 leading-snug">Inactive for {auraReport.daysInactive} days (&gt; 72h max). Dynamic decay applied: **-{auraReport.decayPenalty} Aura points**.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Aura Event Feed Ledger */}
            <div className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[4px_4px_0px_black] text-left flex flex-col gap-4">
              <div className="border-b border-neutral-900 pb-2 flex justify-between items-center">
                <span className="text-xs font-display font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="text-[var(--primary)]" size={16} />
                  <span>AURA LEDGER STATEMENTS</span>
                </span>
                <span className="text-[9px] font-mono text-neutral-500 uppercase">Last 30 Days</span>
              </div>

              {/* Scrollable feed list */}
              <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
                {auraReport.feed.map((item, idx) => (
                  <div 
                    key={idx} 
                    className={`border border-neutral-900 p-3 rounded-xl flex justify-between items-center gap-3 text-xs font-mono bg-black/35`}
                  >
                    <span className="text-neutral-300 leading-snug text-[11px]">{item.text}</span>
                    <span className={`font-black shrink-0 px-2 py-0.5 rounded text-[10px] ${
                      item.type === 'credit' ? 'bg-[#33ff66]/10 text-[#33ff66]' : 'bg-red-500/10 text-red-500'
                    }`}>
                      {item.change > 0 ? `+${item.change.toLocaleString()}` : item.change.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rule Book Collapsible Card */}
            <div className="border-4 border-black bg-[var(--surface)] p-5 rounded-2xl shadow-[4px_4px_0px_black] text-left flex flex-col gap-3">
              <button 
                onClick={() => setShowRuleBook(!showRuleBook)} 
                className="w-full flex justify-between items-center font-display font-black text-sm text-white uppercase tracking-wider cursor-pointer bg-transparent border-0 outline-none p-0"
              >
                <span className="flex items-center gap-2">
                  <BookOpen size={16} className="text-[var(--primary)]" />
                  <span>📖 GYM AURA RULE BOOK</span>
                </span>
                <span className="text-xs text-neutral-400">{showRuleBook ? '▲ CLOSE' : '▼ OPEN'}</span>
              </button>
              
              {showRuleBook && (
                <div className="mt-2 border-t border-neutral-900 pt-3 flex flex-col gap-2.5 font-mono text-[10px] text-neutral-400">
                  <div className="flex justify-between border-b border-neutral-900/40 pb-1.5">
                    <span className="text-white uppercase font-bold">Base Entry Point:</span>
                    <span className="text-[#33ff66] font-bold">+1,000 pts</span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-900/40 pb-1.5">
                    <span className="text-white uppercase font-bold">Completed Session:</span>
                    <span className="text-[#33ff66] font-bold">+100 pts</span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-900/40 pb-1.5">
                    <span className="text-white uppercase font-bold">High Intensity (RPE &gt;= 8):</span>
                    <span className="text-[#33ff66] font-bold">+150 pts</span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-900/40 pb-1.5">
                    <span className="text-white uppercase font-bold">Mind-Muscle Sync (MMC &gt;= 8):</span>
                    <span className="text-[#33ff66] font-bold">+150 pts</span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-900/40 pb-1.5">
                    <span className="text-white uppercase font-bold">Broke Personal Record (PR):</span>
                    <span className="text-[#33ff66] font-bold">+300 pts / PR</span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-900/40 pb-1.5">
                    <span className="text-white uppercase font-bold">Active Streak Multiplier:</span>
                    <span className="text-[#33ff66] font-bold">+150 pts / day (max 3k)</span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-900/40 pb-1.5">
                    <span className="text-white uppercase font-bold">Short Session (&lt; 35 mins):</span>
                    <span className="text-red-500 font-bold">-100 pts</span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-900/40 pb-1.5">
                    <span className="text-white uppercase font-bold">Distracted Lifting (MMC &lt; 5):</span>
                    <span className="text-red-500 font-bold">-150 pts</span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-900/40 pb-1.5">
                    <span className="text-white uppercase font-bold">Leg Day Evader (0 Lower Vol):</span>
                    <span className="text-red-500 font-bold">-500 pts</span>
                  </div>
                  <div className="flex justify-between pb-0.5">
                    <span className="text-white uppercase font-bold">Inactivity Upkeep Decay:</span>
                    <span className="text-red-500 font-bold">-5% daily (after 72h)</span>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* MIDDLE COLUMN: Beast Mode Forecast & PR Probability (col-span-7) */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* Next Session Beast Mode Forecast */}
            <div className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[4px_4px_0px_black] text-left flex flex-col gap-4">
              <div className="border-b border-neutral-900 pb-2">
                <span className="text-xs font-display font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Zap className="text-[var(--primary)]" size={16} />
                  <span>BEAST MODE NEXT SESSION FORECAST</span>
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-xl flex flex-col justify-center">
                  <span className="text-[9px] font-mono text-neutral-500 uppercase font-black">Predicted Gym Vibe</span>
                  <span className="text-base font-display font-black text-white mt-1 uppercase">
                    {forecast.vibe}
                  </span>
                </div>
                <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-xl flex flex-col justify-center">
                  <span className="text-[9px] font-mono text-neutral-500 uppercase font-black">Projected Volume Capacity</span>
                  <span className="text-base font-display font-black text-[var(--accent-xp)] mt-1 uppercase">
                    +{forecast.volBoost}% Capacity Boost
                  </span>
                </div>
              </div>

              {/* PR Probability Meters */}
              <div className="flex flex-col gap-4 mt-2">
                <span className="text-[10px] font-mono text-white uppercase font-black tracking-wider">
                  PR BREAKTHROUGH PROBABILITIES
                </span>

                <div className="flex flex-col gap-4 font-mono text-[10px]">
                  {/* Bench Press */}
                  <div className="flex flex-col gap-2 border border-neutral-900 bg-neutral-950/40 p-3.5 rounded-xl">
                    <div className="flex justify-between items-center text-white flex-wrap gap-2">
                      <div className="flex flex-col text-left">
                        <span className="font-bold text-xs uppercase text-white flex items-center gap-1.5 flex-wrap">
                          <span>💪</span>
                          <select
                            value={slot1Key}
                            onChange={(e) => setSlot1Key(e.target.value)}
                            className="bg-black border border-neutral-800 text-xs font-mono font-bold text-white px-2 py-1 rounded-lg focus:outline-none focus:border-[var(--secondary)] cursor-pointer"
                          >
                            {uniquePRsList.map(item => (
                              <option key={item.key} value={item.key} className="bg-black text-white">
                                {item.name}
                              </option>
                            ))}
                          </select>
                          <span className="text-[10px] font-mono text-neutral-500 font-normal">(Best: {slot1Best} kg)</span>
                        </span>
                      </div>
                      
                      {/* Stepper */}
                      <div className="flex items-center gap-2 border border-neutral-850 bg-black p-1 rounded-lg">
                        <button 
                          onClick={() => setBenchTarget(prev => Math.max(0, prev - 2.5))} 
                          className="w-6 h-6 flex items-center justify-center bg-[#222] hover:bg-neutral-800 text-white border border-black rounded font-bold cursor-pointer active:translate-x-[1px] active:translate-y-[1px] shadow-[1px_1px_0px_black] active:shadow-none transition-all"
                        >
                          -
                        </button>
                        <span className="font-bold text-[11px] text-white min-w-[55px] text-center">{benchTarget} kg</span>
                        <button 
                          onClick={() => setBenchTarget(prev => prev + 2.5)} 
                          className="w-6 h-6 flex items-center justify-center bg-[#222] hover:bg-neutral-800 text-white border border-black rounded font-bold cursor-pointer active:translate-x-[1px] active:translate-y-[1px] shadow-[1px_1px_0px_black] active:shadow-none transition-all"
                        >
                          +
                        </button>
                      </div>

                      <div className="font-bold text-[var(--secondary)] text-sm">{forecast.prProbBench}%</div>
                    </div>
                    <div className="h-3 w-full bg-neutral-900 border border-neutral-800 rounded p-[1px] mt-1">
                      <div className="h-full bg-[var(--secondary)] rounded-sm transition-all duration-300" style={{ width: `${forecast.prProbBench}%` }} />
                    </div>
                  </div>

                  {/* Squat */}
                  <div className="flex flex-col gap-2 border border-neutral-900 bg-neutral-950/40 p-3.5 rounded-xl">
                    <div className="flex justify-between items-center text-white flex-wrap gap-2">
                      <div className="flex flex-col text-left">
                        <span className="font-bold text-xs uppercase text-white flex items-center gap-1.5 flex-wrap">
                          <span>🏋️‍♂️</span>
                          <select
                            value={slot2Key}
                            onChange={(e) => setSlot2Key(e.target.value)}
                            className="bg-black border border-neutral-800 text-xs font-mono font-bold text-white px-2 py-1 rounded-lg focus:outline-none focus:border-[var(--primary)] cursor-pointer"
                          >
                            {uniquePRsList.map(item => (
                              <option key={item.key} value={item.key} className="bg-black text-white">
                                {item.name}
                              </option>
                            ))}
                          </select>
                          <span className="text-[10px] font-mono text-neutral-500 font-normal">(Best: {slot2Best} kg)</span>
                        </span>
                      </div>
                      
                      {/* Stepper */}
                      <div className="flex items-center gap-2 border border-neutral-850 bg-black p-1 rounded-lg">
                        <button 
                          onClick={() => setSquatTarget(prev => Math.max(0, prev - 2.5))} 
                          className="w-6 h-6 flex items-center justify-center bg-[#222] hover:bg-neutral-800 text-white border border-black rounded font-bold cursor-pointer active:translate-x-[1px] active:translate-y-[1px] shadow-[1px_1px_0px_black] active:shadow-none transition-all"
                        >
                          -
                        </button>
                        <span className="font-bold text-[11px] text-white min-w-[55px] text-center">{squatTarget} kg</span>
                        <button 
                          onClick={() => setSquatTarget(prev => prev + 2.5)} 
                          className="w-6 h-6 flex items-center justify-center bg-[#222] hover:bg-neutral-800 text-white border border-black rounded font-bold cursor-pointer active:translate-x-[1px] active:translate-y-[1px] shadow-[1px_1px_0px_black] active:shadow-none transition-all"
                        >
                          +
                        </button>
                      </div>

                      <div className="font-bold text-[var(--primary)] text-sm">{forecast.prProbSquat}%</div>
                    </div>
                    <div className="h-3 w-full bg-neutral-900 border border-neutral-800 rounded p-[1px] mt-1">
                      <div className="h-full bg-[var(--primary)] rounded-sm transition-all duration-300" style={{ width: `${forecast.prProbSquat}%` }} />
                    </div>
                  </div>

                  {/* Deadlift */}
                  <div className="flex flex-col gap-2 border border-neutral-900 bg-neutral-950/40 p-3.5 rounded-xl">
                    <div className="flex justify-between items-center text-white flex-wrap gap-2">
                      <div className="flex flex-col text-left">
                        <span className="font-bold text-xs uppercase text-white flex items-center gap-1.5 flex-wrap">
                          <span>🔥</span>
                          <select
                            value={slot3Key}
                            onChange={(e) => setSlot3Key(e.target.value)}
                            className="bg-black border border-neutral-800 text-xs font-mono font-bold text-white px-2 py-1 rounded-lg focus:outline-none focus:border-[var(--accent-xp)] cursor-pointer"
                          >
                            {uniquePRsList.map(item => (
                              <option key={item.key} value={item.key} className="bg-black text-white">
                                {item.name}
                              </option>
                            ))}
                          </select>
                          <span className="text-[10px] font-mono text-neutral-500 font-normal">(Best: {slot3Best} kg)</span>
                        </span>
                      </div>
                      
                      {/* Stepper */}
                      <div className="flex items-center gap-2 border border-neutral-850 bg-black p-1 rounded-lg">
                        <button 
                          onClick={() => setDeadliftTarget(prev => Math.max(0, prev - 2.5))} 
                          className="w-6 h-6 flex items-center justify-center bg-[#222] hover:bg-neutral-800 text-white border border-black rounded font-bold cursor-pointer active:translate-x-[1px] active:translate-y-[1px] shadow-[1px_1px_0px_black] active:shadow-none transition-all"
                        >
                          -
                        </button>
                        <span className="font-bold text-[11px] text-white min-w-[55px] text-center">{deadliftTarget} kg</span>
                        <button 
                          onClick={() => setDeadliftTarget(prev => prev + 2.5)} 
                          className="w-6 h-6 flex items-center justify-center bg-[#222] hover:bg-neutral-800 text-white border border-black rounded font-bold cursor-pointer active:translate-x-[1px] active:translate-y-[1px] shadow-[1px_1px_0px_black] active:shadow-none transition-all"
                        >
                          +
                        </button>
                      </div>

                      <div className="font-bold text-[var(--accent-xp)] text-sm">{forecast.prProbDead}%</div>
                    </div>
                    <div className="h-3 w-full bg-neutral-900 border border-neutral-800 rounded p-[1px] mt-1">
                      <div className="h-full bg-[var(--accent-xp)] rounded-sm transition-all duration-300" style={{ width: `${forecast.prProbDead}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Exaggerated Gainz Translation Panel */}
            <div className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[4px_4px_0px_black] text-left flex flex-col gap-4">
              <div className="border-b border-neutral-900 pb-2">
                <span className="text-xs font-display font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="text-[var(--secondary)]" size={16} />
                  <span>EXAGGERATED VOLUME EQUIVALENTS</span>
                </span>
              </div>

              {gainzStats.totalVolume === 0 ? (
                <div className="py-8 text-center text-xs font-mono text-neutral-500">
                  No volume calculated. Log a session to convert metrics!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Animal card */}
                  <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-xl flex flex-col gap-1 relative overflow-hidden">
                    <span className="text-[9px] font-mono text-neutral-500 uppercase font-black">African Elephants</span>
                    <span className="text-2xl font-display font-black text-white">{gainzStats.elephants}</span>
                    <p className="text-[10px] text-neutral-400 font-sans mt-1">Equivalent to carrying adult elephants on your back.</p>
                  </div>

                  {/* Vehicle card */}
                  <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-xl flex flex-col gap-1 relative overflow-hidden">
                    <span className="text-[9px] font-mono text-neutral-500 uppercase font-black">Suzuki Swifts</span>
                    <span className="text-2xl font-display font-black text-white">{gainzStats.swifts}</span>
                    <p className="text-[10px] text-neutral-400 font-sans mt-1">Equivalent to pushing hatchbacks up a steep incline.</p>
                  </div>

                  {/* Cat Launch Velocity card */}
                  <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-xl flex flex-col gap-1 md:col-span-2 relative overflow-hidden">
                    <span className="text-[9px] font-mono text-red-500 uppercase font-black">Kinetic Cat Launcher Range</span>
                    <span className="text-2xl font-display font-black text-[var(--accent-xp)]">{gainzStats.catLaunch} Meters</span>
                    <p className="text-[10px] text-neutral-400 font-sans mt-1">
                      Potential energy of your peak lift (**{gainzStats.maxWeight} kg**) could launch a standard 4kg house cat high into orbit.
                    </p>
                  </div>

                  {/* Tesla Range */}
                  <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-xl flex flex-col gap-1 relative overflow-hidden">
                    <span className="text-[9px] font-mono text-neutral-500 uppercase font-black">Tesla Model 3 Drive</span>
                    <span className="text-xl font-display font-black text-white">{gainzStats.teslaKm} km</span>
                    <p className="text-[10px] text-neutral-400 font-sans mt-1">Driving distance utilizing converted work energy.</p>
                  </div>

                  {/* Protein scoops */}
                  <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-xl flex flex-col gap-1 relative overflow-hidden">
                    <span className="text-[9px] font-mono text-neutral-500 uppercase font-black">Protein Scoops Lifted</span>
                    <span className="text-xl font-display font-black text-white">{gainzStats.scoops.toLocaleString()}</span>
                    <p className="text-[10px] text-neutral-400 font-sans mt-1">Equivalent to hoisting standard 30g scoops.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Lifter Archetype and Radar Matrix */}
            <div className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[4px_4px_0px_black] text-left flex flex-col gap-4">
              <div className="border-b border-neutral-900 pb-2">
                <span className="text-xs font-display font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Award className="text-[var(--primary)]" size={16} />
                  <span>ATHLETE ARCHETYPE PROFILE MATRIX</span>
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                
                {/* Radar chart (col-span-5) */}
                <div className="md:col-span-5 h-[200px] w-full font-mono text-[9px] select-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={archetype.attributes}>
                      <PolarGrid stroke="#222" />
                      <PolarAngleAxis dataKey="subject" stroke="#666" />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#333" tick={false} />
                      <Radar 
                        name="Attributes" 
                        dataKey="A" 
                        stroke="var(--accent-xp)" 
                        fill="var(--accent-xp)" 
                        fillOpacity={0.25} 
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* Description (col-span-7) */}
                <div className="md:col-span-7 flex flex-col gap-3">
                  <div>
                    <span className="text-[9px] font-mono text-[var(--accent-xp)] uppercase font-black">Derived Class Archetype</span>
                    <h4 className="font-display font-black text-2xl text-white uppercase tracking-wide mt-0.5">
                      {archetype.name}
                    </h4>
                    <p className="text-[11px] text-neutral-400 leading-relaxed font-sans mt-1">
                      {archetype.desc}
                    </p>
                  </div>

                  {/* Dynamic Buffs */}
                  <div className="flex flex-wrap gap-2 mt-1">
                    {archetype.buffs.map((buff, idx) => (
                      <span 
                        key={idx} 
                        className="px-2 py-0.5 border border-[#33FF66]/20 bg-[#33FF66]/5 rounded text-[9px] font-mono font-bold text-[#33FF66] uppercase"
                      >
                        {buff}
                      </span>
                    ))}
                  </div>
                </div>

              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
};
