import { describe, it, expect, beforeEach } from "vitest";
import { encrypt, decrypt, encryptJson, decryptJson } from "../crypto";

describe("crypto", () => {
  describe("encrypt / decrypt roundtrip", () => {
    it("encrypts and decrypts a simple string", () => {
      const plaintext = "hello world";
      const ciphertext = encrypt(plaintext);
      expect(ciphertext).not.toBe(plaintext);
      expect(decrypt(ciphertext)).toBe(plaintext);
    });

    it("produces different ciphertext each call (random IV)", () => {
      const plaintext = "same input";
      const a = encrypt(plaintext);
      const b = encrypt(plaintext);
      expect(a).not.toBe(b);
      // Both still decrypt to same value
      expect(decrypt(a)).toBe(plaintext);
      expect(decrypt(b)).toBe(plaintext);
    });

    it("handles empty string", () => {
      const ciphertext = encrypt("");
      expect(decrypt(ciphertext)).toBe("");
    });

    it("handles unicode", () => {
      const text = "こんにちは 🌍 café";
      expect(decrypt(encrypt(text))).toBe(text);
    });

    it("handles long text", () => {
      const text = "x".repeat(10_000);
      expect(decrypt(encrypt(text))).toBe(text);
    });
  });

  describe("encryptJson / decryptJson", () => {
    it("roundtrips a JSON object", () => {
      const obj = { apiKey: "sk-123", nested: { value: 42 } };
      const ciphertext = encryptJson(obj);
      expect(decryptJson(ciphertext)).toEqual(obj);
    });
  });

  describe("tampered data", () => {
    it("throws on corrupted ciphertext", () => {
      const ciphertext = encrypt("secret");
      // Flip a byte in the middle
      const buf = Buffer.from(ciphertext, "base64");
      buf[20] ^= 0xff;
      const tampered = buf.toString("base64");
      expect(() => decrypt(tampered)).toThrow();
    });

    it("throws on truncated ciphertext", () => {
      const ciphertext = encrypt("secret");
      const truncated = ciphertext.slice(0, 10);
      expect(() => decrypt(truncated)).toThrow();
    });
  });

  describe("missing key", () => {
    it("throws when ENCRYPTION_KEY is unset", () => {
      const original = process.env.ENCRYPTION_KEY;
      try {
        delete process.env.ENCRYPTION_KEY;
        expect(() => encrypt("test")).toThrow(
          "ENCRYPTION_KEY must be a 64-character hex string"
        );
      } finally {
        process.env.ENCRYPTION_KEY = original;
      }
    });

    it("throws when ENCRYPTION_KEY is wrong length", () => {
      const original = process.env.ENCRYPTION_KEY;
      try {
        process.env.ENCRYPTION_KEY = "tooshort";
        expect(() => encrypt("test")).toThrow(
          "ENCRYPTION_KEY must be a 64-character hex string"
        );
      } finally {
        process.env.ENCRYPTION_KEY = original;
      }
    });
  });
});
