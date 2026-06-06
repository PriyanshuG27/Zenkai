/**
 * useUIStore.js
 * Cross-cutting UI state: toasts, modals, theme, and navigation.
 *
 * Shape:
 *   toasts        — array of { id, message, type: 'success'|'error'|'xp'|'info', duration }
 *   activeModal   — 'levelUp' | 'pr' | 'challengeComplete' | 'confirmDelete' | null
 *   modalPayload  — arbitrary data passed to the active modal
 *   theme         — 'dark' (only dark supported in v1)
 *   mobileTab     — 'home' | 'workout' | 'progress' | 'plan' | 'challenges' | 'profile'
 *   sidebarOpen   — desktop sidebar collapsed state
 *
 * Actions:
 *   addToast(message, type, duration)
 *   removeToast(id)
 *   openModal(name, payload)
 *   closeModal()
 *   setMobileTab(tab)
 *   toggleSidebar()
 */

import { create } from 'zustand';

let toastCounter = 0;

export const useUIStore = create((set) => ({
  toasts:       [],
  activeModal:  null,
  modalPayload: null,
  theme:        'dark',
  mobileTab:    'home',
  sidebarOpen:  true,

  // PWA states
  pwaDeferredPrompt: null,
  pwaInstallable: false,
  isStandalone: false,
  isIOS: false,

  addToast: (message, type = 'info', duration = 3500) => {
    const id = ++toastCounter;
    set((state) => ({ toasts: [...state.toasts, { id, message, type, duration }] }));
    // Auto-remove after duration
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },

  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  openModal:  (name, payload = null) => set({ activeModal: name, modalPayload: payload }),
  closeModal: ()                     => set({ activeModal: null, modalPayload: null }),

  setMobileTab: (tab)   => set({ mobileTab: tab }),
  toggleSidebar: ()     => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  // PWA actions
  setPwaDeferredPrompt: (prompt) => set({ pwaDeferredPrompt: prompt, pwaInstallable: !!prompt }),
  clearPwaDeferredPrompt: () => set({ pwaDeferredPrompt: null, pwaInstallable: false }),
  setIsStandalone: (val) => set({ isStandalone: val }),
  setIsIOS: (val) => set({ isIOS: val }),
}));
