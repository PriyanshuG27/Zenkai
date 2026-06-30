/**
 * e2e/global-setup.ts
 *
 * Runs ONCE before all Playwright tests.
 *
 * Responsibilities:
 *  1. Verify Firebase Auth emulator is reachable (port 9099)
 *  2. Clear emulator state from a previous run (idempotent)
 *  3. Create a persistent "pre-authenticated" storageState so workout
 *     tests don't have to go through login on every run.
 *
 * The storageState file is written to e2e/.auth/user.json.
 * workout.spec.ts reads it via `use: { storageState }`.
 *
 * Emulator REST API:
 *   DELETE http://localhost:9099/emulator/v1/projects/<project>/accounts
 *   clears all auth users.
 */

import { chromium, FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EMULATOR_AUTH_URL = 'http://127.0.0.1:9099';
const EMULATOR_FIRESTORE_URL = 'http://127.0.0.1:8080';
const PROJECT_ID = 'zenkai-test';
const AUTH_STATE_PATH = path.join(__dirname, '.auth', 'user.json');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emulatorRequest(
  url: string,
  method: 'GET' | 'DELETE' | 'POST',
  body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function isEmulatorReachable(url: string): Promise<boolean> {
  try {
    await emulatorRequest(url, 'GET');
    return true;
  } catch {
    return false;
  }
}

// ─── Global setup ────────────────────────────────────────────────────────────

export default async function globalSetup(config: FullConfig) {
  console.log('\n[E2E Setup] Starting global setup...');

  // 1. Check emulators
  const authUp = await isEmulatorReachable(EMULATOR_AUTH_URL);
  const firestoreUp = await isEmulatorReachable(EMULATOR_FIRESTORE_URL);

  if (!authUp || !firestoreUp) {
    const missing = [!authUp && 'Auth (9099)', !firestoreUp && 'Firestore (8080)']
      .filter(Boolean)
      .join(', ');
    console.warn(
      `\n[E2E Setup] ⚠️  Firebase emulator(s) not running: ${missing}.\n` +
        '  Start them with: firebase emulators:start --only auth,firestore\n' +
        '  Tests that require Firebase will fail.\n',
    );
    // Do NOT abort — let individual tests decide how to handle it
  } else {
    console.log('[E2E Setup] ✅ Firebase emulators reachable (auth:9099, firestore:8080)');

    // 2. Clear previous test data
    try {
      await emulatorRequest(
        `${EMULATOR_AUTH_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`,
        'DELETE',
      );
      await emulatorRequest(
        `${EMULATOR_FIRESTORE_URL}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
        'DELETE',
      );
      console.log('[E2E Setup] ✅ Emulator state cleared');
    } catch (err) {
      console.warn('[E2E Setup] ⚠️  Could not clear emulator state:', err);
    }
  }

  // 3. Create pre-authenticated storage state for workout tests
  //    We log in via the UI (which hits the emulator) and save cookies/localStorage.
  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    baseURL: config.projects[0].use.baseURL as string,
    extraHTTPHeaders: {},
  });
  const page = await context.newPage();

  // Print browser console logs and errors to help debug
  page.on('console', msg => console.log('[PAGE CONSOLE]', msg.text()));
  page.on('pageerror', err => console.error('[PAGE ERROR]', err.message));

  console.log('[E2E Setup] Creating pre-authenticated session...');

  try {
    // Navigate to signup and create the workout test user
    await page.goto('/signup');
    await page.fill('#name', 'Onboarded TestUser');
    await page.fill('#email', 'e2e-workout@zenkai.test');
    await page.fill('#password', 'Test1234!');
    await page.check('#termsAccepted');
    await page.click('button[type="submit"]');

    // Wait for onboarding (created user will land here)
    await page.waitForURL('**/onboarding**', { timeout: 15_000 });

    // Complete minimal onboarding to get onboardingComplete = true
    // Step 0: User type
    await page.getByRole('button', { name: /comeback/i }).click();
    // Step 1: Body details — fill required fields and continue
    await page.getByRole('button', { name: /^male$/i }).click();
    await page.fill('#onboarding-age', '25');
    await page.fill('#onboarding-height', '175');
    await page.fill('#onboarding-weight', '75');
    await page.getByRole('button', { name: /continue/i }).click();
    // Step 2: Goal
    await page.getByRole('button', { name: /muscle gain/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();
    // Step 3: Gym setup — select frequency + duration then continue
    await page.getByRole('button', { name: '3x' }).click();
    await page.getByRole('button', { name: '60 min' }).click();
    // Select Barbell + Flat Bench equipment
    await page.getByRole('button', { name: 'Barbell' }).click();
    await page.getByRole('button', { name: 'Flat Bench' }).click();
    await page.getByRole('button', { name: /continue/i }).click();
    // Step 4: Lifestyle
    await page.getByRole('button', { name: /non-veg/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();
    // Step 5: Medical — skip
    await page.getByRole('button', { name: /finish setup/i }).click();

    // Wait for /home
    await page.waitForURL('**/home', { timeout: 15_000 });
    console.log('[E2E Setup] ✅ Pre-auth user onboarded → at /home');

    // Save the auth state
    await context.storageState({ path: AUTH_STATE_PATH });
    console.log(`[E2E Setup] ✅ Storage state saved to ${AUTH_STATE_PATH}`);
  } catch (err) {
    console.warn('[E2E Setup] ⚠️  Could not create pre-auth session:', err);
    // Write an empty state file so workout tests degrade gracefully
    fs.writeFileSync(AUTH_STATE_PATH, JSON.stringify({ cookies: [], origins: [] }));
  } finally {
    await browser.close();
  }

  console.log('[E2E Setup] Global setup complete.\n');
}
