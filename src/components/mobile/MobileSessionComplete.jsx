import React from 'react';
import { useNavigate } from 'react-router-dom';

export const MobileSessionComplete = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-bg-base text-text-primary p-6 flex flex-col justify-center items-center space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-display text-4xl text-primary font-bold">🔥 SESSION DONE</h2>
        <p className="text-text-secondary text-sm">Great work today! Your stats have been saved.</p>
      </div>

      <div className="w-full max-w-sm bg-bg-surface border border-border rounded-xl p-5 space-y-4 font-mono text-sm">
        <div className="flex justify-between border-b border-border pb-2">
          <span className="text-text-secondary">Duration</span>
          <span className="text-text-primary">52 min</span>
        </div>
        <div className="flex justify-between border-b border-border pb-2">
          <span className="text-text-secondary">Exercises / Sets</span>
          <span className="text-text-primary">4 / 16</span>
        </div>
        <div className="flex justify-between border-b border-border pb-2">
          <span className="text-text-secondary">Total Volume</span>
          <span className="text-text-primary">4,240 kg</span>
        </div>
        <div className="flex justify-between border-b border-border pb-2">
          <span className="text-text-secondary">PRs Hit</span>
          <span className="text-accent-xp">2 PRs</span>
        </div>
        <div className="flex justify-between pt-2">
          <span className="text-text-secondary">XP Earned</span>
          <span className="text-accent-xp font-bold">+100 XP</span>
        </div>
      </div>

      <button 
        onClick={() => navigate('/home')}
        className="w-full max-w-sm bg-primary hover:brightness-110 text-white font-semibold py-3 rounded-lg transition"
      >
        Back to Home
      </button>
    </div>
  );
};
