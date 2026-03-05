export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { connectorRegistry } from "@/lib/core";
import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/utils/crypto";

/**
 * POST /api/v1/admin/connectors/test-search
 * Direct raw search test — makes a raw HTTP call to the CRM and returns
 * the exact status code, headers, and response body for debugging.
 */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const { connectorId, query, phone } = await request.json();
  const tenantId = ctx.tenant.tenantId;

  // 1. Get connector definition from DB
  const definition = await prisma.connectorDefinition.findUnique({
    where: { slug: connectorId },
  });

  if (!definition) {
    return NextResponse.json({ error: `Definition '${connectorId}' not found` }, { status: 404 });
  }

  const defConfig = definition.config as Record<string, unknown>;
  const authConfig = defConfig.auth as Record<string, unknown>;
  const oauth2Config = authConfig.oauth2 as Record<string, unknown>;
  const searchConfig = defConfig.contactSearch as Record<string, unknown>;
  const requestConfig = searchConfig.request as Record<string, unknown>;
  const queryParams = (requestConfig?.queryParams ?? {}) as Record<string, string>;

  // 2. Get credentials
  const config = await prisma.connectorConfig.findUnique({
    where: { tenantId_connectorId: { tenantId, connectorId } },
  });

  if (!config) {
    return NextResponse.json({ error: `No config for '${connectorId}'` }, { status: 404 });
  }

  const credentials = decryptJson<Record<string, string>>(config.credentials);
  const tokenInfo = {
    hasAccessToken: !!credentials.accessToken,
    hasRefreshToken: !!credentials.refreshToken,
    tokenExpiresAt: credentials.tokenExpiresAt,
    isExpired: credentials.tokenExpiresAt
      ? new Date(credentials.tokenExpiresAt) < new Date()
      : "unknown",
  };

  // 3. Build the raw API request
  const apiBaseUrl = defConfig.apiBaseUrl as string;
  const endpoint = searchConfig.endpoint as string;
  const method = searchConfig.method as string;
  const tokenPrefix = (oauth2Config?.tokenPrefix ?? "Bearer") as string;
  const queryStr = query ?? phone ?? "";

  let fullUrl: string;
  const headers: Record<string, string> = {
    Authorization: `${tokenPrefix} ${credentials.accessToken}`,
    "Content-Type": "application/json",
  };

  if (method === "GET") {
    const params = new URLSearchParams();
    for (const [key, tmpl] of Object.entries(queryParams)) {
      params.set(key, tmpl.replace("{{query}}", queryStr).replace("{{phone}}", phone ?? "").replace("{{email}}", ""));
    }
    fullUrl = `${apiBaseUrl}${endpoint}?${params.toString()}`;
  } else {
    fullUrl = `${apiBaseUrl}${endpoint}`;
  }

  // 4. Make raw HTTP call
  try {
    const resp = await fetch(fullUrl, { method, headers });
    const status = resp.status;
    const responseHeaders: Record<string, string> = {};
    resp.headers.forEach((v, k) => { responseHeaders[k] = v; });

    const bodyText = await resp.text().catch(() => "");
    let bodyJson: unknown = null;
    try { bodyJson = JSON.parse(bodyText); } catch { /* not json */ }

    return NextResponse.json({
      tokenInfo,
      request: {
        method,
        url: fullUrl,
        authHeader: `${tokenPrefix} ${credentials.accessToken?.slice(0, 20)}...`,
      },
      response: {
        status,
        statusText: resp.statusText,
        headers: responseHeaders,
        bodyPreview: bodyText.slice(0, 2000),
        bodyJson,
      },
    });
  } catch (err) {
    return NextResponse.json({
      tokenInfo,
      request: { method, url: fullUrl },
      error: (err as Error).message,
    }, { status: 500 });
  }
});
