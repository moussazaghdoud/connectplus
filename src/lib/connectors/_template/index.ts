/**
 * CONNECTOR TEMPLATE
 * ==================
 * Copy this folder to create a new connector:
 *
 *   cp -r src/lib/connectors/_template src/lib/connectors/your-connector
 *
 * Then:
 * 1. Update the manifest (id, name, version, authType, capabilities)
 * 2. Implement each method
 * 3. Register in src/lib/connectors/index.ts
 * 4. Restart the app
 *
 * NO core framework changes required.
 */

import type {
  ConnectorInterface,
  ConnectorManifest,
  ConnectorEvent,
  HealthStatus,
  TenantConnectorConfig,
  TokenPair,
} from "@/lib/core/connector-interface";
import type {
  CanonicalContact,
  ContactSearchQuery,
  ExternalContact,
} from "@/lib/core/models/contact";
import type { Interaction } from "@/prisma-types";

export class TemplateConnector implements ConnectorInterface {
  readonly manifest: ConnectorManifest = {
    id: "_template",
    name: "Template Connector",
    version: "0.1.0",
    authType: "api_key",
    webhookSupported: false,
    capabilities: ["contact_search"],
  };

  private config: TenantConnectorConfig | null = null;

  async initialize(config: TenantConnectorConfig): Promise<void> {
    this.config = config;
    // TODO: Validate credentials, set up API client
  }

  // ── OAuth (implement if authType is 'oauth2') ──────────

  getAuthUrl?(tenantId: string, redirectUri: string): string {
    // TODO: Build OAuth authorization URL
    throw new Error("Not implemented");
  }

  async exchangeToken?(tenantId: string, code: string): Promise<TokenPair> {
    // TODO: Exchange auth code for tokens
    throw new Error("Not implemented");
  }

  // ── Contact Operations ─────────────────────────────────

  async searchContacts(query: ContactSearchQuery): Promise<ExternalContact[]> {
    // TODO: Search contacts in the external system
    return [];
  }

  mapContact(externalContact: ExternalContact): CanonicalContact {
    // TODO: Map external contact fields to canonical model
    const raw = externalContact.raw as Record<string, string>;
    return {
      displayName: raw.name ?? "Unknown",
      email: raw.email,
      phone: raw.phone,
      externalId: externalContact.externalId,
      source: this.manifest.id,
    };
  }

  // ── Webhook Operations ─────────────────────────────────

  verifyWebhook(
    headers: Record<string, string>,
    body: string | Buffer
  ): boolean {
    // TODO: Verify HMAC signature from the external system
    return false;
  }

  parseWebhook(
    headers: Record<string, string>,
    body: unknown
  ): ConnectorEvent {
    // TODO: Parse webhook payload into canonical event
    throw new Error("Not implemented");
  }

  // ── Write-back ─────────────────────────────────────────

  async writeBack?(
    interaction: Interaction,
    config: TenantConnectorConfig
  ): Promise<void> {
    // TODO: Write call result back to external system
    // e.g., create a call activity/note in the CRM
  }

  // ── Health Check ───────────────────────────────────────

  async healthCheck(config: TenantConnectorConfig): Promise<HealthStatus> {
    // TODO: Ping the external system API
    return {
      healthy: true,
      latencyMs: 0,
      message: "Not implemented",
    };
  }
}
