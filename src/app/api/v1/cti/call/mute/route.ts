export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { getCall, setMuteState } from "@/lib/cti/state/call-state-store";

/**
 * POST /api/v1/cti/call/mute
 * Body: { callId, agentId, on: boolean }
 *
 * Mute is a local operation — no state change event broadcast.
 * The widget handles audio muting locally.
 */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const { callId, agentId, on } = await request.json();

  if (!callId || !agentId || typeof on !== "boolean") {
    return NextResponse.json(
      { error: "Missing required fields: callId, agentId, on (boolean)" },
      { status: 400 }
    );
  }

  const call = await getCall(ctx.tenant.tenantId, callId);
  if (!call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  await setMuteState(ctx.tenant.tenantId, callId, on);

  return NextResponse.json({ status: on ? "muted" : "unmuted", callId });
});
