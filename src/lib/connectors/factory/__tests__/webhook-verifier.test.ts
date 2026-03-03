import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyWebhookSignature } from "../webhook-verifier";
import type { WebhookConfig } from "../types";

describe("verifyWebhookSignature", () => {
  const body = '{"event":"contact.created","id":"123"}';
  const secret = "test-secret-key";

  it("accepts with signatureMethod: none", () => {
    const config: WebhookConfig = {
      signatureMethod: "none",
      eventTypeField: "event",
      eventTypeMapping: {},
      externalIdField: "id",
    };
    expect(verifyWebhookSignature(config, secret, {}, body)).toBe(true);
  });

  it("verifies static_token", () => {
    const config: WebhookConfig = {
      signatureMethod: "static_token",
      tokenHeader: "X-Webhook-Token",
      eventTypeField: "event",
      eventTypeMapping: {},
      externalIdField: "id",
    };
    expect(verifyWebhookSignature(config, secret, { "X-Webhook-Token": secret }, body)).toBe(true);
    expect(verifyWebhookSignature(config, secret, { "X-Webhook-Token": "wrong" }, body)).toBe(false);
  });

  it("verifies hmac_sha256", () => {
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    const config: WebhookConfig = {
      signatureMethod: "hmac_sha256",
      signatureHeader: "X-Signature",
      eventTypeField: "event",
      eventTypeMapping: {},
      externalIdField: "id",
    };
    expect(verifyWebhookSignature(config, secret, { "X-Signature": sig }, body)).toBe(true);
    expect(verifyWebhookSignature(config, secret, { "X-Signature": "bad" }, body)).toBe(false);
  });

  it("verifies hmac_sha256 with prefix", () => {
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    const config: WebhookConfig = {
      signatureMethod: "hmac_sha256",
      signatureHeader: "X-Hub-Signature-256",
      signaturePrefix: "sha256=",
      eventTypeField: "event",
      eventTypeMapping: {},
      externalIdField: "id",
    };
    expect(verifyWebhookSignature(config, secret, { "X-Hub-Signature-256": `sha256=${sig}` }, body)).toBe(true);
  });

  it("verifies hmac_sha1", () => {
    const sig = createHmac("sha1", secret).update(body).digest("hex");
    const config: WebhookConfig = {
      signatureMethod: "hmac_sha1",
      signatureHeader: "X-Signature",
      eventTypeField: "event",
      eventTypeMapping: {},
      externalIdField: "id",
    };
    expect(verifyWebhookSignature(config, secret, { "X-Signature": sig }, body)).toBe(true);
  });

  it("rejects expired timestamps", () => {
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    const oldTimestamp = String(Math.floor((Date.now() - 600000) / 1000)); // 10 min ago
    const config: WebhookConfig = {
      signatureMethod: "hmac_sha256",
      signatureHeader: "X-Signature",
      timestampHeader: "X-Timestamp",
      maxTimestampAgeMs: 300000,
      eventTypeField: "event",
      eventTypeMapping: {},
      externalIdField: "id",
    };
    expect(verifyWebhookSignature(config, secret, { "X-Signature": sig, "X-Timestamp": oldTimestamp }, body)).toBe(false);
  });

  it("accepts current timestamps", () => {
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    const currentTimestamp = String(Math.floor(Date.now() / 1000));
    const config: WebhookConfig = {
      signatureMethod: "hmac_sha256",
      signatureHeader: "X-Signature",
      timestampHeader: "X-Timestamp",
      maxTimestampAgeMs: 300000,
      eventTypeField: "event",
      eventTypeMapping: {},
      externalIdField: "id",
    };
    expect(verifyWebhookSignature(config, secret, { "X-Signature": sig, "X-Timestamp": currentTimestamp }, body)).toBe(true);
  });

  it("rejects missing signature header", () => {
    const config: WebhookConfig = {
      signatureMethod: "hmac_sha256",
      signatureHeader: "X-Signature",
      eventTypeField: "event",
      eventTypeMapping: {},
      externalIdField: "id",
    };
    expect(verifyWebhookSignature(config, secret, {}, body)).toBe(false);
  });
});
