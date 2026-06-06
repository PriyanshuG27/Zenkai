import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Smartphone, Share2, Plus, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';

export const PWAInstallModal = () => {
  const { 
    activeModal, 
    closeModal, 
    pwaInstallable, 
    pwaDeferredPrompt, 
    clearPwaDeferredPrompt,
    isIOS, 
    isStandalone 
  } = useUIStore();

  if (activeModal !== 'pwaInstall') return null;

  const handleInstallClick = async () => {
    if (!pwaDeferredPrompt) return;
    try {
      pwaDeferredPrompt.prompt();
      const { outcome } = await pwaDeferredPrompt.userChoice;
      console.log(`[PWA] User response to install prompt: ${outcome}`);
      clearPwaDeferredPrompt();
      closeModal();
    } catch (err) {
      console.error('[PWA] Error triggering install prompt:', err);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        {/* Backdrop close */}
        <div className="absolute inset-0 cursor-pointer" onClick={closeModal} />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', duration: 0.4 }}
          className="bg-[#111111] border-2 border-black rounded-lg p-6 w-full max-w-sm shadow-[8px_8px_0px_rgba(0,0,0,1)] relative flex flex-col gap-4 text-white z-10"
        >
          {/* Close button */}
          <button
            onClick={closeModal}
            className="absolute -top-2 -right-2 bg-black text-[var(--primary)] border-2 border-black w-8 h-8 rounded-md flex items-center justify-center font-bold font-mono shadow-[2px_2px_0px_var(--primary)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-95 transition-all"
          >
            <X size={16} />
          </button>

          {/* Modal Header */}
          <div className="flex items-center gap-3 border-b-2 border-[#222222] pb-3">
            <div className="p-2 rounded bg-[#ff5c000e] border-2 border-[var(--primary)] text-[var(--primary)] shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <Smartphone size={20} />
            </div>
            <div className="flex flex-col">
              <span className="font-display font-extrabold text-lg uppercase tracking-wide leading-none">
                Install FitDesi
              </span>
              <span className="text-[10px] font-mono text-[var(--secondary)] uppercase tracking-wider mt-1">
                Native App Experience
              </span>
            </div>
          </div>

          {/* Modal Body */}
          <div className="flex flex-col gap-4 py-2">
            {isStandalone ? (
              <div className="flex flex-col items-center text-center py-4 gap-3">
                <CheckCircle2 size={36} className="text-[var(--accent-xp)]" />
                <p className="text-xs text-[var(--text-secondary)] font-sans leading-relaxed">
                  FitDesi is already installed on your device! You can run it directly from your home screen or app drawer.
                </p>
              </div>
            ) : pwaInstallable ? (
              // Chrome / Android Auto Install Prompt
              <div className="flex flex-col gap-4">
                <p className="text-xs text-[var(--text-secondary)] font-sans leading-relaxed">
                  Install FitDesi on your home screen for full-screen mode, smoother animations, offline workouts, and biometric tracking.
                </p>
                <button
                  onClick={handleInstallClick}
                  className="w-full py-3 bg-[var(--primary)] text-black font-display font-extrabold tracking-widest text-xs uppercase rounded border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <span>INSTALL NOW</span>
                  <ArrowRight size={14} />
                </button>
                <div className="flex items-start gap-2 bg-[#1a1a1a] p-2.5 rounded border border-[#222222]">
                  <AlertCircle size={14} className="text-[var(--secondary)] shrink-0 mt-0.5" />
                  <span className="text-[9px] font-sans text-[var(--text-secondary)] leading-normal">
                    If the browser dialog doesn't pop up immediately, tap the three dots in your menu bar and select "Install app".
                  </span>
                </div>
              </div>
            ) : isIOS ? (
              // iOS Safari Steps
              <div className="flex flex-col gap-4">
                <p className="text-xs text-[var(--text-secondary)] font-sans leading-relaxed">
                  Safari doesn't support automatic installation, but you can add FitDesi to your home screen in 3 quick steps:
                </p>

                <div className="flex flex-col gap-3 font-sans">
                  {/* Step 1 */}
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      1
                    </div>
                    <div className="flex-1 text-[11px] text-[var(--text-primary)]">
                      Tap the <span className="font-bold text-white bg-[#222] px-1.5 py-0.5 rounded inline-flex items-center gap-1">Share <Share2 size={10} className="inline text-[var(--secondary)]" /></span> button in the Safari browser bar.
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      2
                    </div>
                    <div className="flex-1 text-[11px] text-[var(--text-primary)]">
                      Scroll down the options list and select <span className="font-bold text-white bg-[#222] px-1.5 py-0.5 rounded inline-flex items-center gap-1">Add to Home Screen <Plus size={10} className="inline text-[var(--accent-xp)]" /></span>.
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      3
                    </div>
                    <div className="flex-1 text-[11px] text-[var(--text-primary)]">
                      Tap <span className="font-bold text-[var(--accent-xp)] bg-[#222] px-1.5 py-0.5 rounded">Add</span> in the top-right corner of the system prompt to finalize.
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // Fallback / General Android Manual Install
              <div className="flex flex-col gap-4">
                <p className="text-xs text-[var(--text-secondary)] font-sans leading-relaxed">
                  Add FitDesi to your device home screen manually using your browser menu:
                </p>

                <div className="flex flex-col gap-3 font-sans">
                  {/* Step 1 */}
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      1
                    </div>
                    <div className="flex-1 text-[11px] text-[var(--text-primary)]">
                      Tap the <span className="font-bold text-white bg-[#222] px-1.5 py-0.5 rounded">Menu icon</span> (three dots or vertical lines) in your browser.
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      2
                    </div>
                    <div className="flex-1 text-[11px] text-[var(--text-primary)]">
                      Select <span className="font-bold text-white bg-[#222] px-1.5 py-0.5 rounded">"Install app"</span> or <span className="font-bold text-white bg-[#222] px-1.5 py-0.5 rounded">"Add to Home Screen"</span>.
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      3
                    </div>
                    <div className="flex-1 text-[11px] text-[var(--text-primary)]">
                      Follow the prompts to pin it to your desktop/home screen.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <button
            onClick={closeModal}
            className="w-full py-2.5 bg-transparent text-[var(--text-secondary)] hover:text-white border-2 border-[#222222] rounded text-xs font-mono font-bold tracking-wider hover:border-[#333333] transition-all"
          >
            CLOSE
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
