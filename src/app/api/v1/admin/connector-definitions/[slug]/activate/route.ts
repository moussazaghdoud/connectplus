export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { prisma } from "@/lib/db";
import { connectorDefinitionConfigSchema } from "@/lib/connectors/factory";
import { dynamicLoader } from "@/lib/connectors/factory/dynamic-loader";

/**
 * POST /api/v1/admin/connector-definitions/:slug/activate — Activate a connector.
 *
 * Validates the config is complete, sets status to ACTIVE, and hot-reloads
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

  // Full config validation required for activation
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

  // Update status
  await prisma.connectorDefinition.update({
    where: { slug },
    data: { status: "ACTIVE" },
  });

  // Hot-reload into registry
  const loaded = await dynamicLoader.reload(slug);

  ctx.log.info({ slug, loaded }, "Connector activated");

  return NextResponse.json({
    status: "activated",
    slug,
    loaded,
  });
});
