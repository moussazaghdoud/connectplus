import { createHmac, timingSafeEqual } from "crypto";
import { logger } from "@/lib/observability/logger";
import type { ConnectorEvent, ConnectorEventType } from "@/lib/core/connector-interface";
import type { HubSpotWebhookEvent } from "./types";

const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Verify HubSpot webhook signature (v3).
 *
 * Algorithm:
 * 1. Reject if timestamp is older than 5 minutes
 * 2. Create UTF-8 string: requestMethod + requestUri + requestBody + timestamp
 * 3. HMAC-SHA256 using app client secret
 * 4. Base64 encode and compare with constant-time comparison
 */
export function verifyHubSpotWebhook(
  clientSecret: string,
  headers: Record<string, string>,
  rawBody: string,
  requestMethod: string = "POST",
  requestUri: string = ""
): boolean {
  const signature = headers["x-hubspot-signature-v3"];
  const timestamp = headers["x-hubspot-request-timestamp"];

  if (!signature || !timestamp) {
    // Fall back to v2 signature if v3 not present
    return verifyV2Signature(clientSecret, headers, rawBody);
  }

  // 1. Reject old timestamps
  const tsMs = parseInt(timestamp, 10);
  if (isNaN(tsMs) || Date.now() - tsMs > MAX_TIMESTAMP_AGE_MS) {
    logger.warn({ timestamp }, "HubSpot webhook: timestamp too old");
    return false;
  }

  // 2. Build source string: method + URI + body + timestamp
  const sourceString = `${requestMethod}${requestUri}${rawBody}${timestamp}`;

  // 3. HMAC-SHA256
  const hmac = createHmac("sha256", clientSecret)
    .update(sourceString, "utf-8")
    .digest("base64");

  // 4. Constant-time comparison
  try {
    const sigBuf = Buffer.from(signature, "base64");
    const hmacBuf = Buffer.from(hmac, "base64");

    if (sigBuf.length !== hmacBuf.length) return false;
    return timingSafeEqual(sigBuf, hmacBuf);
  } catch {
    return false;
  }
}

/**
 * Fallback: verify HubSpot v2 signature.
 * SHA-256 hash of clientSecret + requestBody
 */
function verifyV2Signature(
  clientSecret: string,
  headers: Record<string, string>,
  rawBody: string
): boolean {
  const signature = headers["x-hubspot-signature"];
  if (!signature) return false;

  const hash = createHmac("sha256", clientSecret)
    .update(clientSecret + rawBody)
    .digest("hex");

  return hash === signature;
}

/**
 * Parse HubSpot webhook events into canonical ConnectorEvents.
 * HubSpot sends an array of events in each webhook payload.
 */
export function parseHubSpotWebhook(
  body: unknown
): ConnectorEvent {
  // HubSpot sends an array of events
  const events = Array.isArray(body) ? body : [body];
  const first = events[0] as HubSpotWebhookEvent;

  if (!first) {
    throw new Error("Empty HubSpot webhook payload");
  }

  // Map HubSpot subscription types to our canonical event types
  const typeMap: Record<string, ConnectorEventType> = {
    "contact.creation": "contact_created",
    "contact.propertyChange": "contact_updated",
    "contact.deletion": "contact_deleted",
  };

  const eventType: ConnectorEventType =
    typeMap[first.subscriptionType] ?? "custom";

  return {
    type: eventType,
    externalId: String(first.objectId),
    connectorId: "hubspot",
    payload: events, // preserve all events in the batch
    idempotencyKey: `hubspot_${first.eventId}_${first.attemptNumber}`,
  };
}
