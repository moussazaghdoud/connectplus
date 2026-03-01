export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { eventBus } from "@/lib/core";
import { writeAuditLog } from "@/lib/observability/audit-log";
import { metrics } from "@/lib/observability/metrics";
import { logger } from "@/lib/observability/logger";

/**
 * POST /api/v1/rainbow/webhooks — S2S callback from Rainbow CPaaS.
 *
 * Rainbow appends sub-paths (/telephony/rvcp, /connection, etc.) to the
 * callback URL. Middleware rewrites those to this route with ?subpath=...
 *
 * Auth is skipped (Rainbow uses its own callback mechanism).
 */
export const POST = apiHandler(
  async (request: NextRequest, ctx) => {
    const body = await request.json();

    // Sub-path comes from middleware rewrite (e.g. "telephony/rvcp", "connection")
    const url = new URL(request.url);
    const subPath = url.searchParams.get("subpath") ?? "";

    const eventType = subPath || body?.eventType || body?.type || "unknown";
    const tenantId = url.searchParams.get("tenant") ?? ctx.tenant.tenantId;

    logger.info(
      { eventType, subPath, callId: body?.callId, tenantId },
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
