export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { eventBus } from "@/lib/core";
import { writeAuditLog } from "@/lib/observability/audit-log";
import { metrics } from "@/lib/observability/metrics";
import { logger } from "@/lib/observability/logger";

/**
 * POST /api/v1/rainbow/webhooks/[...path] — Catch-all for Rainbow S2S callbacks.
 *
 * Rainbow appends sub-paths to the callback URL:
 *   /connection, /presence, /telephony/rvcp, /message, etc.
 *
 * This route catches all of them and extracts the sub-path as the event type.
 */
export const POST = apiHandler(
  async (request: NextRequest, ctx) => {
    const body = await request.json();

    // Extract the sub-path as event type (e.g. "telephony/rvcp", "connection")
    const url = new URL(request.url);
    const fullPath = url.pathname;
    const basePath = "/api/v1/rainbow/webhooks/";
    const subPath = fullPath.startsWith(basePath)
      ? fullPath.slice(basePath.length).replace(/\/$/, "")
      : "unknown";

    const eventType = body?.eventType ?? body?.type ?? subPath;
    const tenantId = url.searchParams.get("tenant") ?? ctx.tenant.tenantId;

    logger.info(
      { eventType, subPath, callId: body?.callId, tenantId },
      "Rainbow S2S callback received"
    );

    metrics.increment("rainbow_callback", { eventType: subPath });

    // Emit to event bus for processing
    eventBus.emit("rainbow.callback", {
      eventType: subPath,
      tenantId,
      payload: body,
    });

    // Audit log
    await writeAuditLog({
      tenantId,
      correlationId: ctx.correlationId,
      actor: "rainbow:s2s",
      action: `rainbow.${subPath}`,
      resource: `call:${body?.callId ?? "unknown"}`,
      detail: body,
    });

    return NextResponse.json({ status: "received" });
  },
  { skipAuth: true }
);
