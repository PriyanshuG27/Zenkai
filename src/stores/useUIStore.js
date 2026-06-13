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


// ── Synchronous PWA detection ──────────────────────────────────────────────
// Detect standalone/iOS at module load time (before React renders a single
// frame). This prevents the PWA install card from appearing for one frame
// and then disappearing, which causes a large Cumulative Layout Shift (CLS).
// The typeof matchMedia guard keeps this safe inside jsdom (Vitest) which
// does not implement matchMedia.
const _isStandalone =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    !!window.navigator.standalone);
const _isIOS =
  typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.MSStream;


let toastCounter = 0;


export const useUIStore = create((set) => ({
  toasts:       [],
  activeModal:  null,
  modalPayload: null,
  theme:        'dark',
  mobileTab:    'home',
  sidebarOpen:  true,

  // PWA states — pre-populated synchronously to avoid layout shifts on first render
  pwaDeferredPrompt: null,
  pwaInstallable: false,
  isStandalone: _isStandalone,
  isIOS: _isIOS,


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
