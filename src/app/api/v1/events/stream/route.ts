export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/middleware/auth";
import { sseManager } from "@/lib/sse";
import { logger } from "@/lib/observability/logger";

/**
 * GET /api/v1/events/stream — Server-Sent Events endpoint.
 * Authenticated via x-api-key header. Streams real-time events to the browser.
 */
export async function GET(request: NextRequest) {
  // Authenticate
  let tenant;
  try {
    tenant = await authenticateRequest(request);
  } catch (err) {
    return new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid or missing API key" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const tenantId = tenant.tenantId;
  const lastEventId = request.headers.get("Last-Event-ID");

  logger.info(
    { tenantId, lastEventId },
    "SSE stream connection requested"
  );

  const stream = new ReadableStream({
    start(controller) {
      // Register connection
      let conn;
      try {
        conn = sseManager.addConnection(tenantId, controller);
      } catch (err) {
        // Max connections reached
        controller.enqueue(
          new TextEncoder().encode(
            `event: error\ndata: ${JSON.stringify({ message: "Too many connections" })}\n\n`
          )
        );
        controller.close();
        return;
      }

      // Replay missed events if reconnecting
      if (lastEventId) {
        const missed = sseManager.replayAfter(tenantId, lastEventId);
        for (const event of missed) {
          sseManager.sendTo(conn, event);
        }
      }

      // Send initial connected event
      controller.enqueue(
        new TextEncoder().encode(
          `event: connected\ndata: ${JSON.stringify({ connectionId: conn.id, tenantId })}\n\n`
        )
      );

      // Store connection reference for cleanup on abort
      request.signal.addEventListener("abort", () => {
        sseManager.removeConnection(conn);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
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
