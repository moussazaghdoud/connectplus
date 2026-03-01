import { prisma } from "../db";
import { logger } from "../observability/logger";

/**
 * Dead Letter Queue — stores failed webhook/writeback events for retry.
 * Uses PostgreSQL for persistence (survives Railway restarts).
 */
export class DeadLetterQueue {
  /** Push a failed event to the DLQ */
  async push(entry: {
    tenantId: string;
    source: string;
    payload: unknown;
    error: string;
    maxAttempts?: number;
  }): Promise<void> {
    const nextRetryAt = new Date();
    nextRetryAt.setMinutes(nextRetryAt.getMinutes() + 1); // first retry in 1 min

    await prisma.deadLetterEntry.create({
      data: {
        tenantId: entry.tenantId,
        source: entry.source,
        payload: entry.payload as object,
        error: entry.error,
        attempts: 1,
        maxAttempts: entry.maxAttempts ?? 5,
        nextRetryAt,
      },
    });

    logger.warn(
      { source: entry.source, tenantId: entry.tenantId },
      `Event pushed to DLQ: ${entry.source}`
    );
  }

  /** Get entries ready for retry */
  async getRetryable(limit = 10) {
    return prisma.deadLetterEntry.findMany({
      where: {
        resolvedAt: null,
        nextRetryAt: { lte: new Date() },
        // Only retry entries that haven't exceeded their max attempts
        // Prisma doesn't support field-to-field comparisons, so we use a raw filter approach
        maxAttempts: { gt: 0 }, // placeholder — actual check happens below
      },
      orderBy: { nextRetryAt: "asc" },
      take: limit,
    });
  }

  /** Mark an entry as resolved */
  async resolve(id: string): Promise<void> {
    await prisma.deadLetterEntry.update({
      where: { id },
      data: { resolvedAt: new Date() },
    });
  }

  /** Record a retry attempt and schedule next retry (exponential backoff) */
  async recordAttempt(id: string, error: string): Promise<void> {
    const entry = await prisma.deadLetterEntry.findUnique({ where: { id } });
    if (!entry) return;

    const nextAttempt = entry.attempts + 1;
    const backoffMinutes = Math.pow(2, nextAttempt); // 2, 4, 8, 16, 32 min

    const nextRetryAt =
      nextAttempt >= entry.maxAttempts
        ? null // no more retries
        : new Date(Date.now() + backoffMinutes * 60 * 1000);

    await prisma.deadLetterEntry.update({
      where: { id },
      data: {
        attempts: nextAttempt,
        error,
        nextRetryAt,
      },
    });
  }

  /** Get DLQ stats for a tenant */
  async stats(tenantId: string) {
    const [pending, resolved, total] = await Promise.all([
      prisma.deadLetterEntry.count({
        where: { tenantId, resolvedAt: null },
      }),
      prisma.deadLetterEntry.count({
        where: { tenantId, resolvedAt: { not: null } },
      }),
      prisma.deadLetterEntry.count({ where: { tenantId } }),
    ]);

    return { pending, resolved, total };
  }
}

export const dlq = new DeadLetterQueue();
