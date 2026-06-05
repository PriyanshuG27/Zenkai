/**
 * routing.test.jsx
 * Behaviour tests for FitDesi route guard integration.
 *
 * Tests verify:
 * - Unauthenticated users are redirected away from protected routes
 * - Authenticated users are redirected away from guest routes
 * - Post-login redirect state (from) is preserved and honoured
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Import mock stubs (registers vi.mock calls)
import { mockGetDoc } from '../__mocks__/firebase';

// Import real modules under test
import { useAuthStore } from '../stores/authStore';
import { ProtectedRoute } from '../components/shared/ProtectedRoute';
import { GuestRoute } from '../components/shared/GuestRoute';
import { OnboardingGuard } from '../components/shared/OnboardingGuard';

/** Reset stores and mocks between tests */
function resetAll() {
  useAuthStore.setState({
    user: null,
    uid: null,
    loading: false,
    error: null,
  });
  vi.clearAllMocks();
}

// ─── Routing Integration ─────────────────────────────────────────────────────

describe('Routing — Unauthenticated redirects', () => {
  beforeEach(resetAll);

  it('unauthenticated user visiting /home gets redirected to /login', () => {
    useAuthStore.setState({ user: null, loading: false });

    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <div>Dashboard</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/login"
            element={<div data-testid="login-redirect">Login Page</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('login-redirect')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });
});

describe('Routing — Authenticated redirects', () => {
  beforeEach(resetAll);

  it('authenticated user visiting /login gets redirected to /home', () => {
    useAuthStore.setState({
      user: { uid: 'auth-user-1', email: 'user@fitdesi.com' },
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route
            path="/login"
            element={
              <GuestRoute>
                <div>Login Form</div>
              </GuestRoute>
            }
          />
          <Route
            path="/home"
            element={<div data-testid="home-redirect">Home Page</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('home-redirect')).toBeInTheDocument();
    expect(screen.queryByText('Login Form')).not.toBeInTheDocument();
  });
});

describe('Routing — Redirect state preservation', () => {
  beforeEach(resetAll);

  it('after login, user lands on originally requested URL (redirect state preserved)', () => {
    // Simulate: user was authenticated but GuestRoute has location.state.from
    useAuthStore.setState({
      user: { uid: 'auth-user-1' },
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/progress' } }]}>
        <Routes>
          <Route
            path="/login"
            element={
              <GuestRoute>
                <div>Login Form</div>
              </GuestRoute>
            }
          />
          <Route
            path="/home"
            element={<div>Home Page</div>}
          />
          <Route
            path="/progress"
            element={<div data-testid="progress-redirect">Progress Page</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    // GuestRoute should redirect to /progress (from state.from), NOT /home
    expect(screen.getByTestId('progress-redirect')).toBeInTheDocument();
    expect(screen.queryByText('Login Form')).not.toBeInTheDocument();
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument();
  });
});
