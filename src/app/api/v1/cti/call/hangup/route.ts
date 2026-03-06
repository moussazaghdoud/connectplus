export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { getCall } from "@/lib/cti/state/call-state-store";
import { processEvent } from "@/lib/cti/bridge/event-processor";
import { writeAuditLog } from "@/lib/observability/audit-log";
import { metrics } from "@/lib/observability/metrics";

/**
 * POST /api/v1/cti/call/hangup
 * Body: { callId, agentId }
 */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const { callId, agentId } = await request.json();

  if (!callId || !agentId) {
    return NextResponse.json(
      { error: "Missing required fields: callId, agentId" },
      { status: 400 }
    );
  }

  const call = await getCall(ctx.tenant.tenantId, callId);
  if (!call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const now = new Date();
  const startedAt = new Date(call.startedAt);
  const durationSecs = Math.round((now.getTime() - startedAt.getTime()) / 1000);

  await processEvent({
    callId,
    direction: call.direction,
    fromNumber: call.fromNumber,
    toNumber: call.toNumber,
    timestamp: now.toISOString(),
    state: "ended",
    agentId,
    tenantId: ctx.tenant.tenantId,
    durationSecs,
  });

  metrics.increment("cti_calls_ended");
  writeAuditLog({
    tenantId: ctx.tenant.tenantId,
    correlationId: call.correlationId,
    actor: `agent:${agentId}`,
    action: "cti.call.hangup",
    resource: `call:${callId}`,
    detail: { durationSecs, direction: call.direction },
  });

  return NextResponse.json({ status: "ended", callId, durationSecs });
});
