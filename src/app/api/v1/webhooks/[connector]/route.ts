import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { connectorRegistry, eventBus } from "@/lib/core";
import { NotFoundError, ValidationError } from "@/lib/core/errors";
import { writeAuditLog } from "@/lib/observability/audit-log";
import { metrics } from "@/lib/observability/metrics";
import { dlq } from "@/lib/queue/dlq";
import { checkIdempotency } from "@/lib/utils/idempotency";
import { logger } from "@/lib/observability/logger";

/**
 * POST /api/v1/webhooks/:connector — Inbound webhook from a third-party connector.
 * Auth is skipped (webhooks use signature verification instead).
 * Tenant is resolved from the webhook payload or a query param.
 */
export const POST = apiHandler(
  async (request: NextRequest, ctx, params) => {
    const connectorId = params.connector;

    // 1. Get connector
    const connector = connectorRegistry.tryGet(connectorId);
    if (!connector) {
      throw new NotFoundError("Connector", connectorId);
    }

    // 2. Read raw body for signature verification
    const rawBody = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // 3. Verify webhook signature
    if (!connector.verifyWebhook(headers, rawBody)) {
      metrics.increment("webhook_rejected", { connector: connectorId });
      throw new ValidationError(
        `Webhook signature verification failed for connector '${connectorId}'`
      );
    }

    // 4. Parse webhook event
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new ValidationError("Invalid JSON body");
    }

    const event = connector.parseWebhook(headers, body);

    metrics.increment("webhook_received", { connector: connectorId });

    // 5. Idempotency check
    try {
      await checkIdempotency(event.idempotencyKey, ctx.tenant.tenantId);
    } catch {
      // Already processed — return 200 OK
      return NextResponse.json({ status: "already_processed" });
    }

    // 6. Emit event
    try {
      eventBus.emit("connector.webhook", {
        connectorId,
        tenantId: ctx.tenant.tenantId,
        event,
      });
    } catch (err) {
      // If event processing fails, push to DLQ
      logger.error({ err, connectorId }, "Webhook event processing failed");
      await dlq.push({
        tenantId: ctx.tenant.tenantId,
        source: `webhook:${connectorId}`,
        payload: { event, rawBody },
        error: (err as Error).message,
      });
    }

    // 7. Audit log
    await writeAuditLog({
      tenantId: ctx.tenant.tenantId,
      correlationId: ctx.correlationId,
      actor: `webhook:${connectorId}`,
      action: `webhook.${event.type}`,
      resource: `external:${event.externalId}`,
      detail: { idempotencyKey: event.idempotencyKey },
    });

    return NextResponse.json({ status: "accepted" });
  },
  { skipAuth: true }
);
