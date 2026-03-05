/**
 * Zoho multi-DC (data center) routing.
 * Zoho operates 6 data centers — all API calls must use the correct base URL.
 */

export type ZohoDc = "com" | "eu" | "in" | "com.au" | "jp" | "ca";

export const ZOHO_DC_LABELS: Record<ZohoDc, string> = {
  com: "United States",
  eu: "Europe",
  in: "India",
  "com.au": "Australia",
  jp: "Japan",
  ca: "Canada",
};

export const ZOHO_API_BASE: Record<ZohoDc, string> = {
  com: "https://www.zohoapis.com",
  eu: "https://www.zohoapis.eu",
  in: "https://www.zohoapis.in",
  "com.au": "https://www.zohoapis.com.au",
  jp: "https://www.zohoapis.jp",
  ca: "https://www.zohoapis.ca",
};

export const ZOHO_ACCOUNTS_BASE: Record<ZohoDc, string> = {
  com: "https://accounts.zoho.com",
  eu: "https://accounts.zoho.eu",
  in: "https://accounts.zoho.in",
  "com.au": "https://accounts.zoho.com.au",
  jp: "https://accounts.zoho.jp",
  ca: "https://accounts.zoho.ca",
};

/**
 * Detect Zoho DC from the access token endpoint used during OAuth.
 * The accounts URL domain reveals the DC.
 */
export function detectDcFromAccountsUrl(url: string): ZohoDc {
  if (url.includes("zoho.eu")) return "eu";
  if (url.includes("zoho.in")) return "in";
  if (url.includes("zoho.com.au")) return "com.au";
  if (url.includes("zoho.jp")) return "jp";
  if (url.includes("zoho.ca")) return "ca";
  return "com";
}

/**
 * Get the CRM API base URL for a given DC.
 */
export function getCrmApiBase(dc: ZohoDc): string {
  return `${ZOHO_API_BASE[dc]}/crm/v2`;
}

/**
 * Get the Zoho accounts base URL for a given DC.
 */
export function getAccountsBase(dc: ZohoDc): string {
  return ZOHO_ACCOUNTS_BASE[dc];
}
