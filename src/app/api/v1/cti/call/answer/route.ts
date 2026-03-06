export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { getCall } from "@/lib/cti/state/call-state-store";
import { processEvent } from "@/lib/cti/bridge/event-processor";
import { writeAuditLog } from "@/lib/observability/audit-log";
import { metrics } from "@/lib/observability/metrics";

/**
 * POST /api/v1/cti/call/answer
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

  await processEvent({
    callId,
    direction: call.direction,
    fromNumber: call.fromNumber,
    toNumber: call.toNumber,
    timestamp: new Date().toISOString(),
    state: "connected",
    agentId,
    tenantId: ctx.tenant.tenantId,
  });

  metrics.increment("cti_calls_answered");
  writeAuditLog({
    tenantId: ctx.tenant.tenantId,
    correlationId: call.correlationId,
    actor: `agent:${agentId}`,
    action: "cti.call.answered",
    resource: `call:${callId}`,
    detail: { direction: call.direction, fromNumber: call.fromNumber },
  });

  return NextResponse.json({ status: "answered", callId });
});
