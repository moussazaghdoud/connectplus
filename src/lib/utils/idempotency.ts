import { prisma } from "../db";
import { IdempotencyConflictError } from "../core/errors";
import { logger } from "../observability/logger";

const DEFAULT_TTL_HOURS = 24;

/**
 * Check if a request with this idempotency key has already been processed.
 * If yes, throws IdempotencyConflictError with the cached response.
 * If no, stores the response after the handler completes.
 */
export async function checkIdempotency(
  key: string,
  tenantId: string
): Promise<void> {
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { key },
  });

  if (existing) {
    // Check if it belongs to the same tenant
    if (existing.tenantId !== tenantId) {
      // Different tenant using same key — allow (unlikely but safe)
      return;
    }

    // Check if expired
    if (existing.expiresAt > new Date()) {
      throw new IdempotencyConflictError(existing.response);
    }

    // Expired — delete and allow reuse
    await prisma.idempotencyRecord.delete({ where: { key } });
  }
}

/** Store the response for an idempotency key */
export async function storeIdempotencyResponse(
  key: string,
  tenantId: string,
  response: unknown
): Promise<void> {
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + DEFAULT_TTL_HOURS);

    await prisma.idempotencyRecord.upsert({
      where: { key },
      create: {
        key,
        tenantId,
        response: response as object,
        expiresAt,
      },
      update: {
        response: response as object,
        expiresAt,
      },
    });
  } catch (err) {
    logger.error({ err, key }, "Failed to store idempotency record");
  }
}
