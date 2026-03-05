/**
 * CTI Event Processor — the core of the bridge.
 *
 * Receives raw telephony events (from Rainbow webhooks or WebRTC),
 * correlates them, de-duplicates, enriches with CRM context,
 * broadcasts to widgets, and triggers call logging.
 */

import type { CtiCallEvent, CallState, CallDirection, CrmContext } from "../types/call-event";
import { getCorrelationId, isDuplicateEvent, clearCorrelation } from "../correlation/correlator";
import { updateCallState, getCall } from "../state/call-state-store";
import { broadcastCallEvent, broadcastScreenPop } from "./websocket-manager";
import { setCallContext, enrichCallContext, removeCallContext, markCallConnected, buildCallSummary, getCallContext } from "../session/call-context";
import { crmService } from "../../crm/service";
import { metrics } from "../../observability/metrics";
import { logger } from "../../observability/logger";

const log = logger.child({ module: "cti-event-processor" });

export interface RawTelephonyEvent {
  /** Provider call ID (Rainbow) */
  callId: string;
  /** Call direction */
  direction: CallDirection;
  /** Caller number */
  fromNumber: string;
  /** Destination number */
  toNumber: string;
  /** Event timestamp */
  timestamp: string;
  /** Call state */
  state: CallState;
  /** Agent identifier */
  agentId: string;
  /** Tenant ID */
  tenantId: string;
  /** Duration (for ended calls) */
  durationSecs?: number;
  /** Recording URL */
  recordingUrl?: string;
}

/**
 * Process a raw telephony event through the full pipeline:
 * 1. Correlate (assign/reuse correlationId)
 * 2. De-duplicate
 * 3. Enrich with CRM context (on ringing)
 * 4. Update call state store
 * 5. Broadcast to widget subscribers
 * 6. Trigger call logging (on ended/missed)
 */
export async function processEvent(raw: RawTelephonyEvent): Promise<CtiCallEvent | null> {
  // 1. Correlate
  const correlationId = getCorrelationId(raw.callId, raw.tenantId, raw.agentId);

  // 2. De-duplicate
  if (isDuplicateEvent(correlationId, raw.state, raw.timestamp)) {
    metrics.increment("cti_events_deduplicated_processor");
    return null;
  }

  // 3. Build canonical event
  const event: CtiCallEvent = {
    callId: raw.callId,
    correlationId,
    direction: raw.direction,
    fromNumber: raw.fromNumber,
    toNumber: raw.toNumber,
    timestamp: raw.timestamp,
    state: raw.state,
    agentId: raw.agentId,
    tenantId: raw.tenantId,
    durationSecs: raw.durationSecs,
    recordingUrl: raw.recordingUrl,
  };

  // 4. CRM enrichment on first ringing event (via CrmService)
  if (raw.state === "ringing") {
    try {
      const lookupNumber = raw.direction === "inbound" ? raw.fromNumber : raw.toNumber;
      const match = await crmService.resolveCallerByPhone(raw.tenantId, lookupNumber);
      if (match) {
        event.crmContext = {
          recordId: match.crmRecordId,
          module: match.crmModule,
          displayName: match.displayName,
          company: match.company ?? undefined,
        };
      }
    } catch (err) {
      log.warn({ err, correlationId }, "CRM lookup failed during event processing");
    }
  } else {
    // Carry forward CRM context from existing call state
    const existing = getCall(raw.tenantId, raw.callId);
    if (existing?.crmContext) {
      event.crmContext = existing.crmContext;
    }
  }

  // 5. Update call state store
  updateCallState(event);

  // 5b. Store call context + trigger screen pop on ringing
  if (raw.state === "ringing") {
    const lookupNumber = raw.direction === "inbound" ? raw.fromNumber : raw.toNumber;
    setCallContext({
      callId: raw.callId,
      correlationId,
      phone: lookupNumber,
      direction: raw.direction,
      agentId: raw.agentId,
      tenantId: raw.tenantId,
      startTime: raw.timestamp,
      contactId: event.crmContext?.recordId,
      contactName: event.crmContext?.displayName,
      contactCompany: event.crmContext?.company,
      crmModule: event.crmContext?.module,
      crmRecordId: event.crmContext?.recordId,
      screenPopSent: false,
    });

    // Broadcast screen_pop event
    const popData = {
      callId: raw.callId,
      correlationId,
      phone: lookupNumber,
      direction: raw.direction,
      contact: event.crmContext
        ? {
            name: event.crmContext.displayName || "Unknown",
            recordId: event.crmContext.recordId || "",
            module: event.crmContext.module || "",
            company: event.crmContext.company,
          }
        : undefined,
    };
    broadcastScreenPop(raw.tenantId, raw.agentId, popData);
    metrics.increment("cti_screen_pop_sent");
    log.info(
      { correlationId, phone: lookupNumber, hasContact: !!event.crmContext },
      "Screen pop triggered"
    );
  }

  // 5c. Mark call as connected when answered
  if (raw.state === "connected") {
    markCallConnected(raw.callId);
  }

  // 5d. Build CallSummary and clean up on terminal states
  if (raw.state === "ended" || raw.state === "missed" || raw.state === "failed") {
    const summary = buildCallSummary(raw.callId, raw.state);
    if (summary) {
      // Attach summary data to event for call logger
      event.durationSecs = summary.durationSeconds;
      event.notes = summary.notes;
      if (summary.recordingUrl) event.recordingUrl = summary.recordingUrl;
    }
    removeCallContext(raw.callId);
  }

  // 6. Broadcast to widget
  const sent = broadcastCallEvent(event);
  metrics.increment("cti_events_broadcast", { state: raw.state });
  if (sent > 0) metrics.increment("cti_subscribers_notified", { count: String(sent) });
  log.info(
    { correlationId, state: raw.state, callId: raw.callId, subscribers: sent },
    "CTI event processed"
  );

  // 7. Trigger call logging on terminal states via CrmService
  if (raw.state === "ended" || raw.state === "missed" || raw.state === "failed") {
    if (raw.state === "ended") event.disposition = "answered";
    else if (raw.state === "missed") event.disposition = "missed";
    else event.disposition = "failed";

    try {
      await crmService.writeCallLog({
        tenantId: raw.tenantId,
        correlationId,
        callId: raw.callId,
        direction: raw.direction,
        fromNumber: raw.fromNumber,
        toNumber: raw.toNumber,
        startedAt: raw.timestamp,
        durationSecs: event.durationSecs,
        disposition: event.disposition,
        notes: event.notes,
        recordingUrl: event.recordingUrl,
        agentId: raw.agentId,
        contactMatch: event.crmContext ? {
          id: event.crmContext.recordId ?? "",
          displayName: event.crmContext.displayName ?? "Unknown",
          company: event.crmContext.company ?? null,
          crmModule: event.crmContext.module,
          crmRecordId: event.crmContext.recordId,
        } : undefined,
      });
      metrics.increment("cti_calls_completed", { disposition: event.disposition || "unknown" });
      log.info({ correlationId }, "Call logged to CRM via CrmService");
    } catch (err) {
      metrics.increment("cti_call_log_error");
      log.error({ err, correlationId }, "Failed to log call to CRM");
    }

    clearCorrelation(raw.callId);
  }

  return event;
}
