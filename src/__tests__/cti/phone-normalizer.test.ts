import { describe, it, expect } from "vitest";
import {
  normalizeToE164,
  extractTrailingDigits,
  phonesMatch,
  formatPhoneDisplay,
} from "@/lib/cti/utils/phone-normalizer";

describe("phone-normalizer", () => {
  describe("normalizeToE164", () => {
    it("strips spaces and formatting", () => {
      expect(normalizeToE164("+33 6 12 34 56 78")).toBe("+33612345678");
    });

    it("strips parentheses and dashes", () => {
      expect(normalizeToE164("(06) 12-34-56-78")).toBe("0612345678");
    });

    it("strips dots", () => {
      expect(normalizeToE164("06.12.34.56.78")).toBe("0612345678");
    });

    it("preserves leading +", () => {
      expect(normalizeToE164("+1-555-123-4567")).toBe("+15551234567");
    });

    it("converts 00 prefix to +", () => {
      expect(normalizeToE164("0033612345678")).toBe("+33612345678");
    });

    it("handles empty string", () => {
      expect(normalizeToE164("")).toBe("");
    });

    it("handles whitespace-only", () => {
      expect(normalizeToE164("   ")).toBe("");
    });

    it("handles already clean E.164", () => {
      expect(normalizeToE164("+33612345678")).toBe("+33612345678");
    });
  });

  describe("extractTrailingDigits", () => {
    it("extracts last 9 digits", () => {
      expect(extractTrailingDigits("+33612345678")).toBe("612345678");
    });

    it("extracts from local format", () => {
      expect(extractTrailingDigits("0612345678")).toBe("612345678");
    });
  });

  describe("phonesMatch", () => {
    it("matches exact E.164 numbers", () => {
      expect(phonesMatch("+33612345678", "+33612345678")).toBe(true);
    });

    it("matches with/without country code", () => {
      expect(phonesMatch("+33612345678", "0612345678")).toBe(true);
    });

    it("matches formatted vs clean", () => {
      expect(phonesMatch("+33 6 12 34 56 78", "0612345678")).toBe(true);
    });

    it("rejects different numbers", () => {
      expect(phonesMatch("+33612345678", "+33698765432")).toBe(false);
    });

    it("rejects empty strings", () => {
      expect(phonesMatch("", "+33612345678")).toBe(false);
    });
  });

  describe("formatPhoneDisplay", () => {
    it("formats French numbers", () => {
      expect(formatPhoneDisplay("+33612345678")).toBe("+33 6 12 34 56 78");
    });

    it("returns normalized for other formats", () => {
      expect(formatPhoneDisplay("+15551234567")).toBe("+15551234567");
    });
  });
});
