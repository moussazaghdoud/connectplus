import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import { prisma } from "../db";
import { AuthenticationError } from "../core/errors";
import type { TenantContext } from "../core/models/tenant";

const API_KEY_HEADER = "x-api-key";

/**
 * Authenticate a request via API key.
 * Returns the tenant context if valid, throws AuthenticationError if not.
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<TenantContext> {
  const apiKey = request.headers.get(API_KEY_HEADER);

  if (!apiKey) {
    throw new AuthenticationError("Missing X-API-Key header");
  }

  // Hash the provided key and compare against stored hash
  const hashedKey = hashApiKey(apiKey);

  const tenant = await prisma.tenant.findUnique({
    where: { apiKey: hashedKey },
  });

  if (!tenant) {
    throw new AuthenticationError("Invalid API key");
  }

  if (tenant.status !== "ACTIVE") {
    throw new AuthenticationError(
      `Tenant is ${tenant.status.toLowerCase()}`
    );
  }

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantStatus: tenant.status,
  };
}

/** Hash an API key with SHA-256 for storage/comparison */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Generate a new raw API key (to give to the tenant) */
export function generateApiKey(): string {
  return `cp_${randomBytes(32).toString("hex")}`;
}
