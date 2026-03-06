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

    // Detect event type from subpath, body fields, or body structure
    let eventType = subPath || body?.eventType || body?.type || "";
    if (!eventType && body?.event && (body.event.legs || body.event.calls || body.event.endpoints)) {
      eventType = "telephony/rvcp";
    }
    if (!eventType && body?.presence) {
      eventType = "presence";
    }
    if (!eventType) eventType = "unknown";

    // Use tenant from query, or DEFAULT_TENANT_ID env, or fall back to ctx
    const tenantId = url.searchParams.get("tenant")
      ?? process.env.DEFAULT_TENANT_ID
      ?? ctx.tenant.tenantId;

    console.log(`[Rainbow Webhook] ${eventType} | tenant: ${tenantId} | body: ${JSON.stringify(body).slice(0, 500)}`);

    logger.info(
      { eventType, subPath, callId: body?.callId, tenantId },
      "Rainbow S2S callback received"
    );

    metrics.increment("rainbow_callback", { eventType });

    // Emit to event bus for processing (with tenantId for inbound routing)
    eventBus.emit("pbx.callback", {
      vendor: "rainbow",
      eventType,
      tenantId,
      payload: body,
    });

    // Audit log (non-blocking — don't fail the webhook response)
    writeAuditLog({
      tenantId,
      correlationId: ctx.correlationId,
      actor: "rainbow:s2s",
      action: `rainbow.${eventType}`,
      resource: `call:${body?.callId ?? "unknown"}`,
      detail: body,
    }).catch(() => {}); // swallow audit errors silently

    return NextResponse.json({ status: "received" });
  },
  { skipAuth: true }
);
