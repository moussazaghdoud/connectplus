import { fetchWithRetry } from "@/lib/utils/http";
import { logger } from "@/lib/observability/logger";
import type { Interaction } from "@/prisma-types";
import type { TenantConnectorConfig } from "@/lib/core/connector-interface";
import type { HubSpotCallProperties, HubSpotCreateCallRequest } from "./types";
import { refreshHubSpotToken } from "./auth";

const HUBSPOT_API = "https://api.hubapi.com";

// Association type ID: call → contact
const CALL_TO_CONTACT_ASSOCIATION = 194;

/**
 * Write call activity back to HubSpot as a Call engagement.
 * Creates a call record in HubSpot CRM and associates it with the contact.
 */
export async function writeCallToHubSpot(
  interaction: Interaction,
  config: TenantConnectorConfig
): Promise<string | null> {
  const { accessToken, clientId, clientSecret, redirectUri, refreshToken } =
    extractCredentials(config);

  // Ensure we have a fresh token
  let token = accessToken;
  if (!token && refreshToken) {
    const refreshed = await refreshHubSpotToken(
      clientId,
      clientSecret,
      redirectUri,
      refreshToken
    );
    token = refreshed.access_token;
  }

  if (!token) {
    logger.warn(
      { connectorId: "hubspot", tenantId: config.tenantId },
      "No HubSpot access token available for write-back"
    );
    return null;
  }

  // Map interaction status to HubSpot call status
  const statusMap: Record<string, HubSpotCallProperties["hs_call_status"]> = {
    PENDING: "QUEUED",
    INITIATING: "CONNECTING",
    RINGING: "RINGING",
    ACTIVE: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELED",
  };

  const callProperties: HubSpotCallProperties = {
    hs_timestamp: interaction.createdAt.toISOString(),
    hs_call_title: `Rainbow ${interaction.type.replace("_", " ").toLowerCase()}`,
    hs_call_body: buildCallBody(interaction),
    hs_call_direction: interaction.direction === "INBOUND" ? "INBOUND" : "OUTBOUND",
    hs_call_status: statusMap[interaction.status] ?? "COMPLETED",
  };

  if (interaction.durationSecs) {
    callProperties.hs_call_duration = String(interaction.durationSecs * 1000); // ms
  }

  if (interaction.targetPhone) {
    callProperties.hs_call_to_number = interaction.targetPhone;
  }

  const requestBody: HubSpotCreateCallRequest = {
    properties: callProperties,
  };

  // Associate with HubSpot contact if we have an external ID
  if (interaction.externalId) {
    const contactId = parseInt(interaction.externalId, 10);
    if (!isNaN(contactId)) {
      requestBody.associations = [
        {
          to: { id: contactId },
          types: [
            {
              associationCategory: "HUBSPOT_DEFINED",
              associationTypeId: CALL_TO_CONTACT_ASSOCIATION,
            },
          ],
        },
      ];
    }
  }

  const response = await fetchWithRetry(`${HUBSPOT_API}/crm/v3/objects/calls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
    retries: 2,
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error(
      { status: response.status, error, interactionId: interaction.id },
      "HubSpot call write-back failed"
    );
    throw new Error(`HubSpot call write-back failed: ${response.status}`);
  }

  const result = (await response.json()) as { id: string };
  logger.info(
    { hubspotCallId: result.id, interactionId: interaction.id },
    "Call activity written to HubSpot"
  );

  return result.id;
}

function buildCallBody(interaction: Interaction): string {
  const lines: string[] = [
    `Call initiated via Rainbow ConnectPlus`,
    `Type: ${interaction.type}`,
    `Status: ${interaction.status}`,
  ];

  if (interaction.durationSecs) {
    const mins = Math.floor(interaction.durationSecs / 60);
    const secs = interaction.durationSecs % 60;
    lines.push(`Duration: ${mins}m ${secs}s`);
  }

  if (interaction.rainbowCallId) {
    lines.push(`Rainbow Call ID: ${interaction.rainbowCallId}`);
  }

  if (interaction.joinUrl) {
    lines.push(`Join URL: ${interaction.joinUrl}`);
  }

  if (interaction.failureReason) {
    lines.push(`Failure: ${interaction.failureReason}`);
  }

  return lines.join("\n");
}

function extractCredentials(config: TenantConnectorConfig) {
  return {
    accessToken: config.credentials.accessToken ?? "",
    refreshToken: config.credentials.refreshToken ?? "",
    clientId: config.credentials.clientId ?? "",
    clientSecret: config.credentials.clientSecret ?? "",
    redirectUri: config.credentials.redirectUri ?? "",
  };
}
