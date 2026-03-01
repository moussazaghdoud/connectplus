# Connector Template

## Quick Start

1. Copy this folder:
   ```bash
   cp -r src/lib/connectors/_template src/lib/connectors/your-connector
   ```

2. Update `index.ts`:
   - Set the `manifest` fields (id, name, version, authType, capabilities)
   - Implement each method

3. Register in `src/lib/connectors/index.ts`:
   ```typescript
   import { YourConnector } from "./your-connector";
   connectorRegistry.register(new YourConnector());
   ```

4. Restart the app — connector is now available.

## Interface Methods

| Method | Required | Description |
|--------|----------|-------------|
| `initialize` | Yes | Set up API client with tenant credentials |
| `searchContacts` | Yes | Search contacts in external system |
| `mapContact` | Yes | Map external contact → canonical Contact |
| `verifyWebhook` | If webhooks | Verify inbound webhook signature |
| `parseWebhook` | If webhooks | Parse webhook → ConnectorEvent |
| `getAuthUrl` | If OAuth | Generate OAuth authorization URL |
| `exchangeToken` | If OAuth | Exchange OAuth code for tokens |
| `writeBack` | Optional | Write call result back to external system |
| `healthCheck` | Yes | Ping external system API |
