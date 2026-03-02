import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";
import { verifyHubSpotWebhook, parseHubSpotWebhook } from "../webhooks";

const CLIENT_SECRET = "test-secret-key-12345";

describe("verifyHubSpotWebhook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("verifies valid v3 signature", () => {
    const body = '[{"eventId":1}]';
    const timestamp = String(Date.now());
    const method = "POST";
    const uri = "https://example.com/webhook";
    const sourceString = `${method}${uri}${body}${timestamp}`;
    const signature = createHmac("sha256", CLIENT_SECRET)
      .update(sourceString, "utf-8")
      .digest("base64");

    const result = verifyHubSpotWebhook(
      CLIENT_SECRET,
      {
        "x-hubspot-signature-v3": signature,
        "x-hubspot-request-timestamp": timestamp,
      },
      body,
      method,
      uri
    );
    expect(result).toBe(true);
  });

  it("rejects tampered body", () => {
    const body = '[{"eventId":1}]';
    const timestamp = String(Date.now());
    const method = "POST";
    const uri = "";
    const sourceString = `${method}${uri}${body}${timestamp}`;
    const signature = createHmac("sha256", CLIENT_SECRET)
      .update(sourceString, "utf-8")
      .digest("base64");

    const result = verifyHubSpotWebhook(
      CLIENT_SECRET,
      {
        "x-hubspot-signature-v3": signature,
        "x-hubspot-request-timestamp": timestamp,
      },
      '[{"eventId":2}]', // tampered
      method,
      uri
    );
    expect(result).toBe(false);
  });

  it("rejects timestamp older than 5 minutes", () => {
    const body = "test";
    const oldTimestamp = String(Date.now() - 6 * 60 * 1000); // 6 min ago
    const sourceString = `POST${body}${oldTimestamp}`;
    const signature = createHmac("sha256", CLIENT_SECRET)
      .update(sourceString, "utf-8")
      .digest("base64");

    const result = verifyHubSpotWebhook(
      CLIENT_SECRET,
      {
        "x-hubspot-signature-v3": signature,
        "x-hubspot-request-timestamp": oldTimestamp,
      },
      body
    );
    expect(result).toBe(false);
  });

  it("falls back to v2 when v3 headers missing", () => {
    const body = '[{"eventId":1}]';
    // v2 signature: HMAC-SHA256(clientSecret, clientSecret + body) → hex
    const hash = createHmac("sha256", CLIENT_SECRET)
      .update(CLIENT_SECRET + body)
      .digest("hex");

    const result = verifyHubSpotWebhook(
      CLIENT_SECRET,
      { "x-hubspot-signature": hash },
      body
    );
    expect(result).toBe(true);
  });

  it("returns false when no signatures present", () => {
    const result = verifyHubSpotWebhook(CLIENT_SECRET, {}, "body");
    expect(result).toBe(false);
  });
});

describe("parseHubSpotWebhook", () => {
  it("maps contact.creation → contact_created", () => {
    const events = [
      {
        eventId: 1,
        subscriptionId: 100,
        portalId: 999,
        appId: 1,
        occurredAt: Date.now(),
        subscriptionType: "contact.creation",
        attemptNumber: 0,
        objectId: 501,
      },
    ];
    const result = parseHubSpotWebhook(events);
    expect(result.type).toBe("contact_created");
    expect(result.externalId).toBe("501");
    expect(result.connectorId).toBe("hubspot");
    expect(result.idempotencyKey).toBe("hubspot_1_0");
  });

  it("maps contact.propertyChange → contact_updated", () => {
    const result = parseHubSpotWebhook([
      {
        eventId: 2,
        subscriptionType: "contact.propertyChange",
        attemptNumber: 1,
        objectId: 502,
        subscriptionId: 0,
        portalId: 0,
        appId: 0,
        occurredAt: 0,
      },
    ]);
    expect(result.type).toBe("contact_updated");
    expect(result.idempotencyKey).toBe("hubspot_2_1");
  });

  it("maps contact.deletion → contact_deleted", () => {
    const result = parseHubSpotWebhook([
      {
        eventId: 3,
        subscriptionType: "contact.deletion",
        attemptNumber: 0,
        objectId: 503,
        subscriptionId: 0,
        portalId: 0,
        appId: 0,
        occurredAt: 0,
      },
    ]);
    expect(result.type).toBe("contact_deleted");
  });

  it("maps unknown type → custom", () => {
    const result = parseHubSpotWebhook([
      {
        eventId: 4,
        subscriptionType: "deal.creation",
        attemptNumber: 0,
        objectId: 504,
        subscriptionId: 0,
        portalId: 0,
        appId: 0,
        occurredAt: 0,
      },
    ]);
    expect(result.type).toBe("custom");
  });

  it("handles single event (not array)", () => {
    const result = parseHubSpotWebhook({
      eventId: 5,
      subscriptionType: "contact.creation",
      attemptNumber: 0,
      objectId: 505,
      subscriptionId: 0,
      portalId: 0,
      appId: 0,
      occurredAt: 0,
    });
    expect(result.externalId).toBe("505");
  });

  it("throws on empty payload", () => {
    expect(() => parseHubSpotWebhook([])).toThrow("Empty HubSpot webhook payload");
  });

  it("preserves all events in payload", () => {
    const events = [
      {
        eventId: 6,
        subscriptionType: "contact.creation",
        attemptNumber: 0,
        objectId: 506,
        subscriptionId: 0,
        portalId: 0,
        appId: 0,
        occurredAt: 0,
      },
      {
        eventId: 7,
        subscriptionType: "contact.creation",
        attemptNumber: 0,
        objectId: 507,
        subscriptionId: 0,
        portalId: 0,
        appId: 0,
        occurredAt: 0,
      },
    ];
    const result = parseHubSpotWebhook(events);
    expect(result.payload).toHaveLength(2);
  });
});
