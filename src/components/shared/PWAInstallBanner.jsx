import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../../stores/useUIStore';

export const PWAInstallBanner = () => {
  const { 
    pwaInstallable, 
    pwaDeferredPrompt, 
    clearPwaDeferredPrompt,
    isStandalone, 
    isIOS,
    openModal 
  } = useUIStore();

  const [visible, setVisible] = useState(false);
  const [domain, setDomain] = useState('');

  useEffect(() => {
    setDomain(window.location.hostname || window.location.host);
  }, []);

  // Show banner if the app is NOT standalone, and we detect it is installable (Chrome) OR it is iOS Safari.
  // We want to show it automatically on startup/open.
  useEffect(() => {
    if (isStandalone || navigator.webdriver) {
      setVisible(false);
      return;
    }

    if (pwaInstallable || (isIOS && !isStandalone)) {
      setVisible(true);
    }
  }, [pwaInstallable, isIOS, isStandalone]);

  if (!visible) return null;

  const handleInstallClick = async (e) => {
    e.stopPropagation();
    if (pwaInstallable && pwaDeferredPrompt) {
      try {
        pwaDeferredPrompt.prompt();
        const { outcome } = await pwaDeferredPrompt.userChoice;
        console.log(`[PWA] Install prompt outcome: ${outcome}`);
        clearPwaDeferredPrompt();
        setVisible(false);
      } catch (err) {
        console.error('[PWA] Error triggering native prompt:', err);
      }
    } else {
      // For iOS or manual fallback, open the step-by-step instruction modal
      openModal('pwaInstall');
      setVisible(false);
    }
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    setVisible(false);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="pwa-install-banner fixed top-4 left-4 right-4 z-[9999] max-w-md mx-auto"
        onClick={handleDismiss} // Tap outside content to dismiss
      >
        <div 
          className="bg-[#28293d] text-white p-3.5 rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.5)] flex items-center justify-between gap-4 border border-[#3e3f5a]/30 cursor-default"
          onClick={(e) => e.stopPropagation()} // Prevent auto-dismiss on clicking inside
        >
          {/* Left: App Logo & Details */}
          <div className="flex items-center gap-3 min-w-0">
            {/* App Icon */}
            <div className="w-12 h-12 bg-black rounded-2xl border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_rgba(0,0,0,0.2)] shrink-0 overflow-hidden">
              <img src="/logos/zenkai_official_logo.webp" alt="Zenkai Logo" className="w-full h-full object-contain p-0.5" />
            </div>
            
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-white tracking-wide leading-tight">
                Install Zenkai
              </span>
              <span className="text-[10px] text-[#a1a1b5] font-sans truncate mt-0.5">
                {domain}
              </span>
            </div>
          </div>

          {/* Right: Install Action & Optional Dismiss */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleInstallClick}
              className="text-sm font-bold text-[#b5ff2d] hover:text-[#c4ff54] active:scale-95 transition-all px-2.5 py-1"
            >
              Install
            </button>
            <button
              onClick={handleDismiss}
              className="text-xs font-semibold text-[#a1a1b5] hover:text-white px-1.5"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
