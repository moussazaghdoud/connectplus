export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { apiHandler } from "@/lib/middleware/api-handler";
import { processEvent } from "@/lib/cti/bridge/event-processor";
import type { RawTelephonyEvent } from "@/lib/cti/bridge/event-processor";
import { writeAuditLog } from "@/lib/observability/audit-log";
import { metrics } from "@/lib/observability/metrics";
import { logger } from "@/lib/observability/logger";

const log = logger.child({ module: "cti-events-route" });

const WEBHOOK_SECRET = process.env.CTI_WEBHOOK_SECRET;

/**
 * Verify HMAC-SHA256 signature on incoming webhook.
 * Header: X-CTI-Signature: sha256=<hex>
 */
function verifySignature(body: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET) {
    // No secret configured — skip verification (dev mode)
    return true;
  }
  if (!signature) return false;

  const expected = createHmac("sha256", WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  const provided = signature.replace(/^sha256=/, "");

  try {
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(provided, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * POST /api/v1/cti/events
 *
 * Receives raw telephony events from Rainbow (webhooks or WebRTC reports).
 * Verifies HMAC signature, then processes through the CTI event bridge pipeline:
 *   verify -> correlate -> de-duplicate -> enrich -> broadcast -> log
 */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const startTime = Date.now();
  const bodyText = await request.text();

  // HMAC signature verification
  const signature = request.headers.get("x-cti-signature");
  if (!verifySignature(bodyText, signature)) {
    metrics.increment("cti_webhook_rejected");
    log.warn({ tenantId: ctx.tenant.tenantId }, "CTI webhook signature verification failed");
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 401 }
    );
  }

  const body = JSON.parse(bodyText);

  const raw: RawTelephonyEvent = {
    callId: body.callId,
    direction: body.direction || "inbound",
    fromNumber: body.fromNumber || body.from,
    toNumber: body.toNumber || body.to,
    timestamp: body.timestamp || new Date().toISOString(),
    state: body.state,
    agentId: body.agentId,
    tenantId: ctx.tenant.tenantId,
    durationSecs: body.durationSecs,
    recordingUrl: body.recordingUrl,
  };

  if (!raw.callId || !raw.state || !raw.agentId) {
    return NextResponse.json(
      { error: "Missing required fields: callId, state, agentId" },
      { status: 400 }
    );
  }

  metrics.increment("cti_events_received", { state: raw.state });

  const event = await processEvent(raw);
  const latencyMs = Date.now() - startTime;

  if (!event) {
    metrics.increment("cti_events_deduplicated");
    return NextResponse.json({ status: "duplicate", message: "Event deduplicated" });
  }

  metrics.increment("cti_events_processed", { state: event.state });

  log.info(
    { correlationId: event.correlationId, state: event.state, latencyMs },
    "CTI event received and processed"
  );

  // Audit log for call state changes
  writeAuditLog({
    tenantId: ctx.tenant.tenantId,
    correlationId: event.correlationId,
    actor: `agent:${event.agentId}`,
    action: `cti.call.${event.state}`,
    resource: `call:${event.callId}`,
    detail: {
      direction: event.direction,
      fromNumber: event.fromNumber,
      toNumber: event.toNumber,
      state: event.state,
      latencyMs,
    },
  });

  return NextResponse.json({
    status: "processed",
    correlationId: event.correlationId,
    state: event.state,
    latencyMs,
  });
});
