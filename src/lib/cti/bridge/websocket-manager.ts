/**
 * CTI WebSocket Manager — real-time event push to embedded widgets.
 *
 * Uses SSE (Server-Sent Events) instead of raw WebSocket because:
 * - Next.js API routes don't natively support WebSocket upgrade
 * - SSE works through all proxies/CDNs (Railway, Cloudflare)
 * - Automatic reconnection built into EventSource
 * - Sufficient for unidirectional event push (commands go via REST)
 *
 * Architecture:
 *   Widget <-- SSE (events) -- Bridge -- REST (commands) --> Widget
 */

import type { CtiCallEvent } from "../types/call-event";
import { logger } from "../../observability/logger";

const log = logger.child({ module: "cti-ws-manager" });

export interface CtiSubscriber {
  id: string;
  tenantId: string;
  agentId: string;
  controller: ReadableStreamDefaultController;
  connectedAt: number;
}

const KEY = Symbol.for("cti.wsManager");

function getSubscribers(): Map<string, CtiSubscriber> {
  const g = globalThis as Record<symbol, Map<string, CtiSubscriber>>;
  if (!g[KEY]) {
    g[KEY] = new Map();
  }
  return g[KEY];
}

const encoder = new TextEncoder();

function sendSSE(
  controller: ReadableStreamDefaultController,
  event: string,
  data: unknown
): boolean {
  try {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(encoder.encode(payload));
    return true;
  } catch {
    return false;
  }
}

/**
 * Register a new CTI widget subscriber.
 */
export function addSubscriber(sub: CtiSubscriber): void {
  getSubscribers().set(sub.id, sub);
  sendSSE(sub.controller, "connected", {
    subscriberId: sub.id,
    tenantId: sub.tenantId,
    agentId: sub.agentId,
  });
  log.info(
    { subscriberId: sub.id, tenantId: sub.tenantId, agentId: sub.agentId },
    "CTI subscriber connected"
  );
}

/**
 * Remove a subscriber (on disconnect).
 */
export function removeSubscriber(id: string): void {
  getSubscribers().delete(id);
  log.info({ subscriberId: id }, "CTI subscriber disconnected");
}

/**
 * Broadcast a call event to all matching subscribers (same tenant + agent).
 * If agentId is "*", broadcast to all agents in the tenant.
 */
export function broadcastCallEvent(event: CtiCallEvent): number {
  const subs = getSubscribers();
  let sent = 0;
  const dead: string[] = [];

  for (const [id, sub] of subs) {
    if (sub.tenantId !== event.tenantId) continue;
    if (event.agentId !== "*" && sub.agentId !== event.agentId) continue;

    const ok = sendSSE(sub.controller, "call.event", event);
    if (ok) {
      sent++;
    } else {
      dead.push(id);
    }
  }

  // Clean up dead connections
  for (const id of dead) {
    subs.delete(id);
  }

  if (sent > 0) {
    log.debug(
      { correlationId: event.correlationId, state: event.state, sent },
      "CTI event broadcast"
    );
  }

  return sent;
}

/**
 * Send current call state to a specific subscriber (for reconnection sync).
 */
export function sendStateSync(
  subscriberId: string,
  calls: CtiCallEvent[]
): void {
  const sub = getSubscribers().get(subscriberId);
  if (!sub) return;
  sendSSE(sub.controller, "state.sync", { activeCalls: calls });
}

/**
 * Send heartbeat to all subscribers.
 */
export function sendHeartbeats(): void {
  const subs = getSubscribers();
  const dead: string[] = [];

  for (const [id, sub] of subs) {
    const ok = sendSSE(sub.controller, "heartbeat", {
      timestamp: new Date().toISOString(),
    });
    if (!ok) dead.push(id);
  }

  for (const id of dead) subs.delete(id);
}

/**
 * Broadcast a screen pop event to matching subscribers.
 */
/**
 * Broadcast a screen pop event to matching subscribers.
 * If agentId is "*", broadcast to all agents in the tenant.
 */
export function broadcastScreenPop(
  tenantId: string,
  agentId: string,
  data: {
    callId: string;
    correlationId: string;
    phone: string;
    direction: string;
    contact?: {
      name: string;
      recordId: string;
      module: string;
      company?: string;
      crmUrl?: string;
    };
  }
): number {
  const subs = getSubscribers();
  let sent = 0;
  const dead: string[] = [];

  for (const [id, sub] of subs) {
    if (sub.tenantId !== tenantId) continue;
    if (agentId !== "*" && sub.agentId !== agentId) continue;

    const ok = sendSSE(sub.controller, "screen_pop", {
      type: "screen_pop",
      ...data,
    });
    if (ok) sent++;
    else dead.push(id);
  }

  for (const id of dead) subs.delete(id);

  if (sent > 0) {
    log.info(
      { callId: data.callId, contact: data.contact?.name, sent },
      "Screen pop broadcast"
    );
  }

  return sent;
}

/**
 * Broadcast a click-to-dial event to all subscribers for a tenant.
 */
export function broadcastClickToDial(
  tenantId: string,
  data: { number: string }
): number {
  const subs = getSubscribers();
  let sent = 0;
  const dead: string[] = [];

  for (const [id, sub] of subs) {
    if (sub.tenantId !== tenantId) continue;
    const ok = sendSSE(sub.controller, "click_to_dial", data);
    if (ok) sent++;
    else dead.push(id);
  }

  for (const id of dead) subs.delete(id);

  if (sent > 0) {
    log.info({ number: data.number, sent }, "Click-to-dial broadcast");
  }

  return sent;
}

/**
 * Get subscriber count for a tenant.
 */
export function getSubscriberCount(tenantId: string): number {
  let count = 0;
  for (const sub of getSubscribers().values()) {
    if (sub.tenantId === tenantId) count++;
  }
  return count;
}

// Heartbeat every 30s
if (typeof setInterval !== "undefined") {
  setInterval(sendHeartbeats, 30_000).unref?.();
}
