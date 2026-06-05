# FitDesi — Product Requirements Document (PRD)

**Version:** 1.0  
**Date:** June 2026  
**Status:** Approved for Build  

---

## 1. Executive Summary

FitDesi is a dark athletic fitness tracking web app targeting Indian gym users aged 18–25. It solves the specific failure mode of Indian gym culture: inconsistent attendance, no tracking, and no comeback structure after breaks. The app is equipment-aware, medically gated, comeback-first, and uses XP + challenge mechanics to drive retention.

Web-first build (React + Vite). Android port planned for next semester. Deployed on Vercel.

---

## 2. Problem Statement

Indian gym users in the 18–25 bracket share a specific pattern:
- Start strong, hit a break (exams, injury, laziness), lose all progress context.
- Return with no baseline, overdo it on day one, quit again.
- Existing apps (MyFitnessPal, Strong) are built for Western gym contexts with full equipment availability. Indian mid-tier gyms don't have half the listed exercises.
- No app treats the "comeback" as a first-class user journey.
- Gamification in fitness apps is typically cosmetic. FitDesi wires XP directly to logged behavior.

---

## 3. Target Users

### Primary: The Inconsistent Trainer
- Age 18–24, male, college or early career.
- Trains 3–5x/week when consistent, disappears for 2–6 weeks routinely.
- Mid-tier gym: has barbells, dumbbells, cables, maybe a Smith machine — not always a full rack or specialty equipment.
- Uses his phone in the gym. Won't open a laptop for logging.
- Cares about PRs, aesthetics (arms, chest), and peer comparison.

### Secondary: The Beginner
- Never tracked workouts before. Doesn't know what to do.
- Needs a generated plan, not a blank logging sheet.
- Will follow a structured challenge if the friction to start is low enough.

---

## 4. Goals

### Product Goals
- Make workout logging faster than a notes app (target: < 10 taps to log a full set).
- Make comebacks feel structured and celebrated, not shameful.
- Auto-generate a weekly plan from real logged data — not a generic template.
- Retain users via XP + challenges, not push notification spam.

### Portfolio Goals
- Demonstrate full-stack web product (React + Firebase + AI integration).
- Differentiate from Amnesia Anchor (Android/ML) — proves web product depth.
- Live deployed URL with real data model, real AI calls, real auth.

---

## 5. Success Metrics (MVP)

| Metric | Target |
|---|---|
| Onboarding completion rate | > 70% of signups reach home screen |
| Session logged within first visit | > 50% |
| Plan generated per user | 1 within first 7 days |
| PR detected per user (first 2 weeks) | ≥ 1 |
| Streak > 3 days reached | > 30% of active users |

These are portfolio-context targets, not growth targets.

---

## 6. Feature Inventory

### MVP (Build this summer)

#### Auth
- Email + password sign-up / login
- Google OAuth sign-in
- Persistent session via Firebase Auth

#### Onboarding (one-time, skippable)
- User type selection: Comeback / Beginner / Consistent Trainer / Challenge Seeker
- Equipment picker: multi-select from curated list (barbell, dumbbells, cables, Smith machine, pull-up bar, bench, leg press, etc.)
- Medical restriction flags: varicocele, bad knees, lower back issues, post-surgery, shoulder impingement
- Skip option — all fields configurable later in Profile

#### Workout Logging
- Tap-based set entry: large +/− buttons for reps and weight
- Exercise search with curated Indian gym exercise bank
- Session mood tag: 💪 Locked In / 😐 Average / 😴 Low Energy
- Stomach/fatigue flag before session starts → AI reduces volume in next plan
- Set completion animation on each logged set
- Session summary screen on finish (total volume, sets, XP earned)
- PR auto-detection per exercise per rep-count

#### XP Engine
- XP events: session logged (+50), PR hit (+10 per PR), challenge mission (+25), body measurement logged (+20)
- Streak bonuses: 3-day (+30), 7-day (+100), 30-day (+500 + badge)
- Streak tracked and displayed on home screen
- Level tiers: Rookie (1–5) → Challenger (6–15) → Athlete (16–30) → Elite (31+)
- Never punish — XP only goes up

#### Progress Tracking
- Strength chart per exercise (weight × date, line chart)
- Weekly volume chart (total kg lifted per week, bar chart)
- All-time PR list per exercise
- Streak counter

#### AI Plan Generation (Gemini Flash)
- Input: last 14 sessions + mood/stomach flags + equipment list + medical flags + user type
- Output: structured weekly plan (days × exercises × sets × reps × weight)
- Auto-triggered weekly (Monday)
- Manual trigger via UI button
- Never generates movements involving medically flagged muscle groups

#### Challenges
- **Comeback Challenge:** 6–12 weeks adaptive, starts at 40% capacity, 2× XP, Phoenix badge on completion
- **Streak Challenge:** 3×/week for 8 weeks, Streak Shield power-up on completion

#### Weekly Recap
- Every Sunday: session count, total volume, PRs hit, XP earned, streak status
- Shareable card (desktop screenshot, mobile share sheet)

#### UI Celebration Moments
- PR: full-screen particle burst + XP counter animation
- Level-up: staged reveal of new tier name
- Set complete: haptic (mobile) + checkmark micro-animation
- Comeback milestone: dedicated full-screen moment

#### Notifications (basic)
- Smart timing nudge: 30 min before usual training time
- Streak-at-risk: sent at 8pm only if streak active and nothing logged that day

---

### Post-MVP (Next semester / after deploy)

- Voice logging ("3 sets 8 reps 30kg barbell curl")
- MMC (Mind-Muscle Connection) rating per set (1–10)
- Body measurements tracking (arms, chest, waist, shoulders) + Berkhan natural potential ceiling
- Strength tiers: Beginner → Intermediate → Advanced → Elite (Indian norm-calibrated)
- 30-Day Arm Builder challenge
- Strength Ladder challenge with friend competition
- Custom challenges (user-defined, AI validates realism, up to 10 friends)
- Friend challenges via invite link
- Gym leaderboard (Elite tier unlock)
- Shareable milestone cards (PR, level-up, weekly recap)
- Power-up shop: Streak Shield (150 XP), XP Booster 2× (200 XP), Challenge Skip (100 XP), Plan Refresh (75 XP)

---

## 7. User Stories (MVP)

### Auth
- As a new user, I can sign up with email or Google so I can start using the app.
- As a returning user, I stay logged in across sessions.

### Onboarding
- As a new user, I select my user type so the app knows my context.
- As a user with a bad knee, I flag it so the AI never generates knee-heavy exercises.
- As a user who wants to skip setup, I go straight to the home screen and configure later.

### Logging
- As a user in the gym, I can log a set in under 5 seconds.
- As a user, I see a satisfying animation when I complete a set.
- As a user who's feeling off, I flag low energy before my session so the AI adjusts next week's plan.
- As a user who just hit a PR, I see a celebration moment and earn bonus XP.

### Plan
- As a user on Monday, I receive a new weekly plan generated from my last 2 weeks of data.
- As a user, I can see my plan broken down by day with exercises, sets, reps, and target weight.

### Progress
- As a user, I can see my bench press progression over the last 3 months as a chart.
- As a user, I can see all my all-time PRs in one list.

### Challenges
- As a user returning after a 3-week break, I start the Comeback Challenge and train at reduced load with 2× XP.

---

## 8. Screen Inventory

### Auth Screens
- `/` — Landing page
- `/login` — Login
- `/signup` — Sign up

### Onboarding Screens (one-time)
- `/onboarding/type` — User type selection
- `/onboarding/equipment` — Equipment picker
- `/onboarding/medical` — Medical flags
(skip at any step → `/home`)

### App Screens
- `/home` — Today's Mission card + streak + XP bar
- `/workout` — Active session logger (mobile: full-screen, desktop: side panel)
- `/workout/complete` — Session complete + XP summary
- `/progress` — Charts: strength per exercise, weekly volume, PRs
- `/plan` — Weekly plan view
- `/challenges` — Challenges hub + active challenge progress
- `/profile` — User settings, equipment, medical flags, level, badges

---

## 9. Non-Functional Requirements

- Dark theme only. No light mode toggle.
- Auth-gated — `/login` redirect for all routes except landing.
- Mobile layout must feel native — no shrunk desktop.
- No offline support in MVP.
- Page load < 2s on a 4G connection.
- Gemini API key never exposed to client.
- Firestore security rules enforce per-user data isolation.
- WCAG AA contrast compliance on all text.

---

## 10. Out of Scope (MVP)

- iOS / Android native app
- Social feed or general social features
- Payment / subscription
- Third-party wearable integration (Apple Watch, Fitbit)
- Nutrition tracking
- Video exercise guides
- Coach / PT accounts
