/**
 * Connector diagnostics runner — checks health, token status, API reachability.
 */

import { connectorRegistry } from "../../core/connector-registry";
import { prisma } from "../../db";
import { decryptJson } from "../../utils/crypto";
import { logger } from "../../observability/logger";
import type { DiagnosticResult, ConnectorDiagnostics } from "./types";
import type { TenantConnectorConfig } from "../../core/connector-interface";

/**
 * Run diagnostics for a connector against a specific tenant's configuration.
 */
export async function runDiagnostics(
  slug: string,
  tenantId: string
): Promise<ConnectorDiagnostics> {
  const results: DiagnosticResult[] = [];
  const timestamp = new Date().toISOString();

  // 1. Check if connector is registered
  const connector = connectorRegistry.tryGet(slug);
  if (!connector) {
    results.push({
      check: "registry",
      status: "warn",
      message: `Connector "${slug}" is not loaded in the registry (may be DRAFT/Planned)`,
    });
    // Still continue — we can check DB-level diagnostics
  } else {
    results.push({
      check: "registry",
      status: "pass",
      message: `Connector "${slug}" is registered (${connector.manifest.version})`,
    });
  }

  // 2. Check tenant configuration
  const config = await prisma.connectorConfig.findUnique({
    where: { tenantId_connectorId: { tenantId, connectorId: slug } },
  });

  if (!config) {
    results.push({
      check: "tenant_config",
      status: "skip",
      message: "No tenant configuration found — connector not configured for this tenant",
    });
    return { connectorId: slug, timestamp, results, overall: "unconfigured" };
  }

  results.push({
    check: "tenant_config",
    status: config.enabled ? "pass" : "warn",
    message: config.enabled
      ? "Connector is configured and enabled"
      : "Connector is configured but disabled",
  });

  // 3. Decrypt and check credentials
  let creds: Record<string, string>;
  try {
    creds = decryptJson<Record<string, string>>(config.credentials);
    results.push({
      check: "credentials",
      status: "pass",
      message: "Credentials decrypted successfully",
    });
  } catch {
    results.push({
      check: "credentials",
      status: "fail",
      message: "Failed to decrypt credentials — encryption key may have changed",
    });
    return { connectorId: slug, timestamp, results, overall: "unhealthy" };
  }

  // 4. Token status (for OAuth connectors)
  if (creds.accessToken) {
    const expiresAt = creds.tokenExpiresAt ? new Date(creds.tokenExpiresAt) : null;
    if (!expiresAt) {
      results.push({
        check: "token_status",
        status: "warn",
        message: "Access token present but no expiry timestamp",
      });
    } else if (expiresAt > new Date()) {
      const remainingMs = expiresAt.getTime() - Date.now();
      const remainingMin = Math.round(remainingMs / 60000);
      results.push({
        check: "token_status",
        status: "pass",
        message: `Token valid — expires in ${remainingMin} minutes`,
        detail: { expiresAt: expiresAt.toISOString() },
      });
    } else {
      results.push({
        check: "token_status",
        status: "warn",
        message: `Token expired at ${expiresAt.toISOString()} — will auto-refresh on next API call`,
        detail: { expiresAt: expiresAt.toISOString() },
      });
    }
  } else {
    results.push({
      check: "token_status",
      status: creds.clientId ? "warn" : "skip",
      message: creds.clientId
        ? "OAuth credentials set but no access token — user needs to authorize"
        : "No OAuth tokens (may use API key auth)",
    });
  }

  // 5. Health check (if connector is registered and has health check)
  if (connector) {
    try {
      const tenantConfig: TenantConnectorConfig = {
        tenantId,
        connectorId: slug,
        credentials: creds,
        settings: config.settings as Record<string, unknown>,
        enabled: config.enabled,
      };

      const start = Date.now();
      const health = await connector.healthCheck(tenantConfig);
      const latencyMs = Date.now() - start;

      results.push({
        check: "api_health",
        status: health.healthy ? "pass" : "fail",
        message: health.message ?? (health.healthy ? "API reachable" : "API unreachable"),
        latencyMs,
      });

      // Update operational tracking
      await prisma.connectorDefinition.updateMany({
        where: { slug },
        data: {
          lastHealthAt: new Date(),
          lastHealthStatus: health.healthy,
          lastHealthLatency: latencyMs,
        },
      }).catch((err) => {
        logger.warn({ err, slug }, "Failed to update health tracking");
      });
    } catch (err) {
      results.push({
        check: "api_health",
        status: "fail",
        message: err instanceof Error ? err.message : "Health check threw an error",
      });
    }
  } else {
    results.push({
      check: "api_health",
      status: "skip",
      message: "Cannot run health check — connector not in registry",
    });
  }

  // 6. Check ConnectorDefinition operational fields
  const def = await prisma.connectorDefinition.findUnique({ where: { slug } });
  if (def) {
    if (def.lastWebhookAt) {
      const age = Date.now() - new Date(def.lastWebhookAt).getTime();
      const ageHours = Math.round(age / 3600000);
      results.push({
        check: "webhook_status",
        status: ageHours < 24 ? "pass" : "warn",
        message: `Last webhook received ${ageHours}h ago`,
        detail: { lastWebhookAt: def.lastWebhookAt },
      });
    } else {
      results.push({
        check: "webhook_status",
        status: "skip",
        message: "No webhook events recorded",
      });
    }
  }

  // Compute overall
  const hasFailure = results.some((r) => r.status === "fail");
  const hasWarn = results.some((r) => r.status === "warn");
  const overall = hasFailure ? "unhealthy" : hasWarn ? "degraded" : "healthy";

  return { connectorId: slug, timestamp, results, overall };
}
