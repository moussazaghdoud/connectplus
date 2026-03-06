export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { authenticateRequest } from "@/lib/middleware/auth";
import {
  addSubscriber,
  removeSubscriber,
} from "@/lib/cti/bridge/websocket-manager";
import { getAgentCalls } from "@/lib/cti/state/call-state-store";
import { logger } from "@/lib/observability/logger";

const log = logger.child({ module: "cti-stream" });

/**
 * GET /api/v1/cti/stream
 *
 * SSE endpoint for CTI widget — pushes real-time call events.
 * Query params: agentId (required)
 *
 * Events:
 *   connected     - initial connection ack
 *   state.sync    - current active calls (on connect/reconnect)
 *   call.event    - real-time call state change
 *   heartbeat     - keep-alive every 30s
 */
export async function GET(request: NextRequest) {
  let tenantId: string;
  try {
    const ctx = await authenticateRequest(request);
    tenantId = ctx.tenantId;
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const agentId = url.searchParams.get("agentId");
  if (!agentId) {
    return new Response("agentId query param required", { status: 400 });
  }

  const subscriberId = randomUUID();

  const stream = new ReadableStream({
    async start(controller) {
      addSubscriber({
        id: subscriberId,
        tenantId,
        agentId,
        controller,
        connectedAt: Date.now(),
      });

      // Send current active calls for reconnection sync
      const activeCalls = await getAgentCalls(tenantId, agentId);
      if (activeCalls.length > 0) {
        const encoder = new TextEncoder();
        const payload = `event: state.sync\ndata: ${JSON.stringify({ activeCalls })}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }
    },
    cancel() {
      removeSubscriber(subscriberId);
      log.info({ subscriberId, agentId }, "CTI stream cancelled");
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
