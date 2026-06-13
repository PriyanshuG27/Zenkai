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
// Guards: loading → spinner, no user → /login (saves `from` for post-login
// redirect), authenticated → renders children.
export const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuthStore();
  const location = useLocation();

  // Wait for Firebase onAuthStateChanged to fire at least once.
  // Without this check, authenticated users see a flash of the login page
  // before the session is hydrated from IndexedDB.
  if (loading) {
    return <AuthSpinner label="Securing Access..." />;
  }

  if (!user) {
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
