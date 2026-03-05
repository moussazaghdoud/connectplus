export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { getCall } from "@/lib/cti/state/call-state-store";
import { processEvent } from "@/lib/cti/bridge/event-processor";

/**
 * POST /api/v1/cti/call/hold
 * Body: { callId, agentId, on: boolean }
 */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const { callId, agentId, on } = await request.json();

  if (!callId || !agentId || typeof on !== "boolean") {
    return NextResponse.json(
      { error: "Missing required fields: callId, agentId, on (boolean)" },
      { status: 400 }
    );
  }

  const call = getCall(ctx.tenant.tenantId, callId);
  if (!call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  await processEvent({
    callId,
    direction: call.direction,
    fromNumber: call.fromNumber,
    toNumber: call.toNumber,
    timestamp: new Date().toISOString(),
    state: on ? "held" : "connected",
    agentId,
    tenantId: ctx.tenant.tenantId,
  });

  return NextResponse.json({ status: on ? "held" : "resumed", callId });
});
