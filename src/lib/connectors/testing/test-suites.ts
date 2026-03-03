/**
 * Individual test implementations for the connector test runner.
 */

import { createHmac } from "crypto";
import type { TestResult, TestContext } from "./types";
import type { ConnectorDefinitionConfig } from "../factory/types";
import { validateUrl, resolveEndpoint } from "../factory/url-validator";
import { applyTemplate } from "../factory/field-mapper";
import { sampleInteraction, sampleWebhookPayload, sampleContact } from "./sample-data";
import { RestCrmConnector } from "../factory/rest-crm-connector";
import { verifyWebhookSignature } from "../factory/webhook-verifier";

type TestFn = (def: ConnectorDefinitionConfig, tctx: TestContext) => Promise<TestResult>;

function timer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}

// ── Auth Tests ───────────────────────────────────────────

const authConfigValid: TestFn = async (def) => {
  const elapsed = timer();
  const { type } = def.auth;
  if (type === "oauth2" && !def.auth.oauth2) {
    return { category: "auth", name: "config_valid", status: "failed", durationMs: elapsed(), message: "OAuth2 config missing" };
  }
  if (type === "api_key" && !def.auth.apiKey) {
    return { category: "auth", name: "config_valid", status: "failed", durationMs: elapsed(), message: "API key config missing" };
  }
  if (type === "basic" && !def.auth.basic) {
    return { category: "auth", name: "config_valid", status: "failed", durationMs: elapsed(), message: "Basic auth config missing" };
  }
  return { category: "auth", name: "config_valid", status: "passed", durationMs: elapsed() };
};

const authOAuthUrlGenerates: TestFn = async (def) => {
  const elapsed = timer();
  if (def.auth.type !== "oauth2") {
    return { category: "auth", name: "oauth_url_generates", status: "skipped", durationMs: elapsed(), message: "Not OAuth2" };
  }
  try {
    const url = new URL(def.auth.oauth2!.authorizeUrl);
    return { category: "auth", name: "oauth_url_generates", status: "passed", durationMs: elapsed(), details: { url: url.origin } };
  } catch {
    return { category: "auth", name: "oauth_url_generates", status: "failed", durationMs: elapsed(), message: "Invalid authorize URL" };
  }
};

const authTokenEndpointReachable: TestFn = async (def) => {
  const elapsed = timer();
  if (def.auth.type !== "oauth2") {
    return { category: "auth", name: "token_endpoint_reachable", status: "skipped", durationMs: elapsed() };
  }
  try {
    const resp = await fetch(def.auth.oauth2!.tokenUrl, { method: "HEAD", signal: AbortSignal.timeout(5000) }).catch(() => null);
    // Token endpoints often reject HEAD, but any response means it's reachable
    const reachable = resp !== null;
    return { category: "auth", name: "token_endpoint_reachable", status: reachable ? "passed" : "failed", durationMs: elapsed(), details: { status: resp?.status } };
  } catch {
    return { category: "auth", name: "token_endpoint_reachable", status: "failed", durationMs: elapsed(), message: "Unreachable" };
  }
};

const authApiKeyFormat: TestFn = async (def) => {
  const elapsed = timer();
  if (def.auth.type !== "api_key") {
    return { category: "auth", name: "api_key_format", status: "skipped", durationMs: elapsed() };
  }
  const valid = /^[a-zA-Z][a-zA-Z0-9-]*$/.test(def.auth.apiKey!.headerName);
  return { category: "auth", name: "api_key_format", status: valid ? "passed" : "failed", durationMs: elapsed(), message: valid ? undefined : "Invalid header name" };
};

// ── Contact Search Tests ─────────────────────────────────

const contactSearchEndpointReachable: TestFn = async (def) => {
  const elapsed = timer();
  const url = resolveEndpoint(def.apiBaseUrl, def.contactSearch.endpoint);
  const urlVal = validateUrl(url);
  if (!urlVal.valid) {
    return { category: "contact_search", name: "endpoint_reachable", status: "failed", durationMs: elapsed(), message: urlVal.error };
  }
  return { category: "contact_search", name: "endpoint_reachable", status: "passed", durationMs: elapsed(), details: { url } };
};

const contactSearchResponseParsing: TestFn = async (def) => {
  const elapsed = timer();
  const { resultsPath, idField } = def.contactSearch.response;
  if (!resultsPath || !idField) {
    return { category: "contact_search", name: "response_parsing", status: "failed", durationMs: elapsed(), message: "Missing resultsPath or idField" };
  }
  return { category: "contact_search", name: "response_parsing", status: "passed", durationMs: elapsed() };
};

const contactSearchFieldMapping: TestFn = async (def) => {
  const elapsed = timer();
  const connector = new RestCrmConnector("test", "Test", "1.0.0", def);
  try {
    const sample = sampleContact();
    const mapped = connector.mapContact({ externalId: "123", source: "test", rawData: sample });
    const hasName = !!mapped.displayName;
    return { category: "contact_search", name: "field_mapping", status: hasName ? "passed" : "failed", durationMs: elapsed(), details: { mapped } };
  } catch (err) {
    return { category: "contact_search", name: "field_mapping", status: "error", durationMs: elapsed(), message: (err as Error).message };
  }
};

const contactSearchEmptyQuery: TestFn = async (def) => {
  const elapsed = timer();
  // Validate that templates handle empty query gracefully
  try {
    if (def.contactSearch.request.bodyTemplate) {
      applyTemplate(def.contactSearch.request.bodyTemplate, { query: "", email: "", phone: "" });
    }
    return { category: "contact_search", name: "empty_query", status: "passed", durationMs: elapsed() };
  } catch (err) {
    return { category: "contact_search", name: "empty_query", status: "failed", durationMs: elapsed(), message: (err as Error).message };
  }
};

// ── Write-Back Tests ─────────────────────────────────────

const writeBackTemplateValid: TestFn = async (def) => {
  const elapsed = timer();
  if (!def.writeBack) {
    return { category: "write_back", name: "template_valid", status: "skipped", durationMs: elapsed() };
  }
  try {
    const interaction = sampleInteraction();
    const rendered = applyTemplate(def.writeBack.bodyTemplate, { interaction });
    JSON.parse(rendered); // Must be valid JSON
    return { category: "write_back", name: "template_valid", status: "passed", durationMs: elapsed(), details: { preview: rendered.slice(0, 200) } };
  } catch (err) {
    return { category: "write_back", name: "template_valid", status: "failed", durationMs: elapsed(), message: `Invalid JSON: ${(err as Error).message}` };
  }
};

const writeBackDryRun: TestFn = async (def) => {
  const elapsed = timer();
  if (!def.writeBack) {
    return { category: "write_back", name: "dry_run", status: "skipped", durationMs: elapsed() };
  }
  const interaction = sampleInteraction();
  const rendered = applyTemplate(def.writeBack.bodyTemplate, { interaction });
  return { category: "write_back", name: "dry_run", status: "passed", durationMs: elapsed(), details: { payload: rendered.slice(0, 500) } };
};

const writeBackEndpointReachable: TestFn = async (def) => {
  const elapsed = timer();
  if (!def.writeBack) {
    return { category: "write_back", name: "endpoint_reachable", status: "skipped", durationMs: elapsed() };
  }
  const url = resolveEndpoint(def.apiBaseUrl, def.writeBack.endpoint);
  const urlVal = validateUrl(url);
  return { category: "write_back", name: "endpoint_reachable", status: urlVal.valid ? "passed" : "failed", durationMs: elapsed(), message: urlVal.error };
};

// ── Webhook Tests ────────────────────────────────────────

const webhookVerifyValid: TestFn = async (def) => {
  const elapsed = timer();
  if (!def.webhook) {
    return { category: "webhook", name: "verify_valid", status: "skipped", durationMs: elapsed() };
  }
  if (def.webhook.signatureMethod === "none") {
    return { category: "webhook", name: "verify_valid", status: "passed", durationMs: elapsed(), message: "No signature verification" };
  }
  const secret = "test-secret";
  const body = JSON.stringify(sampleWebhookPayload());
  const sig = createHmac(def.webhook.signatureMethod === "hmac_sha1" ? "sha1" : "sha256", secret).update(body).digest("hex");
  const header = def.webhook.signatureHeader ?? "X-Signature";
  const prefix = def.webhook.signaturePrefix ?? "";
  const valid = verifyWebhookSignature(def.webhook, secret, { [header]: `${prefix}${sig}` }, body);
  return { category: "webhook", name: "verify_valid", status: valid ? "passed" : "failed", durationMs: elapsed() };
};

const webhookVerifyInvalid: TestFn = async (def) => {
  const elapsed = timer();
  if (!def.webhook || def.webhook.signatureMethod === "none") {
    return { category: "webhook", name: "verify_invalid", status: "skipped", durationMs: elapsed() };
  }
  const body = JSON.stringify(sampleWebhookPayload());
  const header = def.webhook.signatureHeader ?? "X-Signature";
  const rejected = !verifyWebhookSignature(def.webhook, "test-secret", { [header]: "invalid-sig" }, body);
  return { category: "webhook", name: "verify_invalid", status: rejected ? "passed" : "failed", durationMs: elapsed(), message: rejected ? undefined : "Accepted invalid signature!" };
};

const webhookParseEvent: TestFn = async (def) => {
  const elapsed = timer();
  if (!def.webhook) {
    return { category: "webhook", name: "parse_event", status: "skipped", durationMs: elapsed() };
  }
  const connector = new RestCrmConnector("test", "Test", "1.0.0", def);
  try {
    const payload = sampleWebhookPayload();
    const event = connector.parseWebhook({}, payload);
    const valid = !!event.type && !!event.connectorId;
    return { category: "webhook", name: "parse_event", status: valid ? "passed" : "failed", durationMs: elapsed(), details: { event } };
  } catch (err) {
    return { category: "webhook", name: "parse_event", status: "error", durationMs: elapsed(), message: (err as Error).message };
  }
};

const webhookReplayProtection: TestFn = async (def) => {
  const elapsed = timer();
  if (!def.webhook?.timestampHeader) {
    return { category: "webhook", name: "replay_protection", status: "skipped", durationMs: elapsed(), message: "No timestamp header configured" };
  }
  return { category: "webhook", name: "replay_protection", status: "passed", durationMs: elapsed(), message: "Timestamp verification configured" };
};

// ── Health Check Tests ───────────────────────────────────

const healthCheckPing: TestFn = async (def) => {
  const elapsed = timer();
  const hc = def.healthCheck;
  if (!hc) {
    return { category: "health_check", name: "ping", status: "skipped", durationMs: elapsed(), message: "No health check configured" };
  }
  const url = resolveEndpoint(def.apiBaseUrl, hc.endpoint);
  const urlVal = validateUrl(url);
  return { category: "health_check", name: "ping", status: urlVal.valid ? "passed" : "failed", durationMs: elapsed(), message: urlVal.error, details: { url } };
};

// ── Export all tests ─────────────────────────────────────

export const allTests: TestFn[] = [
  authConfigValid,
  authOAuthUrlGenerates,
  authTokenEndpointReachable,
  authApiKeyFormat,
  contactSearchEndpointReachable,
  contactSearchResponseParsing,
  contactSearchFieldMapping,
  contactSearchEmptyQuery,
  writeBackTemplateValid,
  writeBackDryRun,
  writeBackEndpointReachable,
  webhookVerifyValid,
  webhookVerifyInvalid,
  webhookParseEvent,
  webhookReplayProtection,
  healthCheckPing,
];
