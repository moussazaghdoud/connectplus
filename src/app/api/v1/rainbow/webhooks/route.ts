export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { eventBus } from "@/lib/core";
import { writeAuditLog } from "@/lib/observability/audit-log";
import { metrics } from "@/lib/observability/metrics";
import { logger } from "@/lib/observability/logger";

/**
 * POST /api/v1/rainbow/webhooks — S2S callback from Rainbow CPaaS.
 * Receives call state updates, presence changes, etc.
 * Auth is skipped (Rainbow uses its own callback mechanism).
 */
export const POST = apiHandler(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const eventType = body?.eventType ?? body?.type ?? "unknown";

    // Extract tenant from query string: ?tenant=<tenantId>
    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenant") ?? ctx.tenant.tenantId;

    logger.info(
      { eventType, callId: body?.callId, tenantId },
      "Rainbow S2S callback received"
    );

    metrics.increment("rainbow_callback", { eventType });

    // Emit to event bus for processing (with tenantId for inbound routing)
    eventBus.emit("rainbow.callback", {
      eventType,
      tenantId,
      payload: body,
    });

    // Audit log
    await writeAuditLog({
      tenantId,
      correlationId: ctx.correlationId,
      actor: "rainbow:s2s",
      action: `rainbow.${eventType}`,
      resource: `call:${body?.callId ?? "unknown"}`,
      detail: body,
    });

    return NextResponse.json({ status: "received" });
  },
  { skipAuth: true }
);
