# ConnectPlus — Project Context

## Overview

ConnectPlus is a **real-time CTI (Computer Telephony Integration) platform** built on Next.js + Rainbow CPaaS. It delivers screen-pop notifications for incoming calls, resolves callers against CRM connectors via a unified **CrmService**, logs calls to CRM systems, and writes call records back. Supports two modes: **S2S (notification-only)** and **WebRTC (full browser softphone)**. Includes **agent login (email+password)**, an **embeddable widget** at `/widget` for CRM iframe integration, and a **standalone CTI widget** at `/cti-widget` with full softphone UI matching **Zoho CRM-native design**. Features **auto-connect** (encrypted credential storage), **native Zoho PhoneBridge click-to-call** via postMessage (no SDK dependency), **auto-maximize widget on call start**, and a **close (X) button** to minimize the widget panel.

**Production:** https://connectplus-production-0fbf.up.railway.app
**Widget:** https://connectplus-production-0fbf.up.railway.app/widget
**CTI Widget:** https://connectplus-production-0fbf.up.railway.app/cti-widget
**Login:** https://connectplus-production-0fbf.up.railway.app/login
**Agent UI (legacy):** https://connectplus-production-0fbf.up.railway.app/agent
**GitHub:** https://github.com/moussazaghdoud/connectplus

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20, Next.js 16.1.6 (standalone output) |
| Language | TypeScript 5, React 19.2.3 |
| Database | PostgreSQL via Prisma 7.4.2 (pg adapter) |
| Auth | bcryptjs (password hashing), DB-backed sessions (httpOnly cookie `cp_session`) |
| Telephony (S2S) | Rainbow Node SDK v2.42.0-lts.1 (server-side worker) |
| Telephony (WebRTC) | Rainbow Web SDK v5.0.43-sts (CDN, browser-side) |
| Styling | Tailwind CSS 4 |
| Validation | Zod 4.3.6 |
| Logging | Pino 10.3.1 (pino-pretty in dev) |
| Deployment | Docker multi-stage → Railway |

## Architecture

```
Browser (Widget / Agent UI / CTI Widget)
  │
  ├─ SSE stream (/api/v1/events/stream)  ← screen.pop, call.updated, call.ended
  │
  ├─ CTI SSE stream (/api/v1/cti/stream) ← call.event, screen_pop, heartbeat
  │
  ├─ Mode: "Notification Only" (S2S)
  │   └─ REST calls (/api/v1/rainbow/connect) → starts per-user S2S worker
  │                                              (credentials in memory only)
  │
  └─ Mode: "WebRTC (Browser Audio)"
      ├─ REST /api/v1/rainbow/connect?mode=webrtc → returns appId/secret/host
      ├─ Rainbow Web SDK loaded from CDN (dynamic import at runtime)
      ├─ SDK login → XMPP connection → telephonyService detects calls
      ├─ Call control: answer, reject, mute, hold, hangup, makeCall in browser
      ├─ Click-to-call: makePhoneCall(number) from DialPad, Contacts, or RecentCalls
      ├─ Reports call events → POST /api/v1/calls/event → interaction tracking
      └─ Audio via WebRTC peer connection through browser <audio> element

Server
  │
  ├─ CrmService (SINGLE entry point for ALL CRM operations)
  │     ├─ resolveCallerByPhone() → tries active connectors → local DB fallback
  │     ├─ writeCallLog() → idempotent write-back to all connectors
  │     └─ buildCrmLink() → CRM deep link from contact match
  │
  ├─ ConnectorRegistry (holds all active connectors: Tier 1 + Tier 2)
  │     ├─ Tier 1 (code-based): HubSpot
  │     └─ Tier 2 (config-driven): Zoho CRM, Salesforce, etc.
  │
  ├─ Rainbow SDK (S2S) ──→ registers webhook callback URL with Rainbow
  │     └─ rainbow_oncallupdated ──→ eventBus.emit("pbx.callback", {vendor:"rainbow"})
  │
  ├─ Rainbow Webhooks (/api/v1/rainbow/webhooks) ──→ eventBus.emit("pbx.callback", {vendor:"rainbow"})
  │
  ├─ WebRTC Call Events (/api/v1/calls/event) ← browser reports state changes
  │     ├─ ringing_incoming → crmService.resolveCallerByPhone() + screen pop
  │     ├─ active → update interaction + forward to CTI bridge
  │     └─ ended → complete interaction + forward to CTI bridge
  │
  ├─ CTI Event Bridge (/api/v1/cti/events)
  │     ├─ correlate → de-duplicate → enrich via crmService → update state
  │     ├─ broadcast call.event + screen_pop via CTI SSE
  │     ├─ build CallSummary on terminal states
  │     └─ crmService.writeCallLog() (idempotent)
  │
  ├─ InboundCallHandler (listens on eventBus)
  │     ├─ crmService.resolveCallerByPhone()
  │     ├─ caches resolved contacts in local DB
  │     ├─ broadcasts screen.pop via SSE (with contact name, company, CRM link)
  │     ├─ forwards to CTI bridge for /cti-widget subscribers
  │     └─ creates Interaction record
  │
  └─ Connector write-back (on call end, via CrmService)
        ├─ Iterates ALL active connectors with interaction_writeback capability
        └─ Idempotent by correlationId (in-memory dedup)
```

## Contact Search Flow

**File**: `src/lib/core/contact-resolver.ts`

The contact search always queries **live CRM connectors** — local DB is only a fast first pass, live data replaces stale local entries.

### Search Flow (for text queries like "tollner")
1. **Local DB** — fast query against `contact` table (single `phone` column)
2. **All active CRM connectors** — `searchAllConnectors()` iterates each `ConnectorConfig` (enabled=true)
3. For each connector: `searchContacts()` → live API call (e.g. Zoho `/Contacts/search?word=tollner`)
4. `mapContact()` extracts all phone numbers via `phoneFields` config → `phones[]` array
5. **Merge**: live CRM result replaces local entry for same contact (fresher data wins)

### Multi-Phone Support
- `CanonicalContact.phones: PhoneEntry[]` — array of `{ label, number }` pairs
- `ContactFieldMappingConfig.phoneFields: Record<string, string>` — maps label → CRM field path
- Zoho config: `{ "Phone": "Phone", "Mobile": "Mobile", "Home": "Home_Phone", "Other": "Other_Phone", "Fax": "Fax" }`
- `mapContact()` iterates `phoneFields`, calls `resolveField()` for each, skips empty values
- UI (`ContactSearch.tsx`) renders each phone with label and individual call button

## CrmService — Unified CRM Entry Point

**File**: `src/lib/crm/service.ts`

The CrmService is the SOLE entry point for all CRM operations. All 3 call paths (S2S inbound-call-handler, WebRTC /api/v1/calls/event, CTI bridge event-processor) go through it. No connector is ever called directly from call handling code.

### Resolution Flow
1. Load all `ConnectorConfig` rows for tenant (enabled=true)
2. For each connector: initialize with decrypted credentials → searchContacts({phone}) → mapContact()
3. First match wins → upsert to local DB cache → return ContactMatch
4. Fallback: local DB exact phone match
5. Fallback: local DB fuzzy match (trailing 9 digits via `endsWith` DB query)

### Multi-Module Search Strategies (Tier 2)
The RestCrmConnector supports ordered multi-module search via `searchStrategies`:
- Each strategy has: label, priority, endpoint, method, request, response, fieldMapping, crmModule
- Strategies tried in priority order; first match wins
- Per-strategy field mapping and CRM module tagging
- Query param template uses `{{query}}` (resolves to search term for text, email, or phone)
- CRM deep link via `crmLink.urlTemplate` with `{{module}}` and `{{recordId}}` variables

### Write-Back
- `writeCallLog()` iterates all active connectors with `interaction_writeback` capability
- Idempotent by correlationId (in-memory Map, capped at 1000 entries)

## Directory Structure

```
src/
├── app/
│   ├── login/
│   │   ├── page.tsx                              # Login page (server)
│   │   └── LoginForm.tsx                         # Login form (client)
│   ├── widget/
│   │   ├── layout.tsx                            # Minimal iframe layout
│   │   ├── page.tsx                              # Widget page (session auth)
│   │   ├── WidgetShell.tsx                       # Main widget client component
│   │   └── CallHistory.tsx                       # Recent calls list
│   ├── cti-widget/
│   │   ├── layout.tsx                            # Minimal layout for CRM iframe embedding
│   │   └── page.tsx                              # CTI widget page: native Zoho postMessage handshake + auth
│   ├── agent/page.tsx                            # Legacy agent UI (API key auth)
│   ├── admin/connectors/                         # Connector marketplace UI
│   │   ├── page.tsx                              # Connector grid with search/filter
│   │   └── [slug]/page.tsx                       # Connector detail (overview, settings, audit)
│   ├── api/v1/
│   │   ├── auth/
│   │   │   ├── login/route.ts                    # POST email+password login
│   │   │   ├── logout/route.ts                   # POST destroy session
│   │   │   ├── me/route.ts                       # GET current user
│   │   │   ├── rainbow-credentials/route.ts      # GET/POST/DELETE Rainbow auto-connect creds
│   │   │   ├── [connector]/route.ts              # OAuth start (any connector)
│   │   │   └── [connector]/callback/route.ts     # OAuth callback (any connector)
│   │   ├── interactions/route.ts                 # CRUD interactions
│   │   ├── interactions/[id]/route.ts            # Single interaction
│   │   ├── contacts/search/route.ts              # Contact search (local + live CRM)
│   │   ├── events/stream/route.ts                # SSE endpoint (widget)
│   │   ├── calls/event/route.ts                  # WebRTC call event receiver + CTI bridge
│   │   ├── rainbow/
│   │   │   ├── connect/route.ts                  # Start/stop/status (S2S + WebRTC)
│   │   │   └── webhooks/route.ts                 # S2S callback receiver
│   │   ├── cti/
│   │   │   ├── stream/route.ts                   # CTI SSE endpoint (cti-widget)
│   │   │   ├── events/route.ts                   # CTI webhook receiver (HMAC)
│   │   │   ├── call/                             # Call control endpoints
│   │   │   ├── click-to-dial/route.ts             # POST click-to-dial (server-side fallback, SSE broadcast)
│   │   │   ├── call-notes/route.ts               # POST/GET agent wrap-up notes
│   │   │   └── diagnostics/route.ts              # GET call logging diagnostics
│   │   ├── webhooks/[connector]/route.ts         # Connector webhooks
│   │   ├── admin/
│   │   │   ├── tenants/route.ts                  # Tenant management (POST skipAuth)
│   │   │   ├── connectors/route.ts               # Connector config (GET/POST)
│   │   │   ├── connectors/debug/route.ts         # Diagnostic: registry + token status
│   │   │   ├── connectors/test-search/route.ts   # Debug: raw CRM API test
│   │   │   └── marketplace/connectors/           # Marketplace API
│   │   └── health/route.ts                       # Health check
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
│
├── components/
│   ├── screen-pop/                               # Legacy agent UI components
│   ├── cti-widget/                               # CTI softphone components (glassmorphism)
│   │   ├── CtiSoftphone.tsx                      # Main softphone (4 tabs, SVG icons, close button, auto-maximize)
│   │   ├── DialPad.tsx                           # Glass dial pad + emerald call button
│   │   ├── ActiveCallPanel.tsx                   # Glass call controls (SVG icons, glow effects)
│   │   ├── ContactSearch.tsx                     # Glass search + multi-phone click-to-call
│   │   ├── RecentCalls.tsx                       # Glass call history + direction icons
│   │   ├── CallWrapUp.tsx                        # Glass wrap-up form
│   │   └── ScreenPopup.tsx                       # Incoming call screen pop overlay
│   └── admin/connectors/                         # Marketplace UI components
│
├── lib/
│   ├── core/
│   │   ├── connector-interface.ts                # Plugin contract (abstract)
│   │   ├── connector-registry.ts                 # Connector lifecycle (globalThis singleton)
│   │   ├── contact-resolver.ts                   # Local DB + live CRM search (live wins)
│   │   ├── inbound-call-handler.ts               # PBX callback → CTI bridge → crmService → screen pop
│   │   ├── event-bus.ts                          # Typed EventEmitter (pbx.callback + legacy rainbow.callback)
│   │   └── models/                               # Contact (with PhoneEntry[]), Interaction, Tenant types
│   │
│   ├── crm/
│   │   └── service.ts                            # CrmService — SINGLE CRM entry point
│   │
│   ├── cti/
│   │   ├── types/                                # CtiCallEvent, CTI connector interface
│   │   ├── models/
│   │   │   └── call-summary.ts                   # CallSummary model (generic system field)
│   │   ├── bridge/
│   │   │   ├── event-processor.ts                # Pipeline: correlate → dedup → crmService → broadcast
│   │   │   └── websocket-manager.ts              # CTI SSE subscriber management + broadcast
│   │   ├── session/
│   │   │   └── call-context.ts                   # Call context storage + CallSummary builder
│   │   └── index.ts                              # Re-exports
│   │
│   ├── connectors/
│   │   ├── index.ts                              # Registry init + initializeConnectors()
│   │   ├── hubspot/                              # Tier 1 connector (code-based)
│   │   ├── zoho-cti/                             # Legacy Zoho CTI connector (bypassed by factory)
│   │   ├── marketplace/                          # Marketplace data layer
│   │   └── factory/                              # Config-driven connector engine
│   │       ├── rest-crm-connector.ts             # Multi-strategy search + phoneFields + CRM links + SSRF
│   │       ├── dynamic-loader.ts                 # Loads from DB, hot-reload, auto-patch {{phone}}→{{query}}
│   │       ├── auth-handler.ts                   # OAuth2/API key/Basic + token refresh
│   │       ├── field-mapper.ts                   # Dot-path + {{template}} + || fallback (skips non-string)
│   │       ├── config-schema.ts                  # Zod validation (incl searchStrategies, phoneFields, crmLink)
│   │       └── types.ts                          # SearchStrategyConfig, ContactFieldMappingConfig, etc.
│   │
│   ├── middleware/                               # API handler, auth, rate limiter
│   ├── observability/                            # Logger, metrics, audit log
│   ├── utils/                                    # Crypto, HTTP, phone, password
│   └── db.ts                                     # Prisma client + tenant isolation
│
├── instrumentation.ts                            # Server startup: connectors, SSE, inbound handler
│                                                 # (NO Zoho-specific wiring — all via CrmService)
│
prisma/
├── schema.prisma                                 # DB schema (10+ models)
├── seed-marketplace.ts                           # Marketplace seed (29 connectors, {{query}} templates)
└── scripts/
    ├── seed.ts                                   # Dev seed (tenants + sample data)
    ├── rotate-key.ts                             # Rotate tenant API key (by slug or ID)
    ├── check-zoho-def.ts                         # Diagnostic: check Zoho definition config
    └── test-zoho-search.ts                       # Diagnostic: test Zoho API directly

scripts/
└── check-zoho-contact.ts                         # Query live Zoho for phone fields

docs/
└── connector-onboarding.md                       # "Onboard a CRM in 30 minutes" guide
```

## Database Schema

| Model | Purpose |
|-------|---------|
| **Tenant** | Multi-tenant with encrypted Rainbow creds, hashed API key |
| **User** | Agent accounts (email, passwordHash, role ADMIN/AGENT, rainbowLogin/Password) |
| **UserSession** | DB-backed sessions (tokenHash SHA-256, expiresAt, 7-day TTL) |
| **ConnectorConfig** | Per-tenant connector installation (encrypted OAuth tokens + credentials) |
| **ConnectorDefinition** | Config-driven connector JSON (slug, config, status, version, searchStrategies) |
| **ConnectorDefinitionVersion** | Rollback snapshots |
| **Contact** | Canonical contact cache (name, email, phone, company) |
| **ExternalLink** | Maps Contact ↔ external system IDs (Zoho, HubSpot, etc.) |
| **Interaction** | Call/meeting records with full lifecycle status |
| **AuditLog** | Immutable audit trail (actor, action, resource) |
| **DeadLetterQueue** | Failed webhook/writeback retry queue |
| **IdempotencyRecord** | Request deduplication (24h TTL) |

## Authentication

### Dual Auth System
- **API key**: `x-api-key` header → SHA-256 hashed lookup in Tenant table
- **Session cookie**: `cp_session` httpOnly cookie → SHA-256 hashed token lookup in UserSession table
- Auth middleware tries API key first, falls back to session cookie

### User Login Flow
1. `POST /api/v1/auth/login` — email + password → creates session, sets cookie
2. `GET /api/v1/auth/me` — returns current user or 401
3. `POST /api/v1/auth/logout` — destroys session, clears cookie

## CTI System

### CTI Event Bridge Pipeline
1. **Correlate** — assign/reuse correlationId per call
2. **De-duplicate** — idempotency key (correlationId + state + rounded timestamp)
3. **Enrich** — `crmService.resolveCallerByPhone()` on ringing
4. **Update state** — call state store per tenant/agent
5. **Broadcast** — SSE events to widget subscribers
6. **Log** — `crmService.writeCallLog()` on terminal states (idempotent)

### CallSummary Model
- Built from call context on terminal states
- Outcome: answered, missed, failed, cancelled
- CRM system field is now generic `string` (not hardcoded "zoho")
- Stored in memory for wrap-up/audit (200 entry cap)

## Active CRM Connectors

### Zoho CRM (Config-driven, Tier 2)
- **Slug**: `zoho-crm`, **Status**: ACTIVE
- **API**: `https://www.zohoapis.com/crm/v2` (**.com** domain, NOT .eu)
- **Auth**: OAuth2, token prefix `Zoho-oauthtoken`, `.com` region
- **Search strategies** (multi-module, priority order):
  1. Contacts: `GET /Contacts/search?word={{query}}` (priority 0)
  2. Leads: `GET /Leads/search?word={{query}}` (priority 1)
  3. Accounts: `GET /Accounts/search?word={{query}}` (priority 2)
- **Field mapping**: per-strategy with `phoneFields` for multi-phone extraction
- **phoneFields**: `{ Phone, Mobile, Home_Phone, Other_Phone, Fax }`
- **CRM deep link**: `https://crm.zoho.com/crm/tab/{{module}}/{{recordId}}`
- **Call logging**: `POST /Calls` with direction, duration, disposition, contact link
- **Token refresh**: Auto-refresh via `ensureFreshToken()` before each API call
- **Auto-patch**: `dynamic-loader.ts` patches `{{phone}}` → `{{query}}` in DB on startup

### HubSpot (Code-based, Tier 1)
- Full ConnectorInterface implementation in `src/lib/connectors/hubspot/`
- OAuth2, contact search, call engagement write-back, webhook signature verification

## Connector Plugin System

### Two-Tier Architecture
- **Tier 1 (code-based)**: Hand-coded connectors for complex integrations. HubSpot is the exemplar.
- **Tier 2 (config-driven)**: JSON definition stored in DB → `RestCrmConnector` instantiates at runtime.
  - `searchStrategies[]` for multi-module ordered search
  - `phoneFields` in `fieldMapping` for multi-phone extraction (skipped by `mapContactFields` as non-string)
  - `crmLink.urlTemplate` for deep links with `{{module}}`, `{{recordId}}` variables
  - `fieldMapping` per strategy (dot-path, `{{template}}`, `field1 || field2` fallback)

### ConnectorDefinition vs ConnectorConfig
- **ConnectorDefinition**: Global blueprint (one per CRM). Defines API URLs, auth config, search strategies.
- **ConnectorConfig**: Per-tenant installation. Stores encrypted OAuth credentials. Links tenant to definition.

### seed-marketplace.ts Behavior
- On fresh install: creates ConnectorDefinition with full config
- On re-run: **updates config + metadata** (fixed: previously skipped config on update)
- Run against Railway: `DATABASE_URL="<public_url>" npx tsx prisma/seed-marketplace.ts`
- Startup script auto-runs seed before Next.js starts

## CTI Widget — Zoho CRM-Compliant Design

The CTI widget (`/cti-widget`) features a **Zoho CRM-native look and feel** — light theme, flat design, matching Zoho's design tokens.

### Design System (Zoho-compliant)
- **Primary blue**: `#006cff` (Zoho CRM primary), hover: `#0047ff`
- **Background**: Light gray `#f8f9fa`, cards/panels: white `bg-white`
- **Header**: Solid `#006cff` blue bar with white text
- **Text hierarchy**: `text-gray-800` (primary), `text-gray-500` (secondary), `text-gray-400` (muted)
- **Inputs**: `bg-white border-gray-300 rounded-md`, focus: `ring-[#006cff]/30`
- **Buttons**: Solid `#006cff` (primary), `#2ecc71` green (call), `#e74c3c` red (hangup)
- **Borders**: `border-gray-200` (cards), `border-gray-100` (list dividers)
- **Font**: Roboto, Lato, system sans-serif (Zoho Puvi fallback)
- **Border radius**: `6px` buttons (rounded-md), `4-6px` inputs, `rounded-full` circles
- **Icons**: SVG throughout (phone, signal, user, clock, mic, pause, keypad, transfer, backspace)
- **Logo**: Rainbow logo image (`/rainbow-logo.png`) in header

### 4 Tabs
- **Dial**: Number input + compact dial pad (14x14 keys) → click-to-call via WebRTC
- **Active**: Avatar + call controls (mute, hold, keypad, transfer, hangup)
- **Contacts**: Search bar → live CRM results with all phones + individual call buttons
- **Recent**: Call history with direction arrows + disposition badges

### Widget Sizing
- Fills 100% of Zoho telephony panel (no max-width, no scroll)
- Compact dial pad fits within standard 400x600 widget container
- Content area uses `overflow-hidden` / `min-h-0` for proper flex layout

### Auto-Connect (Rainbow Credentials)
- On first connect, user checks "Remember me" checkbox → credentials saved server-side
- Credentials stored AES-256-GCM encrypted in `User.rainbowLogin` / `User.rainbowPassword` DB fields
- API: `GET/POST/DELETE /api/v1/auth/rainbow-credentials` (session auth)
- On widget load: fetches saved credentials → auto-connects to Rainbow without user interaction
- Disconnect clears saved credentials (back to manual mode)
- No hardcoded passwords — password field starts empty

### Zoho PhoneBridge Integration (Native postMessage — No SDK)

The Zoho Embedded App SDK (`ZohoEmbededAppSDK.min.js`) doesn't initialize for externally-hosted widgets — the `ZOHO` global object never gets created. By reverse-engineering the SDK source code, we replicate the handshake protocol natively via `postMessage`:

**Handshake Protocol:**
1. Widget sends `{type: "SDK.EVENT", eventName: "REGISTER", appOrigin: ...}` to `window.parent` using `serviceOrigin` from iframe URL query params (Zoho adds this automatically)
2. Zoho responds with `{type: "FRAMEWORK.EVENT", eventName: "SET_CONTEXT", data: {uniqueID: "widgetTelephony", ...}}`
3. After registration, Zoho sends `FRAMEWORK.EVENT` messages for `Dial`, `DialerActive`, `PageLoad`, etc.

**Click-to-Call:**
- When user clicks a phone number on any Zoho CRM record, Zoho sends `{type: "FRAMEWORK.EVENT", eventName: "Dial", data: {number: "..."}}`
- `page.tsx` extracts the number, passes it to `CtiSoftphone` via `zohoDialNumber` prop
- `CtiSoftphone` calls `handleDial()` which initiates the outbound call via Rainbow WebRTC

**Auto-Maximize Widget on Call Start:**
- When a call starts (inbound ringing or outbound dial), the widget sends `{type: "SDK.EVENT", eventName: "CRM_EVENT", data: {category: "UI", action: {telephony: "MAXIMIZE"}}}` to Zoho parent
- This replicates `ZOHO.CRM.UI.Dialer.maximize()` — tells Zoho CRM to open the telephony panel
- Also sends `NOTIFY` as a fallback to flash the telephony icon
- Messages include `promiseid` and `uniqueID` matching the SDK's expected format

**Close (X) Button — Widget Minimize:**
- Close icon (X) in top-right corner of widget header
- Sends `{category: "UI", action: {telephony: "MINIMIZE"}}` via same postMessage protocol
- Allows user to dismiss the widget without finding the phone icon in Zoho's bottom toolbar

**Key Discovery:** Zoho communicates with telephony widgets exclusively via `postMessage` with format `{type: "FRAMEWORK.EVENT", eventName: "...", data: {...}, uniqueID: "widgetTelephony"}`. The SDK is just a thin wrapper around this — zero external scripts needed.

### Widget Controls
- **Close (X) button**: Top-right corner of header, sends MINIMIZE to Zoho parent via postMessage
- **Auto-maximize**: Widget panel auto-opens on inbound ringing or outbound dial
- **Rainbow status dot**: Green (connected), yellow pulse (connecting), gray (disconnected), red (error)

### Error Guards
- `callAction()` skips if `agentId` is missing (prevents errors during deploy restarts)
- `handleDial()` validates and cleans phone number before API call (min 3 digits)
- Rainbow login input uses `type="text"` to avoid HTML5 email validation blocking

## Security

- **API auth**: SHA-256 hashed API keys (`cp_` prefix + 256-bit random) + session cookies
- **Secrets at rest**: AES-256-GCM encryption (ENCRYPTION_KEY env var), format: base64(iv16 + ciphertext + authTag16)
- **Tenant isolation**: Prisma `$extends` auto-injects tenantId on all queries
- **SSRF prevention**: URL validator in connector factory — validated at both config time AND request time (search, writeBack, healthCheck, association endpoints)
- **Idempotency**: Call logging dedup by correlationId

## Deployment

- **Docker**: Multi-stage (deps → builder → runner), node:20-alpine, non-root user
- **Railway**: Dockerfile builder, `sh start.sh`, health check at `/api/v1/health`
- **Startup**: `prisma migrate deploy` → `tsx prisma/seed-marketplace.ts` → `node server.js`
- **Push**: `git push origin master` (Railway deploys from `master` branch)
- **Railway DB access**: Use `DATABASE_PUBLIC_URL` from Railway Postgres service for local scripts
- **Railway CLI**: Has TLS issue (`invalid peer certificate: UnknownIssuer`) — use Dashboard instead

## Credentials & Config

- **Tenant**: `ale` (ALE), **ID**: `cmm8dpm9w000001qurr9bo1tc`
- **API Key**: `cp_524fe4a867343ad8a3cc7ef7b43df3d3ca31210954fab30c503a9ad340628adf`
- **Login user**: `moussa.zaghdoud@gmail.com` / `moussa123` (ADMIN)
- **Zoho Client ID**: `1000.TO2JDUIRNZKCGJUG7X0UKAKKFMM5SC`
- **Zoho connector slug**: `zoho-crm` (config-driven, ACTIVE, .com region)
- **Zoho org**: MZCorp (production)
- **Railway DB (public)**: `postgresql://postgres:RTlsymtUpppLDprRblAIAlFgtnTxjQxc@caboose.proxy.rlwy.net:51214/railway`
- **ENCRYPTION_KEY**: `4238176a8c55f240de731356a9bc350e9de6fe017289f06533bbf32e3d7b4f8e`

## Rainbow CPaaS Integration Status

### Implemented Features
| Feature | S2S | WebRTC | Notes |
|---------|-----|--------|-------|
| Inbound calls (ringing/active/ended) | Yes | Yes | Full lifecycle |
| Outbound calls (click-to-call) | 3PCC API | makePhoneCall | From DialPad, Contacts tab, RecentCalls, Zoho PhoneBridge (native postMessage) |
| Answer / Reject | Yes | Yes | call.answer() / call.release() |
| Hangup | Yes | Yes | |
| Mute / Unmute | Yes | Yes | callService.muteCall() |
| Hold / Resume | Yes | Yes | callService.holdCall/retrieveCall() |
| DTMF | CTI bridge | — | Keypad in ActiveCallPanel |
| Call Transfer | CTI bridge | — | Blind transfer only |
| Conference creation | Yes (bubble) | — | createConference() via rooms API |
| Contact search | REST API | — | By name/email/ID via Rainbow users API |
| CRM contact search | — | — | ContactSearch component → live Zoho API |
| Screen pop | Yes | Yes | CRM caller resolution on ringing |
| Call logging to CRM | Yes | Yes | Idempotent via CrmService |
| WebRTC call quality | — | Yes | RTT, jitter, packet loss, codec (3s polling) |

### Not Implemented
Instant messaging, presence/availability, channels/rooms, video calls, screen sharing, file sharing, voicemail, call recording initiation, call forwarding, IVR, call queues, attended transfer, bubble conversations.

### Key Files
| File | Purpose |
|------|---------|
| `src/lib/rainbow/client.ts` | REST API auth + HTTP calls |
| `src/lib/rainbow/calls.ts` | Call/conference ops (3PCC, bubbles) |
| `src/lib/rainbow/contacts.ts` | Contact search/lookup |
| `src/lib/rainbow/s2s-connector.ts` | S2S worker spawner & manager |
| `src/hooks/useRainbowWebSDK.ts` | Browser WebRTC hook (730 lines) |
| `scripts/rainbow-s2s-worker.js` | Node.js S2S process (standalone) |

## State Management

### StateStore Abstraction (`src/lib/state/store.ts`)
- Unified key-value store: `InMemoryStore<T>` (default) or `RedisStore<T>` (when `REDIS_URL` is set)
- TTL support, JSON serialization, prefix namespacing
- Used by: CTI correlation (`cti:corr`), dedup events (`cti:seen`), active calls (`cti:calls`)
- Factory: `createStore<T>(prefix, opts)` — auto-selects backend

### PBX Abstraction
- Generic `pbx.callback` event with `vendor` discriminator field (currently only `"rainbow"`)
- InboundCallHandler listens on `pbx.callback` (not `rainbow.callback`)
- `rainbow.callback` kept as deprecated alias for backward compatibility

## Zoho CRM Widget Integration

### Zoho Developer Portal Extension
- **Extension name**: Rainbow CTI (published, private)
- **Portal**: https://platform.zoho.com (Developer) / https://sigma.zoho.com (Sigma workspace)
- **Type**: Telephony (Zoho PhoneBridge framework)
- **Production CRM**: https://crm.zoho.com (MZCorp org)
- **Sandbox CRM**: https://plugin-rainbowcti.zohosandbox.com
- **Status**: Published (private, not public Marketplace)

### Telephony Widget Setup
The CTI softphone is embedded via Zoho's PhoneBridge Telephony integration:
1. Developer portal → Extension → **Telephony** (left sidebar)
2. **Call Center Name**: Rainbow Widget
3. **Base URL**: Auto-filled from Connected App config (cannot be changed after creation)
4. **Resource path**: `/cti-widget` (appended to base URL)
5. `headers()` in `next.config.ts` with `frame-ancestors *` CSP allows Zoho to iframe the widget
7. Result: Phone icon in bottom-right of Zoho CRM → opens CTI softphone panel

### Setup Guide (from scratch)
1. Create extension at platform.zoho.com → **New Extension** (CRM, external hosting)
2. Set base URL to `https://connectplus-production-0fbf.up.railway.app` (NO `/cti-widget`)
3. Go to **Telephony** sidebar → set resource path `/cti-widget`
4. **Test your Extension** → installs to sandbox/production org
5. **Publish** (private) → installs to production CRM
6. Phone icon appears in Zoho CRM bottom-right toolbar → opens CTI widget with native postMessage handshake

### Widget Files (zoho-widget/)
- `plugin-manifest.json` — Extension manifest: telephony widget, 400x600, `/app/widget.html`
- `app/widget.html` — Iframe wrapper (legacy, not actively used — Zoho loads `/cti-widget` directly)
- `widget.zip` — Packaged extension for upload
- **Note:** The Zoho extension loads `/cti-widget` directly as the telephony resource path. All PhoneBridge communication happens via native postMessage in `page.tsx` — no SDK, no widget.html intermediary.

### Key Config
- `next.config.ts` has `headers()` with `frame-ancestors *` CSP for `/cti-widget` routes
- **No Zoho SDK dependency** — handshake replicated natively via postMessage (SDK at `https://live.zwidgets.com/js-sdk/1.2/ZohoEmbededAppSDK.min.js` was reverse-engineered but not loaded)
- Zoho adds `?serviceOrigin=<encoded_origin>` to the iframe URL — this is used for postMessage targeting
- Rainbow logo: `public/rainbow-logo.png` (displayed in widget header)

## Known Issues & Fixes Applied

- **Zoho domain**: User's Zoho is on `.com` (US/global), NOT `.eu` (EU). All URLs updated to `.com`
- **Zoho OAuth tokens missing**: First OAuth flow used `.eu` token URL → exchange failed silently → no tokens stored. Fixed by switching to `.com` and re-doing OAuth.
- **seed-marketplace update bug**: `update:` block didn't include `config` field → re-running seed didn't update ConnectorDefinition config. Fixed.
- **Zoho endpoint**: Must use `/Contacts/search` (plural), not `/Contact/search` (singular)
- **CrmService dedup**: In-memory Map keyed by correlationId, capped at 1000 entries
- **Registry duplication**: Next.js creates separate module instances. All singletons use `globalThis` / `Symbol.for()`
- **CallSummary.crm.system**: Changed from `"zoho"` literal to generic `string` type
- **CRM lookup duplication**: InboundCallHandler reuses CRM context from CTI bridge (no double lookup)
- **HubSpot token refresh**: Now persisted to DB with AES-256-GCM encryption (was in-memory only)
- **Dynamic connector reload**: Keeps old connector if new config validation fails (rollback safety)
- **Fuzzy phone match**: Replaced O(n) scan of 500 contacts with DB `endsWith` query on last 9 digits
- **ContactResolver**: Phone searches delegate to CrmService (single code path, no logic duplication)
- **Dynamic base URLs**: Salesforce (`{{instanceUrl}}`), Dynamics (`{{orgUrl}}`), Freshdesk (`{{subdomain}}`) resolved at request time
- **Search strategy templates**: Changed `{{phone}}` → `{{query}}` so text searches pass the term to CRM APIs (auto-patched on startup)
- **field-mapper crash**: `mapContactFields` called `.includes()` on `phoneFields` object → added `typeof !== "string"` guard
- **Contact search was local-only**: Text queries only hit local DB. Now searches all active CRM connectors live, local DB as fallback, live data replaces stale entries
- **Glassmorphism → Zoho theme**: Redesigned CTI widget from dark glassmorphism to Zoho CRM-native light theme (`#006cff` blue, white cards, Roboto font, flat design)
- **Widget height overflow**: Removed `max-w-sm` constraint, compact dial pad (14x14 keys), `overflow-hidden` on content area — widget fills container without scroll
- **Connect button disabled**: Changed Rainbow login from `type="email"` to `type="text"` to avoid HTML5 validation blocking the Connect button
- **Missing required fields error**: Added guards in `callAction()` (skip if no agentId) and `handleDial()` (validate number) to prevent errors during Railway deploy restarts
- **Zoho widget 404**: Base URL in Zoho extension included `/cti-widget` causing double path. Fixed by setting correct base URL or using redirects
- **Hardcoded Rainbow password**: Removed `Moussa.123` default from CtiSoftphone state. Password field now starts empty; credentials saved server-side (encrypted) via "Remember me" for auto-connect
- **No auto-connect**: Widget required manual click each time. Added auto-connect: saved credentials fetched on mount → Rainbow connects automatically
- **No Zoho click-to-call**: Phone numbers in Zoho CRM records were not clickable for calling. Initially tried Zoho SDK (never initializes for external widgets), then server-side PhoneBridge API (too complex for users). Final solution: native postMessage handshake replicating the SDK's REGISTER protocol → Zoho sends Dial events with phone number → triggers outbound call. Zero user setup required.
- **Zoho SDK doesn't work for external widgets**: `ZOHO` global object never created when widget is hosted outside Zoho. Root cause: SDK relies on `ZSDK` class which uses `serviceOrigin` query param for cross-domain postMessage — works internally but `ZOHO.embeddedApp.init()` fails silently for external URLs. Solved by replicating the postMessage protocol directly.
- **Widget panel doesn't auto-open on call**: Added `ZOHO.CRM.UI.Dialer.maximize()` equivalent via postMessage (`{category: "UI", action: {telephony: "MAXIMIZE"}}`) — sent on inbound ringing and outbound dial
- **No way to close widget without phone icon**: Added close (X) button in widget header that sends MINIMIZE command to Zoho CRM via postMessage

## Test Suite

- **198+ unit tests** across test files (vitest)
- Includes `src/__tests__/crm/crm-service.test.ts` (8 tests: empty phone, no connectors, local DB fallback, connector from registry, writeCallLog dedup, buildCrmLink)
- Run: `npm test`
