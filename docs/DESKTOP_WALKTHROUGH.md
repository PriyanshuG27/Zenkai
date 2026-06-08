# FitDesi — Desktop Off-Gym Command Center Walkthrough

> **Status**: **Phase Complete.** The FitDesi Desktop application has been transformed from mobile-centric views into a dedicated, high-fidelity **Off-Gym Command Center**. Every command center feature—from the Post-Workout Recap Cinema to the Bar Path Video Autopsy and Accountability Squad Code Draft—is now fully implemented, integrated, and verified. The code builds successfully, and all 165 Vitest unit tests pass.

---

## 📂 Section 1: Desktop Application Routing & Sidebar Navigation

To optimize the desktop experience, all mobile-centric views and placeholder pages have been refactored. The application routing in [`src/App.jsx`](file:///d:/Fitdesi/src/App.jsx) maps routes directly to dedicated, full-screen command center modules:

### 1. App Routing Configuration
The lazy-loaded page components are defined at the top of [`src/App.jsx`](file:///d:/Fitdesi/src/App.jsx):
```javascript
const DesktopDashboard   = React.lazy(() => import('./components/desktop/DesktopDashboard'));
const DesktopLogEditor   = React.lazy(() => import('./components/desktop/DesktopLogEditor'));
const BarPathAutopsy     = React.lazy(() => import('./components/desktop/BarPathAutopsy'));
const PosterStudio       = React.lazy(() => import('./components/desktop/PosterStudio'));
const SquadMatchmaker    = React.lazy(() => import('./components/desktop/SquadMatchmaker'));
const DesktopProfile     = React.lazy(() => import('./components/desktop/DesktopProfile'));
const AuraForecaster     = React.lazy(() => import('./components/desktop/AuraForecaster').then(m => ({ default: m.AuraForecaster })));
const SundayMagazine     = React.lazy(() => import('./components/desktop/SundayMagazine').then(m => ({ default: m.SundayMagazine })));
```

These are routed within the desktop application shell:
* `/home` ➔ `DesktopDashboard` (Bento metrics deck)
* `/recap` ➔ `DesktopLogEditor` (Recap Cinema)
* `/progress` ➔ `BarPathAutopsy` (Bar Path Autopsy Video Bay)
* `/poster` ➔ `PosterStudio` (Milestone Poster Studio)
* `/challenges` ➔ `SquadMatchmaker` (Accountability Squads & PvE Titan Raid Boss Fights)
* `/profile` ➔ `DesktopProfile` (Profile, Trophy Cabinet, and Exam Buffer)
* `/aura-forecaster` ➔ `AuraForecaster` (Aura & Beast Mode Forecaster)
* `/magazine` ➔ `SundayMagazine` (Sunday AI "Scouting Report" Magazine)

### 2. Neubrutalist Sidebar Navigation ([`DesktopSidebar.jsx`](file:///d:/Fitdesi/src/components/desktop/DesktopSidebar.jsx))
Designed with high-contrast borders and thick drop shadows, the sidebar acts as the main hub:
* Employs active route highlighting (e.g., matching paths like `/recap`, `/poster`).
* Replaces the former start workout triggers on desktop (which was a mobile anti-pattern) with planning and analysis deck launchers.
* Implements direct keyboard shortcuts support.

---

## 💻 Section 2: Unified Bento Dashboard & Exercises Telemetry

The main desktop view ([`DesktopDashboard.jsx`](file:///d:/Fitdesi/src/components/desktop/DesktopDashboard.jsx)) features a dense bento grid:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FITDESI TELEMETRY CENTER                        │
├────────────────────────────────────────┬───────────────────────────────┤
│                                        │                               │
│  [ Quick Workspace Tools ]              │   [ Neubrutalist Calendar ]   │
│  - Recap Cinema     ➔ /recap           │                               │
│  - Poster Studio     ➔ /poster         ├───────────────────────────────┤
│                                        │   [ Mannequin Telemetry ]     │
├────────────────────────────────────────┤   - SVG Recovery Map          │
│                                        │   - MuscleDetailPanel         │
│  [ Recent Gym Execution Logs ]         │                               │
│  - Real-time snapshot feed             ├───────────────────────────────┤
│  - Merges Mobile & Desktop sources     │                               │
│  - Dyn RPE, MMC, & Notes stats         │   [ Exercises Catalog ]       │
│                                        │   - Logged vs Unlogged badges │
└────────────────────────────────────────┴───────────────────────────────┘
```

### 1. Recent Execution Logs Feed
* Uses real-time listeners (`onSnapshot`) to query both `sessions` (logged from mobile) and `executed_sessions` (logged/edited from desktop) subcollections.
* Merges logs dynamically, sorts them chronologically (descending), and slices to display the **last 3 sessions**.
* Displays RPE, MMC, notes, and a list of movements completed.

### 2. Searchable Exercises Telemetry Catalog
* Loads all data from `exercises.json` and renders a searchable catalog.
* Sifts exercises by muscle group filter dropdowns (Chest, Back, Legs, Shoulders, Arms, Core).
* Compares entries against the user's Firestore Personal Records (`prs` collection) to display neubrutalist badges:
  * **✅ Logged (PR: X kg x Y reps)**: Highlights movements previously completed by the user.
  * **⚪ Unlogged**: Shows movements not yet executed.

### 3. Mannequin Telemetry Card
* Integrates the premium, high-quality vector silhouette [`MuscleMap`](file:///d:/Fitdesi/src/components/shared/MuscleMap.jsx) mapping Chest, Shoulders, Back, Arms, Legs, and Core.
* Computes muscle fatigue and strength indices from the merged sessions log.
* Highlights muscle paths with dynamic visual gradients representing relative recovery. Clicking a path loads alternative movements and estimated recovery timers in the `MuscleDetailPanel`.

---

## 🎬 Section 3: Post-Workout Recap Cinema & Desk Log Editor

Located at [`DesktopLogEditor.jsx`](file:///d:/Fitdesi/src/components/desktop/DesktopLogEditor.jsx), this workspace is designed for editing logs:

1. **Log List Selector**: Loads the last 30 logs (desktop and mobile combined) in a neubrutalist dropdown. Selected sessions sync with the URL parameter `?sessionId=...` for deep-linking.
2. **Per-Set RPE & MMC Sliders**: Moves RPE and MMC sliders from a global level to individual rows. Users can slide values (1-10) for each set, with overall averages dynamically updated at the top of the card.
3. **Desk Vault Cues**: Allows users to write cue notes (e.g. *"Elbows tucked, chest up"*) for exercises. These are stored on the session document and will flash on the mobile app before starting that exercise.
4. **Instant Neubrutalist Calendar Deletion**: The Neubrutalist calendar detail drawer features an inline deletion confirmation flow that deletes the document and its subcollections, updating the calendar grid in real time without refreshing.

---

## 📹 Section 4: Bar Path Autopsy (60fps Imperative Video Bay)

Built at [`BarPathAutopsy.jsx`](file:///d:/Fitdesi/src/components/desktop/BarPathAutopsy.jsx), this tool allows frame-by-frame scrubbing:

### 1. Imperative Playback Synchronization (60fps Lag-Free)
To prevent React/Zustand state updates from throttling rendering at 60fps:
* Playback head scrubbing uses direct DOM reference mutations (`videoRef.current.currentTime = ...`) triggered by keyboard arrow key listeners (Left/Right to step 0.1s, Shift+Left/Right to step 1s).
* Canvas markup overlays are updated imperatively via direct `stageRef` canvas mutations during active mouse drags.
* Coordinates and angles are committed to Zustand state **only** when the drawing gesture finishes, bypassing rendering latency.

### 2. Biomechanical Vector Analysis
* Users can upload a training video and a comparison lift video.
* The tool calculates horizontal bar sway range and provides form correction guidelines (e.g., knee travel warnings, path verticality markers).

---

## 🎨 Section 5: Neubrutalist Social Poster Studio

Created in [`PosterStudio.jsx`](file:///d:/Fitdesi/src/components/desktop/PosterStudio.jsx), this module utilizes **React-Konva** to compile milestone achievements into graphics:

1. **Graphic Canvas Editor**: Drag and drop milestone stickers (`PR SHATTERED`, `LEVEL UP`, `STREAK HERO`), adjust text colors, and configure neubrutalist borders.
2. **QR Code Sharing**: Generates a mobile-friendly QR code encoding the session URL. Scanning the QR code downloads the rendered graphic directly to the user's phone.

---
## 🤝 Section 6: Accountability Squads & PvE Titan Raid Boss Fights

### 1. Squad Code Draft System ([`SquadMatchmaker.jsx`](file:///d:/Fitdesi/src/components/desktop/SquadMatchmaker.jsx))
* Replaces email-based scraping queries with unique squad codes (e.g. `FIT-PRIY821`).
* Automatically registers a code to a user's profile upon signup or Google Authentication login.
* Direct document fetches on `/squad_codes/{code}` bypass collection-wide list blocks in `firestore.rules`.
* Calculates team multipliers (e.g., +25% XP) and tracks daily team check-ins in real time.

### 2. PvE Titan Raid Boss Fights
* **MMO-style Boss Battles**: Integrated an auto-scaling PVE Titan Boss fight into squad challenges using compressed volume summaries and consistency multipliers.
* **HP Scaling**: Titan HP scales dynamically with the squad's average weekly volume and active win-streak (capped at a 1.25x overload multiplier).
* **Distributed Concurrency Safe Lock**: Uses Firestore's atomic `increment()` API to log workout damage synchronously and prevent race conditions. Clamps the boss's HP safely at 0 (`Math.max(0, currentHP)`) and locks completion state to prevent double-claiming raid rewards.
* **Weakness & Roster Damage Tracking**: Highlights specific muscle weaknesses (e.g. "1.5x damage on Legs") and lists individual squad member damage contribution statistics in a neubrutalist progress panel.

### 3. Academic Exam Buffer Config ([`AcademicBufferConfig.jsx`](file:///d:/Fitdesi/src/components/desktop/AcademicBufferConfig.jsx))
* Features a calendar date selector to highlight exam weeks.
* Activating the buffer automatically scales down target volume to exactly **1/9th of normal** in the Firestore schedule.
* Pushes flexible, day-agnostic plan adjustments to the mobile app, allowing busy students to train on any day they find time during exams without breaking their streak.

---

## ⚡ Section 7: Aura & Beast Mode Forecaster

Located at [`AuraForecaster.jsx`](file:///d:/Fitdesi/src/components/desktop/AuraForecaster.jsx), this dashboard converts training consistency, volume, and focus into gamified status metrics:

### 1. Gym Aura Points & Upkeep Decay
* **Score Capping**: Computes a dynamic Aura Score between `0` and `10,000` based on a rolling 30-day window.
* **Aura Ledger Credits/Debits**: Generates a detailed neubrutalist transaction log listing credits (e.g., completed workouts, RPE &ge; 8, MMC &ge; 8, active logging streaks) and debits (e.g., distracted lifting, short session times, leg day evasions).
* **Upkeep Decay**: Triggers a compound `-5%` daily decay if the user is inactive for more than 72 hours (3 days) since their last logged session:
  $$\text{Aura}_{\text{decayed}} = \text{Aura}_{\text{base}} \times 0.95^{\lfloor \text{Days Inactive} - 3 \rfloor}$$

### 2. PR Breakthrough Simulator & Steppers
* **Interactive Dropdown Selectors**: Replaced static lift labels with dynamic `<select>` inputs containing all unique exercises logged in the user's PR database.
* **Auto-Selection**: Automatically pre-selects the user's absolute best personal records (highest-recorded weights matching Chest, Legs, and Back keywords) on initial component mount.
* **Milestone Targets & Live Recalculations**: Calculates success probabilities dynamically. Users can use neubrutalist `+` / `-` steppers to modify target weights; probability values shift live based on RPE, MMC, streak multipliers, and inactivity decay.

### 3. Exaggerated Volume Translation & Lifter Archetypes
* **Exaggerated Gainz**: Converts calculated workout volume into comedic real-world comparisons (African Elephants, Suzuki Swifts, Tesla mileage, or range of a kinetic cat launcher).
* **Radar Matrix**: Norms and renders a Recharts Radar diagram measuring Volume, Intensity, Focus, Consistency, and Upkeep. Maps user attributes to special classes (e.g., Volume Gladiator, Mind-Muscle Monk) with dynamic buffs.

---

## 📰 Section 8: Sunday AI "Scouting Report" Magazine

Located at [`SundayMagazine.jsx`](file:///d:/Fitdesi/src/components/desktop/SundayMagazine.jsx), this editorial newspaper generates ruthless AI coaching feedback:

### 1. Telemetry Pre-Processing
* Compresses the last 7 days of raw workout logs into a light, standardized JSON payload before querying the backend API. This prevents token bloat and API timeout errors.
* Sanitizes Llama/Groq markdown syntax dynamically via regex stripping before JSON parsing to prevent crash exceptions.

### 2. Double-Fetch Blocker & Caching
* **Caching**: Stores generated magazine editions in Firestore under `users/{uid}/weekly_magazines/{weekId}` to load cached copies instantly on repeat visits.
* **Double-Fetch Protection**: Employs a client-side global fetch blocker Set. Disallows redundant parallel API requests when React 18 Strict Mode mounts/unmounts pages concurrently.
* **Reprint Limit**: Restricts magazine regeneration to a maximum of 1 reprint per week, disabling the button and displaying "Reprint Limit Reached" once exhausted.

### 3. Handwritten Cues Overlay
* Integrates Google Fonts (`Caveat` / `Permanent Marker`) to render handwritten cues directly on top of an SVG training schematic, visually guiding form adjustments.

---

## 🔒 Section 9: Firestore Security Rules & Sync Resolution

### 1. Hardened Firestore Rules ([`firestore.rules`](file:///d:/Fitdesi/firestore.rules))
* **Squad Codes**: Allows direct read on `/squad_codes/{code}` for code-matching searches.
* **Write Permissions**: Restricts write access for `planned_targets`, `executed_sessions`, and `stalledLifts` to the document owner.
* **Leaderboard Scrape Mitigation**: Blocks `/users` list queries, allowing list checks only if a strict filter is applied on leaderboard gym bounds.

### 2. Dual-Vector Sync Engine ([`useSyncEngine.js`](file:///d:/Fitdesi/src/hooks/useSyncEngine.js))
* Avoids Last-Write-Wins (LWW) collisions by segregating planned data (`planned_targets`) and logged sessions (`executed_sessions`).
* Resolves offline gym basement session syncing by calculating the delta difference between plans and execution records once connection is restored.

---

## 🧪 Section 10: Verification & Build Metrics

The desktop modules are compiled and verified:
* **Production Build**: Compiles cleanly (`npm run build`) with Vite code-splitting each page into dynamic chunks:
  ```bash
  dist/assets/index-DGcD1gcR.css               79.98 kB
  dist/assets/AuraForecaster-BCj6rTOT.js       32.18 kB
  dist/assets/SundayMagazine-Cq2_xr3T.js       15.29 kB
  dist/assets/SquadMatchmaker-BBRl5QMt.js      57.47 kB
  dist/assets/DesktopLogEditor-BNz2Gg4I.js     11.32 kB
  dist/assets/PosterStudio-CIezTWhY.js        297.78 kB
  dist/assets/index-C-uLXx8e.js               589.47 kB
  ```
* **Unit Testing**: All 165 Vitest unit tests pass successfully.
