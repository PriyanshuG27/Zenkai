# FitDesi — Performance Document

**Version:** 1.0  
**Date:** June 2026  

---

## 1. Performance Targets

| Metric | Target | Why |
|---|---|---|
| LCP (Largest Contentful Paint) | < 2.0s on 4G | Indian mobile users, mid-tier devices |
| FID / INP | < 100ms | Gym logging must feel instant |
| CLS | < 0.1 | Layouts must not shift when data loads |
| Bundle size (initial JS) | < 200KB gzipped | First load on slow connections |
| Set logging tap → Firestore write | < 500ms | Core interaction latency |
| Plan generation (warm CF) | < 3s | AI wait is acceptable if bounded |
| Plan generation (cold CF start) | < 8s | Show skeleton, not spinner |
| Chart render (30 data points) | < 100ms | Progress screen must feel snappy |

Measure with: Lighthouse CLI, Chrome DevTools Network tab (throttle to "Fast 4G").

---

## 2. Bundle Optimisation

### Code splitting — all page components lazy-loaded
```javascript
// src/App.jsx
import { lazy, Suspense } from 'react';

const MobileHome          = lazy(() => import('./mobile/MobileHome'));
const MobileLogger        = lazy(() => import('./mobile/MobileLogger'));
const MobileProgress      = lazy(() => import('./mobile/MobileProgress'));
const MobilePlan          = lazy(() => import('./mobile/MobilePlan'));
const MobileChallenges    = lazy(() => import('./mobile/MobileChallenges'));
const MobileProfile       = lazy(() => import('./mobile/MobileProfile'));

const DesktopDashboard    = lazy(() => import('./desktop/DesktopDashboard'));
const DesktopLoggerPanel  = lazy(() => import('./desktop/DesktopLoggerPanel'));
const DesktopProgress     = lazy(() => import('./desktop/DesktopProgress'));
// etc.

// Wrap routes in Suspense with skeleton fallback
<Suspense fallback={<SkeletonPage />}>
  <Routes>...</Routes>
</Suspense>
```

### Recharts — only loaded on /progress route
Recharts is the largest dependency (~200KB). Lazy-load the progress page:
```javascript
const MobileProgress = lazy(() => import('./mobile/MobileProgress'));
// Recharts imports live inside MobileProgress.jsx — they only load when /progress is visited
```

### Framer Motion — tree-shake properly
```javascript
// Import only what you use
import { motion, AnimatePresence } from 'framer-motion';
// NOT: import * as FramerMotion from 'framer-motion';
```

### Lucide React — tree-shake properly
```javascript
// Correct — only imports the Dumbbell icon
import { Dumbbell } from 'lucide-react';

// Wrong — imports all 1000+ icons
import * as Icons from 'lucide-react';
```

### Bundle analysis
```bash
npm install -D rollup-plugin-visualizer
# Add to vite.config.js:
import { visualizer } from 'rollup-plugin-visualizer';
plugins: [react(), visualizer({ open: true })]

npm run build  # Opens bundle analysis in browser
```

Look for: anything > 50KB that shouldn't be there.

---

## 3. Vite Build Config

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          'firebase-auth':      ['firebase/auth'],
          'firebase-firestore': ['firebase/firestore'],
          'firebase-functions': ['firebase/functions'],
          'framer-motion':      ['framer-motion'],
          'recharts':           ['recharts'],
        },
      },
    },
    chunkSizeWarningLimit: 500,  // warn if any chunk > 500KB
  },
});
```

**Why manual chunks:** Firebase packages are large and stable — they don't change between deploys. Splitting them means the browser caches them separately and doesn't re-download when your app code changes.

---

## 4. Firestore Query Optimisation

### Session queries — always paginate
```javascript
// Fetch last 14 sessions for plan generation
const q = query(
  collection(db, `users/${uid}/sessions`),
  orderBy('date', 'desc'),
  limit(14)  // NEVER fetch unbounded — always limit
);
```

### Progress chart data — limit by time range
```javascript
// Don't fetch all time for charts — fetch last 90 days max
const ninetyDaysAgo = new Date();
ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

const q = query(
  collection(db, `users/${uid}/sessions`),
  where('date', '>=', Timestamp.fromDate(ninetyDaysAgo)),
  orderBy('date', 'asc'),
  limit(100)  // safety cap
);
```

### Real-time listeners — use sparingly
Only use `onSnapshot` (real-time) where the UI genuinely needs live updates:
- Home screen XP bar (updates after session complete)
- Active challenge progress

Use `getDocs` (one-time) everywhere else:
- Progress charts, weekly plan, PR list, profile

Real-time listeners have a cost — each open listener = one open WebSocket connection.

### Don't fetch subcollections you don't need
```javascript
// Wrong: fetches session but then fetches all exercises immediately
const session = await getDoc(sessionRef);
const exercises = await getDocs(collection(db, `.../${sessionId}/exercises`));

// Right: fetch exercises only when displaying session detail
// On progress screen, totalVolume is on the session doc — don't need exercises at all
```

---

## 5. Recharts Performance

Recharts renders well up to ~365 data points per chart. Beyond that, performance degrades on mobile.

```javascript
// src/hooks/useProgress.js
const MAX_CHART_POINTS = 90;  // 90 days of data

const strengthData = sessions
  .filter(s => s.exercises.some(e => e.exerciseKey === selectedExercise))
  .slice(-MAX_CHART_POINTS)  // cap at 90 points
  .map(s => ({
    date: s.dateString,
    weight: s.exercises.find(e => e.exerciseKey === selectedExercise)?.sets
              .reduce((max, set) => Math.max(max, set.weight), 0) ?? 0
  }));
```

Use `ResponsiveContainer` always — never hardcode chart width:
```jsx
<ResponsiveContainer width="100%" height={200}>
  <LineChart data={strengthData}>
    {/* ... */}
  </LineChart>
</ResponsiveContainer>
```

---

## 6. Framer Motion Performance

### Always use `will-change: transform` for animated elements
```javascript
// framer-motion does this automatically for scale/translate animations
// but for custom animations, add manually:
<motion.div style={{ willChange: 'transform' }} animate={{ scale: [1, 1.1, 1] }} />
```

### Respect `prefers-reduced-motion`
```javascript
// src/hooks/useReducedMotion.js
import { useReducedMotion } from 'framer-motion';

export const useAnimationConfig = () => {
  const shouldReduce = useReducedMotion();
  return {
    PRCelebrationVariants: shouldReduce
      ? { visible: { opacity: 1 }, hidden: { opacity: 0 } }  // fade only
      : { visible: { opacity: 1, scale: 1 }, hidden: { opacity: 0, scale: 0.5 } },  // full animation
  };
};
```

### Don't animate on every render — use `AnimatePresence` only for enter/exit
```jsx
// Only animate when element mounts/unmounts — not on every state change
<AnimatePresence>
  {isPRCelebration && <PRCelebration key="pr" />}
</AnimatePresence>
```

---

## 7. Cloud Function Cold Start

Firebase Functions cold starts add 2-4 seconds on first call. This affects plan generation.

**Mitigation for MVP:**
- Show a skeleton/loading state immediately when plan generation starts
- Set user expectation: "Generating your plan… this takes a few seconds"
- Timeout: if no response in 15s, show error state with retry

**Post-MVP mitigation:**
```javascript
// functions/src/generatePlan.js
// Set minimum instances to 1 — keeps function warm (costs ~$0.50/month)
export const generatePlan = onCall({
  minInstances: 1,
  timeoutSeconds: 30,
}, async (request) => { ... });
```

For portfolio stage, cold start is acceptable. Don't pay for warm instances until you have real users.

---

## 8. Mobile Performance — Indian Mid-Tier Devices

Target device: Android phone with 3–4GB RAM, 4G connection. Examples: Redmi 12, Poco M6.

Key rules for this device profile:
- Avoid CSS `backdrop-filter` (blur) on large surfaces — kills GPU on mid-tier
- Don't use CSS `filter` in animations — use `transform` and `opacity` only
- Particle effects (PR celebration): cap at 30 particles, not 200
- Keep DOM node count under 1500 on any single screen
- Use `transform: translateZ(0)` to force GPU compositing on animated elements
- Use `contain: layout` on list containers to prevent layout reflow propagation

### Particle count for PR celebration
```javascript
// src/components/PRCelebration.jsx
const PARTICLE_COUNT = window.navigator.hardwareConcurrency >= 4 ? 50 : 20;
// Fewer particles on lower-end devices
```

---

## 9. Lighthouse CI

Run before every deploy to main:

```bash
npm install -g @lhci/cli
lhci autorun

# Or in GitHub Actions:
- name: Lighthouse CI
  uses: treosh/lighthouse-ci-action@v10
  with:
    urls: |
      https://fitdesi.vercel.app
    budgetPath: ./budget.json
    uploadArtifacts: true
```

```json
// budget.json — fail CI if these are missed
[
  {
    "path": "/*",
    "timings": [
      { "metric": "interactive", "budget": 3000 },
      { "metric": "first-contentful-paint", "budget": 1500 }
    ],
    "resourceSizes": [
      { "resourceType": "script", "budget": 300 },
      { "resourceType": "total", "budget": 500 }
    ]
  }
]
```
