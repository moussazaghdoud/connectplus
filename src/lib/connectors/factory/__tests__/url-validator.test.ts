import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateUrl, resolveEndpoint } from "../url-validator";

describe("validateUrl", () => {
  const origEnv = process.env.NODE_ENV;

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
  });

  it("accepts valid HTTPS URLs", () => {
    expect(validateUrl("https://api.example.com/v2")).toEqual({ valid: true });
    expect(validateUrl("https://crm.salesforce.com")).toEqual({ valid: true });
  });

  it("accepts HTTP in non-production", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    expect(validateUrl("http://api.example.com")).toEqual({ valid: true });
  });

  it("rejects HTTP in production", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    const result = validateUrl("http://api.example.com");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("HTTPS");
  });

  it("rejects invalid URLs", () => {
    expect(validateUrl("not-a-url").valid).toBe(false);
    expect(validateUrl("").valid).toBe(false);
  });

  it("rejects localhost", () => {
    expect(validateUrl("https://localhost/api").valid).toBe(false);
    expect(validateUrl("https://127.0.0.1/api").valid).toBe(false);
  });

  it("rejects private IP ranges", () => {
    expect(validateUrl("https://10.0.0.1/api").valid).toBe(false);
    expect(validateUrl("https://172.16.0.1/api").valid).toBe(false);
    expect(validateUrl("https://192.168.1.1/api").valid).toBe(false);
  });

  it("rejects non-http protocols", () => {
    expect(validateUrl("ftp://example.com").valid).toBe(false);
    expect(validateUrl("file:///etc/passwd").valid).toBe(false);
  });

  it("allows public IPs", () => {
    expect(validateUrl("https://8.8.8.8/api").valid).toBe(true);
    expect(validateUrl("https://1.1.1.1").valid).toBe(true);
  });
});

describe("resolveEndpoint", () => {
  it("joins base URL and endpoint", () => {
    expect(resolveEndpoint("https://api.example.com/v2", "/contacts/search"))
      .toBe("https://api.example.com/v2/contacts/search");
  });

  it("handles trailing slash on base", () => {
    expect(resolveEndpoint("https://api.example.com/v2/", "/contacts"))
      .toBe("https://api.example.com/v2/contacts");
  });

  it("adds leading slash to endpoint if missing", () => {
    expect(resolveEndpoint("https://api.example.com", "contacts"))
      .toBe("https://api.example.com/contacts");
  });
});
