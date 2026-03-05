/**
 * Shared contact resolution utilities.
 * Used by both the server-side InboundCallHandler (S2S mode) and
 * the WebRTC call event endpoint.
 *
 * Resolution order (CRM-first for freshness):
 * 1. Active CRM connectors (Zoho, Salesforce, etc.) — live lookup by phone
 * 2. Local DB fallback (cached contacts, used when CRM is unavailable)
 */

import { prisma } from "../db";
import { normalizePhone, phoneMatch } from "../utils/phone";
import { connectorRegistry } from "./connector-registry";
import { decryptJson } from "../utils/crypto";
import { logger } from "../observability/logger";

/** Resolve a caller by phone number — CRM first, local DB as fallback */
export async function resolveCallerByPhone(
  tenantId: string,
  normalizedPhone: string
) {
  logger.info({ tenantId, normalizedPhone }, "[ContactResolver] resolveCallerByPhone called");

  if (!normalizedPhone) {
    logger.warn({ tenantId }, "[ContactResolver] Empty phone number, returning null");
    return null;
  }

  // 1. Try active CRM connectors first (live, always fresh)
  try {
    const result = await resolveFromConnectors(tenantId, normalizedPhone);
    if (result) {
      logger.info({ tenantId, normalizedPhone, contactName: result.displayName }, "[ContactResolver] Resolved from CRM (live)");
      return result;
    }
    logger.info({ tenantId, normalizedPhone }, "[ContactResolver] No results from CRM connectors");
  } catch (err) {
    logger.warn({ err, tenantId }, "[ContactResolver] CRM lookup failed, falling back to local DB");
  }

  // 2. Fallback: try local DB (exact match)
  const exactMatch = await prisma.contact.findFirst({
    where: { tenantId, phone: normalizedPhone },
  });
  if (exactMatch) {
    logger.info({ tenantId, normalizedPhone, contactName: exactMatch.displayName }, "[ContactResolver] Fallback: exact match in local DB");
    return exactMatch;
  }

  // 3. Fallback: try local DB (fuzzy match by trailing digits)
  const candidates = await prisma.contact.findMany({
    where: { tenantId, phone: { not: null } },
    take: 500,
  });

  for (const c of candidates) {
    if (c.phone && phoneMatch(normalizedPhone, c.phone)) {
      logger.info({ tenantId, normalizedPhone, contactName: c.displayName }, "[ContactResolver] Fallback: fuzzy match in local DB");
      return c;
    }
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
    return null;
  }

  for (const config of configs) {
    let connector = connectorRegistry.tryGet(config.connectorId);

    if (!connector) {
      // Try loading dynamic connector from DB definition
      try {
        const { dynamicLoader } = await import("../connectors/factory/dynamic-loader");
        await dynamicLoader.reload(config.connectorId);
        connector = connectorRegistry.tryGet(config.connectorId);
      } catch (err) {
        logger.error({ err, connectorId: config.connectorId }, "[ContactResolver] Dynamic load FAILED");
      }
      if (!connector) continue;
    }

    try {
      const credentials = decryptJson<Record<string, string>>(config.credentials);

      await connector.initialize({
        tenantId,
        connectorId: config.connectorId,
        credentials,
        settings: config.settings as Record<string, unknown>,
        enabled: config.enabled,
      });

      const results = await connector.searchContacts({ tenantId, phone, limit: 1 });

      if (results.length > 0) {
        const mapped = connector.mapContact(results[0]);
        logger.info(
          { tenantId, connectorId: config.connectorId, phone, contact: mapped.displayName },
          "[ContactResolver] Contact resolved from CRM"
        );

        // Upsert local cache: update if exists, create if new
        const existing = await prisma.contact.findFirst({
          where: { tenantId, phone },
        });

        let saved;
        if (existing) {
          // Update cached contact with fresh CRM data
          saved = await prisma.contact.update({
            where: { id: existing.id },
            data: {
              displayName: mapped.displayName,
              email: mapped.email ?? existing.email,
              phone: mapped.phone ?? phone,
              company: mapped.company ?? existing.company,
              title: mapped.title ?? existing.title,
              avatarUrl: mapped.avatarUrl ?? existing.avatarUrl,
              metadata: (mapped.metadata ?? {}) as any,
            },
          });
          logger.info({ contactId: saved.id }, "[ContactResolver] Local cache updated");
        } else {
          saved = await prisma.contact.create({
            data: {
              tenantId,
              displayName: mapped.displayName,
              email: mapped.email ?? null,
              phone: mapped.phone ?? phone,
              company: mapped.company ?? null,
              title: mapped.title ?? null,
              avatarUrl: mapped.avatarUrl ?? null,
              metadata: (mapped.metadata ?? {}) as any,
            },
          });
        }

        // Upsert external link
        if (mapped.externalId) {
          await prisma.externalLink.upsert({
            where: {
              contactId_source: {
                contactId: saved.id,
                source: config.connectorId,
              },
            },
            update: { externalId: mapped.externalId },
            create: {
              contactId: saved.id,
              source: config.connectorId,
              externalId: mapped.externalId,
            },
          }).catch(() => {}); // ignore constraint errors
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
