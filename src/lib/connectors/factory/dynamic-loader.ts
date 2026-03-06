/**
 * Dynamic Connector Loader — loads config-driven connector definitions from DB
 * and registers them in the ConnectorRegistry at app startup.
 */

import { prisma } from "../../db";
import { connectorRegistry } from "../../core/connector-registry";
import { RestCrmConnector } from "./rest-crm-connector";
import { connectorDefinitionConfigSchema } from "./config-schema";
import { logger } from "../../observability/logger";
import type { ConnectorDefinitionConfig } from "./types";

class DynamicConnectorLoader {
  /**
   * Load all ACTIVE connector definitions from DB and register them.
   * Called during app startup, after static connectors are registered.
   */
  async loadAll(): Promise<number> {
    let loaded = 0;

    try {
      const definitions = await prisma.connectorDefinition.findMany({
        where: { status: "ACTIVE" },
      });

      for (const def of definitions) {
        try {
          // Code-based connectors take precedence
          if (connectorRegistry.has(def.slug)) {
            logger.debug(
              { slug: def.slug },
              "Skipping dynamic connector — code-based connector with same ID exists"
            );
            continue;
          }

          // Validate config
          const parseResult = connectorDefinitionConfigSchema.safeParse(def.config);
          if (!parseResult.success) {
            logger.error(
              { slug: def.slug, errors: parseResult.error.issues },
              "Invalid connector definition config, skipping"
            );
            continue;
          }

          const config = parseResult.data as ConnectorDefinitionConfig;
          const connector = new RestCrmConnector(
            def.slug,
            def.name,
            `${def.version}.0.0`,
            config
          );

          connectorRegistry.register(connector);
          loaded++;

          logger.info(
            { slug: def.slug, version: def.version },
            "Dynamic connector loaded"
          );
        } catch (err) {
          logger.error(
            { err, slug: def.slug },
            "Failed to load dynamic connector"
          );
        }
      }
    } catch (err) {
      // DB might not be available yet (e.g., during migration)
      logger.warn({ err }, "Could not load dynamic connectors from DB");
    }

    return loaded;
  }

  /**
   * Hot-reload a single connector definition.
   * Called after the wizard saves/activates a definition.
   */
  async reload(slug: string): Promise<boolean> {
    try {
      // Save existing connector so we can rollback if new config fails
      const previous = connectorRegistry.tryGet(slug) ?? null;

      const def = await prisma.connectorDefinition.findUnique({
        where: { slug },
      });

      if (!def || def.status !== "ACTIVE") {
        // Intentional removal — unregister only when definition is explicitly inactive
        if (connectorRegistry.has(slug)) {
          connectorRegistry.unregister(slug);
        }
        logger.info({ slug }, "Connector definition not active, unregistered");
        return false;
      }

      const parseResult = connectorDefinitionConfigSchema.safeParse(def.config);
      if (!parseResult.success) {
        logger.error({ slug, errors: parseResult.error.issues }, "Invalid config on reload — keeping previous version");
        return false;
      }

      const config = parseResult.data as ConnectorDefinitionConfig;
      const connector = new RestCrmConnector(
        def.slug,
        def.name,
        `${def.version}.0.0`,
        config
      );

      // Only unregister after new connector is built successfully
      if (connectorRegistry.has(slug)) {
        connectorRegistry.unregister(slug);
      }
      connectorRegistry.register(connector);
      logger.info({ slug }, "Dynamic connector hot-reloaded");
      return true;
    } catch (err) {
      logger.error({ err, slug }, "Failed to hot-reload connector");
      return false;
    }
  }
}

// Singleton
const globalForLoader = globalThis as unknown as {
  dynamicConnectorLoader: DynamicConnectorLoader | undefined;
};

if (!globalForLoader.dynamicConnectorLoader) {
  globalForLoader.dynamicConnectorLoader = new DynamicConnectorLoader();
}

export const dynamicLoader = globalForLoader.dynamicConnectorLoader;
