import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { getAvatarStyle } from '../../lib/xpHelpers';
import { useXPStore } from '../../stores/useXPStore';
import { useUIStore } from '../../stores/useUIStore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { doc, updateDoc, collection, addDoc, query, onSnapshot, deleteDoc, getDocs, getDoc } from 'firebase/firestore';
import { Smartphone, LogOut, Info, Sparkles, User, Flame, Trophy, Award, Check, X, MessageSquare, ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, Trash2, Plus, ArrowLeft, Camera, Bell, BellOff, FileText, Shield } from 'lucide-react';
import { isPushEnabled, enablePushNotifications, disablePushNotifications } from '../../hooks/useFCM';
import { motion, AnimatePresence } from 'framer-motion';
import { useWeeklyRecap } from '../../hooks/useWeeklyRecap';
import { useAuth } from '../../hooks/useAuth';
import { WeeklyRecapScreen } from '../shared/WeeklyRecapScreen';
import { GymLeaderboard } from '../shared/GymLeaderboard';
import { compressGymImage } from '../../utils/imageCompressor';
import { useSquadStore } from '../../stores/useSquadStore';
import { sendPushNotification } from '../../utils/notificationHelper';

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
    <div className="border-2 border-black bg-[var(--surface)] p-4 rounded-xl shadow-[4px_4px_0px_rgba(0,0,0,1)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {enabled
            ? <Bell size={16} className="text-[var(--primary)] shrink-0" />
            : <BellOff size={16} className="text-neutral-500 shrink-0" />
          }
          <div className="flex flex-col">
            <span className="font-display text-xs font-black uppercase tracking-wide text-white">
              Push Notifications
            </span>
            <span className="text-[9px] text-neutral-400 font-sans mt-0.5">
              {browserBlocked
                ? 'Blocked in browser settings — reset to enable'
                : enabled ? 'Squad updates, gym reminders & app news' : 'Currently off for this device'}
            </span>
          </div>
        </div>

        {/* Toggle button */}
        <button
          onClick={handleToggle}
          disabled={loading || browserBlocked}
          aria-label={enabled ? 'Turn off push notifications' : 'Turn on push notifications'}
          className={`relative w-12 h-6 rounded-full border-2 border-black transition-all duration-200 shrink-0 cursor-pointer
            ${enabled ? 'bg-[var(--primary)]' : 'bg-neutral-700'}
            ${(loading || browserBlocked) ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full border border-black shadow transition-all duration-200
            ${enabled ? 'left-6' : 'left-0.5'}`}
          />
        </button>
      </div>
    </div>
  );
}

export const MobileProfile = () => {

  const navigate = useNavigate();
  const { logout } = useAuth();
  const { profile } = useAuthStore();
  const uid = auth.currentUser?.uid;
  const { xp, totalXP, level, levelName, streak } = useXPStore();
  const { isStandalone, openModal, addToast } = useUIStore();
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

  const { recap, weekId: recapWeekId } = useWeeklyRecap();
  const [showRecap, setShowRecap] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
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

  const [activeSettingsTab, setActiveSettingsTab] = useState('equipment');
  const [editEquipment, setEditEquipment] = useState([]);
  const [editMedicalFlags, setEditMedicalFlags] = useState([]);
  const [editGymName, setEditGymName] = useState('');
  const [editDisableRestTimer, setEditDisableRestTimer] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Feedback Feature States & Handlers
  const [isFeatureModalOpen, setIsFeatureModalOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState('Suggest an Exercise');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackList, setFeedbackList] = useState([]);
  const [isAddingFeedback, setIsAddingFeedback] = useState(false);
  const [expandedFeedbackId, setExpandedFeedbackId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('All');
  const [sortBy, setSortBy] = useState('Most Liked');
  const [feedbackScreenshot, setFeedbackScreenshot] = useState(null);
  const [isCompressingScreenshot, setIsCompressingScreenshot] = useState(false);
  const [activeScreenshotViewer, setActiveScreenshotViewer] = useState(null);

  useEffect(() => {
    if (!isFeatureModalOpen) return;
    const q = query(collection(db, 'feedback'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setFeedbackList(items);
    }, (err) => {
      console.error("Error listening to feedback:", err);
    });
    return () => unsubscribe();
  }, [isFeatureModalOpen]);

  const handleSubmitFeedback = async () => {
    if (!feedbackTitle.trim()) {
      addToast('Please enter a summary title.', 'error');
      return;
    }
    if (!feedbackText.trim()) {
      addToast('Please enter your detailed explanation.', 'error');
      return;
    }
    setIsSubmittingFeedback(true);
    try {
      await addDoc(collection(db, 'feedback'), {
        uid,
        userName: profile?.name || 'Anonymous',
        title: feedbackTitle.trim(),
        description: feedbackText.trim(),
        category: feedbackType,
        status: 'Future Plans',
        upvotes: [],
        downvotes: [],
        createdAt: new Date().toISOString(),
        screenshot: feedbackScreenshot || null
      });
      addToast('Feedback posted successfully! 🚀', 'success');
      setFeedbackTitle('');
      setFeedbackText('');
      setFeedbackScreenshot(null);
      setIsAddingFeedback(false);
    } catch (err) {
      console.error('Error submitting feedback:', err);
      addToast('Failed to submit feedback. Try again.', 'error');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleVote = async (feedbackId, voteType) => {
    const item = feedbackList.find(f => f.id === feedbackId);
    if (!item || !uid) return;

    const upvotes = item.upvotes || [];
    const downvotes = item.downvotes || [];
    const hasUpvoted = upvotes.includes(uid);
    const hasDownvoted = downvotes.includes(uid);

    let newUpvotes = [...upvotes];
    let newDownvotes = [...downvotes];

    if (voteType === 'up') {
      if (hasUpvoted) {
        newUpvotes = newUpvotes.filter(id => id !== uid);
      } else {
        newUpvotes.push(uid);
        newDownvotes = newDownvotes.filter(id => id !== uid);
      }
    } else if (voteType === 'down') {
      if (hasDownvoted) {
        newDownvotes = newDownvotes.filter(id => id !== uid);
      } else {
        newDownvotes.push(uid);
        newUpvotes = newUpvotes.filter(id => id !== uid);
      }
    }

    try {
      const docRef = doc(db, 'feedback', feedbackId);
      await updateDoc(docRef, {
        upvotes: newUpvotes,
        downvotes: newDownvotes
      });
    } catch (err) {
      console.error('Error voting:', err);
      addToast('Failed to save vote.', 'error');
    }
  };

  const handleUpdateStatus = async (feedbackId, newStatus) => {
    try {
      const docRef = doc(db, 'feedback', feedbackId);
      await updateDoc(docRef, { status: newStatus });
      addToast(`Status marked as "${newStatus}"`, 'success');
    } catch (err) {
      console.error('Error updating status:', err);
      addToast('Failed to update status.', 'error');
    }
  };

  const handleDeleteFeedback = async (feedbackId) => {
    if (!window.confirm('Delete this feedback suggestion permanently?')) return;
    try {
      const docRef = doc(db, 'feedback', feedbackId);
      await deleteDoc(docRef);
      addToast('Feedback deleted successfully.', 'success');
    } catch (err) {
      console.error('Error deleting feedback:', err);
      addToast('Failed to delete feedback.', 'error');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      addToast('Successfully signed out!', 'info');
    } catch (err) {
      console.error('Error logging out:', err);
      addToast('Failed to sign out. Try again.', 'error');
    }
  };

  const handleSaveSettings = async () => {
    if (!profile || !auth.currentUser) return;
    setIsSavingSettings(true);
    try {
      const { writeBatch } = await import('firebase/firestore');
      const userRef = doc(db, 'users', auth.currentUser.uid);
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
      batch.update(doc(db, 'users', auth.currentUser.uid, 'private', 'profile'), privateUpdates);

      await batch.commit();

      const mergedUpdates = {
        ...publicUpdates,
        ...privateUpdates
      };

      // Update local profile state
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
        }).catch(err => console.warn('[MobileProfile] Failed to update squad code doc:', err));
      }

      addToast('Profile updated successfully!', 'success');
      setIsEditModalOpen(false);
    } catch (err) {
      console.error('Error saving settings:', err);
      addToast('Failed to save settings. Try again.', 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const nameInitial = profile?.name ? profile.name.charAt(0).toUpperCase() : 'F';
  const email = profile?.email || auth.currentUser?.email || 'trainer@zenkai.com';

  return (
    <div className="flex flex-col gap-6 p-4 min-h-[100dvh] bg-[var(--bg-base)] text-[var(--text-primary)] pb-28">
      {/* ─── TITLE HEADER ────────────────────────────────────────────────── */}
      <div className="border-b-2 border-[var(--border)] pb-4 mt-2 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 border-2 border-black bg-[var(--surface)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] flex items-center justify-center rounded shadow-[2px_2px_0px_black] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight uppercase leading-none text-white font-barlow">
            Trainer Profile
          </h1>
          <p className="text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider mt-1">
            Your Strength Telemetry
          </p>
        </div>
      </div>

      {/* ─── USER CARD ───────────────────────────────────────────────────── */}
      <div className="border-2 border-black bg-[var(--surface)] p-5 rounded-lg shadow-[5px_5px_0px_rgba(0,0,0,1)] flex items-center gap-4">
        {/* Neubrutalist Avatar with Glowing Aura and Level Border */}
        <div 
          className="w-16 h-16 bg-[var(--primary)] text-black rounded flex items-center justify-center font-display font-black text-3xl shrink-0 overflow-hidden"
          style={getAvatarStyle(profile?.aura, level, profile?.powerUps)}
        >
          {profile?.avatarUrl ? (
            <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <span>{nameInitial}</span>
          )}
        </div>
        
        <div className="flex flex-col min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide truncate text-[var(--text-primary)] flex items-center gap-1.5 flex-wrap font-barlow">
            <span>{profile?.name || 'ZENKAI TRAINER'}</span>
            {profile?.activeTitle && (
              <span className="text-[9px] font-mono text-amber-400 border border-amber-500/30 bg-amber-950/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
                [{profile.activeTitle}]
              </span>
            )}
            {profile?.streak >= 7 && <span title="7+ Day Streak" className="text-sm">🔥</span>}
          </h2>
          <span className="text-xs text-[var(--text-secondary)] font-mono truncate">
            {email}
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="px-2 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider text-[var(--accent-xp)] border border-[var(--accent-xp)] bg-[#b5ff2d0e] rounded">
              Lvl {level}
            </span>
            <span className="text-[10px] font-sans font-semibold text-[var(--secondary)]">
              {levelName}
            </span>
          </div>
        </div>
      </div>

      {/* ─── QUICK METRICS GRID ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="border border-[var(--border-bright)] bg-[var(--surface)] p-2 rounded-lg shadow-[2px_2px_0px_rgba(0,0,0,1)] flex flex-col gap-0.5 items-center text-center">
          <span className="text-[8px] font-mono text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-0.5">
            <Flame size={10} className="text-[var(--primary)]" />
            STREAK
          </span>
          <span className="font-mono text-base font-bold text-white">
            {streak} <span className="text-[10px] text-[var(--text-secondary)] font-sans">days</span>
          </span>
        </div>
        <div className="border border-[var(--border-bright)] bg-[var(--surface)] p-2 rounded-lg shadow-[2px_2px_0px_rgba(0,0,0,1)] flex flex-col gap-0.5 items-center text-center">
          <span className="text-[8px] font-mono text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-0.5">
            <Trophy size={10} className="text-[var(--accent-xp)]" />
            BALANCE
          </span>
          <span className="font-mono text-base font-bold text-white">
            {xp} <span className="text-[10px] text-[var(--text-secondary)] font-sans">XP</span>
          </span>
        </div>
        <div className="border border-[var(--border-bright)] bg-[var(--surface)] p-2 rounded-lg shadow-[2px_2px_0px_rgba(0,0,0,1)] flex flex-col gap-0.5 items-center text-center">
          <span className="text-[8px] font-mono text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-0.5">
            <Award size={10} className="text-[#3b82f6]" />
            LIFETIME
          </span>
          <span className="font-mono text-base font-bold text-white">
            {totalXP} <span className="text-[10px] text-[var(--text-secondary)] font-sans">XP</span>
          </span>
        </div>
      </div>

      {/* ─── SETTINGS ACTIONS ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 mt-2">
        <h3 className="font-display text-lg font-bold uppercase tracking-wide text-[var(--text-primary)]">
          Application Settings
        </h3>

        {/* Install on Device (Only visible if not standalone) */}
        {!isStandalone && (
          <motion.button
            onClick={() => openModal('pwaInstall')}
            className="w-full p-4 border-2 border-black bg-[var(--surface)] hover:bg-[#1a1a1a] text-left rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-[0.99] transition-all flex items-center justify-between"
            whileTap={{ scale: 0.99 }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded bg-[#00d4ff0e] border border-[var(--secondary)] text-[var(--secondary)]">
                <Smartphone size={18} />
              </div>
              <div className="flex flex-col">
                <span className="font-display text-sm font-bold uppercase tracking-wide text-[var(--text-primary)]">
                  Install on Device
                </span>
                <span className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5">
                  Launch from home screen as native app
                </span>
              </div>
            </div>
            <Smartphone size={16} className="text-[var(--text-muted)]" />
          </motion.button>
        )}

        {/* Edit Equipment & Health Button */}
        <motion.button
          onClick={() => {
            setEditEquipment(profile?.equipmentList || []);
            setEditMedicalFlags(profile?.medicalFlags || []);
            setEditGymName(profile?.gymName || '');
            setEditDisableRestTimer(profile?.disableRestTimer || false);
            setIsEditModalOpen(true);
            setActiveSettingsTab('equipment');
          }}
          className="w-full p-4 border-2 border-black bg-[var(--surface)] hover:bg-[#1a1a1a] text-left rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-[0.99] transition-all flex items-center justify-between"
          whileTap={{ scale: 0.99 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-[#a78bfa0e] border border-[#a78bfa] text-[#a78bfa]">
              <User size={18} />
            </div>
            <div className="flex flex-col">
              <span className="font-display text-sm font-bold uppercase tracking-wide text-[var(--text-primary)]">
                Edit Equipment & Health
              </span>
              <span className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5">
                Update available equipment and health flags
              </span>
            </div>
          </div>
          <User size={16} className="text-[var(--text-muted)]" />
        </motion.button>

        {/* Weekly Recap Button */}
        {recap && (
          <motion.button
            onClick={() => setShowRecap(true)}
            className="w-full p-4 border-2 border-black bg-[var(--surface)] hover:bg-[#1a1a1a] text-left rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-[0.99] transition-all flex items-center justify-between"
            whileTap={{ scale: 0.99 }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded bg-[#b5ff2d0e] border border-[var(--accent-xp)] text-[var(--accent-xp)]">
                <Award size={18} />
              </div>
              <div className="flex flex-col">
                <span className="font-display text-sm font-bold uppercase tracking-wide text-[var(--text-primary)]">
                  Weekly Recap
                </span>
                <span className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5">
                  View your training summary and shareable card
                </span>
              </div>
            </div>
            <Award size={16} className="text-[var(--text-muted)]" />
          </motion.button>
        )}

        {/* Request a Feature / Feedback Button */}
        <motion.button
          onClick={() => setIsFeatureModalOpen(true)}
          className="w-full p-4 border-2 border-black bg-[var(--surface)] hover:bg-[#1a1a1a] text-left rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-[0.99] transition-all flex items-center justify-between"
          whileTap={{ scale: 0.99 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-[#00d4ff0e] border border-[var(--secondary)] text-[var(--secondary)]">
              <MessageSquare size={18} />
            </div>
            <div className="flex flex-col">
              <span className="font-display text-sm font-bold uppercase tracking-wide text-[var(--text-primary)]">
                Request a Feature / Feedback
              </span>
              <span className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5">
                Suggest new exercises, features, or submit feedback
              </span>
            </div>
          </div>
          <MessageSquare size={16} className="text-[var(--text-muted)]" />
        </motion.button>

        {/* Terms of Service Button */}
        <motion.button
          onClick={() => window.open('/terms', '_blank')}
          className="w-full p-4 border-2 border-black bg-[var(--surface)] hover:bg-[#1a1a1a] text-left rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-[0.99] transition-all flex items-center justify-between"
          whileTap={{ scale: 0.99 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-[#3b82f60e] border border-[#3b82f6] text-[#3b82f6]">
              <FileText size={18} />
            </div>
            <div className="flex flex-col">
              <span className="font-display text-sm font-bold uppercase tracking-wide text-[var(--text-primary)]">
                Terms of Service
              </span>
              <span className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5">
                Read our rules and fitness liability disclaimers
              </span>
            </div>
          </div>
          <FileText size={16} className="text-[var(--text-muted)]" />
        </motion.button>

        {/* Privacy Policy Button */}
        <motion.button
          onClick={() => window.open('/privacy', '_blank')}
          className="w-full p-4 border-2 border-black bg-[var(--surface)] hover:bg-[#1a1a1a] text-left rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-[0.99] transition-all flex items-center justify-between"
          whileTap={{ scale: 0.99 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-[#10b9810e] border border-[#10b981] text-[#10b981]">
              <Shield size={18} />
            </div>
            <div className="flex flex-col">
              <span className="font-display text-sm font-bold uppercase tracking-wide text-[var(--text-primary)]">
                Privacy Policy
              </span>
              <span className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5">
                Understand how we protect and manage your data
              </span>
            </div>
          </div>
          <Shield size={16} className="text-[var(--text-muted)]" />
        </motion.button>

        {/* Sign Out Button */}
        <motion.button
          onClick={handleLogout}
          className="w-full p-4 border-2 border-black bg-[var(--surface)] hover:bg-[#1a1a1a] text-left rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-[0.99] transition-all flex items-center justify-between"
          whileTap={{ scale: 0.99 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-[#ef44440e] border border-[#ef4444] text-[#ef4444]">
              <LogOut size={18} />
            </div>
            <div className="flex flex-col">
              <span className="font-display text-sm font-bold uppercase tracking-wide text-[var(--text-primary)]">
                Sign Out
              </span>
              <span className="text-[10px] text-[var(--text-secondary)] font-sans mt-0.5">
                Log out of your Zenkai session
              </span>
            </div>
          </div>
          <LogOut size={16} className="text-[var(--text-muted)]" />
        </motion.button>
      </div>

      {/* ─── DANGER ZONE ────────────────────────────────────────────────── */}
      <div className="border-2 border-red-600 bg-[#1f1212] p-5 rounded-lg shadow-[5px_5px_0px_rgba(220,38,38,0.3)] flex flex-col gap-4">
        <div className="flex items-center gap-3 border-b border-red-950 pb-2">
          <Trash2 className="text-red-500 shrink-0" size={20} />
          <div className="flex flex-col">
            <span className="font-display text-sm font-black uppercase tracking-wide text-red-500">
              Danger Zone
            </span>
            <span className="text-[10px] text-neutral-400 font-sans mt-0.5">
              Irreversible account operations
            </span>
          </div>
        </div>
        <p className="text-[11px] text-neutral-300 font-sans leading-relaxed">
          Wipe all your local and remote progress, including workout history, weekly plans, physical measurements, XP, streaks, and PR telemetry logs.
        </p>
        <motion.button
          onClick={() => {
            setShowResetModal(true);
            setResetStep(1);
            setConfirmInputText('');
            setUnderstandCheckbox(false);
          }}
          className="w-full py-3 border-2 border-black bg-red-600 hover:bg-red-700 text-white font-display font-extrabold tracking-widest text-xs uppercase rounded shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer font-bold"
          whileTap={{ scale: 0.98 }}
        >
          <Trash2 size={14} />
          <span>Reset Account Data</span>
        </motion.button>
      </div>

      {/* ─── LOCAL GYM LEADERBOARD ───────────────────────────────────────── */}
      {profile?.gymId ? (
        <div className="mt-4">
          <GymLeaderboard gymId={profile.gymId} gymName={profile.gymName} />
        </div>
      ) : (
        <div className="border-2 border-black border-dashed bg-[var(--surface)] p-5 rounded-lg flex flex-col items-center text-center gap-3 mt-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <Trophy className="w-10 h-10 text-[var(--text-muted)] stroke-[1.5]" />
          <h4 className="font-display text-base font-bold uppercase text-white tracking-wide">
            Local Leaderboard Locked
          </h4>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-xs">
            Tag your home gym in your profile settings to unlock local lifter leaderboard competitions!
          </p>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              setEditEquipment(profile?.equipmentList || []);
              setEditMedicalFlags(profile?.medicalFlags || []);
              setEditGymName(profile?.gymName || '');
              setEditDisableRestTimer(profile?.disableRestTimer || false);
              setIsEditModalOpen(true);
              setActiveSettingsTab('gym');
            }}
            className="px-4 py-2 border-2 border-black bg-[var(--secondary)] text-black font-display font-extrabold text-xs uppercase tracking-wider rounded shadow-[3px_3px_0px_rgba(0,0,0,1)] active:scale-95 transition-all cursor-pointer"
          >
            Tag Home Gym Now
          </motion.button>
        </div>
      )}

      {/* Weekly Recap Modal */}
      {recap && (
        <WeeklyRecapScreen
          isOpen={showRecap}
          onClose={() => setShowRecap(false)}
          recap={recap}
          weekId={recapWeekId}
          markAsSeen={() => {}}
        />
      )}

      {/* ─── EDIT EQUIPMENT & HEALTH MODAL ────────────────────────────── */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 bg-black/85 z-[100] flex items-center justify-center p-4 backdrop-blur-xs">
            {/* Backdrop Close */}
            <div className="absolute inset-0 cursor-pointer" onClick={() => setIsEditModalOpen(false)} />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-[#111111] border-2 border-black rounded-lg p-5 w-full max-w-md max-h-[85vh] overflow-hidden shadow-[8px_8px_0px_rgba(0,0,0,1)] relative flex flex-col gap-4 text-white z-10"
            >
              {/* Close Button */}
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-4 right-4 text-xs text-[var(--text-secondary)] hover:text-white transition-all bg-transparent border-none cursor-pointer"
              >
                <X size={20} />
              </button>

              {/* Modal Header */}
              <div className="flex items-center gap-3 border-b-2 border-[#222222] pb-3">
                <div className="p-2 rounded bg-[#a78bfa0e] border border-[#a78bfa] text-[#a78bfa] shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                  <User size={20} />
                </div>
                <div className="flex flex-col">
                  <span className="font-display font-extrabold text-lg uppercase tracking-wide leading-none">
                    Edit Setup
                  </span>
                  <span className="text-[10px] font-mono text-[var(--secondary)] uppercase tracking-wider mt-1">
                    Equipment & Restrictions
                  </span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-2 border-black rounded overflow-hidden shrink-0">
                <button
                  onClick={() => setActiveSettingsTab('equipment')}
                  className={`flex-1 py-2 font-display text-xs font-bold uppercase tracking-wider transition-all ${
                    activeSettingsTab === 'equipment'
                      ? 'bg-[var(--primary)] text-black font-black'
                      : 'bg-[var(--surface)] text-[var(--text-secondary)]'
                  }`}
                >
                  Equipment
                </button>
                <button
                  onClick={() => setActiveSettingsTab('health')}
                  className={`flex-1 py-2 font-display text-xs font-bold uppercase tracking-wider transition-all ${
                    activeSettingsTab === 'health'
                      ? 'bg-[#ef4444] text-black font-black'
                      : 'bg-[var(--surface)] text-[var(--text-secondary)]'
                  }`}
                >
                  Health
                </button>
                <button
                  onClick={() => setActiveSettingsTab('gym')}
                  className={`flex-1 py-2 font-display text-xs font-bold uppercase tracking-wider transition-all ${
                    activeSettingsTab === 'gym'
                      ? 'bg-[var(--secondary)] text-black font-black'
                      : 'bg-[var(--surface)] text-[var(--text-secondary)]'
                  }`}
                >
                  Gym & App
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4 font-sans text-sm scrollbar-none my-2">
                {activeSettingsTab === 'gym' ? (
                  <div className="flex flex-col gap-4">
                    {/* Home Gym Tagging */}
                    <div className="border-2 border-black bg-[#161616] p-4 rounded flex flex-col gap-3 shadow-[2px_2px_0px_rgba(0,0,0,0.5)]">
                      <span className="text-xs font-bold text-white uppercase tracking-wider font-display border-b border-[#222] pb-1">
                        Home Gym Tagging
                      </span>
                      <p className="text-[10px] text-[var(--text-secondary)] font-sans leading-relaxed">
                        Tag your local branch to unlock localized leaderboard competitions with other local lifters.
                      </p>
                      <div className="flex flex-col gap-1 mt-2">
                        <label className="text-[10px] font-mono text-[var(--secondary)] uppercase tracking-wider">
                          Gym Name
                        </label>
                        <input
                          type="text"
                          value={editGymName}
                          onChange={(e) => setEditGymName(e.target.value)}
                          placeholder="e.g. Gold's Gym Koramangala"
                          className="w-full bg-[#1a1a1a] text-white text-xs p-3 rounded border border-[#2c2c2c] focus:outline-none focus:border-[var(--primary)] font-sans mt-1"
                        />
                      </div>
                      {editGymName.trim() && (
                        <div className="mt-1 bg-black/40 border border-[#222] p-2.5 rounded text-[10px] font-mono text-[var(--text-secondary)]">
                          COMPUTED ID: <span className="text-[var(--primary)] font-bold">{editGymName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_+|_+$)/g, '')}</span>
                        </div>
                      )}
                    </div>

                    {/* App Preferences */}
                    <div className="border-2 border-black bg-[#161616] p-4 rounded flex flex-col gap-3 shadow-[2px_2px_0px_rgba(0,0,0,0.5)]">
                      <span className="text-xs font-bold text-white uppercase tracking-wider font-display border-b border-[#222] pb-1">
                        App Preferences
                      </span>
                      <p className="text-[10px] text-[var(--text-secondary)] font-sans leading-relaxed">
                        Customize your workout logger experience.
                      </p>
                      <button
                        type="button"
                        onClick={() => setEditDisableRestTimer(prev => !prev)}
                        className="flex items-center justify-between text-left mt-2 min-h-[44px] w-full focus:outline-none"
                      >
                        <div className="flex flex-col pr-2">
                          <span className="text-xs font-bold text-white">Disable Rest Timer</span>
                          <span className="text-[9px] text-[var(--text-secondary)] mt-0.5">
                            Do not start a countdown when marking a set as done.
                          </span>
                        </div>
                        <div
                          className={`w-11 h-6 rounded-full p-1 transition-colors duration-200 border border-[var(--border-bright)] shrink-0 ${
                            editDisableRestTimer ? 'bg-[var(--secondary)] text-black' : 'bg-[#1a1a1a]'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                              editDisableRestTimer ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </div>
                      </button>
                    </div>
                  </div>
                ) : activeSettingsTab === 'equipment' ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center bg-[#1a1a1a] p-2.5 rounded border border-[#222222]">
                      <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase">Quick Actions</span>
                      <button
                        onClick={() => {
                          const allItems = EQUIPMENT_CATEGORIES.flatMap(cat => cat.items);
                          setEditEquipment(all => all.length === allItems.length ? [] : allItems);
                        }}
                        className="px-3 py-1 text-[10px] font-display uppercase font-bold border-2 border-black bg-[var(--secondary)] text-black rounded shadow-[2px_2px_0px_rgba(0,0,0,1)] active:scale-95 transition-all"
                      >
                        {editEquipment.length === EQUIPMENT_CATEGORIES.flatMap(cat => cat.items).length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    
                    {EQUIPMENT_CATEGORIES.map((cat) => (
                      <div key={cat.label} className="border-2 border-black bg-[#161616] p-3 rounded flex flex-col gap-2 shadow-[2px_2px_0px_rgba(0,0,0,0.5)]">
                        <span className="text-[11px] font-bold text-white uppercase tracking-wider font-display border-b border-[#222] pb-1">
                          {cat.label}
                        </span>
                        <div className="grid grid-cols-2 gap-2 mt-1">
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
                                className={`px-2 py-1.5 rounded text-[10px] font-sans font-bold border text-left flex items-center justify-between transition-all ${
                                  isSelected
                                    ? 'bg-[#b5ff2d1c] text-[var(--accent-xp)] border-[var(--accent-xp)]'
                                    : 'bg-[#1a1a1a] text-[var(--text-secondary)] border-[#2c2c2c] hover:border-[#444]'
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
                ) : (
                  <div className="flex flex-col gap-4">
                    {MEDICAL_CATEGORIES.map((cat) => (
                      <div key={cat.label} className="border-2 border-black bg-[#161616] p-3 rounded flex flex-col gap-2 shadow-[2px_2px_0px_rgba(0,0,0,0.5)]">
                        <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider font-display border-b border-[#222] pb-1">
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
                                className={`p-2 rounded text-left border flex items-start justify-between gap-3 transition-all ${
                                  isSelected
                                    ? 'bg-[#ef444413] text-red-400 border-red-500'
                                    : 'bg-[#1a1a1a] text-[var(--text-secondary)] border-[#2c2c2c] hover:border-[#444]'
                                }`}
                              >
                                <div className="flex flex-col min-w-0">
                                  <span className={`text-[11px] font-bold ${isSelected ? 'text-red-400' : 'text-white'}`}>
                                    {flag.key}
                                  </span>
                                  <span className="text-[9px] text-[var(--text-muted)] mt-0.5 leading-tight font-normal">
                                    {flag.desc}
                                  </span>
                                </div>
                                {isSelected && <Check size={12} className="shrink-0 text-red-500 mt-0.5" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex gap-3 mt-1 pt-3 border-t border-[#222] shrink-0">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-2.5 bg-transparent text-[var(--text-secondary)] hover:text-white border-2 border-[#222222] rounded text-xs font-mono font-bold tracking-wider hover:border-[#333333] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSettings}
                  disabled={isSavingSettings}
                  className="flex-1 py-2.5 bg-[var(--primary)] text-black font-display font-extrabold tracking-widest text-xs uppercase rounded border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  {isSavingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── REQUEST A FEATURE / FEEDBACK MODAL ────────────────────────────── */}
      {/* ─── REQUEST A FEATURE / FEEDBACK MODAL ────────────────────────────── */}
      <AnimatePresence>
        {isFeatureModalOpen && (
          <div className="fixed inset-0 bg-black/85 z-[100] flex items-center justify-center p-4 backdrop-blur-xs">
            {/* Backdrop Close */}
            <div className="absolute inset-0 cursor-pointer" onClick={() => setIsFeatureModalOpen(false)} />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-[#111111] border-2 border-black rounded-lg p-5 w-full max-w-lg h-[80vh] overflow-hidden shadow-[8px_8px_0px_rgba(0,0,0,1)] relative flex flex-col gap-4 text-white z-10"
            >
              {/* Close Button */}
              <button
                onClick={() => setIsFeatureModalOpen(false)}
                className="absolute top-4 right-4 text-xs text-[var(--text-secondary)] hover:text-white transition-all bg-transparent border-none cursor-pointer"
              >
                <X size={20} />
              </button>

              {/* Modal Header */}
              <div className="flex items-center gap-3 border-b-2 border-[#222222] pb-3 shrink-0">
                {isAddingFeedback ? (
                  <button
                    onClick={() => setIsAddingFeedback(false)}
                    className="p-1.5 rounded bg-[#1a1a1a] border border-[#2c2c2c] text-[var(--text-secondary)] hover:text-white cursor-pointer"
                  >
                    <ArrowLeft size={16} />
                  </button>
                ) : (
                  <div className="p-2 rounded bg-[#00d4ff0e] border border-[var(--secondary)] text-[var(--secondary)] shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                    <MessageSquare size={20} />
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="font-display font-extrabold text-lg uppercase tracking-wide leading-none">
                    {isAddingFeedback ? 'Add Suggestion' : 'Feedback Board'}
                  </span>
                  <span className="text-[10px] font-mono text-[var(--secondary)] uppercase tracking-wider mt-1">
                    {isAddingFeedback ? 'Submit a new feature or bug' : 'What the community wants'}
                  </span>
                </div>
                {!isAddingFeedback && (
                  <button
                    onClick={() => setIsAddingFeedback(true)}
                    className="ml-auto px-2.5 py-1.5 bg-[var(--secondary)] text-black font-display font-extrabold text-[10px] uppercase tracking-wider rounded border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={12} /> Add
                  </button>
                )}
              </div>

              {isAddingFeedback ? (
                /* ─── ADD SUGGESTION FORM VIEW ─── */
                <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4 font-sans text-sm scrollbar-none my-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono text-[var(--secondary)] uppercase tracking-wider">
                      Suggestion Title
                    </label>
                    <input
                      type="text"
                      value={feedbackTitle}
                      onChange={(e) => setFeedbackTitle(e.target.value)}
                      placeholder="e.g. Add Calf Raise exercises"
                      maxLength={80}
                      className="w-full bg-[#1a1a1a] text-white text-xs p-3 rounded border border-[#2c2c2c] focus:outline-none focus:border-[var(--secondary)] font-sans mt-1"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono text-[var(--secondary)] uppercase tracking-wider">
                      Feedback Category
                    </label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {['Suggest an Exercise', 'Feature Request', 'Bug Report', 'Other'].map((type) => {
                        const isSelected = feedbackType === type;
                        return (
                          <button
                            key={type}
                            onClick={() => setFeedbackType(type)}
                            className={`px-2 py-2 rounded text-[10px] font-sans font-bold border text-left flex items-center justify-between transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#00d4ff1c] text-[var(--secondary)] border-[var(--secondary)]'
                                : 'bg-[#1a1a1a] text-[var(--text-secondary)] border-[#2c2c2c] hover:border-[#444]'
                            }`}
                          >
                            <span>{type}</span>
                            {isSelected && <Check size={10} className="shrink-0 text-[var(--secondary)]" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 mt-2">
                    <label className="text-[10px] font-mono text-[var(--secondary)] uppercase tracking-wider">
                      Detailed Explanation
                    </label>
                    <textarea
                      rows={5}
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Describe your request, problem, or suggestion in detail..."
                      className="w-full bg-[#1a1a1a] text-white text-xs p-3 rounded border border-[#2c2c2c] focus:outline-none focus:border-[var(--secondary)] font-sans mt-1 resize-none"
                    />
                  </div>

                  {/* Screenshot Upload Section */}
                  <div className="flex flex-col gap-1.5 mt-1">
                    <label className="text-[10px] font-mono text-[var(--secondary)] uppercase tracking-wider">
                      Attach Screenshot (Optional)
                    </label>
                    
                    {feedbackScreenshot ? (
                      <div className="relative w-24 h-24 border-2 border-black rounded overflow-hidden shadow-[2px_2px_0px_rgba(0,0,0,1)] group mt-1">
                        <img src={`data:image/jpeg;base64,${feedbackScreenshot}`} alt="Feedback Screenshot" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setFeedbackScreenshot(null)}
                          className="absolute top-1 right-1 p-1 bg-black/80 hover:bg-black text-white rounded-full border border-[#333] transition-all cursor-pointer flex items-center justify-center"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ) : (
                      <div className="mt-1">
                        {isCompressingScreenshot ? (
                          <div className="w-full py-2 border-2 border-black bg-[#1a1a1a] text-[var(--text-secondary)] font-mono text-xs uppercase tracking-wider text-center flex justify-center items-center gap-2 cursor-not-allowed opacity-75">
                            <span className="h-3 w-3 border-2 border-[var(--secondary)] border-t-transparent rounded-full animate-spin" />
                            <span>Compressing Image...</span>
                          </div>
                        ) : (
                          <>
                            <label
                              htmlFor="feedback-screenshot"
                              className="w-full py-2 border-2 border-black bg-[#1c1c1c] hover:bg-[#2c2c2c] text-[var(--text-secondary)] hover:text-white font-mono text-xs uppercase tracking-wider shadow-[3px_3px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-center flex justify-center items-center gap-2 cursor-pointer"
                            >
                              <Camera size={14} />
                              <span>Choose Screenshot</span>
                            </label>
                            <input
                              type="file"
                              accept="image/*"
                              id="feedback-screenshot"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setIsCompressingScreenshot(true);
                                try {
                                  const cleanBase64 = await compressGymImage(file, 1024, 0.7);
                                  setFeedbackScreenshot(cleanBase64);
                                } catch (err) {
                                  console.error("Error compressing screenshot:", err);
                                  addToast("Failed to process image.", "error");
                                } finally {
                                  setIsCompressingScreenshot(false);
                                }
                              }}
                            />
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Form Footer */}
                  <div className="flex gap-3 mt-auto pt-3 border-t border-[#222] shrink-0">
                    <button
                      onClick={() => setIsAddingFeedback(false)}
                      className="flex-1 py-2 bg-transparent text-[var(--text-secondary)] hover:text-white border-2 border-[#222222] rounded text-xs font-mono font-bold tracking-wider hover:border-[#333333] transition-all cursor-pointer"
                    >
                      Back to Board
                    </button>
                    <button
                      onClick={handleSubmitFeedback}
                      disabled={isSubmittingFeedback}
                      className="flex-1 py-2 bg-[var(--secondary)] text-black font-display font-extrabold tracking-widest text-xs uppercase rounded border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isSubmittingFeedback ? 'Submitting...' : 'Submit'}
                    </button>
                  </div>
                </div>
              ) : (
                /* ─── FEEDBACK LIST VIEW ─── */
                <div className="flex-1 flex flex-col gap-3 min-h-0">
                  {/* Filters and Sorting */}
                  <div className="flex flex-col gap-2 shrink-0 bg-[#151515] p-2.5 rounded border border-[#222]">
                    {/* Status Filter Chips */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                      {['All', 'Future Plans', 'In Progress', 'Done'].map((status) => {
                        const isSelected = filterStatus === status;
                        return (
                          <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-2.5 py-1 rounded-full text-[9px] font-mono font-bold border transition-all cursor-pointer whitespace-nowrap ${
                              isSelected
                                ? 'bg-[var(--secondary)] text-black border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]'
                                : 'bg-[#1a1a1a] text-[var(--text-secondary)] border-[#2c2c2c] hover:border-[#444]'
                            }`}
                          >
                            {status}
                          </button>
                        );
                      })}
                    </div>

                    {/* Sorting selector */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-secondary)] mt-1">
                      <span>Sort By</span>
                      <div className="flex gap-2">
                        {['Most Liked', 'Recent'].map((opt) => {
                          const isSel = sortBy === opt;
                          return (
                            <button
                              key={opt}
                              onClick={() => setSortBy(opt)}
                              className={`bg-transparent border-none font-bold cursor-pointer transition-all ${
                                isSel ? 'text-[var(--secondary)] underline' : 'text-[var(--text-secondary)] hover:text-white'
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Scrollable list of cards */}
                  <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 scrollbar-none">
                    {feedbackList.length === 0 ? (
                      <div className="text-center py-8 text-[var(--text-secondary)] font-sans text-xs">
                        No feedback items found. Be the first to suggest something! 🚀
                      </div>
                    ) : (
                      (() => {
                        // Filter & Sort logic
                        const filtered = feedbackList.filter(item => {
                          if (filterStatus === 'All') return true;
                          return item.status === filterStatus;
                        });

                        const sorted = [...filtered].sort((a, b) => {
                          if (sortBy === 'Recent') {
                            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
                          } else {
                            // Most Liked (score = upvotes - downvotes)
                            const scoreA = (a.upvotes || []).length - (a.downvotes || []).length;
                            const scoreB = (b.upvotes || []).length - (b.downvotes || []).length;
                            if (scoreA !== scoreB) return scoreB - scoreA;
                            // Fallback to date if score matches
                            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
                          }
                        });

                        if (sorted.length === 0) {
                          return (
                            <div className="text-center py-8 text-[var(--text-secondary)] font-mono text-xs uppercase">
                              No {filterStatus} items yet
                            </div>
                          );
                        }

                        return sorted.map((item) => {
                          const isExpanded = expandedFeedbackId === item.id;
                          const upvotes = item.upvotes || [];
                          const downvotes = item.downvotes || [];
                          const netScore = upvotes.length - downvotes.length;
                          const hasUpvoted = upvotes.includes(uid);
                          const hasDownvoted = downvotes.includes(uid);

                          return (
                            <div
                              key={item.id}
                              className="bg-[#181818] border-2 border-black rounded p-3 flex flex-col gap-2"
                              style={{
                                boxShadow: isExpanded ? 'none' : '4px 4px 0px rgba(0,0,0,1)',
                                transform: isExpanded ? 'translate(2px, 2px)' : 'none',
                                transition: 'all 0.15s ease-out'
                              }}
                            >
                              {/* Top Bar: Category & Status Badges */}
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-[#2c2c2c] border border-[#3c3c3c] text-slate-300 font-bold">
                                  {item.category}
                                </span>

                                <span
                                  className={`text-[8px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-wide font-extrabold ${
                                    item.status === 'Done'
                                      ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900'
                                      : item.status === 'In Progress'
                                      ? 'bg-amber-950/20 text-amber-400 border-amber-900'
                                      : 'bg-purple-950/20 text-purple-400 border-purple-900'
                                  }`}
                                >
                                  {item.status}
                                </span>
                              </div>

                              {/* Title (Clickable to expand) */}
                              <div className="flex items-start justify-between gap-3 mt-1">
                                <div
                                  onClick={() => setExpandedFeedbackId(isExpanded ? null : item.id)}
                                  className="font-display font-extrabold text-sm uppercase tracking-wide hover:text-[var(--secondary)] transition-all cursor-pointer flex-1 text-white leading-tight mt-0.5"
                                >
                                  {item.title}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {item.screenshot && !isExpanded && (
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveScreenshotViewer(`data:image/jpeg;base64,${item.screenshot}`);
                                      }}
                                      className="w-10 h-10 border border-black rounded overflow-hidden shadow-[1px_1px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 cursor-pointer transition-all shrink-0"
                                    >
                                      <img
                                        src={`data:image/jpeg;base64,${item.screenshot}`}
                                        alt="Screenshot thumbnail"
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  )}
                                  <button
                                    onClick={() => setExpandedFeedbackId(isExpanded ? null : item.id)}
                                    className="text-[var(--text-secondary)] hover:text-white bg-transparent border-none cursor-pointer p-0"
                                  >
                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                  </button>
                                </div>
                              </div>

                              {/* Expandable Explanation Area */}
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="text-xs text-[var(--text-secondary)] font-sans py-2 border-t border-[#2a2a2a] mt-1 leading-relaxed whitespace-pre-wrap flex flex-col gap-2.5">
                                      <span>{item.description}</span>
                                      {item.screenshot && (
                                        <div className="mt-1 flex">
                                          <div
                                            onClick={() => setActiveScreenshotViewer(`data:image/jpeg;base64,${item.screenshot}`)}
                                            className="relative w-20 h-20 border-2 border-black rounded overflow-hidden shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 cursor-pointer transition-all shrink-0"
                                          >
                                            <img
                                              src={`data:image/jpeg;base64,${item.screenshot}`}
                                              alt="Screenshot preview"
                                              className="w-full h-full object-cover"
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 pt-2 border-t border-[#222]">
                                      <span>By {item.userName}</span>
                                      <span>{new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                    </div>

                                    {/* Admin Controls Section */}
                                    {profile?.isAdmin === true && (
                                      <div className="bg-[#222] border-2 border-black rounded p-2 mt-3 flex flex-col gap-1.5 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                                        <span className="text-[8px] font-mono text-[var(--secondary)] uppercase tracking-wider font-extrabold">
                                          Admin Control Center
                                        </span>
                                        <div className="flex items-center justify-between gap-2 mt-1">
                                          {/* Status Selector */}
                                          <div className="flex gap-1">
                                            {['Future Plans', 'In Progress', 'Done'].map((st) => (
                                              <button
                                                key={st}
                                                onClick={() => handleUpdateStatus(item.id, st)}
                                                className={`px-1.5 py-1 rounded text-[8px] font-sans font-bold border cursor-pointer ${
                                                  item.status === st
                                                    ? 'bg-[var(--secondary)] text-black border-black'
                                                    : 'bg-[#1a1a1a] text-white border-[#333] hover:border-[#555]'
                                                }`}
                                              >
                                                {st === 'Future Plans' ? 'Future' : st === 'In Progress' ? 'Progress' : 'Done'}
                                              </button>
                                            ))}
                                          </div>
                                          {/* Delete Trash Button */}
                                          <button
                                            onClick={() => handleDeleteFeedback(item.id)}
                                            className="p-1 text-red-500 hover:text-red-400 bg-transparent border-none cursor-pointer"
                                            title="Delete suggestion permanently"
                                          >
                                            <Trash2 size={16} />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              {/* Vote and Action Row */}
                              <div className="flex items-center justify-between border-t border-[#222] pt-2 mt-1 shrink-0">
                                <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                                  Score:{' '}
                                  <strong className={netScore > 0 ? 'text-green-500' : netScore < 0 ? 'text-red-500' : 'text-white'}>
                                    {netScore > 0 ? `+${netScore}` : netScore}
                                  </strong>
                                </span>

                                <div className="flex items-center gap-1.5">
                                  {/* Upvote */}
                                  <button
                                    onClick={() => handleVote(item.id, 'up')}
                                    className={`flex items-center gap-1 px-2.5 py-1 rounded border-2 font-mono text-[10px] font-extrabold transition-all cursor-pointer ${
                                      hasUpvoted
                                        ? 'bg-emerald-950 text-emerald-400 border-emerald-500 shadow-[2px_2px_0px_rgba(0,0,0,1)]'
                                        : 'bg-[#1e1e1e] text-[var(--text-secondary)] border-[#2c2c2c] hover:border-[#444]'
                                    }`}
                                  >
                                    <ThumbsUp size={11} />
                                    <span>{upvotes.length}</span>
                                  </button>

                                  {/* Downvote */}
                                  <button
                                    onClick={() => handleVote(item.id, 'down')}
                                    className={`flex items-center gap-1 px-2.5 py-1 rounded border-2 font-mono text-[10px] font-extrabold transition-all cursor-pointer ${
                                      hasDownvoted
                                        ? 'bg-rose-950 text-rose-400 border-rose-500 shadow-[2px_2px_0px_rgba(0,0,0,1)]'
                                        : 'bg-[#1e1e1e] text-[var(--text-secondary)] border-[#2c2c2c] hover:border-[#444]'
                                    }`}
                                  >
                                    <ThumbsDown size={11} />
                                    <span>{downvotes.length}</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
              className="bg-[#111111] border-2 border-red-600 rounded-lg p-5 w-full max-w-md shadow-[8px_8px_0px_rgba(220,38,38,0.3)] relative flex flex-col gap-4 text-white z-10 text-left"
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
                  <Smartphone size={20} />
                </div>
                <div className="flex flex-col">
                  <span className="font-display font-extrabold text-lg uppercase tracking-wide leading-none text-red-500">
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
                      Type <span className="font-bold text-red-500">RESET</span> to confirm:
                    </label>
                    <input
                      type="text"
                      value={confirmInputText}
                      onChange={(e) => setConfirmInputText(e.target.value)}
                      placeholder="RESET"
                      className="w-full bg-[#1e1e1e] border-2 border-black p-2 rounded text-white font-mono text-sm focus:outline-none focus:border-red-500 shadow-[2px_2px_0px_rgba(0,0,0,1)]"
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

      {/* Fullscreen Screenshot Viewer Overlay */}
      <AnimatePresence>
        {activeScreenshotViewer && (
          <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-4 backdrop-blur-xs">
            {/* Backdrop Close */}
            <div className="absolute inset-0 cursor-pointer" onClick={() => setActiveScreenshotViewer(null)} />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative max-w-full max-h-full flex flex-col items-center justify-center z-10"
            >
              {/* Close Button */}
              <button
                onClick={() => setActiveScreenshotViewer(null)}
                className="absolute -top-12 right-2 px-3 py-1.5 bg-[var(--surface)] border-2 border-black rounded-full text-white font-mono font-bold text-xs uppercase tracking-wider shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all flex items-center gap-1 cursor-pointer"
              >
                <X size={16} /> Close
              </button>
              
              <img
                src={activeScreenshotViewer}
                alt="Fullscreen screenshot"
                className="max-w-full max-h-[80vh] object-contain border-4 border-black rounded shadow-[8px_8px_0px_rgba(0,0,0,1)] bg-neutral-900"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── SYSTEM INFO & WHAT'S NEW ───────────────────────────────────── */}
      <div className="flex flex-col gap-4 mt-auto">

        {/* Push Notification Toggle */}
        <PushNotificationToggle />
        <div className="border-2 border-black bg-[var(--surface)] p-4 rounded-xl shadow-[4px_4px_0px_rgba(0,0,0,1)] text-left flex flex-col gap-3">
          <div className="flex items-center gap-2 border-b border-[#222] pb-2">
            <Sparkles size={16} className="text-[var(--primary)]" />
            <span className="font-display text-sm font-black uppercase tracking-wide text-white">
              What's New in Zenkai
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {/* v1.1.1 Accordion */}
            <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg-elevated)]">
              <button 
                onClick={() => setExpandedVersion(expandedVersion === '1.1.1' ? null : '1.1.1')}
                className="w-full flex items-center justify-between px-3 py-2 bg-black/25 font-display text-[10px] font-black uppercase text-white hover:bg-black/40 transition-all text-left"
              >
                <div className="flex items-center gap-1.5">
                  <span className="bg-[var(--primary)] text-black px-1 py-0.2 rounded text-[7px] font-mono font-bold">LATEST</span>
                  <span>v1.1.1 — Database Optimizations</span>
                </div>
                <span className="text-neutral-500">
                  {expandedVersion === '1.1.1' ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                </span>
              </button>
              
              {expandedVersion === '1.1.1' && (
                <div className="p-3 border-t border-[var(--border)] bg-black/10">
                  <ul className="text-[9px] text-neutral-300 font-sans list-disc pl-4 space-y-1.5 leading-relaxed">
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
            <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg-elevated)]">
              <button 
                onClick={() => setExpandedVersion(expandedVersion === '1.1.0' ? null : '1.1.0')}
                className="w-full flex items-center justify-between px-3 py-2 bg-black/25 font-display text-[10px] font-black uppercase text-white hover:bg-black/40 transition-all text-left"
              >
                <span>v1.1.0 — UI Reminders & Dialogs</span>
                <span className="text-neutral-500">
                  {expandedVersion === '1.1.0' ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                </span>
              </button>
              
              {expandedVersion === '1.1.0' && (
                <div className="p-3 border-t border-[var(--border)] bg-black/10">
                  <ul className="text-[9px] text-neutral-300 font-sans list-disc pl-4 space-y-1.5 leading-relaxed">
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

        <div className="border-2 border-[var(--border)] bg-[var(--bg-elevated)] p-4 rounded-lg flex items-start gap-3">
          <Info size={18} className="text-[var(--text-secondary)] shrink-0 mt-0.5" />
          <div className="flex flex-col text-left">
            <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--text-primary)]">
              Zenkai Mobile v1.1.1
            </span>
            <p className="text-[9px] text-[var(--text-secondary)] font-sans leading-relaxed mt-0.5">
              Designed for Indian athletes. Standard Neubrutalist Telemetry Shell. Offline synchronization enabled via local caching.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileProfile;
