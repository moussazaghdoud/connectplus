export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { interactionManager } from "@/lib/core";
import { StartInteractionSchema } from "@/lib/core/models/interaction";
import { writeAuditLog } from "@/lib/observability/audit-log";
import { checkIdempotency, storeIdempotencyResponse } from "@/lib/utils/idempotency";
import { createRainbowClientForTenant } from "@/lib/rainbow";
import { logger } from "@/lib/observability/logger";

/** POST /api/v1/interactions — Start a new interaction (call) */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const body = await request.json();
  const input = StartInteractionSchema.parse(body);

  // Idempotency check
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) {
    await checkIdempotency(idempotencyKey, ctx.tenant.tenantId);
  }

  // 1. Create interaction record
  const interaction = await interactionManager.create(input, idempotencyKey ?? undefined);

  // 2. Initiate on Rainbow (async — don't block the response)
  initiateRainbowCall(ctx.tenant.tenantId, interaction.id, input).catch(
    (err) => {
      logger.error(
        { err, interactionId: interaction.id },
        "Failed to initiate Rainbow call"
      );
    }
  );

  // 3. Audit log
  await writeAuditLog({
    tenantId: ctx.tenant.tenantId,
    correlationId: ctx.correlationId,
    actor: `api_key:${ctx.tenant.tenantSlug}`,
    action: "interaction.created",
    resource: `interaction:${interaction.id}`,
    detail: { type: input.type, connectorId: input.connectorId },
  });

  const responseBody = {
    data: interaction,
    meta: {
      pollUrl: `/api/v1/interactions/${interaction.id}`,
    },
  };

  // Store idempotency response
  if (idempotencyKey) {
    await storeIdempotencyResponse(
      idempotencyKey,
      ctx.tenant.tenantId,
      responseBody
    );
  }

  return NextResponse.json(responseBody, { status: 202 });
});

/** GET /api/v1/interactions — List interactions */
export const GET = apiHandler(async (request: NextRequest, _ctx) => {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const connectorId = url.searchParams.get("connectorId") ?? undefined;
  const limit = parseInt(url.searchParams.get("limit") ?? "50");
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  const result = await interactionManager.list({
    status,
    connectorId,
    limit,
    offset,
  });

  return NextResponse.json({
    data: result.items,
    meta: { total: result.total, limit, offset },
  });
});

/**
 * Initiate Rainbow call asynchronously.
 * Updates interaction status as the call progresses.
 */
async function initiateRainbowCall(
  tenantId: string,
  interactionId: string,
  input: { type: string; targetPhone?: string; contactId?: string }
) {
  try {
    const { calls } = await createRainbowClientForTenant(tenantId);

    // We need a tenant context for the interaction manager
    const { runWithTenant } = await import("@/lib/core/tenant-context");

    const tenantCtx = {
      tenantId,
      tenantSlug: "system",
      tenantStatus: "ACTIVE" as const,
    };

    await runWithTenant(tenantCtx, async () => {
      await interactionManager.updateStatus(interactionId, {
        status: "INITIATING",
      });

      if (input.type === "PHONE_CALL" && input.targetPhone) {
        const result = await calls.makeCallByPhoneNumber(input.targetPhone);
        await interactionManager.updateStatus(interactionId, {
          rainbowCallId: result.callId,
          status: "RINGING",
        });
      } else if (input.type === "AUDIO_CALL" && input.contactId) {
        const result = await calls.makeCall(input.contactId);
        await interactionManager.updateStatus(interactionId, {
          rainbowCallId: result.callId,
          status: "RINGING",
        });
      } else if (input.type === "VIDEO_CALL") {
        const conf = await calls.createConference(
          `Call ${interactionId.slice(0, 8)}`
        );
        await interactionManager.updateStatus(interactionId, {
          rainbowConfId: conf.confId,
          joinUrl: conf.joinUrl,
          status: "ACTIVE",
        });
      }
    });
  } catch (err) {
    logger.error({ err, interactionId }, "Rainbow call initiation failed");

    // Update status to FAILED
    const { runWithTenant } = await import("@/lib/core/tenant-context");
    const tenantCtx = {
      tenantId,
      tenantSlug: "system",
      tenantStatus: "ACTIVE" as const,
    };

    await runWithTenant(tenantCtx, () =>
      interactionManager.updateStatus(interactionId, {
        status: "FAILED",
        failureReason: (err as Error).message,
      })
    );
  }
}
