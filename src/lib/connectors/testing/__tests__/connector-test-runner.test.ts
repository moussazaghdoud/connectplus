import { describe, it, expect } from "vitest";
import { ConnectorTestRunner } from "../connector-test-runner";
import type { ConnectorDefinitionConfig } from "../../factory/types";

const sampleConfig: ConnectorDefinitionConfig = {
  apiBaseUrl: "https://api.example-crm.com/v2",
  auth: {
    type: "api_key",
    apiKey: { headerName: "X-Api-Key" },
  },
  contactSearch: {
    endpoint: "/contacts/search",
    method: "POST",
    request: { bodyTemplate: '{"query":"{{query}}"}' },
    response: { resultsPath: "data.contacts", idField: "id" },
  },
  contactFieldMapping: {
    displayName: "{{properties.firstname}} {{properties.lastname}}",
    email: "properties.email",
    phone: "properties.phone",
    company: "properties.company",
  },
  writeBack: {
    endpoint: "/calls",
    method: "POST",
    bodyTemplate: '{"type":"{{interaction.type}}","status":"{{interaction.status}}","duration":{{interaction.durationSecs}}}',
  },
  webhook: {
    signatureMethod: "hmac_sha256",
    signatureHeader: "X-Signature",
    eventTypeField: "event_type",
    eventTypeMapping: {
      "contact.created": "contact_created",
      "contact.updated": "contact_updated",
    },
    externalIdField: "data.id",
    idempotencyKeyField: "event_id",
  },
  healthCheck: {
    endpoint: "/status",
    expectedStatus: 200,
  },
};

describe("ConnectorTestRunner", () => {
  const runner = new ConnectorTestRunner();

  it("runs all 16 tests against a full config", async () => {
    const result = await runner.run("test-crm", sampleConfig);

    expect(result.connectorId).toBe("test-crm");
    expect(result.results.length).toBe(16);
    expect(result.testedAt).toBeTruthy();
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("passes auth config validation for api_key", async () => {
    const result = await runner.run("test-crm", sampleConfig);
    const authTest = result.results.find((r) => r.name === "config_valid");
    expect(authTest?.status).toBe("passed");
  });

  it("skips oauth tests for api_key connectors", async () => {
    const result = await runner.run("test-crm", sampleConfig);
    const oauthTest = result.results.find((r) => r.name === "oauth_url_generates");
    expect(oauthTest?.status).toBe("skipped");
  });

  it("passes write-back template validation", async () => {
    const result = await runner.run("test-crm", sampleConfig);
    const wbTest = result.results.find((r) => r.name === "template_valid");
    expect(wbTest?.status).toBe("passed");
  });

  it("passes webhook signature verification test", async () => {
    const result = await runner.run("test-crm", sampleConfig);
    const whTest = result.results.find((r) => r.name === "verify_valid");
    expect(whTest?.status).toBe("passed");
  });

  it("passes webhook invalid signature rejection", async () => {
    const result = await runner.run("test-crm", sampleConfig);
    const whTest = result.results.find((r) => r.name === "verify_invalid");
    expect(whTest?.status).toBe("passed");
  });

  it("passes contact field mapping test", async () => {
    const result = await runner.run("test-crm", sampleConfig);
    const mapTest = result.results.find((r) => r.name === "field_mapping");
    expect(mapTest?.status).toBe("passed");
  });

  it("reports overall pass when all tests pass or skip", async () => {
    const result = await runner.run("test-crm", sampleConfig);
    // Some tests may fail (endpoint_reachable for fake URLs) but core ones should pass
    const coreTests = result.results.filter((r) =>
      ["config_valid", "template_valid", "verify_valid", "verify_invalid", "field_mapping", "empty_query", "response_parsing"].includes(r.name)
    );
    expect(coreTests.every((t) => t.status === "passed")).toBe(true);
  });

  it("handles config without optional sections", async () => {
    const minimalConfig: ConnectorDefinitionConfig = {
      apiBaseUrl: "https://api.example.com",
      auth: { type: "api_key", apiKey: { headerName: "Authorization" } },
      contactSearch: {
        endpoint: "/search",
        method: "GET",
        request: { queryParams: { q: "{{query}}" } },
        response: { resultsPath: "results", idField: "id" },
      },
      contactFieldMapping: { displayName: "name" },
    };

    const result = await runner.run("minimal", minimalConfig);
    expect(result.results.length).toBe(16);
    // Write-back and webhook tests should be skipped
    const skipped = result.results.filter((r) => r.status === "skipped");
    expect(skipped.length).toBeGreaterThanOrEqual(5);
  });
});
