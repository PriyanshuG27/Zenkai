import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Dumbbell, Target, Zap, ChevronRight } from 'lucide-react';

export const LandingPage = () => {
  return (
    <div className="relative min-h-screen bg-bg-base text-text-primary font-body overflow-hidden flex flex-col justify-between selection:bg-primary/30 selection:text-primary">
      {/* Background Saffron/Orange Glow Blob */}
      <div className="absolute top-[-20%] left-[20%] w-[600px] h-[600px] rounded-full bg-radial-gradient from-primary/15 via-primary-glow to-transparent blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] rounded-full bg-radial-gradient from-secondary/10 via-secondary-glow to-transparent blur-[120px] pointer-events-none z-0" />

      {/* Header */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 flex justify-between items-center border-b border-border-base/40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center font-display font-extrabold text-xl text-white tracking-tighter">
            FD
          </div>
          <span className="font-display text-2xl font-bold tracking-wider text-text-primary">
            FIT<span className="text-primary">DESI</span>
          </span>
        </div>
        <Link 
          to="/login" 
          className="text-sm font-semibold text-text-secondary hover:text-text-primary border border-border-base hover:border-border-bright bg-bg-surface px-5 py-2 rounded-lg transition duration-200"
        >
          Log In
        </Link>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col justify-center items-center px-6 py-12 text-center max-w-4xl mx-auto">
        {/* Level Up / Active Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-bg-surface border border-border-bright text-xs font-mono text-accent-xp uppercase tracking-wider mb-8 shadow-inner">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-xp opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-xp"></span>
          </span>
          V1.0.0 Comeback Release
        </div>

        {/* Barlow Condensed Headline */}
        <h1 className="font-display text-5xl md:text-8xl font-black uppercase tracking-tight leading-[0.9] text-text-primary mb-6 max-w-3xl">
          Train Smarter.<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary to-accent-xp">
            Comeback Stronger.
          </span>
        </h1>

        {/* Subhead */}
        <p className="text-base md:text-xl text-text-secondary font-body max-w-2xl leading-relaxed mb-10">
          AI-powered gym tracking and custom recovery routines for Indian athletes. Plan around your equipment, constraints, and progress with gamified XP rewards.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto justify-center mb-16">
          <Link 
            to="/signup" 
            className="group inline-flex items-center justify-center gap-2 bg-primary text-bg-base font-semibold py-4 px-8 rounded-xl hover:brightness-110 active:brightness-95 transition-all shadow-[0_0_30px_var(--primary-glow)] hover:shadow-[0_0_40px_rgba(255,92,0,0.4)]"
          >
            Get Started
            <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link 
            to="/login" 
            className="inline-flex items-center justify-center bg-bg-surface border border-border-bright text-text-primary hover:border-text-secondary font-semibold py-4 px-8 rounded-xl transition duration-200"
          >
            Log In
          </Link>
        </div>

        {/* Features Pills */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl border-t border-border-base/40 pt-10 text-left">
          <div className="flex gap-3 bg-bg-surface/50 border border-border-base p-4 rounded-xl">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <Zap size={20} />
            </div>
            <div>
              <h2 className="font-semibold text-text-primary text-sm">Comeback Mode</h2>
              <p className="text-xs text-text-secondary mt-1">Start at safe capacity and ramp up gradually based on biometric feedback.</p>
            </div>
          </div>

          <div className="flex gap-3 bg-bg-surface/50 border border-border-base p-4 rounded-xl">
            <div className="w-10 h-10 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-center text-secondary shrink-0">
              <Dumbbell size={20} />
            </div>
            <div>
              <h2 className="font-semibold text-text-primary text-sm">Equipment-Aware Plans</h2>
              <p className="text-xs text-text-secondary mt-1">AI generates routines using only the gear in your gym. No compromises.</p>
            </div>
          </div>

          <div className="flex gap-3 bg-bg-surface/50 border border-border-base p-4 rounded-xl">
            <div className="w-10 h-10 rounded-lg bg-accent-xp/10 border border-accent-xp/20 flex items-center justify-center text-accent-xp shrink-0">
              <Target size={20} />
            </div>
            <div>
              <h2 className="font-semibold text-text-primary text-sm">XP + Challenges</h2>
              <p className="text-xs text-text-secondary mt-1">Earn level milestones and streak multipliers for completing workouts.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row justify-between items-center border-t border-border-base/40 text-xs text-text-muted gap-4">
        <span>© {new Date().getFullYear()} FitDesi. Built for Indian strength and endurance.</span>
        <div className="flex gap-6">
          <span className="hover:text-text-secondary transition duration-150 cursor-pointer">Privacy Policy</span>
          <span className="hover:text-text-secondary transition duration-150 cursor-pointer">Terms of Service</span>
        </div>
      </footer>
    </div>
  );
};
