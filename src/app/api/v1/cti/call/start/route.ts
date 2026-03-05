export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { processEvent } from "@/lib/cti/bridge/event-processor";

/**
 * POST /api/v1/cti/call/start
 *
 * Click-to-call: initiates an outbound call.
 * Body: { number, agentId, zohoRecordId?, zohoUserId? }
 */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const body = await request.json();
  const { number, agentId, zohoRecordId, zohoUserId } = body;

  if (!number || !agentId) {
    return NextResponse.json(
      { error: "Missing required fields: number, agentId" },
      { status: 400 }
    );
  }

  // Generate a synthetic callId for tracking (Rainbow will assign real one)
  const callId = `outbound-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Process as outbound ringing event
  await processEvent({
    callId,
    direction: "outbound",
    fromNumber: agentId,
    toNumber: number,
    timestamp: new Date().toISOString(),
    state: "ringing",
    agentId,
    tenantId: ctx.tenant.tenantId,
  });

  return NextResponse.json({
    status: "initiated",
    callId,
    message: "Outbound call initiated. Widget will receive events via SSE.",
  });
});
