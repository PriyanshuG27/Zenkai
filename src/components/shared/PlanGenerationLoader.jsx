import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Sparkles, Dumbbell } from 'lucide-react';

const PRO_TIPS = [
  "Rest at least 90s between heavy sets to maximize force production and recovery.",
  "Progressive overload means adding weight or reps over time, not just sweating more.",
  "Consistency beats intensity. Three 45-minute sessions weekly beats one 3-hour marathon.",
  "Muscles are built in the kitchen and the bed. Prioritize protein and 8 hours of sleep.",
  "Decompress your spine after heavy lifting. A simple 30s dead hang works wonders.",
  "Track your warm-up sets too. They prepare your nervous system for top weights.",
  "Dictate your sets offline instantly using your keyboard's built-in microphone."
];

export const PlanGenerationLoader = () => {
  const [elapsed, setElapsed] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  // Elapsed seconds timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Tip rotation timer (every 4 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % PRO_TIPS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Dynamic status message based on elapsed time
  let statusMessage = "Analyzing profile & equipment...";
  if (elapsed >= 3 && elapsed < 15) {
    statusMessage = "Calculating progressive overload thresholds...";
  } else if (elapsed >= 15) {
    statusMessage = "Waking up AI servers. This takes up to 50 seconds on the free tier. Please keep the app open...";
  }

  return (
    <div className="w-full border-2 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[5px_5px_0px_black] flex flex-col gap-5 select-none relative overflow-hidden">
      {/* Moving background accent light */}
      <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-[var(--primary)]/10 blur-2xl animate-pulse" />

      {/* Top Section: Spinning Barbell Visual */}
      <div className="flex items-center gap-4">
        <div className="relative w-12 h-12 bg-black border-2 border-[var(--primary)] rounded-xl flex items-center justify-center shadow-[3px_3px_0px_var(--primary-glow)] shrink-0">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            className="text-[var(--primary)]"
          >
            <RefreshCw size={24} />
          </motion.div>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-display font-extrabold text-sm uppercase tracking-wider text-[var(--primary)]">
            Generating AI Plan
          </span>
          <span className="font-mono text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mt-0.5">
            Elapsed: {elapsed}s
          </span>
        </div>
      </div>

      {/* Status Bar Indicator */}
      <div className="flex flex-col gap-2">
        <div className="w-full h-3 bg-[var(--bg-elevated)] rounded-full overflow-hidden border-2 border-black relative">
          <motion.div
            className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent-xp)]"
            initial={{ width: "5%" }}
            animate={{ 
              width: elapsed < 3 ? "20%" : elapsed < 15 ? "55%" : "85%"
            }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
          />
        </div>
        <p className="font-sans text-xs text-[var(--text-primary)] font-semibold transition-all duration-300">
          {statusMessage}
        </p>
      </div>

      {/* Pro Tip Box (Rotates every 4s) */}
      <div className="border border-dashed border-[var(--border-bright)] bg-[var(--bg-elevated)] p-4 rounded-xl relative">
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--accent-xp)] uppercase tracking-wider mb-1.5 font-bold">
          <Sparkles size={12} />
          <span>Gym Pro Tip</span>
        </div>
        <div className="min-h-[44px] flex items-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={tipIndex}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.25 }}
              className="text-xs font-sans text-[var(--text-secondary)] leading-relaxed"
            >
              "{PRO_TIPS[tipIndex]}"
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      <p className="text-[9px] text-[var(--text-muted)] font-mono leading-tight border-t border-[var(--border)] pt-2.5">
        DISCLAIMER: AI workout suggestions are for educational purposes. Consult a physician before beginning any exercise routine.
      </p>
    </div>
  );
};
