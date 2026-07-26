# GAOEX Connect — App Store (Unlisted) Assets

Ready-to-upload package for moving from **TestFlight** to an **unlisted App Store** listing (install via link only; not searchable).

## What’s included

| Path | Purpose |
|------|---------|
| `icon/AppIcon-1024.png` | App Store icon (1024×1024, RGB, no alpha) |
| `screenshots/iphone-6.9/` | **Real** simulator screenshots @ **1320×2868** |
| `screenshots/ipad-13/` | **Real** simulator screenshots @ **2064×2752** |
| `metadata/listing.txt` | Name, subtitle, description, keywords, review notes |
| `scripts/` | Regenerate helpers (mockups / capture / iPad click) |

### Screenshot set (both device sizes)

1. `01-welcome` — Login (Continue with Google)
2. `02-programs` — Programs home
3. `03-channels` — Program detail / channel list
4. `04-messaging` — Live conversation (DM)
5. `05-dms` — Messages list
6. `06-search` — Search

Captured from the iOS Simulator against the live backend (account: production data). Exact App Store pixel sizes.

## Upload checklist (App Store Connect)

1. Open the existing app (**ascAppId** `6774813374` / bundle `com.internhub.app`).
2. Create/edit an **iOS version** matching `mobile/app.json` → `version`.
3. Paste fields from `metadata/listing.txt`.
4. Upload screenshots from `screenshots/iphone-6.9/` and `screenshots/ipad-13/`.
5. Provide **Privacy Policy URL** + **Support URL** (still TODO in listing.txt).
6. Select the TestFlight/production **build**.
7. **Pricing and Availability → Unlisted App Distribution**.
8. Complete Age Rating + App Privacy, then submit.

## Re-capture real screenshots

Requires local backend + Metro + a Debug build of the app.

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — Metro (optional auto-login for capture)
cd mobile
EXPO_PUBLIC_SCREENSHOT_EMAIL=you@example.com npx expo start --dev-client

# Boot iPhone 17 Pro Max, install Debug InternHub.app, connect to Metro
bash store-assets/scripts/capture_sim_screenshots.sh /tmp/store-shots/raw-iphone
```

Dev-only helpers (not in production builds):

- Backend `POST /api/auth/dev-login` (disabled when `NODE_ENV=production`)
- Deep links: `internhub://shot/programs`, `.../program?id=`, `.../channel?...`, `.../conversation?...`, `.../logout`, `.../dev-login?email=`

## Live URLs (App Store Connect)

See **[URLS.md](./URLS.md)** — copy/paste Privacy + Support links.

## Still needed from you

- [x] Privacy Policy URL — see URLS.md
- [x] Support URL — see URLS.md
- [ ] Confirm copyright / legal entity
- [ ] App Privacy questionnaire
- [ ] Set distribution to **Unlisted** before release
