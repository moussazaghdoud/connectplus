/**
 * Generic authentication handler for config-driven connectors.
 * Supports OAuth2, API Key, and Basic Auth.
 */

import type { AuthConfig } from "./types";
import { fetchWithRetry } from "../../utils/http";

export interface AuthHeaders {
  [key: string]: string;
}

/**
 * Build authentication headers for API requests.
 */
export function buildAuthHeaders(
  authConfig: AuthConfig,
  credentials: Record<string, string>
): AuthHeaders {
  switch (authConfig.type) {
    case "oauth2": {
      const token = credentials.accessToken ?? credentials.access_token ?? "";
      const prefix = authConfig.oauth2?.tokenPrefix ?? "Bearer";
      if (authConfig.oauth2?.tokenPlacement === "query") {
        // Token in query param is handled at request time, not in headers
        return {};
      }
      return { Authorization: `${prefix} ${token}` };
    }

    case "api_key": {
      const headerName = authConfig.apiKey?.headerName ?? "X-Api-Key";
      const prefix = authConfig.apiKey?.prefix ?? "";
      const key = credentials.apiKey ?? credentials.api_key ?? credentials.key ?? "";
      return { [headerName]: `${prefix}${key}` };
    }

    case "basic": {
      const userField = authConfig.basic?.usernameField ?? "username";
      const passField = authConfig.basic?.passwordField ?? "password";
      const user = credentials[userField] ?? "";
      const pass = credentials[passField] ?? "";
      const encoded = Buffer.from(`${user}:${pass}`).toString("base64");
      return { Authorization: `Basic ${encoded}` };
    }

    default:
      return {};
  }
}

/**
 * Build the OAuth2 authorization URL.
 */
export function buildOAuth2AuthUrl(
  authConfig: AuthConfig,
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const oauth2 = authConfig.oauth2;
  if (!oauth2) throw new Error("OAuth2 config required");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: oauth2.scopes.join(" "),
  });

  // Add extra auth params (e.g. access_type=offline for Zoho refresh tokens)
  if (oauth2.extraAuthParams) {
    for (const [key, value] of Object.entries(oauth2.extraAuthParams)) {
      params.set(key, value);
    }
  }

  return `${oauth2.authorizeUrl}?${params.toString()}`;
}

/**
 * Exchange an OAuth2 authorization code for tokens.
 */
export async function exchangeOAuth2Token(
  authConfig: AuthConfig,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const oauth2 = authConfig.oauth2;
  if (!oauth2) throw new Error("OAuth2 config required");

  const resp = await fetchWithRetry(oauth2.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }).toString(),
  });

  const data = await resp.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  };
}

/**
 * Refresh an OAuth2 token.
 */
export async function refreshOAuth2Token(
  authConfig: AuthConfig,
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const oauth2 = authConfig.oauth2;
  if (!oauth2) throw new Error("OAuth2 config required");

  const resp = await fetchWithRetry(oauth2.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }).toString(),
  });

  const data = await resp.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  };
}
