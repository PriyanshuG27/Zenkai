import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase';
import { useAuthStore } from './stores/authStore';
import { useDeviceLayout } from './hooks/useDeviceLayout';

// Layout Shells
import { MobileApp }  from './components/mobile/MobileApp';
import { DesktopApp } from './components/desktop/DesktopApp';

// Route Guards
import { GuestRoute }      from './components/shared/GuestRoute';
import { ProtectedRoute }  from './components/shared/ProtectedRoute';
import { OnboardingGuard } from './components/shared/OnboardingGuard';

// Shared Screens (responsive, not layout-specific)
import { LandingPage } from './components/shared/LandingPage';
import { LoginPage }   from './components/shared/LoginPage';
import { SignupPage }  from './components/shared/SignupPage';

// Mobile Screens
import { MobileOnboarding }     from './components/mobile/MobileOnboarding';
import { MobileHome }           from './components/mobile/MobileHome';
import { MobileLogger }         from './components/mobile/MobileLogger';
import { MobileSessionComplete } from './components/mobile/MobileSessionComplete';
import { MobileProgress }       from './components/mobile/MobileProgress';
import { MobilePlan }           from './components/mobile/MobilePlan';
import { MobileChallenges }     from './components/mobile/MobileChallenges';
import { MobileProfile }        from './components/mobile/MobileProfile';

// Desktop Screens
import { DesktopOnboarding } from './components/desktop/DesktopOnboarding';
import { DesktopDashboard }  from './components/desktop/DesktopDashboard';
import { DesktopLoggerPanel } from './components/desktop/DesktopLoggerPanel';
import { DesktopProgress }   from './components/desktop/DesktopProgress';
import { DesktopPlan }       from './components/desktop/DesktopPlan';
import { DesktopChallenges } from './components/desktop/DesktopChallenges';
import { DesktopProfile }    from './components/desktop/DesktopProfile';

// ─── Inner router tree — reads layout from parent ────────────────────────────
// Defined inside BrowserRouter so hooks that need router context work correctly.
// layout is passed as a prop (not re-detected here) to avoid a second listener.
function AppRoutes({ layout }) {
  const isMobile = layout === 'mobile';

  // Layout shell used as the parent element for protected core routes
  const LayoutShell = isMobile ? MobileApp : DesktopApp;

  // Onboarding component picks based on layout
  const OnboardingScreen  = isMobile ? MobileOnboarding  : DesktopOnboarding;
  const HomeScreen        = isMobile ? MobileHome        : DesktopDashboard;
  const WorkoutScreen     = isMobile ? MobileLogger      : DesktopLoggerPanel;
  const CompleteScreen    = isMobile ? MobileSessionComplete : DesktopDashboard;
  const ProgressScreen    = isMobile ? MobileProgress    : DesktopProgress;
  const PlanScreen        = isMobile ? MobilePlan        : DesktopPlan;
  const ChallengesScreen  = isMobile ? MobileChallenges  : DesktopChallenges;
  const ProfileScreen     = isMobile ? MobileProfile     : DesktopProfile;

  return (
    <Routes>
      {/* ── Public routes — no auth required ───────────────────────────── */}
      <Route path="/" element={<GuestRoute><LandingPage /></GuestRoute>} />
      <Route path="/login"  element={<GuestRoute><LoginPage /></GuestRoute>} />
      <Route path="/signup" element={<GuestRoute><SignupPage /></GuestRoute>} />

      {/* ── Onboarding — protected but NOT guarded by OnboardingGuard ───── */}
      {/* Steps are managed by local state (no sub-routes), so no wildcard needed */}
      <Route
        path="/onboarding/type"
        element={
          <ProtectedRoute>
            <OnboardingScreen />
          </ProtectedRoute>
        }
      />

      {/* ── Core app routes ─────────────────────────────────────────────── */}
      {/* ProtectedRoute: blocks unauthenticated users → /login (with from) */}
      {/* OnboardingGuard: blocks users with incomplete profile → /onboarding */}
      <Route
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <LayoutShell />
            </OnboardingGuard>
          </ProtectedRoute>
        }
      >
        <Route path="/home"             element={<HomeScreen />} />
        <Route path="/workout"          element={<WorkoutScreen />} />
        <Route path="/workout/complete" element={<CompleteScreen />} />
        <Route path="/progress"         element={<ProgressScreen />} />
        <Route path="/plan"             element={<PlanScreen />} />
        <Route path="/challenges"       element={<ChallengesScreen />} />
        <Route path="/profile"          element={<ProfileScreen />} />
      </Route>

      {/* ── Catch-all ────────────────────────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────
function App() {
  const { setUser, setLoading } = useAuthStore();

  // layout is detected ONCE at root — 'mobile' | 'desktop'
  // Debounced resize listener inside the hook (100ms) prevents thrash.
  // Both layout trees share the same BrowserRouter context below.
  const layout = useDeviceLayout();

  // Single onAuthStateChanged — source of truth for session persistence.
  // Firebase IndexedDB keeps the session across refreshes (no logout on F5).
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ?? null);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    // ONE BrowserRouter — both MobileApp and DesktopApp share this router context.
    // Swapping layout shells (on resize) does NOT reset router state.
    <BrowserRouter>
      <AppRoutes layout={layout} />
    </BrowserRouter>
  );
}

export default App;
