import { describe, it, expect } from "vitest";
import { mapHubSpotContact, getHubSpotContactUrl } from "../mapper";
import type { HubSpotContact } from "../types";

function makeContact(overrides: Partial<HubSpotContact["properties"]> = {}): HubSpotContact {
  return {
    id: "501",
    properties: {
      firstname: "Jane",
      lastname: "Doe",
      email: "jane@example.com",
      phone: "+15551234567",
      company: "Acme Corp",
      jobtitle: "VP Engineering",
      ...overrides,
    },
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-06-15T12:00:00Z",
    archived: false,
  };
}

describe("mapHubSpotContact", () => {
  it("maps all fields correctly", () => {
    const result = mapHubSpotContact(makeContact());
    expect(result).toEqual({
      displayName: "Jane Doe",
      email: "jane@example.com",
      phone: "+15551234567",
      company: "Acme Corp",
      title: "VP Engineering",
      externalId: "501",
      source: "hubspot",
      metadata: {
        hubspotId: "501",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-06-15T12:00:00Z",
      },
    });
  });

  it("builds displayName from first + last", () => {
    const result = mapHubSpotContact(makeContact({ firstname: "Alice", lastname: "Smith" }));
    expect(result.displayName).toBe("Alice Smith");
  });

  it("falls back to first name only", () => {
    const result = mapHubSpotContact(makeContact({ firstname: "Alice", lastname: undefined }));
    expect(result.displayName).toBe("Alice");
  });

  it("falls back to last name only", () => {
    const result = mapHubSpotContact(makeContact({ firstname: undefined, lastname: "Smith" }));
    expect(result.displayName).toBe("Smith");
  });

  it("falls back to email when no name", () => {
    const result = mapHubSpotContact(
      makeContact({ firstname: undefined, lastname: undefined, email: "no-name@test.com" })
    );
    expect(result.displayName).toBe("no-name@test.com");
  });

  it("falls back to 'Contact {id}' when no name or email", () => {
    const result = mapHubSpotContact(
      makeContact({ firstname: undefined, lastname: undefined, email: undefined })
    );
    expect(result.displayName).toBe("Contact 501");
  });

  it("prefers phone over mobilephone", () => {
    const result = mapHubSpotContact(
      makeContact({ phone: "+111", mobilephone: "+222" })
    );
    expect(result.phone).toBe("+111");
  });

  it("falls back to mobilephone when phone is absent", () => {
    const result = mapHubSpotContact(
      makeContact({ phone: undefined, mobilephone: "+222" })
    );
    expect(result.phone).toBe("+222");
  });

  it("sets source to 'hubspot'", () => {
    expect(mapHubSpotContact(makeContact()).source).toBe("hubspot");
  });
});

describe("getHubSpotContactUrl", () => {
  it("builds correct URL", () => {
    expect(getHubSpotContactUrl("12345", "501")).toBe(
      "https://app.hubspot.com/contacts/12345/contact/501"
    );
  });
});
