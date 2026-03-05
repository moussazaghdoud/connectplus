/**
 * Connector Definition Config — the JSON schema that defines a config-driven connector.
 * Stored in the ConnectorDefinition.config column.
 */

// ── Authentication ───────────────────────────────────────

export type AuthType = "oauth2" | "api_key" | "basic";

export interface OAuth2Config {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** How the access token is sent in API requests */
  tokenPlacement: "header" | "query";
  /** Prefix before the token value, e.g. "Bearer" */
  tokenPrefix: string;
  /** Extra params to include in authorize URL, e.g. { access_type: "offline" } */
  extraAuthParams?: Record<string, string>;
}

export interface ApiKeyConfig {
  /** HTTP header name, e.g. "X-Api-Key" */
  headerName: string;
  /** Optional prefix, e.g. "Key " */
  prefix?: string;
}

export interface BasicAuthConfig {
  /** Key name in credentials for username */
  usernameField: string;
  /** Key name in credentials for password */
  passwordField: string;
}

export interface AuthConfig {
  type: AuthType;
  oauth2?: OAuth2Config;
  apiKey?: ApiKeyConfig;
  basic?: BasicAuthConfig;
}

// ── Contact Search ───────────────────────────────────────

export interface ContactSearchRequestConfig {
  /** For POST: JSON body template with {{query}}, {{email}}, {{phone}} placeholders */
  bodyTemplate?: string;
  /** For GET: query parameter mapping, e.g. { "q": "{{query}}" } */
  queryParams?: Record<string, string>;
}

export interface ContactSearchResponseConfig {
  /** Dot-path to the array of contacts, e.g. "data.contacts" */
  resultsPath: string;
  /** Dot-path to total count (optional) */
  totalPath?: string;
  /** Field name for external ID in each result */
  idField: string;
}

export interface ContactSearchConfig {
  /** Relative to apiBaseUrl, e.g. "/contacts/search" */
  endpoint: string;
  method: "GET" | "POST";
  request: ContactSearchRequestConfig;
  response: ContactSearchResponseConfig;
}

// ── Search Strategies (multi-module, ordered) ────────────

export interface SearchStrategyConfig {
  /** Human label, e.g. "Contacts", "Leads", "Accounts" */
  label: string;
  /** Priority (lower = tried first). Default: array index */
  priority?: number;
  /** Relative to apiBaseUrl */
  endpoint: string;
  method: "GET" | "POST";
  request: ContactSearchRequestConfig;
  response: ContactSearchResponseConfig;
  /** Per-strategy field mapping (overrides top-level contactFieldMapping) */
  fieldMapping?: ContactFieldMappingConfig;
  /** CRM module name for deep link building (e.g. "Contacts", "Leads") */
  crmModule?: string;
}

// ── CRM Link Template ────────────────────────────────────

export interface CrmLinkConfig {
  /** URL template, e.g. "https://crm.zoho.eu/crm/org{{orgId}}/tab/{{module}}/{{recordId}}" */
  urlTemplate: string;
}

// ── Field Mapping ────────────────────────────────────────

export interface ContactFieldMappingConfig {
  /** Template or dot-path, e.g. "{{first_name}} {{last_name}}" or "properties.email" */
  displayName: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  avatarUrl?: string;
}

// ── Write-Back ───────────────────────────────────────────

export interface WriteBackAssociateConfig {
  /** e.g. "/calls/{{writeBackId}}/associations/contact/{{externalId}}" */
  endpoint: string;
  method: "PUT" | "POST";
  bodyTemplate?: string;
}

export interface WriteBackConfig {
  /** Relative to apiBaseUrl */
  endpoint: string;
  method: "POST" | "PUT" | "PATCH";
  /** JSON template with {{interaction.*}} placeholders */
  bodyTemplate: string;
  /** Optional: associate the write-back record with a contact */
  associateContact?: WriteBackAssociateConfig;
}

// ── Webhooks ─────────────────────────────────────────────

export type WebhookSignatureMethod = "hmac_sha256" | "hmac_sha1" | "static_token" | "none";

export interface WebhookConfig {
  signatureMethod: WebhookSignatureMethod;
  /** HTTP header containing the signature, e.g. "X-Signature-256" */
  signatureHeader?: string;
  /** Prefix before the hash, e.g. "sha256=" */
  signaturePrefix?: string;
  /** HTTP header containing the timestamp for replay protection */
  timestampHeader?: string;
  /** Max age of timestamp in ms (default 300000 = 5 min) */
  maxTimestampAgeMs?: number;
  /** For static_token: header containing the token */
  tokenHeader?: string;
  /** Dot-path to event type in payload, e.g. "event_type" */
  eventTypeField: string;
  /** Maps external event type → canonical type */
  eventTypeMapping: Record<string, string>;
  /** Dot-path to external ID in payload */
  externalIdField: string;
  /** Dot-path to unique event ID for idempotency */
  idempotencyKeyField?: string;
}

// ── Health Check ─────────────────────────────────────────

export interface HealthCheckConfig {
  /** Relative to apiBaseUrl, e.g. "/me" or "/status" */
  endpoint: string;
  method?: "GET" | "HEAD";
  /** Expected HTTP status (default 200) */
  expectedStatus?: number;
}

// ── Top-Level Config ─────────────────────────────────────

export interface ConnectorDefinitionConfig {
  /** Base URL for API calls, e.g. "https://api.example-crm.com/v2" */
  apiBaseUrl: string;
  auth: AuthConfig;
  /** Single-endpoint search (backward-compat). Ignored if searchStrategies is present. */
  contactSearch: ContactSearchConfig;
  contactFieldMapping: ContactFieldMappingConfig;
  /** Multi-module search strategies. Tried in priority order, first match wins. */
  searchStrategies?: SearchStrategyConfig[];
  /** CRM deep link template */
  crmLink?: CrmLinkConfig;
  writeBack?: WriteBackConfig;
  webhook?: WebhookConfig;
  healthCheck?: HealthCheckConfig;
}
