/**
 * useToast.js
 * Convenience wrapper for useUIStore toast actions.
 *
 * Responsibilities:
 * - Provides toast(message, type) shorthand
 * - Provides typed helpers: success(), error(), xp(), info()
 * - Reads current toasts array for the ToastStack component
 *
 * Toast types:
 *   'success' — green check, 3.5s
 *   'error'   — red alert, 5s (longer so user can read)
 *   'xp'      — accent-xp glow, 4s (XP awards)
 *   'info'    — neutral, 3s
 */

import { useUIStore } from '../stores/useUIStore';

export function useToast() {
  const { toasts, addToast, removeToast } = useUIStore();

  const DURATIONS = { success: 3500, error: 5000, xp: 4000, info: 3000 };

  return {
    toasts,
    removeToast,
    toast:   (message, type = 'info')      => addToast(message, type, DURATIONS[type] ?? 3500),
    success: (message)                      => addToast(message, 'success', DURATIONS.success),
    error:   (message)                      => addToast(message, 'error',   DURATIONS.error),
    xp:      (message)                      => addToast(message, 'xp',      DURATIONS.xp),
    info:    (message)                      => addToast(message, 'info',    DURATIONS.info),
  };
}
