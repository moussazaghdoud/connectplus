import { describe, it, expect, beforeEach } from "vitest";
import {
  registerLookupProvider,
  findContactByPhone,
  hasLookupProviders,
} from "@/lib/crm/lookup";

describe("CRM lookup service", () => {
  beforeEach(() => {
    // Register a mock provider
    registerLookupProvider("mock-crm", async (phone) => {
      if (phone.includes("612345678")) {
        return {
          crm: "mock-crm",
          module: "Contacts",
          recordId: "rec-001",
          name: "John Doe",
          company: "ACME Corp",
          phone,
        };
      }
      return undefined;
    });
  });

  it("has registered providers", () => {
    expect(hasLookupProviders()).toBe(true);
  });

  it("finds a contact by phone number", async () => {
    const result = await findContactByPhone("+33612345678", "tenant-1");
    expect(result).toBeDefined();
    expect(result!.name).toBe("John Doe");
    expect(result!.company).toBe("ACME Corp");
    expect(result!.module).toBe("Contacts");
    expect(result!.recordId).toBe("rec-001");
    expect(result!.crm).toBe("mock-crm");
  });

  it("finds contact with formatted phone number", async () => {
    const result = await findContactByPhone("+33 6 12 34 56 78", "tenant-1");
    expect(result).toBeDefined();
    expect(result!.name).toBe("John Doe");
  });

  it("returns undefined for unknown number", async () => {
    const result = await findContactByPhone("+33698765432", "tenant-1");
    expect(result).toBeUndefined();
  });

  it("returns undefined for empty phone", async () => {
    const result = await findContactByPhone("", "tenant-1");
    expect(result).toBeUndefined();
  });
});
