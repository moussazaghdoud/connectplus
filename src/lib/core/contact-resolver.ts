import { prisma } from "../db";
import { connectorRegistry } from "./connector-registry";
import { getTenantContext } from "./tenant-context";
import { decryptJson } from "../utils/crypto";
import type { CanonicalContact, ContactSearchQuery } from "./models/contact";
import { logger } from "../observability/logger";

/**
 * Contact Resolver — finds and caches contacts from external systems.
 * Searches local cache first, then falls back to connector APIs.
 */
export class ContactResolver {
  /** Search contacts: local DB first, then external connectors */
  async search(query: ContactSearchQuery): Promise<CanonicalContact[]> {
    const { tenantId } = getTenantContext();
    const results: CanonicalContact[] = [];

    // 1. Search local cache
    const localContacts = await this.searchLocal(query);
    results.push(...localContacts);

    // 2. If specific connector requested, search it
    if (query.connectorId) {
      let connector = connectorRegistry.tryGet(query.connectorId);
      logger.info(
        { connectorId: query.connectorId, inRegistry: !!connector, registryIds: connectorRegistry.listIds() },
        "Contact search: connector lookup"
      );
      if (!connector) {
        // Try loading dynamic connector from DB definition
        try {
          const { dynamicLoader } = await import("../connectors/factory/dynamic-loader");
          const loaded = await dynamicLoader.reload(query.connectorId);
          connector = connectorRegistry.tryGet(query.connectorId);
          logger.info(
            { connectorId: query.connectorId, loaded, inRegistry: !!connector },
            "Contact search: dynamic load attempt"
          );
        } catch (loadErr) {
          logger.warn({ connectorId: query.connectorId, err: loadErr }, "Contact search: dynamic load failed");
        }
      }
      if (connector) {
        try {
          // Initialize connector with tenant credentials
          const config = await prisma.connectorConfig.findUnique({
            where: {
              tenantId_connectorId: { tenantId, connectorId: query.connectorId! },
            },
          });
          logger.info(
            { connectorId: query.connectorId, hasConfig: !!config, configId: config?.id },
            "Contact search: connector config lookup"
          );
          if (config) {
            const credentials = decryptJson<Record<string, string>>(config.credentials);
            logger.info(
              {
                connectorId: query.connectorId,
                hasAccessToken: !!credentials.accessToken,
                hasRefreshToken: !!credentials.refreshToken,
                tokenExpiresAt: credentials.tokenExpiresAt,
              },
              "Contact search: credentials decrypted"
            );
            await connector.initialize({
              tenantId,
              connectorId: query.connectorId!,
              credentials,
              settings: config.settings as Record<string, unknown>,
              enabled: config.enabled,
            });
          } else {
            logger.warn(
              { connectorId: query.connectorId, tenantId },
              "Contact search: no connector config found — connector not configured for this tenant"
            );
          }

          const externals = await connector.searchContacts({
            ...query,
            tenantId,
          });
          logger.info(
            { connectorId: query.connectorId, resultCount: externals.length },
            "Contact search: external results"
          );
          for (const ext of externals) {
            const mapped = connector.mapContact(ext);
            // Deduplicate against local results
            if (!results.find((r) => r.externalId === mapped.externalId && r.source === mapped.source)) {
              results.push(mapped);
            }
          }
        } catch (err) {
          logger.warn(
            { connectorId: query.connectorId, err },
            "Connector search failed, returning local results only"
          );
        }
      } else {
        logger.warn(
          { connectorId: query.connectorId },
          "Contact search: connector not found in registry even after dynamic load"
        );
      }
    }

    return results.slice(0, query.limit ?? 20);
  }

  /** Search local DB contacts */
  private async searchLocal(query: ContactSearchQuery): Promise<CanonicalContact[]> {
    const { tenantId } = getTenantContext();

    const where: Record<string, unknown> = { tenantId };

    if (query.email) {
      where.email = query.email;
    } else if (query.phone) {
      where.phone = query.phone;
    } else if (query.query) {
      where.OR = [
        { displayName: { contains: query.query, mode: "insensitive" } },
        { email: { contains: query.query, mode: "insensitive" } },
        { company: { contains: query.query, mode: "insensitive" } },
      ];
    }

    const contacts = await prisma.contact.findMany({
      where,
      take: query.limit ?? 20,
      include: { externalLinks: true },
    });

    return contacts.map((c) => ({
      displayName: c.displayName,
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
      company: c.company ?? undefined,
      title: c.title ?? undefined,
      avatarUrl: c.avatarUrl ?? undefined,
      externalId: c.id,
      source: "local",
      metadata: (c.metadata as Record<string, unknown>) ?? {},
    }));
  }

  /** Upsert a contact from an external source into local cache */
  async upsertFromExternal(
    tenantId: string,
    contact: CanonicalContact
  ) {
    // Find existing by external link
    const existingLink = await prisma.externalLink.findFirst({
      where: {
        source: contact.source,
        externalId: contact.externalId,
        contact: { tenantId },
      },
      include: { contact: true },
    });

    if (existingLink) {
      // Update existing contact
      return prisma.contact.update({
        where: { id: existingLink.contactId },
        data: {
          displayName: contact.displayName,
          email: contact.email,
          phone: contact.phone,
          company: contact.company,
          title: contact.title,
          avatarUrl: contact.avatarUrl,
        },
      });
    }

    // Create new contact with external link
    return prisma.contact.create({
      data: {
        tenantId,
        displayName: contact.displayName,
        email: contact.email,
        phone: contact.phone,
        company: contact.company,
        title: contact.title,
        avatarUrl: contact.avatarUrl,
        metadata: (contact.metadata ?? {}) as Record<string, string>,
        externalLinks: {
          create: {
            source: contact.source,
            externalId: contact.externalId,
          },
        },
      },
    });
  }
}

export const contactResolver = new ContactResolver();
