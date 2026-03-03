export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encryptJson, decryptJson } from "@/lib/utils/crypto";
import { writeAuditLog } from "@/lib/observability/audit-log";
import { logger } from "@/lib/observability/logger";
import { v4 as uuidv4 } from "uuid";
import { connectorDefinitionConfigSchema } from "@/lib/connectors/factory";
import { exchangeOAuth2Token } from "@/lib/connectors/factory/auth-handler";
import type { ConnectorDefinitionConfig } from "@/lib/connectors/factory/types";

/**
 * GET /api/v1/auth/:connector/callback
 *
 * OAuth2 callback for any config-driven connector.
 * CRM redirects here after the user authorizes.
 * state = tenantId (for CSRF verification).
 */
export async function GET(
  request: NextRequest,
  routeCtx: { params: Promise<Record<string, string>> }
) {
  const { connector: connectorId } = await routeCtx.params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const correlationId = uuidv4();

  if (error) {
    logger.warn({ error, connectorId }, "OAuth denied by user");
    return NextResponse.json(
      { error: { code: "OAUTH_DENIED", message: `OAuth denied: ${error}` } },
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
    // 1. Get tenant's connector config
    const config = await prisma.connectorConfig.findUnique({
      where: { tenantId_connectorId: { tenantId, connectorId } },
    });

    if (!config) {
      return NextResponse.json(
        { error: { code: "NOT_CONFIGURED", message: `Connector '${connectorId}' not configured for this tenant` } },
        { status: 404 }
      );
    }

    // 2. Get connector definition for token URL
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

    // 3. Decrypt stored credentials
    const credentials = decryptJson<Record<string, string>>(config.credentials);
    const redirectUri = credentials.redirectUri ?? `${url.origin}/api/v1/auth/${connectorId}/callback`;

    // 4. Exchange code for tokens
    const tokens = await exchangeOAuth2Token(
      defConfig.auth,
      credentials.clientId ?? "",
      credentials.clientSecret ?? "",
      redirectUri,
      code
    );

    // 5. Store tokens (encrypted) — merge with existing credentials
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
        oauthState: null,
      },
    });

    // 6. Audit log
    await writeAuditLog({
      tenantId,
      correlationId,
      actor: `oauth:${connectorId}`,
      action: "connector.oauth_completed",
      resource: `connector_config:${config.id}`,
      detail: { connectorId },
    });

    logger.info({ tenantId, connectorId }, "OAuth flow completed successfully");

    // 7. Return success page
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head><title>Connected!</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0fdf4">
  <div style="text-align:center;padding:2rem">
    <h1 style="color:#16a34a;font-size:2rem">Connected!</h1>
    <p style="color:#666;margin:1rem 0">${connectorId} has been connected successfully.</p>
    <p style="color:#999;font-size:0.875rem">You can close this window.</p>
  </div>
</body>
</html>`,
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    logger.error({ err, tenantId, connectorId }, "OAuth callback error");

    return NextResponse.json(
      { error: { code: "OAUTH_ERROR", message: (err as Error).message } },
      { status: 500 }
    );
  }
}
