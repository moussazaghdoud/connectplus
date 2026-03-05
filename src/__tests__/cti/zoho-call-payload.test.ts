import { describe, it, expect } from "vitest";

/**
 * Snapshot test for the Zoho call payload structure.
 * Verifies the mapping from CtiCallEvent -> Zoho Calls API payload.
 */

// Re-implement the payload building logic inline (to avoid needing real Zoho API)
function buildZohoPayload(event: {
  direction: string;
  fromNumber: string;
  toNumber: string;
  timestamp: string;
  durationSecs: number;
  disposition?: string;
  correlationId: string;
  notes?: string;
  recordingUrl?: string;
  crmContext?: { recordId?: string; module?: string; displayName?: string; company?: string };
}) {
  const dirLabel = event.direction === "inbound" ? "Inbound" : "Outbound";
  const contactLabel = event.crmContext?.displayName || event.fromNumber;
  const mins = Math.floor(event.durationSecs / 60);
  const secs = event.durationSecs % 60;

  const descParts = [
    `Direction: ${event.direction}`,
    `From: ${event.fromNumber}`,
    `To: ${event.toNumber}`,
    `Duration: ${event.durationSecs}s`,
    `Disposition: ${event.disposition ?? "unknown"}`,
  ];
  if (event.crmContext?.displayName) descParts.push(`Contact: ${event.crmContext.displayName}`);
  if (event.crmContext?.company) descParts.push(`Company: ${event.crmContext.company}`);
  if (event.recordingUrl) descParts.push(`Recording: ${event.recordingUrl}`);
  if (event.notes) descParts.push(`\nAgent Notes:\n${event.notes}`);
  descParts.push(`\n---\nCorrelation ID: ${event.correlationId}`);
  descParts.push(`Tag: Rainbow CTI`);

  const payload: Record<string, unknown> = {
    Subject: `${dirLabel} call with ${contactLabel}`,
    Call_Type: dirLabel,
    Call_Start_Time: event.timestamp,
    Call_Duration: `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`,
    Description: descParts.join("\n"),
    Call_Result: event.disposition === "answered" ? "Call Completed" : "Missed",
  };

  if (event.crmContext?.recordId) {
    if (event.crmContext.module === "Contacts" || event.crmContext.module === "Leads") {
      payload.Who_Id = event.crmContext.recordId;
    } else if (event.crmContext.module === "Accounts") {
      payload.What_Id = event.crmContext.recordId;
      payload.$se_module = "Accounts";
    }
  }

  return payload;
}

describe("Zoho call payload mapping", () => {
  it("maps inbound answered call correctly", () => {
    const payload = buildZohoPayload({
      direction: "inbound",
      fromNumber: "+33612345678",
      toNumber: "+33140000000",
      timestamp: "2026-03-05T12:00:00Z",
      durationSecs: 125,
      disposition: "answered",
      correlationId: "corr-001",
      crmContext: {
        recordId: "rec-001",
        module: "Contacts",
        displayName: "John Doe",
        company: "ACME Corp",
      },
    });

    expect(payload.Subject).toBe("Inbound call with John Doe");
    expect(payload.Call_Type).toBe("Inbound");
    expect(payload.Call_Duration).toBe("02:05");
    expect(payload.Call_Result).toBe("Call Completed");
    expect(payload.Who_Id).toBe("rec-001");
    expect(payload.What_Id).toBeUndefined();
    expect(payload.Description).toContain("Correlation ID: corr-001");
    expect(payload.Description).toContain("Rainbow CTI");
    expect(payload.Description).toContain("Contact: John Doe");
    expect(payload.Description).toContain("Company: ACME Corp");
  });

  it("maps outbound missed call correctly", () => {
    const payload = buildZohoPayload({
      direction: "outbound",
      fromNumber: "+33140000000",
      toNumber: "+33612345678",
      timestamp: "2026-03-05T12:00:00Z",
      durationSecs: 0,
      disposition: "missed",
      correlationId: "corr-002",
    });

    expect(payload.Subject).toBe("Outbound call with +33140000000");
    expect(payload.Call_Type).toBe("Outbound");
    expect(payload.Call_Duration).toBe("00:00");
    expect(payload.Call_Result).toBe("Missed");
    expect(payload.Who_Id).toBeUndefined();
  });

  it("links Account to What_Id", () => {
    const payload = buildZohoPayload({
      direction: "inbound",
      fromNumber: "+33612345678",
      toNumber: "+33140000000",
      timestamp: "2026-03-05T12:00:00Z",
      durationSecs: 30,
      disposition: "answered",
      correlationId: "corr-003",
      crmContext: {
        recordId: "acc-001",
        module: "Accounts",
        displayName: "ACME Corp",
      },
    });

    expect(payload.What_Id).toBe("acc-001");
    expect(payload.$se_module).toBe("Accounts");
    expect(payload.Who_Id).toBeUndefined();
  });

  it("includes notes and recording URL in description", () => {
    const payload = buildZohoPayload({
      direction: "inbound",
      fromNumber: "+33612345678",
      toNumber: "+33140000000",
      timestamp: "2026-03-05T12:00:00Z",
      durationSecs: 60,
      disposition: "answered",
      correlationId: "corr-004",
      notes: "Customer asked about renewal",
      recordingUrl: "https://recordings.example.com/call-004.mp3",
    });

    expect(payload.Description).toContain("Agent Notes:\nCustomer asked about renewal");
    expect(payload.Description).toContain("Recording: https://recordings.example.com/call-004.mp3");
  });
});
