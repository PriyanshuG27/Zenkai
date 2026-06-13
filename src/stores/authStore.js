import { create } from 'zustand';

// ─── SWR Profile Cache Helpers ────────────────────────────────────────────────
// Persist the merged public+private profile in localStorage so we can hydrate
// the store instantly on the next page load — before Firebase Auth resolves.
// This eliminates the full-screen AuthSpinner for returning users.
//
// SECURITY: Private/PII fields (from /private/profile) are stripped before
// caching. Only non-sensitive public profile fields are persisted.
const PROFILE_CACHE_KEY = 'zenkai_profile_cache';

// Fields sourced from users/{uid}/private/profile — must never be cached in
// localStorage (shared-device risk: data persists after the user walks away).
const PII_FIELDS = [
  'email', 'emailVerified', 'age', 'gender', 'heightCm', 'weightKg',
  'goal', 'workoutFrequency', 'sessionDuration', 'dietType',
  'currentSupplements', 'equipmentList', 'medicalFlags',
  'examStartDate', 'examEndDate',
];

export function readProfileCache() {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeProfileCache(profile) {
  try {
    if (profile) {
      // Strip PII before writing to localStorage
      const safeProfile = { ...profile };
      PII_FIELDS.forEach((key) => delete safeProfile[key]);
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(safeProfile));
    }
  } catch {
    // Ignore storage quota errors silently
  }
}

function clearProfileCache() {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // ignore
  }
}

// ─── Initial state — hydrate from cache immediately ───────────────────────────
const cachedProfile = readProfileCache();

export const useAuthStore = create((set) => ({
  user:           null,           // Firebase User object | null
  uid:            null,           // string | null
  profile:        cachedProfile,  // Pre-hydrated from localStorage (SWR) | null
  loading:        true,           // true until onAuthStateChanged resolves
  cacheHydrated:  !!cachedProfile,// true when profile was loaded from cache
  error:          null,           // human-readable string | null

  setUser: (user) => set({
    user,
    uid:   user?.uid ?? null,
    error: null,
  }),

  setProfile: (profile) => {
    // Persist every live update back to localStorage for the next cold start
    writeProfileCache(profile);
    set({ profile, cacheHydrated: true });
  },

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  clearError: () => set({ error: null }),

  clearAuth: () => {
    clearProfileCache();
    set({ user: null, uid: null, profile: null, loading: false, cacheHydrated: false, error: null });
  },
}));
