import React, { useState, useEffect, useMemo } from 'react';
import { Activity, Trophy, ShieldAlert, Sparkles, Search, Dumbbell, LayoutGrid, Users, History, ChevronRight, MessageSquareCode, Flame, Newspaper } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, limit, getDocs, onSnapshot } from 'firebase/firestore';
import { calculateMuscleFatigue } from '../../utils/fatigueCalculator';
import { calculateDetailedMuscleStrength } from '../../utils/strengthCalculator';
import { usePRList } from '../../hooks/useProgress';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

// Revert to using the original high-quality shared mannequin components
import { MuscleMap, MuscleDetailPanel } from '../shared/MuscleMap';
import { CommandPalette } from '../shared/CommandPalette';
import { NeubrutalistCalendar } from '../shared/NeubrutalistCalendar';
import { PrehabDaemon } from './PrehabDaemon';
import exerciseData from '../../data/exercises.json';

const SessionCardSkeleton = () => (
  <div className="border-2 border-black bg-[var(--surface)] p-5 rounded-2xl shadow-[4px_4px_0px_rgba(0,0,0,0.15)] flex flex-col gap-4 text-left animate-pulse select-none">
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-[#222] pb-3">
      <div className="flex flex-col gap-1.5">
        <div className="w-24 h-3 bg-[var(--bg-elevated)] rounded" />
        <div className="w-40 h-5 bg-[var(--bg-elevated)] rounded" />
      </div>
      <div className="w-24 h-5 bg-[var(--bg-elevated)] rounded border border-[#222]" />
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="border border-[#222] bg-black/40 p-2.5 rounded-xl flex flex-col gap-1.5">
          <div className="w-16 h-2 bg-[var(--bg-elevated)] rounded" />
          <div className="w-10 h-4 bg-[var(--bg-elevated)] rounded" />
        </div>
      ))}
    </div>
    <div className="flex flex-col gap-2">
      <div className="w-32 h-3 bg-[var(--bg-elevated)] rounded" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {[1, 2].map((i) => (
          <div key={i} className="border border-[#1a1a1a] bg-black/25 p-3 rounded-xl flex justify-between items-center">
            <div className="flex flex-col gap-1.5">
              <div className="w-24 h-3.5 bg-[var(--bg-elevated)] rounded" />
              <div className="w-16 h-2.5 bg-[var(--bg-elevated)] rounded" />
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="w-12 h-3.5 bg-[var(--bg-elevated)] rounded" />
              <div className="w-10 h-2.5 bg-[var(--bg-elevated)] rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const MannequinSkeleton = () => (
  <div className="flex flex-col gap-6 animate-pulse select-none w-full">
    {/* Toggles Placeholder */}
    <div className="flex justify-between items-center border-b border-[var(--border)] pb-4">
      <div className="flex gap-2">
        <div className="w-20 h-8 bg-[var(--bg-elevated)] rounded-lg border border-[#222]" />
        <div className="w-24 h-8 bg-[var(--bg-elevated)] rounded-lg border border-[#222]" />
      </div>
      <div className="w-24 h-8 bg-[var(--bg-elevated)] rounded-lg border border-[#222]" />
    </div>
    {/* Graphic Core Placeholder */}
    <div className="flex justify-center">
      <div className="w-full max-w-[280px] h-[380px] bg-[var(--bg-elevated)] border-2 border-black rounded-2xl shadow-[4px_4px_0px_black] flex items-center justify-center">
        <div className="text-xs font-mono text-[var(--text-secondary)] uppercase">⚙️ Loading Mannequin...</div>
      </div>
    </div>
    {/* Detail Panel Placeholder */}
    <div className="border border-[#222] bg-black/40 p-4 rounded-xl flex flex-col gap-1.5 min-h-[68px]">
      <div className="w-24 h-3.5 bg-[var(--bg-elevated)] rounded" />
      <div className="w-48 h-2.5 bg-[var(--bg-elevated)] rounded mt-1" />
    </div>
  </div>
);

export const DesktopDashboard = () => {
  const { uid, profile } = useAuthStore();
  const { prs } = usePRList(uid);

  // States for Mannequin Telemetry
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [fatigueData, setFatigueData] = useState({});
  const [selectedMuscleKey, setSelectedMuscleKey] = useState(null);
  const [mannequinView, setMannequinView] = useState('front');
  const [mannequinMode, setMannequinMode] = useState('fatigue');
  const [viewType, setViewType] = useState('grouped');

  // States for Exercises Telemetry
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('all');

  // Create a fast-lookup map of user's personal records (keys to weight/reps)
  const prsMap = useMemo(() => {
    const map = {};
    if (prs && Array.isArray(prs)) {
      prs.forEach(p => {
        if (p.exerciseKey) {
          map[p.exerciseKey] = p;
        }
      });
    }
    return map;
  }, [prs]);

  // Compute strength metrics using the shared calculator
  const strengthData = useMemo(() => {
    return calculateDetailedMuscleStrength(prs || [], profile || {});
  }, [prs, profile]);

  // Fetch recent workouts from both "sessions" and "executed_sessions" collections
  useEffect(() => {
    if (!uid) return;
    setLoadingSessions(true);

    let unsubMobile = null;
    let unsubDesktop = null;
    let mobileSessionsList = [];
    let desktopSessionsList = [];

    const mergeAndSet = (mobileList, desktopList) => {
      try {
        const merged = [...mobileList, ...desktopList]
          .sort((a, b) => b.date - a.date)
          .slice(0, 20);

        setSessions(merged);

        // Compute muscle fatigue — only pass sessions that have exercise data.
        // Sessions 4-20 were fetched without subcollection exercises (read optimization)
        // so passing them with exercises:[] would dilute the chronic baseline to near-zero,
        // making the fatigue chart show almost nothing. Filter them out first.
        const sessionsWithExercises = merged.filter(s => s.exercises && s.exercises.length > 0);
        const bwKg = parseFloat(profile?.weightKg) || 70;
        const fatigue = calculateMuscleFatigue(sessionsWithExercises, bwKg);
        setFatigueData(fatigue);
      } catch (err) {
        console.error('[DesktopDashboard] Error merging sessions and calculating fatigue:', err);
      } finally {
        setLoadingSessions(false);
      }
    };

    // Listen to mobile sessions
    try {
      const sessionsRef = collection(db, 'users', uid, 'sessions');
      const qMobile = query(sessionsRef, orderBy('date', 'desc'), limit(20));
      
      unsubMobile = onSnapshot(qMobile, async (snapMobile) => {
        const tempMobile = [];
        const docsArray = snapMobile.docs || [];
        
        for (let i = 0; i < docsArray.length; i++) {
          const docSnap = docsArray[i];
          try {
            const sessData = docSnap.data();
            
            // Check for flat exercises first (0 additional reads); fallback to subcollection for top 3
            let exercises = [];
            if (sessData.exercises && Array.isArray(sessData.exercises) && sessData.exercises.length > 0) {
              exercises = sessData.exercises;
            } else if (i < 3) {
              const exSnap = await getDocs(collection(db, 'users', uid, 'sessions', docSnap.id, 'exercises'));
              exercises = exSnap.docs.map(exDoc => exDoc.data());
            }
            
            const rawDate = sessData.date;
            let resolvedDate = new Date();
            if (rawDate) {
              if (rawDate.toDate) resolvedDate = rawDate.toDate();
              else if (rawDate.seconds) resolvedDate = new Date(rawDate.seconds * 1000);
              else resolvedDate = new Date(rawDate);
            }

            tempMobile.push({
              id: docSnap.id,
              source: 'mobile',
              ...sessData,
              date: resolvedDate,
              exercises
            });
          } catch (exErr) {
            console.error('[DesktopDashboard] Error loading exercises for session:', docSnap.id, exErr);
          }
        }
        mobileSessionsList = tempMobile;
        mergeAndSet(mobileSessionsList, desktopSessionsList);
      }, (err) => {
        console.error('[DesktopDashboard] Error in mobile sessions listener:', err);
        setLoadingSessions(false);
      });
    } catch (err) {
      console.error('[DesktopDashboard] Error setting up mobile sessions listener:', err);
    }

    // Listen to desktop sessions
    try {
      const execRef = collection(db, 'users', uid, 'executed_sessions');
      const qDesktop = query(execRef, orderBy('date', 'desc'), limit(20));
      
      unsubDesktop = onSnapshot(qDesktop, (snapDesktop) => {
        const tempDesktop = snapDesktop.docs.map(docSnap => {
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
            source: 'desktop',
            ...sessData,
            date: resolvedDate,
          };
        });
        desktopSessionsList = tempDesktop;
        mergeAndSet(mobileSessionsList, desktopSessionsList);
      }, (err) => {
        console.error('[DesktopDashboard] Error in desktop sessions listener:', err);
        setLoadingSessions(false);
      });
    } catch (err) {
      console.error('[DesktopDashboard] Error setting up desktop sessions listener:', err);
    }

    return () => {
      if (unsubMobile) unsubMobile();
      if (unsubDesktop) unsubDesktop();
    };
  }, [uid]);

  // Filter the full exercises list based on search queries and muscle groups
  const filteredExercises = useMemo(() => {
    return exerciseData.filter(ex => {
      const matchesSearch = ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            ex.aliases.some(alias => alias.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesGroup = selectedGroupFilter === 'all' || ex.muscleGroup === selectedGroupFilter;
      return matchesSearch && matchesGroup;
    });
  }, [searchQuery, selectedGroupFilter]);

  // Command Deck items config
  const commandCards = [
    {
      title: 'Recap Cinema',
      desc: 'Review/edit recent gym sessions, configure muscle cues, and adjust RPE/MMC sliders.',
      badge: 'Post-Workout Recap',
      link: '/recap',
      icon: Activity,
      color: 'hover:border-[var(--primary)]',
      bgGlow: 'hover:shadow-[0_0_15px_var(--primary-glow)]'
    },
    {
      title: 'Aura & Beast Mode',
      desc: 'Analyze your rolling 30-day telemetry, trace your Aura statements feed, and check PR probabilities.',
      badge: 'Performance Forecaster',
      link: '/aura-forecaster',
      icon: Flame,
      color: 'hover:border-[var(--accent-xp)]',
      bgGlow: 'hover:shadow-[0_0_15px_rgba(181,255,45,0.25)]'
    },
    {
      title: 'Sunday Magazine',
      desc: 'Read your weekly AI-generated fitness magazine, featuring coaching roasts and cue vault overlays.',
      badge: 'Ruthless AI Coach',
      link: '/magazine',
      icon: Newspaper,
      color: 'hover:border-blue-400',
      bgGlow: 'hover:shadow-[0_0_15px_rgba(96,165,250,0.25)]'
    },
    {
      title: 'Poster Studio',
      desc: 'Design neubrutalist milestone achievement posters with QR sharing and exports.',
      badge: 'Milestone Builder',
      link: '/poster',
      icon: Sparkles,
      color: 'hover:border-purple-400',
      bgGlow: 'hover:shadow-[0_0_15px_rgba(167,139,250,0.25)]'
    }
  ];

  const displayedSessions = useMemo(() => sessions.slice(0, 3), [sessions]);

  return (
    <div className="w-full max-w-[1440px] mx-auto px-2 py-4 flex flex-col gap-8 bg-[var(--bg-oled)] text-[var(--text-primary)] min-h-[90vh] font-sans select-none">
      
      {/* Mount keyboard Command Palette */}
      <CommandPalette />

      {/* Dashboard Header with Telemetry Indicators */}
      <div className="border-b-4 border-black pb-5 mt-2 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="font-display text-4xl font-black tracking-tight uppercase leading-none text-white flex items-center gap-3">
            <Activity className="text-[var(--primary)]" size={32} />
            <span>ZENKAI TELEMETRY CENTER</span>
          </h1>
          <p className="text-xs font-mono text-[var(--text-secondary)] uppercase tracking-wider mt-2.5 flex items-center gap-2">
            <span>Desktop Off-Gym Planning & Analysis Deck</span>
            <span className="text-neutral-700">|</span>
            <span className="text-[var(--secondary)] font-bold animate-pulse">● SYSTEM ONLINE</span>
            <span className="text-neutral-700">|</span>
            <span className="text-[var(--accent-xp)] font-bold">Press [Ctrl+K] to trigger console</span>
          </p>
        </div>

        {/* Global stats badges */}
        <div className="flex gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 border-2 border-black bg-[var(--surface)] px-4 py-2 rounded-lg shadow-[3px_3px_0px_black] font-bold text-[var(--primary)] uppercase">
            <Trophy size={14} />
            <span>Level {profile?.level || 1} {profile?.levelName || 'Rookie'}</span>
          </div>
          <div className="flex items-center gap-2 border-2 border-black bg-[var(--surface)] px-4 py-2 rounded-lg shadow-[3px_3px_0px_black] font-bold text-[var(--secondary)] uppercase">
            <Sparkles size={14} />
            <span>Streak: {profile?.streak || 0} Days 🔥</span>
          </div>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: Command Center Overview Deck & Execution Log (col-span-8) */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          
          {/* Section: Command Cards */}
          <div className="flex flex-col gap-4">
            <h2 className="font-display font-black text-2xl text-white uppercase tracking-tight text-left">
              Quick Workspace Tools
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {commandCards.map((card, idx) => (
                <Link
                  key={idx}
                  to={card.link}
                  className={`border-4 border-black bg-[var(--surface)] p-5 rounded-2xl shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all text-left flex flex-col justify-between min-h-[160px] group ${card.color} ${card.bgGlow}`}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="px-2 py-0.5 border border-[#333] text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider font-bold rounded group-hover:border-current group-hover:text-white transition-all">
                        {card.badge}
                      </span>
                      <card.icon className="text-[var(--text-secondary)] group-hover:text-white group-hover:scale-110 transition-all" size={18} />
                    </div>
                    
                    <h3 className="font-display font-black text-xl text-white uppercase tracking-wide group-hover:text-white transition-all mt-1">
                      {card.title}
                    </h3>
                    
                    <p className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-all font-sans leading-relaxed">
                      {card.desc}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 mt-3 text-[10px] font-mono font-bold text-[var(--text-secondary)] group-hover:text-white self-end transition-all">
                    <span>Open Dashboard</span>
                    <ChevronRight size={10} />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Section: Recent Execution Logs Feed */}
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-2.5">
              <h2 className="font-display font-black text-2xl text-white uppercase tracking-tight flex items-center gap-2">
                <History className="text-[var(--primary)]" size={22} />
                <span>Recent Gym Execution Logs</span>
              </h2>
              <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase">
                {displayedSessions.length} Loaded Logs
              </span>
            </div>

            {loadingSessions ? (
              <div className="flex flex-col gap-5">
                <SessionCardSkeleton />
                <SessionCardSkeleton />
                <SessionCardSkeleton />
              </div>
            ) : sessions.length === 0 ? (
              <div className="border-2 border-black border-dashed bg-[var(--surface)] py-16 text-center font-mono text-xs text-[var(--text-secondary)] uppercase rounded-xl shadow-[4px_4px_0px_black]">
                No recent workout sessions recorded. Start logging on mobile!
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {displayedSessions.map((sess) => (
                  <div
                    key={sess.id}
                    className="border-2 border-black bg-[var(--surface)] p-5 rounded-2xl shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-4 text-left"
                  >
                    {/* Log Card Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-[#222] pb-3">
                      <div>
                        <span className="font-mono text-[11px] uppercase font-black text-[var(--primary)] block tracking-wide">
                          {sess.name || (sess.planDayId === 'custom' || !sess.planDayId ? 'Custom Session' : `Day ${sess.planDayId} Session`)}
                        </span>
                        <h4 className="font-display font-bold text-xs text-neutral-400 uppercase tracking-wide mt-0.5">
                          Completed on {sess.date.toLocaleDateString('en-IN', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </h4>
                      </div>
                      
                      <div className="flex items-center gap-2 font-mono">
                        <span className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider ${
                          sess.source === 'desktop'
                            ? 'bg-[#00d4ff10] text-[var(--secondary)] border border-[var(--secondary)]'
                            : 'bg-[#b5ff2d10] text-[var(--accent-xp)] border border-[var(--accent-xp)]'
                        }`}>
                          {sess.source === 'desktop' ? '🖥️ Desktop Edited' : '📱 Mobile App Log'}
                        </span>
                        {sess.moodTag && (
                          <span className="text-xs bg-[#111] px-2.5 py-0.5 rounded-md border border-[#222]">
                            {sess.moodTag === 'locked_in' ? '⚡ Locked In' : sess.moodTag === 'low_energy' ? '🔋 Low Energy' : '😐 Average'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stats details */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                      <div className="border border-[#222] bg-black/40 p-2.5 rounded-xl text-left">
                        <span className="text-[9px] text-[var(--text-secondary)] uppercase">RPE (Exertion)</span>
                        <span className="font-bold text-white block mt-0.5">{sess.rpeScore || 'N/A'}/10</span>
                      </div>
                      <div className="border border-[#222] bg-black/40 p-2.5 rounded-xl text-left">
                        <span className="text-[9px] text-[var(--text-secondary)] uppercase">MMC (Mind-Muscle)</span>
                        <span className="font-bold text-white block mt-0.5">{sess.mmcScore || 'N/A'}/10</span>
                      </div>
                      <div className="border border-[#222] bg-black/40 p-2.5 rounded-xl text-left col-span-2">
                        <span className="text-[9px] text-[var(--text-secondary)] uppercase">Workout Notes</span>
                        <span className="font-bold text-white block mt-0.5 truncate">{sess.notes || 'No cues written.'}</span>
                      </div>
                    </div>

                    {/* Exercises Summary list */}
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider font-bold">
                        Logged Movements:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {sess.exercises?.map((ex, idx) => (
                          <div key={idx} className="border border-[#1a1a1a] bg-black/25 p-3 rounded-xl flex items-center justify-between">
                            <div className="flex flex-col min-w-0 text-left">
                              <span className="text-xs font-bold text-white truncate">{ex.name}</span>
                              <span className="text-[8px] font-mono text-neutral-500 uppercase mt-0.5">
                                {ex.muscleGroup} • {ex.sets?.length || 0} Working Sets
                              </span>
                            </div>

                            <div className="flex flex-col items-end font-mono shrink-0">
                              <span className="text-xs font-black text-[var(--accent-xp)]">
                                {ex.sets?.[0]?.weight || 0} kg
                              </span>
                              <span className="text-[8px] text-[var(--text-secondary)] uppercase">
                                reps: {ex.sets?.[0]?.reps || 0}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Quick Recap Edit link */}
                    <div className="flex justify-end mt-2 pt-2 border-t border-[#161616]">
                      <Link
                        to="/recap"
                        className="flex items-center gap-1 text-[10px] font-mono font-bold text-[var(--primary)] hover:text-white uppercase transition-all"
                      >
                        <span>Adjust values in Recap Cinema</span>
                        <ChevronRight size={10} />
                      </Link>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: Cleaned-up Telemetry sidebar & Catalog (col-span-4) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Prehab Stretch Daemon Widget */}
          <PrehabDaemon sessions={sessions} />

          {/* Workout History Calendar */}
          <NeubrutalistCalendar sessions={sessions} />

          {/* Mannequin Telemetry Card (Cleaned up: only mannequin, toggles, details. Removed radar chart, legends, etc.) */}
          <div className="border-2 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[5px_5px_0px_rgba(0,0,0,1)] flex flex-col gap-6">
            <div className="border-b border-[var(--border)] pb-3">
              <h3 className="font-display font-black text-xl text-white uppercase tracking-tight flex items-center gap-2">
                <ShieldAlert className="text-[var(--primary)]" size={20} />
                <span>Mannequin Telemetry</span>
              </h3>
            </div>

            {loadingSessions ? (
              <MannequinSkeleton />
            ) : (
              <div className="flex flex-col gap-6">
                {/* Cleaned-Up Mannequin Workspace */}
                <div className="flex justify-center">
                  <MuscleMap
                    fatigueData={fatigueData}
                    strengthData={strengthData}
                    activeMuscle={selectedMuscleKey}
                    onMuscleClick={(m) => setSelectedMuscleKey(selectedMuscleKey === m ? null : m)}
                    mode={mannequinMode}
                    setMode={setMannequinMode}
                    view={mannequinView}
                    setView={setMannequinView}
                    viewType={viewType}
                    setViewType={(vt) => {
                      setViewType(vt);
                      setSelectedMuscleKey(null);
                    }}
                  />
                </div>

                {/* Minimalist Details Block */}
                <MuscleDetailPanel
                  muscleKey={selectedMuscleKey}
                  fatigueScore={
                    mannequinMode === 'fatigue'
                      ? (viewType === 'individual'
                          ? (fatigueData.individual?.[selectedMuscleKey] || 0)
                          : (fatigueData.general?.[selectedMuscleKey] || 0))
                      : 0
                  }
                  strengthScore={
                    viewType === 'individual'
                      ? (strengthData.individual?.[selectedMuscleKey] || 0)
                      : (strengthData.general?.[selectedMuscleKey] || 0)
                  }
                  mode={mannequinMode}
                />
              </div>
            )}
          </div>

          {/* Exercises Telemetry Catalog */}
          <div className="border-2 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[5px_5px_0px_rgba(0,0,0,1)] flex flex-col gap-4 h-[500px]">
            <div className="border-b border-[var(--border)] pb-3">
              <h3 className="font-display font-black text-xl text-white uppercase tracking-tight flex items-center gap-2">
                <Dumbbell className="text-[var(--primary)]" size={20} />
                <span>Exercises Catalog</span>
              </h3>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col gap-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search exercise..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black border border-[#222] px-4 py-2.5 pl-10 rounded-xl text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-[var(--primary)]"
                />
                <Search className="absolute left-3 top-3 text-neutral-600" size={14} />
              </div>

              <div className="flex gap-2 items-center">
                <span className="text-[10px] font-mono font-bold text-[var(--text-secondary)] uppercase">Group:</span>
                <select
                  value={selectedGroupFilter}
                  onChange={(e) => setSelectedGroupFilter(e.target.value)}
                  className="bg-black border border-[#222] px-3 py-1 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-[var(--primary)]"
                >
                  <option value="all">All Muscles</option>
                  <option value="chest">Chest</option>
                  <option value="back">Back</option>
                  <option value="shoulders">Shoulders</option>
                  <option value="arms">Arms</option>
                  <option value="legs">Legs</option>
                  <option value="core">Core</option>
                </select>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 mt-2">
              {filteredExercises.length === 0 ? (
                <div className="text-center py-12 font-mono text-xs text-[var(--text-secondary)] uppercase">
                  No movements found.
                </div>
              ) : (
                filteredExercises.map((ex) => {
                  const logged = prsMap[ex.key];
                  return (
                    <div
                      key={ex.key}
                      className={`flex items-center justify-between p-3.5 rounded-xl border-2 transition-all ${
                        logged
                          ? 'border-[var(--accent-xp)] bg-[#b5ff2d08]'
                          : 'border-black bg-[var(--bg-elevated)] opacity-60'
                      }`}
                    >
                      <div className="flex flex-col gap-0.5 text-left min-w-0">
                        <span className="text-xs font-bold text-white truncate max-w-[170px]">
                          {ex.name}
                        </span>
                        <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                          {ex.muscleGroup} • {ex.equipmentRequired.join(', ') || 'bodyweight'}
                        </span>
                      </div>

                      <div className="flex items-center">
                        {logged ? (
                          <div className="flex flex-col items-end font-mono">
                            <span className="text-xs font-bold text-[var(--accent-xp)]">
                              ✅ {logged.maxWeight || 0} kg
                            </span>
                            <span className="text-[8px] text-[var(--text-secondary)] uppercase font-semibold">
                              PR Reps: {logged.reps || 0}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] font-mono text-neutral-600 uppercase font-bold pr-2">
                            ⚪ Unlogged
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
