/**
 * Connector auto-registration.
 * Import and register all connector plugins here.
 *
 * To add a new connector:
 * 1. Create the connector in src/lib/connectors/<name>/
 * 2. Import and register it below
 * 3. Restart the app
 */

import { connectorRegistry } from "@/lib/core/connector-registry";
import { eventBus } from "@/lib/core/event-bus";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/utils/crypto";
import { dlq } from "@/lib/queue/dlq";

// ── Register connectors ─────────────────────────────────

import { HubSpotConnector } from "./hubspot";

const hubspot = new HubSpotConnector();
connectorRegistry.register(hubspot);

// ── Event listeners for write-back ──────────────────────

function setupEventListeners() {
  // When an interaction completes, write back to the originating connector
  eventBus.on("interaction.completed", async ({ interactionId, tenantId }) => {
    try {
      const interaction = await prisma.interaction.findFirst({
        where: { id: interactionId, tenantId },
      });

      if (!interaction?.connectorId) return;

      const connector = connectorRegistry.tryGet(interaction.connectorId);
      if (!connector?.writeBack) return;

      // Get connector config for this tenant
      const config = await prisma.connectorConfig.findUnique({
        where: {
          tenantId_connectorId: {
            tenantId,
            connectorId: interaction.connectorId,
          },
        },
      });

      if (!config) return;

      const credentials = decryptJson<Record<string, string>>(
        config.credentials
      );

      await connector.writeBack(interaction, {
        tenantId,
        connectorId: interaction.connectorId,
        credentials,
        settings: config.settings as Record<string, unknown>,
        enabled: config.enabled,
      });

      // Mark write-back as successful
      await prisma.interaction.update({
        where: { id: interactionId },
        data: { writebackStatus: "SUCCESS" },
      });

      logger.info(
        { interactionId, connectorId: interaction.connectorId },
        "Write-back completed"
      );
    } catch (err) {
      logger.error(
        { err, interactionId, tenantId },
        "Write-back failed, pushing to DLQ"
      );

      // Mark as failed and push to DLQ
      await prisma.interaction
        .update({
          where: { id: interactionId },
          data: { writebackStatus: "FAILED" },
        })
        .catch(() => {});

      await dlq.push({
        tenantId,
        source: `writeback:interaction`,
        payload: { interactionId },
        error: (err as Error).message,
      });
    }
  });

  // When an interaction fails, also attempt write-back (to log the failure)
  eventBus.on("interaction.failed", async ({ interactionId, tenantId }) => {
    try {
      const interaction = await prisma.interaction.findFirst({
        where: { id: interactionId, tenantId },
      });

      if (!interaction?.connectorId) return;

      const connector = connectorRegistry.tryGet(interaction.connectorId);
      if (!connector?.writeBack) return;

      const config = await prisma.connectorConfig.findUnique({
        where: {
          tenantId_connectorId: {
            tenantId,
            connectorId: interaction.connectorId,
          },
        },
      });

      if (!config) return;

      const credentials = decryptJson<Record<string, string>>(
        config.credentials
      );

      await connector.writeBack(interaction, {
        tenantId,
        connectorId: interaction.connectorId,
        credentials,
        settings: config.settings as Record<string, unknown>,
        enabled: config.enabled,
      });
    } catch (err) {
      logger.warn(
        { err, interactionId },
        "Write-back for failed interaction also failed (non-critical)"
      );
    }
  });
}

// ── Initialization ──────────────────────────────────────

export async function initializeConnectors(): Promise<void> {
  setupEventListeners();

  // Load config-driven connectors from DB (after static registration)
  try {
    const { dynamicLoader } = await import("./factory/dynamic-loader");
    const dynamicCount = await dynamicLoader.loadAll();
    if (dynamicCount > 0) {
      logger.info({ count: dynamicCount }, "Dynamic connectors loaded from DB");
    }
  } catch (err) {
    logger.warn({ err }, "Dynamic connector loading skipped");
  }

  const count = connectorRegistry.size;
  const ids = connectorRegistry.listIds();

  console.log(
    `[ConnectPlus] ${count} connector(s) registered: ${ids.join(", ")}`
  );
}
