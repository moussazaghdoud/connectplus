/**
 * Connector Blueprint Schema — Zod validation for blueprint JSON files.
 *
 * Validates: slug format, category, capabilities, auth, settings, endpoints.
 * Used by the generator script and can be used at runtime for validation.
 */

import { z } from "zod";

export const ConnectorCategory = z.enum([
  "crm",
  "support",
  "messaging",
  "telephony",
  "productivity",
  "analytics",
]);
export type ConnectorCategory = z.infer<typeof ConnectorCategory>;

export const AuthType = z.enum(["oauth2", "api_key", "basic", "none"]);

export const Capability = z.enum([
  // CRM capabilities
  "contact_search",
  "contact_sync",
  "deal_sync",
  "activity_logging",
  // Telephony / CTI capabilities
  "click_to_call",
  "incoming_popup",
  "call_logging",
  "recording_link",
  "call_transfer",
  "dtmf",
  // Support capabilities
  "ticket_creation",
  "ticket_sync",
  "customer_lookup",
  // Messaging capabilities
  "send_message",
  "receive_message",
  "channel_sync",
  // General capabilities
  "webhook_inbound",
  "webhook_outbound",
  "write_back",
  "health_check",
]);

export const SettingType = z.enum([
  "string",
  "secret",
  "url",
  "number",
  "boolean",
  "select",
]);

const SettingSchema = z.object({
  key: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Setting key must be a valid identifier"),
  type: SettingType,
  label: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean().default(true),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  options: z.array(z.string()).optional(),
  placeholder: z.string().optional(),
});

const AuthSchema = z.object({
  type: AuthType,
  scopes: z.array(z.string()).optional(),
  dcAware: z.boolean().optional().default(false),
  tokenUrl: z.string().url().optional(),
  authUrl: z.string().url().optional(),
  extraParams: z.record(z.string(), z.string()).optional(),
});

const EndpointsSchema = z.object({
  activate: z.boolean().optional().default(true),
  deactivate: z.boolean().optional().default(true),
  diagnostics: z.boolean().optional().default(true),
  auditLogs: z.boolean().optional().default(true),
  webhooks: z.boolean().optional().default(false),
  test: z.boolean().optional().default(true),
});

export const BlueprintSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(
      /^[a-z][a-z0-9]+(-[a-z0-9]+)*$/,
      "Slug must be lowercase alphanumeric with hyphens (e.g. 'zoho-cti')"
    ),
  category: ConnectorCategory,
  displayName: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  vendor: z.string().optional(),
  vendorUrl: z.string().url().optional(),
  docsUrl: z.string().url().optional(),
  auth: AuthSchema,
  capabilities: z.array(Capability).min(1),
  settings: z.array(SettingSchema).default([]),
  endpoints: EndpointsSchema.default({
    activate: true,
    deactivate: true,
    diagnostics: true,
    auditLogs: true,
    webhooks: false,
    test: true,
  }),
  prerequisites: z.array(z.string()).optional().default([]),
  notes: z.string().optional(),
});

export type Blueprint = z.infer<typeof BlueprintSchema>;
export type BlueprintSetting = z.infer<typeof SettingSchema>;

/**
 * Validate a blueprint JSON object. Throws on invalid input with clear messages.
 */
export function validateBlueprint(data: unknown): Blueprint {
  const result = BlueprintSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid blueprint:\n${issues}`);
  }
  return result.data;
}
