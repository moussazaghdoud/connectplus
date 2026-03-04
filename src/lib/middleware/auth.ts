import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import { prisma } from "../db";
import { AuthenticationError } from "../core/errors";
import type { TenantContext } from "../core/models/tenant";
import { getSession } from "../auth/session";

const API_KEY_HEADER = "x-api-key";

/**
 * Authenticate a request via API key or session cookie.
 * Tries API key first, then falls back to session cookie.
 * Returns the tenant context if valid, throws AuthenticationError if not.
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<TenantContext> {
  const url = new URL(request.url);
  const apiKey =
    request.headers.get(API_KEY_HEADER) ?? url.searchParams.get("key");

  // Try API key first
  if (apiKey) {
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

  // Fall back to session cookie
  const session = await getSession();

  if (session) {
    return {
      tenantId: session.tenantId,
      tenantSlug: session.tenantSlug,
      tenantStatus: "ACTIVE",
      userId: session.userId,
      userRole: session.role,
    };
  }

  throw new AuthenticationError("Missing API key or session");
}

/** Hash an API key with SHA-256 for storage/comparison */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Generate a new raw API key (to give to the tenant) */
export function generateApiKey(): string {
  return `cp_${randomBytes(32).toString("hex")}`;
}
