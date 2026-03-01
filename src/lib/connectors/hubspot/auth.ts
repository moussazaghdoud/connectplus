import { fetchWithRetry } from "@/lib/utils/http";
import { logger } from "@/lib/observability/logger";
import type { HubSpotTokenResponse } from "./types";

const HUBSPOT_AUTH_URL = "https://app.hubspot.com/oauth/authorize";
const HUBSPOT_TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";

/** Required OAuth scopes for ConnectPlus integration */
const SCOPES = [
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.deals.read",
].join(" ");

/**
 * Generate HubSpot OAuth2 authorization URL.
 */
export function getHubSpotAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
  });

  return `${HUBSPOT_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for access + refresh tokens.
 */
export async function exchangeHubSpotCode(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string
): Promise<HubSpotTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetchWithRetry(HUBSPOT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    retries: 1,
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, "HubSpot token exchange failed");
    throw new Error(`HubSpot token exchange failed: ${response.status} ${error}`);
  }

  return (await response.json()) as HubSpotTokenResponse;
}

/**
 * Refresh an expired access token.
 */
export async function refreshHubSpotToken(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  refreshToken: string
): Promise<HubSpotTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    refresh_token: refreshToken,
  });

  const response = await fetchWithRetry(HUBSPOT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    retries: 1,
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, "HubSpot token refresh failed");
    throw new Error(`HubSpot token refresh failed: ${response.status} ${error}`);
  }

  return (await response.json()) as HubSpotTokenResponse;
}
