import React from 'react';

export const MobileLogger = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70dvh] text-center p-6 bg-[var(--bg-oled)] text-[var(--text-primary)]">
      <h1 className="font-display text-4xl font-extrabold tracking-widest text-[var(--primary)] uppercase drop-shadow-[0_0_12px_var(--primary-glow)] animate-pulse">
        Mobile Logger
      </h1>
      <p className="text-[var(--text-secondary)] font-sans text-xs mt-2 tracking-wider">
        FITDESI Mobile Workout Session Logger Shell
      </p>
    </div>
  );
};
