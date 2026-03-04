import { z } from "zod";

export const TenantStatusEnum = z.enum(["ACTIVE", "SUSPENDED", "DELETED"]);
export type TenantStatus = z.infer<typeof TenantStatusEnum>;

export const CreateTenantSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  rainbowLogin: z.string().email().optional(),
  rainbowPassword: z.string().optional(),
  rainbowAppId: z.string().optional(),
  rainbowAppSecret: z.string().optional(),
  rainbowHost: z.enum(["sandbox", "official"]).default("sandbox"),
});

export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;

export const UpdateTenantSchema = CreateTenantSchema.partial().extend({
  status: TenantStatusEnum.optional(),
});

export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;

/** Tenant context attached to every request */
export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantStatus: TenantStatus;
  /** Set when authenticated via user session (not API key) */
  userId?: string;
  /** Set when authenticated via user session */
  userRole?: string;
}
