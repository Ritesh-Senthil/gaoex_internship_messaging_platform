# InternHub — Cost & Infrastructure Overview

A breakdown of all services, costs, and hosting decisions for running InternHub in production.

---

## Service Architecture

InternHub relies on four external services:


| Service                     | Role                                                                   | Provider                |
| --------------------------- | ---------------------------------------------------------------------- | ----------------------- |
| **Database + File Storage** | PostgreSQL database and file/image storage for attachments and avatars | Supabase (Pro plan)     |
| **Authentication**          | Google Sign-In verification via Firebase Auth                          | Firebase (free tier)    |
| **Backend Hosting**         | Node.js API server with real-time WebSocket support                    | Railway                 |
| **Push Notifications**      | Delivery of push notifications to iOS devices                          | Expo Push (free)        |
| **App Distribution**        | Publishing to the Apple App Store                                      | Apple Developer Program |


---

## Cost Summary

### Annual Fixed Costs


| Item                    | Cost     | Billing                                              |
| ----------------------- | -------- | ---------------------------------------------------- |
| Apple Developer Program | $99/year | Annual (required for App Store + push notifications) |


### Monthly Recurring Costs


| Service           | Plan              | Monthly Cost | What's Included                                                                        |
| ----------------- | ----------------- | ------------ | -------------------------------------------------------------------------------------- |
| **Supabase**      | Pro               | $25/month    | 8 GB database, 100 GB storage, 250K auth requests, daily backups, 7-day log retention  |
| **Railway**       | Pro (usage-based) | ~$5–15/month | Always-on Node.js server, WebSocket support, auto-deploy from GitHub, built-in logging |
| **Firebase Auth** | Spark (free)      | $0           | 10,000 Google Sign-In verifications/month                                              |
| **Expo Push**     | Free              | $0           | Unlimited push notification delivery                                                   |
| **Google Cloud**  | Free              | $0           | OAuth 2.0 client IDs for Google Sign-In                                                |


### Monthly Total: **~$30–40/month**

### First-Year Total: **~$460–580**

> ($99 Apple Developer + $360–480 monthly services)

---

## Service Details

### Supabase — Database & File Storage ($25/month)

**What it does:** Hosts the PostgreSQL database (all users, messages, programs, channels, roles, etc.) and stores uploaded files (avatars, images, documents shared in messages).

**Pro plan includes:**

- 8 GB database storage
- 100 GB file storage (for attachments and avatars)
- 250,000 monthly active users (auth requests)
- Daily automated backups
- 7-day log retention
- No request limits on database queries
- Email support

**When costs could increase:**

- If file storage exceeds 100 GB (additional storage is $0.021/GB/month)
- If database exceeds 8 GB (unlikely for a messaging app with < 500 users)

**Pricing page:** [supabase.com/pricing](https://supabase.com/pricing)

---

### Railway — Backend Hosting (~$5–15/month)

**What it does:** Runs the Node.js/Express API server that handles all app requests and maintains real-time WebSocket connections (Socket.io) for instant message delivery, typing indicators, and online/offline presence.

**Why Railway:**

- Simplest deployment — connect a GitHub repo, set environment variables, and it's live
- Always-on — no cold starts or idle sleep, so real-time connections stay alive
- Native WebSocket support — critical for the app's real-time messaging features
- Auto-deploys on every push to the main branch
- Built-in logging and metrics for debugging

**Pricing model:** Usage-based. You pay for CPU and memory consumed. A small Node.js server with moderate traffic typically runs $5–15/month. There's a $5/month minimum on the Pro plan.

**Pricing page:** [railway.com/pricing](https://railway.com/pricing)

---

### Firebase — Authentication ($0/month)

**What it does:** Verifies Google Sign-In tokens. When a user taps "Continue with Google," Firebase handles the OAuth flow and provides a verified identity token that the backend trusts.

**Free tier (Spark plan) includes:**

- 10,000 Google Sign-In verifications per month
- Unlimited total users
- No cost unless exceeding 10K monthly sign-ins

**When costs could increase:**

- Beyond 10,000 sign-ins/month: $0.01–0.06 per additional verification
- For an NGO with < 500 members, this threshold is unlikely to be reached

**Pricing page:** [firebase.google.com/pricing](https://firebase.google.com/pricing)

---

### Expo Push Notifications ($0/month)

**What it does:** Delivers push notifications to users' iPhones when they receive new messages, @mentions, or DMs while the app is in the background.

**Pricing:** Free. Expo's push notification service is free for unlimited notifications with no usage caps.

**Pricing page:** [expo.dev/pricing](https://expo.dev/pricing)

---

### Apple Developer Program ($99/year)

**What it does:** Required to publish the app on the App Store and to enable push notifications on physical iOS devices.

**Includes:**

- App Store distribution
- TestFlight beta testing (up to 10,000 testers)
- Push notification entitlements
- Access to Apple development tools and betas

**Billing:** $99 annually, auto-renews. If the membership lapses, the app is removed from the App Store.

**Enrollment:** [developer.apple.com/programs](https://developer.apple.com/programs)

---

## Cost Scaling Reference

The table below shows how costs might change as the organization grows.


| Users     | Supabase                           | Railway | Firebase | Total/month |
| --------- | ---------------------------------- | ------- | -------- | ----------- |
| 1–50      | $25 (Pro)                          | ~$5     | $0       | ~$30        |
| 50–200    | $25 (Pro)                          | ~$10    | $0       | ~$35        |
| 200–500   | $25 (Pro)                          | ~$15    | $0       | ~$40        |
| 500–1,000 | $25 (Pro, may need storage add-on) | ~$20    | $0       | ~$45        |
| 1,000+    | $25+ (storage/compute add-ons)     | ~$25+   | $0       | ~$50+       |


> These are estimates. Actual costs depend on message volume, file upload frequency, and concurrent WebSocket connections.

---

## Payment Methods


| Service             | Accepted Payment              | Account Needed                     |
| ------------------- | ----------------------------- | ---------------------------------- |
| **Supabase**        | Credit/debit card             | supabase.com account               |
| **Railway**         | Credit/debit card             | railway.com account (GitHub login) |
| **Firebase**        | No payment needed (free tier) | Google account                     |
| **Apple Developer** | Credit/debit card             | Apple ID                           |


---

## What Happens If a Service Goes Down?


| Service       | Impact                                                           | Mitigation                                                               |
| ------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Supabase**  | App cannot load or send messages (database unavailable)          | Supabase Pro includes 99.9% uptime SLA and daily backups                 |
| **Railway**   | App cannot connect to backend (API + real-time down)             | Railway auto-restarts crashed services; can add health checks            |
| **Firebase**  | New users cannot sign in (existing sessions unaffected)          | Firebase has a strong uptime track record; existing JWTs work for 15 min |
| **Expo Push** | Push notifications stop (app still works normally in foreground) | Non-critical — messages still appear in real-time when app is open       |


