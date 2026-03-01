/**
 * Re-export Prisma generated types for use throughout the app.
 * Single import point so generated path never leaks into business logic.
 */
export type {
  Tenant,
  ConnectorConfig,
  Contact,
  ExternalLink,
  Interaction,
  AuditLog,
  DeadLetterEntry,
  IdempotencyRecord,
} from "@/generated/prisma/client";

export {
  TenantStatus,
  InteractionType,
  InteractionStatus,
  Direction,
  WritebackStatus,
} from "@/generated/prisma/client";
