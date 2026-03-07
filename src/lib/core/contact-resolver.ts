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
  /**
   * Search contacts: local DB first (fast), then live CRM connectors.
   * Live CRM results replace local entries for the same contact (fresher data).
   */
  async search(query: ContactSearchQuery): Promise<CanonicalContact[]> {
    const { tenantId } = getTenantContext();
    const results: CanonicalContact[] = [];

    // 1. Local DB (fast, displayed immediately in UI)
    const localContacts = await this.searchLocal(query);
    results.push(...localContacts);

    // 2. Live CRM connectors (authoritative, fresher data)
    try {
      if (query.phone && !query.connectorId) {
        const match = await crmService.resolveCallerByPhone(tenantId, query.phone);
        if (match) {
          this.mergeResult(results, {
            displayName: match.displayName,
            email: match.email ?? undefined,
            phone: match.phone ?? undefined,
            company: match.company ?? undefined,
            title: match.title ?? undefined,
            avatarUrl: match.avatarUrl ?? undefined,
            externalId: match.crmRecordId ?? match.id,
            source: match.connectorSlug ?? "crm",
            metadata: { crmUrl: match.crmUrl, crmModule: match.crmModule },
          });
        }
      } else if (query.connectorId) {
        await this.searchConnector(query, tenantId, results);
      } else {
        await this.searchAllConnectors(query, tenantId, results);
      }
    } catch (err) {
      logger.warn({ err, tenantId }, "Live CRM search failed, returning local results");
    }

    return results.slice(0, query.limit ?? 20);
  }

  /**
   * Merge a live CRM result into the results array.
   * If a local entry exists for the same contact (by displayName), replace it
   * with the live data (which has phones array, fresh fields, etc.).
   */
  private mergeResult(results: CanonicalContact[], live: CanonicalContact): void {
    // Exact duplicate by source+id → skip
    const exactIdx = results.findIndex(
      (r) => r.externalId === live.externalId && r.source === live.source
    );
    if (exactIdx !== -1) {
      results[exactIdx] = live; // replace with fresher data
      return;
    }
    // Same person in local cache → replace with live CRM data
    const localIdx = results.findIndex(
      (r) => r.source === "local" && r.displayName === live.displayName
    );
    if (localIdx !== -1) {
      results[localIdx] = live;
      return;
    }
    results.push(live);
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
        this.mergeResult(results, mapped);
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
