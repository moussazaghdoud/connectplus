/**
 * HubSpot Connector — Exemplar Implementation
 * =============================================
 * Demonstrates the full connector lifecycle:
 * - OAuth2 authentication flow
 * - Contact search via HubSpot CRM API
 * - Contact mapping to canonical model
 * - Webhook signature verification (v3) + event parsing
 * - Write-back: log call activity to HubSpot as Call engagement
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
import { fetchWithRetry } from "@/lib/utils/http";
import { logger } from "@/lib/observability/logger";
import { metrics } from "@/lib/observability/metrics";

import {
  getHubSpotAuthUrl,
  exchangeHubSpotCode,
  refreshHubSpotToken,
} from "./auth";
import { mapHubSpotContact } from "./mapper";
import { verifyHubSpotWebhook, parseHubSpotWebhook } from "./webhooks";
import { writeCallToHubSpot } from "./actions";
import type { HubSpotSearchResponse } from "./types";

const HUBSPOT_API = "https://api.hubapi.com";

export class HubSpotConnector implements ConnectorInterface {
  readonly manifest: ConnectorManifest = {
    id: "hubspot",
    name: "HubSpot",
    version: "1.0.0",
    authType: "oauth2",
    webhookSupported: true,
    capabilities: [
      "contact_search",
      "contact_sync",
      "interaction_writeback",
      "click_to_call",
    ],
  };

  private config: TenantConnectorConfig | null = null;

  async initialize(config: TenantConnectorConfig): Promise<void> {
    this.config = config;
    logger.info(
      { tenantId: config.tenantId, connectorId: this.manifest.id },
      "HubSpot connector initialized"
    );
  }

  // ── OAuth2 ─────────────────────────────────────────────

  getAuthUrl(tenantId: string, redirectUri: string): string {
    const clientId = this.config?.credentials.clientId;
    if (!clientId) {
      throw new Error("HubSpot clientId not configured");
    }

    return getHubSpotAuthUrl(clientId, redirectUri, tenantId);
  }

  async exchangeToken(tenantId: string, code: string): Promise<TokenPair> {
    const creds = this.config?.credentials;
    if (!creds?.clientId || !creds?.clientSecret || !creds?.redirectUri) {
      throw new Error("HubSpot OAuth credentials not fully configured");
    }

    const result = await exchangeHubSpotCode(
      creds.clientId,
      creds.clientSecret,
      creds.redirectUri,
      code
    );

    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: new Date(Date.now() + result.expires_in * 1000),
    };
  }

  // ── Contact Search ─────────────────────────────────────

  async searchContacts(query: ContactSearchQuery): Promise<ExternalContact[]> {
    const token = await this.getAccessToken();
    if (!token) return [];

    metrics.increment("hubspot_api_calls", { endpoint: "contacts/search" });

    // Use the search API with free-text query
    let requestBody: Record<string, unknown>;

    if (query.email) {
      requestBody = {
        filterGroups: [
          {
            filters: [
              { propertyName: "email", operator: "EQ", value: query.email },
            ],
          },
        ],
        properties: [
          "firstname", "lastname", "email", "phone", "mobilephone",
          "company", "jobtitle",
        ],
        limit: query.limit ?? 20,
      };
    } else if (query.phone) {
      requestBody = {
        filterGroups: [
          {
            filters: [
              { propertyName: "phone", operator: "CONTAINS_TOKEN", value: query.phone },
            ],
          },
        ],
        properties: [
          "firstname", "lastname", "email", "phone", "mobilephone",
          "company", "jobtitle",
        ],
        limit: query.limit ?? 20,
      };
    } else {
      // Free-text search — use the query parameter
      requestBody = {
        query: query.query ?? "",
        properties: [
          "firstname", "lastname", "email", "phone", "mobilephone",
          "company", "jobtitle",
        ],
        limit: query.limit ?? 20,
      };
    }

    const response = await fetchWithRetry(
      `${HUBSPOT_API}/crm/v3/objects/contacts/search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        retries: 1,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error(
        { status: response.status, error },
        "HubSpot contact search failed"
      );
      return [];
    }

    const data = (await response.json()) as HubSpotSearchResponse;

    return data.results.map((contact) => ({
      externalId: contact.id,
      source: "hubspot",
      raw: contact,
    }));
  }

  // ── Contact Mapping ────────────────────────────────────

  mapContact(externalContact: ExternalContact): CanonicalContact {
    return mapHubSpotContact(externalContact.raw as import("./types").HubSpotContact);
  }

  // ── Webhook Verification ───────────────────────────────

  verifyWebhook(
    headers: Record<string, string>,
    body: string | Buffer
  ): boolean {
    const clientSecret = this.config?.credentials.clientSecret;
    if (!clientSecret) {
      logger.warn("HubSpot webhook verification: no client secret configured");
      return false;
    }

    const rawBody = typeof body === "string" ? body : body.toString("utf-8");
    return verifyHubSpotWebhook(clientSecret, headers, rawBody);
  }

  // ── Webhook Parsing ────────────────────────────────────

  parseWebhook(
    _headers: Record<string, string>,
    body: unknown
  ): ConnectorEvent {
    return parseHubSpotWebhook(body);
  }

  // ── Write-back ─────────────────────────────────────────

  async writeBack(
    interaction: Interaction,
    config: TenantConnectorConfig
  ): Promise<void> {
    await writeCallToHubSpot(interaction, config);

    metrics.increment("hubspot_writeback", { status: "success" });
  }

  // ── Health Check ───────────────────────────────────────

  async healthCheck(config: TenantConnectorConfig): Promise<HealthStatus> {
    const token = config.credentials.accessToken;
    if (!token) {
      return {
        healthy: false,
        latencyMs: 0,
        message: "No access token configured",
      };
    }

    const start = Date.now();
    try {
      const response = await fetchWithRetry(
        `${HUBSPOT_API}/crm/v3/objects/contacts?limit=1`,
        {
          headers: { Authorization: `Bearer ${token}` },
          retries: 0,
          timeoutMs: 10000,
        }
      );

      return {
        healthy: response.ok,
        latencyMs: Date.now() - start,
        message: response.ok ? "OK" : `HTTP ${response.status}`,
      };
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        message: (err as Error).message,
      };
    }
  }

  // ── Private helpers ────────────────────────────────────

  private async getAccessToken(): Promise<string | null> {
    if (!this.config) return null;

    const { accessToken, refreshToken, clientId, clientSecret, redirectUri } =
      this.config.credentials;

    if (accessToken) return accessToken;

    // Try to refresh
    if (refreshToken && clientId && clientSecret && redirectUri) {
      try {
        const result = await refreshHubSpotToken(
          clientId,
          clientSecret,
          redirectUri,
          refreshToken
        );
        // Note: in production, store the new tokens back to the DB
        return result.access_token;
      } catch (err) {
        logger.error({ err }, "Failed to refresh HubSpot token");
      }
    }

    return null;
  }
}
