/**
 * Event correlation & de-duplication engine.
 *
 * - Generates stable correlationId at first sighting of a new provider callId
 * - Maps provider callId -> correlationId
 * - De-duplicates events using idempotency keys (same state within ±2s = dup)
 * - Survives widget reconnections without creating duplicate CRM logs
 *
 * Uses Redis when REDIS_URL is set, otherwise falls back to in-memory Map.
 */

import { randomUUID } from "node:crypto";
import { makeIdempotencyKey } from "../types/call-event";
import type { CallState } from "../types/call-event";
import { createStore, type StateStore } from "../../state/store";
import { logger } from "../../observability/logger";

const log = logger.child({ module: "cti-correlator" });

interface CorrelationEntry {
  correlationId: string;
  providerCallId: string;
  tenantId: string;
  agentId: string;
  createdAt: number;
}

// 4 hour TTL — calls older than this are stale
const CALL_TTL = 4 * 60 * 60 * 1000;
// Dedup events expire after 1 hour
const EVENT_TTL = 60 * 60 * 1000;

const correlationStore: StateStore<CorrelationEntry> = createStore("cti:corr", { ttlMs: CALL_TTL });
const seenEventsStore: StateStore<number> = createStore("cti:seen", { ttlMs: EVENT_TTL });

/**
 * Get or create a correlationId for a provider call.
 */
export async function getCorrelationId(
  providerCallId: string,
  tenantId: string,
  agentId: string
): Promise<string> {
  const existing = await correlationStore.get(providerCallId);
  if (existing) return existing.correlationId;

  const correlationId = randomUUID();
  await correlationStore.set(providerCallId, {
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
export async function lookupCorrelation(
  providerCallId: string
): Promise<CorrelationEntry | undefined> {
  return correlationStore.get(providerCallId);
}

/**
 * Check if an event is a duplicate (same correlationId + state within ±2s).
 * Returns true if this is a DUPLICATE that should be skipped.
 */
export async function isDuplicateEvent(
  correlationId: string,
  state: CallState,
  timestamp: string
): Promise<boolean> {
  const key = makeIdempotencyKey(correlationId, state, timestamp);

  if (await seenEventsStore.has(key)) {
    log.debug({ correlationId, state, key }, "Duplicate CTI event suppressed");
    return true;
  }

  await seenEventsStore.set(key, Date.now());
  return false;
}

/**
 * Remove a completed call from the correlation map.
 * Called after call logging is confirmed.
 */
export async function clearCorrelation(providerCallId: string): Promise<void> {
  await correlationStore.delete(providerCallId);
}
