# WebRTC Browser Calling via Rainbow Web SDK

## Context
ConnectPlus currently receives Rainbow S2S telephony webhooks and shows screen pop notifications on the `/agent` page. However, the actual voice call must be answered on a separate Rainbow desktop/mobile app. The user wants agents to **answer and handle calls directly in the browser** using WebRTC.

## Approach
Add `rainbow-web-sdk` (browser-only SDK, v5.0.42) alongside the existing `rainbow-node-sdk` (server-side S2S). The server continues handling webhooks, contact resolution, and interaction tracking. The browser SDK handles WebRTC media (mic/speaker) and call control (answer/hang up/mute/hold).

**Agent auth:** Each agent enters their own Rainbow email + password on the `/agent` page (stored in localStorage). The app's `appId` and `appSecret` are fetched from the server (already stored encrypted in the tenant DB).

**Call correlation:** Both SSE events and WebRTC events carry the Rainbow `callId`. The UI matches them to show screen pop info + call controls together.

## Changes

### 1. Install `rainbow-web-sdk`
```
npm install rainbow-web-sdk
```
Browser-only package. May need `transpilePackages` in next.config.ts or fallback to UMD script loading if ESM import fails.

### 2. New: `src/app/api/v1/rainbow/config/route.ts`
Authenticated GET endpoint that returns `{ appId, appSecret, host }` for the tenant. Uses existing `secretsManager.getRainbowCredentials()` from `src/lib/utils/secrets.ts`. Protected by API key auth.

### 3. New: `src/hooks/useRainbowWebRTC.ts`
Core React hook wrapping the rainbow-web-sdk lifecycle:
- Dynamically loads SDK (browser-only, guarded by `typeof window`)
- Calls `rainbowSDK.load()` → `initialize(appId, appSecret)` → `connection.signin(email, password)`
- Listens for `rainbow_onwebrtccallstatechanged` events
- Tracks calls in a Map keyed by Rainbow callId
- Exposes: `answerCall()`, `hangUp()`, `toggleMute()`, `toggleHold()`, `disconnect()`
- Returns `connectionState`, `error`, `calls` Map
- Handles remote MediaStream for audio playback

### 4. New: `src/hooks/useMediaDevices.ts`
Microphone permission hook:
- Checks `navigator.permissions.query({ name: 'microphone' })`
- Provides `requestPermission()` via `getUserMedia({ audio: true })`
- Returns `permissionState`: prompt/granted/denied

### 5. New: `src/components/screen-pop/CallControls.tsx`
Button bar component:
- RINGING: green "Answer" + red "Decline" buttons
- ACTIVE: "Mute/Unmute", "Hold/Resume", red "Hang Up"
- COMPLETED: hidden
- Props: `callStatus`, `isMuted`, `isHeld`, `onAnswer`, `onHangUp`, `onToggleMute`, `onToggleHold`

### 6. Modify: `src/components/screen-pop/ScreenPopProvider.tsx`
Major integration:
- Add Rainbow credentials form (email + password fields) below API key form
- Fetch `/api/v1/rainbow/config` after API key connects to get appId/appSecret
- Use `useRainbowWebRTC` hook with agent credentials + tenant config
- Use `useMediaDevices` hook for mic permission
- Show WebRTC connection status indicator (separate from SSE status)
- Correlate SSE events with WebRTC calls by `rainbowCallId`
- Pass WebRTC state and control callbacks to CallNotification
- Add hidden `<audio autoPlay>` element for remote stream playback

### 7. Modify: `src/components/screen-pop/CallNotification.tsx`
- Accept new props: `webrtcState`, `onAnswer`, `onHangUp`, `onToggleMute`, `onToggleHold`
- Render `CallControls` component in footer area when WebRTC is available
- Keep existing behavior when WebRTC is not connected (graceful degradation)

### 8. Modify: `src/lib/sse/types.ts`
Add `rainbowCallId?: string` to `ScreenPopData` interface for correlation.

### 9. Modify: `src/lib/core/inbound-call-handler.ts`
Include `rainbowCallId: callId` in the screen.pop SSE broadcast (line ~101).

## Key Files
- `src/hooks/useRainbowWebRTC.ts` — **new**, SDK wrapper hook
- `src/hooks/useMediaDevices.ts` — **new**, mic permission hook
- `src/components/screen-pop/CallControls.tsx` — **new**, answer/hangup/mute/hold buttons
- `src/app/api/v1/rainbow/config/route.ts` — **new**, tenant config endpoint
- `src/components/screen-pop/ScreenPopProvider.tsx` — **modify**, integrate WebRTC
- `src/components/screen-pop/CallNotification.tsx` — **modify**, add controls
- `src/lib/sse/types.ts` — **modify**, add rainbowCallId
- `src/lib/core/inbound-call-handler.ts` — **modify**, send rainbowCallId in SSE

## Existing Code to Reuse
- `secretsManager.getRainbowCredentials()` in `src/lib/utils/secrets.ts` — already decrypts tenant Rainbow config
- `apiHandler` in `src/lib/middleware/api-handler.ts` — standard auth wrapper for the config endpoint
- Existing `CallNotificationData` type and animation patterns in `CallNotification.tsx`

## Verification
1. Open `/agent`, connect with API key (SSE green)
2. Enter Rainbow email + password, connect WebRTC (second green indicator)
3. Browser prompts for microphone → grant
4. Call the agent's Rainbow number from a phone
5. Screen pop appears with "Answer" / "Decline" buttons
6. Click "Answer" → audio flows, notification turns green with timer
7. Click "Mute" → caller cannot hear agent, "Unmute" restores
8. Click "Hang Up" → call ends, notification grays out + auto-dismiss
9. Disconnect WebRTC → make another call → screen pop still appears (no answer button), confirming graceful degradation
