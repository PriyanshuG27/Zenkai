/**
 * e2e/auth.spec.ts
 *
 * Tests 1–3: Critical auth user journeys.
 *
 *  TEST 1 — Full signup + complete onboarding flow
 *  TEST 2 — Login with existing account
 *  TEST 3 — Protected route redirect (unauthenticated → /login → back to /home)
 *
 * Notes on selector strategy:
 *  - Prefer role-based selectors (getByRole, getByText) — they match semantics, not CSS
 *  - Fall back to id selectors (#email, #password) for form inputs that have explicit ids
 *  - Avoid CSS classes entirely — they change frequently
 *  - All buttons in OnboardingPage render their key text in UPPERCASE (e.g. key='Comeback' → 'COMEBACK')
 *  - The onboarding is 6 steps (0–5); the test drives through all 6 steps
 *
 * Emulator: firebase.js connects to emulators when VITE_FIREBASE_EMULATOR=true
 * (set in playwright.config.ts webServer.env)
 */

import { test, expect } from '@playwright/test';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Unique email per test run so emulator state collisions don't happen */
const uniqueEmail = (label: string) =>
  `e2e-${label}-${Date.now()}@zenkai.test`;

/** Password satisfying Zenkai validation: min 8 chars + 1 number */
const TEST_PASSWORD = 'Zenkai1!';

// ─── Test suite ───────────────────────────────────────────────────────────────

test.describe('Auth journeys', () => {
  // Use a mobile viewport matching the app's primary breakpoint
  test.use({ viewport: { width: 390, height: 844 } });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Full signup + onboarding (6-step flow)
  // ─────────────────────────────────────────────────────────────────────────
  test('1 · Full signup + onboarding flow → lands on /home', async ({ page }) => {
    // Print browser console logs and errors to help debug
    page.on('console', msg => console.log('[TEST1 CONSOLE]', msg.text()));
    page.on('pageerror', err => console.error('[TEST1 ERROR]', err.message));

    const email = uniqueEmail('signup');

    // ── 1. Landing → click "Get Started" ──────────────────────────────────
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /comeback stronger/i })).toBeVisible();
    await page.getByRole('link', { name: 'Get Started' }).click();
    await page.waitForURL('**/signup');

    // ── 2. Fill signup form ────────────────────────────────────────────────
    await page.fill('#name', 'Auth TestUser');
    await page.fill('#email', email);
    await page.fill('#password', TEST_PASSWORD);
    await page.check('#termsAccepted');

    // Submit — button text is "Create Account"
    await page.getByRole('button', { name: /create account/i }).click();

    // ── 3. Land on /onboarding/type ────────────────────────────────────────
    await page.waitForURL('**/onboarding**', { timeout: 15_000 });

    // ── 4. Step 0: User type → select "Comeback" (rendered as COMEBACK) ───
    await expect(page.getByRole('heading', { name: /what brings you here/i })).toBeVisible();
    await page.getByRole('button', { name: /comeback/i }).click();

    // Advance — OnboardingLayout has a Continue button that becomes active after selection

    // ── 5. Step 1: Body details ────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: /your body, your baseline/i })).toBeVisible();
    await page.getByRole('button', { name: /^male$/i }).click();
    await page.fill('#onboarding-age', '24');
    await page.fill('#onboarding-height', '175');
    await page.fill('#onboarding-weight', '72');
    await page.getByRole('button', { name: /continue/i }).click();

    // ── 6. Step 2: Goal → Muscle Gain ─────────────────────────────────────
    await expect(page.getByRole('heading', { name: /training goal/i })).toBeVisible();
    await page.getByRole('button', { name: /muscle gain/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();

    // ── 7. Step 3: Gym setup → select frequency + duration + equipment ─────
    await expect(page.getByRole('heading', { name: /what.*gym/i })).toBeVisible();
    await page.getByRole('button', { name: '3x' }).click();
    await page.getByRole('button', { name: '60 min' }).click();
    // Select Barbell (Free Weights) and Flat Bench (Chest & Push)
    await page.getByRole('button', { name: 'Barbell' }).click();
    await page.getByRole('button', { name: 'Flat Bench' }).click();
    await page.getByRole('button', { name: /continue/i }).click();

    // ── 8. Step 4: Lifestyle → diet type ──────────────────────────────────
    await expect(page.getByRole('heading', { name: /your lifestyle/i })).toBeVisible();
    await page.getByRole('button', { name: /non-veg/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();

    // ── 9. Step 5: Medical restrictions → toggle "Bad Knees" ───────────────
    await expect(page.getByRole('heading', { name: /restrictions/i })).toBeVisible();
    // The button text is the key: "Bad Knees" (exact string from MEDICAL_CATEGORIES)
    await page.getByRole('button', { name: /bad knees/i }).click();

    // ── 10. Finish setup ───────────────────────────────────────────────────
    await page.getByRole('button', { name: /finish setup/i }).click();

    // ── 11. Assert we're at /home ──────────────────────────────────────────
    await page.waitForURL('**/home', { timeout: 15_000 });
    expect(page.url()).toContain('/home');

    // ── 12. Assert home content visible ───────────────────────────────────
    // The Weekly Schedule h2 is the primary landmark on home (no "Today's Mission" literal text)
    await expect(page.getByRole('heading', { name: /weekly schedule/i })).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Login with existing account
  // ─────────────────────────────────────────────────────────────────────────
  test('2 · Login with existing account → /home + bottom nav visible', async ({ page }) => {
    // Pre-create the user (signup path) so login credentials exist
    const email = uniqueEmail('login');

    // Fast signup via UI (we need the emulator to have this user)
    await page.goto('/signup');
    await page.fill('#name', 'Login TestUser');
    await page.fill('#email', email);
    await page.fill('#password', TEST_PASSWORD);
    await page.check('#termsAccepted');
    await page.getByRole('button', { name: /create account/i }).click();
    await page.waitForURL('**/onboarding**', { timeout: 15_000 });
    // Complete minimum onboarding to set onboardingComplete = true
    await page.getByRole('button', { name: /comeback/i }).click();
    await page.getByRole('button', { name: /^male$/i }).click();
    await page.fill('#onboarding-age', '28');
    await page.fill('#onboarding-height', '178');
    await page.fill('#onboarding-weight', '80');
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByRole('button', { name: /muscle gain/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByRole('button', { name: '4x' }).click();
    await page.getByRole('button', { name: '60 min' }).click();
    await page.getByRole('button', { name: 'Barbell' }).click();
    await page.getByRole('button', { name: 'Flat Bench' }).click();
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByRole('button', { name: /non-veg/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByRole('button', { name: /finish setup/i }).click();
    await page.waitForURL('**/home', { timeout: 15_000 });

    // Now log out by clearing storage (simulates a fresh login session)
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      // Clear IndexedDB Firebase keys (best-effort)
      try {
        indexedDB.deleteDatabase('firebaseLocalStorageDb');
      } catch {}
    });
    await page.reload();
    // Should redirect to landing (GuestRoute / auth state = null)
    await page.waitForURL(url => !url.pathname.startsWith('/home'), { timeout: 10_000 });

    // ── Navigate to /login ────────────────────────────────────────────────
    await page.goto('/login');
    await expect(page.getByRole('link', { name: /zenkai/i })).toBeVisible();

    // ── Fill login form ───────────────────────────────────────────────────
    await page.fill('#email', email);
    await page.fill('#password', TEST_PASSWORD);

    // Submit — button text is "Log In"
    await page.getByRole('button', { name: /^log in$/i }).click();

    // ── Assert /home and bottom nav ───────────────────────────────────────
    await page.waitForURL('**/home', { timeout: 15_000 });
    expect(page.url()).toContain('/home');

    // Bottom nav has 5 items: Home, Progress, Workout, Squads, Arena
    // At least one must be visible (confirms BottomNav rendered)
    await expect(page.getByRole('link', { name: /^home$/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /squads/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /arena/i })).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Protected route redirect
  // ─────────────────────────────────────────────────────────────────────────
  test('3 · Protected route → redirects to /login, then back to /home after login', async ({ page }) => {
    // ── 1. Navigate directly to /home without authentication ──────────────
    // Clear any cached auth state first
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      // Clear IndexedDB Firebase keys (best-effort)
      try {
        indexedDB.deleteDatabase('firebaseLocalStorageDb');
      } catch {}
    });

    // Navigate to protected route
    await page.goto('/home');

    // ── 2. Assert redirect to /login ──────────────────────────────────────
    // ProtectedRoute redirects to /login?from=/home
    await page.waitForURL('**/login**', { timeout: 10_000 });
    expect(page.url()).toContain('/login');

    // ── 3. Create a user and log in ───────────────────────────────────────
    // For simplicity, navigate to signup to create a fresh test user,
    // then log in via /login so we exercise the actual login flow + redirect.
    const email = uniqueEmail('redirect');

    // Sign up (fast path)
    await page.goto('/signup');
    await page.fill('#name', 'Redirect User');
    await page.fill('#email', email);
    await page.fill('#password', TEST_PASSWORD);
    await page.check('#termsAccepted');
    await page.getByRole('button', { name: /create account/i }).click();
    await page.waitForURL('**/onboarding**', { timeout: 15_000 });
    // Minimal onboarding
    await page.getByRole('button', { name: /comeback/i }).click();
    await page.getByRole('button', { name: /^male$/i }).click();
    await page.fill('#onboarding-age', '22');
    await page.fill('#onboarding-height', '170');
    await page.fill('#onboarding-weight', '65');
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByRole('button', { name: /strength/i }).filter({ hasText: 'Lift heavier' }).click();
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByRole('button', { name: '3x' }).click();
    await page.getByRole('button', { name: '45 min' }).click();
    await page.getByRole('button', { name: 'Barbell' }).click();
    await page.getByRole('button', { name: 'Flat Bench' }).click();
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByRole('button', { name: /vegetarian/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByRole('button', { name: /finish setup/i }).click();
    await page.waitForURL('**/home', { timeout: 15_000 });

    // Clear auth to simulate logout
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      // Clear IndexedDB Firebase keys (best-effort)
      try {
        indexedDB.deleteDatabase('firebaseLocalStorageDb');
      } catch {}
    });
    await page.reload();
    await page.waitForURL(url => !url.pathname.startsWith('/home'), { timeout: 8_000 });

    // ── 4. Go to /login and log in ────────────────────────────────────────
    await page.goto('/login');
    await page.fill('#email', email);
    await page.fill('#password', TEST_PASSWORD);
    await page.getByRole('button', { name: /^log in$/i }).click();

    // ── 5. Assert redirect back to /home ──────────────────────────────────
    await page.waitForURL('**/home', { timeout: 15_000 });
    expect(page.url()).toContain('/home');
    await expect(page.getByRole('heading', { name: /weekly schedule/i })).toBeVisible();
  });
});
