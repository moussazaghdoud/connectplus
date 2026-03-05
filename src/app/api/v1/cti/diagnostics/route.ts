export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { getRecentSummaries } from "@/lib/cti/session/call-context";
import { metrics } from "@/lib/observability/metrics";
import { getSubscriberCount } from "@/lib/cti/bridge/websocket-manager";

/**
 * GET /api/v1/cti/diagnostics
 *
 * Returns CTI call logging diagnostics:
 * - Recent call summaries (last 20)
 * - Success/failure/dedup counts from metrics
 * - Active SSE subscriber count
 */
export const GET = apiHandler(async (_request: NextRequest, ctx) => {
  const summaries = getRecentSummaries(20);
  const subscribers = getSubscriberCount(ctx.tenant.tenantId);

  return NextResponse.json({
    tenantId: ctx.tenant.tenantId,
    subscribers,
    recentCallLogs: summaries.map((s) => ({
      correlationId: s.correlationId,
      direction: s.direction,
      outcome: s.outcome,
      durationSeconds: s.durationSeconds,
      from: s.from,
      to: s.to,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      crm: s.crm,
      hasNotes: !!s.notes,
      hasRecording: !!s.recordingUrl,
    })),
    metrics: {
      callLogSuccess: metrics.get("cti_call_log_success"),
      callLogFailed: metrics.get("cti_call_log_failed"),
      callLogDeduplicated: metrics.get("cti_call_log_deduplicated"),
      screenPopsSent: metrics.get("cti_screen_pop_sent"),
      callsAnswered: metrics.get("cti_calls_answered"),
    },
  });
});
