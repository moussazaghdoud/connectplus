import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimitError } from "../../core/errors";

// We need a fresh RateLimiter per test — import the class, not the singleton
// The module exports a singleton, so we'll use dynamic import after mock setup

describe("RateLimiter", () => {
  // Re-create fresh limiter each test to avoid shared state
  function createLimiter(maxTokens = 5, refillRate = 2) {
    // Directly instantiate via the module internals — but the class isn't exported.
    // Instead, we'll test via the exported singleton pattern by reseting modules.
    // Simpler: just re-implement the token bucket test against the module.
    // Actually, the simplest approach: use vi.importActual and create instances.
    // The class RateLimiter isn't exported, but the module exports `rateLimiter`.
    // Let's test behavior via a fresh import.
    return { maxTokens, refillRate };
  }

  // Since the class isn't exported, we test via dynamic re-import
  let RateLimiterClass: new (max?: number, rate?: number) => {
    consume(tenantId: string): void;
    remaining(tenantId: string): number;
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    // Extract the class by reading the module's internal structure
    // We can get it from the prototype of the exported singleton
    const mod = await import("../rate-limiter");
    RateLimiterClass = (mod.rateLimiter as object).constructor as typeof RateLimiterClass;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to maxTokens", () => {
    const limiter = new RateLimiterClass(3, 1);
    limiter.consume("t1");
    limiter.consume("t1");
    limiter.consume("t1");
    // 4th should throw
    expect(() => limiter.consume("t1")).toThrow(RateLimitError);
  });

  it("starts with full bucket (remaining = maxTokens)", () => {
    const limiter = new RateLimiterClass(10, 5);
    expect(limiter.remaining("t1")).toBe(10);
  });

  it("decrements remaining after consume", () => {
    const limiter = new RateLimiterClass(10, 5);
    limiter.consume("t1");
    expect(limiter.remaining("t1")).toBe(9);
  });

  it("isolates tenants", () => {
    const limiter = new RateLimiterClass(2, 1);
    limiter.consume("t1");
    limiter.consume("t1");
    // t1 exhausted, but t2 still has tokens
    expect(() => limiter.consume("t1")).toThrow(RateLimitError);
    expect(() => limiter.consume("t2")).not.toThrow();
  });

  it("refills tokens over time", () => {
    const limiter = new RateLimiterClass(5, 2); // 2 tokens/sec
    // Drain all 5
    for (let i = 0; i < 5; i++) limiter.consume("t1");
    expect(() => limiter.consume("t1")).toThrow(RateLimitError);

    // Advance 1 second → 2 tokens refilled
    vi.advanceTimersByTime(1000);
    limiter.consume("t1");
    limiter.consume("t1");
    // Should be exhausted again
    expect(() => limiter.consume("t1")).toThrow(RateLimitError);
  });

  it("caps refill at maxTokens", () => {
    const limiter = new RateLimiterClass(5, 100); // fast refill
    // Drain all tokens
    for (let i = 0; i < 5; i++) limiter.consume("t1");
    expect(limiter.remaining("t1")).toBe(0);

    vi.advanceTimersByTime(10_000); // would refill 1000 but must cap at 5
    limiter.consume("t1"); // triggers refill (capped at 5) then -1
    expect(limiter.remaining("t1")).toBe(4); // proves cap: 5 - 1 consumed
  });

  it("RateLimitError includes retryAfterSecs", () => {
    const limiter = new RateLimiterClass(1, 1); // 1 token, 1/sec
    limiter.consume("t1");
    try {
      limiter.consume("t1");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as RateLimitError).details?.retryAfterSecs).toBeGreaterThan(0);
    }
  });
});
