import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { contactResolver } from "@/lib/core";
import { ContactSearchSchema } from "@/lib/core/models/contact";
import { writeAuditLog } from "@/lib/observability/audit-log";

export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const body = await request.json();
  const query = ContactSearchSchema.parse(body);

  const results = await contactResolver.search({
    ...query,
    tenantId: ctx.tenant.tenantId,
  });

  await writeAuditLog({
    tenantId: ctx.tenant.tenantId,
    correlationId: ctx.correlationId,
    actor: `api_key:${ctx.tenant.tenantSlug}`,
    action: "contact.search",
    resource: `query:${query.query ?? query.email ?? query.phone ?? "all"}`,
    detail: { resultCount: results.length },
  });

  return NextResponse.json({
    data: results,
    meta: { count: results.length, limit: query.limit },
  });
});
