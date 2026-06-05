# FitDesi — Backend Schema

**Version:** 1.0  
**Date:** June 2026  
**Database:** Cloud Firestore  
**Functions:** Firebase Cloud Functions (Node.js 20)  

---

## 1. Firestore Collections — Full Schema

### Collection: `users`

```
users/{uid}

Field             Type        Required   Notes
─────────────────────────────────────────────────────────────────
uid               string      yes        Same as Auth UID
name              string      yes        Display name
email             string      yes        From Firebase Auth
userType          string      yes        "comeback" | "beginner" | "consistent" | "challenger"
onboardingComplete boolean    yes        false until onboarding done or skipped
createdAt         timestamp   yes        Server timestamp on doc creation

// XP + Level
xp                number      yes        Total cumulative XP, never decreases. Default: 0
level             number      yes        1–31+. Default: 1
levelName         string      yes        "Rookie" | "Challenger" | "Athlete" | "Elite"

// Streak
streak            number      yes        Current streak in days. Default: 0
streakLastDate    string      no         ISO date string "YYYY-MM-DD" of last logged session

// Equipment
equipmentList     string[]    yes        Array of equipment IDs. Default: []
                                         Valid: "barbell" | "dumbbells" | "cables" | 
                                                "smith_machine" | "pullup_bar" | "bench" | 
                                                "leg_press" | "ez_bar" | "resistance_bands" | 
                                                "kettlebell"

// Medical
medicalFlags      string[]    yes        Array of flag IDs. Default: []
                                         Valid: "varicocele" | "bad_knees" | "lower_back" | 
                                                "post_surgery" | "shoulder_impingement"

// Power-ups (Post-MVP)
powerUps          map         yes        Default: all 0
  streakShield    number                 Count remaining
  xpBooster       number                 Count remaining
  challengeSkip   number                 Count remaining
  planRefresh     number                 Count remaining

// Badges (Post-MVP)
badges            string[]    yes        Default: []
                                         e.g., "phoenix_comeback", "streak_30", "first_pr"
```

---

### Subcollection: `users/{uid}/sessions`

One document per workout session.

```
users/{uid}/sessions/{sessionId}

Field             Type        Required   Notes
─────────────────────────────────────────────────────────────────
sessionId         string      yes        Auto-generated Firestore ID
date              timestamp   yes        Session start time (server timestamp)
dateString        string      yes        "YYYY-MM-DD" — for streak/daily queries
moodTag           string      no         "locked_in" | "average" | "low_energy"
stomachFlag       boolean     yes        true if user flagged fatigue pre-session
totalVolume       number      yes        Sum of (weight × reps) across all sets, in kg
totalSets         number      yes        Total completed sets
durationMinutes   number      no         Session duration in minutes
xpEarned          number      yes        XP awarded for this session
```

---

### Subcollection: `users/{uid}/sessions/{sessionId}/exercises`

One document per exercise within a session.

```
users/{uid}/sessions/{sessionId}/exercises/{exerciseId}

Field             Type        Required   Notes
─────────────────────────────────────────────────────────────────
exerciseId        string      yes        Auto-generated
name              string      yes        Display name e.g. "Barbell Bench Press"
exerciseKey       string      yes        Normalised key e.g. "barbell_bench_press" (for PR lookup)
muscleGroup       string      yes        "chest" | "back" | "legs" | "shoulders" | "arms" | "core"
sets              array       yes        Array of set objects (see below)

// sets[] item structure:
{
  reps:     number   // Completed reps
  weight:   number   // Weight in kg
  done:     boolean  // true when logged
}

volume            number      yes        Sum of (weight × reps) for this exercise
```

---

### Subcollection: `users/{uid}/prs`

One document per exercise — stores the all-time PR. Updated when broken.

```
users/{uid}/prs/{exerciseKey}

Field             Type        Required   Notes
─────────────────────────────────────────────────────────────────
exerciseKey       string      yes        e.g. "barbell_bench_press" (doc ID)
exerciseName      string      yes        Display name
weight            number      yes        Heaviest weight ever lifted for this exercise
reps              number      yes        Reps performed at that weight
date              timestamp   yes        When this PR was set
previousWeight    number      no         Prior PR weight (for delta display)
```

**PR detection logic:** On set complete, query `prs/{exerciseKey}`. If `newWeight > prs.weight` (at same or higher reps) OR no PR exists → update doc, trigger PR celebration.

---

### Subcollection: `users/{uid}/weeklyPlans`

One document per week. Old plans are kept (history).

```
users/{uid}/weeklyPlans/{weekId}

weekId format: "2026-W23" (ISO week)

Field             Type        Required   Notes
─────────────────────────────────────────────────────────────────
weekId            string      yes        e.g. "2026-W23"
generatedAt       timestamp   yes        When Gemini generated this
source            string      yes        "gemini" | "default_beginner"
plan              map         yes        Full plan structure (see below)

// plan structure (as stored):
{
  "days": [
    {
      "day": 1,
      "focus": "Push",
      "exercises": [
        {
          "name": "Barbell Bench Press",
          "exerciseKey": "barbell_bench_press",
          "sets": 4,
          "reps": "8-10",
          "targetWeight": 60
        }
      ]
    },
    ...
    { "day": 7, "focus": "Rest", "exercises": [] }
  ]
}
```

---

### Subcollection: `users/{uid}/xpLog`

Append-only log of every XP event.

```
users/{uid}/xpLog/{entryId}

Field             Type        Required   Notes
─────────────────────────────────────────────────────────────────
entryId           string      yes        Auto-generated
source            string      yes        "session_logged" | "pr_hit" | "challenge_mission" |
                                         "streak_3" | "streak_7" | "streak_30" |
                                         "body_measurement" | "onboarding_complete" |
                                         "level_up_bonus" | "social_invite"
amount            number      yes        XP awarded (always positive)
timestamp         timestamp   yes        Server timestamp
sessionId         string      no         Reference if source is session-related
challengeId       string      no         Reference if source is challenge-related
```

---

### Collection: `challenges`

```
challenges/{challengeId}

Field             Type        Required   Notes
─────────────────────────────────────────────────────────────────
challengeId       string      yes        Auto-generated
type              string      yes        "comeback" | "streak" | "arm_builder" | "custom"
creatorUid        string      yes        UID of user who started/created
participants      string[]    yes        Array of UIDs (includes creator)
startDate         timestamp   yes
endDate           timestamp   yes
status            string      yes        "active" | "completed" | "abandoned"
goal              map         yes        Type-specific goal config (see below)
progress          map         yes        { uid: progressData } — one entry per participant

// goal examples per type:
// comeback: { durationWeeks: 8, startCapacityPct: 40 }
// streak:   { workoutsPerWeek: 3, durationWeeks: 8 }

// progress[uid] example:
// comeback: { currentWeek: 3, completedSessions: 9, badgeEarned: false }
// streak:   { currentWeek: 3, weeklyCount: [3,3,2,0,...], badgeEarned: false }
```

---

### Subcollection: `users/{uid}/measurements` (Post-MVP)

```
users/{uid}/measurements/{dateString}

Field             Type        Required   Notes
─────────────────────────────────────────────────────────────────
dateString        string      yes        "YYYY-MM-DD" (doc ID)
date              timestamp   yes
arms              number      no         In cm
chest             number      no         In cm
waist             number      no         In cm
shoulders         number      no         In cm
```

---

## 2. XP Level Thresholds

```javascript
const LEVELS = [
  { level: 1,  name: 'Rookie',     xpRequired: 0    },
  { level: 2,  name: 'Rookie',     xpRequired: 100  },
  { level: 3,  name: 'Rookie',     xpRequired: 250  },
  { level: 4,  name: 'Rookie',     xpRequired: 450  },
  { level: 5,  name: 'Rookie',     xpRequired: 700  },
  { level: 6,  name: 'Challenger', xpRequired: 1000 },
  { level: 10, name: 'Challenger', xpRequired: 2500 },
  { level: 15, name: 'Challenger', xpRequired: 6000 },
  { level: 16, name: 'Athlete',    xpRequired: 7000 },
  { level: 20, name: 'Athlete',    xpRequired: 12000},
  { level: 30, name: 'Athlete',    xpRequired: 28000},
  { level: 31, name: 'Elite',      xpRequired: 30000},
];
```

---

## 3. Exercise Bank Structure (Static JSON, bundled with app)

Stored as `src/data/exercises.json`. Not in Firestore.

```json
[
  {
    "key": "barbell_bench_press",
    "name": "Barbell Bench Press",
    "muscleGroup": "chest",
    "equipmentRequired": ["barbell", "bench"],
    "medicallyRestricted": [],
    "aliases": ["bench press", "flat bench"]
  },
  {
    "key": "overhead_press",
    "name": "Overhead Press",
    "muscleGroup": "shoulders",
    "equipmentRequired": ["barbell"],
    "medicallyRestricted": ["shoulder_impingement"],
    "aliases": ["OHP", "military press", "shoulder press"]
  }
]
```

**Filtering logic:** On exercise search, filter by:
1. `equipmentRequired` — all items must be in user's `equipmentList`
2. `medicallyRestricted` — no overlap with user's `medicalFlags`
3. Text match on `name` or `aliases`

Curated list of ~120 exercises covering Indian gym realities.

---

## 4. Cloud Functions Spec

### `generatePlan` (callable)

```javascript
// functions/src/generatePlan.js

exports.generatePlan = onCall(async (request) => {
  const uid = request.auth.uid;  // Auto-verified by Firebase
  if (!uid) throw new HttpsError('unauthenticated', 'Login required');

  // 1. Fetch user profile
  const userDoc = await db.doc(`users/${uid}`).get();
  const { equipmentList, medicalFlags, userType } = userDoc.data();

  // 2. Fetch last 14 sessions
  const sessionsSnap = await db
    .collection(`users/${uid}/sessions`)
    .orderBy('date', 'desc')
    .limit(14)
    .get();
  const sessions = sessionsSnap.docs.map(d => d.data());

  // 3. Build prompt
  const prompt = buildPlanPrompt({ userType, equipmentList, medicalFlags, sessions });

  // 4. Call Gemini Flash
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  // 5. Parse + validate JSON
  const plan = JSON.parse(text);
  validatePlan(plan, equipmentList, medicalFlags);  // Throws if invalid

  // 6. Write to Firestore
  const weekId = getISOWeek();  // e.g., "2026-W23"
  await db.doc(`users/${uid}/weeklyPlans/${weekId}`).set({
    weekId, generatedAt: FieldValue.serverTimestamp(),
    source: 'gemini', plan
  });

  return { success: true, weekId };
});
```

---

## 5. Firestore Security Rules (Full)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuth() {
      return request.auth != null;
    }

    function isOwner(uid) {
      return isAuth() && request.auth.uid == uid;
    }

    // User top-level document
    match /users/{uid} {
      allow read, write: if isOwner(uid);

      // All subcollections: sessions, prs, weeklyPlans, xpLog, measurements
      match /{subcollection}/{docId} {
        allow read, write: if isOwner(uid);

        // exercises nested under sessions
        match /{nestedDoc} {
          allow read, write: if isOwner(uid);
        }
      }
    }

    // Challenges: readable by participants, writable by creator or participant
    match /challenges/{challengeId} {
      allow read: if isAuth() &&
        request.auth.uid in resource.data.participants;
      
      allow create: if isAuth();
      
      allow update: if isAuth() && (
        request.auth.uid == resource.data.creatorUid ||
        request.auth.uid in resource.data.participants
      );
      
      // No delete — challenges are permanent record
      allow delete: if false;
    }
  }
}
```

---

## 6. Required Firestore Indexes

Composite indexes needed (set in `firestore.indexes.json`):

```json
{
  "indexes": [
    {
      "collectionGroup": "sessions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "sessions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "dateString", "order": "ASCENDING" },
        { "fieldPath": "xpEarned", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "xpLog",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "challenges",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "participants", "arrayConfig": "CONTAINS" },
        { "fieldPath": "startDate", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## 7. Write Patterns & Consistency Rules

### Session Write (on session complete)
All of these writes must complete atomically. Use a Firestore **batch write**:

```
Batch:
  1. SET   users/{uid}/sessions/{sessionId}           ← session doc
  2. SET   users/{uid}/sessions/{sessionId}/exercises  ← exercise docs (loop)
  3. SET   users/{uid}/prs/{exerciseKey}               ← if PR broken (conditional)
  4. ADD   users/{uid}/xpLog/{newId}                  ← XP entry
  5. UPDATE users/{uid}                               ← increment xp, update streak, level
```

If any write fails, the batch rolls back entirely. User sees error toast: "Session couldn't save. Retry?"

### Streak Update Logic (client-side, useXPEngine)
```
On session complete:
  today = YYYY-MM-DD (local timezone)
  
  if streakLastDate == yesterday:
    streak += 1
  else if streakLastDate == today:
    streak unchanged  (already logged today)
  else:
    streak = 1  (gap > 1 day, reset)
  
  streakLastDate = today
  
  if streak == 3: awardXP(30, 'streak_3')
  if streak == 7: awardXP(100, 'streak_7')
  if streak == 30: awardXP(500, 'streak_30')
```

---

## 8. Data Retention & Limits

| Collection | Limit | Rationale |
|---|---|---|
| sessions | No limit | Core data, keep forever |
| exercises (per session) | No limit | Typically 3–8 per session |
| xpLog | No limit | Append-only, small docs |
| weeklyPlans | Keep last 12 | Auto-cleanup via Cloud Function (post-MVP) |
| prs | One per exercise | Always overwritten |
| measurements | No limit | One per day, infrequent |

**Estimated Firestore cost for active user:** ~5,000 reads/month, ~2,000 writes/month. Well within free tier (50k reads/day, 20k writes/day).
