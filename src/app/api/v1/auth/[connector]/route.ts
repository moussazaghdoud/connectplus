export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/utils/crypto";
import { connectorDefinitionConfigSchema } from "@/lib/connectors/factory";
import { buildOAuth2AuthUrl } from "@/lib/connectors/factory/auth-handler";
import type { ConnectorDefinitionConfig } from "@/lib/connectors/factory/types";

/**
 * GET /api/v1/auth/:connector
 *
 * Returns the OAuth authorization URL for any config-driven connector.
 * Redirects user to the CRM's login page.
 */
export const GET = apiHandler(async (request: NextRequest, ctx, params) => {
  const { connector: connectorId } = params;
  const url = new URL(request.url);
  const redirectUri =
    url.searchParams.get("redirect_uri") ??
    `${url.origin}/api/v1/auth/${connectorId}/callback`;

  // Get tenant's connector credentials
  const config = await prisma.connectorConfig.findUnique({
    where: {
      tenantId_connectorId: {
        tenantId: ctx.tenant.tenantId,
        connectorId,
      },
    },
  });

  if (!config) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: `Connector '${connectorId}' not configured. Save credentials in Step 7 first.` } },
      { status: 404 }
    );
  }

  // Get connector definition for OAuth URLs
  const definition = await prisma.connectorDefinition.findUnique({
    where: { slug: connectorId },
  });

  if (!definition) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Connector definition '${connectorId}' not found` } },
      { status: 404 }
    );
  }

  const configResult = connectorDefinitionConfigSchema.safeParse(definition.config);
  if (!configResult.success) {
    return NextResponse.json(
      { error: { code: "INVALID_CONFIG", message: "Connector config is invalid" } },
      { status: 500 }
    );
  }

  const defConfig = configResult.data as ConnectorDefinitionConfig;

  if (defConfig.auth.type !== "oauth2" || !defConfig.auth.oauth2) {
    return NextResponse.json(
      { error: { code: "NOT_OAUTH", message: `Connector '${connectorId}' does not use OAuth2` } },
      { status: 400 }
    );
  }

  const credentials = decryptJson<Record<string, string>>(config.credentials);
  const clientId = credentials.clientId ?? "";

  if (!clientId) {
    return NextResponse.json(
      { error: { code: "MISSING_CLIENT_ID", message: "Client ID not configured. Enter it in Step 7." } },
      { status: 400 }
    );
  }

  // Build OAuth URL
  const authUrl = buildOAuth2AuthUrl(
    defConfig.auth,
    clientId,
    redirectUri,
    ctx.tenant.tenantId
  );

  // Store state for CSRF verification
  await prisma.connectorConfig.update({
    where: { id: config.id },
    data: { oauthState: ctx.tenant.tenantId },
  });

  // Redirect directly to the CRM's login page
  return NextResponse.redirect(authUrl);
});
