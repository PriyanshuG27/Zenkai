# FitDesi — Deployment Document

**Version:** 1.0  
**Date:** June 2026  
**Target:** Vercel (frontend) + Firebase (Firestore + Auth + Functions)  

---

## 1. Architecture Overview

```
GitHub repo (main branch)
    │
    ├── push to main
    │       │
    │       ├── GitHub Actions CI runs all tests
    │       │       ↓ (pass)
    │       └── Vercel auto-deploys frontend
    │
    └── manual deploy (Firebase)
            ├── firebase deploy --only firestore:rules
            ├── firebase deploy --only firestore:indexes
            └── firebase deploy --only functions
```

Vercel handles frontend automatically via GitHub integration.  
Firebase requires manual deploy for rules, indexes, and functions.

---

## 2. One-Time Vercel Setup

```bash
# Install Vercel CLI
npm install -g vercel

# Link project (run once in repo root)
vercel link
# Select: Link to existing project or create new

# Set environment variables
vercel env add VITE_FIREBASE_API_KEY
vercel env add VITE_FIREBASE_AUTH_DOMAIN
vercel env add VITE_FIREBASE_PROJECT_ID
vercel env add VITE_FIREBASE_STORAGE_BUCKET
vercel env add VITE_FIREBASE_MESSAGING_SENDER_ID
vercel env add VITE_FIREBASE_APP_ID
# → Select: Production + Preview for each
```

Or set via Vercel Dashboard → Project → Settings → Environment Variables.

---

## 3. `vercel.json` Configuration

Create at project root:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/((?!api/).*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net; img-src 'self' data:;"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=()"
        }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

Replace `YOUR_PROJECT_ID` with your actual Firebase project ID.

**The SPA rewrite rule is critical.** Without it, direct navigation to `/home` returns 404 from Vercel.

---

## 4. Firebase Deploy Sequence

Always deploy in this order — rules before functions before data changes.

```bash
# Step 1: Deploy security rules (always first)
firebase deploy --only firestore:rules

# Step 2: Deploy composite indexes
firebase deploy --only firestore:indexes
# Note: index builds take 2-5 minutes on Firebase Console

# Step 3: Deploy Cloud Functions
firebase deploy --only functions
# Note: first deploy takes 3-5 minutes (Docker build)

# Deploy everything at once (when confident):
firebase deploy --only firestore:rules,firestore:indexes,functions
```

**Never run `firebase deploy` without `--only` flags** — it deploys hosting too, which conflicts with Vercel.

---

## 5. Pre-Deploy Checklist

Complete every item before pushing to `main`. Not suggestions — requirements.

### Code Quality
- [ ] `npm run build` completes with no errors locally
- [ ] `npx vitest run` — all tests pass
- [ ] `npx vitest run --coverage` — coverage above thresholds
- [ ] No `console.log` statements in production code (grep: `grep -r "console.log" src/ --include="*.js" --include="*.jsx"`)
- [ ] No `TODO` or `FIXME` comments in code paths that ship

### Security (from SECURITY.md)
- [ ] `grep -r "GEMINI" src/` returns zero results
- [ ] `grep -r "AIza" src/` returns zero results  
- [ ] `.env` not in git: `git ls-files | grep .env` returns nothing
- [ ] All Firestore security rule tests pass
- [ ] Rate limiting implemented and tested in generatePlan
- [ ] `vercel.json` CSP headers present

### Environment
- [ ] All `VITE_FIREBASE_*` variables set in Vercel dashboard
- [ ] Gemini key set via `firebase functions:config:set`
- [ ] `VITE_USE_EMULATOR` is NOT set in Vercel (only in local `.env.local`)

### Firebase
- [ ] Firestore security rules deployed: `firebase deploy --only firestore:rules`
- [ ] Indexes deployed: `firebase deploy --only firestore:indexes`
- [ ] Functions deployed: `firebase deploy --only functions`
- [ ] Auth providers enabled: Email/Password + Google (Firebase Console)

### UI / UX
- [ ] Test on physical Android device (Chrome) — mobile layout
- [ ] Test on desktop Chrome — desktop layout
- [ ] All empty states render correctly (no data, fresh account)
- [ ] All error states render correctly (simulate offline, bad auth)
- [ ] PR celebration fires correctly
- [ ] Level-up animation fires on threshold

---

## 6. Deploy Commands Summary

```bash
# Full production deploy sequence
npm run build                                                    # verify build
npx vitest run                                                   # verify tests
firebase deploy --only firestore:rules,firestore:indexes         # rules + indexes
firebase deploy --only functions                                 # Cloud Functions
git push origin main                                             # triggers Vercel auto-deploy
```

---

## 7. Post-Deploy Smoke Tests

Run manually after every production deploy. Takes 5 minutes.

| Test | How | Expected |
|---|---|---|
| Landing page loads | Open production URL | Renders in < 2s, no console errors |
| Google login works | Click "Continue with Google" | Redirects to home after auth |
| Email signup works | Create new account | Onboarding starts |
| Workout logging works | Log a set, complete session | XP awarded, session in Firestore |
| PR detection works | Log weight > stored PR | Celebration overlay fires |
| Plan generation works | Click "Generate Plan" | Plan renders within 8s |
| Mobile layout works | Open on phone | Bottom nav visible, logger full-screen |
| Streak increments | Complete session two days in a row | Streak counter +1 |

If any smoke test fails → run `vercel rollback` immediately (see Section 8).

---

## 8. Rollback Procedure

### Frontend (Vercel) — instant
```bash
# List recent deployments
vercel ls

# Rollback to previous deployment
vercel rollback [deployment-url]

# Or via Vercel Dashboard → Deployments → right-click previous → Promote to Production
```

### Cloud Functions — redeploy previous version
```bash
# Cloud Functions have no built-in rollback
# Solution: revert the commit, redeploy

git revert HEAD --no-edit
git push origin main
firebase deploy --only functions
```

### Firestore Security Rules — same approach
```bash
# Revert rules file
git checkout HEAD~1 -- firestore.rules
firebase deploy --only firestore:rules
```

**Data in Firestore is not rolled back** — Firestore has no automatic rollback. For data corruption, use Firestore point-in-time recovery (must be enabled in advance in Firebase Console → Firestore → Point-in-time recovery).

---

## 9. Monitoring (Post-MVP)

For MVP, monitor via:
- Firebase Console → Functions → Logs (check for errors after deploy)
- Firebase Console → Firestore → Usage (confirm reads/writes within free tier)
- Vercel → Analytics → Web Vitals (confirm LCP < 2s)

Post-MVP additions:
- Sentry for frontend error tracking
- Firebase Alerting for function error rate spikes
- Vercel notifications for failed deployments

---

## 10. Free Tier Limits to Watch

Firebase Spark plan is free. FitDesi MVP stays within it easily, but know the limits:

| Resource | Free limit | Expected usage |
|---|---|---|
| Firestore reads | 50,000/day | ~5,000/day for 10 active users |
| Firestore writes | 20,000/day | ~2,000/day for 10 active users |
| Cloud Functions invocations | 2M/month | ~300/month for 10 active users |
| Functions compute | 400,000 GB-sec/month | Well within limit |
| Firebase Auth | Unlimited | — |

**Upgrade to Blaze (pay-as-you-go) is required to call external APIs from Cloud Functions.** This is already a requirement for Gemini. Blaze still has the same free tier — you only pay above it.
