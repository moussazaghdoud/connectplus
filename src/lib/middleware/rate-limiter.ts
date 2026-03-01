import { RateLimitError } from "../core/errors";

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/**
 * In-memory token bucket rate limiter.
 * Per-tenant, resets on process restart (acceptable for v1).
 */
class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private readonly maxTokens: number;
  private readonly refillRatePerSec: number;

  constructor(maxTokens = 100, refillRatePerSec = 10) {
    this.maxTokens = maxTokens;
    this.refillRatePerSec = refillRatePerSec;
  }

  /** Check if a request is allowed. Throws RateLimitError if not. */
  consume(tenantId: string): void {
    const now = Date.now();
    let bucket = this.buckets.get(tenantId);

    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(tenantId, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(
      this.maxTokens,
      bucket.tokens + elapsed * this.refillRatePerSec
    );
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      const retryAfter = Math.ceil(
        (1 - bucket.tokens) / this.refillRatePerSec
      );
      throw new RateLimitError(retryAfter);
    }

    bucket.tokens -= 1;
  }

  /** Get remaining tokens for a tenant */
  remaining(tenantId: string): number {
    const bucket = this.buckets.get(tenantId);
    return bucket ? Math.floor(bucket.tokens) : this.maxTokens;
  }
}

export const rateLimiter = new RateLimiter();
