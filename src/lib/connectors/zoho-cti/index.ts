/**
 * Zoho CTI Connector — enterprise-grade telephony integration for Zoho CRM.
 *
 * Features:
 * - Embedded softphone widget inside Zoho CRM
 * - Real-time call events (ringing/answered/hold/mute/transfer/hangup)
 * - Click-to-call from any phone field in CRM
 * - Automatic call logging with idempotency
 * - Multi-DC support (US/EU/IN/AU/JP/CA)
 * - Event correlation & anti-duplication
 */

export { logCallToZoho } from "./call-logger";
export type { ZohoCallLogConfig } from "./call-logger";
export { lookupCallerInZoho } from "./crm-lookup";
export type { ZohoLookupConfig } from "./crm-lookup";
export {
  ZOHO_DC_LABELS,
  ZOHO_API_BASE,
  ZOHO_ACCOUNTS_BASE,
  detectDcFromAccountsUrl,
  getCrmApiBase,
  getAccountsBase,
} from "./zoho-dc";
export type { ZohoDc } from "./zoho-dc";
