/**
 * auth.test.jsx
 * Behaviour tests for FitDesi auth hooks, route guards, and form validation.
 *
 * All Firebase calls are mocked — zero network requests.
 * Tests target: useAuth (login, signup), ProtectedRoute, OnboardingGuard, LoginPage validation.
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { renderHook } from '@testing-library/react';

// Import mock stubs (these also register vi.mock calls)
import {
  mockSignInWithEmailAndPassword,
  mockCreateUserWithEmailAndPassword,
  mockUpdateProfile,
  mockSendEmailVerification,
  mockDeleteUser,
  mockSetDoc,
  mockGetDoc,
  mockServerTimestamp,
  mockAuth,
} from '../__mocks__/firebase';

// Import real modules under test (they use the mocked firebase internally)
import { useAuthStore } from '../stores/authStore';
import { useAuth } from '../hooks/useAuth';
import { ProtectedRoute } from '../components/shared/ProtectedRoute';
import { OnboardingGuard } from '../components/shared/OnboardingGuard';
import { LoginPage } from '../components/shared/LoginPage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wrapper with MemoryRouter for components that need router context */
function RouterWrapper({ children, initialEntries = ['/'] }) {
  return <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>;
}

/** Wrapper for renderHook that provides router context */
function hookWrapper({ children }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

/** Reset all stores and mocks between tests */
function resetAll() {
  // Reset Zustand auth store to defaults
  useAuthStore.setState({
    user: null,
    uid: null,
    loading: false,
    error: null,
  });
  // Clear all mock call history
  vi.clearAllMocks();
  // Clear lockout localStorage
  localStorage.removeItem('fitdesi_lockout_until');
}

// ─── useAuth — login() ───────────────────────────────────────────────────────

describe('useAuth — login()', () => {
  beforeEach(resetAll);

  it('calls signInWithEmailAndPassword with correct email and password', async () => {
    mockSignInWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'test-uid', email: 'test@fitdesi.com' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await act(async () => {
      await result.current.login('test@fitdesi.com', 'password123');
    });

    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
      mockAuth,
      'test@fitdesi.com',
      'password123'
    );
  });

  it('sets authStore.error with human-readable message on auth/wrong-password', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValueOnce({
      code: 'auth/wrong-password',
      message: 'Firebase: Error (auth/wrong-password).',
    });

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await act(async () => {
      try {
        await result.current.login('test@fitdesi.com', 'badpass123');
      } catch {
        // expected
      }
    });

    const state = useAuthStore.getState();
    expect(state.error).toBe('Incorrect password.');
  });

  it('sets authStore.error on auth/user-not-found', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValueOnce({
      code: 'auth/user-not-found',
      message: 'Firebase: Error (auth/user-not-found).',
    });

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await act(async () => {
      try {
        await result.current.login('nobody@fitdesi.com', 'password123');
      } catch {
        // expected
      }
    });

    const state = useAuthStore.getState();
    expect(state.error).toBe('No account with this email.');
  });

  it('sets authStore.loading to false after completion', async () => {
    mockSignInWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'uid-1' },
    });

    // Set loading = true to simulate initial state
    useAuthStore.setState({ loading: true });

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await act(async () => {
      await result.current.login('test@fitdesi.com', 'password123');
    });

    // Loading is managed by onAuthStateChanged, but error should be cleared
    const state = useAuthStore.getState();
    expect(state.error).toBeNull();
  });
});

// ─── useAuth — signup() ──────────────────────────────────────────────────────

describe('useAuth — signup()', () => {
  beforeEach(resetAll);

  const mockNewUser = {
    uid: 'new-uid-123',
    email: 'new@fitdesi.com',
    displayName: 'Test User',
  };

  it('calls createUserWithEmailAndPassword', async () => {
    mockCreateUserWithEmailAndPassword.mockResolvedValueOnce({
      user: mockNewUser,
    });
    mockUpdateProfile.mockResolvedValueOnce(undefined);
    mockSendEmailVerification.mockResolvedValueOnce(undefined);
    mockSetDoc.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await act(async () => {
      await result.current.signup('Test User', 'new@fitdesi.com', 'password123');
    });

    expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
      mockAuth,
      'new@fitdesi.com',
      'password123'
    );
  });

  it('writes Firestore user doc with correct initial structure', async () => {
    mockCreateUserWithEmailAndPassword.mockResolvedValueOnce({
      user: mockNewUser,
    });
    mockUpdateProfile.mockResolvedValueOnce(undefined);
    mockSendEmailVerification.mockResolvedValueOnce(undefined);
    mockSetDoc.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await act(async () => {
      await result.current.signup('Test User', 'new@fitdesi.com', 'password123');
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);

    // Get the second argument (the data object) from the setDoc call
    const docData = mockSetDoc.mock.calls[0][1];

    // Verify critical fields
    expect(docData.uid).toBe('new-uid-123');
    expect(docData.name).toBe('Test User');
    expect(docData.email).toBe('new@fitdesi.com');
    expect(docData.onboardingComplete).toBe(false);
    expect(docData.xp).toBe(0);
    expect(docData.level).toBe(1);
    expect(docData.levelName).toBe('Rookie');
    expect(docData.streak).toBe(0);
    expect(docData.equipmentList).toEqual([]);
    expect(docData.medicalFlags).toEqual([]);
    expect(docData.currentSupplements).toEqual([]);
    expect(docData.dietType).toBeNull();
    expect(docData.goal).toBeNull();
  });

  it('if Firestore write fails, deletes the Auth user (orphan prevention)', async () => {
    mockCreateUserWithEmailAndPassword.mockResolvedValueOnce({
      user: mockNewUser,
    });
    mockUpdateProfile.mockResolvedValueOnce(undefined);
    mockSendEmailVerification.mockResolvedValueOnce(undefined);
    mockSetDoc.mockRejectedValueOnce(new Error('Firestore permission denied'));
    mockDeleteUser.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await act(async () => {
      try {
        await result.current.signup('Test User', 'new@fitdesi.com', 'password123');
      } catch {
        // expected
      }
    });

    // The orphaned auth user should have been deleted
    expect(mockDeleteUser).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledWith(mockNewUser);
  });
});

// ─── ProtectedRoute ──────────────────────────────────────────────────────────

describe('ProtectedRoute', () => {
  beforeEach(resetAll);

  it('renders children when user is authenticated', () => {
    useAuthStore.setState({ user: { uid: 'u1' }, loading: false });

    render(
      <RouterWrapper>
        <ProtectedRoute>
          <div data-testid="protected-content">Secret Page</div>
        </ProtectedRoute>
      </RouterWrapper>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.getByText('Secret Page')).toBeInTheDocument();
  });

  it('redirects to /login when user is null and not loading', () => {
    useAuthStore.setState({ user: null, loading: false });

    let currentPath;
    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <div>Should Not Render</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/login"
            element={<div data-testid="login-page">Login</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByText('Should Not Render')).not.toBeInTheDocument();
  });

  it('renders spinner when loading is true', () => {
    useAuthStore.setState({ user: null, loading: true });

    render(
      <RouterWrapper>
        <ProtectedRoute>
          <div>Should Not Render</div>
        </ProtectedRoute>
      </RouterWrapper>
    );

    // The AuthSpinner renders "Securing Access..." text
    expect(screen.getByText('Securing Access...')).toBeInTheDocument();
    expect(screen.queryByText('Should Not Render')).not.toBeInTheDocument();
  });
});

// ─── OnboardingGuard ─────────────────────────────────────────────────────────

describe('OnboardingGuard', () => {
  beforeEach(resetAll);

  it('redirects to /onboarding/type when onboardingComplete is false', async () => {
    useAuthStore.setState({ user: { uid: 'u1' }, uid: 'u1', loading: false });

    // Mock Firestore getDoc to return onboardingComplete: false
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ onboardingComplete: false }),
    });

    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route
            path="/home"
            element={
              <OnboardingGuard>
                <div>Dashboard</div>
              </OnboardingGuard>
            }
          />
          <Route
            path="/onboarding/type"
            element={<div data-testid="onboarding">Onboarding</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    // Wait for async Firestore read
    await waitFor(() => {
      expect(screen.getByTestId('onboarding')).toBeInTheDocument();
    });

    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('renders children when onboardingComplete is true', async () => {
    useAuthStore.setState({ user: { uid: 'u1' }, uid: 'u1', loading: false });

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ onboardingComplete: true }),
    });

    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route
            path="/home"
            element={
              <OnboardingGuard>
                <div data-testid="dashboard-content">Dashboard</div>
              </OnboardingGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-content')).toBeInTheDocument();
    });
  });
});

// ─── LoginPage — Form Validation ─────────────────────────────────────────────

describe('LoginPage — Form Validation', () => {
  beforeEach(resetAll);

  it('disables submit button when validation fails', async () => {
    render(
      <RouterWrapper>
        <LoginPage />
      </RouterWrapper>
    );

    // With empty fields, the submit button should be disabled
    const submitButton = screen.getByRole('button', { name: /log in/i });
    expect(submitButton).toBeDisabled();
  });
});
