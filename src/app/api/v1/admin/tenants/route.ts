import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { CreateTenantSchema } from "@/lib/core/models/tenant";
import { prisma } from "@/lib/db";
import { generateApiKey, hashApiKey } from "@/lib/middleware/auth";
import { encryptJson } from "@/lib/utils/crypto";
import { writeAuditLog } from "@/lib/observability/audit-log";
import { ConflictError } from "@/lib/core/errors";

/**
 * POST /api/v1/admin/tenants — Create a new tenant.
 * This is the bootstrap endpoint. In production, protect with a master admin key.
 * For now, skipAuth so the first tenant can be created.
 */
export const POST = apiHandler(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const input = CreateTenantSchema.parse(body);

    // Check slug uniqueness
    const existing = await prisma.tenant.findUnique({
      where: { slug: input.slug },
    });
    if (existing) {
      throw new ConflictError(`Tenant with slug '${input.slug}' already exists`);
    }

    // Generate API key
    const rawApiKey = generateApiKey();
    const hashedApiKey = hashApiKey(rawApiKey);
    const apiKeyHint = rawApiKey.slice(-4);

    // Encrypt Rainbow credentials if provided
    const rainbowPassword = input.rainbowPassword
      ? encryptJson({ value: input.rainbowPassword })
      : null;
    const rainbowAppSecret = input.rainbowAppSecret
      ? encryptJson({ value: input.rainbowAppSecret })
      : null;

    const tenant = await prisma.tenant.create({
      data: {
        name: input.name,
        slug: input.slug,
        apiKey: hashedApiKey,
        apiKeyHint,
        rainbowLogin: input.rainbowLogin,
        rainbowPassword,
        rainbowAppId: input.rainbowAppId,
        rainbowAppSecret,
        rainbowHost: input.rainbowHost,
      },
    });

    await writeAuditLog({
      tenantId: tenant.id,
      correlationId: ctx.correlationId,
      actor: "system",
      action: "tenant.created",
      resource: `tenant:${tenant.id}`,
      detail: { slug: tenant.slug },
    });

    return NextResponse.json(
      {
        data: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          apiKeyHint: tenant.apiKeyHint,
          rainbowHost: tenant.rainbowHost,
          status: tenant.status,
          createdAt: tenant.createdAt,
        },
        // IMPORTANT: This is the only time the raw API key is returned
        apiKey: rawApiKey,
        warning:
          "Save this API key now. It will not be shown again.",
      },
      { status: 201 }
    );
  },
  { skipAuth: true }
);

/** GET /api/v1/admin/tenants — List tenants (requires auth) */
export const GET = apiHandler(async (_request: NextRequest, _ctx) => {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      apiKeyHint: true,
      status: true,
      rainbowHost: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          connectorConfigs: true,
          interactions: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: tenants });
});
