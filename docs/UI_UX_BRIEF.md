# FitDesi — UI/UX Design Brief

**Version:** 1.0  
**Date:** June 2026  
**Skill Applied:** ui-ux-pro-max  

---

## 1. Design System

```
TARGET: FitDesi — RECOMMENDED DESIGN SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATTERN:    Mobile bottom nav + full-screen sections /
            Desktop persistent left sidebar + content area

STYLE:      Dark OLED base (primary structure)
            + Neubrutalism (interactive elements, cards, CTAs)
            + Aurora UI (celebration moments only — PR, level-up, recap)

COLORS:     See token table below

TYPOGRAPHY: Barlow Condensed (display, headings) /
            Outfit (body, UI text) /
            DM Mono (numbers: weight, reps, XP)

EFFECTS:    Orange glow on primary CTAs
            Cyan glow on stat elements
            Acid lime particle burst on PR
            Subtle grain texture on surfaces
            Framer Motion: spring physics on interactive elements

AVOID:      Purple AI gradients, white backgrounds, Inter/Roboto body fonts,
            emoji as icons, generic card shadows (box-shadow: 0 4px 6px),
            blue primary colors, minimal "clean" SaaS aesthetic
            
CHECKLIST:  All touch targets ≥ 44×44px
            Text contrast ≥ 4.5:1 on all dark surfaces
            Lucide icons only (consistent stroke weight)
            No placeholder-as-label on any input
            Loading states on all async actions
            Empty states on all data-dependent screens
```

**Why this combination works for FitDesi:**  
Indian gym users aged 18–25 respond to energy and boldness. OLED dark base keeps the app premium and battery-efficient on AMOLED phones. Neubrutalism edges on cards give tactile weight — they feel *liftable*, matching the gym context. Aurora celebrations are reserved for earned moments only (PR, level-up) — using them everywhere would dilute the payoff.

---

## 2. Color Tokens

```css
:root {
  /* Backgrounds */
  --bg-base:       #080808;   /* True OLED black */
  --bg-surface:    #111111;   /* Cards, panels */
  --bg-elevated:   #1A1A1A;   /* Modals, dropdowns */
  --bg-input:      #141414;   /* Input fields */

  /* Brand */
  --primary:       #FF5C00;   /* Burnt orange — energy, saffron nod */
  --primary-glow:  rgba(255, 92, 0, 0.25);
  --secondary:     #00D4FF;   /* Electric cyan — stats, XP, data */
  --secondary-glow:rgba(0, 212, 255, 0.20);
  --accent-xp:     #B5FF2D;   /* Acid lime — level-up, rewards, PRs */
  --accent-xp-glow:rgba(181, 255, 45, 0.20);

  /* Semantic */
  --success:       #22C55E;
  --warning:       #F59E0B;
  --destructive:   #EF4444;

  /* Text */
  --text-primary:  #F0F0F0;
  --text-secondary:#888888;
  --text-muted:    #444444;

  /* Borders */
  --border:        #222222;
  --border-bright: #333333;
}
```

**Usage rules:**
- `--primary` (orange): Primary CTAs, active nav state, progress fill.
- `--secondary` (cyan): XP bar, stat numbers, chart lines, streak counter.
- `--accent-xp` (lime): PR badge, level-up text, challenge completion, XP earned numbers.
- Never use orange and lime on the same element. They fight.
- Glow variants are `box-shadow` only — never as background fills.

---

## 3. Typography Scale

**Fonts (Google Fonts import):**
```html
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Outfit:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

```css
/* Display — hero text, level names, PR weights */
.text-display {
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  letter-spacing: -0.02em;
  text-transform: uppercase;
}

/* Heading — screen titles, card headers */
.text-heading {
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 700;
  letter-spacing: -0.01em;
}

/* Body — descriptions, labels */
.text-body {
  font-family: 'Outfit', sans-serif;
  font-weight: 400;
  line-height: 1.6;
}

/* UI — buttons, nav labels, tags */
.text-ui {
  font-family: 'Outfit', sans-serif;
  font-weight: 600;
  letter-spacing: 0.02em;
}

/* Mono — all numbers (weight, reps, XP, sets) */
.text-mono {
  font-family: 'DM Mono', monospace;
  font-weight: 500;
}
```

**Scale (rem, Tailwind config):**
```
text-xs:    0.75rem   (12px) — labels, tags
text-sm:    0.875rem  (14px) — secondary body
text-base:  1rem      (16px) — primary body
text-lg:    1.125rem  (18px) — card headers
text-xl:    1.25rem   (20px) — section titles
text-2xl:   1.5rem    (24px) — screen titles
text-3xl:   1.875rem  (30px) — PR weights, XP numbers
text-4xl:   2.25rem   (36px) — level name, celebration
text-5xl:   3rem      (48px) — display moments
```

---

## 4. Spacing System

Using Tailwind's default spacing scale. Key rules:
- Cards: `p-4` mobile / `p-6` desktop
- Screen padding: `px-4` mobile / `px-8` desktop
- Gap between stacked cards: `gap-3`
- Section vertical spacing: `py-6`
- Bottom nav height: `h-16` (64px)
- Desktop sidebar width: `w-64` (256px)

---

## 5. Component Patterns

### 5.1 Primary Button
```
Background: --primary (#FF5C00)
Text: white, Outfit 600, uppercase, letter-spacing 0.05em
Border-radius: 8px
Padding: 14px 24px
Box-shadow: 0 0 20px var(--primary-glow)
Hover: brightness(1.1) + shadow intensifies
Active: scale(0.97)
Transition: all 150ms ease-out
Disabled: opacity-40, cursor-not-allowed
Loading: spinner replaces label, button disabled
```

### 5.2 Set Entry Row (Core interaction)
```
Background: --bg-surface
Border: 1px solid --border-bright
Border-radius: 8px
Layout: [Exercise name] [−] [weight] [+] [−] [reps] [+] [✓]
Weight/reps: DM Mono, text-xl, --text-primary
+/− buttons: 44×44px touch target, --primary tint on hover
✓ button: 44×44px, --bg-elevated → on tap: scale animation,
          border becomes --accent-xp, checkmark fills lime
```

### 5.3 XP Bar
```
Track: full width, h-2, --bg-elevated, border-radius full
Fill: gradient left-to-right, --secondary → --accent-xp
Animated fill: Framer Motion spring on XP award
Level label: DM Mono, --secondary, text-xs, right-aligned above bar
```

### 5.4 Stat Card (Progress screen)
```
Background: --bg-surface
Border: 1px solid --border
Border-radius: 12px
Padding: p-4
Top-left: label in Outfit 400, text-xs, --text-secondary
Main value: DM Mono 700, text-3xl, --text-primary
Sub value (delta): text-sm, green if positive / red if negative
```

### 5.5 Today's Mission Card (Home)
```
Background: gradient -- bg-surface to slightly lighter
Border-left: 3px solid --primary
Border-radius: 12px
Padding: p-5
Content: day focus (e.g., "PUSH DAY"), top exercise preview,
         estimated duration, "Start Workout" CTA inline
Pulse animation: subtle on border-left if user hasn't started yet
```

### 5.6 Exercise Search
```
Input: --bg-input, border 1px --border, Outfit body
Placeholder: "Search exercise..."
Results dropdown: --bg-elevated, max-h-48, scroll
Result row: 48px tall, exercise name + muscle group tag
Hover state: bg --border row highlight
No results: "Not found" message
```

### 5.7 Bottom Nav (Mobile)
```
Height: 64px
Background: --bg-surface with border-top 1px --border
Items: Home, Workout (+), Progress, Plan, Profile
Workout "+" : circular 52px, --primary background, centered, raised
Active state: icon fill --primary, label text --primary
Inactive: icon stroke --text-secondary
Transitions: 150ms ease
```

### 5.8 Sidebar Nav (Desktop)
```
Width: 256px (w-64)
Background: --bg-surface
Border-right: 1px solid --border
Brand mark: top, 64px tall header
Nav items: 48px rows, icon + label, Outfit 500
Active: left border 3px --primary, bg --bg-elevated, text --primary
Hover: bg --bg-elevated
Bottom: Profile link + sign out
```

---

## 6. Animation Spec

All animations use Framer Motion. Respect `prefers-reduced-motion` — fall back to instant transitions.

### 6.1 Set Complete
```
Trigger: ✓ tap
Animation:
  1. Button background: --bg-elevated → --accent-xp (100ms)
  2. Checkmark SVG: scale 0 → 1, spring { stiffness: 400, damping: 20 }
  3. Row: subtle scale 1 → 1.02 → 1 (200ms)
Duration: 300ms total
```

### 6.2 PR Celebration
```
Trigger: PR detection on set complete
Animation:
  1. Full-screen overlay: opacity 0 → 1 (200ms)
  2. Background: black with --accent-xp particles (particles-js or custom canvas)
  3. Text reveal: "NEW PR" in Barlow Condensed 800, scale 0.5 → 1 (spring)
  4. Weight badge: slides up from bottom
  5. XP counter: increments in DM Mono with spring easing
  6. Auto-dismiss: 3 seconds OR tap to dismiss
```

### 6.3 Level-Up Reveal
```
Trigger: level threshold crossed
Animation:
  1. Screen flash: white 0 → 0.3 → 0 opacity (300ms)
  2. New level name: Barlow Condensed 800, text-5xl, staggered letter reveal
  3. Level icon: scale 0 → 1.2 → 1 (spring)
  4. Sub-text: "LEVEL UP" slides in from bottom
Duration: 1.5s total, tap to skip
```

### 6.4 Page Transitions (Framer Motion AnimatePresence)
```
Route change: opacity 0→1 + y: 10px→0px, 200ms ease-out
Modal open:   opacity 0→1 + scale 0.96→1, 150ms ease-out
Bottom sheet: y: 100%→0%, spring { stiffness: 300, damping: 30 }
```

### 6.5 XP Award Counter
```
On session complete: DM Mono counter counts up from 0 to earned XP
Duration: 1.2s, ease-out curve
Color: --accent-xp
```

---

## 7. Mobile UX Guidelines

Following ui-ux-pro-max mobile patterns:

- **Bottom nav only.** No hamburger, no top nav for primary navigation.
- **Full-screen logger.** When a session is active, the logger is the entire viewport. No distractions.
- **44×44px minimum touch targets.** Enforced on every +/− button, nav item, and set complete button.
- **100dvh** not 100vh — avoids iOS Safari browser chrome issues.
- **No horizontal scroll.** All content stacks vertically. Charts horizontal scroll is allowed within their container only.
- **Swipe gestures:**
  - Swipe down on modals/sheets to dismiss.
  - Swipe left on exercise row to remove (post-MVP).
- **Thumb zone:** Primary actions (Start Workout, ✓ Done) stay in bottom 40% of screen.
- **Safe area insets:** Bottom nav padded for iOS home indicator via `env(safe-area-inset-bottom)`.
- **Text size minimum:** 14px (text-sm) for any readable content.
- **One primary action per screen.** Never two orange buttons visible simultaneously.

---

## 8. Desktop UX Guidelines

- **Persistent sidebar.** User always knows where they are. No mobile-pattern nav.
- **Dashboard density.** Desktop home shows: mission card + recent 3 sessions + current plan preview + XP status — all above the fold.
- **Logger as slide-in panel.** Doesn't navigate away from dashboard. Right panel slides in at `w-[420px]`, overlay dims the rest.
- **Charts are full-width and detailed.** Desktop progress shows 90-day range by default, 30-day on mobile.
- **Keyboard navigation.** All interactive elements reachable via Tab. Focus states: `outline: 2px solid var(--primary)`.
- **Table patterns for structured data.** PR list, plan view, and session history use `<table>` on desktop, card stack on mobile.

---

## 9. Screen-by-Screen Layout Spec

### Landing Page
```
Structure: Hero-Centric + Social Proof (ui-ux-pro-max pattern)
Sections:
  1. Hero: Full viewport. Background: deep black with orange mesh gradient blob.
     Headline: "TRAIN SMARTER. COME BACK STRONGER." (Barlow Condensed 800, white)
     Sub: "AI-powered gym tracking for Indian athletes." (Outfit 400, --text-secondary)
     CTA: "Get Started Free" (primary button)
  2. Features: 3-column grid (2-column mobile). Icons + short copy.
     Comeback Mode | Equipment-Aware Plans | XP & Challenges
  3. App preview: dark mockup screenshots
  4. CTA banner: "Start for free. No BS." + signup button
Mobile: Single column, hero text smaller, CTA sticky bottom
```

### Home Screen
```
Mobile layout:
  ┌────────────────────────────────────┐
  │ FitDesi      [streak 🔥 7]  [XP]  │  ← sticky top bar
  ├────────────────────────────────────┤
  │                                    │
  │  [Today's Mission Card]            │  ← primary card, ~200px
  │  PUSH DAY                          │
  │  Bench Press, OHP, Triceps         │
  │  Est. 55 min | [Start Workout]     │
  │                                    │
  │  [XP Progress Bar]                 │
  │  Challenger · 1,240 XP             │
  │                                    │
  │  [Active Challenge Card]           │
  │  Comeback Challenge — Day 12/84    │
  │  ███████░░░░░░░  [View]            │
  │                                    │
  │  [Last Session]                    │
  │  Yesterday · Push · 4,240 kg       │
  │                                    │
  └────────────────────────────────────┘
  │ Home  Workout  Progress Plan Profile │  ← bottom nav

Desktop layout:
  Left sidebar (256px) + main content area
  Main: 3-column bento grid
  [Today's Mission (large)] [XP + Level] [Streak]
  [Recent sessions table]   [Current plan preview (3 days)]
```

### Active Logger (Mobile)
```
Full viewport, no bottom nav while session active
  ┌────────────────────────────────────┐
  │ ← [00:24:13]          [End Session]│
  ├────────────────────────────────────┤
  │  + Add Exercise                    │
  │                                    │
  │  BARBELL BENCH PRESS               │
  │  ─────────────────────────────     │
  │  Set 1  [−] 60 kg [+]  [−] 8 [+]  [✓]  │
  │  Set 2  [−] 62.5 kg[+] [−] 7 [+]  [✓]  │
  │  Set 3  [−] 62.5 kg[+] [−] 6 [+]  [ ]  │
  │  + Add Set                         │
  │                                    │
  │  OVERHEAD PRESS                    │
  │  Set 1  [−] 40 kg [+]  [−] 8 [+]  [✓]  │
  │                                    │
  └────────────────────────────────────┘
  Note: weight/reps in DM Mono, large tap targets
```

### Progress Screen (Mobile)
```
Tab bar: Strength | Volume | PRs
Strength tab:
  Exercise selector (horizontal scroll chips)
  Line chart (Recharts, full width, cyan line)
  X-axis: last 30 days | Y-axis: weight kg
  Tap point: tooltip shows date + weight + reps

Volume tab:
  Bar chart: weekly volume, last 12 weeks, orange bars

PRs tab:
  Card list: exercise name + weight + reps + date
  Sorted by date default
```

---

## 10. Iconography

**Icon family:** Lucide React — outline style, 24px default.

| Icon | Usage |
|---|---|
| `Dumbbell` | Workout / exercise |
| `Flame` | Streak indicator |
| `Zap` | XP / energy |
| `Trophy` | PRs |
| `Target` | Challenges |
| `TrendingUp` | Progress |
| `User` | Profile |
| `Plus` | Add exercise / add set |
| `Check` | Set complete |
| `ChevronRight` | List navigation |
| `Calendar` | Plan / day |
| `X` | Close / dismiss |

**Never use emoji as UI icons.** Text emoji (🔥 for streak) allowed only in display/celebration contexts, not as interactive icons.

---

## 11. Dark Mode — Specific Rules

This app is dark-only. These rules prevent the most common dark mode mistakes:

- **Avoid pure #000000 for surfaces** — use #111111. Pure black makes cards invisible.
- **Shadow on dark:** Use inset borders (`border: 1px solid --border`) not box-shadow. Shadows are invisible on dark.
- **Text hierarchy on dark:** Primary #F0F0F0, secondary #888888, muted #444444. Never white (#ffffff) for body text — too harsh.
- **Inputs:** Background #141414, border #222222. Focus: border changes to --primary.
- **Error state:** Red text + red border + red icon — never red background fill.
- **Charts on dark:** Grid lines at #222222 (barely visible). Data lines/bars in --secondary or --primary. Tooltips: --bg-elevated background.
