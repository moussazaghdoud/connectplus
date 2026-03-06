# ConnectPlus — Project Context

## Overview

ConnectPlus is a **real-time CTI (Computer Telephony Integration) platform** built on Next.js + Rainbow CPaaS. It delivers screen-pop notifications for incoming calls, resolves callers against CRM connectors via a unified **CrmService**, logs calls to CRM systems, and writes call records back. Supports two modes: **S2S (notification-only)** and **WebRTC (full browser softphone)**. Includes **agent login (email+password)**, an **embeddable widget** at `/widget` for CRM iframe integration, and a **standalone CTI widget** at `/cti-widget` with full softphone UI.

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
│   │   └── page.tsx                              # CTI softphone widget (session auth)
│   ├── agent/page.tsx                            # Legacy agent UI (API key auth)
│   ├── admin/connectors/                         # Connector marketplace UI
│   │   ├── page.tsx                              # Connector grid with search/filter
│   │   └── [slug]/page.tsx                       # Connector detail (overview, settings, audit)
│   ├── api/v1/
│   │   ├── auth/
│   │   │   ├── login/route.ts                    # POST email+password login
│   │   │   ├── logout/route.ts                   # POST destroy session
│   │   │   ├── me/route.ts                       # GET current user
│   │   │   ├── [connector]/route.ts              # OAuth start (any connector)
│   │   │   └── [connector]/callback/route.ts     # OAuth callback (any connector)
│   │   ├── interactions/route.ts                 # CRUD interactions
│   │   ├── interactions/[id]/route.ts            # Single interaction
│   │   ├── contacts/search/route.ts              # Contact search (local + CRM)
│   │   ├── events/stream/route.ts                # SSE endpoint (widget)
│   │   ├── calls/event/route.ts                  # WebRTC call event receiver + CTI bridge
│   │   ├── rainbow/
│   │   │   ├── connect/route.ts                  # Start/stop/status (S2S + WebRTC)
│   │   │   └── webhooks/route.ts                 # S2S callback receiver
│   │   ├── cti/
│   │   │   ├── stream/route.ts                   # CTI SSE endpoint (cti-widget)
│   │   │   ├── events/route.ts                   # CTI webhook receiver (HMAC)
│   │   │   ├── call/                             # Call control endpoints
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
│   ├── cti-widget/                               # CTI softphone components
│   │   ├── CtiSoftphone.tsx                      # Main softphone (Dial/Active/Contacts/Recent tabs)
│   │   ├── DialPad.tsx                           # Number input + dial pad grid
│   │   ├── ActiveCallPanel.tsx                   # In-call controls (mute/hold/transfer/DTMF/hangup)
│   │   ├── ContactSearch.tsx                     # CRM contact search + click-to-call
│   │   ├── RecentCalls.tsx                       # Recent call list + click-to-call
│   │   ├── CallWrapUp.tsx                        # Post-call notes + disposition
│   │   └── ScreenPopup.tsx                       # Incoming call screen pop overlay
│   └── admin/connectors/                         # Marketplace UI components
│
├── lib/
│   ├── core/
│   │   ├── connector-interface.ts                # Plugin contract (abstract)
│   │   ├── connector-registry.ts                 # Connector lifecycle (globalThis singleton)
│   │   ├── contact-resolver.ts                   # Local + CrmService-delegated contact lookup
│   │   ├── inbound-call-handler.ts               # PBX callback → CTI bridge → crmService → screen pop
│   │   ├── event-bus.ts                          # Typed EventEmitter (pbx.callback + legacy rainbow.callback)
│   │   └── models/                               # Contact, Interaction, Tenant types
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
│   │   ├── index.ts                              # Registry init
│   │   ├── hubspot/                              # Tier 1 connector (code-based)
│   │   ├── zoho-cti/                             # Legacy Zoho CTI connector (bypassed by factory)
│   │   ├── marketplace/                          # Marketplace data layer
│   │   └── factory/                              # Config-driven connector engine
│   │       ├── rest-crm-connector.ts             # Multi-strategy search + CRM deep links + SSRF validation
│   │       ├── dynamic-loader.ts                 # Loads definitions from DB, hot-reload with rollback
│   │       ├── auth-handler.ts                   # OAuth2/API key/Basic + token refresh
│   │       ├── field-mapper.ts                   # Dot-path + {{template}} extraction
│   │       ├── config-schema.ts                  # Zod validation (incl searchStrategies, crmLink)
│   │       └── types.ts                          # SearchStrategyConfig, CrmLinkConfig, etc.
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
├── seed-marketplace.ts                           # Marketplace seed (9 connectors, updates config on re-run)
└── scripts/
    ├── seed.ts                                   # Dev seed (tenants + sample data)
    ├── rotate-key.ts                             # Rotate tenant API key (by slug or ID)
    ├── check-zoho-def.ts                         # Diagnostic: check Zoho definition config
    └── test-zoho-search.ts                       # Diagnostic: test Zoho API directly

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
  1. Contacts: `GET /Contacts/search?word={{phone}}` (priority 0)
  2. Leads: `GET /Leads/search?word={{phone}}` (priority 1)
  3. Accounts: `GET /Accounts/search?word={{phone}}` (priority 2)
- **Field mapping**: per-strategy, `displayName: "{{First_Name}} {{Last_Name}}"`, Email, Phone||Mobile, Company
- **CRM deep link**: `https://crm.zoho.com/crm/tab/{{module}}/{{recordId}}`
- **Call logging**: `POST /Calls` with direction, duration, disposition, contact link
- **Token refresh**: Auto-refresh via `ensureFreshToken()` before each API call
- **OAuth flow**: `GET /api/v1/auth/zoho-crm` (with x-api-key header) → redirects to Zoho → callback stores tokens

### HubSpot (Code-based, Tier 1)
- Full ConnectorInterface implementation in `src/lib/connectors/hubspot/`
- OAuth2, contact search, call engagement write-back, webhook signature verification

## Connector Plugin System

### Two-Tier Architecture
- **Tier 1 (code-based)**: Hand-coded connectors for complex integrations. HubSpot is the exemplar.
- **Tier 2 (config-driven)**: JSON definition stored in DB → `RestCrmConnector` instantiates at runtime.
  - `searchStrategies[]` for multi-module ordered search
  - `crmLink.urlTemplate` for deep links with `{{module}}`, `{{recordId}}` variables
  - `fieldMapping` per strategy (dot-path, `{{template}}`, `field1 || field2` fallback)

### ConnectorDefinition vs ConnectorConfig
- **ConnectorDefinition**: Global blueprint (one per CRM). Defines API URLs, auth config, search strategies.
- **ConnectorConfig**: Per-tenant installation. Stores encrypted OAuth credentials. Links tenant to definition.

### seed-marketplace.ts Behavior
- On fresh install: creates ConnectorDefinition with full config
- On re-run: **updates config + metadata** (fixed: previously skipped config on update)
- Run against Railway: `DATABASE_URL="<public_url>" npx tsx prisma/seed-marketplace.ts`

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
| Outbound calls (click-to-call) | 3PCC API | makePhoneCall | From DialPad, Contacts tab, RecentCalls |
| Answer / Reject | Yes | Yes | call.answer() / call.release() |
| Hangup | Yes | Yes | |
| Mute / Unmute | Yes | Yes | callService.muteCall() |
| Hold / Resume | Yes | Yes | callService.holdCall/retrieveCall() |
| DTMF | CTI bridge | — | Keypad in ActiveCallPanel |
| Call Transfer | CTI bridge | — | Blind transfer only |
| Conference creation | Yes (bubble) | — | createConference() via rooms API |
| Contact search | REST API | — | By name/email/ID via Rainbow users API |
| CRM contact search | — | — | ContactSearch component → POST /api/v1/contacts/search |
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

## CTI Widget Features

The CTI widget (`/cti-widget`) is a full softphone UI with 4 tabs:
- **Dial**: Number input + dial pad → click-to-call via WebRTC
- **Active**: In-call controls (answer, hangup, mute, hold, DTMF keypad, transfer)
- **Contacts**: CRM contact search by name/email/company → click-to-call from results
- **Recent**: Call history with disposition badges → click-to-call redial

Click-to-call flow: Agent clicks phone icon → `webrtc.makeCall(number)` places Rainbow call → `POST /api/v1/cti/call/start` creates CTI tracking event → call appears in Active tab with CRM context enrichment.

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

## Test Suite

- **198+ unit tests** across test files (vitest)
- Includes `src/__tests__/crm/crm-service.test.ts` (8 tests: empty phone, no connectors, local DB fallback, connector from registry, writeCallLog dedup, buildCrmLink)
- Run: `npm test`
