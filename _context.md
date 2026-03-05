# ConnectPlus — Project Context

## Overview

ConnectPlus is a **real-time CTI (Computer Telephony Integration) platform** built on Next.js + Rainbow CPaaS. It delivers screen-pop notifications for incoming calls, resolves callers against a contact database and live CRM connectors (Zoho, HubSpot), and writes call records back to CRM systems. Supports two modes: **S2S (notification-only)** and **WebRTC (full browser softphone)**. Includes **agent login (email+password)** and an **embeddable widget** at `/widget` for CRM iframe integration.

**Production:** https://connectplus-production-0fbf.up.railway.app
**Widget:** https://connectplus-production-0fbf.up.railway.app/widget
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
Browser (Widget / Agent UI)
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
  │     ├─ resolves caller from local DB (fuzzy phone match)
  │     ├─ resolves caller from CRM connectors (Zoho, HubSpot — live phone lookup)
  │     ├─ caches resolved contacts in local DB for faster future lookups
  │     ├─ broadcasts screen.pop via SSE (with contact name, company, CRM link)
  │     └─ creates Interaction record
  │
  └─ Connector write-back (on interaction.completed)
        ├─ HubSpot: creates Call engagement
        └─ Zoho: creates Call record via /Calls API
```

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
│   ├── agent/page.tsx                            # Legacy agent UI (API key auth)
│   ├── admin/connectors/                         # Connector wizard UI
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
│   │   ├── events/stream/route.ts                # SSE endpoint
│   │   ├── calls/event/route.ts                  # WebRTC call event receiver
│   │   ├── rainbow/
│   │   │   ├── connect/route.ts                  # Start/stop/status (S2S + WebRTC)
│   │   │   └── webhooks/route.ts                 # S2S callback receiver
│   │   ├── webhooks/[connector]/route.ts         # Connector webhooks
│   │   ├── admin/
│   │   │   ├── tenants/route.ts                  # Tenant management
│   │   │   ├── connectors/route.ts               # Connector config (GET/POST)
│   │   │   ├── connectors/debug/route.ts         # Diagnostic: registry + token status
│   │   │   ├── connectors/test-search/route.ts   # Debug: raw CRM API test
│   │   │   ├── connector-definitions/route.ts    # CRUD definitions
│   │   │   ├── connector-definitions/[slug]/     # Single definition + test + versions
│   │   │   └── users/route.ts                    # User management (ADMIN only)
│   │   └── health/route.ts                       # Health check
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
│
├── components/
│   └── screen-pop/
│       ├── ScreenPopProvider.tsx                  # Legacy agent UI (SSE + Rainbow + WebRTC)
│       ├── CallNotification.tsx                   # Call notification bubble
│       └── SoftphoneControls.tsx                  # WebRTC call controls (mute/hold/hangup)
│
├── hooks/
│   ├── useRainbowWebSDK.ts                       # WebRTC hook (SDK init, login, call control)
│   └── __tests__/
│       └── useRainbowWebSDK.test.ts              # 18 unit tests
│
├── types/
│   └── rainbow-web-sdk.d.ts                      # TypeScript declarations for SDK v5
│
├── lib/
│   ├── auth/
│   │   └── session.ts                            # Session create/validate/destroy (httpOnly cookie)
│   │
│   ├── core/
│   │   ├── connector-interface.ts                # Plugin contract (abstract)
│   │   ├── connector-registry.ts                 # Connector lifecycle (globalThis singleton)
│   │   ├── contact-resolver.ts                   # Local + external contact lookup
│   │   ├── contact-resolver-utils.ts             # Shared: resolveCallerByPhone, buildCrmUrl
│   │   ├── interaction-manager.ts                # Call/meeting lifecycle orchestrator
│   │   ├── event-bus.ts                          # Typed EventEmitter (globalThis singleton)
│   │   ├── inbound-call-handler.ts               # Rainbow callback → contact resolve → screen pop
│   │   ├── tenant-context.ts                     # AsyncLocalStorage tenant isolation
│   │   ├── errors.ts                             # Error hierarchy
│   │   └── models/
│   │       ├── contact.ts                        # Contact types + Zod schemas
│   │       ├── interaction.ts                    # Interaction enums + types
│   │       └── tenant.ts                         # Tenant types (+ userId, userRole)
│   │
│   ├── rainbow/
│   │   ├── client.ts                             # REST wrapper (JWT auth, token refresh)
│   │   ├── calls.ts                              # Audio/video/PSTN call operations
│   │   ├── contacts.ts                           # Rainbow contact search
│   │   ├── s2s-connector.ts                      # Per-user S2S connection manager
│   │   ├── types.ts                              # Rainbow API types
│   │   └── index.ts                              # Factory + re-exports
│   │
│   ├── sse/
│   │   ├── connection-manager.ts                 # Per-tenant SSE fan-out + replay
│   │   ├── types.ts                              # SSE event types
│   │   └── index.ts
│   │
│   ├── connectors/
│   │   ├── index.ts                              # Registry init + write-back listeners
│   │   ├── hubspot/                              # Tier 1 connector (code-based)
│   │   │   ├── index.ts                          # ConnectorInterface impl
│   │   │   ├── auth.ts                           # OAuth2 (authUrl, exchangeCode, refresh)
│   │   │   ├── mapper.ts                         # HubSpot → canonical contact mapping
│   │   │   ├── webhooks.ts                       # Signature verification + parsing
│   │   │   ├── actions.ts                        # Write call engagement to HubSpot
│   │   │   └── types.ts                          # HubSpot-specific types
│   │   │
│   │   └── factory/                              # Config-driven connector engine
│   │       ├── rest-crm-connector.ts             # Config-driven ConnectorInterface impl
│   │       ├── dynamic-loader.ts                 # Loads definitions from DB, hot-reload
│   │       ├── auth-handler.ts                   # OAuth2/API key/Basic + token refresh
│   │       ├── field-mapper.ts                   # Dot-path + {{template}} extraction
│   │       ├── webhook-verifier.ts               # HMAC-SHA256/SHA1 / static token
│   │       ├── url-validator.ts                  # SSRF prevention
│   │       ├── config-schema.ts                  # Zod validation
│   │       └── types.ts                          # ConnectorDefinitionConfig types
│   │
│   ├── middleware/
│   │   ├── api-handler.ts                        # Universal route wrapper
│   │   ├── auth.ts                               # API key (header or ?key=) + session cookie fallback
│   │   ├── rate-limiter.ts                       # Token bucket (100 req/tenant)
│   │   ├── error-handler.ts                      # Standardized error responses
│   │   └── correlation-id.ts                     # Request tracing
│   │
│   ├── observability/
│   │   ├── logger.ts                             # Pino logger
│   │   ├── metrics.ts                            # In-memory counters
│   │   └── audit-log.ts                          # Immutable audit trail
│   │
│   ├── utils/
│   │   ├── crypto.ts                             # AES-256-GCM encrypt/decrypt
│   │   ├── http.ts                               # fetchWithRetry
│   │   ├── phone.ts                              # normalizePhone, phoneMatch
│   │   ├── password.ts                           # bcryptjs hash/verify (12 rounds)
│   │   ├── idempotency.ts                        # Request deduplication
│   │   └── secrets.ts                            # SecretsManager (encrypt creds)
│   │
│   ├── queue/
│   │   ├── dlq.ts                                # Dead letter queue
│   │   └── retry.ts                              # Exponential backoff helper
│   │
│   └── db.ts                                     # Prisma client + tenant isolation
│
├── middleware.ts                                  # Route protection (/widget, /agent → /login) + Rainbow sub-path rewriting
└── instrumentation.ts                            # Server startup (Node.js runtime only)

prisma/
├── schema.prisma                                 # DB schema (10 models)
└── migrations/                                   # SQL migrations (0001-0003)

scripts/
├── rainbow-s2s-worker.js                         # Standalone S2S worker (child process)
├── copy-rainbow-web-sdk.js                       # Postinstall: copy SDK UMD (fallback stub)
└── create-user.ts                                # CLI: create user for a tenant
```

## Database Schema

| Model | Purpose |
|-------|---------|
| **Tenant** | Multi-tenant with encrypted Rainbow creds, hashed API key |
| **User** | Agent accounts (email, passwordHash, role ADMIN/AGENT, rainbowLogin/Password) |
| **UserSession** | DB-backed sessions (tokenHash SHA-256, expiresAt, 7-day TTL) |
| **ConnectorConfig** | Per-tenant connector settings (encrypted OAuth tokens + credentials) |
| **ConnectorDefinition** | Config-driven connector JSON (slug, config, status, version) |
| **ConnectorDefinitionVersion** | Rollback snapshots |
| **Contact** | Canonical contact cache (name, email, phone, company) |
| **ExternalLink** | Maps Contact ↔ external system IDs (Zoho, HubSpot, etc.) |
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

## Authentication

### Dual Auth System
- **API key**: `x-api-key` header or `?key=` query param → SHA-256 hashed lookup in Tenant table
- **Session cookie**: `cp_session` httpOnly cookie → SHA-256 hashed token lookup in UserSession table
- Auth middleware tries API key first, falls back to session cookie

### User Login Flow
1. `POST /api/v1/auth/login` — email + password → creates session, sets cookie
2. `GET /api/v1/auth/me` — returns current user or 401
3. `POST /api/v1/auth/logout` — destroys session, clears cookie
4. Route protection via `middleware.ts`: `/widget` and `/agent` redirect to `/login` if no session

### Session Cookie Config
- Name: `cp_session`, httpOnly, 7-day TTL
- `sameSite: "none"` + `secure: true` in production (for iframe embedding)
- Token stored as SHA-256 hash in DB for secure validation

### User Management
- `POST /api/v1/admin/users` — create user (ADMIN only)
- `GET /api/v1/admin/users` — list users for tenant
- CLI: `npx tsx scripts/create-user.ts --tenant-slug demo --email x --password y --role ADMIN`

## Embeddable Widget

### Widget at `/widget`
- Minimal iframe-friendly layout (no nav/footer)
- Session cookie auth (no API key needed)
- SSE connection via `EventSource` (cookie sent automatically)
- Tabbed UI: Active Calls / Call History
- Rainbow connection (compact login form or "Connected" status)
- Two modes: WebRTC (Browser Audio) / Notification Only (S2S)

### Iframe Embedding
- `Content-Security-Policy: frame-ancestors *` on `/widget` routes
- `X-Frame-Options: SAMEORIGIN` on all other routes
- Works in Salesforce Open CTI, HubSpot calling widget, Zoho PhoneBridge, etc.

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
| `screen.pop` | interactionId, callerNumber, contact (name, email, company, crmUrl) | Incoming call detected |
| `call.updated` | interactionId, status, rainbowCallId | Call state change (RINGING→ACTIVE) |
| `call.ended` | interactionId, durationSecs, rainbowCallId | Call completed |
| `heartbeat` | timestamp | Every 30s |

## Active CRM Connectors

### Zoho CRM (Config-driven, Tier 2)
- **Slug**: `zoho-crm`, **Status**: ACTIVE
- **API**: `https://www.zohoapis.eu/crm/v2`
- **Auth**: OAuth2, token prefix `Zoho-oauthtoken`, EU region (`accounts.zoho.eu`)
- **Contact search**: `GET /Contacts/search?word={{query}}` (plural endpoint!)
- **Field mapping**: `displayName: "{{First_Name}} {{Last_Name}}"`, Email, Phone, Company, Title
- **Write-back**: `POST /Calls` with call details
- **Token refresh**: Auto-refresh via `ensureFreshToken()` before each API call
- **OAuth re-auth**: `GET /api/v1/auth/zoho-crm?key=<api_key>` (includes `access_type=offline` for refresh token)

### HubSpot (Code-based, Tier 1)
- Full ConnectorInterface implementation in `src/lib/connectors/hubspot/`
- OAuth2, contact search, call engagement write-back, webhook signature verification

## Security

- **API auth**: SHA-256 hashed API keys (`cp_` prefix + 256-bit random) + session cookies
- **Secrets at rest**: AES-256-GCM encryption (ENCRYPTION_KEY env var)
- **Tenant isolation**: Prisma `$extends` auto-injects tenantId on all queries
- **Rate limiting**: Token bucket, 100 req/tenant/window
- **Webhook verification**: Connector-specific signature verification
- **Rainbow credentials**: User-provided, in-memory only — never persisted
- **Idempotency**: Deduplication via Idempotency-Key header (24h TTL)
- **Password hashing**: bcryptjs with 12 salt rounds

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
- **Call detection**: Subscribe to `conversationService` for `ON_NEW_CALL_IN_CONVERSATION`
- **Call control**: `call.answer()`, `call.release()`, `call.mute()`, `call.hold()`, `call.retrieve()`
- **Call statuses**: `RINGING_INCOMMING` (double M — SDK typo), `ACTIVE`, `HOLD`, `ENDED`

### CRITICAL: getActiveCall() vs conversation.call
- `callService.getActiveCall()` returns a telephony wrapper — **CANNOT be answered**
- `conversation.call` from `ON_NEW_CALL_IN_CONVERSATION` event — **CAN be answered** with `call.answer()`
- Always use the conversation event pattern, never getActiveCall() for call control

## S2S Mode (Notification Only)

1. Agent opens `/widget` → logs in → SSE stream connects
2. Rainbow credentials form appears → enters login + password
3. `POST /api/v1/rainbow/connect` → server spawns S2S worker (child process)
4. Worker authenticates with Rainbow, registers webhook callback URL
5. Incoming call → Rainbow POSTs to webhook → `rainbow.callback` event
6. InboundCallHandler resolves caller (local DB + CRM connectors) → broadcasts `screen.pop` via SSE
7. Agent disconnects → worker killed, credentials wiped from memory

## Connector Plugin System

### Two-Tier Architecture
- **Tier 1 (code-based)**: Hand-coded connectors for complex integrations. HubSpot is the exemplar.
- **Tier 2 (config-driven)**: JSON definition stored in DB → `RestCrmConnector` instantiates at runtime. No code needed. Zoho CRM is the first config-driven connector.

### ConnectorInterface Contract
- `initialize()` — one-time setup with tenant credentials
- `getAuthUrl()` / `exchangeToken()` — OAuth2 flow
- `searchContacts()` — external contact search (with auto token refresh)
- `mapContact()` — normalize to canonical format
- `verifyWebhook()` / `parseWebhook()` — inbound webhook handling
- `writeBack()` — push interaction data to external system
- `healthCheck()` — connectivity test

### Config-Driven Connector Features
- **Auto token refresh**: `ensureFreshToken()` checks expiry before each API call, refreshes and persists to DB
- **OAuth2 extra params**: `extraAuthParams` in config (e.g. `access_type=offline` for Zoho refresh tokens)
- **204 handling**: Gracefully handles empty responses from CRM APIs
- **Dynamic loading**: Connectors loaded from DB at startup, hot-reloadable via activate endpoint

### Admin API
- `GET/POST /api/v1/admin/connector-definitions/` — list + create
- `GET/PUT/DELETE /api/v1/admin/connector-definitions/:slug` — CRUD single definition
- `POST /:slug/activate` — validate config + hot-reload into registry
- `POST /:slug/test` — run 16-test suite
- `GET /api/v1/admin/connectors/debug` — diagnostic: registry state, token status, config check

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
- **Instrumentation**: `register()` in `instrumentation.ts` — only runs in Node.js runtime (`NEXT_RUNTIME === 'nodejs'`), NOT Edge runtime

## Key Patterns

- **globalThis singletons** — ConnectorRegistry, EventBus, SSE manager, InboundCallHandler, S2S manager survive Next.js module re-bundling across contexts
- **NEXT_RUNTIME guard** — instrumentation.ts only runs in Node.js runtime (Edge runtime lacks node:path, crypto, etc.)
- **AsyncLocalStorage** — Tenant context propagation (automatic tenant isolation)
- **Dual auth** — API key (header or query param) + session cookie fallback
- **Fire-and-forget** — Audit logs, write-backs don't block the response
- **Noop Express shim** — Rainbow SDK expects Express; we intercept with a stub
- **Dynamic require** — `rainbow-node-sdk` is CommonJS, loaded via `require()` to avoid bundling issues
- **CDN runtime import** — Rainbow Web SDK loaded from jsDelivr CDN via `Function()` to hide from Turbopack
- **Shared utilities** — `contact-resolver-utils.ts` used by both S2S handler and WebRTC event endpoint
- **Token auto-refresh** — `ensureFreshToken()` in RestCrmConnector checks expiry, refreshes, persists to DB

## Known Issues & Fixes Applied

- **Zoho endpoint**: Must use `/Contacts/search` (plural), not `/Contact/search` (singular). Zoho CRM v2 uses plural module names.
- **Zoho refresh token**: Requires `access_type=offline` + `prompt=consent` in OAuth authorize URL. Without these, Zoho only issues access tokens (1-hour expiry, no refresh).
- **Registry duplication**: Next.js creates separate module instances for instrumentation vs API routes. All singletons must use `globalThis` / `Symbol.for()` pattern.
- **Edge runtime crash**: `instrumentation.ts` runs in both Node.js and Edge runtimes. Edge lacks `node:path`. Fixed with `NEXT_RUNTIME === 'nodejs'` guard.
- **Google Fonts TLS**: Turbopack can't download Google Fonts during build on Railway. Switched to system fonts.

## Test Suite

- **138 unit tests** across 12 test files (vitest)
- Factory tests: url-validator (11), field-mapper (16), webhook-verifier (8), connector-test-runner (9)
- Integration tests in `src/__tests__/integration/` (gated by `INTEGRATION=1` env var)
- Connector tests: `npx tsx scripts/test-connector.ts <slug>` (16 tests per connector)
- Run: `npm test` (unit), `INTEGRATION=1 TEST_API_KEY=... npx vitest run src/__tests__/integration/` (integration)

## Credentials & Config

- **Tenant ID**: `cmm8dpm9w000001qurr9bo1tc`
- **API Key**: `cp_076a14a9007174582628fbd1e3f8b2e25131304cd9f62fdcb8482a26a4c13835`
- **Login user**: `moussa.zaghdoud@gmail.com` / `moussa123` (ADMIN)
- **Zoho OAuth re-auth URL**: `https://connectplus-production-0fbf.up.railway.app/api/v1/auth/zoho-crm?key=<api_key>`
- **Zoho connector slug**: `zoho-crm` (config-driven, ACTIVE, EU region)
