/**
 * Event Normalizer — converts vendor-specific telephony events to canonical format.
 *
 * Each telephony vendor (Rainbow, RingCentral, Twilio, etc.) has its own event format.
 * This module provides a standard normalization interface so all CTI connectors
 * produce the same CtiCallEvent structure.
 *
 * Reusable by: any telephony connector.
 */

import type {
  CtiCallEvent,
  CallState,
  CallDirection,
  CrmContext,
} from "../types/call-event";

/**
 * Raw vendor event — the shape varies per provider, so this is loosely typed.
 */
export interface RawVendorEvent {
  /** Vendor-specific call identifier */
  vendorCallId: string;
  /** Vendor name (e.g., "rainbow", "ringcentral") */
  vendor: string;
  /** Raw event type from vendor (e.g., "call.ringing", "RINGING_INCOMMING") */
  vendorEventType: string;
  /** Raw payload from vendor */
  payload: Record<string, unknown>;
}

/**
 * State mapping definition — maps vendor event types to canonical states.
 */
export type StateMap = Record<string, CallState>;

/**
 * Field extraction definition — maps canonical fields to vendor payload paths.
 */
export interface FieldExtractor {
  callId: string | ((payload: Record<string, unknown>) => string);
  fromNumber: string | ((payload: Record<string, unknown>) => string);
  toNumber: string | ((payload: Record<string, unknown>) => string);
  direction?: string | ((payload: Record<string, unknown>) => CallDirection);
  agentId?: string | ((payload: Record<string, unknown>) => string);
  duration?: string | ((payload: Record<string, unknown>) => number);
  recordingUrl?: string | ((payload: Record<string, unknown>) => string);
}

/**
 * Extract a value from a nested object using dot-path notation.
 */
function extractField(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Resolve a field value from the vendor payload using either a dot-path string or a function.
 */
function resolveField<T>(
  payload: Record<string, unknown>,
  extractor: string | ((p: Record<string, unknown>) => T)
): T | undefined {
  if (typeof extractor === "function") {
    return extractor(payload);
  }
  return extractField(payload, extractor) as T | undefined;
}

/**
 * Normalize a raw vendor event into a canonical CtiCallEvent.
 */
export function normalizeEvent(
  raw: RawVendorEvent,
  stateMap: StateMap,
  fields: FieldExtractor,
  context: {
    correlationId: string;
    tenantId: string;
    agentId: string;
    crmContext?: CrmContext;
  }
): CtiCallEvent | null {
  const state = stateMap[raw.vendorEventType];
  if (!state) return null; // Unknown event type — skip

  const callId = resolveField(raw.payload, fields.callId) ?? raw.vendorCallId;
  const fromNumber = resolveField(raw.payload, fields.fromNumber) ?? "";
  const toNumber = resolveField(raw.payload, fields.toNumber) ?? "";
  const direction = fields.direction
    ? resolveField<CallDirection>(raw.payload, fields.direction) ?? "inbound"
    : "inbound";

  return {
    callId: String(callId),
    correlationId: context.correlationId,
    direction,
    fromNumber: String(fromNumber),
    toNumber: String(toNumber),
    timestamp: new Date().toISOString(),
    state,
    agentId: context.agentId,
    tenantId: context.tenantId,
    crmContext: context.crmContext,
    durationSecs: fields.duration
      ? resolveField<number>(raw.payload, fields.duration)
      : undefined,
    recordingUrl: fields.recordingUrl
      ? resolveField<string>(raw.payload, fields.recordingUrl)
      : undefined,
  };
}

/**
 * Pre-built state map for Rainbow SDK events.
 */
export const RAINBOW_STATE_MAP: StateMap = {
  RINGING_INCOMMING: "ringing",
  RINGING_OUTGOING: "ringing",
  ACTIVE: "connected",
  HOLD: "held",
  ENDED: "ended",
  MISSED: "missed",
  FAILED: "failed",
  // Webhook variants
  "call.ringing": "ringing",
  "call.answered": "connected",
  "call.held": "held",
  "call.ended": "ended",
  "call.missed": "missed",
  "call.failed": "failed",
};
