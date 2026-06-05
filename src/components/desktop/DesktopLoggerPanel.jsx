import React from 'react';

export const DesktopLoggerPanel = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70dvh] text-center p-6 bg-[var(--bg-oled)] text-[var(--text-primary)]">
      <h1 className="font-display text-5xl font-extrabold tracking-widest text-[var(--primary)] uppercase drop-shadow-[0_0_15px_var(--primary-glow)] animate-pulse">
        Desktop Logger Panel
      </h1>
      <p className="text-[var(--text-secondary)] font-sans text-base mt-3 tracking-wider max-w-md">
        FITDESI Workout Session Logger Shell
      </p>
    </div>
  );
};
