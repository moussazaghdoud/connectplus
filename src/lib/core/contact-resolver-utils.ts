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
  if (!normalizedPhone) return null;

  // 1. Try local DB (exact match)
  const exactMatch = await prisma.contact.findFirst({
    where: { tenantId, phone: normalizedPhone },
  });
  if (exactMatch) return exactMatch;

  // 2. Try local DB (fuzzy match)
  const candidates = await prisma.contact.findMany({
    where: { tenantId, phone: { not: null } },
    take: 500,
  });

  for (const c of candidates) {
    if (c.phone && phoneMatch(normalizedPhone, c.phone)) {
      return c;
    }
  }

  // 3. Try active CRM connectors (live lookup)
  try {
    const result = await resolveFromConnectors(tenantId, normalizedPhone);
    if (result) return result;
  } catch (err) {
    logger.warn({ err, tenantId }, "CRM connector lookup failed, continuing without contact");
  }

  return null;
}

/** Search all configured CRM connectors for a contact by phone */
async function resolveFromConnectors(tenantId: string, phone: string) {
  // Get all configured connectors for this tenant
  const configs = await prisma.connectorConfig.findMany({
    where: { tenantId, enabled: true },
  });

  for (const config of configs) {
    const connector = connectorRegistry.tryGet(config.connectorId);
    if (!connector) {
      // Try loading dynamic connector
      try {
        const { dynamicLoader } = await import("../connectors/factory/dynamic-loader");
        await dynamicLoader.reload(config.connectorId);
      } catch { /* skip */ }
      continue;
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
          "Contact resolved from CRM connector"
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
      logger.debug({ err, connectorId: config.connectorId }, "Connector search failed, trying next");
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
