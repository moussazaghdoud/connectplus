import type { CanonicalContact } from "@/lib/core/models/contact";
import type { HubSpotContact } from "./types";

/**
 * Map a HubSpot CRM contact to the canonical Contact model.
 */
export function mapHubSpotContact(hs: HubSpotContact): CanonicalContact {
  const { properties: p } = hs;

  const firstName = p.firstname ?? "";
  const lastName = p.lastname ?? "";
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") || p.email || `Contact ${hs.id}`;

  return {
    displayName,
    email: p.email ?? undefined,
    phone: p.phone ?? p.mobilephone ?? undefined,
    company: p.company ?? undefined,
    title: p.jobtitle ?? undefined,
    externalId: hs.id,
    source: "hubspot",
    metadata: {
      hubspotId: hs.id,
      createdAt: hs.createdAt,
      updatedAt: hs.updatedAt,
    },
  };
}

/**
 * Build a HubSpot deep-link URL for a contact.
 */
export function getHubSpotContactUrl(
  portalId: string,
  contactId: string
): string {
  return `https://app.hubspot.com/contacts/${portalId}/contact/${contactId}`;
}
