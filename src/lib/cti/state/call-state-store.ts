/**
 * Call state store — tracks active calls per tenant/agent.
 * Uses Redis when REDIS_URL is set, otherwise falls back to in-memory Map.
 */

import type { CallState, CtiCallEvent, CrmContext } from "../types/call-event";
import { createStore, type StateStore } from "../../state/store";
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

// Active calls expire after 4 hours
const store: StateStore<ActiveCall> = createStore("cti:calls", { ttlMs: 4 * 60 * 60 * 1000 });

/** Composite key: tenantId:callId */
function callKey(tenantId: string, callId: string): string {
  return `${tenantId}:${callId}`;
}

/**
 * Update call state from an incoming event.
 */
export async function updateCallState(event: CtiCallEvent): Promise<ActiveCall> {
  const key = callKey(event.tenantId, event.callId);
  const existing = await store.get(key);

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
    // Keep briefly for final state queries, then TTL expires it
    await store.set(key, call, 60_000);
    log.info({ correlationId: call.correlationId, state: event.state }, "Call ended");
  } else {
    await store.set(key, call);
  }

  return call;
}

/**
 * Get active call by provider callId.
 */
export async function getCall(tenantId: string, callId: string): Promise<ActiveCall | undefined> {
  return store.get(callKey(tenantId, callId));
}

/**
 * Get all active calls for a tenant+agent.
 */
export async function getAgentCalls(tenantId: string, agentId: string): Promise<ActiveCall[]> {
  const all = await store.values();
  return all.filter(c => c.tenantId === tenantId && c.agentId === agentId);
}

/**
 * Get all active calls for a tenant.
 */
export async function getTenantCalls(tenantId: string): Promise<ActiveCall[]> {
  const all = await store.values();
  return all.filter(c => c.tenantId === tenantId);
}

/**
 * Update mute state for a call.
 */
export async function setMuteState(tenantId: string, callId: string, muted: boolean): Promise<void> {
  const call = await store.get(callKey(tenantId, callId));
  if (call) {
    call.isMuted = muted;
    await store.set(callKey(tenantId, callId), call);
  }
}

/**
 * Remove a call from the store.
 */
export async function removeCall(tenantId: string, callId: string): Promise<void> {
  await store.delete(callKey(tenantId, callId));
}
