export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { prisma } from "@/lib/db";

/**
 * GET /api/v1/admin/connector-definitions/:slug — Get a single definition.
 */
export const GET = apiHandler(async (_request: NextRequest, ctx, params) => {
  const { slug } = params;

  const definition = await prisma.connectorDefinition.findUnique({
    where: { slug },
  });

  if (!definition) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Connector "${slug}" not found` } },
      { status: 404 }
    );
  }

  return NextResponse.json(definition);
});

/**
 * PUT /api/v1/admin/connector-definitions/:slug — Update a definition.
 *
 * Body: { name?, description?, logoUrl?, config?, status? }
 */
export const PUT = apiHandler(async (request: NextRequest, ctx, params) => {
  const { slug } = params;
  const body = await request.json();
  const { name, description, logoUrl, config } = body as {
    name?: string;
    description?: string;
    logoUrl?: string;
    config?: unknown;
  };

  const existing = await prisma.connectorDefinition.findUnique({ where: { slug } });
  if (!existing) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Connector "${slug}" not found` } },
      { status: 404 }
    );
  }

  const newVersion = existing.version + 1;

  const updated = await prisma.connectorDefinition.update({
    where: { slug },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(logoUrl !== undefined && { logoUrl }),
      ...(config !== undefined && { config: config as Record<string, unknown> }),
      version: newVersion,
    },
  });

  // Save version snapshot
  if (config !== undefined) {
    await prisma.connectorDefinitionVersion.create({
      data: {
        definitionId: existing.id,
        version: newVersion,
        config: config as Record<string, unknown>,
        changedBy: ctx.tenant.tenantSlug,
      },
    });
  }

  return NextResponse.json(updated);
});

/**
 * DELETE /api/v1/admin/connector-definitions/:slug — Archive a definition.
 */
export const DELETE = apiHandler(async (_request: NextRequest, _ctx, params) => {
  const { slug } = params;

  const existing = await prisma.connectorDefinition.findUnique({ where: { slug } });
  if (!existing) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Connector "${slug}" not found` } },
      { status: 404 }
    );
  }

  await prisma.connectorDefinition.update({
    where: { slug },
    data: { status: "ARCHIVED" },
  });

  return NextResponse.json({ status: "archived", slug });
});
