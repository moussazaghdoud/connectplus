/**
 * Shared contact resolution utilities.
 * Used by both the server-side InboundCallHandler (S2S mode) and
 * the WebRTC call event endpoint.
 *
 * Resolution order:
 * 1. Local DB (fast, cached contacts)
 * 2. Active CRM connectors (Zoho, Salesforce, etc.) — live lookup by phone
 */

import { prisma } from "../db";
import { normalizePhone, phoneMatch } from "../utils/phone";
import { connectorRegistry } from "./connector-registry";
import { decryptJson } from "../utils/crypto";
import { logger } from "../observability/logger";

/** Resolve a caller by phone number — local DB first, then CRM connectors */
export async function resolveCallerByPhone(
  tenantId: string,
  normalizedPhone: string
) {
  logger.info({ tenantId, normalizedPhone }, "[ContactResolver] resolveCallerByPhone called");

  if (!normalizedPhone) {
    logger.warn({ tenantId }, "[ContactResolver] Empty phone number, returning null");
    return null;
  }

  // 1. Try local DB (exact match)
  const exactMatch = await prisma.contact.findFirst({
    where: { tenantId, phone: normalizedPhone },
  });
  if (exactMatch) {
    logger.info({ tenantId, normalizedPhone, contactName: exactMatch.displayName }, "[ContactResolver] Found exact match in local DB");
    return exactMatch;
  }

  // 2. Try local DB (fuzzy match)
  const candidates = await prisma.contact.findMany({
    where: { tenantId, phone: { not: null } },
    take: 500,
  });
  logger.info({ tenantId, normalizedPhone, candidateCount: candidates.length }, "[ContactResolver] Local DB fuzzy match candidates");

  for (const c of candidates) {
    if (c.phone && phoneMatch(normalizedPhone, c.phone)) {
      logger.info({ tenantId, normalizedPhone, contactName: c.displayName }, "[ContactResolver] Found fuzzy match in local DB");
      return c;
    }
  }

  // 3. Try active CRM connectors (live lookup)
  logger.info({ tenantId, normalizedPhone }, "[ContactResolver] No local match, trying CRM connectors");
  try {
    const result = await resolveFromConnectors(tenantId, normalizedPhone);
    if (result) {
      logger.info({ tenantId, normalizedPhone, contactName: result.displayName }, "[ContactResolver] Resolved from CRM connector");
      return result;
    }
    logger.info({ tenantId, normalizedPhone }, "[ContactResolver] No results from CRM connectors");
  } catch (err) {
    logger.warn({ err, tenantId }, "[ContactResolver] CRM connector lookup failed, continuing without contact");
  }

  return null;
}

/** Search all configured CRM connectors for a contact by phone */
async function resolveFromConnectors(tenantId: string, phone: string) {
  // Get all configured connectors for this tenant
  const configs = await prisma.connectorConfig.findMany({
    where: { tenantId, enabled: true },
  });

  logger.info(
    { tenantId, phone, configCount: configs.length, connectorIds: configs.map(c => c.connectorId) },
    "[ContactResolver] resolveFromConnectors: found enabled configs"
  );

  if (configs.length === 0) {
    logger.warn({ tenantId }, "[ContactResolver] No enabled connector configs found for tenant");
    return null;
  }

  for (const config of configs) {
    logger.info({ tenantId, connectorId: config.connectorId }, "[ContactResolver] Trying connector");

    let connector = connectorRegistry.tryGet(config.connectorId);
    logger.info(
      { connectorId: config.connectorId, foundInRegistry: !!connector, registrySize: connectorRegistry.size },
      "[ContactResolver] Registry lookup"
    );

    if (!connector) {
      // Try loading dynamic connector from DB definition
      try {
        logger.info({ connectorId: config.connectorId }, "[ContactResolver] Dynamically loading connector");
        const { dynamicLoader } = await import("../connectors/factory/dynamic-loader");
        await dynamicLoader.reload(config.connectorId);
        connector = connectorRegistry.tryGet(config.connectorId);
        logger.info({ connectorId: config.connectorId, loaded: !!connector }, "[ContactResolver] Dynamic load result");
      } catch (err) {
        logger.error({ err, connectorId: config.connectorId }, "[ContactResolver] Dynamic load FAILED");
      }
      if (!connector) {
        logger.warn({ connectorId: config.connectorId }, "[ContactResolver] Connector not found even after dynamic load, skipping");
        continue;
      }
    }

    try {
      const credentials = decryptJson<Record<string, string>>(config.credentials);
      logger.info(
        { connectorId: config.connectorId, hasAccessToken: !!credentials.accessToken, hasRefreshToken: !!credentials.refreshToken },
        "[ContactResolver] Credentials decrypted"
      );

      await connector.initialize({
        tenantId,
        connectorId: config.connectorId,
        credentials,
        settings: config.settings as Record<string, unknown>,
        enabled: config.enabled,
      });

      logger.info({ connectorId: config.connectorId, phone }, "[ContactResolver] Searching contacts by phone");
      const results = await connector.searchContacts({ tenantId, phone, limit: 1 });
      logger.info(
        { connectorId: config.connectorId, phone, resultCount: results.length },
        "[ContactResolver] Search results received"
      );

      if (results.length > 0) {
        const mapped = connector.mapContact(results[0]);
        logger.info(
          { tenantId, connectorId: config.connectorId, phone, contact: mapped.displayName },
          "[ContactResolver] Contact resolved from CRM connector"
        );

        // Cache in local DB for faster future lookups
        const saved = await prisma.contact.create({
          data: {
            tenantId,
            displayName: mapped.displayName,
            email: mapped.email ?? null,
            phone: mapped.phone ?? phone,
            company: mapped.company ?? null,
            title: mapped.title ?? null,
            metadata: (mapped.metadata ?? {}) as any,
          },
        });

        // Save external link
        if (mapped.externalId) {
          await prisma.externalLink.create({
            data: {
              contactId: saved.id,
              source: config.connectorId,
              externalId: mapped.externalId,
            },
          }).catch(() => {}); // ignore if duplicate
        }

        return saved;
      }
    } catch (err) {
      logger.error({ err, connectorId: config.connectorId, phone }, "[ContactResolver] Connector search FAILED");
    }
  }

  return null;
}

/** Build a CRM deep link from contact external links */
export function buildCrmUrl(
  contact: { id: string; metadata?: unknown }
): string | undefined {
  const meta = contact.metadata as Record<string, unknown> | null;
  return (meta?.crmUrl as string) ?? undefined;
}

export { normalizePhone };
