import React, { useEffect, Component } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useXPStore } from './stores/useXPStore';
import { useDeviceLayout } from './hooks/useDeviceLayout';
import { useUIStore } from './stores/useUIStore';
import { useFCM } from './hooks/useFCM';
import { deriveLevelFromXP } from './lib/xpHelpers';


// ─── Global Error Boundary ────────────────────────────────────────────────────
// Catches any unhandled React render error and shows a recovery screen
// instead of the entire app going blank (white screen of death).
// Detects errors caused by stale JS chunks after a new deploy (PWA resuming from background).
function isChunkLoadError(error) {
  if (!error) return false;
  const msg = error.message || '';
  return (
    error.name === 'ChunkLoadError' ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk')
  );
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, isChunkError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      // Chunk load errors are caused by stale PWA cache after a new deploy.
      // Show a friendly "new version available" prompt instead of a generic error.
      if (this.state.isChunkError) {
        return (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100dvh',
            background: '#0a0a0a', color: '#f0f0f0', fontFamily: 'sans-serif',
            gap: '12px', padding: '24px', textAlign: 'center'
          }}>
            <span style={{ fontSize: '2.5rem' }}>🚀</span>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>New version available!</h1>
            <p style={{ fontSize: '0.85rem', color: '#888', margin: 0 }}>
              Zenkai was updated in the background. Tap below to load the latest version.
            </p>
            <button
              onClick={() => {
                sessionStorage.removeItem('chunk_reload_attempted');
                window.location.reload();
              }}
              style={{
                marginTop: '8px', padding: '12px 28px',
                background: '#FF5C00', color: '#fff', border: 'none',
                borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '1rem'
              }}
            >
              Update Now ✨
            </button>
          </div>
        );
      }

      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100dvh',
          background: '#0a0a0a', color: '#f0f0f0', fontFamily: 'sans-serif',
          gap: '16px', padding: '24px', textAlign: 'center'
        }}>
          <span style={{ fontSize: '2rem' }}>⚠️</span>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: '0.85rem', color: '#888', margin: 0 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '8px', padding: '10px 24px',
              background: '#FF5C00', color: '#fff', border: 'none',
              borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem'
            }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Helper to automatically reload the page if a chunk fetch fails (e.g. after a new deploy).
// Uses sessionStorage to track if a reload was already attempted this session,
// preventing an infinite reload loop when the chunk is genuinely missing.
function safeLazy(importFn) {
  return React.lazy(async () => {
    try {
      return await importFn();
    } catch (error) {
      const alreadyReloaded = sessionStorage.getItem('chunk_reload_attempted') === 'true';
      if (!alreadyReloaded) {
        console.warn('[safeLazy] Chunk load failed — attempting one reload to pick up new deploy:', error.message);
        sessionStorage.setItem('chunk_reload_attempted', 'true');
        window.location.reload();
        return new Promise(() => {}); // Suspend until reload
      }
      // Already tried a reload — let the ErrorBoundary handle it gracefully.
      console.error('[safeLazy] Chunk load failed after reload attempt. Propagating to ErrorBoundary:', error.message);
      throw error;
    }
  });
}

// Layout Shells
const MobileApp = safeLazy(() => import('./components/mobile/MobileApp'));
const DesktopApp = safeLazy(() => import('./components/desktop/DesktopApp'));

// Route Guards
import { GuestRoute }      from './components/shared/GuestRoute';
import { ProtectedRoute, AuthSpinner }  from './components/shared/ProtectedRoute';
import { OnboardingGuard } from './components/shared/OnboardingGuard';
import { writeProfileCache, readProfileCache } from './stores/authStore';

// Shared Screens — lazy-loaded so they don't inflate the main JS chunk
// that every logged-in user downloads on every page visit.
const LandingPage      = safeLazy(() => import('./components/shared/LandingPage').then(m => ({ default: m.LandingPage })));
const LoginPage        = safeLazy(() => import('./components/shared/LoginPage').then(m => ({ default: m.LoginPage })));
const SignupPage       = safeLazy(() => import('./components/shared/SignupPage').then(m => ({ default: m.SignupPage })));
import { PWAInstallModal } from './components/shared/PWAInstallModal';
import { PWAInstallBanner } from './components/shared/PWAInstallBanner';
import { ToastStack } from './components/shared/ToastStack';

const OnboardingPage = safeLazy(() => import('./components/shared/OnboardingPage'));

const MobileHome = safeLazy(() => import('./components/mobile/MobileHome').then(m => ({ default: m.MobileHome })));
const MobileLogger = safeLazy(() => import('./components/mobile/MobileLogger').then(m => ({ default: m.MobileLogger })));
const MobileSessionComplete = safeLazy(() => import('./components/mobile/MobileSessionComplete').then(m => ({ default: m.MobileSessionComplete })));

const MobileProgress = safeLazy(() => import('./components/mobile/MobileProgress'));
const MobilePlan = safeLazy(() => import('./components/mobile/MobilePlan'));
const MobileChallenges = safeLazy(() => import('./components/mobile/MobileChallenges'));
const MobileProfile = safeLazy(() => import('./components/mobile/MobileProfile'));

// Desktop Screens — lazy-loaded; desktop users hit /home which loads DesktopApp
const DesktopDashboard = safeLazy(() => import('./components/desktop/DesktopDashboard').then(m => ({ default: m.DesktopDashboard })));

const SquadMatchmaker = safeLazy(() => import('./components/desktop/SquadMatchmaker').then(m => ({ default: m.SquadMatchmaker })));
const DesktopLogEditor = safeLazy(() => import('./components/desktop/DesktopLogEditor').then(m => ({ default: m.DesktopLogEditor })));
const PosterStudio = safeLazy(() => import('./components/desktop/PosterStudio').then(m => ({ default: m.PosterStudio })));
const AuraForecaster = safeLazy(() => import('./components/desktop/AuraForecaster').then(m => ({ default: m.AuraForecaster })));
const SundayMagazine = safeLazy(() => import('./components/desktop/SundayMagazine').then(m => ({ default: m.SundayMagazine })));
const DesktopProfile = safeLazy(() => import('./components/desktop/DesktopProfile'));

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
  const WorkoutScreen     = isMobile ? MobileLogger      : () => <Navigate to="/home" replace />;
  const CompleteScreen    = isMobile ? MobileSessionComplete : DesktopDashboard;
  const ProgressScreen    = MobileProgress;
  const PlanScreen        = isMobile ? MobilePlan        : () => <Navigate to="/home" replace />;
  const ChallengesScreen  = isMobile ? MobileChallenges  : SquadMatchmaker;
  const SquadsScreen      = SquadMatchmaker;
  const ProfileScreen     = isMobile ? MobileProfile     : DesktopProfile;

  return (
    <React.Suspense fallback={<AuthSpinner label="Loading Section..." />}>
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
              <OnboardingGuard>
                <OnboardingScreen />
              </OnboardingGuard>
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
          <Route path="/squads"           element={<SquadsScreen />} />
          <Route path="/profile"          element={<ProfileScreen />} />
          {!isMobile && (
            <>
              <Route path="/recap"          element={<DesktopLogEditor />} />
              <Route path="/poster"         element={<PosterStudio />} />
              <Route path="/aura-forecaster" element={<AuraForecaster />} />
              <Route path="/magazine"       element={<SundayMagazine />} />
            </>
          )}
        </Route>

        {/* ── Catch-all ────────────────────────────────────────────────────── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </React.Suspense>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────
function App() {
  const { setUser, setLoading, setProfile, clearAuth } = useAuthStore();
  const { setPwaDeferredPrompt, setIsStandalone, setIsIOS, addToast } = useUIStore();

  // layout is detected ONCE at root — 'mobile' | 'desktop'
  // Debounced resize listener inside the hook (100ms) prevents thrash.
  // Both layout trees share the same BrowserRouter context below.
  const layout = useDeviceLayout();

  // FCM Web Push — requests permission after login & saves device token to Firestore
  useFCM();

  // Show app version update toast
  useEffect(() => {
    const hasSeenUpdate = localStorage.getItem('zenkai_seen_update_v1_1') === 'true';
    if (!hasSeenUpdate) {
      const timer = setTimeout(() => {
        addToast(
          "⚡ Zenkai v1.1 Update: New profile settings & reminders are live! Check your Profile.",
          "info"
        );
        localStorage.setItem('zenkai_seen_update_v1_1', 'true');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [addToast]);

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

    // Clear any stale chunk-reload flag after a 5-second delay once the app boots successfully.
    // This prevents immediate consecutive reloads (infinite reload loops) if a chunk fails to load.
    const timer = setTimeout(() => {
      sessionStorage.removeItem('chunk_reload_attempted');
    }, 5000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearTimeout(timer);
    };
  }, [setPwaDeferredPrompt, setIsStandalone, setIsIOS]);



  // Single onAuthStateChanged — source of truth for session persistence.
  // Firebase IndexedDB keeps the session across refreshes (no logout on F5).
  // Uses onSnapshot for real-time profile data updates (e.g. XP & streak increments).
  useEffect(() => {
    let unsubAuth = null;
    let unsubProfile = null;
    let isActive = true;

    async function initFirebaseListener() {
      try {
        const { auth, db } = await import('./lib/firebase');
        const { onAuthStateChanged } = await import('firebase/auth');
        const { doc, onSnapshot } = await import('firebase/firestore');

        if (!isActive) return;

        unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
          setUser(firebaseUser ?? null);
          if (firebaseUser) {
          // ── SWR fast-path ──────────────────────────────────────────────
          // If we already have a cached profile in localStorage we can skip
          // setLoading(true) entirely.  The Firestore onSnapshot below will
          // update the store in the background (Stale-While-Revalidate).
          // Without this, every returning user sees a full-screen AuthSpinner
          // for ~3s while Firebase resolves — the #1 LCP killer.
          const hasCachedProfile = readProfileCache() !== null;
          if (!hasCachedProfile) {
            setLoading(true);
          }

            
            let publicData = null;
            let privateData = null;
            let publicLoaded = false;
            let privateLoaded = false;

            const updateMergedProfile = () => {
              if (publicData) {
                const merged = { ...publicData, ...(privateData || {}) };
                setProfile(merged);
                // Persist to localStorage so the next page load hydrates instantly (SWR)
                writeProfileCache(merged);
                // Sync XP store with real-time profile data on mount & updates
                useXPStore.getState().setXP(
                  publicData.xp ?? 0,
                  publicData.cumulativeXP ?? publicData.xp ?? 0,
                  publicData.streak ?? 0
                );
              } else {
                setProfile(null);
              }
              if (publicLoaded) {
                setLoading(false);
              }
            };

            const publicRef = doc(db, 'users', firebaseUser.uid);
            const privateRef = doc(db, 'users', firebaseUser.uid, 'private', 'profile');

            const unsubPublic = onSnapshot(
              publicRef,
              (snap) => {
                publicLoaded = true;
                if (snap.exists()) {
                  const data = snap.data();
                  publicData = data;
                  
                  // Auto-initialize / heal cumulativeXP and correct any past level corruption
                  if (data.cumulativeXP === undefined || data.cumulativeXP < (data.xp ?? 0)) {
                    (async () => {
                      try {
                        const { getDocs, collection, updateDoc } = await import('firebase/firestore');
                        const xpLogCol = collection(db, 'users', firebaseUser.uid, 'xpLog');
                        const xpLogSnap = await getDocs(xpLogCol);
                        
                        let calculatedCumulative = 0;
                        xpLogSnap.forEach((logDoc) => {
                          calculatedCumulative += (logDoc.data().amount || 0);
                        });
                        
                        // Fallback to current xp if calculated is lower (e.g. legacy user with incomplete logs)
                        const finalCumulative = Math.max(data.xp || 0, calculatedCumulative);
                        const derived = deriveLevelFromXP(finalCumulative);
                        
                        await updateDoc(publicRef, {
                          cumulativeXP: finalCumulative,
                          level: derived.level,
                          levelName: derived.levelName
                        });
                        
                        console.log(`[App] Initialized cumulativeXP to ${finalCumulative} (Level ${derived.level}) for user ${firebaseUser.uid}`);
                      } catch (migrationErr) {
                        console.warn('[App] Failed to migrate/initialize cumulativeXP:', migrationErr);
                      }
                    })();
                  }
                } else {
                  publicData = null;
                }
                updateMergedProfile();
              },
              (err) => {
                console.error('[App] Error in public profile listener:', err);
                publicLoaded = true;
                updateMergedProfile();
              }
            );

            const unsubPrivate = onSnapshot(
              privateRef,
              (snap) => {
                privateLoaded = true;
                if (snap.exists()) {
                  privateData = snap.data();
                } else {
                  privateData = null;
                }
                updateMergedProfile();
              },
              (err) => {
                console.error('[App] Error in private profile listener:', err);
                privateLoaded = true;
                privateData = null;
                updateMergedProfile();
              }
            );

            unsubProfile = () => {
              unsubPublic();
              unsubPrivate();
            };
          } else {
            if (unsubProfile) {
              unsubProfile();
              unsubProfile = null;
            }
            clearAuth();
          }
        });
      } catch (err) {
        console.error('[App] Failed to initialize Firebase listener dynamically:', err);
        setLoading(false);
      }
    }

    initFirebaseListener();

    return () => {
      isActive = false;
      if (unsubAuth) unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, [setUser, setLoading, setProfile]);

  return (
    <ErrorBoundary>
      {/* ONE BrowserRouter — both MobileApp and DesktopApp share this router context. */}
      {/* Swapping layout shells (on resize) does NOT reset router state. */}
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes layout={layout} />
        <PWAInstallBanner />
        <PWAInstallModal />
        <ToastStack />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
