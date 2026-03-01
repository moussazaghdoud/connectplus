import { prisma } from "../db";
import { logger } from "./logger";

export interface AuditEntry {
  tenantId: string;
  correlationId: string;
  actor: string;
  action: string;
  resource: string;
  detail?: Record<string, unknown>;
  ip?: string;
}

/**
 * Write an immutable audit log entry.
 * Fire-and-forget: errors are logged but don't fail the request.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        correlationId: entry.correlationId,
        actor: entry.actor,
        action: entry.action,
        resource: entry.resource,
        detail: (entry.detail ?? {}) as Record<string, string>,
        ip: entry.ip,
      },
    });
  } catch (err) {
    // Never let audit log failures break the request
    logger.error({ err, entry }, "Failed to write audit log");
  }
}
