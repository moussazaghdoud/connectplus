/**
 * Configuration schema for Salesforce CRM connector.
 * Generated from blueprint: connectors/blueprints/salesforce-crm.json
 */

import { z } from "zod";

export const SalesforceCrmConfigSchema = z.object({
  instanceUrl: z.string().url(),
  apiVersion: z.string().optional().default("v59.0"),
});

export type SalesforceCrmValidatedConfig = z.infer<typeof SalesforceCrmConfigSchema>;

/**
 * Validate connector configuration.
 */
export function validateConfig(config: unknown): SalesforceCrmValidatedConfig {
  return SalesforceCrmConfigSchema.parse(config);
}
