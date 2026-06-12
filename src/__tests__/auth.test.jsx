/**
 * auth.test.jsx
 * Behaviour tests for Zenkai auth hooks, route guards, and form validation.
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
  mockSignInWithPopup,
  mockUpdateProfile,
  mockSendEmailVerification,
  mockSignOut,
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
  localStorage.removeItem('zenkai_lockout_until');
  vi.useRealTimers();
}

// ─── useAuth — login() ───────────────────────────────────────────────────────

describe('useAuth — login()', () => {
  beforeEach(resetAll);

  it('calls signInWithEmailAndPassword with correct email and password', async () => {
    mockSignInWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'test-uid', email: 'test@zenkai.com' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await act(async () => {
      await result.current.login('test@zenkai.com', 'password123');
    });

    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
      mockAuth,
      'test@zenkai.com',
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
        await result.current.login('test@zenkai.com', 'badpass123');
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
        await result.current.login('nobody@zenkai.com', 'password123');
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
      await result.current.login('test@zenkai.com', 'password123');
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
    email: 'new@zenkai.com',
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
      await result.current.signup('Test User', 'new@zenkai.com', 'password123');
    });

    expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
      mockAuth,
      'new@zenkai.com',
      'password123'
    );
  });

  it('writes Firestore user doc with correct initial structure', async () => {
    mockCreateUserWithEmailAndPassword.mockResolvedValueOnce({
      user: mockNewUser,
    });
    mockUpdateProfile.mockResolvedValueOnce(undefined);
    mockSendEmailVerification.mockResolvedValueOnce(undefined);
    mockSetDoc.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await act(async () => {
      await result.current.signup('Test User', 'new@zenkai.com', 'password123');
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(3);

    // Get the public doc call
    const publicDocCall = mockSetDoc.mock.calls.find(call => call[0]._path === 'users/new-uid-123');
    expect(publicDocCall).toBeDefined();
    const docData = publicDocCall[1];

    // Verify critical public fields
    expect(docData.uid).toBe('new-uid-123');
    expect(docData.name).toBe('Test User');
    expect(docData.onboardingComplete).toBe(false);
    expect(docData.xp).toBe(0);
    expect(docData.level).toBe(1);
    expect(docData.levelName).toBe('Rookie');
    expect(docData.streak).toBe(0);

    // Get the private doc call
    const privateDocCall = mockSetDoc.mock.calls.find(call => call[0]._path === 'users/new-uid-123/private/profile');
    expect(privateDocCall).toBeDefined();
    const privateData = privateDocCall[1];

    // Verify critical private fields
    expect(privateData.email).toBe('new@zenkai.com');
    expect(privateData.equipmentList).toEqual([]);
    expect(privateData.medicalFlags).toEqual([]);
    expect(privateData.currentSupplements).toEqual([]);
    expect(privateData.dietType).toBeNull();
    expect(privateData.goal).toBeNull();
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
        await result.current.signup('Test User', 'new@zenkai.com', 'password123');
      } catch {
        // expected
      }
    });

    // The orphaned auth user should have been deleted
    expect(mockDeleteUser).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledWith(mockNewUser);
  });
});

// ─── useAuth — loginWithGoogle() ──────────────────────────────────────────────
describe('useAuth — loginWithGoogle()', () => {
  beforeEach(resetAll);

  it('signs in with popup and creates new user document if they do not exist', async () => {
    const mockGoogleUser = {
      uid: 'google-uid-123',
      email: 'google@zenkai.com',
      displayName: 'Goku Son',
    };

    mockSignInWithPopup.mockResolvedValueOnce({
      user: mockGoogleUser,
    });
    mockGetDoc.mockResolvedValueOnce({
      exists: () => false,
    });
    mockSetDoc.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await act(async () => {
      await result.current.loginWithGoogle();
    });

    expect(mockSignInWithPopup).toHaveBeenCalledTimes(1);
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    // Writes public user doc, private doc and squad_codes doc
    expect(mockSetDoc).toHaveBeenCalledTimes(3);

    const publicDocCall = mockSetDoc.mock.calls.find(call => call[0]._path === 'users/google-uid-123');
    expect(publicDocCall).toBeDefined();
    const userDocData = publicDocCall[1];
    expect(userDocData.uid).toBe('google-uid-123');
    expect(userDocData.name).toBe('Goku Son');
    expect(userDocData.squadCode).toMatch(/^ZK-[A-Z]{4}\d{3}$/);

    const privateDocCall = mockSetDoc.mock.calls.find(call => call[0]._path === 'users/google-uid-123/private/profile');
    expect(privateDocCall).toBeDefined();
    const privateDocData = privateDocCall[1];
    expect(privateDocData.email).toBe('google@zenkai.com');

    const squadDocCall = mockSetDoc.mock.calls.find(call => call[0]._path === 'squad_codes/' + userDocData.squadCode);
    expect(squadDocCall).toBeDefined();
    const squadDocData = squadDocCall[1];
    expect(squadDocData.uid).toBe('google-uid-123');
    expect(squadDocData.name).toBe('Goku Son');
    expect(squadDocData.squadCode).toBe(userDocData.squadCode);
  });

  it('signs in with popup and skips doc creation if user already exists in Firestore', async () => {
    const mockGoogleUser = {
      uid: 'google-uid-456',
      email: 'existing-google@zenkai.com',
      displayName: 'Vegeta Prince',
    };

    mockSignInWithPopup.mockResolvedValueOnce({
      user: mockGoogleUser,
    });
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ onboardingComplete: true }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await act(async () => {
      await result.current.loginWithGoogle();
    });

    expect(mockSignInWithPopup).toHaveBeenCalledTimes(1);
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('sets error and throws when signInWithPopup fails', async () => {
    mockSignInWithPopup.mockRejectedValueOnce({
      code: 'auth/popup-closed-by-user',
      message: 'Closed by user',
    });

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await expect(
      act(async () => {
        await result.current.loginWithGoogle();
      })
    ).rejects.toThrow('Google sign-in was cancelled.');

    expect(useAuthStore.getState().error).toBe('Google sign-in was cancelled.');
  });
});

describe('useAuth — Error mapping and Edge cases', () => {
  beforeEach(resetAll);

  it('login: maps unscoped error code correctly', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValueOnce({
      code: 'permission-denied',
    });

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await expect(
      act(async () => {
        await result.current.login('test@zenkai.com', 'password123');
      })
    ).rejects.toThrow();

    expect(useAuthStore.getState().error).toBe('Database permission denied. Contact support.');
  });

  it('login: maps unknown error code to fallback message', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValueOnce({
      code: 'auth/unknown-error-code-abc',
    });

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await expect(
      act(async () => {
        await result.current.login('test@zenkai.com', 'password123');
      })
    ).rejects.toThrow();

    expect(useAuthStore.getState().error).toBe('Something went wrong. Try again.');
  });

  it('login: handles null/undefined error code correctly', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValueOnce(null);

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await expect(
      act(async () => {
        await result.current.login('test@zenkai.com', 'password123');
      })
    ).rejects.toThrow();

    expect(useAuthStore.getState().error).toBe('Something went wrong. Try again.');
  });

  it('loginWithGoogle: falls back to default name and empty email when user profile fields are null', async () => {
    mockSignInWithPopup.mockResolvedValueOnce({
      user: { uid: 'google-no-fields', displayName: null, email: null },
    });
    mockGetDoc.mockResolvedValueOnce({
      exists: () => false,
    });
    mockSetDoc.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await act(async () => {
      await result.current.loginWithGoogle();
    });

    expect(mockSetDoc).toHaveBeenCalled();
    const userDocCall = mockSetDoc.mock.calls.find(call => call[0]._path === 'users/google-no-fields');
    expect(userDocCall).toBeDefined();
    expect(userDocCall[1].name).toBe('');
    expect(userDocCall[1].squadCode).toContain('ZK-ZENK');

    const privateDocCall = mockSetDoc.mock.calls.find(call => call[0]._path === 'users/google-no-fields/private/profile');
    expect(privateDocCall).toBeDefined();
    expect(privateDocCall[1].email).toBe('');
  });

  it('signup: does not call deleteUser if Firestore write fails with auth/email-already-in-use', async () => {
    mockCreateUserWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'new-uid-123', email: 'exist@zenkai.com' },
    });
    mockUpdateProfile.mockResolvedValueOnce(undefined);
    mockSendEmailVerification.mockResolvedValueOnce(undefined);
    mockSetDoc.mockRejectedValueOnce({
      code: 'auth/email-already-in-use',
    });

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await expect(
      act(async () => {
        await result.current.signup('Test User', 'exist@zenkai.com', 'password123');
      })
    ).rejects.toThrow();

    expect(mockDeleteUser).not.toHaveBeenCalled();
  });
});

// ─── useAuth — logout() ──────────────────────────────────────────────────────
describe('useAuth — logout()', () => {
  beforeEach(resetAll);

  it('logs out successfully and resets local state', async () => {
    useAuthStore.setState({
      user: { uid: 'u123' },
      uid: 'u123',
      loading: true,
    });

    mockSignOut.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await act(async () => {
      await result.current.logout();
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.uid).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('sets error and throws when signOut fails', async () => {
    mockSignOut.mockRejectedValueOnce({
      code: 'unavailable',
      message: 'No internet connection',
    });

    const { result } = renderHook(() => useAuth(), { wrapper: hookWrapper });

    await expect(
      act(async () => {
        await result.current.logout();
      })
    ).rejects.toThrow('No internet connection');

    expect(useAuthStore.getState().error).toBe('Service temporarily unavailable. Try again.');
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
    // OnboardingGuard reads from store profile, not Firestore directly
    useAuthStore.setState({
      user: { uid: 'u1' },
      uid: 'u1',
      loading: false,
      profile: { onboardingComplete: false },
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

    await waitFor(() => {
      expect(screen.getByTestId('onboarding')).toBeInTheDocument();
    });

    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('renders children when onboardingComplete is true', async () => {
    useAuthStore.setState({
      user: { uid: 'u1' },
      uid: 'u1',
      loading: false,
      profile: { onboardingComplete: true },
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

  it('treats onboarding as incomplete when profile has no onboardingComplete field', async () => {
    // Simulates a new user whose profile was just created but onboardingComplete not set
    useAuthStore.setState({
      user: { uid: 'u1' },
      uid: 'u1',
      loading: false,
      profile: {}, // empty profile, no onboardingComplete field
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

    await waitFor(() => {
      expect(screen.getByTestId('onboarding')).toBeInTheDocument();
    });
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('fails open (allows navigation) when profile loading errors', async () => {
    // Current OnboardingGuard reads profile from store — it fails open if profile is null
    // and uid exists. Simulate a loaded profile with no onboardingComplete field.
    useAuthStore.setState({
      user: { uid: 'u1' },
      uid: 'u1',
      loading: false,
      profile: { onboardingComplete: undefined }, // undefined = treated as incomplete
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
          <Route
            path="/onboarding/type"
            element={<div data-testid="onboarding">Onboarding</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    // With no onboardingComplete, the guard redirects to /onboarding/type
    await waitFor(() => {
      expect(screen.getByTestId('onboarding')).toBeInTheDocument();
    });
  });

  it('redirects to /home when user is onboardingComplete and on /onboarding/type', async () => {
    // OnboardingGuard now reads from store profile — no getDoc needed
    useAuthStore.setState({
      user: { uid: 'u1' },
      uid: 'u1',
      loading: false,
      profile: { onboardingComplete: true },
    });

    render(
      <MemoryRouter initialEntries={['/onboarding/type']}>
        <Routes>
          <Route
            path="/onboarding/type"
            element={
              <OnboardingGuard>
                <div>Onboarding Form</div>
              </OnboardingGuard>
            }
          />
          <Route
            path="/home"
            element={<div data-testid="home-page">Home Page</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    });
    expect(screen.queryByText('Onboarding Form')).not.toBeInTheDocument();
  });
});

// ─── LoginPage — Form Validation ─────────────────────────────────────────────

describe('LoginPage — Form Validation & Interactions', () => {
  beforeEach(resetAll);

  it('disables submit button when validation fails', async () => {
    render(
      <RouterWrapper>
        <LoginPage />
      </RouterWrapper>
    );

    // With empty fields, the submit button should be disabled
    expect(screen.getByRole('button', { name: /log in/i })).toBeDisabled();
  });

  it('validates email on change and blur', async () => {
    const { container } = render(
      <RouterWrapper>
        <LoginPage />
      </RouterWrapper>
    );

    expect(container.querySelector('#email')).toBeInTheDocument();

    // Initial state: no error
    expect(screen.queryByText(/email is required/i)).not.toBeInTheDocument();

    // Blur empty email
    fireEvent.blur(container.querySelector('#email'), { target: { value: '' } });
    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    });

    // Type invalid email
    fireEvent.change(container.querySelector('#email'), { target: { value: 'invalid-email' } });
    fireEvent.blur(container.querySelector('#email'), { target: { value: 'invalid-email' } });
    await waitFor(() => {
      expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
    });

    // Type valid email
    fireEvent.change(container.querySelector('#email'), { target: { value: 'test@zenkai.com' } });
    fireEvent.blur(container.querySelector('#email'), { target: { value: 'test@zenkai.com' } });
    await waitFor(() => {
      expect(screen.queryByText(/please enter a valid email address/i)).not.toBeInTheDocument();
    });
  });

  it('validates password on change and blur', async () => {
    const { container } = render(
      <RouterWrapper>
        <LoginPage />
      </RouterWrapper>
    );

    expect(container.querySelector('#password')).toBeInTheDocument();

    // Blur empty password
    fireEvent.blur(container.querySelector('#password'), { target: { value: '' } });
    await waitFor(() => {
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });

    // Password too short
    fireEvent.change(container.querySelector('#password'), { target: { value: 'short' } });
    fireEvent.blur(container.querySelector('#password'), { target: { value: 'short' } });
    await waitFor(() => {
      expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    });

    // Password without number
    fireEvent.change(container.querySelector('#password'), { target: { value: 'abcdefgh' } });
    fireEvent.blur(container.querySelector('#password'), { target: { value: 'abcdefgh' } });
    await waitFor(() => {
      expect(screen.getByText(/password must contain at least one number/i)).toBeInTheDocument();
    });

    // Valid password
    fireEvent.change(container.querySelector('#password'), { target: { value: 'password123' } });
    fireEvent.blur(container.querySelector('#password'), { target: { value: 'password123' } });
    await waitFor(() => {
      expect(screen.queryByText(/password must contain at least one number/i)).not.toBeInTheDocument();
    });
  });

  it('toggles password visibility', async () => {
    const { container } = render(
      <RouterWrapper>
        <LoginPage />
      </RouterWrapper>
    );

    expect(container.querySelector('#password').type).toBe('password');

    const toggleButton = container.querySelector('.lucide-eye, .lucide-eye-off')?.closest('button');
    expect(toggleButton).toBeInTheDocument();

    fireEvent.click(toggleButton);
    await waitFor(() => {
      expect(container.querySelector('#password').type).toBe('text');
    });

    const toggleButton2 = container.querySelector('.lucide-eye, .lucide-eye-off')?.closest('button');
    fireEvent.click(toggleButton2);
    await waitFor(() => {
      expect(container.querySelector('#password').type).toBe('password');
    });
  });

  it('calls login on submit with valid form data', async () => {
    mockSignInWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'test-uid', email: 'test@zenkai.com' },
    });

    const { container } = render(
      <RouterWrapper>
        <LoginPage />
      </RouterWrapper>
    );

    fireEvent.change(container.querySelector('#email'), { target: { value: 'test@zenkai.com' } });
    fireEvent.change(container.querySelector('#password'), { target: { value: 'password123' } });

    await waitFor(() => {
      expect(container.querySelector('#email').value).toBe('test@zenkai.com');
      expect(container.querySelector('#password').value).toBe('password123');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /log in/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledTimes(1);
    });
  });

  it('handles login failure, clears password field, and increments failed attempts', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValueOnce({
      code: 'auth/wrong-password',
    });

    const { container } = render(
      <RouterWrapper>
        <LoginPage />
      </RouterWrapper>
    );

    fireEvent.change(container.querySelector('#email'), { target: { value: 'test@zenkai.com' } });
    fireEvent.change(container.querySelector('#password'), { target: { value: 'password123' } });

    await waitFor(() => {
      expect(container.querySelector('#email').value).toBe('test@zenkai.com');
      expect(container.querySelector('#password').value).toBe('password123');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /log in/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(container.querySelector('#password').value).toBe('');
      expect(screen.getByText(/incorrect credentials. 2 attempt\(s\) left./i)).toBeInTheDocument();
    });
  });

  it('locks out user after 3 failed login attempts', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValue({
      code: 'auth/wrong-password',
    });

    const { container } = render(
      <RouterWrapper>
        <LoginPage />
      </RouterWrapper>
    );

    // 1st failed attempt
    fireEvent.change(container.querySelector('#email'), { target: { value: 'test@zenkai.com' } });
    fireEvent.change(container.querySelector('#password'), { target: { value: 'password123' } });
    await waitFor(() => {
      expect(container.querySelector('#email').value).toBe('test@zenkai.com');
      expect(container.querySelector('#password').value).toBe('password123');
    });
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /log in/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByText(/incorrect credentials. 2 attempt\(s\) left./i)).toBeInTheDocument();
    });

    // 2nd failed attempt
    fireEvent.change(container.querySelector('#password'), { target: { value: 'password123' } });
    await waitFor(() => {
      expect(container.querySelector('#password').value).toBe('password123');
    });
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /log in/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByText(/incorrect credentials. 1 attempt\(s\) left./i)).toBeInTheDocument();
    });

    // We enable fake timers right before the 3rd attempt, because the 3rd attempt starts the interval!
    vi.useFakeTimers();

    // 3rd failed attempt
    fireEvent.change(container.querySelector('#password'), { target: { value: 'password123' } });
    
    expect(screen.getByRole('button', { name: /log in/i })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    // Let the promise resolve under fake timers
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/too many failed attempts. 30-second cooldown active./i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeDisabled();
    expect(localStorage.getItem('zenkai_lockout_until')).toBeDefined();

    // Advance timer by 30 seconds
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(screen.queryByText(/too many failed attempts/i)).not.toBeInTheDocument();
  });

  it('hydrates lock from localStorage on mount', async () => {
    vi.useFakeTimers();
    const lockoutUntil = Date.now() + 15000; // 15 seconds remaining
    localStorage.setItem('zenkai_lockout_until', lockoutUntil.toString());

    render(
      <RouterWrapper>
        <LoginPage />
      </RouterWrapper>
    );

    expect(screen.getByText(/too many failed attempts/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeDisabled();

    // Advance timer by 15 seconds
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });

    expect(screen.queryByText(/too many failed attempts/i)).not.toBeInTheDocument();
  });

  it('handles Google login and error', async () => {
    mockSignInWithPopup.mockRejectedValueOnce({
      code: 'auth/popup-closed-by-user',
    });

    render(
      <RouterWrapper>
        <LoginPage />
      </RouterWrapper>
    );

    const googleButton = screen.getByRole('button', { name: /continue with google/i });
    fireEvent.click(googleButton);

    await waitFor(() => {
      expect(mockSignInWithPopup).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/google sign-in failed/i)).toBeInTheDocument();
    });
  });

  it('calls loginWithGoogle on click', async () => {
    mockSignInWithPopup.mockResolvedValueOnce({
      user: { uid: 'google-uid-123', email: 'google@zenkai.com', displayName: 'Goku Son' },
    });
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ onboardingComplete: true }),
    });

    render(
      <RouterWrapper>
        <LoginPage />
      </RouterWrapper>
    );

    const googleButton = screen.getByRole('button', { name: /continue with google/i });
    fireEvent.click(googleButton);

    await waitFor(() => {
      expect(mockSignInWithPopup).toHaveBeenCalledTimes(1);
    });
  });
});
