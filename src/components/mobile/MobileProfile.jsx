import React, { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useXPStore } from '../../stores/useXPStore';
import { useUIStore } from '../../stores/useUIStore';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { Smartphone, LogOut, Info, User, Flame, Trophy, Award } from 'lucide-react';
import { motion } from 'framer-motion';
import { useWeeklyRecap } from '../../hooks/useWeeklyRecap';
import { WeeklyRecapScreen } from '../shared/WeeklyRecapScreen';

export const MobileProfile = () => {
  const { profile } = useAuthStore();
  const { totalXP, level, levelName, streak } = useXPStore();
  const { isStandalone, openModal, addToast } = useUIStore();

  const { recap, weekId: recapWeekId } = useWeeklyRecap();
  const [showRecap, setShowRecap] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      addToast('Successfully signed out!', 'info');
    } catch (err) {
      console.error('Error logging out:', err);
      addToast('Failed to sign out. Try again.', 'error');
    }
  };

  const nameInitial = profile?.name ? profile.name.charAt(0).toUpperCase() : 'F';
  const email = profile?.email || auth.currentUser?.email || 'trainer@fitdesi.com';

  return (
    <div className="flex flex-col gap-6 p-4 min-h-[100dvh] bg-[var(--bg-base)] text-[var(--text-primary)] pb-28">
      {/* ─── TITLE HEADER ────────────────────────────────────────────────── */}
      <div className="border-b-2 border-[var(--border)] pb-4 mt-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight uppercase leading-none">
          Trainer Profile
        </h1>
        <p className="text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider mt-1">
          Your Strength Telemetry
        </p>
      </div>

      {/* ─── USER CARD ───────────────────────────────────────────────────── */}
      <div className="border-2 border-black bg-[var(--surface)] p-5 rounded-lg shadow-[5px_5px_0px_rgba(0,0,0,1)] flex items-center gap-4">
        {/* Neubrutalist Avatar */}
        <div className="w-16 h-16 bg-[var(--primary)] text-black border-2 border-black rounded shadow-[3px_3px_0px_rgba(0,0,0,1)] flex items-center justify-center font-display font-black text-3xl shrink-0">
          {nameInitial}
        </div>
        
        <div className="flex flex-col min-w-0">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide truncate text-[var(--text-primary)]">
            {profile?.name || 'FITDESI TRAINER'}
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
      <div className="grid grid-cols-2 gap-3">
        <div className="border-2 border-[var(--border-bright)] bg-[var(--surface)] p-3 rounded-lg shadow-[3px_3px_0px_rgba(0,0,0,1)] flex flex-col gap-1">
          <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1">
            <Flame size={12} className="text-[var(--primary)]" />
            STREAK
          </span>
          <span className="font-mono text-xl font-bold text-white">
            {streak} <span className="text-xs text-[var(--text-secondary)] font-sans">days</span>
          </span>
        </div>
        <div className="border-2 border-[var(--border-bright)] bg-[var(--surface)] p-3 rounded-lg shadow-[3px_3px_0px_rgba(0,0,0,1)] flex flex-col gap-1">
          <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1">
            <Trophy size={12} className="text-[var(--accent-xp)]" />
            TOTAL XP
          </span>
          <span className="font-mono text-xl font-bold text-white">
            {totalXP} <span className="text-xs text-[var(--text-secondary)] font-sans">XP</span>
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
                Log out of your FitDesi session
              </span>
            </div>
          </div>
          <LogOut size={16} className="text-[var(--text-muted)]" />
        </motion.button>
      </div>

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

      {/* ─── SYSTEM INFO ─────────────────────────────────────────────────── */}
      <div className="border-2 border-[var(--border)] bg-[var(--bg-elevated)] p-4 rounded-lg flex items-start gap-3 mt-auto">
        <Info size={18} className="text-[var(--text-secondary)] shrink-0 mt-0.5" />
        <div className="flex flex-col">
          <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--text-primary)]">
            FitDesi Mobile v1.0.0
          </span>
          <p className="text-[9px] text-[var(--text-secondary)] font-sans leading-relaxed mt-0.5">
            Designed for Indian athletes. Standard Neubrutalist Telemetry Shell. Offline synchronization enabled via local caching.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MobileProfile;
