import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user:    null,   // Firebase User object | null
  uid:     null,   // string | null
  loading: true,   // true until onAuthStateChanged fires for the first time
  error:   null,   // human-readable string | null

  setUser: (user) => set({
    user,
    uid:   user?.uid ?? null,
    error: null,
  }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  clearError: () => set({ error: null }),
}));
