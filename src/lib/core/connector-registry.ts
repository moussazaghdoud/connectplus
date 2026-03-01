import type { ConnectorInterface, ConnectorManifest } from "./connector-interface";
import { ConnectorError } from "./errors";
import { logger } from "../observability/logger";

/**
 * Connector Registry — manages the lifecycle of all connector plugins.
 *
 * Adding a new connector:
 * 1. Implement ConnectorInterface in src/lib/connectors/<name>/index.ts
 * 2. Call registry.register(connector) at app startup
 *
 * Zero core logic changes required.
 */
class ConnectorRegistry {
  private connectors = new Map<string, ConnectorInterface>();

  /** Register a connector plugin */
  register(connector: ConnectorInterface): void {
    const { id, name, version } = connector.manifest;

    if (this.connectors.has(id)) {
      throw new ConnectorError(
        id,
        `Connector '${id}' is already registered`
      );
    }

    this.connectors.set(id, connector);
    logger.info(
      { connectorId: id, name, version },
      `Connector registered: ${name} v${version}`
    );
  }

  /** Unregister a connector */
  unregister(connectorId: string): boolean {
    const removed = this.connectors.delete(connectorId);
    if (removed) {
      logger.info({ connectorId }, `Connector unregistered: ${connectorId}`);
    }
    return removed;
  }

  /** Get a connector by ID (throws if not found) */
  get(connectorId: string): ConnectorInterface {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new ConnectorError(
        connectorId,
        `Connector '${connectorId}' is not registered`
      );
    }
    return connector;
  }

  /** Get a connector by ID (returns null if not found) */
  tryGet(connectorId: string): ConnectorInterface | null {
    return this.connectors.get(connectorId) ?? null;
  }

  /** Check if a connector is registered */
  has(connectorId: string): boolean {
    return this.connectors.has(connectorId);
  }

  /** List all registered connector manifests */
  listManifests(): ConnectorManifest[] {
    return Array.from(this.connectors.values()).map((c) => c.manifest);
  }

  /** List all registered connector IDs */
  listIds(): string[] {
    return Array.from(this.connectors.keys());
  }

  /** Number of registered connectors */
  get size(): number {
    return this.connectors.size;
  }
}

/** Singleton registry */
export const connectorRegistry = new ConnectorRegistry();
