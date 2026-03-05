export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { updateSummaryNotes, getCallSummary } from "@/lib/cti/session/call-context";
import { writeAuditLog } from "@/lib/observability/audit-log";

/**
 * POST /api/v1/cti/call-notes
 * Body: { correlationId, notes, disposition? }
 *
 * Saves agent wrap-up notes on a completed call summary.
 */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const { correlationId, notes, disposition } = await request.json();

  if (!correlationId) {
    return NextResponse.json(
      { error: "Missing required field: correlationId" },
      { status: 400 }
    );
  }

  const summary = updateSummaryNotes(correlationId, notes ?? "");

  if (!summary) {
    return NextResponse.json(
      { error: "Call summary not found for this correlationId" },
      { status: 404 }
    );
  }

  if (disposition) {
    summary.outcome = disposition;
  }

  writeAuditLog({
    tenantId: ctx.tenant.tenantId,
    correlationId,
    actor: `agent:${summary.agentId}`,
    action: "cti.call_notes_saved",
    resource: `call:${summary.providerCallId || correlationId}`,
    detail: { notes: notes?.slice(0, 200), disposition },
  });

  return NextResponse.json({ status: "saved", correlationId });
});

/**
 * GET /api/v1/cti/call-notes?correlationId=xxx
 *
 * Retrieve call summary with notes.
 */
export const GET = apiHandler(async (request: NextRequest) => {
  const url = new URL(request.url);
  const correlationId = url.searchParams.get("correlationId");

  if (!correlationId) {
    return NextResponse.json(
      { error: "Missing correlationId query param" },
      { status: 400 }
    );
  }

  const summary = getCallSummary(correlationId);
  if (!summary) {
    return NextResponse.json({ summary: null });
  }

  return NextResponse.json({ summary });
});
