/**
 * CTI Phone Number Normalizer — E.164 normalization for caller lookup.
 *
 * Features:
 * - Normalize to E.164 format
 * - Strip spaces, separators, parentheses
 * - Support international numbers
 * - Fallback to partial match (last 9 digits)
 */

/**
 * Normalize a phone number to E.164-like format.
 * Strips all formatting characters, preserves leading +.
 *
 * "+33 6 12 34 56 78" → "+33612345678"
 * "(06) 12-34-56-78"  → "0612345678"
 * "00336123456789"     → "+33612345678" (if starts with 00)
 */
export function normalizeToE164(phone: string): string {
  if (!phone) return "";

  // Strip whitespace, parentheses, dashes, dots, slashes
  let cleaned = phone.trim().replace(/[\s\-().\/]/g, "");

  // Convert "00" international prefix to "+"
  if (cleaned.startsWith("00") && cleaned.length > 6) {
    cleaned = "+" + cleaned.slice(2);
  }

  // Preserve leading + and strip remaining non-digits
  if (cleaned.startsWith("+")) {
    return "+" + cleaned.slice(1).replace(/\D/g, "");
  }

  return cleaned.replace(/\D/g, "");
}

/**
 * Extract the last N digits for partial matching.
 * Useful when country code presence is inconsistent.
 */
export function extractTrailingDigits(phone: string, count = 9): string {
  const digits = normalizeToE164(phone).replace(/^\+/, "");
  return digits.slice(-count);
}

/**
 * Check if two phone numbers match (exact or partial trailing digits).
 */
export function phonesMatch(a: string, b: string, trailingDigits = 9): boolean {
  const normA = normalizeToE164(a);
  const normB = normalizeToE164(b);

  if (!normA || !normB) return false;

  // Exact match (with + stripped)
  const digitsA = normA.replace(/^\+/, "");
  const digitsB = normB.replace(/^\+/, "");
  if (digitsA === digitsB) return true;

  // Trailing digit match
  const tailA = digitsA.slice(-trailingDigits);
  const tailB = digitsB.slice(-trailingDigits);
  return tailA.length >= trailingDigits && tailA === tailB;
}

/**
 * Format a phone number for display.
 */
export function formatPhoneDisplay(phone: string): string {
  const normalized = normalizeToE164(phone);
  if (!normalized) return phone;

  // Simple grouping for display
  if (normalized.startsWith("+33") && normalized.length === 12) {
    // French: +33 6 12 34 56 78
    return `${normalized.slice(0, 3)} ${normalized.slice(3, 4)} ${normalized.slice(4, 6)} ${normalized.slice(6, 8)} ${normalized.slice(8, 10)} ${normalized.slice(10)}`;
  }

  return normalized;
}
