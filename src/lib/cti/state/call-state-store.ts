/**
 * In-memory call state store — tracks active calls per tenant/agent.
 * Production would back this with Redis for multi-instance deployments.
 */

import type { CallState, CtiCallEvent, CrmContext } from "../types/call-event";
import { logger } from "../../observability/logger";

const log = logger.child({ module: "cti-call-state" });

export interface ActiveCall {
  callId: string;
  correlationId: string;
  direction: "inbound" | "outbound";
  fromNumber: string;
  toNumber: string;
  state: CallState;
  agentId: string;
  tenantId: string;
  startedAt: string;
  updatedAt: string;
  crmContext?: CrmContext;
  durationSecs?: number;
  isMuted: boolean;
  isOnHold: boolean;
}

const KEY = Symbol.for("cti.callStateStore");

function getStore(): Map<string, ActiveCall> {
  const g = globalThis as Record<symbol, Map<string, ActiveCall>>;
  if (!g[KEY]) {
    g[KEY] = new Map();
  }
  return g[KEY];
}

/** Composite key: tenantId:callId */
function callKey(tenantId: string, callId: string): string {
  return `${tenantId}:${callId}`;
}

/**
 * Update call state from an incoming event.
 */
export function updateCallState(event: CtiCallEvent): ActiveCall {
  const store = getStore();
  const key = callKey(event.tenantId, event.callId);
  const existing = store.get(key);

  const call: ActiveCall = {
    callId: event.callId,
    correlationId: event.correlationId,
    direction: event.direction,
    fromNumber: event.fromNumber,
    toNumber: event.toNumber,
    state: event.state,
    agentId: event.agentId,
    tenantId: event.tenantId,
    startedAt: existing?.startedAt ?? event.timestamp,
    updatedAt: event.timestamp,
    crmContext: event.crmContext ?? existing?.crmContext,
    durationSecs: event.durationSecs,
    isMuted: existing?.isMuted ?? false,
    isOnHold: event.state === "held",
  };

  if (event.state === "ended" || event.state === "missed" || event.state === "failed") {
    // Keep in store briefly for final state queries, then cleanup
    store.set(key, call);
    setTimeout(() => store.delete(key), 60_000);
    log.info({ correlationId: call.correlationId, state: event.state }, "Call ended");
  } else {
    store.set(key, call);
  }

  return call;
}

/**
 * Get active call by provider callId.
 */
export function getCall(tenantId: string, callId: string): ActiveCall | undefined {
  return getStore().get(callKey(tenantId, callId));
}

/**
 * Get all active calls for a tenant+agent.
 */
export function getAgentCalls(tenantId: string, agentId: string): ActiveCall[] {
  const result: ActiveCall[] = [];
  for (const call of getStore().values()) {
    if (call.tenantId === tenantId && call.agentId === agentId) {
      result.push(call);
    }
  }
  return result;
}

/**
 * Get all active calls for a tenant.
 */
export function getTenantCalls(tenantId: string): ActiveCall[] {
  const result: ActiveCall[] = [];
  for (const call of getStore().values()) {
    if (call.tenantId === tenantId) {
      result.push(call);
    }
  }
  return result;
}

/**
 * Update mute state for a call.
 */
export function setMuteState(tenantId: string, callId: string, muted: boolean): void {
  const call = getStore().get(callKey(tenantId, callId));
  if (call) call.isMuted = muted;
}

/**
 * Remove a call from the store.
 */
export function removeCall(tenantId: string, callId: string): void {
  getStore().delete(callKey(tenantId, callId));
}
