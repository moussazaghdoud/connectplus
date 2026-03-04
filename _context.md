# ConnectPlus — Project Context

## Overview

ConnectPlus is a **real-time CTI (Computer Telephony Integration) platform** built on Next.js + Rainbow CPaaS. It delivers screen-pop notifications for incoming calls, resolves callers against a contact database, and writes call records back to CRM systems (HubSpot exemplar, 19 more planned). Supports two modes: **S2S (notification-only)** and **WebRTC (full browser softphone)**.

**Production:** https://connectplus-production-0fbf.up.railway.app
**Agent UI:** https://connectplus-production-0fbf.up.railway.app/agent
**GitHub:** https://github.com/moussazaghdoud/connectplus

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20, Next.js 16.1.6 (standalone output) |
| Language | TypeScript 5, React 19.2.3 |
| Database | PostgreSQL via Prisma 7.4.2 (pg adapter) |
| Telephony (S2S) | Rainbow Node SDK v2.42.0-lts.1 (server-side worker) |
| Telephony (WebRTC) | Rainbow Web SDK v5.0.43-sts (CDN, browser-side) |
| Styling | Tailwind CSS 4 |
| Validation | Zod 4.3.6 |
| Logging | Pino 10.3.1 (pino-pretty in dev) |
| Deployment | Docker multi-stage → Railway |

## Architecture

```
Browser (Agent UI)
  │
  ├─ SSE stream (/api/v1/events/stream)  ← screen.pop, call.updated, call.ended
  │
  ├─ Mode: "Notification Only" (S2S)
  │   └─ REST calls (/api/v1/rainbow/connect) → starts per-user S2S worker
  │                                              (credentials in memory only)
  │
  └─ Mode: "WebRTC (Browser Audio)"
      ├─ REST /api/v1/rainbow/connect?mode=webrtc → returns appId/secret/host
      ├─ Rainbow Web SDK loaded from CDN (dynamic import at runtime)
      ├─ SDK login → XMPP connection → telephonyService detects calls
      ├─ Call control: answer, reject, mute, hold, hangup in browser
      ├─ Reports call events → POST /api/v1/calls/event → interaction tracking
      └─ Audio via WebRTC peer connection through browser <audio> element

Server
  │
  ├─ Rainbow SDK (S2S) ──→ registers webhook callback URL with Rainbow
  │     │
  │     └─ rainbow_oncallupdated ──→ eventBus.emit("rainbow.callback")
  │
  ├─ Rainbow Webhooks (/api/v1/rainbow/webhooks) ──→ eventBus.emit("rainbow.callback")
  │
  ├─ WebRTC Call Events (/api/v1/calls/event) ← browser reports state changes
  │     ├─ ringing_incoming → resolve contact, create interaction, SSE screen.pop
  │     ├─ active → update interaction, SSE call.updated
  │     └─ ended → complete interaction, SSE call.ended
  │
  ├─ InboundCallHandler (listens on eventBus)
  │     ├─ resolves caller from DB (fuzzy phone match)
  │     ├─ broadcasts screen.pop via SSE
  │     └─ creates Interaction record
  │
  └─ Connector write-back (on interaction.completed)
        └─ HubSpot: creates Call engagement
```

## Directory Structure

```
src/
├── app/
│   ├── agent/page.tsx                          # Agent screen-pop UI
│   ├── api/v1/
│   │   ├── interactions/route.ts               # CRUD interactions
│   │   ├── interactions/[id]/route.ts          # Single interaction
│   │   ├── contacts/search/route.ts            # Contact search
│   │   ├── events/stream/route.ts              # SSE endpoint
│   │   ├── calls/event/route.ts                # WebRTC call event receiver
│   │   ├── rainbow/
│   │   │   ├── connect/route.ts                # Start/stop/status (S2S + WebRTC modes)
│   │   │   └── webhooks/route.ts               # S2S callback receiver
│   │   ├── webhooks/[connector]/route.ts       # Connector webhooks
│   │   ├── auth/hubspot/route.ts               # OAuth start
│   │   ├── auth/hubspot/callback/route.ts      # OAuth callback
│   │   ├── admin/tenants/route.ts              # Tenant management
│   │   ├── admin/connectors/route.ts           # Connector config
│   │   └── health/route.ts                     # Health check
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
│
├── components/
│   └── screen-pop/
│       ├── ScreenPopProvider.tsx                # Main agent UI (SSE + Rainbow + WebRTC)
│       ├── CallNotification.tsx                 # Call notification bubble (+ WebRTC buttons)
│       └── SoftphoneControls.tsx                # WebRTC call controls (mute/hold/hangup/quality)
│
├── hooks/
│   ├── useRainbowWebSDK.ts                     # WebRTC hook (SDK init, login, call control)
│   └── __tests__/
│       └── useRainbowWebSDK.test.ts            # 18 unit tests
│
├── types/
│   └── rainbow-web-sdk.d.ts                    # TypeScript declarations for SDK v5
│
├── lib/
│   ├── core/
│   │   ├── connector-interface.ts              # Plugin contract (abstract)
│   │   ├── connector-registry.ts               # Connector lifecycle management
│   │   ├── contact-resolver.ts                 # Local + external contact lookup
│   │   ├── contact-resolver-utils.ts           # Shared: resolveCallerByPhone, buildCrmUrl
│   │   ├── interaction-manager.ts              # Call/meeting lifecycle orchestrator
│   │   ├── event-bus.ts                        # Typed EventEmitter (globalThis singleton)
│   │   ├── inbound-call-handler.ts             # Rainbow callback → screen pop
│   │   ├── tenant-context.ts                   # AsyncLocalStorage tenant isolation
│   │   ├── errors.ts                           # Error hierarchy
│   │   └── models/
│   │       ├── contact.ts                      # Contact types + Zod schemas
│   │       ├── interaction.ts                  # Interaction enums + types
│   │       └── tenant.ts                       # Tenant types + Zod schemas
│   │
│   ├── rainbow/
│   │   ├── client.ts                           # REST wrapper (JWT auth, token refresh)
│   │   ├── calls.ts                            # Audio/video/PSTN call operations
│   │   ├── contacts.ts                         # Rainbow contact search
│   │   ├── s2s-connector.ts                    # Per-user S2S connection manager
│   │   ├── types.ts                            # Rainbow API types
│   │   └── index.ts                            # Factory + re-exports
│   │
│   ├── sse/
│   │   ├── connection-manager.ts               # Per-tenant SSE fan-out + replay
│   │   ├── types.ts                            # SSE event types
│   │   └── index.ts
│   │
│   ├── connectors/
│   │   ├── index.ts                            # Registry init + write-back listeners
│   │   └── hubspot/                            # Exemplar connector
│   │       ├── index.ts                        # ConnectorInterface impl
│   │       ├── auth.ts                         # OAuth2 (authUrl, exchangeCode, refresh)
│   │       ├── mapper.ts                       # HubSpot → canonical contact mapping
│   │       ├── webhooks.ts                     # Signature verification + parsing
│   │       ├── actions.ts                      # Write call engagement to HubSpot
│   │       └── types.ts                        # HubSpot-specific types
│   │
│   ├── middleware/
│   │   ├── api-handler.ts                      # Universal route wrapper
│   │   ├── auth.ts                             # API key authentication
│   │   ├── rate-limiter.ts                     # Token bucket (100 req/tenant)
│   │   ├── error-handler.ts                    # Standardized error responses
│   │   └── correlation-id.ts                   # Request tracing
│   │
│   ├── observability/
│   │   ├── logger.ts                           # Pino logger
│   │   ├── metrics.ts                          # In-memory counters
│   │   └── audit-log.ts                        # Immutable audit trail
│   │
│   ├── utils/
│   │   ├── crypto.ts                           # AES-256-GCM encrypt/decrypt
│   │   ├── http.ts                             # fetchWithRetry
│   │   ├── phone.ts                            # normalizePhone, phoneMatch
│   │   ├── idempotency.ts                      # Request deduplication
│   │   └── secrets.ts                          # SecretsManager (encrypt creds)
│   │
│   ├── queue/
│   │   ├── dlq.ts                              # Dead letter queue
│   │   └── retry.ts                            # Exponential backoff helper
│   │
│   └── db.ts                                   # Prisma client + tenant isolation
│
├── middleware.ts                                # Rainbow sub-path rewriting
└── instrumentation.ts                          # Server startup hook

prisma/
├── schema.prisma                               # DB schema (7 models)
└── migrations/                                 # SQL migrations

scripts/
├── rainbow-s2s-worker.js                       # Standalone S2S worker (child process)
└── copy-rainbow-web-sdk.js                     # Postinstall: copy SDK UMD (fallback stub)

Dockerfile                                      # Multi-stage build
start.sh                                        # Startup script (migrate + server)
railway.json                                    # Railway deployment config
```

## Database Schema

| Model | Purpose |
|-------|---------|
| **Tenant** | Multi-tenant with encrypted Rainbow creds, hashed API key |
| **ConnectorConfig** | Per-tenant connector settings (encrypted credentials) |
| **Contact** | Canonical contact cache (name, email, phone, company) |
| **ExternalLink** | Maps Contact ↔ external system IDs (HubSpot, etc.) |
| **Interaction** | Call/meeting records with full lifecycle status |
| **AuditLog** | Immutable audit trail (actor, action, resource) |
| **DeadLetterQueue** | Failed webhook/writeback retry queue |
| **IdempotencyRecord** | Request deduplication (24h TTL) |

### Interaction Lifecycle

```
PENDING → INITIATING → RINGING → ACTIVE → COMPLETED
                                        → FAILED
                                        → CANCELLED
```

## Event Bus Events

| Event | Emitted by | Consumed by |
|-------|-----------|-------------|
| `rainbow.callback` | Webhook route / S2S connector | InboundCallHandler |
| `screen.pop` | InboundCallHandler | SSE manager → browser |
| `call.status_changed` | InboundCallHandler | SSE manager → browser |
| `interaction.created` | InteractionManager | Connectors (write-back) |
| `interaction.completed` | InteractionManager | Connectors (write-back) |
| `interaction.failed` | InteractionManager | Connectors (write-back) |
| `connector.webhook` | Webhook route | Connector handlers |

## SSE Event Types

| Event | Data | When |
|-------|------|------|
| `connected` | connectionId, tenantId | SSE stream opens |
| `screen.pop` | interactionId, callerNumber, contact | Incoming call detected |
| `call.updated` | interactionId, status | Call state change (RINGING→ACTIVE) |
| `call.ended` | interactionId, durationSecs | Call completed |
| `heartbeat` | timestamp | Every 30s |

## Security

- **API auth**: SHA-256 hashed API keys (`cp_` prefix + 256-bit random)
- **Secrets at rest**: AES-256-GCM encryption (ENCRYPTION_KEY env var)
- **Tenant isolation**: Prisma `$extends` auto-injects tenantId on all queries
- **Rate limiting**: Token bucket, 100 req/tenant/window
- **Webhook verification**: Connector-specific signature verification (HubSpot v3)
- **Rainbow credentials**: User-provided, in-memory only — never persisted
- **Idempotency**: Deduplication via Idempotency-Key header (24h TTL)

## Rainbow WebRTC Mode (Browser Softphone)

### SDK Loading
- Rainbow Web SDK v5.0.43-sts loaded from jsDelivr CDN at runtime via `Function('return import(...)')()`
- Hidden from Turbopack static analysis to avoid bundling the 6MB browser-only SDK
- Not installed as npm dependency (native `canvas` dep breaks Alpine Docker)

### SDK v5 API (key findings from official Rainbow-CPaaS/Rainbow-Web-SDK-Samples-v2)
- **Config properties**: `server` (hostname only, SDK prepends https://), `applicationId`, `secretKey`
- **Host mapping**: "official" → "openrainbow.com", "sandbox" → "sandbox.openrainbow.com"
- **Login**: `sdk.connectionService.logon(email, password, false)` (not `signin`)
- **Plugins**: `CallsPlugin` passed as class ref in config `plugins` array (required for call functionality)
- **Call detection**: Subscribe to `conversationService` for `ON_NEW_CALL_IN_CONVERSATION` — the conversation's `.call` property is a `Call` object with proper internal state
- **Call control**: `call.answer()`, `call.release()`, `call.mute()`, `call.hold()`, `call.retrieve()` — all on the conversation's call object directly
- **Capabilities**: Check `call.capabilities.answer`, `call.capabilities.release` etc. before showing buttons
- **Call events**: Subscribe to individual `call.subscribe()` for `ON_CALL_STATUS_CHANGE`, `ON_CALL_CAPABILITIES_UPDATED`, `ON_CALL_MEDIA_UPDATED`
- **Call removal**: `ON_REMOVE_CALL_IN_CONVERSATION` event when call ends
- **Call statuses**: `RINGING_INCOMMING` (double M — SDK typo), `ACTIVE`, `HOLD`, `ENDED`, `ANSWERING`, `CONNECTING`
- **Status enum objects**: Status is `{key: number, value: string}` — extract `.value` for string comparison
- **Telephony mode**: SipWise (auto-detected), WebRTC device type, media pillar for call routing

### CRITICAL: getActiveCall() vs conversation.call
- `callService.getActiveCall()` returns a telephony wrapper with status `incommingCall` — **CANNOT be answered** (callService.answerCall rejects with "call cannot be answerred")
- `conversation.call` from `ON_NEW_CALL_IN_CONVERSATION` event has status `RINGING_INCOMMING` — **CAN be answered** with `call.answer()`
- Always use the conversation event pattern, never getActiveCall() for call control

### WebRTC Flow
1. Agent selects "WebRTC (Browser Audio)" mode in UI
2. `POST /api/v1/rainbow/connect?mode=webrtc` → stops S2S worker, returns app creds
3. `useRainbowWebSDK` hook: CDN import → `RainbowSDK.create(config)` → `start()` → `logon()`
4. Microphone permission requested before login
5. Subscribe to `conversationService` for `ON_NEW_CALL_IN_CONVERSATION` + `ON_REMOVE_CALL_IN_CONVERSATION`
6. Incoming call → get `Call` from `event.data.conversation.call`
7. Subscribe to individual call events via `call.subscribe()`
8. Status mapping: extract `.value` from enum object, case-insensitive fuzzy matching
9. Call state machine: idle → ringing_incoming → active → on_hold → ended
10. Answer: `call.answer()` / Reject: `call.release()` — on the conversation's call object
11. Browser reports events to `/api/v1/calls/event` for interaction tracking
12. SoftphoneControls renders: answer/reject, mute/hold/hangup, timer, quality bars
13. `ON_REMOVE_CALL_IN_CONVERSATION` → set "ended" → auto-clear after 4s

### Call Quality Monitoring
- Polls `RTCPeerConnection.getStats()` every 3s during active calls
- Displays: quality bars (good/fair/poor), RTT ms, packet loss %, codec
- Thresholds: RTT >300ms=poor, >150ms=fair; loss >5%=poor, >1%=fair

## S2S Mode (Notification Only)

1. Agent opens `/agent` → enters API key → SSE stream connects
2. Rainbow credentials form appears → enters login + password
3. `POST /api/v1/rainbow/connect` → server spawns S2S worker (child process)
4. Worker authenticates with Rainbow, registers webhook callback URL
5. Incoming call → Rainbow POSTs to webhook → `rainbow.callback` event
6. InboundCallHandler resolves caller → broadcasts `screen.pop` via SSE
7. Agent disconnects → worker killed, credentials wiped from memory

## Connector Plugin System

### Two-Tier Architecture
- **Tier 1 (code-based)**: Hand-coded connectors for complex integrations. HubSpot is the exemplar (6 files).
- **Tier 2 (config-driven)**: JSON definition stored in DB → `RestCrmConnector` instantiates at runtime → registered in `ConnectorRegistry` transparently. No code needed.

### ConnectorInterface Contract
- `initialize()` — one-time setup
- `getAuthUrl()` / `exchangeToken()` — OAuth2 flow
- `searchContacts()` — external contact search
- `mapContact()` — normalize to canonical format
- `verifyWebhook()` / `parseWebhook()` — inbound webhook handling
- `writeBack()` — push interaction data to external system
- `healthCheck()` — connectivity test

### Connector Factory (config-driven)

**DB Models**: `ConnectorDefinition` (slug, name, config JSON, status, version) + `ConnectorDefinitionVersion` (rollback snapshots)

**Config Schema** (`ConnectorDefinitionConfig`):
```
apiBaseUrl, auth (oauth2/api_key/basic), contactSearch (endpoint, request, response, fieldMapping),
writeBack? (endpoint, bodyTemplate, associateContact), webhook? (signatureMethod, eventTypeMapping),
healthCheck? (endpoint, expectedStatus)
```

**Backend modules** (`src/lib/connectors/factory/`):
- `RestCrmConnector` — config-driven ConnectorInterface implementation
- `DynamicLoader` — loads ACTIVE definitions from DB at startup, hot-reload on activate
- `FieldMapper` — dot-path + `{{template}}` string extraction
- `AuthHandler` — OAuth2 / API key / Basic auth header builder
- `WebhookVerifier` — HMAC-SHA256/SHA1 / static token verification
- `UrlValidator` — SSRF prevention (blocks private IPs, enforces HTTPS)
- `ConfigSchema` — Zod validation

**Admin API** (`/api/v1/admin/connector-definitions/`):
- `GET/POST /` — list + create definitions
- `GET/PUT/DELETE /:slug` — CRUD single definition
- `POST /:slug/activate` — validate config + hot-reload into registry
- `POST /:slug/test` — run 16-test suite
- `GET/POST /:slug/versions` — list versions + rollback

**Testing Framework** (`src/lib/connectors/testing/`):
- `ConnectorTestRunner` — 16 tests across 5 categories (auth, contact_search, write_back, webhook, health_check)
- CLI: `npx tsx scripts/test-connector.ts <slug>`
- Wizard Step 6 runs tests via API and shows pass/fail table

**Wizard UI** (`/admin/connectors/wizard`):
- 6-step wizard: Basic Info → Auth → Contact Search → Write-Back → Webhooks → Test & Activate
- Auto-saves drafts to DB on step navigation
- Edit existing via `?edit=slug`
- Connector list at `/admin/connectors`

### Click-to-Call
- `webrtc.makeCall(phoneNumber)` — initiates outbound Rainbow call via `callService.makePhoneCall()`
- All config-driven connectors include `click_to_call` capability by default
- Agent searches contacts → clicks phone number → call initiated

### Audit vs Rainbow CRM Bridge (Salesforce)
Our factory covers ~60% of the official Rainbow CRM Bridge functionality:
- **Covered**: Contact search, call log write-back, OAuth2, health check, webhook verification, click-to-call
- **Not covered**: Open CTI embedding (CRM-specific UI), multi-object search (single endpoint), unknown contact creation, bot user commands, SSO

**Implemented:** HubSpot (Tier 1, code-based)
**Planned:** Salesforce, Dynamics 365, Zendesk, ServiceNow, Freshdesk, Zoho, Pipedrive, SugarCRM, Monday, Jira Service Management, Slack, Teams, Google Contacts, LDAP/AD, SAP, Oracle, Vtiger, Odoo, Insightly

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ENCRYPTION_KEY` | Yes | 64-char hex for AES-256-GCM |
| `RAINBOW_APP_ID` | Yes | Rainbow application ID (for S2S + WebRTC) |
| `RAINBOW_APP_SECRET` | Yes | Rainbow application secret key |
| `RAINBOW_HOST` | No | Rainbow host ("official" default) |
| `RAINBOW_HOST_CALLBACK` | Yes | Public webhook URL for Rainbow S2S callbacks |
| `DEFAULT_TENANT_ID` | No | Default tenant for single-tenant setups |
| `NODE_ENV` | No | `development` or `production` |
| `PORT` | No | Server port (default 3000) |

## Deployment

- **Docker**: Multi-stage (deps → builder → runner), node:20-alpine, non-root user
- **Railway**: Dockerfile builder, `sh start.sh`, health check at `/api/v1/health`
- **Startup**: `prisma migrate deploy` → `node server.js`
- **Push**: `git push origin master` (Railway deploys from `master` branch)
- **Postinstall**: Graceful try/catch wrapper for scripts/ not available during Docker npm ci

## Key Patterns

- **globalThis singletons** — EventBus, SSE manager, S2S manager survive Next.js HMR
- **AsyncLocalStorage** — Tenant context propagation (automatic tenant isolation)
- **Fire-and-forget** — Audit logs, write-backs don't block the response
- **Noop Express shim** — Rainbow SDK expects Express; we intercept with a stub
- **Dynamic require** — `rainbow-node-sdk` is CommonJS, loaded via `require()` to avoid bundling issues
- **CDN runtime import** — Rainbow Web SDK loaded from jsDelivr CDN via `Function()` to hide from Turbopack
- **Shared utilities** — `contact-resolver-utils.ts` used by both S2S handler and WebRTC event endpoint

## Test Suite

- **138 unit tests** across 12 test files (vitest)
- Factory tests: url-validator (11), field-mapper (16), webhook-verifier (8), connector-test-runner (9)
- Integration tests in `src/__tests__/integration/` (gated by `INTEGRATION=1` env var)
- Connector tests: `npx tsx scripts/test-connector.ts <slug>` (16 tests per connector)
- Run: `npm test` (unit), `INTEGRATION=1 TEST_API_KEY=... npx vitest run src/__tests__/integration/` (integration)
