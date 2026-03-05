export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { prisma } from "@/lib/db";
import { connectorRegistry } from "@/lib/core/connector-registry";
import { writeAuditLog } from "@/lib/observability/audit-log";

/**
 * POST /api/v1/admin/marketplace/connectors/:slug/deactivate
 *
 * Sets status to DISABLED and unregisters from the connector registry.
 * Does NOT delete config or credentials — can be re-activated.
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

  // Code-based connectors can't be fully deactivated (they're compiled in),
  // but we update the DB status for marketplace display
  if (definition.tier === "CODE_BASED") {
    await prisma.connectorDefinition.update({
      where: { slug },
      data: { status: "DISABLED" },
    });
    return NextResponse.json({
      status: "deactivated",
      slug,
      note: "Code-based connector DB status set to DISABLED. The connector remains in the registry until next restart.",
    });
  }

  // Config-driven: unregister from registry
  if (connectorRegistry.has(slug)) {
    connectorRegistry.unregister(slug);
  }

  await prisma.connectorDefinition.update({
    where: { slug },
    data: { status: "DISABLED" },
  });

  await writeAuditLog({
    tenantId: ctx.tenant.tenantId,
    correlationId: ctx.correlationId,
    actor: `api_key:${ctx.tenant.tenantSlug}`,
    action: "marketplace.connector.deactivated",
    resource: `connector_definition:${slug}`,
    detail: {},
  });

  ctx.log.info({ slug }, "Marketplace connector deactivated");

  return NextResponse.json({ status: "deactivated", slug });
});
