# FitDesi — Ultimate End-to-End System Blueprint & Technical Manual

This blueprint serves as the comprehensive, developer-level documentation for the entire FitDesi codebase. It details every store, hook, component, and database model, along with their exact state variables, methods, parameters, and algorithms.

---

## 📂 Section 1: Architectural Overview & Project Layout

FitDesi consists of a unified React client and a companion Node.js Express backend. The application codebase is organized into modular directories under `src/`:

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

State in FitDesi is managed using decentralized Zustand stores located in `src/stores/`. This ensures fast, boilerplate-free state updates across highly interactive views.

### 1. Authentication Store (`authStore.js` / `useAuthStore.js`)
* **Purpose**: Manages current user state, auth token caches, and user profile data retrieved from `/users/{uid}`.
* **State Variables**:
  * `uid`: `string | null` (The authenticated user ID).
  * `user`: `object | null` (The Firebase auth user metadata).
  * `profile`: `object | null` (Custom user document from `/users/{uid}`, containing level, XP, and squad details).
  * `loading`: `boolean` (True during auth state resolution).
* **Methods**:
  * `setAuthUser(user, profile)`: Binds the user and profile documents to state.
  * `clearAuth()`: Resets all state values to null on logout.
  * `updateProfileField(field, value)`: Updates a single profile field in local state and triggers a fast Firestore write.

### 2. Session & Workout Store (`useWorkoutStore.js` / `sessionStore.js`)
* **Purpose**: Orchestrates active workout logging on both mobile and desktop panels.
* **State Variables**:
  * `activeSession`: `object | null` (The session currently being logged).
  * `exercisesList`: `array` (List of exercises currently added to the active session).
  * `isLogging`: `boolean` (Tracks if a workout is in progress).
  * `startTime`: `Date | null` (Timestamp of when the session started).
* **Methods**:
  * `startNewSession(workoutTemplate)`: Initializes the active session object with timestamps and template targets.
  * `addExerciseToSession(exerciseKey)`: Appends a new exercise with empty set rows.
  * `updateSetRow(exerciseKey, setIndex, updatedFields)`: Modifies weight, reps, RPE, or MMC of a specific set.
  * `removeExercise(exerciseKey)`: Drops an exercise from the active logging buffer.
  * `resetSession()`: Discards all active session data.

### 3. Video Bay Store (`useVideoBayStore.js`)
* **Purpose**: Manages video asset states, drawing tools, and biomechanical parameters on the Bar Path Autopsy page.
* **State Variables**:
  * `videoFile`: `File | null` (Selected mp4/mov video file).
  * `comparisonVideoFile`: `File | null` (Secondary video file for comparison).
  * `barPathCoordinates`: `array` (Coordinates of the traced bar path).
  * `torsoAnglePoints`: `array` (Start and end coordinates of the drawn torso line).
* **Methods**:
  * `setVideo(file)`: Loads the primary video file.
  * `setComparisonVideo(file)`: Loads the secondary video.
  * `saveDrawings(path, torsoPoints)`: Commits coordinates to state when the drawing gesture ends, preventing performance lag during active drags.

### 4. XP & Gamification Store (`useXPStore.js`)
* **Purpose**: Manages XP updates, levels, and level-up animations.
* **State Variables**:
  * `currentXP`: `number` (Current XP points).
  * `level`: `number` (Current user level).
  * `showLevelUpModal`: `boolean` (Controls the visibility of the celebratory level-up screen).
* **Methods**:
  * `addXP(amount)`: Adds XP, calculates if a level boundary has been crossed, and sets `showLevelUpModal` to true if a level-up occurs.

---

## ⚓ Section 3: Custom React Hooks (`src/hooks/*`)

Hooks encapsulate business logic, Firestore queries, and calculations, separating them from the UI presentation layer.

### 1. `useWorkoutLogger.js` (Workout Submission & Titan Damage Engine)
* **Purpose**: Saves completed workouts to Firestore and updates squad raid progress in a single transaction.
* **Key Methods**:
  * `saveSession(sessionData)`:
    1. Reads `activeSession` from state.
    2. Calculates total session volume:
       $$\text{Session Volume} = \sum (\text{weight} \times \text{reps})$$
    3. Triggers PR detection (`usePRDetection`) to verify if any set exceeds the current exercise record.
    4. Writes the session to `/users/{uid}/executed_sessions/{sessionId}` (or `/users/{uid}/sessions`).
    5. **Titan Damage Resolution**: If the user belongs to a squad and a Titan challenge is active, it calculates damage (applying a `1.5x` multiplier for exercises matching the Titan's weakness), and executes an atomic Firestore `increment` update on the squad document:
       ```javascript
       const batch = writeBatch(db);
       batch.update(squadRef, {
         "activeChallenge.currentHP": increment(-sessionDamage),
         [`activeChallenge.progress.${uid}`]: increment(sessionDamage)
       });
       ```
    6. Clamps the HP at `0` using server-side validation rules.

### 2. `usePRDetection.js` (Personal Record Tracker)
* **Purpose**: Scans completed workout sets on session submission to detect personal breakthroughs.
* **Logic**:
  * Compares each set's weight against the matching document in `/users/{uid}/prs/{exerciseKey}`.
  * If the new weight is greater than the recorded weight, it marks the set as a new PR.
  * Updates the document in the `prs` subcollection with the new weight, reps, and date.

### 3. `useProgress.js` (Strength & Volume Chart Data Layer)
* **Purpose**: Aggregates history logs to feed Recharts progression graphs.
* **Functions**:
  * `useStrengthData(uid, exerciseKey)`: Pulls the last 30 logs for a specific exercise and returns them sorted oldest-first to render a linear progression line chart.
  * `useVolumeData(uid)`: Groups the past 8 weeks of sessions, aggregates total volume per week, and returns a dataset for bar charts, filling empty weeks with `0` volume automatically.
  * `usePRList(uid)`: Returns the entire list of user personal records sorted by date descending.

### 4. `useSyncEngine.js` (Dual-Vector Offline Syncing)
* **Purpose**: Handles offline-first data queuing.
* **Logic**:
  * Listens to connection state (`navigator.onLine`).
  * If offline, queued session edits are stored in `IndexedDB`.
  * Upon reconnecting, it resolves conflicts by separating planned schedules (`planned_targets`) and logged sessions (`executed_sessions`) to avoid Last-Write-Wins (LWW) data loss.

### 5. `useChallenges.js` (Squad Invites & Contribution Lists)
* **Purpose**: Manages real-time listeners for active squad challenges and leaderboards.
* **Logic**:
  * Sets up an `onSnapshot` listener on `/squads/{squadCode}`.
  * Updates the local UI state with the Titan's name, lore, total/current HP, weakness, and the list of member contributions.

---

## 💻 Section 4: Detailed Component Breakdown (Desktop)

### 1. `AuraForecaster.jsx` (Aura & Beast Mode Forecaster)
* **Path**: `/aura-forecaster`
* **Features**:
  * **Gym Aura Score**: Calculates the user's score based on a rolling 30-day window (adds points for high MMC/RPE, subtracts points for skipped leg days, and applies a compound `-5%` daily decay if inactive for more than 72 hours).
  * **Aura Ledger Feed**: Renders an animated ledger detailing recent credit/debit events (e.g. `+300 Broken Personal Record`, `-500 Leg Day Evader`).
  * **PR Breakthrough Simulator**:
    * Compiles all unique exercises from the user's PR subcollection into a single list, falling back to Bench Press, Squats, and Deadlifts if empty.
    * Uses a `findBestMatch` algorithm to automatically pre-select the user's highest-weight PRs for Chest, Legs, and Back keywords on load.
    * Replaces static text headers with neubrutalist `<select>` dropdowns so users can change the exercise for any of the three slots.
    * Provides `+` and `-` steppers to adjust target weights, recalculating success probabilities in real-time based on RPE, MMC, streak, and decay.
  * **Exaggerated Gainz**: Translates total session volume into comedic equivalents (elephants, Suzuki Swifts, Tesla mileage, and a cat launcher).
  * **Athlete Archetype Matrix**: Norms and renders a Recharts Radar diagram measuring Volume, Intensity, Focus, Consistency, and Upkeep. Maps user attributes to special classes (e.g., Volume Gladiator, Mind-Muscle Monk) with dynamic buffs.

### 2. `SundayMagazine.jsx` (Sunday AI Magazine)
* **Path**: `/magazine`
* **Features**:
  * **Newspaper Layout**: A multi-column, retro-style newspaper layout using black borders, large header fonts, and high-contrast styling.
  * **Telemetry Pre-processing**: Summarizes 7 days of raw workout logs into a light JSON structure to prevent LLM timeouts.
  * **Database Caching & Reprint Limits**: Saves generated issues in Firestore under `/users/{uid}/weekly_magazines/{weekId}` to load them instantly on return visits. Restricts regeneration to a maximum of 1 reprint per week, disabling the button and displaying "Reprint Limit Reached" once exhausted.
  * **Double-Fetch Blocker**: Employs a global JavaScript `Set` blocker on the client side to block duplicate concurrent API requests in React 18 Strict Mode.
  * **Handwritten Cues Overlay**: Overlays the user's handwritten verbal cues (using the `Caveat` handwriting font) directly on top of an SVG barbell diagram.

### 3. `SquadMatchmaker.jsx` (Squad Management & Titan Fights)
* **Path**: `/challenges`
* **Features**:
  * **Squad Code Entry**: Users enter a unique code to join a squad, or click "Create Squad" to generate a new code.
  * **PvE Titan Raid Boss**:
    * Renders a giant, red Boss Health Bar with remaining/total HP.
    * Displays the Titan's name, lore, and weakness (e.g. `1.5x damage on LEGS`).
    * Displays individual squad member damage contributions in a list.

### 4. `DesktopLogEditor.jsx` (Recap Cinema & Log Editor)
* **Path**: `/recap`
* **Features**:
  * **Session Selector**: Loads the last 30 logs (desktop and mobile combined) in a neubrutalist dropdown. Selected sessions sync with the URL parameter `?sessionId=...` for deep-linking.
  * **Per-Set RPE & MMC Sliders**: Moves RPE and MMC sliders from a global level to individual rows. Users can slide values (1-10) for each set, with overall averages dynamically updated at the top of the card.
  * **Desk Vault Cues**: Allows users to write cue notes (e.g. *"Elbows tucked, chest up"*) for exercises. These are stored on the session document and will flash on the mobile app before starting that exercise.
  * **Instant Neubrutalist Calendar Deletion**: The Neubrutalist calendar detail drawer features an inline deletion confirmation flow that deletes the document and its subcollections, updating the calendar grid in real time without refreshing.

### 5. `AcademicBufferConfig.jsx` (Exam Buffer Config)
* **Path**: `/profile` (integrated)
* **Features**:
  * **Exam Date Selector**: A calendar date selector where users highlight their exam weeks.
  * **Volume Deload**: Activating the buffer automatically scales down recommended training volume to exactly **1/9th of normal**.
  * **Streak Protection**: Renders a highly flexible, day-agnostic schedule, allowing users to train on any day of the week without breaking their logging streak.

### 6. `PosterStudio.jsx` (Milestone Poster Studio)
* **Path**: `/poster`
* **Features**:
  * **Sticker Canvas**: Built using `react-konva`. The workspace consists of a base `<Stage>` containing multiple `<Layer>` components.
  * **Layer Hierarchy**:
    1. **Background Layer**: Renders the poster canvas background color or gradient.
    2. **Data Layer**: Displays text shapes rendering the user's session achievements (e.g., *"Bench Press: 100kg x 3"*, *"Total Volume: 8,400 kg"*).
    3. **Sticker Layer**: Houses draggable, scalable Konva `<Image>` components representing badges (e.g., `PR SHATTERED`, `LEVEL UP`, `STREAK HERO`).
  * **Interaction**: Each sticker has `draggable={true}` enabled. When selected, the Transformer component (`<Transformer>`) wraps the image, rendering resize anchors.
  * **QR Sharing & PNG Export**:
    * Tapping **EXPORT** triggers `stageRef.current.toDataURL({ pixelRatio: 2 })` to render a high-resolution PNG image data string.
    * The image is uploaded to Firebase Storage (or converted to a blob), generating a public shareable URL.
    * The URL is passed to a QR Code generator (`qrcode.react`), which renders a QR code in the sharing modal. Scanning this code downloads the image directly to the user's mobile device.

---

## 📱 Section 5: Detailed Component Breakdown (Mobile)

### 1. `MobileLogger.jsx` (Active Workout Logger)
* **Features**:
  * **Active Exercise Search**: Integrates `useExerciseSearch.js` to allow fast autocomplete searches of the exercises catalog.
  * **Rest Timer Panel**: Renders a circular countdown timer at the bottom of the screen.
  * **Dynamic Cues Display**: If a desk vault cue exists for the selected exercise, a glowing warning card pops up containing the cue text (e.g., *"Keep elbows tucked"*).
  * **Set Rows**: Interactive list of sets. Users can check off sets as they complete them to trigger the rest timer.

### 2. `MobileHome.jsx` (Mobile Dashboard)
* **Features**:
  * **Daily Checklist**: Displays remaining targets for the day.
  * **Active Streak Counter**: Shows the number of consecutive days logged.
  * **XP Bar**: Visual indicator of current level progress.

### 3. `MobileProgress.jsx` (Mobile Charts)
* **Features**:
  * **Strength Progression Line Charts**: Renders simplified Recharts line graphs showing 1RM (one-rep max) improvements.
  * **PR list**: Scrollable list of all personal records.

---

## 🧮 Section 6: Key Algorithms & Formulas

### 1. Gym Aura Score Calculation
* **Base Score**: Starts at `1000` points.
* **Workouts**: Add `100` points for every completed workout session.
* **Intensity (RPE)**: Add `150` points for any session with an average RPE &ge; 8.
* **Focus (MMC)**: Add `150` points for any session with an average MMC &ge; 8.
* **PRs**: Add `300` points for every personal record broken.
* **Streak**: Add `150` points per day of active logging streak (capped at `3000` points).
* **Penalties**:
  * Distracted lifting: Subtract `150` points for any session with an average MMC < 5.
  * Short session: Subtract `100` points for any session shorter than 35 minutes.
  * Leg Day Evader: Subtract `500` points if the user logs upper body volume but zero leg volume over the last 30 days.
* **Upkeep Decay**: If no workouts are logged for more than 72 hours, a daily compound decay penalty is applied:
  $$\text{Aura}_{\text{decayed}} = \text{Aura}_{\text{base}} \times 0.95^{\lfloor \text{Days Inactive} - 3 \rfloor}$$
* **Capping**: Final score is capped strictly between `0` and `10,000` points.

### 2. PR Breakthrough Probability Simulator
* **Calculations**:
  * Bench/Chest Slot:
    $$\text{Diff} = \text{Target} - \text{Best}$$
    $$\text{Prob} = 90 - (\text{Diff} \times 4) + (\text{AvgMMC} \times 1.5) + (\text{Streak} \times 1.5) - (\text{DaysInactive} \times 2)$$
  * Squat/Legs Slot:
    $$\text{Diff} = \text{Target} - \text{Best}$$
    $$\text{Prob} = 90 - (\text{Diff} \times 2.5) + (\text{AvgMMC} \times 1.5) + (\text{Streak} \times 1.5) - (\text{DaysInactive} \times 2)$$
  * Deadlift/Back Slot:
    $$\text{Diff} = \text{Target} - \text{Best}$$
    $$\text{Prob} = 92 - (\text{Diff} \times 2.0) + (\text{AvgMMC} \times 1.5) + (\text{Streak} \times 1.5) - (\text{DaysInactive} \times 2)$$
  * All probabilities are clamped between `1%` and `99%`.

### 3. PvE Titan Raid Boss scaling
* **Calculations**:
  * **Base HP**: Sum of all squad members' average weekly volume over the past 21 days (with a 5,000 kg clinical minimum applied for inactive members).
  * **Win-Streak Multiplier ($\alpha$)**:
    $$\alpha = \min(1.25, 1.05 + \text{winStreak} \times 0.05)$$
  * **Total Titan HP**:
    $$\text{HP}_{\text{Titan}} = \text{Base HP} \times \alpha$$

---

## 🔒 Section 7: Security Rules & Environment Configuration

For absolute environment separation and key protection:
1. **Local Dev**: Runs on your current Firebase sandbox project with the keys stored in local `.env.development` and `serviceAccountKey.json`.
2. **Production Deployment**: Generate brand-new Firebase and API keys, and **never** save them in the codebase files or commit them to Git. Map them entirely to environment variables in your hosting provider's dashboard (Vercel and Render).

### 1. Running the Project Locally

```bash
# 1. Install dependencies
npm install
cd backend
npm install
cd ..

# 2. Run the frontend (Terminal 1)
npm run dev

# 3. Run the backend server (Terminal 2)
cd backend
npm start
```

### 2. Deploying the Frontend (Vercel)
1. Push codebase to GitHub (Git ignores `.env` and `serviceAccountKey.json`).
2. Import project in Vercel. Set framework to **Vite**, build command to `npm run build`, and output folder to `dist`.
3. Add the Vercel **Environment Variables**:
   * `VITE_FIREBASE_API_KEY`
   * `VITE_FIREBASE_AUTH_DOMAIN`
   * `VITE_FIREBASE_PROJECT_ID`
   * `VITE_FIREBASE_STORAGE_BUCKET`
   * `VITE_FIREBASE_MESSAGING_SENDER_ID`
   * `VITE_FIREBASE_APP_ID`
   * `VITE_API_BASE_URL` (Points to your live Render backend URL)
4. Click **Deploy**.

### 3. Deploying the Backend (Render)
1. Connect GitHub repo to Render. Create a new **Web Service**.
2. Set root folder to `backend`, runtime to **Node**, build command to `npm install`, and start command to `npm start`.
3. Add Render **Environment Variables** (protects your JSON keys):
   * `PORT`: `10000`
   * `GEMINI_API_KEY`: *(Prod Gemini Key)*
   * `GROQ_API_KEY`: *(Prod Groq Key)*
   * `VITE_FIREBASE_PROJECT_ID`: `prod-project-id`
   * `FIREBASE_PROJECT_ID`: `prod-project-id`
   * `FIREBASE_CLIENT_EMAIL`: `prod-service-account-email`
   * `FIREBASE_PRIVATE_KEY`: `prod-service-account-private-key-string`
4. Click **Create Web Service**.
