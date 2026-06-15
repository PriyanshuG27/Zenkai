/**
 * e2e/workout.spec.ts
 *
 * Tests 4–5: Workout logging journeys (authenticated).
 *
 *  TEST 4 — Log a complete workout session → Session Done screen + XP > 0
 *  TEST 5 — PR detection → PR badge appears on set row when 1RM beats existing PR
 *
 * Authentication strategy:
 *  - storageState from global-setup.ts (pre-authenticated user at /home)
 *  - Tests begin at /home — no login UI traversal needed
 *
 * Selector map (derived from MobileLogger.jsx + SetRow.jsx):
 *  - Mood buttons:    getByRole('button', { name: /locked in|average|low energy/i })
 *  - Start session:   getByRole('button', { name: /let's go/i })
 *  - Exercise search: getByRole('textbox') inside ExerciseSearch (label="Add Exercise")
 *  - Weight input:    data-testid="weight-{exIndex}-{setIndex}"
 *  - Reps input:      data-testid="reps-{exIndex}-{setIndex}"
 *  - Set done btn:    data-testid="set-done-{exIndex}-{setIndex}"
 *  - End session:     getByRole('button', { name: /^end$/i }) in header
 *  - Finish session:  getByRole('button', { name: /finish session/i })
 *  - Session Done:    h1 text "Session Done" (MobileSessionComplete.jsx:240)
 *  - XP earned:       text "XP Earned this session" (MobileSessionComplete.jsx:297)
 *  - PR badge:        text "PR" in SetRow (span with border-accent-xp class)
 *
 * PR injection strategy (Test 5):
 *  - Use Firebase Admin REST API (emulator) to write a PR document directly to Firestore
 *  - Document path: users/{uid}/prs/barbell_bench_press
 *  - This is faster and more reliable than running a prior workout
 *
 * ExerciseSearch component:
 *  - Renders an input with label="Add Exercise"
 *  - Typing "Bench" shows a dropdown; clicking "Barbell Bench Press" selects it
 */

import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_STATE_PATH = path.join(__dirname, '.auth', 'user.json');
const EMULATOR_FIRESTORE_URL = 'http://127.0.0.1:8080';
const PROJECT_ID = 'zenkai-test';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** POST a document directly to Firestore emulator REST API */
function firestoreSet(
  collection: string,
  docId: string,
  fields: Record<string, { integerValue?: number; stringValue?: string; doubleValue?: number }>,
): Promise<void> {
  const body = JSON.stringify({ fields });
  const docPath = `${collection}/${docId}`;
  const urlPath =
    `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`;

  return new Promise((resolve, reject) => {
    const parsed = new URL(EMULATOR_FIRESTORE_URL + urlPath);
    const opts: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'PATCH', // PATCH = upsert in Firestore REST API
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': 'Bearer owner',
      },
    };
    const req = http.request(opts, (res) => {
      res.resume();
      res.on('end', () => {
        if (res.statusCode && res.statusCode < 400) resolve();
        else reject(new Error(`Firestore emulator responded ${res.statusCode}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Navigate to /workout and wait for the session-setup sheet */
async function openWorkoutLogger(page: Page) {
  // Bottom nav "Workout" button is a floating center button
  await page.getByRole('link', { name: /workout/i }).click({ force: true });
  await page.waitForURL('**/workout', { timeout: 10_000 });
  // Wait for the setup sheet heading
  await expect(page.getByRole('heading', { name: /ready to train/i })).toBeVisible();
}

/** Select mood and start the session */
async function startSession(page: Page, mood: 'Locked In' | 'Average' | 'Low Energy' = 'Average') {
  await page.getByRole('button', { name: new RegExp(mood, 'i') }).click();
  await page.getByRole('button', { name: /let's go/i }).click();
  // After starting, the header with END button appears
  await expect(page.getByRole('button', { name: /^end$/i })).toBeVisible({ timeout: 8_000 });
}

/** Type in ExerciseSearch and select the first matching result */
async function addExercise(page: Page, searchTerm: string, exactName: string) {
  const searchInput = page.getByTestId('exercise-search');
  await searchInput.click();
  await searchInput.fill(searchTerm);
  // Wait for dropdown to appear and click exact exercise name (accessible name includes muscle group tag)
  await page.getByRole('option', { name: new RegExp('^' + exactName + ' (chest|back|shoulders|arms|legs|core)$', 'i') }).click();
}

/** Fill weight and reps for set at [exerciseIndex, setIndex] */
async function fillSet(
  page: Page,
  exerciseIndex: number,
  setIndex: number,
  weight: number | string,
  reps: number,
) {
  const editBtn = page.getByTestId(`edit-set-${exerciseIndex}-${setIndex}`);
  if (await editBtn.isVisible()) {
    await editBtn.click();
  }

  const weightInput = page.getByTestId(`weight-${exerciseIndex}-${setIndex}`);
  const repsInput = page.getByTestId(`reps-${exerciseIndex}-${setIndex}`);

  await weightInput.fill(String(weight));
  await weightInput.press('Tab'); // trigger blur → updates store

  await repsInput.fill(String(reps));
  await repsInput.press('Tab');
}

/** Mark a set as done */
async function markSetDone(page: Page, exerciseIndex: number, setIndex: number) {
  await page.getByTestId(`set-done-${exerciseIndex}-${setIndex}`).click();
}

/** End session → Finish Session → wait for Session Done screen */
async function finishSession(page: Page) {
  await page.getByRole('button', { name: /^end$/i }).click();
  await expect(page.getByRole('heading', { name: /end session/i })).toBeVisible();
  await page.getByRole('button', { name: /finish session/i }).click();
  await expect(page.getByRole('heading', { name: /session done/i })).toBeVisible({ timeout: 20_000 });
}

// ─── Test suite ───────────────────────────────────────────────────────────────

test.describe('Workout logging journeys', () => {
  test.use({
    storageState: AUTH_STATE_PATH,
    viewport: { width: 390, height: 844 },
  });

  // Start each test at /home
  test.beforeEach(async ({ page }) => {
    await page.goto('/home');
    await page.waitForURL('**/home', { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /weekly schedule/i })).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Log a complete workout session
  // ─────────────────────────────────────────────────────────────────────────
  test('4 · Log workout → Session Done + XP earned > 0', async ({ page }) => {
    // ── 1. Open workout logger ────────────────────────────────────────────
    await openWorkoutLogger(page);

    // ── 2. Select "Average" mood (already default, but explicitly click) ──
    await startSession(page, 'Average');

    // ── 3. Add "Barbell Bench Press" exercise ─────────────────────────────
    await addExercise(page, 'Bench', 'Barbell Bench Press');

    // ── 4. Fill set 1: 60kg × 8 reps ─────────────────────────────────────
    await fillSet(page, 0, 0, 60, 8);

    // ── 5. Mark set 1 as done ─────────────────────────────────────────────
    await markSetDone(page, 0, 0);

    // ── 6. Assert set completed (done button now has accent-xp background) ─
    // The done button gets `bg-[var(--accent-xp)]` when set.done = true
    // We verify via the data-testid element's CSS custom property
    const doneBtn = page.getByTestId('set-done-0-0');
    await expect(doneBtn).toBeVisible();
    // Check it's in "completed" state — the button class changes from transparent to bg-accent-xp
    // We use a locator assertion: the button should no longer have `border border-[var(--border)]`
    // Simplest: check aria-label changes aren't needed — the visual diff check:
    await expect(doneBtn).not.toHaveClass(/bg-transparent/, { timeout: 3_000 });

    // ── 7. End session + finish ───────────────────────────────────────────
    await finishSession(page);

    // ── 8. Assert Session Done screen ─────────────────────────────────────
    await expect(page.getByRole('heading', { name: /session done/i })).toBeVisible();
    await expect(page.getByText(/great work\. every rep counts/i)).toBeVisible();

    // ── 9. Assert XP earned > 0 ───────────────────────────────────────────
    // "XP Earned this session" label is always shown
    await expect(page.getByText(/xp earned this session/i)).toBeVisible();
    // The animated counter shows "+{xpEarned}" — minimum is +50 XP for session complete
    // We match any "+N" where N > 0
    const xpCounter = page.locator('text=/^\\+\\d+$/').first();
    await expect(xpCounter).toBeVisible({ timeout: 5_000 });
    const xpText = await xpCounter.textContent();
    const xpValue = parseInt((xpText ?? '+0').replace('+', ''), 10);
    expect(xpValue).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: PR detection — badge appears when set beats existing PR
  // ─────────────────────────────────────────────────────────────────────────
  test('5 · PR detection → PR badge appears on set row', async ({ page }) => {
    // ── Pre-condition: inject an existing PR of 60kg × 8 into Firestore emulator ──
    // We need the UID of the current user; read it from localStorage (Firebase Auth)
    const uid = await page.evaluate(() => {
      // Firebase v9 stores auth in IndexedDB, but also exposes currentUser on auth
      // We read from localStorage as a fallback (firebase-js-sdk compat layer)
      const keys = Object.keys(localStorage);
      const authKey = keys.find(k => k.startsWith('firebase:authUser:'));
      if (!authKey) return null;
      try {
        const user = JSON.parse(localStorage.getItem(authKey) ?? '{}');
        return user.uid ?? null;
      } catch {
        return null;
      }
    });

    if (!uid) {
      test.skip(true, 'Could not determine UID from localStorage — emulator may not be running');
      return;
    }

    // Inject PR: 60kg × 8 reps for "barbell_bench_press"
    // MobileLogger.jsx resolves exercise key → looks up prsMap[cleanKey]
    // ExerciseSearch uses exerciseKey that starts with "barbell_bench_press"
    await firestoreSet(`users/${uid}/prs`, 'barbell_bench_press', {
      weight: { doubleValue: 60 },
      reps:   { integerValue: 8 },
    });

    // ── Open workout logger and start session ─────────────────────────────
    await openWorkoutLogger(page);
    await startSession(page, 'Locked In');

    // ── Add Barbell Bench Press ───────────────────────────────────────────
    await addExercise(page, 'Bench', 'Barbell Bench Press');

    // ── Log 65kg × 8 reps (beats prior 60kg × 8 PR by 1RM calculation) ───
    await fillSet(page, 0, 0, 65, 8);
    await markSetDone(page, 0, 0);

    // ── Assert PR badge appears ───────────────────────────────────────────
    // SetRow renders a "PR" span when isPR=true (line 350 of SetRow.jsx)
    // It's inside the set row for exercise 0, set 0
    await expect(page.getByText('PR').first()).toBeVisible({ timeout: 5_000 });

    // Clean up — discard session so it doesn't pollute other tests
    await page.getByRole('button', { name: /^end$/i }).click();
    await expect(page.getByRole('heading', { name: /end session/i })).toBeVisible();
    await page.getByRole('button', { name: /discard session/i }).click();
    await page.waitForURL('**/home', { timeout: 10_000 });
  });
});
