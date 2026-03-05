# Connector Onboarding Guide

> How to onboard a new CRM in 30 minutes using the ConnectPlus Connector Factory.

## Architecture Overview

```
                    CrmService (single entry point)
                         |
                    ConnectorRegistry
                    /        |        \
              Tier 2      Tier 1      Tier 2
           (config DB)   (code)    (config DB)
              Zoho      HubSpot    Salesforce
```

**Tier 2 (Config-Driven)** — Default. Define a JSON config in the DB, the factory does the rest.
**Tier 1 (Code-Based)** — Only when Tier 2 can't meet a requirement (weird auth, non-REST, complex pagination).

Both tiers register in the same `ConnectorRegistry` and are called through `CrmService`.

## Tier 2: Config-Driven Onboarding (Default Path)

### Step 1: Create a ConnectorDefinition

Add a row to `prisma/seed-marketplace.ts` or use the admin API:

```typescript
{
  slug: "your-crm",           // URL-safe ID, becomes connectorId
  name: "Your CRM",
  status: "ACTIVE",
  tier: "CONFIG_DRIVEN",
  config: { /* ConnectorDefinitionConfig */ }
}
```

### Step 2: Define the Config

The `ConnectorDefinitionConfig` JSON blob controls all behavior:

```typescript
{
  apiBaseUrl: "https://api.your-crm.com/v2",
  auth: { /* authentication config */ },
  contactSearch: { /* single-endpoint search (legacy) */ },
  searchStrategies: [ /* multi-module search (recommended) */ ],
  contactFieldMapping: { /* canonical field mapping */ },
  crmLink: { /* deep link URL template */ },
  writeBack: { /* call logging config (optional) */ },
  healthCheck: { /* health check endpoint */ },
}
```

### Step 3: Authentication

Supported auth types: `oauth2`, `api_key`, `basic`.

**OAuth2 example (Zoho):**
```json
{
  "type": "oauth2",
  "oauth2": {
    "authorizeUrl": "https://accounts.zoho.eu/oauth/v2/auth",
    "tokenUrl": "https://accounts.zoho.eu/oauth/v2/token",
    "scopes": ["ZohoCRM.modules.contacts.READ"],
    "tokenPlacement": "header",
    "tokenPrefix": "Zoho-oauthtoken",
    "extraAuthParams": { "access_type": "offline" }
  }
}
```

**API Key example (Zendesk):**
```json
{
  "type": "api_key",
  "apiKey": { "headerName": "Authorization", "prefix": "Basic" }
}
```

### Step 4: Search Strategies (Multi-Module)

Use `searchStrategies` when the CRM has multiple object types to search (e.g., Contacts, Leads, Accounts). Strategies are tried in priority order; first match wins.

```json
{
  "searchStrategies": [
    {
      "label": "Contacts",
      "priority": 0,
      "endpoint": "/Contacts/search",
      "method": "GET",
      "request": { "queryParams": { "word": "{{phone}}" } },
      "response": { "resultsPath": "data", "idField": "id" },
      "crmModule": "Contacts",
      "fieldMapping": {
        "displayName": "{{First_Name}} {{Last_Name}}",
        "email": "Email",
        "phone": "Phone || Mobile",
        "company": "Company"
      }
    },
    {
      "label": "Leads",
      "priority": 1,
      "endpoint": "/Leads/search",
      "method": "GET",
      "request": { "queryParams": { "word": "{{phone}}" } },
      "response": { "resultsPath": "data", "idField": "id" },
      "crmModule": "Leads",
      "fieldMapping": {
        "displayName": "{{First_Name}} {{Last_Name}}",
        "email": "Email",
        "phone": "Phone || Mobile"
      }
    }
  ]
}
```

**Field mapping expressions:**
- Dot-path: `"Email"` or `"Account_Name.name"`
- Template: `"{{First_Name}} {{Last_Name}}"`
- Fallback: `"Phone || Mobile"`

### Step 5: CRM Deep Links

```json
{
  "crmLink": {
    "urlTemplate": "https://crm.zoho.eu/crm/tab/{{module}}/{{recordId}}"
  }
}
```

Available variables: `{{recordId}}`, `{{module}}`, `{{orgId}}`, `{{instanceUrl}}`, `{{subdomain}}`

### Step 6: Write-Back (Call Logging)

```json
{
  "writeBack": {
    "endpoint": "/Calls",
    "method": "POST",
    "bodyTemplate": "{\"data\":[{\"Subject\":\"Call via Rainbow\",\"Call_Duration\":\"{{interaction.durationSecs}}\"}]}"
  }
}
```

### Step 7: Health Check

```json
{
  "healthCheck": {
    "endpoint": "/settings/modules",
    "method": "GET",
    "expectedStatus": 200
  }
}
```

### Step 8: Seed and Activate

```bash
npx tsx prisma/seed-marketplace.ts
```

The `DynamicConnectorLoader` loads all `ACTIVE` ConnectorDefinitions at startup.

## Tier 1: Code-Based Escalation

Only use when Tier 2 cannot handle:
- Non-REST protocols (SOAP, GraphQL with complex pagination)
- Multi-step auth flows (e.g., Salesforce JWT Bearer)
- Complex response transformations requiring code

**Requirements:**
1. Implement `ConnectorInterface` from `src/lib/core/connector-interface.ts`
2. Register in `src/lib/connectors/index.ts`
3. Never bypass CrmService — all call flows use `crmService.resolveCallerByPhone()`

See `src/lib/connectors/hubspot/index.ts` as the reference implementation.

## Capability Contract

| Capability | Required | Description |
|-----------|----------|-------------|
| `contact_search` | Yes | Search contacts by phone/email/name |
| `interaction_writeback` | No | Log completed calls to CRM |
| `click_to_call` | No | Support click-to-call from CRM |
| `contact_sync` | No | Bidirectional contact sync |

## Security Checklist

- [ ] All API URLs validated via `url-validator.ts` (SSRF protection)
- [ ] Credentials encrypted with AES-256-GCM in DB (`encryptJson`)
- [ ] OAuth tokens refreshed automatically (`ensureFreshToken`)
- [ ] No secrets in logs (use structured logging with `logger`)
- [ ] Webhook signatures verified (if applicable)
- [ ] Rate-limit aware retries (bounded, exponential backoff)

## Testing Checklist

- [ ] Config schema validates with Zod (`connectorDefinitionConfigSchema`)
- [ ] Field mapping produces correct `CanonicalContact`
- [ ] Search returns results for known phone numbers
- [ ] Multi-strategy fallback works (first strategy empty, second matches)
- [ ] Write-back payload is well-formed
- [ ] Health check returns expected status
- [ ] CRM deep link builds correctly
- [ ] Idempotency: duplicate call events don't create duplicate CRM logs

## Sample: Onboarding Pipedrive in 30 Minutes

1. Read [Pipedrive API docs](https://developers.pipedrive.com/docs/api/v1)
2. Identify: search endpoint = `GET /persons/search?term=...`, response at `data.items`, ID at `item.id`
3. Add config to `seed-marketplace.ts` (see existing Pipedrive entry)
4. Set status to `ACTIVE`
5. Run `npx tsx prisma/seed-marketplace.ts`
6. Create a `ConnectorConfig` for your tenant with Pipedrive OAuth credentials
7. Test: make an inbound call — CrmService will resolve the caller via Pipedrive
