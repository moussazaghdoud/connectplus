/**
 * Phone number normalization utilities.
 * Strips formatting and enables fuzzy matching by trailing digits.
 */

/** Strip all non-digit characters except leading + */
export function normalizePhone(phone: string): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) {
    return "+" + trimmed.slice(1).replace(/\D/g, "");
  }
  return trimmed.replace(/\D/g, "");
}

/**
 * Compare two phone numbers by their last N digits.
 * This handles cases where one number has a country code and the other doesn't.
 * Default: compare last 9 digits (works for most national formats).
 */
export function phoneMatch(
  a: string,
  b: string,
  lastNDigits = 9
): boolean {
  const normA = normalizePhone(a).replace(/^\+/, "");
  const normB = normalizePhone(b).replace(/^\+/, "");

  if (!normA || !normB) return false;

  // Exact match
  if (normA === normB) return true;

  // Trailing digit match
  const tailA = normA.slice(-lastNDigits);
  const tailB = normB.slice(-lastNDigits);

  return tailA.length >= lastNDigits &&
    tailB.length >= lastNDigits &&
    tailA === tailB;
}
