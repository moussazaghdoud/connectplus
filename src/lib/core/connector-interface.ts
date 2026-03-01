import type { CanonicalContact, ContactSearchQuery, ExternalContact } from "./models/contact";
import type { Interaction } from "../../prisma-types";

// ─── Manifest ────────────────────────────────────────────
export type ConnectorAuthType = "oauth2" | "api_key" | "basic";

export type ConnectorCapability =
  | "contact_search"
  | "contact_sync"
  | "interaction_writeback"
  | "click_to_call";

export interface ConnectorManifest {
  id: string;
  name: string;
  version: string;
  authType: ConnectorAuthType;
  webhookSupported: boolean;
  capabilities: ConnectorCapability[];
}

// ─── Config & Auth ───────────────────────────────────────
export interface TenantConnectorConfig {
  tenantId: string;
  connectorId: string;
  credentials: Record<string, string>;
  settings: Record<string, unknown>;
  enabled: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

// ─── Events ──────────────────────────────────────────────
export type ConnectorEventType =
  | "contact_created"
  | "contact_updated"
  | "contact_deleted"
  | "click_to_call"
  | "custom";

export interface ConnectorEvent {
  type: ConnectorEventType;
  externalId: string;
  connectorId: string;
  payload: unknown;
  idempotencyKey: string;
}

// ─── Health ──────────────────────────────────────────────
export interface HealthStatus {
  healthy: boolean;
  latencyMs: number;
  message?: string;
}

// ─── THE PLUGIN CONTRACT ─────────────────────────────────
export interface ConnectorInterface {
  /** Static metadata about this connector */
  readonly manifest: ConnectorManifest;

  /** Initialize connector for a specific tenant */
  initialize(config: TenantConnectorConfig): Promise<void>;

  /** OAuth: generate authorization URL */
  getAuthUrl?(tenantId: string, redirectUri: string): string;

  /** OAuth: exchange code for tokens */
  exchangeToken?(tenantId: string, code: string): Promise<TokenPair>;

  /** Search contacts in the external system */
  searchContacts(query: ContactSearchQuery): Promise<ExternalContact[]>;

  /** Map external contact to canonical Contact model */
  mapContact(externalContact: ExternalContact): CanonicalContact;

  /** Verify inbound webhook signature */
  verifyWebhook(
    headers: Record<string, string>,
    body: string | Buffer
  ): boolean;

  /** Parse inbound webhook into a canonical event */
  parseWebhook(
    headers: Record<string, string>,
    body: unknown
  ): ConnectorEvent;

  /** Write interaction result back to external system */
  writeBack?(
    interaction: Interaction,
    config: TenantConnectorConfig
  ): Promise<void>;

  /** Health check for the external system connection */
  healthCheck(config: TenantConnectorConfig): Promise<HealthStatus>;
}
