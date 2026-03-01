/** Base error class for the framework */
export class FrameworkError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "FrameworkError";
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

// ─── Specific errors ─────────────────────────────────────

export class AuthenticationError extends FrameworkError {
  constructor(message = "Invalid or missing API key") {
    super(message, "AUTHENTICATION_ERROR", 401);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends FrameworkError {
  constructor(message = "Insufficient permissions") {
    super(message, "AUTHORIZATION_ERROR", 403);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends FrameworkError {
  constructor(resource: string, id: string) {
    super(`${resource} '${id}' not found`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends FrameworkError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, details);
    this.name = "ValidationError";
  }
}

export class ConflictError extends FrameworkError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
    this.name = "ConflictError";
  }
}

export class RateLimitError extends FrameworkError {
  constructor(retryAfterSecs: number) {
    super("Rate limit exceeded", "RATE_LIMIT_EXCEEDED", 429, {
      retryAfterSecs,
    });
    this.name = "RateLimitError";
  }
}

export class ConnectorError extends FrameworkError {
  constructor(connectorId: string, message: string) {
    super(message, "CONNECTOR_ERROR", 502, { connectorId });
    this.name = "ConnectorError";
  }
}

export class RainbowApiError extends FrameworkError {
  constructor(message: string, statusCode: number = 502) {
    super(message, "RAINBOW_API_ERROR", statusCode);
    this.name = "RainbowApiError";
  }
}

export class IdempotencyConflictError extends FrameworkError {
  constructor(
    public readonly cachedResponse: unknown
  ) {
    super(
      "Request already processed with this idempotency key",
      "IDEMPOTENCY_CONFLICT",
      200
    );
    this.name = "IdempotencyConflictError";
  }
}
