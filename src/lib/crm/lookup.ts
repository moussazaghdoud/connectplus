/**
 * CRM Lookup Service — unified contact search across all CRM connectors.
 *
 * Normalizes the phone number, queries the active CRM connector,
 * and returns the best match from Contacts → Leads → Accounts.
 *
 * Designed to work with any CRM connector (Zoho first, then Salesforce, HubSpot, etc.).
 */

import { normalizeToE164 } from "../cti/utils/phone-normalizer";
import { metrics } from "../observability/metrics";
import { logger } from "../observability/logger";

const log = logger.child({ module: "crm-lookup" });

export interface CrmContact {
  /** CRM system identifier (e.g., "zoho", "hubspot", "salesforce") */
  crm: string;
  /** CRM module where the match was found */
  module: string;
  /** CRM record ID */
  recordId: string;
  /** Contact display name */
  name: string;
  /** Company name */
  company?: string;
  /** Phone number (normalized) */
  phone: string;
  /** Email address */
  email?: string;
  /** Job title */
  title?: string;
  /** Direct URL to the CRM record */
  crmUrl?: string;
}

/**
 * CRM lookup provider function — each connector implements this.
 */
export type CrmLookupProvider = (
  phone: string,
  tenantId: string
) => Promise<CrmContact | undefined>;

/** Registry of CRM lookup providers keyed by connector slug */
const providers = new Map<string, CrmLookupProvider>();

/**
 * Register a CRM lookup provider.
 */
export function registerLookupProvider(
  slug: string,
  provider: CrmLookupProvider
): void {
  providers.set(slug, provider);
  log.info({ slug }, "CRM lookup provider registered");
}

/**
 * Find a contact by phone number across all registered CRM providers.
 *
 * Process:
 * 1. Normalize phone to E.164
 * 2. Query each registered CRM provider
 * 3. Return first match
 */
export async function findContactByPhone(
  phoneNumber: string,
  tenantId: string
): Promise<CrmContact | undefined> {
  const normalized = normalizeToE164(phoneNumber);
  if (!normalized) {
    log.warn({ phone: phoneNumber }, "Cannot normalize phone number");
    return undefined;
  }

  const startTime = Date.now();
  metrics.increment("crm_lookup_total");

  for (const [slug, provider] of providers) {
    try {
      const result = await provider(normalized, tenantId);
      if (result) {
        const latencyMs = Date.now() - startTime;
        metrics.increment("crm_lookup_hit", { crm: slug });
        log.info(
          {
            phone: normalized,
            crm: slug,
            module: result.module,
            recordId: result.recordId,
            latencyMs,
          },
          "CRM contact found"
        );
        return result;
      }
    } catch (err) {
      metrics.increment("crm_lookup_error", { crm: slug });
      log.warn({ err, phone: normalized, crm: slug }, "CRM lookup failed");
    }
  }

  metrics.increment("crm_lookup_miss");
  log.debug({ phone: normalized }, "No CRM contact found");
  return undefined;
}

/**
 * Check if any CRM lookup provider is registered.
 */
export function hasLookupProviders(): boolean {
  return providers.size > 0;
}
