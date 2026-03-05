export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { prisma } from "@/lib/db";

/**
 * GET /api/v1/admin/marketplace/connectors/:slug/audit-logs
 *
 * Returns audit log entries related to this connector (by resource pattern match).
 * Query params: ?limit=50
 */
export const GET = apiHandler(async (_request: NextRequest, ctx, params) => {
  const { slug } = params;
  const url = new URL(_request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);

  const entries = await prisma.auditLog.findMany({
    where: {
      tenantId: ctx.tenant.tenantId,
      resource: { contains: slug },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      actor: true,
      resource: true,
      detail: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ entries });
});
