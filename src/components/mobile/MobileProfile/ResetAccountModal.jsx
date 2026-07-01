import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Smartphone } from 'lucide-react';

export const ResetAccountModal = (props) => {
  const {
    showResetModal, setShowResetModal, resetStep, setResetStep, confirmInputText, setConfirmInputText,
    understandCheckbox, setUnderstandCheckbox, isResetting, handleResetAccountData
  } = props;

  return (
    <>
      {/* ─── RESET ACCOUNT DATA MODAL (DANGER ZONE) ────────────────────── */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 bg-black/90 z-[250] flex items-center justify-center p-4 backdrop-blur-xs">
            {/* Backdrop Close (Only if not currently resetting) */}
            <div 
              className={`absolute inset-0 ${isResetting ? 'pointer-events-none' : 'cursor-pointer'}`} 
              onClick={() => {
                if (!isResetting) {
                  setShowResetModal(false);
                  setResetStep(1);
                  setConfirmInputText('');
                  setUnderstandCheckbox(false);
                }
              }} 
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-[#111111] border-2 border-red-600 rounded-lg p-5 w-full max-w-md shadow-[8px_8px_0px_rgba(220,38,38,0.3)] relative flex flex-col gap-4 text-white z-10 text-left"
            >
              {/* Close Button (Disabled when resetting) */}
              {!isResetting && (
                <button
                  onClick={() => {
                    setShowResetModal(false);
                    setResetStep(1);
                    setConfirmInputText('');
                    setUnderstandCheckbox(false);
                  }}
                  className="absolute top-4 right-4 text-xs text-[var(--text-secondary)] hover:text-white transition-all bg-transparent border-none cursor-pointer"
                >
                  <X size={20} />
                </button>
              )}

              {/* Modal Header */}
              <div className="flex items-center gap-3 border-b-2 border-red-950/40 pb-3">
                <div className="p-2 rounded bg-red-950/20 border border-red-500 text-red-500 shadow-[2px_2px_0px_rgba(0,0,0,1)] animate-pulse">
                  <Smartphone size={20} />
                </div>
                <div className="flex flex-col">
                  <span className="font-display font-extrabold text-lg uppercase tracking-wide leading-none text-red-500">
                    Reset Account Data
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider mt-1">
                    Step {resetStep} of 2
                  </span>
                </div>
              </div>

              {/* Step 1: Warning & Typed Confirmation */}
              {resetStep === 1 && (
                <div className="flex flex-col gap-4">
                  <div className="border border-red-900/50 bg-red-950/10 p-3 rounded-lg text-xs text-red-400 leading-relaxed font-sans">
                    <strong>⚠️ WARNING:</strong> This will permanently delete your workout history, custom weekly plans, physical measurements, and PR logs. Your XP and Level will be reset to 1. <strong>This action cannot be undone.</strong>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
                      Type <span className="font-bold text-red-500">RESET</span> to confirm:
                    </label>
                    <input
                      type="text"
                      value={confirmInputText}
                      onChange={(e) => setConfirmInputText(e.target.value)}
                      placeholder="RESET"
                      className="w-full bg-[#1e1e1e] border-2 border-black p-2 rounded text-white font-mono text-sm focus:outline-none focus:border-red-500 shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                    />
                  </div>
                  <button
                    disabled={confirmInputText !== 'RESET'}
                    onClick={() => setResetStep(2)}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-display font-extrabold tracking-widest text-xs uppercase rounded border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none transition-all flex items-center justify-center cursor-pointer font-bold"
                  >
                    CONTINUE TO FINAL STEP
                  </button>
                </div>
              )}

              {/* Step 2: Final Checkbox & Delete execution */}
              {resetStep === 2 && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-neutral-300 font-sans leading-relaxed">
                    This is your final confirmation. Please check the box below to authorize deletion of all data associated with this account.
                  </p>
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={understandCheckbox}
                      disabled={isResetting}
                      onChange={(e) => setUnderstandCheckbox(e.target.checked)}
                      className="w-4 h-4 rounded border-2 border-black accent-red-600 cursor-pointer mt-0.5"
                    />
                    <span className="text-[10px] text-neutral-400 font-sans leading-relaxed">
                      I understand that all my gym logs, XP, and streak progress will be permanently wiped and cannot be recovered.
                    </span>
                  </label>

                  <div className="flex gap-3 mt-2">
                    {!isResetting && (
                      <button
                        onClick={() => setResetStep(1)}
                        className="flex-1 py-2.5 bg-[#222] hover:bg-[#333] text-neutral-400 font-display font-extrabold tracking-widest text-xs uppercase rounded border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all flex items-center justify-center cursor-pointer font-bold"
                      >
                        BACK
                      </button>
                    )}
                    <button
                      disabled={!understandCheckbox || isResetting}
                      onClick={handleResetAccountData}
                      className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-display font-extrabold tracking-widest text-xs uppercase rounded border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none transition-all flex items-center justify-center gap-2 cursor-pointer font-bold text-center"
                    >
                      {isResetting ? (
                        <>
                          <span className="animate-spin text-sm">⏳</span>
                          <span>DELETING...</span>
                        </>
                      ) : (
                        <span>WIPE MY DATA</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </>
  );
};
