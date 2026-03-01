import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { connectorRegistry } from "@/lib/core";
import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/utils/crypto";

/**
 * GET /api/v1/auth/hubspot
 *
 * Returns the HubSpot OAuth authorization URL.
 * The client should redirect the user to this URL to begin the OAuth flow.
 */
export const GET = apiHandler(async (request: NextRequest, ctx) => {
  const url = new URL(request.url);
  const redirectUri =
    url.searchParams.get("redirect_uri") ??
    `${url.origin}/api/v1/auth/hubspot/callback`;

  // Get HubSpot connector config for this tenant
  const config = await prisma.connectorConfig.findUnique({
    where: {
      tenantId_connectorId: {
        tenantId: ctx.tenant.tenantId,
        connectorId: "hubspot",
      },
    },
  });

  if (!config) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_CONFIGURED",
          message:
            "HubSpot connector not configured. POST to /api/v1/admin/connectors first.",
        },
      },
      { status: 404 }
    );
  }

  const credentials = decryptJson<Record<string, string>>(config.credentials);

  // Initialize the connector with the tenant's credentials
  const connector = connectorRegistry.get("hubspot");
  await connector.initialize({
    tenantId: ctx.tenant.tenantId,
    connectorId: "hubspot",
    credentials: { ...credentials, redirectUri },
    settings: config.settings as Record<string, unknown>,
    enabled: config.enabled,
  });

  // Generate the auth URL (state = tenantId for callback)
  const authUrl = connector.getAuthUrl!(ctx.tenant.tenantId, redirectUri);

  // Store OAuth state for CSRF verification
  await prisma.connectorConfig.update({
    where: { id: config.id },
    data: { oauthState: ctx.tenant.tenantId },
  });

  return NextResponse.json({
    authUrl,
    message: "Redirect the user to authUrl to begin HubSpot OAuth flow",
  });
});
