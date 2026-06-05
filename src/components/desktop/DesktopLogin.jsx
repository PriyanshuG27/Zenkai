import React from 'react';

export const DesktopLogin = () => {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary p-8 flex flex-col justify-center items-center">
      <div className="w-full max-w-md bg-bg-surface p-8 rounded-xl border border-border space-y-6">
        <h2 className="text-heading text-3xl text-text-primary text-center">Login to FitDesi</h2>
        <div className="space-y-4">
          <input 
            type="email" 
            placeholder="Email Address" 
            className="w-full bg-bg-input border border-border-bright rounded p-3 text-text-primary focus:outline-none focus:border-primary"
          />
          <input 
            type="password" 
            placeholder="Password" 
            className="w-full bg-bg-input border border-border-bright rounded p-3 text-text-primary focus:outline-none focus:border-primary"
          />
          <button className="w-full bg-primary hover:brightness-110 text-white font-semibold py-3 rounded-lg transition">
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
};
