/**
 * CrmService — the SINGLE internal entry point for all CRM operations.
 *
 * All call flows (inbound-call-handler, /api/v1/calls/event, CTI bridge)
 * MUST use this service. No connector is ever called directly.
 *
 * Resolution order:
 * 1. Active CRM connectors from ConnectorRegistry (Tier 1 + Tier 2)
 * 2. Local DB fallback (cached contacts)
 */

import { connectorRegistry } from "../core/connector-registry";
import { prisma } from "../db";
import { decryptJson } from "../utils/crypto";
import { normalizePhone } from "../utils/phone";
import { logger } from "../observability/logger";
import { metrics } from "../observability/metrics";
import type { CanonicalContact } from "../core/models/contact";

const log = logger.child({ module: "crm-service" });

// ── Types ────────────────────────────────────────────────

export interface ContactMatch {
  /** Local DB contact ID (after upsert) */
  id: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  avatarUrl?: string | null;
  /** CRM deep link */
  crmUrl?: string;
  /** Which connector resolved this */
  connectorSlug?: string;
  /** CRM module (e.g. "Contacts", "Leads") */
  crmModule?: string;
  /** CRM record ID */
  crmRecordId?: string;
}

export interface WriteCallLogInput {
  tenantId: string;
  correlationId: string;
  callId: string;
  direction: "inbound" | "outbound";
  fromNumber: string;
  toNumber: string;
  startedAt: string;
  endedAt?: string;
  durationSecs?: number;
  disposition?: string;
  notes?: string;
  recordingUrl?: string;
  agentId?: string;
  contactMatch?: ContactMatch;
}

// ── In-memory dedup for call logging ─────────────────────

const loggedCalls = new Map<string, number>();

function isCallLogged(correlationId: string): boolean {
  return loggedCalls.has(correlationId);
}

function markCallLogged(correlationId: string): void {
  loggedCalls.set(correlationId, Date.now());
  // Cap at 1000 entries
  if (loggedCalls.size > 1000) {
    const entries = [...loggedCalls.entries()].sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < entries.length - 500; i++) {
      loggedCalls.delete(entries[i][0]);
    }
  }
}

// ── Service ──────────────────────────────────────────────

class CrmService {
  /**
   * Resolve a caller by phone number.
   * Tries all ACTIVE connectors in the registry, then falls back to local DB.
   */
  async resolveCallerByPhone(
    tenantId: string,
    phone: string
  ): Promise<ContactMatch | null> {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      log.warn({ tenantId }, "Empty phone number, returning null");
      return null;
    }

    log.info({ tenantId, phone: normalized }, "Resolving caller by phone");

    // 1. Try active connectors (live CRM lookup)
    try {
      const match = await this.resolveFromConnectors(tenantId, normalized);
      if (match) return match;
    } catch (err) {
      log.warn({ err, tenantId }, "All connector lookups failed, falling back to local DB");
    }

    // 2. Fallback: local DB (exact match)
    const exactMatch = await prisma.contact.findFirst({
      where: { tenantId, phone: normalized },
    });
    if (exactMatch) {
      log.info({ tenantId, phone: normalized, name: exactMatch.displayName }, "Fallback: exact match in local DB");
      return this.contactToMatch(exactMatch);
    }

    // 3. Fallback: local DB (fuzzy match by trailing 9 digits)
    const digits = normalized.replace(/^\+/, "");
    const tail = digits.slice(-9);
    if (tail.length >= 9) {
      const fuzzyMatch = await prisma.contact.findFirst({
        where: { tenantId, phone: { endsWith: tail } },
      });
      if (fuzzyMatch) {
        log.info({ tenantId, phone: normalized, name: fuzzyMatch.displayName }, "Fallback: fuzzy match in local DB");
        return this.contactToMatch(fuzzyMatch);
      }
    }

    return null;
  }

  /**
   * Write a call log to all ACTIVE connectors that support write-back.
   * Idempotent by correlationId.
   */
  async writeCallLog(input: WriteCallLogInput): Promise<void> {
    if (isCallLogged(input.correlationId)) {
      log.info({ correlationId: input.correlationId }, "Call already logged — skipping duplicate");
      metrics.increment("crm_writeback_deduplicated");
      return;
    }

    const configs = await prisma.connectorConfig.findMany({
      where: { tenantId: input.tenantId, enabled: true },
    });

    if (configs.length === 0) return;

    for (const config of configs) {
      const connector = await this.getConnector(config.connectorId);
      if (!connector) continue;
      if (!connector.manifest.capabilities.includes("interaction_writeback")) continue;
      if (!connector.writeBack) continue;

      const slug = config.connectorId;
      metrics.increment("crm_writeback_attempt", { connector: slug });

      try {
        const credentials = decryptJson<Record<string, string>>(config.credentials);

        await connector.initialize({
          tenantId: input.tenantId,
          connectorId: slug,
          credentials,
          settings: config.settings as Record<string, unknown>,
          enabled: config.enabled,
        });

        // Build a minimal Interaction-like object for writeBack
        const interaction = {
          id: input.callId,
          tenantId: input.tenantId,
          idempotencyKey: `call-log:${input.correlationId}`,
          type: "PHONE_CALL" as const,
          status: "COMPLETED" as const,
          direction: input.direction === "inbound" ? "INBOUND" as const : "OUTBOUND" as const,
          startedAt: input.startedAt ? new Date(input.startedAt) : null,
          endedAt: input.endedAt ? new Date(input.endedAt) : null,
          durationSecs: input.durationSecs ?? null,
          externalId: input.contactMatch?.crmRecordId ?? null,
          connectorId: slug,
          metadata: {
            disposition: input.disposition,
            notes: input.notes,
            recordingUrl: input.recordingUrl,
            correlationId: input.correlationId,
            fromNumber: input.fromNumber,
            toNumber: input.toNumber,
            contactName: input.contactMatch?.displayName,
            crmModule: input.contactMatch?.crmModule,
          },
          contactId: input.contactMatch?.id ?? null,
          rainbowCallId: input.callId,
          rainbowConfId: null,
          joinUrl: null,
          targetPhone: null,
          targetEmail: null,
          failureReason: null,
          writebackStatus: "PENDING" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await connector.writeBack(interaction, {
          tenantId: input.tenantId,
          connectorId: slug,
          credentials,
          settings: config.settings as Record<string, unknown>,
          enabled: config.enabled,
        });

        metrics.increment("crm_writeback_success", { connector: slug });
        log.info(
          { tenantId: input.tenantId, correlationId: input.correlationId, connector: slug },
          "Call logged to CRM"
        );
      } catch (err) {
        metrics.increment("crm_writeback_failure", { connector: slug });
        log.error(
          { err, tenantId: input.tenantId, correlationId: input.correlationId, connector: slug },
          "CRM call write-back failed"
        );
      }
    }

    markCallLogged(input.correlationId);
  }

  /**
   * Build a CRM deep link from a ContactMatch.
   */
  buildCrmLink(match: ContactMatch): string | undefined {
    return match.crmUrl;
  }

  // ── Private helpers ────────────────────────────────────

  private async resolveFromConnectors(
    tenantId: string,
    phone: string
  ): Promise<ContactMatch | null> {
    const configs = await prisma.connectorConfig.findMany({
      where: { tenantId, enabled: true },
    });

    if (configs.length === 0) return null;

    for (const config of configs) {
      const slug = config.connectorId;
      metrics.increment("crm_lookup_attempt", { connector: slug });

      const connector = await this.getConnector(slug);
      if (!connector) continue;
      if (!connector.manifest.capabilities.includes("contact_search")) continue;

      try {
        const credentials = decryptJson<Record<string, string>>(config.credentials);

        await connector.initialize({
          tenantId,
          connectorId: slug,
          credentials,
          settings: config.settings as Record<string, unknown>,
          enabled: config.enabled,
        });

        const results = await connector.searchContacts({ tenantId, phone, limit: 1 });

        if (results.length > 0) {
          const mapped = connector.mapContact(results[0]);
          metrics.increment("crm_lookup_success", { connector: slug });
          log.info(
            { tenantId, connector: slug, phone, name: mapped.displayName },
            "Contact resolved from CRM"
          );

          // Upsert local cache
          const saved = await this.upsertLocalContact(tenantId, slug, phone, mapped);

          return {
            id: saved.id,
            displayName: saved.displayName,
            email: saved.email,
            phone: saved.phone,
            company: saved.company,
            title: saved.title,
            avatarUrl: saved.avatarUrl,
            crmUrl: (mapped.metadata?.crmUrl as string) ?? undefined,
            connectorSlug: slug,
            crmModule: (mapped.metadata?.crmModule as string) ?? undefined,
            crmRecordId: mapped.externalId,
          };
        }

        metrics.increment("crm_lookup_miss", { connector: slug });
      } catch (err) {
        metrics.increment("crm_lookup_failure", { connector: slug });
        log.error(
          { err, tenantId, connector: slug, phone },
          "Connector search failed"
        );
      }
    }

    return null;
  }

  /**
   * Get a connector from registry, with dynamic loader fallback.
   */
  private async getConnector(slug: string) {
    let connector = connectorRegistry.tryGet(slug);

    if (!connector) {
      try {
        const { dynamicLoader } = await import("../connectors/factory/dynamic-loader");
        await dynamicLoader.reload(slug);
        connector = connectorRegistry.tryGet(slug);
      } catch (err) {
        log.error({ err, connectorId: slug }, "Dynamic connector load failed");
      }
    }

    return connector;
  }

  /**
   * Upsert a contact in local DB, matched by CRM externalId to avoid stale phone collisions.
   */
  private async upsertLocalContact(
    tenantId: string,
    connectorSlug: string,
    phone: string,
    mapped: CanonicalContact
  ) {
    let existing: { id: string; email: string | null; company: string | null; title: string | null; avatarUrl: string | null } | null = null;

    if (mapped.externalId) {
      const link = await prisma.externalLink.findFirst({
        where: { source: connectorSlug, externalId: mapped.externalId },
        include: { contact: true },
      });
      if (link?.contact?.tenantId === tenantId) {
        existing = link.contact;
      }
    }

    let saved;
    if (existing) {
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

    // Clear stale phone from other contacts
    await prisma.contact.updateMany({
      where: { tenantId, phone, id: { not: saved.id } },
      data: { phone: null },
    });

    // Upsert external link
    if (mapped.externalId) {
      await prisma.externalLink.upsert({
        where: { contactId_source: { contactId: saved.id, source: connectorSlug } },
        update: { externalId: mapped.externalId },
        create: { contactId: saved.id, source: connectorSlug, externalId: mapped.externalId },
      }).catch(() => {});
    }

    return saved;
  }

  private contactToMatch(contact: {
    id: string;
    displayName: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    title: string | null;
    avatarUrl: string | null;
    metadata?: unknown;
  }): ContactMatch {
    const meta = contact.metadata as Record<string, unknown> | null;
    return {
      id: contact.id,
      displayName: contact.displayName,
      email: contact.email,
      phone: contact.phone,
      company: contact.company,
      title: contact.title,
      avatarUrl: contact.avatarUrl,
      crmUrl: (meta?.crmUrl as string) ?? undefined,
      crmModule: (meta?.crmModule as string) ?? undefined,
    };
  }
}

// ── Singleton ────────────────────────────────────────────

const SINGLETON_KEY = Symbol.for("connectplus.crmService");

function getCrmService(): CrmService {
  const g = globalThis as Record<symbol, CrmService>;
  if (!g[SINGLETON_KEY]) {
    g[SINGLETON_KEY] = new CrmService();
  }
  return g[SINGLETON_KEY];
}

export const crmService = getCrmService();
