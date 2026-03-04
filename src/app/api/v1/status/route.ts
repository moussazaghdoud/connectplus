export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { prisma } from "@/lib/db";
import { connectorRegistry } from "@/lib/core/connector-registry";
import { s2sManager } from "@/lib/rainbow/s2s-connector";
import { sseManager } from "@/lib/sse/connection-manager";
import { dlq } from "@/lib/queue/dlq";
import { metrics } from "@/lib/observability/metrics";
import { decryptJson } from "@/lib/utils/crypto";

const CONNECTOR_HEALTH_TIMEOUT_MS = 5_000;
const startTime = Date.now();

/** GET /api/v1/status — Aggregated system status */
export const GET = apiHandler(async (_request: NextRequest, ctx) => {
  const tenantId = ctx.tenant.tenantId;

  // ── Run independent checks in parallel ─────────────────
  const [dbResult, dlqResult, connectorResults] = await Promise.allSettled([
    checkDatabase(),
    dlq.stats(tenantId),
    checkConnectors(tenantId),
  ]);

  // ── Database ───────────────────────────────────────────
  const database =
    dbResult.status === "fulfilled"
      ? dbResult.value
      : { status: "unhealthy" as const, latencyMs: 0 };

  // ── Rainbow S2S ────────────────────────────────────────
  const sessionInfo = s2sManager.getSessionInfo(tenantId);
  const rainbow = sessionInfo
    ? {
        status: sessionInfo.status,
        connectedAs: sessionInfo.connectedAs,
        extension: sessionInfo.extension,
        error: sessionInfo.error,
      }
    : { status: "stopped" as const };

  // ── SSE ────────────────────────────────────────────────
  const sse = {
    tenantConnections: sseManager.connectionCount(tenantId),
    totalConnections: sseManager.totalConnections(),
  };

  // ── Connectors ─────────────────────────────────────────
  const connectors =
    connectorResults.status === "fulfilled" ? connectorResults.value : [];

  // ── DLQ ────────────────────────────────────────────────
  const dlqStats =
    dlqResult.status === "fulfilled"
      ? dlqResult.value
      : { pending: 0, resolved: 0, total: 0 };

  // ── Overall status ─────────────────────────────────────
  const isDegraded =
    database.status !== "healthy" ||
    connectors.some((c) => c.enabled && c.health && !c.health.healthy);

  return NextResponse.json({
    status: isDegraded ? "degraded" : "healthy",
    version: "0.1.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    database,
    rainbow,
    sse,
    connectors,
    dlq: dlqStats,
    metrics: metrics.snapshot(),
  });
});

// ── Helpers ────────────────────────────────────────────────

async function checkDatabase(): Promise<{
  status: "healthy" | "unhealthy";
  latencyMs: number;
}> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "healthy", latencyMs: Date.now() - start };
  } catch {
    return { status: "unhealthy", latencyMs: Date.now() - start };
  }
}

async function checkConnectors(tenantId: string) {
  const manifests = connectorRegistry.listManifests();

  // Fetch tenant's connector configs
  const configs = await prisma.connectorConfig.findMany({
    where: { tenantId },
  });
  const configMap = new Map(
    configs.map(
      (c: {
        connectorId: string;
        enabled: boolean;
        credentials: string;
        settings: unknown;
      }) => [c.connectorId, c]
    )
  );

  const results = await Promise.allSettled(
    manifests.map(async (manifest) => {
      const dbConfig = configMap.get(manifest.id);
      const configured = !!dbConfig;
      const enabled = dbConfig?.enabled ?? false;

      let health: { healthy: boolean; latencyMs: number; message?: string } | null =
        null;

      if (configured && enabled) {
        const connector = connectorRegistry.tryGet(manifest.id);
        if (connector) {
          try {
            const credentials = decryptJson<Record<string, string>>(
              dbConfig!.credentials
            );
            const config = {
              tenantId,
              connectorId: manifest.id,
              credentials,
              settings: (dbConfig!.settings as Record<string, unknown>) ?? {},
              enabled: true,
            };

            health = await Promise.race([
              connector.healthCheck(config),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error("Health check timed out")),
                  CONNECTOR_HEALTH_TIMEOUT_MS
                )
              ),
            ]);
          } catch (err) {
            health = {
              healthy: false,
              latencyMs: 0,
              message:
                err instanceof Error ? err.message : "Health check failed",
            };
          }
        }
      }

      return {
        id: manifest.id,
        name: manifest.name,
        configured,
        enabled,
        health,
      };
    })
  );

  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { id: "unknown", name: "Unknown", configured: false, enabled: false, health: null }
  );
}
