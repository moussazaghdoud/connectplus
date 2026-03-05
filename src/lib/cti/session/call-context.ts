/**
 * Call Context Storage — stores session context for active calls.
 *
 * Used for:
 * - Carrying CRM match data through the call lifecycle
 * - Feeding call logging with contact + module data
 * - Screen pop state tracking
 */

import { logger } from "../../observability/logger";
import type { CallSummary } from "../models/call-summary";
import { determineOutcome } from "../models/call-summary";

const log = logger.child({ module: "call-context" });

export interface CallContext {
  callId: string;
  correlationId: string;
  phone: string;
  direction: "inbound" | "outbound";
  agentId: string;
  tenantId: string;
  startTime: string;
  /** CRM match data */
  contactId?: string;
  contactName?: string;
  contactCompany?: string;
  crmModule?: string;
  crmRecordId?: string;
  crmSlug?: string;
  crmUrl?: string;
  /** Screen pop state */
  screenPopSent: boolean;
  screenPopOpenedAt?: string;
  /** Call lifecycle tracking */
  wasConnected?: boolean;
  connectedAt?: string;
  endedAt?: string;
  /** Agent notes (from wrap-up) */
  notes?: string;
  /** Recording URL */
  recordingUrl?: string;
}

const KEY = Symbol.for("cti.callContext");

function getStore(): Map<string, CallContext> {
  const g = globalThis as Record<symbol, Map<string, CallContext>>;
  if (!g[KEY]) {
    g[KEY] = new Map();
  }
  return g[KEY];
}

/**
 * Create or update a call context.
 */
export function setCallContext(ctx: CallContext): void {
  getStore().set(ctx.callId, ctx);
  log.debug(
    { callId: ctx.callId, correlationId: ctx.correlationId, hasContact: !!ctx.contactId },
    "Call context stored"
  );
}

/**
 * Get call context by callId.
 */
export function getCallContext(callId: string): CallContext | undefined {
  return getStore().get(callId);
}

/**
 * Update an existing call context with CRM match data.
 */
export function enrichCallContext(
  callId: string,
  data: {
    contactId?: string;
    contactName?: string;
    contactCompany?: string;
    crmModule?: string;
    crmRecordId?: string;
    crmSlug?: string;
    crmUrl?: string;
  }
): CallContext | undefined {
  const ctx = getStore().get(callId);
  if (!ctx) return undefined;

  Object.assign(ctx, data);
  return ctx;
}

/**
 * Mark screen pop as sent for a call.
 */
export function markScreenPopSent(callId: string): void {
  const ctx = getStore().get(callId);
  if (ctx) ctx.screenPopSent = true;
}

/**
 * Mark CRM record as opened by the agent.
 */
export function markRecordOpened(callId: string): void {
  const ctx = getStore().get(callId);
  if (ctx) ctx.screenPopOpenedAt = new Date().toISOString();
}

/**
 * Mark a call as connected (answered).
 */
export function markCallConnected(callId: string): void {
  const ctx = getStore().get(callId);
  if (ctx) {
    ctx.wasConnected = true;
    ctx.connectedAt = new Date().toISOString();
  }
}

/**
 * Set agent notes on a call context.
 */
export function setCallNotes(callId: string, notes: string): void {
  const ctx = getStore().get(callId);
  if (ctx) ctx.notes = notes;
}

/**
 * Set notes by correlationId (for wrap-up after call ended).
 */
export function setNotesByCorrelationId(correlationId: string, notes: string): CallContext | undefined {
  for (const ctx of getStore().values()) {
    if (ctx.correlationId === correlationId) {
      ctx.notes = notes;
      return ctx;
    }
  }
  // Also check completed summaries store
  return undefined;
}

/**
 * Remove call context (after call ends and logging is done).
 */
export function removeCallContext(callId: string): CallContext | undefined {
  const store = getStore();
  const ctx = store.get(callId);
  store.delete(callId);
  return ctx;
}

// ── Completed call summaries (for wrap-up and audit) ──

const SUMMARY_KEY = Symbol.for("cti.callSummaries");

function getSummaryStore(): Map<string, CallSummary> {
  const g = globalThis as Record<symbol, Map<string, CallSummary>>;
  if (!g[SUMMARY_KEY]) g[SUMMARY_KEY] = new Map();
  return g[SUMMARY_KEY];
}

/**
 * Build a CallSummary from a call context at terminal state.
 */
export function buildCallSummary(callId: string, state: string): CallSummary | undefined {
  const ctx = getStore().get(callId);
  if (!ctx) return undefined;

  const endedAt = new Date().toISOString();
  const startMs = new Date(ctx.connectedAt || ctx.startTime).getTime();
  const endMs = new Date(endedAt).getTime();
  const durationSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));

  const summary: CallSummary = {
    correlationId: ctx.correlationId,
    providerCallId: ctx.callId,
    direction: ctx.direction,
    from: ctx.direction === "inbound" ? ctx.phone : "",
    to: ctx.direction === "outbound" ? ctx.phone : "",
    startedAt: ctx.startTime,
    endedAt,
    durationSeconds: ctx.wasConnected ? durationSeconds : 0,
    outcome: determineOutcome(state, ctx.direction, !!ctx.wasConnected),
    agentId: ctx.agentId,
    tenantId: ctx.tenantId,
    recordingUrl: ctx.recordingUrl,
    notes: ctx.notes,
  };

  // Attach CRM data if available
  if (ctx.crmRecordId || ctx.crmModule) {
    summary.crm = {
      system: ctx.crmSlug ?? "unknown",
      module: ctx.crmModule as "Contacts" | "Leads" | "Accounts" | undefined,
      recordId: ctx.crmRecordId,
      displayName: ctx.contactName,
      company: ctx.contactCompany,
    };
  }

  // Store for later retrieval (wrap-up, audit)
  getSummaryStore().set(ctx.correlationId, summary);

  // Cap summary store at 200 entries
  const store = getSummaryStore();
  if (store.size > 200) {
    const keys = [...store.keys()];
    for (let i = 0; i < keys.length - 100; i++) {
      store.delete(keys[i]);
    }
  }

  log.info(
    { correlationId: ctx.correlationId, outcome: summary.outcome, duration: summary.durationSeconds },
    "Call summary built"
  );

  return summary;
}

/**
 * Get a completed call summary by correlationId.
 */
export function getCallSummary(correlationId: string): CallSummary | undefined {
  return getSummaryStore().get(correlationId);
}

/**
 * Update notes on a completed call summary.
 */
export function updateSummaryNotes(correlationId: string, notes: string): CallSummary | undefined {
  const summary = getSummaryStore().get(correlationId);
  if (summary) summary.notes = notes;
  return summary;
}

/**
 * Get recent call summaries (for diagnostics).
 */
export function getRecentSummaries(limit = 20): CallSummary[] {
  return [...getSummaryStore().values()].slice(-limit);
}

/**
 * Cleanup stale contexts (calls older than 4 hours).
 */
export function cleanupStaleContexts(): void {
  const store = getStore();
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;
  for (const [id, ctx] of store) {
    if (new Date(ctx.startTime).getTime() < cutoff) {
      store.delete(id);
    }
  }
}

if (typeof setInterval !== "undefined") {
  setInterval(cleanupStaleContexts, 30 * 60 * 1000).unref?.();
}
