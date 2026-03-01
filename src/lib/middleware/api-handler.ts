import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "./auth";
import { getCorrelationId, setCorrelationIdHeader } from "./correlation-id";
import { rateLimiter } from "./rate-limiter";
import { runWithTenant } from "../core/tenant-context";
import { handleError } from "./error-handler";
import { createRequestLogger, logger } from "../observability/logger";
import { metrics } from "../observability/metrics";
import type { TenantContext } from "../core/models/tenant";

export interface ApiContext {
  tenant: TenantContext;
  correlationId: string;
  log: ReturnType<typeof createRequestLogger>;
}

type RouteHandler = (
  request: NextRequest,
  ctx: ApiContext,
  params: Record<string, string>
) => Promise<NextResponse>;

interface ApiHandlerOptions {
  /** Skip authentication (e.g. for webhook endpoints) */
  skipAuth?: boolean;
  /** Skip rate limiting */
  skipRateLimit?: boolean;
}

/**
 * Universal API route wrapper.
 * Handles: auth → tenant context → correlation ID → rate limiting → logging → error handling.
 */
export function apiHandler(handler: RouteHandler, opts?: ApiHandlerOptions) {
  return async (
    request: NextRequest,
    routeCtx: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    const startTime = Date.now();
    const correlationId = getCorrelationId(request);
    const method = request.method;
    const path = new URL(request.url).pathname;

    try {
      // 1. Authenticate (unless skipped)
      let tenant: TenantContext;
      if (opts?.skipAuth) {
        tenant = {
          tenantId: "system",
          tenantSlug: "system",
          tenantStatus: "ACTIVE",
        };
      } else {
        tenant = await authenticateRequest(request);
      }

      // 2. Rate limit
      if (!opts?.skipRateLimit && tenant.tenantId !== "system") {
        rateLimiter.consume(tenant.tenantId);
      }

      // 3. Create request logger
      const log = createRequestLogger({
        correlationId,
        tenantId: tenant.tenantId,
      });

      log.info({ method, path }, `→ ${method} ${path}`);

      // 4. Run handler within tenant context
      const params = await routeCtx.params;
      const response = await runWithTenant(tenant, () =>
        handler(request, { tenant, correlationId, log }, params)
      );

      // 5. Add response headers
      setCorrelationIdHeader(response.headers, correlationId);

      // 5b. Rate limit headers
      if (!opts?.skipRateLimit && tenant.tenantId !== "system") {
        const remaining = rateLimiter.remaining(tenant.tenantId);
        response.headers.set("X-RateLimit-Remaining", String(remaining));
        response.headers.set("X-RateLimit-Limit", "100");
      }

      // 6. Metrics
      const duration = Date.now() - startTime;
      metrics.increment("api_requests_total", {
        method,
        path,
        status: String(response.status),
      });

      log.info(
        { method, path, status: response.status, durationMs: duration },
        `← ${method} ${path} ${response.status} (${duration}ms)`
      );

      return response;
    } catch (err) {
      const duration = Date.now() - startTime;
      logger.error(
        { err, method, path, correlationId, durationMs: duration },
        `✗ ${method} ${path} error`
      );
      metrics.increment("api_errors_total", { method, path });

      const response = handleError(err);
      setCorrelationIdHeader(response.headers, correlationId);
      return response;
    }
  };
}
