export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { eventBus } from "@/lib/core";
import { writeAuditLog } from "@/lib/observability/audit-log";
import { metrics } from "@/lib/observability/metrics";
import { logger } from "@/lib/observability/logger";

/**
 * POST /api/v1/rainbow/webhooks/[[...path]]
 *
 * Optional catch-all for Rainbow S2S callbacks.
 * Handles both /webhooks (base) and /webhooks/telephony/rvcp (sub-paths).
 *
 * Rainbow appends sub-paths to the callback URL:
 *   /connection, /presence, /telephony/rvcp, /message, etc.
 */
export const POST = apiHandler(
  async (request: NextRequest, ctx) => {
    const body = await request.json();

    // Extract the sub-path as event type (e.g. "telephony/rvcp", "connection")
    const url = new URL(request.url);
    const fullPath = url.pathname;
    const basePath = "/api/v1/rainbow/webhooks";
    const subPath = fullPath.length > basePath.length
      ? fullPath.slice(basePath.length + 1).replace(/\/$/, "")
      : "";

    const eventType = subPath || body?.eventType || body?.type || "unknown";
    const tenantId = url.searchParams.get("tenant") ?? ctx.tenant.tenantId;

    logger.info(
      { eventType, subPath, callId: body?.callId, tenantId, fullPath },
      "Rainbow S2S callback received"
    );

    metrics.increment("rainbow_callback", { eventType });

    // Emit to event bus for processing
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
