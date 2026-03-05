export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { runDiagnostics } from "@/lib/connectors/marketplace/diagnostics";

/**
 * GET /api/v1/admin/marketplace/connectors/:slug/diagnostics
 *
 * Runs live diagnostics: registry check, credential decryption, token status,
 * API health check, webhook status.
 */
export const GET = apiHandler(async (_request: NextRequest, ctx, params) => {
  const { slug } = params;
  const diagnostics = await runDiagnostics(slug, ctx.tenant.tenantId);
  return NextResponse.json(diagnostics);
});
