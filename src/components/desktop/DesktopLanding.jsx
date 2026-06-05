import React from 'react';

export const DesktopLanding = () => {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary p-8 flex flex-col justify-center items-center max-w-4xl mx-auto space-y-6">
      <h1 className="text-display text-6xl text-primary font-bold">FitDesi</h1>
      <p className="text-body text-xl text-text-secondary text-center max-w-2xl">
        The ultimate AI-powered athletic workout logging and comeback planning system for Indian gyms. Tailored to your equipment, medical constraints, and target capacity. (Desktop view)
      </p>
      <div className="flex gap-4">
        <button className="bg-primary hover:brightness-110 text-white font-semibold py-3 px-8 rounded-lg shadow-lg transition">
          Get Started Free
        </button>
        <button className="bg-bg-surface border border-border-bright text-text-primary hover:border-primary font-semibold py-3 px-8 rounded-lg transition">
          Learn More
        </button>
      </div>
    </div>
  );
};
