/**
 * CrmService tests — validates the unified CRM entry point.
 *
 * These tests mock the ConnectorRegistry and Prisma to verify:
 * - resolveCallerByPhone uses connectors from the registry
 * - writeCallLog is idempotent by correlationId
 * - Local DB fallback works when no connectors are active
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    connectorConfig: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    contact: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "new-contact-1", ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "existing-1", ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    externalLink: {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Mock crypto
vi.mock("@/lib/utils/crypto", () => ({
  decryptJson: vi.fn().mockReturnValue({ accessToken: "test-token" }),
}));

// Mock connector registry
const mockSearchContacts = vi.fn().mockResolvedValue([]);
const mockMapContact = vi.fn().mockReturnValue({
  displayName: "John Doe",
  email: "john@example.com",
  phone: "+33612345678",
  company: "ACME Corp",
  externalId: "ext-123",
  source: "test-crm",
  metadata: { crmModule: "Contacts", crmUrl: "https://crm.example.com/contact/ext-123" },
});
const mockInitialize = vi.fn().mockResolvedValue(undefined);
const mockWriteBack = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/core/connector-registry", () => ({
  connectorRegistry: {
    tryGet: vi.fn().mockReturnValue(null),
  },
}));

// Mock dynamic loader
vi.mock("@/lib/connectors/factory/dynamic-loader", () => ({
  dynamicLoader: {
    reload: vi.fn().mockResolvedValue(false),
  },
}));

import { prisma } from "@/lib/db";
import { connectorRegistry } from "@/lib/core/connector-registry";
import { crmService } from "@/lib/crm/service";

describe("CrmService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveCallerByPhone", () => {
    it("returns null for empty phone", async () => {
      const result = await crmService.resolveCallerByPhone("tenant-1", "");
      expect(result).toBeNull();
    });

    it("returns null when no connectors and no local contacts", async () => {
      const result = await crmService.resolveCallerByPhone("tenant-1", "+33612345678");
      expect(result).toBeNull();
      expect(prisma.connectorConfig.findMany).toHaveBeenCalledWith({
        where: { tenantId: "tenant-1", enabled: true },
      });
    });

    it("falls back to local DB exact match", async () => {
      vi.mocked(prisma.contact.findFirst).mockResolvedValueOnce({
        id: "local-1",
        tenantId: "tenant-1",
        displayName: "Jane Local",
        email: "jane@local.com",
        phone: "+33612345678",
        company: "Local Corp",
        title: null,
        avatarUrl: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await crmService.resolveCallerByPhone("tenant-1", "+33612345678");
      expect(result).toBeDefined();
      expect(result!.displayName).toBe("Jane Local");
      expect(result!.id).toBe("local-1");
    });

    it("uses connector from registry when available", async () => {
      // Setup: one active connector config
      vi.mocked(prisma.connectorConfig.findMany).mockResolvedValueOnce([
        {
          id: "cfg-1",
          tenantId: "tenant-1",
          connectorId: "test-crm",
          enabled: true,
          credentials: "encrypted-blob",
          settings: {},
          oauthState: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Setup: connector exists in registry
      vi.mocked(connectorRegistry.tryGet).mockReturnValueOnce({
        manifest: {
          id: "test-crm",
          name: "Test CRM",
          version: "1.0.0",
          authType: "oauth2",
          webhookSupported: false,
          capabilities: ["contact_search"],
        },
        initialize: mockInitialize,
        searchContacts: mockSearchContacts.mockResolvedValueOnce([
          { externalId: "ext-123", source: "test-crm", raw: { First_Name: "John", Last_Name: "Doe" } },
        ]),
        mapContact: mockMapContact,
        verifyWebhook: () => false,
        parseWebhook: () => ({ type: "custom" as const, externalId: "", connectorId: "test-crm", payload: {}, idempotencyKey: "" }),
        healthCheck: async () => ({ healthy: true, latencyMs: 0 }),
      });

      const result = await crmService.resolveCallerByPhone("tenant-1", "+33612345678");

      expect(result).toBeDefined();
      expect(result!.displayName).toBe("John Doe");
      expect(result!.connectorSlug).toBe("test-crm");
      expect(mockInitialize).toHaveBeenCalled();
      expect(mockSearchContacts).toHaveBeenCalledWith({ tenantId: "tenant-1", phone: "+33612345678", limit: 1 });
    });
  });

  describe("writeCallLog", () => {
    it("skips when no active connectors", async () => {
      await crmService.writeCallLog({
        tenantId: "tenant-1",
        correlationId: "corr-unique-1",
        callId: "call-1",
        direction: "inbound",
        fromNumber: "+33612345678",
        toNumber: "+33600000000",
        startedAt: new Date().toISOString(),
        durationSecs: 120,
        disposition: "answered",
      });

      // Should not throw, just silently skip
      expect(prisma.connectorConfig.findMany).toHaveBeenCalled();
    });

    it("deduplicates by correlationId", async () => {
      const correlationId = "corr-dedup-test-" + Date.now();

      // Setup: one connector that does write-back
      const mockConfig = {
        id: "cfg-1",
        tenantId: "tenant-1",
        connectorId: "test-wb",
        enabled: true,
        credentials: "encrypted-blob",
        settings: {},
        oauthState: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.connectorConfig.findMany).mockResolvedValue([mockConfig]);
      vi.mocked(connectorRegistry.tryGet).mockReturnValue({
        manifest: {
          id: "test-wb",
          name: "Test WB",
          version: "1.0.0",
          authType: "api_key",
          webhookSupported: false,
          capabilities: ["contact_search", "interaction_writeback"],
        },
        initialize: mockInitialize,
        searchContacts: mockSearchContacts,
        mapContact: mockMapContact,
        writeBack: mockWriteBack,
        verifyWebhook: () => false,
        parseWebhook: () => ({ type: "custom" as const, externalId: "", connectorId: "test-wb", payload: {}, idempotencyKey: "" }),
        healthCheck: async () => ({ healthy: true, latencyMs: 0 }),
      });

      // First call — should write
      await crmService.writeCallLog({
        tenantId: "tenant-1",
        correlationId,
        callId: "call-1",
        direction: "inbound",
        fromNumber: "+33612345678",
        toNumber: "+33600000000",
        startedAt: new Date().toISOString(),
      });
      expect(mockWriteBack).toHaveBeenCalledTimes(1);

      // Second call with same correlationId — should be deduped
      mockWriteBack.mockClear();
      await crmService.writeCallLog({
        tenantId: "tenant-1",
        correlationId,
        callId: "call-1",
        direction: "inbound",
        fromNumber: "+33612345678",
        toNumber: "+33600000000",
        startedAt: new Date().toISOString(),
      });

      // writeBack should NOT be called again
      expect(mockWriteBack).not.toHaveBeenCalled();
    });
  });

  describe("buildCrmLink", () => {
    it("returns crmUrl from match", () => {
      const url = crmService.buildCrmLink({
        id: "c1",
        displayName: "Test",
        crmUrl: "https://crm.zoho.eu/crm/tab/Contacts/123",
      });
      expect(url).toBe("https://crm.zoho.eu/crm/tab/Contacts/123");
    });

    it("returns undefined when no crmUrl", () => {
      const url = crmService.buildCrmLink({ id: "c1", displayName: "Test" });
      expect(url).toBeUndefined();
    });
  });
});
