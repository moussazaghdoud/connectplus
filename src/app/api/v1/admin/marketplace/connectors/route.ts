export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { prisma } from "@/lib/db";
import { connectorRegistry } from "@/lib/core/connector-registry";
import { decryptJson } from "@/lib/utils/crypto";
import type { ConnectorMarketplaceEntry } from "@/lib/connectors/marketplace/types";

/**
 * GET /api/v1/admin/marketplace/connectors
 *
 * Returns a unified list of all connectors — merges DB definitions with
 * code-based connectors from the registry. Supports search, filter by
 * status, and filter by category via query params.
 *
 * Query params:
 *   ?search=zoho       — filter by name/slug (case-insensitive)
 *   ?status=ACTIVE     — filter by status (comma-separated)
 *   ?category=CRM      — filter by category (comma-separated)
 */
export const GET = apiHandler(async (request: NextRequest, ctx) => {
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.toLowerCase() ?? "";
  const statusFilter = url.searchParams.get("status")?.split(",").map((s) => s.trim()) ?? [];
  const categoryFilter = url.searchParams.get("category")?.split(",").map((s) => s.trim()) ?? [];

  // 1. Load all definitions from DB (global + tenant-specific)
  const definitions = await prisma.connectorDefinition.findMany({
    where: {
      OR: [{ tenantId: null }, { tenantId: ctx.tenant.tenantId }],
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  // 2. Load tenant's connector configs for status overlay
  const configs = await prisma.connectorConfig.findMany({
    where: { tenantId: ctx.tenant.tenantId },
  });
  const configMap = new Map(configs.map((c) => [c.connectorId, c]));

  // 3. Track which slugs we've seen from DB
  const seenSlugs = new Set<string>();

  // 4. Build entries from DB definitions
  const entries: ConnectorMarketplaceEntry[] = [];

  for (const def of definitions) {
    seenSlugs.add(def.slug);
    const tenantConfig = configMap.get(def.slug);
    entries.push(buildEntry(def, tenantConfig));
  }

  // 5. Add code-based connectors not already in DB
  for (const manifest of connectorRegistry.listManifests()) {
    if (seenSlugs.has(manifest.id)) continue;
    const tenantConfig = configMap.get(manifest.id);
    entries.push({
      slug: manifest.id,
      name: manifest.name,
      shortDesc: "",
      description: "",
      category: "CRM",
      tier: "CODE_BASED",
      authType: manifest.authType,
      status: "ACTIVE",
      version: 1,
      vendorUrl: null,
      docsUrl: null,
      iconName: manifest.id,
      pricingTier: null,
      prerequisites: [],
      setupSteps: [],
      logoUrl: null,
      lastHealthAt: null,
      lastHealthStatus: null,
      lastHealthLatency: null,
      lastTokenRefreshAt: null,
      lastWebhookAt: null,
      lastTestResult: null,
      tenantConfigured: !!tenantConfig,
      tenantEnabled: tenantConfig?.enabled ?? false,
      tokenStatus: getTokenStatus(tenantConfig),
    });
  }

  // 6. Apply filters
  let filtered = entries;

  if (search) {
    filtered = filtered.filter(
      (e) =>
        e.name.toLowerCase().includes(search) ||
        e.slug.toLowerCase().includes(search) ||
        e.shortDesc.toLowerCase().includes(search)
    );
  }

  if (statusFilter.length > 0) {
    filtered = filtered.filter((e) => statusFilter.includes(e.status));
  }

  if (categoryFilter.length > 0) {
    filtered = filtered.filter((e) => categoryFilter.includes(e.category));
  }

  return NextResponse.json({ items: filtered, total: filtered.length });
});

// ── Helpers ────────────────────────────────────────────────────

function buildEntry(
  def: {
    slug: string;
    name: string;
    shortDesc: string;
    description: string;
    category: string;
    tier: string;
    authType: string;
    status: string;
    version: number;
    vendorUrl: string | null;
    docsUrl: string | null;
    iconName: string | null;
    pricingTier: string | null;
    prerequisites: unknown;
    setupSteps: unknown;
    logoUrl: string | null;
    lastHealthAt: Date | null;
    lastHealthStatus: boolean | null;
    lastHealthLatency: number | null;
    lastTokenRefreshAt: Date | null;
    lastWebhookAt: Date | null;
    lastTestResult: unknown;
  },
  tenantConfig?: { enabled: boolean; credentials: string } | null
): ConnectorMarketplaceEntry {
  return {
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
    prerequisites: (def.prerequisites ?? []) as string[],
    setupSteps: (def.setupSteps ?? []) as ConnectorMarketplaceEntry["setupSteps"],
    logoUrl: def.logoUrl,
    lastHealthAt: def.lastHealthAt?.toISOString() ?? null,
    lastHealthStatus: def.lastHealthStatus,
    lastHealthLatency: def.lastHealthLatency,
    lastTokenRefreshAt: def.lastTokenRefreshAt?.toISOString() ?? null,
    lastWebhookAt: def.lastWebhookAt?.toISOString() ?? null,
    lastTestResult: def.lastTestResult,
    tenantConfigured: !!tenantConfig,
    tenantEnabled: tenantConfig?.enabled ?? false,
    tokenStatus: getTokenStatus(tenantConfig),
  };
}

function getTokenStatus(
  config?: { credentials: string } | null
): "valid" | "expired" | "missing" {
  if (!config) return "missing";
  try {
    const creds = decryptJson<Record<string, string>>(config.credentials);
    if (!creds.accessToken) return "missing";
    const expiresAt = creds.tokenExpiresAt ? new Date(creds.tokenExpiresAt) : null;
    if (!expiresAt) return "valid"; // no expiry = assume valid
    return expiresAt > new Date() ? "valid" : "expired";
  } catch {
    return "missing";
  }
}
