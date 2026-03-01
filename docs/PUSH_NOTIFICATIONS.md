# Push Notifications — Status & Resume Guide

> **Last Updated:** February 6, 2026
> **Overall Status:** All 6 chunks code complete. On-device testing blocked by Apple Developer Program requirement.

---

## Implementation Progress

### Chunk 1: Schema + APIs (DONE)
- `PushToken` model added to Prisma schema
- `POST /api/users/push-token` — register Expo push token (upsert, reassigns across users)
- `DELETE /api/users/push-token` — remove token on logout
- `POST /api/channels/:id/mute` + `GET` — per-channel mute toggle
- `POST /api/conversations/:id/mute` + `GET` — per-conversation mute toggle
- `isMuted` field added to `ChannelRead` model
- Report feature infrastructure removed (model, enums, relations)

### Chunk 2: Backend Push Service (DONE)
- **File:** `backend/src/services/pushNotification.ts`
- Uses `expo-server-sdk` to send push notifications via Expo's push API
- `sendPushToUsers(userIds, payload)` — looks up tokens, batches, sends
- `sendPushToTokens(tokens, payload)` — direct send to tokens
- Builder functions: `buildChannelMessageNotification`, `buildDMNotification`, `buildMentionNotification`, `buildProgramInviteNotification`
- Auto-cleans invalid tokens (`DeviceNotRegistered`)
- Schedules receipt checks for delivery confirmation

### Chunk 3: Backend Integration (DONE)
- **Channel messages** (`channel.routes.ts`): after posting a message, sends push to all non-muted program members (excluding author). Mentioned users get `buildMentionNotification`, others get `buildChannelMessageNotification`.
- **DM messages** (`conversation.routes.ts`): sends `buildDMNotification` to other participants who haven't muted the conversation.
- **Program invite approval** (`program.routes.ts`): sends `buildProgramInviteNotification` to the newly approved user.
- All push sends are fire-and-forget (async, non-blocking).

### Chunk 4: Mobile Registration (DONE — code complete, untested on device)
- **Dependencies:** `expo-notifications`, `expo-device` installed; plugin added to `app.json`
- **File:** `mobile/src/services/notifications.ts`
  - `configureNotificationHandler()` — foreground display (banner + sound + badge), called at module level in `App.tsx`
  - `registerForPushNotifications()` — permissions → Expo token → backend registration, with concurrency guard
  - `unregisterPushNotifications()` — removes token from backend on logout
  - `refreshPushTokenIfNeeded()` — detects token changes on app foreground (handles OS/app updates)
  - `startAppStateTokenRefresh()` — AppState listener for foreground token refresh
  - Tap handling, badge management, initial notification (cold start) utilities
- **File:** `mobile/src/services/api.ts` — added `pushTokenApi` (register/remove) and `muteApi` (channel + conversation mute toggle/status)
- **File:** `mobile/src/store/notificationStore.ts` — Zustand store for permission status, push token, registration state
- **File:** `mobile/src/store/authStore.ts` — push registration on login/init, push cleanup on logout
- **File:** `mobile/App.tsx` — `configureNotificationHandler()` at module level, `startAppStateTokenRefresh()` in useEffect

### Chunk 5: Mobile Mute Controls (DONE)
- Bell/muted-bell icon in channel and conversation headers for mute toggle
- Optimistic UI via Zustand `muteStore` — instant icon updates across screens without refetching
- Muted channels/conversations show muted icon in list views, unread badges hidden when muted
- **Files:** `ChannelScreen.tsx`, `ConversationScreen.tsx`, `ProgramDetailScreen.tsx`, `ConversationsListScreen.tsx`, `mobile/src/store/muteStore.ts`

### Chunk 6: Deep Linking (DONE)
- Notification tap navigates to the correct screen (channel, DM, or program)
- **Warm start:** `addNotificationResponseListener` wired in `AppNavigator.tsx`
- **Cold start:** `getInitialNotification` with 30s staleness filter to avoid re-navigating on normal app launch
- **Pending navigation queue:** if notification arrives before navigator is ready, it's queued and processed on `onReady`
- Navigation resets stack to `Main → target` so back button returns home
- Clears notification tray and resets badge count after navigation
- All 4 notification types handled: `channel_message`, `dm_message`, `mention`, `program_invite`
- **Files:** `mobile/src/services/navigationRef.ts` (new), `mobile/src/navigation/AppNavigator.tsx`, `mobile/src/services/notifications.ts`

---

## Blocker: On-Device Testing

Push notifications **require a physical iOS device** with a **paid Apple Developer Program** account ($99/year). Simulators cannot generate Expo push tokens.

**Error encountered:** `no valid "aps-environment" entitlement string found for application` — this means the Push Notifications capability isn't available because the Xcode project is signed with a free Personal Team.

### To resume testing when you have a paid account:

1. **Enroll** at https://developer.apple.com/programs/

2. **Add Push Notifications capability in Xcode:**
   ```
   Open mobile/ios/InternHub.xcworkspace
   → Select InternHub target
   → Signing & Capabilities tab
   → + Capability → Push Notifications
   ```

3. **Update config for physical device** (replace with your Mac's current IP):
   ```
   mobile/src/constants/config.ts
   → BASE_URL: 'http://<YOUR_MAC_IP>:3000/api'
   → SOCKET_URL: 'http://<YOUR_MAC_IP>:3000'
   ```

4. **Rebuild on device:**
   ```bash
   cd mobile && npx expo run:ios --device
   ```

5. **Verify registration:**
   - Log in on the phone
   - Backend logs should show: `[Notifications] Push token registered: ExponentPushToken[...]`
   - Check `PushToken` table in Prisma Studio: `cd backend && npx prisma studio`

6. **Test receiving notifications:**
   - Open a simulator as a second user
   - Send a DM or channel message to the phone user
   - Phone should receive a push notification (even with app backgrounded)

7. **Test logout cleanup:**
   - Log out on the phone
   - Verify token is removed from `PushToken` table

8. **Test mute controls:**
   - Open a channel on the phone → tap the bell icon in the header → it should toggle to a muted bell icon
   - Go back to the program detail screen → the muted channel should show a muted icon instantly (no loading/refresh)
   - Send a message from the simulator to that muted channel → the phone should **not** receive a push notification
   - Unmute and repeat → notification should arrive
   - Repeat the same flow for DM conversations

9. **Test deep linking (warm start — app is backgrounded):**
   - Log in on the phone and **background the app** (swipe up to home screen)
   - From the simulator, send a **channel message** to the phone user
   - Tap the notification on the phone → app should open directly into that **Channel screen**
   - Press back → should return to the home screen (not a stale stack)
   - Repeat with a **DM message** → should open the **Conversation screen**
   - Repeat with a **@mention** → should open the **Channel screen** where the mention occurred

10. **Test deep linking (cold start — app was killed):**
    - **Force-quit** the app on the phone (swipe up in app switcher)
    - From the simulator, send a DM to the phone user
    - Tap the notification → app should **launch and navigate directly** to the Conversation screen
    - Repeat with a channel message → should launch into the Channel screen

11. **Test deep linking edge cases:**
    - Open the app normally (no notification tap) → should land on the home screen, **not** re-navigate to an old notification
    - Tap a notification while already on a different channel → should navigate to the correct channel, resetting the stack
    - Receive multiple notifications, tap one → should navigate to the tapped one, notification tray should be cleared

---

## Backend Test Scripts

All backend tests pass (can re-run anytime to verify):

```bash
# Push service unit tests (19/19 passed)
cd backend && npx ts-node scripts/test-push-registration.ts

# Push integration tests (17/17 passed) 
cd backend && npx ts-node scripts/test-push-integration.ts

# Push service builder tests (from Chunk 2)
cd backend && npx ts-node scripts/test-push-service.ts

# Deep linking payload validation (47/47 passed)
cd backend && npx tsx scripts/test-deep-linking.ts
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `backend/prisma/schema.prisma` | `PushToken` model, `ChannelRead.isMuted` field |
| `backend/src/services/pushNotification.ts` | Core push service (send, build, cleanup) |
| `backend/src/routes/user.routes.ts` | Push token register/remove endpoints |
| `backend/src/routes/channel.routes.ts` | Channel message push triggers + mute API |
| `backend/src/routes/conversation.routes.ts` | DM push triggers + mute API |
| `backend/src/routes/program.routes.ts` | Program invite push trigger |
| `mobile/src/services/notifications.ts` | Mobile push registration, permissions, handlers |
| `mobile/src/services/api.ts` | `pushTokenApi` and `muteApi` client methods |
| `mobile/src/store/notificationStore.ts` | Push token + permission state |
| `mobile/src/store/authStore.ts` | Push registration wired into login/logout |
| `mobile/src/services/navigationRef.ts` | Imperative navigation from notification taps |
| `mobile/src/navigation/AppNavigator.tsx` | Deep link listeners (warm + cold start) |
| `mobile/src/store/muteStore.ts` | Zustand store for instant mute state across screens |
| `mobile/App.tsx` | Foreground notification config + token refresh |
| `mobile/app.json` | `expo-notifications` plugin configured |
| `backend/scripts/test-deep-linking.ts` | Deep link payload validation tests (47 tests) |

---

## Edge Cases Already Handled

- Simulator/emulator: gracefully skips registration (`Device.isDevice` check)
- Concurrent registration: mutex prevents double-registration
- Token reassignment: backend upserts if device changes accounts
- Token refresh on foreground: catches changes after OS/app updates
- Graceful logout: push cleanup errors don't break logout flow
- Invalid/missing tokens: backend rejects with 400
- Non-existent token removal: backend accepts gracefully
- Multi-device: same user can have tokens on multiple devices
- Muted channels/conversations: excluded from push sends
- Message author: excluded from receiving their own push
- Deep link cold start: stale notification filter (>30s old) prevents re-navigation on normal app launch
- Deep link warm start: listener only active while authenticated
- Navigation queue: notifications that arrive before navigator is ready are queued and processed on mount
- Missing notification data: graceful no-op if required fields (channelId, conversationId, programId) are missing
- Unknown notification type: logged as warning, no crash
- Badge/tray cleanup: cleared after successful deep link navigation
