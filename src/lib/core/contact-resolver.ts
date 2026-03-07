import { prisma } from "../db";
import { connectorRegistry } from "./connector-registry";
import { getTenantContext } from "./tenant-context";
import { decryptJson } from "../utils/crypto";
import { crmService } from "../crm/service";
import type { CanonicalContact, ContactSearchQuery } from "./models/contact";
import { logger } from "../observability/logger";

/**
 * Contact Resolver — finds and caches contacts from external systems.
 * Delegates CRM connector searches to CrmService to avoid logic duplication.
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

    // 2. If phone search, delegate to CrmService (single code path for phone resolution)
    if (query.phone && !query.connectorId) {
      try {
        const match = await crmService.resolveCallerByPhone(tenantId, query.phone);
        if (match) {
          const canonical: CanonicalContact = {
            displayName: match.displayName,
            email: match.email ?? undefined,
            phone: match.phone ?? undefined,
            company: match.company ?? undefined,
            title: match.title ?? undefined,
            avatarUrl: match.avatarUrl ?? undefined,
            externalId: match.crmRecordId ?? match.id,
            source: match.connectorSlug ?? "crm",
            metadata: { crmUrl: match.crmUrl, crmModule: match.crmModule },
          };
          if (!results.find((r) => r.externalId === canonical.externalId && r.source === canonical.source)) {
            results.push(canonical);
          }
        }
      } catch (err) {
        logger.warn({ err, tenantId }, "CrmService phone resolution failed in ContactResolver");
      }
      return results.slice(0, query.limit ?? 20);
    }

    // 3. If specific connector requested, search it directly
    if (query.connectorId) {
      await this.searchConnector(query, tenantId, results);
    }

    // 4. For text/email queries without a specific connector, search ALL active connectors
    //    This is needed to get full phone data (phones array) from CRM APIs.
    if (!query.connectorId && !query.phone && (query.query || query.email)) {
      await this.searchAllConnectors(query, tenantId, results);
    }

    return results.slice(0, query.limit ?? 20);
  }

  /** Search ALL active connectors for text/email queries */
  private async searchAllConnectors(
    query: ContactSearchQuery,
    tenantId: string,
    results: CanonicalContact[]
  ): Promise<void> {
    const configs = await prisma.connectorConfig.findMany({
      where: { tenantId, enabled: true },
    });

    for (const config of configs) {
      try {
        await this.searchConnector(
          { ...query, connectorId: config.connectorId },
          tenantId,
          results
        );
      } catch (err) {
        logger.warn(
          { connectorId: config.connectorId, err },
          "Connector text search failed, continuing with next"
        );
      }
    }
  }

  /** Search a specific connector by ID */
  private async searchConnector(
    query: ContactSearchQuery,
    tenantId: string,
    results: CanonicalContact[]
  ): Promise<void> {
    let connector = connectorRegistry.tryGet(query.connectorId!);
    if (!connector) {
      try {
        const { dynamicLoader } = await import("../connectors/factory/dynamic-loader");
        await dynamicLoader.reload(query.connectorId!);
        connector = connectorRegistry.tryGet(query.connectorId!);
      } catch (loadErr) {
        logger.warn({ connectorId: query.connectorId, err: loadErr }, "Contact search: dynamic load failed");
      }
    }

    if (!connector) {
      logger.warn({ connectorId: query.connectorId }, "Contact search: connector not found");
      return;
    }

    try {
      const config = await prisma.connectorConfig.findUnique({
        where: {
          tenantId_connectorId: { tenantId, connectorId: query.connectorId! },
        },
      });

      if (config) {
        const credentials = decryptJson<Record<string, string>>(config.credentials);
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
          "Contact search: no connector config found"
        );
      }

      const externals = await connector.searchContacts({ ...query, tenantId });
      for (const ext of externals) {
        const mapped = connector.mapContact(ext);
        // Check for exact duplicate (same source + externalId)
        const exactIdx = results.findIndex((r) => r.externalId === mapped.externalId && r.source === mapped.source);
        if (exactIdx !== -1) continue;
        // Replace local-source entry for the same contact (richer data with phones)
        const localIdx = results.findIndex(
          (r) => r.source === "local" && r.displayName === mapped.displayName
        );
        if (localIdx !== -1) {
          results[localIdx] = mapped;
        } else {
          results.push(mapped);
        }
      }
    } catch (err) {
      logger.warn(
        { connectorId: query.connectorId, err },
        "Connector search failed, returning local results only"
      );
    }
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
