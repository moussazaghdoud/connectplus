export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { interactionManager } from "@/lib/core";
import { UpdateInteractionSchema } from "@/lib/core/models/interaction";
import { writeAuditLog } from "@/lib/observability/audit-log";

/** GET /api/v1/interactions/:id — Get interaction by ID */
export const GET = apiHandler(async (_request: NextRequest, ctx, params) => {
  const interaction = await interactionManager.getById(params.id);

  return NextResponse.json({ data: interaction });
});

/** PATCH /api/v1/interactions/:id — Update interaction status */
export const PATCH = apiHandler(async (request: NextRequest, ctx, params) => {
  const body = await request.json();
  const input = UpdateInteractionSchema.parse(body);

  const updated = await interactionManager.updateStatus(params.id, input);

  await writeAuditLog({
    tenantId: ctx.tenant.tenantId,
    correlationId: ctx.correlationId,
    actor: `api_key:${ctx.tenant.tenantSlug}`,
    action: "interaction.updated",
    resource: `interaction:${params.id}`,
    detail: { status: input.status },
  });

  return NextResponse.json({ data: updated });
});
