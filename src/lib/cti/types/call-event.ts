/**
 * Canonical CTI call event model — normalized across telephony vendors.
 * Designed to match the event model of major CTI vendors (RingCentral, 3CX).
 */

export type CallDirection = "inbound" | "outbound";

export type CallState =
  | "ringing"
  | "connected"
  | "held"
  | "ended"
  | "missed"
  | "failed";

export type CallDisposition =
  | "answered"
  | "missed"
  | "voicemail"
  | "busy"
  | "failed"
  | "no_answer"
  | "transferred";

export interface CrmContext {
  /** Zoho/CRM record ID if caller was matched */
  recordId?: string;
  /** CRM module (Contact, Lead, Account) */
  module?: string;
  /** Display name from CRM */
  displayName?: string;
  /** Company name */
  company?: string;
}

export interface CtiCallEvent {
  /** Provider-specific call ID (e.g., Rainbow callId) */
  callId: string;
  /** Stable correlation ID — generated at first sighting, survives reconnects */
  correlationId: string;
  /** Call direction */
  direction: CallDirection;
  /** Caller number (E.164 preferred) */
  fromNumber: string;
  /** Destination number (E.164 preferred) */
  toNumber: string;
  /** Event timestamp (ISO 8601) */
  timestamp: string;
  /** Current call state */
  state: CallState;
  /** Agent identifier (maps to Zoho userId) */
  agentId: string;
  /** Tenant ID */
  tenantId: string;
  /** CRM context if caller was matched */
  crmContext?: CrmContext;
  /** Recording URL (populated after call ends) */
  recordingUrl?: string;
  /** Agent notes */
  notes?: string;
  /** Call disposition (populated at end) */
  disposition?: CallDisposition;
  /** Call duration in seconds (populated at end) */
  durationSecs?: number;
}

/**
 * Idempotency key for de-duplicating events.
 * Same state repeated within ±2s window = duplicate.
 */
export function makeIdempotencyKey(
  correlationId: string,
  state: CallState,
  timestamp: string
): string {
  // Round timestamp to nearest 2-second window
  const ts = Math.floor(new Date(timestamp).getTime() / 2000);
  return `cti:${correlationId}:${state}:${ts}`;
}
