export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { prisma } from "@/lib/db";

/**
 * GET /api/v1/admin/connector-definitions/:slug/versions — List all versions.
 */
export const GET = apiHandler(async (_request: NextRequest, _ctx, params) => {
  const { slug } = params;

  const definition = await prisma.connectorDefinition.findUnique({ where: { slug } });
  if (!definition) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Connector "${slug}" not found` } },
      { status: 404 }
    );
  }

  const versions = await prisma.connectorDefinitionVersion.findMany({
    where: { definitionId: definition.id },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      changedBy: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    currentVersion: definition.version,
    versions,
  });
});

/**
 * POST /api/v1/admin/connector-definitions/:slug/versions — Rollback to a version.
 *
 * Body: { version: number }
 */
export const POST = apiHandler(async (request: NextRequest, ctx, params) => {
  const { slug } = params;
  const body = await request.json();
  const { version } = body as { version?: number };

  if (!version) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "version is required" } },
      { status: 400 }
    );
  }

  const definition = await prisma.connectorDefinition.findUnique({ where: { slug } });
  if (!definition) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Connector "${slug}" not found` } },
      { status: 404 }
    );
  }

  const targetVersion = await prisma.connectorDefinitionVersion.findUnique({
    where: { definitionId_version: { definitionId: definition.id, version } },
  });

  if (!targetVersion) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Version ${version} not found` } },
      { status: 404 }
    );
  }

  const newVersion = definition.version + 1;

  await prisma.connectorDefinition.update({
    where: { slug },
    data: {
      config: targetVersion.config as Record<string, unknown>,
      version: newVersion,
    },
  });

  // Save rollback as new version
  await prisma.connectorDefinitionVersion.create({
    data: {
      definitionId: definition.id,
      version: newVersion,
      config: targetVersion.config as Record<string, unknown>,
      changedBy: `${ctx.tenant.tenantSlug} (rollback from v${version})`,
    },
  });

  ctx.log.info({ slug, fromVersion: version, toVersion: newVersion }, "Connector rolled back");

  return NextResponse.json({
    status: "rolled_back",
    slug,
    fromVersion: version,
    newVersion,
  });
});
