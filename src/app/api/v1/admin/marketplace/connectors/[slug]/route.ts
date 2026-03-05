export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { prisma } from "@/lib/db";
import { connectorRegistry } from "@/lib/core/connector-registry";
import { decryptJson } from "@/lib/utils/crypto";

/**
 * GET /api/v1/admin/marketplace/connectors/:slug
 *
 * Returns full detail for a single connector, including tenant-specific
 * configuration status and masked credentials.
 */
export const GET = apiHandler(async (_request: NextRequest, ctx, params) => {
  const { slug } = params;

  // Look up in DB first
  const def = await prisma.connectorDefinition.findUnique({ where: { slug } });

  // Fall back to registry-only connector
  if (!def) {
    const connector = connectorRegistry.tryGet(slug);
    if (!connector) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: `Connector "${slug}" not found` } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      slug: connector.manifest.id,
      name: connector.manifest.name,
      tier: "CODE_BASED",
      status: "ACTIVE",
      version: connector.manifest.version,
      authType: connector.manifest.authType,
      capabilities: connector.manifest.capabilities,
      tenantConfigured: false,
      tenantEnabled: false,
      tokenStatus: "missing",
    });
  }

  // Tenant config overlay
  const tenantConfig = await prisma.connectorConfig.findUnique({
    where: {
      tenantId_connectorId: {
        tenantId: ctx.tenant.tenantId,
        connectorId: slug,
      },
    },
  });

  // Build masked credential info (never expose secrets)
  let credentialStatus: Record<string, string> = {};
  let tokenStatus: "valid" | "expired" | "missing" = "missing";

  if (tenantConfig) {
    try {
      const creds = decryptJson<Record<string, string>>(tenantConfig.credentials);
      credentialStatus = Object.fromEntries(
        Object.keys(creds).map((key) => {
          if (key.toLowerCase().includes("secret") || key.toLowerCase().includes("password") || key.toLowerCase().includes("token")) {
            const val = creds[key];
            return [key, val ? `***${val.slice(-4)}` : "not set"];
          }
          return [key, creds[key] ? "set" : "not set"];
        })
      );

      if (creds.accessToken) {
        const expiresAt = creds.tokenExpiresAt ? new Date(creds.tokenExpiresAt) : null;
        tokenStatus = !expiresAt ? "valid" : expiresAt > new Date() ? "valid" : "expired";
      }
    } catch {
      credentialStatus = { error: "decryption_failed" };
    }
  }

  // Versions
  const versions = await prisma.connectorDefinitionVersion.findMany({
    where: { definitionId: def.id },
    orderBy: { version: "desc" },
    take: 10,
    select: { version: true, changedBy: true, createdAt: true },
  });

  return NextResponse.json({
    slug: def.slug,
    name: def.name,
    shortDesc: def.shortDesc,
    description: def.description,
    category: def.category,
    tier: def.tier,
    authType: def.authType,
    status: def.status,
    version: def.version,
    vendorUrl: def.vendorUrl,
    docsUrl: def.docsUrl,
    iconName: def.iconName,
    pricingTier: def.pricingTier,
    logoUrl: def.logoUrl,
    prerequisites: def.prerequisites,
    setupSteps: def.setupSteps,
    lastTestResult: def.lastTestResult,
    lastHealthAt: def.lastHealthAt,
    lastHealthStatus: def.lastHealthStatus,
    lastHealthLatency: def.lastHealthLatency,
    lastTokenRefreshAt: def.lastTokenRefreshAt,
    lastWebhookAt: def.lastWebhookAt,
    // Tenant-specific
    tenantConfigured: !!tenantConfig,
    tenantEnabled: tenantConfig?.enabled ?? false,
    tokenStatus,
    credentialStatus,
    // History
    versions,
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  });
});
