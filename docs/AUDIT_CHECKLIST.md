# FitDesi — Production Audit Checklist

**Version:** 1.0  
**Date:** June 2026  
**Use:** Run before every production deploy. Tick every box. If a box fails, do not deploy.  

---

## SECTION A — Security Audit

### A1. Secrets + API Keys
- [ ] `grep -rn "GEMINI\|AIzaSy" src/` → zero results
- [ ] `grep -rn "apiKey\|secretKey\|password" src/` → only `VITE_FIREBASE_API_KEY` reference in `firebase.js`
- [ ] `git ls-files | grep -E "\.env$"` → no `.env` files committed
- [ ] `.gitignore` includes `.env`, `.env.local`, `functions/.env`, `functions/serviceAccountKey.json`
- [ ] Gemini key set via `firebase functions:config:get` → shows `{ "gemini": { "key": "..." } }`
- [ ] No API keys in `vercel.json` or `firebase.json`

### A2. Firestore Security Rules
- [ ] All rules test matrix cases pass (SECURITY.md Section 3)
- [ ] `weeklyPlans` write rule is `allow write: if false`
- [ ] `rateLimits` collection rule is `allow read, write: if false`
- [ ] No collection has `allow read, write: if true`
- [ ] Rules deployed: `firebase deploy --only firestore:rules` completed successfully
- [ ] Rules test in Firebase Console → Firestore → Rules → Playground — test at least 5 deny cases manually

### A3. Cloud Functions
- [ ] `request.auth` checked as first operation in `generatePlan`
- [ ] Rate limit logic implemented and tested (3 calls/user/24h)
- [ ] Gemini JSON response validated before Firestore write
- [ ] No `console.log(request.auth)` or any auth token logging
- [ ] CORS: function only accepts calls from authenticated Firebase users (handled by `onCall`)
- [ ] `process.env.GEMINI_API_KEY` is the only place Gemini key is referenced

### A4. Frontend
- [ ] `vercel.json` CSP headers deployed and correct (no wildcard `*` in script-src)
- [ ] `dangerouslySetInnerHTML` not used anywhere: `grep -rn "dangerouslySetInnerHTML" src/` → zero results
- [ ] `eval()` not used anywhere: `grep -rn "eval(" src/` → zero results
- [ ] `sanitiseString()` called on all user-provided strings before Firestore write
- [ ] Auth guard tested: manually open `/home` while logged out → redirects to `/login`
- [ ] Onboarding guard tested: already-onboarded account → `/onboarding` redirects to `/home`

---

## SECTION B — Data Integrity Audit

### B1. Firestore Write Patterns
- [ ] Session complete writes use `writeBatch()` — all or nothing
- [ ] Batch commit failure shows error + retry, does NOT navigate away
- [ ] User XP update uses `FieldValue.increment()` — not read-modify-write
- [ ] Streak logic uses `dateString` (local timezone) not server timestamp for date comparison
- [ ] PR update is conditional: only writes if `newWeight > existingPR.weight`

### B2. Data Validation
- [ ] Exercise names sanitised before write: `sanitiseString(name, 80)`
- [ ] Mood tag validated against enum before write
- [ ] Medical flags validated against allowed values before write
- [ ] Equipment list validated against allowed values before write
- [ ] All number fields (reps, weight, XP) validated as positive numbers before write
- [ ] `reps` and `weight` of 0 not written to completed sets

### B3. Concurrent Access
- [ ] Multiple rapid set completions don't cause duplicate XP awards (debounce or disable button after tap)
- [ ] Plan generation button disabled while loading (prevent double-submit)
- [ ] Session finish button disabled after first tap

---

## SECTION C — Performance Audit

### C1. Bundle
- [ ] `npm run build` completes with no warnings about chunk size > 500KB
- [ ] `npx vite preview` → open DevTools → Network → JS bundle list → no single file > 300KB
- [ ] Recharts is NOT in the initial bundle (only on /progress route)
- [ ] All page components are `lazy()`-loaded

### C2. Runtime
- [ ] All data-fetching screens have skeleton loading states (no blank screens)
- [ ] All charts have empty states with CTA
- [ ] Framer Motion animations don't cause layout shifts (check CLS in Lighthouse)
- [ ] `prefers-reduced-motion` fallback implemented in PR celebration and level-up animations

### C3. Firestore Queries
- [ ] All session queries have `limit()` — no unbounded reads
- [ ] Progress chart data limited to 90 days max
- [ ] Only `onSnapshot` (real-time) on: home XP bar, active challenge card
- [ ] Everything else uses `getDocs` (one-time read)

### C4. Lighthouse Targets
Run: `npx lighthouse https://fitdesi.vercel.app --view`
- [ ] Performance: ≥ 85
- [ ] Accessibility: ≥ 90
- [ ] Best Practices: ≥ 95
- [ ] LCP: < 2.5s
- [ ] TBT: < 200ms

---

## SECTION D — Testing Audit

### D1. Test Coverage
- [ ] `npx vitest run --coverage` → hooks coverage ≥ 85%
- [ ] `npx vitest run --coverage` → lib coverage ≥ 90%
- [ ] `npx vitest run --coverage` → overall coverage ≥ 75%

### D2. Critical Test Cases Present
- [ ] `useXPEngine` — XP amounts correct for all event types
- [ ] `useXPEngine` — level-up triggers at correct XP threshold
- [ ] Streak logic — increments on consecutive days
- [ ] Streak logic — resets after gap > 1 day
- [ ] Streak logic — no change on same-day second session
- [ ] `usePRDetection` — detects new PR correctly
- [ ] `usePRDetection` — does not false-positive at equal weight
- [ ] `usePRDetection` — detects PR when no prior PR exists
- [ ] Firestore rules — all deny cases tested (see SECURITY.md Section 3)
- [ ] `generatePlan` Cloud Function — rate limit enforced
- [ ] `generatePlan` Cloud Function — rejects unauthenticated calls
- [ ] `generatePlan` Cloud Function — never includes restricted exercises

### D3. E2E Tests
- [ ] Auth: unauthenticated user → redirected to login
- [ ] Core loop: signup → onboard → log workout → see XP
- [ ] PR detection: log PR weight → celebration shows
- [ ] Plan generation: click generate → plan renders

---

## SECTION E — UX Audit

### E1. Mobile (test on physical Android device)
- [ ] All touch targets ≥ 44×44px (tap each interactive element)
- [ ] Bottom nav visible and functional
- [ ] Logger opens full-screen when session is active
- [ ] No horizontal scroll on any screen
- [ ] XP bar animation renders smoothly
- [ ] PR celebration particle effect doesn't freeze screen
- [ ] Keyboard appears correctly on number inputs (type="number")

### E2. Desktop (test on Chrome 1280px)
- [ ] Sidebar renders at 256px width
- [ ] Logger panel slides in from right correctly
- [ ] Dashboard bento grid lays out correctly
- [ ] Progress charts fill container width
- [ ] No mobile-only styles bleeding into desktop layout

### E3. Edge Cases
- [ ] Fresh account (no sessions) → all empty states show with CTA
- [ ] Account with 100+ sessions → progress charts render without lag
- [ ] Session with 0 exercises → cannot finish (validation message shows)
- [ ] Log same exercise twice in one session → both appear, not merged

---

## SECTION F — Final Sign-Off

Complete all sections above before running deploy commands.

```bash
# Only run these after every box above is ticked:
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
git push origin main
# → triggers Vercel auto-deploy
```

Post-deploy: run smoke tests from DEPLOYMENT.md Section 7.

---

## Ongoing — Weekly Audit (Once You Have Users)

After initial deploy, run these weekly:

- [ ] Firebase Console → Functions → Error Rate → no spike
- [ ] Firebase Console → Firestore → Usage → within free tier limits
- [ ] Firebase Console → Authentication → Users → no unexpected new accounts (spam bots)
- [ ] `firebase functions:config:get` → Gemini key still present (hasn't been accidentally cleared)
- [ ] Vercel → Deployments → all recent deploys succeeded
- [ ] Check Google AI Studio → Usage → Gemini costs within expected range
