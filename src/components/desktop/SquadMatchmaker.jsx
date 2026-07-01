import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Zap, Plus, Trash2, Search, CheckCircle, ShieldAlert, LogOut, Copy, Award, Key, Calendar, Vote, Bell, BellOff, TrendingUp, AlertTriangle, MessageSquare, Sliders, Flame, ExternalLink, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, limit, onSnapshot, serverTimestamp, orderBy } from 'firebase/firestore';
import { deriveLevelFromXP, getAvatarStyle, isTitleActive, isAuraActive } from '../../lib/xpHelpers';
import { useAuthStore } from '../../stores/useAuthStore';
import { useSquadStore } from '../../stores/useSquadStore';
import { SquadSynergy } from './SquadMatchmaker/SquadSynergy';
import { SquadWarroom } from './SquadMatchmaker/SquadWarroom';
import { SquadDraft } from './SquadMatchmaker/SquadDraft';

import { callZenkaiAPI } from '../../lib/apiClient';
import { requestNotificationPermission, sendBrowserNotification, sendPushNotification } from '../../utils/notificationHelper';
import { LineChart, Line, XAxis as ReXAxis, YAxis as ReYAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { calculateDetailedMuscleStrength } from '../../utils/strengthCalculator';




export const SquadMatchmaker = () => {
  const navigate = useNavigate();
  const { uid, profile } = useAuthStore();
  const { setSquadData } = useSquadStore();

  // Local state
  const [mySquadCode, setMySquadCode] = useState('');
  const [joinedSquads, setJoinedSquads] = useState([]);
  const [loading, setLoading] = useState(true);

  // Global Squad Store selectors
  const activeSquad = useSquadStore((state) => state.activeSquad);
  const activeSquadCode = useSquadStore((state) => state.activeSquadCode);
  const activeSquadMembers = useSquadStore((state) => state.activeSquadMembers);
  const presenceList = useSquadStore((state) => state.presenceList);
  const pollsList = useSquadStore((state) => state.pollsList);
  const activityList = useSquadStore((state) => state.activityList);

  const setActiveSquadCode = (code) => useSquadStore.setState({ activeSquadCode: code });
  const setActiveSquad = (squad) => useSquadStore.setState({ activeSquad: squad });

  // Collaboration and Synergy states
  const mountTimeRef = useRef(Date.now());
  const lastPresenceWriteTimeRef = useRef(0);
  const [yesterdayWorkoutTime, setYesterdayWorkoutTime] = useState(null); // { hours: number, minutes: number }
  const [notificationsMuted, setNotificationsMuted] = useState(
    localStorage.getItem('zenkai_mute_squad_notifications') === 'true'
  );
  const [generatingChallenge, setGeneratingChallenge] = useState(false);
  const [checkInTime, setCheckInTime] = useState('18:00');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptionsInput, setPollOptionsInput] = useState('07:00, 17:30, 19:00');
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState({}); // { [activityId]: [{ id, emoji, x, y }] }
  const [selectedActivityId, setSelectedActivityId] = useState(null);

  // Browser notifications handling for new presence and poll items
  const prevPresenceLengthRef = useRef(0);
  useEffect(() => {
    if (presenceList.length > prevPresenceLengthRef.current) {
      presenceList.forEach(data => {
        const createdTime = data.createdAt?.toDate 
          ? data.createdAt.toDate().getTime() 
          : (data.createdAt || Date.now());
        if (createdTime > mountTimeRef.current && data.uid !== uid) {
          sendBrowserNotification(
            `Gym Status Update! 📣`,
            data.time === 'Not Going'
              ? `${data.name} is resting / not going to the gym today.`
              : `${data.name} checked in to hit the gym today at ${data.time}!`
          );
        }
      });
    }
    prevPresenceLengthRef.current = presenceList.length;
  }, [presenceList, uid]);

  const prevPollsLengthRef = useRef(0);
  useEffect(() => {
    if (pollsList.length > prevPollsLengthRef.current) {
      pollsList.forEach(data => {
        const createdTime = data.createdAt?.toDate 
          ? data.createdAt.toDate().getTime() 
          : (data.createdAt || Date.now());
        if (createdTime > mountTimeRef.current && data.creatorUid !== uid) {
          sendBrowserNotification(
            `New Gym Poll! 🗳️`,
            `${data.creatorName} started a new poll: "${data.question}"`
          );
        }
      });
    }
    prevPollsLengthRef.current = pollsList.length;
  }, [pollsList, uid]);

  const selectedActivity = useMemo(() => {
    return activityList.find(a => a.id === selectedActivityId);
  }, [activityList, selectedActivityId]);

  const level = useMemo(() => {
    return profile?.level || 1;
  }, [profile?.level]);

  // Form inputs
  const [newSquadName, setNewSquadName] = useState('');
  const [memberLimit, setMemberLimit] = useState(5);
  const [joinCodeInput, setJoinCodeInput] = useState('');

  // Off-Gym Enhancements states
  const [activeTab, setActiveTab] = useState('synergy'); // 'synergy', 'warroom', 'draft'
  const [selectedAgent, setSelectedAgent] = useState(null); // for radar modal
  const [sortField, setSortField] = useState('consistency'); // for draft sorting
  const [sortAsc, setSortAsc] = useState(false);
  const [tradeTargetUid, setTradeTargetUid] = useState('');
  const [tradeModalOpen, setTradeModalOpen] = useState(false);

  // Squad member card states
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedMemberStats, setSelectedMemberStats] = useState(null);
  const [loadingMemberStats, setLoadingMemberStats] = useState(false);

  // Onboarding setup view toggling state
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Notifications
  const [successMsg, setSuccessMsg] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  const [customDialog, setCustomDialog] = useState(null); // { type: 'alert' | 'confirm', title: string, message: string, onConfirm?: () => void }

  const showAppAlert = (message, title = "System Notification") => {
    setCustomDialog({ type: 'alert', title, message });
  };

  const showAppConfirm = (message, onConfirm, title = "Action Required") => {
    setCustomDialog({ type: 'confirm', title, message, onConfirm });
  };

  // Collapsible panels state for cleaner layout
  const [isRosterCollapsed, setIsRosterCollapsed] = useState(false);
  const [isCheckInsCollapsed, setIsCheckInsCollapsed] = useState(false);
  const [isActivityFeedCollapsed, setIsActivityFeedCollapsed] = useState(false);
  const [isPollsCollapsed, setIsPollsCollapsed] = useState(false);

  // Consent-based draft states
  const [realFreeAgents, setRealFreeAgents] = useState([]);
  const [sentInvites, setSentInvites] = useState([]);
  const [incomingInvites, setIncomingInvites] = useState([]);

  // Treasure Vault states
  const [openingChest, setOpeningChest] = useState(false);
  const [openedReward, setOpenedReward] = useState(null);
  const [openedTier, setOpenedTier] = useState(null);
  const [chestOpeningType, setChestOpeningType] = useState(null);
  const [cooldownTimeLeft, setCooldownTimeLeft] = useState(0);
  const [summoningTitan, setSummoningTitan] = useState(false);

  // 1. Initialise & Sync Squad Code for current user
  // Uses profile from useAuthStore (synced by App.jsx onSnapshot) — no extra getDoc.
  useEffect(() => {
    if (!uid || !profile) return;
    
    const syncMySquadCode = async () => {
      try {
        const userRef = doc(db, 'users', uid);
        let code = profile.squadCode || '';
        let lookingForSquad = profile.lookingForSquad;
        
        // Only write if lookingForSquad is missing from profile
        if (lookingForSquad === undefined) {
          lookingForSquad = !!profile.gymId;
          await setDoc(userRef, { lookingForSquad }, { merge: true });
          useAuthStore.setState({
            profile: { ...profile, lookingForSquad }
          });
        }
        
        if (!code) {
          // Generate new squad code: ZK- + clean first 4 chars of name + 3 random digits
          const cleanName = (profile.name || 'Zenkai').replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase();
          const padName = cleanName.padEnd(4, 'X');
          const randomDigits = Math.floor(100 + Math.random() * 900);
          code = `ZK-${padName}${randomDigits}`;
          await setDoc(userRef, { squadCode: code }, { merge: true });
        }
        
        setMySquadCode(code);
        
        // Calculate actual weekly volume (since Monday of current week) from sessions subcollection
        const today = new Date();
        const currentDay = today.getDay();
        const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - daysToMonday);
        startOfWeek.setHours(0, 0, 0, 0);

        const sessionsRef = collection(db, 'users', uid, 'sessions');
        const q = query(sessionsRef, where('date', '>=', startOfWeek));
        const sessionsSnap = await getDocs(q);
        let calculatedWeeklyVolume = 0;
        sessionsSnap.forEach((docSnap) => {
          calculatedWeeklyVolume += docSnap.data().totalVolume || 0;
        });

        // Calculate 14-day consistency
        const fourteenDaysAgo = new Date(today);
        fourteenDaysAgo.setDate(today.getDate() - 14);
        const consQ = query(sessionsRef, where('date', '>=', fourteenDaysAgo), limit(20));
        const consSnap = await getDocs(consQ);
        const consistency = Math.min(100, Math.round((consSnap.size / 6) * 100));

        // Fetch all PRs to calculate hypertrophy-based strength index
        const prsCol = collection(db, 'users', uid, 'prs');
        const prsSnap = await getDocs(prsCol);
        const prs = prsSnap.docs.map(doc => doc.data());
        
        const strengthRes = calculateDetailedMuscleStrength(prs, profile);
        const generalAvg = strengthRes.general || {};
        const strengthScore = Math.round(
          ((generalAvg.chest || 30) +
           (generalAvg.back || 30) +
           (generalAvg.shoulders || 30) +
           (generalAvg.arms || 30) +
           (generalAvg.legs || 30)) / 5
        );

        const benchDoc = prs.find(p => p.exerciseKey === 'barbell_bench_press');
        const squatDoc = prs.find(p => p.exerciseKey === 'barbell_squat');
        const benchPR = benchDoc ? (parseFloat(benchDoc.weight) || 0) : 0;
        const squatPR = squatDoc ? (parseFloat(squatDoc.weight) || 0) : 0;
        
        // Sync public squad_codes document with latest stats
        const codeRef = doc(db, 'squad_codes', code);
        await setDoc(codeRef, {
          uid,
          name: profile.name || 'Anonymous Bro',
          xp: profile.xp || 0,
          level: profile.level || 1,
          streak: profile.streak || 0,
          volume: calculatedWeeklyVolume,
          squadCode: code,
          badges: profile.badges || [],
          powerUps: profile.powerUps || {},
          updatedAt: new Date(),
          lookingForSquad: lookingForSquad !== undefined ? lookingForSquad : false,
          gymId: profile.gymId || '',
          gymName: profile.gymName || '',
          benchPR,
          squatPR,
          strengthScore,
          consistency,
          goal: profile.goal || 'Fitness',
          avatarUrl: profile.avatarUrl || '',
          aura: profile.aura || '',
          activeTitle: profile.activeTitle || '',
          // Only write these PII-derived fields when the live Firestore profile has loaded.
          // They are stripped from the SWR localStorage cache, so on cold-start they will
          // be undefined. Omitting them here preserves the existing Firestore value until
          // the live snapshot arrives and the effect re-runs with real values.
          ...(profile.goal !== undefined && { goal: profile.goal }),
          ...(profile.workoutFrequency !== undefined && { workoutFrequency: profile.workoutFrequency }),
          ...(profile.dietType !== undefined && { dietType: profile.dietType }),
          totalSessions: profile.totalSessions || 0
        }, { merge: true });
        
      } catch (err) {
        console.error('[SquadMatchmaker] Error syncing squad code:', err);
      }
    };
    
    syncMySquadCode();
  }, [uid, profile?.squadCode, profile?.lookingForSquad, profile?.avatarUrl, profile?.aura, profile?.activeTitle, profile?.xp, profile?.level, profile?.streak, profile?.workoutFrequency, profile?.dietType, profile?.goal]); // Re-run when private fields become available


  // 2. Real-time query for joined squads
  useEffect(() => {
    if (!uid || !mySquadCode) return;

    setLoading(true);
    const q = query(
      collection(db, 'shared_squads'),
      where('memberUids', 'array-contains', uid)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => d.data());
      setJoinedSquads(list);
      setLoading(false);
    }, (err) => {
      console.error('[SquadMatchmaker] Real-time listener error:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [uid, mySquadCode]);

  // 3. Resolve active squad code
  useEffect(() => {
    if (joinedSquads.length === 0) {
      if (!showOnboarding) {
        setActiveSquadCode(null);
      }
      return;
    }

    let targetCode = activeSquadCode;
    if (!targetCode && !showOnboarding) {
      targetCode = joinedSquads[0].squadCode;
      setActiveSquadCode(targetCode);
    }
  }, [joinedSquads, activeSquadCode, showOnboarding]);

  // Subscribe to the active squad's data in the global Zustand store
  useEffect(() => {
    if (activeSquadCode && uid) {
      useSquadStore.getState().subscribeSquad(activeSquadCode, uid);
    } else if (activeSquadCode === null) {
      useSquadStore.getState().clearSquad();
    }
  }, [activeSquadCode, uid]);

  // Request browser notification permission when squads workspace opens
  useEffect(() => {
    if (uid) {
      requestNotificationPermission();
    }
  }, [uid]);

  // Fetch yesterday's workout time on mount / when uid changes
  useEffect(() => {
    if (!uid) return;

    const fetchYesterdayWorkout = async () => {
      try {
        const today = new Date();
        const yesterdayStart = new Date(today);
        yesterdayStart.setDate(today.getDate() - 1);
        yesterdayStart.setHours(0, 0, 0, 0);

        const yesterdayEnd = new Date(today);
        yesterdayEnd.setDate(today.getDate() - 1);
        yesterdayEnd.setHours(23, 59, 59, 999);

        const q = query(
          collection(db, 'users', uid, 'sessions'),
          where('date', '>=', yesterdayStart),
          where('date', '<=', yesterdayEnd)
        );

        const snap = await getDocs(q);
        if (!snap.empty) {
          let latestSession = null;
          let latestTime = 0;
          snap.forEach(d => {
            const data = d.data();
            const ts = data.date ? (data.date.toDate ? data.date.toDate().getTime() : new Date(data.date).getTime()) : 0;
            if (ts > latestTime) {
              latestTime = ts;
              latestSession = data;
            }
          });

          if (latestSession) {
            const sessDate = latestSession.date ? (latestSession.date.toDate ? latestSession.date.toDate() : new Date(latestSession.date)) : null;
            if (sessDate) {
              setYesterdayWorkoutTime({
                hours: sessDate.getHours(),
                minutes: sessDate.getMinutes()
              });
            }
          }
        }
      } catch (err) {
        console.error('[SquadMatchmaker] Error fetching yesterday\'s session:', err);
      }
    };

    fetchYesterdayWorkout();
  }, [uid]);

  // Gym Check-In 1-Hour Reminder notification scheduler
  useEffect(() => {
    if (!uid) return;

    const notifiedKeys = new Set();

    const checkReminders = () => {
      const now = new Date();
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();

      // 1. Teammate scheduled check-in reminders
      if (presenceList.length > 0) {
        presenceList.forEach(presence => {
          if (!presence.time || presence.time === 'Not Going') return;

          // Parse presence time e.g. "18:00"
          const [targetH, targetM] = presence.time.split(':').map(Number);
          
          // Calculate minutes from midnight
          const targetTotalMin = targetH * 60 + targetM;
          const currentTotalMin = currentHours * 60 + currentMinutes;

          // Trigger notification exactly 60 minutes before
          if (targetTotalMin - currentTotalMin === 60) {
            const key = `${presence.id}-${presence.time}-${now.toDateString()}`;
            if (!notifiedKeys.has(key)) {
              notifiedKeys.add(key);

              if (presence.id === uid) {
                sendBrowserNotification(
                  "Gym Time Reminder! 🏋️‍♂️",
                  `Your gym session starts in 1 hour at ${presence.time}. Gear up!`
                );
                showAppAlert(`Your gym session starts in 1 hour at ${presence.time}. Get ready!`, "Gym Time Reminder");
              } else {
                sendBrowserNotification(
                  "Teammate Gym Reminder! 🏋️‍♂️",
                  `${presence.name} is hitting the gym in 1 hour at ${presence.time}!`
                );
                showAppAlert(`${presence.name} is hitting the gym in 1 hour at ${presence.time}!`, "Teammate Gym Reminder");
              }
            }
          }
        });
      }

      // 2. Yesterday's workout reminder
      if (yesterdayWorkoutTime) {
        const targetTotalMin = yesterdayWorkoutTime.hours * 60 + yesterdayWorkoutTime.minutes;
        const currentTotalMin = currentHours * 60 + currentMinutes;

        if (targetTotalMin - currentTotalMin === 60) {
          const key = `yesterday-reminder-${now.toDateString()}`;
          if (!notifiedKeys.has(key)) {
            notifiedKeys.add(key);

            const formatTime = (h, m) => {
              const ampm = h >= 12 ? 'PM' : 'AM';
              const displayH = h % 12 || 12;
              const displayM = String(m).padStart(2, '0');
              return `${displayH}:${displayM} ${ampm}`;
            };

            const timeStr = formatTime(yesterdayWorkoutTime.hours, yesterdayWorkoutTime.minutes);

            sendBrowserNotification(
              "Yesterday's Gym Time Reminder! ⚡",
              `You logged a workout yesterday at ${timeStr}. Time to hit it again in 1 hour!`
            );
            showAppAlert(
              `You logged a workout yesterday at ${timeStr}. Keep the momentum going and get ready to hit the gym in 1 hour!`,
              "Yesterday's Gym Time Reminder"
            );
          }
        }
      }
    };

    checkReminders();
    const timer = setInterval(checkReminders, 30000); // Check every 30s
    return () => clearInterval(timer);
  }, [presenceList, uid, yesterdayWorkoutTime]);

  // Live Activity Feed subscription has been migrated to useSquadStore

  // 3c. Query real free agents at the same gym
  useEffect(() => {
    if (!uid || activeTab !== 'draft') return;

    const gymIdToQuery = profile?.gymId || '';
    if (!gymIdToQuery) {
      setRealFreeAgents([]);
      return;
    }

    const q = query(
      collection(db, 'squad_codes'),
      where('lookingForSquad', '==', true),
      where('gymId', '==', gymIdToQuery)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const agents = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.uid !== uid) {
          const benchPR = parseFloat(data.benchPR) || 0;
          const squatPR = parseFloat(data.squatPR) || 0;
          const volume = parseFloat(data.volume) || 0;
          const consistency = parseFloat(data.consistency) || 0;
          const level = parseInt(data.level, 10) || 1;
          const streak = parseInt(data.streak, 10) || 0;

          agents.push({
            uid: data.uid,
            name: data.name,
            squadCode: data.squadCode,
            consistency,
            squatPR,
            benchPR,
            goal: data.goal || 'Fitness',
            streak,
            attributes: [
              { subject: 'Strength', A: typeof data.strengthScore === 'number' ? data.strengthScore : Math.min(100, Math.round((benchPR + squatPR) / 3)), B: 100, fullMark: 100 },
              { subject: 'Volume', A: Math.min(100, Math.round(volume / 250)), B: 100, fullMark: 100 },
              { subject: 'Consistency', A: consistency, B: 100, fullMark: 100 },
              { subject: 'Level', A: Math.min(100, level * 5), B: 100, fullMark: 100 },
              { subject: 'Streak', A: Math.min(100, streak * 5), B: 100, fullMark: 100 }
            ]
          });
        }
      });
      setRealFreeAgents(agents);
    }, (err) => {
      console.error('[SquadMatchmaker] Free agents sync failed:', err);
    });

    return () => unsubscribe();
  }, [uid, activeTab, profile?.gymId]);

  // 3d. Query sent invites for active squad
  useEffect(() => {
    if (!uid || !activeSquadCode) {
      setSentInvites([]);
      return;
    }

    const q = query(
      collection(db, 'squad_invites'),
      where('squadCode', '==', activeSquadCode),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((docSnap) => {
        list.push(docSnap.data().inviteeUid);
      });
      setSentInvites(list);
    }, (err) => {
      console.error('[SquadMatchmaker] Sent invites sync failed:', err);
    });

    return () => unsubscribe();
  }, [uid, activeSquadCode]);

  // 3e. Query incoming invites for current user
  useEffect(() => {
    if (!uid) {
      setIncomingInvites([]);
      return;
    }

    const q = query(
      collection(db, 'squad_invites'),
      where('inviteeUid', '==', uid),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((docSnap) => {
        list.push(docSnap.data());
      });
      setIncomingInvites(list);
    }, (err) => {
      console.error('[SquadMatchmaker] Incoming invites sync failed:', err);
    });

    return () => unsubscribe();
  }, [uid]);

  // Roster sync and multiplier calculations are handled automatically by useSquadStore

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
    if (!activeSquad || !uid) return;
    const currentKeys = profile?.powerUps?.bossFightKey || 0;
    const cost = cooldownTimeLeft > 0 ? 2 : 1;

    if (currentKeys < cost) {
      showAppAlert(`You need ${cost} Boss Keys to summon the next Titan. You only have ${currentKeys}.`, "Insufficient Keys");
      return;
    }

    showAppConfirm(
      `Are you sure you want to summon the next Titan Raid? This will spend ${cost} Boss Key${cost > 1 ? 's' : ''}.`,
      async () => {
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
            
            setSuccessMsg("Titan successfully summoned! ⚔️");
            setTimeout(() => setSuccessMsg(''), 4000);
          }
        } catch (err) {
          console.error('[summonNextTitan] Error:', err);
          showAppAlert(err.message || "Failed to summon next Titan.", "Summon Error");
        } finally {
          setSummoningTitan(false);
        }
      },
      "Summon Next Titan"
    );
  };

  const handleOpenChest = async (chestType) => {
    if (!uid || openingChest) return;
    
    const cost = chestType === 'common' ? 1 : chestType === 'rare' ? 3 : 5;
    const currentKeys = profile?.powerUps?.bossFightKey || 0;

    if (currentKeys < cost) {
      showAppAlert(`Insufficient Boss Keys. Opening a ${chestType} chest costs ${cost} keys, you have ${currentKeys}.`, "Insufficient Keys");
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
        if (mySquadCode) {
          const { doc, setDoc } = await import('firebase/firestore');
          const codeRef = doc(db, 'squad_codes', mySquadCode);
          await setDoc(codeRef, {
            xp: nextXp,
            level: nextLevel,
            powerUps: nextPowerUps,
            updatedAt: new Date()
          }, { merge: true }).catch(err => console.warn('[SquadMatchmaker] Sync keys error:', err));
        }

        setOpenedReward(reward);
        setOpenedTier(tier);
      }
    } catch (err) {
      console.error('[openTreasureChest] Error:', err);
      showAppAlert(err.message || 'Failed to open treasure chest.', 'Vault Error');
    } finally {
      setOpeningChest(false);
    }
  };

  // Create Squad Action
  const handleCreateSquad = async (e) => {
    e.preventDefault();
    if (!newSquadName.trim() || !uid || !mySquadCode) return;
    
    setLoading(true);
    try {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const numbers = '0123456789';
      let randomPart = '';
      for (let i = 0; i < 3; i++) {
        randomPart += letters.charAt(Math.floor(Math.random() * letters.length));
        randomPart += numbers.charAt(Math.floor(Math.random() * numbers.length));
      }
      const squadCode = `SQ-${randomPart}`;

      const initialMember = {
        uid,
        name: `${profile?.name || 'Priyanshu'} (You)`,
        squadCode: mySquadCode,
        joinedAt: new Date()
      };

      const newSquadDoc = {
        squadCode,
        squadName: newSquadName.trim(),
        creatorUid: uid,
        memberLimit: parseInt(memberLimit, 10) || 5,
        memberUids: [uid],
        members: [initialMember],
        weeklyXPMultiplier: 1.0,
        createdAt: new Date()
      };

      await setDoc(doc(db, 'shared_squads', squadCode), newSquadDoc);
      setNewSquadName('');
      setSuccessMsg(`Squad "${newSquadDoc.squadName}" created!`);
      setTimeout(() => setSuccessMsg(''), 3000);
      
      setActiveSquadCode(squadCode);
      setShowOnboarding(false);
    } catch (err) {
      console.error('[SquadMatchmaker] Error creating squad:', err);
      showAppAlert('Failed to create squad.', 'Error');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSquad = async (e) => {
    e.preventDefault();
    if (!joinCodeInput.trim() || !uid || !mySquadCode) return;
    
    setLoading(true);
    try {
      const codeStr = joinCodeInput.trim().toUpperCase();

      // Easter egg classified promo code from Sunday newspaper
      if (codeStr === 'ZK-SYNERGY-2026') {
        try {
          const { callZenkaiAPI } = await import('../../lib/apiClient');
          const res = await callZenkaiAPI('redeemEasterEgg', {});
          
          if (res.data?.success) {
            const currentProfile = useAuthStore.getState().profile;
            if (currentProfile && res.data.nextXp) {
              useAuthStore.getState().setProfile({
                ...currentProfile,
                xp: res.data.nextXp
              });
            }
            showAppAlert('🎉 Easter Egg Activated! You found the Sunday Classifieds Secret code. +25 XP awarded for scouting the newspaper!', 'Secret Redeemed! 🎉');
          }
        } catch (err) {
          showAppAlert(err.message || '🎟️ You have already redeemed this secret classified promo code!', 'Redemption Error');
        } finally {
          setJoinCodeInput('');
          setLoading(false);
        }
        return;
      }

      const docRef = doc(db, 'shared_squads', codeStr);
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        showAppAlert('Squad Code not found!', 'Error');
        return;
      }

      const squadData = snap.data();

      if (squadData.memberUids.includes(uid)) {
        showAppAlert('You are already a member!', 'Info');
        setActiveSquad(squadData);
        setJoinCodeInput('');
        return;
      }

      const activeMembersCount = squadData.members.length;
      if (activeMembersCount >= squadData.memberLimit) {
        showAppAlert(`Squad is full! (Limit: ${squadData.memberLimit} members)`, 'Squad Full');
        return;
      }

      const newMember = {
        uid,
        name: `${profile?.name || 'Priyanshu'} (You)`,
        squadCode: mySquadCode,
        joinedAt: new Date()
      };

      const updatedSquad = {
        ...squadData,
        memberUids: [...squadData.memberUids, uid],
        members: [...squadData.members, newMember]
      };

      await setDoc(docRef, updatedSquad, { merge: true });
      setJoinCodeInput('');
      setSuccessMsg(`Joined squad "${squadData.squadName}"!`);
      setTimeout(() => setSuccessMsg(''), 3000);
      
      setActiveSquadCode(codeStr);
      setShowOnboarding(false);
    } catch (err) {
      console.error('[SquadMatchmaker] Error joining squad:', err);
      showAppAlert('Failed to join squad.', 'Error');
    } finally {
      setLoading(false);
    }
  };

  // Leave Squad Action
  const handleLeaveSquad = async () => {
    if (!activeSquad || !uid) return;
    const isCreator = activeSquad.creatorUid === uid;
    const msg = isCreator
      ? 'You are the creator. If you leave, another member will become creator (or squad will be deleted if you are the only member). Proceed?'
      : `Leave squad "${activeSquad.squadName}"?`;

    showAppConfirm(msg, async () => {
      setLoading(true);
      try {
        const { doc, deleteDoc, setDoc } = await import('firebase/firestore');
        const docRef = doc(db, 'shared_squads', activeSquad.squadCode);
        const remainingUids = activeSquad.memberUids.filter(id => id !== uid);
        const remainingMembers = activeSquad.members.filter(m => m.uid !== uid);

        if (remainingMembers.length === 0) {
          await deleteDoc(docRef);
        } else {
          let newCreator = activeSquad.creatorUid;
          if (activeSquad.creatorUid === uid) {
            newCreator = remainingMembers[0].uid;
          }

          await setDoc(docRef, {
            creatorUid: newCreator,
            memberUids: remainingUids,
            members: remainingMembers
          }, { merge: true });
        }

        setSuccessMsg(`Left squad "${activeSquad.squadName}"`);
        setTimeout(() => setSuccessMsg(''), 3000);
        setActiveSquadCode(null);
        setActiveSquad(null);
      } catch (err) {
        console.error('[SquadMatchmaker] Error leaving squad:', err);
        showAppAlert('Failed to leave squad.', "Error");
      } finally {
        setLoading(false);
      }
    }, "Confirm Leaving Squad");
  };

  // Kick Member Action
  const handleKickMember = async (targetUid) => {
    if (!activeSquad) return;
    showAppConfirm('Remove this member?', async () => {
      try {
        const { doc, setDoc } = await import('firebase/firestore');
        const docRef = doc(db, 'shared_squads', activeSquad.squadCode);
        const updatedMembers = activeSquad.members.filter(m => m.uid !== targetUid);
        const updatedUids = activeSquad.memberUids.filter(id => id !== targetUid);

        const payload = {
          members: updatedMembers,
          memberUids: updatedUids
        };

        await setDoc(docRef, payload, { merge: true });
      } catch (err) {
        console.error('[SquadMatchmaker] Failed to kick member:', err);
        showAppAlert('Failed to kick member.', "Error");
      }
    }, "Remove Member");
  };



  // Check In Handler
  const handleCheckIn = async (e) => {
    e.preventDefault();
    if (!activeSquad || !uid) return;

    // Client-side rate limiting/throttle: 5 minutes
    const now = Date.now();
    const timeSinceLastWrite = now - lastPresenceWriteTimeRef.current;
    if (timeSinceLastWrite < 5 * 60 * 1000) {
      const remainingSeconds = Math.ceil((5 * 60 * 1000 - timeSinceLastWrite) / 1000);
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      showAppAlert(`You're updating status too quickly! Please wait ${remainingMinutes} minute(s) before checking in again.`, "Check-In Throttled");
      return;
    }

    try {
      let targetTimestamp = null;
      if (checkInTime !== 'Not Going') {
        const today = new Date();
        const [h, m] = checkInTime.split(':').map(Number);
        today.setHours(h, m, 0, 0);
        targetTimestamp = today;
      }

      const presenceDocRef = doc(db, 'shared_squads', activeSquad.squadCode, 'presence', uid);
      await setDoc(presenceDocRef, {
        uid,
        name: profile?.name || 'Anonymous Bro',
        time: checkInTime,
        createdAt: serverTimestamp(),
        targetTimestamp,
        personalNotified: false,
        teammatesNotified: false
      });
      lastPresenceWriteTimeRef.current = Date.now();

      setSuccessMsg(
        checkInTime === 'Not Going'
          ? 'Recorded your rest day status ❌'
          : `Checked in for gym today at ${checkInTime}! 🏋️‍♂️`
      );
      setTimeout(() => setSuccessMsg(''), 3000);

      // Trigger instant push notification to other squad members
      const userName = profile?.name || 'A teammate';
      await sendPushNotification({
        squadCode: activeSquad.squadCode,
        title: `Gym Status Update! 📣`,
        body: checkInTime === 'Not Going'
          ? `${userName} is resting / not going to the gym today.`
          : `${userName} checked in to hit the gym today at ${checkInTime}!`,
        url: '/squad'
      });
    } catch (err) {
      console.error('[SquadMatchmaker] Check-In failed:', err);
      showAppAlert('Failed to check in.', "Error");
    }
  };

  const handleSocialAction = async (activityId, actionType) => {
    if (!activeSquadCode || !uid) return;
    try {
      const { updateDoc, arrayUnion, arrayRemove } = await import('firebase/firestore');
      const docRef = doc(db, 'shared_squads', activeSquadCode, 'activity_feed', activityId);
      
      const activityDoc = activityList.find(a => a.id === activityId);
      const arrayField = actionType === 'highFive' ? 'highFives' : 'kudos';
      const alreadyReacted = activityDoc?.[arrayField]?.includes(uid);
      
      await updateDoc(docRef, {
        [arrayField]: alreadyReacted ? arrayRemove(uid) : arrayUnion(uid)
      });
      
      triggerFloatingEmoji(activityId, actionType === 'highFive' ? '👏' : '🔥');

      // Send push notification to target user (owner of the activity doc)
      if (activityDoc && activityDoc.uid !== uid && !alreadyReacted) {
        const actionName = actionType === 'highFive' ? 'a High Five 👏' : 'Kudos 🔥';
        await sendPushNotification({
          squadCode: activeSquad.squadCode,
          recipientUids: [activityDoc.uid],
          title: `Workout Reaction!`,
          body: `${profile?.name || 'A teammate'} gave you ${actionName} for your workout!`,
          url: '/squad'
        });
      }
    } catch (err) {
      console.error('[SquadMatchmaker] Social action failed:', err);
    }
  };

  const triggerFloatingEmoji = (activityId, emoji) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newEmoji = {
      id,
      emoji,
      x: Math.random() * 60 - 30,
      y: -20 - Math.random() * 30
    };
    
    setFloatingEmojis(prev => ({
      ...prev,
      [activityId]: [...(prev[activityId] || []), newEmoji]
    }));
    
    setTimeout(() => {
      setFloatingEmojis(prev => ({
        ...prev,
        [activityId]: (prev[activityId] || []).filter(e => e.id !== id)
      }));
    }, 1200);
  };

  const handleMemberClick = async (member) => {
    setSelectedMember(member);
    setLoadingMemberStats(true);
    try {
      const { db } = await import('../../lib/firebase');
      const { doc, getDoc } = await import('firebase/firestore');
      const userSnap = await getDoc(doc(db, 'users', member.uid));
      
      let profileData = {};
      if (userSnap.exists()) {
        profileData = userSnap.data();
      }
      
      const merged = {
        ...member,
        ...profileData
      };

      // Calculate Radar Chart attributes on the fly for the selected member/agent
      const bench = parseFloat(merged.benchPR) || 0;
      const squat = parseFloat(merged.squatPR) || 0;
      const volume = parseFloat(merged.volume) || 0;
      const consistency = parseFloat(merged.consistency) || 0;
      const level = parseInt(merged.level, 10) || 1;
      const streak = parseInt(merged.streak, 10) || 0;
      
      merged.attributes = [
        { subject: 'Strength', A: typeof merged.strengthScore === 'number' ? merged.strengthScore : Math.min(100, Math.round((bench + squat) / 3)), B: 100, fullMark: 100 },
        { subject: 'Volume', A: Math.min(100, Math.round(volume / 250)), B: 100, fullMark: 100 },
        { subject: 'Consistency', A: consistency, B: 100, fullMark: 100 },
        { subject: 'Level', A: Math.min(100, level * 5), B: 100, fullMark: 100 },
        { subject: 'Streak', A: Math.min(100, streak * 5), B: 100, fullMark: 100 }
      ];

      setSelectedMemberStats(merged);
    } catch (err) {
      console.error('[SquadMatchmaker] Failed to fetch member stats:', err);
      // Fallback
      const bench = parseFloat(member.benchPR) || 0;
      const squat = parseFloat(member.squatPR) || 0;
      const volume = parseFloat(member.volume) || 0;
      const consistency = parseFloat(member.consistency) || 0;
      const level = parseInt(member.level, 10) || 1;
      const streak = parseInt(member.streak, 10) || 0;
      
      member.attributes = [
        { subject: 'Strength', A: typeof member.strengthScore === 'number' ? member.strengthScore : Math.min(100, Math.round((bench + squat) / 3)), B: 100, fullMark: 100 },
        { subject: 'Volume', A: Math.min(100, Math.round(volume / 250)), B: 100, fullMark: 100 },
        { subject: 'Consistency', A: consistency, B: 100, fullMark: 100 },
        { subject: 'Level', A: Math.min(100, level * 5), B: 100, fullMark: 100 },
        { subject: 'Streak', A: Math.min(100, streak * 5), B: 100, fullMark: 100 }
      ];
      setSelectedMemberStats(member);
    } finally {
      setLoadingMemberStats(false);
    }
  };

  const handleRescueStreak = async (targetMember) => {
    if (!uid || !profile) return;
    if (profile.xp < 50) {
      showAppAlert("You need at least 50 XP to rescue a teammate's streak!", "Insufficient XP");
      return;
    }
    
    showAppConfirm(
      `Spend 50 XP to gift a Streak Shield to ${targetMember.name.replace(' (You)', '')}?`,
      async () => {
        try {
                    const res = await callZenkaiAPI('rescueStreak', {
            targetUid: targetMember.uid,
            squadCode: activeSquad.squadCode
          });

          const { rescuerXP } = res.data;
          useAuthStore.getState().setProfile({
            ...profile,
            xp: rescuerXP
          });

          showAppAlert(`Streak rescue successful! Gifted a Streak Shield to ${targetMember.name.replace(' (You)', '')}.`, "Rescue Successful");

          // Trigger instant push notification to the rescued teammate
          await sendPushNotification({
            squadCode: activeSquad.squadCode,
            recipientUids: [targetMember.uid],
            title: `Streak Rescued! 🛡️`,
            body: `${profile?.name || 'A teammate'} rescued your streak with a Streak Shield!`,
            url: '/squad'
          });
        } catch (err) {
          console.error('[SquadMatchmaker] Streak Rescue failed:', err);
          showAppAlert(err.message || 'Failed to gift Streak Shield.', "Rescue Failed");
        }
      },
      "Confirm Spending"
    );
  };

  // Poll Creation Handler
  const handleCreatePoll = async (e) => {
    e.preventDefault();
    if (!activeSquad || !uid || !pollQuestion.trim()) return;

    setCreatingPoll(true);
    try {
      const baseOptions = pollOptionsInput
        .split(',')
        .map(o => o.trim())
        .filter(o => o.length > 0);

      if (baseOptions.length < 2) {
        showAppAlert('Please provide at least 2 comma-separated options.', "Invalid Options");
        setCreatingPoll(false);
        return;
      }

      // Automatically append 'Not Going' to options
      const options = [...baseOptions, 'Not Going'];

      const pollId = crypto.randomUUID();
      const pollRef = doc(db, 'shared_squads', activeSquad.squadCode, 'polls', pollId);

      await setDoc(pollRef, {
        question: pollQuestion.trim(),
        options,
        votes: {},
        creatorUid: uid,
        creatorName: profile?.name || 'Anonymous Bro',
        createdAt: serverTimestamp(),
        status: 'active'
      });

      // Trigger instant push notification to squad
      await sendPushNotification({
        squadCode: activeSquad.squadCode,
        title: `New Gym Poll! 🗳️`,
        body: `${profile?.name || 'A teammate'} started a new poll: "${pollQuestion.trim()}"`,
        url: '/squad'
      });

      setPollQuestion('');
      setPollOptionsInput('07:00, 17:30, 19:00');
      setSuccessMsg('Squad poll created!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('[SquadMatchmaker] Poll creation failed:', err);
      showAppAlert('Failed to create poll.', 'Error');
    } finally {
      setCreatingPoll(false);
    }
  };

  // Voting Handler
  const handleVote = async (pollId, optionIdx) => {
    if (!activeSquad || !uid) return;

    try {
      const pollRef = doc(db, 'shared_squads', activeSquad.squadCode, 'polls', pollId);
      await setDoc(pollRef, {
        votes: {
          [uid]: optionIdx
        }
      }, { merge: true });
    } catch (err) {
      console.error('[SquadMatchmaker] Voting failed:', err);
    }
  };

  // Squad Challenge Generation Handler
  const handleGenerateSquadChallenge = async () => {
    if (!activeSquad) return;
    setGeneratingChallenge(true);
    try {
      const res = await callZenkaiAPI('generateSquadChallenge', {
        squadCode: activeSquad.squadCode
      });
      if (res.data && res.data.success) {
        setSuccessMsg(`Synergy Challenge generated! ⚔️`);
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      console.error('[SquadMatchmaker] Failed to generate challenge:', err);
      showAppAlert(err.message || 'Failed to generate squad challenge.', 'Challenge Error');
    } finally {
      setGeneratingChallenge(false);
    }
  };

  // Vote to Regenerate Weekly Challenge
  const handleVoteRegenerate = async () => {
    if (!activeSquad || !uid || !activeSquad.activeChallenge) return;
    if (activeSquad.hasRegeneratedThisWeek) {
      showAppAlert('The weekly challenge has already been regenerated once.', 'Regeneration Limit');
      return;
    }

    const currentVotes = activeSquad.regenerationVotes || [];
    const nextVotes = currentVotes.includes(uid)
      ? currentVotes.filter(id => id !== uid)
      : [...currentVotes, uid];

    try {
      const squadRef = doc(db, 'shared_squads', activeSquad.squadCode);
      await setDoc(squadRef, { regenerationVotes: nextVotes }, { merge: true });
      
      const membersCount = activeSquad.members?.length || 1;
      const requiredVotes = Math.floor(membersCount / 2) + 1;

      if (nextVotes.length >= requiredVotes) {
        setGeneratingChallenge(true);
        const res = await callZenkaiAPI('generateSquadChallenge', {
          squadCode: activeSquad.squadCode,
          isRegen: true
        });
        if (res.data && res.data.success) {
          setSuccessMsg(`Synergy Challenge regenerated successfully! 🌀`);
          setTimeout(() => setSuccessMsg(''), 3000);
        }
      } else {
        setSuccessMsg(currentVotes.includes(uid) ? 'Removed your regeneration vote.' : 'Voted to regenerate challenge.');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      console.error('[SquadMatchmaker] Failed to vote/regenerate:', err);
      showAppAlert(err.message || 'Failed to update regeneration vote.', 'Vote Error');
    } finally {
      setGeneratingChallenge(false);
    }
  };

  // Claim Reward Handler
  const handleClaimReward = async () => {
    if (!activeSquad || !uid || !activeSquad.activeChallenge) return;
    const challenge = activeSquad.activeChallenge;
    if (challenge.status !== 'completed') return;
    if (challenge.claimedBy?.[uid]) {
      showAppAlert('You have already claimed your reward for this challenge!', 'Already Claimed');
      return;
    }

    try {
      const rewardType = challenge.rewardType || 'bossFightKey';
      const rewardName = challenge.rewardName || 'Boss Fight Key';

      const userRef = doc(db, 'users', uid);
      const currentProfile = useAuthStore.getState().profile || {};

      let nextPowerUps = { ...(currentProfile.powerUps || {}) };
      let nextBadges = [...(currentProfile.badges || [])];

      if (rewardType === 'bossFightKey') {
        nextPowerUps.bossFightKey = (nextPowerUps.bossFightKey || 0) + 1;
        await setDoc(userRef, { powerUps: nextPowerUps }, { merge: true });
        useAuthStore.getState().setProfile({
          ...currentProfile,
          powerUps: nextPowerUps
        });
      } else {
        if (!nextBadges.includes(challenge.title)) {
          nextBadges.push(challenge.title);
        }
        await setDoc(userRef, { badges: nextBadges }, { merge: true });
        useAuthStore.getState().setProfile({
          ...currentProfile,
          badges: nextBadges
        });
      }

      // Sync public squad_codes immediately so that teammates see updated rewards
      if (mySquadCode) {
        const codeRef = doc(db, 'squad_codes', mySquadCode);
        await setDoc(codeRef, {
          badges: nextBadges,
          powerUps: nextPowerUps,
          updatedAt: new Date()
        }, { merge: true });
      }

      // Mark as claimed in the squad document
      const squadRef = doc(db, 'shared_squads', activeSquad.squadCode);
      const nextClaimed = { ...(challenge.claimedBy || {}) };
      nextClaimed[uid] = true;

      await setDoc(squadRef, {
        activeChallenge: {
          ...challenge,
          claimedBy: nextClaimed
        }
      }, { merge: true });

      setSuccessMsg(`Successfully claimed your ${rewardName}! 🎉`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('[SquadMatchmaker] Claim reward failed:', err);
      showAppAlert('Failed to claim reward.', 'Error');
    }
  };

  // Calculations
  const isCreator = activeSquad?.creatorUid === uid;
  const activeMembersCount = activeSquadMembers.filter(m => m.checkIn).length;
  const multiplier = Math.min(1.5, 1.0 + activeMembersCount * 0.06);
  const totalVolume = activeSquadMembers.reduce((sum, m) => sum + (m.volume || 0), 0);

  // Command War Room calculations
  const squadWeeklyXPTrajectory = useMemo(() => {
    const baseSquad = 100 * activeSquadMembers.length;
    return [
      { day: 'Mon', Squad: baseSquad + 50, Ghost: 120 },
      { day: 'Tue', Squad: baseSquad + 180, Ghost: 280 },
      { day: 'Wed', Squad: baseSquad + 320, Ghost: 450 },
      { day: 'Thu', Squad: baseSquad + 510, Ghost: 620 },
      { day: 'Fri', Squad: baseSquad + 720, Ghost: 800 },
      { day: 'Sat', Squad: baseSquad + 980, Ghost: 1050 },
      { day: 'Sun', Squad: baseSquad + 1280, Ghost: 1300 }
    ];
  }, [activeSquadMembers]);

  const inactiveMembers = useMemo(() => {
    return activeSquadMembers.filter(m => {
      if (!m.updatedAt || new Date(m.updatedAt).getTime() === 0) return true;
      const hrs = (Date.now() - new Date(m.updatedAt).getTime()) / (1000 * 60 * 60);
      return hrs > 24 && m.uid !== uid;
    });
  }, [activeSquadMembers, uid]);

  const sortedFreeAgents = useMemo(() => {
    return [...realFreeAgents].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [realFreeAgents, sortField, sortAsc]);

  const handleDraftAgent = async (agent) => {
    if (!activeSquad) return;
    if (activeSquadMembers.length >= activeSquad.memberLimit) {
      setSelectedAgent(agent);
      setTradeModalOpen(true);
      if (activeSquadMembers.length > 0) {
        setTradeTargetUid(activeSquadMembers.filter(m => m.uid !== uid)[0]?.uid || '');
      }
      return;
    }

    try {
      const inviteId = `${activeSquad.squadCode}_${agent.uid}`;
      const inviteRef = doc(db, 'squad_invites', inviteId);
      await setDoc(inviteRef, {
        inviteId,
        squadCode: activeSquad.squadCode,
        squadName: activeSquad.squadName,
        inviterUid: uid,
        inviterName: profile?.name || 'Anonymous Bro',
        inviteeUid: agent.uid,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setSuccessMsg(`Draft Invite Sent to ${agent.name}!`);
      setTimeout(() => setSuccessMsg(''), 4000);

      // Trigger push notification to invitee
      await sendPushNotification({
        squadCode: activeSquad.squadCode,
        recipientUids: [agent.uid],
        title: `Squad Invite! 🎟️`,
        body: `${profile?.name || 'Someone'} invited you to join their squad: ${activeSquad.squadName}!`,
        url: '/squad'
      });
    } catch (err) {
      console.error('[SquadMatchmaker] Draft failed:', err);
      showAppAlert('Draft invite failed.', 'Error');
    }
  };

  const handleExecuteTrade = async () => {
    if (!activeSquad || !selectedAgent || !tradeTargetUid) return;

    try {
      const docRef = doc(db, 'shared_squads', activeSquad.squadCode);
      const targetMemberName = activeSquadMembers.find(m => m.uid === tradeTargetUid)?.name || 'teammate';

      const remainingMembers = activeSquad.members.filter(m => m.uid !== tradeTargetUid);
      const remainingUids = activeSquad.memberUids.filter(id => id !== tradeTargetUid);

      // Remove teammate
      await setDoc(docRef, {
        memberUids: remainingUids,
        members: remainingMembers
      }, { merge: true });

      // Send invite
      const inviteId = `${activeSquad.squadCode}_${selectedAgent.uid}`;
      const inviteRef = doc(db, 'squad_invites', inviteId);
      await setDoc(inviteRef, {
        inviteId,
        squadCode: activeSquad.squadCode,
        squadName: activeSquad.squadName,
        inviterUid: uid,
        inviterName: profile?.name || 'Anonymous Bro',
        inviteeUid: selectedAgent.uid,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      setTradeModalOpen(false);
      setSelectedAgent(null);
      setSuccessMsg(`Released ${targetMemberName} and sent invite to ${selectedAgent.name}!`);
      setTimeout(() => setSuccessMsg(''), 4000);

      // Trigger push notification to invitee
      await sendPushNotification({
        squadCode: activeSquad.squadCode,
        recipientUids: [selectedAgent.uid],
        title: `Squad Invite! 🎟️`,
        body: `${profile?.name || 'Someone'} invited you to join their squad: ${activeSquad.squadName}!`,
        url: '/squad'
      });
    } catch (err) {
      console.error('[SquadMatchmaker] Trade failed:', err);
      showAppAlert('Trade execution failed.', 'Error');
    }
  };

  const handleAcceptInvite = async (invite) => {
    try {
      const squadRef = doc(db, 'shared_squads', invite.squadCode);
      const squadSnap = await getDoc(squadRef);
      if (!squadSnap.exists()) {
        showAppAlert('Squad no longer exists.', 'Error');
        return;
      }
      const squadData = squadSnap.data();
      if (squadData.members.length >= squadData.memberLimit) {
        showAppAlert('Squad is full!', 'Error');
        return;
      }

      const newMember = {
        uid,
        name: `${profile?.name || 'Priyanshu'} (You)`,
        squadCode: mySquadCode,
        joinedAt: new Date()
      };

      const updatedSquad = {
        ...squadData,
        memberUids: [...(squadData.memberUids || []), uid],
        members: [...(squadData.members || []), newMember]
      };

      await setDoc(squadRef, updatedSquad, { merge: true });

      const inviteRef = doc(db, 'squad_invites', invite.inviteId);
      await setDoc(inviteRef, { status: 'accepted' }, { merge: true });

      setSuccessMsg(`Joined squad "${squadData.squadName}"!`);
      setTimeout(() => setSuccessMsg(''), 4000);
      setActiveSquadCode(invite.squadCode);
    } catch (err) {
      console.error('[SquadMatchmaker] Accept invite failed:', err);
      showAppAlert('Failed to accept invite.', 'Error');
    }
  };

  const handleDeclineInvite = async (invite) => {
    try {
      const inviteRef = doc(db, 'squad_invites', invite.inviteId);
      await setDoc(inviteRef, { status: 'declined' }, { merge: true });
      setSuccessMsg('Invitation declined.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('[SquadMatchmaker] Decline invite failed:', err);
    }
  };

  const handleDeclineAndMuteInvite = async (invite) => {
    try {
      const inviteRef = doc(db, 'squad_invites', invite.inviteId);
      await setDoc(inviteRef, { status: 'declined' }, { merge: true });

      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, { lookingForSquad: false }, { merge: true });

      useAuthStore.setState({
        profile: {
          ...profile,
          lookingForSquad: false
        }
      });

      if (mySquadCode) {
        const codeRef = doc(db, 'squad_codes', mySquadCode);
        await setDoc(codeRef, { lookingForSquad: false }, { merge: true });
      }

      setSuccessMsg('Invite declined and Free Agent registry turned off.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('[SquadMatchmaker] Decline and mute failed:', err);
      showAppAlert('Failed to decline invite.', 'Error');
    }
  };

  const handleToggleLookingForSquad = async () => {
    if (!uid || !profile) return;
    const currentStatus = profile.lookingForSquad;
    const newStatus = !currentStatus;

    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, { lookingForSquad: newStatus }, { merge: true });

      useAuthStore.setState({
        profile: {
          ...profile,
          lookingForSquad: newStatus
        }
      });

      if (mySquadCode) {
        const codeRef = doc(db, 'squad_codes', mySquadCode);
        await setDoc(codeRef, { lookingForSquad: newStatus }, { merge: true });
      }

      setSuccessMsg(newStatus ? 'Registered as Free Agent!' : 'Unregistered from Free Agent list.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('[SquadMatchmaker] Failed to toggle lookingForSquad:', err);
      showAppAlert('Failed to update status.', 'Error');
    }
  };

  const isAgentInSquad = (agentUid) => {
    return activeSquad?.memberUids?.includes(agentUid);
  };

  const isAgentInvitePending = (agentUid) => {
    return sentInvites.includes(agentUid);
  };

  return (
    <>
      <div className="border border-neutral-800 bg-[var(--surface)] p-6 rounded-2xl shadow-xl flex flex-col gap-6 text-left backdrop-blur-md">
      
      {/* Header */}
      <div className="border-b border-[var(--border)] pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          {/* Small Zenkai Logo on Mobile */}
          <div className="w-7 h-7 rounded bg-black border border-[var(--border)] flex items-center justify-center overflow-hidden shrink-0 select-none block lg:hidden">
            <img src="/logos/zenkai_official_logo.webp" alt="Zenkai Logo" className="w-full h-full object-contain p-0.5" />
          </div>
          <h3 className="font-display font-black text-xl text-white uppercase tracking-tight flex items-center gap-2">
            <Users className="text-[var(--primary)]" size={22} />
            <span>Fantasy League Matchmaker</span>
          </h3>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Mute Toggle */}
          <button
            onClick={() => {
              const next = !notificationsMuted;
              setNotificationsMuted(next);
              localStorage.setItem('zenkai_mute_squad_notifications', next ? 'true' : 'false');
            }}
            className="flex items-center gap-1.5 border border-[#222] hover:border-[var(--primary)] bg-black/40 px-3 py-1.5 rounded-xl text-xs font-mono text-white transition-all cursor-pointer"
            title={notificationsMuted ? "Unmute Notifications" : "Mute Notifications"}
          >
            {notificationsMuted ? (
              <>
                <BellOff size={14} className="text-red-500" />
                <span className="text-[10px] text-red-500 font-bold uppercase">Muted</span>
              </>
            ) : (
              <>
                <Bell size={14} className="text-green-500 animate-bounce" />
                <span className="text-[10px] text-green-500 font-bold uppercase">Alerts On</span>
              </>
            )}
          </button>

          {activeSquad && (
            <div className="flex items-center gap-1.5 border-2 border-black bg-black px-3.5 py-1.5 rounded-xl text-xs font-mono text-[var(--accent-xp)] font-black uppercase shadow-[3px_3px_0px_black] animate-pulse">
              <Zap size={12} />
              <span>{multiplier.toFixed(2)}x Team Multiplier</span>
            </div>
          )}

          {/* Clickable Profile Avatar */}
          <div 
            onClick={() => navigate('/profile')}
            className="w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center cursor-pointer overflow-hidden transition-all duration-300 border-2 border-black shadow-[2px_2px_0px_black] hover:scale-105 shrink-0"
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

      {loading ? (
        <div className="py-12 text-center font-mono text-xs text-neutral-500 uppercase animate-pulse">
          Connecting to Accountability Feed...
        </div>
      ) : (
        <div className="flex flex-col gap-6">

          {/* Incoming Invites Panel */}
          {incomingInvites.length > 0 && (
            <div className="border-2 border-black bg-yellow-950/20 p-4 rounded-xl shadow-[3px_3px_0px_black] flex flex-col gap-3 border-yellow-500 text-left">
              <span className="font-display font-black text-xs text-yellow-500 uppercase tracking-wider flex items-center gap-1.5">
                <Bell size={14} className="text-yellow-500 animate-bounce" />
                <span>Pending Squad Invitations ({incomingInvites.length})</span>
              </span>
              {/* No gym configured warning inside invite panel */}
              {!profile?.gymId && (
                <div className="border border-orange-500/40 bg-orange-950/20 p-2.5 rounded-lg flex items-center justify-between gap-3 text-xs font-mono">
                  <span className="text-orange-400 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="shrink-0" />
                    You need a Home Gym set to accept squad invites.
                  </span>
                  <button
                    onClick={() => navigate('/profile')}
                    className="shrink-0 flex items-center gap-1 bg-orange-500 hover:bg-orange-400 text-black font-display font-black text-[10px] px-3 py-1.5 border border-black rounded shadow-[1.5px_1.5px_0px_black] uppercase cursor-pointer transition-all"
                  >
                    <ExternalLink size={10} />
                    Set Up Gym
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-2.5">
                {incomingInvites.map((invite) => (
                  <div key={invite.inviteId} className="border border-yellow-500/30 bg-black/40 p-3 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs font-mono text-white">
                    <div className="flex flex-col text-left">
                      <span><strong>{invite.inviterName}</strong> invited you to join <strong>{invite.squadName}</strong></span>
                      <span className="text-[9px] text-neutral-500 uppercase mt-0.5">Code: {invite.squadCode}</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => handleAcceptInvite(invite)}
                        disabled={!profile?.gymId}
                        title={!profile?.gymId ? 'Configure your Home Gym first' : ''}
                        className="bg-green-500 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-black font-display font-black text-[10px] px-3 py-1.5 border border-black rounded shadow-[1.5px_1.5px_0px_black] uppercase cursor-pointer transition-all"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleDeclineInvite(invite)}
                        className="bg-red-500 hover:bg-red-600 text-black font-display font-black text-[10px] px-3 py-1.5 border border-black rounded shadow-[1.5px_1.5px_0px_black] uppercase cursor-pointer transition-all"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => handleDeclineAndMuteInvite(invite)}
                        className="bg-neutral-800 hover:bg-neutral-700 text-white font-display font-black text-[10px] px-3 py-1.5 border border-black rounded shadow-[1.5px_1.5px_0px_black] uppercase cursor-pointer transition-all"
                        title="Decline invite and opt out from Free Agent registry"
                      >
                        Decline & Turn Off Invites
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
           {/* Roster Switcher Dropdown */}
          {joinedSquads.length > 0 && (
            <div className="border-2 border-black rounded-xl p-3 bg-neutral-900/30 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-[4px_4px_0px_black] text-left pb-3 mb-1">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase font-bold whitespace-nowrap">Switch Accountability Squad</span>
                <select
                  value={activeSquadCode || ''}
                  onChange={(e) => {
                    setActiveSquadCode(e.target.value);
                    setShowOnboarding(false);
                  }}
                  className="bg-black border-2 border-black px-3 py-1.5 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-[var(--primary)] w-full sm:w-64 cursor-pointer"
                >
                  {joinedSquads.map(s => (
                    <option key={s.squadCode} value={s.squadCode}>
                      {s.squadName} ({s.squadCode})
                    </option>
                  ))}
                </select>
              </div>

              {!showOnboarding ? (
                <button
                  onClick={() => {
                    setShowOnboarding(true);
                  }}
                  className="bg-[var(--primary)] text-black border-2 border-black font-display font-black text-xs px-4 py-2.5 rounded-xl cursor-pointer uppercase shadow-[3px_3px_0px_black] hover:bg-orange-500 hover:text-white transition-all shrink-0 w-full sm:w-auto text-center"
                >
                  Create/Join New
                </button>
              ) : (
                <button
                  onClick={() => {
                    setShowOnboarding(false);
                    if (!activeSquadCode && joinedSquads.length > 0) {
                      setActiveSquadCode(joinedSquads[0].squadCode);
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 bg-neutral-950 text-white border-2 border-black font-display font-black text-xs px-4 py-2.5 rounded-xl cursor-pointer uppercase shadow-[3px_3px_0px_black] hover:bg-neutral-900 transition-all shrink-0 w-full sm:w-auto text-center"
                >
                  <ArrowLeft size={12} className="text-[var(--primary)]" />
                  <span>Back to Squad</span>
                </button>
              )}
            </div>
          )}

          {(activeSquad === null || showOnboarding) ? (
            /* ONBOARDING STATE: CREATE OR JOIN A SQUAD */
            <div className="flex flex-col gap-6 animate-fadeIn">
              {joinedSquads.length > 0 && (
                <div className="flex items-center justify-start">
                  <button
                    onClick={() => {
                      setShowOnboarding(false);
                      if (!activeSquadCode && joinedSquads.length > 0) {
                        setActiveSquadCode(joinedSquads[0].squadCode);
                      }
                    }}
                    className="flex items-center gap-1.5 bg-neutral-900 border border-[#222] hover:border-[var(--primary)] text-neutral-400 hover:text-white font-mono text-[10px] font-bold px-4 py-2 rounded-lg cursor-pointer uppercase transition-all shadow-md"
                  >
                    <ArrowLeft size={10} className="text-[var(--primary)]" />
                    <span>Back to Squad Dashboard</span>
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Join Squad Panel */}
                <form onSubmit={handleJoinSquad} className="border border-[#222] bg-black/40 p-5 rounded-xl flex flex-col justify-between gap-4">
                  <div className="flex flex-col gap-4">
                    <span className="text-xs font-mono text-white uppercase font-extrabold tracking-wider flex items-center gap-1.5">
                      <Search size={14} className="text-[var(--secondary)]" />
                      <span>Join an Existing Squad</span>
                    </span>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-mono text-[var(--text-secondary)] uppercase">Squad Code</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. SQ-ABC123"
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(e.target.value)}
                        className="bg-black border border-[#222] px-3 py-1.5 rounded-lg text-xs font-mono text-white placeholder-neutral-700 focus:outline-none focus:border-[var(--primary)] w-full uppercase"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="bg-[var(--secondary)] text-black font-mono text-xs font-black py-2 border border-black rounded-lg shadow-[2px_2px_0px_black] uppercase cursor-pointer active:scale-95 transition-all w-full"
                  >
                    Join Squad
                  </button>
                </form>

                {/* Create Squad Panel */}
                <form onSubmit={handleCreateSquad} className="border border-[#222] bg-black/40 p-5 rounded-xl flex flex-col gap-4 justify-between">
                  <div className="flex flex-col gap-4">
                    <span className="text-xs font-mono text-white uppercase font-extrabold tracking-wider flex items-center gap-1.5">
                      <Plus size={14} className="text-[var(--primary)]" />
                      <span>Create a New Squad</span>
                    </span>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-mono text-[var(--text-secondary)] uppercase">Squad Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Iron Temple Bros"
                        value={newSquadName}
                        onChange={(e) => setNewSquadName(e.target.value)}
                        className="bg-black border border-[#222] px-3 py-1.5 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-[var(--primary)] w-full"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-mono text-[var(--text-secondary)] uppercase">Member Limit</label>
                      <select
                        value={memberLimit}
                        onChange={(e) => setMemberLimit(parseInt(e.target.value, 10))}
                        className="bg-black border border-[#222] px-3 py-1.5 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-[var(--primary)] w-full cursor-pointer"
                      >
                        {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                          <option key={n} value={n}>{n} Members Max</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="bg-[var(--primary)] text-white font-mono text-xs font-bold py-2 border border-black rounded-lg shadow-[2px_2px_0px_black] uppercase cursor-pointer active:scale-95 transition-all mt-2 w-full"
                  >
                    Create Squad
                  </button>
                </form>

              </div>
            </div>
          ) : (
            /* ACTIVE SQUAD VIEW */
            <div className="flex flex-col gap-6">
              
              {/* Active Squad Card */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--surface)] border-2 border-black p-5 rounded-2xl shadow-[4px_4px_0px_black]">
                <div className="flex flex-col text-left gap-1">
                  <span className="text-[9px] font-mono text-[var(--primary)] uppercase font-extrabold tracking-widest bg-[var(--primary)]/10 border border-[var(--primary)]/20 px-2 py-0.5 rounded w-max">Active Squad</span>
                  <h4 className="font-display font-black text-2xl text-white uppercase tracking-tight mt-1">
                    {activeSquad.squadName}
                  </h4>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-neutral-400">
                    <span className="flex items-center gap-1">
                      👥 <strong className="text-white">{activeSquadMembers.length}</strong> / {activeSquad.memberLimit} members
                    </span>
                    <span>•</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(activeSquad.squadCode);
                        setSuccessMsg('Squad code copied! Share it with friends.');
                        setCopiedCode(true);
                        setTimeout(() => {
                          setSuccessMsg(null);
                          setCopiedCode(false);
                        }, 2000);
                      }}
                      className="text-[var(--accent-xp)] hover:underline flex items-center gap-1 font-bold cursor-pointer"
                    >
                      🔑 Code: {activeSquad.squadCode} {copiedCode ? '(Copied!)' : '(Copy)'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end mt-2 sm:mt-0">
                  <button
                    onClick={handleLeaveSquad}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-red-950/20 border-2 border-red-500/30 hover:border-red-500 text-red-500 hover:bg-red-500/10 font-mono text-[10px] font-black px-4 py-2.5 rounded-xl cursor-pointer uppercase transition-all shadow-[2px_2px_0px_rgba(239,68,68,0.2)]"
                  >
                    <LogOut size={12} />
                    <span>Leave Squad</span>
                  </button>
                </div>
              </div>

              {/* Neubrutalist Tab Controls */}
              <div className="flex border-4 border-black bg-black p-1 rounded-2xl w-full max-w-2xl overflow-x-auto no-scrollbar shrink-0 select-none shadow-[4px_4px_0px_black] gap-1 mt-1">
                {[
                  { id: 'synergy', label: '🗳️ Synergy & Scheduler', icon: Calendar },
                  { id: 'warroom', label: '🛡️ Command War Room', icon: Sliders },
                  { id: 'draft', label: '💸 Moneyball Draft', icon: TrendingUp }
                ].map(t => {
                  const Icon = t.icon;
                  const active = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id)}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 font-display font-black text-[10px] md:text-xs uppercase rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-[var(--primary)] text-black border-2 border-black shadow-[2px_2px_0px_black]'
                          : 'text-neutral-400 hover:text-white border-2 border-transparent bg-transparent'
                      }`}
                    >
                      <Icon size={14} className={active ? 'text-black' : 'text-neutral-500'} />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {activeTab === 'synergy' && (
                <SquadSynergy 
                  activeSquad={activeSquad} activeSquadMembers={activeSquadMembers} pollsList={pollsList} activityList={activityList} incomingInvites={incomingInvites}
                  isRosterCollapsed={isRosterCollapsed} setIsRosterCollapsed={setIsRosterCollapsed} isCheckInsCollapsed={isCheckInsCollapsed} setIsCheckInsCollapsed={setIsCheckInsCollapsed}
                  isActivityFeedCollapsed={isActivityFeedCollapsed} setIsActivityFeedCollapsed={setIsActivityFeedCollapsed} isPollsCollapsed={isPollsCollapsed} setIsPollsCollapsed={setIsPollsCollapsed}
                  handleMemberClick={handleMemberClick} handleRescueStreak={handleRescueStreak} handleKickMember={handleKickMember} handleVote={handleVote} handleSocialAction={handleSocialAction}
                  handleAcceptInvite={handleAcceptInvite} handleRejectInvite={handleDeclineInvite} setSelectedActivityId={setSelectedActivityId} avatarStyle={{}} isTitleActive={() => false}
                  floatingEmojis={floatingEmojis} uid={uid} profile={profile}
                  totalVolume={totalVolume} presenceList={presenceList}
                  handleVoteRegenerate={handleVoteRegenerate} generatingChallenge={generatingChallenge} handleClaimReward={handleClaimReward}
                  cooldownTimeLeft={cooldownTimeLeft} formatCooldownTime={formatCooldownTime} handleSummonNextTitan={handleSummonNextTitan}
                  summoningTitan={summoningTitan} handleGenerateSquadChallenge={handleGenerateSquadChallenge} isCreator={isCreator}
                  handleCheckIn={handleCheckIn} checkInTime={checkInTime} setCheckInTime={setCheckInTime} showAppAlert={showAppAlert}
                  handleCreatePoll={handleCreatePoll} pollQuestion={pollQuestion} setPollQuestion={setPollQuestion}
                  pollOptionsInput={pollOptionsInput} setPollOptionsInput={setPollOptionsInput} creatingPoll={creatingPoll}
                />
              )}

              {activeTab === 'warroom' && (
                <SquadWarroom 
                  activeSquad={activeSquad} 
                  activeSquadMembers={activeSquadMembers} 
                  profile={profile}
                  inactiveMembers={inactiveMembers}
                  squadWeeklyXPTrajectory={squadWeeklyXPTrajectory}
                  multiplier={multiplier}
                  totalVolume={totalVolume}
                  setSuccessMsg={setSuccessMsg}
                />
              )}

              {activeTab === 'draft' && (
                <SquadDraft 
                  profile={profile} 
                  realFreeAgents={realFreeAgents} 
                  sortedFreeAgents={realFreeAgents} 
                  sortField={sortField} 
                  setSortField={setSortField} 
                  sortAsc={sortAsc} 
                  setSortAsc={setSortAsc} 
                  handleInviteAgent={handleDraftAgent} 
                  isAgentInvitePending={isAgentInvitePending} 
                  setSelectedAgent={setSelectedAgent} 
                  handleDraftAgent={handleDraftAgent}
                  handleToggleLookingForSquad={handleToggleLookingForSquad}
                  handleMemberClick={handleMemberClick}
                  isAgentInSquad={isAgentInSquad}
                />
              )}

              

            </div>
          )}

          {/* Squad Member & Free Agent Unified Stats Card Modal Overlay */}
          <AnimatePresence>
            {selectedMember && (
              <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[6px_6px_0px_black] w-full max-w-md text-left flex flex-col gap-4 relative font-mono text-xs"
                >
                  <button
                    onClick={() => setSelectedMember(null)}
                    className="absolute top-4 right-4 text-neutral-400 hover:text-white font-bold text-lg cursor-pointer"
                  >
                    ✕
                  </button>

                  <div className="border-b-2 border-black pb-3">
                    <span className="text-[10px] text-[var(--accent-xp)] uppercase font-bold tracking-wider block">
                      {isAgentInSquad(selectedMember.uid) ? "Squad Mate Profile Card" : "Athlete Scouting Card"}
                    </span>
                    <div className="flex items-center gap-3 mt-1.5">
                      <div 
                        className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden border-2 border-[var(--border)]"
                        style={getAvatarStyle(selectedMember.aura, selectedMember.level, selectedMember.powerUps)}
                      >
                        {selectedMember.avatarUrl ? (
                          <img src={selectedMember.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-display font-extrabold text-sm text-white">
                            {selectedMember.name?.slice(0, 2).toUpperCase() || 'ZK'}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col text-left">
                        <h4 className="font-display font-black text-xl text-white uppercase leading-tight">
                          {selectedMember.name?.replace(' (You)', '')}
                        </h4>
                        {selectedMember.activeTitle && (() => {
                          const isDemo = selectedMember.activeTitle === 'PR Demon' && isTitleActive('pr_demon', selectedMember.powerUps);
                          const isTitan = selectedMember.activeTitle === 'Titan Hunter' && isTitleActive('titan_hunter', selectedMember.powerUps);
                          if (!isDemo && !isTitan) return null;
                          return (
                            <span className="text-[9px] text-[var(--accent-xp)] font-bold uppercase tracking-widest mt-0.5">
                              {selectedMember.activeTitle}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {loadingMemberStats ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-2 text-neutral-400">
                      <div className="w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
                      <span className="text-[10px] uppercase font-bold">Scanning database...</span>
                    </div>
                  ) : selectedMemberStats ? (
                    <div className="flex flex-col gap-3.5">
                      {/* Core Stats Grid */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-black/30 p-2 rounded-lg border border-neutral-900 flex flex-col">
                          <span className="text-[8px] text-neutral-500 uppercase">Level</span>
                          <span className="text-white font-bold text-sm mt-0.5">
                            {selectedMemberStats.level || 1}
                          </span>
                        </div>
                        <div className="bg-black/30 p-2 rounded-lg border border-neutral-900 flex flex-col">
                          <span className="text-[8px] text-neutral-500 uppercase">Streak</span>
                          <span className="text-[var(--primary)] font-bold text-sm mt-0.5">
                            🔥 {selectedMemberStats.streak || 0}d
                          </span>
                        </div>
                        <div className="bg-black/30 p-2 rounded-lg border border-neutral-900 flex flex-col">
                          <span className="text-[8px] text-neutral-500 uppercase">Aura Power</span>
                          <span className="text-purple-400 font-bold text-sm mt-0.5">
                            ✨ {selectedMemberStats.aura && isAuraActive(selectedMemberStats.aura, selectedMemberStats.powerUps) ? selectedMemberStats.aura.replace('aura_', '').toUpperCase() : 'NONE'}
                          </span>
                        </div>
                      </div>

                      {/* Scouting Radar Chart */}
                      {selectedMemberStats.attributes && (
                        <div className="h-[160px] w-full font-mono text-[9px] my-1 bg-black/10 rounded-lg p-2 border border-neutral-900/50">
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={selectedMemberStats.attributes}>
                              <PolarGrid stroke="#222" />
                              <PolarAngleAxis dataKey="subject" stroke="#666" />
                              <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#333" tick={false} />
                              <Radar name={selectedMemberStats.name} dataKey="A" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {/* Onboarding & Goals Section */}
                      <div className="bg-black/25 p-3 rounded-lg border border-neutral-900 flex flex-col gap-2 text-xs">
                        <div className="flex justify-between border-b border-neutral-900/60 pb-1.5">
                          <span className="text-neutral-500">Fitness Goal:</span>
                          <span className="text-white font-bold">{selectedMemberStats.goal || 'Not set'}</span>
                        </div>
                        <div className="flex justify-between border-b border-neutral-900/60 pb-1.5">
                          <span className="text-neutral-500">Frequency:</span>
                          <span className="text-white font-bold">{selectedMemberStats.workoutFrequency || 'Not set'}</span>
                        </div>
                        <div className="flex justify-between border-b border-neutral-900/60 pb-1.5">
                          <span className="text-neutral-500">Diet Type:</span>
                          <span className="text-white font-bold">{selectedMemberStats.dietType || 'Not set'}</span>
                        </div>
                        <div className="flex justify-between border-b border-neutral-900/60 pb-1.5">
                          <span className="text-neutral-500">Active Gym:</span>
                          <span className="text-white font-bold">{selectedMemberStats.gymName || 'No gym joined'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Total Workouts:</span>
                          <span className="text-white font-bold">{selectedMemberStats.totalSessions || 0} logged</span>
                        </div>
                      </div>

                      {/* Trophies & Inventory */}
                      <div className="bg-black/25 p-3 rounded-lg border border-neutral-900 flex flex-col gap-2 text-xs">
                        <div className="text-[9px] text-neutral-500 uppercase font-bold tracking-wider">
                          Trophy & Inventory Status
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <div className="bg-neutral-900/80 px-2 py-1 rounded border border-neutral-800 flex items-center gap-1">
                            <Award size={10} className="text-[var(--accent-xp)]" />
                            <span className="text-[10px] text-white">
                              {(selectedMemberStats.badges || []).length} Trophies
                            </span>
                          </div>
                          <div className="bg-neutral-900/80 px-2 py-1 rounded border border-neutral-800 flex items-center gap-1">
                            <Flame size={10} className="text-orange-500" />
                            <span className="text-[10px] text-white">
                              {selectedMemberStats.powerUps?.streakShield || 0} Shields
                            </span>
                          </div>
                          <div className="bg-neutral-900/80 px-2 py-1 rounded border border-neutral-800 flex items-center gap-1">
                            <Key size={10} className="text-[var(--primary)]" />
                            <span className="text-[10px] text-white">
                              {selectedMemberStats.powerUps?.bossFightKey || 0} Boss Keys
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 text-center text-neutral-500 text-xs">
                      Failed to load player stats.
                    </div>
                  )}

                  <div className="flex justify-end gap-3 border-t border-[#181818] pt-4 mt-2">
                    {isAgentInSquad(selectedMember.uid) ? (
                      selectedMember.uid !== uid && (
                        <button
                          onClick={() => {
                            const hoursSinceLastWorkout = selectedMember.updatedAt 
                              ? (Date.now() - new Date(selectedMember.updatedAt).getTime()) / (1000 * 60 * 60)
                              : 999;
                            const isStreakExpiring = hoursSinceLastWorkout > 24 && (selectedMember.streak || 0) > 0 && !(selectedMember.powerUps?.streakShield > 0);

                            if (isStreakExpiring) {
                              handleRescueStreak(selectedMember);
                            } else {
                              showAppAlert("This teammate's streak is active and does not require rescue!", "Streak Active");
                            }
                          }}
                          className={`px-4 py-2 border-2 border-black text-xs font-bold rounded shadow-[2px_2px_0px_black] uppercase cursor-pointer ${
                            selectedMember.streak > 0 
                              ? "bg-orange-500 text-black hover:bg-orange-600" 
                              : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                          }`}
                        >
                          Rescue Streak
                        </button>
                      )
                    ) : (
                      isAgentInvitePending(selectedMember.uid) ? (
                        <button
                          disabled
                          className="px-4 py-2 border-2 border-black text-xs font-mono font-bold text-neutral-500 bg-neutral-900 rounded shadow-[2px_2px_0px_black] uppercase cursor-not-allowed"
                        >
                          Pending Invite
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            handleDraftAgent(selectedMember);
                            setSelectedMember(null);
                          }}
                          className="px-4 py-2 border-2 border-black text-xs font-mono font-bold text-black bg-[var(--primary)] hover:brightness-110 rounded shadow-[2px_2px_0px_black] uppercase cursor-pointer"
                        >
                          Draft Agent
                        </button>
                      )
                    )}
                    <button
                      onClick={() => setSelectedMember(null)}
                      className="px-4 py-2 border-2 border-black text-xs font-bold text-white bg-black hover:bg-neutral-900 rounded shadow-[2px_2px_0px_black] uppercase cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Workout Details Modal moved to bottom */}

          {/* Trade Modal Overlay */}
          <AnimatePresence>
            {tradeModalOpen && selectedAgent && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[5px_5px_0px_black] w-full max-w-md text-left flex flex-col gap-4"
                >
                  <div className="border-b-2 border-black pb-3">
                    <span className="text-[10px] font-mono text-red-500 uppercase font-black block">🚨 Squad Capacity Reached</span>
                    <h4 className="font-display font-black text-xl text-white uppercase mt-0.5">
                      Draft Trade Protocol
                    </h4>
                    <p className="text-[11px] text-neutral-400 font-sans leading-relaxed mt-2.5">
                      Your squad is at capacity ({activeSquad.memberLimit}/{activeSquad.memberLimit} members). To draft <strong>{selectedAgent.name}</strong>, select a teammate to trade/release.
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5 mt-2">
                    <label className="text-[9px] font-mono text-[var(--text-secondary)] uppercase font-bold">Select Teammate to Release</label>
                    <select
                      value={tradeTargetUid}
                      onChange={(e) => setTradeTargetUid(e.target.value)}
                      className="bg-black border border-[#222] px-3.5 py-2 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-[var(--primary)] w-full cursor-pointer"
                    >
                      {activeSquadMembers.filter(m => m.uid !== uid).map(m => (
                        <option key={m.uid} value={m.uid}>
                          {m.name.replace(' (You)', '')} (Streak: {m.streak}d, Vol: {Math.round(m.volume || 0)}kg)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end gap-3 border-t border-[#181818] pt-4 mt-2">
                    <button
                      onClick={() => {
                        setTradeModalOpen(false);
                        setSelectedAgent(null);
                      }}
                      className="px-4 py-2 border-2 border-black text-xs font-mono font-bold text-white bg-black hover:bg-neutral-900 rounded shadow-[2px_2px_0px_black] uppercase cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleExecuteTrade}
                      className="px-4 py-2 border-2 border-black text-xs font-mono font-bold text-black bg-red-500 hover:bg-red-600 rounded shadow-[2px_2px_0px_black] uppercase cursor-pointer"
                    >
                      Confirm Trade
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
          {/* Treasure Chest Opening Modal */}
          <AnimatePresence>
            {(openingChest || openedReward) && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[150] p-4 backdrop-blur-md">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[8px_8px_0px_black] w-full max-w-sm text-center flex flex-col items-center gap-5 relative font-mono text-xs"
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
                      <h4 className="font-display font-black text-lg text-white uppercase tracking-wider animate-pulse mt-2">
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
                        <h4 className="font-display font-black text-xl text-white uppercase tracking-tight leading-none mt-1">
                          {openedReward.name}
                        </h4>
                        <p className="text-xs text-neutral-300 font-sans mt-2.5 px-4 leading-relaxed">
                          {openedReward.description}
                        </p>
                      </div>

                      <button
                        onClick={() => setOpenedReward(null)}
                        className="w-full mt-4 bg-[var(--accent-xp)] hover:bg-[#a3f020] text-black font-display font-black text-sm uppercase py-3 border-2 border-black rounded-xl shadow-[3px_3px_0px_black] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                      >
                        Sweet! Claim Loot
                      </button>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Custom Dialog Modal Overlay */}
          <AnimatePresence>
            {customDialog && (
              <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[6px_6px_0px_black] w-full max-w-sm text-left flex flex-col gap-4 font-mono text-xs border-orange-500"
                >
                  <div className="border-b-2 border-black pb-2">
                    <span className="text-[10px] text-orange-500 uppercase font-black tracking-wider block">
                      {customDialog.title}
                    </span>
                  </div>

                  <p className="text-white text-xs leading-relaxed font-sans">
                    {customDialog.message}
                  </p>

                  <div className="flex justify-end gap-3 border-t border-[#181818] pt-4 mt-2">
                    {customDialog.type === 'confirm' && (
                      <button
                        onClick={() => {
                          setCustomDialog(null);
                        }}
                        className="px-4 py-2 border-2 border-black text-xs font-mono font-bold text-white bg-black hover:bg-neutral-900 rounded shadow-[2px_2px_0px_black] uppercase cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (customDialog.onConfirm) {
                          customDialog.onConfirm();
                        }
                        setCustomDialog(null);
                      }}
                      className="px-4 py-2 border-2 border-black text-xs font-mono font-bold text-black bg-[var(--primary)] hover:brightness-110 rounded shadow-[2px_2px_0px_black] uppercase cursor-pointer"
                    >
                      {customDialog.type === 'confirm' ? 'Confirm' : 'OK'}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Feedback messages */}
          {successMsg && (
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#33FF66] justify-center mt-2">
              <CheckCircle size={12} />
              <span>{successMsg}</span>
            </div>
          )}

          <p className="text-[9px] text-[var(--text-muted)] leading-relaxed font-sans mt-2">
            Weekly Accountability: The Team Multiplier multiplies all XP earned by squad members from logging workouts. If any member has a streak of 0 days (fails to log within 48h), their check-in resets, and the team multiplier decreases!
          </p>

        </div>
      )}

    </div>

    {/* Workout Details Modal Overlay */}
    <AnimatePresence>
      {selectedActivity && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="my-auto w-full max-w-lg bg-[var(--surface)] border-4 border-black p-6 rounded-2xl shadow-[8px_8px_0px_black] text-left flex flex-col gap-4 relative font-mono text-xs max-h-[90vh] overflow-y-auto"
          >
            <button
              onClick={() => setSelectedActivityId(null)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white font-bold text-lg cursor-pointer"
            >
              ✕
            </button>

            <div className="border-b-2 border-black pb-3">
              <span className="text-[10px] text-[var(--accent-xp)] uppercase font-bold tracking-wider block">
                Workout Session Details
              </span>
              <h3 className="font-display font-black text-2xl text-white uppercase mt-1 tracking-wide leading-tight">
                {selectedActivity.workoutName}
              </h3>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-neutral-400 text-[10px]">
                <span>Logged by: <strong className="text-white">{selectedActivity.name}</strong></span>
                <span className="text-neutral-700">•</span>
                <span>Date: <strong className="text-white">{selectedActivity.createdAt ? new Date(selectedActivity.createdAt.toDate ? selectedActivity.createdAt.toDate() : selectedActivity.createdAt).toLocaleDateString() : 'Just now'}</strong></span>
              </div>
            </div>

            {/* Summary Stats Row */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-black/30 p-2 rounded-lg border border-neutral-900 flex flex-col justify-center items-center">
                <span className="text-[8px] text-neutral-500 uppercase">Total Volume</span>
                <span className="text-[var(--primary)] font-bold text-sm mt-0.5">
                  {Math.round(selectedActivity.totalVolume).toLocaleString()}kg
                </span>
              </div>
              <div className="bg-black/30 p-2 rounded-lg border border-neutral-900 flex flex-col justify-center items-center">
                <span className="text-[8px] text-neutral-500 uppercase">Exercises</span>
                <span className="text-white font-bold text-sm mt-0.5">
                  {selectedActivity.exercisesCount}
                </span>
              </div>
              <div className="bg-black/30 p-2 rounded-lg border border-neutral-900 flex flex-col justify-center items-center">
                <span className="text-[8px] text-neutral-500 uppercase">Sets</span>
                <span className="text-white font-bold text-sm mt-0.5">
                  {selectedActivity.totalSets}
                </span>
              </div>
              <div className="bg-black/30 p-2 rounded-lg border border-neutral-900 flex flex-col justify-center items-center">
                <span className="text-[8px] text-neutral-500 uppercase">Duration</span>
                <span className="text-secondary font-bold text-sm mt-0.5">
                  {selectedActivity.durationMinutes ? `${selectedActivity.durationMinutes}m` : 'N/A'}
                </span>
              </div>
            </div>

            {/* PRs Broken Section */}
            {selectedActivity.prNames && selectedActivity.prNames.length > 0 && (
              <div className="flex flex-col gap-1.5 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                <span className="text-amber-400 font-bold uppercase text-[9px] tracking-wider flex items-center gap-1">
                  🏆 Personal Records Broken:
                </span>
                <div className="flex flex-wrap gap-1.5 mt-0.5">
                  {selectedActivity.prNames.map((pr, prIdx) => (
                    <span key={prIdx} className="bg-amber-500/10 text-amber-400 border border-amber-500/25 px-2 py-1 rounded-md uppercase font-extrabold text-[9px] tracking-wide shadow-sm">
                      {pr}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Exercises Details */}
            <div className="flex flex-col gap-2 mt-1">
              <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider">
                Exercise Breakdown:
              </span>
              {selectedActivity.exercises && selectedActivity.exercises.length > 0 ? (
                <div className="flex flex-col gap-2.5 pr-1">
                  {selectedActivity.exercises.map((ex, exIdx) => (
                    <div key={exIdx} className="bg-neutral-950/40 border border-neutral-900 rounded-xl p-3 flex flex-col gap-2">
                      <div className="flex justify-between items-center border-b border-neutral-900/40 pb-1.5">
                        <span className="text-white font-bold text-xs uppercase">{ex.name}</span>
                        <span className="text-[8px] text-neutral-500 uppercase bg-neutral-900 px-1.5 py-0.5 rounded font-mono">
                          {ex.muscleGroup || 'General'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {ex.sets.map((set, setIdx) => (
                          <span key={setIdx} className="text-[9px] bg-neutral-900/60 border border-neutral-800 text-neutral-300 px-2 py-1 rounded font-mono">
                            Set {setIdx + 1}: <strong className="text-white">{set.weight === 'BW' ? 'BW' : `${set.weight}kg`}</strong> x <strong className="text-white">{set.reps}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-neutral-500 text-[10px] italic py-2">
                  Detailed exercise breakdown is only available for newly logged workouts.
                </div>
              )}
            </div>

            {/* Social Actions inside the Modal */}
            <div className="flex gap-2 justify-end border-t border-[#181818] pt-4 mt-2">
              <button
                onClick={() => handleSocialAction(selectedActivity.id, 'highFive')}
                className={`flex items-center gap-1.5 font-display font-black text-xs px-4 py-2 border border-neutral-800 rounded-lg uppercase cursor-pointer transition-all ${
                  selectedActivity.highFives?.includes(uid)
                    ? 'bg-yellow-500 text-black border-yellow-500 shadow-sm'
                    : 'bg-neutral-950 text-white hover:bg-neutral-900'
                }`}
              >
                <span>👏</span>
                <span>{selectedActivity.highFives?.length || 0} High-Fives</span>
              </button>

              <button
                onClick={() => handleSocialAction(selectedActivity.id, 'kudos')}
                className={`flex items-center gap-1.5 font-display font-black text-xs px-4 py-2 border border-neutral-800 rounded-lg uppercase cursor-pointer transition-all ${
                  selectedActivity.kudos?.includes(uid)
                    ? 'bg-red-600 text-white border-red-600 shadow-sm'
                    : 'bg-neutral-950 text-white hover:bg-neutral-900'
                }`}
              >
                <span>🔥</span>
                <span>{selectedActivity.kudos?.length || 0} Kudos</span>
              </button>

              <button
                onClick={() => setSelectedActivityId(null)}
                className="px-4 py-2 border-2 border-black text-xs font-bold text-white bg-black hover:bg-neutral-900 rounded shadow-[2px_2px_0px_black] uppercase cursor-pointer"
              >
                Close
              </button>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  </>
  );
};
