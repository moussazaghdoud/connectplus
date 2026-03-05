export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { prisma } from "@/lib/db";
import { connectorDefinitionConfigSchema } from "@/lib/connectors/factory";
import { dynamicLoader } from "@/lib/connectors/factory/dynamic-loader";
import { writeAuditLog } from "@/lib/observability/audit-log";

/**
 * POST /api/v1/admin/marketplace/connectors/:slug/activate
 *
 * Validates config completeness, sets status to ACTIVE, and hot-reloads
 * the connector into the registry.
 */
export const POST = apiHandler(async (_request: NextRequest, ctx, params) => {
  const { slug } = params;

  const definition = await prisma.connectorDefinition.findUnique({ where: { slug } });
  if (!definition) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Connector "${slug}" not found` } },
      { status: 404 }
    );
  }

  // Code-based connectors are always active via registry — no config validation needed
  if (definition.tier === "CODE_BASED") {
    if (definition.status !== "ACTIVE") {
      await prisma.connectorDefinition.update({
        where: { slug },
        data: { status: "ACTIVE" },
      });
    }
    return NextResponse.json({ status: "activated", slug, tier: "CODE_BASED" });
  }

  // Config-driven: full config validation required
  const configResult = connectorDefinitionConfigSchema.safeParse(definition.config);
  if (!configResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Config is incomplete or invalid — cannot activate",
          details: configResult.error.issues,
        },
      },
      { status: 400 }
    );
  }

  await prisma.connectorDefinition.update({
    where: { slug },
    data: { status: "ACTIVE" },
  });

  const loaded = await dynamicLoader.reload(slug);

  await writeAuditLog({
    tenantId: ctx.tenant.tenantId,
    correlationId: ctx.correlationId,
    actor: `api_key:${ctx.tenant.tenantSlug}`,
    action: "marketplace.connector.activated",
    resource: `connector_definition:${slug}`,
    detail: { loaded },
  });

  ctx.log.info({ slug, loaded }, "Marketplace connector activated");

  return NextResponse.json({ status: "activated", slug, loaded });
});
