import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Zap, Plus, Trash2, Search, CheckCircle, ShieldAlert, LogOut, Copy, Award, Key, Calendar, Vote, Bell, BellOff, TrendingUp, AlertTriangle, MessageSquare, Sliders, Flame, ExternalLink, ArrowLeft } from 'lucide-react';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, limit, onSnapshot, serverTimestamp, orderBy } from 'firebase/firestore';
import { deriveLevelFromXP, getAvatarStyle, isTitleActive, isAuraActive } from '../../lib/xpHelpers';
import { useAuthStore } from '../../stores/useAuthStore';
import { useSquadStore } from '../../stores/useSquadStore';
import { callZenkaiAPI } from '../../lib/apiClient';
import { requestNotificationPermission, sendBrowserNotification, sendPushNotification } from '../../utils/notificationHelper';
import { LineChart, Line, XAxis as ReXAxis, YAxis as ReYAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';



export const SquadMatchmaker = () => {
  const navigate = useNavigate();
  const { uid, profile } = useAuthStore();
  const { setSquadData } = useSquadStore();

  // Local state
  const [mySquadCode, setMySquadCode] = useState('');
  const [joinedSquads, setJoinedSquads] = useState([]);
  const [activeSquad, setActiveSquad] = useState(null);
  const [activeSquadCode, setActiveSquadCode] = useState(null);
  const [activeSquadMembers, setActiveSquadMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Collaboration and Synergy states
  const mountTimeRef = useRef(Date.now());
  const [presenceList, setPresenceList] = useState([]);
  const [yesterdayWorkoutTime, setYesterdayWorkoutTime] = useState(null); // { hours: number, minutes: number }
  const [pollsList, setPollsList] = useState([]);
  const [notificationsMuted, setNotificationsMuted] = useState(
    localStorage.getItem('zenkai_mute_squad_notifications') === 'true'
  );
  const [generatingChallenge, setGeneratingChallenge] = useState(false);
  const [checkInTime, setCheckInTime] = useState('18:00');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptionsInput, setPollOptionsInput] = useState('07:00, 17:30, 19:00');
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [activityList, setActivityList] = useState([]);
  const [floatingEmojis, setFloatingEmojis] = useState({}); // { [activityId]: [{ id, emoji, x, y }] }

  const level = useMemo(() => {
    if (!profile?.xp) return 1;
    return deriveLevelFromXP(profile.xp).level;
  }, [profile?.xp]);

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

  const [customDialog, setCustomDialog] = useState(null); // { type: 'alert' | 'confirm', title: string, message: string, onConfirm?: () => void }

  const showAppAlert = (message, title = "System Notification") => {
    setCustomDialog({ type: 'alert', title, message });
  };

  const showAppConfirm = (message, onConfirm, title = "Action Required") => {
    setCustomDialog({ type: 'confirm', title, message, onConfirm });
  };

  // Consent-based draft states
  const [realFreeAgents, setRealFreeAgents] = useState([]);
  const [sentInvites, setSentInvites] = useState([]);
  const [incomingInvites, setIncomingInvites] = useState([]);

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

        // Fetch PRs (only 2 specific docs, not a collection scan)
        const benchRef = doc(db, 'users', uid, 'prs', 'barbell_bench_press');
        const squatRef = doc(db, 'users', uid, 'prs', 'barbell_squat');
        const [benchSnap, squatSnap] = await Promise.all([getDoc(benchRef), getDoc(squatRef)]);
        
        const benchPR = benchSnap.exists() ? (parseFloat(benchSnap.data().weight) || 0) : 0;
        const squatPR = squatSnap.exists() ? (parseFloat(squatSnap.data().weight) || 0) : 0;
        
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
          consistency,
          goal: profile.goal || 'Fitness',
          avatarUrl: profile.avatarUrl || '',
          aura: profile.aura || '',
          activeTitle: profile.activeTitle || '',
          workoutFrequency: profile.workoutFrequency || 'Not set',
          dietType: profile.dietType || 'Not set',
          totalSessions: profile.totalSessions || 0
        }, { merge: true });
        
      } catch (err) {
        console.error('[SquadMatchmaker] Error syncing squad code:', err);
      }
    };
    
    syncMySquadCode();
  }, [uid, profile?.squadCode, profile?.lookingForSquad, profile?.avatarUrl, profile?.aura, profile?.activeTitle, profile?.xp, profile?.level, profile?.streak]); // Only re-run when these specific fields change


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

  // 3. Resolve active squad and sync roster stats in real-time
  useEffect(() => {
    if (joinedSquads.length === 0) {
      if (!showOnboarding) {
        setActiveSquad(null);
        setActiveSquadCode(null);
        setActiveSquadMembers([]);
      }
      return;
    }


    let targetCode = activeSquadCode;
    if (!targetCode && !showOnboarding) {
      targetCode = joinedSquads[0].squadCode;
      setActiveSquadCode(targetCode);
    }

    if (!targetCode) {
      setActiveSquad(null);
      setActiveSquadMembers([]);
      return;
    }

    const active = joinedSquads.find(s => s.squadCode === targetCode);
    if (active) {
      setActiveSquad(active);
    } else {
      // Check if targetCode exists and we are a member (handles Firestore sync lag)
      const checkSquadValidity = async () => {
        try {
          const docSnap = await getDoc(doc(db, 'shared_squads', targetCode));
          if (docSnap.exists() && docSnap.data().memberUids?.includes(uid)) {
            setActiveSquad(docSnap.data());
          } else {
            // Either squad doesn't exist, or we were kicked/not a member anymore
            if (joinedSquads.length > 0) {
              const fallbackCode = joinedSquads[0].squadCode;
              setActiveSquadCode(fallbackCode);
              setActiveSquad(joinedSquads[0]);
            } else {
              setActiveSquadCode(null);
              setActiveSquad(null);
            }
          }
        } catch (err) {
          console.error('[SquadMatchmaker] Error validating active squad:', err);
          if (joinedSquads.length > 0) {
            const fallbackCode = joinedSquads[0].squadCode;
            setActiveSquadCode(fallbackCode);
            setActiveSquad(joinedSquads[0]);
          } else {
            setActiveSquadCode(null);
            setActiveSquad(null);
          }
        }
      };

      checkSquadValidity();
      setActiveSquadMembers([]);
      return;
    }

    // Set up real-time listener for each member's squad_codes
    const membersList = [...active.members];
    setActiveSquadMembers(membersList);

    const unsubscribes = [];

    membersList.forEach((m) => {
      if (!m.squadCode) return;

      const codeRef = doc(db, 'squad_codes', m.squadCode);
      const unsub = onSnapshot(codeRef, (snap) => {
        if (snap.exists()) {
          const fresh = snap.data();
          let memberName = fresh.name || m.name;
          if (fresh.uid === uid || m.uid === uid) {
            if (!memberName.endsWith(' (You)')) {
              memberName = `${memberName} (You)`;
            }
          }

          setActiveSquadMembers((prev) => {
            const next = [...prev];
            const idx = next.findIndex(item => item.squadCode === m.squadCode);
            if (idx !== -1) {
              next[idx] = {
                ...next[idx],
                ...fresh,
                uid: next[idx].uid,
                name: memberName,
                checkIn: (fresh.streak || 0) > 0,
                updatedAt: fresh.updatedAt ? (fresh.updatedAt.toDate ? fresh.updatedAt.toDate() : new Date(fresh.updatedAt)) : new Date(),
              };
            }
            return next;
          });
        }
      }, (err) => {
        console.warn('[SquadMatchmaker] Member sync failed:', m.name, err);
      });

      unsubscribes.push(unsub);
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [joinedSquads, activeSquadCode, uid]);

  // 3b. Real-time query for presence check-ins and polls of the active squad
  useEffect(() => {
    if (!activeSquadCode) {
      setPresenceList([]);
      setPollsList([]);
      return;
    }

    // Request browser notification permission when squads workspace opens
    requestNotificationPermission();

    const presenceRef = collection(db, 'shared_squads', activeSquadCode, 'presence');
    const unsubPresence = onSnapshot(presenceRef, (snap) => {
      const list = [];
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const createdTime = data.createdAt?.toDate 
          ? data.createdAt.toDate().getTime() 
          : (data.createdAt || Date.now());

        if (createdTime >= todayStart.getTime()) {
          list.push({ id: docSnap.id, ...data });

          // Fire browser notification if new, not from current user
          if (createdTime > mountTimeRef.current && data.uid !== uid) {
            sendBrowserNotification(
              `Gym Status Update! 📣`,
              data.time === 'Not Going'
                ? `${data.name} is resting / not going to the gym today.`
                : `${data.name} checked in to hit the gym today at ${data.time}!`
            );
          }
        }
      });
      setPresenceList(list);
    }, (err) => {
      console.error('[SquadMatchmaker] Error syncing presence:', err);
    });

    const pollsRef = collection(db, 'shared_squads', activeSquadCode, 'polls');
    const unsubPolls = onSnapshot(pollsRef, (snap) => {
      const list = [];
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const createdTime = data.createdAt?.toDate 
          ? data.createdAt.toDate().getTime() 
          : (data.createdAt || Date.now());

        if (createdTime >= todayStart.getTime()) {
          list.push({ id: docSnap.id, ...data });

          // Fire browser notification if new, not from current user
          if (createdTime > mountTimeRef.current && data.creatorUid !== uid) {
            sendBrowserNotification(
              `New Gym Poll! 🗳️`,
              `${data.creatorName} started a new poll: "${data.question}"`
            );
          }
        }
      });
      setPollsList(list);
    }, (err) => {
      console.error('[SquadMatchmaker] Error syncing polls:', err);
    });

    return () => {
      unsubPresence();
      unsubPolls();
    };
  }, [activeSquadCode, uid]);

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

  // Live Activity Feed subscription
  useEffect(() => {
    if (!activeSquadCode) {
      setActivityList([]);
      return;
    }
    
    const activityRef = collection(db, 'shared_squads', activeSquadCode, 'activity_feed');
    const q = query(activityRef, orderBy('createdAt', 'desc'), limit(20));
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setActivityList(list);
    }, (err) => {
      console.error('[SquadMatchmaker] Error syncing activity feed:', err);
    });
    
    return () => unsubscribe();
  }, [activeSquadCode]);

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
          agents.push({
            uid: data.uid,
            name: data.name,
            squadCode: data.squadCode,
            consistency: data.consistency || 0,
            squatPR: data.squatPR || 0,
            benchPR: data.benchPR || 0,
            goal: data.goal || 'Fitness',
            streak: data.streak || 0,
            attributes: [
              { subject: 'Strength', A: Math.min(100, Math.round(((data.benchPR || 0) + (data.squatPR || 0)) / 3)), B: 100, fullMark: 100 },
              { subject: 'Volume', A: Math.min(100, Math.round((data.volume || 0) / 100)), B: 100, fullMark: 100 },
              { subject: 'Consistency', A: data.consistency || 0, B: 100, fullMark: 100 },
              { subject: 'Level', A: Math.min(100, (data.level || 1) * 5), B: 100, fullMark: 100 },
              { subject: 'Streak', A: Math.min(100, (data.streak || 0) * 5), B: 100, fullMark: 100 }
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

  // 4. Sync active squad data with global useSquadStore
  useEffect(() => {
    if (!activeSquad) return;
    const activeCount = activeSquadMembers.filter(m => m.checkIn).length;
    const mult = Math.min(1.5, 1.0 + activeCount * 0.06);
    setSquadData({
      id: activeSquad.squadCode,
      squadName: activeSquad.squadName,
      members: activeSquadMembers,
      weeklyXPMultiplier: parseFloat(mult.toFixed(2))
    });
  }, [activeSquad, activeSquadMembers, setSquadData]);

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
        const xpLogRef = collection(db, 'users', uid, 'xpLog');
        const q = query(xpLogRef, where('reason', '==', 'Sunday Newspaper Secret Synergy Code'), limit(1));
        const logsSnap = await getDocs(q);
        
        if (!logsSnap.empty) {
          showAppAlert('🎟️ You have already redeemed this secret classified promo code!', 'Redemption Error');
          setJoinCodeInput('');
          setLoading(false);
          return;
        }

        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        const currentXP = userSnap.data()?.xp || 0;
        
        // Award 25 XP
        await setDoc(userRef, { xp: currentXP + 25 }, { merge: true });

        // Log to XP audit log
        const newLogRef = doc(xpLogRef);
        await setDoc(newLogRef, {
          amount: 25,
          reason: 'Sunday Newspaper Secret Synergy Code',
          timestamp: new Date()
        });

        showAppAlert('🎉 Easter Egg Activated! You found the Sunday Classifieds Secret code. +25 XP awarded for scouting the newspaper!', 'Secret Redeemed! 🎉');
        setJoinCodeInput('');
        setLoading(false);
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
        { subject: 'Strength', A: Math.min(100, Math.round((bench + squat) / 3)), B: 100, fullMark: 100 },
        { subject: 'Volume', A: Math.min(100, Math.round(volume / 100)), B: 100, fullMark: 100 },
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
        { subject: 'Strength', A: Math.min(100, Math.round((bench + squat) / 3)), B: 100, fullMark: 100 },
        { subject: 'Volume', A: Math.min(100, Math.round(volume / 100)), B: 100, fullMark: 100 },
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
          const { runTransaction, doc, collection } = await import('firebase/firestore');
          
          await runTransaction(db, async (transaction) => {
            const myUserRef = doc(db, 'users', uid);
            const myUserSnap = await transaction.get(myUserRef);
            if (!myUserSnap.exists()) throw new Error("User document does not exist");
            
            const myData = myUserSnap.data();
            const myXP = myData.xp || 0;
            if (myXP < 50) {
              throw new Error("Insufficient XP to purchase Streak Shield");
            }

            const targetUserRef = doc(db, 'users', targetMember.uid);
            const targetUserSnap = await transaction.get(targetUserRef);
            if (!targetUserSnap.exists()) throw new Error("Teammate document does not exist");
            
            const targetData = targetUserSnap.data();
            const targetPowerUps = targetData.powerUps || {};
            const currentShields = targetPowerUps.streakShield || 0;

            transaction.update(myUserRef, { xp: myXP - 50 });
            transaction.update(targetUserRef, { 
              'powerUps.streakShield': currentShields + 1 
            });
            
            const xpLogRef = doc(collection(db, 'users', uid, 'xpLog'));
            transaction.set(xpLogRef, {
              amount: -50,
              reason: `Gifted Streak Shield to ${targetMember.name.replace(' (You)', '')}`,
              timestamp: new Date()
            });
          });

          showAppAlert(`Streak rescue successful! Gifted a Streak Shield to ${targetMember.name.replace(' (You)', '')}.`, "Rescue Successful");

          // Trigger instant push notification to the rescued teammate
          await sendPushNotification({
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
      if (!m.updatedAt) return false;
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
    <div className="border border-neutral-800 bg-[var(--surface)] p-6 rounded-2xl shadow-xl flex flex-col gap-6 text-left backdrop-blur-md">
      
      {/* Header */}
      <div className="border-b border-[var(--border)] pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          {/* Small Zenkai Logo on Mobile */}
          <div className="w-7 h-7 rounded bg-black border border-[var(--border)] flex items-center justify-center overflow-hidden shrink-0 select-none block lg:hidden">
            <img src="/logos/zenkai_official_logo.png" alt="Zenkai Logo" className="w-full h-full object-contain p-0.5" />
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
            <div className="flex flex-col gap-1.5 border-b border-[#111] pb-4">
              <label className="text-[9px] font-mono text-[var(--text-secondary)] uppercase font-bold">Switch Accountability Squad</label>
              <div className="flex gap-2">
                <select
                  value={activeSquadCode || ''}
                  onChange={(e) => {
                    setActiveSquadCode(e.target.value);
                    setShowOnboarding(false);
                  }}
                  className="bg-black border border-[#222] px-3.5 py-1.5 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-[var(--primary)] w-full cursor-pointer"
                >
                  {joinedSquads.map(s => (
                    <option key={s.squadCode} value={s.squadCode}>
                      {s.squadName} ({s.squadCode})
                    </option>
                  ))}
                </select>

                {!showOnboarding ? (
                  <button
                    onClick={() => {
                      setShowOnboarding(true);
                    }}
                    className="bg-neutral-900 border border-[#222] hover:border-[var(--primary)] text-white font-mono text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer uppercase shrink-0 transition-all"
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
                    className="flex items-center gap-1.5 bg-neutral-900 border border-[#222] hover:border-[var(--primary)] text-white font-mono text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer uppercase shrink-0 transition-all"
                  >
                    <ArrowLeft size={10} />
                    <span>Back to Squad</span>
                  </button>
                )}
              </div>
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
              
              {/* Active Squad Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-neutral-950 to-neutral-900 border border-neutral-805 p-5 rounded-2xl shadow-inner">
                <div>
                  <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase font-bold tracking-wider">Active Squad</span>
                  <h4 className="font-display font-black text-xl text-white uppercase tracking-wide mt-0.5">
                    {activeSquad.squadName}
                  </h4>
                  <span className="text-[10px] font-mono text-neutral-500">
                    Limit: {activeSquadMembers.length} / {activeSquad.memberLimit} members
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleLeaveSquad}
                    className="flex items-center gap-1.5 bg-red-950/10 border border-red-500/20 hover:border-red-500 hover:bg-red-500/10 text-red-500 font-mono text-[10px] font-bold px-3.5 py-2 rounded-xl cursor-pointer uppercase transition-all"
                  >
                    <LogOut size={12} />
                    <span>Leave Squad</span>
                  </button>
                </div>
              </div>

              {/* Neubrutalist Tab Controls */}
              <div className="flex flex-wrap border-b border-neutral-850 gap-2 mt-1 pb-3">
                {[
                  { id: 'synergy', label: '🗳️ Synergy & Scheduler' },
                  { id: 'warroom', label: '🛡️ Command War Room' },
                  { id: 'draft', label: '💸 Moneyball Draft' }
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`px-4 py-2.5 font-display font-bold text-xs uppercase border border-neutral-800 rounded-xl transition-all duration-300 cursor-pointer ${
                      activeTab === t.id
                        ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-[0_0_12px_rgba(255,92,0,0.15)] font-bold'
                        : 'bg-neutral-900/20 text-[var(--text-secondary)] hover:bg-neutral-800/40 hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab 1: Synergy & Scheduler */}
              {activeTab === 'synergy' && (
                <div className="flex flex-col gap-6 animate-fadeIn">
                  {/* 1. SYNERGY CHALLENGE PANEL */}
                  <div className="border border-neutral-800 bg-neutral-900/30 p-5 rounded-xl flex flex-col gap-4 shadow-xl">
                    <div className="flex justify-between items-center border-b border-[#222] pb-2">
                      <span className="text-xs font-mono text-white uppercase font-extrabold tracking-wider flex items-center gap-1.5">
                        <Award size={16} className="text-[var(--accent-xp)]" />
                        <span>Active Squad Synergy Challenge</span>
                      </span>
                      {activeSquad.activeChallenge && (
                        <span className={`px-2 py-0.5 text-[8px] font-mono font-bold uppercase rounded ${
                          activeSquad.activeChallenge.status === 'completed' 
                            ? 'bg-[#33FF66]/20 text-[#33FF66] border border-[#33FF66]/30 animate-pulse'
                            : 'bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/30'
                        }`}>
                          {activeSquad.activeChallenge.status}
                        </span>
                      )}
                    </div>

                    {activeSquad.activeChallenge ? (
                      <div className="flex flex-col gap-4">
                        {activeSquad.activeChallenge.isTitanRaid ? (
                          /* Titan Raid PvE Layout */
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1 text-left">
                              <span className="text-[10px] font-mono text-red-500 font-bold tracking-widest uppercase">Weekly Raid Boss</span>
                              <h5 className="font-display font-black text-2xl text-white uppercase mt-0.5">
                                {activeSquad.activeChallenge.title}
                              </h5>
                              <p className="text-xs text-neutral-300 italic font-serif leading-relaxed mt-1">
                                "{activeSquad.activeChallenge.description}"
                              </p>
                            </div>

                            {/* Weakness & Target HP */}
                            <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-black/30 border border-[#222] p-3 rounded-lg text-left">
                              <div className="flex flex-col">
                                <span className="text-[9px] text-neutral-500 uppercase">Target weakness (1.5x DMG)</span>
                                <span className="text-[var(--accent-xp)] font-black uppercase flex items-center gap-1 mt-0.5">
                                  <Flame size={12} className="text-[var(--accent-xp)] animate-pulse" />
                                  <span>{activeSquad.activeChallenge.weakness}</span>
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[9px] text-neutral-500 uppercase">Premium Loot</span>
                                <span className="text-[var(--primary)] font-bold truncate mt-0.5">
                                  {activeSquad.activeChallenge.rewardName}
                                </span>
                              </div>
                            </div>

                            {/* Health Bar (Clamped) */}
                            {(() => {
                              const currentHP = Math.max(0, activeSquad.activeChallenge.currentHP || 0);
                              const totalHP = activeSquad.activeChallenge.totalHP || 100;
                              const hpPercentage = Math.max(0, Math.min(100, (currentHP / totalHP) * 100));
                              return (
                                <div className="flex flex-col gap-1.5 mt-1">
                                  <div className="flex justify-between text-[10px] font-mono text-neutral-400">
                                    <span className="text-red-500 font-bold uppercase tracking-wider">Titan Armor integrity</span>
                                    <span>{currentHP.toLocaleString()} / {totalHP.toLocaleString()} HP ({hpPercentage.toFixed(1)}%)</span>
                                  </div>
                                  <div className="h-6 w-full bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden relative p-[3px]">
                                    <div 
                                      className="h-full bg-red-600 rounded transition-all duration-1000 ease-out"
                                      style={{ width: `${hpPercentage}%` }}
                                    />
                                    {currentHP <= 0 && (
                                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono font-black text-white uppercase tracking-widest animate-pulse">
                                        ⚡ TITAN SLAYED ⚡
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Individual Damage Contributions */}
                            <div className="flex flex-col gap-1.5 text-left">
                              <span className="text-[9px] font-mono text-neutral-500 uppercase font-bold">Squad Damage Ledger:</span>
                              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                                {activeSquadMembers.map((m, idx) => {
                                  const dmg = activeSquad.activeChallenge.progress?.[m.uid] || 0;
                                  return (
                                    <div key={idx} className="flex justify-between items-center bg-black/20 px-3 py-1.5 rounded border border-[#111]">
                                      <span className="text-neutral-400 truncate pr-1">{m.name}</span>
                                      <span className="font-bold text-red-500 shrink-0">{dmg.toLocaleString()} DMG</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Standard sets-based challenge layout */
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1 text-left">
                              <h5 className="font-display font-black text-base text-[var(--accent-xp)] uppercase">
                                {activeSquad.activeChallenge.title}
                              </h5>
                              <p className="text-xs text-neutral-300">
                                {activeSquad.activeChallenge.description}
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-black/30 border border-[#222] p-3 rounded-lg">
                              <div className="flex flex-col">
                                <span className="text-[9px] text-neutral-500 uppercase">Target Sets ({activeSquad.activeChallenge.muscleGroup})</span>
                                <span className="text-white font-bold">{activeSquad.activeChallenge.totalCompletedSets} / {activeSquad.activeChallenge.targetSets} sets</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[9px] text-neutral-500 uppercase">Premium Reward</span>
                                <span className="text-[var(--primary)] font-bold flex items-center gap-1">
                                  {activeSquad.activeChallenge.rewardType === 'bossFightKey' ? <Key size={12} /> : <Award size={12} />}
                                  <span>{activeSquad.activeChallenge.rewardName}</span>
                                </span>
                              </div>
                            </div>

                            {(() => {
                              const pct = Math.min(100, Math.round((activeSquad.activeChallenge.totalCompletedSets / activeSquad.activeChallenge.targetSets) * 100));
                              return (
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex justify-between text-[10px] font-mono text-neutral-400">
                                    <span>Synergy Progress</span>
                                    <span>{pct}%</span>
                                  </div>
                                  <div className="h-4 w-full bg-neutral-900 border-[#222] rounded-md overflow-hidden p-[2px]">
                                    <div 
                                      className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent-xp)] rounded-sm transition-all duration-500"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="flex flex-col gap-1.5 text-left">
                              <span className="text-[9px] font-mono text-neutral-500 uppercase font-bold">Individual Contributions:</span>
                              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                                {activeSquadMembers.map((m, idx) => {
                                  const count = activeSquad.activeChallenge.progress?.[m.uid] || 0;
                                  return (
                                    <div key={idx} className="flex justify-between items-center bg-black/20 px-3 py-1.5 rounded border border-[#111]">
                                      <span className="text-neutral-400 truncate pr-1">{m.name}</span>
                                      <span className="font-bold text-white shrink-0">{count} sets</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Regeneration Voting Card */}
                        {activeSquad.activeChallenge.status === 'active' && (
                          <div className="border border-[#222] bg-black/40 p-3 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div className="flex flex-col text-left">
                              <span className="text-[10px] font-mono text-white uppercase font-bold">Request Challenge Regeneration</span>
                              <span className="text-[9px] text-neutral-500 font-sans">
                                {activeSquad.hasRegeneratedThisWeek 
                                  ? "This week's regeneration has already been used." 
                                  : `Requires >50% approval. Votes: ${(activeSquad.regenerationVotes || []).length} / ${activeSquad.members?.length || 1} (Need ${Math.floor((activeSquad.members?.length || 1) / 2) + 1})`
                                }
                              </span>
                            </div>
                            {!activeSquad.hasRegeneratedThisWeek && (
                              <button
                                onClick={handleVoteRegenerate}
                                disabled={generatingChallenge}
                                className={`font-mono text-[9px] font-bold px-3 py-1.5 border border-black rounded shadow-[2px_2px_0px_black] uppercase cursor-pointer transition-all ${
                                  (activeSquad.regenerationVotes || []).includes(uid)
                                    ? 'bg-red-500 text-black hover:brightness-110'
                                    : 'bg-[var(--secondary)] text-black hover:brightness-110'
                                }`}
                              >
                                {(activeSquad.regenerationVotes || []).includes(uid) ? 'Cancel Vote' : 'Vote to Regenerate'}
                              </button>
                            )}
                          </div>
                        )}

                        {activeSquad.activeChallenge.status === 'completed' && (
                          <div className="border border-dashed border-[#33FF66]/30 bg-[#33FF66]/5 p-3 rounded-lg flex flex-col items-center justify-center gap-3">
                            <span className="text-xs font-mono text-[#33FF66] font-bold text-center">
                              🎉 Challenge Completed! The squad has successfully synchronized!
                            </span>
                            {activeSquad.activeChallenge.claimedBy?.[uid] ? (
                              <span className="text-xs font-mono text-[var(--accent-xp)] font-black uppercase border border-[var(--accent-xp)] px-3 py-1 rounded bg-[var(--accent-xp)]/10 flex items-center gap-1">
                                <CheckCircle size={12} />
                                <span>Reward Claimed</span>
                              </span>
                            ) : (
                              <button
                                onClick={handleClaimReward}
                                className="bg-[#33FF66] hover:bg-[#2ae058] text-black font-display font-black text-xs uppercase px-5 py-2.5 rounded-lg border-2 border-black shadow-[3px_3px_0px_black] active:scale-95 transition-all cursor-pointer"
                              >
                                Claim {activeSquad.activeChallenge.rewardName}!
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="border border-dashed border-[#222] bg-neutral-900/30 p-6 rounded-lg text-center flex flex-col items-center justify-center gap-4">
                        <span className="text-xs font-sans text-neutral-500 leading-relaxed max-w-sm">
                          No active Synergy Challenge. Generate an AI-crafted fitness synergy challenge tailored to your squad's goals!
                        </span>
                        <button
                          onClick={handleGenerateSquadChallenge}
                          disabled={generatingChallenge}
                          className="flex items-center gap-2 bg-[var(--primary)] hover:brightness-110 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-black font-display font-black text-xs uppercase px-5 py-2.5 rounded-lg border-2 border-black shadow-[3px_3px_0px_black] active:scale-95 transition-all cursor-pointer"
                        >
                          <Zap size={14} className={generatingChallenge ? "animate-spin" : ""} />
                          <span>{generatingChallenge ? "Consulting AI Coach..." : "Generate AI Synergy Challenge"}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Grid Layout for details */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* LEFT COLUMN: ROSTER, CHECK-INS & INVITES (5/12 cols) */}
                    <div className="lg:col-span-5 flex flex-col gap-6">
                      
                      {/* Roster Display */}
                      <div className="flex flex-col gap-2.5">
                        <div className="flex justify-between items-center text-[10px] font-mono text-[var(--text-secondary)] uppercase font-bold border-b border-neutral-900 pb-1.5">
                          <span>Squad Roster ({activeSquadMembers.length} members)</span>
                          <span>Weekly Volume: {Math.round(totalVolume)}kg</span>
                        </div>
                        
                        <div className="flex flex-col gap-2.5">
                          {activeSquadMembers.map((mbr, idx) => {
                            const isLifting = presenceList.some(p => p.id === mbr.uid && p.time !== 'Not Going');
                            const avatarStyle = getAvatarStyle(mbr.aura, mbr.level, mbr.powerUps);
                            const hoursSinceLastWorkout = mbr.updatedAt 
                              ? (Date.now() - new Date(mbr.updatedAt).getTime()) / (1000 * 60 * 60)
                              : 999;
                            const isStreakExpiring = hoursSinceLastWorkout > 24 && (mbr.streak || 0) > 0;

                            return (
                              <div key={idx} className="border border-neutral-800/85 bg-neutral-900/15 p-3.5 rounded-xl flex items-center justify-between hover:border-neutral-700/60 hover:bg-neutral-900/30 transition-all duration-300 shadow-md text-xs font-mono">
                                <div 
                                  className="flex items-center gap-3 cursor-pointer hover:bg-neutral-850 p-1.5 rounded-xl transition-all"
                                  onClick={() => handleMemberClick(mbr)}
                                  title="Click to view profile & stats"
                                >
                                  {/* Avatar with Aura & Border */}
                                  <div className="relative shrink-0">
                                    <div 
                                      className={`w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden transition-all duration-300 ${
                                        isLifting ? 'ring-2 ring-green-500 ring-offset-1 ring-offset-black animate-pulse' : ''
                                      }`}
                                      style={avatarStyle}
                                    >
                                      {mbr.avatarUrl ? (
                                        <img src={mbr.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                                      ) : (
                                        <span className="font-display font-extrabold text-[10px] text-white">
                                          {mbr.name?.slice(0, 2).toUpperCase() || 'ZK'}
                                        </span>
                                      )}
                                    </div>
                                    {/* Small presence green dot */}
                                    {isLifting && (
                                      <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-1 ring-black animate-ping" />
                                    )}
                                  </div>

                                  <div className="flex flex-col text-left">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-white font-bold">{mbr.name}</span>
                                      {isLifting && (
                                        <span className="text-[7px] bg-green-500/20 text-green-400 border border-green-500/30 px-1 rounded uppercase font-bold animate-pulse">
                                          🟢 Active Lifter
                                        </span>
                                      )}
                                    </div>
                                    {mbr.activeTitle && (() => {
                                      const isDemo = mbr.activeTitle === 'PR Demon' && isTitleActive('pr_demon', mbr.powerUps);
                                      const isTitan = mbr.activeTitle === 'Titan Hunter' && isTitleActive('titan_hunter', mbr.powerUps);
                                      if (!isDemo && !isTitan) return null;
                                      return (
                                        <span className="text-[8px] text-[var(--accent-xp)] font-bold uppercase tracking-wider mt-0.5">
                                          {mbr.activeTitle}
                                        </span>
                                      );
                                    })()}
                                    <div className="flex items-center gap-2 mt-0.5">
                                      {mbr.badges && mbr.badges.length > 0 && (
                                        <span className="text-[7px] text-[var(--accent-xp)] border border-[var(--accent-xp)]/20 px-1 rounded uppercase font-bold flex items-center gap-0.5">
                                          <Award size={8} />
                                          <span>{mbr.badges.length} Trophies</span>
                                        </span>
                                      )}
                                      {mbr.powerUps?.bossFightKey > 0 && (
                                        <span className="text-[7px] text-[var(--primary)] border border-[var(--primary)]/20 px-1 rounded uppercase font-bold flex items-center gap-0.5">
                                          <Key size={8} />
                                          <span>{mbr.powerUps.bossFightKey} Keys</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 text-[10px] text-[var(--text-secondary)]">
                                  <span>Streak: <strong className="text-white">{mbr.streak || 0}d</strong></span>
                                  <span>Volume: <strong className="text-white">{Math.round(mbr.volume || 0)}kg</strong></span>
                                  {isStreakExpiring && mbr.uid !== uid && (
                                    <button
                                      onClick={() => handleRescueStreak(mbr)}
                                      className="bg-orange-500 hover:bg-orange-600 text-black font-display font-black text-[8px] px-2 py-0.5 border border-black rounded shadow-[1px_1px_0px_black] uppercase cursor-pointer flex items-center gap-0.5 active:translate-x-[0.5px] active:translate-y-[0.5px] active:shadow-none transition-all"
                                      title="Gift teammate a Streak Shield to protect their streak (costs 50 XP)!"
                                    >
                                      <Flame size={8} className="text-black" />
                                      <span>Rescue (50 XP)</span>
                                    </button>
                                  )}
                                  {isCreator && mbr.uid !== uid && (
                                    <button
                                      onClick={() => handleKickMember(mbr.uid)}
                                      className="text-red-500 hover:text-red-400 cursor-pointer p-1"
                                      title="Kick member"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Presence Check-In Panel */}
                      <div className="border border-neutral-800 bg-neutral-900/10 p-6 rounded-2xl flex flex-col gap-4 text-left shadow-xl">
                        <div className="flex justify-between items-center border-b border-neutral-800/60 pb-3">
                          <span className="font-display font-black text-sm text-white uppercase tracking-wider flex items-center gap-2">
                            <Calendar size={18} className="text-[var(--accent-xp)]" />
                            <span>Today's Gym Check-Ins</span>
                          </span>
                        </div>

                        {presenceList.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {presenceList.map((presence) => {
                              const mInfo = activeSquadMembers.find(m => m.uid === presence.id);
                              return (
                                <div 
                                  key={presence.id} 
                                  className="border border-neutral-800/80 bg-neutral-950/40 p-3.5 rounded-xl flex items-center gap-2.5 font-mono text-xs text-left shadow-md cursor-pointer hover:border-neutral-700/60 hover:bg-neutral-900/20 transition-all"
                                  onClick={() => mInfo && handleMemberClick(mInfo)}
                                  title="Click to view profile & stats"
                                >
                                  <span className="text-sm">{presence.time === 'Not Going' ? '😴' : '🏋️‍♂️'}</span>
                                  <div className="flex flex-col">
                                    <span className="text-white font-bold">{presence.name}</span>
                                    <span className="text-[9px] text-[var(--accent-xp)] uppercase font-bold">
                                      {presence.time === 'Not Going' ? 'Not hitting the gym today ❌' : `Going to Gym today at ${presence.time}`}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="py-8 px-4 border border-dashed border-neutral-850 rounded-xl text-center flex flex-col items-center justify-center gap-3 bg-neutral-950/20">
                            <Calendar className="text-neutral-600 animate-pulse" size={32} />
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-mono text-white font-bold uppercase">No Check-Ins</span>
                              <span className="text-[10px] text-neutral-500 max-w-xs font-sans">
                                Let your squad know when you're hitting the gym today by checking in below.
                              </span>
                            </div>
                          </div>
                        )}

                        <form onSubmit={handleCheckIn} className="border-t border-neutral-800/60 pt-4 flex flex-col gap-3">
                          <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase font-bold tracking-wider">Check In Gym Time Today</span>
                          <div className="flex gap-2">
                            <select
                              value={checkInTime}
                              onChange={(e) => setCheckInTime(e.target.value)}
                              className="bg-black border border-neutral-800 focus:border-[var(--accent-xp)] px-4 py-2.5 rounded-xl text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-[var(--accent-xp)] w-full cursor-pointer transition-all"
                            >
                              {['05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', 'Not Going'].map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="bg-[var(--accent-xp)] text-black font-display font-black text-xs px-5 py-2.5 rounded-xl uppercase cursor-pointer shrink-0 hover:brightness-110 active:scale-95 transition-all shadow-[0_0_12px_rgba(181,255,45,0.15)]"
                            >
                              {checkInTime === 'Not Going' ? 'Confirm' : "I'm Going"}
                            </button>
                          </div>
                        </form>
                      </div>

                      {/* Share Code Widget */}
                      <div className="flex items-center justify-between border border-neutral-800 bg-neutral-900/10 p-4 rounded-xl shadow-md">
                        <div className="flex flex-col gap-0.5 text-left">
                          <span className="text-[10px] font-mono text-white uppercase font-bold">Invite Gym Bros</span>
                          <span className="text-[9px] text-neutral-500">Share this code to let friends join:</span>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(activeSquad.squadCode);
                            showAppAlert('Squad Code copied to clipboard!', 'Success');
                          }}
                          className="bg-[var(--primary)] text-black font-display font-black text-[10px] px-3.5 py-2.5 rounded-xl uppercase cursor-pointer flex items-center gap-1.5 hover:brightness-110 active:scale-95 transition-all shadow-[0_0_12px_rgba(255,92,0,0.15)]"
                        >
                          <Copy size={12} />
                          <span>Code: {activeSquad.squadCode}</span>
                        </button>
                      </div>

                    </div>

                    {/* RIGHT COLUMN: ACTIVITY FEED & POLLS (7/12 cols) */}
                    <div className="lg:col-span-7 flex flex-col gap-6">
                      
                      {/* Live Squad Activity Feed */}
                      <div className="border border-neutral-800 bg-neutral-900/10 p-6 rounded-2xl flex flex-col gap-4 text-left shadow-xl">
                        <div className="flex justify-between items-center border-b border-neutral-800/60 pb-3">
                          <span className="font-display font-black text-sm text-white uppercase tracking-wider flex items-center gap-2">
                            <TrendingUp size={18} className="text-[var(--primary)]" />
                            <span>Squad Activity Feed</span>
                          </span>
                        </div>

                        <div className="flex flex-col gap-4 max-h-[500px] overflow-y-auto pr-1">
                          {activityList.length > 0 ? (
                            activityList.map((activity) => {
                              const memberInfo = activeSquadMembers.find(m => m.uid === activity.uid);
                              const avatarUrl = memberInfo?.avatarUrl;
                              const aura = memberInfo?.aura;
                              const levelVal = memberInfo?.level;
                              const avatarStyle = getAvatarStyle(aura, levelVal, memberInfo?.powerUps);

                              const hasHighFived = activity.highFives?.includes(uid);
                              const hasKudosed = activity.kudos?.includes(uid);

                              let cardClass = "border border-neutral-800/80 bg-neutral-900/20 p-4 rounded-xl flex flex-col gap-3 relative overflow-hidden shadow-sm";
                              let themeTitleColor = "text-white";
                              let themeBadge = null;

                              if (activity.cardTheme === 'pr_smash') {
                                cardClass = "border-2 border-slate-300 bg-gradient-to-b from-[#1b1f24] to-[#0f1115] p-4 rounded-xl flex flex-col gap-3 relative overflow-hidden shadow-[0_0_12px_rgba(203,213,225,0.18)]";
                                themeTitleColor = "text-slate-200";
                                themeBadge = (
                                  <span className="text-[8px] bg-slate-200/20 text-slate-200 border border-slate-200/30 px-1.5 py-0.5 rounded uppercase font-bold flex items-center gap-0.5 shadow-[0_0_8px_rgba(203,213,225,0.4)]">
                                    🏆 PR SMASH
                                  </span>
                                );
                              } else if (activity.cardTheme === 'titan_slayer') {
                                cardClass = "border-2 border-red-600 bg-gradient-to-b from-[#1a0b0b] to-[#080202] p-4 rounded-xl flex flex-col gap-3 relative overflow-hidden shadow-[0_0_12px_rgba(239,68,68,0.2)]";
                                themeTitleColor = "text-red-400";
                                themeBadge = (
                                  <span className="text-[8px] bg-red-600/20 text-red-400 border border-red-600/30 px-1.5 py-0.5 rounded uppercase font-bold flex items-center gap-0.5 shadow-[0_0_8px_rgba(239,68,68,0.4)] animate-pulse">
                                    👹 TITAN SLAYER
                                  </span>
                                );
                              }

                              return (
                                <div key={activity.id} className={cardClass}>
                                  {/* Top Row: User Avatar & Name */}
                                  <div className="flex items-center justify-between">
                                    <div 
                                      className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-all"
                                      onClick={() => memberInfo && handleMemberClick(memberInfo)}
                                      title="Click to view profile & stats"
                                    >
                                      <div 
                                        className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden shrink-0 transition-all duration-300"
                                        style={avatarStyle}
                                      >
                                        {avatarUrl ? (
                                          <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                                        ) : (
                                          <span className="font-display font-extrabold text-[9px] text-white">
                                            {activity.name?.slice(0, 2).toUpperCase() || 'ZK'}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex flex-col text-left">
                                        <span className="text-white font-bold text-xs">{activity.name}</span>
                                        <span className="text-[8px] text-neutral-500 font-mono">
                                          {activity.createdAt ? new Date(activity.createdAt.toDate ? activity.createdAt.toDate() : activity.createdAt).toLocaleDateString() : 'Just now'}
                                        </span>
                                      </div>
                                    </div>
                                    {themeBadge}
                                  </div>

                                  {/* Middle Row: Workout Details */}
                                  <div className="flex flex-col gap-1.5 text-left border-t border-b border-[#222]/40 py-2.5 my-0.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-white font-black text-xs uppercase tracking-wide">
                                        {activity.workoutName}
                                      </span>
                                      {activity.isQuickLog && (
                                        <span className="text-[7px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1 py-0.5 rounded uppercase font-bold">
                                          ⚡ Retroactive Log
                                        </span>
                                      )}
                                    </div>
                                    
                                    <div className="flex flex-wrap gap-2 text-[10px] text-neutral-400 font-mono mt-1">
                                      <span className="bg-black/45 px-2 py-0.5 rounded border border-[#222]/40">
                                        Sets: <strong className="text-white">{activity.totalSets}</strong>
                                      </span>
                                      <span className="bg-black/45 px-2 py-0.5 rounded border border-[#222]/40">
                                        Exercises: <strong className="text-white">{activity.exercisesCount}</strong>
                                      </span>
                                      <span className="bg-black/45 px-2 py-0.5 rounded border border-[#222]/40">
                                        Volume: <strong className="text-white">{Math.round(activity.totalVolume).toLocaleString()}kg</strong>
                                      </span>
                                    </div>

                                    {activity.prNames && activity.prNames.length > 0 && (
                                      <div className="mt-1 flex flex-col gap-1 text-[9px] font-mono">
                                        <span className="text-amber-500 font-bold uppercase tracking-wider flex items-center gap-0.5">
                                          🔥 PRs Broken:
                                        </span>
                                        <div className="flex flex-wrap gap-1 mt-0.5">
                                          {activity.prNames.map((pr, prIdx) => (
                                            <span key={prIdx} className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded uppercase font-extrabold text-[8px]">
                                              {pr}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Bottom Row: Kudos & High Five Reactions */}
                                  <div className="flex gap-2 relative mt-1">
                                    <button
                                      onClick={() => handleSocialAction(activity.id, 'highFive')}
                                      className={`flex items-center gap-1.5 font-display font-black text-[9px] px-3 py-1.5 border border-neutral-800 rounded-lg uppercase cursor-pointer transition-all ${
                                        hasHighFived 
                                          ? 'bg-yellow-500 text-black' 
                                          : 'bg-neutral-950 text-white hover:bg-neutral-900'
                                      }`}
                                    >
                                      <span>👏</span>
                                      <span>{activity.highFives?.length || 0} High-Fives</span>
                                    </button>

                                    <button
                                      onClick={() => handleSocialAction(activity.id, 'kudos')}
                                      className={`flex items-center gap-1.5 font-display font-black text-[9px] px-3 py-1.5 border border-neutral-800 rounded-lg uppercase cursor-pointer transition-all ${
                                        hasKudosed 
                                          ? 'bg-red-600 text-white' 
                                          : 'bg-neutral-950 text-white hover:bg-neutral-900'
                                      }`}
                                    >
                                      <span>🔥</span>
                                      <span>{activity.kudos?.length || 0} Kudos</span>
                                    </button>

                                    {/* Floating Emojis Animation container */}
                                    <AnimatePresence>
                                      {(floatingEmojis[activity.id] || []).map((e) => (
                                        <motion.span
                                          key={e.id}
                                          initial={{ opacity: 1, scale: 0.5, y: 0, x: 0 }}
                                          animate={{ opacity: 0, scale: 1.5, y: -70, x: e.x }}
                                          exit={{ opacity: 0 }}
                                          transition={{ duration: 1, ease: 'easeOut' }}
                                          className="absolute text-base pointer-events-none"
                                          style={{ left: '50%', transform: 'translateX(-50%)', bottom: '24px', zIndex: 50 }}
                                        >
                                          {e.emoji}
                                        </motion.span>
                                      ))}
                                    </AnimatePresence>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="py-8 px-4 border border-dashed border-neutral-850 rounded-xl text-center flex flex-col items-center justify-center gap-3 bg-neutral-950/20">
                              <MessageSquare className="text-neutral-600 animate-pulse" size={32} />
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-mono text-white font-bold uppercase">No Activity</span>
                                <span className="text-[10px] text-neutral-500 max-w-xs font-sans">
                                  No workouts logged by your squad members yet. Push harder and log your sets!
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Scheduler Polls Panel */}
                      <div className="border border-neutral-800 bg-neutral-900/10 p-6 rounded-2xl flex flex-col gap-4 text-left shadow-xl">
                        <div className="flex justify-between items-center border-b border-neutral-800/60 pb-3">
                          <span className="font-display font-black text-sm text-white uppercase tracking-wider flex items-center gap-2">
                            <Vote size={18} className="text-[var(--primary)]" />
                            <span>Squad Scheduler Polls</span>
                          </span>
                        </div>

                        {pollsList.length > 0 ? (
                          <div className="flex flex-col gap-4">
                            {pollsList.map((poll) => {
                              const totalVotes = Object.keys(poll.votes || {}).length;
                              return (
                                <div key={poll.id} className="border border-neutral-800 bg-neutral-950/40 p-4 rounded-xl shadow-md flex flex-col gap-3 font-mono text-xs text-left">
                                  <div className="flex justify-between items-start gap-2 border-b border-neutral-800/40 pb-2">
                                    <div className="flex flex-col">
                                      <span className="text-xs text-[var(--primary)] font-bold">{poll.question}</span>
                                      <span className="text-[8px] text-neutral-500 uppercase mt-0.5 font-bold">Started by {poll.creatorName} • {totalVotes} votes</span>
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-2">
                                    {poll.options.map((opt, optIdx) => {
                                      const votesForOption = Object.values(poll.votes || {}).filter(v => v === optIdx).length;
                                      const pct = totalVotes > 0 ? Math.round((votesForOption / totalVotes) * 100) : 0;
                                      const hasVoted = poll.votes?.[uid] === optIdx;

                                      return (
                                        <button
                                          key={optIdx}
                                          onClick={() => handleVote(poll.id, optIdx)}
                                          className={`relative w-full border border-neutral-800 hover:border-[var(--primary)] text-left px-4 py-3 rounded-xl font-mono text-xs text-white uppercase cursor-pointer transition-all overflow-hidden flex justify-between items-center ${
                                            hasVoted ? 'bg-black border-[var(--primary)] shadow-[0_0_10px_rgba(255,92,0,0.1)]' : 'bg-neutral-950/40 hover:bg-neutral-900/30'
                                          }`}
                                        >
                                          <div 
                                            className={`absolute top-0 left-0 bottom-0 ${hasVoted ? 'bg-[var(--primary)]/15' : 'bg-neutral-800/35'} transition-all`}
                                            style={{ width: `${pct}%`, zIndex: 0 }}
                                          />
                                          <span className="z-10 font-bold flex items-center gap-1.5">
                                            {hasVoted && <span className="text-[var(--primary)] text-sm">●</span>}
                                            <span>{opt}</span>
                                          </span>
                                          <span className="z-10 text-[10px] text-neutral-400 font-black shrink-0">{votesForOption} votes ({pct}%)</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="py-8 px-4 border border-dashed border-neutral-850 rounded-xl text-center flex flex-col items-center justify-center gap-3 bg-neutral-950/20">
                            <Vote className="text-neutral-600 animate-pulse" size={32} />
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-mono text-white font-bold uppercase">No Polls Active</span>
                              <span className="text-[10px] text-neutral-500 max-w-xs font-sans">
                                Coordinate your next workout day or gym timing. Start a scheduler poll below!
                              </span>
                            </div>
                          </div>
                        )}

                        <form onSubmit={handleCreatePoll} className="border-t border-neutral-800/60 pt-4 flex flex-col gap-3">
                          <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase font-bold tracking-wider">Start Gym Schedule Poll</span>
                          
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[8px] font-mono text-neutral-500 uppercase font-bold tracking-wider">Question / Goal</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. When are we hitting chest tomorrow?"
                              value={pollQuestion}
                              onChange={(e) => setPollQuestion(e.target.value)}
                              className="bg-black border border-neutral-800 focus:border-[var(--primary)] px-4 py-2.5 rounded-xl text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)] w-full transition-all"
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-[8px] font-mono text-neutral-500 uppercase font-bold tracking-wider">Options (comma-separated times/days)</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. 06:00, 16:30, 18:00"
                              value={pollOptionsInput}
                              onChange={(e) => setPollOptionsInput(e.target.value)}
                              className="bg-black border border-neutral-800 focus:border-[var(--primary)] px-4 py-2.5 rounded-xl text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)] w-full transition-all"
                            />
                          </div>

                          <button
                            type="submit"
                            disabled={creatingPoll}
                            className="bg-[var(--primary)] hover:brightness-110 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-black font-display font-black text-xs uppercase px-5 py-2.5 rounded-xl shadow-[0_0_12px_rgba(255,92,0,0.15)] active:scale-95 transition-all cursor-pointer self-end mt-2 flex items-center gap-1.5"
                          >
                            <Plus size={14} />
                            <span>Launch Poll</span>
                          </button>
                        </form>
                      </div>

                    </div>
                  </div>

                </div>
              )}

              {/* Tab 2: Command War Room */}
              {activeTab === 'warroom' && (
                <div className="flex flex-col gap-6 animate-fadeIn">
                  
                  {/* Alarm Warning on Decay */}
                  {inactiveMembers.length > 0 && (
                    <div className="border-4 border-black bg-red-950/20 p-5 rounded-2xl shadow-[4px_4px_0px_rgba(239,68,68,1)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-left border-red-500">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="text-red-500 shrink-0 mt-0.5 animate-bounce" size={24} />
                        <div className="flex flex-col gap-0.5">
                          <h4 className="font-display font-black text-lg text-red-500 uppercase tracking-wide">
                            🚨 COMMAND DECAY WARNING
                          </h4>
                          <p className="text-xs text-neutral-200 font-sans leading-relaxed">
                            {inactiveMembers.map(m => m.name.replace(' (You)', '')).join(', ')} {inactiveMembers.length === 1 ? 'has' : 'have'} missed check-ins. XP Multiplier will decay to 0.8x in 4 hours unless they log!
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const names = inactiveMembers.map(m => m.name.replace(' (You)', '')).join(' and ');
                          const msg = `Yo ${names}! You've been MIA from our Zenkai gym squad. Our XP multiplier is about to decay! Go log your workout right now. - Zenkai Squad ⚡`;
                          navigator.clipboard.writeText(msg);
                          setSuccessMsg('Nudge copied! Send it via WhatsApp/Slack.');
                          setTimeout(() => setSuccessMsg(''), 4000);
                        }}
                        className="bg-red-500 hover:bg-red-600 text-black font-display font-black text-xs uppercase px-5 py-2.5 border-2 border-black shadow-[3px_3px_0px_black] active:scale-95 transition-all cursor-pointer shrink-0"
                      >
                        Nudge Bros
                      </button>
                    </div>
                  )}

                  {/* Cumulative XP Trajectory Chart */}
                  <div className="border-2 border-black bg-black/45 p-6 rounded-2xl shadow-[4px_4px_0px_black] flex flex-col gap-4 text-left">
                    <div className="border-b border-[#222] pb-3 flex justify-between items-center">
                      <span className="font-display font-black text-sm text-white uppercase tracking-wider flex items-center gap-2">
                        <TrendingUp className="text-[var(--secondary)]" size={18} />
                        <span>Squad Weekly Trajectory</span>
                      </span>
                      <span className="text-[10px] font-mono text-neutral-500 uppercase">
                        Cumulative XP Generation vs Ghost Squad
                      </span>
                    </div>

                    <div className="h-[280px] w-full mt-4 font-mono text-[9px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={squadWeeklyXPTrajectory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid stroke="#222" strokeDasharray="3 3" />
                          <ReXAxis dataKey="day" stroke="#888" tickLine={false} />
                          <ReYAxis stroke="#888" tickLine={false} />
                          <ReTooltip contentStyle={{ backgroundColor: '#151515', border: '2px solid black', borderRadius: '8px' }} />
                          <Line type="monotone" dataKey="Squad" stroke="var(--secondary)" strokeWidth={3} activeDot={{ r: 6 }} />
                          <Line type="monotone" dataKey="Ghost" stroke="#FF5C00" strokeWidth={2} strokeDasharray="5 5" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* squad summary stats bento cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-left font-mono">
                    <div className="border border-neutral-900 bg-black/40 p-4.5 rounded-xl flex flex-col gap-1">
                      <span className="text-[9px] text-neutral-500 uppercase">Multiplier status</span>
                      <span className="text-xl font-display font-black text-[var(--accent-xp)] uppercase">
                        {multiplier.toFixed(2)}x Active
                      </span>
                      <span className="text-[10px] text-neutral-400 font-sans leading-normal mt-0.5">
                        +{Math.round((multiplier - 1.0) * 100)}% bonus XP awarded to all logged sessions.
                      </span>
                    </div>
                    
                    <div className="border border-neutral-900 bg-black/40 p-4.5 rounded-xl flex flex-col gap-1">
                      <span className="text-[9px] text-neutral-500 uppercase">Inactive Warning</span>
                      <span className={`text-xl font-display font-black uppercase ${inactiveMembers.length > 0 ? 'text-red-500 animate-pulse' : 'text-green-500'}`}>
                        {inactiveMembers.length > 0 ? `${inactiveMembers.length} Decay Risks` : '0 Members Inactive'}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-sans leading-normal mt-0.5">
                        {inactiveMembers.length > 0 ? 'Teammate streak decay danger. Send clip nudges.' : 'All members checked in and active within 24h.'}
                      </span>
                    </div>

                    <div className="border border-neutral-900 bg-black/40 p-4.5 rounded-xl flex flex-col gap-1">
                      <span className="text-[9px] text-neutral-500 uppercase">Squad volume target</span>
                      <span className="text-xl font-display font-black text-[var(--primary)] uppercase">
                        {Math.round(totalVolume)} / 8000 kg
                      </span>
                      <span className="text-[10px] text-neutral-400 font-sans leading-normal mt-0.5">
                        Cumulative weekly lift volume target. Reaching 8K unlocks rare Boss key.
                      </span>
                    </div>
                  </div>

                </div>
              )}

              {/* Tab 3: Moneyball Draft Room */}
              {activeTab === 'draft' && (
                <div className="flex flex-col gap-6 animate-fadeIn">
                  
                  {/* Scouting matrix deck */}
                  <div className="border-2 border-black bg-black/45 p-6 rounded-2xl shadow-[4px_4px_0px_black] flex flex-col gap-4 text-left">
                    <div className="border-b border-[#222] pb-3 flex justify-between items-center">
                      <span className="font-display font-black text-sm text-white uppercase tracking-wider flex items-center gap-2">
                        <Sliders className="text-[var(--primary)]" size={18} />
                        <span>University Gym Scouting Matrix</span>
                      </span>
                      <span className="text-[10px] font-mono text-neutral-500 uppercase">
                        Real-Time Free Agent Registry
                      </span>
                    </div>

                    {/* Free Agent Opt-In Registry / Home Gym Warning */}
                    {!profile?.gymId ? (
                      <div className="border border-red-500/30 bg-red-950/20 p-3 rounded-lg flex items-start justify-between gap-3 text-xs font-mono text-red-500">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle className="shrink-0 text-red-500 mt-0.5" size={16} />
                          <div className="flex flex-col text-left">
                            <span className="font-bold uppercase">Gym Configuration Required</span>
                            <span className="text-[10px] text-neutral-400 font-sans mt-0.5 leading-relaxed">
                              Set your Home Gym in your Profile to register as a Free Agent and appear in the Scouting Matrix.
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => navigate('/profile')}
                          className="shrink-0 flex items-center gap-1.5 bg-red-500 hover:bg-red-400 text-black font-display font-black text-[10px] px-3 py-1.5 border border-black rounded shadow-[1.5px_1.5px_0px_black] uppercase cursor-pointer transition-all"
                        >
                          <ExternalLink size={10} />
                          Go to Profile
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-black/30 p-3.5 rounded-lg border border-neutral-900 text-xs font-mono text-white">
                        <div className="flex flex-col text-left">
                          <span className="font-bold">Register as Free Agent (Open to Squad Invites)</span>
                          <span className="text-[9px] text-neutral-500 mt-0.5">
                            Currently matching with other lifters at <strong className="text-white">{profile.gymName || 'your gym'}</strong>.
                          </span>
                        </div>
                        <button
                          onClick={handleToggleLookingForSquad}
                          className={`px-3.5 py-1.5 border border-black rounded shadow-[2px_2px_0px_black] uppercase font-bold transition-all cursor-pointer ${
                            profile.lookingForSquad
                              ? 'bg-[var(--secondary)] text-black font-black hover:brightness-110'
                              : 'bg-neutral-800 text-white hover:bg-neutral-700'
                          }`}
                        >
                          {profile.lookingForSquad ? 'ON (Looking for Squad)' : 'OFF (Not looking)'}
                        </button>
                      </div>
                    )}

                    {/* Sorting Controls */}
                    <div className="flex flex-wrap gap-2.5 items-center bg-black/30 p-3 rounded-lg border border-neutral-900 text-xs font-mono">
                      <span className="text-neutral-500 uppercase text-[9px] font-extrabold">Sort Matrix:</span>
                      {['consistency', 'squatPR', 'benchPR', 'streak'].map(field => (
                        <button
                          key={field}
                          onClick={() => {
                            if (sortField === field) {
                              setSortAsc(!sortAsc);
                            } else {
                              setSortField(field);
                              setSortAsc(false);
                            }
                          }}
                          className={`px-3 py-1.5 border border-black rounded shadow-[1.5px_1.5px_0px_black] uppercase font-bold transition-all cursor-pointer ${
                            sortField === field ? 'bg-[var(--primary)] text-black' : 'bg-black text-white hover:bg-neutral-900'
                          }`}
                        >
                          {field === 'consistency' ? 'Consistency %' :
                           field === 'squatPR' ? 'Squat PR' :
                           field === 'benchPR' ? 'Bench PR' : 'Streak'} 
                          {sortField === field && (sortAsc ? ' ⬆️' : ' ⬇️')}
                        </button>
                      ))}
                    </div>

                    {/* Scouting Table */}
                    <div className="overflow-x-auto w-full">
                      <table className="w-full text-left font-mono text-xs border-collapse">
                        <thead>
                          <tr className="border-b-2 border-black text-neutral-500 uppercase text-[9px]">
                            <th className="py-2.5 px-3">Name / Handle</th>
                            <th className="py-2.5 px-3">Consistency</th>
                            <th className="py-2.5 px-3">Squat PR</th>
                            <th className="py-2.5 px-3">Bench PR</th>
                            <th className="py-2.5 px-3">Goal Focus</th>
                            <th className="py-2.5 px-3">Streak</th>
                            <th className="py-2.5 px-3 text-right">Draft Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedFreeAgents.length === 0 ? (
                            <tr>
                              <td colSpan="7" className="py-8 text-center text-neutral-500 font-sans text-xs italic">
                                {!profile?.gymId 
                                  ? "Please set your Home Gym in your profile to scout lifters." 
                                  : "No other free agents found at your gym right now."}
                              </td>
                            </tr>
                          ) : (
                            sortedFreeAgents.map((agent) => (
                              <tr key={agent.uid} className="border-b border-[#222] hover:bg-black/30 transition-all">
                                <td className="py-3.5 px-3 text-white font-bold cursor-pointer hover:underline" onClick={() => handleMemberClick(agent)}>{agent.name}</td>
                                <td className="py-3.5 px-3 text-[var(--accent-xp)] font-bold">{agent.consistency}%</td>
                                <td className="py-3.5 px-3">{agent.squatPR} kg</td>
                                <td className="py-3.5 px-3">{agent.benchPR} kg</td>
                                <td className="py-3.5 px-3 uppercase text-[10px]">{agent.goal}</td>
                                <td className="py-3.5 px-3 font-bold">{agent.streak} Days</td>
                                <td className="py-3.5 px-3 text-right flex justify-end gap-2.5">
                                  <button
                                    onClick={() => handleMemberClick(agent)}
                                    className="px-3 py-1 bg-black hover:bg-neutral-900 border-2 border-black text-[10px] text-white font-bold uppercase rounded shadow-[1.5px_1.5px_0px_black] transition-all cursor-pointer"
                                  >
                                    Scout
                                  </button>
                                  {isAgentInSquad(agent.uid) ? (
                                    <button
                                      disabled
                                      className="px-3 py-1 bg-neutral-800 border-2 border-black text-[10px] text-neutral-500 font-bold uppercase rounded shadow-[1.5px_1.5px_0px_black] cursor-not-allowed"
                                    >
                                      Member
                                    </button>
                                  ) : isAgentInvitePending(agent.uid) ? (
                                    <button
                                      disabled
                                      className="px-3 py-1 bg-neutral-900 border-2 border-black text-[10px] text-neutral-500 font-bold uppercase rounded shadow-[1.5px_1.5px_0px_black] cursor-not-allowed"
                                    >
                                      Pending Invite
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleDraftAgent(agent)}
                                      className="px-3 py-1 bg-[var(--primary)] hover:brightness-110 border-2 border-black text-[10px] text-black font-bold uppercase rounded shadow-[1.5px_1.5px_0px_black] transition-all cursor-pointer"
                                    >
                                      Draft
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
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
                            const isStreakExpiring = hoursSinceLastWorkout > 24 && (selectedMember.streak || 0) > 0;

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
  );
};
