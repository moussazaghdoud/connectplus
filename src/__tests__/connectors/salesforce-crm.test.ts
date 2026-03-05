/**
 * Smoke tests for Salesforce CRM connector.
 * Generated from blueprint: connectors/blueprints/salesforce-crm.json
 */

import { describe, it, expect } from "vitest";
import connector from "@/lib/connectors/salesforce-crm";
import { validateConfig } from "@/lib/connectors/salesforce-crm/config";
import { runDiagnostics } from "@/lib/connectors/salesforce-crm/diagnostics";

describe("Salesforce CRM connector", () => {
  it("exports correct slug", () => {
    expect(connector.slug).toBe("salesforce-crm");
  });

  it("exports correct category", () => {
    expect(connector.category).toBe("crm");
  });

  it("exports required capabilities", () => {
    expect(connector.capabilities).toContain("contact_search");
    expect(connector.capabilities.length).toBe(7);
  });

  it("activate rejects invalid config", async () => {
    const result = await connector.activate(null, null);
    expect(result.success).toBe(false);
  });

  it("validates config schema", () => {
    const validConfig = {
        "instanceUrl": "https://example.com"
    };
    expect(() => validateConfig(validConfig)).not.toThrow();
  });

  it("rejects empty config", () => {
    expect(() => validateConfig({})).toThrow();
  });

  it("runs diagnostics without credentials", async () => {
    const results = await runDiagnostics(null, null);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty("name");
    expect(results[0]).toHaveProperty("status");
  });
});
