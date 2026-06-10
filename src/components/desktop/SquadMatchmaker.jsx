import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Zap, Plus, Trash2, Search, CheckCircle, ShieldAlert, LogOut, Copy, Award, Key, Calendar, Vote, Bell, BellOff, TrendingUp, AlertTriangle, MessageSquare, Sliders, Flame, ExternalLink } from 'lucide-react';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useSquadStore } from '../../stores/useSquadStore';
import { callZenkaiAPI } from '../../lib/apiClient';
import { requestNotificationPermission, sendBrowserNotification } from '../../utils/notificationHelper';
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
  const [pollsList, setPollsList] = useState([]);
  const [notificationsMuted, setNotificationsMuted] = useState(
    localStorage.getItem('zenkai_mute_squad_notifications') === 'true'
  );
  const [generatingChallenge, setGeneratingChallenge] = useState(false);
  const [checkInTime, setCheckInTime] = useState('18:00');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptionsInput, setPollOptionsInput] = useState('07:00, 17:30, 19:00');
  const [creatingPoll, setCreatingPoll] = useState(false);

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

  // Notifications
  const [successMsg, setSuccessMsg] = useState('');

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
          // Generate new squad code: FIT- + clean first 4 chars of name + 3 random digits
          const cleanName = (profile.name || 'Zenkai').replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase();
          const padName = cleanName.padEnd(4, 'X');
          const randomDigits = Math.floor(100 + Math.random() * 900);
          code = `FIT-${padName}${randomDigits}`;
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
          goal: profile.goal || 'Fitness'
        }, { merge: true });
        
      } catch (err) {
        console.error('[SquadMatchmaker] Error syncing squad code:', err);
      }
    };
    
    syncMySquadCode();
  }, [uid, profile?.squadCode, profile?.lookingForSquad]); // Only re-run when these specific fields change


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
      setActiveSquad(null);
      setActiveSquadMembers([]);
      setActiveSquadCode(null);
      return;
    }

    let targetCode = activeSquadCode;
    if (!targetCode || !joinedSquads.some(s => s.squadCode === targetCode)) {
      targetCode = joinedSquads[0].squadCode;
      setActiveSquadCode(targetCode);
    }

    const active = joinedSquads.find(s => s.squadCode === targetCode);
    setActiveSquad(active);

    if (!active || !active.members) {
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
                name: memberName,
                streak: fresh.streak || 0,
                volume: fresh.volume || 0,
                badges: fresh.badges || [],
                powerUps: fresh.powerUps || {},
                checkIn: (fresh.streak || 0) > 0,
                updatedAt: fresh.updatedAt ? (fresh.updatedAt.toDate ? fresh.updatedAt.toDate() : new Date(fresh.updatedAt)) : new Date()
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
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({ id: docSnap.id, ...data });

        // Fire browser notification if new, not from current user
        const createdTime = data.createdAt?.toDate 
          ? data.createdAt.toDate().getTime() 
          : (data.createdAt || Date.now());
        if (createdTime > mountTimeRef.current && data.uid !== uid) {
          sendBrowserNotification(
            `Gym Check-In! 🏋️‍♂️`,
            `${data.name} checked in to hit the gym today at ${data.time}!`
          );
        }
      });
      setPresenceList(list);
    }, (err) => {
      console.error('[SquadMatchmaker] Error syncing presence:', err);
    });

    const pollsRef = collection(db, 'shared_squads', activeSquadCode, 'polls');
    const unsubPolls = onSnapshot(pollsRef, (snap) => {
      const list = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({ id: docSnap.id, ...data });

        // Fire browser notification if new, not from current user
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
      setPollsList(list);
    }, (err) => {
      console.error('[SquadMatchmaker] Error syncing polls:', err);
    });

    return () => {
      unsubPresence();
      unsubPolls();
    };
  }, [activeSquadCode, uid]);

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
    } catch (err) {
      console.error('[SquadMatchmaker] Error creating squad:', err);
      alert('Failed to create squad.');
    } finally {
      setLoading(false);
    }
  };

  // Join Squad Action
  const handleJoinSquad = async (e) => {
    e.preventDefault();
    if (!joinCodeInput.trim() || !uid || !mySquadCode) return;
    
    setLoading(true);
    try {
      const codeStr = joinCodeInput.trim().toUpperCase();
      const docRef = doc(db, 'shared_squads', codeStr);
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        alert('Squad Code not found!');
        return;
      }

      const squadData = snap.data();

      if (squadData.memberUids.includes(uid)) {
        alert('You are already a member!');
        setActiveSquad(squadData);
        setJoinCodeInput('');
        return;
      }

      const activeMembersCount = squadData.members.length;
      if (activeMembersCount >= squadData.memberLimit) {
        alert(`Squad is full! (Limit: ${squadData.memberLimit} members)`);
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
    } catch (err) {
      console.error('[SquadMatchmaker] Error joining squad:', err);
      alert('Failed to join squad.');
    } finally {
      setLoading(false);
    }
  };

  // Leave Squad Action
  const handleLeaveSquad = async () => {
    if (!activeSquad || !uid) return;
    if (activeSquad.creatorUid === uid) {
      const confirmLeave = window.confirm(
        'You are the creator. If you leave, another member will become creator (or squad will be deleted if you are the only member). Proceed?'
      );
      if (!confirmLeave) return;
    } else {
      const confirmLeave = window.confirm(`Leave squad "${activeSquad.squadName}"?`);
      if (!confirmLeave) return;
    }

    setLoading(true);
    try {
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
      alert('Failed to leave squad.');
    } finally {
      setLoading(false);
    }
  };

  // Kick Member Action
  const handleKickMember = async (targetUid) => {
    if (!activeSquad) return;
    const confirmKick = window.confirm('Remove this member?');
    if (!confirmKick) return;

    try {
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
    }
  };



  // Check In Handler
  const handleCheckIn = async (e) => {
    e.preventDefault();
    if (!activeSquad || !uid) return;

    try {
      const presenceDocRef = doc(db, 'shared_squads', activeSquad.squadCode, 'presence', uid);
      await setDoc(presenceDocRef, {
        uid,
        name: profile?.name || 'Anonymous Bro',
        time: checkInTime,
        createdAt: serverTimestamp()
      });
      setSuccessMsg(`Checked in for gym today at ${checkInTime}!`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('[SquadMatchmaker] Check-In failed:', err);
      alert('Failed to check in.');
    }
  };

  // Poll Creation Handler
  const handleCreatePoll = async (e) => {
    e.preventDefault();
    if (!activeSquad || !uid || !pollQuestion.trim()) return;

    setCreatingPoll(true);
    try {
      const options = pollOptionsInput
        .split(',')
        .map(o => o.trim())
        .filter(o => o.length > 0);

      if (options.length < 2) {
        alert('Please provide at least 2 comma-separated options.');
        setCreatingPoll(false);
        return;
      }

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

      setPollQuestion('');
      setPollOptionsInput('07:00, 17:30, 19:00');
      setSuccessMsg('Squad poll created!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('[SquadMatchmaker] Poll creation failed:', err);
      alert('Failed to create poll.');
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
      alert(err.message || 'Failed to generate squad challenge.');
    } finally {
      setGeneratingChallenge(false);
    }
  };

  // Vote to Regenerate Weekly Challenge
  const handleVoteRegenerate = async () => {
    if (!activeSquad || !uid || !activeSquad.activeChallenge) return;
    if (activeSquad.hasRegeneratedThisWeek) {
      alert('The weekly challenge has already been regenerated once.');
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
      alert(err.message || 'Failed to update regeneration vote.');
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
      alert('You have already claimed your reward for this challenge!');
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
      alert('Failed to claim reward.');
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
    } catch (err) {
      console.error('[SquadMatchmaker] Draft failed:', err);
      alert('Draft invite failed.');
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
    } catch (err) {
      console.error('[SquadMatchmaker] Trade failed:', err);
      alert('Trade execution failed.');
    }
  };

  const handleAcceptInvite = async (invite) => {
    try {
      const squadRef = doc(db, 'shared_squads', invite.squadCode);
      const squadSnap = await getDoc(squadRef);
      if (!squadSnap.exists()) {
        alert('Squad no longer exists.');
        return;
      }
      const squadData = squadSnap.data();
      if (squadData.members.length >= squadData.memberLimit) {
        alert('Squad is full!');
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
      alert('Failed to accept invite.');
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
      alert('Failed to decline invite.');
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
      alert('Failed to update status.');
    }
  };

  const isAgentInSquad = (agentUid) => {
    return activeSquad?.memberUids?.includes(agentUid);
  };

  const isAgentInvitePending = (agentUid) => {
    return sentInvites.includes(agentUid);
  };

  return (
    <div className="border-2 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[5px_5px_0px_rgba(0,0,0,1)] flex flex-col gap-6 text-left">
      
      {/* Header */}
      <div className="border-b border-[var(--border)] pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="font-display font-black text-xl text-white uppercase tracking-tight flex items-center gap-2">
          <Users className="text-[var(--primary)]" size={22} />
          <span>Fantasy League Matchmaker</span>
        </h3>
        
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
                  }}
                  className="bg-black border border-[#222] px-3.5 py-1.5 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-[var(--primary)] w-full cursor-pointer"
                >
                  {joinedSquads.map(s => (
                    <option key={s.squadCode} value={s.squadCode}>
                      {s.squadName} ({s.squadCode})
                    </option>
                  ))}
                </select>

                {activeSquad && (
                  <button
                    onClick={() => {
                      setActiveSquadCode(null);
                      setActiveSquad(null);
                    }}
                    className="bg-neutral-900 border border-[#222] hover:border-[var(--primary)] text-white font-mono text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer uppercase shrink-0 transition-all"
                  >
                    Create/Join New
                  </button>
                )}
              </div>
            </div>
          )}

          {activeSquad === null ? (
            /* ONBOARDING STATE: CREATE OR JOIN A SQUAD */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Create Squad Panel */}
              <form onSubmit={handleCreateSquad} className="border border-[#222] bg-black/40 p-5 rounded-xl flex flex-col gap-4">
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

                <button
                  type="submit"
                  className="bg-[var(--primary)] text-white font-mono text-xs font-bold py-2 border border-black rounded-lg shadow-[2px_2px_0px_black] uppercase cursor-pointer active:scale-95 transition-all mt-2"
                >
                  Create Squad
                </button>
              </form>

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
                  className="bg-[var(--secondary)] text-black font-mono text-xs font-black py-2 border border-black rounded-lg shadow-[2px_2px_0px_black] uppercase cursor-pointer active:scale-95 transition-all"
                >
                  Join Squad
                </button>
              </form>

            </div>
          ) : (
            /* ACTIVE SQUAD VIEW */
            <div className="flex flex-col gap-6">
              
              {/* Active Squad Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-black/30 border border-[#222] p-4 rounded-xl">
                <div>
                  <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase font-bold">Active Squad</span>
                  <h4 className="font-display font-black text-xl text-white uppercase tracking-wide">
                    {activeSquad.squadName}
                  </h4>
                  <span className="text-[10px] font-mono text-neutral-500">
                    Limit: {activeSquadMembers.length} / {activeSquad.memberLimit} members
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleLeaveSquad}
                    className="flex items-center gap-1 bg-red-950/20 border border-red-500/30 hover:border-red-500 text-red-500 font-mono text-[9px] font-bold px-3 py-1.5 rounded-lg cursor-pointer uppercase transition-all"
                  >
                    <LogOut size={12} />
                    <span>Leave Squad</span>
                  </button>
                </div>
              </div>

              {/* Neubrutalist Tab Controls */}
              <div className="flex border-b-2 border-black gap-2 mt-1">
                {[
                  { id: 'synergy', label: '🗳️ Synergy & Scheduler' },
                  { id: 'warroom', label: '🛡️ Command War Room' },
                  { id: 'draft', label: '💸 Moneyball Draft' }
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`px-4 py-2 font-display font-black text-xs uppercase border-t-2 border-x-2 border-black rounded-t-xl transition-all cursor-pointer ${
                      activeTab === t.id
                        ? 'bg-black text-[var(--primary)] font-bold border-b-2 border-black pb-[10px] translate-y-[2px]'
                        : 'bg-neutral-900/40 text-[var(--text-secondary)] border-b-2 border-black pb-2 hover:bg-neutral-950 hover:text-white'
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
                  <div className="border-2 border-black bg-black/50 p-5 rounded-xl flex flex-col gap-4 shadow-[4px_4px_0px_black]">
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
                                  <div className="h-6 w-full bg-neutral-900 border-2 border-black rounded-lg overflow-hidden relative p-[2px]">
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
                    
                    {/* LEFT SIDE: ROSTER & POLLS (7/12 cols) */}
                    <div className="lg:col-span-7 flex flex-col gap-6">
                      
                      {/* Roster Display */}
                      <div className="flex flex-col gap-2.5">
                        <div className="flex justify-between items-center text-[10px] font-mono text-[var(--text-secondary)] uppercase font-bold border-b border-neutral-900 pb-1.5">
                          <span>Squad Roster ({activeSquadMembers.length} members)</span>
                          <span>Weekly Volume: {Math.round(totalVolume)}kg</span>
                        </div>
                        
                        <div className="flex flex-col gap-2.5">
                          {activeSquadMembers.map((mbr, idx) => (
                            <div key={idx} className="border border-[var(--border)] bg-[var(--bg-elevated)] p-3 rounded-xl flex items-center justify-between shadow-[2px_2px_0px_black] text-xs font-mono">
                              <div className="flex items-center gap-3">
                                <div className={`w-2.5 h-2.5 rounded-full ${mbr.checkIn ? 'bg-[#33FF66]' : 'bg-[#FF3366]'}`} />
                                <div className="flex flex-col text-left">
                                  <span className="text-white font-bold">{mbr.name}</span>
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
                              <div className="flex items-center gap-4 text-[10px] text-[var(--text-secondary)]">
                                <span>Streak: <strong className="text-white">{mbr.streak || 0}d</strong></span>
                                <span>Volume: <strong className="text-white">{Math.round(mbr.volume || 0)}kg</strong></span>
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
                          ))}
                        </div>
                      </div>

                      {/* Scheduler Polls Panel */}
                      <div className="border-2 border-black bg-black/45 p-6 rounded-2xl shadow-[4px_4px_0px_black] flex flex-col gap-4 text-left">
                        <div className="flex justify-between items-center border-b border-[#222] pb-3">
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
                                <div key={poll.id} className="border-2 border-black bg-black/60 p-4 rounded-xl shadow-[3px_3px_0px_black] flex flex-col gap-3 font-mono text-xs text-left">
                                  <div className="flex justify-between items-start gap-2 border-b border-[#222]/40 pb-2">
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
                                          className={`relative w-full border-2 border-black hover:border-[var(--primary)] text-left px-3 py-2.5 rounded-lg font-mono text-xs text-white uppercase cursor-pointer transition-all overflow-hidden flex justify-between items-center ${
                                            hasVoted ? 'bg-black border-[var(--primary)]' : 'bg-black/50'
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
                          <div className="py-8 px-4 border-2 border-dashed border-[#222] rounded-xl text-center flex flex-col items-center justify-center gap-3 bg-black/20">
                            <Vote className="text-neutral-600 animate-pulse" size={32} />
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-mono text-white font-bold uppercase">No Polls Active</span>
                              <span className="text-[10px] text-neutral-500 max-w-xs font-sans">
                                Coordinate your next workout day or gym timing. Start a scheduler poll below!
                              </span>
                            </div>
                          </div>
                        )}

                        <form onSubmit={handleCreatePoll} className="border-t border-[#222] pt-4 flex flex-col gap-3">
                          <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase font-bold tracking-wider">Start Gym Schedule Poll</span>
                          
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[8px] font-mono text-neutral-500 uppercase font-bold tracking-wider">Question / Goal</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. When are we hitting chest tomorrow?"
                              value={pollQuestion}
                              onChange={(e) => setPollQuestion(e.target.value)}
                              className="bg-black border-2 border-black focus:border-[var(--primary)] px-4 py-2.5 rounded-xl text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)] w-full transition-all"
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
                              className="bg-black border-2 border-black focus:border-[var(--primary)] px-4 py-2.5 rounded-xl text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)] w-full transition-all"
                            />
                          </div>

                          <button
                            type="submit"
                            disabled={creatingPoll}
                            className="bg-[var(--primary)] hover:brightness-110 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-black font-display font-black text-xs uppercase px-5 py-2.5 rounded-lg border-2 border-black shadow-[3px_3px_0px_black] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0px_black] transition-all cursor-pointer self-end mt-2 flex items-center gap-1.5"
                          >
                            <Plus size={14} />
                            <span>Launch Poll</span>
                          </button>
                        </form>
                      </div>

                    </div>

                    {/* RIGHT SIDE: CHECK-INS & UTILS (5/12 cols) */}
                    <div className="lg:col-span-5 flex flex-col gap-6">
                      
                      {/* Presence Check-In Panel */}
                      <div className="border-2 border-black bg-black/45 p-6 rounded-2xl shadow-[4px_4px_0px_black] flex flex-col gap-4 text-left">
                        <div className="flex justify-between items-center border-b border-[#222] pb-3">
                          <span className="font-display font-black text-sm text-white uppercase tracking-wider flex items-center gap-2">
                            <Calendar size={18} className="text-[var(--accent-xp)]" />
                            <span>Today's Gym Check-Ins</span>
                          </span>
                        </div>

                        {presenceList.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {presenceList.map((presence) => (
                              <div key={presence.id} className="border-2 border-black bg-black/50 p-3 rounded-xl flex items-center gap-2.5 font-mono text-xs text-left shadow-[2px_2px_0px_black]">
                                <span className="text-sm">🏋️‍♂️</span>
                                <div className="flex flex-col">
                                  <span className="text-white font-bold">{presence.name}</span>
                                  <span className="text-[9px] text-[var(--accent-xp)] uppercase font-bold">Going to Gym today at {presence.time}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-8 px-4 border-2 border-dashed border-[#222] rounded-xl text-center flex flex-col items-center justify-center gap-3 bg-black/20">
                            <Calendar className="text-neutral-600 animate-pulse" size={32} />
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-mono text-white font-bold uppercase">No Check-Ins</span>
                              <span className="text-[10px] text-neutral-500 max-w-xs font-sans">
                                Let your squad know when you're hitting the gym today by checking in below.
                              </span>
                            </div>
                          </div>
                        )}

                        <form onSubmit={handleCheckIn} className="border-t border-[#222] pt-4 flex flex-col gap-3">
                          <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase font-bold tracking-wider">Check In Gym Time Today</span>
                          <div className="flex gap-2">
                            <select
                              value={checkInTime}
                              onChange={(e) => setCheckInTime(e.target.value)}
                              className="bg-black border-2 border-black focus:border-[var(--accent-xp)] px-4 py-2.5 rounded-xl text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-[var(--accent-xp)] w-full cursor-pointer transition-all"
                            >
                              {['05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'].map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="bg-[var(--accent-xp)] text-black font-display font-black text-xs px-5 py-2.5 border-2 border-black rounded-lg shadow-[3px_3px_0px_black] uppercase cursor-pointer shrink-0 hover:brightness-110 active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0px_black] transition-all"
                            >
                              I'm Going
                            </button>
                          </div>
                        </form>
                      </div>

                      {/* Share Code Widget */}
                      <div className="flex items-center justify-between border-2 border-black bg-black/45 p-4 rounded-xl shadow-[3px_3px_0px_black]">
                        <div className="flex flex-col gap-0.5 text-left">
                          <span className="text-[10px] font-mono text-white uppercase font-bold">Invite Gym Bros</span>
                          <span className="text-[9px] text-neutral-500">Share this code to let friends join:</span>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(activeSquad.squadCode);
                            alert('Squad Code copied to clipboard!');
                          }}
                          className="bg-[var(--primary)] text-black font-display font-black text-[10px] px-3.5 py-2 border-2 border-black rounded shadow-[2px_2px_0px_black] uppercase cursor-pointer flex items-center gap-1.5 hover:brightness-110 active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0px_black] transition-all"
                        >
                          <Copy size={12} />
                          <span>Code: {activeSquad.squadCode}</span>
                        </button>
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
                                <td className="py-3.5 px-3 text-white font-bold">{agent.name}</td>
                                <td className="py-3.5 px-3 text-[var(--accent-xp)] font-bold">{agent.consistency}%</td>
                                <td className="py-3.5 px-3">{agent.squatPR} kg</td>
                                <td className="py-3.5 px-3">{agent.benchPR} kg</td>
                                <td className="py-3.5 px-3 uppercase text-[10px]">{agent.goal}</td>
                                <td className="py-3.5 px-3 font-bold">{agent.streak} Days</td>
                                <td className="py-3.5 px-3 text-right flex justify-end gap-2.5">
                                  <button
                                    onClick={() => setSelectedAgent(agent)}
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

                  {/* Scouting Radar Modal overlay */}
                  <AnimatePresence>
                    {selectedAgent && !tradeModalOpen && (
                      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                        <motion.div
                          initial={{ scale: 0.95, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.95, opacity: 0 }}
                          className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[5px_5px_0px_black] w-full max-w-md text-left flex flex-col gap-4 relative"
                        >
                          <div className="border-b-2 border-black pb-3">
                            <span className="text-[10px] font-mono text-neutral-500 uppercase block">Athlete Scouting Card</span>
                            <h4 className="font-display font-black text-2xl text-[var(--primary)] uppercase mt-0.5">
                              {selectedAgent.name}
                            </h4>
                          </div>

                          {/* Radar chart container */}
                          <div className="h-[220px] w-full font-mono text-[9px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={selectedAgent.attributes}>
                                <PolarGrid stroke="#333" />
                                <PolarAngleAxis dataKey="subject" stroke="#888" />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#444" tick={false} />
                                <Radar name={selectedAgent.name} dataKey="A" stroke="var(--secondary)" fill="var(--secondary)" fillOpacity={0.2} />
                              </RadarChart>
                            </ResponsiveContainer>
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-black/40 p-3 rounded-lg border border-neutral-900 mt-2">
                            <div className="flex flex-col">
                              <span className="text-[9px] text-neutral-500 uppercase">Bench / Squat PR</span>
                              <span className="text-white font-bold">{selectedAgent.benchPR} / {selectedAgent.squatPR} kg</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] text-neutral-500 uppercase">Workout Consistency</span>
                              <span className="text-[var(--accent-xp)] font-bold">{selectedAgent.consistency}%</span>
                            </div>
                          </div>

                          <div className="flex justify-end gap-3 border-t border-[#181818] pt-4 mt-2">
                            <button
                              onClick={() => setSelectedAgent(null)}
                              className="px-4 py-2 border-2 border-black text-xs font-mono font-bold text-white bg-black hover:bg-neutral-900 rounded shadow-[2px_2px_0px_black] uppercase cursor-pointer"
                            >
                              Close
                            </button>
                            {isAgentInSquad(selectedAgent.uid) ? (
                              <button
                                disabled
                                className="px-4 py-2 border-2 border-black text-xs font-mono font-bold text-neutral-500 bg-neutral-800 rounded shadow-[2px_2px_0px_black] uppercase cursor-not-allowed"
                              >
                                Member
                              </button>
                            ) : isAgentInvitePending(selectedAgent.uid) ? (
                              <button
                                disabled
                                className="px-4 py-2 border-2 border-black text-xs font-mono font-bold text-neutral-500 bg-neutral-900 rounded shadow-[2px_2px_0px_black] uppercase cursor-not-allowed"
                              >
                                Pending Invite
                              </button>
                            ) : (
                              <button
                                onClick={() => handleDraftAgent(selectedAgent)}
                                className="px-4 py-2 border-2 border-black text-xs font-mono font-bold text-black bg-[var(--primary)] hover:brightness-110 rounded shadow-[2px_2px_0px_black] uppercase cursor-pointer"
                              >
                                Draft Agent
                              </button>
                            )}
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

                </div>
              )}

            </div>
          )}

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
