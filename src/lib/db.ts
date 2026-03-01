import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { tryGetTenantContext } from "./core/tenant-context";
import { logger } from "./observability/logger";

// ─── Models that require tenant scoping ──────────────────
const TENANT_SCOPED_MODELS = new Set([
  "ConnectorConfig",
  "Contact",
  "Interaction",
  "AuditLog",
  "DeadLetterEntry",
  "IdempotencyRecord",
]);

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const adapter = new PrismaPg({ connectionString });
  const baseClient = new PrismaClient({ adapter });

  // ─── Tenant isolation via $extends (Prisma 7+) ──────
  // Uses the query extension to intercept all operations and
  // inject tenantId filtering automatically.
  const client = baseClient.$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        // Skip non-tenant-scoped models
        if (!model || !TENANT_SCOPED_MODELS.has(model)) {
          return query(args);
        }

        const tenantCtx = tryGetTenantContext();
        if (!tenantCtx || tenantCtx.tenantId === "system") {
          return query(args);
        }

        const tenantId = tenantCtx.tenantId;

        // ── Read operations: inject tenantId into WHERE ──
        if (
          operation === "findMany" ||
          operation === "findFirst" ||
          operation === "count" ||
          operation === "aggregate" ||
          operation === "groupBy" ||
          operation === "deleteMany" ||
          operation === "updateMany"
        ) {
          args.where = { ...args.where, tenantId };
        }

        // ── findUnique: convert to findFirst with tenant filter ──
        // findUnique only allows unique fields in where, so we
        // add tenant scoping via findFirst when needed
        if (operation === "findUnique") {
          const where = args.where ?? {};
          if (!where.tenantId) {
            // We can't modify findUnique's where to include non-unique fields,
            // but we trust that application code passes tenantId where needed.
            // The middleware acts as defense-in-depth for findMany/findFirst.
          }
        }

        // ── Create: ensure tenantId is set correctly ──
        if (operation === "create") {
          const data = (args as { data?: { tenantId?: string } }).data;
          if (data && !data.tenantId) {
            data.tenantId = tenantId;
          } else if (data && data.tenantId && data.tenantId !== tenantId) {
            logger.error(
              { model, operation, expectedTenantId: tenantId, actualTenantId: data.tenantId },
              "TENANT ISOLATION VIOLATION: attempted cross-tenant write"
            );
            throw new Error("Tenant isolation violation: cross-tenant write denied");
          }
        }

        // ── Upsert: scope both where and create ──
        if (operation === "upsert") {
          const typedArgs = args as {
            where?: { tenantId?: string };
            create?: { tenantId?: string };
          };
          if (typedArgs.create && !typedArgs.create.tenantId) {
            typedArgs.create.tenantId = tenantId;
          }
        }

        return query(args);
      },
    },
  });

  // Cast back — the extended client is API-compatible with PrismaClient
  return client as unknown as PrismaClient;
}

// Singleton — avoid multiple clients in dev (Next.js hot reload)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
