import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

// ─── Shared loading spinner ───────────────────────────────────────────────────
export const AuthSpinner = ({ label = 'Securing Access...' }) => (
  <div
    style={{ height: '100dvh' }}
    className="bg-bg-base flex flex-col items-center justify-center gap-4"
  >
    <div className="relative w-12 h-12 flex items-center justify-center">
      {/* Outer spinning ring */}
      <div className="absolute w-full h-full rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      {/* Inner Zenkai logo badge */}
      <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center overflow-hidden">
        <img src="/logos/zenkai_official_logo.webp" alt="Zenkai Logo" className="w-full h-full object-contain p-1" />
      </div>
    </div>
    <span className="font-mono text-xs text-text-secondary uppercase tracking-widest animate-pulse">
      {label}
    </span>
  </div>
);

// ─── ProtectedRoute ───────────────────────────────────────────────────────────
// Guards: loading → spinner (cold load only), no user → /login (saves `from`
// for post-login redirect), authenticated → renders children.
export const ProtectedRoute = ({ children }) => {
  const { user, loading, cacheHydrated } = useAuthStore();
  const location = useLocation();

  // Only block with a spinner on a genuine cold load (no cached profile in
  // localStorage). Returning users already have profile data in the store from
  // the SWR cache, so we render immediately and let Firebase verify the session
  // silently in the background. If the session is later invalidated, the auth
  // state listener clears `user` and the next render redirects to /login.
  if (loading && !cacheHydrated) {
    return <AuthSpinner label="Securing Access..." />;
  }

  if (!user && !loading) {
    // Save the current path in location.state.from so LoginPage can
    // redirect back to it after a successful login.
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return children;
};
