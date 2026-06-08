import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Users, Zap, Plus, Trash2, Search, CheckCircle, ShieldAlert, LogOut, Copy, Award, Key, Calendar, Vote, Bell, BellOff } from 'lucide-react';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useSquadStore } from '../../stores/useSquadStore';
import { callFitDesiAPI } from '../../lib/apiClient';
import { requestNotificationPermission, sendBrowserNotification } from '../../utils/notificationHelper';



export const SquadMatchmaker = () => {
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
    localStorage.getItem('fitdesi_mute_squad_notifications') === 'true'
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

  // Notifications
  const [successMsg, setSuccessMsg] = useState('');

  // 1. Initialise & Sync Squad Code for current user
  useEffect(() => {
    if (!uid || !profile) return;
    
    const syncMySquadCode = async () => {
      try {
        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        let code = '';
        
        if (userSnap.exists()) {
          const userData = userSnap.data();
          code = userData.squadCode;
        }
        
        if (!code) {
          // Generate new squad code: FIT- + clean first 4 chars of name + 3 random digits
          const cleanName = (profile.name || 'FitDesi').replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase();
          const padName = cleanName.padEnd(4, 'X');
          const randomDigits = Math.floor(100 + Math.random() * 900); // 3 digits
          code = `FIT-${padName}${randomDigits}`;
          
          // Save code to user profile
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
          updatedAt: new Date()
        }, { merge: true });
        
      } catch (err) {
        console.error('[SquadMatchmaker] Error syncing squad code:', err);
      }
    };
    
    syncMySquadCode();
  }, [uid, profile]);

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
                checkIn: (fresh.streak || 0) > 0
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
      const res = await callFitDesiAPI('generateSquadChallenge', {
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
        const res = await callFitDesiAPI('generateSquadChallenge', {
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
              localStorage.setItem('fitdesi_mute_squad_notifications', next ? 'true' : 'false');
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
                          <div className="h-4 w-full bg-neutral-900 border border-[#222] rounded-md overflow-hidden p-[2px]">
                            <div 
                              className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent-xp)] rounded-sm transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex flex-col gap-1.5">
                      <span className="text-[9px] font-mono text-neutral-500 uppercase font-bold text-left">Individual Contributions:</span>
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
                      <span>Weekly Volume: {totalVolume}kg</span>
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
                            <span>Volume: <strong className="text-white">{mbr.volume || 0}kg</strong></span>
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

                    {/* List of active polls */}
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

                    {/* Create Poll Form */}
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

                    {/* Today's Presence Check-in list */}
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

                    {/* Check In Action Form */}
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
