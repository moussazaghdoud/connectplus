/** HubSpot OAuth token response */
export interface HubSpotTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds (typically 1800 = 30 min)
  token_type: string;
}

/** HubSpot CRM contact */
export interface HubSpotContact {
  id: string;
  properties: {
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
    mobilephone?: string;
    company?: string;
    jobtitle?: string;
    hs_object_id?: string;
    createdate?: string;
    lastmodifieddate?: string;
    [key: string]: string | undefined;
  };
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

/** HubSpot CRM search response */
export interface HubSpotSearchResponse {
  total: number;
  results: HubSpotContact[];
  paging?: {
    next?: { after: string };
  };
}

/** HubSpot webhook event payload */
export interface HubSpotWebhookEvent {
  eventId: number;
  subscriptionId: number;
  portalId: number;
  appId: number;
  occurredAt: number;
  subscriptionType: string; // e.g. "contact.creation", "contact.propertyChange"
  attemptNumber: number;
  objectId: number;
  propertyName?: string;
  propertyValue?: string;
  changeSource?: string;
  sourceId?: string;
}

/** HubSpot call engagement properties */
export interface HubSpotCallProperties {
  hs_timestamp: string;
  hs_call_title: string;
  hs_call_body?: string;
  hs_call_direction: "INBOUND" | "OUTBOUND";
  hs_call_status:
    | "BUSY"
    | "CALLING_CRM_USER"
    | "CANCELED"
    | "COMPLETED"
    | "CONNECTING"
    | "FAILED"
    | "IN_PROGRESS"
    | "NO_ANSWER"
    | "QUEUED"
    | "RINGING";
  hs_call_duration?: string; // milliseconds as string
  hs_call_from_number?: string;
  hs_call_to_number?: string;
  hs_call_recording_url?: string;
}

/** HubSpot call engagement creation request */
export interface HubSpotCreateCallRequest {
  properties: HubSpotCallProperties;
  associations?: Array<{
    to: { id: number };
    types: Array<{
      associationCategory: "HUBSPOT_DEFINED";
      associationTypeId: number; // 194 for call-to-contact
    }>;
  }>;
}
