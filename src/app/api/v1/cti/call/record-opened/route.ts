export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { markRecordOpened } from "@/lib/cti/session/call-context";
import { writeAuditLog } from "@/lib/observability/audit-log";
import { metrics } from "@/lib/observability/metrics";

/**
 * POST /api/v1/cti/call/record-opened
 * Body: { callId, agentId, recordId, module }
 *
 * Tracks when an agent opens a CRM record from the screen pop.
 */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const { callId, agentId, recordId, module } = await request.json();

  if (!callId || !agentId) {
    return NextResponse.json(
      { error: "Missing required fields: callId, agentId" },
      { status: 400 }
    );
  }

  markRecordOpened(callId);
  metrics.increment("cti_record_opened");

  writeAuditLog({
    tenantId: ctx.tenant.tenantId,
    correlationId: callId,
    actor: `agent:${agentId}`,
    action: "cti.record_opened",
    resource: `${module || "record"}:${recordId || "unknown"}`,
    detail: { callId, recordId, module },
  });

  return NextResponse.json({ status: "tracked" });
});
