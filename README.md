<div align="center">
  <!-- 🔥 Animated Typing Headline 🔥 -->
  <a href="https://github.com/PriyanshuG27/Fitdesi">
    <img src="https://readme-typing-svg.herokuapp.com?font=Barlow+Condensed&weight=800&size=55&pause=1000&color=FF5C00&center=true&vCenter=true&width=800&lines=FITDESI+⚡;TRAIN+SMARTER.+🧠;COME+BACK+STRONGER.+🏋️;POWERED+BY+GEMINI+AI+🚀" alt="Typing SVG" />
  </a>

  <!-- Animated Neubrutalism App Mockup Banner (Cache-Busted Relative Path) -->
  <img src="public/fitdesi_banner_v5.svg?v=7" alt="FitDesi Banner" width="100%" />

  <br /><br />

  <!-- Animated Glowing Gemini Badge -->
  <img src="public/gemini_badge_v3.svg?v=7" alt="Powered by Gemini AI" />
  
  <h3>⚡ Premium Dark Athletic Gym Tracker & Recovery Platform ⚡</h3>
  
  <p>
    FitDesi is a dark athletic fitness tracking web app designed to solve the core failure modes of Indian gym culture: inconsistent attendance, lack of tracking, and difficult comeback phases after breaks.
  </p>

  <!-- 🛡️ Cool Tech Badges -->
  <p>
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E" alt="Vite" />
    <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase" />
    <img src="https://img.shields.io/badge/Gemini_AI-8E75B2?style=for-the-badge&logo=googlebard&logoColor=white" alt="Gemini AI" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind" />
    <img src="https://img.shields.io/badge/Zustand-443E38?style=for-the-badge&logo=react&logoColor=white" alt="Zustand" />
  </p>

  <br />

  <!-- Real-time Status Bento Grid -->
  <table align="center" style="border-collapse: collapse; border: 2px solid #333; background: #080808; font-family: 'Courier New', Courier, monospace; width: 100%; border-radius: 8px; overflow: hidden;">
    <tr style="border-bottom: 1px solid #333;">
      <td style="padding: 15px; border-right: 1px solid #333;"><strong>⚡ SYSTEM STATUS</strong></td>
      <td style="padding: 15px; color: #B5FF2D; border-right: 1px solid #333; text-shadow: 0 0 5px #B5FF2D;">🟢 PRODUCTION ACTIVE</td>
      <td style="padding: 15px; border-right: 1px solid #333;"><strong>🤖 AI ENGINE</strong></td>
      <td style="padding: 15px; color: #00D4FF; text-shadow: 0 0 5px #00D4FF;">⚡ GEMINI 3 FLASH</td>
    </tr>
    <tr>
      <td style="padding: 15px; border-right: 1px solid #333;"><strong>💾 DATABASE</strong></td>
      <td style="padding: 15px; color: #FF5C00; border-right: 1px solid #333; text-shadow: 0 0 5px #FF5C00;">🔥 FIRESTORE</td>
      <td style="padding: 15px; border-right: 1px solid #333;"><strong>🔒 AUTH GATEWAY</strong></td>
      <td style="padding: 15px; color: #F0F0F0; text-shadow: 0 0 5px #FFF;">🛡️ FIREBASE SECURE</td>
    </tr>
  </table>

</div>

---

## 🎨 The Design System (Neubrutalism & OLED)

FitDesi uses a custom **Neubrutalism + Dark OLED** style designed to look premium, energetic, and highly tactile. Interactive elements look *liftable*, matching the physical gym environment.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 PATTERN:     Mobile Bottom Navigation + Full-Screen Context Logging
                Desktop Left Sidebar + Multi-column Bento Grid
💻 THEME:       True OLED Black base (#080808) + High-contrast Borders
💥 ACCENTS:     Burnt Orange (#FF5C00) · Electric Cyan (#00D4FF) · Acid Lime (#B5FF2D)
⚡ TRANSITIONS: Framer Motion spring physics on actions & celebrations
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

<details>
<summary><b>🎨 View Color Token Registry (CSS Variables)</b></summary>

```css
:root {
  /* Backgrounds */
  --bg-base:       #080808;   /* True OLED black */
  --bg-surface:    #111111;   /* Cards, panels */
  --bg-elevated:   #1A1A1A;   /* Modals, dropdowns */
  --bg-input:      #141414;   /* Input fields */

  /* Brand Accents */
  --primary:       #FF5C00;   /* Burnt orange — energy & drive */
  --primary-glow:  rgba(255, 92, 0, 0.25);
  --secondary:     #00D4FF;   /* Electric cyan — stats & tracking */
  --secondary-glow:rgba(0, 212, 255, 0.20);
  --accent-xp:     #B5FF2D;   /* Acid lime — level-up, PRs, milestones */
  --accent-xp-glow:rgba(181, 255, 45, 0.20);

  /* Typography Scale */
  --font-display:  'Barlow Condensed', sans-serif; /* Headings */
  --font-body:     'Outfit', sans-serif;           /* Main UI & reading */
  --font-mono:     'DM Mono', monospace;           /* Numeric stats */
}
```
</details>

---

## 🚀 Key Features

Click to expand and explore the technical implementation of FitDesi's features:

<details>
<summary><b>📱 Dual-Viewport App Layout (Mobile-Native vs. Bento Grid)</b></summary>
<blockquote>
FitDesi mounts completely different component trees based on screen width detection. Mobile screens (width &lt; 768px) load a bottom navigation bar and full-screen workout logger optimized for one-handed thumb reach. Desktop screens load a persistent sidebar with a dense bento-box dashboard of charts, tables, and recent activity logs.
</blockquote>
</details>

<details>
<summary><b>⚡ Fast Gym Logger &amp; PR Engine</b></summary>
<blockquote>
Designed to be faster than standard notes apps, requiring less than 10 total taps to complete a workout. Reps and weights use large, tactile increment/decrement buttons. When a PR is broken, the app detects it instantly and triggers a full-screen canvas particle celebration.
</blockquote>
</details>

<details>
<summary><b>🧠 Gemini AI Workout Planner</b></summary>
<blockquote>
Every week, a serverless Cloud Function triggers `gemini-3-flash` to construct a new 6-day training routine. The prompt feeds the model with the user's available equipment, medical limitations, session mood tags, fatigue logs, and training history, forcing it to outputs structured, type-safe JSON.
</blockquote>
</details>

<details>
<summary><b>🔥 Phoenix & Streak Challenges</b></summary>
<blockquote>
To solve the "post-break" failure loop where returning lifters overtrain and quit, the Phoenix Comeback Challenge scales down previous weights to 40-70% capacity, ramping up over 6-12 weeks with a 2x XP bonus multiplier.
</blockquote>
</details>

---

## 📐 System Architecture

This flowchart maps the relationships between the client, state stores, and Firebase services:

```mermaid
graph TD
    %% Styling
    classDef client fill:#080808,stroke:#00D4FF,stroke-width:2px,color:#FFF;
    classDef firebase fill:#080808,stroke:#FF5C00,stroke-width:2px,color:#FFF;
    classDef gemini fill:#080808,stroke:#B5FF2D,stroke-width:2px,color:#FFF;

    subgraph "📱 Client (React + Vite)"
        UI[Dual-Viewport App Shell]:::client
        Store[Zustand State Engine]:::client
        UI --> Store
    end

    subgraph "☁️ Firebase Backend"
        Auth[Auth Gateway]:::firebase
        DB[(Firestore DB)]:::firebase
        Func[Cloud Functions V2]:::firebase
    end

    subgraph "🧠 AI Core"
        AI[Gemini 3 Flash]:::gemini
    end

    Store -->|Syncs Data| DB
    Store -->|Triggers Gen| Func
    Func -->|Constructs Prompt| AI
    AI -->|Returns JSON Plan| Func
    Func -->|Saves Plan| DB
```

---

## 🧭 Application Flow & User Journey

Here is the step-by-step navigation path of a user from onboarding configuration to tracking exercises and generating routines:

```mermaid
flowchart TD
    %% Styling
    classDef start fill:#111111,stroke:#FF5C00,stroke-width:2px,color:#F0F0F0;
    classDef step fill:#111111,stroke:#333333,stroke-width:1px,color:#888888;
    classDef highlight fill:#111111,stroke:#B5FF2D,stroke-width:2px,color:#F0F0F0;
    classDef special fill:#111111,stroke:#00D4FF,stroke-width:2px,color:#F0F0F0;

    Landing[Landing Page]:::start -->|Sign Up / Login| Onboarding{Onboarding?}:::step
    
    Onboarding -->|No / Skip| Home[Home Dashboard]:::step
    Onboarding -->|Yes| Options[Choose Profile]:::step
    
    Options --> Type[User Type: Comeback/Beginner]:::step
    Type --> Equip[Equipment Picker]:::step
    Equip --> Med[Medical Flags & Restrictions]:::step
    Med --> Home
    
    Home -->|Start Session| Logger[Active Workout Logger]:::step
    Logger -->|Log Sets & Weights| XP[Earn XP & Streaks]:::special
    
    Logger -->|Finish Session| Summary[Session Complete]:::step
    Summary -->|Auto-Detect PR| PRCelebrate[PR Particle Celebration!]:::highlight
    
    PRCelebrate --> Home
    
    Home -->|Trigger AI Plan| PlanGen[AI Plan Generator]:::special
    PlanGen -->|Update weekly routine| WeeklyPlan[Weekly Routine View]:::step
    WeeklyPlan --> Home
    
    Home -->|Active Challenges| Phoenix[Phoenix / Comeback Challenge]:::highlight
```

---

## 🎮 Gamification & Level Tiers

XP earned through workouts unlocks different athlete ranks. The progression is configured as follows:

| Tier | Level Range | Required XP | Description / Perks |
| :--- | :--- | :--- | :--- |
| **Rookie** 🟢 | 1 – 5 | 0 – 999 XP | Entry-level rank, basic onboarding badges unlocked |
| **Challenger** 🔵 | 6 – 15 | 1,000 – 4,999 XP | Unlocks Custom Challenge builder and streak-at-risk warning notifications |
| **Athlete** 🟡 | 16 – 30 | 5,000 – 14,999 XP | Unlocks detailed progress range filters (90-day & 180-day charts) |
| **Elite** 🔴 | 31+ | 15,000+ XP | Unlocks global leaderboards and Streak Shield power-ups |

---

## 📂 Project Structure

<details>
<summary><b>📂 View Complete Directory Map</b></summary>

```
Fitdesi/
├── .env.example              # Template for frontend environment variables
├── .gitignore                # Production ignore patterns for keys & node_modules
├── eslint.config.js          # Code linting settings
├── index.html                # App entry document
├── package.json              # Client packages and scripts
├── postcss.config.js         # PostCSS plugins
├── tailwind.config.js        # Neubrutalism theme & typography customisations
├── vite.config.js            # Vite configurations and port setup
│
├── docs/                     # Full system documentation
│   ├── APP_FLOW.md           # Visual user flows and state diagrams
│   ├── AUDIT_CHECKLIST.md    # Pre-launch security & quality checklist
│   ├── BACKEND_SCHEMA.md     # Firestore collection structures & schemas
│   ├── DEPLOYMENT.md         # Detailed environment deployment procedures
│   ├── ENV_CONFIG.md         # Environment variable documentation
│   ├── ERROR_HANDLING.md     # Client & function error policies
│   ├── IMPLEMENTATION_PLAN.md# Technical breakdown of features
│   ├── PERFORMANCE.md        # Loading, interaction, and rendering targets
│   ├── PRD.md                # Product Requirements Document
│   ├── SECURITY.md           # Firestore rules and client token rotation
│   ├── TESTING.md            # Comprehensive client/backend testing manual
│   ├── TRD.md                # Technical Requirements Document
│   └── UI_UX_BRIEF.md        # CSS color tokens, layouts, & animations brief
│
├── functions/                # Firebase Cloud Functions (Backend)
│   ├── .env.example          # Template for backend Cloud Functions keys
│   ├── index.js              # Entrypoint for Cloud Functions export
│   ├── package.json          # Node.js 20 functions dependencies
│   └── src/
│       └── generatePlan.js   # Gemini 3 Flash workout prompt generator
│
└── src/                      # Client Application (Frontend)
    ├── App.jsx               # Layout toggle entrypoint
    ├── index.css             # Main stylesheet (Neubrutalism styles + Google Fonts)
    ├── main.jsx              # App mount point & env validation execution
    │
    ├── assets/               # Image/SVG asset files
    ├── components/           # Dual Viewport UI Components
    │   ├── desktop/          # Sidebar navigation, Bento dashboard, Dense graphs
    │   ├── mobile/           # Bottom navigation, fullscreen logger, Swipe panels
    │   └── shared/           # Protected routing and general layout wrappers
    │
    ├── data/                 # Curated exercise dataset & static mappings
    ├── hooks/                # Layout-agnostic Custom React Hooks
    │   ├── useAuth.js        # Auth state observer
    │   ├── useWorkout.js     # Active session, logging actions
    │   ├── useXPEngine.js    # Level tier and streak calculation
    │   ├── usePlan.js        # Custom plan generation handler
    │   └── ...
    │
    ├── lib/                  # Library SDK initializers
    │   ├── firebase.js       # Firebase Client SDK initializer
    │   └── firebaseConfig.js # Firebase config variables
    │
    └── stores/               # Zustand Global State Stores
        ├── useAuthStore.js
        ├── usePlanStore.js
        ├── useWorkoutStore.js
        └── ...
```
</details>

---

## ⚙️ Environment Configuration

<details>
<summary><b>🔑 View Local & Production Configuration Keys</b></summary>

### Client Environment Variables (`.env`)
Create a `.env` file in the project root:
```bash
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=fitdesi-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=fitdesi-app
VITE_FIREBASE_STORAGE_BUCKET=fitdesi-app.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### Backend Environment Variables (`functions/.env`)
Create a `.env` file in the `/functions` folder for local emulator testing:
```bash
GEMINI_API_KEY=your_gemini_api_key
```

For production, configure the key in the Firebase Cloud Function environment:
```bash
firebase functions:config:set gemini.key="YOUR_GEMINI_API_KEY"
```
</details>

---

## 🛠️ Local Development Setup

Follow these steps to run the FitDesi application locally:

### 1. Installation
Install the project dependencies for the client and backend functions:
```bash
# Clone the repository
git clone https://github.com/PriyanshuG27/Fitdesi.git
cd Fitdesi

# Install client packages
npm install

# Install functions packages
cd functions
npm install
cd ..
```

### 2. Set Up Firebase Emulators
The project is configured to work with Firestore and Firebase Auth Emulators:
```bash
# Install Firebase Tools if not already installed globally
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize project references
firebase use --add

# Run the emulators
firebase emulators:start
```

### 3. Run the Frontend Development Server
In a new terminal window, start the local Vite development server:
```bash
npm run dev
```
Open `http://localhost:5173` to view the app in your browser.

---

## 🚀 Deployment

<details>
<summary><b>📦 View Deployment Steps (Vercel & Firebase)</b></summary>

### Deploying the Backend (Firebase Functions & Security Rules)
```bash
# Deploy firestore rules, indexes, and cloud functions
firebase deploy
```

### Deploying the Frontend (Vercel)
Install Vercel CLI and trigger a production deploy:
```bash
npm install -g vercel
vercel --prod
```
Ensure you have configured all client environment variables in the Vercel project dashboard under **Settings > Environment Variables**.
</details>

---

## 📖 Deep-Dive Reference Docs

For detailed reviews of technical requirements, audits, and performance targets:
* 📄 [Product Requirements Document (PRD)](./docs/PRD.md)
* 📄 [Technical Requirements Document (TRD)](./docs/TRD.md)
* 📄 [UI/UX Design Specification Brief](./docs/UI_UX_BRIEF.md)
* 📄 [Environment Configuration Guide](./docs/ENV_CONFIG.md)
* 📄 [Firestore Security & Rules Spec](./docs/SECURITY.md)
* 📄 [Performance & Load Optimization Plans](./docs/PERFORMANCE.md)
* 📄 [System Testing & Audit Framework](./docs/TESTING.md)
