import { describe, it, expect } from "vitest";
import {
  FrameworkError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
  RateLimitError,
  ConnectorError,
  RainbowApiError,
  IdempotencyConflictError,
} from "../errors";

describe("FrameworkError", () => {
  it("sets message, code, and statusCode", () => {
    const err = new FrameworkError("boom", "TEST_ERROR", 418, { key: "val" });
    expect(err.message).toBe("boom");
    expect(err.code).toBe("TEST_ERROR");
    expect(err.statusCode).toBe(418);
    expect(err.details).toEqual({ key: "val" });
  });

  it("defaults statusCode to 500", () => {
    const err = new FrameworkError("boom", "TEST_ERROR");
    expect(err.statusCode).toBe(500);
  });

  it("is instanceof Error", () => {
    const err = new FrameworkError("boom", "TEST_ERROR");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FrameworkError);
  });

  it("toJSON omits details when absent", () => {
    const err = new FrameworkError("boom", "TEST_ERROR");
    expect(err.toJSON()).toEqual({
      error: { code: "TEST_ERROR", message: "boom" },
    });
  });

  it("toJSON includes details when present", () => {
    const err = new FrameworkError("boom", "TEST_ERROR", 500, { foo: 1 });
    expect(err.toJSON()).toEqual({
      error: { code: "TEST_ERROR", message: "boom", details: { foo: 1 } },
    });
  });
});

describe("specific errors", () => {
  it("AuthenticationError → 401", () => {
    const err = new AuthenticationError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("AUTHENTICATION_ERROR");
    expect(err).toBeInstanceOf(FrameworkError);
  });

  it("AuthorizationError → 403", () => {
    const err = new AuthorizationError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("AUTHORIZATION_ERROR");
  });

  it("NotFoundError → 404", () => {
    const err = new NotFoundError("Tenant", "abc-123");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Tenant 'abc-123' not found");
  });

  it("ValidationError → 400 with details", () => {
    const err = new ValidationError("bad input", { field: "email" });
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ field: "email" });
  });

  it("ConflictError → 409", () => {
    const err = new ConflictError("duplicate");
    expect(err.statusCode).toBe(409);
  });

  it("RateLimitError → 429 with retryAfterSecs", () => {
    const err = new RateLimitError(5);
    expect(err.statusCode).toBe(429);
    expect(err.details).toEqual({ retryAfterSecs: 5 });
  });

  it("ConnectorError → 502 with connectorId", () => {
    const err = new ConnectorError("hubspot", "API timeout");
    expect(err.statusCode).toBe(502);
    expect(err.details).toEqual({ connectorId: "hubspot" });
  });

  it("RainbowApiError → custom statusCode", () => {
    const err = new RainbowApiError("timeout", 504);
    expect(err.statusCode).toBe(504);
    expect(err.code).toBe("RAINBOW_API_ERROR");
  });

  it("RainbowApiError → defaults to 502", () => {
    const err = new RainbowApiError("fail");
    expect(err.statusCode).toBe(502);
  });

  it("IdempotencyConflictError → 200 with cachedResponse", () => {
    const cached = { id: "123", status: "ok" };
    const err = new IdempotencyConflictError(cached);
    expect(err.statusCode).toBe(200);
    expect(err.cachedResponse).toEqual(cached);
    expect(err.code).toBe("IDEMPOTENCY_CONFLICT");
  });
});
