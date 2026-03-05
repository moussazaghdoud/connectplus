# Salesforce CRM

Contact search, activity logging, and deal sync with Salesforce CRM

## Category
crm

## Authentication
oauth2
Scopes: api, refresh_token

## Capabilities
- contact_search
- contact_sync
- activity_logging
- deal_sync
- write_back
- webhook_inbound
- health_check

## Prerequisites
- Salesforce Enterprise Edition or higher
- Connected App configured with OAuth2
- API access enabled for user

## Settings

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| `instanceUrl` | url | Yes | Your Salesforce instance URL (e.g. https://mycompany.my.salesforce.com) |
| `apiVersion` | string | No | Salesforce REST API version |

## Development

```bash
# Run tests
npx vitest run tests/connectors/salesforce-crm.test.ts

# Run diagnostics
curl -X GET /api/v1/admin/marketplace/connectors/salesforce-crm/diagnostics
```

## Notes
Uses Salesforce REST API. Supports both Production and Sandbox orgs.

---
Generated from blueprint: `connectors/blueprints/salesforce-crm.json`
