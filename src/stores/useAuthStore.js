/**
 * useAuthStore.js
 * Manages Firebase Auth state: user, loading, and session profile.
 *
 * Shape:
 *   user        — Firebase Auth User object | null
 *   profile     — Firestore /users/{uid} document | null
 *   loading     — true while onAuthStateChanged hasn't resolved yet
 *   error       — auth error string | null
 *   setUser()   — called by useAuth hook on auth state change
 *   setProfile()— called after Firestore profile fetch
 *   setLoading()
 *   setError()
 *   clearAuth() — full sign-out reset
 */

import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user:    null,
  profile: null,
  loading: true,  // start true so routes can gate on loading
  error:   null,

  setUser:    (user)    => set({ user, error: null }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  setError:   (error)   => set({ error }),

  clearAuth: () => set({ user: null, profile: null, loading: false, error: null }),
}));
