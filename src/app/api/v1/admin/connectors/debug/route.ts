export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { connectorRegistry } from "@/lib/core";
import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/utils/crypto";

/**
 * GET /api/v1/admin/connectors/debug
 * Diagnostic endpoint — checks connector config, registry, and OAuth token status.
 */
export const GET = apiHandler(async (_request: NextRequest, ctx) => {
  const tenantId = ctx.tenant.tenantId;

  // 1. Registry status
  const registryIds = connectorRegistry.listIds();
  const registryManifests = connectorRegistry.listManifests();

  // 2. DB connector definitions
  const definitions = await prisma.connectorDefinition.findMany({
    select: { slug: true, name: true, status: true, version: true },
  });

  // 3. Tenant's connector configs
  const configs = await prisma.connectorConfig.findMany({
    where: { tenantId },
  });

  const configDetails = configs.map((c) => {
    let tokenStatus = "unknown";
    let hasAccessToken = false;
    let hasRefreshToken = false;
    let tokenExpiresAt: string | null = null;
    let isExpired = false;

    try {
      const creds = decryptJson<Record<string, string>>(c.credentials);
      hasAccessToken = !!creds.accessToken;
      hasRefreshToken = !!creds.refreshToken;
      tokenExpiresAt = creds.tokenExpiresAt ?? null;

      if (creds.accessToken) {
        if (tokenExpiresAt) {
          isExpired = new Date(tokenExpiresAt) < new Date();
          tokenStatus = isExpired ? "expired" : "valid";
        } else {
          tokenStatus = "present (no expiry)";
        }
      } else {
        tokenStatus = "no access token";
      }
    } catch (err) {
      tokenStatus = `decrypt failed: ${(err as Error).message}`;
    }

    return {
      connectorId: c.connectorId,
      enabled: c.enabled,
      hasAccessToken,
      hasRefreshToken,
      tokenExpiresAt,
      isExpired,
      tokenStatus,
      inRegistry: connectorRegistry.has(c.connectorId),
    };
  });

  // 4. Try loading dynamic connectors if not in registry
  const missingFromRegistry = configDetails
    .filter((c) => !c.inRegistry)
    .map((c) => c.connectorId);

  let dynamicLoadResult: Record<string, string> = {};
  for (const slug of missingFromRegistry) {
    try {
      const { dynamicLoader } = await import(
        "@/lib/connectors/factory/dynamic-loader"
      );
      const loaded = await dynamicLoader.reload(slug);
      dynamicLoadResult[slug] = loaded
        ? "loaded successfully"
        : "definition not found or inactive";
    } catch (err) {
      dynamicLoadResult[slug] = `load failed: ${(err as Error).message}`;
    }
  }

  // Re-check registry after dynamic loading
  const registryIdsAfter = connectorRegistry.listIds();

  return NextResponse.json({
    tenantId,
    registry: {
      before: registryIds,
      after: registryIdsAfter,
      manifests: registryManifests,
    },
    definitions: definitions,
    configs: configDetails,
    dynamicLoadResult,
    timestamp: new Date().toISOString(),
  });
});
