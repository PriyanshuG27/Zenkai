import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Share2, X, Trophy, Dumbbell, Zap, Flame } from 'lucide-react';
import { generateWeeklyStatsCardImage } from './weeklyRecapCardGenerator';

// ─── React Component ─────────────────────────────────────────────────────────
export const WeeklyRecapScreen = ({ isOpen, onClose, recap, weekId, markAsSeen }) => {
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(null);

  if (!isOpen || !recap) return null;

  const weekNumber = weekId?.split('-W')[1] || '';

  const handleClose = () => {
    markAsSeen();
    onClose();
  };

  const shareRecap = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const dataUrl = await generateWeeklyStatsCardImage({
        weekNumber,
        sessionsCount: recap.sessionsCount,
        totalVolume: recap.totalVolume,
        prsBrokenCount: recap.prsBrokenCount,
        xpEarned: recap.xpEarned,
        streak: recap.streak,
        bestLift: recap.bestLift,
        motivationalLine: recap.motivationalLine,
        userName: recap.userName || '',
      });

      // Synchronous data URL to blob conversion (avoids Node/JSDOM fetch failures)
      const arr = dataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });

      const filename = `zenkai-recap-week-${weekNumber}.png`;
      const file = new File([blob], filename, { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My Zenkai Week',
          text: `Check out my Zenkai weekly recap for Week ${weekNumber}! ⚡`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Error sharing recap:', err);
      setShareError('Could not generate image. Please try again.');
      setTimeout(() => setShareError(null), 4000);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-0 md:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full h-full md:h-auto md:max-w-md md:w-full bg-[var(--bg-base)] md:bg-[var(--bg-surface)] border-0 md:border-2 border-[var(--border)] md:rounded-lg shadow-2xl p-6 flex flex-col justify-between md:justify-start gap-6 overflow-y-auto relative text-[var(--text-primary)]"
      >
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 rounded-full border-2 border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors active:scale-95"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* Content */}
        <div className="flex flex-col gap-6 mt-4">
          {/* Header */}
          <div className="text-center md:text-left">
            <span className="font-mono text-xs uppercase tracking-widest text-[var(--text-secondary)]">
              Weekly Summary
            </span>
            <h2 className="font-display text-4xl font-extrabold tracking-tight uppercase mt-1 font-barlow text-[var(--text-primary)]">
              WEEK {weekNumber}
            </h2>
          </div>

          {/* Hero Stat */}
          <div className="flex flex-col items-center justify-center p-6 rounded-lg border-2 border-[var(--border)] bg-[var(--surface)] relative overflow-hidden shadow-[4px_4px_0px_rgba(0,0,0,1)]">
            <div className="absolute top-2 right-2 opacity-10">
              <Trophy size={48} className="text-[var(--accent-xp)]" />
            </div>
            <span className="font-mono text-7xl font-bold tracking-tight text-[var(--accent-xp)] font-dm">
              {recap.sessionsCount}
            </span>
            <span className="font-mono text-xs uppercase tracking-wider text-[var(--text-secondary)] mt-2">
              Workouts Logged This Week
            </span>
          </div>

          {/* Stats Grid 2x2 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-lg border-2 border-[var(--border)] bg-[var(--surface)] flex flex-col shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <span className="font-mono text-2xl font-bold text-[var(--secondary)] font-dm">
                {(recap.totalVolume || 0).toLocaleString()} kg
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)] mt-1">Total Volume</span>
            </div>
            <div className="p-4 rounded-lg border-2 border-[var(--border)] bg-[var(--surface)] flex flex-col shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <span className="font-mono text-2xl font-bold text-[var(--primary)] font-dm">
                {recap.prsBrokenCount}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)] mt-1">PRs Broken</span>
            </div>
            <div className="p-4 rounded-lg border-2 border-[var(--border)] bg-[var(--surface)] flex flex-col shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <span className="font-mono text-2xl font-bold text-[var(--accent-xp)] font-dm">
                +{recap.xpEarned}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)] mt-1">XP Earned</span>
            </div>
            <div className="p-4 rounded-lg border-2 border-[var(--border)] bg-[var(--surface)] flex flex-col shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <span className="font-mono text-2xl font-bold text-[var(--text-primary)] font-dm">
                {recap.streak} days
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)] mt-1">Active Streak</span>
            </div>
          </div>

          {/* Best Lift */}
          <div className="p-4 rounded-lg border-2 border-[var(--border)] bg-[var(--surface)] flex flex-col gap-2 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
              Best Lift This Week
            </span>
            {recap.bestLift ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded bg-[#ff5c000f] text-[var(--primary)] border border-[var(--primary)] shrink-0">
                    <Dumbbell size={14} />
                  </div>
                  <span className="font-display font-bold text-sm uppercase tracking-wide">
                    {recap.bestLift.name}
                  </span>
                </div>
                <span className="font-mono text-sm text-[var(--secondary)] font-dm shrink-0">
                  {recap.bestLift.weight === 'BW'
                    ? `BW × ${recap.bestLift.reps || 0}`
                    : `${recap.bestLift.weight} kg`}
                </span>
              </div>
            ) : (
              <span className="font-mono text-xs text-[var(--text-muted)] italic">No lifts recorded</span>
            )}
          </div>

          {/* Motivational quote */}
          <div className="text-center px-4">
            <p className="font-sans text-sm text-[var(--text-secondary)] italic leading-relaxed">
              "{recap.motivationalLine}"
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col gap-2 mt-4 border-t-2 border-[var(--border)] pt-4">
          {shareError && (
            <p className="text-xs text-red-400 font-mono text-center">{shareError}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={shareRecap}
              disabled={sharing}
              className="flex-1 flex justify-center items-center gap-2 py-3 rounded-md border-2 border-[var(--secondary)] bg-[#00d4ff0f] hover:bg-[#00d4ff1f] text-[var(--secondary)] font-display font-extrabold text-sm uppercase tracking-wide transition-colors cursor-pointer select-none active:scale-95 disabled:opacity-50"
            >
              <Share2 size={14} />
              {sharing ? 'Generating…' : 'Share Recap'}
            </button>
            <button
              onClick={handleClose}
              className="flex-1 py-3 rounded-md border-2 border-[var(--border)] bg-[var(--surface)] hover:border-[var(--text-primary)] text-[var(--text-primary)] font-display font-extrabold text-sm uppercase tracking-wide transition-colors cursor-pointer select-none active:scale-95"
            >
              Done
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
