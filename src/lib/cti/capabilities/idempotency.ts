/**
 * CTI Idempotency — shared duplicate event protection for all telephony connectors.
 *
 * Provides:
 * - Event deduplication with configurable time window
 * - Event ordering protection (reject out-of-order events)
 * - Correlation ID management
 *
 * Reusable by: any telephony connector.
 */

import { randomUUID } from "node:crypto";

/**
 * Idempotency store — tracks seen events to prevent duplicates.
 * Uses globalThis for singleton across Next.js module re-bundles.
 */
const STORE_KEY = Symbol.for("cti.idempotency.store");

interface EventRecord {
  key: string;
  state: string;
  timestamp: number;
  sequenceNumber: number;
}

function getStore(): Map<string, EventRecord> {
  const g = globalThis as Record<symbol, Map<string, EventRecord>>;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = new Map();
  }
  return g[STORE_KEY];
}

const CORRELATION_KEY = Symbol.for("cti.idempotency.correlations");

function getCorrelations(): Map<string, string> {
  const g = globalThis as Record<symbol, Map<string, string>>;
  if (!g[CORRELATION_KEY]) {
    g[CORRELATION_KEY] = new Map();
  }
  return g[CORRELATION_KEY];
}

/**
 * Configuration for idempotency behavior.
 */
export interface IdempotencyConfig {
  /** Time window in ms for dedup (default: 2000 = ±2s) */
  windowMs?: number;
  /** Max entries before cleanup (default: 5000) */
  maxEntries?: number;
  /** Stale entry TTL in ms (default: 4 hours) */
  staleTtlMs?: number;
}

const DEFAULT_CONFIG: Required<IdempotencyConfig> = {
  windowMs: 2000,
  maxEntries: 5000,
  staleTtlMs: 4 * 60 * 60 * 1000,
};

/**
 * Get or create a stable correlation ID for a provider call.
 */
export function ensureCorrelationId(providerCallId: string): string {
  const correlations = getCorrelations();
  const existing = correlations.get(providerCallId);
  if (existing) return existing;

  const id = randomUUID();
  correlations.set(providerCallId, id);
  return id;
}

/**
 * Look up an existing correlation ID.
 */
export function getCorrelationId(providerCallId: string): string | undefined {
  return getCorrelations().get(providerCallId);
}

/**
 * Remove a correlation mapping (after call is fully logged).
 */
export function removeCorrelation(providerCallId: string): void {
  getCorrelations().delete(providerCallId);
}

/**
 * Check if an event is a duplicate.
 *
 * An event is duplicate if the same correlationId + state was seen within the time window.
 * Returns true if duplicate (should be skipped).
 */
export function isDuplicate(
  correlationId: string,
  state: string,
  timestamp: number,
  config?: IdempotencyConfig
): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const store = getStore();
  const windowKey = Math.floor(timestamp / cfg.windowMs);
  const key = `${correlationId}:${state}:${windowKey}`;

  if (store.has(key)) return true;

  store.set(key, {
    key,
    state,
    timestamp,
    sequenceNumber: store.size,
  });

  // Cleanup if store is too large
  if (store.size > cfg.maxEntries) {
    pruneStore(cfg.staleTtlMs);
  }

  return false;
}

/**
 * Check event ordering — reject events with states that are "behind" the current state.
 * Returns true if the event is out of order (should be skipped).
 */
export function isOutOfOrder(
  correlationId: string,
  state: string,
  stateOrder: string[]
): boolean {
  const store = getStore();
  const stateIndex = stateOrder.indexOf(state);
  if (stateIndex === -1) return false; // Unknown state, allow through

  // Find the highest state we've seen for this correlation
  let highestIndex = -1;
  for (const [, record] of store) {
    if (record.key.startsWith(`${correlationId}:`)) {
      const recordState = record.key.split(":")[1];
      const idx = stateOrder.indexOf(recordState);
      if (idx > highestIndex) highestIndex = idx;
    }
  }

  return stateIndex < highestIndex;
}

/**
 * Remove stale entries from the store.
 */
function pruneStore(staleTtlMs: number): void {
  const store = getStore();
  const cutoff = Date.now() - staleTtlMs;

  for (const [key, record] of store) {
    if (record.timestamp < cutoff) {
      store.delete(key);
    }
  }
}

/**
 * Clean up all idempotency state for a correlation (call completed).
 */
export function clearCallState(correlationId: string): void {
  const store = getStore();
  for (const key of store.keys()) {
    if (key.startsWith(`${correlationId}:`)) {
      store.delete(key);
    }
  }
  // Also clean correlation map
  for (const [providerCallId, corrId] of getCorrelations()) {
    if (corrId === correlationId) {
      getCorrelations().delete(providerCallId);
      break;
    }
  }
}

// Periodic cleanup every 30 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => pruneStore(DEFAULT_CONFIG.staleTtlMs), 30 * 60 * 1000).unref?.();
}
