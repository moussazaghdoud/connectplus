/**
 * Zod validation schema for ConnectorDefinitionConfig.
 * Used to validate config at save time (wizard) and at load time (dynamic loader).
 */

import { z } from "zod";

const oauth2Schema = z.object({
  authorizeUrl: z.string().url(),
  tokenUrl: z.string().url(),
  scopes: z.array(z.string()).min(1),
  tokenPlacement: z.enum(["header", "query"]),
  tokenPrefix: z.string().default("Bearer"),
  extraAuthParams: z.record(z.string(), z.string()).optional(),
});

const apiKeySchema = z.object({
  headerName: z.string().min(1).max(100),
  prefix: z.string().max(50).optional(),
});

const basicAuthSchema = z.object({
  usernameField: z.string().min(1),
  passwordField: z.string().min(1),
});

const authSchema = z.object({
  type: z.enum(["oauth2", "api_key", "basic"]),
  oauth2: oauth2Schema.optional(),
  apiKey: apiKeySchema.optional(),
  basic: basicAuthSchema.optional(),
}).refine(
  (data) => {
    if (data.type === "oauth2") return !!data.oauth2;
    if (data.type === "api_key") return !!data.apiKey;
    if (data.type === "basic") return !!data.basic;
    return true;
  },
  { message: "Auth config must include the sub-config matching the auth type" }
);

const contactSearchRequestSchema = z.object({
  bodyTemplate: z.string().optional(),
  queryParams: z.record(z.string(), z.string()).optional(),
});

const contactSearchResponseSchema = z.object({
  resultsPath: z.string().min(1),
  totalPath: z.string().optional(),
  idField: z.string().min(1),
});

const contactSearchSchema = z.object({
  endpoint: z.string().min(1),
  method: z.enum(["GET", "POST"]),
  request: contactSearchRequestSchema,
  response: contactSearchResponseSchema,
});

const contactFieldMappingSchema = z.object({
  displayName: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
  phoneFields: z.record(z.string(), z.string()).optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  avatarUrl: z.string().optional(),
});

const writeBackAssociateSchema = z.object({
  endpoint: z.string().min(1),
  method: z.enum(["PUT", "POST"]),
  bodyTemplate: z.string().optional(),
});

const writeBackSchema = z.object({
  endpoint: z.string().min(1),
  method: z.enum(["POST", "PUT", "PATCH"]),
  bodyTemplate: z.string().min(2),
  associateContact: writeBackAssociateSchema.optional(),
});

const webhookSchema = z.object({
  signatureMethod: z.enum(["hmac_sha256", "hmac_sha1", "static_token", "none"]),
  signatureHeader: z.string().optional(),
  signaturePrefix: z.string().optional(),
  timestampHeader: z.string().optional(),
  maxTimestampAgeMs: z.number().int().positive().optional(),
  tokenHeader: z.string().optional(),
  eventTypeField: z.string().min(1),
  eventTypeMapping: z.record(z.string(), z.string()),
  externalIdField: z.string().min(1),
  idempotencyKeyField: z.string().optional(),
});

const healthCheckSchema = z.object({
  endpoint: z.string().min(1),
  method: z.enum(["GET", "HEAD"]).optional(),
  expectedStatus: z.number().int().min(100).max(599).optional(),
});

const searchStrategySchema = z.object({
  label: z.string().min(1),
  priority: z.number().int().min(0).optional(),
  endpoint: z.string().min(1),
  method: z.enum(["GET", "POST"]),
  request: contactSearchRequestSchema,
  response: contactSearchResponseSchema,
  fieldMapping: contactFieldMappingSchema.optional(),
  crmModule: z.string().optional(),
});

const crmLinkSchema = z.object({
  urlTemplate: z.string().min(1),
});

export const connectorDefinitionConfigSchema = z.object({
  apiBaseUrl: z.string().url(),
  auth: authSchema,
  contactSearch: contactSearchSchema,
  contactFieldMapping: contactFieldMappingSchema,
  searchStrategies: z.array(searchStrategySchema).optional(),
  crmLink: crmLinkSchema.optional(),
  writeBack: writeBackSchema.optional(),
  webhook: webhookSchema.optional(),
  healthCheck: healthCheckSchema.optional(),
});

/** Validate a partial config (for draft saves where not all fields are filled) */
export const connectorDefinitionConfigPartialSchema = connectorDefinitionConfigSchema.partial();

/** Validate the slug format */
export const connectorSlugSchema = z
  .string()
  .min(2)
  .max(50)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Slug must be lowercase alphanumeric with hyphens, 2-50 chars");
