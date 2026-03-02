import { describe, it, expect } from "vitest";
import { normalizePhone, phoneMatch } from "../phone";

describe("normalizePhone", () => {
  it("strips spaces, dashes, and parens", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
  });

  it("preserves leading +", () => {
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("+33612345678");
  });

  it("strips + that is not leading", () => {
    expect(normalizePhone("123+456")).toBe("123456");
  });

  it("returns digits only for numbers without +", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("5551234567");
  });

  it("returns empty string for empty input", () => {
    expect(normalizePhone("")).toBe("");
  });

  it("returns empty string for whitespace-only", () => {
    expect(normalizePhone("   ")).toBe("");
  });

  it("handles pure digits", () => {
    expect(normalizePhone("5551234567")).toBe("5551234567");
  });

  it("handles dots as separators", () => {
    expect(normalizePhone("555.123.4567")).toBe("5551234567");
  });
});

describe("phoneMatch", () => {
  it("matches identical numbers", () => {
    expect(phoneMatch("+15551234567", "+15551234567")).toBe(true);
  });

  it("matches with/without country code (trailing 9 digits)", () => {
    expect(phoneMatch("+33612345678", "0612345678")).toBe(true);
  });

  it("matches with different formatting", () => {
    expect(phoneMatch("+1 (555) 123-4567", "5551234567")).toBe(true);
  });

  it("rejects different numbers", () => {
    expect(phoneMatch("+15551234567", "+15559876543")).toBe(false);
  });

  it("rejects when one is empty", () => {
    expect(phoneMatch("", "+15551234567")).toBe(false);
    expect(phoneMatch("+15551234567", "")).toBe(false);
  });

  it("rejects two empty strings", () => {
    expect(phoneMatch("", "")).toBe(false);
  });

  it("uses custom lastNDigits", () => {
    // Last 4 digits match
    expect(phoneMatch("1114567", "2224567", 4)).toBe(true);
    // Last 7 digits don't match
    expect(phoneMatch("1114567", "2224567", 7)).toBe(false);
  });

  it("rejects when number is shorter than lastNDigits", () => {
    expect(phoneMatch("123", "456", 9)).toBe(false);
  });
});
