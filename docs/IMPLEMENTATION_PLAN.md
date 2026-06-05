# FitDesi — Implementation Plan

**Version:** 1.0  
**Date:** June 2026  
**Duration:** 8 weeks (summer vacation)  
**Stack:** React (Vite) + Tailwind + Firebase + Gemini Flash  

---

## 0. Before You Write a Single Line

### Environment Setup Checklist
- [ ] Node 20 installed (`nvm use 20`)
- [ ] Firebase CLI installed (`npm install -g firebase-tools`)
- [ ] Firebase project created at console.firebase.google.com
- [ ] Auth enabled: Email/Password + Google provider
- [ ] Firestore enabled: production mode (not test mode)
- [ ] Functions enabled (Blaze plan required for external API calls to Gemini)
- [ ] GitHub repo created, `.gitignore` includes `.env` and `functions/.env`
- [ ] Vercel project linked to GitHub repo
- [ ] Gemini API key obtained from aistudio.google.com
- [ ] Gemini key stored in Firebase Functions config: `firebase functions:config:set gemini.key="YOUR_KEY"`

### Scaffold Commands
```bash
npm create vite@latest fitdesi -- --template react
cd fitdesi
npm install

# Core dependencies
npm install firebase react-router-dom zustand framer-motion recharts lucide-react

# Dev dependencies
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Firebase Functions (in /functions subfolder)
firebase init functions  # Select: JavaScript, ESLint yes, install deps yes
cd functions && npm install @google/generative-ai firebase-admin firebase-functions
```

---

## 1. Phase 1 — Foundation (Week 1–2)

**Goal:** Working app shell. Can sign up, onboard, and reach home screen. Data writes to Firestore.

### Week 1

**Day 1–2: Project scaffold + design system**
- [ ] Vite + React + Tailwind setup
- [ ] `tailwind.config.js`: add CSS variables as Tailwind tokens, dark mode class strategy
- [ ] `globals.css`: define all CSS variables (--bg-base, --primary, --secondary, --accent-xp, etc.)
- [ ] Google Fonts import in `index.html` (Barlow Condensed, Outfit, DM Mono)
- [ ] Firebase config file (`src/lib/firebase.js`)
- [ ] React Router setup (`src/App.jsx`) with all route paths defined
- [ ] `useDeviceLayout` hook — mobile/desktop detection

**Day 3–4: Auth screens**
- [ ] Landing page — hero section only, CTA buttons functional
- [ ] Login screen (mobile + desktop layout)
- [ ] Signup screen (mobile + desktop layout)
- [ ] `useAuth` hook wrapping Firebase Auth
- [ ] `authStore` Zustand store
- [ ] Protected route wrapper component
- [ ] Persistent session — `onAuthStateChanged` in App root

**Day 5–7: Component tree split**
- [ ] `MobileApp.jsx` — bottom nav + outlet routing
- [ ] `DesktopApp.jsx` — sidebar + content area routing
- [ ] `BottomNav` component (mobile)
- [ ] `DesktopSidebar` component
- [ ] Placeholder screens for all routes (skeleton divs with route label)

### Week 2

**Day 8–9: Onboarding flow**
- [ ] `UserTypeScreen` — 4 option cards, select one
- [ ] `EquipmentScreen` — multi-select grid with equipment icons
- [ ] `MedicalScreen` — toggle list
- [ ] Skip logic at each step
- [ ] `useOnboarding` hook
- [ ] Firestore writes on each step: `users/{uid}` doc creation
- [ ] Redirect logic after onboarding complete / skip
- [ ] Onboarding guard: redirect already-onboarded users away from `/onboarding`

**Day 10–11: Home screen (both layouts)**
- [ ] `TodaysMissionCard` component (placeholder text, real data later in Phase 3)
- [ ] `XPBar` component (static, wired to real data in Phase 2)
- [ ] `StreakBadge` component
- [ ] Mobile `MobileHome` assembles these components
- [ ] Desktop `DesktopDashboard` bento grid assembles these + empty chart areas

**Day 12–14: Polish Phase 1**
- [ ] Error states on auth forms (wrong password, email taken)
- [ ] Loading states on all auth buttons
- [ ] Responsive test: verify mobile at 375px, desktop at 1280px
- [ ] Deploy to Vercel — confirm CI/CD from GitHub works
- [ ] Firebase security rules: apply base rules from BACKEND_SCHEMA.md

**Phase 1 Definition of Done:**
- User can sign up with email or Google
- User completes or skips onboarding
- Data written to Firestore correctly
- Mobile and desktop layouts render correctly
- App deployed on Vercel with live URL

---

## 2. Phase 2 — Core Logging Loop (Week 3–4)

**Goal:** The app's reason to exist. Log a full workout, see PR detected, earn XP. This is the loop that must feel great.

### Week 3

**Day 15–16: Exercise bank**
- [ ] Create `src/data/exercises.json` — curated 80–100 exercise list
- [ ] Fields: key, name, muscleGroup, equipmentRequired, medicallyRestricted, aliases
- [ ] `useExerciseSearch` hook: filters by user's equipment + medical flags, fuzzy text match
- [ ] `ExerciseSearch` component — input + dropdown results (shared, used in both layouts)

**Day 17–18: Logger core**
- [ ] `sessionStore` Zustand store
- [ ] Session setup bottom sheet (mood tag + stomach flag)
- [ ] `useWorkoutLogger` hook: addExercise, addSet, updateSet, markSetDone, finishSession
- [ ] `SetRow` component — weight input, reps input, done button
- [ ] `MobileLogger` — full-screen layout, timer, add exercise button, exercise list
- [ ] `DesktopLoggerPanel` — slide-in right panel (Framer Motion)

**Day 19–21: Set completion + PR detection**
- [ ] Set complete animation (Framer Motion spring on checkmark)
- [ ] `usePRDetection` hook — reads `prs/{exerciseKey}`, compares, writes if beaten
- [ ] PR celebration component — full-screen overlay, particle animation (CSS-only for now)
- [ ] XP queuing: track XP earned during session in sessionStore

### Week 4

**Day 22–23: Session complete + XP system**
- [ ] Session complete screen — duration, volume, sets, PRs, XP breakdown
- [ ] `useXPEngine` hook — awardXP, level check, streak update
- [ ] `xpStore` wired to real Firestore data
- [ ] Firestore batch write on session complete (session + exercises + PRs + xpLog + user doc update)
- [ ] Level-up detection — trigger level-up animation when threshold crossed
- [ ] Level-up animation component (Framer Motion staggered text reveal)

**Day 24–25: Streak system**
- [ ] Streak logic in `useXPEngine` (see BACKEND_SCHEMA.md Section 7)
- [ ] Streak milestone XP bonuses (3-day, 7-day, 30-day)
- [ ] Streak counter on home screen, wired to real data
- [ ] XP bar on home screen, animates on XP award

**Day 26–28: Polish Phase 2**
- [ ] Empty state: no exercises added yet → "Search and add an exercise above"
- [ ] Empty state: session setup → can start without any pre-setup
- [ ] Test full loop: signup → onboard → start session → log 3 exercises → complete → see XP
- [ ] Test PR detection with manual Firestore data injection
- [ ] Test level-up: manually set XP near threshold, log session, confirm level-up fires

**Phase 2 Definition of Done:**
- Full workout can be logged end-to-end
- PR detected correctly and celebration fires
- XP awarded and persisted after session
- Streak increments correctly day-over-day
- Level-up fires at correct threshold

---

## 3. Phase 3 — Progress + AI Plans (Week 5–6)

**Goal:** The "why keep coming back" layer. See your progress. Get a real AI plan.

### Week 5

**Day 29–30: Progress data layer**
- [ ] `useProgress` hook — queries sessions by exerciseKey, aggregates for charts
- [ ] Strength data: array of { date, weight, reps } per exercise for line chart
- [ ] Volume data: sum totalVolume grouped by week for bar chart
- [ ] PR list: reads `prs/` collection, sorts by date

**Day 31–33: Progress screen (both layouts)**
- [ ] `StrengthChart` component (Recharts LineChart) — shared component
- [ ] `VolumeChart` component (Recharts BarChart) — shared
- [ ] `PRList` component — shared
- [ ] Mobile `MobileProgress` — tab bar (Strength | Volume | PRs)
- [ ] Desktop `DesktopProgress` — side-by-side charts, full PR table
- [ ] Exercise selector (chips on mobile, dropdown on desktop)
- [ ] Empty states on all three tabs

**Day 34–35: Chart polish**
- [ ] Custom Recharts tooltip (dark background, DM Mono numbers)
- [ ] Chart colors matching design system (--secondary line, --primary bars)
- [ ] Grid lines at --border color (barely visible)
- [ ] Responsive chart containers (ResponsiveContainer)

### Week 6

**Day 36–37: Cloud Function setup**
- [ ] Firebase Functions project structure
- [ ] `generatePlan` callable function scaffolded
- [ ] Gemini Flash integration via `@google/generative-ai`
- [ ] Prompt template from TRD Section 6 implemented
- [ ] JSON parse + validation logic
- [ ] Error handling: parse failure → return structured error
- [ ] Local testing with Firebase Emulator

**Day 38–39: Plan generation flow**
- [ ] `useWeeklyPlan` hook — calls Cloud Function, reads weeklyPlans
- [ ] Plan screen (both layouts)
- [ ] Loading skeleton while plan generates
- [ ] Day cards with exercise list, sets/reps/weight
- [ ] "Generate Plan" button with loading state
- [ ] Error state with retry button
- [ ] Today's Mission Card on home wired to current plan (day 1 of current week)

**Day 40–42: Polish Phase 3**
- [ ] Test plan generation with real Gemini Flash call (not emulator)
- [ ] Verify: exercises match user's equipment
- [ ] Verify: medically restricted exercises never appear
- [ ] Verify: weights are based on recent logged weights
- [ ] Progress screen: test with 20+ sessions of mock data
- [ ] Chart performance: confirm renders < 100ms at 30 data points

**Phase 3 Definition of Done:**
- Progress charts render correctly with real data
- Cloud Function deploys and returns valid plan JSON
- Plan displays correctly on both layouts
- Today's Mission Card shows actual plan data

---

## 4. Phase 4 — Challenges + Recap (Week 7–8)

**Goal:** The retention hooks. Give users a reason to come back tomorrow.

### Week 7

**Day 43–44: Comeback Challenge**
- [ ] Challenge data structure in Firestore (from BACKEND_SCHEMA.md)
- [ ] `useChallenges` hook — start, read progress, update
- [ ] Comeback Challenge: 12-week, 40% capacity flag passed to plan generation
- [ ] Challenge card on Home showing progress bar + days remaining
- [ ] Challenge detail screen (mobile full-screen, desktop side panel)
- [ ] Progress update on session complete — `useChallenges.updateProgress()` called

**Day 45–46: Streak Challenge**
- [ ] Streak Challenge: 3×/week for 8 weeks
- [ ] Weekly count tracking in progress doc
- [ ] Current week count display
- [ ] Challenge Hub screen — shows available challenges + active challenges

**Day 47–49: Challenge completion moments**
- [ ] Completion detection logic in `useChallenges`
- [ ] Comeback completion: full-screen "Phoenix Mode" celebration (custom Framer Motion)
- [ ] Streak challenge completion: badge award + large XP burst
- [ ] Badge written to `users/{uid}.badges`

### Week 8

**Day 50–51: Weekly Recap**
- [ ] `useWeeklyRecap` hook — aggregates last 7 days sessions
- [ ] Recap screen: session count, total volume, PRs, XP, top lift
- [ ] Sunday detection + recap banner on Home
- [ ] Recap card design (shareable layout)
- [ ] Desktop: "Download as PNG" — use `html2canvas` or `dom-to-image`
- [ ] Mobile: native share via Web Share API (`navigator.share`)

**Day 52–53: Notifications (basic)**
- [ ] Firebase Cloud Messaging setup
- [ ] Request notification permission on home screen (subtle, not blocking)
- [ ] Smart timing nudge: Cloud Function scheduled trigger (Firebase Scheduler)
- [ ] Streak-at-risk: check at 8pm, send if streak active + nothing logged today

**Day 54–56: Final Polish + Deploy**
- [ ] Full Firestore security rules audit — test every rule
- [ ] All empty states verified
- [ ] All loading states verified
- [ ] All error states verified
- [ ] Mobile test: physical Android device (Chrome)
- [ ] Desktop test: Chrome + Firefox + Safari
- [ ] Vercel production deploy
- [ ] Custom domain (optional: fitdesi.vercel.app or custom)
- [ ] README.md with setup instructions + live URL

**Phase 4 Definition of Done:**
- Comeback + Streak challenges fully functional
- Challenge completion moments fire correctly
- Weekly recap generates and is shareable
- App fully deployed at live URL
- No console errors in production

---

## 5. Git Strategy

```
main          — production branch, auto-deploys to Vercel
dev           — integration branch, all features merge here first
feature/*     — one branch per feature

Branch naming:
feature/auth-screens
feature/workout-logger
feature/pr-detection
feature/xp-engine
feature/progress-charts
feature/gemini-plan-generation
feature/comeback-challenge
feature/weekly-recap

Commit style (conventional commits):
feat: add PR detection on set complete
fix: streak not updating on second session same day
chore: install framer-motion
style: update set row touch targets to 44px
```

**Merge strategy:** Feature → dev (squash merge). Dev → main (merge commit) only after testing.

---

## 6. Copilot Prompts (Agentive Use)

Use these structured prompts in GitHub Copilot Agent mode for each phase:

### Phase 2 Logger
```
I'm building a workout logger in React with Zustand and Firebase Firestore.

Current state shape (sessionStore):
{
  isActive: false,
  exercises: [],  // [{ id, name, exerciseKey, sets: [{ reps, weight, done }] }]
  moodTag: null,
  stomachFlag: false
}

Build the useWorkoutLogger hook with:
- addExercise(exerciseName, exerciseKey)
- addSet(exerciseId) — adds empty set { reps: 0, weight: 0, done: false }
- updateSet(exerciseId, setIndex, field, value)
- markSetDone(exerciseId, setIndex) — sets done: true
- finishSession() — writes to Firestore users/{uid}/sessions/{id}/exercises, 
  calculates totalVolume, writes session doc
- Returns all state + functions

Use Zustand for state. Firebase batch write on finishSession. TypeScript not required.
```

### Phase 3 Cloud Function
```
I'm writing a Firebase Cloud Function (Node.js 20) that:
1. Receives a Firebase callable request with auth context (uid auto-available)
2. Reads last 14 sessions from Firestore: users/{uid}/sessions ordered by date desc
3. Reads user profile: users/{uid} (equipmentList, medicalFlags, userType fields)
4. Builds a prompt for Gemini Flash
5. Calls Gemini Flash using @google/generative-ai SDK
6. Parses the JSON response
7. Writes result to users/{uid}/weeklyPlans/{weekId}
8. Returns { success: true, weekId }

Gemini API key comes from process.env.GEMINI_API_KEY.
Handle errors: auth missing, Firestore read failure, JSON parse failure.
Return structured errors, not throws, so client can handle gracefully.
```

---

## 7. Weekly Checkpoint Questions

Ask yourself these at the end of each week:

**Week 1–2:** Can a new user sign up, complete onboarding, and have a user doc in Firestore?  
**Week 3–4:** Can I log a complete workout, hit a PR, earn XP, and see my streak increment?  
**Week 5–6:** Can I see a progress chart with real data? Does the AI plan make sense for my equipment?  
**Week 7–8:** Is the app fully deployed? Does it feel like a product I'd actually use?

If any answer is "no" — stop adding features. Fix that before moving forward.

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Gemini Flash returns invalid JSON | Medium | High | JSON validation + fallback to default beginner plan |
| Firebase Functions cold start > 5s | Medium | Medium | Add min-instance: 1 in production (costs ~$1/month) |
| Framer Motion animations janky on low-end Android | Medium | Medium | `prefers-reduced-motion` fallback, test on real device early |
| Two component trees doubles UI work | High | Medium | Build shared components first (ExerciseSearch, SetRow, Charts) |
| Streak logic timezone edge case | Medium | Low | Always use server timestamp + store dateString in local timezone |
| Scope creep — adding post-MVP features | High | High | Stick to phase plan. Post-MVP list is locked. |
