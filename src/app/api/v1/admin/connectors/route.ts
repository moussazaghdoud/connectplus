import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { connectorRegistry } from "@/lib/core";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/utils/crypto";
import { writeAuditLog } from "@/lib/observability/audit-log";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

const ConfigureConnectorSchema = z.object({
  connectorId: z.string().min(1),
  enabled: z.boolean().default(true),
  credentials: z.record(z.string(), z.string()),
  settings: z.record(z.string(), z.unknown()).default({}),
});

/** GET /api/v1/admin/connectors — List available connectors and their status */
export const GET = apiHandler(async (_request: NextRequest, ctx) => {
  // All registered connectors
  const manifests = connectorRegistry.listManifests();

  // Tenant's configured connectors
  const configs = await prisma.connectorConfig.findMany({
    where: { tenantId: ctx.tenant.tenantId },
  });

  const configMap = new Map(
    configs.map((c: { connectorId: string; enabled: boolean; id: string }) => [
      c.connectorId,
      c,
    ])
  );

  const data = manifests.map((m) => {
    const config = configMap.get(m.id) as
      | { enabled: boolean; id: string }
      | undefined;
    return {
      ...m,
      configured: !!config,
      enabled: config?.enabled ?? false,
      configId: config?.id,
    };
  });

  return NextResponse.json({ data });
});

/** POST /api/v1/admin/connectors — Configure a connector for the tenant */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const body = await request.json();
  const input = ConfigureConnectorSchema.parse(body);

  // Verify connector exists
  if (!connectorRegistry.has(input.connectorId)) {
    return NextResponse.json(
      {
        error: {
          code: "CONNECTOR_NOT_FOUND",
          message: `Connector '${input.connectorId}' is not registered`,
          available: connectorRegistry.listIds(),
        },
      },
      { status: 404 }
    );
  }

  // Encrypt credentials
  const encryptedCreds = encryptJson(input.credentials);

  const config = await prisma.connectorConfig.upsert({
    where: {
      tenantId_connectorId: {
        tenantId: ctx.tenant.tenantId,
        connectorId: input.connectorId,
      },
    },
    create: {
      tenantId: ctx.tenant.tenantId,
      connectorId: input.connectorId,
      enabled: input.enabled,
      credentials: encryptedCreds,
      settings: input.settings as Prisma.InputJsonValue,
    },
    update: {
      enabled: input.enabled,
      credentials: encryptedCreds,
      settings: input.settings as Prisma.InputJsonValue,
    },
  });

  await writeAuditLog({
    tenantId: ctx.tenant.tenantId,
    correlationId: ctx.correlationId,
    actor: `api_key:${ctx.tenant.tenantSlug}`,
    action: "connector.configured",
    resource: `connector_config:${config.id}`,
    detail: { connectorId: input.connectorId, enabled: input.enabled },
  });

  return NextResponse.json({
    data: {
      id: config.id,
      connectorId: config.connectorId,
      enabled: config.enabled,
      configured: true,
    },
  });
});
