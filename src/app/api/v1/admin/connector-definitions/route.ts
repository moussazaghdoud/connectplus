export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { prisma } from "@/lib/db";
import { connectorSlugSchema, connectorDefinitionConfigSchema } from "@/lib/connectors/factory";

/**
 * GET /api/v1/admin/connector-definitions — List all connector definitions.
 */
export const GET = apiHandler(async (_request: NextRequest, ctx) => {
  const definitions = await prisma.connectorDefinition.findMany({
    where: {
      OR: [
        { tenantId: null },
        { tenantId: ctx.tenant.tenantId },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      logoUrl: true,
      status: true,
      version: true,
      tenantId: true,
      createdBy: true,
      lastTestResult: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ items: definitions, total: definitions.length });
});

/**
 * POST /api/v1/admin/connector-definitions — Create a new connector definition.
 *
 * Body: { slug, name, description?, logoUrl?, config, tenantId? }
 */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const body = await request.json();
  const { slug, name, description, logoUrl, config } = body as {
    slug?: string;
    name?: string;
    description?: string;
    logoUrl?: string;
    config?: unknown;
  };

  if (!slug || !name) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "slug and name are required" } },
      { status: 400 }
    );
  }

  // Validate slug format
  const slugResult = connectorSlugSchema.safeParse(slug);
  if (!slugResult.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: slugResult.error.issues[0].message } },
      { status: 400 }
    );
  }

  // Check for duplicate slug
  const existing = await prisma.connectorDefinition.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json(
      { error: { code: "CONFLICT", message: `Connector with slug "${slug}" already exists` } },
      { status: 409 }
    );
  }

  // Validate config if provided (allow partial for drafts)
  if (config) {
    const configResult = connectorDefinitionConfigSchema.safeParse(config);
    if (!configResult.success) {
      // For drafts, we accept partial configs — only reject on activation
      ctx.log.debug({ errors: configResult.error.issues }, "Config validation warnings (draft)");
    }
  }

  const definition = await prisma.connectorDefinition.create({
    data: {
      slug,
      name,
      description: description ?? "",
      logoUrl: logoUrl ?? null,
      config: (config ?? {}) as never,
      tenantId: ctx.tenant.tenantId === "system" ? null : ctx.tenant.tenantId,
      createdBy: ctx.tenant.tenantSlug,
      status: "DRAFT",
      version: 1,
    },
  });

  // Save initial version
  await prisma.connectorDefinitionVersion.create({
    data: {
      definitionId: definition.id,
      version: 1,
      config: (config ?? {}) as never,
      changedBy: ctx.tenant.tenantSlug,
    },
  });

  return NextResponse.json(definition, { status: 201 });
});
