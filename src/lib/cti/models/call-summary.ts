/**
 * CallSummary — canonical model for completed call data.
 *
 * Produced when a call reaches a terminal state (ended/missed/failed).
 * Consumed by:
 * - Zoho CRM call activity creation
 * - Audit logging
 * - Call history / analytics
 */

export type CallOutcome = "answered" | "missed" | "failed" | "cancelled";

export interface CallSummaryCrm {
  system: "zoho";
  module?: "Contacts" | "Leads" | "Accounts";
  recordId?: string;
  displayName?: string;
  company?: string;
}

export interface CallSummary {
  /** Stable correlation ID — survives across the entire call lifecycle */
  correlationId: string;
  /** Provider-specific call ID (e.g., Rainbow callId) */
  providerCallId?: string;
  /** Call direction */
  direction: "inbound" | "outbound";
  /** Caller number */
  from: string;
  /** Destination number */
  to: string;
  /** Call start time (ISO 8601) */
  startedAt: string;
  /** Call end time (ISO 8601) */
  endedAt: string;
  /** Duration in seconds */
  durationSeconds: number;
  /** Call outcome */
  outcome: CallOutcome;
  /** Agent who handled the call */
  agentId: string;
  /** Tenant ID */
  tenantId: string;
  /** CRM match data */
  crm?: CallSummaryCrm;
  /** Recording URL (if available) */
  recordingUrl?: string;
  /** Agent notes (from wrap-up) */
  notes?: string;
}

/**
 * Determine call outcome from state and context.
 */
export function determineOutcome(
  state: string,
  direction: string,
  wasConnected: boolean
): CallOutcome {
  if (state === "ended" && wasConnected) return "answered";
  if (state === "ended" && !wasConnected) {
    return direction === "inbound" ? "missed" : "cancelled";
  }
  if (state === "missed") return "missed";
  if (state === "failed") return "failed";
  return "missed";
}
