# FitDesi — App Flow

**Version:** 1.0  
**Date:** June 2026  

---

## 1. Top-Level Flow

```
[ Open App ]
      │
      ▼
[ Firebase Auth Check ]
      │
      ├── Not authenticated ──► [ Landing Page ] ──► [ Login / Signup ]
      │                                                       │
      │                                                       ▼
      │                                            [ Onboarding Check ]
      │                                                       │
      │                              ┌────────────────────────┤
      │                              │                        │
      │                          Not done                  Skipped / Done
      │                              │                        │
      │                              ▼                        │
      │                     [ Onboarding Flow ]               │
      │                              │                        │
      └── Authenticated ─────────────┴────────────────────────▼
                                                     [ Home Screen ]
```

---

## 2. Auth Flow

### 2.1 New User — Email Signup
```
[ Landing ] 
    → CTA "Get Started" 
    → [ Signup Screen ]
        Fields: Name, Email, Password
        → Validate (email format, password ≥ 8 chars)
        → Firebase createUserWithEmailAndPassword
        → On success: set user doc skeleton in Firestore
        → Redirect → [ Onboarding: User Type ]
```

### 2.2 New User — Google OAuth
```
[ Landing ]
    → "Continue with Google"
    → Firebase signInWithPopup (GoogleAuthProvider)
    → Check Firestore: does users/{uid} exist?
        ├── No  → Create user doc → [ Onboarding: User Type ]
        └── Yes → [ Home Screen ]  (returning Google user)
```

### 2.3 Returning User
```
[ Login Screen ]
    → Email + Password → signInWithEmailAndPassword
    → On success: check onboardingComplete flag
        ├── false → [ Onboarding: resume where left off ]
        └── true  → [ Home Screen ]
```

### 2.4 Persistent Session
```
App mount → onAuthStateChanged listener fires
    → user found in session → skip auth screens → [ Home Screen ]
    → no user → [ Landing ]
```

---

## 3. Onboarding Flow

Single linear flow. Each step writes to Firestore immediately on "Next" — so partial completion is resumable.

```
[ User Type Screen ]
    Options: Comeback / Beginner / Consistent Trainer / Challenge Seeker
    → Select one → Next
    → Writes: users/{uid}.userType

         │
         ▼

[ Equipment Picker ]
    Multi-select grid of equipment icons
    Options: Barbell, Dumbbells, Cables, Smith Machine, 
             Pull-up Bar, Bench, Leg Press, EZ Bar, 
             Resistance Bands, Kettlebell
    → Select any → Next (min 0 selected allowed)
    → Writes: users/{uid}.equipmentList

         │
         ▼

[ Medical Flags ]
    Toggle list: Varicocele, Bad Knees, Lower Back Issues,
                 Post-Surgery (specify area), Shoulder Impingement
    → Select any (or none) → Continue
    → Writes: users/{uid}.medicalFlags, onboardingComplete: true

         │
         ▼

[ Home Screen ]  ← Onboarding XP burst (+100 XP for completing)
```

**Skip logic:** "Skip for now" appears on every step. Tapping skip marks onboarding complete with whatever has been set so far. User can edit all fields in Profile later.

**Back navigation:** Allowed between steps. Never resets prior selections.

---

## 4. Core Workout Logging Loop

This is the most critical flow. Every tap must feel instant.

### 4.1 Starting a Session

```
[ Home Screen ]
    "Start Workout" button (Today's Mission card) OR bottom nav "+" 

         │
         ▼

[ Session Setup ] (takes <10s)
    ┌── Stomach/Fatigue flag: "How's your body today?"
    │       Good / Feeling Off (flag → AI adjusts next plan)
    └── Mood: 💪 Locked In / 😐 Average / 😴 Low Energy

    → "Let's Go" → [ Active Logger ]
    → sessionStore.isActive = true, startTime = now
```

### 4.2 Active Logger

```
[ Active Logger ]
    Top: Session timer (counting up) | Mood tag | End Session button
    
    [ Exercise Search ]
        Type exercise name → search curated exercise bank
        → Select → Exercise added to session
    
    [ Set Entry ]
        Per exercise:
        ┌─────────────────────────────────┐
        │  Barbell Bench Press            │
        │  ─────────────────────────────  │
        │  Set 1: [−] 60 kg [+]  [−] 8 reps [+]  [✓ Done] │
        │  Set 2: [−] 60 kg [+]  [−] 8 reps [+]  [✓ Done] │
        │  + Add Set                      │
        └─────────────────────────────────┘

    [ ✓ Done ] tap on a set:
        → Micro-animation: checkmark scales in
        → PR check runs: compare to users/{uid}/prs/{exerciseId}
            ├── PR broken → PR celebration (full-screen burst)
            └── No PR     → Normal set complete
        → XP +50 queued (awarded on session finish)

    [ + Add Exercise ] → reopens Exercise Search
    [ End Session ] → confirmation bottom sheet → [ Session Complete ]
```

### 4.3 Session Complete Screen

```
[ Session Complete ]
    ┌──────────────────────────────────┐
    │  🔥 Session Done                 │
    │  ──────────────────────────────  │
    │  Duration: 52 min                │
    │  Exercises: 4 | Sets: 16         │
    │  Total Volume: 4,240 kg          │
    │  PRs Hit: 2                      │
    │  ──────────────────────────────  │
    │  XP Earned                       │
    │  Session: +50                    │
    │  PRs (×2): +20                   │
    │  Streak bonus: +30               │
    │  ──────────────────────────────  │
    │  Total: +100 XP                  │
    │  ──────────────────────────────  │
    │  [ Back to Home ]                │
    └──────────────────────────────────┘

Background:
    → Writes session doc to Firestore
    → Writes exercise subdocs
    → Updates PR docs if broken
    → Calls awardXP() → updates user XP + level
    → Updates streak (if first session today)
    → Level-up check → if yes: level-up animation
```

### 4.4 State after Complete

```
sessionStore reset → isActive: false, exercises: []
xpStore updated
If level-up: xpStore.levelName updated + level-up animation fires
Home screen: streak counter +1, XP bar advances
```

---

## 5. Plan Generation Flow

```
[ Trigger: Monday auto OR manual "Refresh Plan" button ]
         │
         ▼
[ Client: calls generatePlan Cloud Function ]
    Shows: loading skeleton on Plan screen
         │
         ▼
[ Cloud Function ]
    → Reads last 14 sessions from Firestore
    → Reads user profile (equipment, flags, userType)
    → If sessions < 3: uses beginner defaults + equipment
    → Builds prompt → calls Gemini Flash
    → Parses JSON response
    → Validates: all exercises ∈ equipment constraints,
                 no exercises violate medical flags
    → Writes to users/{uid}/weeklyPlans/{weekId}
    → Returns { success: true }
         │
         ▼
[ Client: Plan screen updates ]
    Shows: 6-day plan as day cards
    Each card: focus group + exercise list + sets/reps/weight

[ Error state ]
    Gemini fails → shows "Couldn't generate plan. Try again." button
    Parse fails   → same error state, logs to console
```

---

## 6. Challenge Flow

### 6.1 Starting a Challenge

```
[ Challenges Hub ]
    Available challenges:
    ┌─────────────────────────────────────┐
    │  🔥 Comeback Challenge              │
    │  6–12 weeks | 2× XP | Phoenix Badge │
    │  [ Start ]                          │
    ├─────────────────────────────────────┤
    │  ⚡ Streak Challenge                │
    │  3×/week for 8 weeks | Streak Shield│
    │  [ Start ]                          │
    └─────────────────────────────────────┘

[ Start ] tap → confirmation modal:
    "Starting this challenge will track your progress 
    for the next {duration}. Ready?"
    [ Confirm ] → writes to challenges collection
                → user added to participants
                → challenge appears in "Active" section
```

### 6.2 Active Challenge Progress

```
Each session logged → useChallenges.updateProgress() called
    → Checks: does this session satisfy today's challenge mission?
        ├── Yes → progress doc updated, mission XP +25 awarded
        └── No  → no update

Active challenge card on Home:
    Shows progress bar, days remaining, current mission
    Tap → [ Challenge Detail ] screen: full timeline
```

### 6.3 Challenge Completion

```
Final mission logged → completion detected
    → Full-screen milestone moment (specific to challenge type)
    → Badge written to user doc
    → Large XP burst awarded
    → Challenge marked complete in Firestore
    → Shareable completion card generated
```

---

## 7. Progress Flow

```
[ Progress Screen ]
    Default view: last 30 days, all exercises

    [ Strength Chart ]
        X-axis: dates | Y-axis: weight (kg)
        Exercise selector dropdown (or tab bar mobile)
        → Select "Barbell Bench Press"
        → Line chart renders with all logged weights
        → Tap point → tooltip: date, weight, reps

    [ Volume Chart ]
        Weekly total volume as bar chart
        Last 12 weeks

    [ PR List ]
        All-time bests per exercise
        Sorted by: date (newest first) or weight (heaviest first)
```

---

## 8. Weekly Recap Flow

```
[ Every Sunday, first app open ]
    → Recap banner on Home: "Your week is ready 🔥"
    → Tap → [ Weekly Recap Screen ]

    Content:
        Sessions logged this week: N
        Total volume: X kg
        PRs broken: N
        XP earned: N
        Streak status
        Top lift of the week

    [ Share ] → generates image card → native share sheet (mobile) 
                                     → download PNG (desktop)
    [ Close ] → back to Home
```

---

## 9. Profile + Settings Flow

```
[ Profile Screen ]
    User card: name, level, XP, badges earned
    
    Sections:
    ├── Edit Profile: name
    ├── My Equipment: re-opens equipment picker
    ├── Medical Flags: re-opens flags screen
    ├── Notification Preferences: toggle smart nudge, streak alert
    └── Sign Out: confirmation → Firebase signOut → Landing

    Desktop: shown as settings sidebar panel
    Mobile: full-screen scroll
```

---

## 10. Error States

| Scenario | Behaviour |
|---|---|
| No internet on session log | Optimistic UI — show as logged. Firestore SDK queues write and syncs on reconnect |
| Gemini API down | "Plan unavailable. Try again." button. Last plan stays visible |
| Auth token expired | Silently refresh via Firebase SDK. If refresh fails → redirect to login |
| Exercise not found in search | "Not found — add custom" option (post-MVP) |
| No sessions yet on Progress | Empty state: "Log your first workout to see progress" + Start Workout CTA |
| No plan generated yet | "Your first plan is ready to generate" + Generate button |
