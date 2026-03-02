/**
 * Shared contact resolution utilities.
 * Used by both the server-side InboundCallHandler (S2S mode) and
 * the WebRTC call event endpoint.
 */

import { prisma } from "../db";
import { normalizePhone, phoneMatch } from "../utils/phone";

/** Resolve a caller by phone number from the local contacts DB */
export async function resolveCallerByPhone(
  tenantId: string,
  normalizedPhone: string
) {
  if (!normalizedPhone) return null;

  // Try exact match first
  const exactMatch = await prisma.contact.findFirst({
    where: { tenantId, phone: normalizedPhone },
  });
  if (exactMatch) return exactMatch;

  // Fuzzy match: load contacts with phone numbers and compare trailing digits
  const candidates = await prisma.contact.findMany({
    where: { tenantId, phone: { not: null } },
    take: 500,
  });

  for (const c of candidates) {
    if (c.phone && phoneMatch(normalizedPhone, c.phone)) {
      return c;
    }
  }

  return null;
}

/** Build a CRM deep link from contact external links */
export function buildCrmUrl(
  contact: { id: string; metadata?: unknown }
): string | undefined {
  const meta = contact.metadata as Record<string, unknown> | null;
  return (meta?.crmUrl as string) ?? undefined;
}

export { normalizePhone };
