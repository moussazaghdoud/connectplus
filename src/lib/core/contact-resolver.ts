import { prisma } from "../db";
import { connectorRegistry } from "./connector-registry";
import { getTenantContext } from "./tenant-context";
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
      if (!connector) {
        // Try loading dynamic connector from DB definition
        try {
          const { dynamicLoader } = await import("../connectors/factory/dynamic-loader");
          await dynamicLoader.reload(query.connectorId);
          connector = connectorRegistry.tryGet(query.connectorId);
        } catch { /* skip */ }
      }
      if (connector) {
        try {
          const externals = await connector.searchContacts({
            ...query,
            tenantId,
          });
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
