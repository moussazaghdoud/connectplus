import { describe, it, expect, beforeEach } from "vitest";
import {
  setCallContext,
  getCallContext,
  markCallConnected,
  buildCallSummary,
  getCallSummary,
  updateSummaryNotes,
  removeCallContext,
} from "@/lib/cti/session/call-context";
import { determineOutcome } from "@/lib/cti/models/call-summary";

describe("CallSummary", () => {
  const baseContext = {
    callId: "call-100",
    correlationId: "corr-100",
    phone: "+33612345678",
    direction: "inbound" as const,
    agentId: "agent-1",
    tenantId: "tenant-1",
    startTime: new Date(Date.now() - 60000).toISOString(), // 60s ago
    screenPopSent: false,
  };

  beforeEach(() => {
    removeCallContext("call-100");
  });

  describe("determineOutcome", () => {
    it("returns 'answered' for ended call that was connected", () => {
      expect(determineOutcome("ended", "inbound", true)).toBe("answered");
    });

    it("returns 'missed' for ended inbound call never connected", () => {
      expect(determineOutcome("ended", "inbound", false)).toBe("missed");
    });

    it("returns 'cancelled' for ended outbound call never connected", () => {
      expect(determineOutcome("ended", "outbound", false)).toBe("cancelled");
    });

    it("returns 'missed' for missed state", () => {
      expect(determineOutcome("missed", "inbound", false)).toBe("missed");
    });

    it("returns 'failed' for failed state", () => {
      expect(determineOutcome("failed", "outbound", false)).toBe("failed");
    });
  });

  describe("buildCallSummary", () => {
    it("builds summary for answered call", () => {
      setCallContext({ ...baseContext });
      markCallConnected("call-100");
      const summary = buildCallSummary("call-100", "ended");

      expect(summary).toBeDefined();
      expect(summary!.correlationId).toBe("corr-100");
      expect(summary!.outcome).toBe("answered");
      expect(summary!.durationSeconds).toBeGreaterThanOrEqual(0);
      expect(summary!.direction).toBe("inbound");
      expect(summary!.from).toBe("+33612345678");
    });

    it("builds summary for missed call", () => {
      setCallContext({ ...baseContext });
      // Never connected
      const summary = buildCallSummary("call-100", "ended");

      expect(summary).toBeDefined();
      expect(summary!.outcome).toBe("missed");
      expect(summary!.durationSeconds).toBe(0);
    });

    it("includes CRM data when available", () => {
      setCallContext({
        ...baseContext,
        crmModule: "Contacts",
        crmRecordId: "rec-001",
        contactName: "John Doe",
        contactCompany: "ACME",
      });
      const summary = buildCallSummary("call-100", "ended");

      expect(summary!.crm).toBeDefined();
      expect(summary!.crm!.system).toBe("zoho");
      expect(summary!.crm!.module).toBe("Contacts");
      expect(summary!.crm!.recordId).toBe("rec-001");
      expect(summary!.crm!.displayName).toBe("John Doe");
    });

    it("stores summary for later retrieval", () => {
      setCallContext({ ...baseContext });
      buildCallSummary("call-100", "ended");

      const retrieved = getCallSummary("corr-100");
      expect(retrieved).toBeDefined();
      expect(retrieved!.correlationId).toBe("corr-100");
    });

    it("returns undefined for non-existent call", () => {
      const summary = buildCallSummary("nonexistent", "ended");
      expect(summary).toBeUndefined();
    });
  });

  describe("updateSummaryNotes", () => {
    it("updates notes on existing summary", () => {
      setCallContext({ ...baseContext });
      buildCallSummary("call-100", "ended");

      const updated = updateSummaryNotes("corr-100", "Customer was happy");
      expect(updated).toBeDefined();
      expect(updated!.notes).toBe("Customer was happy");
    });

    it("returns undefined for non-existent summary", () => {
      const result = updateSummaryNotes("nonexistent", "notes");
      expect(result).toBeUndefined();
    });
  });
});

describe("Idempotency — duplicate call end events", () => {
  it("buildCallSummary returns undefined on second call (context removed)", () => {
    setCallContext({
      callId: "call-200",
      correlationId: "corr-200",
      phone: "+33600000000",
      direction: "inbound" as const,
      agentId: "agent-1",
      tenantId: "tenant-1",
      startTime: new Date().toISOString(),
      screenPopSent: false,
    });

    const first = buildCallSummary("call-200", "ended");
    expect(first).toBeDefined();

    // Remove context (as event processor does)
    removeCallContext("call-200");

    // Second call — context gone, should return undefined
    const second = buildCallSummary("call-200", "ended");
    expect(second).toBeUndefined();
  });
});
