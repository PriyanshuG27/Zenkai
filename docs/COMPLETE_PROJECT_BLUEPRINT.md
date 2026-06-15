# Zenkai — Ultimate End-to-End System Blueprint & Technical Manual

This blueprint serves as the comprehensive, developer-level documentation for the entire Zenkai codebase. It details every store, hook, component, and database model, along with their exact state variables, methods, parameters, and algorithms.

---

## 📂 Section 1: Architectural Overview & Project Layout

Zenkai consists of a unified React client and a companion Node.js Express backend. The application codebase is organized into modular directories under `src/`:

```
d:\Fitdesi\src\
├── App.jsx                   # Central routing gateway (eager/lazy loader)
├── main.jsx                  # Application entry point
├── index.css                 # Base Neubrutalist stylesheet & design tokens
├── stores\                   # Global Zustand state stores (authentication, workouts, UI)
├── hooks\                    # Custom React hooks (telemetry, Sync Engine, XP, challenges)
├── components\
│   ├── desktop\              # Off-Gym Command Center views & components
│   ├── mobile\               # Mobile companion workout logging screens
│   └── shared\               # Universal components (MuscleMap, Leaderboards, Calendars)
├── data\
│   └── exercises.json        # Unified exercises catalog and metadata library
├── utils\                    # Helper functions, dates, and mathematical utilities
└── lib\                      # Database connectivity configuration (Firebase client & API client)
```

---

## 💾 Section 2: Global State Management (Zustand Stores)

State in Zenkai is managed using decentralized Zustand stores located in `src/stores/`.

### 1. Authentication Store (`authStore.js` / `useAuthStore.js`)
- **Purpose**: Manages user auth state and profile documents.
- **State Variables**:
  - `uid`: `string | null` (The authenticated user ID).
  - `user`: `object | null` (The Firebase auth user metadata).
  - `profile`: `object | null` (Custom user document from `/users/{uid}`).
  - `loading`: `boolean` (True during auth state resolution).
- **Methods**:
  - `setAuthUser(user, profile)`: Binds user and profile to state.
  - `clearAuth()`: Resets all values on logout.
  - `updateProfileField(field, value)`: Updates profile fields locally and triggers a fast Firestore write.

### 2. Session & Workout Store (`useWorkoutStore.js` / `sessionStore.js`)
- **Purpose**: Orchestrates active workout logging.
- **State Variables**:
  - `activeSession`: `object | null` (Current session).
  - `exercisesList`: `array` (List of exercises in the active session).
  - `isLogging`: `boolean` (Tracks if logging is in progress).
  - `startTime`: `Date | null` (Session start timestamp).
- **Methods**:
  - `startNewSession(workoutTemplate)`: Initializes active session state.
  - `addExerciseToSession(exerciseKey)`: Appends an exercise with empty set rows.
  - `updateSetRow(exerciseKey, setIndex, updatedFields)`: Modifies weight, reps, RPE, or MMC of a set.
  - `removeExercise(exerciseKey)`: Drops an exercise from the logging buffer.

### 3. XP & Gamification Store (`useXPStore.js`)
- **Purpose**: Manages XP updates, levels, and level-up modal displays.
- **State Variables**:
  - `currentXP`: `number` (Current level progress XP).
  - `cumulativeXP`: `number` (Total verified XP).
  - `level`: `number` (Current level).
  - `showLevelUpModal`: `boolean` (Controls the level-up celebration modal).
- **Methods**:
  - `setXP(xp, cumulative, streak)`: Hydrates XP states.
  - `addXP(amount)`: Adds XP, runs level boundary checks, and triggers level-ups.

### 4. Routine Plan Store (`usePlanStore.js`)
- **Purpose**: Caches and updates weekly training splits.
- **State Variables**:
  - `weeklyPlan`: `object | null` (Active week plan).
  - `loadingPlan`: `boolean`.
- **Methods**:
  - `loadWeeklyPlan(uid, weekId)`: Fetches weekly plan from Firestore.
  - `updatePlanDay(weekId, dayIdx, updatedDay)`: Modifies a day's schedule.

### 5. Squad Management Store (`useSquadStore.js`)
- **Purpose**: Syncs real-time squad state, members, check-ins, activity feeds, and polls.
- **State Variables**:
  - `activeSquad`: `object | null` (Current squad document).
  - `activeSquadCode`: `string | null` (Squad lookup code).
  - `activeSquadMembers`: `array` (Synchronized teammate stats).
  - `activityList`: `array` (Activity feed feed entries).
  - `presenceList`: `array` (Gym check-in schedules).
  - `pollsList`: `array` (Active scheduling polls).
- **Methods**:
  - `subscribeSquad(squadCode, uid)`: Establishes real-time snapshot listeners for the squad and its subcollections.
  - `clearSquad()`: Unsubscribes from listeners and clears the store.

### 6. UI Configuration Store (`useUIStore.js`)
- **Purpose**: Manages theme, PWA install prompts, and notification toasts.
- **State Variables**:
  - `theme`: `"dark" | "light"`.
  - `isStandalone`: `boolean` (True if running in PWA standalone mode).
  - `pwaDeferredPrompt`: `event | null` (Browser install event).
  - `toasts`: `array` (Active toast stack).
- **Methods**:
  - `addToast(message, type)`: Pushes a notification toast.
  - `dismissToast(id)`: Removes a toast.

---

## ⚓ Section 3: Custom React Hooks (`src/hooks/*`)

### 1. `useWorkoutLogger.js` (Session Saver & Titan Damage)
Saves completed workouts to Firestore and updates squad raid progress.
- Calculates session volume:
  $$\text{Volume} = \sum (\text{weight} \times \text{reps})$$
- Triggers PR detection (`usePRDetection`) to verify if any set exceeds recorded benchmarks.
- Writes session to `/users/{uid}/sessions` and nested exercise docs.
- **Titan Damage Resolution**: If a Titan challenge is active, it applies a `1.5x` multiplier for exercises matching the Titan's weakness, and runs an atomic transaction updating the squad's HP.

### 2. `usePRDetection.js` (Personal Record Tracker)
Compares logged set weights against `/users/{uid}/prs/{exerciseKey}`. Updates PR benchmarks and triggers celebrations if records are broken.

### 3. `useProgress.js` (Strength & Volume Data)
- `useStrengthData(uid, exerciseKey)`: Returns the last 30 logs for an exercise to feed linear charts.
- `useVolumeData(uid)`: Groups the past 8 weeks of sessions into weekly volume datasets.

### 4. `useSyncEngine.js` (Dual-Vector Offline Syncing)
Monitors connection state (`navigator.onLine`). Stores queued workout updates in `IndexedDB` when offline, and resolves sync conflicts when connection is restored.

### 5. `useFCM.js` (Push Notifications Hook)
Asks for browser notification permissions, retrieves the FCM device token, saves it to Firestore, and configures background/foreground notification handlers.

### 6. `useXPEngine.js` (XP rewards calculation)
Validates workouts, applies multipliers for streaks or boosters, adds XP to the user's profile, and awards badges.

### 7. `useAuth.js`
Handles user login, signup, credentials verification, and session persistence listeners.

### 8. `useDeviceLayout.js`
Monitors screen width, using a debounced 100ms listener to toggle layout between `mobile` and `desktop`.

### 9. `useExerciseSearch.js`
Filters and searches the local exercises bank based on name, equipment list, and medical flags.

---

## 💻 Section 4: Component Breakdown (Desktop)

### 1. `AuraForecaster.jsx` (Aura Score & PR Breakthrough)
- **Aura Score**: Evaluates user intensity, MMC, streaks, and penalties (e.g. Leg Day Evader).
- **Radar Matrix**: Displays a Recharts Radar diagram measuring volume, intensity, focus, consistency, and upkeep.
- **PR Breakthrough Simulator**: Recalculates success probabilities based on MMC, streak, and target weight delta.

### 2. `SundayMagazine.jsx` (AI Newspaper)
- Displays a retro newspaper layout summarizing the past 7 days of training metrics.
- Caches generated issues in Firestore to prevent duplicate API requests.

### 3. `SquadMatchmaker.jsx` (Scouting Matrix & Titan Raid Panel)
- **Scouting Matrix**: Tables of gym members registered as free agents. Displays Athlete Scouting Cards with Recharts Radar Charts.
- **Titan Boss Raid**: Renders boss HP bars, lore, and member contribution lists.
- **Streak Rescue**: Spending 50 XP to purchase a Streak Shield for a teammate.

### 4. `PrehabDaemon.jsx` (Mobility Stretches & Timer)
- Maps logged workout telemetry to stretches (e.g., Couch Stretch for Squats/Deadlifts).
- Renders a 2-minute mobility timer, awarding +50 XP on completion (restricted to one claim per day).

### 5. `RecoveryHeatmapSVG.jsx` (Anatomy Map)
- Interactive silhouette representing muscle workload fatigue:
  - `< 30` ACWR $\rightarrow$ Recovered (Neon Green).
  - `30–100` ACWR $\rightarrow$ Intermediate Fatigue (Neon Yellow).
  - `> 100` ACWR $\rightarrow$ Heavy Fatigue (Neon Red).
- Toggles between front and back views.

### 6. `TrophyCabinetView.jsx`
- Milestone achievements grid displaying unlocked badges (e.g. Century Club for 100kg Bench).

---

## 📱 Section 5: Component Breakdown (Mobile)

### 1. `MobileLogger.jsx` (Active Workout Logger)
- Integrates `useExerciseSearch.js` for fast exercise lookup.
- Renders a circular countdown rest timer at the bottom of the screen.
- Displays glowing cards for Desk Vault cues before starting exercises.

### 2. `MobileHome.jsx` (Mobile Dashboard)
- Renders checklists, consistency streaks, and XP level bars.
- Provides quick-log inputs powered by `nlpParser.js`.
