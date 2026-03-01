import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { FrameworkError, IdempotencyConflictError, ValidationError } from "../core/errors";
import { logger } from "../observability/logger";

/**
 * Standardized error response handler for API routes.
 * Wraps a route handler and catches errors, returning consistent JSON responses.
 */
export function withErrorHandler(
  handler: (req: Request, ctx: unknown) => Promise<NextResponse>
) {
  return async (req: Request, ctx: unknown): Promise<NextResponse> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return handleError(err);
    }
  };
}

/** Convert any error to a standardized NextResponse */
export function handleError(err: unknown): NextResponse {
  // Idempotency conflict: return the cached response
  if (err instanceof IdempotencyConflictError) {
    return NextResponse.json(err.cachedResponse, { status: 200 });
  }

  // Framework errors: use their status code
  if (err instanceof FrameworkError) {
    logger.warn(
      { code: err.code, statusCode: err.statusCode },
      err.message
    );
    return NextResponse.json(err.toJSON(), { status: err.statusCode });
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    const ve = new ValidationError("Request validation failed", {
      issues: err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
    return NextResponse.json(ve.toJSON(), { status: 400 });
  }

  // Unknown errors
  logger.error({ err }, "Unhandled error in API route");

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message:
          process.env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : (err as Error).message,
      },
    },
    { status: 500 }
  );
}
