import { vi } from "vitest";

/**
 * Creates a mock Prisma client with chainable methods for all models.
 * Each model exposes standard Prisma operations as vi.fn() stubs.
 */
function createMockModel() {
  return {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    upsert: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  };
}

export function createMockPrisma() {
  return {
    tenant: createMockModel(),
    connectorConfig: createMockModel(),
    contact: createMockModel(),
    externalLink: createMockModel(),
    interaction: createMockModel(),
    auditLog: createMockModel(),
    deadLetterEntry: createMockModel(),
    idempotencyRecord: createMockModel(),
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(mockPrisma)),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  };
}

/** Shared instance — reset in beforeEach via vi.clearAllMocks() */
export const mockPrisma = createMockPrisma();
