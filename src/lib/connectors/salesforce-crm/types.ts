/**
 * Types for Salesforce CRM connector.
 * Generated from blueprint: connectors/blueprints/salesforce-crm.json
 */

export interface SalesforceCrmConfig {
  instanceUrl: string;
  apiVersion?: string;
}

export interface SalesforceCrmCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;

}

export const CONNECTOR_SLUG = "salesforce-crm" as const;
export const CONNECTOR_CATEGORY = "crm" as const;
export const CONNECTOR_CAPABILITIES = [
  "contact_search",
  "contact_sync",
  "activity_logging",
  "deal_sync",
  "write_back",
  "webhook_inbound",
  "health_check"
] as const;
