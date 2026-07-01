import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for Zenkai
 *
 * Strategy:
 *  - Chromium only (sufficient for CI, covers Chrome + Edge + modern Android webview)
 *  - Mobile viewport by default (app is mobile-first)
 *  - Dev server started automatically for `test:e2e`
 *  - Firebase emulator used — never hits production
 *  - storageState for pre-authenticated tests (avoids repeating login in every workout test)
 *
 * Run locally:  npm run test:e2e
 * Run in CI:    PLAYWRIGHT_CI=true npm run test:e2e
 */

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,          // 30s per test (matches spec)
  expect: { timeout: 8_000 },
  fullyParallel: false,     // auth state is shared; sequential is safer
  retries: process.env.CI ? 1 : 0,
  workers: 1,               // single worker keeps emulator state predictable
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'on-failure' }]],

  use: {
    baseURL: 'http://localhost:5183',
    // iPhone 14 Pro viewport — matches the mobile layout breakpoint
    ...devices['iPhone 14 Pro'],
    defaultBrowserType: 'chromium',
    launchOptions: {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
    // Emulator env — overrides any production values
    extraHTTPHeaders: {},
    // Record trace on first retry for easier CI debugging
    trace: 'on-first-retry',
    // Screenshot on failure
    screenshot: 'only-on-failure',
    // Emulator: pass env var so firebase.js uses emulator endpoints
    // The dev server reads process.env; Vite exposes VITE_ prefixed vars
  },

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  projects: [
    {
      name: 'chromium-mobile',
      use: {
        ...devices['iPhone 14 Pro'],
        defaultBrowserType: 'chromium',
      },
    },
  ],

  // Start the Vite dev server and Express backend server before running tests
  webServer: [
    {
      command: 'npm run dev -- --port 5183',
      url: 'http://localhost:5183',
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        // Tell firebase.js to connect to emulators, not production
        VITE_FIREBASE_EMULATOR: 'true',
        VITE_FIREBASE_PROJECT_ID: 'fitdesi-74283',
      },
    },
    {
      command: 'npm --prefix backend start',
      url: 'http://localhost:10000/ping',
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        VITE_FIREBASE_EMULATOR: 'true',
        VITE_FIREBASE_PROJECT_ID: 'fitdesi-74283',
        PORT: '10000',
        ALLOWED_ORIGINS: 'http://localhost:5183',
        REDIS_URL: '', // Bypass external Redis to avoid auth/connection issues during E2E
      },
    },
  ],
});
