export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { connectorRegistry } from "@/lib/core";
import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/utils/crypto";

/**
 * POST /api/v1/admin/connectors/test-search
 * Direct search test — bypasses contact-resolver, calls connector directly.
 * Returns raw API response details for debugging.
 */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const { connectorId, query, phone } = await request.json();
  const tenantId = ctx.tenant.tenantId;

  // 1. Find connector (always reload from DB to get latest config)
  let connector;
  try {
    const { dynamicLoader } = await import("@/lib/connectors/factory/dynamic-loader");
    await dynamicLoader.reload(connectorId);
    connector = connectorRegistry.tryGet(connectorId);
  } catch (err) {
    return NextResponse.json({
      error: "Dynamic load failed",
      details: (err as Error).message,
    }, { status: 500 });
  }
  if (!connector) {
    connector = connectorRegistry.tryGet(connectorId);
  }

  if (!connector) {
    return NextResponse.json({
      error: `Connector '${connectorId}' not found`,
      registeredConnectors: connectorRegistry.listIds(),
    }, { status: 404 });
  }

  // 2. Get config
  const config = await prisma.connectorConfig.findUnique({
    where: { tenantId_connectorId: { tenantId, connectorId } },
  });

  if (!config) {
    return NextResponse.json({
      error: `No config for connector '${connectorId}' in tenant`,
    }, { status: 404 });
  }

  // 3. Decrypt and show token status
  const credentials = decryptJson<Record<string, string>>(config.credentials);
  const tokenInfo = {
    hasAccessToken: !!credentials.accessToken,
    hasRefreshToken: !!credentials.refreshToken,
    tokenExpiresAt: credentials.tokenExpiresAt,
    isExpired: credentials.tokenExpiresAt
      ? new Date(credentials.tokenExpiresAt) < new Date()
      : "unknown",
    accessTokenPreview: credentials.accessToken
      ? `${credentials.accessToken.slice(0, 20)}...`
      : "none",
  };

  // 4. Initialize and search
  try {
    await connector.initialize({
      tenantId,
      connectorId,
      credentials,
      settings: config.settings as Record<string, unknown>,
      enabled: config.enabled,
    });

    const results = await connector.searchContacts({
      tenantId,
      query: query ?? undefined,
      phone: phone ?? undefined,
      limit: 5,
    });

    return NextResponse.json({
      tokenInfo,
      searchQuery: { query, phone },
      resultCount: results.length,
      results: results.map((r) => ({
        externalId: r.externalId,
        source: r.source,
        rawPreview: JSON.stringify(r.raw).slice(0, 500),
      })),
    });
  } catch (err) {
    return NextResponse.json({
      tokenInfo,
      searchQuery: { query, phone },
      error: (err as Error).message,
      stack: (err as Error).stack?.split("\n").slice(0, 5),
    }, { status: 500 });
  }
});
