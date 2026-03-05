/**
 * Call Context Storage — stores session context for active calls.
 *
 * Used for:
 * - Carrying CRM match data through the call lifecycle
 * - Feeding call logging with contact + module data
 * - Screen pop state tracking
 */

import { logger } from "../../observability/logger";

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
 * Remove call context (after call ends and logging is done).
 */
export function removeCallContext(callId: string): CallContext | undefined {
  const store = getStore();
  const ctx = store.get(callId);
  store.delete(callId);
  return ctx;
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
