import { v4 as uuidv4 } from "uuid";
import { logger } from "../observability/logger";
import type { SSEConnection, SSEEvent, SSEEventType } from "./types";

const MAX_CONNECTIONS_PER_TENANT = 50;
const HEARTBEAT_INTERVAL_MS = 30_000;
const REPLAY_BUFFER_SIZE = 100;

/**
 * SSE Connection Manager — singleton managing per-tenant SSE connections.
 * Supports fan-out, heartbeats, and reconnection replay.
 */
class SSEConnectionManager {
  private connections = new Map<string, Set<SSEConnection>>();
  private replayBuffer = new Map<string, SSEEvent[]>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Start heartbeat timer (call once at startup) */
  start(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      this.broadcastHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    // Allow process to exit even if timer is running
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }

    logger.info("SSE connection manager started");
  }

  /** Stop heartbeat timer */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Add a new SSE connection for a tenant */
  addConnection(
    tenantId: string,
    controller: ReadableStreamDefaultController
  ): SSEConnection {
    const tenantConns = this.connections.get(tenantId) ?? new Set();

    if (tenantConns.size >= MAX_CONNECTIONS_PER_TENANT) {
      throw new Error(
        `Max SSE connections (${MAX_CONNECTIONS_PER_TENANT}) reached for tenant ${tenantId}`
      );
    }

    const conn: SSEConnection = {
      id: uuidv4(),
      tenantId,
      controller,
      connectedAt: Date.now(),
    };

    tenantConns.add(conn);
    this.connections.set(tenantId, tenantConns);

    logger.info(
      { tenantId, connectionId: conn.id, total: tenantConns.size },
      "SSE connection added"
    );

    return conn;
  }

  /** Remove a connection */
  removeConnection(conn: SSEConnection): void {
    const tenantConns = this.connections.get(conn.tenantId);
    if (!tenantConns) return;

    tenantConns.delete(conn);

    if (tenantConns.size === 0) {
      this.connections.delete(conn.tenantId);
    }

    logger.info(
      { tenantId: conn.tenantId, connectionId: conn.id },
      "SSE connection removed"
    );
  }

  /** Replay missed events for a reconnecting client */
  replayAfter(tenantId: string, lastEventId: string): SSEEvent[] {
    const buffer = this.replayBuffer.get(tenantId) ?? [];
    const idx = buffer.findIndex((e) => e.id === lastEventId);
    if (idx === -1) return buffer; // Unknown ID — replay everything available
    return buffer.slice(idx + 1);
  }

  /** Broadcast an event to all connections of a specific tenant */
  broadcast<T>(tenantId: string, type: SSEEventType, data: T): void {
    const event: SSEEvent<T> = {
      id: uuidv4(),
      type,
      data,
      timestamp: Date.now(),
    };

    // Store in replay buffer
    this.storeInReplayBuffer(tenantId, event);

    const tenantConns = this.connections.get(tenantId);
    if (!tenantConns || tenantConns.size === 0) {
      logger.debug({ tenantId, type }, "No SSE connections for tenant, event dropped");
      return;
    }

    const payload = this.formatSSE(event);
    const dead: SSEConnection[] = [];

    for (const conn of tenantConns) {
      try {
        conn.controller.enqueue(new TextEncoder().encode(payload));
      } catch {
        dead.push(conn);
      }
    }

    // Clean up dead connections
    for (const conn of dead) {
      this.removeConnection(conn);
    }

    logger.debug(
      { tenantId, type, recipients: tenantConns.size - dead.length },
      "SSE event broadcast"
    );
  }

  /** Send a single event to a specific connection */
  sendTo(conn: SSEConnection, event: SSEEvent): void {
    const payload = this.formatSSE(event);
    try {
      conn.controller.enqueue(new TextEncoder().encode(payload));
    } catch {
      this.removeConnection(conn);
    }
  }

  /** Get connection count for a tenant */
  connectionCount(tenantId: string): number {
    return this.connections.get(tenantId)?.size ?? 0;
  }

  /** Get total connection count across all tenants */
  totalConnections(): number {
    let total = 0;
    for (const conns of this.connections.values()) {
      total += conns.size;
    }
    return total;
  }

  // ─── Private ─────────────────────────────────────────

  private broadcastHeartbeat(): void {
    for (const [tenantId, tenantConns] of this.connections) {
      if (tenantConns.size === 0) continue;

      const event: SSEEvent = {
        id: uuidv4(),
        type: "heartbeat",
        data: { timestamp: Date.now() },
        timestamp: Date.now(),
      };

      const payload = this.formatSSE(event);
      const dead: SSEConnection[] = [];

      for (const conn of tenantConns) {
        try {
          conn.controller.enqueue(new TextEncoder().encode(payload));
        } catch {
          dead.push(conn);
        }
      }

      for (const conn of dead) {
        this.removeConnection(conn);
      }

      if (dead.length > 0) {
        logger.debug(
          { tenantId, cleaned: dead.length },
          "Cleaned dead SSE connections during heartbeat"
        );
      }
    }
  }

  private storeInReplayBuffer(tenantId: string, event: SSEEvent): void {
    const buffer = this.replayBuffer.get(tenantId) ?? [];
    buffer.push(event);

    // Trim to max size
    if (buffer.length > REPLAY_BUFFER_SIZE) {
      buffer.splice(0, buffer.length - REPLAY_BUFFER_SIZE);
    }

    this.replayBuffer.set(tenantId, buffer);
  }

  private formatSSE(event: SSEEvent): string {
    return (
      `id: ${event.id}\n` +
      `event: ${event.type}\n` +
      `data: ${JSON.stringify(event.data)}\n\n`
    );
  }
}

/** Singleton SSE connection manager — stored on globalThis to survive Next.js module re-bundling */
const globalForSSE = globalThis as unknown as {
  sseManager: SSEConnectionManager | undefined;
};

if (!globalForSSE.sseManager) {
  globalForSSE.sseManager = new SSEConnectionManager();
}

export const sseManager = globalForSSE.sseManager;
