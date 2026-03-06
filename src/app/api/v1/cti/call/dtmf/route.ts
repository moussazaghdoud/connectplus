export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { getCall } from "@/lib/cti/state/call-state-store";

/**
 * POST /api/v1/cti/call/dtmf
 * Body: { callId, agentId, digits }
 *
 * Send DTMF tones during an active call.
 * The actual DTMF is handled by the WebRTC layer in the widget.
 * This endpoint tracks the action server-side.
 */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const { callId, agentId, digits } = await request.json();

  if (!callId || !agentId || !digits) {
    return NextResponse.json(
      { error: "Missing required fields: callId, agentId, digits" },
      { status: 400 }
    );
  }

  // Validate DTMF digits
  if (!/^[0-9A-D*#]+$/i.test(digits)) {
    return NextResponse.json(
      { error: "Invalid DTMF digits. Allowed: 0-9, A-D, *, #" },
      { status: 400 }
    );
  }

  const call = await getCall(ctx.tenant.tenantId, callId);
  if (!call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  if (call.state !== "connected") {
    return NextResponse.json(
      { error: "DTMF can only be sent during an active call" },
      { status: 400 }
    );
  }

  return NextResponse.json({ status: "sent", callId, digits });
});
