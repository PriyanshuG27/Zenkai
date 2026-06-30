import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';
import { auth, db } from '../../lib/firebase';
import { doc, updateDoc, collection, getDocs, deleteDoc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useAuth } from '../../hooks/useAuth';
import { User, LogOut, Check, Dumbbell, ShieldAlert, Sparkles, Flame, Trophy, Award, Landmark, ToggleLeft, ToggleRight, X, Bell, BellOff, Trash2, ChevronDown, ChevronUp, FileText, ChevronRight } from 'lucide-react';
import { isPushEnabled, enablePushNotifications, disablePushNotifications } from '../../hooks/useFCM';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useSquadStore } from '../../stores/useSquadStore';
import { sendPushNotification } from '../../utils/notificationHelper';

// Side widgets integrated into the profile layout
import { AcademicBufferConfig } from './AcademicBufferConfig';
import { TrophyCabinetView } from './TrophyCabinetView';

// ─── Push Notification Toggle ─────────────────────────────────────────────────
function PushNotificationToggle() {
  const user = useAuthStore((s) => s.user);
  const addToast = useUIStore((s) => s.addToast);
  const [enabled, setEnabled] = useState(() => isPushEnabled());
  const [loading, setLoading] = useState(false);
  const browserBlocked = typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'denied';

  const handleToggle = async () => {
    if (loading || !user) return;
    setLoading(true);
    try {
      if (enabled) {
        await disablePushNotifications(user.uid);
        setEnabled(false);
        addToast('🔕 Push notifications turned off.', 'info');
      } else {
        const success = await enablePushNotifications(user.uid, addToast);
        if (success) {
          setEnabled(true);
          addToast('🔔 Push notifications turned on!', 'success');
        } else {
          addToast('⚠️ Could not enable — check browser notification permissions.', 'warning');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-2 border-black bg-[var(--surface)] p-5 rounded-2xl shadow-[5px_5px_0px_rgba(0,0,0,1)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {enabled
            ? <Bell size={18} className="text-[var(--primary)] shrink-0" />
            : <BellOff size={18} className="text-neutral-500 shrink-0" />
          }
          <div className="flex flex-col">
            <span className="font-display text-sm font-black uppercase tracking-wide text-white">
              Push Notifications
            </span>
            <span className="text-[10px] text-neutral-400 font-sans mt-0.5">
              {browserBlocked
                ? 'Blocked in browser settings — reset to enable'
                : enabled ? 'Squad updates, gym reminders & app news' : 'Currently off for this device'}
            </span>
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={handleToggle}
          disabled={loading || browserBlocked}
          aria-label={enabled ? 'Turn off push notifications' : 'Turn on push notifications'}
          className={`relative w-14 h-7 rounded-full border-2 border-black transition-all duration-200 shrink-0 cursor-pointer
            ${enabled ? 'bg-[var(--primary)]' : 'bg-neutral-700'}
            ${(loading || browserBlocked) ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}
          `}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full border border-black shadow transition-all duration-200
            ${enabled ? 'left-7' : 'left-0.5'}`}
          />
        </button>
      </div>
    </div>
  );
}

const EQUIPMENT_CATEGORIES = [
  { label: 'Chest & Push', items: ['Flat Bench', 'Incline Bench', 'Decline Bench', 'Chest Press Machine', 'Pec Deck', 'Dip Bars'] },
  { label: 'Back & Pull', items: ['Pull-up Bar', 'Lat Pulldown', 'Seated Row', 'Assisted Pull-up Machine', 'Cable Machine'] },
  { label: 'Legs', items: ['Squat Rack', 'Leg Press', 'Hack Squat', 'Leg Extension', 'Leg Curl', 'Smith Machine'] },
  { label: 'Shoulders & Arms', items: ['Shoulder Press Machine', 'Preacher Curl Bench', 'EZ Bar'] },
  { label: 'Free Weights', items: ['Barbell', 'Dumbbells', 'Kettlebell', 'Trap Bar', 'Medicine Ball', 'Weight Plates'] },
  { label: 'Core & Functional', items: ['Ab Wheel', 'Resistance Bands', 'TRX / Suspension', 'Battle Ropes', 'Parallettes', 'Gymnastic Rings', 'Power Rack'] },
  { label: 'Cardio', items: ['Treadmill', 'Stationary Bike', 'Rowing Machine', 'Elliptical', 'Stair Climber', 'Jump Rope'] },
  { label: 'Recovery', items: ['Foam Roller'] },
];

const MEDICAL_CATEGORIES = [
  {
    label: 'Upper Body',
    items: [
      { key: 'Shoulder Impingement', desc: 'Limits overhead pressing' },
      { key: 'Rotator Cuff Issue', desc: 'Avoid heavy shoulder loads' },
      { key: 'Wrist Pain', desc: 'Limits barbell grips' },
      { key: 'Elbow Tendinitis', desc: 'Affects curls & pressing' },
    ],
  },
  {
    label: 'Core & Back',
    items: [
      { key: 'Lower Back Issues', desc: 'Limits deadlifts & rows' },
      { key: 'Herniated Disc', desc: 'Avoid spinal loading' },
      { key: 'Hernia', desc: 'Avoid heavy compound lifts' },
    ],
  },
  {
    label: 'Lower Body',
    items: [
      { key: 'Bad Knees', desc: 'Limits squats & leg press' },
      { key: 'Hip Issues', desc: 'Affects hip hinge movements' },
      { key: 'Ankle Instability', desc: 'Affects balance exercises' },
    ],
  },
  {
    label: 'General Health',
    items: [
      { key: 'Post-Surgery', desc: 'Custom low-intensity plan' },
      { key: 'Varicocele', desc: 'Avoid prolonged pressure' },
      { key: 'High Blood Pressure', desc: 'Limits intense cardio' },
      { key: 'Asthma', desc: 'Affects cardio intensity' },
    ],
  },
];

export const DesktopProfile = () => {
  const { uid, profile } = useAuthStore();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useUIStore();
  const [activeTab, setActiveTab] = useState('equipment');
  const activeSquadCode = useSquadStore((s) => s.activeSquadCode);
  const [expandedVersion, setExpandedVersion] = useState('1.1.1');

  useEffect(() => {
    const hasSeenUpdate = localStorage.getItem('zenkai_seen_v1_1_1') === 'true';
    if (!hasSeenUpdate) {
      addToast('🚀 Zenkai updated to v1.1.1! Check out What\'s New in your Profile.', 'success');

      if (activeSquadCode) {
        sendPushNotification({
          squadCode: activeSquadCode,
          title: 'Zenkai Update: v1.1.1 is Live! 🚀',
          body: 'Firestore optimizations, dynamic leaderboard cache timers, and force sync are now live.',
          url: '/profile'
        });
      }

      localStorage.setItem('zenkai_seen_v1_1_1', 'true');
    }
  }, [activeSquadCode, addToast]);

  const [hideWhatsNew, setHideWhatsNew] = useState(() => {
    return localStorage.getItem('zenkai_hide_whats_new_v1_1') === 'true';
  });

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [confirmInputText, setConfirmInputText] = useState('');
  const [understandCheckbox, setUnderstandCheckbox] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleResetAccountData = async () => {
    if (!uid) return;
    setIsResetting(true);
    try {
      // 1. Delete all sessions (and their exercises subcollection docs)
      const sessionsRef = collection(db, 'users', uid, 'sessions');
      const sessionsSnap = await getDocs(sessionsRef);
      for (const sessionDoc of sessionsSnap.docs) {
        // Delete nested exercises subcollection docs
        const exercisesRef = collection(db, 'users', uid, 'sessions', sessionDoc.id, 'exercises');
        const exercisesSnap = await getDocs(exercisesRef);
        for (const exDoc of exercisesSnap.docs) {
          await deleteDoc(exDoc.ref);
        }
        // Delete the session doc
        await deleteDoc(sessionDoc.ref);
      }

      // 2. Delete all executed_sessions
      const execRef = collection(db, 'users', uid, 'executed_sessions');
      const execSnap = await getDocs(execRef);
      for (const d of execSnap.docs) {
        await deleteDoc(d.ref);
      }

      // 3. Delete all planned_targets
      const plannedRef = collection(db, 'users', uid, 'planned_targets');
      const plannedSnap = await getDocs(plannedRef);
      for (const d of plannedSnap.docs) {
        await deleteDoc(d.ref);
      }

      // 4. Delete all PRs
      const prsRef = collection(db, 'users', uid, 'prs');
      const prsSnap = await getDocs(prsRef);
      for (const d of prsSnap.docs) {
        await deleteDoc(d.ref);
      }

      // 5. Delete weeklyPlans
      const plansRef = collection(db, 'users', uid, 'weeklyPlans');
      const plansSnap = await getDocs(plansRef);
      for (const d of plansSnap.docs) {
        await deleteDoc(d.ref);
      }

      // 6. Delete fcmTokens
      const tokensRef = collection(db, 'users', uid, 'fcmTokens');
      const tokensSnap = await getDocs(tokensRef);
      for (const d of tokensSnap.docs) {
        await deleteDoc(d.ref);
      }

      // 7. Reset profile fields in users/{uid} and delete private document
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        xp: 0,
        cumulativeXP: 0,
        level: 1,
        levelName: 'Rookie',
        streak: 0,
        streakLastDate: null,
        onboardingComplete: false,
        onboardingSkipped: false,
        userType: null,
      });

      const privateProfileRef = doc(db, 'users', uid, 'private', 'profile');
      await deleteDoc(privateProfileRef);

      // Clear the local weekly plan store (Zustand) + localStorage SWR cache
      const { usePlanStore, clearPlanCache } = await import('../../stores/usePlanStore');
      clearPlanCache(uid); // wipe all week caches for this user
      usePlanStore.getState().clearPlan();

      // Trigger profile sync so useAuthStore gets the updated values
      const [snap, privateSnap] = await Promise.all([
        getDoc(userRef),
        getDoc(privateProfileRef)
      ]);
      if (snap && snap.exists()) {
        const privateData = privateSnap.exists() ? privateSnap.data() : {};
        useAuthStore.getState().setProfile({ ...snap.data(), ...privateData });
      }

      addToast('💥 Account successfully reset! Redirecting to onboarding...', 'success');
      setShowResetModal(false);
      setResetStep(1);
      setConfirmInputText('');
      setUnderstandCheckbox(false);
      navigate('/onboarding/type', { replace: true });
    } catch (err) {
      console.error('[Profile] Failed to reset account data:', err);
      addToast('Failed to reset account data. Please try again.', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  // Edit States
  const [editEquipment, setEditEquipment] = useState([]);
  const [editMedicalFlags, setEditMedicalFlags] = useState([]);
  const [editGymName, setEditGymName] = useState('');
  const [editDisableRestTimer, setEditDisableRestTimer] = useState(false);

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Sync state with profile loaded on mount/update
  useEffect(() => {
    if (profile) {
      setEditEquipment(profile.equipmentList || []);
      setEditMedicalFlags(profile.medicalFlags || []);
      setEditGymName(profile.gymName || '');
      setEditDisableRestTimer(profile.disableRestTimer || false);
    }
  }, [profile]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('[Profile] Sign out failed:', err);
    }
  };

  const handleSaveSettings = async () => {
    if (!profile || !uid) return;
    setSaving(true);
    setSuccess(false);
    try {
      const { writeBatch } = await import('firebase/firestore');
      const userRef = doc(db, 'users', uid);
      const computedGymId = editGymName.trim()
        ? editGymName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_+|_+$)/g, '')
        : '';

      const oldGymId = profile.gymId || '';
      let lookingForSquad = profile.lookingForSquad;
      if (!computedGymId) {
        lookingForSquad = false;
      } else if (computedGymId !== oldGymId || lookingForSquad === undefined) {
        lookingForSquad = true;
      }

      const batch = writeBatch(db);

      const publicUpdates = {
        gymName: editGymName.trim(),
        gymId: computedGymId,
        disableRestTimer: editDisableRestTimer,
        lookingForSquad,
      };

      const privateUpdates = {
        equipmentList: editEquipment,
        medicalFlags: editMedicalFlags,
        updatedAt: new Date(),
      };

      batch.update(userRef, publicUpdates);
      batch.update(doc(db, 'users', uid, 'private', 'profile'), privateUpdates);

      await batch.commit();

      const mergedUpdates = {
        ...publicUpdates,
        ...privateUpdates
      };

      // Trigger store refresh
      useAuthStore.setState({
        profile: {
          ...profile,
          ...mergedUpdates
        }
      });

      // Sync public squad_codes document
      if (profile.squadCode) {
        const codeRef = doc(db, 'squad_codes', profile.squadCode);
        await updateDoc(codeRef, {
          gymId: computedGymId,
          gymName: editGymName.trim(),
          lookingForSquad
        }).catch(err => console.warn('[Profile] Failed to update squad code doc:', err));
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      console.error('[Profile] Saving failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const nameInitial = profile?.name ? profile.name.charAt(0).toUpperCase() : 'F';
  const email = profile?.email || auth.currentUser?.email || 'trainer@zenkai.com';

  return (
    <div className="w-full max-w-[1440px] mx-auto flex flex-col gap-8 text-[var(--text-primary)] min-h-[85vh] font-sans select-none">
      
      {/* Header */}
      <div className="border-b-4 border-black pb-5 mt-2 flex justify-between items-end">
        <div>
          <h1 className="font-display text-4xl font-black tracking-tight uppercase leading-none text-white flex items-center gap-3">
            <User className="text-[var(--primary)]" size={32} />
            <span>Profile & Settings</span>
          </h1>
          <p className="text-xs font-mono text-[var(--text-secondary)] uppercase tracking-wider mt-2.5">
            Configure athletic profile parameters, medical flags, and equipment settings
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 border-2 border-black bg-[var(--surface)] hover:bg-[#ef44440c] hover:border-[#ef4444] px-4 py-2 rounded-lg shadow-[3px_3px_0px_black] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] text-xs font-mono font-bold text-[#ef4444] uppercase transition-all"
        >
          <LogOut size={14} />
          <span>Sign Out</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: Setup Configuration (col-span-7) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          {/* User Profile Summary Card */}
          <div className="border-2 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[5px_5px_0px_rgba(0,0,0,1)] flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-5 w-full">
              {/* Avatar */}
              <div className="w-20 h-20 bg-[var(--primary)] text-black border-4 border-black rounded-xl shadow-[4px_4px_0px_rgba(0,0,0,1)] flex items-center justify-center font-display font-black text-4xl shrink-0">
                {nameInitial}
              </div>
              
              <div className="flex flex-col min-w-0">
                <h2 className="font-display text-2xl font-black uppercase tracking-wide text-white leading-tight">
                  {profile?.name || 'ZENKAI TRAINER'}
                </h2>
                <span className="text-sm font-mono text-[var(--text-secondary)] mt-0.5 truncate">
                  {email}
                </span>
                
                <div className="flex items-center gap-2 mt-2 font-mono text-xs">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-xp)] border border-[var(--accent-xp)] bg-[#b5ff2d0c] rounded-md">
                    Level {profile?.level || 1}
                  </span>
                  <span className="text-[var(--secondary)] font-bold">
                    {profile?.levelName || 'Rookie'}
                  </span>
                </div>
              </div>
            </div>

            {/* Streak & XP Badges */}
            <div className="flex md:flex-col gap-3 shrink-0 w-full md:w-auto">
              <div className="flex-1 flex items-center gap-3 border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 rounded-xl shadow-[2px_2px_0px_black] font-mono text-xs">
                <Flame className="text-[var(--primary)] shrink-0" size={16} />
                <div className="flex flex-col text-left">
                  <span className="text-[9px] text-[var(--text-secondary)] uppercase">Streak</span>
                  <span className="font-bold text-white text-sm">{profile?.streak || 0} Days 🔥</span>
                </div>
              </div>
              
              <div className="flex-1 flex items-center gap-3 border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 rounded-xl shadow-[2px_2px_0px_black] font-mono text-xs">
                <Trophy className="text-[var(--accent-xp)] shrink-0" size={16} />
                <div className="flex flex-col text-left">
                  <span className="text-[9px] text-[var(--text-secondary)] uppercase">Total XP</span>
                  <span className="font-bold text-white text-sm">{profile?.xp ?? profile?.totalXP ?? 0} XP</span>
                </div>
              </div>
            </div>
          </div>

          {/* Configuration Form Card */}
          <div className="border-2 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[5px_5px_0px_rgba(0,0,0,1)] flex flex-col gap-6">
            
            {/* Header & Save Action */}
            <div className="border-b border-[var(--border)] pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="font-display font-black text-xl text-white uppercase tracking-tight flex items-center gap-2">
                  <Landmark className="text-[var(--primary)]" size={20} />
                  <span>Athletic Settings Dashboard</span>
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Map out available equipment setups, app rest defaults, and local gyms.
                </p>
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="w-full sm:w-auto px-5 py-2.5 bg-[var(--primary)] text-white font-display font-extrabold tracking-wider text-xs uppercase rounded-lg border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <span>{saving ? 'Saving...' : success ? '✓ Saved!' : 'Save Settings'}</span>
              </button>
            </div>

            {/* Top Layout Grid: Gym & Preferences */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 font-sans">
              
              {/* Home Gym */}
              <div className="border border-[var(--border)] bg-[var(--bg-elevated)] p-4 rounded-xl shadow-[2px_2px_0px_black] flex flex-col gap-3 text-left">
                <span className="text-xs font-bold text-white uppercase tracking-wider font-display border-b border-[#222] pb-1">
                  Home Gym Tagging
                </span>
                <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                  Connect to Leaderboards by entering your home gym name.
                </p>
                <div className="flex flex-col gap-1 mt-1 font-mono">
                  <label className="text-[9px] text-[var(--secondary)] uppercase tracking-wider font-bold">Gym Name</label>
                  <input
                    type="text"
                    value={editGymName}
                    onChange={(e) => setEditGymName(e.target.value)}
                    placeholder="e.g. Gold's Gym Koramangala"
                    className="w-full bg-black text-white text-xs px-3 py-2 rounded border border-[#222] focus:outline-none focus:border-[var(--primary)] font-sans mt-1"
                  />
                </div>
              </div>

              {/* Preferences */}
              <div className="border border-[var(--border)] bg-[var(--bg-elevated)] p-4 rounded-xl shadow-[2px_2px_0px_black] flex flex-col justify-between text-left">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider font-display border-b border-[#222] pb-1">
                    App Preferences
                  </span>
                  <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                    Adjust in-workout telemetry options.
                  </p>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <div className="flex flex-col pr-2">
                    <span className="text-xs font-bold text-white">Disable Rest Timer</span>
                    <span className="text-[9px] text-[var(--text-secondary)] mt-0.5">
                      Disable auto-rest count down.
                    </span>
                  </div>
                  <button
                    onClick={() => setEditDisableRestTimer(p => !p)}
                    className="focus:outline-none text-[var(--primary)] hover:scale-105 active:scale-95 transition-all"
                  >
                    {editDisableRestTimer ? (
                      <ToggleRight size={38} className="text-[var(--primary)]" />
                    ) : (
                      <ToggleLeft size={38} className="text-neutral-600" />
                    )}
                  </button>
                </div>
              </div>

            </div>

            {/* Custom Tab Selector */}
            <div className="flex border-4 border-black bg-black p-1 rounded-xl text-xs font-mono shrink-0">
              <button
                onClick={() => setActiveTab('equipment')}
                className={`flex-1 py-2 rounded-lg font-bold uppercase transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'equipment' ? 'bg-[var(--primary)] text-white shadow-[2px_2px_0px_black]' : 'text-[var(--text-secondary)] hover:text-white'
                }`}
              >
                <Dumbbell size={14} />
                <span>Equipment Setup ({editEquipment.length})</span>
              </button>
              
              <button
                onClick={() => setActiveTab('health')}
                className={`flex-1 py-2 rounded-lg font-bold uppercase transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'health' ? 'bg-[var(--primary)] text-white shadow-[2px_2px_0px_black]' : 'text-[var(--text-secondary)] hover:text-white'
                }`}
              >
                <ShieldAlert size={14} />
                <span>Physical Warnings ({editMedicalFlags.length})</span>
              </button>
            </div>

            {/* Tabbed Interactive Lists */}
            <div className="flex-1 max-h-[350px] overflow-y-auto pr-1">
              
              {activeTab === 'equipment' && (
                <div className="flex flex-col gap-4 text-left">
                  
                  {/* Select All */}
                  <div className="flex justify-between items-center bg-black/40 p-2.5 rounded-lg border border-[#222]">
                    <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase">Toggle Equipment Checklist</span>
                    <button
                      onClick={() => {
                        const allItems = EQUIPMENT_CATEGORIES.flatMap(cat => cat.items);
                        setEditEquipment(all => all.length === allItems.length ? [] : allItems);
                      }}
                      className="px-3 py-1 text-[10px] font-mono uppercase font-bold border border-[#444] hover:border-[var(--primary)] bg-black text-[var(--text-secondary)] hover:text-white rounded transition-all"
                    >
                      {editEquipment.length === EQUIPMENT_CATEGORIES.flatMap(cat => cat.items).length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  {EQUIPMENT_CATEGORIES.map((cat) => (
                    <div key={cat.label} className="border border-[var(--border)] bg-[var(--bg-elevated)] p-3 rounded-xl flex flex-col gap-2">
                      <span className="text-[11px] font-bold text-white uppercase tracking-wider font-display border-b border-[#222] pb-1">
                        {cat.label}
                      </span>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
                        {cat.items.map((item) => {
                          const isSelected = editEquipment.includes(item);
                          return (
                            <button
                              key={item}
                              onClick={() => {
                                setEditEquipment(prev =>
                                  prev.includes(item)
                                    ? prev.filter(i => i !== item)
                                    : [...prev, item]
                                );
                              }}
                              className={`px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold border text-left flex items-center justify-between transition-all ${
                                isSelected
                                  ? 'bg-[#b5ff2d0e] text-[var(--accent-xp)] border-[var(--accent-xp)]'
                                  : 'bg-black/35 text-[var(--text-secondary)] border-[#222] hover:border-[#444]'
                              }`}
                            >
                              <span className="truncate pr-1">{item}</span>
                              {isSelected && <Check size={10} className="shrink-0 text-[var(--accent-xp)]" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                </div>
              )}

              {activeTab === 'health' && (
                <div className="flex flex-col gap-4 text-left">
                  
                  {MEDICAL_CATEGORIES.map((cat) => (
                    <div key={cat.label} className="border border-[var(--border)] bg-[var(--bg-elevated)] p-3 rounded-xl flex flex-col gap-2">
                      <span className="text-[11px] font-bold text-[#ef4444] uppercase tracking-wider font-display border-b border-[#222] pb-1">
                        {cat.label}
                      </span>
                      
                      <div className="flex flex-col gap-2 mt-1">
                        {cat.items.map((flag) => {
                          const isSelected = editMedicalFlags.includes(flag.key);
                          return (
                            <button
                              key={flag.key}
                              onClick={() => {
                                setEditMedicalFlags(prev =>
                                  prev.includes(flag.key)
                                    ? prev.filter(f => f !== flag.key)
                                    : [...prev, flag.key]
                                );
                              }}
                              className={`p-2.5 rounded-lg text-left border flex items-start justify-between gap-3 transition-all ${
                                isSelected
                                  ? 'bg-[#ef44440c] text-[#ef4444] border-[#ef4444]'
                                  : 'bg-black/35 text-[var(--text-secondary)] border-[#222] hover:border-[#444]'
                              }`}
                            >
                              <div className="flex flex-col min-w-0">
                                <span className={`text-[11px] font-bold ${isSelected ? 'text-[#ef4444]' : 'text-white'}`}>
                                  {flag.key}
                                </span>
                                <span className="text-[9px] text-[var(--text-muted)] mt-0.5 leading-tight font-normal font-sans">
                                  {flag.desc}
                                </span>
                              </div>
                              {isSelected && <Check size={12} className="shrink-0 text-[#ef4444] mt-0.5" />}
                            </button>
                          );
                        })}
                      </div>

                    </div>
                  ))}

                </div>
              )}

            </div>

          </div>

          {/* Danger Zone Card */}
          <div className="border-2 border-red-600 bg-[#1f1212] p-6 rounded-2xl shadow-[5px_5px_0px_rgba(220,38,38,0.3)] flex flex-col gap-4 text-left">
            <div className="flex items-center gap-3 border-b border-red-950 pb-3">
              <Trash2 className="text-red-500 shrink-0" size={22} />
              <div className="flex flex-col">
                <h3 className="font-display font-black text-xl text-red-500 uppercase tracking-tight">
                  Danger Zone
                </h3>
                <span className="text-xs text-neutral-400 font-sans mt-0.5">
                  Irreversible account operations
                </span>
              </div>
            </div>
            <p className="text-xs text-neutral-300 font-sans leading-relaxed">
              Wipe all your local and remote progress, including workout history, weekly plans, physical measurements, XP, streaks, and PR telemetry logs. This action is final and cannot be undone.
            </p>
            <div>
              <motion.button
                onClick={() => {
                  setShowResetModal(true);
                  setResetStep(1);
                  setConfirmInputText('');
                  setUnderstandCheckbox(false);
                }}
                className="w-full sm:w-auto px-6 py-3 border-2 border-black bg-red-600 hover:bg-red-700 text-white font-display font-extrabold tracking-widest text-xs uppercase rounded-lg shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer font-bold"
                whileTap={{ scale: 0.98 }}
              >
                <Trash2 size={14} />
                <span>Reset Account Data</span>
              </motion.button>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Config & Achievements Panels (col-span-5) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Academic Exam Buffer Configuration */}
          <AcademicBufferConfig />

          {/* Trophy Cabinet Achievement list */}
          <TrophyCabinetView />

            {/* What's New Widget */}
            {!hideWhatsNew && (
              <div className="border-2 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[5px_5px_0px_rgba(0,0,0,1)] text-left flex flex-col gap-4 relative">
                <button
                  onClick={() => {
                    localStorage.setItem('zenkai_hide_whats_new_v1_1', 'true');
                    setHideWhatsNew(true);
                  }}
                  className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors"
                  title="Hide What's New"
                >
                  <X size={16} />
                </button>
                <div className="flex items-center gap-2 border-b border-[#222] pb-3">
                  <Sparkles size={20} className="text-[var(--primary)] shrink-0" />
                  <div>
                    <h3 className="font-display font-black text-lg text-white uppercase tracking-tight leading-none">
                      What's New in Zenkai
                    </h3>
                    <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider mt-1 block">Release Changelog & Updates</span>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {/* v1.1.1 Accordion */}
                  <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--bg-elevated)]">
                    <button 
                      onClick={() => setExpandedVersion(expandedVersion === '1.1.1' ? null : '1.1.1')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-black/25 font-display text-xs font-black uppercase text-white hover:bg-black/40 transition-all text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="bg-[var(--primary)] text-black px-1.5 py-0.5 rounded text-[8px] font-mono font-bold">LATEST</span>
                        <span>v1.1.1 — Database & UI Optimizations</span>
                      </div>
                      <span className="text-neutral-500">
                        {expandedVersion === '1.1.1' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </button>
                    
                    {expandedVersion === '1.1.1' && (
                      <div className="p-4 border-t border-[var(--border)]">
                        <ul className="text-xs text-neutral-300 font-sans list-disc pl-4 space-y-2 leading-relaxed">
                          <li><strong className="text-white">Firestore Write Flattening:</strong> Workout exercises are now saved as a flat array within the session document, saving ~50% database write quota.</li>
                          <li><strong className="text-white">Global Zustand Listeners:</strong> Extracted active squad listeners to global Zustand state. Switching tabs now costs 0 additional database reads.</li>
                          <li><strong className="text-white">Leaderboard Caching & Live Timer:</strong> Cached rankings for 15 minutes and added a live `Refreshes in MM:SS` countdown timer.</li>
                          <li><strong className="text-white">Force Sync:</strong> Added a Neubrutalist sync button next to the leaderboard for on-demand live rank updates.</li>
                          <li><strong className="text-white">Backward-Compatible Workouts:</strong> Added checks to seamlessly load both new flat-array workouts and legacy subcollection workouts.</li>
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* v1.1.0 Accordion */}
                  <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--bg-elevated)]">
                    <button 
                      onClick={() => setExpandedVersion(expandedVersion === '1.1.0' ? null : '1.1.0')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-black/25 font-display text-xs font-black uppercase text-white hover:bg-black/40 transition-all text-left"
                    >
                      <span>v1.1.0 — UI Reminders & Custom Dialogs</span>
                      <span className="text-neutral-500">
                        {expandedVersion === '1.1.0' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </button>
                    
                    {expandedVersion === '1.1.0' && (
                      <div className="p-4 border-t border-[var(--border)]">
                        <ul className="text-xs text-neutral-300 font-sans list-disc pl-4 space-y-2 leading-relaxed">
                          <li><strong className="text-white">Custom In-App Dialogs:</strong> Native browser popups have been fully replaced with custom-animated neubrutalist modals.</li>
                          <li><strong className="text-white">Smart Workout Reminders:</strong> Sends in-app and browser notifications 1 hour prior to your teammate's scheduled workouts.</li>
                          <li><strong className="text-white">Rest Days / Not Going:</strong> Added a "Not Going" (Rest Day 😴) option to Gym check-ins and scheduling polls.</li>
                          <li><strong className="text-white">Midnight Clearing:</strong> Polls and check-ins now clear automatically at midnight local time to keep the board fresh.</li>
                          <li><strong className="text-white">Weekly Challenge Regeneration Cooldown:</strong> Enforced a strict 48-hour rate-limit on weekly challenge rerolls.</li>
                          <li><strong className="text-white">Tougher Boss HP:</strong> Boss raids now scale dynamically with a 12,000kg baseline per member to keep the battles competitive.</li>
                          <li><strong className="text-white">Currency Separation:</strong> Spendable XP (Aura shop) is now separated from your Lifetime XP so buying cosmetics never decreases your level.</li>
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          {/* Push Notification Toggle */}
          <PushNotificationToggle />

          {/* Legal & Compliance Card */}
          <div className="border-2 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[5px_5px_0px_rgba(0,0,0,1)] text-left flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-[#222] pb-3">
              <FileText size={20} className="text-[var(--primary)] shrink-0" />
              <div>
                <h3 className="font-display font-black text-lg text-white uppercase tracking-tight leading-none">
                  Legal & Compliance
                </h3>
                <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider mt-1 block">Zenkai terms, privacy, and rules</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => window.open('/terms', '_blank')}
                className="w-full py-3 px-4 bg-bg-surface hover:bg-[#1a1a1a] text-left rounded-xl border border-border flex items-center justify-between text-xs font-mono font-bold text-text-primary uppercase tracking-wide transition-all shadow-[2px_2px_0px_rgba(0,0,0,0.1)] active:scale-[0.99] cursor-pointer"
              >
                <span>Terms of Service & Liability Waiver</span>
                <ChevronRight size={14} className="text-[var(--text-muted)]" />
              </button>
              <button
                onClick={() => window.open('/privacy', '_blank')}
                className="w-full py-3 px-4 bg-bg-surface hover:bg-[#1a1a1a] text-left rounded-xl border border-border flex items-center justify-between text-xs font-mono font-bold text-text-primary uppercase tracking-wide transition-all shadow-[2px_2px_0px_rgba(0,0,0,0.1)] active:scale-[0.99] cursor-pointer"
              >
                <span>Privacy Policy & Data safety</span>
                <ChevronRight size={14} className="text-[var(--text-muted)]" />
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* ─── RESET ACCOUNT DATA MODAL (DANGER ZONE) ────────────────────── */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 bg-black/90 z-[250] flex items-center justify-center p-4 backdrop-blur-xs">
            {/* Backdrop Close (Only if not currently resetting) */}
            <div 
              className={`absolute inset-0 ${isResetting ? 'pointer-events-none' : 'cursor-pointer'}`} 
              onClick={() => {
                if (!isResetting) {
                  setShowResetModal(false);
                  setResetStep(1);
                  setConfirmInputText('');
                  setUnderstandCheckbox(false);
                }
              }} 
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-[#111111] border-2 border-red-600 rounded-lg p-6 w-full max-w-md shadow-[8px_8px_0px_rgba(220,38,38,0.3)] relative flex flex-col gap-4 text-white z-10 text-left font-sans"
            >
              {/* Close Button (Disabled when resetting) */}
              {!isResetting && (
                <button
                  onClick={() => {
                    setShowResetModal(false);
                    setResetStep(1);
                    setConfirmInputText('');
                    setUnderstandCheckbox(false);
                  }}
                  className="absolute top-4 right-4 text-xs text-[var(--text-secondary)] hover:text-white transition-all bg-transparent border-none cursor-pointer"
                >
                  <X size={20} />
                </button>
              )}

              {/* Modal Header */}
              <div className="flex items-center gap-3 border-b-2 border-red-950/40 pb-3">
                <div className="p-2 rounded bg-red-950/20 border border-red-500 text-red-500 shadow-[2px_2px_0px_rgba(0,0,0,1)] animate-pulse">
                  <ShieldAlert size={20} />
                </div>
                <div className="flex flex-col font-display">
                  <span className="font-extrabold text-lg uppercase tracking-wide leading-none text-red-500 font-barlow">
                    Reset Account Data
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider mt-1">
                    Step {resetStep} of 2
                  </span>
                </div>
              </div>

              {/* Step 1: Warning & Typed Confirmation */}
              {resetStep === 1 && (
                <div className="flex flex-col gap-4">
                  <div className="border border-red-900/50 bg-red-950/10 p-3 rounded-lg text-xs text-red-400 leading-relaxed font-sans">
                    <strong>⚠️ WARNING:</strong> This will permanently delete your workout history, custom weekly plans, physical measurements, and PR logs. Your XP and Level will be reset to 1. <strong>This action cannot be undone.</strong>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
                      Type <span className="font-bold text-red-500 font-sans">RESET</span> to confirm:
                    </label>
                    <input
                      type="text"
                      value={confirmInputText}
                      onChange={(e) => setConfirmInputText(e.target.value)}
                      placeholder="RESET"
                      className="w-full bg-[#1e1e1e] border-2 border-black p-2.5 rounded text-white font-mono text-sm focus:outline-none focus:border-red-500 shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                    />
                  </div>
                  <button
                    disabled={confirmInputText !== 'RESET'}
                    onClick={() => setResetStep(2)}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-display font-extrabold tracking-widest text-xs uppercase rounded border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none transition-all flex items-center justify-center cursor-pointer font-bold"
                  >
                    CONTINUE TO FINAL STEP
                  </button>
                </div>
              )}

              {/* Step 2: Final Checkbox & Delete execution */}
              {resetStep === 2 && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-neutral-300 font-sans leading-relaxed">
                    This is your final confirmation. Please check the box below to authorize deletion of all data associated with this account.
                  </p>
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={understandCheckbox}
                      disabled={isResetting}
                      onChange={(e) => setUnderstandCheckbox(e.target.checked)}
                      className="w-4 h-4 rounded border-2 border-black accent-red-600 cursor-pointer mt-0.5"
                    />
                    <span className="text-[10px] text-neutral-400 font-sans leading-relaxed">
                      I understand that all my gym logs, XP, and streak progress will be permanently wiped and cannot be recovered.
                    </span>
                  </label>

                  <div className="flex gap-3 mt-2">
                    {!isResetting && (
                      <button
                        onClick={() => setResetStep(1)}
                        className="flex-1 py-2.5 bg-[#222] hover:bg-[#333] text-neutral-400 font-display font-extrabold tracking-widest text-xs uppercase rounded border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all flex items-center justify-center cursor-pointer font-bold"
                      >
                        BACK
                      </button>
                    )}
                    <button
                      disabled={!understandCheckbox || isResetting}
                      onClick={handleResetAccountData}
                      className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-display font-extrabold tracking-widest text-xs uppercase rounded border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none transition-all flex items-center justify-center gap-2 cursor-pointer font-bold text-center"
                    >
                      {isResetting ? (
                        <>
                          <span className="animate-spin text-sm">⏳</span>
                          <span>DELETING...</span>
                        </>
                      ) : (
                        <span>WIPE MY DATA</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default DesktopProfile;
