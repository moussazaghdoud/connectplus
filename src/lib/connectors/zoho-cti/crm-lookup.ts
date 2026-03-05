/**
 * Zoho CRM caller lookup — searches Contacts, Leads, then Accounts by phone.
 * Returns the best match with CRM context for the widget.
 * Resilient: retry with exponential backoff on transient failures.
 */

import type { CrmContext } from "../../cti/types/call-event";
import type { ZohoDc } from "./zoho-dc";
import { getCrmApiBase } from "./zoho-dc";
import { normalizePhone } from "../../utils/phone";
import { withRetry } from "../../queue/retry";
import { metrics } from "../../observability/metrics";
import { logger } from "../../observability/logger";

const log = logger.child({ module: "zoho-crm-lookup" });

export interface ZohoLookupConfig {
  accessToken: string;
  dc: ZohoDc;
}

/**
 * Search Zoho CRM for a phone number match.
 * Searches in order: Contacts -> Leads -> Accounts.
 * Returns first match with record details.
 */
export async function lookupCallerInZoho(
  phoneNumber: string,
  config: ZohoLookupConfig
): Promise<CrmContext | undefined> {
  const normalized = normalizePhone(phoneNumber);
  if (!normalized) return undefined;

  const apiBase = getCrmApiBase(config.dc);
  const modules = ["Contacts", "Leads", "Accounts"];
  const startTime = Date.now();

  for (const module of modules) {
    try {
      const result = await withRetry(
        () => searchModule(apiBase, config.accessToken, module, normalized),
        { maxAttempts: 2, baseDelayMs: 500, maxDelayMs: 3000 }
      );
      if (result) {
        const latencyMs = Date.now() - startTime;
        metrics.increment("cti_crm_lookup_hit", { module });
        log.info(
          { phone: normalized, module, recordId: result.recordId, latencyMs },
          "CRM match found"
        );
        return result;
      }
    } catch (err) {
      metrics.increment("cti_crm_lookup_error", { module });
      log.warn({ err, module, phone: normalized }, "CRM search failed for module");
    }
  }

  metrics.increment("cti_crm_lookup_miss");
  log.debug({ phone: normalized }, "No CRM match found");
  return undefined;
}

async function searchModule(
  apiBase: string,
  accessToken: string,
  module: string,
  phone: string
): Promise<CrmContext | undefined> {
  const url = `${apiBase}/${module}/search?word=${encodeURIComponent(phone)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
  });

  // Retryable errors
  if (res.status === 429 || res.status >= 500) {
    throw new Error(`Zoho API ${res.status}`);
  }

  if (res.status === 204) return undefined;
  if (!res.ok) return undefined;

  const data = await res.json();
  const records = data?.data;
  if (!Array.isArray(records) || records.length === 0) return undefined;

  const record = records[0];

  if (module === "Contacts" || module === "Leads") {
    return {
      recordId: record.id,
      module,
      displayName: [record.First_Name, record.Last_Name]
        .filter(Boolean)
        .join(" ") || record.Full_Name || "Unknown",
      company: record.Company || record.Account_Name?.name,
    };
  }

  // Accounts
  return {
    recordId: record.id,
    module,
    displayName: record.Account_Name || "Unknown Account",
    company: record.Account_Name,
  };
}
