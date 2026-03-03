/**
 * Generic webhook signature verification for config-driven connectors.
 * Supports HMAC-SHA256, HMAC-SHA1, static token, and none.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { WebhookConfig } from "./types";

/**
 * Verify a webhook signature based on the connector's webhook config.
 */
export function verifyWebhookSignature(
  config: WebhookConfig,
  secret: string,
  headers: Record<string, string>,
  body: string
): boolean {
  switch (config.signatureMethod) {
    case "none":
      return true;

    case "static_token": {
      const headerName = config.tokenHeader ?? "X-Webhook-Token";
      const received = headers[headerName] ?? headers[headerName.toLowerCase()] ?? "";
      return received === secret;
    }

    case "hmac_sha256":
    case "hmac_sha1": {
      const algo = config.signatureMethod === "hmac_sha256" ? "sha256" : "sha1";
      const headerName = config.signatureHeader ?? `X-Signature-${algo === "sha256" ? "256" : "1"}`;
      const prefix = config.signaturePrefix ?? "";

      // Get the signature from headers (case-insensitive)
      const received = headers[headerName] ?? headers[headerName.toLowerCase()] ?? "";
      const signatureStr = prefix ? received.replace(prefix, "") : received;

      if (!signatureStr) return false;

      // Check timestamp for replay protection
      if (config.timestampHeader) {
        const timestamp = headers[config.timestampHeader] ?? headers[config.timestampHeader.toLowerCase()];
        if (timestamp) {
          const maxAge = config.maxTimestampAgeMs ?? 300000;
          const ts = parseInt(timestamp, 10) * (timestamp.length <= 10 ? 1000 : 1);
          if (isNaN(ts) || Math.abs(Date.now() - ts) > maxAge) {
            return false;
          }
        }
      }

      // Compute expected signature
      const computed = createHmac(algo, secret).update(body).digest("hex");

      // Constant-time comparison
      try {
        return timingSafeEqual(
          Buffer.from(signatureStr, "hex"),
          Buffer.from(computed, "hex")
        );
      } catch {
        // If lengths differ, timingSafeEqual throws
        return false;
      }
    }

    default:
      return false;
  }
}
