export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { connectorRegistry } from "@/lib/core";
import { encryptJson, decryptJson } from "@/lib/utils/crypto";
import { writeAuditLog } from "@/lib/observability/audit-log";
import { logger } from "@/lib/observability/logger";
import { v4 as uuidv4 } from "uuid";

/**
 * GET /api/v1/auth/hubspot/callback
 *
 * OAuth2 callback handler for HubSpot.
 * HubSpot redirects here after the user authorizes the app.
 * The `state` parameter contains the tenantId.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // tenantId
  const error = url.searchParams.get("error");

  const correlationId = uuidv4();

  if (error) {
    logger.warn({ error }, "HubSpot OAuth denied by user");
    return NextResponse.json(
      { error: { code: "OAUTH_DENIED", message: `HubSpot OAuth denied: ${error}` } },
      { status: 400 }
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: { code: "INVALID_CALLBACK", message: "Missing code or state parameter" } },
      { status: 400 }
    );
  }

  const tenantId = state;

  try {
    // 1. Verify tenant exists and has HubSpot connector config
    const config = await prisma.connectorConfig.findUnique({
      where: { tenantId_connectorId: { tenantId, connectorId: "hubspot" } },
    });

    if (!config) {
      return NextResponse.json(
        { error: { code: "NOT_CONFIGURED", message: "HubSpot connector not configured for this tenant" } },
        { status: 404 }
      );
    }

    // 2. Decrypt stored credentials (contains clientId, clientSecret)
    const credentials = decryptJson<Record<string, string>>(config.credentials);

    // 3. Get the connector and exchange the code
    const connector = connectorRegistry.get("hubspot");
    await connector.initialize({
      tenantId,
      connectorId: "hubspot",
      credentials,
      settings: config.settings as Record<string, unknown>,
      enabled: config.enabled,
    });

    const tokens = await connector.exchangeToken!(tenantId, code);

    // 4. Store tokens (encrypted) — merge with existing credentials
    const updatedCredentials = {
      ...credentials,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt.toISOString(),
    };

    await prisma.connectorConfig.update({
      where: { id: config.id },
      data: {
        credentials: encryptJson(updatedCredentials),
        oauthState: null, // clear state
      },
    });

    // 5. Audit log
    await writeAuditLog({
      tenantId,
      correlationId,
      actor: "oauth:hubspot",
      action: "connector.oauth_completed",
      resource: `connector_config:${config.id}`,
      detail: { connectorId: "hubspot" },
    });

    logger.info({ tenantId }, "HubSpot OAuth flow completed successfully");

    // 6. Return success (in production, redirect to a success page)
    return NextResponse.json({
      status: "success",
      message: "HubSpot connected successfully",
      tenantId,
      connectorId: "hubspot",
    });
  } catch (err) {
    logger.error({ err, tenantId }, "HubSpot OAuth callback error");

    return NextResponse.json(
      { error: { code: "OAUTH_ERROR", message: (err as Error).message } },
      { status: 500 }
    );
  }
}
