/**
 * RestCrmConnector — a config-driven implementation of ConnectorInterface.
 * Handles 80% of CRM integrations with zero custom code.
 */

import type {
  ConnectorInterface,
  ConnectorManifest,
  TenantConnectorConfig,
  TokenPair,
  ConnectorEvent,
  ConnectorEventType,
  HealthStatus,
} from "../../core/connector-interface";
import type { CanonicalContact, ContactSearchQuery, ExternalContact } from "../../core/models/contact";
import type { Interaction } from "../../../prisma-types";
import type { ConnectorDefinitionConfig } from "./types";
import { buildAuthHeaders, buildOAuth2AuthUrl, exchangeOAuth2Token, refreshOAuth2Token } from "./auth-handler";
import { verifyWebhookSignature } from "./webhook-verifier";
import { getByPath, resolveField, applyTemplate, mapContactFields } from "./field-mapper";
import { validateUrl, resolveEndpoint } from "./url-validator";
import { fetchWithRetry } from "../../utils/http";
import { encryptJson } from "../../utils/crypto";
import { prisma } from "../../db";
import { logger } from "../../observability/logger";

export class RestCrmConnector implements ConnectorInterface {
  readonly manifest: ConnectorManifest;
  private def: ConnectorDefinitionConfig;
  private config: TenantConnectorConfig | null = null;

  constructor(
    slug: string,
    name: string,
    version: string,
    def: ConnectorDefinitionConfig
  ) {
    this.def = def;
    this.manifest = {
      id: slug,
      name,
      version,
      authType: def.auth.type,
      webhookSupported: !!def.webhook,
      capabilities: this.deriveCapabilities(),
    };
  }

  private deriveCapabilities() {
    const caps: ConnectorManifest["capabilities"] = ["contact_search", "click_to_call"];
    if (this.def.writeBack) caps.push("interaction_writeback");
    return caps;
  }

  async initialize(config: TenantConnectorConfig): Promise<void> {
    this.config = config;
  }

  // ── OAuth2 ─────────────────────────────────────────────

  getAuthUrl(tenantId: string, redirectUri: string): string {
    if (this.def.auth.type !== "oauth2") {
      throw new Error(`${this.manifest.id} does not use OAuth2`);
    }
    const clientId = this.config?.credentials.clientId ?? "";
    return buildOAuth2AuthUrl(this.def.auth, clientId, redirectUri, tenantId);
  }

  async exchangeToken(tenantId: string, code: string): Promise<TokenPair> {
    if (this.def.auth.type !== "oauth2") {
      throw new Error(`${this.manifest.id} does not use OAuth2`);
    }
    const creds = this.config?.credentials ?? {};
    return exchangeOAuth2Token(
      this.def.auth,
      creds.clientId ?? "",
      creds.clientSecret ?? "",
      creds.redirectUri ?? "",
      code
    );
  }

  // ── Token Refresh ──────────────────────────────────────

  /**
   * Check if OAuth token is expired and refresh it automatically.
   * Updates stored credentials in DB with new access token.
   */
  private async ensureFreshToken(): Promise<void> {
    if (this.def.auth.type !== "oauth2" || !this.config) return;

    const creds = this.config.credentials;
    const expiresAt = creds.tokenExpiresAt ? new Date(creds.tokenExpiresAt) : null;
    const isExpired = !creds.accessToken || (expiresAt && expiresAt < new Date());

    if (!isExpired) return;

    const refreshToken = creds.refreshToken;
    if (!refreshToken) {
      logger.warn({ connector: this.manifest.id }, "OAuth token expired but no refresh token available");
      return;
    }

    try {
      logger.info({ connector: this.manifest.id }, "Refreshing expired OAuth token");
      const tokens = await refreshOAuth2Token(
        this.def.auth,
        creds.clientId ?? "",
        creds.clientSecret ?? "",
        refreshToken
      );

      // Update in-memory credentials
      this.config.credentials = {
        ...creds,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || refreshToken,
        tokenExpiresAt: tokens.expiresAt.toISOString(),
      };

      // Persist to DB
      try {
        await prisma.connectorConfig.updateMany({
          where: {
            tenantId: this.config.tenantId,
            connectorId: this.config.connectorId,
          },
          data: {
            credentials: encryptJson(this.config.credentials),
          },
        });
        logger.info({ connector: this.manifest.id }, "OAuth token refreshed and saved");
      } catch (err) {
        logger.warn({ err, connector: this.manifest.id }, "Token refreshed but DB save failed");
      }
    } catch (err) {
      logger.error({ err, connector: this.manifest.id }, "OAuth token refresh failed");
    }
  }

  // ── Contact Search ─────────────────────────────────────

  async searchContacts(query: ContactSearchQuery): Promise<ExternalContact[]> {
    await this.ensureFreshToken();

    const creds = this.config?.credentials ?? {};
    const headers = {
      ...buildAuthHeaders(this.def.auth, creds),
      "Content-Type": "application/json",
    };

    const searchConf = this.def.contactSearch;
    const url = resolveEndpoint(this.def.apiBaseUrl, searchConf.endpoint);

    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`URL validation failed: ${validation.error}`);
    }

    const queryStr = query.query ?? query.email ?? query.phone ?? "";
    let resp: Response;

    if (searchConf.method === "POST") {
      const bodyTemplate = searchConf.request.bodyTemplate ?? '{"query":"{{query}}"}';
      const body = applyTemplate(bodyTemplate, {
        query: queryStr,
        email: query.email ?? "",
        phone: query.phone ?? "",
      });
      resp = await fetchWithRetry(url, { method: "POST", headers, body });
    } else {
      const params = new URLSearchParams();
      for (const [key, tmpl] of Object.entries(searchConf.request.queryParams ?? {})) {
        params.set(key, applyTemplate(tmpl, {
          query: queryStr,
          email: query.email ?? "",
          phone: query.phone ?? "",
        }));
      }
      resp = await fetchWithRetry(`${url}?${params.toString()}`, { method: "GET", headers });
    }

    logger.info(
      { status: resp.status, connector: this.manifest.id },
      "Contact search API response received"
    );

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      logger.warn(
        { status: resp.status, connector: this.manifest.id, response: errText.slice(0, 500) },
        "Contact search API call failed"
      );
      return [];
    }

    // Handle 204 No Content (e.g. Zoho returns 204 when no results)
    if (resp.status === 204) {
      logger.info({ connector: this.manifest.id }, "Contact search returned 204 No Content");
      return [];
    }

    const responseText = await resp.text();
    if (!responseText || responseText.trim() === "") {
      logger.info({ connector: this.manifest.id }, "Contact search returned empty body");
      return [];
    }

    const data = JSON.parse(responseText);
    const results = getByPath(data, searchConf.response.resultsPath) as unknown[];

    logger.info(
      { connector: this.manifest.id, resultsPath: searchConf.response.resultsPath, isArray: Array.isArray(results), count: Array.isArray(results) ? results.length : 0 },
      "Contact search API response parsed"
    );

    if (!Array.isArray(results)) return [];

    return results.map((item) => {
      const obj = item as Record<string, unknown>;
      const idField = searchConf.response.idField;
      return {
        externalId: String(getByPath(obj, idField) ?? ""),
        source: this.manifest.id,
        raw: obj,
      } as ExternalContact;
    });
  }

  mapContact(externalContact: ExternalContact): CanonicalContact {
    const raw = externalContact.raw as Record<string, unknown>;
    const mapped = mapContactFields(raw, this.def.contactFieldMapping as unknown as Record<string, string | undefined>);

    return {
      displayName: mapped.displayName || `Contact ${externalContact.externalId}`,
      email: mapped.email || undefined,
      phone: mapped.phone || undefined,
      company: mapped.company || undefined,
      title: mapped.title || undefined,
      avatarUrl: mapped.avatarUrl || undefined,
      externalId: externalContact.externalId,
      source: this.manifest.id,
      metadata: { raw: externalContact.raw },
    };
  }

  // ── Webhooks ───────────────────────────────────────────

  verifyWebhook(headers: Record<string, string>, body: string | Buffer): boolean {
    if (!this.def.webhook) return false;
    const secret = this.config?.credentials.webhookSecret ?? this.config?.credentials.clientSecret ?? "";
    return verifyWebhookSignature(this.def.webhook, secret, headers, typeof body === "string" ? body : body.toString());
  }

  parseWebhook(headers: Record<string, string>, body: unknown): ConnectorEvent {
    const webhook = this.def.webhook;
    if (!webhook) throw new Error(`${this.manifest.id} does not support webhooks`);

    const payload = body as Record<string, unknown>;
    const eventTypeRaw = String(getByPath(payload, webhook.eventTypeField) ?? "custom");
    const eventType = (webhook.eventTypeMapping[eventTypeRaw] ?? "custom") as ConnectorEventType;
    const externalId = String(getByPath(payload, webhook.externalIdField) ?? "");
    const idempotencyKey = webhook.idempotencyKeyField
      ? String(getByPath(payload, webhook.idempotencyKeyField) ?? `${this.manifest.id}_${Date.now()}`)
      : `${this.manifest.id}_${Date.now()}`;

    return {
      type: eventType,
      externalId,
      connectorId: this.manifest.id,
      payload,
      idempotencyKey,
    };
  }

  // ── Write-Back ─────────────────────────────────────────

  async writeBack(interaction: Interaction, config: TenantConnectorConfig): Promise<void> {
    if (!this.def.writeBack) return;

    // Ensure token is fresh before write-back
    this.config = config;
    await this.ensureFreshToken();

    const headers = {
      ...buildAuthHeaders(this.def.auth, this.config?.credentials ?? config.credentials),
      "Content-Type": "application/json",
    };

    const wb = this.def.writeBack;
    const url = resolveEndpoint(this.def.apiBaseUrl, wb.endpoint);
    const body = applyTemplate(wb.bodyTemplate, { interaction: interaction as unknown as Record<string, unknown> });

    const resp = await fetchWithRetry(url, {
      method: wb.method,
      headers,
      body,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Write-back failed: HTTP ${resp.status} ${text}`);
    }

    // Associate with contact if configured
    if (wb.associateContact && interaction.externalId) {
      const respData = await resp.json().catch(() => ({}));
      const writeBackId = (respData as Record<string, unknown>).id ?? "";
      const assocUrl = resolveEndpoint(
        this.def.apiBaseUrl,
        applyTemplate(wb.associateContact.endpoint, {
          writeBackId: String(writeBackId),
          externalId: interaction.externalId,
        })
      );
      const assocBody = wb.associateContact.bodyTemplate
        ? applyTemplate(wb.associateContact.bodyTemplate, {
            writeBackId: String(writeBackId),
            externalId: interaction.externalId,
          })
        : undefined;

      await fetchWithRetry(assocUrl, {
        method: wb.associateContact.method,
        headers,
        body: assocBody,
      });
    }
  }

  // ── Health Check ───────────────────────────────────────

  async healthCheck(config: TenantConnectorConfig): Promise<HealthStatus> {
    const hc = this.def.healthCheck ?? { endpoint: "/", method: "GET" as const };
    const url = resolveEndpoint(this.def.apiBaseUrl, hc.endpoint);
    const headers = buildAuthHeaders(this.def.auth, config.credentials);
    const expectedStatus = hc.expectedStatus ?? 200;
    const start = Date.now();

    try {
      const resp = await fetchWithRetry(url, {
        method: hc.method ?? "GET",
        headers,
      });
      const latencyMs = Date.now() - start;

      return {
        healthy: resp.status === expectedStatus,
        latencyMs,
        message: resp.status === expectedStatus ? "OK" : `Unexpected status: ${resp.status}`,
      };
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : "Health check failed",
      };
    }
  }
}
