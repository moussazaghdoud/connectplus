import { describe, it, expect, beforeEach } from "vitest";
import {
  setCallContext,
  getCallContext,
  enrichCallContext,
  markScreenPopSent,
  markRecordOpened,
  removeCallContext,
} from "@/lib/cti/session/call-context";

describe("screen pop / call context", () => {
  const baseContext = {
    callId: "call-001",
    correlationId: "corr-001",
    phone: "+33612345678",
    direction: "inbound" as const,
    agentId: "agent-1",
    tenantId: "tenant-1",
    startTime: new Date().toISOString(),
    screenPopSent: false,
  };

  beforeEach(() => {
    removeCallContext("call-001");
  });

  it("stores and retrieves call context", () => {
    setCallContext(baseContext);
    const ctx = getCallContext("call-001");
    expect(ctx).toBeDefined();
    expect(ctx!.callId).toBe("call-001");
    expect(ctx!.phone).toBe("+33612345678");
  });

  it("enriches context with CRM data", () => {
    setCallContext(baseContext);
    const enriched = enrichCallContext("call-001", {
      contactId: "rec-001",
      contactName: "John Doe",
      contactCompany: "ACME",
      crmModule: "Contacts",
      crmRecordId: "rec-001",
      crmSlug: "zoho",
    });
    expect(enriched).toBeDefined();
    expect(enriched!.contactName).toBe("John Doe");
    expect(enriched!.crmModule).toBe("Contacts");
  });

  it("marks screen pop as sent", () => {
    setCallContext(baseContext);
    markScreenPopSent("call-001");
    const ctx = getCallContext("call-001");
    expect(ctx!.screenPopSent).toBe(true);
  });

  it("marks record as opened", () => {
    setCallContext(baseContext);
    markRecordOpened("call-001");
    const ctx = getCallContext("call-001");
    expect(ctx!.screenPopOpenedAt).toBeDefined();
  });

  it("removes call context", () => {
    setCallContext(baseContext);
    const removed = removeCallContext("call-001");
    expect(removed).toBeDefined();
    expect(removed!.callId).toBe("call-001");
    expect(getCallContext("call-001")).toBeUndefined();
  });

  it("returns undefined for enriching non-existent context", () => {
    const result = enrichCallContext("nonexistent", { contactName: "X" });
    expect(result).toBeUndefined();
  });
});
