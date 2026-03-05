/**
 * Event correlation & de-duplication engine.
 *
 * - Generates stable correlationId at first sighting of a new provider callId
 * - Maps provider callId -> correlationId
 * - De-duplicates events using idempotency keys (same state within ±2s = dup)
 * - Survives widget reconnections without creating duplicate CRM logs
 */

import { randomUUID } from "node:crypto";
import { makeIdempotencyKey } from "../types/call-event";
import type { CallState } from "../types/call-event";
import { logger } from "../../observability/logger";

const log = logger.child({ module: "cti-correlator" });

interface CorrelationEntry {
  correlationId: string;
  providerCallId: string;
  tenantId: string;
  agentId: string;
  createdAt: number;
}

// In-memory stores (production would use Redis)
const KEY = Symbol.for("cti.correlator");

interface CorrelatorState {
  /** providerCallId -> correlationEntry */
  correlationMap: Map<string, CorrelationEntry>;
  /** idempotencyKey -> timestamp */
  seenEvents: Map<string, number>;
}

function getState(): CorrelatorState {
  const g = globalThis as Record<symbol, CorrelatorState>;
  if (!g[KEY]) {
    g[KEY] = {
      correlationMap: new Map(),
      seenEvents: new Map(),
    };
  }
  return g[KEY];
}

/**
 * Get or create a correlationId for a provider call.
 */
export function getCorrelationId(
  providerCallId: string,
  tenantId: string,
  agentId: string
): string {
  const state = getState();
  const existing = state.correlationMap.get(providerCallId);
  if (existing) return existing.correlationId;

  const correlationId = randomUUID();
  state.correlationMap.set(providerCallId, {
    correlationId,
    providerCallId,
    tenantId,
    agentId,
    createdAt: Date.now(),
  });

  log.info(
    { providerCallId, correlationId, tenantId, agentId },
    "New call correlation created"
  );

  return correlationId;
}

/**
 * Look up an existing correlationId (returns undefined if not found).
 */
export function lookupCorrelation(
  providerCallId: string
): CorrelationEntry | undefined {
  return getState().correlationMap.get(providerCallId);
}

/**
 * Check if an event is a duplicate (same correlationId + state within ±2s).
 * Returns true if this is a DUPLICATE that should be skipped.
 */
export function isDuplicateEvent(
  correlationId: string,
  state: CallState,
  timestamp: string
): boolean {
  const store = getState();
  const key = makeIdempotencyKey(correlationId, state, timestamp);

  if (store.seenEvents.has(key)) {
    log.debug({ correlationId, state, key }, "Duplicate CTI event suppressed");
    return true;
  }

  store.seenEvents.set(key, Date.now());
  return false;
}

/**
 * Remove a completed call from the correlation map.
 * Called after call logging is confirmed.
 */
export function clearCorrelation(providerCallId: string): void {
  getState().correlationMap.delete(providerCallId);
}

/**
 * Periodic cleanup of stale entries (calls older than 4 hours).
 */
export function cleanupStaleEntries(): void {
  const state = getState();
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;

  for (const [key, entry] of state.correlationMap) {
    if (entry.createdAt < cutoff) {
      state.correlationMap.delete(key);
    }
  }

  for (const [key, ts] of state.seenEvents) {
    if (ts < cutoff) {
      state.seenEvents.delete(key);
    }
  }
}

// Run cleanup every 30 minutes
if (typeof setInterval !== "undefined") {
  setInterval(cleanupStaleEntries, 30 * 60 * 1000).unref?.();
}
