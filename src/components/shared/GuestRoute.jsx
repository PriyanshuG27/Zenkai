import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { AuthSpinner } from './ProtectedRoute';

// ─── GuestRoute ───────────────────────────────────────────────────────────────
// Allows access ONLY to unauthenticated users.
// Authenticated users are redirected to /home (or location.state.from if set).
export const GuestRoute = ({ children }) => {
  const { user, loading } = useAuthStore();
  const location = useLocation();

  if (loading) {
    return <AuthSpinner label="Hydrating Session..." />;
  }

  if (user) {
    // If the user was sent here from a protected route (via ProtectedRoute's
    // state.from), honour that redirect after login.
    const destination = location.state?.from || '/home';
    return <Navigate to={destination} replace />;
  }

  return children;
};
