import { z } from "zod";

/** Canonical contact model — connector-agnostic */
export interface CanonicalContact {
  displayName: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  externalId: string;
  source: string;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
}

/** External contact as returned by a connector before mapping */
export interface ExternalContact {
  externalId: string;
  source: string;
  raw: unknown;
}

export const ContactSearchSchema = z.object({
  query: z.string().min(1).max(500).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  connectorId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ContactSearchQuery = z.infer<typeof ContactSearchSchema> & {
  tenantId: string;
};
