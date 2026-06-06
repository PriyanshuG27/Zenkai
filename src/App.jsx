import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { useAuthStore } from './stores/authStore';
import { useDeviceLayout } from './hooks/useDeviceLayout';
import { useUIStore } from './stores/useUIStore';

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
import { OnboardingPage } from './components/shared/OnboardingPage';
import { PWAInstallModal } from './components/shared/PWAInstallModal';
import { PWAInstallBanner } from './components/shared/PWAInstallBanner';

// Mobile Screens
import { MobileHome }           from './components/mobile/MobileHome';
import { MobileLogger }         from './components/mobile/MobileLogger';
import { MobileSessionComplete } from './components/mobile/MobileSessionComplete';
import { MobileProgress }       from './components/mobile/MobileProgress';
import { MobilePlan }           from './components/mobile/MobilePlan';
import { MobileChallenges }     from './components/mobile/MobileChallenges';
import { MobileProfile }        from './components/mobile/MobileProfile';

// Desktop Screens
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
  const OnboardingScreen  = OnboardingPage;
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
  const { setUser, setLoading, setProfile } = useAuthStore();
  const { setPwaDeferredPrompt, setIsStandalone, setIsIOS } = useUIStore();

  // layout is detected ONCE at root — 'mobile' | 'desktop'
  // Debounced resize listener inside the hook (100ms) prevents thrash.
  // Both layout trees share the same BrowserRouter context below.
  const layout = useDeviceLayout();

  // Listen for PWA installation events globally
  useEffect(() => {
    // Detect standalone mode
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    setIsStandalone(!!isStandaloneMode);

    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(isIOSDevice);

    // PWA install event listener
    const handleInstallPrompt = (e) => {
      e.preventDefault();
      setPwaDeferredPrompt(e);
    };

    // Fired when the app is successfully installed
    const handleAppInstalled = () => {
      console.log('[PWA] App installed successfully');
      setIsStandalone(true);
      setPwaDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [setPwaDeferredPrompt, setIsStandalone, setIsIOS]);

  // Single onAuthStateChanged — source of truth for session persistence.
  // Firebase IndexedDB keeps the session across refreshes (no logout on F5).
  // Uses onSnapshot for real-time profile data updates (e.g. XP & streak increments).
  useEffect(() => {
    let unsubProfile = null;
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ?? null);
      if (firebaseUser) {
        setLoading(true);
        unsubProfile = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          (snap) => {
            if (snap.exists()) {
              setProfile(snap.data());
            } else {
              setProfile(null);
            }
            setLoading(false);
          },
          (err) => {
            console.error('[App] Error in real-time profile listener:', err);
            setLoading(false);
          }
        );
      } else {
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = null;
        }
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubProfile) {
        unsubProfile();
      }
    };
  }, [setUser, setLoading, setProfile]);

  return (
    // ONE BrowserRouter — both MobileApp and DesktopApp share this router context.
    // Swapping layout shells (on resize) does NOT reset router state.
    <BrowserRouter>
      <AppRoutes layout={layout} />
      <PWAInstallBanner />
      <PWAInstallModal />
    </BrowserRouter>
  );
}

export default App;
