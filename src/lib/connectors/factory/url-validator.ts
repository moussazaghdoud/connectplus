/**
 * URL Validator — prevents SSRF by blocking private/internal IPs and enforcing HTTPS.
 */

const PRIVATE_IP_RANGES = [
  /^127\./,                    // 127.0.0.0/8
  /^10\./,                     // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^192\.168\./,               // 192.168.0.0/16
  /^169\.254\./,               // link-local
  /^0\./,                      // 0.0.0.0/8
];

const PRIVATE_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
];

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a URL is safe for external API calls.
 * Blocks private IPs, enforces HTTPS in production.
 */
export function validateUrl(url: string): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Enforce HTTPS in production
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    return { valid: false, error: "HTTPS is required in production" };
  }

  // Allow only http and https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: `Unsupported protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block private hostnames
  if (PRIVATE_HOSTNAMES.includes(hostname)) {
    return { valid: false, error: `Blocked hostname: ${hostname}` };
  }

  // Block private IP ranges
  for (const pattern of PRIVATE_IP_RANGES) {
    if (pattern.test(hostname)) {
      return { valid: false, error: `Blocked private IP range: ${hostname}` };
    }
  }

  // Block IPv6 private ranges
  if (hostname.startsWith("[fd") || hostname.startsWith("[fe80")) {
    return { valid: false, error: `Blocked private IPv6 address: ${hostname}` };
  }

  return { valid: true };
}

/**
 * Validate and resolve a relative endpoint against a base URL.
 */
export function resolveEndpoint(baseUrl: string, endpoint: string): string {
  // Remove trailing slash from base, ensure leading slash on endpoint
  const base = baseUrl.replace(/\/+$/, "");
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${base}${path}`;
}
