import { EventEmitter } from "events";
import type { ConnectorEvent, HealthStatus } from "./connector-interface";
import type { InteractionStatus } from "./models/interaction";
import type { ScreenPopData } from "../sse/types";
import { logger } from "../observability/logger";

// ─── Event type map ──────────────────────────────────────
export interface FrameworkEvents {
  "interaction.created": { interactionId: string; tenantId: string };
  "interaction.updated": {
    interactionId: string;
    tenantId: string;
    prevStatus: InteractionStatus;
    newStatus: InteractionStatus;
  };
  "interaction.completed": { interactionId: string; tenantId: string };
  "interaction.failed": {
    interactionId: string;
    tenantId: string;
    error: string;
  };
  "connector.webhook": {
    connectorId: string;
    tenantId: string;
    event: ConnectorEvent;
  };
  "connector.health": { connectorId: string; status: HealthStatus };
  /** Generic PBX callback — works with Rainbow, RingCentral, Asterisk, etc. */
  "pbx.callback": { vendor: string; eventType: string; tenantId: string; payload: unknown };
  /** @deprecated Use "pbx.callback" — kept for backward compatibility */
  "rainbow.callback": { eventType: string; tenantId: string; payload: unknown };
  "screen.pop": { tenantId: string; data: ScreenPopData };
  "call.status_changed": {
    tenantId: string;
    interactionId: string;
    status: string;
    pbxCallId?: string;
    /** @deprecated Use pbxCallId */
    rainbowCallId?: string;
  };
}

type EventName = keyof FrameworkEvents;
type EventPayload<E extends EventName> = FrameworkEvents[E];

// ─── Typed event bus ─────────────────────────────────────
class FrameworkEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  on<E extends EventName>(
    event: E,
    handler: (payload: EventPayload<E>) => void | Promise<void>
  ): void {
    this.emitter.on(event, handler);
  }

  off<E extends EventName>(
    event: E,
    handler: (payload: EventPayload<E>) => void | Promise<void>
  ): void {
    this.emitter.off(event, handler);
  }

  emit<E extends EventName>(event: E, payload: EventPayload<E>): void {
    logger.debug({ event, payload }, `Event emitted: ${event}`);
    this.emitter.emit(event, payload);
  }

  listenerCount(event: EventName): number {
    return this.emitter.listenerCount(event);
  }
}

/** Singleton event bus — stored on globalThis to survive Next.js module re-bundling */
const globalForEventBus = globalThis as unknown as {
  frameworkEventBus: FrameworkEventBus | undefined;
};

if (!globalForEventBus.frameworkEventBus) {
  globalForEventBus.frameworkEventBus = new FrameworkEventBus();
}

export const eventBus = globalForEventBus.frameworkEventBus;
