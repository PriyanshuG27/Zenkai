# FitDesi — Testing Document

**Version:** 1.0  
**Date:** June 2026  
**Stack:** Vitest + React Testing Library + Firebase Emulator + Playwright  

---

## 1. Testing Stack

| Layer | Tool | Purpose |
|---|---|---|
| Unit tests | Vitest | Hooks, utilities, XP logic, streak logic |
| Component tests | React Testing Library + Vitest | UI components in isolation |
| Integration tests | Vitest + Firebase Emulator | Hooks that write to real Firestore |
| Firestore rules | `@firebase/rules-unit-testing` | Security rules matrix |
| Cloud Functions | Vitest + Firebase Functions Emulator | generatePlan end-to-end |
| E2E | Playwright | Full user journeys: signup → log workout → see XP |
| CI gate | GitHub Actions | All tests must pass before Vercel deploy |

### Install
```bash
# Unit + component + integration
npm install -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom

# Firestore rules testing
npm install -D @firebase/rules-unit-testing

# E2E
npm install -D @playwright/test
npx playwright install chromium  # only chromium needed for CI
```

### Vitest config
```javascript
// vitest.config.js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.js'],
    globals: true,
    coverage: {
      provider: 'v8',
      thresholds: {
        functions: 80,
        lines: 75,
        branches: 70,
      },
      exclude: ['src/data/**', 'src/lib/firebase.js', '**/*.test.*'],
    },
  },
});
```

```javascript
// src/tests/setup.js
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Framer Motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
    span: ({ children, ...props }) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }) => children,
}));
```

---

## 2. File Structure

Tests co-located with source files. No separate `/tests` folder.

```
src/
├── hooks/
│   ├── useXPEngine.js
│   ├── useXPEngine.test.js         ← unit test
│   ├── useWorkoutLogger.js
│   ├── useWorkoutLogger.test.js    ← unit + integration test
│   ├── usePRDetection.js
│   └── usePRDetection.test.js
├── lib/
│   ├── sanitise.js
│   ├── sanitise.test.js
│   ├── xpLevels.js
│   └── xpLevels.test.js
├── components/
│   └── shared/
│       ├── XPBar.jsx
│       └── XPBar.test.jsx
tests/
├── e2e/
│   ├── auth.spec.js
│   └── workoutLoop.spec.js
├── firestore/
│   └── security.rules.test.js
```

---

## 3. Firebase Mocking Strategy

**Rule:** Unit tests mock Firebase. Integration tests use the Emulator.

### Unit test mock (Vitest)
```javascript
// src/tests/mocks/firebase.js
import { vi } from 'vitest';

export const mockGetDoc = vi.fn();
export const mockSetDoc = vi.fn();
export const mockUpdateDoc = vi.fn();
export const mockWriteBatch = vi.fn(() => ({
  set: vi.fn(),
  update: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase/firestore', () => ({
  getDoc: mockGetDoc,
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  writeBatch: mockWriteBatch,
  collection: vi.fn(),
  doc: vi.fn((_, ...path) => ({ path: path.join('/') })),
  serverTimestamp: vi.fn(() => new Date().toISOString()),
  FieldValue: { increment: vi.fn(n => n), serverTimestamp: vi.fn() },
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));
```

### Integration test (Emulator)
```javascript
// tests/firestore/setup.js
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

export let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'fitdesi-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });
});

afterEach(async () => await testEnv.clearFirestore());
afterAll(async () => await testEnv.cleanup());
```

Run with emulator:
```bash
firebase emulators:start --only firestore &
npx vitest run tests/firestore/
```

---

## 4. Hook Testing Patterns

### Pattern: `renderHook` with mocked stores

```javascript
// src/hooks/useXPEngine.test.js
import { renderHook, act } from '@testing-library/react';
import { useXPEngine } from './useXPEngine';
import { mockSetDoc, mockGetDoc } from '../tests/mocks/firebase';

// Mock auth store
vi.mock('../stores/authStore', () => ({
  useAuthStore: () => ({ uid: 'test-user-123' }),
}));

// Mock xpStore initial state
vi.mock('../stores/xpStore', () => {
  let state = { xp: 0, level: 1, levelName: 'Rookie', streak: 0, streakLastDate: null };
  return {
    useXPStore: () => state,
    getXPStore: () => state,
    setXPStore: vi.fn((update) => { state = { ...state, ...update }; }),
  };
});

describe('useXPEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetDoc.mockResolvedValue(undefined);
  });

  it('awards correct XP for session logged', async () => {
    const { result } = renderHook(() => useXPEngine());
    await act(async () => {
      await result.current.awardXP('session_logged');
    });
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amount: 50, source: 'session_logged' })
    );
  });

  it('awards PR bonus XP', async () => {
    const { result } = renderHook(() => useXPEngine());
    await act(async () => {
      await result.current.awardXP('pr_hit');
    });
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amount: 10, source: 'pr_hit' })
    );
  });

  it('triggers level-up when threshold crossed', async () => {
    // Set XP near level 6 threshold (1000 XP)
    vi.mocked(useXPStore).mockReturnValue({ xp: 995, level: 5, levelName: 'Rookie' });
    const { result } = renderHook(() => useXPEngine());
    const levelUpFired = vi.fn();
    // ... test level-up detection
  });
});
```

### Pattern: Streak logic unit tests

```javascript
// src/lib/streakLogic.test.js
import { calculateNewStreak } from './streakLogic';

describe('calculateNewStreak', () => {
  const today = '2026-06-03';
  const yesterday = '2026-06-02';
  const twoDaysAgo = '2026-06-01';

  it('increments streak when last session was yesterday', () => {
    expect(calculateNewStreak(5, yesterday, today)).toBe(6);
  });

  it('keeps streak unchanged when already logged today', () => {
    expect(calculateNewStreak(5, today, today)).toBe(5);
  });

  it('resets streak to 1 when gap > 1 day', () => {
    expect(calculateNewStreak(5, twoDaysAgo, today)).toBe(1);
  });

  it('starts streak at 1 when no prior date', () => {
    expect(calculateNewStreak(0, null, today)).toBe(1);
  });

  it('resets streak to 1 when streakLastDate is null with prior count', () => {
    expect(calculateNewStreak(10, null, today)).toBe(1);
  });
});
```

### Pattern: PR detection

```javascript
// src/hooks/usePRDetection.test.js
describe('usePRDetection', () => {
  it('returns isPR true when weight exceeds stored PR', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ weight: 60, reps: 8 }),
    });
    const { result } = renderHook(() => usePRDetection());
    const { isPR } = await act(() =>
      result.current.checkPR('barbell_bench_press', { weight: 65, reps: 8 })
    );
    expect(isPR).toBe(true);
  });

  it('returns isPR false when weight equals stored PR', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ weight: 60, reps: 8 }),
    });
    const { result } = renderHook(() => usePRDetection());
    const { isPR } = await act(() =>
      result.current.checkPR('barbell_bench_press', { weight: 60, reps: 8 })
    );
    expect(isPR).toBe(false);
  });

  it('returns isPR true when no prior PR exists', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    const { result } = renderHook(() => usePRDetection());
    const { isPR } = await act(() =>
      result.current.checkPR('barbell_bench_press', { weight: 40, reps: 10 })
    );
    expect(isPR).toBe(true);
  });
});
```

---

## 5. Component Tests

Keep component tests minimal — test behaviour, not implementation.

```javascript
// src/components/shared/XPBar.test.jsx
import { render, screen } from '@testing-library/react';
import { XPBar } from './XPBar';

describe('XPBar', () => {
  it('renders current XP and level name', () => {
    render(<XPBar xp={450} level={4} levelName="Rookie" nextLevelXP={700} />);
    expect(screen.getByText('Rookie')).toBeInTheDocument();
    expect(screen.getByText('450')).toBeInTheDocument();
  });

  it('fills bar proportionally', () => {
    render(<XPBar xp={350} level={3} levelName="Rookie" prevLevelXP={250} nextLevelXP={450} />);
    const fill = document.querySelector('[data-testid="xp-fill"]');
    // 350-250 / 450-250 = 50%
    expect(fill.style.width).toBe('50%');
  });
});
```

---

## 6. Cloud Function Tests

Run against Firebase Functions Emulator.

```javascript
// tests/functions/generatePlan.test.js
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

describe('generatePlan Cloud Function', () => {
  let generatePlan;

  beforeAll(() => {
    const functions = getFunctions();
    connectFunctionsEmulator(functions, 'localhost', 5001);
    generatePlan = httpsCallable(functions, 'generatePlan');
  });

  it('rejects unauthenticated calls', async () => {
    // Call without auth context
    await expect(generatePlan()).rejects.toThrow('unauthenticated');
  });

  it('returns valid plan JSON structure', async () => {
    // Seed emulator with test user + sessions
    // ... seed data
    const result = await generatePlan();
    expect(result.data.success).toBe(true);
    expect(result.data.weekId).toMatch(/^\d{4}-W\d{2}$/);
    // Verify plan structure
    const plan = await getDoc(/* weeklyPlans doc */);
    expect(plan.data().plan.days).toHaveLength(7);
    plan.data().plan.days.forEach(day => {
      expect(day).toHaveProperty('day');
      expect(day).toHaveProperty('focus');
    });
  });

  it('enforces rate limit after 3 calls', async () => {
    // Make 3 calls
    await generatePlan();
    await generatePlan();
    await generatePlan();
    // 4th call should fail
    await expect(generatePlan()).rejects.toThrow('resource-exhausted');
  });

  it('never generates restricted exercises', async () => {
    // Seed user with medicalFlags: ['bad_knees']
    const result = await generatePlan();
    const plan = result.data.plan;
    const kneeExercises = ['squat', 'leg_press', 'lunge'];
    plan.days.forEach(day => {
      (day.exercises || []).forEach(ex => {
        expect(kneeExercises.some(k => ex.exerciseKey.includes(k))).toBe(false);
      });
    });
  });
});
```

---

## 7. E2E Tests (Playwright)

Only critical user journeys. Do not E2E test every component.

```javascript
// tests/e2e/workoutLoop.spec.js
import { test, expect } from '@playwright/test';

test.describe('Core workout loop', () => {
  test.beforeEach(async ({ page }) => {
    // Use test account (seeded in emulator or staging env)
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'test@fitdesi.app');
    await page.fill('[data-testid="password"]', 'testpassword123');
    await page.click('[data-testid="login-btn"]');
    await expect(page).toHaveURL('/home');
  });

  test('logs a complete workout and sees XP awarded', async ({ page }) => {
    await page.click('[data-testid="start-workout"]');
    await expect(page).toHaveURL('/workout');

    // Add exercise
    await page.fill('[data-testid="exercise-search"]', 'Bench');
    await page.click('[data-testid="exercise-result-barbell_bench_press"]');

    // Log a set
    await page.click('[data-testid="set-done-0-0"]');

    // Finish session
    await page.click('[data-testid="end-session"]');
    await page.click('[data-testid="confirm-end"]');

    // Should see session complete screen with XP
    await expect(page.locator('[data-testid="xp-earned"]')).toBeVisible();
    await expect(page.locator('[data-testid="xp-earned"]')).toContainText('+50');
  });

  test('detects PR and shows celebration', async ({ page }) => {
    // Pre-seed a PR of 60kg for bench press
    // Log 65kg bench
    // Expect PR overlay
    await expect(page.locator('[data-testid="pr-celebration"]')).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Auth flow', () => {
  test('redirects unauthenticated user from /home to /login', async ({ page }) => {
    await page.goto('/home');
    await expect(page).toHaveURL('/login');
  });

  test('onboarded user goes to /home after login, not /onboarding', async ({ page }) => {
    await page.goto('/login');
    // Login with pre-onboarded test account
    await expect(page).toHaveURL('/home');
  });
});
```

```javascript
// playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## 8. Coverage Thresholds

| Module | Min coverage | Rationale |
|---|---|---|
| `src/hooks/` | 85% | All business logic lives here |
| `src/lib/` | 90% | Pure utility functions — no excuse for gaps |
| `src/stores/` | 70% | Zustand stores are thin — mostly types |
| `src/components/` | 60% | UI is E2E tested, not unit tested |
| Overall | 75% | Reasonable for a solo portfolio project |

Run: `npx vitest run --coverage`

---

## 9. CI Gate (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit + component tests
        run: npx vitest run --coverage

      - name: Start Firebase Emulator + run rules tests
        run: |
          npm install -g firebase-tools
          firebase emulators:exec --only firestore \
            "npx vitest run tests/firestore/"
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}

      - name: E2E tests
        run: |
          npm run build
          npx playwright test
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_PROJECT_ID: fitdesi-test
          # ... other test env vars

      - name: Upload coverage report
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
```

**CI fails → Vercel deploy is blocked.** This is enforced via Vercel's GitHub integration: uncheck "Deploy preview for every push" and only deploy when CI passes.

---

## 10. test-id Conventions

Every interactive element that is E2E tested must have a `data-testid` attribute. Component visual styling is separate from test targeting.

```
data-testid="start-workout"
data-testid="exercise-search"
data-testid="exercise-result-{exerciseKey}"
data-testid="set-done-{exerciseIndex}-{setIndex}"
data-testid="end-session"
data-testid="confirm-end"
data-testid="xp-earned"
data-testid="pr-celebration"
data-testid="streak-counter"
data-testid="login-btn"
data-testid="email"
data-testid="password"
```

Never use class names or text content as Playwright selectors — they break when UI changes.
