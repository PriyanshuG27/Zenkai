/**
 * useWorkoutTimer.js
 * Drives the in-session elapsed-time counter.
 *
 * Responsibilities:
 * - Starts a 1-second setInterval when the session is active
 * - Calls useWorkoutStore.tick() every second
 * - Clears the interval when session ends or component unmounts
 * - Returns { elapsedSeconds, formattedTime } for display
 *
 * Usage: call inside MobileLogger / DesktopWorkout components.
 */

import { useEffect }       from 'react';
import { useWorkoutStore } from '../stores/useWorkoutStore';

function formatTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function useWorkoutTimer() {
  const { activeSession, elapsedSeconds, tick } = useWorkoutStore();

  useEffect(() => {
    if (!activeSession) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  return {
    elapsedSeconds,
    formattedTime: formatTime(elapsedSeconds),
  };
}
